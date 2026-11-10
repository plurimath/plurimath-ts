import { describeThrown, requireKnownParseOptions } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import { UndecodableEntityError } from "../../core/nodes";
import { type LocaleOptions, requireLocaleKey } from "../../formatting/index";
import type { ParseValue } from "../../pegkit/index";
import { preprocess } from "./preprocess";
import { finalizeLatexParse, latexTransform } from "./transform";
export interface LatexParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
}
const KNOWN_OPTION_KEYS: ReadonlySet<string> = new Set<keyof LatexParseOptions>([
  "locale",
  "onUnsupported",
]);
export function validateOptions(options?: LatexParseOptions | null): void {
  requireKnownParseOptions(options, KNOWN_OPTION_KEYS);
  requireLocaleKey(options?.locale);
}
export function preprocessOrParseError(input: string): ReturnType<typeof preprocess> {
  try {
    return preprocess(input);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    // Carry the offset across rather than inventing one. `UndecodableEntityError`
    // records the UTF-16 offset of the `&` it could not decode, which is exactly
    // what `ParseError.index` is documented to hold — an offset into the ORIGINAL
    // input. Measured: `preprocess("x+&#x110000;")` throws with `index` 2, and
    // this used to report 0, telling a caller the failure was at the start of a
    // string where the reference is two characters in.
    throw new ParseError(
      error instanceof Error ? error.message : describeThrown(error),
      input,
      "latex",
      error instanceof UndecodableEntityError ? error.index : 0,
    );
  }
}
export function transformLatexTree(tree: ParseValue, input: string): FormulaNode {
  try {
    const transformed = latexTransform().apply(tree);
    return finalizeLatexParse(transformed, input);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(
      error instanceof Error ? error.message : describeThrown(error),
      input,
      "latex",
      0,
    );
  }
}
