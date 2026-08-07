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
import { MissingSymbolDataError, RenderError } from "../../../src/core/errors";
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
