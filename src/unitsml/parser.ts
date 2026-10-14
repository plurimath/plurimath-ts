import { ParseError } from "../core/index";
import { UNITSML_DATA } from "./data";
import { type Expression, transformExpression, updateExponents } from "./expression";
import { unitsmlGrammar } from "./grammar";

export interface ParsedUnitsml {
  readonly original: string;
  readonly normalized: string;
  readonly values: readonly Expression[];
  readonly extras: Readonly<Record<string, string>>;
}
const grammar = unitsmlGrammar(UNITSML_DATA.tokens);
const EXTRA = /(quantity|name|symbol|multiplier):[\t\n\v\f\r ]*/;
function strip(text: string): string {
  const stripped = "\0\t\n\v\f\r ";
  let start = 0;
  let end = text.length;
  while (start < end && stripped.includes(text.charAt(start))) start++;
  while (end > start && stripped.includes(text.charAt(end - 1))) end--;
  return text.slice(start, end);
}

export function parseUnitExpression(input: string): ParsedUnitsml {
  try {
    const original = input.startsWith("unitsml(") ? input.slice(8).replace(/\)$/, "") : input;
    let normalized = original.replaceAll("−", "-");
    const extras: Record<string, string> = {};
    if (EXTRA.test(normalized)) {
      const parts = normalized.split(",").map(strip);
      normalized = parts.shift() ?? "";
      for (const part of parts) {
        if (!EXTRA.test(part)) continue;
        const separator = part.indexOf(":");
        const key = part.slice(0, separator);
        if (!Object.hasOwn(extras, key)) extras[key] = strip(part.slice(separator + 1));
      }
    }
    const expression = transformExpression(grammar.root.parse(normalized));
    const values = expression.kind === "formula" ? expression.values : [expression];
    updateExponents(values);
    return { original, normalized, values, extras };
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(
      error instanceof Error ? error.message : "UnitsML parsing failed",
      input,
      "unitsml",
      0,
    );
  }
}

/** Eager Unitsml.parse validation used by every parser producing a UnitsmlNode. */
export function validateUnitsml(input: string): void {
  parseUnitExpression(input);
}
