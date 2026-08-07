/**
 * Shared semantics for the per-kind LaTeX render files
 * (`../../render/<kind>/latex.ts`): the render context, the child-render
 * contract, and the Ruby idioms more than one gem class leans on. The
 * per-kind files carry the per-class measured pins; this file carries the
 * cross-cutting ones (PORTING-STANDARDS.md — every behaviour here was read
 * off live gem instances against the pinned oracle, plurimath 0.11.6,
 * 00c52783).
 *
 * Layout contract (ARCHITECTURE.md §5, "How this maps to the gem"): one
 * directory per node kind under `src/render`, one file per format inside,
 * each mirroring the gem file of the class it renders; the dispatch table in
 * `./render.ts` is typed total over `NodeKind`; recursion goes through
 * `context.render`, never through a direct import of the table — that keeps
 * the module graph acyclic (`no-circular` is an error in the boundary gate).
 */

import { type MathNode, type NodeKind, type NodeParameter, RenderError } from "../../core/index";
import { NODE_SPECS } from "../../core/normalize";
import { LATEX_PLAIN_WRAPPED_UNARY_NAMES } from "../../generated/latex/render-tables";

export const FORMAT = "latex";

/**
 * The render context. LaTeX rendering has NO option axis: the generated
 * exception matrix (`src/generated/latex/exceptions.ts`) is empty — no symbol
 * varies on any manifested axis — so unlike the asciimath context there is no
 * axis member and no derivation here, only the recursive dispatcher.
 * `test/formats/latex/renderer.spec.ts` pins that emptiness so a regeneration
 * that introduces variants fails loudly.
 */
export interface RenderContext {
  /**
   * `child.to_latex(options:)` — looks the child's kind up in the render
   * table (`./render.ts`) and renders it under THIS context. Returns `null`
   * exactly where the gem returns nil from `to_latex` — a bare
   * `FontStyle`/`Mpadded` with nothing in it, a base symbol with no value —
   * because callers observe that nil (`Nary` falls back to `"\int"`, a
   * table's open paren falls back to `.`).
   */
  readonly render: (node: MathNode) => string | null;
}

/** The data shape of one kind — what a per-kind render file takes. */
export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

/**
 * One render-table entry: the gem's `#to_latex` for one node kind.
 * `string | null` because the renders that answer nil in Ruby — a bare
 * `FontStyle`/`Mpadded`, a base symbol with no value — hand that nil to their
 * callers; every other entry narrows its own return to `string`.
 */
export type RenderFn<K extends NodeKind> = (
  node: NodeOf<K>,
  context: RenderContext,
) => string | null;

/** Ruby truthiness for `if parameter_x` guards: only nil and false are falsy. */
export function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** Ruby `String#strip`: exactly `[\0\t\n\v\f\r ]`, never the no-break space. */
export function rubyStrip(text: string): string {
  return text.replace(/^[\0\t\n\v\f\r ]+/, "").replace(/[\0\t\n\v\f\r ]+$/, "");
}

/** Ruby `/\s/`: ASCII whitespace only — `Color` strips it from its first value. */
export function stripRubyWhitespace(text: string): string {
  return text.replace(/[ \t\r\n\f\v]/g, "");
}

/** Interpolation: Ruby `"#{nil}"` is the empty string. */
export function s(value: string | null): string {
  return value ?? "";
}

export function slotKind(value: NodeParameter | undefined): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const kind = (value as { readonly kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}

export function isNode(value: unknown): value is MathNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const kind = (value as { readonly kind?: unknown }).kind;
  return typeof kind === "string" && Object.hasOwn(NODE_SPECS, kind);
}

/**
 * A strict `field.to_latex(options:)` call: only a node answers it.
 * Everything else — a bare string (which the gem's own parse of `""` or
 * `left(right)` puts into a formula's value), a list, a number, `null` where
 * Ruby wrote no `&.` — raises `NoMethodError` in the gem and `RenderError`
 * here. Returns `null` exactly where Ruby's `to_latex` returns nil (a bare
 * `FontStyle`/`Mpadded`, a base symbol with no value).
 */
