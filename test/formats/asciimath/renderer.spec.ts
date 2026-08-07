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

  it("a binary or ternary name outside the measured set raises rather than guessing", () => {
    // The same fail-loud carrier policy the unary, fontStyle and table
    // carriers pin (TODO.plan/deferred.md): a defined name outside
    // REACHABLE_BINARY_NAMES / REACHABLE_TERNARY_NAMES names no measured gem
    // class, so it raises instead of rendering the carrier default.
    expect(() =>
      toAsciimath(new BinaryFunctionNode({ name: "<unmeasured>", parameterOne: x() })),
    ).toThrow(RenderError);
    expect(() =>
      toAsciimath(new TernaryFunctionNode({ name: "<unmeasured>", parameterOne: x() })),
    ).toThrow(RenderError);
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

  it("a defined name outside the measured subclass set raises rather than guessing", () => {
    // Oracle census (probe-subclass-census.rb, 2026-08-07): FontStyle has
    // exactly 14 subclasses — the 8 keyword-overriding ones and the 6
    // value-alone ones above. Any other defined name names no measured gem
    // class, so it fails loudly instead of rendering the value alone
    // (TODO.plan/deferred.md, the fail-loud carrier policy). The bare
    // carrier — name undefined — keeps its measured value-alone render.
    expect(() =>
      toAsciimath(new FontStyleNode({ name: "<unmeasured>", parameterOne: x() })),
    ).toThrow(RenderError);
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

  it("falls back to the measured close paren for every listed open paren", () => {
    // Probes table/fallback: a base Symbol carrying each listed open paren,
    // nil close — Table.new([row], Symbol.new("ᑕ")) => "ᑕ[x]ᑐ",
    // "ℒ[x]ℛ", "[[x]]", "([x])" (probe run 2026-08-06).
    const expected: readonly (readonly [string, string])[] = [
      ["ᑕ", "ᑕ[x]ᑐ"],
      ["ℒ", "ℒ[x]ℛ"],
      ["[", "[[x]]"],
      ["(", "([x])"],
    ];
    for (const [open, output] of expected) {
      expect(
        toAsciimath(
          new TableNode({ value: [tr(x())], openParen: new SymbolNode({ value: open }) }),
        ),
        open,
      ).toBe(output);
    }
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

  it("a defined name outside the measured subclass set raises rather than guessing", () => {
    // Oracle census (probe-subclass-census.rb, 2026-08-07): Table has exactly
    // 10 subclasses, every one pinned above. Any other defined name names no
    // measured gem class, and the base-table default render for it would
    // diverge silently — so it fails loudly instead (TODO.plan/deferred.md,
    // the fail-loud carrier policy). The bare carrier — name undefined —
    // keeps its measured base-table render.
    expect(() => toAsciimath(new TableNode({ name: "<unmeasured>", value: [tr(x())] }))).toThrow(
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
    // Probe probe-linebreak-attributes.rb: hash-other-key and hash-style-array
    // both => "\\\n x" — any hash whose :linebreakstyle is not exactly "after"
    // takes the before branch.
    expect(toAsciimath(new LinebreakNode({ parameterOne: x(), attributes: { foo: "bar" } }))).toBe(
      "\\\n x",
    );
    expect(
      toAsciimath(
        new LinebreakNode({ parameterOne: x(), attributes: { linebreakstyle: ["after"] } }),
      ),
    ).toBe("\\\n x");
  });

  it("non-hash attributes raise, as the gem's attributes[:linebreakstyle] send does", () => {
    // Probe probe-linebreak-attributes.rb on the pinned oracle (ruby 4.0.1),
    // Linebreak.new(Symbols::Symbol.new("x"), ATTRS).to_asciimath(options: {}):
    //   [] / ["after"] / "after" / 5 => TypeError: no implicit conversion of
    //     Symbol into Integer
    //   nil / true / false / 1.5 / Number.new("2") => NoMethodError:
    //     undefined method '[]' for <the value>
    // Only a hash answers the send; everything else is RenderError here (the
    // §5 crash mapping — never the silent before-form these shapes rendered
    // when `.linebreakstyle` was read unchecked).
    const linebreak = (attributes: unknown) =>
      ({
        kind: "linebreak",
        parameterOne: { kind: "number", value: "2" },
        attributes,
      }) as never;
    expect(() => toAsciimath(linebreak([]))).toThrow(RenderError);
    expect(() => toAsciimath(linebreak(["after"]))).toThrow(RenderError);
    expect(() => toAsciimath(linebreak("after"))).toThrow(RenderError);
    expect(() => toAsciimath(linebreak(5))).toThrow(RenderError);
    expect(() => toAsciimath(linebreak(1.5))).toThrow(RenderError);
    expect(() => toAsciimath(linebreak(null))).toThrow(RenderError);
    expect(() => toAsciimath(linebreak(true))).toThrow(RenderError);
    expect(() => toAsciimath(linebreak(false))).toThrow(RenderError);
    // A node in the attributes slot: Ruby's Linebreak instance has no `[]`
    // either — NoMethodError there, RenderError here.
    expect(() => toAsciimath(linebreak({ kind: "number", value: "2" }))).toThrow(RenderError);
    expect(() => toAsciimath(linebreak([]))).toThrow(/linebreak\.attributes/);
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

describe("degenerate value slots the gem's pipeline cannot produce", () => {
  // No gem parse puts anything but a string (or nil) into `Number#value` or
  // `Symbols::Symbol#value`. Where the gem's spelling of a degenerate value
  // IS reproducible (booleans, the non-finite floats — next describe) this
  // port renders it; the shapes here are the ones whose Ruby bytes cannot be
  // matched — hash inspect, object addresses, the Integer/Float split — so
  // they raise (the standing degenerate-input ruling: loud, never silently
  // divergent bytes).
  it("a number with an object value raises instead of emitting [object Object]", () => {
    // Probe probe-degenerate-value.rb on the pinned oracle (ruby 4.0.1):
    //   Plurimath::Math::Number.new({a: 1}).to_asciimath(options: {})
    //     => "{a: 1}"   (Ruby Hash#to_s; `String({a: 1})` is "[object Object]")
    expect(() => toAsciimath({ kind: "number", value: { a: 1 } } as never)).toThrow(RenderError);
  });

  it("a base symbol with an object value raises the same way", () => {
    // Probe: Plurimath::Math::Symbols::Symbol.new({a: 1}).to_asciimath(options: {})
    //   => "{a: 1}" — same divergence, same site shape.
    expect(() => toAsciimath({ kind: "symbol", value: { a: 1 } } as never)).toThrow(RenderError);
  });

  it("a node in the value slot raises too — Ruby's bytes carry an object address", () => {
    // Probe: Number.new(Number.new("2")).to_asciimath(options: {})
    //   => "#<Plurimath::Math::Number:0x0000753b63e99350>" — not stable even
    //   in Ruby, so there is nothing to be byte-identical to.
    expect(() =>
      toAsciimath({ kind: "number", value: { kind: "number", value: "2" } } as never),
    ).toThrow(RenderError);
  });

  it("describes an object slot with its article — an object, never a object", () => {
    // Wording-only pin on the message the object-value ruling above raises:
    // `describeSlot` gets an explicit object branch (the c9d4034 pattern in
    // core's describeValue), so the error reads "an object".
    expect(() => toAsciimath({ kind: "number", value: { a: 1 } } as never)).toThrow(
      /holds an object/,
    );
  });

  it("a finite number raises: JS cannot witness Ruby's Integer/Float split", () => {
    // Probe probe-sweep-truthiness.rb on the pinned oracle:
    //   Number.new(5).to_asciimath(options: {})     => "5"
    //   Number.new(5.0).to_asciimath(options: {})   => "5.0"
    //   Number.new(1.0e21).to_asciimath(options: {})=> "1.0e+21" (String() says "1e+21")
    // The JS number 5 is both Ruby values at once, so there is no single
    // byte answer to match — loud, never a guess.
    expect(() => toAsciimath({ kind: "number", value: 5 } as never)).toThrow(RenderError);
    expect(() =>
      toAsciimath(new UnaryFunctionNode({ name: "Left", parameterOne: 5 as never })),
    ).toThrow(RenderError);
  });
});

describe("degenerate value slots the gem spells reproducibly", () => {
  // The mirror half of the ruling above: where the gem RENDERS a degenerate
  // slot and its bytes are reproducible, this port renders the same bytes —
  // class-for-class parity cuts both ways. All pins probed on the pinned
  // oracle (probe-sweep-truthiness.rb, 2026-08-07, ruby 4.0.1).
  it("a false parameter renders as Ruby truthiness renders it — empty, not a crash", () => {
    // asciimath_value (`unary_function.rb:196`) opens `return "" unless
    // parameter_one` — a truthiness test, so `false` answers "" exactly like
    // nil. Probes: mpadded-false => ""; sin-false => "sin".
    expect(toAsciimath({ kind: "mpadded", parameterOne: false } as never)).toBe("");
    expect(toAsciimath(new UnaryFunctionNode({ name: "Sin", parameterOne: false as never }))).toBe(
      "sin",
    );
    // Probe norm-false => "norm" — the non-keyword carrier default reaches
    // its `if parameter_one` guard instead, same answer through `present`.
    expect(toAsciimath(new NormNode({ parameterOne: false as never }))).toBe("norm");
  });

  it("a boolean value interpolates as Ruby spells it", () => {
    // Probes: number-true => "true"; number-false => "false" (TextRenderer's
    // `result.to_s`); symbol-true-in-formula => "true" (the raw value,
    // to_s'd by Formula's join).
    expect(toAsciimath({ kind: "number", value: true } as never)).toBe("true");
    expect(toAsciimath({ kind: "number", value: false } as never)).toBe("false");
    expect(toAsciimath({ kind: "symbol", value: true } as never)).toBe("true");
  });

  it("the three non-finite floats interpolate as Ruby spells them", () => {
    // Probes: number-nan => "NaN"; number-inf => "Infinity"; number-neg-inf
    // => "-Infinity" — each the one JS number with exactly one Ruby preimage
    // and a byte-identical to_s, unlike every finite number (see above).
    expect(toAsciimath({ kind: "number", value: Number.NaN } as never)).toBe("NaN");
    expect(toAsciimath({ kind: "number", value: Number.POSITIVE_INFINITY } as never)).toBe(
      "Infinity",
    );
    expect(toAsciimath({ kind: "number", value: Number.NEGATIVE_INFINITY } as never)).toBe(
      "-Infinity",
    );
  });

  it("Left/Right interpolate the same reproducible primitives", () => {
    // Probes: left-true => "lefttrue"; right-false => "rightfalse";
    // left-nan => "leftNaN" — `"left#{parameter_one}"` is plain
    // interpolation, so the same to_s parity applies.
    expect(toAsciimath(new UnaryFunctionNode({ name: "Left", parameterOne: true as never }))).toBe(
      "lefttrue",
    );
    expect(
      toAsciimath(new UnaryFunctionNode({ name: "Right", parameterOne: false as never })),
    ).toBe("rightfalse");
    expect(
      toAsciimath(new UnaryFunctionNode({ name: "Left", parameterOne: Number.NaN as never })),
    ).toBe("leftNaN");
  });

  it("a false slot still raises where the gem's send raises", () => {
    // Truthiness only reaches the guards that test it. Probes: text-false =>
    // NoMethodError (false.gsub); mpadded-list-false => NoMethodError
    // (Array#compact keeps false; false.to_asciimath).
    expect(() => toAsciimath(new TextNode({ parameterOne: false as never }))).toThrow(RenderError);
    expect(() => toAsciimath({ kind: "mpadded", parameterOne: [false] } as never)).toThrow(
      RenderError,
    );
  });
});

describe("inputs that defeat the walk itself", () => {
  // Class-for-class parity holds even where the INPUT breaks the walker
  // rather than any one read: the gem raises (probe probe-sweep-depth.rb:
  // SystemStackError at depth 10,000, direct and through the Formula
  // boundary), and `Formula#to_asciimath` wraps every render-time
  // StandardError into ParseError (`formula.rb:437`, wrap_render_error) —
  // so nothing may escape this boundary as a raw RangeError or a hostile
  // accessor's own error.
  it("a tree deeper than the call stack raises RenderError, not RangeError", () => {
    let node: unknown = { kind: "number", value: "1" };
    for (let i = 0; i < 50_000; i += 1) node = { kind: "sqrt", parameterOne: node };
    expect(() => toAsciimath(node as never)).toThrow(RenderError);
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
    expect(() => toAsciimath(node as never)).toThrow(RenderError);
  });

  it("a kind that flips to an inherited key after validation raises the unknown-kind RenderError", () => {
    // Validation reads `kind` once; the dispatcher's own read is a second
    // one, and a stateful getter can answer it with an inherited
    // Object.prototype key. On a plain-object table "toString" resolves to a
    // real function (a string comes back, no error at all) and "__proto__"
    // to Object.prototype itself (a TypeError from calling a non-function).
    // Both are unknown kinds and must take the unknown-kind RenderError,
    // naming the kind the dispatcher actually read.
    for (const flip of ["toString", "__proto__"]) {
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
        toAsciimath(node as never);
      } catch (error) {
        caught = error;
      }
      expect(caught, flip).toBeInstanceOf(RenderError);
      expect((caught as RenderError).message, flip).toContain(flip);
      expect((caught as RenderError).kind, flip).toBe(flip);
    }
  });

  it("a frozen tree renders — nothing on the render path writes to the input", () => {
    // Ruby renders frozen nodes fine; so must this port.
    const tree = Object.freeze({
      kind: "frac",
      parameterOne: Object.freeze({ kind: "number", value: "1" }),
      parameterTwo: Object.freeze({ kind: "symbol", id: "Plus", value: null }),
    });
    expect(toAsciimath(tree as never)).toBe("frac(1)(+)");
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
