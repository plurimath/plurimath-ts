/**
 * The MathML element layer: what `Mml.parse(text, version: 4)` builds from a
 * document, as the gem's MathML translator reads it.
 *
 * `readXml` reproduces the XML read; this module reproduces the lutaml-model
 * mapping on top of it, driven by the class schema generated from the mml gem
 * (`./generated/mml-schema.ts`). Every rule below was measured against the
 * oracle and is pinned by the `mml-semantics` rows of
 * `test/formats/mathml/model-fixtures.json`:
 *
 * - The root element becomes `Math` whatever its name or namespace.
 * - A child element maps through its parent's child rules by local name. A
 *   prefixed element survives only when its prefix names the MathML namespace;
 *   an unprefixed one survives whatever its default namespace. Unmapped
 *   elements are dropped with their content. A non-collection child keeps its
 *   first occurrence only.
 * - Only an ordered class exposes children. Text is one of them when the class
 *   has text content (token elements), or when it is not blank (Ruby `strip`
 *   leaves something). Comments, processing instructions and CDATA are dropped.
 * - `value` collects the text children. A collection is an array, `[""]` when
 *   there is no text. A single value is `""` with no text, the string when it
 *   is the element's only node, and otherwise an array.
 * - The attributes the translator reads match by local name; integer ones go
 *   through lutaml's `Type::Integer.cast` (`castInteger`).
 *
 * `Mml.parse`'s `namespace_exist:` flag changed nothing in any probe, so it is
 * not modelled.
 */

import { readXml, type XmlReadElement, XmlReadError } from "../../xml/index";
import {
  MML_CHILD_SETS,
  MML_CLASSES,
  type MmlAttributeRule,
  type MmlChildRule,
} from "./generated/mml-schema";

const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";

/** One node of the tree: an element of an `Mml::V4` class, or a text child. */
export type MmlChild = MmlNode | string;

export interface MmlNode {
  /** The `Mml::V4` class, without the module prefix (`Mi`, `Mrow`). */
  readonly kind: string;
  /** The read attributes that are set. Integer attributes hold numbers. */
  readonly attributes: ReadonlyMap<string, string | number>;
  /** Present exactly when the class maps text content onto `value`. */
  readonly value?: string | readonly string[];
  /** `each_mixed_content`, in document order. */
  readonly children: readonly MmlChild[];
}

/** `Mml.parse` refused the document (the XML read refused it). */
export class MmlParseError extends Error {
  override readonly name = "MmlParseError";
}

interface ClassSchema {
  readonly ordered: boolean;
  readonly content: "collection" | "single" | null;
  readonly children: ReadonlyMap<string, MmlChildRule>;
  readonly attributes: readonly MmlAttributeRule[];
}

const CHILD_SETS: readonly ReadonlyMap<string, MmlChildRule>[] = MML_CHILD_SETS.map(
  (rules) => new Map(rules.map((rule) => [rule[0], rule] as const)),
);

const CLASSES: ReadonlyMap<string, ClassSchema> = new Map(
  MML_CLASSES.map(([kind, ordered, content, childSet, attributes]) => {
    const children = CHILD_SETS[childSet];
    if (children === undefined) throw new Error(`${kind}: no child set ${childSet}`);
    return [kind, { ordered, content, children, attributes }] as const;
  }),
);

/** `Mml.parse(text, version: 4)`. Throws `MmlParseError` where the gem raises. */
export function parseMml(text: string): MmlNode {
  let root: XmlReadElement;
  try {
    root = readXml(text);
  } catch (error) {
    if (error instanceof XmlReadError) throw new MmlParseError(error.message);
    throw error;
  }
  return build(root, "Math");
}

function schemaFor(kind: string): ClassSchema {
  const schema = CLASSES.get(kind);
  if (schema === undefined) throw new Error(`no Mml schema for ${kind}`);
  return schema;
}

function localName(name: string | null, prefix: string | null): string | null {
  if (name === null) return null;
  return prefix === null ? name : name.slice(prefix.length + 1);
}

