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
 * Failure positions: `ParseFailed.index` is an offset into the preprocessed
 * text, and four of the five preprocessing rewrites change lengths, so every
 * position is mapped back through the `SourceMap` before it reaches a caller
 * as `ParseError.index` (§5). `test/formats/asciimath/failure-parity.spec.ts`
 * pins that contract against the gem's 156-input failure sweep; this module
 * is the composition that spec used to carry as a local helper.
 */

import {
  type FormulaNode,
  type OnUnsupported,
  ParseError,
  reportUnsupported,
} from "../../core/index";
import type { LocaleOptions } from "../../formatting/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import { asciimathGrammar } from "./grammar";
import { preprocess } from "./preprocess";
import { asciimathTransform, finalizeAsciimathParse } from "./transform";

/**
 * Locale (the decimal marker the grammar reads at parse time) plus the
 * deferred-construct hook §5 promises on every parser.
 */
export interface AsciimathParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
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
  const { text, map } = preprocess(input);
  const tree = parsePreprocessed(input, text, map, options);
  reportDeferredUnitsml(input, text, map, options?.onUnsupported);
  return tree;
}

/** `Plurimath::Math.parse(input, :asciimath)`'s observable result. */
export function parseAsciimath(input: string, options?: AsciimathParseOptions | null): FormulaNode {
  const { text, map } = preprocess(input);
  const tree = parsePreprocessed(input, text, map, options);
  reportDeferredUnitsml(input, text, map, options?.onUnsupported);
  const transformed = asciimathTransform().apply(tree);
  return finalizeAsciimathParse(transformed, input);
}

function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: AsciimathParseOptions | null,
): ParseValue {
  try {
    return asciimathGrammar(options ?? undefined).root.parse(text);
  } catch (error) {
    if (error instanceof ParseFailed) {
      throw new ParseError(error.message, input, "asciimath", map.toOriginal(error.index));
    }
    throw error;
  }
}

/**
 * The construct the gem's grammar routes to UnitsML: `"unitsml(` ... `)"`
 * (`asciimath/parse.rb:76`, the alternative this port keeps commented out — see
 * `grammar.ts`). Such input parses as plain text here, which is a deliberate
 * divergence (§5), so it is reported rather than silent. Detection runs over
 * the PREPROCESSED text, because that is the form the gem's grammar would
 * have matched, and indexes map back to the caller's input.
 */
function reportDeferredUnitsml(
  input: string,
  text: string,
  map: SourceMap,
  onUnsupported?: OnUnsupported,
): void {
  const opener = '"unitsml(';
  const closer = ')"';
  let from = 0;
  for (;;) {
    const start = text.indexOf(opener, from);
    if (start === -1) return;
    const end = text.indexOf(closer, start + opener.length);
    if (end === -1) return;
    const afterEnd = end + closer.length;
    const originalStart = map.toOriginal(start);
    const originalEnd = afterEnd >= text.length ? input.length : map.toOriginal(afterEnd);
    const construct = input.slice(originalStart, originalEnd);
    reportUnsupported(
      {
        feature: "unitsml",
        text: construct,
        index: originalStart,
        message:
          `UnitsML is not supported yet; ${construct} was parsed as plain text. ` +
          "Pass onUnsupported to silence or reroute this warning.",
      },
      onUnsupported,
    );
    from = afterEnd;
  }
}