export function renderChild(value: unknown, context: RenderContext, at: string): string | null {
  if (isNode(value)) return context.render(value);
  throw new RenderError(
    `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

export function describeSlot(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (Array.isArray(value)) return "a bare list";
  return `a ${typeof value}`;
}

/**
 * A `value` slot the gem interpolates raw — `Number#to_latex` and
 * `Symbols::Symbol#to_latex` plus the raw `value`-ivar reads the LaTeX path
 * adds (`Fenced#symbol_or_paren`'s non-paren slots, `Color`'s asciimath
 * fragment). Nil → `""`, a string → itself; nothing else, because no gem
 * parse puts anything else there and `String()` cannot reproduce Ruby's
 * `to_s` of it (probed on the pinned oracle, 2026-08-07:
 * `Number.new({a: 1}).to_latex(options: {})` renders `"{a: 1}"` where
 * `String()` says "[object Object]"; a node value renders an unstable
 * `"#<Plurimath::Math::Number:0x…>"`). The standing degenerate-input ruling
 * makes such shapes a loud `RenderError`, never silently divergent bytes.
 *
 * The shape validator cannot reject these at entry without restating slot
 * types per kind — a plain hash IS legal in other slots (`Mglyph` defaults
 * `parameter_one` to `{}`), which is why the guard lives at the sites.
 */
export function interpolatedValue(value: unknown, kind: string, at: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  throw new RenderError(
    `${at}: holds ${describeSlot(value)} — no gem parse puts one here, and Ruby's ` +
      `interpolation of it is bytes String() cannot match`,
    FORMAT,
    kind,
  );
}

/** `field&.to_latex` where the gem interpolates the nil away. */
export function nilSafe(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  if (value === null || value === undefined) return "";
  return s(renderChild(value, context, at));
}

/**
 * The unary names whose gem class answers `validate_function_formula` with
 * false, so `latex_wrapped` gives them plain braces. Generated per class
 * through `Overset.new(instance, …).to_latex` renders: 27 of the 34
 * reachable unary classes — NOT `Cancel`, `Ker`, `Liminf`, `Limsup` or
 * `Sup`, which take the `{ \left ( … \right ) }` wrap. `Left` and `Right`
 * also answer false (asserted at generation) and have their own arm below.
 * This is not `Utility::UNARY_CLASSES` (that set contains ker/liminf/limsup/
 * sup), so it cannot be derived from the generated registry.
 */
const PLAIN_WRAPPED_UNARY_NAMES: ReadonlySet<string> = new Set(LATEX_PLAIN_WRAPPED_UNARY_NAMES);

/**
 * `Core#validate_function_formula`, per measured class (probe_census.rb
 * `wrapped/*`): true by default (`core.rb:71`); false for symbols
 * (`symbols/symbol.rb:107`), numbers (`number.rb:80`), text (`text.rb:65`),
 * the brace/accent shapes (`obrace.rb:40`, `ubrace.rb:48`, `hat.rb:40`,
 * `tilde.rb:36`), `Left`/`Right` (`left.rb:38`, `right.rb:38`), the 27 plain
 * unary names (the generated census, `LATEX_PLAIN_WRAPPED_UNARY_NAMES`) —
 * and a formula holding BOTH a `Left` and a `Right` (`formula.rb:298`:
 * `value.none?(Left) || value.none?(Right)`).
 */
export function validateFunctionFormula(field: MathNode): boolean {
  switch (field.kind) {
    case "symbol":
    case "number":
    case "text":
    case "obrace":
    case "ubrace":
    case "hat":
    case "tilde":
      return false;
    case "unaryFunction":
      if (field.name === "Left" || field.name === "Right") return false;
      return !PLAIN_WRAPPED_UNARY_NAMES.has(field.name);
    case "formula":
    case "mrow": {
      const value = field.value;
      if (!Array.isArray(value)) return true;
      const hasLeft = value.some(
        (item) =>
          slotKind(item) === "unaryFunction" && (item as { name?: unknown }).name === "Left",
      );
      const hasRight = value.some(
        (item) =>
          slotKind(item) === "unaryFunction" && (item as { name?: unknown }).name === "Right",
      );
      return !(hasLeft && hasRight);
    }
    default:
      return true;
  }
}

/**
 * `BinaryFunction#latex_wrapped` (`binary_function.rb:159`) and
 * `TernaryFunction#latex_wrapped` (`ternary_function.rb:161`) — the same
 * answer from both homes: render the field, then brace it — with
 * `\left ( … \right )` inside when the field validates as a
 * function-formula. One helper, because the two gem methods are
 * byte-equivalent on this path (the precedent `wrapped` set on the asciimath
 * side). `Log` and the carrier default reach it through the binary home;
 * `Oint` through the ternary one (`Oint < TernaryFunction`).
 */
export function latexWrapped(
  field: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  const rendered = s(renderChild(field, context, at));
  if (isNode(field) && validateFunctionFormula(field)) {
    return `{ \\left ( ${rendered} \\right ) }`;
  }
  return `{${rendered}}`;
}

/**
 * `Utility.symbol_value(obj, "|")` (`utility.rb:202`): a `Paren::Vert`
 * instance, or any symbol whose stored value is `"|"`. Leaned on by `Td`
 * (`../../render/binary-function/latex.ts`), `Tr`
 * (`../../render/unary-function/latex.ts`) and the table column descriptors
 * (`../../render/table/latex.ts`).
 */
export function isPipeSymbol(value: unknown): boolean {
  if (!isNode(value) || value.kind !== "symbol") return false;
  return value.id === "Paren::Vert" || value.value === "|";
}

export function classBasename(rubyClass: string): string {
  return rubyClass.slice(rubyClass.lastIndexOf(":") + 1);
}

/**
 * Class names outside the AsciiMath-reachable set (the census carrier
 * projections, `src/generated/latex/render-tables.ts`) raise
 * `RenderError`: gem classes such as `Mbox` or `Menclose` carry their own
 * overrides this port has not measured, and a silent carrier-default render
 * would be a quiet divergence. Parity gaps fail loudly (ARCHITECTURE.md §5).
 */
export function unreachableName(kind: string, name: string): RenderError {
  return new RenderError(
    `No measured latex rendering for ${kind} name "${name}" — it is not ` +
      "reachable from the AsciiMath transform, and the gem class may override " +
      "to_latex. Rendering a carrier default instead would diverge silently.",
    FORMAT,
    kind,
  );
}
