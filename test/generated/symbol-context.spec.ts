/**
 * The context-axis exception matrix (ARCHITECTURE.md §5, TODO.plan p1/02).
 *
 * Named `symbol-context` because that is the filter the `symbol-context-matrix`
 * gate runs (`gates.json`, active from P1-completion). It checks the generated
 * matrix itself and, since the renderers landed, drives that matrix through them
 * — the table axis and, since B4, the intent axis, both behaviourally.
 *
 * The matrix is measured, not written: the generator renders every symbol
 * across every axis of the committed manifest and keeps only the ones whose
 * output actually changed. These assertions guard the properties that make
 * that set usable — every named symbol is one a renderer can look up, every
 * axis is one the manifest declares, and every entry records a real
 * difference rather than a same-output "exception".
 */

import { describe, expect, it } from "vitest";
import {
  ASCIIMATH_SYMBOL_EXCEPTIONS,
  type AsciimathSymbolException,
} from "../../src/generated/asciimath/exceptions";
import { ASCIIMATH_SYMBOLS } from "../../src/generated/asciimath/symbols";
import {
  CONTEXT_AXES,
  CONTEXT_DEPENDENT_SYMBOLS,
  DYNAMIC_SYMBOLS,
  HOST_TEMPLATES,
  PROBE_FAILURES,
  PROBE_SUMMARY,
  VALUE_DEPENDENT_SYMBOLS,
} from "../../src/generated/context-axes";
import { LATEX_SYMBOL_EXCEPTIONS } from "../../src/generated/latex/exceptions";
import { LATEX_SYMBOLS } from "../../src/generated/latex/symbols";
import { MATHML_SYMBOL_EXCEPTIONS } from "../../src/generated/mathml/exceptions";
import { MATHML_SYMBOLS } from "../../src/generated/mathml/symbols";
import { UNICODEMATH_SYMBOL_EXCEPTIONS } from "../../src/generated/unicodemath/exceptions";
import { UNICODEMATH_SYMBOLS } from "../../src/generated/unicodemath/symbols";

const AXIS_NAMES = new Set(CONTEXT_AXES.map((axis) => axis.name));

describe("the context-axis exception matrix", () => {
  const textMatrices = [
    ["asciimath", ASCIIMATH_SYMBOL_EXCEPTIONS, ASCIIMATH_SYMBOLS],
    ["latex", LATEX_SYMBOL_EXCEPTIONS, LATEX_SYMBOLS],
    ["unicodemath", UNICODEMATH_SYMBOL_EXCEPTIONS, UNICODEMATH_SYMBOLS],
  ] as const;

  it("only names symbols the matching slice can look up", () => {
    for (const [format, exceptions, slice] of textMatrices) {
      for (const exception of exceptions) {
        expect(slice.has(exception.id), `${format}:${exception.id}`).toBe(true);
      }
    }
    for (const exception of MATHML_SYMBOL_EXCEPTIONS) {
      expect(MATHML_SYMBOLS.has(exception.id), exception.id).toBe(true);
    }
  });

  it("only varies on axes the committed manifest declares", () => {
    const entries: readonly { axes: readonly string[]; whens: readonly object[] }[] = [
      ...[
        ...ASCIIMATH_SYMBOL_EXCEPTIONS,
        ...LATEX_SYMBOL_EXCEPTIONS,
        ...UNICODEMATH_SYMBOL_EXCEPTIONS,
      ].map((exception: AsciimathSymbolException) => ({
        axes: exception.axes,
        whens: exception.variants.map((variant) => variant.when),
      })),
      ...MATHML_SYMBOL_EXCEPTIONS.map((exception) => ({
        axes: exception.axes,
        whens: exception.variants.map((variant) => variant.when),
      })),
    ];

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.axes.length).toBeGreaterThan(0);
      for (const axis of entry.axes) expect(AXIS_NAMES.has(axis), axis).toBe(true);
      for (const when of entry.whens)
        expect(Object.keys(when).sort()).toEqual([...entry.axes].sort());
    }
  });

  it("records a real difference — a variant set with one outcome is not an exception", () => {
    for (const [, exceptions] of textMatrices) {
      for (const exception of exceptions) {
        const values = new Set(exception.variants.map((variant) => variant.value));
        expect(values.size, exception.id).toBeGreaterThan(1);
      }
    }
    for (const exception of MATHML_SYMBOL_EXCEPTIONS) {
      const values = new Set(
        exception.variants.map((variant) =>
          JSON.stringify([variant.tag, variant.text, variant.attributes]),
        ),
      );
      expect(values.size, exception.id).toBeGreaterThan(1);
    }
  });

  it("keeps the intent-sensitive MathML symbols the gem actually has", () => {
    const intentSensitive = MATHML_SYMBOL_EXCEPTIONS.filter((exception) =>
      exception.axes.includes("intent"),
    ).map((exception) => exception.id);
    expect(intentSensitive.sort()).toEqual(["Dd", "Ii", "Intercal", "Jj", "UpcaseDd"]);
  });

  it("keeps Comma's table-context AsciiMath variant", () => {
    const comma = ASCIIMATH_SYMBOL_EXCEPTIONS.find((exception) => exception.id === "Comma");
    expect(comma?.axes).toEqual(["table"]);
    expect(comma?.variants.map((variant) => variant.value).sort()).toEqual(['","', ","]);
  });

  it("leaves LaTeX with no exceptions at all, because nothing varies there", () => {
    expect(LATEX_SYMBOL_EXCEPTIONS).toEqual([]);
  });

  it("is exactly the difference set the probe reported", () => {
    const fromSlices = new Set<string>([
      ...ASCIIMATH_SYMBOL_EXCEPTIONS.map((exception) => exception.id),
      ...LATEX_SYMBOL_EXCEPTIONS.map((exception) => exception.id),
      ...MATHML_SYMBOL_EXCEPTIONS.map((exception) => exception.id),
      ...UNICODEMATH_SYMBOL_EXCEPTIONS.map((exception) => exception.id),
    ]);
    const fromProbe = new Set(CONTEXT_DEPENDENT_SYMBOLS.map((symbol) => symbol.id));
    expect([...fromSlices].sort()).toEqual([...fromProbe].sort());
  });
});

