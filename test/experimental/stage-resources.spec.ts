import { expect, it } from "vitest";
import { createAsciimathParser } from "../../src/formats/asciimath/amath";
import { createLatexParser } from "../../src/formats/latex/latexmath";
import { createUnicodemathParser } from "../../src/formats/unicodemath/umath";

it.each([
  ["asciimath", createAsciimathParser],
  ["latex", createLatexParser],
  ["unicode", createUnicodemathParser],
] as const)("%s keeps typed runtime resources and metadata", (_name, create) => {
  for (const name of [
    "NestingTooDeep",
    "RecursionLimitExceeded",
    "CallDepthLimitExceeded",
    "ShapeDepthLimitExceeded",
  ]) {
    const error = Object.assign(new Error("declared resource budget"), {
      name,
      category: "call_depth_limit",
      depth: 1025,
      maxDepth: 1024,
      byteOffset: null,
      charOffset: null,
    });
    const fail = () => {
      throw error;
    };
    const parse = create({ parseTree: fail, parsePreparedTree: fail });
    try {
      parse("1");
      throw new Error("expected the resource refusal");
    } catch (actual) {
      expect(actual).toBe(error);
      expect(actual).toMatchObject({ depth: 1025, maxDepth: 1024 });
    }
  }
});