function build(element: XmlReadElement, kind: string): MmlNode {
  const schema = schemaFor(kind);
  const children: MmlChild[] = [];
  const texts: string[] = [];
  let otherNodes = false;
  const taken = new Set<string>();

  for (const node of element.children) {
    if (node.kind === "text") {
      texts.push(node.text);
      if (schema.ordered && (schema.content !== null || !isBlank(node.text))) {
        children.push(node.text);
      }
      continue;
    }
    otherNodes = true;
    if (node.kind !== "element") continue;
    if (node.prefix !== null && node.namespace !== MATHML_NAMESPACE) continue;
    const name = localName(node.name, node.prefix);
    const rule = name === null ? undefined : schema.children.get(name);
    if (rule === undefined) continue;
    const [xmlName, childKind, collection] = rule;
    if (!collection) {
      if (taken.has(xmlName)) continue;
      taken.add(xmlName);
    }
    const child = build(node, childKind);
    if (schema.ordered) children.push(child);
  }

  const attributes = readAttributes(element, schema.attributes);
  if (schema.content === null) return { kind, attributes, children };
  return { kind, attributes, value: contentValue(schema.content, texts, otherNodes), children };
}

function contentValue(
  content: "collection" | "single",
  texts: readonly string[],
  otherNodes: boolean,
): string | readonly string[] {
  if (content === "collection") return texts.length === 0 ? [""] : texts;
  if (texts.length === 0) return "";
  const [only] = texts;
  if (texts.length === 1 && !otherNodes && only !== undefined) return only;
  return texts;
}

function readAttributes(
  element: XmlReadElement,
  rules: readonly MmlAttributeRule[],
): ReadonlyMap<string, string | number> {
  const out = new Map<string, string | number>();
  for (const [xmlName, type] of rules) {
    let raw: string | undefined;
    for (const [name, value] of element.attributes) {
      const colon = name.indexOf(":");
      if ((colon < 0 ? name : name.slice(colon + 1)) === xmlName) raw = value;
    }
    if (raw === undefined) continue;
    if (type === "string") {
      out.set(xmlName, raw);
      continue;
    }
    const cast = castInteger(raw);
    if (cast !== null) out.set(xmlName, cast);
  }
  return out;
}

/** Ruby `String#strip` leaves nothing: ASCII whitespace and NUL only. */
function isBlank(text: string): boolean {
  return /^[\t\n\v\f\r \0]*$/.test(text);
}

/**
 * lutaml-model 0.8.19's `Type::Integer.cast` for a string:
 *
 * ```ruby
 * if value.match?(/^0[0-7]+$/) then value.to_i(8)
 * elsif value.match?(/^-?\d+(\.\d+)?(e-?\d+)?$/i) then Float(value).to_i
 * else Integer(value, 10) rescue nil
 * ```
 *
 * Ruby's `^`/`$` match at line boundaries, so a multi-line value can take the
 * first two arms on one of its lines; `Float()` of such a value raises, and
 * the gem's parse raises with it (`MmlParseError` here).
 */
export function castInteger(value: string): number | null {
  if (/^0[0-7]+$/m.test(value)) return rubyToI(value, 8);
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/im.test(value)) {
    const float = rubyFloat(value);
    if (float === null || !Number.isFinite(float)) {
      throw new MmlParseError(`invalid value for Integer: ${JSON.stringify(value)}`);
    }
    return Math.trunc(float);
  }
  return rubyInteger(value);
}

const RUBY_SPACE = "[\\t\\n\\v\\f\\r ]";

/** `String#to_i(base)`: leading whitespace, a sign, digits with single underscores. */
function rubyToI(value: string, base: 8 | 10): number {
  const digit = base === 8 ? "[0-7]" : "\\d";
  const match = new RegExp(`^${RUBY_SPACE}*([+-]?)(${digit}+(?:_${digit}+)*)`).exec(value);
  if (match === null) return 0;
  const magnitude = Number.parseInt((match[2] ?? "0").replaceAll("_", ""), base);
  return match[1] === "-" ? -magnitude : magnitude;
}

/** `Integer(value, 10)`, or null where it raises. */
function rubyInteger(value: string): number | null {
  const match = new RegExp(`^${RUBY_SPACE}*([+-]?)(?:0[dD])?(\\d+(?:_\\d+)*)${RUBY_SPACE}*$`).exec(
    value,
  );
  if (match === null) return null;
  const magnitude = Number((match[2] ?? "").replaceAll("_", ""));
  return match[1] === "-" ? -magnitude : magnitude;
}

/** `Float(value)` for the decimal forms the cast reaches, or null where it raises. */
function rubyFloat(value: string): number | null {
  const digits = "\\d+(?:_\\d+)*";
  const match = new RegExp(
    `^${RUBY_SPACE}*([+-]?${digits}(?:\\.${digits})?(?:[eE][+-]?${digits})?)${RUBY_SPACE}*$`,
  ).exec(value);
  if (match === null) return null;
  return Number((match[1] ?? "").replaceAll("_", ""));
}
