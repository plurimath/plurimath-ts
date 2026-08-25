/**
 * Gem-pinned LaTeX rendering behaviour the corpus and sweep cannot reach:
 * nodes built by hand and nil-slot combinations. Every expected string below
 * was measured on the pinned oracle (plurimath 0.11.6 at 00c52783,
 * 2026-08-06) by instantiating the class and calling `to_latex(options: {})`
 * — the probe keys (probe_census.rb / probe_edges.rb / probe_tables.rb) are
 * quoted beside the pins. Where the gem CRASHES (NoMethodError or TypeError,
 * wrapped into `Math::ParseError` at its formula boundary), this port raises
 * `RenderError` — the §5 runtime-boundary mapping.
 *
 * The `wrapped/*` describe is the glass-box pin for the measured
 * `validate_function_formula` census (`PLAIN_WRAPPED_UNARY_NAMES` and
 * friends in the renderer): every reachable unary name is asserted plain or
 * `\left (`-wrapped exactly as the oracle answered, so a drifted table row
 * fails here by name.
 */

import { describe, expect, it } from "vitest";
import { MissingSymbolDataError, ParseError, RenderError } from "../../../src/core/errors";
import {
  BarNode,
  BaseNode,
  BinaryFunctionNode,
  CeilNode,
  ColorNode,
  FencedNode,
  FloorNode,
  FontStyleNode,
  FormulaNode,
  FracNode,
  HatNode,
  IntNode,
  LinebreakNode,
  MpaddedNode,
  MrowNode,
  NaryNode,
  NormNode,
  NumberNode,
  ObraceNode,
  OintNode,
  OversetNode,
  ProdNode,
  SqrtNode,
  SumNode,
  SymbolNode,
  TableNode,
  TernaryFunctionNode,
  TextNode,
  UbraceNode,
  UlNode,
  UnaryFunctionNode,
  UndersetNode,
} from "../../../src/core/nodes";
import { toLatex } from "../../../src/formats/latex/renderer";
import { LATEX_SYMBOL_EXCEPTIONS } from "../../../src/generated/latex/exceptions";

const x = () => new SymbolNode({ value: "x" });
const sym = (value: string) => new SymbolNode({ value });
const two = () => new NumberNode({ value: "2" });
const ab = () => new FormulaNode({ value: [sym("a"), sym("b")] });
const vert = () => new SymbolNode({ id: "Paren::Vert" });
const paren = (id: string) => new SymbolNode({ id });
const td = (...cells: readonly (SymbolNode | NumberNode)[]) =>
  new BinaryFunctionNode({ name: "Td", parameterOne: cells });
const tdOf = (cells: readonly (SymbolNode | NumberNode)[]) =>
  new BinaryFunctionNode({ name: "Td", parameterOne: cells });
/** One `Td` per cell, as the gem's table probes were built. */
const tr = (...cells: readonly (SymbolNode | NumberNode)[]) =>
  new UnaryFunctionNode({ name: "Tr", parameterOne: cells.map((cell) => td(cell)) });
const unary = (
  name: string,
  parameterOne?: ConstructorParameters<typeof UnaryFunctionNode>[0]["parameterOne"],
) => new UnaryFunctionNode({ name, parameterOne });

describe("unary functions", () => {
  it("renders \\name{...} with arrays compacted and joined by a space", () => {
    // Probes unary/Sin/sym => "\sin{x}"; unary/Sin/array => "\sin{x y}";
    // unary/Sin/array-nil => "\sin{x y}"; unary/Sin/nil => "\sin{}".
    expect(toLatex(unary("Sin", x()))).toBe("\\sin{x}");
    expect(toLatex(unary("Sin", [x(), sym("y")]))).toBe("\\sin{x y}");
    expect(
      toLatex(
        new UnaryFunctionNode({
          name: "Sin",
          parameterOne: [x(), null, sym("y")] as unknown as readonly SymbolNode[],
        }),
      ),
    ).toBe("\\sin{x y}");
    expect(toLatex(unary("Sin"))).toBe("\\sin{}");
    // Probe unary/Sin/formula => "\sin{a b}".
    expect(toLatex(unary("Sin", ab()))).toBe("\\sin{a b}");
  });

  it("glb and lcm carry no backslash", () => {
    // Probes unary/Glb/sym => "glb{x}"; unary/Lcm/sym => "lcm{x}".
    expect(toLatex(unary("Glb", x()))).toBe("glb{x}");
    expect(toLatex(unary("Lcm", x()))).toBe("lcm{x}");
    expect(toLatex(unary("Lcm"))).toBe("lcm{}");
  });

  it("refuses a class name outside the AsciiMath-reachable set", () => {
    expect(() => toLatex(unary("Mbox", x()))).toThrow(RenderError);
    expect(() => toLatex(new BinaryFunctionNode({ name: "Menclose" }))).toThrow(RenderError);
    expect(() => toLatex(new TernaryFunctionNode({ name: "Multiscript" }))).toThrow(RenderError);
  });

  it("Hom renders the carrier default, though the transform cannot build it", () => {
    // Measured on the pinned oracle: Hom.new(Symbol("x")).to_latex is
    // "\hom{x}" and Hom.new(nil) is "\hom{}".
    // `Hom.instance_method(:to_latex).owner` is UnaryFunction, so — unlike
    // glb and lcm above — it keeps the backslash. Nothing in the transform
    // builds it, which is why the name is admitted by hand rather than by the
    // census projection.
    expect(toLatex(unary("Hom", x()))).toBe("\\hom{x}");
    expect(toLatex(unary("Hom"))).toBe("\\hom{}");
  });

  it("a bare string parameter crashes as the gem does", () => {
    // Probe unary/Sin/string => NoMethodError.
    expect(() => toLatex(new UnaryFunctionNode({ name: "Sin", parameterOne: "oops" }))).toThrow(
      RenderError,
    );
  });
});

describe("left and right", () => {
  it("maps every measured row of the inverted paren constant", () => {
    // Probes lr/* (probe_tables.rb): the COMPLETE inverted constant.
    const rows: readonly (readonly [string, string])[] = [
      ["&#x5c;", "\\backslash"],
      ["&#x2329;", "\\langle"],
      ["&#x232a;", "\\rangle"],
      ["&#x230a;", "\\lfloor"],
      ["&#x230b;", "\\rfloor"],
      ["&#x2308;", "\\lceil"],
      ["&#x2309;", "\\rceil"],
      ["&#x7b;", "\\lbrace"],
      ["&#x7d;", "\\rbrace"],
      ["&#x5b;", "\\lbrack"],
      ["&#x5d;", "\\rbrack"],
      ["&#x2016;", "\\|"],
      ["&#x7c;", "\\vert"],
      ["{", "\\{"],
      ["}", "\\}"],
      ["(", "("],
      [")", ")"],
      ["<", "<"],
      [">", ">"],
      ["/", "/"],
      ["|", "|"],
      ["[", "["],
      ["]", "]"],
    ];
    for (const [stored, rendered] of rows) {
      expect(toLatex(unary("Left", stored)), stored).toBe(`\\left ${rendered}`);
      expect(toLatex(unary("Right", stored)), stored).toBe(`\\right ${rendered}`);
    }
  });

  it("misses fall back to a dot — nil, unmapped strings, and NODES alike", () => {
    // Probes left/nil, left/"{:", left/"||", left/"\\", left/node — a node in
    // the slot is a Ruby hash-lookup miss, so unlike asciimath there is no
    // inspect leak to refuse.
    expect(toLatex(unary("Left"))).toBe("\\left .");
    expect(toLatex(unary("Left", "{:"))).toBe("\\left .");
    expect(toLatex(unary("Right", ":}"))).toBe("\\right .");
    expect(toLatex(unary("Left", "||"))).toBe("\\left .");
    expect(toLatex(unary("Left", "\\"))).toBe("\\left .");
    expect(toLatex(unary("Left", x()))).toBe("\\left .");
  });
});

describe("binary functions", () => {
  it("lim uses plain braces where log goes through latex_wrapped", () => {
    // Probes binary/Lim/both => "\lim_{a}^{b}"; binary/Log/formula =>
    // "\log_{ \left ( a b \right ) }"; lim/formula-first => "\lim_{a b}^{a b}".
    expect(
      toLatex(
        new BinaryFunctionNode({ name: "Lim", parameterOne: sym("a"), parameterTwo: sym("b") }),
      ),
    ).toBe("\\lim_{a}^{b}");
    expect(
      toLatex(new BinaryFunctionNode({ name: "Lim", parameterOne: ab(), parameterTwo: ab() })),
    ).toBe("\\lim_{a b}^{a b}");
    expect(toLatex(new BinaryFunctionNode({ name: "Log", parameterOne: ab() }))).toBe(
      "\\log_{ \\left ( a b \\right ) }",
    );
    expect(toLatex(new BinaryFunctionNode({ name: "Log", parameterTwo: sym("b") }))).toBe(
      "\\log^{b}",
    );
  });

  it("root is nil-safe on both slots", () => {
    // Probes binary/Root/*: "\sqrt[3]{x}", "\sqrt[3]{}", "\sqrt[]{x}", "\sqrt[]{}".
    expect(
      toLatex(new BinaryFunctionNode({ name: "Root", parameterOne: sym("3"), parameterTwo: x() })),
    ).toBe("\\sqrt[3]{x}");
    expect(toLatex(new BinaryFunctionNode({ name: "Root" }))).toBe("\\sqrt[]{}");
  });

  it("stackrel takes the carrier default with latex_wrapped fields", () => {
    // Probes binary/Stackrel/both => "\stackrel{a}{b}"; /formula =>
    // "\stackrel{ \left ( a b \right ) }{ \left ( a b \right ) }"; /none => "\stackrel".
    expect(
      toLatex(
        new BinaryFunctionNode({
          name: "Stackrel",
          parameterOne: sym("a"),
          parameterTwo: sym("b"),
        }),
      ),
    ).toBe("\\stackrel{a}{b}");
    expect(
      toLatex(new BinaryFunctionNode({ name: "Stackrel", parameterOne: ab(), parameterTwo: ab() })),
    ).toBe("\\stackrel{ \\left ( a b \\right ) }{ \\left ( a b \\right ) }");
    expect(toLatex(new BinaryFunctionNode({ name: "Stackrel" }))).toBe("\\stackrel");
  });

  it("power appends ^{} unconditionally and crashes on a nil base", () => {
    // Probes power/both => "x^{2}"; power/no-exp => "x^{}"; power/no-base =>
    // NoMethodError; power/formula-base => "a b^{2}" (no braces).
    expect(
      toLatex(new BinaryFunctionNode({ name: "Power", parameterOne: x(), parameterTwo: two() })),
    ).toBe("x^{2}");
    expect(toLatex(new BinaryFunctionNode({ name: "Power", parameterOne: x() }))).toBe("x^{}");
    expect(
      toLatex(new BinaryFunctionNode({ name: "Power", parameterOne: ab(), parameterTwo: two() })),
    ).toBe("a b^{2}");
    expect(() => toLatex(new BinaryFunctionNode({ name: "Power", parameterTwo: two() }))).toThrow(
      RenderError,
    );
  });

  it("mod braces only the present sides", () => {
    // Probes mod/*: "{a} \mod {b}", "{a} \mod ", " \mod {b}", " \mod ".
    expect(
      toLatex(
        new BinaryFunctionNode({ name: "Mod", parameterOne: sym("a"), parameterTwo: sym("b") }),
      ),
    ).toBe("{a} \\mod {b}");
    expect(toLatex(new BinaryFunctionNode({ name: "Mod", parameterOne: sym("a") }))).toBe(
      "{a} \\mod ",
    );
    expect(toLatex(new BinaryFunctionNode({ name: "Mod", parameterTwo: sym("b") }))).toBe(
      " \\mod {b}",
    );
    expect(toLatex(new BinaryFunctionNode({ name: "Mod" }))).toBe(" \\mod ");
  });
});

