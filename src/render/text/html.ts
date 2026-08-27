import { RenderError } from "../../core/index";
import { describeSlot, FORMAT, type NodeOf } from "../../formats/html/render-shared";

const UNICODE_TOKEN = /unicode\[:\w+\]/;

/** `Text#to_html`: plain text stays unchanged; nil stays nil. */
export function renderText(node: NodeOf<"text">): string | null {
  const value = node.parameterOne;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (UNICODE_TOKEN.test(value)) {
      throw new RenderError(
        "text.parameterOne: unicode[:name] substitution needs generated HTML data from phase two",
        FORMAT,
        node.kind,
      );
    }
    return value;
  }
  throw new RenderError(
    `text.parameterOne: holds ${describeSlot(value)}, not a reproducible text value`,
    FORMAT,
    node.kind,
  );
}
