import { describe, expect, it, vi } from "vitest";
import { ParseError } from "../../src/core/index";
import {
  createLeptrisParsers,
  createLeptrisXmlReader,
  type LeptrisElement,
} from "../../src/experimental/leptris";
import { parseMathml, toMathml } from "../../src/formats/mathml/index";

const namespace = "http://www.w3.org/1998/Math/MathML";
const snapshot: LeptrisElement = {
  kind: "element",
  name: "q:math",
  localName: "math",
  prefix: "q",
  // biome-ignore lint/style/useNamingConvention: Leptris's public snapshot field.
  namespaceURI: namespace,
  attributes: [
    ["xmlns:q", namespace],
    ["custom", "v"],
  ],
  children: [
    {
      kind: "element",
      name: "q:mi",
      localName: "mi",
      prefix: "q",
      // biome-ignore lint/style/useNamingConvention: Leptris's public snapshot field.
      namespaceURI: namespace,
      attributes: [],
      children: [{ kind: "text", text: "x" }],
    },
  ],
};

function binding() {
  return {
    loadSync: vi.fn(() => 42),
    treeSync: vi.fn(() => snapshot),
    closeSync: vi.fn(),
  };
}

describe("experimental Leptris consumer adapter", () => {
  it("keeps Moxml entity compatibility in the consumer, restoring only text and attributes", () => {
    const upstream = binding();
    const marker = "\uFFFC\uFEFFalpha;";
    upstream.treeSync.mockReturnValue({
      ...snapshot,
      attributes: [
        ["title", marker],
        ["xmlns:x", marker],
      ],
      children: [
        { kind: "text", text: marker },
        { kind: "cdata", text: marker },
        { kind: "comment", text: marker },
        { kind: "pi", target: "test", text: marker },
      ],
    });
    const actual = createLeptrisXmlReader(upstream)("<math title='&alpha;'>&alpha;&amp;</math>");
    expect(upstream.loadSync).toHaveBeenCalledWith(`<math title='${marker}'>${marker}&amp;</math>`);
    expect(actual.attributes).toEqual([["title", "&alpha;"]]);
    expect(actual.xmlns).toEqual([["xmlns:x", marker]]);
    expect(actual.children).toEqual([
      { kind: "text", text: "&alpha;" },
      { kind: "cdata", text: marker },
      { kind: "comment", text: marker },
      { kind: "pi", target: "test", text: marker },
    ]);
  });

  it("copies qualified names, own declarations and inherited resolved namespaces", () => {
    const upstream = binding();
    const result = createLeptrisXmlReader(upstream)("xml bytes");
    expect(upstream.loadSync).toHaveBeenCalledWith("xml bytes");
    expect(upstream.treeSync).toHaveBeenCalledWith(42);
    expect(upstream.closeSync).toHaveBeenCalledExactlyOnceWith(42);
    expect(result.xmlns).toEqual([["xmlns:q", namespace]]);
    expect(result.attributes).toEqual([["custom", "v"]]);
    expect(result.children[0]).toMatchObject({ name: "q:mi", prefix: "q", namespace });
    expect(result).not.toBe(snapshot);
    expect(result.children).not.toBe(snapshot.children);
  });

  it("closes a loaded document when snapshot retrieval fails, without fallback", () => {
    const upstream = binding();
    upstream.treeSync.mockImplementation(() => {
      throw new Error("snapshot failure");
    });
    expect(() => createLeptrisXmlReader(upstream)("<math/>")).toThrow("snapshot failure");
    expect(upstream.closeSync).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("does not close an unallocated handle when loading fails", () => {
    const upstream = binding();
    upstream.loadSync.mockImplementation(() => {
      throw new Error("load failure");
    });
    expect(() => createLeptrisXmlReader(upstream)("<math/>")).toThrow("load failure");
    expect(upstream.treeSync).not.toHaveBeenCalled();
    expect(upstream.closeSync).not.toHaveBeenCalled();
  });

  it("refuses unsupported entity nodes and still closes the document", () => {
    const upstream = binding();
    upstream.treeSync.mockReturnValue({ ...snapshot, children: [{ kind: "entity", name: "foo" }] });
    expect(() => createLeptrisXmlReader(upstream)("<math>&foo;</math>")).toThrow("&foo;");
    expect(upstream.closeSync).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("runs the actual MathML translator and renderer while preserving native parsing", () => {
    const upstream = binding();
    const parsers = createLeptrisParsers(upstream);
    expect(toMathml(parsers.parseMathml("input sent to binding"))).toBe(
      toMathml(parseMathml("<math><mi>x</mi></math>")),
    );
    expect(upstream.loadSync).toHaveBeenCalledExactlyOnceWith("input sent to binding");
    expect(() => parsers.parseOmml("<math/>")).toThrow(ParseError);
    expect(upstream.closeSync).toHaveBeenCalledTimes(2);
    expect(() => parseMathml("<math><mi>y</mi></math>")).not.toThrow();
    expect(upstream.loadSync).toHaveBeenCalledTimes(2);
  });
});
