/**
 * Behavioural pins for `toMathml` beyond the corpus and the gem-verified
 * sweep: the options matrix, the named deferrals, the degenerate-slot
 * guards, and the boundary hardening — every expected byte string below is
 * the pinned oracle's own output (plurimath 0.11.6 at 00c52783; probes
 * probe-mathml-kinds.rb, probe-mathml-edges.rb, probe-mathml-edges3.rb in
 * the PR record), and every refusal marks a spot where the gem crashes or
 * where reproducing it would need an unmeasured subsystem
 * (TODO.plan/deferred.md).
 */

import { describe, expect, it } from "vitest";
import { MissingSymbolDataError, RenderError } from "../../../src/core/errors";
import {
  BarNode,
  BinaryFunctionNode,
  ColorNode,
  FencedNode,
  FontStyleNode,
  FormulaNode,
  FracNode,
  IntNode,
  LinebreakNode,
  type MathNode,
  MrowNode,
  NaryNode,
  NumberNode,
  SymbolNode,
  TableNode,
  TernaryFunctionNode,
  TextNode,
  UnaryFunctionNode,
} from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toMathml } from "../../../src/formats/mathml/renderer";

const x = () => new SymbolNode({ value: "x" });
const y = () => new SymbolNode({ value: "y" });
const formula = (...nodes: MathNode[]) => new FormulaNode({ value: nodes });
const td = (...cells: MathNode[]) =>
  new BinaryFunctionNode({ name: "Td", parameterOne: cells, parameterTwo: null });
const tr = (...cells: MathNode[]) =>
  new UnaryFunctionNode({ name: "Tr", parameterOne: cells.map((cell) => cell) });

/** The constant `<math>`/`<mstyle>` wrapper every full render carries. */
function math(inner: string, displaystyle = "true"): string {
  return (
    `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n` +
    `  <mstyle displaystyle="${displaystyle}">\n${inner}\n  </mstyle>\n</math>\n`
  );
}

const SIN_SPACED =
  '    <mrow>\n      <mo rspace="thickmathspace"/>\n      <mrow>\n' +
  "        <mi>sin</mi>\n        <mi>x</mi>\n      </mrow>\n    </mrow>";
const SIN_BARE = "    <mrow>\n      <mi>sin</mi>\n      <mi>x</mi>\n    </mrow>";

function sinX(): FormulaNode {
  return formula(new UnaryFunctionNode({ name: "Sin", parameterOne: x() }));
}

describe("the options matrix (probe-mathml-edges.rb)", () => {
  it("defaults: displaystyle from the formula, unary spacing on", () => {
    expect(toMathml(sinX())).toBe(math(SIN_SPACED));
  });

  it('displayStyle false renders displaystyle="false"', () => {
    expect(toMathml(sinX(), { displayStyle: false })).toBe(math(SIN_SPACED, "false"));
  });

  it('displayStyle is Ruby\'s to_s == "true": strings coerce, junk is false', () => {
    expect(toMathml(sinX(), { displayStyle: "true" })).toBe(math(SIN_SPACED));
    expect(toMathml(sinX(), { displayStyle: "yes" })).toBe(math(SIN_SPACED, "false"));
  });

  it('an explicit null displayStyle is nil — "false", NOT the default (probed)', () => {
    expect(toMathml(sinX(), { displayStyle: null })).toBe(math(SIN_SPACED, "false"));
  });

  it("the formula's own displaystyle field is the default", () => {
    const off = new FormulaNode({
      value: [new UnaryFunctionNode({ name: "Sin", parameterOne: x() })],
      displaystyle: false,
    });
    expect(toMathml(off)).toBe(math(SIN_SPACED, "false"));
  });

  it("unaryFunctionSpacing false drops the spacing wrap", () => {
    expect(toMathml(sinX(), { unaryFunctionSpacing: false })).toBe(math(SIN_BARE));
  });

  it("unaryFunctionSpacing null is the gem's compacted nil — spacing off (probed)", () => {
    expect(toMathml(sinX(), { unaryFunctionSpacing: null })).toBe(math(SIN_BARE));
  });

  it("an empty formula renders the self-closing mstyle", () => {
    expect(toMathml(new FormulaNode({ value: [] }))).toBe(
      `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n` +
        `  <mstyle displaystyle="true"/>\n</math>\n`,
    );
  });
});

