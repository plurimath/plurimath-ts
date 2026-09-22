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
import { splitOnLinebreak } from "../../core/linebreak";
import { assertKnownOptions } from "../../core/render-options";
import { type FormatterOptions, resolveNumberFormat } from "../../formatting/index";
import { dumpNodes, XmlElement } from "../../xml/index";
import { createRenderContext, NO_SPACING_CONTEXT, SPACING_CONTEXT } from "./render";
import {
  deferredFeatureError,
  FORMAT,
  intentPostProcessing,
  isOwnMissingSymbolDataError,
  renderChild,
  unreachableName,
} from "./render-shared";

/**
 * Renderer options, typed exactly (§5): the five implemented axes
 * (`formatter` joined `displayStyle`/`unaryFunctionSpacing` with B2's Number
 * formatting slice, `splitOnLinebreak` with B3, `intent` with B4 —
 * TODO.plan/feature-roadmap.md). The still-deferred `to_mathml` keyword —
 * `unitsml` — is deliberately NOT in this type; passing it (any value but
 * `undefined`) is a named `RenderError` at runtime (`TODO.plan/deferred.md`
 * carries the entry and its trigger). A key that is neither — one `to_mathml` has no keyword
 * for at all — is refused by name too, at the entry (`ACCEPTED_OPTIONS`
 * below).
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
  /**
   * `Formatter::Standard`'s default-symbol behavior only, resolved by
   * `resolveNumberFormat` (`../../formatting/number-format.ts`), which itself
   * refuses by name every field of the gem's `formatter:` keyword B2's build
   * order has not reached yet — the html/asciimath/latex/unicodemath
   * renderers' own field, added here in the same shape.
   */
  readonly formatter?: FormatterOptions | null;
  /**
   * The gem's `split_on_linebreak:` keyword, default false. Ruby truthiness:
   * `null` is off. When on, the formula is cut at each `Linebreak` and every
   * line is rendered as its own complete `<math>` document, concatenated with
   * nothing between (`line_breaked_mathml`, formula.rb:110). `displayStyle`,
   * `unaryFunctionSpacing` and `formatter` apply to every line; the display
   * style DEFAULT is the receiver's own, not each line's.
   */
  readonly splitOnLinebreak?: boolean | null | undefined;
  /**
   * The gem's `intent:` keyword, default false. Ruby truthiness: `null` (the
   * gem's `nil`) is off, and so is an explicit `false` — measured
   * byte-identical to leaving the keyword out. Every other JS-representable
   * shape is on, byte-identical to `true` (measured against the oracle:
   * `"false"`, `""`, `0`, `1`, `[]` and `{}` all match `intent: true`
   * exactly, because the gem's `if intent` / `if intent` guards
   * (`formula.rb`) are plain Ruby truthiness with no `.to_s` or numeric
   * coercion — unlike `display_style`, which the gem does coerce via
   * `.to_s == "true"`). The type below is widened to match; the runtime
   * check at the call site (`intentValue !== undefined && intentValue !==
   * null && intentValue !== false`) already implements this correctly for
   * any shape and needs no change. When on, the renderer writes the MathML
   * Core `intent` (and `arg`) attributes exactly as the gem's `intentify` /
   * `intent_post_processing` do (`./intent-encoding.ts`,
   * `./intent-post-processing.ts`); inputs on which the gem raises
   * (a lone `UpcaseDd`, among others) raise `RenderError` here.
   */
  readonly intent?:
    | boolean
    | string
    | number
    | ReadonlyArray<unknown>
    | Record<string, unknown>
    | null
    | undefined;
}

/**
 * The keys `MathmlOptions` declares, as runtime data. The mapped type is TOTAL
 * over the interface — every optional key is required here, and a key the
 * interface does not declare is a type error — so an option added to
 * `MathmlOptions` cannot be left out of the accepted set below. The values
 * carry nothing; only the keys are read.
 */
/**
 * An explicit JS `undefined` means "not given" (as `toOmml` already treats it),
 * so the receiver's own `displaystyle` applies. Without this, `String(undefined)`
 * is `"undefined"` and the option would wrongly read as false, where the gem — an
 * omitted keyword — keeps the receiver's value.
 */
function hasDisplayStyle(opts: Record<string, unknown>): boolean {
  return Object.hasOwn(opts, "displayStyle") && opts.displayStyle !== undefined;
}

const IMPLEMENTED_OPTIONS: { readonly [K in keyof Required<MathmlOptions>]: null } = {
  displayStyle: null,
  unaryFunctionSpacing: null,
  formatter: null,
  splitOnLinebreak: null,
  intent: null,
};

