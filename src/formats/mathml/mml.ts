/**
 * The MathML element layer: a document read into the elements, attributes and
 * text the translator (`./translator.ts`) works from.
 *
 * Written from MathML's own element and attribute semantics, over the generic
 * tree an XML reader returns. It reads element, attribute and text nodes only,
 * so the XML reader underneath can be swapped without touching it.
 *
 * - The root must be a `math` element; anything else is refused.
 * - An element counts when it is in the MathML namespace or in no namespace
 *   (a document without `xmlns`). Elements in other namespaces, and MathML
 *   elements the translator has no rule for, are skipped with their content.
 * - Attributes are MathML's when unprefixed (MathML attributes are in no
 *   namespace); prefixed ones (`xlink:href`, `ext:mathvariant`) are skipped.
 *   They are kept as strings. `index` and `length` are
 *   non-negative integers in MathML and are kept as numbers when they are
 *   written as plain decimal integers.
 * - A token element's (`mi`, `mn`, `mo`, `mtext`, `ms`, `annotation`) `value`
 *   is its text nodes in order; CDATA is text.
 * - Children keep document order, text included; the translator decides what
 *   blank text means.
 *
 * Where this differs from the Ruby gem, which reads MathML through the mml
 * gem's lutaml-model mapping, the differences are deliberate and confined to
 * input outside ordinary MathML. Each is listed in `MATHML_INPUT_DIFFERENCES`
 * below, and none occurs in the pinned corpus.
 */

import { readXml, type XmlReadElement, XmlReadError } from "../../xml/index";

const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";

/** One node of the tree: an element, or a text child. */
export type MmlChild = MmlNode | string;

export interface MmlNode {
  /** The element, as the translator names it (`Mi`, `Mrow`, `AnnotationXml`). */
  readonly kind: string;
  /** Unprefixed attributes by name. `index` and `length` hold numbers. */
  readonly attributes: ReadonlyMap<string, string | number>;
  /** A token element's text nodes, in order. Absent on other elements. */
  readonly value?: readonly string[];
  /** Child elements and text, in document order. */
  readonly children: readonly MmlChild[];
}

/** The document is not a MathML expression. */
export class MmlParseError extends Error {
  override readonly name = "MmlParseError";
}

/** MathML element name -> the name the translator dispatches on. */
const ELEMENTS: ReadonlyMap<string, string> = new Map([
  ["math", "Math"],
  ["mrow", "Mrow"],
  ["mi", "Mi"],
  ["mn", "Mn"],
  ["mo", "Mo"],
  ["mtext", "Mtext"],
  ["ms", "Ms"],
  ["mspace", "Mspace"],
  ["mglyph", "Mglyph"],
  ["mfrac", "Mfrac"],
  ["mfraction", "Mfraction"],
  ["msqrt", "Msqrt"],
  ["mroot", "Mroot"],
  ["mstyle", "Mstyle"],
  ["merror", "Merror"],
  ["mpadded", "Mpadded"],
  ["mphantom", "Mphantom"],
  ["mfenced", "Mfenced"],
  ["menclose", "Menclose"],
  ["msub", "Msub"],
  ["msup", "Msup"],
  ["msubsup", "Msubsup"],
  ["munder", "Munder"],
  ["mover", "Mover"],
  ["munderover", "Munderover"],
  ["mmultiscripts", "Mmultiscripts"],
  ["mprescripts", "Mprescripts"],
  ["none", "None"],
  ["mtable", "Mtable"],
  ["mlabeledtr", "Mlabeledtr"],
  ["mtr", "Mtr"],
  ["mtd", "Mtd"],
  ["maligngroup", "Maligngroup"],
  ["malignmark", "Malignmark"],
  ["mstack", "Mstack"],
  ["mlongdiv", "Mlongdiv"],
  ["msgroup", "Msgroup"],
  ["msrow", "Msrow"],
  ["mscarries", "Mscarries"],
  ["mscarry", "Mscarry"],
  ["msline", "Msline"],
  ["semantics", "Semantics"],
  ["annotation", "Annotation"],
  ["annotation-xml", "AnnotationXml"],
]);

