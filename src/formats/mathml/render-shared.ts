/**
 * Shared semantics for the per-kind MathML render files
 * (`../../render/<kind>/mathml.ts`): the render context, the child-render
 * contract, and the Ruby idioms more than one gem class leans on. The
 * per-kind files carry the per-class measured pins; this file carries the
 * cross-cutting ones (PORTING-STANDARDS.md — every behaviour here was read
 * off live gem instances against the pinned oracle, plurimath 0.11.6,
 * 00c52783; probes probe-mathml-kinds and probe-mathml-edges).
 *
 * Layout contract (ARCHITECTURE.md §5, "How this maps to the gem"): one
 * directory per node kind under `src/render`, one file per format inside,
 * each mirroring the gem file of the class it renders; the dispatch table in
 * `./render.ts` is typed total over `NodeKind`; recursion goes through
 * `context.render`, never through a direct import of the table — that keeps
 * the module graph acyclic (`no-circular` is an error in the boundary gate).
 */

import {
  type MathNode,
  MissingSymbolDataError,
  type NodeKind,
  type NodeParameter,
  RenderError,
} from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { NODE_SPECS, rubyClassName } from "../../core/normalize";
import { XmlElement } from "../../xml/index";

export const FORMAT = "mathml";

/**
 * What one `to_mathml_without_math_tag` answers. Almost always an
 * `XmlElement`; the measured exceptions, each with its consumer:
 *
 *   - an ARRAY of rendered children — a `Formula`/`Mrow` whose
 *     `left_right_wrapper` is falsy returns `mathml_content` raw
 *     (formula.rb:121-126), and `XmlHelper.update_nodes` splices it;
 *   - a plain STRING — `Td#to_mathml_without_math_tag` answers `""` for a
 *     `Vert`-only cell (td.rb:18-19), which lands in `<mtr>` as an empty text
 *     node and forces the `<mtr></mtr>` long form (probe td-vert-only);
 *   - `null` — the unary carrier with `hide_function_name`, a nil parameter
 *     and spacing off returns Ruby nil (unary_function.rb:30-58).
 */
export type MathmlRendered = XmlElement | string | null | MathmlRenderedList;
export type MathmlRenderedList = readonly MathmlRendered[];

/**
 * The render context. The one axis the mathml walk reads is
 * `options[:unary_function_spacing]` (unary_function.rb:48), fixed for a
 * whole render by `Formula#to_mathml`'s keyword — nothing derives a child
 * context on this path (the `table:` merge is `Td`'s ASCIIMATH move;
 * `Td#to_mathml_without_math_tag` threads options through unchanged).
 */
export interface RenderContext {
  /** Ruby truthiness of `options[:unary_function_spacing]`, default true. */
  readonly unaryFunctionSpacing: boolean;
  /**
   * `child.to_mathml_without_math_tag(intent, options:)` — looks the child's
   * kind up in the render table (`./render.ts`) and renders it under THIS
   * context.
   */
  readonly render: (node: MathNode) => MathmlRendered;
}

/** The data shape of one kind — what a per-kind render file takes. */
export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

/** One render-table entry: the gem's `#to_mathml_without_math_tag` for one kind. */
export type RenderFn<K extends NodeKind> = (
  node: NodeOf<K>,
  context: RenderContext,
) => MathmlRendered;

/** Ruby truthiness for `if parameter_x` guards: only nil and false are falsy. */
export function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

