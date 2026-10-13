/**
 * OMML input: `Plurimath::Math.parse(text, :omml)`.
 *
 * `Omml::Parser#parse` reads the document (`./omml-input.ts`), then translates
 * it (`./translator.ts`); `Math.parse` sets `input_string` and turns every
 * failure into `ParseError` (`math.rb`), which is what this throws, at offset
 * 0: the gem's own error carries no position.
 *
 * Exported by the OMML subpath and registered in the compat constructor.
 */

import { describeThrown } from "../../core/errors";
import { type FormulaNode, ParseError } from "../../core/index";
import { parseOmmlDocument } from "./omml-input";
import { translateOmml } from "./translator";

export function parseOmml(input: string): FormulaNode {
  try {
    return translateOmml(parseOmmlDocument(input), input);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(
      error instanceof Error ? error.message : describeThrown(error),
      input,
      "omml",
      0,
    );
  }
}