describe("base, powerbase and named shapes", () => {
  it("base braces a Formula first slot and always writes _{...}", () => {
    // Probes base/*: "x_{2}", "x_{}", "_{2}", "{a b}_{2}", "{a}_{2}";
    // base/fenced-first => "( x )_{2}" (no braces — Fenced is not a Formula).
    expect(toLatex(new BaseNode({ parameterOne: x(), parameterTwo: two() }))).toBe("x_{2}");
    expect(toLatex(new BaseNode({ parameterOne: x() }))).toBe("x_{}");
    expect(toLatex(new BaseNode({ parameterTwo: two() }))).toBe("_{2}");
    expect(toLatex(new BaseNode({ parameterOne: ab(), parameterTwo: two() }))).toBe("{a b}_{2}");
    expect(
      toLatex(
        new BaseNode({ parameterOne: new MrowNode({ value: [sym("a")] }), parameterTwo: two() }),
      ),
    ).toBe("{a}_{2}");
    const fenced = new FencedNode({
      parameterOne: paren("Paren::Lround"),
      parameterTwo: [x()],
      parameterThree: paren("Paren::Rround"),
    });
    expect(toLatex(new BaseNode({ parameterOne: fenced, parameterTwo: two() }))).toBe("( x )_{2}");
  });

  it("powerbase always writes both _{...}^{...}, first slot never braced", () => {
    // Probes powerbase/111..000 and powerbase/formula-first.
    const pb = (one?: SymbolNode | FormulaNode, twoP?: NumberNode, three?: NumberNode) =>
      toLatex(
        new TernaryFunctionNode({
          name: "PowerBase",
          parameterOne: one,
          parameterTwo: twoP,
          parameterThree: three,
        }),
      );
    expect(pb(x(), new NumberNode({ value: "1" }), two())).toBe("x_{1}^{2}");
    expect(pb(x(), new NumberNode({ value: "1" }))).toBe("x_{1}^{}");
    expect(pb(x(), undefined, two())).toBe("x_{}^{2}");
    expect(pb(undefined, new NumberNode({ value: "1" }), two())).toBe("_{1}^{2}");
    expect(pb()).toBe("_{}^{}");
    expect(pb(ab(), new NumberNode({ value: "1" }), two())).toBe("a b_{1}^{2}");
  });

  it("frac is nil-safe on both slots", () => {
    // Probes frac/*: "\frac{a}{b}", "\frac{a}{}", "\frac{}{b}", "\frac{}{}".
    expect(toLatex(new FracNode({ parameterOne: sym("a"), parameterTwo: sym("b") }))).toBe(
      "\\frac{a}{b}",
    );
    expect(toLatex(new FracNode({}))).toBe("\\frac{}{}");
  });

  it("overset and underset drop absent fields entirely", () => {
    // Probes binary/Overset/*: "\overset{a}{b}", "\overset{a}", "\overset{b}", "\overset".
    expect(toLatex(new OversetNode({ parameterOne: sym("a"), parameterTwo: sym("b") }))).toBe(
      "\\overset{a}{b}",
    );
    expect(toLatex(new OversetNode({ parameterOne: sym("a") }))).toBe("\\overset{a}");
    expect(toLatex(new OversetNode({ parameterTwo: sym("b") }))).toBe("\\overset{b}");
    expect(toLatex(new UndersetNode({}))).toBe("\\underset");
  });
});

describe("latex_wrapped and the validate_function_formula census", () => {
  const wrappedAs = (field: Parameters<typeof toLatex>[0]) =>
    toLatex(new OversetNode({ parameterOne: field, parameterTwo: sym("u") }));

  it("every reachable unary name wraps exactly as the oracle measured", () => {
    // Probes wrapped/unary-* — plain for the 27 validate-false classes,
    // \left ( for Cancel, Ker, Liminf, Limsup and Sup.
    const plain = [
      "Arccos",
      "Arcsin",
      "Arctan",
      "Cos",
      "Cosh",
      "Cot",
      "Coth",
      "Csc",
      "Csch",
      "Deg",
      "Det",
      "Dim",
      "Exp",
      "Gcd",
      "Lg",
      "Ln",
      "Lub",
      "Max",
      "Min",
      "Sec",
      "Sech",
      "Sin",
      "Sinh",
      "Tan",
      "Tanh",
    ];
    for (const name of plain) {
      expect(wrappedAs(unary(name, x())), name).toBe(`\\overset{\\${name.toLowerCase()}{x}}{u}`);
    }
    // The two no-backslash classes are also plain-wrapped.
    expect(wrappedAs(unary("Glb", x()))).toBe("\\overset{glb{x}}{u}");
    expect(wrappedAs(unary("Lcm", x()))).toBe("\\overset{lcm{x}}{u}");
    for (const name of ["Cancel", "Ker", "Liminf", "Limsup", "Sup"]) {
      expect(wrappedAs(unary(name, x())), name).toBe(
        `\\overset{ \\left ( \\${name.toLowerCase()}{x} \\right ) }{u}`,
      );
    }
  });

  it("symbols, numbers, text, left/right and the brace accents stay plain", () => {
    // Probes wrapped/symbol, /number, /text, /left, /obrace, /hat-node, /tilde-node.
    expect(wrappedAs(x())).toBe("\\overset{x}{u}");
    expect(wrappedAs(two())).toBe("\\overset{2}{u}");
    expect(wrappedAs(new TextNode({ parameterOne: "t" }))).toBe("\\overset{\\text{t}}{u}");
    expect(wrappedAs(unary("Left", "("))).toBe("\\overset{\\left (}{u}");
    expect(wrappedAs(new ObraceNode({ parameterOne: x() }))).toBe("\\overset{\\overbrace{x}}{u}");
    expect(wrappedAs(new UbraceNode({ parameterOne: x() }))).toBe("\\overset{\\underbrace{x}}{u}");
    expect(wrappedAs(new HatNode({ parameterOne: x() }))).toBe("\\overset{\\hat{x}}{u}");
  });

  it("formulas wrap — unless they hold BOTH a Left and a Right", () => {
    // Probes wrapped/formula, wrapped/formula-leftright,
    // wrapped/formula-left-only, wrapped/formula-right-only.
    expect(wrappedAs(ab())).toBe("\\overset{ \\left ( a b \\right ) }{u}");
    const leftRight = new FormulaNode({ value: [unary("Left", "("), x(), unary("Right", ")")] });
    expect(wrappedAs(leftRight)).toBe("\\overset{\\left ( x \\right )}{u}");
    const leftOnly = new FormulaNode({ value: [unary("Left", "("), x()] });
    expect(wrappedAs(leftOnly)).toBe("\\overset{ \\left ( \\left ( x \\right ) }{u}");
    const rightOnly = new FormulaNode({ value: [x(), unary("Right", ")")] });
    expect(wrappedAs(rightOnly)).toBe("\\overset{ \\left ( x \\right ) \\right ) }{u}");
  });

  it("frac, tables, font styles and the rest of the node space wrap", () => {
    // Probes wrapped/frac, wrapped/table, wrapped/fontstyle-bolditalic, wrapped/sqrt-node.
    expect(wrappedAs(new FracNode({ parameterOne: sym("a"), parameterTwo: sym("b") }))).toBe(
      "\\overset{ \\left ( \\frac{a}{b} \\right ) }{u}",
    );
    const table = new TableNode({
      value: [tr(x())],
      openParen: paren("Paren::Lsquare"),
      closeParen: paren("Paren::Rsquare"),
    });
    expect(wrappedAs(table)).toBe(
      "\\overset{ \\left ( \\left [\\begin{matrix}x\\end{matrix}\\right ] \\right ) }{u}",
    );
    expect(wrappedAs(new FontStyleNode({ name: "BoldItalic", parameterOne: x() }))).toBe(
      "\\overset{ \\left ( x \\right ) }{u}",
    );
    expect(wrappedAs(new SqrtNode({ parameterOne: x() }))).toBe(
      "\\overset{ \\left ( \\sqrt{x} \\right ) }{u}",
    );
  });
});

describe("the big operators", () => {
  it("int/sum/prod interpolate plainly; oint alone goes through latex_wrapped", () => {
    // Probes nary-op/Int/formula-sub => "\int_{a b}"; nary-op/Oint/formula-sub
    // => "\oint_{ \left ( a b \right ) }".
    expect(toLatex(new IntNode({ parameterOne: ab() }))).toBe("\\int_{a b}");
    expect(toLatex(new OintNode({ parameterOne: ab() }))).toBe("\\oint_{ \\left ( a b \\right ) }");
    expect(
      toLatex(
        new SumNode({ parameterOne: sym("a"), parameterTwo: sym("b"), parameterThree: sym("c") }),
      ),
    ).toBe("\\sum_{a}^{b} c");
    expect(toLatex(new ProdNode({}))).toBe("\\prod");
  });

  it("Ruby strip trims the ASCII gap but keeps a no-break space", () => {
    // Probes nary-op/Int/none => "\int"; nary-op/Int/third-nbsp => "\int x ".
    expect(toLatex(new IntNode({}))).toBe("\\int");
    expect(toLatex(new IntNode({ parameterThree: sym("x ") }))).toBe("\\int x ");
    expect(toLatex(new IntNode({ parameterOne: sym("a"), parameterThree: sym("c") }))).toBe(
      "\\int_{a} c",
    );
    // Probe int/empty-third: an empty third render still strips the gap.
    expect(toLatex(new IntNode({ parameterOne: sym("a"), parameterThree: sym("{:") }))).toBe(
      "\\int_{a}",
    );
  });

  it("finishes the 80k internal-whitespace regression case within 2 seconds", () => {
    // The latex mirror of PR #10 review finding 1: `rubyStrip`'s end-anchored
    // trailing regex had no start anchor, so a validator-passing tree — an
    // `int` whose third slot is a formula of N bare (nil-rendering) fontStyle
    // children then a symbol, rendering "\int " + N spaces + "x" — made every
    // position in the internal run a retry point: quadratic, where the gem's
    // C-implemented `strip` is linear.
    //
    // A single wall-clock sample proves only that this fixed-size render
    // finished within the budget on this run; it does not prove asymptotic
    // linearity. A two-size scaling ratio was rejected because a load shift
    // between samples can make either implementation look better or worse.
    // The size and budget are a cost/margin compromise: large enough to
    // separate the known quadratic implementation, with headroom for host
    // load on the current implementation.
    //
    // Calibration on 2026-08-27 with Node 26.1.0: this 80k case took
    // 91.95 ms with the index scan and 9,129.11 ms with the historical regex
    // pair. These figures describe that runtime and measurement run, not
    // every machine or invocation.
    const children: unknown[] = [];
    for (let i = 0; i < 80_000; i += 1) children.push({ kind: "fontStyle" });
    children.push({ kind: "symbol", value: "x" });
    const tree = { kind: "int", parameterThree: { kind: "formula", value: children } };
    const start = performance.now();
    const out = toLatex(tree as never);
    const elapsed = performance.now() - start;
    expect(out).toBe(`\\int ${" ".repeat(80_000)}x`);
    expect(elapsed, `80k LaTeX render took ${elapsed.toFixed(2)} ms`).toBeLessThan(2_000);
  });

  it("nary falls back to \\int for a nil first value — or a nil RENDER", () => {
    // Probes nary/*: "f_{a}^{b} c", "\int", "f", "\int" (nil-render), "" (empty render).
    expect(
      toLatex(
        new NaryNode({
          parameterOne: sym("f"),
          parameterTwo: sym("a"),
          parameterThree: sym("b"),
          parameterFour: sym("c"),
        }),
      ),
    ).toBe("f_{a}^{b} c");
    expect(toLatex(new NaryNode({}))).toBe("\\int");
    expect(toLatex(new NaryNode({ parameterOne: new FontStyleNode({ name: "BoldItalic" }) }))).toBe(
      "\\int",
    );
    // An EMPTY render is truthy in Ruby and does not fall back.
    expect(toLatex(new NaryNode({ parameterOne: sym("{:") }))).toBe("");
    expect(toLatex(new NaryNode({ parameterFour: sym("c") }))).toBe("\\int c");
  });
});