describe("the options argument itself", () => {
  it("rejects a primitive or array options value instead of coercing it", () => {
    // Object.hasOwn would ToObject-coerce "oops" and silently render with
    // empty options — a surprise, not the gem's keyword-hash contract.
    const node = sinX();
    for (const bad of ["oops", 5, true, ["displayStyle"]] as const) {
      expect(() => toMathml(node, bad as never)).toThrow(RenderError);
    }
    expect(() => toMathml(node)).not.toThrow();
    expect(() => toMathml(node, null)).not.toThrow();
  });
});

describe("the deferred options, refused by name", () => {
  const cases: readonly (readonly [string, Record<string, unknown>])[] = [
    ["formatter", { formatter: {} }],
    ["intent", { intent: true }],
    ["intent", { intent: false }],
    ["unitsml", { unitsml: {} }],
    ["splitOnLinebreak", { splitOnLinebreak: true }],
  ];
  for (const [name, options] of cases) {
    it(`${JSON.stringify(options)} raises a RenderError naming "${name}"`, () => {
      let caught: unknown;
      try {
        toMathml(sinX(), options as never);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(RenderError);
      expect((caught as RenderError).message).toContain(`"${name}"`);
      expect((caught as RenderError).message).toContain("deferred");
    });
  }

  it("an explicitly-undefined deferred key passes through as absent", () => {
    expect(toMathml(sinX(), { formatter: undefined, intent: undefined } as never)).toBe(
      math(SIN_SPACED),
    );
  });
});

describe("the entry contract", () => {
  it("only Formula (and Mrow/Mstyle) answer to_mathml — other kinds raise", () => {
    expect(() => toMathml(x())).toThrow(RenderError);
    expect(() => toMathml(new NumberNode({ value: "2" }))).toThrow(RenderError);
  });

  it("an Mrow node and an Mstyle-named formula both render", () => {
    expect(toMathml(new MrowNode({ value: [x()] }))).toBe(math("    <mi>x</mi>"));
    expect(toMathml(new FormulaNode({ value: [x()], name: "Mstyle" }))).toBe(
      math("    <mi>x</mi>"),
    );
  });

  it("an unmeasured formula subclass name raises", () => {
    expect(() => toMathml(new FormulaNode({ value: [x()], name: "Mbox" }))).toThrow(RenderError);
  });

  it("a nested wrapperless formula splices, the root never wraps (probed)", () => {
    const inner = new FormulaNode({ value: [x(), y()], leftRightWrapper: false });
    expect(toMathml(formula(inner))).toBe(math("    <mi>x</mi>\n    <mi>y</mi>"));
  });
});

describe("crash parity: the gem's own parse output it cannot render", () => {
  for (const input of ["", " ", "left(right)", "textbf x"]) {
    it(`${JSON.stringify(input)} parses and then refuses to render, as the gem does`, () => {
      const parsed = parseAsciimath(input);
      expect(() => toMathml(parsed)).toThrow(RenderError);
    });
  }
});

describe("degenerate-slot guards, each measured (probe files in the PR record)", () => {
  it("Left holding a number or boolean raises — the gem's << crashes (probe left)", () => {
    const left = (value: unknown) =>
      new UnaryFunctionNode({ name: "Left", parameterOne: value as never });
    expect(() => toMathml(formula(left(5)))).toThrow(RenderError);
    expect(() => toMathml(formula(left(true)))).toThrow(RenderError);
    expect(toMathml(formula(left("\\{")))).toBe(math("    <mo>{</mo>"));
    expect(toMathml(formula(left(null)))).toBe(math("    <mo/>"));
  });

  it('base Symbol: rspace attribute, {: empty mi, "" long form (probes symbol-*)', () => {
    expect(
      toMathml(formula(new SymbolNode({ value: "x", options: { rspace: "thickmathspace" } }))),
    ).toBe(math('    <mi rspace="thickmathspace">x</mi>'));
    expect(toMathml(formula(new SymbolNode({ value: "{:" })))).toBe(math("    <mi/>"));
    expect(toMathml(formula(new SymbolNode({ value: "" })))).toBe(math("    <mi></mi>"));
    expect(toMathml(formula(new SymbolNode({ value: null })))).toBe(math("    <mi/>"));
  });

  it("a value holding &#x2147; grows the DECODED intent attribute unconditionally (probed)", () => {
    expect(toMathml(formula(new SymbolNode({ value: "&#x2147;" })))).toBe(
      math('    <mi intent="ⅇ">&#x2147;</mi>'),
    );
  });

  it("decodes the intent attribute TWICE, as the gem's two passes do", () => {
    // `symbol.rb:47` decodes the value into `attributes[:intent]`, and then
    // `OxEngine::Element#update_attrs` (`element.rb:104-110`) decodes every
    // attribute again on the way out. Both passes are observable when the
    // value carries an escaped ampersand, because the first pass UNCOVERS an
    // entity for the second: `html_entity_to_unicode("&#x26;#x41;")` is
    // "&#x41;", which decodes again to "A".
    //
    // This port decoded once and wrote the attribute directly, on the stated
    // grounds that the second pass was a no-op. Measured on the pinned oracle:
    //
    //   gem   <mi intent="ⅇA">…       port (before)  <mi intent="ⅇ&#x41;">…
    expect(toMathml(formula(new SymbolNode({ value: "&#x2147;&amp;#x41;" })))).toBe(
      math('    <mi intent="ⅇA">&#x2147;&amp;#x41;</mi>'),
    );

    // Exactly two passes, not "decode until stable": a doubly-escaped value
    // still has an entity left after both. Measured, gem and port agree.
    expect(toMathml(formula(new SymbolNode({ value: "&#x2147;&amp;amp;#x41;" })))).toBe(
      math('    <mi intent="ⅇ&#x41;">&#x2147;&amp;amp;#x41;</mi>'),
    );
  });

  it('Plus reads its value (Ruby ||: "" stays); rspace on a subclass is ignored (probed)', () => {
    expect(toMathml(formula(new SymbolNode({ id: "Plus", value: "&#x2b;" })))).toBe(
      math("    <mo>&#x2b;</mo>"),
    );
    expect(toMathml(formula(new SymbolNode({ id: "Plus", value: "" })))).toBe(
      math("    <mo></mo>"),
    );
    expect(
      toMathml(formula(new SymbolNode({ id: "Plus", options: { rspace: "thickmathspace" } }))),
    ).toBe(math("    <mo>+</mo>"));
  });

  it("a number renders <mn>; nil is the long form; a finite JS number refuses (ambiguous)", () => {
    expect(toMathml(formula(new NumberNode({ value: "2" })))).toBe(math("    <mn>2</mn>"));
    expect(toMathml(formula(new NumberNode({ value: null })))).toBe(math("    <mn></mn>"));
    expect(() => toMathml(formula(new NumberNode({ value: 5 as never })))).toThrow(RenderError);
  });

  it("linebreak renames its child render to <mo>; nil attributes crash (probes linebreak-*)", () => {
    expect(
      toMathml(formula(new LinebreakNode({ parameterOne: new TextNode({ parameterOne: "ab" }) }))),
    ).toBe(math("    <mo>ab</mo>"));
    // A nil attributes slot cannot leave the constructor (it shallow-copies
    // to {}); only a hand-built node reaches the gem's `nil.empty?` crash.
    const bad = { kind: "linebreak", parameterOne: x(), attributes: null };
    expect(() => toMathml(formula(bad as never))).toThrow(RenderError);
    const spliced = new LinebreakNode({
      parameterOne: new FormulaNode({ value: [x()], leftRightWrapper: false }),
    });
    expect(() => toMathml(formula(spliced))).toThrow(RenderError);
  });

  it("stackrel: a nil slot is the long-form <mrow></mrow>; a spliced slot crashes (probed)", () => {
    const stackrel = new BinaryFunctionNode({
      name: "Stackrel",
      parameterOne: null,
      parameterTwo: y(),
    });
    expect(toMathml(formula(stackrel))).toBe(
      math(
        "    <mover>\n      <mrow>\n        <mi>y</mi>\n      </mrow>\n" +
          "      <mrow></mrow>\n    </mover>",
      ),
    );
    const spliced = new BinaryFunctionNode({
      name: "Stackrel",
      parameterOne: new FormulaNode({ value: [x()], leftRightWrapper: false }),
      parameterTwo: y(),
    });
    expect(() => toMathml(formula(spliced))).toThrow(RenderError);
  });

  it("nary: undOvr type, mrow-wrap of the fourth slot; nil options crash (probes nary-*)", () => {
    const nary = new NaryNode({
      parameterOne: new SymbolNode({ id: "Sum" }),
      parameterTwo: x(),
      parameterThree: y(),
      parameterFour: new SymbolNode({ value: "z" }),
      options: { type: "undOvr" },
    });
    expect(toMathml(formula(nary))).toBe(
      math(
        "    <mrow>\n      <munderover>\n        <mo>&#x2211;</mo>\n        <mi>x</mi>\n" +
          "        <mi>y</mi>\n      </munderover>\n      <mrow>\n        <mi>z</mi>\n" +
          "      </mrow>\n    </mrow>",
      ),
    );
    // A nil options slot cannot leave the constructor; a hand-built node
    // reaches the gem's `nil[:type]` crash in tag_name.
    expect(() =>
      toMathml(formula({ kind: "nary", options: null, parameterOne: x() } as never)),
    ).toThrow(RenderError);
  });

  it("a live mask is refused by name; the inert nil-key mask renders (probes int-mask-*)", () => {
    const masked = new IntNode({ parameterOne: x(), parameterTwo: y(), options: { mask: 1 } });
    let caught: unknown;
    try {
      toMathml(formula(masked));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).message).toContain('"mask"');
    const inert = new IntNode({ parameterOne: x(), parameterTwo: y(), options: { mask: null } });
    expect(toMathml(formula(inert))).toBe(
      math(
        "    <msubsup>\n      <mo>&#x222b;</mo>\n      <mi>x</mi>\n      <mi>y</mi>\n" +
          "    </msubsup>",
      ),
    );
  });

  it("tables: vert column lines and the empty cell; CloseParen's columnalign (probed)", () => {
    const vertTable = new TableNode({
      value: [tr(td(new SymbolNode({ id: "Paren::Vert" })))],
    });
    expect(toMathml(formula(vertTable))).toBe(
      math('    <mtable columnlines="solid">\n      <mtr></mtr>\n    </mtable>'),
    );
    const aligned = new TableNode({
      value: [tr(td(x()))],
      closeParen: new SymbolNode({ id: "Paren::CloseParen" }),
    });
    expect(toMathml(formula(aligned))).toBe(
      math(
        '    <mrow>\n      <mo></mo>\n      <mtable columnalign="left">\n        <mtr>\n' +
          "          <mtd>\n            <mi>x</mi>\n          </mtd>\n        </mtr>\n" +
          "      </mtable>\n      <mo></mo>\n    </mrow>",
      ),
    );
  });

  it("an empty table value crashes column_lines, as the gem does (probe table-empty-value)", () => {
    expect(() => toMathml(formula(new TableNode({ value: [] })))).toThrow(RenderError);
  });

  it("Matrix with non-round parens reaches the gem's UNDEFINED validate_paren (probed)", () => {
    const matrix = new TableNode({
      name: "Matrix",
      value: [tr(td(x()))],
      openParen: new SymbolNode({ id: "Paren::Lsquare" }),
      closeParen: new SymbolNode({ id: "Paren::Rsquare" }),
    });
    expect(() => toMathml(formula(matrix))).toThrow(RenderError);
  });

  it("a paren whose gem readers are private crashes (probe table-lbbrack)", () => {
    const table = new TableNode({
      value: [tr(td(x()))],
      openParen: new SymbolNode({ id: "Paren::Lbbrack" }),
      closeParen: new SymbolNode({ id: "Paren::Rbbrack" }),
    });
    expect(() => toMathml(formula(table))).toThrow(RenderError);
  });

  it("the asterisk option is dropped from mtable attributes (probed)", () => {
    const table = new TableNode({
      value: [tr(td(x()))],
      options: { asterisk: true, frame: "solid" },
    });
    expect(toMathml(formula(table))).toBe(
      math(
        '    <mtable frame="solid">\n      <mtr>\n        <mtd>\n          <mi>x</mi>\n' +
          "        </mtd>\n      </mtr>\n    </mtable>",
      ),
    );
  });

  it("fenced: number and text parens read their value; a Sin paren crashes (probed)", () => {
    const fenced = new FencedNode({
      parameterOne: new NumberNode({ value: "2" }),
      parameterTwo: [x()],
      parameterThree: new NumberNode({}),
    });
    expect(toMathml(formula(fenced))).toBe(
      math("    <mrow>\n      <mo>2</mo>\n      <mi>x</mi>\n      <mo></mo>\n    </mrow>"),
    );
    const bad = new FencedNode({
      parameterOne: new UnaryFunctionNode({ name: "Sin" }),
      parameterTwo: [x()],
    });
    expect(() => toMathml(formula(bad))).toThrow(RenderError);
  });

  it("fenced paren attributes come from options.open_paren/close_paren (probed)", () => {
    const fenced = new FencedNode({
      parameterOne: new SymbolNode({ id: "Paren::Lround" }),
      parameterTwo: [x()],
      parameterThree: new SymbolNode({ id: "Paren::Rround" }),
      options: {
        // biome-ignore lint/style/useNamingConvention: the gem's own option keys.
        open_paren: { minsize: "2" },
        // biome-ignore lint/style/useNamingConvention: the gem's own option keys.
        close_paren: { maxsize: "2" },
      },
    });
    expect(toMathml(formula(fenced))).toBe(
      math(
        '    <mrow>\n      <mo minsize="2">(</mo>\n      <mi>x</mi>\n' +
          '      <mo maxsize="2">)</mo>\n    </mrow>',
      ),
    );
  });

  it("fontStyle: carrier keyword table, verbatim miss, nil crash (probes fontstyle-carrier-*)", () => {
    expect(toMathml(formula(new FontStyleNode({ parameterOne: x(), parameterTwo: "bb" })))).toBe(
      math('    <mstyle mathvariant="bold">\n      <mi>x</mi>\n    </mstyle>'),
    );
    expect(
      toMathml(formula(new FontStyleNode({ parameterOne: x(), parameterTwo: "zznope" }))),
    ).toBe(math('    <mstyle mathvariant="zznope">\n      <mi>x</mi>\n    </mstyle>'));
    expect(() =>
      toMathml(formula(new FontStyleNode({ parameterOne: x(), parameterTwo: null }))),
    ).toThrow(RenderError);
  });

  it("color: measured first-slot shapes render; a Frac first slot is a named refusal (probed)", () => {
    const red = new FormulaNode({
      value: ["r", "e", "d"].map((letter) => new SymbolNode({ value: letter })),
    });
    expect(toMathml(formula(new ColorNode({ parameterOne: red, parameterTwo: x() })))).toBe(
      math('    <mstyle mathcolor="red">\n      <mi>x</mi>\n    </mstyle>'),
    );
    expect(
      toMathml(
        formula(
          new ColorNode({
            parameterOne: red,
            parameterTwo: x(),
            options: { backgroundcolor: true },
          }),
        ),
      ),
    ).toBe(math('    <mstyle mathbackground="red">\n      <mi>x</mi>\n    </mstyle>'));
    const frac = new ColorNode({
      parameterOne: new FracNode({ parameterOne: x(), parameterTwo: y() }),
      parameterTwo: new SymbolNode({ value: "z" }),
    });
    expect(() => toMathml(formula(frac))).toThrow(RenderError);
  });

  it("color: the attribute value is entity-decoded like every engine write (probe color-entity)", () => {
    // Parse-reachable: quoted text carries literal entity bytes into the
    // first slot — Text#to_asciimath emits them, mathml_options strips the
    // quotes, and the engine wrapper's write decodes them. Oracle bytes:
    // mathcolor="∑" (U+2211, e2 88 91), NOT the raw "&#x2211;".
    expect(toMathml(parseAsciimath('color("&#x2211;")(x)'))).toBe(
      math('    <mstyle mathcolor="∑">\n      <mi>x</mi>\n    </mstyle>'),
    );
    // The strip runs BEFORE the decode, as in the gem (mathml_options gsubs
    // the hash value, update_attrs decodes at write time): a space ENTITY
    // survives the whitespace strip and decodes into a literal space —
    // oracle: mathcolor=" a". Decode-then-strip would emit "a".
    expect(toMathml(parseAsciimath('color("&#x20;a")(x)'))).toBe(
      math('    <mstyle mathcolor=" a">\n      <mi>x</mi>\n    </mstyle>'),
    );
    // The mathbackground key takes the same decoded path (probed hand-built:
    // the gem's parse never sets backgroundcolor, options only carry it).
    expect(
      toMathml(
        formula(
          new ColorNode({
            parameterOne: new FormulaNode({
              value: [new TextNode({ parameterOne: "&#x2211;" })],
            }),
            parameterTwo: x(),
            options: { backgroundcolor: true },
          }),
        ),
      ),
    ).toBe(math('    <mstyle mathbackground="∑">\n      <mi>x</mi>\n    </mstyle>'));
  });

  it("bar attributes: entity decode, nil value, empty skips, junk refusals (probes bar-*)", () => {
    // Hand-built nodes: the class constructor shallow-copies its attributes
    // slot ({...value}), so a string or list can never leave it.
    const withAttrs = (attributes: unknown) =>
      formula({ kind: "bar", parameterOne: x(), attributes } as never);
    expect(toMathml(withAttrs({ accent: "&#x2211;" }))).toBe(
      math('    <mover accent="∑">\n      <mi>x</mi>\n      <mo>&#xaf;</mo>\n    </mover>'),
    );
    expect(toMathml(withAttrs({ accent: null }))).toBe(
      math('    <mover accent="">\n      <mi>x</mi>\n      <mo>&#xaf;</mo>\n    </mover>'),
    );
    const plain = math("    <mover>\n      <mi>x</mi>\n      <mo>&#xaf;</mo>\n    </mover>");
    expect(toMathml(withAttrs(""))).toBe(plain);
    expect(toMathml(withAttrs([]))).toBe(plain);
    expect(() => toMathml(withAttrs("zz"))).toThrow(RenderError);
    expect(() => toMathml(withAttrs(["a", "b"]))).toThrow(RenderError);
  });

  it("a smuggled unitsml attribute is refused by name — the gem post-processes it (probed)", () => {
    const marked = new BarNode({ parameterOne: x(), attributes: { unitsml: "true" } });
    let caught: unknown;
    try {
      toMathml(formula(marked));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).message).toContain('"unitsml"');
  });

  it("powerbase: an underover symbol base flips the tag; a Nary base crashes (probed)", () => {
    const powerBase = (base: MathNode) =>
      new TernaryFunctionNode({
        name: "PowerBase",
        parameterOne: base,
        parameterTwo: y(),
        parameterThree: new SymbolNode({ value: "z" }),
      });
    expect(toMathml(formula(powerBase(new SymbolNode({ id: "Sum" }))))).toBe(
      math(
        "    <munderover>\n      <mo>&#x2211;</mo>\n      <mi>y</mi>\n      <mi>z</mi>\n" +
          "    </munderover>",
      ),
    );
    expect(() => toMathml(formula(powerBase(new NaryNode({ parameterOne: x() }))))).toThrow(
      RenderError,
    );
  });

  it("unmeasured carrier names raise instead of rendering a silent default", () => {
    expect(() =>
      toMathml(formula(new UnaryFunctionNode({ name: "Mbox", parameterOne: x() }))),
    ).toThrow(RenderError);
    expect(() =>
      toMathml(formula(new TableNode({ name: "Nosuch", value: [tr(td(x()))] }))),
    ).toThrow(RenderError);
    expect(() =>
      toMathml(formula(new FontStyleNode({ name: "Nosuch", parameterOne: x() }))),
    ).toThrow(RenderError);
    expect(() =>
      toMathml(formula(new TernaryFunctionNode({ name: "Nosuch", parameterOne: x() }))),
    ).toThrow(RenderError);
  });

  it("Hom is the one admitted name that reaches the <mo> arm of the unary default", () => {
    // Measured on the pinned oracle through a Formula:
    //   Hom.new(Symbol("x")) => <mrow><mo>hom</mo><mi>x</mi></mrow>
    //   Hom.new(nil)         => <mo>hom</mo>
    // `Hom.instance_method(:to_mathml_without_math_tag).owner` is
    // UnaryFunction and `"hom"` is absent from UNARY_CLASSES, so the name
    // element is <mo> and no rspace wrap is added — the spacing option is on
    // by default here and still changes nothing.
    expect(toMathml(formula(new UnaryFunctionNode({ name: "Hom", parameterOne: x() })))).toBe(
      math("    <mrow>\n      <mo>hom</mo>\n      <mi>x</mi>\n    </mrow>"),
    );
    expect(toMathml(formula(new UnaryFunctionNode({ name: "Hom" })))).toBe(
      math("    <mo>hom</mo>"),
    );
  });
});