/** The still-deferred `to_mathml` keywords, each refused by name when present. */
const DEFERRED_OPTIONS: readonly (readonly [string, string])[] = [
  ["unitsml", "UnitsML is deferred wholesale (ARCHITECTURE.md §5)"],
];

/**
 * Every option key this entry accepts: the five implemented axes plus the
 * still-deferred keyword. The deferred name belongs here because `to_mathml`
 * really does take it — `unitsml:` is one of its six keywords
 * (formula.rb:76-83 on the pinned oracle; `formatter:`, `split_on_linebreak:`
 * and `intent:` moved from this list to `IMPLEMENTED_OPTIONS` above) — so
 * "unknown option" would be the wrong thing to say about it. It is
 * recognised, then refused by name with the reason, a few lines further
 * down. Anything outside this list is a keyword `to_mathml` does not have
 * either, and is refused as unknown at the entry.
 */
const ACCEPTED_OPTIONS: readonly string[] = [
  ...Object.keys(IMPLEMENTED_OPTIONS),
  ...DEFERRED_OPTIONS.map(([name]) => name),
];

/**
 * `Formula#to_mathml` (`formula.rb:76-108`), as a module function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 */
export function toMathml(node: MathNode, options?: MathmlOptions | null): string {
  // The options come first, as they do in Ruby: the keyword check there is
  // part of the call, so an unknown keyword raises before the method body
  // ever looks at the receiver. The shared guard also carries the
  // keyword-hash check this entry used to make inline — a primitive would
  // ToObject-coerce through `Object.hasOwn` below and behave as empty
  // options, and an array is not a keyword hash either.
  assertKnownOptions(options, ACCEPTED_OPTIONS, FORMAT);
  assertMathNodeShape(node, FORMAT);
  const opts: Record<string, unknown> =
    options === null || options === undefined ? {} : (options as Record<string, unknown>);
  const numberFormat = resolveNumberFormat(options?.formatter, FORMAT);
  try {
    // Inside the wrap: reading a hostile options object (a Proxy trap, a
    // throwing getter) must surface as RenderError, never raw.
    for (const [name, detail] of DEFERRED_OPTIONS) {
      if (Object.hasOwn(opts, name) && opts[name] !== undefined) {
        throw deferredFeatureError(name, detail, "formula");
      }
    }
    return renderMath(node, opts, numberFormat);
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

function renderMath(
  node: MathNode,
  opts: Record<string, unknown>,
  numberFormat: ReturnType<typeof resolveNumberFormat>,
): string {
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

  // `line_breaked_mathml` (formula.rb:110-119) renders each line as its own
  // `to_mathml`, handing down the display style as the receiver's `display_style`
  // keyword resolved BEFORE the split — a line is a fresh clone whose own
  // `displaystyle` is the constructor default, so it must not be read there.
  const splitValue = Object.hasOwn(opts, "splitOnLinebreak") ? opts.splitOnLinebreak : undefined;
  if (splitValue !== undefined && splitValue !== null && splitValue !== false) {
    const inherited: Record<string, unknown> = {
      intent: Object.hasOwn(opts, "intent") ? opts.intent : undefined,
      displayStyle: hasDisplayStyle(opts)
        ? opts.displayStyle
        : (node as { readonly displaystyle?: unknown }).displaystyle,
    };
    if (Object.hasOwn(opts, "unaryFunctionSpacing")) {
      inherited.unaryFunctionSpacing = opts.unaryFunctionSpacing;
    }
    return splitOnLinebreak(node)
      .map((line) => renderMath(line, inherited, numberFormat))
      .join("");
  }

  const spacingValue = Object.hasOwn(opts, "unaryFunctionSpacing")
    ? opts.unaryFunctionSpacing
    : undefined;
  const spacing =
    spacingValue === undefined ? true : spacingValue !== null && spacingValue !== false; // Ruby truthiness; nil compacts away
  const intentValue = Object.hasOwn(opts, "intent") ? opts.intent : undefined;
  const intent = intentValue !== undefined && intentValue !== null && intentValue !== false; // Ruby truthiness
  const context =
    numberFormat === null && !intent
      ? spacing
        ? SPACING_CONTEXT
        : NO_SPACING_CONTEXT
      : createRenderContext(spacing, numberFormat, intent);

  const displayValue = hasDisplayStyle(opts)
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
  const nodes = value.map((item) => renderChild(item, context, `${node.kind}.value`));
  // `mathml_content` (formula.rb:133-139): the rendered children, then — under
  // intent — the formula-level rewrite, in place, before they are appended.
  if (intent) intentPostProcessing(nodes);
  style.append(nodes);
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