const TOKENS: ReadonlySet<string> = new Set(["Mi", "Mn", "Mo", "Mtext", "Ms", "Annotation"]);
const INTEGER_ATTRIBUTES: ReadonlySet<string> = new Set(["index", "length"]);

/**
 * How this layer departs from the gem's `Mml.parse` (mml 2.4.1 over
 * lutaml-model 0.8.19), each measured against the oracle. None of these occurs
 * in the pinned corpus; all of them concern input outside ordinary MathML.
 */
export const MATHML_INPUT_DIFFERENCES: readonly (readonly [string, string])[] = [
  [
    "A root element other than `math` is refused.",
    "The gem reads any root as `math`. A MathML expression is a `math` element.",
  ],
  [
    "An unprefixed element in a non-MathML default namespace is skipped.",
    "The gem matches it by name. Namespaces decide what an element is.",
  ],
  [
    "Child elements are kept wherever they appear, and text is kept in every element.",
    "The gem keeps only the children its per-class mapping lists (dropping, say, an `mi` " +
      "inside an `mn`, a second `mprescripts`, or anything inside `mspace` or `mglyph`), " +
      "and drops blank text outside tokens.",
  ],
  [
    'An element in no namespace is MathML, `xmlns=""` included.',
    'The gem drops a child that undeclares the namespace (`<mi xmlns="">`) inside a MathML ' +
      "document, though it reads the same element in a document with no namespace at all.",
  ],
  ["CDATA is text.", "The gem drops CDATA sections. In XML they are character data."],
  [
    "A prefixed attribute (`ext:mathvariant`) is skipped.",
    "The gem matches attributes by local name, so a foreign-namespace attribute can stand in " +
      "for, or override, a MathML one. MathML attributes are in no namespace.",
  ],
  [
    "`index`/`length` are numbers only when written as plain decimal integers.",
    "The gem applies lutaml's integer cast: `010` is 8, `1.5` is 1, `1e2` is 100, and a " +
      "multi-line value refuses the whole document.",
  ],
  [
    "A token's `value` is always a list of its text nodes.",
    "The gem's annotation `value` is a string or a list depending on its neighbours; the " +
      "translator joins either way, so the model is the same.",
  ],
];

/** Reads a MathML document. Throws `MmlParseError` when it is not one. */
export function parseMml(text: string): MmlNode {
  let root: XmlReadElement;
  try {
    root = readXml(text);
  } catch (error) {
    if (error instanceof XmlReadError) throw new MmlParseError(error.message);
    throw error;
  }
  if (!isMathml(root) || localName(root) !== "math") {
    throw new MmlParseError("the document's root is not a MathML math element");
  }
  return build(root, "Math");
}

function localName(element: XmlReadElement): string | null {
  const { name, prefix } = element;
  if (name === null) return null;
  return prefix === null ? name : name.slice(prefix.length + 1);
}

/** No namespace (`xmlns=""` included, which XML defines as none) or MathML's. */
function isMathml(element: XmlReadElement): boolean {
  const { namespace } = element;
  return namespace === null || namespace === "" || namespace === MATHML_NAMESPACE;
}

function build(element: XmlReadElement, kind: string): MmlNode {
  const children: MmlChild[] = [];
  const texts: string[] = [];
  for (const node of element.children) {
    if (node.kind === "text" || node.kind === "cdata") {
      texts.push(node.text);
      children.push(node.text);
      continue;
    }
    if (node.kind !== "element" || !isMathml(node)) continue;
    const name = localName(node);
    const childKind = name === null ? undefined : ELEMENTS.get(name);
    if (childKind === undefined || childKind === "Math") continue;
    children.push(build(node, childKind));
  }
  const attributes = readAttributes(element);
  return TOKENS.has(kind)
    ? { kind, attributes, value: texts, children }
    : { kind, attributes, children };
}

function readAttributes(element: XmlReadElement): ReadonlyMap<string, string | number> {
  const out = new Map<string, string | number>();
  for (const [name, value] of element.attributes) {
    if (name.includes(":")) continue;
    if (!INTEGER_ATTRIBUTES.has(name)) {
      out.set(name, value);
      continue;
    }
    const match = /^\s*\+?(\d+)\s*$/.exec(value);
    if (match !== null) out.set(name, Number(match[1]));
  }
  return out;
}
