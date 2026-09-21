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

import type { MathNode } from "../../core/index";
import {
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
  slotCrash,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";

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
    // `def to_unicodemath(**) = ""` (`rule.rb:37`): no slot is read at all.
    case "Rule":
      return "";
    default:
      throw missingRenderer(node.name, "ternaryFunction");
  }
}

function renderPowerBase(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
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
  return primeUnicode(three) ? `${base}${sup}${sub}` : `${base}${sub}${sup}`;
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
  if (miniSized(field) || primeUnicode(field)) return rendered;
  if (isPower(field)) return `^${rendered}`;

  // `parameter_one.is_a?(Power) && parameter_one.prime_unicode?(parameter_one.parameter_two)`.
  const one = node.parameterOne;
  if (isPower(one) && isNode(one)) {
    const inner = (one as { readonly parameterTwo?: unknown }).parameterTwo;
    const innerNode = isNode(inner) ? inner : undefined;
    if (primeUnicode(innerNode)) {
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

  throw slotCrash(at, field, "ternaryFunction");
}

/**
 * `Limits#to_unicodemath` (`limits.rb:35`): the base, then the superscript
 * (`┴`) BEFORE the subscript (`┬`), each only when its slot is truthy.
 * `Limits#sup_value` (`limits.rb:59`) drops the parens for a `Power`
 * superscript and for any superscript when the base is a `Power` over a prime
 * (the same two-level look `PowerBase#sup_value` takes); `sub_value` (`:71`)
 * drops them for a `Base` subscript. Slots are read without `&.`, so one that
 * is not a node raises.
 */
function renderLimits(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const base = renderOptionalChild(node.parameterOne, context);
  return `${base}${limitsSup(node, context)}${limitsSub(node, context)}`;
}

function limitsSup(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const field = node.parameterThree;
  if (!present(field)) return "";
  const slot = slotNode(field, "ternaryFunction.parameterThree");
  const rendered = renderOptionalChild(slot, context);
  if (isPower(slot)) return `┴${rendered}`;
  const one = node.parameterOne;
  if (isPower(one) && isNode(one)) {
    const inner = (one as { readonly parameterTwo?: unknown }).parameterTwo;
    if (primeUnicode(isNode(inner) ? inner : undefined)) return `┴${rendered}`;
  }
  return `┴${unicodemathParens(slot, context) ?? ""}`;
}

function limitsSub(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const field = node.parameterTwo;
  if (!present(field)) return "";
  const slot = slotNode(field, "ternaryFunction.parameterTwo");
  if (isBase(slot)) return `┬${renderOptionalChild(slot, context)}`;
  return `┬${unicodemathParens(slot, context) ?? ""}`;
}

/**
 * `Multiscript#to_unicodemath` (`multiscript.rb:70`): the prescript
 * subscript, the prescript superscript, one space, then the base.
 *
 * `unicode_valid_value?` (`:118`) asks the script `empty?` UNGUARDED, so a nil
 * script raises NoMethodError (an empty list is the way to say "no script");
 * `valid_value_exist?` inside it is nil or false for every field, so the test
 * is just "not empty". A script that answers `empty?` but not `map` also
 * raises, so anything but a list refuses here.
 */
function renderMultiscript(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const two = scriptNodes(node.parameterTwo, "ternaryFunction.parameterTwo");
  const three = scriptNodes(node.parameterThree, "ternaryFunction.parameterThree");
  const sub = two.length > 0 ? multiscriptSub(two, context) : "";
  const sup = three.length > 0 ? multiscriptSup(two, three, context) : "";
  return `${sub}${sup} ${renderOptionalChild(node.parameterOne, context)}`;
}

/** The script as a list of nodes; anything else is a NoMethodError in the gem. */
function scriptNodes(field: unknown, at: string): readonly unknown[] {
  if (Array.isArray(field)) return field;
  throw slotCrash(at, field, "ternaryFunction");
}

/**
 * `Utility.filter_values(list)` (`utility.rb:192`): nils and nesting dropped,
 * then one element stays itself and several become a `Formula`. Only two
 * answers are ever asked of the result — `mini_sized?`, which a `Formula`
 * gives from its FIRST element, and `is_a?(Power)` — so the `Formula` is not
 * built: `miniSized` of the first element stands for it, and it is never a
 * `Power`. An empty list gives nil, which is neither.
 */
function filtered(list: readonly unknown[]): {
  readonly mini: boolean;
  readonly power: boolean;
  readonly node?: MathNode;
} {
  const items = list
    .flat(Number.POSITIVE_INFINITY)
    .filter((item) => item !== null && item !== undefined);
  const first = items[0];
  const firstNode = isNode(first) ? first : undefined;
  if (items.length > 1) return { mini: miniSized(firstNode), power: false };
  if (items.length === 0) return { mini: false, power: false };
  return {
    mini: miniSized(firstNode),
    power: isPower(first),
    ...(firstNode === undefined ? {} : { node: firstNode }),
  };
}

function renderList(list: readonly unknown[], context: RenderContext, at: string): string {
  return list
    .map((item, index) => renderOptionalChildStrict(item, context, `${at}[${index}]`))
    .join("");
}

/** `param.to_unicodemath(options:)` inside a `map`: a nil element raises. */
function renderOptionalChildStrict(item: unknown, context: RenderContext, at: string): string {
  if (!isNode(item)) throw slotCrash(at, item, "ternaryFunction");
  return renderOptionalChild(item, context);
}

/**
 * `Multiscript#sub_value` (`multiscript.rb:136`). The `is_a?(Base)` arm tests
 * `parameter_two` itself, a list, so it never holds.
 */
function multiscriptSub(two: readonly unknown[], context: RenderContext): string {
  const field = filtered(two);
  const value = renderList(two, context, "ternaryFunction.parameterTwo");
  return field.mini ? value : `_(${value})`;
}

/**
 * `Multiscript#sup_value` (`multiscript.rb:122`). It filters `parameter_TWO`
 * for `field` — the gem's own slip, mirrored — so the paren, `Power` and prime
 * tests read the SUBSCRIPT while the text is the superscript's.
 */
function multiscriptSup(
  two: readonly unknown[],
  three: readonly unknown[],
  context: RenderContext,
): string {
  const field = filtered(two);
  const value = renderList(three, context, "ternaryFunction.parameterThree");
  if (field.mini || primeUnicode(field.node)) return value;
  if (field.power) return `^${value}`;
  return `^(${value})`;
}
