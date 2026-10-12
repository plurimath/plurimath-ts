/**
 * The OMML element layer: a document read into the elements, attributes and
 * text the input translator (`./translator.ts`) works from.
 *
 * Written from OMML's own element and attribute semantics (ECMA-376 Part 1,
 * §22.1), over the generic tree an XML reader returns. It reads element,
 * attribute and text nodes only, so the XML reader underneath can be swapped
 * without touching it.
 *
 * - The root must be `oMathPara` or `oMath` in the OMML math namespace;
 *   anything else is refused.
 * - Elements count when they are in the math namespace or in the
 *   WordprocessingML namespace (the run properties and run content Word puts
 *   inside `m:r`). Elements in any other namespace are skipped with their
 *   content.
 * - An element is named by a fixed prefix for its namespace (`m:r`, `w:rPr`),
 *   whatever prefix the document used.
 * - Attributes are kept when they resolve to the math or WordprocessingML
 *   namespace, under the same fixed prefix (`m:val`, `w:val`); OMML's
 *   attributes are all namespace-qualified, so others are skipped.
 * - A text element's (`m:t`, `w:t`) `text` is its text and CDATA nodes joined
 *   in order. Other elements keep no text.
 * - Children keep document order.
 *
 * Where this differs from the Ruby gem, which reads OMML through the omml
 * gem's lutaml-model mapping, the differences are deliberate and confined to
 * input outside ordinary OMML. Each is listed in `OMML_INPUT_DIFFERENCES`
 * below, and none occurs in the pinned corpus.
 */

import { readXml, type XmlReadElement, XmlReadError } from "../../xml/index";

export const MATH_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/math";
export const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const PREFIXES: ReadonlyMap<string, string> = new Map([
  [MATH_NAMESPACE, "m"],
  [WORD_NAMESPACE, "w"],
]);

export interface OmmlNode {
  /** The element under its fixed prefix: `m:oMath`, `m:r`, `w:rPr`. */
  readonly kind: string;
  /** Math and WordprocessingML attributes under their fixed prefix (`m:val`). */
  readonly attributes: ReadonlyMap<string, string>;
  /** A text element's (`m:t`, `w:t`) text. Absent on other elements. */
  readonly text?: string;
  /** Child elements, in document order. */
  readonly children: readonly OmmlNode[];
}

/** The document is not an OMML expression. */
export class OmmlParseError extends Error {
  override readonly name = "OmmlParseError";
}

const TEXT_ELEMENTS: ReadonlySet<string> = new Set(["m:t", "w:t"]);

/**
 * How this layer departs from the gem's `Omml.parse` (omml 0.2.5 over
 * lutaml-model), each measured against the oracle. None of these occurs in the
 * pinned corpus; all of them concern input outside ordinary OMML.
 */
export const OMML_INPUT_DIFFERENCES: readonly (readonly [string, string])[] = [
  [
    "Text split by CDATA or a comment is one string: `<m:t>a<!--x-->b</m:t>` is `ab`.",
    "The gem's mapping reads the pieces as a list and the translator stringifies it, so " +
      'the text becomes `["a", "b"]`. In XML both are one run of character data.',
  ],
  [
    "Attributes are matched by namespace, not by local name.",
    "OMML attributes are namespace-qualified (`m:val`); an attribute in another namespace " +
      "is not one of them.",
  ],
  [
    "A font style left with no text after it (a run whose properties give one font class " +
      "and no text, or properties after its text) is dropped.",
    "The gem puts the font style's Ruby class itself into the model (a class, not a " +
      "node), which no format can render. A run whose two property blocks both give a font " +
      "class and no text is unaffected: both implementations build the first style with no " +
      "content.",
  ],
  [
    "A run's math (`m:rPr`) and Word (`w:rPr`) properties are read in document order.",
    "The gem matches both by the local name `rPr`, so it always reads the math one first, " +
      "and a run with Word's first takes its font from the math properties.",
  ],
  [
    "An element is read by namespace: a math-namespace `m:proofErr` or `m:sym` is skipped.",
    "The gem matches elements by local name, so it reads those as the WordprocessingML " +
      "elements of the same name and then refuses them as unsupported nodes.",
  ],
];

/** Reads an OMML document. Throws `OmmlParseError` when it is not one. */
export function parseOmmlDocument(text: string): OmmlNode {
  let root: XmlReadElement;
  try {
    root = readXml(text);
  } catch (error) {
    if (error instanceof XmlReadError) throw new OmmlParseError(error.message);
    throw error;
  }
  const scope = declare(new Map(), root);
  const kind = kindOf(root);
  if (kind !== "m:oMathPara" && kind !== "m:oMath") {
    throw new OmmlParseError("the document's root is not an OMML oMathPara or oMath element");
  }
  return build(root, kind, scope);
}

function localName(element: XmlReadElement): string | null {
  const { name, prefix } = element;
  if (name === null) return null;
  return prefix === null || prefix === "" ? name : name.slice(prefix.length + 1);
}

function kindOf(element: XmlReadElement): string | null {
  const prefix = element.namespace === null ? undefined : PREFIXES.get(element.namespace);
  const name = localName(element);
  return prefix === undefined || name === null ? null : `${prefix}:${name}`;
}

/** The in-scope prefix -> namespace map below `element`. */
function declare(
  outer: ReadonlyMap<string, string>,
  element: XmlReadElement,
): ReadonlyMap<string, string> {
  if (element.xmlns.length === 0) return outer;
  const scope = new Map(outer);
  for (const [name, value] of element.xmlns) {
    if (name.startsWith("xmlns:")) scope.set(name.slice("xmlns:".length), value);
  }
  return scope;
}

function build(
  element: XmlReadElement,
  kind: string,
  scope: ReadonlyMap<string, string>,
): OmmlNode {
  const children: OmmlNode[] = [];
  const texts: string[] = [];
  for (const node of element.children) {
    if (node.kind === "text" || node.kind === "cdata") {
      texts.push(node.text);
      continue;
    }
    if (node.kind !== "element") continue;
    const childKind = kindOf(node);
    if (childKind === null) continue;
    children.push(build(node, childKind, declare(scope, node)));
  }
  const attributes = readAttributes(element, scope);
  return TEXT_ELEMENTS.has(kind)
    ? { kind, attributes, text: texts.join(""), children }
    : { kind, attributes, children };
}

function readAttributes(
  element: XmlReadElement,
  scope: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of element.attributes) {
    const colon = name.indexOf(":");
    if (colon < 0) continue;
    const namespace = scope.get(name.slice(0, colon));
    const prefix = namespace === undefined ? undefined : PREFIXES.get(namespace);
    if (prefix !== undefined) out.set(`${prefix}:${name.slice(colon + 1)}`, value);
  }
  return out;
}
