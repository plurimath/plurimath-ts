import {
  hasNodeKind,
  type MathNode,
  type NodeKind,
  type NodeParameter,
  RenderError,
} from "../../core/index";
import { dumpNodes, XmlElement } from "../../xml/index";

export const FORMAT = "omml";

export type OmmlRendered = XmlElement | string | null | readonly OmmlRendered[];

export interface RenderContext {
  readonly insert: (node: MathNode) => OmmlRendered;
  readonly render: (node: MathNode) => OmmlRendered;
}

export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

export type RenderFn<K extends NodeKind> = (
  node: NodeOf<K>,
  context: RenderContext,
) => OmmlRendered;

export function describeSlot(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

export function renderChild(value: unknown, context: RenderContext, at: string): OmmlRendered {
  if (hasNodeKind(value)) return context.render(value as MathNode);
  throw new RenderError(
    `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

export function insertChild(value: unknown, context: RenderContext, at: string): OmmlRendered {
  if (hasNodeKind(value)) return context.insert(value as MathNode);
  throw new RenderError(
    `${at}: cannot insert ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

export function requireNodeList(
  value: unknown,
  kind: string,
  at: string,
): readonly NodeParameter[] {
  if (Array.isArray(value)) return value;
  throw new RenderError(
    `${at}: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
    FORMAT,
    kind,
  );
}

export function requireString(value: unknown, kind: string, at: string): string {
  if (typeof value === "string") return value;
  throw new RenderError(
    `${at}: holds ${describeSlot(value)}, not a measured string value`,
    FORMAT,
    kind,
  );
}

export function requireEmptyOptions(value: unknown, kind: string, at: string): void {
  if (value === null || value === undefined) return;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  ) {
    return;
  }
  throw new RenderError(
    `${at}: only the measured empty options hash is implemented in this slice`,
    FORMAT,
    kind,
  );
}

/** An explicit Symbol value, or generated data for a valueless named subclass. */
export function baseSymbolValue(node: NodeOf<"symbol">, errorKind: string, at?: string): string {
  const valueAt = at === undefined ? "symbol.value" : `${at}.value`;
  if (node.value !== null && node.value !== undefined) {
    return requireString(node.value, errorKind, valueAt);
  }
  if (node.id !== "Symbol" && node.id !== "Paren") {
    const prefix = at === undefined ? "" : `${at}: `;
    throw new RenderError(
      `${prefix}Symbol "${node.id}" needs generated OMML data, deferred to the symbol-data follow-up`,
      FORMAT,
      errorKind,
    );
  }
  return requireString(node.value, errorKind, valueAt);
}

export function textElement(value: string): XmlElement {
  return new XmlElement("m:t").append(value);
}

export function plainRun(value: string): XmlElement {
  return new XmlElement("m:r").append(textElement(value));
}

export function wordRunProperties(italic: boolean): XmlElement {
  const fonts = new XmlElement("w:rFonts").setAttributes(
    new Map([
      ["w:ascii", "Cambria Math"],
      ["w:hAnsi", "Cambria Math"],
    ]),
  );
  return new XmlElement("w:rPr").append(fonts, italic ? new XmlElement("w:i") : null);
}

export function controlProperties(): XmlElement {
  return new XmlElement("m:ctrlPr").append(wordRunProperties(true));
}

export function structuralProperties(name: string): XmlElement {
  return new XmlElement(`m:${name}Pr`).append(controlProperties());
}

export function ommlParameter(
  value: unknown,
  tagName: string,
  context: RenderContext,
  kind: string,
  at: string,
): XmlElement {
  if (!hasNodeKind(value)) {
    throw new RenderError(
      `${at}: only the measured node-valued parameter is implemented in this slice`,
      FORMAT,
      kind,
    );
  }
  return new XmlElement(`m:${tagName}`).append(insertChild(value, context, at));
}

export function requireElement(
  rendered: OmmlRendered,
  kind: string,
  at: string,
  name?: string,
): XmlElement {
  if (rendered instanceof XmlElement && (name === undefined || rendered.name === name)) {
    return rendered;
  }
  throw new RenderError(
    `${at}: did not render the measured ${name ?? "element"} shape`,
    FORMAT,
    kind,
  );
}

/** `Core#dump_ox_nodes`: flatten arrays and dump each element independently. */
export function serializeRendered(rendered: OmmlRendered): string {
  const parts: string[] = [];
  const visit = (value: OmmlRendered): void => {
    if (value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (typeof value === "string") {
      parts.push(value);
    } else {
      parts.push(dumpNodes(value as XmlElement));
    }
  };
  visit(rendered);
  return parts.join("");
}
