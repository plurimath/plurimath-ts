/**
 * The context-axis exception matrix (ARCHITECTURE.md §5, TODO.plan p1/02).
 *
 * Named `symbol-context` because that is the filter the `symbol-context-matrix`
 * gate runs (`gates.json`, active from P1-completion). Today it checks the
 * generated matrix itself; the renderers add their behavioural half here when
 * they land.
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
  PROBE_SUMMARY,
  VALUE_DEPENDENT_SYMBOLS,
} from "../../src/generated/context-axes";
import { LATEX_SYMBOL_EXCEPTIONS } from "../../src/generated/latex/exceptions";
import { LATEX_SYMBOLS } from "../../src/generated/latex/symbols";
import { MATHML_SYMBOL_EXCEPTIONS } from "../../src/generated/mathml/exceptions";
import { MATHML_SYMBOLS } from "../../src/generated/mathml/symbols";

const AXIS_NAMES = new Set(CONTEXT_AXES.map((axis) => axis.name));

describe("the context-axis exception matrix", () => {
  const textMatrices = [
    ["asciimath", ASCIIMATH_SYMBOL_EXCEPTIONS, ASCIIMATH_SYMBOLS],
    ["latex", LATEX_SYMBOL_EXCEPTIONS, LATEX_SYMBOLS],
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
      ...[...ASCIIMATH_SYMBOL_EXCEPTIONS, ...LATEX_SYMBOL_EXCEPTIONS].map(
        (exception: AsciimathSymbolException) => ({
          axes: exception.axes,
          whens: exception.variants.map((variant) => variant.when),
        }),
      ),
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
    for (const exception of ASCIIMATH_SYMBOL_EXCEPTIONS) {
      const values = new Set(exception.variants.map((variant) => variant.value));
      expect(values.size, exception.id).toBeGreaterThan(1);
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
