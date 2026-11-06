/**
 * The AsciiMath format entry point (ARCHITECTURE.md §4):
 * preprocess → grammar → transform → an immutable `FormulaNode`.
 *
 * The pipeline mirrors the gem's two layers exactly:
 *
 *   - `Asciimath::Parser#parse` (`asciimath/parser.rb:17-23`): parse the preprocessed
 *     text, apply the transform, and wrap anything that is not already a
 *     formula in `Formula.new` — including its quirks (a non-array is boxed,
 *     and a leading `Left` clears `left_right_wrapper`).
 *   - `Plurimath::Math.parse_formula` (`math.rb:62-66`): the returned formula
 *     carries `input_string` — the CALLER's text, not the preprocessed form.
 *
 * Failure positions use the root-prefix boundary in the preprocessed text.
 * Four of the five preprocessing rewrites change lengths, so every
 * position is mapped back through the `SourceMap` before it reaches a caller
 * as `ParseError.index` (§5). `test/formats/asciimath/failure-parity.spec.ts`
 * pins that contract against the gem's 156-input failure sweep; this module
 * is the composition that spec used to carry as a local helper.
 */

import { requireKnownParseOptions } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import { InvalidUncertaintyError } from "../../core/uncertainty";
import { decimalMarkerFor, type LocaleOptions, requireLocaleKey } from "../../formatting/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import { asciimathGrammar } from "./grammar";
import { preprocess } from "./preprocess";
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
function validateOptions(options?: AsciimathParseOptions | null): void {
  requireKnownParseOptions(options, KNOWN_OPTION_KEYS);
  requireLocaleKey(options?.locale);
}

/**
 * Parses AsciiMath into the raw Parslet-shaped tree — the pipeline's first
 * half, exposed for the failure-parity suite, which compares trees the gem's
 * Parslet layer produced. `ParseError.index` already indexes the ORIGINAL
 * input here; `parseAsciimath` builds on this and adds the transform.
 */
export function parseAsciimathTree(
  input: string,
  options?: AsciimathParseOptions | null,
): ParseValue {
  validateOptions(options);
  const { text, map } = preprocess(input);
  return parsePreprocessed(input, text, map, options);
}

/** `Plurimath::Math.parse(input, :asciimath)`'s observable result. */
export function parseAsciimath(input: string, options?: AsciimathParseOptions | null): FormulaNode {
  validateOptions(options);
  const { text, map } = preprocess(input);
  ambiguousUncertaintyComma(input, text, options);
  const tree = parsePreprocessed(input, text, map, options);
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
function ambiguousUncertaintyComma(
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

function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: AsciimathParseOptions | null,
): ParseValue {
  const grammar = asciimathGrammar(options ?? undefined);
  try {
    return grammar.root.parse(text);
  } catch (error) {
    // amath reports the deepest leaf of the root's failure cause, which is
    // pegkit's `ParseFailed.index`; it indexes the preprocessed text.
    if (error instanceof ParseFailed)
      throw new ParseError(error.message, input, "asciimath", map.toOriginal(error.index));
    throw error;
  }
}
