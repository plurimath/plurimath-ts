import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  HTML_TEXT_SYMBOLS,
  type NodeOf,
} from "../../formats/html/render-shared";

const UNICODE_TOKEN = /unicode\[:(\w+)\]/g;

/** `Text#to_html`: plain text stays unchanged; nil stays nil. */
export function renderText(node: NodeOf<"text">): string | null {
  const value = node.parameterOne;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.replace(
      UNICODE_TOKEN,
      (_token, name: string) => HTML_TEXT_SYMBOLS.get(name) ?? "",
    );
  }
  throw new RenderError(
    `text.parameterOne: holds ${describeSlot(value)}, not a reproducible text value`,
    FORMAT,
    node.kind,
  );
}
