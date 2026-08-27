/**
 * Oracle-backed HTML vertical-slice pins measured with:
 * `mise x -- bundle exec ruby /tmp/wt-html-independent-probe.rb`
 * in the clean oracle checkout at 00c52783.
 * Phase-one boundary cases below pin deliberate refusals for deferred paths.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/errors";
import {
  AbsNode,
  BinaryFunctionNode,
  FormulaNode,
  FracNode,
  IntNode,
  MrowNode,
  NaryNode,
  NumberNode,
  SqrtNode,
  SymbolNode,
  TernaryFunctionNode,
  TextNode,
  UnaryFunctionNode,
} from "../../../src/core/nodes";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toHtml } from "../../../src/formats/html/renderer";

const symbol = (value = "x") => new SymbolNode({ value });

describe("HTML carrier defaults", () => {
  it("renders the unary default through Abs", () => {
    expect(toHtml(new AbsNode({ parameterOne: symbol() }))).toBe("<i>abs</i><i>x</i>");
  });

  it("takes the unary label from the class name and keeps an empty child wrapper", () => {
    expect(toHtml(new UnaryFunctionNode({ name: "Sin", parameterOne: symbol() }))).toBe(
      "<i>sin</i><i>x</i>",
    );
    expect(
      toHtml(
        new UnaryFunctionNode({ name: "Sin", parameterOne: new TextNode({ parameterOne: null }) }),
      ),
    ).toBe("<i>sin</i><i></i>");
  });

  it("joins a unary array without spaces and refuses a nil array member", () => {
    expect(
      toHtml(new UnaryFunctionNode({ name: "Sin", parameterOne: [symbol("a"), symbol("b")] })),
    ).toBe("<i>sin</i><i>ab</i>");
    expect(() =>
      toHtml(
        new UnaryFunctionNode({
          name: "Sin",
          parameterOne: [symbol("a"), null, symbol("b")] as unknown as readonly SymbolNode[],
        }),
      ),
    ).toThrow(RenderError);
  });

  it("renders the binary default through Frac", () => {
    expect(toHtml(new FracNode({ parameterOne: symbol(), parameterTwo: symbol() }))).toBe(
      "<i>x</i><i>x</i>",
    );
  });

  it("keeps the binary wrapper when a child renders nil", () => {
    expect(
      toHtml(
        new FracNode({
          parameterOne: new TextNode({ parameterOne: null }),
          parameterTwo: symbol(),
        }),
      ),
    ).toBe("<i></i><i>x</i>");
  });

  it("refuses a binary array slot because BinaryFunction calls to_html on the array", () => {
    expect(() => toHtml(new FracNode({ parameterOne: [], parameterTwo: symbol() }))).toThrow(
      RenderError,
    );
  });

  it("renders the ternary default through Int", () => {
    expect(
      toHtml(
        new IntNode({
          parameterOne: symbol(),
          parameterTwo: symbol(),
          parameterThree: symbol(),
        }),
      ),
    ).toBe("<i>x</i><i>x</i><i>x</i>");
  });

  it("keeps the ternary wrapper when a child renders nil", () => {
    expect(
      toHtml(
        new IntNode({
          parameterOne: new TextNode({ parameterOne: null }),
          parameterTwo: symbol(),
          parameterThree: symbol(),
        }),
      ),
    ).toBe("<i></i><i>x</i><i>x</i>");
  });

  it("refuses a ternary array slot because TernaryFunction calls to_html on the array", () => {
    expect(() =>
      toHtml(
        new IntNode({ parameterOne: symbol("a"), parameterTwo: [], parameterThree: symbol("c") }),
      ),
    ).toThrow(RenderError);
  });
});

describe("HTML leaf and formula rendering", () => {
  it("renders a symbol", () => {
    expect(toHtml(symbol())).toBe("x");
    expect(toHtml(new SymbolNode({ value: "&#x2b;" }))).toBe("&#x2b;");
  });

  it("renders Paren as a base-like symbol", () => {
    expect(toHtml(new SymbolNode({ id: "Paren", value: "WRONG" }))).toBe("WRONG");
    expect(toHtml(new SymbolNode({ id: "Paren", value: null }))).toBe("");
  });

  it("renders text and number values", () => {
    expect(toHtml(new TextNode({ parameterOne: "hello" }))).toBe("hello");
    expect(toHtml(new NumberNode({ value: "2" }))).toBe("2");
    expect(toHtml(new NumberNode({ value: "&#x32;" }))).toBe("&#x32;");
  });

  it("refuses Text unicode substitutions whose HTML data is deferred", () => {
    expect(() => toHtml(new TextNode({ parameterOne: "unicode[:kappa]" }))).toThrow(RenderError);
    expect(() => toHtml(new TextNode({ parameterOne: "preunicode[:Gamma]post" }))).toThrow(
      RenderError,
    );
  });

  it("joins Formula and Mrow children with spaces", () => {
    expect(toHtml(new FormulaNode({ value: [symbol("a"), symbol("b")] }))).toBe("a b");
    expect(toHtml(new MrowNode({ value: [symbol("a"), symbol("b")] }))).toBe("a b");
    expect(
      toHtml(new FormulaNode({ value: [new TextNode({ parameterOne: null }), symbol("x")] })),
    ).toBe(" x");
  });

  it("refuses a Formula whose value is nil where the gem raises", () => {
    expect(() => toHtml(new FormulaNode({ value: null }))).toThrow(RenderError);
  });

  it("renders end to end from an AsciiMath parse", () => {
    expect(toHtml(parseAsciimath("abs(x)"))).toBe("<i>abs</i><i>x</i>");
  });
});

describe("HTML refusal parity", () => {
  it("refuses nary because the gem has no to_html method in its ancestry", () => {
    expect(() => toHtml(new NaryNode())).toThrow(RenderError);
  });
});

describe("HTML phase-one boundary", () => {
  it("refuses an omitted kind at the phase-one dispatch guard", () => {
    let thrown: unknown;
    try {
      toHtml(new SqrtNode());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RenderError);
    expect(thrown).toMatchObject({
      code: "RENDER_ERROR",
      format: "html",
      kind: "sqrt",
      message: 'HTML rendering for node kind "sqrt" is outside the measured phase-one slice',
    });
  });

  it("refuses unmeasured carrier aliases instead of inventing plausible output", () => {
    expect(() => toHtml(new UnaryFunctionNode({ name: "Mbox", parameterOne: symbol() }))).toThrow(
      RenderError,
    );
    expect(() => toHtml(new BinaryFunctionNode({ name: "Power" }))).toThrow(RenderError);
    expect(() => toHtml(new TernaryFunctionNode({ name: "PowerBase" }))).toThrow(RenderError);
  });

  it("refuses formula aliases outside the plain Formula slice", () => {
    expect(() => toHtml(new FormulaNode({ name: "UnmeasuredFormula", value: [symbol()] }))).toThrow(
      RenderError,
    );
  });

  it("refuses a named symbol whose generated HTML value is not in this phase", () => {
    expect(() => toHtml(new SymbolNode({ id: "Plus" }))).toThrow(RenderError);
    expect(() => toHtml(new SymbolNode({ id: "Plus", value: "WRONG" }))).toThrow(RenderError);
    expect(() => toHtml(new SymbolNode({ id: "Plus", value: "&#x2b;" }))).toThrow(RenderError);
  });

  it("refuses a non-string Text value instead of silently dropping it", () => {
    expect(() => toHtml(new TextNode({ parameterOne: symbol() }))).toThrow(RenderError);
  });
});
