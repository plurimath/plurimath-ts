/**
 * The LaTeX format entry point (ARCHITECTURE.md §4):
 * preprocess → grammar → transform → an immutable `FormulaNode`.
 *
 * The pipeline mirrors the gem's three layers exactly:
 *
 *   - `Latex::Parser#initialize` (`latex/parser.rb:10-13`) preprocesses in the
 *     CONSTRUCTOR, so `#text` is already normalised before `#parse` runs.
 *   - `Latex::Parser#parse` (`:15-21`): parse the preprocessed text, apply the
 *     transform, box a non-array, and wrap the result in `Math::Formula.new`.
 *     Note the wrap is UNCONDITIONAL — unlike AsciiMath's, which keeps a
 *     formula the transform already produced. A LaTeX formula is therefore
 *     always one level deeper than the transform's own output.
 *   - `Plurimath::Math.parse_formula` (`math.rb:62-66`): the returned formula
 *     carries `input_string` — the CALLER's text, not the preprocessed form.
 *
 * Failure positions: `ParseFailed.index` is an offset into the preprocessed
 * text, and preprocessing changes lengths almost everywhere, so every position
 * is mapped back through the `SourceMap` before it reaches a caller as
 * `ParseError.index` (§5).
 *
 * The gem lets `Parslet::ParseFailed` escape uncaught — there is no `rescue`
 * anywhere under `lib/plurimath/latex/` — and `Plurimath::Math.parse` turns it
 * into a `ParseError` at the public boundary (`math.rb:44-49`). That is the
 * boundary this function stands at, so a refusal is a `ParseError`.
 */

import { describeThrown } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import { UndecodableEntityError } from "../../core/nodes";
import type { LocaleOptions } from "../../formatting/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import { latexGrammar } from "./grammar";
import { preprocess } from "./preprocess";
import { finalizeLatexParse, latexTransform } from "./transform";

/**
 * Locale (the decimal marker the grammar reads at parse time) plus the
 * deferred-construct hook §5 promises on every parser.
 *
 * `onUnsupported` is accepted and never fired today: `latex/parse.rb` has no
 * commented-out alternative and no construct this port declines, unlike
 * AsciiMath's UnitsML branch. It is in the signature so the shape matches the
 * other parsers rather than to describe a behaviour that exists.
 */
export interface LatexParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
}

/**
 * Preprocesses and parses LaTeX into the raw Parslet-shaped tree — the
 * pipeline's first half, exposed for the grammar and preprocessing suites.
 * `ParseError.index` already indexes the ORIGINAL input here.
 */
export function parseLatexTree(input: string, options?: LatexParseOptions | null): ParseValue {
  const { text, map } = preprocessOrParseError(input);
  return parsePreprocessed(input, text, map, options);
}

/**
 * `Plurimath::Math.parse(input, :latex)`'s observable result.
 *
 * The transform is wrapped as well as the grammar, because `Plurimath::Math.parse`
 * wraps everything (`math.rb:44-49`):
 *
 * ```ruby
 * rescue ParseError
 *   raise
 * rescue StandardError
 *   raise ParseError.new(text, type), cause: nil
 * ```
 *
 * That is not theoretical here. `Utility.get_class` raises `NameError` on a
 * name with no class — `Pr` is a `MATH_OPERATORS` entry with no
 * `Math::Function::Pr` — so `\Pr_1` reaches the gem's public boundary as a
 * `ParseError`, and the fixture set records it as one. Without this arm the
 * port would surface the registry's own `Error` instead, and a caller
 * branching on `code` would miss it.
 *
 * The failure is attributed to offset 0: unlike a grammar failure, a transform
 * failure carries no position — the gem's own `ParseError` for these has none
 * either.
 */
export function parseLatex(input: string, options?: LatexParseOptions | null): FormulaNode {
  const { text, map } = preprocessOrParseError(input);
  const tree = parsePreprocessed(input, text, map, options);
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

/**
 * Preprocessing failures reach the caller as `ParseError`, the same class a
 * grammar or transform failure becomes below. That is not every failure this
 * module can raise, though: an unsupported locale is rejected before parsing
 * starts, inside `parsePreprocessed`'s call to `latexGrammar`, and reaches the
 * caller as `UnsupportedLocaleError` -- never wrapped. Measured:
 * `parseLatex("x", { locale: "definitely-not-a-locale" })` throws
 * `UnsupportedLocaleError` with code `UNSUPPORTED_LOCALE`, not a `ParseError`.
 * That is deliberate, not a gap this function should close: the gem raises
 * `Plurimath::Errors::UnsupportedLocale` from `key_for!` before parsing
 * starts, `e.is_a?(Plurimath::Math::ParseError)` is `false` on the pinned
 * oracle, and `formatting/errors.ts` documents the same split for this port.
 *
 * What preprocessing can still fail on is an UNDECODABLE character reference:
 * `preprocess` raises `UndecodableEntityError`, a bare `RangeError` subclass
 * with no `code` and no `format`. Without this wrapper that error reached the
 * caller as-is, and the compat constructor handed it on -- so a caller asking
 * for LaTeX got something that did not look like a parse failure at all.
 *
 * The `\\text{...}` restore is NOT one of those failures any more. It used to
 * throw when the restore found more matches than the scan had saved; measured
 * against the gem, Ruby shifts a nil there and `gsub` writes `nil.to_s`, so
 * the construct is deleted instead -- `\\text {x}` preprocesses to the empty
 * string, which the grammar then refuses as a `ParseError` of its own. That
 * arm reproduces the gem rather than raising, so nothing reaches this wrapper
 * from it.
 */
function preprocessOrParseError(input: string): ReturnType<typeof preprocess> {
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

function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: LatexParseOptions | null,
): ParseValue {
  try {
    return latexGrammar(options ?? undefined).root.parse(text);
  } catch (error) {
    if (error instanceof ParseFailed) {
      throw new ParseError(error.message, input, "latex", map.toOriginal(error.index));
    }
    throw error;
  }
}
