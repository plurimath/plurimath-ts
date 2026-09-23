/**
 * Mirrors `function/sum.rb` — `Sum#to_mathml_without_math_tag` (:56): the
 * `<mo>&#x2211;</mo>` head (EMPTY `<mo/>` under `hide_function_name` —
 * probe sum-hide) returned bare when no value exists; otherwise
 * `<munderover>`/`<munder>`/`<mover>` by the first two slots (`sum_tag`,
 * :163 — probes sum-under / sum-over), nil slots contributing nothing; a
 * third slot appends behind it in an outer `<mrow>` (probe sum-all). Under
 * intent the third slot is wrapped in `<mrow>` unless it is one
 * (`wrap_mrow`) and `ternary_intentify` tags the outer `<mrow>`
 * `:sum(...)`; `Sum` (unlike `Prod`) leaves a two-slot script untagged.
 */

import {
  type NodeOf,
  naryandIntent,
  present,
  type RenderContext,
  renderChild,
  wrapMrow,
} from "../../formats/mathml/render-shared";
import { MATHML_UNICODE_INVERT } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

export function renderSum(node: NodeOf<"sum">, context: RenderContext): XmlElement {
  return renderBigUnderover(node, context, "sum");
}

/**
 * The shared body: `function/sum.rb` and `function/prod.rb` repeat it verbatim (`sum_tag` /
 * `prod_tag_name` are the same underover choice); where they differ is the
 * intent path — `Prod#to_mathml_without_math_tag` also runs
 * `ternary_intentify` on a script with no third slot, `Sum` returns it bare
 * (function/prod.rb:71-73, function/sum.rb:77). Exported for
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
  const intentName = className === "sum" ? ":sum" : ":product";
  if (node.parameterThree === null || node.parameterThree === undefined) {
    return className === "prod" && context.intent ? naryandIntent(script, intentName) : script;
  }
  const third = wrapMrow(
    renderChild(node.parameterThree, context, `${className}.parameterThree`),
    context.intent,
    node.kind,
    `${className}.parameterThree`,
  );
  const mrow = new XmlElement("mrow").append(script, third);
  return context.intent ? naryandIntent(mrow, intentName) : mrow;
}
