import { RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
} from "../../formats/html/render-shared";

const MEASURED_NAMES: ReadonlySet<string> = new Set([
  "Bold",
  "BoldFraktur",
  "BoldItalic",
  "BoldSansSerif",
  "BoldScript",
  "DoubleStruck",
  "Fraktur",
  "Italic",
  "Monospace",
  "Normal",
  "SansSerif",
  "SansSerifBoldItalic",
  "SansSerifItalic",
  "Script",
]);

/** Every measured FontStyle class returns `parameter_one&.to_html` unchanged. */
export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): string | null {
  if (node.name !== undefined && !MEASURED_NAMES.has(node.name)) {
    throw new RenderError(
      `FontStyle alias "${node.name}" has not been measured for HTML`,
      FORMAT,
      node.kind,
    );
  }
  if (node.parameterOne === null || node.parameterOne === undefined) return null;
  return renderChild(node.parameterOne, context, "fontStyle.parameterOne");
}
