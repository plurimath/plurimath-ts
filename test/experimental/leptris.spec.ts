import { describe, expect, it, vi } from "vitest";
import { ParseError } from "../../src/core/index";
import { parseMathml, toMathml } from "../../src/formats/mathml/index";
import { createMathmlParser } from "../../src/formats/mathml/leptris";
import { parseOmml } from "../../src/formats/omml/index";
import { createOmmlParser } from "../../src/formats/omml/leptris";
import type { LeptrisNode } from "../../src/xml/leptris";
import { createLeptrisXmlReader, type LeptrisElement } from "../../src/xml/leptris";

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

describe("optional Leptris consumer adapter", () => {
  it("uses the public OMML factory with the existing translator", () => {
    const ommlNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/math";
    const element = (name: string, children: readonly LeptrisNode[]): LeptrisElement => ({
      kind: "element",
      name: `m:${name}`,
      localName: name,
      prefix: "m",
      // biome-ignore lint/style/useNamingConvention: Leptris's public snapshot field.
      namespaceURI: ommlNamespace,
      attributes: [["xmlns:m", ommlNamespace]],
      children,
    });
    const upstream = binding();
    upstream.treeSync.mockReturnValue(
      element("oMath", [element("r", [element("t", [{ kind: "text", text: "x" }])])]),
    );
    const input = `<m:oMath xmlns:m="${ommlNamespace}"><m:r><m:t>x</m:t></m:r></m:oMath>`;
    expect(toMathml(createOmmlParser(upstream)(input))).toBe(toMathml(parseOmml(input)));
    expect(upstream.closeSync).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("preserves the shared ParseError contract and original input on binding failure", () => {
    for (const [format, factory] of [
      ["mathml", createMathmlParser],
      ["omml", createOmmlParser],
    ] as const) {
      const upstream = binding();
      upstream.loadSync.mockImplementation(() => {
        throw new Error("binding failure");
      });
      const input = "<math><mi>&alpha;</mi></math>";
      expect(() => factory(upstream)(input)).toThrowError(
        expect.objectContaining({
          code: "PARSE_ERROR",
          message: "binding failure",
          input,
          format,
          index: 0,
        }),
      );
      expect(upstream.closeSync).not.toHaveBeenCalled();
    }
  });

  it("does not initialize or load a binding when creating either public parser", () => {
    const upstream = { ...binding(), init: vi.fn() };
    const mathml = createMathmlParser(upstream);
    const omml = createOmmlParser(upstream);
    expect(typeof mathml).toBe("function");
    expect(typeof omml).toBe("function");
    expect(upstream.init).not.toHaveBeenCalled();
    expect(upstream.loadSync).not.toHaveBeenCalled();
    expect(upstream.treeSync).not.toHaveBeenCalled();
    expect(upstream.closeSync).not.toHaveBeenCalled();
    parseMathml("<math><mi>x</mi></math>");
    expect(upstream.init).not.toHaveBeenCalled();
    expect(upstream.loadSync).not.toHaveBeenCalled();
  });

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
    const parsers = {
      parseMathml: createMathmlParser(upstream),
      parseOmml: createOmmlParser(upstream),
    };
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
