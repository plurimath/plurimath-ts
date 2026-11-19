import { expect, it } from "vitest";
import { createAsciimathParser } from "../../src/formats/asciimath/amath";
import { createLatexParser } from "../../src/formats/latex/latexmath";
import { createUnicodemathParser } from "../../src/formats/unicodemath/umath";

/** The smallest umath artifact the mapper accepts: a root capture and nothing else. */
const UMATH_ARTIFACT = JSON.stringify({
  entries: {
    // biome-ignore lint/style/useNamingConvention: compiled grammar atoms are keyed by their type.
    dot: { grammar: { atoms: [{ Named: { name: "umath_tree", atom: 0 } }], root: 0 } },
  },
});

it.each([
  ["asciimath", createAsciimathParser],
  ["latex", createLatexParser],
  [
    "unicode",
    (binding: { parsePreparedTree: () => never }) =>
      createUnicodemathParser({ parse: binding.parsePreparedTree }, UMATH_ARTIFACT),
  ],
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
    const parse = create({ parse: fail, parseTree: fail, parsePreparedTree: fail });
    try {
      parse("1");
      throw new Error("expected the resource refusal");
    } catch (actual) {
      expect(actual).toBe(error);
      expect(actual).toMatchObject({ depth: 1025, maxDepth: 1024 });
    }
  }
});
