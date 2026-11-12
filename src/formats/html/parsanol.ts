/** Initialized HTML PARG consumer. Runtime construction and loading belong to the caller. */
import { type FormulaNode, ParseError } from "../../core/index";
import { decimalMarkerFor } from "../../formatting/index";
import { bytePositions, positionAt } from "../../pegkit/stage-captures";
import { type HtmlParseOptions, normalize, transformHtmlTree, validateOptions } from "./consumer";
import { lowerHtmlCaptures } from "./parg-captures";

export type { HtmlParseOptions } from "./consumer";

export interface HtmlPargRuntime {
  /** Syntax refusals return an envelope; engine/resource failures throw unchanged. */
  parseShapeWithCompatibility(
    input: string,
    compatibility: "strict",
  ):
    | { ok: true; shape: unknown }
    | { ok: false; error: { offset: number; ranked: readonly unknown[] } };
}

/** Select the initialized artifact produced for the requested decimal marker. */
export function createHtmlParser(
  runtimeForDecimal: (decimal: string) => HtmlPargRuntime,
): (input: string, options?: HtmlParseOptions | null) => FormulaNode {
  return (input, options) => {
    validateOptions(options);
    const { text, map } = normalize(input);
    const runtime = runtimeForDecimal(decimalMarkerFor(options?.locale));
    const result = runtime.parseShapeWithCompatibility(text, "strict");
    if (!result.ok) {
      const offset = positionAt(bytePositions(text), result.error.offset);
      throw new ParseError("HTML grammar refused the input", input, "html", map.toOriginal(offset));
    }
    return transformHtmlTree(lowerHtmlCaptures(result.shape, text), input);
  };
}
