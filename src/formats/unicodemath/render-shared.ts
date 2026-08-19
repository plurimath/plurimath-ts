/**
 * Shared semantics for the per-kind UnicodeMath render files
 * (`../../render/<kind>/unicodemath.ts`): the render context, the child-render
 * contract, and the cross-cutting predicates UnicodeMath needs and no other
 * format does. Every behaviour here was read off live gem instances against
 * the pinned oracle (plurimath 0.11.6, 00c52783) — PORTING-STANDARDS.md.
 *
 * ## What makes this format different
 *
 * LaTeX and MathML render a node from the node. UnicodeMath sometimes renders
 * a parent by first **asking a question of its child**, and the answer changes
 * the parent's output rather than the child's:
 *
 *   - `prime_unicode?` (gem `core.rb:415`) **swaps sub and sup order** in
 *     `Nary`, `PowerBase`, `Inf`, `Int` and `Multiscript`;
 *   - `mini_sized?` (`formula.rb:353`) changes the separator a formula joins
 *     its children with, and short-circuits `Fenced` and `Number`;
 *   - `negated_value?` (`formula.rb:482`) does the same to the separator.
 *
 * The render context carries only a `render` closure, which cannot answer any
 * of these — so they live here as pure structural queries over `MathNode`.
 * Their default answers are all falsy, which is exactly what makes them
 * dangerous: a wrong answer for one node kind is invisible on every other
 * shape, so each is pinned in `test/formats/unicodemath/render-shared.spec.ts`
 * against the gem's own result.
 */

import { type MathNode, type NodeKind, RenderError } from "../../core/index";

export const FORMAT = "unicodemath";

/**
 * The render context. UnicodeMath has no option axis: the generated exception
 * matrix (`src/generated/unicodemath/exceptions.ts`) is empty, because no
 * symbol varies on `intent`, `table` or `rspace` — measured, and pinned by
 * `test/generated/unicodemath-data.spec.ts` so a regeneration that introduces
 * variants fails loudly.
 */
export interface RenderContext {
  /**
   * `child.to_unicodemath(options:)`. Returns `null` exactly where the gem
   * returns nil, which callers observe: `Frac#to_unicodemath` falls off its
   * `elsif` chain returning nil when `options` names none of `:linethickness`,
   * `:displaystyle` or `:ldiv`, and `Table#unicodemath_class_name` has a bare
   * `return`.
   */
  readonly render: (node: MathNode) => string | null;
}

export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

export type RenderFn<K extends NodeKind> = (
  node: NodeOf<K>,
  context: RenderContext,
) => string | null;

/**
 * The glyphs `prime_unicode?` looks for, decoded.
 *
 * The gem compares against entity *text* — `Utility.primes_constants` is
 * `PREFIXED_PRIMES` merged with `{ sprime: "&#x27;" }`, and
 * `unicodemath_field_value` returns `Utility.hexcode_in_input(field)`, which is
 * also entity text, so the two match as strings. This port's symbol table holds
 * **decoded** glyphs, so the comparison is against the decoded forms instead.
 *
 * Measured rather than derived: `class_name` for a concrete symbol class is its
 * own name (`"prime"`, `"sum"`), not `"symbol"`, so the `field.value` branch of
 * `unicodemath_field_value` is never the one that runs for these — `value` is
 * `nil` on every concrete symbol probed. Reading the source without probing
 * gives the wrong branch.
 */
const PRIME_GLYPHS: readonly string[] = [
  "′", // &#x2032; prime
  "″", // &#x2033; double prime
  "‴", // &#x2034; triple prime
  "⁗", // &#x2057; quadruple prime
  "'", // &#x27; the apostrophe `sprime`
];

/**
 * `Core#prime_unicode?` — whether this child makes its parent emit the
 * superscript **before** the subscript.
 *
 * False for anything that is not a symbol, which is the gem's first line and
 * the reason a `Formula` child never triggers the swap however many primes it
 * contains.
 *
 * The whole prime family answers true, not only the four `PREFIXED_PRIMES`
 * classes: `Dprime` and `Second` both render U+2033, `Third` U+2034, `Qprime`
 * U+2057, and the gem matches on the rendered value rather than the class, so
 * all of them swap. Probing only `prime`/`pprime`/`ppprime`/`pppprime` would
 * have suggested a four-class rule that is not the rule.
 */
