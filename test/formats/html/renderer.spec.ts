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
  BarNode,
  BaseNode,
  BinaryFunctionNode,
  ColorNode,
  DotNode,
  FloorNode,
  FormulaNode,
  FracNode,
  HatNode,
  IntNode,
  type MathNode,
  MpaddedNode,
  MrowNode,
  NaryNode,
  type NodeParameter,
  NormNode,
  NumberNode,
  ObraceNode,
  OintNode,
  OverleftrightarrowNode,
  OversetNode,
  SqrtNode,
  SymbolNode,
  TernaryFunctionNode,
  TextNode,
  TildeNode,
  UbraceNode,
  UlNode,
  UnaryFunctionNode,
  UndersetNode,
  VecNode,
} from "../../../src/core/nodes";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toHtml } from "../../../src/formats/html/renderer";

const symbol = (value = "x") => new SymbolNode({ value });

interface UnaryInheritedCase {
  readonly kind: string;
  readonly make: (parameterOne: NodeParameter) => MathNode;
  readonly occupied: string;
  readonly nil: string;
  readonly empty: string;
}

const unaryInheritedCases: readonly UnaryInheritedCase[] = [
  {
    kind: "bar",
    make: (parameterOne) => new BarNode({ parameterOne }),
    occupied: "<i>¯</i><i>x</i>",
    nil: "<i>¯</i>",
    empty: "<i>¯</i><i></i>",
  },
  {
    kind: "dot",
    make: (parameterOne) => new DotNode({ parameterOne }),
    occupied: "<i>dot</i><i>x</i>",
    nil: "<i>dot</i>",
    empty: "<i>dot</i><i></i>",
  },
  {
    kind: "floor",
    make: (parameterOne) => new FloorNode({ parameterOne }),
    occupied: "<i>floor</i><i>x</i>",
    nil: "<i>floor</i>",
    empty: "<i>floor</i><i></i>",
  },
  {
    kind: "hat",
    make: (parameterOne) => new HatNode({ parameterOne }),
    occupied: "<i>^</i><i>x</i>",
    nil: "<i>^</i>",
    empty: "<i>^</i><i></i>",
  },
  {
    kind: "mpadded",
    make: (parameterOne) => new MpaddedNode({ parameterOne }),
    occupied: "<i>mpadded</i><i>x</i>",
    nil: "<i>mpadded</i>",
    empty: "<i>mpadded</i><i></i>",
  },
  {
    kind: "norm",
    make: (parameterOne) => new NormNode({ parameterOne }),
    occupied: "<i>norm</i><i>x</i>",
    nil: "<i>norm</i>",
    empty: "<i>norm</i><i></i>",
  },
  {
    kind: "obrace",
    make: (parameterOne) => new ObraceNode({ parameterOne }),
    occupied: "<i>&#x23de;</i><i>x</i>",
    nil: "<i>&#x23de;</i>",
    empty: "<i>&#x23de;</i><i></i>",
  },
  {
    kind: "overleftrightarrow",
    make: (parameterOne) => new OverleftrightarrowNode({ parameterOne }),
    occupied: "<i>&#x20e1;</i><i>x</i>",
    nil: "<i>&#x20e1;</i>",
    empty: "<i>&#x20e1;</i><i></i>",
  },
  {
    kind: "sqrt",
    make: (parameterOne) => new SqrtNode({ parameterOne }),
    occupied: "<i>sqrt</i><i>x</i>",
    nil: "<i>sqrt</i>",
    empty: "<i>sqrt</i><i></i>",
  },
  {
    kind: "tilde",
    make: (parameterOne) => new TildeNode({ parameterOne }),
    occupied: "<i>~</i><i>x</i>",
    nil: "<i>~</i>",
    empty: "<i>~</i><i></i>",
  },
  {
    kind: "ubrace",
    make: (parameterOne) => new UbraceNode({ parameterOne }),
    occupied: "<i>&#x23df;</i><i>x</i>",
    nil: "<i>&#x23df;</i>",
    empty: "<i>&#x23df;</i><i></i>",
  },
  {
    kind: "ul",
    make: (parameterOne) => new UlNode({ parameterOne }),
    occupied: "<i>underline</i><i>x</i>",
    nil: "<i>underline</i>",
    empty: "<i>underline</i><i></i>",
  },
  {
    kind: "vec",
    make: (parameterOne) => new VecNode({ parameterOne }),
    occupied: "<i>&#x2192;</i><i>x</i>",
    nil: "<i>&#x2192;</i>",
    empty: "<i>&#x2192;</i><i></i>",
  },
];