export function slotKind(value: NodeParameter | undefined): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const kind = (value as { readonly kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}

/**
 * The gem's `class_name` (core.rb:28-30): the Ruby class basename,
 * downcased — `Base#to_mathml_without_math_tag` routes `<munder>` on it,
 * `Power` checks it for `ubrace`/`obrace`, `Matrix#table_tag_only?` for
 * `lround`/`rround`, and the fenced/table paren pipeline distinguishes the
 * generic `"symbol"` by it. Alias names fold back through the same
 * projection the census uses (`rubyClassName`).
 */
export function classNameOf(value: NodeParameter | undefined): string | undefined {
  if (slotKind(value) === undefined) return undefined;
  return classBasename(rubyClassName(value as MathNode)).toLowerCase();
}

export function classBasename(rubyClass: string): string {
  return rubyClass.slice(rubyClass.lastIndexOf(":") + 1);
}

export function describeSlot(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (Array.isArray(value)) return "a bare list";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/**
 * A strict `field.to_mathml_without_math_tag(intent, options:)` call: only a
 * node answers it. Everything else — a bare string (which the gem's own
 * parse of `""` or `left(right)` puts into a formula's value), a list, a
 * number, `null` where Ruby wrote no `&.` — raises `NoMethodError` in the
 * gem and `RenderError` here.
 */
export function renderChild(value: unknown, context: RenderContext, at: string): MathmlRendered {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const kind = (value as { readonly kind?: unknown }).kind;
    if (typeof kind === "string" && Object.hasOwn(NODE_SPECS, kind)) {
      return context.render(value as MathNode);
    }
  }
  throw new RenderError(
    `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

/**
 * `UnaryFunction#mathml_value` (unary_function.rb:209-219): a list compacts
 * (nil entries dropped BEFORE rendering — `parameter_one.compact.map`) and
 * renders per element; a single node renders to a one-element array via
 * `Array(...)`; nil is `[]`. A rendered child that is itself an array (a
 * wrapperless formula) stays nested — `update_nodes` recurses it.
 */
export function mathmlValue(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): MathmlRendered[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => renderChild(item, context, at));
  }
  const rendered = renderChild(value, context, at);
  // `Array(x)`: an array stays itself, anything else wraps.
  return Array.isArray(rendered) ? [...rendered] : [rendered];
}

/**
 * `Core#validate_mathml_fields` (core.rb:185-191): nil answers nil (the
 * caller's `update_nodes` skips it), a LIST maps STRICTLY per element (a
 * nil entry inside raises NoMethodError in the gem), anything else renders
 * as one child.
 */
export function validateMathmlFields(
  field: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): MathmlRendered {
  if (field === null || field === undefined) return null;
  if (Array.isArray(field)) return field.map((item) => renderChild(item, context, at));
  return renderChild(field, context, at);
}

/**
 * `wrap_mrow(node, intent)` (core.rb:488-493) demands `.name` of its
 * argument before anything else, so a nil, string, or spliced-array render
 * in that slot is a gem `NoMethodError` (probed: a wrapperless formula as a
 * big operator's third slot crashes) and a `RenderError` here. With
 * `intent` false — always, intent is deferred — the surviving element
 * passes through unchanged; `Nary` alone calls it with a literal `true`
 * (nary.rb:64), wrapping anything not already an `<mrow>`.
 */
export function requireElement(rendered: MathmlRendered, kind: string, at: string): XmlElement {
  if (rendered instanceof XmlElement) return rendered;
  throw new RenderError(
    `${at}: rendered to ${describeSlot(rendered)} — the gem sends ` +
      ".name to it and raises NoMethodError",
    FORMAT,
    kind,
  );
}

/**
 * One attribute value as `OxEngine::Element#update_attrs` writes it
 * (ox_engine/element.rb:104-110): `value.to_s`, then the entity decode. The `to_s` is
 * reproducible for exactly the shapes `interpolatedValue` accepts on the
 * asciimath side — nil → `""` (an EMPTY attribute, not a skipped one),
 * strings, booleans, the non-finite floats — and ambiguous for a finite
 * number (Ruby `5` vs `5.0`) or bytes `String()` cannot match (a hash's
 * `{a: 1}`, a node's address-bearing inspect), which raise instead.
 */
export function attributeText(value: unknown, kind: string, at: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  throw new RenderError(
    `${at}: attribute holds ${describeSlot(value)} — Ruby's to_s of it is bytes ` +
      "String() cannot reliably match",
    FORMAT,
    kind,
  );
}

/** Is this a plain attribute/option hash — not null, a list, or a node? */
export function isPlainHash(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    slotKind(value as NodeParameter) === undefined
  );
}

/**
 * A `set_attr(hash)` call: every entry written in iteration order, each
 * value through `attributeText` and the engine wrapper's entity decode
 * (`Utility.html_entity_to_unicode` — core's decoder, surfaced as
 * `htmlEntityToUnicode`). The caller has already established the hash (the
 * guards differ per call site — `mpadded` passes options straight in where
 * `bar` checks `attributes && !attributes.empty?` first).
 */
export function setAttributesFromHash(
  element: XmlElement,
  hash: Record<string, unknown>,
  kind: string,
  at: string,
): XmlElement {
  for (const [key, value] of Object.entries(hash)) {
    element.setAttribute(key, htmlEntityToUnicode(attributeText(value, kind, `${at}.${key}`)));
  }
  return element;
}

