/**
 * Optional Leptris MATHML input. Initialize the caller-owned binding first.
 * Importing this module or creating a parser never loads XML or initializes WASM.
 */
import type { FormulaNode } from "../../core/index";
import { createLeptrisXmlReader, type LeptrisSyncBinding } from "../../xml/leptris";
import { parseMathmlWithReader } from "./parser";

export type { LeptrisElement, LeptrisNode, LeptrisSyncBinding } from "../../xml/leptris";

/** Creates a synchronous parser using an already initialized Leptris binding. */
export function createMathmlParser(binding: LeptrisSyncBinding): (input: string) => FormulaNode {
  const read = createLeptrisXmlReader(binding);
  return (input) => parseMathmlWithReader(input, read);
}
