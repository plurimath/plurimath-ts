import { hasNodeKind, type MathNode, type NodeKind, RenderError } from "../../core/index";

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
