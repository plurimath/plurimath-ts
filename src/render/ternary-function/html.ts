/**
 * Mirrors `function/ternary_function.rb` — `TernaryFunction#to_html` (:59-64) —
 * plus a name arm for each gem class the census folds into this carrier that
 * has its OWN `to_html` override.
 *
 * Five classes are carried here: `PowerBase`, `Rule`, `Limits`, `Multiscript`
 * and `Underover`. `klass.instance_method(:to_html).owner` on the pinned oracle
 * splits them three ways, and only the third group takes the carrier default:
 *
 *   - `PowerBase` (`power_base.rb:32-37`) owns its `to_html`:
 *     `<i>1</i><sub>2</sub><sup>3</sup>`, so the second slot is a `<sub>` and
 *     the third a `<sup>` — NOT three `<i>` wrappers;
 *   - `Rule` (`rule.rb`) owns its `to_html` too, and it is `def to_html; ""; end`
 *     — `instance_method(:to_html).parameters` is `[]`, no `options:` keyword.
 *     Reached the way every child is reached, `to_html(options: options)`, it
 *     raises `ArgumentError: wrong number of arguments (given 1, expected 0)`,
 *     which the gem's own render boundary turns into `ParseError`. So a `Rule`
 *     in a tree is a case the gem REFUSES, and this port refuses it too;
 *   - `Limits`, `Multiscript` and `Underover` inherit the carrier, which is
 *     `<i>1</i><i>2</i><i>3</i>` with each absent slot dropped entirely.
 *
 * That split is the correction to what this file used to claim. The refusal
 * reason recorded for every ternary alias read "the gem renders each present
 * slot in its own wrapper", and a sweep of all eight slot-presence combinations
 * on the pinned oracle shows that is true of only three of the five — false for
 * `PowerBase`, whose measured bytes carry `<sub>`/`<sup>`, and false for `Rule`,
 * which renders nothing at all and cannot even be called that way.
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
