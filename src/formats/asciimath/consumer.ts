/** Shared consumer policy and Formula mapping; no grammar or runtime loading. */
import { requireKnownParseOptions } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import { InvalidUncertaintyError } from "../../core/uncertainty";
import { decimalMarkerFor, type LocaleOptions, requireLocaleKey } from "../../formatting/index";
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
    throw error;
  }
}

/**
 * An uncertainty call. amath splits letters, so `xustd(1,5)` is `x` followed
 * by `ustd(1,5)`: a preceding letter does not exempt it.
 */
const UNCERTAINTY_CALL = /u(?:std|exp|cov)\(/g;

/**
 * `Asciimath::Parser#ambiguous_uncertainty_comma!` (`asciimath/parser.rb`),
 * which `Parser#parse` runs on the preprocessed text before the grammar.
 * Uncertainty arguments use "." as the decimal mark and "," between
 * arguments. Under a locale whose decimal mark is not ".", a separator comma
 * directly followed by a digit (`ustd(1,5)`, `uexp(10,0, 0,3, 2)`) most likely
 * is a decimal comma: amath would read it as a separator, or give up on the
 * call and read letters (`ustd(1,230, 0,004)` under fr). The gem raises
 * `Math::AmbiguousDecimalError`, a `ParseError` with no position, instead of
 * guessing; other input is not checked.
 *
 * It is not part of `parseAsciimathTree`: that is amath's own Parslet layer,
 * which has no such check.
 */
export function ambiguousUncertaintyComma(
  input: string,
  text: string,
  options?: AsciimathParseOptions | null,
): void {
  const locale = requireLocaleKey(options?.locale);
  if (locale === null) return;
  const decimal = decimalMarkerFor(locale);
  if (decimal === ".") return;
  for (const match of text.matchAll(UNCERTAINTY_CALL)) {
    const start = match.index;
    if ((text.slice(0, start).match(/"/g)?.length ?? 0) % 2 === 1) continue;
    const call = uncertaintyCall(text, start, start + match[0].length);
    if (call === null) continue;
    throw new ParseError(
      "[plurimath] uncertainty forms use '.' as the decimal mark; the comma " +
        `before a digit in ${call} is ambiguous with decimal ` +
        `'${decimal}' (locale ${locale}), ` +
        "write the value with '.' and separate arguments with ', '",
      input,
      "asciimath",
      0,
    );
  }
}

/**
 * `uncertainty_call`: the call text from `start` to its closing parenthesis
 * if a top-level argument separator in it is directly followed by a digit,
 * else null.
 */
function uncertaintyCall(text: string, start: number, from: number): string | null {
  let index = from;
  let depth = 1;
  let quoted = false;
  let ambiguous = false;
  while (index < text.length && depth > 0) {
    const char = text[index];
    if (char === '"') quoted = !quoted;
    if (!quoted) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      ambiguous ||= depth === 1 && char === "," && /^[0-9]$/.test(text[index + 1] ?? "");
    }
    index += 1;
  }
  return ambiguous ? text.slice(start, index) : null;
}