describe("the probe that produced the matrix", () => {
  it("exercised every symbol, in every host template, on every axis", () => {
    expect(PROBE_SUMMARY.symbols).toBe(ASCIIMATH_SYMBOLS.size);
    expect(HOST_TEMPLATES.length).toBeGreaterThan(1);
    expect(PROBE_SUMMARY.hostedRenders).toBe(PROBE_SUMMARY.directRenders * HOST_TEMPLATES.length);
    for (const axis of CONTEXT_AXES) {
      expect(axis.values.length, axis.name).toBeGreaterThan(1);
      expect(axis.formats.length, axis.name).toBeGreaterThan(0);
    }
  });

  it("confirmed the hosted probe found nothing the direct probe missed", () => {
    for (const symbol of CONTEXT_DEPENDENT_SYMBOLS) {
      expect(symbol.probes, symbol.id).toContain("direct");
    }
  });

  it("keeps the generic symbol out of the id-keyed slices, with its axis named", () => {
    for (const symbol of DYNAMIC_SYMBOLS) {
      expect(ASCIIMATH_SYMBOLS.has(symbol.id), symbol.id).toBe(false);
      expect(MATHML_SYMBOLS.has(symbol.id), symbol.id).toBe(false);
      for (const axis of symbol.axes) expect(AXIS_NAMES.has(axis), axis).toBe(true);
    }
    expect(DYNAMIC_SYMBOLS.map((symbol) => symbol.id)).toEqual(["Symbol"]);
    expect(DYNAMIC_SYMBOLS[0]?.axes).toEqual(["rspace"]);
  });

  it("names the symbols that read the node's own value, so a hand-built node is not silently wrong", () => {
    expect(VALUE_DEPENDENT_SYMBOLS.map((symbol) => symbol.id).sort()).toEqual(["Comma", "Plus"]);
    for (const symbol of VALUE_DEPENDENT_SYMBOLS) {
      expect(MATHML_SYMBOLS.has(symbol.id), symbol.id).toBe(true);
    }
  });
});

/**
 * The behavioural half — the matrix's entries as the port's actual output.
 *
 * Everything above checks the generated matrix against itself: that each named
 * symbol is one a slice can look up, each axis one the manifest declares, each
 * entry a real difference. None of it renders anything. This half closes that,
 * for the axes that are reachable, and says plainly which are not.
 *
 * Measured against the pinned oracle (plurimath 0.11.6, 00c52783).
 */

import {
  BinaryFunctionNode,
  FormulaNode,
  RenderError,
  SymbolNode,
  TableNode,
  UnaryFunctionNode,
} from "../../src/core/index";
import { parseAsciimath } from "../../src/formats/asciimath/parser";
import { toAsciimath } from "../../src/formats/asciimath/renderer";
import { toLatex } from "../../src/formats/latex/renderer";
import { toMathml } from "../../src/formats/mathml/renderer";
import { toUnicodemath } from "../../src/formats/unicodemath/renderer";

const comma = () => new SymbolNode({ id: "Comma" });

/** A one-cell table whose cell holds `cell` directly. */
const tableOf = (cell: unknown) =>
  new FormulaNode({
    value: [
      new TableNode({
        value: [
          new UnaryFunctionNode({
            name: "Tr",
            parameterOne: [new BinaryFunctionNode({ name: "Td", parameterOne: [cell] as never })],
          }),
        ] as never,
      }),
    ],
  });