describe("unary shapes", () => {
  it("bar/hat/obrace/ubrace/ul go bare on nil and crash on an array", () => {
    // Probes shape/Bar/nil => "\overline"; shape/Bar/array => NoMethodError;
    // shape/Ul/sym => "\underline{x}".
    expect(toLatex(new BarNode({ parameterOne: x() }))).toBe("\\overline{x}");
    expect(toLatex(new BarNode({}))).toBe("\\overline");
    expect(toLatex(new HatNode({}))).toBe("\\hat");
    expect(toLatex(new ObraceNode({}))).toBe("\\overbrace");
    expect(toLatex(new UbraceNode({}))).toBe("\\underbrace");
    expect(toLatex(new UlNode({ parameterOne: x() }))).toBe("\\underline{x}");
    expect(() => toLatex(new BarNode({ parameterOne: [x(), sym("y")] }))).toThrow(RenderError);
    expect(() => toLatex(new UlNode({ parameterOne: [x()] }))).toThrow(RenderError);
  });

  it("ceil takes latex_value where floor crashes on nil", () => {
    // Probes shape/Ceil/nil => "{\lceil  \rceil}"; shape/Ceil/array =>
    // "{\lceil x y \rceil}"; shape/Floor/nil and /array => NoMethodError.
    expect(toLatex(new CeilNode({ parameterOne: x() }))).toBe("{\\lceil x \\rceil}");
    expect(toLatex(new CeilNode({}))).toBe("{\\lceil  \\rceil}");
    expect(toLatex(new CeilNode({ parameterOne: [x(), sym("y")] }))).toBe("{\\lceil x y \\rceil}");
    expect(toLatex(new FloorNode({ parameterOne: x() }))).toBe("{\\lfloor x \\rfloor}");
    expect(() => toLatex(new FloorNode({}))).toThrow(RenderError);
    expect(() => toLatex(new FloorNode({ parameterOne: [x()] }))).toThrow(RenderError);
  });

  it("norm writes \\lVert on BOTH sides, as the gem does", () => {
    // Probes shape/Norm/sym => "{\lVert x \lVert}"; shape/Norm/nil =>
    // "{\lVert  \lVert}"; shape/Norm/array => NoMethodError.
    expect(toLatex(new NormNode({ parameterOne: x() }))).toBe("{\\lVert x \\lVert}");
    expect(toLatex(new NormNode({}))).toBe("{\\lVert  \\lVert}");
    expect(() => toLatex(new NormNode({ parameterOne: [x()] }))).toThrow(RenderError);
  });

  it("mpadded is latex_value alone — Ruby-nil out on nil in", () => {
    // Probes shape/Mpadded/sym => "x"; shape/Mpadded/nil => nil (Ruby),
    // "" at this port's string boundary; shape/Mpadded/array => "x y".
    expect(toLatex(new MpaddedNode({ parameterOne: x() }))).toBe("x");
    expect(toLatex(new MpaddedNode({}))).toBe("");
    expect(toLatex(new MpaddedNode({ parameterOne: [x(), sym("y")] }))).toBe("x y");
  });
});

describe("font styles", () => {
  it("the eight override classes emit their \\math.. command, nil-safe", () => {
    // Probes font/*/sym and font/*/nil.
    const commands: readonly (readonly [string, string])[] = [
      ["Bold", "\\mathbf"],
      ["DoubleStruck", "\\mathbb"],
      ["Fraktur", "\\mathfrak"],
      ["Italic", "\\mathit"],
      ["Monospace", "\\mathtt"],
      ["Normal", "\\mathrm"],
      ["SansSerif", "\\mathsf"],
      ["Script", "\\mathcal"],
    ];
    for (const [name, command] of commands) {
      expect(toLatex(new FontStyleNode({ name, parameterOne: x() })), name).toBe(`${command}{x}`);
      expect(toLatex(new FontStyleNode({ name })), name).toBe(`${command}{}`);
    }
  });

  it("the six other subclasses pass their value through — Ruby-nil on nil", () => {
    // Probes font/BoldFraktur/sym => "x"; font/BoldFraktur/nil => nil.
    for (const name of [
      "BoldFraktur",
      "BoldItalic",
      "BoldSansSerif",
      "BoldScript",
      "SansSerifBoldItalic",
      "SansSerifItalic",
    ]) {
      expect(toLatex(new FontStyleNode({ name, parameterOne: x() })), name).toBe("x");
      expect(toLatex(new FontStyleNode({ name })), name).toBe("");
    }
    // A nil font-style render inside a formula joins as a hole (probe
    // formula/nil-render-member => " x").
    expect(
      toLatex(new FormulaNode({ value: [new FontStyleNode({ name: "BoldItalic" }), x()] })),
    ).toBe(" x");
    // The bare carrier — name undefined — keeps the same value-alone render
    // (`FontStyle#to_latex` is `parameter_one&.to_latex`, `font_style.rb:53`).
    expect(toLatex(new FontStyleNode({ parameterOne: x(), parameterTwo: "bold" }))).toBe("x");
  });

  it("a defined name outside the measured subclass set raises rather than guessing", () => {
    // Oracle census (probe-latex-name-guards.rb on the pinned oracle,
    // 2026-08-10): FontStyle has exactly 14 subclasses — the 8 overriding
    // `to_latex` with a `\math..` command and the 6 value-alone ones above.
    // Any other defined name names no measured gem class, so it fails loudly
    // instead of rendering the value alone (the fail-loud carrier policy
    // every asciimath carrier pins, TODO.plan/deferred.md). The bare carrier
    // — name undefined — keeps its measured value-alone render.
    expect(() => toLatex(new FontStyleNode({ name: "<unmeasured>", parameterOne: x() }))).toThrow(
      RenderError,
    );
  });
});

describe("the formula carrier's name slot", () => {
  it("Mstyle — the census's one formula alias — renders exactly as Formula does", () => {
    // Probe probe-latex-name-guards.rb on the pinned oracle (2026-08-10):
    // `Mstyle.instance_method(:to_latex).owner` is `Plurimath::Math::Formula`
    // — `formula/mstyle.rb` defines no override — and `Mstyle.new([x, 2])`
    // renders "x 2", byte-identical to `Formula.new([x, 2])`; the bare-string
    // crash edge is identical too (both raise Math::ParseError).
    expect(toLatex(new FormulaNode({ name: "Mstyle", value: [x(), two()] }))).toBe("x 2");
    expect(toLatex(new FormulaNode({ value: [x(), two()] }))).toBe("x 2");
    expect(() => toLatex(new FormulaNode({ name: "Mstyle", value: [x(), "raw"] }))).toThrow(
      RenderError,
    );
  });

  it("a defined name outside the measured alias set raises rather than guessing", () => {
    // The census folds exactly one class onto the formula carrier (Mstyle —
    // probe-latex-name-guards.rb: Formula's subclass list is ["Mstyle"]).
    // "Mrow" here forges Math::Formula::Mrow onto the formula kind — the
    // model implements Mrow as its own kind, so the name has no measured
    // render on THIS carrier; rendering the carrier default for it would
    // diverge silently. The bare carrier — name undefined — keeps its
    // measured render.
    expect(() => toLatex(new FormulaNode({ name: "Mrow", value: [x()] }))).toThrow(RenderError);
    expect(() => toLatex(new FormulaNode({ name: "<unmeasured>", value: [x()] }))).toThrow(
      RenderError,
    );
  });
});

describe("symbols", () => {
  it("the base class applies specific_values, then the raw value", () => {
    // Probes symbol/*: "{:" and ":}" vanish; "{", "}", "_" get a backslash;
    // "if" becomes an operatorname; nil renders Ruby-nil ("" at the boundary).
    expect(toLatex(sym("{:"))).toBe("");
    expect(toLatex(sym(":}"))).toBe("");
    expect(toLatex(sym("{"))).toBe("\\{");
    expect(toLatex(sym("}"))).toBe("\\}");
    expect(toLatex(sym("_"))).toBe("\\_");
    expect(toLatex(sym("if"))).toBe("\\operatorname{if}");
    expect(toLatex(sym("a b"))).toBe("a b");
    expect(toLatex(new SymbolNode({}))).toBe("");
  });

  it("the abstract Paren root inherits the same rendering", () => {
    // Probes paren-base/*: "x", "\{", "\operatorname{if}", nil.
    expect(toLatex(new SymbolNode({ id: "Paren", value: "x" }))).toBe("x");
    expect(toLatex(new SymbolNode({ id: "Paren", value: "{" }))).toBe("\\{");
    expect(toLatex(new SymbolNode({ id: "Paren", value: "if" }))).toBe("\\operatorname{if}");
    expect(toLatex(new SymbolNode({ id: "Paren" }))).toBe("");
  });

  it("classed symbols render their generated literal, value ignored", () => {
    // The generated table is the census; the stored value never leaks
    // (probe symbol/slashed: options do not change to_latex either).
    expect(toLatex(new SymbolNode({ id: "Sigma" }))).toBe("\\sigma");
    expect(toLatex(new SymbolNode({ id: "Sigma", value: "|" }))).toBe("\\sigma");
    expect(toLatex(new SymbolNode({ id: "Paren::Lcurly" }))).toBe("\\{");
    expect(() => toLatex(new SymbolNode({ id: "NoSuchSymbol" }))).toThrow(MissingSymbolDataError);
  });

  it("no latex symbol varies on any context axis (generated matrix is empty)", () => {
    // The renderer threads no RenderContext — this pin is the enforcement:
    // a regeneration that introduces variants must fail here first.
    expect(LATEX_SYMBOL_EXCEPTIONS).toEqual([]);
  });
});

