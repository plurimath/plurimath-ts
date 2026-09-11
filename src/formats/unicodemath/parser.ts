/** biome-ignore-all lint/style/useNamingConvention: the `labeled_tr_*` keys are
 * Parslet tree keys — Ruby's snake_case is the schema, and `transform.rb:598-612`
 * matches them under exactly these names. */

/**
 * The UnicodeMath format entry point (ARCHITECTURE.md §4):
 * preprocess → grammar → transform → an immutable `FormulaNode`.
 *
 * The pipeline mirrors the gem's layers exactly:
 *
 *   - `UnicodeMath::Parser#initialize` (`unicode_math/parser.rb:10-22`)
 *     preprocesses in the CONSTRUCTOR, so `#text` is already normalised before
 *     `#parse` runs. It also sets `@splitted`, the equation label cut off the
 *     end of the input — see `preprocess.ts`.
 *   - `UnicodeMath::Parser#parse` (`:24-32`): parse the preprocessed text,
 *     wrap the tree in `post_processing` WHEN a label was cut, apply the
 *     transform, and wrap the result in `Math::Formula.new(Array(...))`.
 *   - `Plurimath::Math.parse_formula` (`math.rb:62-66`): the returned formula
 *     carries `input_string` — the CALLER's text, not the preprocessed form.
 *
 * Failure positions: `ParseFailed.index` is an offset into the preprocessed
 * text, and preprocessing changes lengths almost everywhere (it also TRUNCATES
 * at the first `#`), so every position is mapped back through the `SourceMap`
 * before it reaches a caller as `ParseError.index` (§5).
 *
 * The gem lets `Parslet::ParseFailed` escape uncaught — there is no `rescue`
 * anywhere under `lib/plurimath/unicode_math/` — and `Plurimath::Math.parse`
 * turns it into a `ParseError` at the public boundary (`math.rb:45-49`). That
 * is the boundary this function stands at, so a refusal is a `ParseError`.
 */

import { describeThrown } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import type { LocaleOptions } from "../../formatting/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import { parseUnicodemathPreprocessed } from "./grammar";
import { type PreprocessedUnicodemath, preprocess } from "./preprocess";
import { finalizeUnicodemathParse, unicodemathTransform } from "./transform";

/**
 * The gem's own parse-type token for this format.
 *
 * `unicode`, not `unicodemath`: `Math::VALID_TYPES` keys it `:unicode`, and
 * `Math.parse` builds its `ParseError` from that token — measured on the pinned
 * clone, `Plurimath::Math.parse("", :unicode)` raises with the message
 * "Failed to parse the following formula with type `unicode`". The render side's
 * `render-shared.ts` `FORMAT = "unicodemath"` names the OUTPUT format and is a
 * different thing; `compat/index.ts`'s `Format` union uses `"unicode"` for the
 * same reason this does.
 */
const FORMAT = "unicode";

/**
 * Locale (the decimal marker the grammar reads at parse time) plus the
 * deferred-construct hook §5 promises on every parser.
 *
 * `onUnsupported` is accepted and never fired today: this slice's refusals all
 * go through the transform's `no rule matched` throw, which is an error rather
 * than a degraded answer, and there is no construct it silently substitutes for.
 * It is in the signature so the shape matches the other parsers rather than to
 * describe a behaviour that exists.
 */
export interface UnicodemathParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
}

/**
 * Preprocessing, with its failures already normalised.
 *
 * This exists because preprocessing can THROW, and every arm below needs it to
 * throw the same thing the rest of the pipeline does. `preprocess` raises a
 * bare `Error` when the input splits to no fields — the point at which the gem
 * raises `NoMethodError` on nil (`parser.rb:50`) — and a `TypeError` for a
 * non-string. Neither carries `code` or `format`, so calling `preprocess`
 * OUTSIDE the error handling would hand a consumer branching on
 * `error.code === "PARSE_ERROR"` something it cannot recognise.
 *
 * The gem has no such gap: `Math.parse` rescues `StandardError` around the whole
 * construction, and `NoMethodError` is a `StandardError`. Measured on the pinned
 * clone — `Plurimath::Math.parse("", :unicode)` and
 * `Plurimath::Math.parse("#", :unicode)` both raise
 * `Plurimath::Math::ParseError`, not `NoMethodError`.
 *
 * Offset 0: a preprocessing failure has no position, and there is no
 * preprocessed text to map one through yet.
 */
function preprocessOrParseError(input: string): PreprocessedUnicodemath {
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

/**
 * `UnicodeMath::Parser#post_processing` (`parser.rb:36-41`), applied only when
 * the input carried a `#` label.
 *
 * The gem wraps the WHOLE tree rather than merging into it, and `transform.rb`
 * picks the wrapper up at `:598-612`. Those two rules are not in this slice, so
 * a labelled input reaches `finalizeUnicodemathParse` as an unmatched hash and
 * is refused there, naming `{labeled_tr_id=…,labeled_tr_value=…}`. That is the
 * intended outcome, not a gap being papered over: the gem ANSWERS these inputs
 * (measured — `Plurimath::Math.parse("a#b", :unicode).to_latex` is
 * `"\\mlabeledtr{a}{\\text{b}}"`), so answering them differently would be worse
 * than refusing.
 *
 * The label is a plain string, as `@splitted` is a plain Ruby `String` rather
 * than a `Parslet::Slice` — it never went through the grammar.
 */
function postProcessing(tree: ParseValue, label: string): ParseValue {
  return { labeled_tr_value: tree, labeled_tr_id: label };
}

/**
 * Preprocesses and parses UnicodeMath into the raw Parslet-shaped tree — the
 * pipeline's first half, exposed for the grammar and preprocessing suites.
 * `ParseError.index` already indexes the ORIGINAL input here.
 */
export function parseUnicodemathTree(
  input: string,
  options?: UnicodemathParseOptions | null,
): ParseValue {
  const { text, label, map } = preprocessOrParseError(input);
  const tree = parsePreprocessed(input, text, map, options);
  return label === undefined ? tree : postProcessing(tree, label);
}

/**
 * `Plurimath::Math.parse(input, :unicode)`'s observable result.
 *
 * The transform is wrapped as well as the grammar, because `Plurimath::Math.parse`
 * wraps everything (`math.rb:45-49`):
 *
 * ```ruby
 * rescue ParseError
 *   raise
 * rescue StandardError
 *   raise ParseError.new(text, type), cause: nil
 * ```
 *
 * That arm is live here. `finalizeUnicodemathParse` throws a plain `Error` for
 * every rule family outside this slice — the table/matrix rules, the
 * `labeled_tr` pair above — and without this arm the port would surface that
 * bare `Error` instead of a `ParseError`, and a caller branching on `code` would
 * miss it.
 *
 * The failure is attributed to offset 0: unlike a grammar failure, a transform
 * failure carries no position — the gem's own `ParseError` for these has none
 * either.
 */
export function parseUnicodemath(
  input: string,
  options?: UnicodemathParseOptions | null,
): FormulaNode {
  const tree = parseUnicodemathTree(input, options);
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

function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: UnicodemathParseOptions | null,
): ParseValue {
  try {
    return parseUnicodemathPreprocessed(text, options);
  } catch (error) {
    if (error instanceof ParseFailed) {
      throw new ParseError(error.message, input, FORMAT, map.toOriginal(error.index));
    }
    throw error;
  }
}
