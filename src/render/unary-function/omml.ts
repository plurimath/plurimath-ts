import { RenderError } from "../../core/index";
import {
  controlProperties,
  FORMAT,
  insertChild,
  type NodeOf,
  type OmmlRendered,
  present,
  type RenderContext,
  renderChild,
  requireElement,
  requireNodeList,
  wordRunProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUnaryFunction(
  node: NodeOf<"unaryFunction">,
  context: RenderContext,
): OmmlRendered {
  switch (node.name) {
    case "UnaryFunction":
      return renderUnaryCarrier(node, context);
    case "Tr":
      return renderTr(node, context);
    default:
      throw new RenderError(
        `UnaryFunction alias "${node.name}" has not been measured for OMML in this slice`,
        FORMAT,
        node.kind,
      );
  }
}

/**
 * `UnaryFunction#to_omml_without_math_tag` (unary_function.rb:76-88) branches
 * on `@hide_function_name` before it builds anything:
 *
 * ```ruby
 * if @hide_function_name
 *   value = omml_value(display_style, options: options)   # the argument alone
 * else
 *   func = XmlHelper.ox_element("func", namespace: "m")
 *   value = XmlHelper.update_nodes(func, function_values(display_style, options: options))
 * end
 * ```
 *
 * Measured on the oracle at `00c52783` over the base carrier with
 * `Symbol.new("x")`: the flag false or unset gives the `m:func`/`m:funcPr`/
 * `m:fName` tree, and true gives `<m:r><m:t>x</m:t></m:r>` — the inserted
 * argument on its own, with the whole function wrapper dropped.
 *
 * The guard is Ruby-falsy (`if @hide_function_name`), not a nil check, so it
 * goes through `present`.
 */
function renderUnaryCarrier(node: NodeOf<"unaryFunction">, context: RenderContext): OmmlRendered {
  if (present(node.hideFunctionName)) {
    return insertChild(node.parameterOne, context, "unaryFunction.parameterOne");
  }
  const funcPr = new XmlElement("m:funcPr").append(controlProperties());
  const functionName = new XmlElement("m:fName").append(
    new XmlElement("m:r").append(
      wordRunProperties(false),
      new XmlElement("m:t").append("unaryfunction"),
    ),
  );
  const argument = new XmlElement("m:e").append(
    insertChild(node.parameterOne, context, "unaryFunction.parameterOne"),
  );
  return new XmlElement("m:func").append(funcPr, functionName, argument);
}

/**
 * `Tr#to_omml_without_math_tag` (tr.rb:47-60) renders every cell, then wraps
 * the result in `m:mr` unless the row holds exactly one cell:
 *
 * ```ruby
 * if parameter_one.count.eql?(1)
 *   omml_content
 * else
 *   mr = XmlHelper.ox_element("mr", namespace: "m")
 *   XmlHelper.update_nodes(mr, omml_content)
 *   [mr]
 * ```
 *
 * Measured on the oracle at `00c52783`: a one-cell row answers with the bare
 * `<m:e>` list, a two- or three-cell row with `<m:mr>`, and an EMPTY row with
 * `<m:mr/>` — zero is not one, so it takes the wrapper branch too. `m:m`
 * flattens whatever a row answers, which is how the gem mixes row widths in
 * one matrix.
 */
function renderTr(node: NodeOf<"unaryFunction">, context: RenderContext): OmmlRendered {
  const cells = requireNodeList(node.parameterOne, node.kind, "tr.parameterOne");
  const rendered = cells.map((cell, index) =>
    requireElement(
      renderChild(cell, context, `tr.parameterOne[${index}]`),
      node.kind,
      `tr.parameterOne[${index}]`,
      "m:e",
    ),
  );
  if (cells.length === 1) return rendered;
  return new XmlElement("m:mr").append(...rendered);
}
