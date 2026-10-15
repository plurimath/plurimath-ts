/**
 * Consumer-side Leptris XML adapter. The caller supplies an initialized binding;
 * this module never imports a Leptris runtime or initializes WASM.
 *
 * Moxml entity marking belongs to Plurimath and stays in this consumer layer.
 * XML well-formedness, whitespace and encoding semantics belong to Leptris.
 * Each successfully loaded document is closed, including on snapshot failure.
 */
import {
  markEntities,
  restoreEntities,
  type XmlReadElement,
  XmlReadError,
  type XmlReadNode,
} from "./reader";

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
      throw new XmlReadError(`the Leptris reader cannot expand entity &${node.name};`);
  }
}
