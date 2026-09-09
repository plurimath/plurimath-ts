import { RenderError } from "../../core/index";
import {
  controlProperties,
  describeSlot,
  FORMAT,
  type NodeOf,
  type OmmlRendered,
  plainRun,
  present,
  type RenderContext,
  renderChild,
  renderUnaryValue,
  requireElement,
  requireNodeList,
  textElement,
  wordRunProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * The `UnaryFunction` aliases whose `to_omml_without_math_tag` IS the base
 * method — `Sin` and its 14 siblings add nothing to it, so the only thing that
 * varies between them is `class_name`.
 *
 * Measured on the pinned oracle `00c52783` over all 48 classes the census
 * records as aliasing `Math::Function::UnaryFunction`, reading
 * `instance_method(:to_omml_without_math_tag).owner` for each (exit 0):
 * exactly these 15 answer `Plurimath::Math::Function::UnaryFunction`. The
 * other 33 — `Cancel`, `Deg`, `Ms`, `Phantom` and the rest — each OWN the
 * method and take a shape of their own, so a blanket "every unary alias is the
 * base" would have invented markup for 33 classes. Those keep refusing until
 * measured one at a time; `Left`, `Right` and `Tr` are the three overriders
 * this file carries beyond the base set.
 *
 * `class_name` (`core.rb:28-30`, `self.class.name.split("::").last.downcase`)
 * was read in the same probe: for all 15 it is the ASCII lowercase of the
 * basename, and no name here holds a character where Ruby's `String#downcase`
 * and JavaScript's `toLowerCase` differ. `UnaryFunction` itself is in the set
 * because it is the class the method belongs to, and its own `class_name` is
 * `"unaryfunction"` — measured live, not assumed from the pattern.
 *
 * Deliberately NOT the same set as `MEASURED_UNARY_NAMES` in the four P1
 * renderers, and it should not be expected to match: those are the names the
 * AsciiMath transform can REACH, and each format name-arms its own overriders
 * separately. This one is the names whose OMML method is inherited, which is a
 * question about the gem rather than about the parser, and is answered per
 * format — the mathml override set is not the omml override set.
 */
const OMML_BASE_UNARY_CLASSES: ReadonlySet<string> = new Set([
  "Arccos",
  "Arcsin",
  "Arctan",
  "Cos",
  "Cosh",
  "Cot",
  "Coth",
  "Csc",
  "Csch",
  "Sec",
  "Sech",
  "Sin",
  "Sinh",
  "Tan",
  "Tanh",
  "UnaryFunction",
]);

export function renderUnaryFunction(
  node: NodeOf<"unaryFunction">,
  context: RenderContext,
): OmmlRendered {
  switch (node.name) {
    case "Tr":
      return renderTr(node, context);
    case "Left":
    case "Right":
      return renderLeftRight(node);
    default:
      if (OMML_BASE_UNARY_CLASSES.has(node.name)) {
        return renderUnaryCarrier(node, context, node.name.toLowerCase());
      }
      throw new RenderError(
        `UnaryFunction alias "${node.name}" has not been measured for OMML in this slice`,
        FORMAT,
        node.kind,
      );
  }
}

/**
 * `UnaryFunction#to_omml_without_math_tag` (unary_function.rb:76-88), the one
 * method the 15 base aliases share:
 *
 * ```ruby
 * return r_element(class_name, rpr_tag: false) unless parameter_one
 *
 * if @hide_function_name
 *   value = omml_value(display_style, options: options)   # the argument alone
 * else
 *   func = XmlHelper.ox_element("func", namespace: "m")
 *   value = XmlHelper.update_nodes(func, function_values(display_style, options: options))
 * end
 * ```
 *
 * The empty-slot guard comes FIRST, before the hide branch, and it is
 * Ruby-falsy rather than a nil check. Measured on the oracle at `00c52783`:
 * `Sin.new(nil)` and `Sin.new(false)` both render `<m:r><m:t>sin</m:t></m:r>`
 * — the label alone, with no `m:rPr` — and setting `hide_function_name` on
 * either changes nothing, because that branch is never reached. `Sin.new([])`
 * does NOT take it: an empty Array is truthy in Ruby, so it renders the whole
 * `m:func` tree around an empty `<m:e/>`.
 *
 * With the slot filled, the flag false or unset gives the
 * `m:func`/`m:funcPr`/`m:fName` tree, and true gives the inserted argument on
 * its own — `Sin.new(x)` hidden is `<m:r><m:t>x</m:t></m:r>` (measured). Both
 * arms go through `omml_value`, which compacts a LIST and wraps one scalar, so
 * `Sin.new([x, y])` fills one `m:e` with two runs and `Sin.new([x, nil])`
 * drops the nil (both measured).
 */
function renderUnaryCarrier(
  node: NodeOf<"unaryFunction">,
  context: RenderContext,
  className: string,
): OmmlRendered {
  if (!present(node.parameterOne)) return plainRun(className);

  const value = renderUnaryValue(
    node.parameterOne,
    context,
    node.kind,
    "unaryFunction.parameterOne",
  );
  if (present(node.hideFunctionName)) return value;

  const funcPr = new XmlElement("m:funcPr").append(controlProperties());
  const functionName = new XmlElement("m:fName").append(
    new XmlElement("m:r").append(wordRunProperties(false), textElement(className)),
  );
  return new XmlElement("m:func").append(funcPr, functionName, new XmlElement("m:e").append(value));
}

/**
 * `Left#to_omml_without_math_tag` (left.rb:19-26), which `Right` repeats
 * verbatim (right.rb:19-26):
 *
 * ```ruby
 * mr = XmlHelper.ox_element("m:r")
 * if parameter_one
 *   mt = XmlHelper.ox_element("m:t")
 *   mr << (mt << parameter_one)
 * end
 * [mr]
 * ```
 *
 * Three things measured on the pinned oracle `00c52783`, each of which the
 * sibling arms of these two classes would have suggested otherwise:
 *
 *   - the slot holds a bare STRING here, not a node. `Left.new("(")` renders
 *     `<m:r><m:t>(</m:t></m:r>`, while `Left.new(Symbol.new("x"))`,
 *     `Left.new([])`, `Left.new(0)` and `Left.new(true)` all raise
 *     `NoMethodError: undefined method 'xml_nodes'` — the engine sends that to
 *     whatever is appended, and only a String or an element answers it;
 *   - `left_paren`/`right_paren`, the `\{` → `{` rewrite `to_mathml`,
 *     `to_latex` and all four math-zone arms use, is NOT called here.
 *     Measured: `Left.new("\\{")` renders `\{`, not `{`;
 *   - `hide_function_name` is never read, so a hidden `Left` still renders its
 *     delimiter (measured).
 *
 * The `if parameter_one` guard is Ruby-falsy: `nil` and `false` both give the
 * bare `<m:r/>` with no `m:t` at all, and the empty string does not — it is
 * truthy in Ruby, and gives `<m:r><m:t></m:t></m:r>`.
 */
function renderLeftRight(node: NodeOf<"unaryFunction">): OmmlRendered {
  const run = new XmlElement("m:r");
  if (!present(node.parameterOne)) return run;

  const value: unknown = node.parameterOne;
  if (typeof value !== "string") {
    throw new RenderError(
      `${node.name.toLowerCase()}.parameterOne: is ${describeSlot(value)}, and the gem appends it straight to <m:t> — ` +
        "only a string answers the engine's xml_nodes there, so anything else raises NoMethodError",
      FORMAT,
      node.kind,
    );
  }
  return run.append(textElement(value));
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