describe("numbers and text", () => {
  it("numbers render their raw value; a nil value renders empty", () => {
    // Probes number/*: "2", "2.5", "0002", "", nil => "".
    expect(toLatex(two())).toBe("2");
    expect(toLatex(new NumberNode({ value: "0002" }))).toBe("0002");
    expect(toLatex(new NumberNode({}))).toBe("");
  });

  it("text wraps in \\text{} and unwraps unicode[:name] tokens", () => {
    // Probes text/*: "\text{hello}", "\text{alpha}", "\text{a beta b}",
    // "\text{}" for nil; a node parameter crashes in gsub.
    expect(toLatex(new TextNode({ parameterOne: "hello" }))).toBe("\\text{hello}");
    expect(toLatex(new TextNode({ parameterOne: "unicode[:alpha]" }))).toBe("\\text{alpha}");
    expect(toLatex(new TextNode({ parameterOne: "a unicode[:beta] b" }))).toBe("\\text{a beta b}");
    expect(toLatex(new TextNode({}))).toBe("\\text{}");
    expect(() => toLatex(new TextNode({ parameterOne: x() }))).toThrow(RenderError);
  });
});

describe("degenerate value slots the gem's pipeline cannot produce", () => {
  // No gem parse puts anything but a string (or nil) into `Number#value` or
  // `Symbols::Symbol#value`, and `String(value)` cannot reproduce Ruby's
  // interpolation of anything else — so these raise (the standing
  // degenerate-input ruling: loud, never silently divergent bytes). The
  // asciimath renderer carries the same three pins for its own sites.
  it("a number with an object value raises instead of emitting [object Object]", () => {
    // Probe on the pinned oracle (2026-08-07):
    //   Plurimath::Math::Number.new({a: 1}).to_latex(options: {})
    //     => "{a: 1}"   (Ruby Hash#to_s; `String({a: 1})` is "[object Object]")
    expect(() => toLatex({ kind: "number", value: { a: 1 } } as never)).toThrow(RenderError);
  });

  it("a base symbol with an object value raises the same way", () => {
    // Probe: Plurimath::Math::Symbols::Symbol.new({a: 1}).to_latex(options: {})
    //   => "{a: 1}" — same divergence, same site shape.
    expect(() => toLatex({ kind: "symbol", value: { a: 1 } } as never)).toThrow(RenderError);
  });

  it("a node in the value slot raises too — Ruby's bytes carry an object address", () => {
    // Probe: Number.new(Number.new("2")).to_latex(options: {})
    //   => "#<Plurimath::Math::Number:0x00007337e0654380>" — not stable even
    //   in Ruby, so there is nothing to be byte-identical to.
    expect(() =>
      toLatex({ kind: "number", value: { kind: "number", value: "2" } } as never),
    ).toThrow(RenderError);
  });

  it("describes an object slot with its article — an object, never a object", () => {
    // Wording-only pin on the message the object-value ruling above raises:
    // `describeSlot` gets an explicit object branch (the c9d4034 pattern in
    // core's describeValue), so the error reads "an object".
    expect(() => toLatex({ kind: "number", value: { a: 1 } } as never)).toThrow(/holds an object/);
  });

  it("a finite number raises: JS cannot witness Ruby's Integer/Float split", () => {
    // Probe probe-latex-degenerate.rb on the pinned oracle (2026-08-10):
    //   Number.new(5).to_latex(options: {})      => "5"
    //   Number.new(5.0).to_latex(options: {})    => "5.0"
    //   Number.new(1.0e21).to_latex(options: {}) => "1.0e+21" (String() says "1e+21")
    // The JS number 5 is both Ruby values at once, so there is no single
    // byte answer to match — loud, never a guess. The forced-ivar symbol
    // probes answer the same (symbol-forced-int-5 interpolates "5").
    expect(() => toLatex({ kind: "number", value: 5 } as never)).toThrow(RenderError);
    expect(() => toLatex({ kind: "symbol", value: 5 } as never)).toThrow(RenderError);
  });
});

describe("degenerate value slots the gem spells reproducibly", () => {
  // The mirror half of the ruling above: where the gem RENDERS a degenerate
  // slot and its bytes are reproducible, this port renders the same bytes —
  // class-for-class parity cuts both ways. All pins probed on the pinned
  // oracle (probe-latex-degenerate.rb, 2026-08-10, ruby 4.0.1). The latex
  // sites are NOT the asciimath sites: `Fenced` and `Color`'s symbol branch
  // crash in the gem on exactly these shapes (next describe), so only the
  // TextRenderer/interpolation sites admit them.
  it("a boolean number value renders as Ruby spells it", () => {
    // Probes: number-true => "true"; number-false => "false" (TextRenderer's
    // result on the :latex path, same bytes as :asciimath).
    expect(toLatex({ kind: "number", value: true } as never)).toBe("true");
    expect(toLatex({ kind: "number", value: false } as never)).toBe("false");
  });

  it("the three non-finite floats interpolate as Ruby spells them", () => {
    // Probes: number-nan => "NaN"; number-inf => "Infinity"; number-neg-inf
    // => "-Infinity" — each the one JS number with exactly one Ruby preimage
    // and a byte-identical to_s, unlike every finite number (see above).
    expect(toLatex({ kind: "number", value: Number.NaN } as never)).toBe("NaN");
    expect(toLatex({ kind: "number", value: Number.POSITIVE_INFINITY } as never)).toBe("Infinity");
    expect(toLatex({ kind: "number", value: Number.NEGATIVE_INFINITY } as never)).toBe("-Infinity");
  });

  it("a base symbol spells the same primitives, alone and inside a formula join", () => {
    // Probes: symbol-forced-true (a forced @value, the only route past the
    // constructor's to_s coercion) returns the raw true from to_latex, and
    // the formula join interpolates it: formula-symbol-forced-true =>
    // "true y"; formula-symbol-forced-nan => "NaN y". At this port's string
    // boundary the raw value spells the same bytes directly.
    expect(toLatex({ kind: "symbol", value: true } as never)).toBe("true");
    expect(toLatex({ kind: "symbol", value: Number.NaN } as never)).toBe("NaN");
    expect(
      toLatex({
        kind: "formula",
        value: [
          { kind: "symbol", value: true },
          { kind: "symbol", value: "y" },
        ],
      } as never),
    ).toBe("true y");
  });

  it("color's number branch rides the same TextRenderer spelling", () => {
    // Probes: color-number-true => "{\color{true} x}"; color-number-nan =>
    // "{\color{NaN} x}" — Number#to_asciimath hands Color a real string, so
    // the gsub strip never sees a raw object. A finite number stays loud
    // (color-number-int-5 renders "5", ambiguous from JS — see above).
    const color = (value: unknown) =>
      ({
        kind: "color",
        parameterOne: { kind: "number", value },
        parameterTwo: { kind: "symbol", value: "x" },
      }) as never;
    expect(toLatex(color(true))).toBe("{\\color{true} x}");
    expect(toLatex(color(Number.NaN))).toBe("{\\color{NaN} x}");
    expect(() => toLatex(color(5))).toThrow(RenderError);
  });

  it("color admits the primitives NESTED in a formula, where the gem's join to_s's them", () => {
    // Probes: color-formula-forced-true => "{\color{true} x}";
    // color-formula-forced-nan => "{\color{NaN} x}" — Formula's join
    // stringifies the raw symbol value before Color's gsub runs, so the
    // nested shape renders where the top-level symbol shape crashes (next
    // describe).
    const color = (value: unknown) =>
      ({
        kind: "color",
        parameterOne: { kind: "formula", value: [{ kind: "symbol", value }] },
        parameterTwo: { kind: "symbol", value: "x" },
      }) as never;
    expect(toLatex(color(true))).toBe("{\\color{true} x}");
    expect(toLatex(color(Number.NaN))).toBe("{\\color{NaN} x}");
  });

  it("Left/Right stay a hash-lookup miss — every degenerate shape is a dot", () => {
    // Probes: left-true, left-nan, left-int-5, left-hash, left-node — all
    // "\left ." (LEFT_RIGHT_PARENS[non-string] is a Ruby hash miss), unlike
    // the asciimath side's interpolation. Nothing to admit and nothing to
    // refuse.
    expect(toLatex(new UnaryFunctionNode({ name: "Left", parameterOne: true as never }))).toBe(
      "\\left .",
    );
    expect(
      toLatex(new UnaryFunctionNode({ name: "Left", parameterOne: Number.NaN as never })),
    ).toBe("\\left .");
    expect(toLatex(new UnaryFunctionNode({ name: "Left", parameterOne: 5 as never }))).toBe(
      "\\left .",
    );
    expect(toLatex(new UnaryFunctionNode({ name: "Right", parameterOne: true as never }))).toBe(
      "\\right .",
    );
  });
});

describe("degenerate value slots the gem's LATEX path crashes on", () => {
  // The per-site half of the admission ruling: the same shapes Number and
  // Symbol admit above CRASH on the gem's latex-only read paths, so this
  // port raises there — the admission set is probed per site, never copied
  // from the asciimath answer (probe-latex-degenerate.rb, 2026-08-10).
  it("fenced slots refuse every non-string value — latex_paren sends include?", () => {
    // Probes: fenced-number-true/false/nan/int-5/node => NoMethodError
    // (undefined method 'include?'); fenced-symbol-forced-true/nan => the
    // same. A hash slips THROUGH include? (Hash has one) into interpolation
    // bytes String() cannot match (fenced-number-hash => "{a: 1} x )"), so
    // it raises under the standing degenerate-input ruling instead.
    const fenced = (value: unknown, kind = "number") =>
      ({
        kind: "fenced",
        parameterOne: { kind, value },
        parameterTwo: [{ kind: "symbol", value: "x" }],
        parameterThree: { kind: "symbol", id: "Paren::Rround", value: null },
      }) as never;
    expect(() => toLatex(fenced(true))).toThrow(RenderError);
    expect(() => toLatex(fenced(false))).toThrow(RenderError);
    expect(() => toLatex(fenced(Number.NaN))).toThrow(RenderError);
    expect(() => toLatex(fenced(5))).toThrow(RenderError);
    expect(() => toLatex(fenced({ a: 1 }))).toThrow(RenderError);
    expect(() => toLatex(fenced(true, "symbol"))).toThrow(RenderError);
    expect(() => toLatex(fenced(Number.NaN, "symbol"))).toThrow(RenderError);
  });

  it("a base Paren in a fenced slot refuses the same shapes before rendering", () => {
    // Probe fenced-base-paren-ivar-true => NoMethodError ('include?' for
    // true): a Paren-classed slot renders via to_latex, whose raw value then
    // hits latex_paren. The abstract base is the one Paren id that renders
    // its stored value, so it is the one Paren id that can carry the crash.
    expect(() =>
      toLatex({
        kind: "fenced",
        parameterOne: { kind: "symbol", id: "Paren", value: true },
        parameterTwo: [{ kind: "symbol", value: "x" }],
      } as never),
    ).toThrow(RenderError);
  });

  it("color's top-level symbol branch refuses non-strings — the gsub strip crashes there", () => {
    // Probes: color-symbol-forced-true/false/nan/int-5 => NoMethodError
    // (undefined method 'gsub'): Symbol#to_asciimath answers Color with the
    // raw value, and only a string answers the &.gsub that follows.
    const color = (value: unknown) =>
      ({
        kind: "color",
        parameterOne: { kind: "symbol", value },
        parameterTwo: { kind: "symbol", value: "x" },
      }) as never;
    expect(() => toLatex(color(true))).toThrow(RenderError);
    expect(() => toLatex(color(false))).toThrow(RenderError);
    expect(() => toLatex(color(Number.NaN))).toThrow(RenderError);
    expect(() => toLatex(color(5))).toThrow(RenderError);
  });
});