describe("the boundary (the asciimath renderer's hardening, this format's walk)", () => {
  it("the symbol table's MissingSymbolDataError passes through — the walk's own surface", () => {
    let caught: unknown;
    try {
      toMathml(formula(new SymbolNode({ id: "NoSuchSymbol" })));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MissingSymbolDataError);
    expect((caught as MissingSymbolDataError).code).toBe("MISSING_SYMBOL_DATA");
    expect((caught as MissingSymbolDataError).symbolId).toBe("NoSuchSymbol");
    expect((caught as MissingSymbolDataError).format).toBe("mathml");
  });

  it("a genuine missing-symbol error carries no discoverable mark", () => {
    let genuine: unknown;
    try {
      toMathml(formula(new SymbolNode({ id: "NoSuchSymbol" })));
    } catch (error) {
      genuine = error;
    }
    expect(genuine).toBeInstanceOf(MissingSymbolDataError);
    expect(Object.getOwnPropertySymbols(genuine as object)).toEqual([]);
  });

  it("a getter throwing a forged MissingSymbolDataError mid-render wraps as RenderError", () => {
    let reads = 0;
    const hostile = {
      kind: "number",
      get value(): string {
        reads += 1;
        if (reads > 1) throw new MissingSymbolDataError("Forged", "mathml");
        return "1";
      },
    };
    let caught: unknown;
    try {
      toMathml({ kind: "formula", value: [hostile], leftRightWrapper: true } as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).code).toBe("RENDER_ERROR");
    expect((caught as RenderError).message).toContain("Forged");
  });

  it("a forged object carrying everything stolen off a genuine error wraps as RenderError", () => {
    let genuine: unknown;
    try {
      toMathml(formula(new SymbolNode({ id: "NoSuchSymbol" })));
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
    const hostile = {
      kind: "number",
      get value(): string {
        reads += 1;
        if (reads > 1) throw forged;
        return "1";
      },
    };
    let caught: unknown;
    try {
      toMathml({ kind: "formula", value: [hostile], leftRightWrapper: true } as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).message).toContain("forged missing-symbol pass-through");
  });

  it("a hostile options object surfaces as RenderError, never a raw throw", () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new TypeError("trap");
        },
      },
    );
    let caught: unknown;
    try {
      toMathml(sinX(), hostile as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
  });
});
