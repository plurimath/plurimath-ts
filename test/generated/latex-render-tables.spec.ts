/**
 * The generated LaTeX render tables.
 *
 * Six constants, sixty-eight entries — the tables `to_latex` reads that no
 * other generated slice supplies. They are small enough to hand-type, which is
 * exactly why they are generated: a hand-typed copy drifts silently the first
 * time upstream edits one. These assertions pin what the oracle said at
 * generation time, so a regeneration that truncates, reorders or empties a
 * table fails here instead of quietly changing what the renderer emits.
 *
 * The expectations are deliberately literal — a test that derived them from
 * the tables under test would pass against empty tables. They were measured
 * by rendering live gem instances under the oracle's bundle (session probe,
 * 2026-08-06), one render per row:
 *
 *   Function::Left.new("&#x2329;").to_latex(options: {})
 *     # => "\left \langle"        (and a Right render per row)
 *   Function::Overset.new(Sin.new(x), nil).to_latex(options: {})
 *     # => "\overset{\sin{x}}"    (plain; Sup gets "{ \left ( … \right ) }")
 *   FontStyle::Bold.new(x).to_latex(options: {})
 *     # => "\mathbf{x}"           (and so on for all fourteen subclasses)
 *   Table::Matrix.new([row], Paren::Lround.new).to_latex(options: {})
 *     # => "\begin{pmatrix}x\end{pmatrix}"  (per to_matrices paren)
 *   Table::Array.new([row_with_columnalign]).to_latex(options: {})
 *     # => "\begin{array}{l}x\end{array}"   (per alignment)
 *   Function::Color.new(Plus.new, x).to_latex(options: {})
 *     # => "{\color{+} x}"        (per color-slice id)
 *
 * against plurimath 0.11.6 at 00c52783877b38f6b8e6e109f1803f96bb34fc62. The
 * generator re-runs the same measurement on every regeneration.
 */

import { describe, expect, it } from "vitest";
import {
  BinaryFunctionNode,
  ColorNode,
  FontStyleNode,
  OversetNode,
  SymbolNode,
  TableNode,
  UnaryFunctionNode,
} from "../../src/core/nodes";
import { toLatex } from "../../src/formats/latex/renderer";
import { ASCIIMATH_TRANSFORM_FONT_STYLES } from "../../src/generated/asciimath/transform-registry";
import {
  LATEX_ALIGNMENT_LETTERS,
  LATEX_COLOR_ASCIIMATH_SYMBOLS,
  LATEX_FONT_STYLE_COMMANDS,
  LATEX_LEFT_RIGHT_PARENS,
  LATEX_MATRIX_ENVIRONMENTS,
  LATEX_PLAIN_WRAPPED_UNARY_NAMES,
} from "../../src/generated/latex/render-tables";
import { LATEX_SYMBOLS } from "../../src/generated/latex/symbols";

const sym = (value: string) => new SymbolNode({ value });
const unary = (name: string, parameterOne?: SymbolNode | string) =>
  new UnaryFunctionNode({ name, parameterOne });
const row = () =>
  new UnaryFunctionNode({
    name: "Tr",
    parameterOne: [new BinaryFunctionNode({ name: "Td", parameterOne: [sym("x")] })],
  });

describe("the left/right paren commands", () => {
  it("hold exactly the inverted constant, in the gem's invert order", () => {
    // 24 constant keys collapse to 23 rows: `\Vert` and `\|` share the value
    // `&#x2016;`, and Ruby's `Hash#invert` keeps the LAST key, `\|` — which
    // is also why `}` precedes `{` (the constant lists `\}` first).
    expect([...LATEX_LEFT_RIGHT_PARENS]).toEqual([
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
      ["}", "\\}"],
      ["{", "\\{"],
      ["(", "("],
      [")", ")"],
      ["<", "<"],
      [">", ">"],
      ["/", "/"],
      ["|", "|"],
      ["[", "["],
      ["]", "]"],
    ]);
  });

  it("reaches the renderer: Left and Right consult this table", () => {
    // Probes lr/left/&#x2329; => "\left \langle" and the duplicated-value row
    // lr/left/&#x2016; => "\left \|" — the literal here is what the ORACLE
    // rendered, not a readback of the table.
    expect(toLatex(unary("Left", "&#x2329;"))).toBe("\\left \\langle");
    expect(toLatex(unary("Right", "&#x2016;"))).toBe("\\right \\|");
  });
});

describe("the plain-wrapped unary names", () => {
  it("hold exactly the 27 measured false-answering names, sorted", () => {
    // Of the 34 reachable unary classes: NOT Cancel, Ker, Liminf, Limsup or
    // Sup (they answer true and take the wrap), and NOT Left/Right (they
    // answer false but carry their own renderer dispatch).
    expect([...LATEX_PLAIN_WRAPPED_UNARY_NAMES]).toEqual([
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
      "Glb",
      "Lcm",
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
    ]);
  });

  it("reaches the renderer: a listed name stays plain, an unlisted one wraps", () => {
    // Probes wrapped/Sin => "\overset{\sin{x}}" (plain) against wrapped/Sup
    // => "\overset{ \left ( \sup{x} \right ) }" — Sup sits in the gem's
    // parse-side UNARY_CLASSES, which is exactly why this table cannot come
    // from the registry.
    expect(toLatex(new OversetNode({ parameterOne: unary("Sin", sym("x")) }))).toBe(
      "\\overset{\\sin{x}}",
    );
    expect(toLatex(new OversetNode({ parameterOne: unary("Sup", sym("x")) }))).toBe(
      "\\overset{ \\left ( \\sup{x} \\right ) }",
    );
  });
});

