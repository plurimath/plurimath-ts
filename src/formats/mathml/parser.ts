/**
 * MathML input: `Plurimath::Math.parse(text, :mathml)`.
 *
 * `Mathml::Parser#parse` reads the document (`./mml.ts`), then translates it
 * (`./translator.ts`); `Math.parse` sets `input_string` and turns every failure
 * into `ParseError` (`math.rb`), which is what this throws, at offset 0: the
 * gem's own error carries no position.
 */

import { describeThrown } from "../../core/errors";
import { type FormulaNode, ParseError } from "../../core/index";
import { parseMml } from "./mml";
import { translateMml } from "./translator";

export function parseMathml(input: string): FormulaNode {
  try {
    return translateMml(parseMml(input), input);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(
      error instanceof Error ? error.message : describeThrown(error),
      input,
      "mathml",
      0,
    );
  }
}
