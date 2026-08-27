/**
 * Gem-pinned HTML rendering behaviour across every render kind: the carrier
 * defaults, the leaf and formula kinds, the kinds that inherit a carrier
 * default, and the kinds that define their own `to_html`.
 * The oracle-backed pins were measured on plurimath 0.11.6 at 00c52783 by
 * instantiating the class and calling `to_html(options: {})` — local probes
 * wt-html-probe.rb, wt-html-independent-probe.rb, wt-html-p2a-probe.rb,
 * wt-html-own-kinds-probe.rb and wt-html-fenced-linebreak-probe.rb.
 * The measured boundary refusals below pin the paths whose generated HTML
 * data is deferred to a later increment.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/errors";
import {
  AbsNode,
  BarNode,
  BaseNode,
  BinaryFunctionNode,
  CeilNode,
  ColorNode,
  DdotNode,
  DotNode,
  FencedNode,
  FloorNode,
  FontStyleNode,
  FormulaNode,
  FracNode,
  HatNode,
  IntNode,
  LinebreakNode,
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
  ProdNode,
  SqrtNode,
  SumNode,
  SymbolNode,
  TableNode,
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

function expectHtmlError(
  run: () => unknown,
  expected: { readonly kind: string; readonly message: string },
): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(RenderError);
  expect(thrown).toMatchObject({
    code: "RENDER_ERROR",
    format: "html",
    ...expected,
  });
}

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
    expectHtmlError(
      () =>
        toHtml(
          new UnaryFunctionNode({
            name: "Sin",
            parameterOne: [symbol("a"), null, symbol("b")] as unknown as readonly SymbolNode[],
          }),
        ),
      {
        kind: "unknown",
        message:
          "unaryFunction.parameterOne[1]: cannot render nil — the gem raises NoMethodError here",
      },
    );
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
    expectHtmlError(() => toHtml(new FracNode({ parameterOne: [], parameterTwo: symbol() })), {
      kind: "unknown",
      message: "frac.parameterOne: cannot render a list — the gem raises NoMethodError here",
    });
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
    expectHtmlError(
      () =>
        toHtml(
          new IntNode({ parameterOne: symbol("a"), parameterTwo: [], parameterThree: symbol("c") }),
        ),
      {
        kind: "unknown",
        message: "int.parameterTwo: cannot render a list — the gem raises NoMethodError here",
      },
    );
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
      expectHtmlError(() => toHtml(inherited.make([], symbol()), {}), {
        kind: "unknown",
        message: `${inherited.kind}.parameterOne: cannot render a list — the gem raises NoMethodError here`,
      });
      expectHtmlError(() => toHtml(inherited.make(symbol(), []), {}), {
        kind: "unknown",
        message: `${inherited.kind}.parameterTwo: cannot render a list — the gem raises NoMethodError here`,
      });
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
    expectHtmlError(() => toHtml(make([], symbol(), symbol()), {}), {
      kind: "unknown",
      message: "oint.parameterOne: cannot render a list — the gem raises NoMethodError here",
    });
    expectHtmlError(() => toHtml(make(symbol(), [], symbol()), {}), {
      kind: "unknown",
      message: "oint.parameterTwo: cannot render a list — the gem raises NoMethodError here",
    });
    expectHtmlError(() => toHtml(make(symbol(), symbol(), []), {}), {
      kind: "unknown",
      message: "oint.parameterThree: cannot render a list — the gem raises NoMethodError here",
    });
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
    for (const parameterOne of ["unicode[:kappa]", "preunicode[:Gamma]post"]) {
      expectHtmlError(() => toHtml(new TextNode({ parameterOne })), {
        kind: "text",
        message:
          "text.parameterOne: unicode[:name] substitution needs generated HTML data from phase two",
      });
    }
  });

  it("joins Formula and Mrow children with spaces", () => {
    expect(toHtml(new FormulaNode({ value: [symbol("a"), symbol("b")] }))).toBe("a b");
    expect(toHtml(new MrowNode({ value: [symbol("a"), symbol("b")] }))).toBe("a b");
    expect(
      toHtml(new FormulaNode({ value: [new TextNode({ parameterOne: null }), symbol("x")] })),
    ).toBe(" x");
  });

  it("refuses a Formula whose value is nil where the gem raises", () => {
    expectHtmlError(() => toHtml(new FormulaNode({ value: null })), {
      kind: "formula",
      message: "formula.value: is nil, not a list — the gem raises here",
    });
  });

  it("renders end to end from an AsciiMath parse", () => {
    expect(toHtml(parseAsciimath("abs(x)"))).toBe("<i>abs</i><i>x</i>");
  });
});

describe("HTML refusal parity", () => {
  it("refuses nary because the gem has no to_html method in its ancestry", () => {
    expectHtmlError(() => toHtml(new NaryNode()), {
      kind: "nary",
      message: "Nary has no HTML renderer in the pinned gem and refuses instead of emitting markup",
    });
  });
});

describe("HTML own-kind rendering", () => {
  it("renders Base's occupied and nil slots and refuses array slots", () => {
    expect(toHtml(new BaseNode({ parameterOne: symbol(), parameterTwo: symbol() }))).toBe(
      "<i>x</i><sub>x</sub>",
    );
    expect(toHtml(new BaseNode({ parameterOne: null, parameterTwo: symbol() }))).toBe(
      "<sub>x</sub>",
    );
    expect(toHtml(new BaseNode({ parameterOne: symbol(), parameterTwo: null }))).toBe("<i>x</i>");
    expectHtmlError(() => toHtml(new BaseNode({ parameterOne: [], parameterTwo: symbol() })), {
      kind: "unknown",
      message: "base.parameterOne: cannot render a list — the gem raises NoMethodError here",
    });
    expectHtmlError(() => toHtml(new BaseNode({ parameterOne: symbol(), parameterTwo: [] })), {
      kind: "unknown",
      message: "base.parameterTwo: cannot render a list — the gem raises NoMethodError here",
    });
  });

  it("renders Ceil's literal entities around its child", () => {
    expect(toHtml(new CeilNode({ parameterOne: symbol() }))).toBe(
      "<i>&#x2308;</i><i>x</i><i>&#x2309;</i>",
    );
    expect(toHtml(new CeilNode({ parameterOne: null }))).toBe("<i>&#x2308;</i><i>&#x2309;</i>");
    expect(toHtml(new CeilNode({ parameterOne: new TextNode({ parameterOne: null }) }))).toBe(
      "<i>&#x2308;</i><i></i><i>&#x2309;</i>",
    );
    expectHtmlError(() => toHtml(new CeilNode({ parameterOne: [] })), {
      kind: "unknown",
      message: "ceil.parameterOne: cannot render a list — the gem raises NoMethodError here",
    });
  });

  it("renders Ddot's child before its measured two-dot suffix", () => {
    expect(toHtml(new DdotNode({ parameterOne: symbol() }))).toBe("<i>x</i><i>..</i>");
    expect(toHtml(new DdotNode({ parameterOne: null }))).toBe("<i>..</i>");
    expect(toHtml(new DdotNode({ parameterOne: new TextNode({ parameterOne: null }) }))).toBe(
      "<i></i><i>..</i>",
    );
    expectHtmlError(() => toHtml(new DdotNode({ parameterOne: [] })), {
      kind: "unknown",
      message: "ddot.parameterOne: cannot render a list — the gem raises NoMethodError here",
    });
  });

  it("renders Fenced's deterministic parens and joins body children without separators", () => {
    expect(
      toHtml(
        new FencedNode({
          parameterOne: new SymbolNode({ id: "Paren", value: "(" }),
          parameterTwo: [symbol("a"), symbol("b")],
          parameterThree: new SymbolNode({ id: "Paren", value: ")" }),
        }),
      ),
    ).toBe("<i>(</i>ab<i>)</i>");
    expect(
      toHtml(
        new FencedNode({
          parameterOne: symbol("x"),
          parameterTwo: [symbol("a"), new TextNode({ parameterOne: null }), symbol("b")],
          parameterThree: symbol("x"),
        }),
      ),
    ).toBe("<i>x</i>ab<i>x</i>");
  });

  it("renders Fenced's nil and empty body identically and refuses a non-list body", () => {
    const make = (parameterTwo: NodeParameter) =>
      new FencedNode({
        parameterOne: symbol("("),
        parameterTwo,
        parameterThree: symbol(")"),
      });

    expect(toHtml(make(null))).toBe("<i>(</i><i>)</i>");
    expect(toHtml(make([]))).toBe("<i>(</i><i>)</i>");
    expectHtmlError(() => toHtml(make(symbol())), {
      kind: "fenced",
      message: "fenced.parameterTwo: is an object, not a list — the gem raises NoMethodError here",
    });
  });

  it("renders deterministic composite Fenced parens", () => {
    const nilItem = [null] as unknown as readonly MathNode[];
    const make = (parameterOne: NodeParameter) =>
      toHtml(
        new FencedNode({
          parameterOne,
          parameterTwo: [symbol()],
          parameterThree: symbol(")"),
        }),
      );

    expect(make(new FormulaNode({ value: [] }))).toBe("<i>[]</i>x<i>)</i>");
    expect(make(new FormulaNode({ value: nilItem }))).toBe("<i>[nil]</i>x<i>)</i>");
    expect(make(new MrowNode({ value: [] }))).toBe("<i>[]</i>x<i>)</i>");
    expect(make(new MrowNode({ value: nilItem }))).toBe("<i>[nil]</i>x<i>)</i>");
    expect(make(new TableNode({ value: null }))).toBe("<i></i>x<i>)</i>");
    expect(make(new TableNode({ value: [] }))).toBe("<i>[]</i>x<i>)</i>");
    expect(make(new TableNode({ value: nilItem }))).toBe("<i>[nil]</i>x<i>)</i>");
  });

  it("refuses Fenced paren paths requiring generated data or address-bearing inspect bytes", () => {
    expectHtmlError(
      () =>
        toHtml(
          new FencedNode({
            parameterOne: new SymbolNode({ id: "Paren::Lround" }),
            parameterTwo: [symbol()],
            parameterThree: new SymbolNode({ id: "Paren::Rround" }),
          }),
        ),
      {
        kind: "fenced",
        message:
          'fenced.parameterOne: named paren "Paren::Lround" needs generated HTML symbol data',
      },
    );

    for (const parameterOne of [
      new FormulaNode({ value: [symbol("(")] }),
      new MrowNode({ value: [symbol("(")] }),
      new TableNode({ value: [symbol("(")] }),
    ]) {
      expectHtmlError(
        () =>
          toHtml(
            new FencedNode({
              parameterOne,
              parameterTwo: [symbol()],
              parameterThree: symbol(")"),
            }),
          ),
        {
          kind: "fenced",
          message: `fenced.parameterOne: holds a "${parameterOne.kind}" node whose value contains node objects with nondeterministic Ruby #inspect addresses`,
        },
      );
    }
  });

  it("refuses constructor-bypassed Symbol paren values", () => {
    const make = (value: unknown) =>
      toHtml(
        new FencedNode({
          parameterOne: { kind: "symbol", id: "Symbol", value } as unknown as SymbolNode,
          parameterTwo: [symbol()],
          parameterThree: symbol(")"),
        }),
      );

    expectHtmlError(() => make({ a: 1 }), {
      kind: "fenced",
      message:
        'fenced.parameterOne: a "symbol" node holds an object that bypasses constructor normalization',
    });
    expectHtmlError(() => make(["a", "b"]), {
      kind: "fenced",
      message:
        'fenced.parameterOne: a "symbol" node holds a list that bypasses constructor normalization',
    });
  });

  it("renders every measured FontStyle alias as its child alone", () => {
    const names = [
      "Bold",
      "BoldFraktur",
      "BoldItalic",
      "BoldSansSerif",
      "BoldScript",
      "DoubleStruck",
      "Fraktur",
      "Italic",
      "Monospace",
      "Normal",
      "SansSerif",
      "SansSerifBoldItalic",
      "SansSerifItalic",
      "Script",
    ] as const;

    for (const name of names) {
      expect(toHtml(new FontStyleNode({ name, parameterOne: symbol() }))).toBe("x");
    }
    expect(toHtml(new FontStyleNode({ parameterOne: null }))).toBe("");
    expectHtmlError(() => toHtml(new FontStyleNode({ name: "Unknown", parameterOne: symbol() })), {
      kind: "fontStyle",
      message: 'FontStyle alias "Unknown" has not been measured for HTML',
    });
    expectHtmlError(() => toHtml(new FontStyleNode({ parameterOne: [] })), {
      kind: "unknown",
      message: "fontStyle.parameterOne: cannot render a list — the gem raises NoMethodError here",
    });
  });

  it("places Linebreak according to the measured linebreakstyle", () => {
    expect(toHtml(new LinebreakNode({ parameterOne: symbol() }))).toBe("<br/>x");
    expect(
      toHtml(
        new LinebreakNode({ parameterOne: symbol(), attributes: { linebreakstyle: "after" } }),
      ),
    ).toBe("x<br/>");
    expect(
      toHtml(
        new LinebreakNode({ parameterOne: symbol(), attributes: { linebreakstyle: "sideways" } }),
      ),
    ).toBe("<br/>x");
    expect(toHtml(new LinebreakNode({ parameterOne: null }))).toBe("<br/>");
    expectHtmlError(() => toHtml(new LinebreakNode({ parameterOne: [] })), {
      kind: "unknown",
      message: "linebreak.parameterOne: cannot render a list — the gem raises NoMethodError here",
    });
  });

  it.each([
    [
      "prod",
      (one: NodeParameter, two: NodeParameter, three: NodeParameter) =>
        new ProdNode({ parameterOne: one, parameterTwo: two, parameterThree: three }),
      "&prod;",
    ],
    [
      "sum",
      (one: NodeParameter, two: NodeParameter, three: NodeParameter) =>
        new SumNode({ parameterOne: one, parameterTwo: two, parameterThree: three }),
      "&sum;",
    ],
  ] as const)("renders %s's limits and ignores its body", (_kind, make, entity) => {
    expect(toHtml(make(symbol(), symbol(), symbol()))).toBe(
      `<i>${entity}</i><sub>x</sub><sup>x</sup>`,
    );
    expect(toHtml(make(null, symbol(), symbol()))).toBe(`<i>${entity}</i><sup>x</sup>`);
    expect(toHtml(make(symbol(), null, symbol()))).toBe(`<i>${entity}</i><sub>x</sub>`);
    expect(toHtml(make(symbol(), symbol(), []))).toBe(`<i>${entity}</i><sub>x</sub><sup>x</sup>`);
    expectHtmlError(() => toHtml(make([], symbol(), symbol())), {
      kind: "unknown",
      message: `${_kind}.parameterOne: cannot render a list — the gem raises NoMethodError here`,
    });
    expectHtmlError(() => toHtml(make(symbol(), [], symbol())), {
      kind: "unknown",
      message: `${_kind}.parameterTwo: cannot render a list — the gem raises NoMethodError here`,
    });
  });

  const td = (...values: MathNode[]) =>
    new BinaryFunctionNode({ name: "Td", parameterOne: values, parameterTwo: null });
  const tr = (...cells: BinaryFunctionNode[]) =>
    new UnaryFunctionNode({ name: "Tr", parameterOne: cells });

  it("renders Table's measured row and cell tree", () => {
    expect(
      toHtml(
        new TableNode({
          value: [tr(td(symbol("a")), td(symbol("b"))), tr(td(symbol("c"), symbol("d")))],
        }),
      ),
    ).toBe("<table><tr><td>a</td><td>b</td></tr><tr><td>cd</td></tr></table>");
    expect(toHtml(new TableNode({ value: [] }))).toBe("<table></table>");
    expect(toHtml(new TableNode({ value: [symbol()] }))).toBe("<table>x</table>");
    expectHtmlError(() => toHtml(new TableNode({ value: null })), {
      kind: "table",
      message: "table.value: is nil, not a list — the gem raises NoMethodError here",
    });
  });

  it("renders every measured Table alias with the same HTML tree", () => {
    const names = [
      "Align",
      "Array",
      "Bmatrix",
      "Cases",
      "Eqarray",
      "Matrix",
      "Multline",
      "Pmatrix",
      "Split",
      "Vmatrix",
    ] as const;
    for (const name of names) {
      expect(toHtml(new TableNode({ name, value: [tr(td(symbol()))] }))).toBe(
        "<table><tr><td>x</td></tr></table>",
      );
    }
    expectHtmlError(() => toHtml(new TableNode({ name: "Unknown", value: [tr(td(symbol()))] })), {
      kind: "table",
      message: 'Table alias "Unknown" has not been measured for HTML',
    });
  });
});

describe("HTML measured boundary refusals", () => {
  it("refuses unmeasured carrier aliases instead of inventing plausible output", () => {
    expectHtmlError(() => toHtml(new UnaryFunctionNode({ name: "Mbox", parameterOne: symbol() })), {
      kind: "unaryFunction",
      message: 'UnaryFunction alias "Mbox" has not been measured for HTML in this slice',
    });
    expectHtmlError(() => toHtml(new BinaryFunctionNode({ name: "Power" })), {
      kind: "binaryFunction",
      message: 'BinaryFunction alias "Power" has not been measured for HTML in this slice',
    });
    expectHtmlError(() => toHtml(new TernaryFunctionNode({ name: "PowerBase" })), {
      kind: "ternaryFunction",
      message: 'TernaryFunction alias "PowerBase" has not been measured for HTML in this slice',
    });
  });

  it("refuses formula aliases outside the plain Formula slice", () => {
    expectHtmlError(
      () => toHtml(new FormulaNode({ name: "UnmeasuredFormula", value: [symbol()] })),
      {
        kind: "formula",
        message: 'Formula alias "UnmeasuredFormula" has not been measured for HTML in this slice',
      },
    );
  });

  it("refuses a named symbol whose generated HTML value is deferred to a later increment", () => {
    for (const value of [undefined, "WRONG", "&#x2b;"]) {
      expectHtmlError(() => toHtml(new SymbolNode({ id: "Plus", value })), {
        kind: "symbol",
        message: 'Symbol "Plus" needs generated HTML data, which belongs to phase two',
      });
    }
  });

  it("refuses a non-string Text value instead of silently dropping it", () => {
    expectHtmlError(() => toHtml(new TextNode({ parameterOne: symbol() })), {
      kind: "text",
      message: "text.parameterOne: holds an object, not a reproducible text value",
    });
  });
});