describe("the font-style commands", () => {
  it("hold exactly the eight measured wrapper commands, sorted by basename", () => {
    // The six other subclasses (BoldFraktur, BoldItalic, BoldSansSerif,
    // BoldScript, SansSerifBoldItalic, SansSerifItalic) and the bare carrier
    // were measured rendering their value alone, so they carry no entry.
    expect([...LATEX_FONT_STYLE_COMMANDS]).toEqual([
      ["Bold", "\\mathbf"],
      ["DoubleStruck", "\\mathbb"],
      ["Fraktur", "\\mathfrak"],
      ["Italic", "\\mathit"],
      ["Monospace", "\\mathtt"],
      ["Normal", "\\mathrm"],
      ["SansSerif", "\\mathsf"],
      ["Script", "\\mathcal"],
    ]);
  });

  it("keys name real FontStyle subclasses, and the renderer consults them", () => {
    // Every key resolves through the independently generated transform
    // registry to a `Math::Function::FontStyle::` class, and a render emits
    // the command (probes font/Bold/sym => "\mathbf{x}").
    const known = new Set(ASCIIMATH_TRANSFORM_FONT_STYLES.map((entry) => entry.rubyClass));
    for (const basename of LATEX_FONT_STYLE_COMMANDS.keys()) {
      expect(known.has(`Math::Function::FontStyle::${basename}`), basename).toBe(true);
    }
    expect(toLatex(new FontStyleNode({ name: "Bold", parameterOne: sym("x") }))).toBe(
      "\\mathbf{x}",
    );
  });
});

describe("the matrix environments", () => {
  it("hold exactly the five to_matrices parens, sorted by class name", () => {
    expect([...LATEX_MATRIX_ENVIRONMENTS]).toEqual([
      ["Paren::Lcurly", "Bmatrix"],
      ["Paren::Lround", "pmatrix"],
      ["Paren::Lsquare", "bmatrix"],
      ["Paren::Norm", "Vmatrix"],
      ["Paren::Vert", "vmatrix"],
    ]);
  });

  it("keys are generated symbol ids, and the renderer consults them", () => {
    // Each key is an id in the independently generated latex symbol table,
    // and a named-table render selects the environment (probes
    // named-table/Matrix/curly-open => "\begin{Bmatrix}x\end{Bmatrix}").
    for (const id of LATEX_MATRIX_ENVIRONMENTS.keys()) {
      expect(LATEX_SYMBOLS.has(id), id).toBe(true);
    }
    expect(
      toLatex(
        new TableNode({
          name: "Matrix",
          value: [row()],
          openParen: new SymbolNode({ id: "Paren::Lcurly" }),
        }),
      ),
    ).toBe("\\begin{Bmatrix}x\\end{Bmatrix}");
  });
});

describe("the alignment letters", () => {
  it("hold exactly what the gem holds, in the gem's invert order", () => {
    // The constant is letter -> alignment (`c:` first); the render path reads
    // the inversion, so `center` leads here.
    expect([...LATEX_ALIGNMENT_LETTERS]).toEqual([
      ["center", "c"],
      ["right", "r"],
      ["left", "l"],
    ]);
  });

  it("reaches the renderer: an array descriptor spells the letter", () => {
    // Probes align/left => "\begin{array}{l}x\end{array}".
    const alignedTd = new BinaryFunctionNode({
      name: "Td",
      parameterOne: [sym("x")],
      parameterTwo: { columnalign: "left" },
    });
    const alignedRow = new UnaryFunctionNode({ name: "Tr", parameterOne: [alignedTd] });
    expect(
      toLatex(
        new TableNode({ name: "Array", value: [alignedRow], openParen: null, closeParen: null }),
      ),
    ).toBe("\\begin{array}{l}x\\end{array}");
  });
});

describe("the color asciimath slice", () => {
  it("holds exactly the two measured ids", () => {
    expect([...LATEX_COLOR_ASCIIMATH_SYMBOLS]).toEqual([
      ["Plus", "+"],
      ["Eqno", '"P{eqno}"'],
    ]);
  });

  it("reaches the renderer: a Color first slot renders the measured value", () => {
    // Probes color/Plus => "{\color{+} x}" and color/Eqno =>
    // "{\color{"P{eqno}"} x}" — the Eqno value keeps its literal quotes,
    // because the gem's parsing_wrapper writes them into the asciimath.
    expect(
      toLatex(
        new ColorNode({ parameterOne: new SymbolNode({ id: "Plus" }), parameterTwo: sym("x") }),
      ),
    ).toBe("{\\color{+} x}");
    expect(
      toLatex(
        new ColorNode({ parameterOne: new SymbolNode({ id: "Eqno" }), parameterTwo: sym("x") }),
      ),
    ).toBe('{\\color{"P{eqno}"} x}');
  });
});
