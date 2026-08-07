/**
 * Mirrors `function/fenced.rb` — `Fenced#to_asciimath` (:26): default parens
 * where a slot is missing, the body a space-joined strict list. A second slot
 * that is not a list raises `NoMethodError` in the gem and `RenderError` here
 * (the §5 runtime-boundary mapping).
 */

import { RenderError } from "../../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "./shared";

export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): string {
  const open = present(node.parameterOne)
    ? s(renderChild(node.parameterOne, context, "fenced.parameterOne"))
    : "(";
  const close = present(node.parameterThree)
    ? s(renderChild(node.parameterThree, context, "fenced.parameterThree"))
    : ")";
  const two = node.parameterTwo;
  let body = "";
  if (two !== null && two !== undefined) {
    if (!Array.isArray(two)) {
      throw new RenderError(
        `fenced.parameterTwo: is ${describeSlot(two)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    body = two.map((item) => s(renderChild(item, context, "fenced.parameterTwo"))).join(" ");
  }
  return `${open}${body}${close}`;
}
