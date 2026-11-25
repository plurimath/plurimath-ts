import { afterEach, describe, expect, it, vi } from "vitest";
import { ParseError, ParseOptionError } from "../../src/core/errors";
import { createAsciimathParser } from "../../src/formats/asciimath/amath";
import { parseHtml } from "../../src/formats/html/parser";
import { createLatexParser } from "../../src/formats/latex/latexmath";
import { parseLatex } from "../../src/formats/latex/parser";
import { latexStage } from "../../src/formats/latex/stage";
import { parseUnicodemath } from "../../src/formats/unicodemath/parser";
import { unicodemathStage } from "../../src/formats/unicodemath/stage";
import { createUnicodemathParser } from "../../src/formats/unicodemath/umath";
import { STACK_EXHAUSTED_MESSAGE } from "../../src/pegkit/atom";
import { BoundedRuntime } from "../../src/pegkit/bounded-runtime";

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

afterEach(() => vi.restoreAllMocks());

const DEFAULTS = [
  {
    name: "html",
    parse: parseHtml,
    fail: (error: Error) =>
      vi.spyOn(BoundedRuntime.prototype, "parseShapeWithCompatibility").mockImplementation(() => {
        throw error;
      }),
  },
  {
    name: "latex",
    parse: parseLatex,
    fail: (error: Error) =>
      vi.spyOn(latexStage(), "parse").mockImplementation(() => {
        throw error;
      }),
  },
  {
    name: "unicode",
    parse: parseUnicodemath,
    fail: (error: Error) =>
      vi.spyOn(unicodemathStage(), "parse").mockImplementation(() => {
        throw error;
      }),
  },
];

describe.each(DEFAULTS)("$name default resource boundary", ({ name, parse, fail }) => {
  it.each([
    "NestingTooDeep",
    "RecursionLimitExceeded",
    "CallDepthLimitExceeded",
    "ShapeDepthLimitExceeded",
  ])("reports %s as a ParseError and retains the original metadata as its cause", (resource) => {
    const error = Object.assign(new Error("declared resource budget"), {
      name: resource,
      category: "call_depth_limit",
      depth: 1025,
      maxDepth: 1024,
    });
    fail(error);
    try {
      parse("1");
      expect.unreachable("expected the resource refusal");
    } catch (actual) {
      expect(actual).toBeInstanceOf(ParseError);
      expect(actual).toMatchObject({
        input: "1",
        format: name,
        index: 0,
        code: "PARSE_ERROR",
        message: STACK_EXHAUSTED_MESSAGE,
      });
      expect((actual as Error).cause).toBe(error);
    }
  });

  it("keeps unrelated engine failures unchanged", () => {
    const failure = new RangeError("unrelated engine failure");
    fail(failure);
    try {
      parse("1");
      expect.unreachable("expected the engine failure");
    } catch (actual) {
      expect(actual).toBe(failure);
    }
  });

  it("validates options before consulting the runtime", () => {
    const call = fail(new Error("runtime must not be reached"));
    expect(() => parse("1", { unknown: true } as never)).toThrow(ParseOptionError);
    expect(call).not.toHaveBeenCalled();
  });
});
