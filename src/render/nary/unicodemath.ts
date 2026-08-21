/**
 * Mirrors `function/nary.rb` — `Nary#to_unicodemath` (:83).
 *
 * The kind where a child's answer reorders the parent's output:
 * `prime_unicode?(parameter_three)` emits the **superscript before the
 * subscript**. Nothing else in the port does that, which is why the predicate
 * lives in `render-shared.ts` with its own measured spec.
 *
 * `Nary` extends `Core` rather than `TernaryFunction`, so it carries four
 * parameters, and it defines its own `sub_value`/`sup_value` that differ from
 * `Int`'s: `sup_value` has an extra branch reaching *two* levels down
 * (`parameter_one.prime_unicode?(parameter_one.parameter_two)`).
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  isBase,
  isNode,
  isPower,
  miniSized,
  naryandValue,
  present,
  primeUnicode,
  renderOptionalChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";

/** `Nary#sub_value` (`nary.rb:202`) — reads parameterTwo, not parameterOne. */
function subValue(node: NodeOf<"nary">, context: RenderContext): string {
  const field = node.parameterTwo;
  if (miniSized(isNode(field) ? field : undefined)) return renderOptionalChild(field, context);
  if (isBase(field)) return `_${renderOptionalChild(field, context)}`;

  return `_${unicodemathParens(field, context) ?? ""}`;
}

/** `Nary#sup_value` (`nary.rb:190`) — reads parameterThree. */
function supValue(node: NodeOf<"nary">, context: RenderContext): string {
  const field = node.parameterThree;
  const asNode = isNode(field) ? field : undefined;
  const rendered = renderOptionalChild(field, context);
  if (miniSized(asNode) || primeUnicode(asNode)) return rendered;
  if (isPower(field)) return `^${rendered}`;

  // The two-level branch: parameterOne being a Power whose OWN second
  // parameter is a prime also suppresses the parens.
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

export function renderNary(node: NodeOf<"nary">, context: RenderContext): string {
  const sub = !present(node.parameterTwo) ? "" : subValue(node, context);
  const sup = !present(node.parameterThree) ? "" : supValue(node, context);
  const operator = renderOptionalChild(node.parameterOne, context);
  const body = naryandValue(node.parameterFour, context);

  // The swap. `prime_unicode?` is asked of parameterThree, and its answer
  // moves the SUPERSCRIPT in front of the subscript.
  return primeUnicode(isNode(node.parameterThree) ? node.parameterThree : undefined)
    ? `${operator}${sup}${sub}${body}`
    : `${operator}${sub}${sup}${body}`;
}
