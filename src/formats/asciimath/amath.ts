/** Initialized shared amath PARG/WASM consumer. No runtime loading or fallback. */
import type { FormulaNode } from "../../core/index";
import { type AsciimathParseOptions, transformAsciimathTree } from "./consumer";
import { type AmathSyncBinding, parseStageTree } from "./stage-tree";

export type { AsciimathParseOptions } from "./consumer";
export type { AmathCapture, AmathSyncBinding } from "./stage-tree";

/**
 * The caller initializes its Node/browser binding before creating this parser.
 * The returned parser preserves the synchronous Plurimath format contract.
 */
export function createAsciimathParser(
  binding: AmathSyncBinding,
): (input: string, options?: AsciimathParseOptions | null) => FormulaNode {
  return (input, options) => transformAsciimathTree(parseStageTree(binding, input, options), input);
}
