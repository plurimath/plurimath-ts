/**
 * Mirrors `symbols/symbol.rb` — `Symbols::Symbol#to_mathml_without_math_tag`
 * (:44) — for the base class, and the generated per-id descriptors plus
 * context-exception matrix for the 1,459 subclasses the census folds into
 * this kind (ARCHITECTURE.md §5, "Symbols").
 *
 * Measured pins (probe-mathml-kinds / probe-mathml-edges3, pinned oracle):
 *
 *   - base `Symbol`: `<mi>` from the node's own `value`; `"{:"`/`":}"` and a
 *     nil value render the EMPTY `<mi/>`, an empty string the long-form
 *     `<mi></mi>`; `options[:rspace]` becomes an `rspace` attribute; a value
 *     containing `"&#x2147;"` gains an `intent` attribute holding the
 *     DECODED value — unconditionally, whatever the `intent` option says;
 *   - subclasses render their static descriptor; the only mathml
 *     value-dependent ids are `Plus` and `Comma` (`value || default`,
 *     generator census `VALUE_DEPENDENT_SYMBOLS`) — `Plus.new("&#x2b;")` is
 *     `<mo>&#x2b;</mo>`, `Plus.new("")` the long-form `<mo></mo>`;
 *   - subclasses IGNORE `options[:rspace]` (probe plus-rspace) — only the
 *     base class reads it;
 *   - the intent-axis exceptions (`Dd`, `Ii`, `Jj`, `UpcaseDd`, `Intercal`)
 *     differ only under `intent: true`, which this port refuses at the
 *     boundary, so the static descriptor is always the right variant.
 */

import { htmlEntityToUnicode, RUBY_ABSTRACT_CLASSES } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import {
  classBasename,
  hashOrNil,
  missingSymbolDataError,
  type NodeOf,
  requireStringForAppend,
  setDecodedAttribute,
} from "../../formats/mathml/render-shared";
import { MATHML_SYMBOLS } from "../../generated/mathml/symbols";
import { XmlElement } from "../../xml/index";

/**
 * Symbol ids rendered from their stored `value` rather than a descriptor:
 * the `Symbol` base class itself and the abstract `Paren` root, both derived
 * from core's own data — the same two ids `renderSymbol` on the asciimath
 * side value-renders.
 */
const VALUE_RENDERED_SYMBOL_IDS: ReadonlySet<string> = new Set(
  [NODE_SPECS.symbol.rubyClass, ...RUBY_ABSTRACT_CLASSES]
    .filter((rubyClass) => rubyClass.startsWith("Math::Symbols::"))
    .map(classBasename),
);

/**
 * The ids whose mathml output reads the node's own `value` when one is set
 * (`value || default` in their overrides) — the generator's value-dependence
 * census (`context-axes.ts`, `VALUE_DEPENDENT_SYMBOLS`, mathml column).
 */
const VALUE_DEPENDENT_IDS: ReadonlySet<string> = new Set(["Plus", "Comma"]);

export function renderSymbol(node: NodeOf<"symbol">): XmlElement {
  const id = node.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
  if (VALUE_RENDERED_SYMBOL_IDS.has(id)) return renderBaseSymbol(node);

  const descriptor = MATHML_SYMBOLS.get(id);
  if (descriptor === undefined) throw missingSymbolDataError(id);
  const element = new XmlElement(descriptor.tag);
  let text: string = descriptor.text;
  if (VALUE_DEPENDENT_IDS.has(id) && node.value !== null && node.value !== undefined) {
    // `value || "+"`: Ruby's || keeps "" — only nil falls through.
    text = requireStringForAppend(node.value, node.kind, `symbol(${id}).value`);
  }
  return element.append(text);
}

/**
 * `Symbols::Symbol#to_mathml_without_math_tag` (`symbol.rb:44-55`): the
 * dynamic base-class render. Attribute order is the gem's write order —
 * `intent` first, then `rspace`.
 */
function renderBaseSymbol(node: NodeOf<"symbol">): XmlElement {
  const mi = new XmlElement("mi");
  const value =
    node.value === null || node.value === undefined
      ? null
      : requireStringForAppend(node.value, node.kind, "symbol.value");
  if (value?.includes("&#x2147;")) {
    // `attributes[:intent] = Utility.html_entity_to_unicode(value)` —
    // decoded once here, and the engine wrapper's write decodes again
    // (idempotent: the decoded text has no entities left).
    mi.setAttribute("intent", htmlEntityToUnicode(value));
  }
  const options = hashOrNil(node.options, node.kind, "symbol.options");
  if (options !== null && Object.hasOwn(options, "rspace")) {
    // `attributes[:rspace] = @options[:rspace] if @options&.key?(:rspace)` —
    // key presence, not truthiness, so `rspace: nil` writes `rspace=""`.
    // The wrapper's to_s + entity decode; a non-primitive value takes the
    // same reproducibility guard every attribute write does.
    setDecodedAttribute(mi, "rspace", options.rspace, node.kind, "symbol.options.rspace");
  }
  if (value === "{:" || value === ":}") return mi;
  if (value !== null) mi.append(value);
  return mi;
}
