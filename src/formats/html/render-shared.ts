import {
  hasNodeKind,
  type MathNode,
  MissingSymbolDataError,
  type NodeKind,
  RenderError,
} from "../../core/index";

export const FORMAT = "html";

export interface RenderContext {
  readonly render: (node: MathNode) => string | null;
}

export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

export type RenderFn<K extends NodeKind> = (
  node: NodeOf<K>,
  context: RenderContext,
) => string | null;

/** Ruby truthiness for the carriers' slot guards. */
export function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** Ruby interpolation turns nil into an empty string. */
export function s(value: string | null): string {
  return value ?? "";
}

export function describeSlot(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/** A strict `child.to_html(options: {})` call. */
export function renderChild(value: unknown, context: RenderContext, at: string): string | null {
  if (hasNodeKind(value)) return context.render(value as MathNode);
  throw new RenderError(
    `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

/** Binary/Ternary slot rendering: call `to_html` on the slot itself. */
export function renderCarrierSlot(value: unknown, context: RenderContext, at: string): string {
  if (!present(value)) return "";
  return `<i>${s(renderChild(value, context, at))}</i>`;
}

/** Unary slot rendering: arrays render each member and join with no separator. */
export function renderUnarySlot(value: unknown, context: RenderContext, at: string): string {
  if (!present(value)) return "";
  if (!Array.isArray(value)) return renderCarrierSlot(value, context, at);
  const rendered = value
    .map((item, index) => s(renderChild(item, context, `${at}[${index}]`)))
    .join("");
  return `<i>${rendered}</i>`;
}

/**
 * Raw value rendering where JavaScript can reproduce Ruby's spelling.
 * Finite numbers refuse because one JS number cannot distinguish Ruby's
 * Integer `5` from Float `5.0`.
 */
export function interpolatedValue(value: unknown, kind: string, at: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  throw new RenderError(
    `${at}: holds ${describeSlot(value)} whose Ruby spelling cannot be reproduced reliably`,
    FORMAT,
    kind,
  );
}

/** The Ruby class basename — `Math::Symbols::Sigma` is `Sigma`. */
export function classBasename(rubyClass: string): string {
  return rubyClass.slice(rubyClass.lastIndexOf(":") + 1);
}

/**
 * The walk's own missing-symbol throw, distinguishable from an imitation.
 *
 * `toHtml`'s boundary re-throws the symbol table's `MissingSymbolDataError`
 * (a public error code in its own right) while wrapping every other mid-walk
 * throw into `RenderError` — but `instanceof` is a test the INPUT can pass
 * too: a hostile getter that answered validation's read can throw its own
 * `MissingSymbolDataError` mid-render and forge the pass-through, reporting
 * MISSING_SYMBOL_DATA for what is an input failure. So the genuine throw site
 * records its instances in this module-private `WeakSet`, and the boundary
 * passes through members only. One set per format, because each format's
 * boundary vouches only for its own throw sites — the rationale in full is in
 * `../latex/render-shared.ts`, whose set this mirrors.
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
