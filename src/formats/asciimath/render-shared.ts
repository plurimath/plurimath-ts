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

import { type MathNode, type NodeKind, type NodeParameter, RenderError } from "../../core/index";
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
  return `a ${typeof value}`;
}

/**
 * A `value` slot the gem interpolates raw — `Number#to_asciimath` and
 * `Symbols::Symbol#to_asciimath`, the renderer's only two direct
 * interpolation sites. Nil → `""`, a string → itself; nothing else, because
 * no gem parse puts anything else there and `String()` cannot reproduce
 * Ruby's `to_s` of it (probe probe-degenerate-value.rb on the pinned oracle,
 * ruby 4.0.1: a hash value renders `"{a: 1}"` where `String()` says
 * "[object Object]"; a node value renders an unstable
 * `"#<Plurimath::Math::Number:0x…>"`). The standing degenerate-input ruling
 * makes such shapes a loud `RenderError`, never silently divergent bytes.
 *
 * The shape validator cannot reject these at entry without restating slot
 * types per kind — a plain hash IS legal in other slots (`Mglyph` defaults
 * `parameter_one` to `{}`), which is why the guard lives at the two sites.
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
 * Class names outside the AsciiMath-reachable set (the transform's
 * constructors, `src/generated/asciimath/transform-registry.ts`) raise
 * `RenderError`: gem classes such as `Mbox` or `Menclose` carry their own
 * overrides this port has not measured, and a silent carrier-default render
 * would be a quiet divergence. Parity gaps fail loudly (ARCHITECTURE.md §5).
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
