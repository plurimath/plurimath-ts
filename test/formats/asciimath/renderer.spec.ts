/**
 * Gem-pinned rendering behaviour the corpus and sweep cannot reach: nodes
 * built by hand, nil-slot combinations, and the context axis. Every expected
 * string below was measured on the pinned oracle (plurimath 0.11.6 at
 * 00c52783, 2026-08-06) by instantiating the class and calling
 * `to_asciimath(options: {})` — the probe keys are quoted beside the pins.
 * Where the gem CRASHES (NoMethodError, wrapped into `Math::ParseError` at
 * its formula boundary), this port raises `RenderError` — the §5
 * runtime-boundary mapping.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/errors";
import {
  BarNode,
  BinaryFunctionNode,
  ColorNode,
  FencedNode,
  FontStyleNode,
  FormulaNode,
  IntNode,
  LinebreakNode,
  MpaddedNode,
  MrowNode,
  NaryNode,
  NormNode,
  NumberNode,
  SymbolNode,
  TableNode,
  TernaryFunctionNode,
  TextNode,
  UnaryFunctionNode,
} from "../../../src/core/nodes";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toAsciimath } from "../../../src/formats/asciimath/renderer";

const x = () => new SymbolNode({ value: "x" });
const two = () => new NumberNode({ value: "2" });
const three = () => new NumberNode({ value: "3" });
const td = (...cells: readonly (SymbolNode | NumberNode | FormulaNode)[]) =>
  new BinaryFunctionNode({ name: "Td", parameterOne: cells });
/** One `Td` per cell, as the gem's table probes were built. */
const tr = (...cells: readonly (SymbolNode | NumberNode | FormulaNode)[]) =>
  new UnaryFunctionNode({ name: "Tr", parameterOne: cells.map((cell) => td(cell)) });

describe("unary functions", () => {
  it("drops parens exactly for UNARY_CLASSES members", () => {
    // Probes unary/Sin/x => "sinx"; unary/Cancel/x => "cancel(x)".
    expect(toAsciimath(new UnaryFunctionNode({ name: "Sin", parameterOne: x() }))).toBe("sinx");
    expect(toAsciimath(new UnaryFunctionNode({ name: "Cancel", parameterOne: x() }))).toBe(
      "cancel(x)",
    );
  });

  it("renders the bare name for a nil parameter", () => {
    // Probes unary/Sin/nil => "sin"; unary/Cancel/nil => "cancel".
    expect(toAsciimath(new UnaryFunctionNode({ name: "Sin" }))).toBe("sin");
    expect(toAsciimath(new UnaryFunctionNode({ name: "Cancel" }))).toBe("cancel");
  });

  it("joins list parameters with no separator, compacting nils", () => {
    // Probe unary/sin-array-nil => "sinx2" (corner probe).
    expect(
      toAsciimath(
        new UnaryFunctionNode({
          name: "Sin",
          parameterOne: [x(), null, two()] as unknown as readonly SymbolNode[],
        }),
      ),
    ).toBe("sinx2");
  });

  it("Lcm uses a space, never parens", () => {
    // Probes unary/Lcm/x => "lcm x"; unary/Lcm/nil => "lcm".
    expect(toAsciimath(new UnaryFunctionNode({ name: "Lcm", parameterOne: x() }))).toBe("lcm x");
    expect(toAsciimath(new UnaryFunctionNode({ name: "Lcm" }))).toBe("lcm");
  });

  it("Left/Right interpolate a string parameter and raise on a node", () => {
    // Probes unary/Left/paren-string => "left("; unary/Left/nil => "left";
    // unary/Left/x => "left#<Plurimath::...::Symbol:0x...>", a nondeterministic
    // inspect no port can reproduce byte-for-byte (TODO.plan/deferred.md).
    expect(toAsciimath(new UnaryFunctionNode({ name: "Left", parameterOne: "(" }))).toBe("left(");
    expect(toAsciimath(new UnaryFunctionNode({ name: "Right", parameterOne: ")" }))).toBe("right)");
    expect(toAsciimath(new UnaryFunctionNode({ name: "Left" }))).toBe("left");
    expect(() => toAsciimath(new UnaryFunctionNode({ name: "Left", parameterOne: x() }))).toThrow(
      RenderError,
    );
  });

  it("a name outside the AsciiMath-reachable set raises rather than guessing", () => {
    // Math::Function::Mbox overrides to_asciimath; a carrier-default render
    // here would diverge silently, so the gap fails loudly instead.
    expect(() => toAsciimath(new UnaryFunctionNode({ name: "Mbox", parameterOne: x() }))).toThrow(
      RenderError,
    );
  });
});