/**
 * One attribute write through the wrapper's `[]=` (ox_engine/element.rb:22-24) — the
 * same `to_s` + entity decode as `set_attr`, for the single-attribute sites
 * (`dot`/`vec`/`tilde`/`overleftrightarrow`'s `accent`).
 */
export function setDecodedAttribute(
  element: XmlElement,
  name: string,
  value: unknown,
  kind: string,
  at: string,
): XmlElement {
  return element.setAttribute(name, htmlEntityToUnicode(attributeText(value, kind, at)));
}

/**
 * An `attributes`/`options` slot a gem site sends `.each`/`.dig`/`.reject`
 * to unguarded: a plain hash passes through, Ruby nil (null/undefined)
 * answers `null` for the caller's own `&.` handling, and anything else —
 * a node, list, string, number — raised `NoMethodError` or `TypeError`
 * in the gem (probed: `Frac.new(x, y, "zz")` and `Mpadded.new(x, "zz")`
 * both crash) and raises `RenderError` here, never a silently different
 * attribute set.
 */
export function hashOrNil(
  value: unknown,
  kind: string,
  at: string,
): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (isPlainHash(value)) return value;
  throw new RenderError(
    `${at}: holds ${describeSlot(value)} — the gem sends hash methods to it and raises`,
    FORMAT,
    kind,
  );
}

/**
 * The `set_attr(attributes) if attributes && !attributes.empty?` guard the
 * accent family shares (`function/bar.rb`, `function/hat.rb`, `function/obrace.rb`, `function/ubrace.rb`,
 * `function/ul.rb`). Measured (probe-mathml-edges3): nil and false skip (truthiness),
 * an empty hash, empty string, and empty list skip (`.empty?` — Ruby's
 * String and Array both answer it), a plain hash writes its entries, a
 * non-empty string crashes the gem (`String#each`), and a non-empty LIST
 * writes pair-wise attributes (`["a","b"]` becomes `a="" b=""`) — a shape
 * this port REFUSES rather than reproduces: it is reachable from no parse,
 * its full matrix (nested pairs, non-string keys) is unmeasured, and a
 * silent partial imitation is the one wrong answer (recorded divergence,
 * TODO.plan/deferred.md).
 */
export function attributesForSetAttr(
  value: unknown,
  kind: string,
  at: string,
): Record<string, unknown> | null {
  if (value === null || value === undefined || value === false) return null;
  if (isPlainHash(value)) return Object.keys(value).length === 0 ? null : value;
  if (value === "" || (Array.isArray(value) && value.length === 0)) return null;
  throw new RenderError(
    `${at}: holds ${describeSlot(value)} — not a reproducible attribute hash ` +
      "(the gem crashes on most non-hash shapes and pair-explodes lists; " +
      "both map to this refusal)",
    FORMAT,
    kind,
  );
}

/**
 * A slot the gem appends with `<<`: `OxEngine::Element#<<` takes a String
 * verbatim and sends `.xml_nodes` to everything else (ox_engine/element.rb:42-45), so
 * only a string renders and every other non-nil value crashed the gem
 * (probed: `Left.new(5)`; booleans included — `to_asciimath` interpolates
 * `true`, this path does not). Nil is the caller's own guard.
 */
export function requireStringForAppend(value: unknown, kind: string, at: string): string {
  if (typeof value === "string") return value;
  throw new RenderError(
    `${at}: holds ${describeSlot(value)} — the gem appends it with << and raises NoMethodError`,
    FORMAT,
    kind,
  );
}

/**
 * `Formatter::Numbers::MathmlRenderer.plain_element`'s `result.to_s`
 * (formatter/numbers/mathml_renderer.rb:50-52) and every other reproducible `to_s`: nil →
 * `""`, a string → itself, a boolean → `"true"`/`"false"`, NaN and ±Infinity
 * → their one Ruby spelling. A FINITE number raises — JS cannot witness
 * Ruby's Integer/Float split (`5` vs `5.0`) — as does a hash or node, whose
 * Ruby `to_s` is bytes `String()` cannot match. The standing
 * degenerate-input ruling: every irreproducible shape is a loud
 * `RenderError`, never silently divergent bytes.
 */
export function interpolatedValue(value: unknown, kind: string, at: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  throw new RenderError(
    `${at}: holds ${describeSlot(value)} — no gem parse puts one here, and Ruby's ` +
      `to_s of it is bytes String() cannot reliably match`,
    FORMAT,
    kind,
  );
}

