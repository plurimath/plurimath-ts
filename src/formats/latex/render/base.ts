/**
 * Mirrors `function/base.rb` — `Base#to_latex` (:55): `_{…}` always; a
 * Formula first slot (Mrow and Mstyle included) gets braced.
 */

import { type NodeOf, present, type RenderContext, renderChild, s, slotKind } from "./shared";

export function renderBase(node: NodeOf<"base">, context: RenderContext): string {
  let one = present(node.parameterOne)
    ? renderChild(node.parameterOne, context, "base.parameterOne")
    : null;
  const oneKind = slotKind(node.parameterOne);
  if (oneKind === "formula" || oneKind === "mrow") one = `{${s(one)}}`;
  const two = present(node.parameterTwo)
    ? renderChild(node.parameterTwo, context, "base.parameterTwo")
    : null;
  return `${s(one)}_{${s(two)}}`;
}