describe("accents and unary kinds with their own overrides", () => {
  it("bar/hat crash on a list where the default path would join it", () => {
    // Probes kind/Bar/array => NoMethodError; kind/Dot/array => "dot(x2)".
    expect(() =>
      toAsciimath(new BarNode({ parameterOne: [x(), two()] as unknown as readonly SymbolNode[] })),
    ).toThrow(RenderError);
  });

  it("Ul spells its class name underline", () => {
    // Probes kind/Ul/x => "underline(x)"; kind/Ul/nil => "underline".
    expect(toAsciimath(parseAsciimath("ul x"))).toBe("underline(x)");
  });

  it("norm keeps a table's own brackets", () => {
    // Probe kind/Norm/table => "norm[[x]]".
    const table = new TableNode({ value: [tr(x())] });
    expect(toAsciimath(new NormNode({ parameterOne: table }))).toBe("norm[[x]]");
    // Probe kind/Norm/x => "norm(x)".
    expect(toAsciimath(new NormNode({ parameterOne: x() }))).toBe("norm(x)");
  });

  it("mpadded renders its value bare", () => {
    // Probes kind/Mpadded/x => "x"; kind/Mpadded/nil => "".
    expect(toAsciimath(new MpaddedNode({ parameterOne: x() }))).toBe("x");
    expect(toAsciimath(new MpaddedNode({}))).toBe("");
  });
});

describe("subsup shapes", () => {
  it("the ternary first slot is parenthesized only for a formula", () => {
    // Probes wrap/PowerBase/formula-first => "(x)_(2)^(3)";
    // sin-first => "sinx_(2)^(3)"; frac-first => "frac(x)(2)_(2)^(3)" —
    // the gem's `when Formula || ...include?("Function")` has a dead arm.
    const powerBase = (first: FormulaNode | UnaryFunctionNode | MrowNode) =>
      new TernaryFunctionNode({
        name: "PowerBase",
        parameterOne: first,
        parameterTwo: two(),
        parameterThree: three(),
      });
    expect(toAsciimath(powerBase(new FormulaNode({ value: [x()] })))).toBe("(x)_(2)^(3)");
    expect(toAsciimath(powerBase(new MrowNode({ value: [x()] })))).toBe("(x)_(2)^(3)");
    expect(toAsciimath(powerBase(new UnaryFunctionNode({ name: "Sin", parameterOne: x() })))).toBe(
      "sinx_(2)^(3)",
    );
  });

  it("Power requires its first parameter, as the gem does", () => {
    // Probe crash/Power/nil-first => NoMethodError.
    expect(() =>
      toAsciimath(new BinaryFunctionNode({ name: "Power", parameterTwo: two() })),
    ).toThrow(RenderError);
    // Probe binary/Power/x,nil => "x".
    expect(toAsciimath(new BinaryFunctionNode({ name: "Power", parameterOne: x() }))).toBe("x");
  });

  it("mod keeps its spaces around missing sides", () => {
    // Probes binary/Mod/nil,2 => " mod 2"; binary/Mod/x,nil => "x mod ".
    expect(toAsciimath(new BinaryFunctionNode({ name: "Mod", parameterTwo: two() }))).toBe(
      " mod 2",
    );
    expect(toAsciimath(new BinaryFunctionNode({ name: "Mod", parameterOne: x() }))).toBe("x mod ");
  });

  it("stackrel skips its parens when the value already starts with one; root never does", () => {
    // Probes stackrel/fenced-first => "stackrel(x)(2)";
    // root/fenced-first => "root((x))(2)".
    const fenced = () => new FencedNode({ parameterTwo: [x()] });
    expect(
      toAsciimath(
        new BinaryFunctionNode({ name: "Stackrel", parameterOne: fenced(), parameterTwo: two() }),
      ),
    ).toBe("stackrel(x)(2)");
    expect(
      toAsciimath(
        new BinaryFunctionNode({ name: "Root", parameterOne: fenced(), parameterTwo: two() }),
      ),
    ).toBe("root((x))(2)");
    // Probe binary/Stackrel/nil,nil => "stackrel()()".
    expect(toAsciimath(new BinaryFunctionNode({ name: "Stackrel" }))).toBe("stackrel()()");
  });
});