describe("linebreak", () => {
  it("renders the measured shapes and crashes on missing attributes", () => {
    // Probes linebreak/*: "\\ " bare; "v\\ " after; "\\ v" otherwise;
    // linebreak/forced-nil-attrs => NoMethodError.
    expect(toLatex(new LinebreakNode({}))).toBe("\\\\ ");
    expect(
      toLatex(
        new LinebreakNode({ parameterOne: sym("v"), attributes: { linebreakstyle: "after" } }),
      ),
    ).toBe("v\\\\ ");
    expect(
      toLatex(
        new LinebreakNode({ parameterOne: sym("v"), attributes: { linebreakstyle: "before" } }),
      ),
    ).toBe("\\\\ v");
    expect(toLatex(new LinebreakNode({ parameterOne: sym("v"), attributes: {} }))).toBe("\\\\ v");
    // Probe probe-latex-linebreak.rb: hash-other-key and hash-style-array
    // both => "\\ x" — any hash whose :linebreakstyle is not exactly "after"
    // takes the before branch.
    expect(toLatex(new LinebreakNode({ parameterOne: sym("v"), attributes: { foo: "bar" } }))).toBe(
      "\\\\ v",
    );
    expect(
      toLatex(
        new LinebreakNode({ parameterOne: sym("v"), attributes: { linebreakstyle: ["after"] } }),
      ),
    ).toBe("\\\\ v");
  });

  it("non-hash attributes raise, as the gem's attributes[:linebreakstyle] send does", () => {
    // Probe probe-latex-linebreak.rb on the pinned oracle (ruby 4.0.1),
    // Linebreak.new(Symbols::Symbol.new("x"), ATTRS).to_latex(options: {}):
    //   [] / ["after"] / "after" / 5 => TypeError: no implicit conversion of
    //     Symbol into Integer
    //   nil / true / false / 1.5 / Number.new("2") => NoMethodError:
    //     undefined method '[]' for <the value>
    // Only a hash answers the send; everything else is RenderError here (the
    // §5 crash mapping — never the silent before-form these shapes rendered
    // when `.linebreakstyle` was read behind a nil-only guard).
    const linebreak = (attributes: unknown) =>
      ({
        kind: "linebreak",
        parameterOne: { kind: "number", value: "2" },
        attributes,
      }) as never;
    expect(() => toLatex(linebreak([]))).toThrow(RenderError);
    expect(() => toLatex(linebreak(["after"]))).toThrow(RenderError);
    expect(() => toLatex(linebreak("after"))).toThrow(RenderError);
    expect(() => toLatex(linebreak(5))).toThrow(RenderError);
    expect(() => toLatex(linebreak(1.5))).toThrow(RenderError);
    expect(() => toLatex(linebreak(null))).toThrow(RenderError);
    expect(() => toLatex(linebreak(true))).toThrow(RenderError);
    expect(() => toLatex(linebreak(false))).toThrow(RenderError);
    // A node in the attributes slot: Ruby's Number instance has no `[]`
    // either — NoMethodError there, RenderError here.
    expect(() => toLatex(linebreak({ kind: "number", value: "2" }))).toThrow(RenderError);
    expect(() => toLatex(linebreak([]))).toThrow(/linebreak\.attributes/);
    // The bare node never reaches the attributes read (probe
    // linebreak-bare-nil-attrs => "\\ ") — the parameterOne guard
    // short-circuits first, exactly as the gem's `unless parameter_one` does.
    expect(toLatex({ kind: "linebreak", attributes: null } as never)).toBe("\\\\ ");
  });
});

describe("color", () => {
  it("renders the first slot through asciimath with ASCII whitespace stripped", () => {
    // Probes color/both => "{\color{red} x}"; color/space-name =>
    // "{\color{rd} x}"; color/nbsp-name keeps the no-break space.
    expect(toLatex(new ColorNode({ parameterOne: sym("red"), parameterTwo: x() }))).toBe(
      "{\\color{red} x}",
    );
    expect(toLatex(new ColorNode({ parameterOne: sym("r d"), parameterTwo: x() }))).toBe(
      "{\\color{rd} x}",
    );
    expect(toLatex(new ColorNode({ parameterOne: sym("r d"), parameterTwo: x() }))).toBe(
      "{\\color{r d} x}",
    );
    expect(toLatex(new ColorNode({ parameterOne: sym("red") }))).toBe("{\\color{red} }");
    expect(toLatex(new ColorNode({ parameterTwo: x() }))).toBe("{\\color{} x}");
  });

  it("covers the measured asciimath fragment: numbers, text, formulas, the id slice", () => {
    // Probes color/number => "{\color{7} z}"; color/text => "{\color{"red"} z}";
    // color/formula => "{\color{"P{eqno}"f0} z}" (Eqno + join + strip).
    expect(
      toLatex(
        new ColorNode({ parameterOne: new NumberNode({ value: "7" }), parameterTwo: sym("z") }),
      ),
    ).toBe("{\\color{7} z}");
    expect(
      toLatex(
        new ColorNode({
          parameterOne: new TextNode({ parameterOne: "red" }),
          parameterTwo: sym("z"),
        }),
      ),
    ).toBe('{\\color{"red"} z}');
    const rgb = new FormulaNode({
      value: [new SymbolNode({ id: "Eqno" }), sym("f"), new NumberNode({ value: "0" })],
    });
    expect(toLatex(new ColorNode({ parameterOne: rgb, parameterTwo: sym("z") }))).toBe(
      '{\\color{"P{eqno}"f0} z}',
    );
    expect(
      toLatex(
        new ColorNode({ parameterOne: new SymbolNode({ id: "Plus" }), parameterTwo: sym("z") }),
      ),
    ).toBe("{\\color{+} z}");
  });

  it("refuses an operand outside the measured fragment as a parity gap", () => {
    expect(() =>
      toLatex(
        new ColorNode({ parameterOne: new SymbolNode({ id: "Sigma" }), parameterTwo: sym("z") }),
      ),
    ).toThrow(RenderError);
    expect(() =>
      toLatex(
        new ColorNode({
          parameterOne: new SqrtNode({ parameterOne: x() }),
          parameterTwo: sym("z"),
        }),
      ),
    ).toThrow(RenderError);
  });
});

describe("formulas", () => {
  it("joins with spaces and is strict per element", () => {
    // Probes formula/two => "a b"; formula/empty => ""; mrow/two => "a b";
    // formula/bare-string and formula/nil-in-list crash.
    expect(toLatex(ab())).toBe("a b");
    expect(toLatex(new FormulaNode({}))).toBe("");
    expect(toLatex(new MrowNode({ value: [sym("a"), sym("b")] }))).toBe("a b");
    expect(() => toLatex(new FormulaNode({ value: ["oops"] }))).toThrow(RenderError);
    expect(() => toLatex(new FormulaNode({ value: null }))).toThrow(RenderError);
  });
});

describe("fenced", () => {
  const lround = () => paren("Paren::Lround");
  const rround = () => paren("Paren::Rround");

  it("always writes the two spaces around the body", () => {
    // Probes fenced/round => "( x )"; fenced/nil-open => " x )";
    // fenced/nil-body and /empty-body => "(  )".
    expect(
      toLatex(
        new FencedNode({ parameterOne: lround(), parameterTwo: [x()], parameterThree: rround() }),
      ),
    ).toBe("( x )");
    expect(toLatex(new FencedNode({ parameterTwo: [x()], parameterThree: rround() }))).toBe(" x )");
    expect(toLatex(new FencedNode({ parameterOne: lround(), parameterThree: rround() }))).toBe(
      "(  )",
    );
    expect(
      toLatex(
        new FencedNode({ parameterOne: lround(), parameterTwo: [], parameterThree: rround() }),
      ),
    ).toBe("(  )");
  });

  it("paren-classed slots render to_latex; other symbols contribute raw values", () => {
    // Probes fenced/langle => "\langle x \rangle"; fenced/norm-parens =>
    // "\Vert x \Vert"; fenced/symbol-colon-open => "{ x }" (raw "{:" through
    // latex_paren) — but a base PAREN with "{:" applies specific_values and
    // vanishes (probe fenced/paren-base-open => " x ").
    expect(
      toLatex(
        new FencedNode({
          parameterOne: paren("Paren::Langle"),
          parameterTwo: [x()],
          parameterThree: paren("Paren::Rangle"),
        }),
      ),
    ).toBe("\\langle x \\rangle");
    expect(
      toLatex(
        new FencedNode({
          parameterOne: paren("Paren::Norm"),
          parameterTwo: [x()],
          parameterThree: paren("Paren::Norm"),
        }),
      ),
    ).toBe("\\Vert x \\Vert");
    expect(
      toLatex(
        new FencedNode({ parameterOne: sym("{:"), parameterTwo: [x()], parameterThree: sym(":}") }),
      ),
    ).toBe("{ x }");
    expect(
      toLatex(
        new FencedNode({
          parameterOne: new SymbolNode({ id: "Paren", value: "{:" }),
          parameterTwo: [x()],
          parameterThree: new SymbolNode({ id: "Paren", value: ":}" }),
        }),
      ),
    ).toBe(" x ");
    // Probe fenced/number-open => "2 x )"; fenced/text-open => "w x )".
    expect(
      toLatex(
        new FencedNode({ parameterOne: two(), parameterTwo: [x()], parameterThree: rround() }),
      ),
    ).toBe("2 x )");
    expect(
      toLatex(
        new FencedNode({
          parameterOne: new TextNode({ parameterOne: "w" }),
          parameterTwo: [x()],
          parameterThree: rround(),
        }),
      ),
    ).toBe("w x )");
  });

  it("refuses the inspect-leaking slots and crashes where the gem crashes", () => {
    // Probes fenced/formula-open (inspect address leak), fenced/string-open,
    // fenced/nil-in-body, fenced/string-body — all refusals here.
    expect(() =>
      toLatex(
        new FencedNode({ parameterOne: ab(), parameterTwo: [x()], parameterThree: rround() }),
      ),
    ).toThrow(RenderError);
    expect(() =>
      toLatex(new FencedNode({ parameterOne: "(", parameterTwo: [x()], parameterThree: rround() })),
    ).toThrow(RenderError);
    expect(() =>
      toLatex(
        new FencedNode({
          parameterOne: lround(),
          parameterTwo: [x(), null] as unknown as readonly SymbolNode[],
          parameterThree: rround(),
        }),
      ),
    ).toThrow(RenderError);
    expect(() =>
      toLatex(
        new FencedNode({ parameterOne: lround(), parameterTwo: "x", parameterThree: rround() }),
      ),
    ).toThrow(RenderError);
  });
});

