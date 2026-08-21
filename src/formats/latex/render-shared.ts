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

import {
  type MathNode,
  MissingSymbolDataError,
  type NodeKind,
  type NodeParameter,
  RenderError,
} from "../../core/index";
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

/**
 * The code units Ruby's `String#strip` removes: NUL, TAB, LF, VT, FF, CR,
 * SPACE — `[\0\t\n\v\f\r ]`, never the no-break space (every member is one
 * BMP code unit, so `charCodeAt` sees each exactly).
 */
function isRubyStripCode(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0;
}

/**
 * Ruby `String#strip`: exactly `[\0\t\n\v\f\r ]`, never the no-break space.
 *
 * A first/last non-whitespace index scan, not the regex pair it used to be
 * (the latex mirror of PR #10 review finding 1 on the asciimath side): an
 * end-anchored `/[\0\t\n\v\f\r ]+$/` has no start anchor, so a long
 * INTERNAL whitespace run followed by a non-whitespace tail makes every
 * position in the run a retry point — quadratic, where Ruby's C-implemented
 * `strip` (`function/int.rb:43`, `function/oint.rb:48`, `function/prod.rb:52`, `function/sum.rb:53`) is linear.
 * Reachable end-to-end through `toLatex` on validator-passing trees (an
 * `int` whose third slot renders N internal spaces), so the complexity class
 * is part of the hostile-input posture, pinned by the wall-clock test in
 * `test/formats/latex/renderer.spec.ts`. Byte-behaviour is unchanged: the
 * scan trims exactly the leading and trailing runs of the same set.
 */
export function rubyStrip(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isRubyStripCode(text.charCodeAt(start))) start += 1;
  while (end > start && isRubyStripCode(text.charCodeAt(end - 1))) end -= 1;
  return start === 0 && end === text.length ? text : text.slice(start, end);
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
  // Explicit, because the article fallback would say "a object" (the
  // c9d4034 pattern in core's describeValue). Undefined and null are the
  // first branch: both read "nil", the Ruby value they stand in for.
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/**
 * A `value` slot the gem renders raw — `Number#to_latex` (the TextRenderer
 * path) and `Symbols::Symbol#to_latex` (the raw ivar, interpolated by the
 * caller), plus `Color`'s number branch (whose asciimath ride is the same
 * TextRenderer). The line is drawn where Ruby's spelling of the value is
 * reproducible byte-for-byte, probed PER SITE on the gem's latex path
 * (probe-latex-degenerate.rb on the pinned oracle, 2026-08-10, ruby 4.0.1 —
 * never assumed equal to the asciimath answer):
 *
 *   - nil → `""`, a string → itself;
 *   - a boolean → `"true"`/`"false"` (number-true/number-false probes;
 *     formula-symbol-forced-true joins "true y" — `String()` matches
 *     exactly);
 *   - NaN and ±Infinity → `"NaN"`/`"Infinity"`/`"-Infinity"` — each the one
 *     JS number with exactly one Ruby preimage and an identical `to_s`;
 *   - a FINITE number raises: JS cannot witness Ruby's Integer/Float split
 *     (`Number.new(5)` → `"5"` but `Number.new(5.0)` → `"5.0"`, both the JS
 *     number 5), and the exponent forms differ (`"1.0e+21"` vs `"1e+21"`);
 *   - a hash renders `"{a: 1}"` in Ruby where `String()` says
 *     "[object Object]"; a node renders an unstable
 *     `"#<Plurimath::Math::Number:0x…>"` — both raise.
 *
 * The latex path's OTHER raw-value reads do NOT come here: `Fenced`'s
 * non-paren slots and `Color`'s top-level symbol branch crash in the gem on
 * exactly the shapes admitted above (`latex_paren` sends `include?`, the
 * color strip sends `gsub` — NoMethodError for booleans, floats, and
 * nodes), so those sites carry their own strict guards in their kind files.
 *
 * The standing degenerate-input ruling makes every irreproducible shape a
 * loud `RenderError`, never silently divergent bytes — and every
 * reproducible one the gem's own bytes, never a loud error
 * (class-for-class parity cuts both ways).
 *
 * The shape validator cannot reject the raising shapes at entry without
 * restating slot types per kind — a plain hash IS legal in other slots
 * (`Mglyph` defaults `parameter_one` to `{}`), which is why the guard lives
 * at the interpolation sites.
 */
export function interpolatedValue(value: unknown, kind: string, at: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  throw new RenderError(
    `${at}: holds ${describeSlot(value)} — no gem parse puts one here, and Ruby's ` +
      `interpolation of it is bytes String() cannot reliably match`,
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
 * the brace/accent shapes (`function/obrace.rb:40`, `function/ubrace.rb:48`, `function/hat.rb:40`,
 * `function/tilde.rb:36`), `Left`/`Right` (`left.rb:38`, `right.rb:38`), the 27 plain
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
 * The walk's own missing-symbol throw, distinguishable from an imitation.
 *
 * `toLatex`'s boundary re-throws the symbol table's
 * `MissingSymbolDataError` (a public error code in its own right) while
 * wrapping every other mid-walk throw into `RenderError` — but `instanceof`
 * is a test the INPUT can pass too: a hostile getter that answered
 * validation's read can throw its own `MissingSymbolDataError` mid-render
 * and forge the pass-through, reporting MISSING_SYMBOL_DATA for what is an
 * input failure. So the genuine throw site records its instances in this
 * module-private `WeakSet`, and the boundary passes through members only.
 * The mark is membership, never state on the instance: a symbol PROPERTY
 * was discoverable — `Object.getOwnPropertySymbols` on a caught genuine
 * error handed the input the key to copy onto a forgery — where set
 * membership cannot be read off, minted, or transplanted (pinned: a genuine
 * error's own symbols are `[]`, and the copy-everything forgery wraps —
 * `test/formats/latex/renderer.spec.ts`). The residue is narrower: an
 * input can still REPLAY a genuine instance — obtain one, say by rendering
 * a missing id itself, and re-throw it from a getter — and the boundary
 * passes it through as the walk's own; accepted with the pass-through pins
 * there, because the instance IS the walk's own throw, carrying exactly the
 * report it was minted with.
 *
 * The set lives HERE because this file is the one module both sides may
 * import (§3 rule 8): the throw site (`../../render/symbol/latex.ts`)
 * reaches only core, its generated data, this file, and sibling kind files;
 * the boundary (`./renderer.ts`) stands on this file already. Core cannot
 * hold it — `src/index.ts` star-re-exports the core barrel, so a factory
 * there would land on the public surface, and a per-format boundary policy
 * is not layer-1 vocabulary. A WeakSet never serializes, never widens the
 * public error type, and holds weakly — a caught-and-dropped error stays
 * collectable.
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
 * Class names outside a carrier's measured set raise `RenderError`. For most
 * carriers that set is the AsciiMath-reachable one (the census carrier
 * projections, `src/generated/latex/render-tables.ts`); the table, fontStyle
 * and formula carriers' sets also hold their hand-buildable subclasses,
 * measured beyond the transform's reach (the full gem sets — 10, 14 and 1,
 * enumeration-probed complete, probe-latex-name-guards.rb 2026-08-10). A
 * name outside the set — `Mbox`, `Menclose`, ... — may carry its own
 * override this port has not measured, and a silent carrier-default render
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