describe("the big operators", () => {
  it("append the third slot after a space and Ruby-strip the result", () => {
    // Probes ternary/Int/nil,nil,v => "int 3"; ternary/Int/v,v,nil =>
    // "int_(x)^(2)"; ternary/Int/nil,nil,nil => "int".
    expect(toAsciimath(new IntNode({ parameterThree: three() }))).toBe("int 3");
    expect(toAsciimath(new IntNode({ parameterOne: x(), parameterTwo: two() }))).toBe(
      "int_(x)^(2)",
    );
    expect(toAsciimath(new IntNode({}))).toBe("int");
  });

  it("Ruby strip keeps what Ruby keeps", () => {
    // Probe int/linebreak-third => "int \\" — the linebreak's trailing
    // "\n " is stripped, its backslash stays.
    expect(toAsciimath(new IntNode({ parameterThree: new LinebreakNode({}) }))).toBe("int \\");
  });

  it("nary falls back to int for a missing first slot", () => {
    // Probes kind/Nary/no-first => "int_(2)^(3) 4"; kind/Nary/bare => "int";
    // fontnil/inside-nary-first => "int 2" (a first slot whose own render is
    // Ruby-nil also falls back).
    expect(
      toAsciimath(
        new NaryNode({
          parameterTwo: two(),
          parameterThree: three(),
          parameterFour: new NumberNode({ value: "4" }),
        }),
      ),
    ).toBe("int_(2)^(3) 4");
    expect(toAsciimath(new NaryNode({}))).toBe("int");
    expect(
      toAsciimath(
        new NaryNode({
          parameterOne: new FontStyleNode({ name: "BoldFraktur" }),
          parameterFour: two(),
        }),
      ),
    ).toBe("int 2");
  });
});

describe("font styles", () => {
  it("the eight overriding subclasses emit their canonical keyword", () => {
    // Probes font/Bold/x => "mathbf(x)" ... font/Script/x => "mathcal(x)".
    const expected: readonly (readonly [string, string])[] = [
      ["Bold", "mathbf(x)"],
      ["DoubleStruck", "mathbb(x)"],
      ["Fraktur", "mathfrak(x)"],
      ["Italic", "ii(x)"],
      ["Monospace", "mathtt(x)"],
      ["Normal", "rm(x)"],
      ["SansSerif", "mathsf(x)"],
      ["Script", "mathcal(x)"],
    ];
    for (const [name, output] of expected) {
      expect(toAsciimath(new FontStyleNode({ name, parameterOne: x() })), name).toBe(output);
      // font/<name>/nil => e.g. "mathbf()".
      expect(toAsciimath(new FontStyleNode({ name })), name).toBe(`${output.slice(0, -2)})`);
    }
  });

  it("the six non-overriding subclasses and the bare carrier render the value alone", () => {
    // Probes font/BoldFraktur/x => "x"; font/FontStyle/x,fam => "x";
    // font/BoldFraktur/nil => Ruby nil, "" at this string boundary
    // (TODO.plan/deferred.md).
    expect(toAsciimath(new FontStyleNode({ name: "BoldFraktur", parameterOne: x() }))).toBe("x");
    expect(toAsciimath(new FontStyleNode({ parameterOne: x(), parameterTwo: "bold" }))).toBe("x");
    expect(toAsciimath(new FontStyleNode({ name: "BoldFraktur" }))).toBe("");
    // fontnil/inside-bar => "bar()" — the nil interpolates inside a parent.
    expect(
      toAsciimath(new BarNode({ parameterOne: new FontStyleNode({ name: "BoldFraktur" }) })),
    ).toBe("bar()");
    // fontnil/inside-formula => " x" — join turns the nil into an empty slot.
    expect(
      toAsciimath(new FormulaNode({ value: [new FontStyleNode({ name: "BoldFraktur" }), x()] })),
    ).toBe(" x");
  });
});

describe("color", () => {
  it("strips Ruby \\s from its first value only — never the no-break space", () => {
    // Probes kind/Color/spacey => "color(x2)(x)";
    // color/nbsp => "color(\"a b\")(x)" (NBSP survives, the ASCII
    // space and tab do not).
    expect(
      toAsciimath(
        new ColorNode({
          parameterOne: new FormulaNode({ value: [x(), two()] }),
          parameterTwo: x(),
        }),
      ),
    ).toBe("color(x2)(x)");
    expect(
      toAsciimath(
        new ColorNode({
          parameterOne: new TextNode({ parameterOne: "a b c\td" }),
          parameterTwo: x(),
        }),
      ),
    ).toBe('color("a bcd")(x)');
    // Probe kind/Color/nil,nil => "color()()".
    expect(toAsciimath(new ColorNode({}))).toBe("color()()");
  });
});

