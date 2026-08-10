/**
 * Mirrors `function/linebreak.rb` — `Linebreak#to_mathml_without_math_tag`
 * (:9): with no parameter, `<mo linebreak="newline"/>`; with one, the
 * parameter's OWN render forcibly renamed to `mo` (an `<mtext>ab</mtext>`
 * child becomes `<mo>ab</mo>`, a formula's `<mrow>` becomes an `<mo>`
 * holding elements — probes linebreak-mtext / linebreak-formula-param),
 * then the node's `attributes` written onto it unless empty. The gem sends
 * `.name` to the render and `.empty?` to the attributes unguarded: a
 * wrapperless-formula render (an array) and a nil or non-hash `attributes`
 * both crash there (probe linebreak-nil-attrs) and raise here.
 *
 * Renaming is a rebuild here — `XmlElement.name` is deliberately immutable —
 * which is output-equivalent: the render owns the element it just built.
 */

import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  isPlainHash,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  requireElement,
  setAttributesFromHash,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderLinebreak(node: NodeOf<"linebreak">, context: RenderContext): XmlElement {
  if (!present(node.parameterOne)) {
    return new XmlElement("mo").setAttribute("linebreak", "newline");
  }
  const rendered = requireElement(
    renderChild(node.parameterOne, context, "linebreak.parameterOne"),
    node.kind,
    "linebreak.parameterOne",
  );
  const mo = rendered.name === "mo" ? rendered : renameToMo(rendered);
  const attributes = node.attributes;
  if (!isPlainHash(attributes)) {
    throw new RenderError(
      `linebreak.attributes: holds ${describeSlot(attributes)} — the gem sends ` +
        ".empty? to it, which only a hash answers here (probe linebreak-nil-attrs)",
      FORMAT,
      node.kind,
    );
  }
  if (Object.keys(attributes).length > 0) {
    setAttributesFromHash(mo, attributes, node.kind, "linebreak.attributes");
  }
  return mo;
}

function renameToMo(element: XmlElement): XmlElement {
  const mo = new XmlElement("mo");
  mo.setAttributes(element.attributes);
  mo.append(...element.children);
  return mo;
}