export function primeUnicode(node: MathNode | undefined, rendered: string | null): boolean {
  if (node === undefined || node.kind !== "symbol") return false;
  if (rendered === null) return false;

  return PRIME_GLYPHS.some((glyph) => rendered.includes(glyph));
}

/**
 * `Core#mini_sized?`, and the three overrides that are not the default.
 *
 * The gem's default is `false` (`core.rb:352`); `Number` and `Symbol` answer
 * `mini_sub_sized || mini_sup_sized` from their own fields; `Fenced` asks its
 * three slots; and `Formula` asks **only its first child** (`formula.rb:353`,
 * `true if value&.first&.mini_sized?` — note it yields nil, not false, which
 * is falsy either way but is why nothing here returns a nullable boolean).
 */
export function miniSized(node: MathNode | undefined): boolean {
  if (node === undefined) return false;

  switch (node.kind) {
    case "number":
    case "symbol":
      return Boolean(node.miniSubSized) || Boolean(node.miniSupSized);
    case "fenced":
      return (
        miniSized(asNode(node.parameterOne)) ||
        someMiniSized(node.parameterTwo) ||
        miniSized(asNode(node.parameterThree))
      );
    case "formula":
      // First child only. Asking every child would answer true for shapes the
      // gem answers false for, and the difference is a separator that appears
      // or disappears in the output.
      return miniSized(asNode(node.value?.[0]));
    default:
      return false;
  }
}

/**
 * `Formula#negated_value?` — the last child being the combining long solidus
 * overlay, which suppresses the join separator alongside `mini_sized?`.
 */
export function negatedValue(node: MathNode): boolean {
  if (node.kind !== "formula") return false;

  const last = asNode(node.value?.[node.value.length - 1]);
  return last?.kind === "symbol" && last.value === NEGATION_VALUE;
}

/**
 * The combining long solidus overlay, compared as the gem compares it: against
 * the symbol's raw `value`, not a named id.
 *
 * Measured, because the obvious reading is wrong. No entry in
 * `src/generated/unicodemath/symbols.ts` carries U+0338 at all: the gem builds
 * this as a **generic** `Symbols::Symbol` holding the literal entity text, so
 * its `class_name` is `"symbol"` and its id in this port is the default
 * `"Symbol"`. Looking for a named symbol id finds nothing and the predicate
 * silently never fires.
 */
const NEGATION_VALUE = "&#x338;";

function someMiniSized(slot: unknown): boolean {
  if (!Array.isArray(slot)) return miniSized(asNode(slot));
  // `Formula.new(parameter_two).mini_sized?` — a formula asks its first child,
  // so a list slot behaves the same way rather than asking all of them.
  return miniSized(asNode(slot[0]));
}

function asNode(value: unknown): MathNode | undefined {
  return isNode(value) ? value : undefined;
}

export function isNode(value: unknown): value is MathNode {
  return typeof value === "object" && value !== null && "kind" in value;
}

/**
 * `Core#unicodemath_parens` — wrap a field in `(…)` unless it is already
 * fenced, in which case the fence is the wrapping.
 */
export function unicodemathParens(
  field: MathNode | undefined,
  context: RenderContext,
): string | null {
  if (field === undefined) return null;

  const rendered = context.render(field);
  if (field.kind === "fenced") return rendered;

  return `(${rendered ?? ""})`;
}

/**
 * `Utility.html_entity_to_unicode`, applied by `Formula#to_unicodemath` at the
 * boundary — and by every *nested* formula too, because a parent calls the
 * same method on its children.
 *
 * That repetition is safe only because the transform is idempotent, which was
 * measured rather than assumed: decoding `"a&#x2581;b"` twice gives the same
 * string. The generated render tables hold raw entity text for this reason,
 * while `symbols.ts` holds decoded glyphs, because the gem's symbol methods
 * decode at the symbol and its constant tables do not.
 */
export function htmlEntityToUnicode(text: string): string {
  return text.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
}

/** The gem's `\s/\s -> /` squeeze, applied at the same boundary. */
export function squeezeSolidus(text: string): string {
  return text.replace(/\s\/\s/g, "/");
}

export function missingRenderer(kind: string, at: string): RenderError {
  // `RenderError` carries `format` and `kind` as fields, not just in the
  // message: ARCHITECTURE.md §5 makes them part of the error contract, so a
  // caller can branch on the kind without parsing prose.
  return new RenderError(`${at}: no unicodemath renderer for kind "${kind}"`, FORMAT, kind);
}
