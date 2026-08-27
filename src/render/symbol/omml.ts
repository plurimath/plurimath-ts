import type { NodeOf, RenderContext } from "../../formats/omml/render-shared";
import { baseSymbolValue, plainRun } from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

/** Base Symbol is dynamic; every named subclass is deferred generated data. */
export function renderSymbol(node: NodeOf<"symbol">): string {
  return baseSymbolValue(node, node.kind);
}

/** `Symbols::Symbol#insert_t_tag`: one `m:r` containing one `m:t`. */
export function renderSymbolInserted(node: NodeOf<"symbol">, _context: RenderContext): XmlElement {
  return plainRun(baseSymbolValue(node, node.kind));
}