interface BinaryInheritedCase {
  readonly kind: string;
  readonly make: (parameterOne: NodeParameter, parameterTwo: NodeParameter) => MathNode;
}

const binaryInheritedCases: readonly BinaryInheritedCase[] = [
  {
    kind: "color",
    make: (parameterOne, parameterTwo) => new ColorNode({ parameterOne, parameterTwo }),
  },
  {
    kind: "overset",
    make: (parameterOne, parameterTwo) => new OversetNode({ parameterOne, parameterTwo }),
  },
  {
    kind: "underset",
    make: (parameterOne, parameterTwo) => new UndersetNode({ parameterOne, parameterTwo }),
  },
];

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

describe("HTML inherited kind rendering", () => {
  for (const inherited of unaryInheritedCases) {
    it(`renders ${inherited.kind} occupied, nil, and empty unary slots as measured`, () => {
      expect(toHtml(inherited.make(symbol()), {})).toBe(inherited.occupied);
      expect(toHtml(inherited.make(null), {})).toBe(inherited.nil);
      expect(toHtml(inherited.make([]), {})).toBe(inherited.empty);
    });
  }

  for (const inherited of binaryInheritedCases) {
    it(`renders ${inherited.kind} occupied and nil slots, and refuses empty slots`, () => {
      expect(toHtml(inherited.make(symbol(), symbol()), {})).toBe("<i>x</i><i>x</i>");
      expect(toHtml(inherited.make(null, symbol()), {})).toBe("<i>x</i>");
      expect(toHtml(inherited.make(symbol(), null), {})).toBe("<i>x</i>");
      expect(() => toHtml(inherited.make([], symbol()), {})).toThrow(RenderError);
      expect(() => toHtml(inherited.make(symbol(), []), {})).toThrow(RenderError);
    });
  }

  it("renders oint occupied and nil slots, and refuses every empty slot", () => {
    const make = (
      parameterOne: NodeParameter,
      parameterTwo: NodeParameter,
      parameterThree: NodeParameter,
    ) => new OintNode({ parameterOne, parameterTwo, parameterThree });

    expect(toHtml(make(symbol(), symbol(), symbol()), {})).toBe("<i>x</i><i>x</i><i>x</i>");
    expect(toHtml(make(null, symbol(), symbol()), {})).toBe("<i>x</i><i>x</i>");
    expect(toHtml(make(symbol(), null, symbol()), {})).toBe("<i>x</i><i>x</i>");
    expect(toHtml(make(symbol(), symbol(), null), {})).toBe("<i>x</i><i>x</i>");
    expect(() => toHtml(make([], symbol(), symbol()), {})).toThrow(RenderError);
    expect(() => toHtml(make(symbol(), [], symbol()), {})).toThrow(RenderError);
    expect(() => toHtml(make(symbol(), symbol(), []), {})).toThrow(RenderError);
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

describe("HTML partial-slice boundary", () => {
  it("refuses an omitted kind at the phase-one dispatch guard", () => {
    let thrown: unknown;
    try {
      toHtml(new BaseNode());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RenderError);
    expect(thrown).toMatchObject({
      code: "RENDER_ERROR",
      format: "html",
      kind: "base",
      message: 'HTML rendering for node kind "base" is outside the measured HTML slice',
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
