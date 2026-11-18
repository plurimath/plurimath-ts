import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ParseError } from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { asciimathStage } from "../../../src/formats/asciimath/stage";
import { toLatex } from "../../../src/formats/latex/index";

const require = createRequire(import.meta.url);

describe("the default amath-ts stage", () => {
  it("hands parsanol the artifact's exact bytes", () => {
    // The artifact digest covers the file's bytes; the stage rebuilds them
    // from the imported JSON as compact JSON plus the trailing newline.
    const path = require.resolve("@plurimath/amath-ts/artifacts/asciimath.json");
    const text = readFileSync(path, "utf8");
    expect(`${JSON.stringify(JSON.parse(text))}\n`).toBe(text);
  });

  it("is one shared parser", () => {
    expect(asciimathStage()).toBe(asciimathStage());
  });

  it.each([
    ["1.5", undefined, "1.5"],
    ["1,5", { locale: "de" }, "1,5"],
    ["frac(1)(2)", undefined, "\\frac{1}{2}"],
  ])("parses %s through the decimal marker's runtime", (input, options, latex) => {
    expect(toLatex(parseAsciimath(input, options))).toBe(latex);
  });

  it("maps a stage refusal to a ParseError on the caller's input", () => {
    // `failure-parity.spec.ts`: the `left ... right` branch reaches the end.
    expect(() => parseAsciimath("left(x right")).toThrow(ParseError);
    try {
      parseAsciimath("left(x right");
    } catch (error) {
      expect((error as ParseError).index).toBe(12);
    }
  });
});
