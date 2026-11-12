import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { lowerHtmlCaptures } from "../../../src/formats/html/parg-captures";
import { createHtmlParser } from "../../../src/formats/html/parsanol";
import { parseHtml } from "../../../src/formats/html/parser";
import source from "./initialized-source.json";

// These are actual Ruby capture/model observations, not generated expectations.
// This test qualifies consumer mapping separately from the actual runtime replay.
describe("initialized HTML consumer source mapping", () => {
  it.each(source.cases.filter((row) => "model" in row))("$id", (row) => {
    const parse = createHtmlParser((decimal) => {
      expect(decimal).toBe(".");
      return {
        parseShapeWithCompatibility: (input, mode) => {
          expect(mode).toBe("strict");
          expect(input).toBe(row.normalized);
          return { ok: true as const, shape: row.captures };
        },
      };
    });
    expect(normalize(parse(row.input))).toStrictEqual(row.model);
  });
});

it("lowers byte spans with Unicode-scalar lengths and ordered tagged maps", () => {
  const span = { offset: 0, length: 2 };
  expect(lowerHtmlCaptures(span, "😀x!")).toBe("😀x");
  expect(
    lowerHtmlCaptures({ tag: "sequence", items: [span, { a: "x" }, { a: "y" }] }, "😀x!"),
  ).toEqual({ a: "y" });
  expect(lowerHtmlCaptures({ tag: "maybe", items: [] }, "")).toBeNull();
  expect(lowerHtmlCaptures({ tag: "repetition", items: ["x", "y"] }, "")).toEqual(["x", "y"]);
});

it("selects the locale artifact before parsing", () => {
  const parse = createHtmlParser((decimal) => {
    expect(decimal).toBe(",");
    return { parseShapeWithCompatibility: () => ({ ok: true, shape: { number: "1,5" } }) };
  });
  expect(normalize(parse("1,5", { locale: "fr" }))).toEqual(
    normalize(parseHtml("1,5", { locale: "fr" })),
  );
});

it("validates options before selecting a runtime", () => {
  const parse = createHtmlParser(() => {
    throw new Error("runtime must not be used");
  });
  expect(() => parse("x", { locale: "unknown" })).toThrow(/locale/i);
});

it("maps a normalized UTF-8 refusal to the original UTF-16 input", () => {
  const parse = createHtmlParser(() => ({
    parseShapeWithCompatibility: () => ({ ok: false, error: { offset: 2, ranked: [] } }),
  }));
  try {
    parse("α<");
    throw new Error("expected refusal");
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).index).toBe(1);
  }
});

it("preserves typed resource failures without fallback or syntax wrapping", () => {
  const resource = Object.assign(new Error("VM budget"), {
    name: "CallDepthLimitExceeded",
    depth: 1025,
    maxDepth: 1024,
  });
  const parse = createHtmlParser(() => ({
    parseShapeWithCompatibility: () => {
      throw resource;
    },
  }));
  expect(() => parse("x")).toThrow(resource);
});

it("retains the source 100-container capture limit", () => {
  let shape: unknown = "x";
  for (let i = 0; i < 101; i++) shape = { expression: shape };
  const parse = createHtmlParser(() => ({
    parseShapeWithCompatibility: () => ({ ok: true, shape }),
  }));
  expect(() => parse("x")).toThrow(/nesting of 100 is too deep/);
});
