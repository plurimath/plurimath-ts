/**
 * Opt-in Leptris input experiment. This source entry is intentionally absent
 * from the package exports: the native reader and public parsers stay the default.
 *
 * Initialize the caller's Leptris binding with `await init()` before creating
 * this adapter. No WASM package is imported or initialized here. Snapshots are
 * copied into the existing element layers and every loaded document is closed.
 *
 * Leptris owns XML well-formedness, encoding and whitespace semantics. The
 * native reader's Moxml named-entity marking stays here in the consumer: it is
 * applied before parsing, then restored only in text and ordinary attributes.
 * No fallback to the native reader occurs. Unexpected unexpanded entity nodes
 * are refused because the input translators have no entity-node contract.
 */

import { describeThrown } from "../core/errors";
import { type FormulaNode, ParseError } from "../core/index";
import { parseMml } from "../formats/mathml/mml";
import { translateMml } from "../formats/mathml/translator";
import { parseOmmlDocument } from "../formats/omml/omml-input";
import { translateOmml } from "../formats/omml/translator";
import { type XmlReadElement, XmlReadError, type XmlReadNode } from "../xml/index";
import { markEntities, restoreEntities } from "../xml/reader";

/** Structural contract of Leptris's detached tree snapshot. */
export interface LeptrisElement {
  readonly kind: "element";
  readonly name: string;
  readonly localName: string;
  readonly prefix: string | null;
  // biome-ignore lint/style/useNamingConvention: Leptris's public snapshot field.
  readonly namespaceURI: string | null;
  readonly attributes: readonly (readonly [name: string, value: string])[];
  readonly children: readonly LeptrisNode[];
}

export type LeptrisNode =
  | LeptrisElement
  | { readonly kind: "text" | "cdata" | "comment"; readonly text: string }
  | { readonly kind: "pi"; readonly target: string; readonly text: string }
  | { readonly kind: "entity"; readonly name: string };

/** Caller-owned, initialized binding; asynchronous methods are not used. */
export interface LeptrisSyncBinding {
  loadSync(input: string): number;
  treeSync(id: number): LeptrisElement;
  closeSync(id: number): void;
}

export function createLeptrisXmlReader(
  binding: LeptrisSyncBinding,
): (input: string) => XmlReadElement {
  return (input) => {
    const id = binding.loadSync(markEntities(input));
    try {
      return copyElement(binding.treeSync(id));
    } finally {
      binding.closeSync(id);
    }
  };
}

function copyElement(element: LeptrisElement): XmlReadElement {
  const attributes: (readonly [string, string])[] = [];
  const xmlns: (readonly [string, string])[] = [];
  for (const [name, value] of element.attributes) {
    if (name === "xmlns" || name.startsWith("xmlns:")) xmlns.push([name, value]);
    else attributes.push([name, restoreEntities(value)]);
  }
  return {
    kind: "element",
    name: element.name,
    prefix: element.prefix,
    namespace: element.namespaceURI,
    attributes,
    xmlns,
    children: element.children.map(copyNode),
  };
}

function copyNode(node: LeptrisNode): XmlReadNode {
  switch (node.kind) {
    case "element":
      return copyElement(node);
    case "text":
      return { kind: "text", text: restoreEntities(node.text) };
    case "cdata":
    case "comment":
      return { kind: node.kind, text: node.text };
    case "pi":
      return { kind: "pi", target: node.target, text: node.text };
    case "entity":
      throw new XmlReadError(`the experimental Leptris reader cannot expand entity &${node.name};`);
  }
}

/** Real formula parsing through Leptris; rendering uses the usual renderers. */
export function createLeptrisParsers(binding: LeptrisSyncBinding): {
  parseMathml(input: string): FormulaNode;
  parseOmml(input: string): FormulaNode;
} {
  const read = createLeptrisXmlReader(binding);
  return {
    parseMathml: (input) =>
      parse(input, "mathml", () => translateMml(parseMml(input, read), input)),
    parseOmml: (input) =>
      parse(input, "omml", () => translateOmml(parseOmmlDocument(input, read), input)),
  };
}

function parse(input: string, format: "mathml" | "omml", run: () => FormulaNode): FormulaNode {
  try {
    return run();
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(
      error instanceof Error ? error.message : describeThrown(error),
      input,
      format,
      0,
    );
  }
}
