import { SYMBOL_CANONICAL_VALUES } from "../../core/generated/symbol-canonical";
import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  ommlFormulaSlot,
  type RenderContext,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): XmlElement {
  const open = parenValue(node.parameterOne, "fenced.parameterOne");
  const close = parenValue(node.parameterThree, "fenced.parameterThree");
  const properties = new XmlElement("m:dPr").append(
    open === null
      ? null
      : new XmlElement("m:begChr").setAttribute("m:val", htmlEntityToUnicode(open)),
    new XmlElement("m:sepChr").setAttribute("m:val", ""),
    close === null
      ? null
      : new XmlElement("m:endChr").setAttribute("m:val", htmlEntityToUnicode(close)),
  );
  return new XmlElement("m:d").append(
    properties,
    ommlFormulaSlot(node.parameterTwo, "e", context, node.kind, "fenced.parameterTwo"),
  );
}

function parenValue(value: unknown, at: string): string | null {
  if (value === null || value === undefined) return null;
  if (!hasNodeKind(value)) {
    throw new RenderError(
      `${at}: cannot read a value from ${describeSlot(value)} — the gem raises NoMethodError here`,
      FORMAT,
      "fenced",
    );
  }

  const node = value as MathNode;
  switch (node.kind) {
    case "symbol":
      if (node.id.startsWith("Paren::")) {
        const canonical = SYMBOL_CANONICAL_VALUES.get(node.id);
        if (canonical !== undefined) return canonical;
        throw new RenderError(
          `${at}: named paren "${node.id}" is unknown to the oracle`,
          FORMAT,
          "fenced",
        );
      }
      return scalarValue(node.value, node.kind, at);
    case "number":
      return scalarValue(node.value, node.kind, at);
    case "text":
      return scalarValue(node.parameterOne, node.kind, at);
    case "formula":
    case "mrow":
    case "table":
      return compositeValue(node.value, node.kind, at);
    default:
      throw new RenderError(
        `${at}: a "${node.kind}" node has no value reader — the gem raises NoMethodError here`,
        FORMAT,
        "fenced",
      );
  }
}

function scalarValue(
  value: unknown,
  kind: "symbol" | "number" | "text",
  at: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new RenderError(
    `${at}: a "${kind}" node holds ${describeSlot(value)} that bypasses constructor normalization`,
    FORMAT,
    "fenced",
  );
}

function compositeValue(
  value: unknown,
  kind: "formula" | "mrow" | "table",
  at: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}: a "${kind}" node has ${describeSlot(value)} where the gem exposes a list`,
      FORMAT,
      "fenced",
    );
  }
  if (value.every((item) => item === null || typeof item === "string")) {
    return `[${value
      .map((item) => (item === null ? "nil" : rubyInspectString(item as string)))
      .join(", ")}]`;
  }
  if (value.some((item) => hasNodeKind(item))) {
    throw new RenderError(
      `${at}: holds a "${kind}" node whose value contains node objects with nondeterministic Ruby #inspect addresses`,
      FORMAT,
      "fenced",
    );
  }
  throw new RenderError(
    `${at}: a "${kind}" node has an unmeasured composite value`,
    FORMAT,
    "fenced",
  );
}

function rubyInspectString(value: string): string {
  let inspected = '"';
  for (let index = 0; index < value.length; ) {
    const codepoint = value.codePointAt(index) as number;
    const character = String.fromCodePoint(codepoint);
    const next = value[index + character.length];
    switch (character) {
      case '"':
        inspected += '\\"';
        break;
      case "\\":
        inspected += "\\\\";
        break;
      case "\u0007":
        inspected += "\\a";
        break;
      case "\b":
        inspected += "\\b";
        break;
      case "\t":
        inspected += "\\t";
        break;
      case "\n":
        inspected += "\\n";
        break;
      case "\v":
        inspected += "\\v";
        break;
      case "\f":
        inspected += "\\f";
        break;
      case "\r":
        inspected += "\\r";
        break;
      case "\u001b":
        inspected += "\\e";
        break;
      case "#":
        inspected += next === "{" || next === "@" || next === "$" ? "\\#" : "#";
        break;
      default:
        inspected +=
          codepoint < 0x20 || codepoint === 0x7f
            ? `\\u${codepoint.toString(16).toUpperCase().padStart(4, "0")}`
            : character;
    }
    index += character.length;
  }
  return `${inspected}"`;
}
