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
  readonly displaystyle: boolean;
  readonly insert: (node: MathNode) => OmmlRendered;
  readonly render: (node: MathNode) => OmmlRendered;
  readonly withDisplaystyle: (displaystyle: boolean) => RenderContext;
}

export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

export type RenderFn<K extends NodeKind> = (
  node: NodeOf<K>,
  context: RenderContext,
) => OmmlRendered;

/**
 * Ruby truthiness for the gem's bare `unless field` slot guards: only `nil`
 * and `false` are falsy, so `0` and `""` stay truthy. `undefined` spells the
 * same `nil` as `null` does on this side of the port.
 *
 * `Core#omml_parameter` guards with `return empty_tag(tag) unless field`, so
 * a `false` slot takes the placeholder path exactly as `nil` does — measured
 * on the oracle at `00c52783`, `Frac.new(false, Symbol.new("x"), {})` renders
 * `<m:num><m:r><m:t>&#8203;</m:t></m:r></m:num>` rather than raising.
 */
export function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

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

/** A direct base `Symbol`/abstract `Paren` value; named subclasses need generated data. */
export function baseSymbolValue(node: NodeOf<"symbol">, errorKind: string, at?: string): string {
  if (node.id !== "Symbol" && node.id !== "Paren") {
    const prefix = at === undefined ? "" : `${at}: `;
    throw new RenderError(
      `${prefix}Symbol "${node.id}" needs generated OMML data, deferred to the symbol-data follow-up`,
      FORMAT,
      errorKind,
    );
  }
  return requireString(node.value, errorKind, at === undefined ? "symbol.value" : `${at}.value`);
}

/** `Symbol#t_tag`/`nary_attr_value`: an explicit value wins over subclass output. */
export function symbolValueOrGenerated(
  node: NodeOf<"symbol">,
  errorKind: string,
  at?: string,
): string {
  if (node.value !== null && node.value !== undefined) {
    return requireString(node.value, errorKind, at === undefined ? "symbol.value" : `${at}.value`);
  }
  return baseSymbolValue(node, errorKind, at);
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

export function ommlSlot(
  value: unknown,
  tagName: string,
  context: RenderContext,
  kind: string,
  at: string,
): XmlElement {
  const tag = new XmlElement(`m:${tagName}`);
  // `Core#omml_parameter` reads `return empty_tag(tag) unless field` — Ruby-falsy,
  // so a `false` slot takes the placeholder path exactly as `nil` does.
  if (!rubyTruthy(value)) return tag.append(plainRun("&#8203;"));
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      tag.append(insertSlotItem(item, context, kind, `${at}[${index}]`));
    });
    return tag;
  }
  return tag.append(insertSlotItem(value, context, kind, at));
}

function insertSlotItem(
  value: unknown,
  context: RenderContext,
  kind: string,
  at: string,
): OmmlRendered {
  if (hasNodeKind(value)) return insertChild(value, context, at);
  throw new RenderError(
    `${at}: cannot insert ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    kind,
  );
}

type FixedNaryNode = NodeOf<"int"> | NodeOf<"oint"> | NodeOf<"prod"> | NodeOf<"sum">;
type LimitKind = "obrace" | "overset" | "ubrace" | "underset";

export function renderFixedNary(
  node: FixedNaryNode,
  context: RenderContext,
  operator: string,
  limitLocation: "subSup" | "undOvr",
  emptyEntity: string,
): XmlElement {
  if (
    !rubyTruthy(node.parameterOne) &&
    !rubyTruthy(node.parameterTwo) &&
    !rubyTruthy(node.parameterThree)
  ) {
    return plainRun(emptyEntity);
  }

  const properties = new XmlElement("m:naryPr").append(
    // `hide_function_name ? "" : "∑"` in the gem: Ruby-falsy, so `0` and `""`
    // suppress the operator there and must suppress it here too.
    new XmlElement("m:chr").setAttribute(
      "m:val",
      rubyTruthy(node.hideFunctionName) ? "" : operator,
    ),
    new XmlElement("m:limLoc").setAttribute("m:val", limitLocation),
    new XmlElement("m:subHide").setAttribute("m:val", rubyTruthy(node.parameterOne) ? "0" : "1"),
    new XmlElement("m:supHide").setAttribute("m:val", rubyTruthy(node.parameterTwo) ? "0" : "1"),
  );

  return new XmlElement("m:nary").append(
    properties,
    ommlSlot(node.parameterOne, "sub", context, node.kind, `${node.kind}.parameterOne`),
    ommlSlot(node.parameterTwo, "sup", context, node.kind, `${node.kind}.parameterTwo`),
    ommlSlot(node.parameterThree, "e", context, node.kind, `${node.kind}.parameterThree`),
  );
}

export function renderLimit(
  kind: LimitKind,
  position: "Low" | "Upp",
  base: unknown,
  limit: unknown,
  context: RenderContext,
): XmlElement {
  const name = `lim${position}`;
  return new XmlElement(`m:${name}`).append(
    new XmlElement(`m:${name}Pr`).append(controlProperties()),
    ommlSlot(base, "e", context, kind, `${kind}.parameterOne`),
    ommlSlot(limit, "lim", context, kind, `${kind}.parameterTwo`),
  );
}

export function renderOverUnder(
  kind: "overset" | "underset",
  position: "Low" | "Upp",
  base: unknown,
  limit: unknown,
  context: RenderContext,
): XmlElement {
  if (context.displaystyle) return renderLimit(kind, position, base, limit, context);

  const name = position === "Upp" ? "sSup" : "sSub";
  const scriptSlot = position === "Upp" ? "sup" : "sub";
  return new XmlElement(`m:${name}`).append(
    structuralProperties(name),
    ommlSlot(base, "e", context, kind, `${kind}.parameterOne`),
    ommlSlot(limit, scriptSlot, context, kind, `${kind}.parameterTwo`),
  );
}

export function rubyTruthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
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
