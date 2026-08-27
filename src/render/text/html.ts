import { RenderError } from "../../core/index";
import { describeSlot, FORMAT, type NodeOf } from "../../formats/html/render-shared";

/** `Text#to_html`: the stored parameter, unchanged; nil stays nil. */
export function renderText(node: NodeOf<"text">): string | null {
  const value = node.parameterOne;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new RenderError(
    `text.parameterOne: holds ${describeSlot(value)}, not a reproducible text value`,
    FORMAT,
    node.kind,
  );
}