/**
 * `options[:mask]` handling on `Int` (`function/int.rb:59`, key presence) and `Nary`
 * (`nary.rb:56`, truthiness): the gem decodes the mask integer into limit
 * options (`Core#get_mask_options`, core.rb:543-570 — Ruby `to_i` with
 * FLOORED modulo) and rewrites the script tag. This port supports exactly
 * the no-op decoding — a mask whose only option is `limits_default`
 * (`mask.to_i` congruent to 0 mod 4 with no %32 flag, e.g. `nil` or `0`),
 * probed as byte-identical to no mask at all (probe int-mask-key-nil) —
 * and refuses every live mask BY NAME (`mask 1` renames `msubsup` to
 * `munderover`, probed; the placeholder/opposite machinery is UnicodeMath
 * -input scope, TODO.plan/deferred.md).
 */
export function assertMaskIsInert(mask: unknown, kind: string, at: string): void {
  const value = rubyToI(mask, kind, at);
  const floored = (n: number, m: number): number => ((n % m) + m) % m;
  const low = floored(value, 4);
  const high = floored(value - low, 32);
  if (low === 0 && high === 0) return;
  throw deferredFeatureError(
    "mask",
    `${at} holds mask ${String(value)}, which rewrites the script tag ` +
      "(limits/placeholder handling); only the inert limits_default decoding is supported",
    kind,
  );
}

/** Ruby `to_i` for the mask read: nil is 0, a Float truncates, a String parses its leading integer; `true`, hashes and nodes raise NoMethodError in the gem. */
function rubyToI(value: unknown, kind: string, at: string): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      // Float::NAN.to_i / Float::INFINITY.to_i raise FloatDomainError.
      throw new RenderError(
        `${at}: mask ${String(value)} raises FloatDomainError in Ruby`,
        FORMAT,
        kind,
      );
    }
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const match = value.match(/^\s*[+-]?\d+/);
    return match === null ? 0 : Number.parseInt(match[0], 10);
  }
  throw new RenderError(
    `${at}: mask holds ${describeSlot(value)} — Ruby's to_i raises NoMethodError on it`,
    FORMAT,
    kind,
  );
}

/**
 * The walk's own missing-symbol throw, distinguishable from an imitation —
 * the same WeakSet pattern as the asciimath renderer's, one set per format
 * because each format's boundary vouches only for its own throw sites
 * (see `../asciimath/render-shared.ts` for the full rationale: membership
 * cannot be read off, minted, or transplanted by input code, where an
 * `instanceof` test or a symbol-keyed mark could).
 */
const OWN_MISSING_SYMBOL_ERRORS = new WeakSet<MissingSymbolDataError>();

/** The symbol table's one deliberate non-RenderError throw, recorded as our own. */
export function missingSymbolDataError(symbolId: string): MissingSymbolDataError {
  const error = new MissingSymbolDataError(symbolId, FORMAT);
  OWN_MISSING_SYMBOL_ERRORS.add(error);
  return error;
}

/** Membership in the factory's set — shape and prototype prove nothing here. */
export function isOwnMissingSymbolDataError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    OWN_MISSING_SYMBOL_ERRORS.has(error as MissingSymbolDataError)
  );
}

/**
 * Class names outside a carrier's measured set raise `RenderError` — the
 * asciimath renderer's rule, verbatim (ARCHITECTURE.md §5, "parity gaps
 * fail loudly"): a name outside the set may carry its own
 * `to_mathml_without_math_tag` override this port has not measured, and a
 * silent carrier-default render would be a quiet divergence.
 */
export function unreachableName(kind: string, name: string): RenderError {
  return new RenderError(
    `No measured mathml rendering for ${kind} name "${name}" — it is not ` +
      "reachable from the AsciiMath transform, and the gem class may override " +
      "to_mathml_without_math_tag. Rendering a carrier default instead would diverge silently.",
    FORMAT,
    kind,
  );
}

/**
 * A deferred option or construct, refused BY NAME (the approved P1 scope
 * contract): the gem renders these, this port does not yet, and silence or
 * a plausible approximation is the one wrong answer. Each named feature has
 * a `TODO.plan/deferred.md` entry with its return trigger.
 */
export function deferredFeatureError(feature: string, detail: string, kind: string): RenderError {
  return new RenderError(
    `The "${feature}" feature of to_mathml is deferred (TODO.plan/deferred.md): ${detail}`,
    FORMAT,
    kind,
  );
}