describe("the table axis, behaviourally", () => {
  /**
   * The whole exception, and it is subtler than "inside a table".
   * `Td#td_asciimath_options` (`td.rb:133`) branches on the CELL's class:
   *
   *   when Symbols::Comma  -> options.merge(literal_comma: true)
   *   when Math::Formula   -> options.merge(table: true)
   *   else                 -> options unchanged
   *
   * and `Comma#to_asciimath` (`comma.rb:21`) reads `options[:table]` and
   * nothing else. So a Comma placed DIRECTLY in a cell never sees the axis
   * that governs it, and `literal_comma` — the option the gem sets for exactly
   * that case — is read by nobody. Measured:
   *
   *   Td > Comma            => "[[,]]"
   *   Td > Formula > Comma  => "[[\",\"]]"
   *
   * Same symbol, same table, different wrapper. A test that only built one of
   * these would report the exception as working or as dead, and be wrong
   * either way.
   */
  it("renders a Comma bare when it is the cell itself", () => {
    expect(toAsciimath(tableOf(comma()))).toBe("[[,]]");
  });

  it("renders a Comma quoted when the cell is a formula around it", () => {
    expect(toAsciimath(tableOf(new FormulaNode({ value: [comma()] })))).toBe('[[","]]');
  });

  it("leaves a Comma bare outside any table", () => {
    expect(toAsciimath(new FormulaNode({ value: [comma()] }))).toBe(",");
  });

  it("is asciimath-only, which is why the other matrices are empty", () => {
    // `Comma#to_unicodemath` takes `(**)` — it cannot even receive the axis —
    // and no latex render consults it. Measured: both render "," in a table.
    expect(toUnicodemath(tableOf(new FormulaNode({ value: [comma()] })))).toBe("■(,)");
    expect(toLatex(tableOf(new FormulaNode({ value: [comma()] })))).toContain(",");
    expect(toLatex(tableOf(new FormulaNode({ value: [comma()] })))).not.toContain('","');
  });

  it("exercises the exception by BUILDING the node, never by parsing for it", () => {
    // `","` in AsciiMath source parses as quoted Text, not as a Comma symbol,
    // in the gem and in this port alike. A test written through the parser
    // would pass while exercising the text path and proving nothing about the
    // exception — so this asserts the two are genuinely different objects.
    const parsed = toAsciimath(parseAsciimath('[[a "," b],[c,d]]'));
    expect(parsed).toBe('[[a "," b], [c, d]]');
    // …and the built Comma reaches the same bytes by a different route, which
    // is what makes the parser test useless as coverage for this axis.
    expect(toAsciimath(tableOf(new FormulaNode({ value: [comma()] })))).toBe('[[","]]');
  });
});

describe("the intent axis, behaviourally", () => {
  /**
   * Five of the six MathML exceptions vary only on `intent`, and `toMathml`
   * takes that option since B4 (`src/formats/mathml/renderer.ts`). The matrix's
   * variants are therefore driven through the renderer like the table axis is,
   * instead of being asserted as a refusal: each variant's tag, text and
   * attributes must be exactly what the port emits under the option value the
   * variant names.
   */
  const IntentOnly = ["Dd", "Ii", "Intercal", "Jj", "UpcaseDd"];
  const intentExceptions = MATHML_SYMBOL_EXCEPTIONS.filter(
    (entry) => entry.axes.length === 1 && entry.axes[0] === "intent",
  );

  it("names every exception that varies only on intent", () => {
    expect(intentExceptions.map((entry) => entry.id).sort()).toStrictEqual([...IntentOnly].sort());
  });

  /**
   * Hosted behind a variable rather than bare: a formula that is ONLY
   * `UpcaseDd` raises under intent (the gem defect below), and `y` in front
   * keeps `validate_upcase_dd_derivatives?` from reading a missing second node.
   */
  const hosted = (id: string) =>
    new FormulaNode({ value: [new SymbolNode({ value: "y" }), new SymbolNode({ id })] });

  it.each(
    intentExceptions.flatMap((entry) =>
      entry.variants.map((variant) => [entry.id, variant] as const),
    ),
  )("%s renders the matrix's variant", (id, variant) => {
    const attributes = Object.entries(variant.attributes)
      .map(([name, value]) => ` ${name}="${value}"`)
      .join("");
    const out = toMathml(hosted(id), { intent: variant.when.intent === true });
    expect(out).toContain(`<${variant.tag}${attributes}>${variant.text}</${variant.tag}>`);
  });

  it("reproduces the probes the gem itself raised on (a lone UpcaseDd, formula.rb:649)", () => {
    const failures = PROBE_FAILURES.filter(
      (probe) => probe.format === "mathml" && probe.context.startsWith("intent=true"),
    );
    expect(failures.length).toBeGreaterThan(0);
    for (const probe of failures) {
      expect(probe.id).toBe("UpcaseDd");
      expect(() =>
        toMathml(new FormulaNode({ value: [new SymbolNode({ id: probe.id })] }), { intent: true }),
      ).toThrow(RenderError);
    }
  });

  it("renders the intent:false variant with no intent attribute at all", () => {
    const out = toMathml(new FormulaNode({ value: [new SymbolNode({ id: "Dd" })] }));
    expect(out).toContain("&#x2146;");
    expect(out).not.toContain("intent=");
  });
});