describe("generic tables", () => {
  it("renders \\left/\\right around a matrix environment", () => {
    // Probes table/square, table/curly, table/two-rows, table/nil-close.
    expect(
      toLatex(
        new TableNode({
          value: [tr(x())],
          openParen: paren("Paren::Lsquare"),
          closeParen: paren("Paren::Rsquare"),
        }),
      ),
    ).toBe("\\left [\\begin{matrix}x\\end{matrix}\\right ]");
    expect(
      toLatex(
        new TableNode({
          value: [tr(x())],
          openParen: paren("Paren::Lcurly"),
          closeParen: paren("Paren::Rcurly"),
        }),
      ),
    ).toBe("\\left \\{\\begin{matrix}x\\end{matrix}\\right \\}");
    expect(
      toLatex(
        new TableNode({
          value: [tr(x()), tr(sym("y"))],
          openParen: paren("Paren::Lsquare"),
          closeParen: paren("Paren::Rsquare"),
        }),
      ),
    ).toBe("\\left [\\begin{matrix}x \\\\ y\\end{matrix}\\right ]");
    expect(toLatex(new TableNode({ value: [tr(x())], openParen: paren("Paren::Lsquare") }))).toBe(
      "\\left [\\begin{matrix}x\\end{matrix}\\right .",
    );
  });

  it("a Norm open paren short-circuits to Vmatrix; a Norm CLOSE does not", () => {
    // Probes table/norm-open => "\begin{Vmatrix}x\end{Vmatrix}";
    // table/norm-close-only => "...\right \Vert".
    expect(
      toLatex(
        new TableNode({
          value: [tr(x())],
          openParen: paren("Paren::Norm"),
          closeParen: paren("Paren::Norm"),
        }),
      ),
    ).toBe("\\begin{Vmatrix}x\\end{Vmatrix}");
    expect(
      toLatex(
        new TableNode({
          value: [tr(x())],
          openParen: paren("Paren::Lsquare"),
          closeParen: paren("Paren::Norm"),
        }),
      ),
    ).toBe("\\left [\\begin{matrix}x\\end{matrix}\\right \\Vert");
  });

  it("a NIL open paren takes the array-environment branch: dot parens and a column descriptor", () => {
    // Probes table/nil-parens => "\left .\begin{matrix}{a}x\end{matrix}\right .";
    // table/nil-open (close kept) => "...{a}x...\right ]"; table/pipe-col =>
    // "{a|a}a & b" (the pipe td vanishes from the row via Tr).
    expect(toLatex(new TableNode({ value: [tr(x())] }))).toBe(
      "\\left .\\begin{matrix}{a}x\\end{matrix}\\right .",
    );
    expect(toLatex(new TableNode({ value: [tr(x())], closeParen: paren("Paren::Rsquare") }))).toBe(
      "\\left .\\begin{matrix}{a}x\\end{matrix}\\right ]",
    );
    const pipeRow = new UnaryFunctionNode({
      name: "Tr",
      parameterOne: [td(sym("a")), tdOf([vert()]), td(sym("b"))],
    });
    expect(toLatex(new TableNode({ value: [pipeRow] }))).toBe(
      "\\left .\\begin{matrix}{a|a}a & b\\end{matrix}\\right .",
    );
    // With a paren present there is no descriptor and no crash surface.
    expect(
      toLatex(
        new TableNode({
          value: [pipeRow],
          openParen: paren("Paren::Lsquare"),
          closeParen: paren("Paren::Rsquare"),
        }),
      ),
    ).toBe("\\left [\\begin{matrix}a & b\\end{matrix}\\right ]");
  });

  it("colon symbols and the OpenParen/CloseParen classes splice their prefixes", () => {
    // Probes table/colon-symbols => "\left \begin{matrix}x\end{matrix}\right ";
    // table/openparen-closeparen-class => "\left .\begin{matrix}x\end{matrix}\right .".
    expect(
      toLatex(new TableNode({ value: [tr(x())], openParen: sym("{:"), closeParen: sym(":}") })),
    ).toBe("\\left \\begin{matrix}x\\end{matrix}\\right ");
    expect(
      toLatex(
        new TableNode({
          value: [tr(x())],
          openParen: paren("Paren::OpenParen"),
          closeParen: paren("Paren::CloseParen"),
        }),
      ),
    ).toBe("\\left .\\begin{matrix}x\\end{matrix}\\right .");
  });

  it("nil rows render empty; a nil VALUE renders empty only when a paren is present", () => {
    // Probes table/nil-row, table/nil-value, table/nil-value-nil-parens (crash),
    // table/empty-value-nil-parens (crash).
    expect(
      toLatex(
        new TableNode({
          value: [tr(x()), null as unknown as UnaryFunctionNode],
          openParen: paren("Paren::Lsquare"),
          closeParen: paren("Paren::Rsquare"),
        }),
      ),
    ).toBe("\\left [\\begin{matrix}x \\\\ \\end{matrix}\\right ]");
    expect(
      toLatex(
        new TableNode({
          value: null,
          openParen: paren("Paren::Lsquare"),
          closeParen: paren("Paren::Rsquare"),
        }),
      ),
    ).toBe("\\left [\\begin{matrix}\\end{matrix}\\right ]");
    expect(() => toLatex(new TableNode({ value: null }))).toThrow(RenderError);
    expect(() => toLatex(new TableNode({ value: [] }))).toThrow(RenderError);
  });

  it("a defined name outside the measured subclass set raises rather than guessing", () => {
    // Oracle census (probe-latex-name-guards.rb on the pinned oracle,
    // 2026-08-10): Table has exactly 10 subclasses — 8 overriding `to_latex`
    // (Matrix and its six env siblings, Array) and 2 inheriting it (Cases,
    // Eqarray) — every one pinned in these suites. Any other defined name
    // names no measured gem class, and the generic-table default render for
    // it would diverge silently — so it fails loudly instead (the fail-loud
    // carrier policy, TODO.plan/deferred.md). The bare carrier — name
    // undefined — keeps its measured generic render.
    expect(() => toLatex(new TableNode({ name: "<unmeasured>", value: [tr(x())] }))).toThrow(
      RenderError,
    );
  });
});

describe("td and tr", () => {
  it("td empties on a leading pipe and joins nil-safe cells", () => {
    // Probes td/*: "a", "a b", "" (pipe first), "a " (nil cell), crashes on
    // a nil list and a string cell.
    expect(toLatex(td(sym("a")))).toBe("a");
    expect(toLatex(tdOf([sym("a"), sym("b")]))).toBe("a b");
    expect(toLatex(tdOf([vert(), sym("a")]))).toBe("");
    expect(
      toLatex(
        new BinaryFunctionNode({
          name: "Td",
          parameterOne: [sym("a"), null] as unknown as readonly SymbolNode[],
        }),
      ),
    ).toBe("a ");
    // The constructor mirrors `Td#initialize`'s `Array(parameter_one)` (census
    // defaults), so a bare build renders "" (probe td/nil-list); only a FORCED
    // nil ivar reaches the gem's `nil.first` crash (probe td/forced-nil-list).
    expect(toLatex(new BinaryFunctionNode({ name: "Td" }))).toBe("");
    const forcedTd = new BinaryFunctionNode({ name: "Td" });
    (forcedTd as { parameterOne: unknown }).parameterOne = null;
    expect(() => toLatex(forcedTd)).toThrow(RenderError);
    expect(() =>
      toLatex(
        new BinaryFunctionNode({
          name: "Td",
          parameterOne: ["oops"] as unknown as readonly SymbolNode[],
        }),
      ),
    ).toThrow(RenderError);
  });

  it("tr drops pipe tds — as the td itself or as its first cell — and joins with &", () => {
    // Probes tr/*: "a & b", "a" (pipe td), "a" (Vert directly), crashes on a
    // symbol td, a nil td and a nil list.
    expect(toLatex(tr(sym("a"), sym("b")))).toBe("a & b");
    expect(
      toLatex(new UnaryFunctionNode({ name: "Tr", parameterOne: [td(sym("a")), tdOf([vert()])] })),
    ).toBe("a");
    expect(
      toLatex(new UnaryFunctionNode({ name: "Tr", parameterOne: [td(sym("a")), vert()] })),
    ).toBe("a");
    expect(() =>
      toLatex(new UnaryFunctionNode({ name: "Tr", parameterOne: [td(sym("a")), sym("b")] })),
    ).toThrow(RenderError);
    expect(() =>
      toLatex(
        new UnaryFunctionNode({
          name: "Tr",
          parameterOne: [td(sym("a")), null] as unknown as readonly SymbolNode[],
        }),
      ),
    ).toThrow(RenderError);
    // As with Td: the constructor's census default is [], so only a forced
    // nil ivar reaches the gem's `nil.reject` crash (probe tr/forced-nil-list).
    expect(toLatex(new UnaryFunctionNode({ name: "Tr" }))).toBe("");
    const forcedTr = new UnaryFunctionNode({ name: "Tr" });
    (forcedTr as { parameterOne: unknown }).parameterOne = null;
    expect(() => toLatex(forcedTr)).toThrow(RenderError);
  });
});

