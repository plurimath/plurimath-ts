import type { NodeOf, RenderContext } from "../../formats/omml/render-shared";
import { baseSymbolValue, plainRun } from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

const INVISIBLE_TIMES_ENTITY = "&#x2062;";

/** Base Symbol is dynamic; valueless named subclasses need deferred generated data. */
export function renderSymbol(node: NodeOf<"symbol">): string | null {
  if (node.value === INVISIBLE_TIMES_ENTITY) return null;
  return baseSymbolValue(node, node.kind);
}

/** `Symbols::Symbol#insert_t_tag`: one `m:r` containing one `m:t`. */
export function renderSymbolInserted(
  node: NodeOf<"symbol">,
  _context: RenderContext,
): XmlElement | null {
  if (node.value === INVISIBLE_TIMES_ENTITY) return null;
  return plainRun(baseSymbolValue(node, node.kind));
}
