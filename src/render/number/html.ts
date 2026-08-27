import { interpolatedValue, type NodeOf } from "../../formats/html/render-shared";

/** `Number#to_html`: raw value through Ruby's text-number spelling; nil is empty. */
export function renderNumber(node: NodeOf<"number">): string {
  return interpolatedValue(node.value, node.kind, "number.value");
}
