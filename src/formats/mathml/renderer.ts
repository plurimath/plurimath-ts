/**
 * The MathML renderer (ARCHITECTURE.md §4-5): a `MathNode` tree to MathML
 * text, byte-identical to the gem's `to_mathml`.
 *
 * In Ruby, rendering is `Formula#to_mathml` building engine wrapper
 * elements through every node's `to_mathml_without_math_tag`, then
 * `dump_nodes(math, indent: 2)` — Ox plus the `REPLACABLES` rewrite
 * (`src/xml`'s `dumpNodes`). Here it is the same pipeline: the per-kind
 * files under `src/render/<kind>/mathml.ts` build `XmlElement`s, joined by
 * the dispatch table in `./render.ts` (typed total over `NodeKind`) and
 * recursing through `context.render`; this module owns the `<math>`/
 * `<mstyle>` wrapper, the option surface, and the boundary.
 *
 * Only a `formula` or `mrow` node can enter: the gem defines `to_mathml` on
 * `Formula` alone (`Mrow` and `Mstyle` inherit it), and every other class
 * answers NoMethodError there — `RenderError` here.
 *
 * Where the gem CRASHES on its own parse output — `""` and `left(right)`
 * put a bare string in a formula's value, `textbf x` a Symbol inside a
 * `Text` — this port raises `RenderError`; the gem wraps the same crash
 * into `Math::ParseError` at its formula boundary (`wrap_render_error`,
 * formula.rb:437). Probes crash-empty-input / crash-left-right /
 * crash-textbf on the pinned oracle (plurimath 0.11.6, 00c52783).
 */

import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { dumpNodes, XmlElement } from "../../xml/index";
import { NO_SPACING_CONTEXT, SPACING_CONTEXT } from "./render";
import {
  deferredFeatureError,
  FORMAT,
  isOwnMissingSymbolDataError,
  renderChild,
  unreachableName,
} from "./render-shared";

/**
 * Renderer options, typed exactly (§5): the two implemented axes. The
 * deferred `to_mathml` keywords — `formatter`, `intent`, `unitsml`,
 * `split_on_linebreak` — are deliberately NOT in this type; passing one
 * (any value but `undefined`) is a named `RenderError` at runtime
 * (`TODO.plan/deferred.md` carries each entry and its trigger). Unknown
 * keys beyond those are ignored, per the §5 options convention.
 */
export interface MathmlOptions {
  /**
   * The gem's `display_style:` keyword. Default: the formula's own
   * `displaystyle` field. Ruby's coercion is `to_s == "true"`
   * (`boolean_display_style`), so an explicit `null` — Ruby `nil` — is
   * `displaystyle="false"` (probed), NOT the default.
   */
  readonly displayStyle?: boolean | string | null | undefined;
  /**
   * The gem's `unary_function_spacing:` keyword, default true: wraps every
   * `UNARY_CLASSES` function in `<mrow><mo rspace="thickmathspace"/>…</mrow>`.
   * Ruby truthiness — `null` (the gem's `nil`, dropped by its `.compact`)
   * turns the spacing off (probed).
   */
  readonly unaryFunctionSpacing?: boolean | null | undefined;
}

/** The deferred `to_mathml` keywords, each refused by name when present. */
const DEFERRED_OPTIONS: readonly (readonly [string, string])[] = [
  ["formatter", "number formatting is P4 scope; only the no-formatter path is measured"],
  ["intent", "the intent attribute pipeline (intentify, intent post-processing) is unmeasured"],
  ["unitsml", "UnitsML is deferred wholesale (ARCHITECTURE.md §5)"],
  ["splitOnLinebreak", "line_breaked_mathml renders one <math> per line-broken slice; unmeasured"],
];

/**
 * `Formula#to_mathml` (`formula.rb:76-108`), as a module function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 */
