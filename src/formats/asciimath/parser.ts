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
import { type LocaleOptions, requireLocaleKey } from "../../formatting/index";
import {
  isStackOverflow,
  type ParseContext,
  ParseFailed,
  type ParseValue,
  type SourceMap,
} from "../../pegkit/index";
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
  const tree = parseAsciimathTree(input, options);
  try {
    const transformed = asciimathTransform().apply(tree);
    return finalizeAsciimathParse(transformed, input);
  } catch (error) {
    if (error instanceof ParseError && error.format === "unitsml") {
      // Inline UnitsML construction fails at Math.parse's outer boundary.
      // The reference carries no position for this transform failure.
      throw new ParseError(error.message, input, "asciimath", 0);
    }
    throw error;
  }
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
    if (error instanceof ParseFailed) {
      // AsciiMath reports where its root prefix ends, rather than the furthest
      // leftover match attempted by another alternative inside the PEG engine.
      let index = error.index;
      const context: ParseContext = {
        input: text,
        captures: [new Map()],
        maxPos: 0,
        unconsumed: -1,
        cache: new Map(),
        depth: 0,
      };
      try {
        const prefix = grammar.root.apply(0, context, false);
        if (prefix.ok) index = prefix.pos;
      } catch (diagnosticError) {
        // A diagnostic retry must preserve the original typed resource failure.
        if (!(diagnosticError instanceof ParseFailed) && !isStackOverflow(diagnosticError)) {
          throw diagnosticError;
        }
      }
      throw new ParseError(error.message, input, "asciimath", map.toOriginal(index));
    }
    throw error;
  }
}
