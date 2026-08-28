import { SYMBOL_CANONICAL_VALUES } from "../../core/generated/symbol-canonical";
import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { rubyNumberToS } from "../../core/ruby-semantics";
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
  if (Array.isArray(value) || typeof value === "object") {
    return deterministicRubyInspect(value, kind, at);
  }
  throw new RenderError(
    `${at}: a "${kind}" node holds ${describeSlot(value)}; the gem sends include? to it and raises NoMethodError here`,
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
  return deterministicRubyInspect(value, kind, at);
}

function deterministicRubyInspect(
  value: unknown,
  kind: "symbol" | "number" | "text" | "formula" | "mrow" | "table",
  at: string,
): string {
  if (containsNodeObject(value)) {
    throw new RenderError(
      `${at}: holds a "${kind}" node whose value contains node objects with nondeterministic Ruby #inspect addresses`,
      FORMAT,
      "fenced",
    );
  }
  return rubyInspect(value, kind, at);
}

function containsNodeObject(value: unknown, seen = new Set<object>()): boolean {
  if (hasNodeKind(value)) return true;
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return children.some((child) => containsNodeObject(child, seen));
}

function rubyInspect(
  value: unknown,
  kind: "symbol" | "number" | "text" | "formula" | "mrow" | "table",
  at: string,
): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return rubyInspectString(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    const printed = rubyNumberToS(value);
    if (printed !== null) return printed;
    throw new RenderError(
      `${at}: a "${kind}" node contains the number ${String(value)}, whose Ruby #inspect spelling this port cannot reproduce`,
      FORMAT,
      "fenced",
    );
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => rubyInspect(item, kind, at)).join(", ")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${rubyInspectString(key)} => ${rubyInspect(item, kind, at)}`)
      .join(", ")}}`;
  }
  throw new RenderError(
    `${at}: a "${kind}" node contains ${describeSlot(value)}, which has no measured Ruby #inspect spelling`,
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
