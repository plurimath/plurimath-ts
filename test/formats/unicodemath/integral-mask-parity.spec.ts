/** Public integral-mask MathML bytes measured by the pinned Ruby scope probe. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { toMathml } from "../../../src/formats/mathml/index";
import { parseUnicodemath } from "../../../src/formats/unicodemath/index";

interface IntegralWitness {
  readonly input: string;
  readonly route?: string;
  readonly model?: unknown;
  readonly mathml?: string;
}

const fixtures = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "scope-gap-fixtures.json"), "utf8"),
) as { readonly schema: string; readonly cases: readonly IntegralWitness[] };
const integrals = fixtures.cases.filter(
  (entry) => entry.route === "scope-gap/integral-mask" && entry.model !== undefined,
);

describe("the measured public integral-mask MathML routes", () => {
  it("includes both measured mask-one shapes and their successful outputs", () => {
    expect(fixtures.schema).toBe("plurimath-unicodemath-scope-gap/1");
    for (const input of ["∫1_a", "∫1_a^b f"]) {
      const entry = integrals.find((candidate) => candidate.input === input);
      expect(entry?.model, input).toBeDefined();
      expect(entry?.mathml, input).toBeTypeOf("string");
    }
  });

  it.each(integrals.map((entry) => [entry.input, entry] as const))(
    "%j: the public parser and MathML renderer reproduce the Ruby observation",
    (_input, entry) => {
      const formula = parseUnicodemath(entry.input);
      expect(normalize(formula)).toStrictEqual(entry.model);
      expect(toMathml(formula)).toBe(entry.mathml);
    },
  );
});
