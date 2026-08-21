/**
 * Mirrors `function/sum.rb` — `Sum#to_mathml_without_math_tag` (:13): the
 * `<mo>&#x2211;</mo>` head (EMPTY `<mo/>` under `hide_function_name` —
 * probe sum-hide) returned bare when no value exists; otherwise
 * `<munderover>`/`<munder>`/`<mover>` by the first two slots (`sum_tag`,
 * :163 — probes sum-under / sum-over), nil slots contributing nothing; a
 * third slot appends behind it in an outer `<mrow>` (probe sum-all;
 * `ternary_intentify` identity, intent off).
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  requireElement,
} from "../../formats/mathml/render-shared";
import { MATHML_UNICODE_INVERT } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

export function renderSum(node: NodeOf<"sum">, context: RenderContext): XmlElement {
  return renderBigUnderover(node, context, "sum");
}

/**
 * The shared body: `function/sum.rb` and `function/prod.rb` repeat it verbatim (`sum_tag` /
 * `prod_tag_name` are the same underover choice). Exported for
 * `../prod/mathml.ts`.
 */
export function renderBigUnderover(
  node: NodeOf<"sum"> | NodeOf<"prod">,
  context: RenderContext,
  className: "sum" | "prod",
): XmlElement {
  const mo = new XmlElement("mo");
  if (!present(node.hideFunctionName)) {
    mo.append(MATHML_UNICODE_INVERT.get(className) ?? className);
  }
  if (!present(node.parameterOne) && !present(node.parameterTwo) && !present(node.parameterThree)) {
    return mo;
  }
  const tag =
    present(node.parameterOne) && present(node.parameterTwo)
      ? "munderover"
      : present(node.parameterOne)
        ? "munder"
        : "mover";
  const script = new XmlElement(tag).append(
    mo,
    node.parameterOne === null || node.parameterOne === undefined
      ? null
      : renderChild(node.parameterOne, context, `${className}.parameterOne`),
    node.parameterTwo === null || node.parameterTwo === undefined
      ? null
      : renderChild(node.parameterTwo, context, `${className}.parameterTwo`),
  );
  if (node.parameterThree === null || node.parameterThree === undefined) return script;
  const third = requireElement(
    renderChild(node.parameterThree, context, `${className}.parameterThree`),
    node.kind,
    `${className}.parameterThree`,
  );
  return new XmlElement("mrow").append(script, third);
}
