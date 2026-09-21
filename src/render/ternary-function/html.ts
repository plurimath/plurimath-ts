/**
 * Mirrors `function/ternary_function.rb` — `TernaryFunction#to_html` (:59-64) —
 * plus a name arm for each gem class the census folds into this carrier that
 * has its OWN `to_html` override.
 *
 * `klass.instance_method(:to_html).owner` on the pinned oracle splits the five
 * classes measured three ways:
 *
 *   - `PowerBase` (`power_base.rb:32-37`) owns its `to_html`:
 *     `<i>1</i><sub>2</sub><sup>3</sup>`, so the second slot is a `<sub>` and
 *     the third a `<sup>` — NOT three `<i>` wrappers;
 *   - `Rule` (`rule.rb:33`) owns its `to_html` too, and it is `def to_html; ""; end`
 *     — `instance_method(:to_html).parameters` is `[]`, no `options:` keyword.
 *     Reached the way every child is reached, `to_html(options: options)`, it
 *     raises `ArgumentError: wrong number of arguments (given 1, expected 0)`,
 *     which the gem's own render boundary turns into `ParseError`. So a `Rule`
 *     in a tree is a case the gem REFUSES, and this port refuses it too;
 *   - `Limits`, `Multiscript` and `Underover` inherit the carrier, which is
 *     `<i>1</i><i>2</i><i>3</i>` with each absent slot dropped entirely.
 *     `Limits` and `Multiscript` render that here. A `Multiscript` built by
 *     any parser has LIST scripts, and a list has no `to_html`, so the gem
 *     raises for it (`renderCarrierSlot` refuses a list the same way); only a
 *     hand-built `Multiscript` whose scripts are nodes or nil renders. `Underover`
 *     is not rendered by this slice.
 *
 * Every arm was checked against the gem by the `ternary-function` group of
 * `test/formats/ternary-function/render-fixtures.json`.
 */
import { RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderCarrierSlot,
  renderTaggedSlot,
} from "../../formats/html/render-shared";

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): string {
  const { name, parameterOne, parameterTwo, parameterThree } = node;
  switch (name) {
    // `power_base.rb:32-37`.
    case "PowerBase":
      return (
        renderCarrierSlot(parameterOne, context, "powerBase.parameterOne") +
        renderTaggedSlot("sub", parameterTwo, context, "powerBase.parameterTwo") +
        renderTaggedSlot("sup", parameterThree, context, "powerBase.parameterThree")
      );

    // The carrier default, unchanged (`ternary_function.rb:59-64`).
    case "Limits":
    case "Multiscript":
      return renderTernaryDefault(
        parameterOne,
        parameterTwo,
        parameterThree,
        context,
        "ternaryFunction",
      );

    // `rule.rb:33`: `def to_html` takes no keyword, so the call the renderer
    // makes on every child (`to_html(options: options)`) raises ArgumentError.
    case "Rule":
      throw new RenderError(
        "Rule#to_html takes no options keyword, so the gem's call raises ArgumentError " +
          "and the render boundary reports a ParseError; the port refuses it too",
        FORMAT,
        node.kind,
      );

    default:
      throw new RenderError(
        `TernaryFunction alias "${name}" has not been measured for HTML in this slice`,
        FORMAT,
        node.kind,
      );
  }
}

/** `TernaryFunction#to_html`: each present slot gets its own `<i>` wrapper. */
export function renderTernaryDefault(
  parameterOne: unknown,
  parameterTwo: unknown,
  parameterThree: unknown,
  context: RenderContext,
  at: string,
): string {
  return (
    renderCarrierSlot(parameterOne, context, `${at}.parameterOne`) +
    renderCarrierSlot(parameterTwo, context, `${at}.parameterTwo`) +
    renderCarrierSlot(parameterThree, context, `${at}.parameterThree`)
  );
}
