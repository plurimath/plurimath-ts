import { RenderError } from "../../core/index";
import { FORMAT, type NodeOf } from "../../formats/html/render-shared";

/** `Symbols::Symbol#to_html`: the stored value, unchanged; nil stays nil. */
export function renderSymbol(node: NodeOf<"symbol">): string | null {
  if (node.id !== undefined && node.id !== "Symbol" && node.id !== "Paren") {
    throw new RenderError(
      `Symbol "${node.id}" needs generated HTML data, which belongs to phase two`,
      FORMAT,
      node.kind,
    );
  }
  const value = node.value;
  if (value !== null && value !== undefined) return value;
  return null;
}
