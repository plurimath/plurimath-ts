/**
 * Mirrors `function/font_style.rb` — `FontStyle#to_unicodemath` (:57).
 *
 * The gem resolves the font by comparing Ruby **class objects**
 * (`font_classes`, `:276`), then finds the first name that appears in
 * `FONTS_CLASSES` and prefixes it with a backslash (`supported_fonts`, `:222`).
 * There is no class identity to compare here, so the port matches on the font
 * name the node already carries.
 *
 * `supported_fonts` falls through to **nil** when no name matches, and the gem
 * interpolates that nil as empty — so an unrecognised font renders its child
 * with no prefix at all rather than failing.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { renderOptionalChild } from "../../formats/unicodemath/render-shared";
import { UNICODEMATH_FONTS_CLASSES } from "../../generated/unicodemath/render-tables";

const SUPPORTED = new Set(UNICODEMATH_FONTS_CLASSES);

export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): string {
  return `${fontPrefix(node.parameterTwo)}${renderOptionalChild(node.parameterOne, context)}`;
}

function fontPrefix(style: unknown): string {
  if (typeof style !== "string") return "";
  return SUPPORTED.has(style) ? `\\${style}` : "";
}