export function toMathml(node: MathNode, options?: MathmlOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  // The gem's contract is a keyword hash: a primitive here would silently
  // coerce through `Object.hasOwn`'s ToObject and behave as empty options —
  // a surprise, not a rendering. Arrays are not keyword hashes either.
  if (
    options !== null &&
    options !== undefined &&
    (typeof options !== "object" || Array.isArray(options))
  ) {
    throw new RenderError(
      `options: expected a plain options object, found ${typeof options === "object" ? "an array" : `a ${typeof options}`}`,
      FORMAT,
      "formula",
    );
  }
  const opts: Record<string, unknown> =
    options === null || options === undefined ? {} : (options as Record<string, unknown>);
  try {
    // Inside the wrap: reading a hostile options object (a Proxy trap, a
    // throwing getter) must surface as RenderError, never raw.
    for (const [name, detail] of DEFERRED_OPTIONS) {
      if (Object.hasOwn(opts, name) && opts[name] !== undefined) {
        throw deferredFeatureError(name, detail, "formula");
      }
    }
    return renderMath(node, opts);
  } catch (error) {
    // The boundary split is the asciimath renderer's, verbatim: this walk's
    // own surfaces pass through — `RenderError` (the §5 contract) and the
    // symbol table's recorded `MissingSymbolDataError` (WeakSet membership,
    // never `instanceof`: the class is constructible by the input too) —
    // and every other mid-walk throw becomes the RenderError the contract
    // promises, described without running the thrown value's toString twice
    // (`describeThrown`).
    if (error instanceof RenderError || isOwnMissingSymbolDataError(error)) throw error;
    throw new RenderError(
      `rendering failed mid-walk — ${describeThrown(error)}`,
      FORMAT,
      "unknown",
    );
  }
}

function renderMath(node: MathNode, opts: Record<string, unknown>): string {
  // `to_mathml` lives on Formula alone; Mrow (and the Mstyle name) inherit
  // it. Every other node kind raises NoMethodError in the gem.
  if (node.kind !== "formula" && node.kind !== "mrow") {
    throw new RenderError(
      `to_mathml is defined on Formula (and its subclasses) only — a "${node.kind}" ` +
        "node raises NoMethodError in the gem",
      FORMAT,
      node.kind,
    );
  }
  if (node.kind === "formula" && node.name !== undefined && node.name !== "Mstyle") {
    throw unreachableName(node.kind, node.name);
  }

  const spacingValue = Object.hasOwn(opts, "unaryFunctionSpacing")
    ? opts.unaryFunctionSpacing
    : undefined;
  const spacing =
    spacingValue === undefined ? true : spacingValue !== null && spacingValue !== false; // Ruby truthiness; nil compacts away
  const context = spacing ? SPACING_CONTEXT : NO_SPACING_CONTEXT;

  const displayValue = Object.hasOwn(opts, "displayStyle")
    ? opts.displayStyle
    : (node as { readonly displaystyle?: unknown }).displaystyle;
  // `boolean_display_style`: `display_style.to_s == "true"`.
  const displaystyle = String(displayValue) === "true";

  const math = new XmlElement("math")
    .setAttribute("xmlns", "http://www.w3.org/1998/Math/MathML")
    .setAttribute("display", "block");
  const style = new XmlElement("mstyle").setAttribute("displaystyle", String(displaystyle));

  // `mathml_content` — the root formula's value renders STRAIGHT into the
  // mstyle, no mrow and no left_right_wrapper read (probed: a two-symbol
  // formula's <mi>s sit directly under <mstyle>).
  const value = (node as { readonly value?: unknown }).value;
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${node.kind}.value: is not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  for (const item of value) {
    style.append(renderChild(item, context, `${node.kind}.value`));
  }
  math.append(style);

  // `unitsml_post_processing` (formula.rb:450-473) rewrites elements
  // carrying a `unitsml` attribute. No kind file ever writes one of its own
  // — only a hand-built attributes/options hash can smuggle one in — so the
  // pass is a proven no-op on every tree this renderer emits, enforced by
  // refusing the marker BY NAME (unitsml is deferred wholesale).
  assertNoUnitsmlAttribute(math);

  return dumpNodes(math, { indent: 2 });
}

function assertNoUnitsmlAttribute(element: XmlElement): void {
  if (element.attributes.has("unitsml")) {
    throw deferredFeatureError(
      "unitsml",
      "an element carries a unitsml attribute, which the gem's " +
        "unitsml_post_processing rewrites (space insertion, marker stripping)",
      "formula",
    );
  }
  for (const child of element.children) {
    if (typeof child !== "string") assertNoUnitsmlAttribute(child);
  }
}
