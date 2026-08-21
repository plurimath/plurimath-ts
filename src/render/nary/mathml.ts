/**
 * Mirrors `function/nary.rb` — `Nary#to_mathml_without_math_tag` (:50) and
 * `#tag_name` (:219): the script tag from `options[:type]` — `"undOvr"`
 * selects the munderover family (probe nary-undovr) — and the second/third
 * slots' presence, falling to a bare `<mrow>` with neither (probe
 * nary-bare); slots through `validate_mathml_fields`. A fourth slot appends
 * behind the script, wrapped in `<mrow>` UNLESS its render already is one —
 * the gem's one literal-true `wrap_mrow` (probes nary-p4-sym /
 * nary-p4-formula). `self.options[:mask]` reads truthily (`nary.rb:56`):
 * a nil options hash crashes the gem, and a live mask is refused
 * (`assertMaskIsInert`).
 */

import { RenderError } from "../../core/index";
import {
  assertMaskIsInert,
  FORMAT,
  hashOrNil,
  type NodeOf,
  present,
  type RenderContext,
  requireElement,
  validateMathmlFields,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderNary(node: NodeOf<"nary">, context: RenderContext): XmlElement {
  // Gem order kept: the three slots render FIRST, then `tag_name` reads
  // `options[:type]` — which is where a nil or non-hash options slot
  // crashes (`nil[:type]` NoMethodError, `"zz"[:type]` TypeError).
  const children = [
    validateMathmlFields(node.parameterOne, context, "nary.parameterOne"),
    validateMathmlFields(node.parameterTwo, context, "nary.parameterTwo"),
    validateMathmlFields(node.parameterThree, context, "nary.parameterThree"),
  ];
  const options = node.options;
  if (options === null || options === undefined) {
    throw new RenderError(
      "nary.options: is nil — tag_name reads options[:type] unguarded and the gem " +
        "raises NoMethodError",
      FORMAT,
      node.kind,
    );
  }
  const hash = hashOrNil(options, node.kind, "nary.options");
  const script = new XmlElement(naryTagName(node, hash)).append(children);
  if (hash !== null && present(hash.mask)) {
    assertMaskIsInert(hash.mask, node.kind, "nary.options.mask");
  }
  if (!present(node.parameterFour)) return script;
  const fourth = requireElement(
    validateMathmlFields(node.parameterFour, context, "nary.parameterFour"),
    node.kind,
    "nary.parameterFour",
  );
  const wrapped = fourth.name === "mrow" ? fourth : new XmlElement("mrow").append(fourth);
  return new XmlElement("mrow").append(script, wrapped);
}

/**
 * `Nary#tag_name` (`nary.rb:219-230`). The gem declares it PROTECTED, so
 * `PowerBase` calling it on a `Nary` first slot raises NoMethodError (probe
 * raw-powerbase-nary) — the ternary kind file refuses that shape itself,
 * which is why nothing here is exported.
 */
function naryTagName(node: NodeOf<"nary">, options: Record<string, unknown> | null): string {
  const tag = options !== null && options.type === "undOvr" ? "munderover" : "msubsup";
  if (present(node.parameterTwo) && present(node.parameterThree)) return tag;
  if (present(node.parameterTwo)) return tag === "munderover" ? "munder" : "msub";
  if (present(node.parameterThree)) return tag === "munderover" ? "mover" : "msup";
  return "mrow";
}
