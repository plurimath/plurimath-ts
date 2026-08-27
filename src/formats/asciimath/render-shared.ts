/**
 * Shared semantics for the per-kind AsciiMath render files
 * (`../../render/<kind>/asciimath.ts`): the render context, the child-render
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

export const FORMAT = "asciimath";

/**
 * The render context. `table` is the one option axis the gem's asciimath path
 * reads — `Td` merges `table: true` into the options when rendering a
 * *formula* child, and `Symbols::Comma` alone reads it (`","` instead of `,`).
 * That axis and its variants come from the generated exception matrix, not
 * from code here.
 */
export interface RenderContext {
  readonly table: boolean;
  /**
   * `child.to_asciimath(options:)` — looks the child's kind up in the render
   * table (`./render.ts`) and renders it under THIS context. Returns `null`
   * exactly where the gem returns nil from `to_asciimath` — a bare
   * `FontStyle` with nothing in it — because callers observe that nil
   * (`Nary` falls back to `"int"` on it).
   */
  readonly render: (node: MathNode) => string | null;
  /**
   * The same dispatcher with the `table` axis on — the one context
   * derivation the asciimath path makes (`Td`, `td.rb:133-141`).
   */
  readonly withTable: RenderContext;
}

/** The data shape of one kind — what a per-kind render file takes. */
export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

/**
 * One render-table entry: the gem's `#to_asciimath` for one node kind.
 * `string | null` because one render in the gem answers nil (`fontStyle`);
 * every other entry narrows its own return to `string`.
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
 * A first/last non-whitespace index scan, not the regex pair it used to be:
 * an end-anchored `/[\0\t\n\v\f\r ]+$/` has no start anchor, so a long
 * INTERNAL whitespace run followed by a non-whitespace tail makes every
 * position in the run a retry point — quadratic, where Ruby's C-implemented
 * `strip` (`function/int.rb:37`, `function/oint.rb:36`, `function/prod.rb:46`, `function/sum.rb:47`) is linear.
 * Reachable end-to-end through `toAsciimath` on validator-passing trees (an
 * `int` whose third slot renders N internal spaces). The wall-clock test in
 * `test/formats/internal-whitespace-regression.spec.ts` guards this known
 * fixed-size regression; it does not establish an asymptotic complexity class.
 * Byte-behaviour is unchanged:
 * the scan trims exactly the leading and trailing runs of the same set.
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

/**
 * A strict `field.to_asciimath(options:)` call: only a node answers it.
 * Everything else — a bare string (which the gem's own parse of `""` or
 * `left(right)` puts into a formula's value), a list, a number, `null` where
 * Ruby wrote no `&.` — raises `NoMethodError` in the gem and `RenderError`
 * here. Returns `null` only where Ruby returns nil (see
 * `../../render/font-style/asciimath.ts`).
 */
export function renderChild(value: unknown, context: RenderContext, at: string): string | null {
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
 * A `value` slot the gem interpolates raw — `Number#to_asciimath`,
 * `Symbols::Symbol#to_asciimath`, and `Left`/`Right`'s
 * `"left#{parameter_one}"`, the renderer's direct interpolation sites. The
 * line is drawn where Ruby's `to_s` of the value is reproducible
 * byte-for-byte (probes probe-degenerate-value.rb and
 * probe-sweep-truthiness.rb on the pinned oracle, ruby 4.0.1):
 *
 *   - nil → `""`, a string → itself;
 *   - a boolean → `"true"`/`"false"` (number-true/number-false probes —
 *     `String()` matches exactly);
 *   - NaN and ±Infinity → `"NaN"`/`"Infinity"`/`"-Infinity"` — each the one
 *     JS number with exactly one Ruby preimage and an identical `to_s`;
 *   - a FINITE number raises: JS cannot witness Ruby's Integer/Float split
 *     (`Number.new(5)` → `"5"` but `Number.new(5.0)` → `"5.0"`, both the JS
 *     number 5), and the exponent forms differ (`1.0e+21` vs `"1e+21"`);
 *   - a hash renders `"{a: 1}"` in Ruby where `String()` says
 *     "[object Object]"; a node renders an unstable
 *     `"#<Plurimath::Math::Number:0x…>"` — both raise.
 *
 * The standing degenerate-input ruling makes every irreproducible shape a
 * loud `RenderError`, never silently divergent bytes — and every reproducible
 * one the gem's own bytes, never a loud error (class-for-class parity cuts
 * both ways).
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

/**
 * `BinaryFunction#wrapped` (`binary_function.rb:168`) and
 * `TernaryFunction#wrapped` with its default `type: "ascii"`
 * (`ternary_function.rb:170`) — the same answer from both homes: `""` for a
 * missing field, `(…)` otherwise. One helper, because the two gem methods are
 * byte-equivalent on this path; `Stackrel`'s override is its own
 * (`../../render/binary-function/asciimath.ts`).
 */
export function wrapped(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  if (!present(value)) return "";
  return `(${s(renderChild(value, context, at))})`;
}

export function classBasename(rubyClass: string): string {
  return rubyClass.slice(rubyClass.lastIndexOf(":") + 1);
}

/**
 * The walk's own missing-symbol throw, distinguishable from an imitation.
 *
 * `toAsciimath`'s boundary re-throws the symbol table's
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
 * `test/formats/asciimath/renderer.spec.ts`). The residue is narrower: an
 * input can still REPLAY a genuine instance — obtain one, say by rendering
 * a missing id itself, and re-throw it from a getter — and the boundary
 * passes it through as the walk's own; accepted with the pass-through pins
 * there, because the instance IS the walk's own throw, carrying exactly the
 * report it was minted with.
 *
 * The set lives HERE because this file is the one module both sides may
 * import (§3 rule 8): the throw site (`../../render/symbol/asciimath.ts`)
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
 * carriers that set is the AsciiMath-reachable one (the transform's
 * constructors, `src/generated/asciimath/transform-registry.ts`); the table
 * carrier's also holds its ten hand-buildable subclasses, measured beyond
 * the transform's reach. A name outside the set — `Mbox`, `Menclose`, ... —
 * may carry its own override this port has not measured, and a silent
 * carrier-default render would be a quiet divergence. Parity gaps fail
 * loudly (ARCHITECTURE.md §5).
 */
export function unreachableName(kind: string, name: string): RenderError {
  return new RenderError(
    `No measured asciimath rendering for ${kind} name "${name}" — it is not ` +
      "reachable from the AsciiMath transform, and the gem class may override " +
      "to_asciimath. Rendering a carrier default instead would diverge silently.",
    FORMAT,
    kind,
  );
}