describe("named tables", () => {
  it("renders every aliased subclass with its constructor parens as the gem does", () => {
    // Probes named-table/*/default — the port constructor applies the same
    // census defaults the gem constructors do (Matrix gets round parens =>
    // pmatrix, Align/Bmatrix/Multline/Split get square => bmatrix, ...).
    const defaults: readonly (readonly [string, string])[] = [
      ["Matrix", "\\begin{pmatrix}x\\end{pmatrix}"],
      ["Align", "\\begin{bmatrix}x\\end{bmatrix}"],
      ["Array", "\\begin{array}.x\\end{array}"],
      ["Bmatrix", "\\begin{bmatrix}x\\end{bmatrix}"],
      ["Cases", "\\left \\{\\begin{matrix}x\\end{matrix}\\right "],
      ["Eqarray", "\\left \\begin{matrix}x\\end{matrix}\\right "],
      ["Multline", "\\begin{bmatrix}x\\end{bmatrix}"],
      ["Pmatrix", "\\begin{pmatrix}x\\end{pmatrix}"],
      ["Split", "\\begin{bmatrix}x\\end{bmatrix}"],
      ["Vmatrix", "\\begin{vmatrix}x\\end{vmatrix}"],
    ];
    for (const [name, expected] of defaults) {
      expect(toLatex(new TableNode({ name, value: [tr(x())] })), name).toBe(expected);
    }
  });

  it("a nil open paren falls back to the lowercased class name", () => {
    // Probes named-table/*/nil-parens: matrix, align, multline, split keep
    // their own names; bmatrix/vmatrix/pmatrix spell theirs.
    const bare: readonly (readonly [string, string])[] = [
      ["Matrix", "matrix"],
      ["Align", "align"],
      ["Multline", "multline"],
      ["Split", "split"],
      ["Bmatrix", "bmatrix"],
      ["Vmatrix", "vmatrix"],
      ["Pmatrix", "pmatrix"],
    ];
    for (const [name, env] of bare) {
      expect(
        toLatex(new TableNode({ name, value: [tr(x())], openParen: null, closeParen: null })),
        name,
      ).toBe(`\\begin{${env}}x\\end{${env}}`);
    }
  });

  it("the open paren picks the environment through the measured to_matrices map", () => {
    // Probes named-table/Matrix/square-parens => bmatrix; named/vert-open =>
    // vmatrix; named/norm-open => Vmatrix; langle => NoMethodError.
    expect(
      toLatex(
        new TableNode({
          name: "Matrix",
          value: [tr(x())],
          openParen: paren("Paren::Lsquare"),
          closeParen: paren("Paren::Rsquare"),
        }),
      ),
    ).toBe("\\begin{bmatrix}x\\end{bmatrix}");
    expect(
      toLatex(new TableNode({ name: "Matrix", value: [tr(x())], openParen: paren("Paren::Vert") })),
    ).toBe("\\begin{vmatrix}x\\end{vmatrix}");
    expect(
      toLatex(new TableNode({ name: "Matrix", value: [tr(x())], openParen: paren("Paren::Norm") })),
    ).toBe("\\begin{Vmatrix}x\\end{Vmatrix}");
    expect(() =>
      toLatex(
        new TableNode({ name: "Matrix", value: [tr(x())], openParen: paren("Paren::Langle") }),
      ),
    ).toThrow(RenderError);
  });

  it("asterisk stars the environment on KEY presence; alignment needs a truthy value", () => {
    // Probes named-table/Matrix/asterisk => "\begin{matrix*}[]x\end{matrix*}";
    // asterisk/columnalign-left => "[l]"; asterisk/false-value => no brackets.
    expect(
      toLatex(
        new TableNode({
          name: "Matrix",
          value: [tr(x())],
          openParen: null,
          closeParen: null,
          options: { asterisk: true },
        }),
      ),
    ).toBe("\\begin{matrix*}[]x\\end{matrix*}");
    const alignedTd = new BinaryFunctionNode({
      name: "Td",
      parameterOne: [sym("a")],
      parameterTwo: { columnalign: "left" },
    });
    const alignedRow = new UnaryFunctionNode({ name: "Tr", parameterOne: [alignedTd] });
    expect(
      toLatex(
        new TableNode({
          name: "Matrix",
          value: [alignedRow],
          openParen: null,
          closeParen: null,
          options: { asterisk: true },
        }),
      ),
    ).toBe("\\begin{matrix*}[l]a\\end{matrix*}");
    expect(
      toLatex(
        new TableNode({
          name: "Matrix",
          value: [tr(x())],
          openParen: null,
          closeParen: null,
          options: { asterisk: false },
        }),
      ),
    ).toBe("\\begin{matrix*}x\\end{matrix*}");
  });

  it("a non-hash options raises: options&.key?(:asterisk) is a send only a hash answers", () => {
    // Probe on the pinned oracle (00c52783, ruby 4.0.1, 2026-08-10),
    // Table::Matrix.new([Tr.new([Td.new([Symbol.new("x")])])], nil, nil, OPTS)
    // .to_latex(options: {}) — constructor arg and forced @options ivar answer
    // identically:
    //   {}                        => "\begin{matrix}x\end{matrix}"
    //   {asterisk: true}          => "\begin{matrix*}[]x\end{matrix*}"
    //   nil                       => "\begin{matrix}x\end{matrix}"
    //   "asterisk" / "" / 5 / 1.5 / true / FALSE / [] / [:asterisk] /
    //     Number.new("2")         => NoMethodError: undefined method 'key?'
    //                                for <the value>
    // `&.` guards nil ALONE, so `false` and the EMPTY list crash with the rest
    // (unlike the `Hash()` read below, which converts both nil and []).
    // RenderError here — never the silent no-asterisk render `Object.hasOwn`
    // on a primitive produced, which dropped the `*` and the `[…]` the gem
    // never got far enough to decide.
    const matrix = (options: unknown) =>
      ({
        kind: "table",
        name: "Matrix",
        value: [tr(x())],
        openParen: null,
        closeParen: null,
        options,
      }) as never;
    expect(toLatex(matrix({}))).toBe("\\begin{matrix}x\\end{matrix}");
    expect(toLatex(matrix({ asterisk: true }))).toBe("\\begin{matrix*}[]x\\end{matrix*}");
    expect(toLatex(matrix({ asterisk: false }))).toBe("\\begin{matrix*}x\\end{matrix*}");
    expect(toLatex(matrix(null))).toBe("\\begin{matrix}x\\end{matrix}");
    expect(toLatex(matrix(undefined))).toBe("\\begin{matrix}x\\end{matrix}");
    for (const options of ["asterisk", "", 5, 1.5, true, false, [], ["asterisk"], two()]) {
      expect(() => toLatex(matrix(options)), JSON.stringify(options) ?? "node").toThrow(
        RenderError,
      );
    }
    expect(() => toLatex(matrix("asterisk"))).toThrow(/table\.options/);
    // Order, same oracle: `matrix_class` reads the open paren BEFORE the
    // options key, so a Langle paren beside a String options answers
    // "NoMethodError: undefined method 'to_matrices'", never the key? crash.
    // The message names the paren here too.
    expect(() =>
      toLatex({
        kind: "table",
        name: "Matrix",
        value: [tr(x())],
        openParen: paren("Paren::Langle"),
        closeParen: null,
        options: "asterisk",
      } as never),
    ).toThrow(/table\.openParen/);
    // The carriers with no `matrix_class` never read options at all. Probes,
    // each with options "asterisk": a bare Table with square parens =>
    // "\left [\begin{matrix}x\end{matrix}\right ]"; Table::Array =>
    // "\begin{array}.x\end{array}"; Cases =>
    // "\left .\begin{matrix}{a}x\end{matrix}\right .".
    const carrier = (name: string | undefined, open: unknown, close: unknown) =>
      ({
        kind: "table",
        name,
        value: [tr(x())],
        openParen: open,
        closeParen: close,
        options: "asterisk",
      }) as never;
    expect(toLatex(carrier(undefined, paren("Paren::Lsquare"), paren("Paren::Rsquare")))).toBe(
      "\\left [\\begin{matrix}x\\end{matrix}\\right ]",
    );
    expect(toLatex(carrier("Array", null, null))).toBe("\\begin{array}.x\\end{array}");
    expect(toLatex(carrier("Cases", null, null))).toBe(
      "\\left .\\begin{matrix}{a}x\\end{matrix}\\right .",
    );
  });

  it("a td parameterTwo raises exactly where Hash() cannot convert it — nil and [] can", () => {
    // Probe on the pinned oracle (00c52783, ruby 4.0.1, 2026-08-10), the same
    // PT through both readers — Matrix's `Hash(td_hash)[:columnalign]`
    // (`table.rb:274`) and Array's `Hash(td.parameter_two)[:columnalign]`
    // (`array.rb:36`) — Td.new([Symbol.new("x")], PT):
    //   {columnalign: "left"} => "\begin{matrix*}[l]…" / "\begin{array}{l}…"
    //   {} / nil / absent / [] => "\begin{matrix*}[]…" / "\begin{array}.…"
    //   "left" / "" / 5 / 1.5 / true / false / ["left"] /
    //     [[:columnalign, "left"]] / Number.new("2")
    //                          => TypeError: can't convert <Class> into Hash
    // Kernel#Hash converts a Hash, nil and the EMPTY list and nothing else, so
    // `[]` renders where every other list raises. Matrix's read returned null
    // (no alignment, silently) for all of these; Array's raised for `[]` too.
    const alignedTd = (parameterTwo: unknown) =>
      ({ kind: "binaryFunction", name: "Td", parameterOne: [x()], parameterTwo }) as never;
    const table = (name: string, parameterTwo: unknown, options: unknown) =>
      ({
        kind: "table",
        name,
        value: [{ kind: "unaryFunction", name: "Tr", parameterOne: [alignedTd(parameterTwo)] }],
        openParen: null,
        closeParen: null,
        options,
      }) as never;
    const starred = (parameterTwo: unknown) => table("Matrix", parameterTwo, { asterisk: true });
    const arrayed = (parameterTwo: unknown) => table("Array", parameterTwo, {});
    expect(toLatex(starred({ columnalign: "left" }))).toBe("\\begin{matrix*}[l]x\\end{matrix*}");
    expect(toLatex(arrayed({ columnalign: "left" }))).toBe("\\begin{array}{l}x\\end{array}");
    for (const parameterTwo of [{}, null, undefined, []]) {
      const label = JSON.stringify(parameterTwo) ?? "undefined";
      expect(toLatex(starred(parameterTwo)), label).toBe("\\begin{matrix*}[]x\\end{matrix*}");
      expect(toLatex(arrayed(parameterTwo)), label).toBe("\\begin{array}.x\\end{array}");
    }
    for (const parameterTwo of ["left", "", 5, 1.5, true, false, ["left"], two()]) {
      const label = JSON.stringify(parameterTwo) ?? "node";
      expect(() => toLatex(starred(parameterTwo)), label).toThrow(RenderError);
      expect(() => toLatex(arrayed(parameterTwo)), label).toThrow(RenderError);
    }
    expect(() => toLatex(starred("left"))).toThrow(/parameter_two/);
    // A FALSY or absent asterisk never reaches the alignment read
    // (`latex_columnalign` returns "" first), so the same degenerate td
    // renders there — probes with td parameter_two "left": options
    // {asterisk: false} => "\begin{matrix*}x\end{matrix*}"; {asterisk: nil} =>
    // the same; {} => "\begin{matrix}x\end{matrix}".
    expect(toLatex(table("Matrix", "left", { asterisk: false }))).toBe(
      "\\begin{matrix*}x\\end{matrix*}",
    );
    expect(toLatex(table("Matrix", "left", { asterisk: null }))).toBe(
      "\\begin{matrix*}x\\end{matrix*}",
    );
    expect(toLatex(table("Matrix", "left", {}))).toBe("\\begin{matrix}x\\end{matrix}");
    // And the alignment read comes BEFORE the content render (`opening` is
    // interpolated first): probes with a stray bare-string row beside the td —
    // parameter_two "left" => TypeError (the Hash() refusal), parameter_two
    // {columnalign: "left"} => NoMethodError 'to_latex' for the row.
    const withStrayRow = (parameterTwo: unknown) =>
      ({
        kind: "table",
        name: "Matrix",
        value: [
          { kind: "unaryFunction", name: "Tr", parameterOne: [alignedTd(parameterTwo)] },
          "oops",
        ],
        openParen: null,
        closeParen: null,
        options: { asterisk: true },
      }) as never;
    expect(() => toLatex(withStrayRow("left"))).toThrow(/parameter_two/);
    expect(() => toLatex(withStrayRow({ columnalign: "left" }))).toThrow(
      /cannot render the bare string/,
    );
  });

  it("array derives its descriptor from pipes and columnalign, dot when empty", () => {
    // Probes named-table/Array/pipe => "\begin{array}{|}b\end{array}";
    // align/left|right|center => {l}/{r}/{c}; align/unknown => ".".
    const pipeTd = new BinaryFunctionNode({ name: "Td", parameterOne: [vert(), sym("a")] });
    const row = new UnaryFunctionNode({ name: "Tr", parameterOne: [pipeTd, td(sym("b"))] });
    expect(
      toLatex(new TableNode({ name: "Array", value: [row], openParen: null, closeParen: null })),
    ).toBe("\\begin{array}{|}b\\end{array}");
    for (const [align, letter] of [
      ["left", "l"],
      ["right", "r"],
      ["center", "c"],
    ] as const) {
      const alignedTd = new BinaryFunctionNode({
        name: "Td",
        parameterOne: [sym("a")],
        parameterTwo: { columnalign: align },
      });
      const alignedRow = new UnaryFunctionNode({ name: "Tr", parameterOne: [alignedTd] });
      expect(
        toLatex(
          new TableNode({ name: "Array", value: [alignedRow], openParen: null, closeParen: null }),
        ),
        align,
      ).toBe(`\\begin{array}{${letter}}a\\end{array}`);
    }
    const unknownTd = new BinaryFunctionNode({
      name: "Td",
      parameterOne: [sym("a")],
      parameterTwo: { columnalign: "top" },
    });
    expect(
      toLatex(
        new TableNode({
          name: "Array",
          value: [new UnaryFunctionNode({ name: "Tr", parameterOne: [unknownTd] })],
          openParen: null,
          closeParen: null,
        }),
      ),
    ).toBe("\\begin{array}.a\\end{array}");
  });

  it("a nil value renders empty for the begin/end styles and crashes Array", () => {
    // Probes named-table/Matrix/forced-nil-value => "\begin{pmatrix}\end{pmatrix}"
    // (constructor parens still apply); named-table/Array/nil-value => NoMethodError.
    expect(toLatex(new TableNode({ name: "Matrix", value: null }))).toBe(
      "\\begin{pmatrix}\\end{pmatrix}",
    );
    expect(() =>
      toLatex(new TableNode({ name: "Array", value: null, openParen: null, closeParen: null })),
    ).toThrow(RenderError);
  });
});

