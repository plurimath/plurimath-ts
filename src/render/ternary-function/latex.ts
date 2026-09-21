/**
 * Mirrors `function/ternary_function.rb` — `TernaryFunction#to_latex` (:52)
 * and `#latex_wrapped` (:161, hoisted to `../../formats/latex/render-shared.ts` beside its
 * byte-equivalent binary twin). The census folds one AsciiMath-reachable
 * class into this carrier: `PowerBase` (`power_base.rb:25`, constructed
 * directly by `newPowerBase` in `../../asciimath/transform.ts`), whose own
 * `to_latex` override is what renders here.
 *
 * Three more classes, each with its own `to_latex`, are reached only through
 * the LaTeX and UnicodeMath parsers or a hand-built tree: `Limits`
 * (`limits.rb:24`), `Multiscript` (`multiscript.rb:29`) and `Rule`
 * (`rule.rb:18`). Each was checked byte-for-byte against the gem by the
 * `ternary-function` group of `test/formats/ternary-function/render-fixtures.json`.
 */

import { type NodeParameter, RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/latex/render-shared";

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): string {
  switch (node.name) {
    case "PowerBase":
      return renderPowerBase(node, context);
    case "Limits":
      return renderLimits(node, context);
    case "Multiscript":
      return renderMultiscript(node, context);
    case "Rule":
      return renderRule(node, context);
    default:
      throw unreachableName(node.kind, node.name);
  }
}

function renderPowerBase(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  // `PowerBase#to_latex` (`power_base.rb:25`): `_{…}^{…}` are BOTH always
  // present, whatever is nil; the first slot is never braced.
  const one = present(node.parameterOne)
    ? renderChild(node.parameterOne, context, "ternaryFunction.parameterOne")
    : null;
  const two = present(node.parameterTwo)
    ? renderChild(node.parameterTwo, context, "ternaryFunction.parameterTwo")
    : null;
  const three = present(node.parameterThree)
    ? renderChild(node.parameterThree, context, "ternaryFunction.parameterThree")
    : null;
  return `${s(one)}_{${s(two)}}^{${s(three)}}`;
}

/**
 * `Limits#to_latex` (`limits.rb:24`): the base unbraced, then `\limits` (the
 * gem's `class_name`), then `_` and `^` each followed by its slot in braces
 * only when the slot is truthy — a missing slot leaves the bare `_` or `^`.
 * The base is read with `&.`, the two scripts without, so a `false` script is
 * skipped (falsy) where a `false` base would raise.
 */
function renderLimits(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const first = optionalChild(node.parameterOne, context, "ternaryFunction.parameterOne");
  return `${first}\\limits_${braced(node.parameterTwo, context, "ternaryFunction.parameterTwo")}^${braced(node.parameterThree, context, "ternaryFunction.parameterThree")}`;
}

/**
 * `Multiscript#to_latex` (`multiscript.rb:29`). Its `unless
 * valid_value_exist?(field)` guards test `!field && (field&.empty? || ...)`,
 * which is falsy for nil and for every truthy field, so `{}`, `_{…}` and
 * `^{…}` are ALWAYS emitted (a nil script gives `_{}`). A script that is
 * anything but a list or nil — `false` included — has no `map` and the gem
 * raises NoMethodError.
 */
function renderMultiscript(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const sub = scriptList(node.parameterTwo, context, "ternaryFunction.parameterTwo");
  const sup = scriptList(node.parameterThree, context, "ternaryFunction.parameterThree");
  const base = optionalChild(node.parameterOne, context, "ternaryFunction.parameterOne");
  return `{}_{${sub}}^{${sup}}${base}`;
}

/**
 * `Rule#to_latex` (`rule.rb:18`): `\rule`, then `[first]` and `{second}`
 * `{third}` for each truthy slot. All three are read without `&.`.
 */
function renderRule(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const first = present(node.parameterOne)
    ? `[${s(renderChild(node.parameterOne, context, "ternaryFunction.parameterOne"))}]`
    : "";
  return `\\rule${first}${braced(node.parameterTwo, context, "ternaryFunction.parameterTwo")}${braced(node.parameterThree, context, "ternaryFunction.parameterThree")}`;
}

/** `"{#{field.to_latex(options:)}}" if field`. */
function braced(value: NodeParameter | undefined, context: RenderContext, at: string): string {
  return present(value) ? `{${s(renderChild(value, context, at))}}` : "";
}

/** `field&.map { |param| param.to_latex(options:) }&.join`, as a string. */
function scriptList(value: NodeParameter | undefined, context: RenderContext, at: string): string {
  if (value === null || value === undefined) return "";
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}: is ${describeSlot(value)}, not a list — the gem raises NoMethodError calling map`,
      FORMAT,
      "ternaryFunction",
    );
  }
  return value.map((item, index) => s(renderChild(item, context, `${at}[${index}]`))).join("");
}

/** `field&.to_latex(options:)`: only nil short-circuits, so `false` still raises. */
function optionalChild(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  if (value === null || value === undefined) return "";
  return s(renderChild(value, context, at));
}
