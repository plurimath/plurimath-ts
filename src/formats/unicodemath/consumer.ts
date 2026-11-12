/** biome-ignore-all lint/style/useNamingConvention: labeled_tr_* are stage capture schema keys. */
import { describeThrown, requireKnownParseOptions } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import { type LocaleOptions, requireLocaleKey } from "../../formatting/index";
import type { ParseValue } from "../../pegkit/index";
import { type PreprocessedUnicodemath, preprocess } from "./preprocess";
import { finalizeUnicodemathParse, unicodemathTransform } from "./transform";
export interface UnicodemathParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
}
const FORMAT = "unicode";
const KNOWN_OPTION_KEYS: ReadonlySet<string> = new Set<keyof UnicodemathParseOptions>([
  "locale",
  "onUnsupported",
]);
export function validateOptions(options?: UnicodemathParseOptions | null): void {
  requireKnownParseOptions(options, KNOWN_OPTION_KEYS);
  requireLocaleKey(options?.locale);
}
export function preprocessOrParseError(input: string): PreprocessedUnicodemath {
  try {
    return preprocess(input);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(
      error instanceof Error ? error.message : describeThrown(error),
      input,
      FORMAT,
      0,
    );
  }
}
export function transformUnicodemathTree(tree: ParseValue, input: string): FormulaNode {
  try {
    return finalizeUnicodemathParse(unicodemathTransform().apply(tree), input);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(
      error instanceof Error ? error.message : describeThrown(error),
      input,
      FORMAT,
      0,
    );
  }
}

export function postProcessing(tree: ParseValue, label: string): ParseValue {
  return { labeled_tr_value: tree, labeled_tr_id: label };
}
