/** Shared consumer policy and Formula mapping; no grammar or runtime loading. */
import { requireKnownParseOptions } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import { isStackOverflow } from "../../core/stack-overflow";
import { InvalidUncertaintyError } from "../../core/uncertainty";
import { decimalMarkerFor, type LocaleOptions, requireLocaleKey } from "../../formatting/index";
import { STACK_EXHAUSTED_MESSAGE } from "../../pegkit/atom";
import type { ParseValue } from "../../pegkit/index";
import { asciimathTransform, finalizeAsciimathParse } from "./transform";

/**
 * Locale (the decimal marker the grammar reads at parse time) plus the
 * retained diagnostic hook. Native UnitsML does not report an unsupported construct.
 */
export interface AsciimathParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
}

/** The keys `validateOptions` accepts: the declared keys of `AsciimathParseOptions`. */
const KNOWN_OPTION_KEYS: ReadonlySet<string> = new Set<keyof AsciimathParseOptions>([
  "locale",
  "onUnsupported",
]);

/**
 * `Math.parse`'s option checks (`math.rb:34-41`), in the gem's order and
 * before preprocessing: unknown KEYS first (`ParseOptionError`), then the
 * `locale` VALUE (`UnsupportedLocaleError`). Measured on the oracle at
 * `00c52783`: `Math.parse(text, :asciimath, locale: "xx", foo: 1)` raises
 * `ParseOptionError`, and either option failure is reported ahead of a
 * preprocessing or grammar failure in `text`. Same check as `parseHtml`'s.
 */
export function validateOptions(options?: AsciimathParseOptions | null): void {
  requireKnownParseOptions(options, KNOWN_OPTION_KEYS);
  requireLocaleKey(options?.locale);
}

/** Shared consumer mapping for the legacy and external artifact runtimes. */
export function transformAsciimathTree(tree: ParseValue, input: string): FormulaNode {
  try {
    const transformed = asciimathTransform().apply(tree);
    return finalizeAsciimathParse(transformed, input);
  } catch (error) {
    if (error instanceof InvalidUncertaintyError) {
      // The gem's constructor raises during the transform; `Math.parse`
      // reports it as `Math::ParseError`, with no position.
      throw new ParseError(error.message, input, "asciimath", 0);
    }
    if (error instanceof ParseError && error.format === "unitsml") {
      // Inline UnitsML construction fails at Math.parse's outer boundary.
      // The reference carries no position for this transform failure.
      throw new ParseError(error.message, input, "asciimath", 0);
    }
    if (isStackOverflow(error)) {
      // A flat run the stage accepts can still nest too deep for the
      // recursive transform; refuse it typed, as the in-tree grammar did.
      throw new ParseError(STACK_EXHAUSTED_MESSAGE, input, "asciimath", 0);
    }
    throw error;
  }
}