describe("inputs that defeat the walk itself", () => {
  // Class-for-class parity holds even where the INPUT breaks the walker
  // rather than any one read: the gem raises (probe-latex-depth.rb:
  // SystemStackError by depth 4,550, direct and through the Formula
  // boundary), and `Formula#to_latex` wraps every render-time StandardError
  // into ParseError (`formula.rb:437`, wrap_render_error) — so nothing may
  // escape this boundary as a raw RangeError or a hostile accessor's own
  // error.
  it("a tree deeper than the call stack raises RenderError, not RangeError", () => {
    let node: unknown = { kind: "number", value: "1" };
    for (let i = 0; i < 50_000; i += 1) node = { kind: "sqrt", parameterOne: node };
    expect(() => toLatex(node as never)).toThrow(RenderError);
  });

  it("depths the gem still renders take the too-deep branding, never the generic wrap", () => {
    // The deep-tree parity window (TODO.plan/deferred.md): the gem's own
    // recursive to_latex survives nested-sqrt chains to roughly 4,500 frames
    // on default stacks — depths 2,000/3,000/4,000/4,500 render
    // 14,001/21,001/28,001/31,501 chars on the pinned oracle (2026-08-10,
    // probe-latex-depth.rb; SystemStackError from 4,550) — while this walk's
    // JavaScript stack runs out earlier. WHERE it runs out moves with engine
    // state, so this pin sweeps the window and holds every failure to the
    // BRANDING: genuine stack exhaustion is the too-deep RenderError
    // whichever walk hits its ceiling first, never the generic mid-walk
    // wrap. Seen red exactly so: pre-fix, every failing depth escaped as a
    // raw RangeError ("Maximum call stack size exceeded").
    const failures: string[] = [];
    for (const depth of [1_400, 1_800, 2_200, 2_600, 3_000, 3_400, 3_800, 4_200]) {
      let node: unknown = { kind: "number", value: "1" };
      for (let i = 0; i < depth; i += 1) node = { kind: "sqrt", parameterOne: node };
      try {
        toLatex(node as never);
      } catch (error) {
        expect(error, `depth ${depth}`).toBeInstanceOf(RenderError);
        failures.push(`depth ${depth}: ${(error as RenderError).message}`);
      }
    }
    expect(failures).not.toEqual([]);
    for (const failure of failures) {
      expect(failure).toContain("nests too deep");
      expect(failure).not.toContain("mid-walk");
    }
  });

  it("a read that throws mid-render surfaces as RenderError, like the gem's boundary wrap", () => {
    // The getter answers validation's single read, then throws on the
    // renderer's — deterministic, and only the render-phase wrap can catch it.
    let reads = 0;
    const node = {
      kind: "number",
      get value(): string {
        reads += 1;
        if (reads > 1) throw new Error("hostile read");
        return "1";
      },
    };
    expect(() => toLatex(node as never)).toThrow(RenderError);
  });

  it("a kind that flips to an inherited key after validation raises the unknown-kind RenderError", () => {
    // Validation reads `kind` once; the dispatcher's own read is a second
    // one, and a stateful getter can answer it with an inherited
    // Object.prototype key. On a plain-object table "toString" and
    // "hasOwnProperty" resolve to real functions (a value comes back, no
    // error at all), "constructor" to `Object` itself (callable too), and
    // "__proto__" to Object.prototype (a TypeError from calling a
    // non-function). All are unknown kinds and must take the unknown-kind
    // RenderError, naming the kind the dispatcher actually read.
    for (const flip of ["toString", "__proto__", "constructor", "hasOwnProperty"]) {
      let reads = 0;
      const node = {
        get kind(): string {
          reads += 1;
          return reads > 1 ? flip : "number";
        },
        value: "1",
      };
      let caught: unknown;
      try {
        toLatex(node as never);
      } catch (error) {
        caught = error;
      }
      expect(caught, flip).toBeInstanceOf(RenderError);
      expect((caught as RenderError).message, flip).toContain(flip);
      expect((caught as RenderError).kind, flip).toBe(flip);
    }
  });

  it("a getter throwing the port's own ParseError mid-render wraps as RenderError, message kept", () => {
    // Only `RenderError` is this walk's surface (plus the symbol table's
    // `MissingSymbolDataError`, pinned below). A hostile getter re-throwing
    // the port's ParseError is not a parse failure — letting it out unwrapped
    // would let the input forge an error class the render boundary never
    // produces. The gem's own boundary re-raises only ITS ParseError, and
    // that class maps to RenderError on this walk, not to the port's
    // ParseError.
    let reads = 0;
    const node = {
      kind: "number",
      get value(): string {
        reads += 1;
        if (reads > 1) throw new ParseError("forged parse failure", "x", "latex", 0);
        return "1";
      },
    };
    let caught: unknown;
    try {
      toLatex(node as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).message).toContain("forged parse failure");
  });

  it("the symbol table's MissingSymbolDataError still passes through — the walk's own surface", () => {
    // `renderSymbol` throws it for an id the generated table does not carry
    // (`src/render/symbol/latex.ts`) — the one non-RenderError
    // PlurimathError a kind file throws on purpose, and a public error code
    // (MISSING_SYMBOL_DATA); the boundary's pass-through must not re-type it.
    let caught: unknown;
    try {
      toLatex({ kind: "symbol", id: "NoSuchSymbol", value: null } as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MissingSymbolDataError);
    expect((caught as MissingSymbolDataError).code).toBe("MISSING_SYMBOL_DATA");
    expect((caught as MissingSymbolDataError).symbolId).toBe("NoSuchSymbol");
  });

  it("a getter throwing a forged MissingSymbolDataError post-validation wraps as RenderError", () => {
    // The pass-through above is for the symbol table's OWN throw
    // (`src/render/symbol/latex.ts`), which the throw site records in a
    // module-private WeakSet. A hostile getter that answers validation's read
    // and then throws its own `MissingSymbolDataError` mid-render is an input
    // failure wearing the class: `instanceof` alone would let it out
    // unwrapped, reporting MISSING_SYMBOL_DATA for a walk the symbol table
    // never faulted — the same forgery the ParseError pin above closes for
    // the parse surface. Unrecorded, it wraps like any other mid-walk throw,
    // message kept.
    let reads = 0;
    const node = {
      kind: "number",
      get value(): string {
        reads += 1;
        if (reads > 1) throw new MissingSymbolDataError("Forged", "latex");
        return "1";
      },
    };
    let caught: unknown;
    try {
      toLatex(node as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).code).toBe("RENDER_ERROR");
    expect((caught as RenderError).message).toContain("Forged");
  });

  it("a genuine missing-symbol error carries no discoverable mark — no symbol to steal", () => {
    // The pass-through mark is MEMBERSHIP in the throw site's module-private
    // WeakSet, never anything stored on the instance: a symbol-property
    // brand was discoverable right here — `Object.getOwnPropertySymbols` on
    // a caught genuine error handed the input the key, and with it the
    // forgery the next pin closes. Nothing observable may sit on the error.
    let genuine: unknown;
    try {
      toLatex({ kind: "symbol", id: "NoSuchSymbol", value: null } as never);
    } catch (error) {
      genuine = error;
    }
    expect(genuine).toBeInstanceOf(MissingSymbolDataError);
    expect(Object.getOwnPropertySymbols(genuine as object)).toEqual([]);
  });

  it("a forged object carrying everything stolen off a caught genuine error wraps as RenderError", () => {
    // The exact theft a symbol-property brand allowed: catch the walk's own
    // missing-symbol throw, lift its own symbols with
    // `Object.getOwnPropertySymbols`, copy them — values included — onto a
    // forged look-alike, and throw that mid-render. WeakSet membership cannot
    // be read off an instance, so the forgery wraps like any other input
    // throw. Replaying the genuine INSTANCE itself remains possible — the
    // narrower residue named in render-shared.ts, accepted with the
    // pass-through pin above.
    let genuine: unknown;
    try {
      toLatex({ kind: "symbol", id: "NoSuchSymbol", value: null } as never);
    } catch (error) {
      genuine = error;
    }
    const forged = Object.create(MissingSymbolDataError.prototype) as Record<PropertyKey, unknown>;
    forged.code = "MISSING_SYMBOL_DATA";
    forged.symbolId = "Forged";
    forged.message = "forged missing-symbol pass-through";
    for (const stolen of Object.getOwnPropertySymbols(genuine as object)) {
      forged[stolen] = (genuine as Record<PropertyKey, unknown>)[stolen];
    }
    let reads = 0;
    const node = {
      kind: "number",
      get value(): string {
        reads += 1;
        if (reads > 1) throw forged;
        return "1";
      },
    };
    let caught: unknown;
    try {
      toLatex(node as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).code).toBe("RENDER_ERROR");
  });

  it("a thrown value whose own toString throws still wraps, described by the fallback phrase", () => {
    // The boundary's description of a mid-walk throw is a `String(error)`
    // call — input code that can itself throw. The description falls back to
    // a fixed phrase, so the boundary never leaks a raw value.
    let reads = 0;
    const node = {
      kind: "number",
      get value(): string {
        reads += 1;
        if (reads > 1) {
          throw {
            toString(): string {
              throw new Error("secondary");
            },
          };
        }
        return "1";
      },
    };
    let caught: unknown;
    try {
      toLatex(node as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).message).toContain("a thrown value that cannot be described");
  });

  it("a frozen tree renders — nothing on the render path writes to the input", () => {
    // Ruby renders frozen nodes fine; so must this port.
    const tree = Object.freeze({
      kind: "frac",
      parameterOne: Object.freeze({ kind: "number", value: "1" }),
      parameterTwo: Object.freeze({ kind: "symbol", id: "Plus", value: null }),
    });
    expect(toLatex(tree as never)).toBe("\\frac{1}{+}");
  });
});

describe("malformed trees fail through the shared validator", () => {
  it("rejects non-node inputs and unknown kinds at the entry point", () => {
    expect(() => toLatex(null as unknown as SymbolNode)).toThrow(RenderError);
    expect(() => toLatex({ kind: "nope" } as unknown as SymbolNode)).toThrow(RenderError);
    expect(() => toLatex([x()] as unknown as SymbolNode)).toThrow(RenderError);
  });

  it("rejects a bare abstract carrier with no class name", () => {
    expect(() =>
      toLatex({ kind: "unaryFunction", parameterOne: null } as unknown as SymbolNode),
    ).toThrow(RenderError);
    expect(() => toLatex({ kind: "binaryFunction" } as unknown as SymbolNode)).toThrow(RenderError);
  });

  it("rejects a forged nested kind wherever it sits", () => {
    const forged = new FormulaNode({ value: [x()] });
    (forged.value as unknown as unknown[])[0] = { kind: "forged" };
    expect(() => toLatex(forged)).toThrow(RenderError);
  });
});