describe("text", () => {
  it("unwraps unicode[:name] tokens and quotes the rest verbatim", () => {
    // Probes kind/Text/unicode-token => "\"aalphab\"";
    // kind/Text/quote-inside => "\"a\"b\""; kind/Text/nil => "\"\"".
    expect(toAsciimath(new TextNode({ parameterOne: "aunicode[:alpha]b" }))).toBe('"aalphab"');
    expect(toAsciimath(new TextNode({ parameterOne: 'a"b' }))).toBe('"a"b"');
    expect(toAsciimath(new TextNode({ parameterOne: null }))).toBe('""');
  });

  it("raises where the gem's gsub raises: a node or list in the text slot", () => {
    // Probes text/node-param, text/array-param => NoMethodError.
    expect(() => toAsciimath(new TextNode({ parameterOne: x() }))).toThrow(RenderError);
    expect(() =>
      toAsciimath(new TextNode({ parameterOne: [x()] as unknown as readonly SymbolNode[] })),
    ).toThrow(RenderError);
  });
});

describe("symbols", () => {
  it("aliased classes render their class literal, ignoring a stored value", () => {
    // Probes kind/Symbol/plus-ignores-value => "+"; comma/with-value => ",".
    expect(toAsciimath(new SymbolNode({ id: "Plus", value: "IGNORED" }))).toBe("+");
  });

  it("the base class and the Paren root render their stored value", () => {
    // Probes kind/Symbol/base-x => "x"; kind/Symbol/base-nil => "";
    // paren-root/value => "["; paren-root/nil => "".
    expect(toAsciimath(new SymbolNode({ value: "x" }))).toBe("x");
    expect(toAsciimath(new SymbolNode({}))).toBe("");
    expect(toAsciimath(new SymbolNode({ id: "Paren", value: "[" }))).toBe("[");
    expect(toAsciimath(new SymbolNode({ id: "Paren" }))).toBe("");
  });

  it("comma flips on the table axis, and only below a Td's formula child", () => {
    // Probes ctx/td-direct-comma => ","; ctx/td-formula-comma => "x \",\"";
    // ctx/table-formula-comma => "[[x \",\"]]"; tr/formula-comma => "[,]";
    // ctx/nested-formula-comma-under-td => "\",\"".
    const comma = () => new SymbolNode({ id: "Comma" });
    expect(toAsciimath(td(comma() as unknown as SymbolNode))).toBe(",");
    expect(toAsciimath(td(new FormulaNode({ value: [x(), comma()] })))).toBe('x ","');
    expect(
      toAsciimath(new TableNode({ value: [tr(new FormulaNode({ value: [x(), comma()] }))] })),
    ).toBe('[[x ","]]');
    expect(
      toAsciimath(
        new UnaryFunctionNode({
          name: "Tr",
          parameterOne: [new FormulaNode({ value: [comma()] })],
        }),
      ),
    ).toBe("[,]");
    expect(
      toAsciimath(td(new FormulaNode({ value: [new FormulaNode({ value: [comma()] })] }))),
    ).toBe('","');
    // comma/with-value-table => "\",\"" — the stored value stays ignored.
    expect(
      toAsciimath(td(new FormulaNode({ value: [new SymbolNode({ id: "Comma", value: "XX" })] }))),
    ).toBe('","');
  });
});

