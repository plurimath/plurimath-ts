/**
 * The XML element tree the output renderers build (ARCHITECTURE.md §3, `xml/`).
 *
 * This is the TypeScript counterpart of the tree the gem hands to Ox: an
 * `Ox::Element` holds a name, an insertion-ordered attribute hash, and a
 * `nodes` array mixing child elements with plain-`String` text nodes
 * (`lib/plurimath/xml_engine/ox_engine/element.rb` at oracle `00c52783`).
 * A renderer builds nested `XmlElement`s with attributes and text, then makes
 * one `dump`/`dumpNodes` call (`./serializer`).
 *
 * **Text nodes are plain strings**, exactly as in Ox — there is no text-node
 * class. Comments and CDATA are not modelled: the gem's MathML *output* path
 * never emits them (they exist only on its parse side, `Ox::Comment` /
 * `Ox::CData`), so this module stays element + text until a consumer proves a
 * need.
 *
 * **Attribute values are stored verbatim.** The gem's engine wrapper decodes
 * HTML entities to Unicode on every attribute write
 * (`OxEngine::Element#update_attrs` → `Utility.html_entity_to_unicode`,
 * element.rb:104-110) — measured: `set_attr("intent" => "&#x2211;")` stores
 * `"∑"`, and unknown names like `"&nosuch;"` stay as written. That decoder is
 * `core`'s (its xhtml1 table already lives in `core/generated/html-entities`),
 * and layer 1 modules do not import each other (§3 rule 1), so the *renderer*
 * decodes before calling `setAttribute` here. The serializer contract this
 * module owns starts at the already-decoded value.
 *
 * Imports nothing internal, per §3's module map.
 */

/** A child slot: an element, or a text node carried as a plain string. */
export type XmlChild = XmlElement | string;

/**
 * What `append` accepts per slot: children, plus the two shapes the gem's
 * `XmlHelper.update_nodes` folds away — nil (skipped) and nested arrays
 * (recursed). `undefined` rides along with `null` because both spell Ruby's
 * nil on this side of the port.
 */
export type XmlAppendable = XmlChild | null | undefined | readonly XmlAppendable[];

/**
 * A mutable XML element: name, insertion-ordered attributes, ordered children.
 *
 * Mutability mirrors the gem's build style — `ox_element` then `<<` and
 * `set_attr` — rather than core's frozen node model; a renderer assembles the
 * tree top-down and serializes once.
 */
export class XmlElement {
  /** Tag name, emitted verbatim — Ox never validates or escapes names. */
  readonly name: string;

  private readonly attributeMap = new Map<string, string>();
  private readonly childList: XmlChild[] = [];

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Attributes in insertion order — the order Ox emits them in. Reassigning
   * an existing name keeps its original position; removing and re-adding
   * moves it to the end. Both are Ruby `Hash` semantics, both measured:
   *
   * ```ruby
   * e["a"] = "1"; e["b"] = "2"; e["a"] = "3"  # => <e a="3" b="2"/>
   * e.attributes.delete("a"); e["a"] = "3"    # => <e b="2" a="3"/>
   * ```
   *
   * (oracle `00c52783`, Ox 2.14.28) — and a JavaScript `Map` shares them.
   */
  get attributes(): ReadonlyMap<string, string> {
    return this.attributeMap;
  }

  /** Children in document order; text nodes are the string entries. */
  get children(): readonly XmlChild[] {
    return this.childList;
  }

  /** One attribute write, the wrapper's `[]=` minus its entity decode. */
  setAttribute(name: string, value: string): this {
    this.attributeMap.set(name, value);
    return this;
  }

  /**
   * Bulk attribute write in iteration order — the wrapper's `set_attr(attrs)`
   * minus its entity decode. A plain object works for every real MathML/OMML
   * attribute name; pass a `Map` (or pairs) if a key could look like an array
   * index, where object key order stops matching insertion order.
   */
  setAttributes(
    attributes: Readonly<Record<string, string>> | Iterable<readonly [string, string]>,
  ): this {
    const entries = Symbol.iterator in attributes ? attributes : Object.entries(attributes);
    for (const [name, value] of entries) {
      this.attributeMap.set(name, value);
    }
    return this;
  }

  /**
   * The wrapper's `remove_attr` (`xml_nodes&.attributes&.delete(attribute)`).
   * The gem's own MathML path uses it: `to_mathml` strips the `unitsml`
   * marker attribute off a lone unitsml node (formula.rb:450-456). Removing
   * an absent name is a no-op there and here.
   */
  removeAttribute(name: string): this {
    this.attributeMap.delete(name);
    return this;
  }

  /**
   * Appends children — `XmlHelper.update_nodes` and the wrapper's `<<` in
   * one call. Per the gem's semantics (xml_helper.rb:29-36): a nested array
   * is recursed, nil is skipped, and everything else lands in document
   * order. An empty string is a real (truthy-in-Ruby) text node and is
   * appended — dumping `<t>` with one empty text child yields `<t></t>`,
   * not `<t/>` (measured, oracle `00c52783`).
   */
  append(...nodes: readonly XmlAppendable[]): this {
    // Recursion is per nesting LEVEL, never per element. The previous form
    // re-entered as `this.append(...array)`, which makes one call frame
    // carrying N arguments and throws `RangeError` past roughly 125k — while
    // the gem's plain `each` loop has no limit at all (measured: the port
    // threw at 200k children where the oracle emitted 3,400,140 chars). The
    // threshold was stack-dependent, so it degraded as a render nested
    // deeper and there was no safe number to quote.
    const visit = (items: readonly XmlAppendable[]): void => {
      for (const node of items) {
        if (node === null || node === undefined) continue;
        if (Array.isArray(node)) {
          visit(node as readonly XmlAppendable[]);
          continue;
        }
        this.childList.push(node as XmlChild);
      }
    };
    visit(nodes);
    return this;
  }
}
