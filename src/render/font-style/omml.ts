import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type OmmlRendered,
  type RenderContext,
  symbolValueOrGenerated,
  textElement,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

interface FontProperties {
  readonly sty: string | null;
  readonly scr: string | null;
}

/** Measured per Ruby subclass; no value is derived from the class name. */
const FONT_PROPERTIES: ReadonlyMap<string, FontProperties> = new Map([
  ["Bold", { sty: "b", scr: null }],
  ["BoldFraktur", { sty: "b", scr: "fraktur" }],
  ["BoldItalic", { sty: "bi", scr: null }],
  ["BoldSansSerif", { sty: "b", scr: "sans-serif" }],
  ["BoldScript", { sty: "b", scr: "script" }],
  ["DoubleStruck", { sty: null, scr: "double-struck" }],
  ["Fraktur", { sty: "p", scr: "fraktur" }],
  ["Italic", { sty: "i", scr: null }],
  ["Monospace", { sty: null, scr: "monospace" }],
  ["Normal", { sty: "p", scr: null }],
  ["SansSerif", { sty: "p", scr: "sans-serif" }],
  ["SansSerifBoldItalic", { sty: "bi", scr: "sans-serif" }],
  ["SansSerifItalic", { sty: "i", scr: "sans-serif" }],
  ["Script", { sty: "p", scr: "script" }],
]);

const CARRIER_PROPERTIES: FontProperties = { sty: "p", scr: null };

export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): OmmlRendered {
  const properties = fontProperties(node);
  if (node.parameterOne === null || node.parameterOne === undefined) {
    return styledRun(properties);
  }
  if (Array.isArray(node.parameterOne)) {
    throw new RenderError(
      "fontStyle.parameterOne: cannot apply font style to a list — the gem raises " +
        "NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  if (!hasNodeKind(node.parameterOne)) {
    throw new RenderError(
      `fontStyle.parameterOne: cannot apply font style to ${describeSlot(node.parameterOne)} — ` +
        "the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }

  const parameter = node.parameterOne as MathNode;
  const child =
    parameter.kind === "symbol"
      ? textElement(symbolValueOrGenerated(parameter, node.kind, "fontStyle.parameterOne"))
      : context.render(parameter);
  const children = flattenRendered(child);
  if (children.length === 0) return styledRun(properties);
  if (children.every((value) => typeof value === "string" || value.name === "m:t")) {
    return styledRun(properties).append(children);
  }
  return children.map((value) => styleRendered(value, properties));
}

function fontProperties(node: NodeOf<"fontStyle">): FontProperties {
  if (node.name === undefined) return CARRIER_PROPERTIES;
  const measured = FONT_PROPERTIES.get(node.name);
  if (measured !== undefined) return measured;
  throw new RenderError(
    `FontStyle alias "${node.name}" has not been measured for OMML`,
    FORMAT,
    node.kind,
  );
}

function runProperties(properties: FontProperties): XmlElement {
  return new XmlElement("m:rPr").append(
    properties.scr === null ? null : new XmlElement("m:scr").setAttribute("m:val", properties.scr),
    properties.sty === null ? null : new XmlElement("m:sty").setAttribute("m:val", properties.sty),
  );
}

function styledRun(properties: FontProperties): XmlElement {
  return new XmlElement("m:r").append(runProperties(properties));
}

function flattenRendered(rendered: OmmlRendered): (XmlElement | string)[] {
  const flattened: (XmlElement | string)[] = [];
  const visit = (value: OmmlRendered): void => {
    if (value === null) return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    flattened.push(value as XmlElement | string);
  };
  visit(rendered);
  return flattened;
}

function styleRendered(
  value: XmlElement | string,
  properties: FontProperties,
): XmlElement | string {
  if (typeof value === "string") return value;
  if (value.name === "m:t") return styledRun(properties).append(value);
  if (value.name === "m:r") {
    const hasProperties = value.children.some(
      (child) => child instanceof XmlElement && child.name === "m:rPr",
    );
    if (hasProperties) return value;
    return copyElement(value, [runProperties(properties), ...value.children]);
  }
  return copyElement(
    value,
    value.children.map((child) =>
      child instanceof XmlElement ? styleRendered(child, properties) : child,
    ),
  );
}

function copyElement(element: XmlElement, children: readonly (XmlElement | string)[]): XmlElement {
  return new XmlElement(element.name).setAttributes(element.attributes).append(children);
}
