/**
 * Mirrors `function/ternary_function.rb` — which defines **no** `to_unicodemath`,
 * and neither does `Math::Core`. A bare `TernaryFunction` instance raises
 * `NoMethodError` in the gem: every concrete subclass supplies its own.
 *
 * The census folds one class into this carrier that anything actually builds:
 * `PowerBase` (`power_base.rb:63`, with `sup_value` at `:113` and `sub_value`
 * at `:125`), constructed by `newPowerBase` in
 * `../../formats/asciimath/transform.ts` and by nothing else — which is why the
 * latex twin (`./latex.ts`) pins the same one-name set. Any other name refuses
 * rather than inventing a fallback; that refusal is the port's `NoMethodError`
 * and keeps a missing subclass visible instead of silently rendering something
 * plausible.
 *
 * ## The prime swap
 *
 * `to_unicodemath` asks `prime_unicode?(parameter_three)` and, when the answer
 * is yes, emits the **superscript before the subscript**. `sup_value` answers
 * the same question and emits the child *bare* — no `^` — because a prime
 * glyph already reads as a superscript. Both halves were exercised, not
 * assumed: the swap is invisible on every non-prime shape.
 *
 * ## Measured
 *
 * Pinned oracle (plurimath 0.11.6, 00c52783), 2026-08-18,
 * `PowerBase.new(one, two, three).to_unicodemath(options: {})`:
 *
 *     (x, 1, 2)                => "x_(1)^(2)"
 *     (x, 1, prime)            => "x′_(1)"          <- swap: sup FIRST, and bare
 *     (x, 1, pprime)           => "x″_(1)"
 *     (x, nil, prime)          => "x′"
 *     (x, nil, 2)              => "x^(2)"
 *     (x, 1, nil)              => "x_(1)"
 *     (x, nil, nil)            => "x"
 *     (nil, 1, 2)              => "_(1)^(2)"
 *     (nil, nil, nil)          => ""
 *     (x, prime, 2)            => "x_(′)^(2)"       <- a prime SUB does not swap
 *     (x, Base(x, 1), 2)       => "x_x_(1)^(2)"
 *     (x, 1, Power(x, 2))      => "x_(1)^x^(2)"
 *     (Power(x, prime), 1, 2)  => "x′_(1)^2"        <- parens dropped, two levels down
 *     (Power(x, 2), 1, 2)      => "x^(2)_(1)^(2)"
 *     (x, Fenced(1), 2)        => "x_(1)^(2)"       <- a fence is its own wrapping
 *     (x, 1, Fenced(1))        => "x_(1)^(1)"
 *     (x, mini(1), 2)          => "x&#x2081;^(2)"   <- mini-sized emits bare
 *     (x, 1, mini(2))          => "x_(1)&#xb2;"
 *     (x, 1, Formula(prime))   => "x_(1)^(′)"       <- a Formula never swaps
 *     (x, "str", 2)            => NoMethodError: undefined method 'mini_sized?'
 *                                 for an instance of String
 */

import { type MathNode, RenderError } from "../../core/index";
import {
  FORMAT,
  isBase,
  isNode,
  isPower,
  miniSized,
  missingRenderer,
  type NodeOf,
  present,
  primeUnicode,
  type RenderContext,
  renderOptionalChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";

const REACHABLE_TERNARY_NAMES: ReadonlySet<string> = new Set(["PowerBase"]);

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): string {
  if (!REACHABLE_TERNARY_NAMES.has(node.name)) throw missingRenderer(node.name, "ternaryFunction");

  // `first_value = sub_value(…) if parameter_two` — Ruby truthiness, so a nil
  // slot contributes nothing at all. Testing `!== undefined` would be wrong:
  // an absent slot arrives here as `null`, and `(x, nil, nil)` would gain an
  // `_` and a `^` with nothing attached to either.
  const sub = present(node.parameterTwo) ? subValue(node, context) : "";
  const sup = present(node.parameterThree) ? supValue(node, context) : "";
  const base = renderOptionalChild(node.parameterOne, context);

  // The swap. `prime_unicode?` is asked of parameterThree, and its answer
  // moves the SUPERSCRIPT in front of the subscript.
  const three = isNode(node.parameterThree) ? node.parameterThree : undefined;
  return primeUnicode(three, renderOptionalChild(node.parameterThree, context))
    ? `${base}${sup}${sub}`
    : `${base}${sub}${sup}`;
}

/** `PowerBase#sub_value` (`power_base.rb:125`) — reads parameterTwo. */
function subValue(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const field = slotNode(node.parameterTwo, "ternaryFunction.parameterTwo");
  if (miniSized(field)) return renderOptionalChild(field, context);
  if (isBase(field)) return `_${renderOptionalChild(field, context)}`;

  return `_${unicodemathParens(field, context) ?? ""}`;
}

/**
 * `PowerBase#sup_value` (`power_base.rb:113`) — reads parameterThree, and has
 * one branch more than `sub_value`: a `Power` **base** whose own second
 * parameter is a prime drops the parens here too, two levels down from the
 * slot being rendered.
 */
function supValue(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const field = slotNode(node.parameterThree, "ternaryFunction.parameterThree");
  const rendered = renderOptionalChild(field, context);
  if (miniSized(field) || primeUnicode(field, rendered)) return rendered;
  if (isPower(field)) return `^${rendered}`;

  // `parameter_one.is_a?(Power) && parameter_one.prime_unicode?(parameter_one.parameter_two)`.
  const one = node.parameterOne;
  if (isPower(one) && isNode(one)) {
    const inner = (one as { readonly parameterTwo?: unknown }).parameterTwo;
    const innerNode = isNode(inner) ? inner : undefined;
    if (primeUnicode(innerNode, innerNode === undefined ? null : context.render(innerNode))) {
      return `^${rendered}`;
    }
  }

  return `^${unicodemathParens(field, context) ?? ""}`;
}

/**
 * The slot, once `if parameter_two` has already passed.
 *
 * The gem calls `mini_sized?` straight on it, so anything that is not a node
 * raises there rather than rendering — measured:
 * `PowerBase.new(x, "str", n2).to_unicodemath(options: {})` raises
 * `NoMethodError: undefined method 'mini_sized?' for an instance of String`.
 * The shared `unicodemathParens` answers `null` for a non-node instead, so the
 * throw has to happen here or a String slot would quietly render as `_`.
 */
function slotNode(field: unknown, at: string): MathNode {
  if (isNode(field)) return field;

  throw new RenderError(
    `${at}: holds ${field === null ? "null" : typeof field} — the gem raises NoMethodError here`,
    FORMAT,
    "ternaryFunction",
  );
}