describe("tables", () => {
  it("falls back through TABLE_PARENTHESIS for a nil close paren", () => {
    // Probes kind/Table/bare => "[[x, 2], [2, x]]"; kind/Table/open-curly =>
    // "{[x]" (a miss yields the empty string); table/openparen-symbol =>
    // "{:[x]" (the OpenParen symbol renders "{:", also unlisted).
    expect(toAsciimath(new TableNode({ value: [tr(x(), two()), tr(two(), x())] }))).toBe(
      "[[x, 2], [2, x]]",
    );
    expect(
      toAsciimath(
        new TableNode({ value: [tr(x())], openParen: new SymbolNode({ id: "Paren::Lcurly" }) }),
      ),
    ).toBe("{[x]");
    expect(
      toAsciimath(
        new TableNode({ value: [tr(x())], openParen: new SymbolNode({ id: "Paren::OpenParen" }) }),
      ),
    ).toBe("{:[x]");
  });

  it("renders every aliased table subclass as the gem does", () => {
    // Probes table/Matrix => "{:[x]:}" ... table/Vmatrix => "|[x]|".
    const expected: readonly (readonly [string, string])[] = [
      ["Matrix", "{:[x]:}"],
      ["Array", "{:[x]:}"],
      ["Align", "{:[x]:}"],
      ["Split", "{:[x]:}"],
      ["Bmatrix", "[[x]]"],
      ["Cases", "{[x]:}"],
      ["Eqarray", "[x]"],
      ["Multline", "[[x]]"],
      ["Pmatrix", "([x])"],
      ["Vmatrix", "|[x]|"],
    ];
    for (const [name, output] of expected) {
      expect(toAsciimath(new TableNode({ name, value: [tr(x())] })), name).toBe(output);
    }
  });

  it("a nil value renders empty brackets on the base table and crashes Matrix", () => {
    // Probes table/nil-value => "[]"; table/matrix-nil-value => NoMethodError.
    expect(toAsciimath(new TableNode({ value: null }))).toBe("[]");
    expect(() => toAsciimath(new TableNode({ name: "Matrix", value: null }))).toThrow(RenderError);
  });

  it("td joins nil-safely where tr does not", () => {
    // Probes td/nil-member => "x  2"; unary/Tr/nil => NoMethodError.
    expect(
      toAsciimath(
        new BinaryFunctionNode({
          name: "Td",
          parameterOne: [x(), null, two()] as unknown as readonly SymbolNode[],
        }),
      ),
    ).toBe("x  2");
    // `Tr.new` defaults its parameter to `[]` (the constructor materializes
    // the alias default), so the bare node renders empty brackets; an
    // EXPLICIT nil is the probe's NoMethodError (unary/Tr/nil).
    expect(toAsciimath(new UnaryFunctionNode({ name: "Tr" }))).toBe("[]");
    expect(() => toAsciimath(new UnaryFunctionNode({ name: "Tr", parameterOne: null }))).toThrow(
      RenderError,
    );
  });
});

describe("linebreak", () => {
  it("renders backslash-newline-space, placed by linebreakstyle", () => {
    // Probes kind/Linebreak/bare => "\\\n "; after => "x\\\n ";
    // no-style/before => "\\\n x".
    expect(toAsciimath(new LinebreakNode({}))).toBe("\\\n ");
    expect(
      toAsciimath(
        new LinebreakNode({ parameterOne: x(), attributes: { linebreakstyle: "after" } }),
      ),
    ).toBe("x\\\n ");
    expect(toAsciimath(new LinebreakNode({ parameterOne: x() }))).toBe("\\\n x");
  });
});

describe("where the gem cannot render its own parse", () => {
  it("left(right) parses and then refuses to render, here as there", () => {
    // Probe parse/left(right) => Math::ParseError: the parsed value holds a
    // bare "" (Parslet's all-vanished fold), and String has no to_asciimath.
    const formula = parseAsciimath("left(right)");
    expect(() => toAsciimath(formula)).toThrow(RenderError);
  });

  it("a hand-built formula with a bare string member refuses the same way", () => {
    // Probe kind/Formula/string-member-direct => Math::ParseError.
    expect(() => toAsciimath(new FormulaNode({ value: [x(), "raw", two()] }))).toThrow(RenderError);
  });
});

describe("fenced", () => {
  it("defaults its parens and joins the body with spaces", () => {
    // Probes kind/Fenced/nil-parens => "(x)"; kind/Fenced/nil-value => "()".
    expect(toAsciimath(new FencedNode({ parameterTwo: [x()] }))).toBe("(x)");
    expect(
      toAsciimath(
        new FencedNode({
          parameterOne: new SymbolNode({ id: "Paren::Lround" }),
          parameterThree: new SymbolNode({ id: "Paren::Rround" }),
        }),
      ),
    ).toBe("()");
    // Probe fenced/nil-member => NoMethodError: strict elements.
    expect(() =>
      toAsciimath(
        new FencedNode({ parameterTwo: [x(), null] as unknown as readonly SymbolNode[] }),
      ),
    ).toThrow(RenderError);
  });
});

describe("the structural contract's positive half", () => {
  it("a plain object with a known kind and valid shape renders", () => {
    // No constructor involved — §5's structural dispatch, the class-A gate's
    // positive direction.
    const plain = {
      kind: "frac",
      parameterOne: { kind: "number", value: "1" },
      parameterTwo: { kind: "symbol", id: "Plus", value: null },
    } as const;
    expect(toAsciimath(plain as never)).toBe("frac(1)(+)");
  });
});
