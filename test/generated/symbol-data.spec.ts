/**
 * Generated symbol-data conformance (ARCHITECTURE.md §5, TODO.plan p1/02).
 *
 * These assertions do not re-derive what the gem says — the generator already
 * checked that against the oracle, and would have failed rather than emitted.
 * They check the *shape* of what it emitted: that the four slices agree with
 * each other, that every input resolves to an id a renderer can look up, and
 * that the ordered literal list is still ordered. A regeneration that quietly
 * drops half a table fails here.
 *
 * The exception matrix has its own file, `symbol-context.spec.ts`, because
 * that is the filter the `symbol-context-matrix` gate runs.
 */

import { describe, expect, it } from "vitest";
import {
  ASCIIMATH_INPUT_COLLISIONS,
  ASCIIMATH_LITERALS,
  ASCIIMATH_PAREN_INPUTS,
  ASCIIMATH_SKIP_INPUT_PARENS,
  ASCIIMATH_SYMBOL_INPUT,
} from "../../src/generated/asciimath/input";
import { ASCIIMATH_SYMBOLS } from "../../src/generated/asciimath/symbols";
import { LATEX_SYMBOLS } from "../../src/generated/latex/symbols";
import { MATHML_SYMBOLS } from "../../src/generated/mathml/symbols";
import { GENERATED_PROVENANCE } from "../../src/generated/provenance";
import { UNICODEMATH_SYMBOLS } from "../../src/generated/unicodemath/symbols";

/** Every slice keyed by format, so the cross-slice checks stay symmetric. */
const SLICES = {
  asciimath: ASCIIMATH_SYMBOLS,
  latex: LATEX_SYMBOLS,
  mathml: MATHML_SYMBOLS,
  unicodemath: UNICODEMATH_SYMBOLS,
} as const;

describe("generated symbol slices", () => {
  it("carry the whole symbol hierarchy, not a sample of it", () => {
    for (const [format, slice] of Object.entries(SLICES)) {
      expect(slice.size, format).toBeGreaterThan(1400);
    }
  });

  it("agree on which symbol ids exist", () => {
    const asciimath = [...ASCIIMATH_SYMBOLS.keys()].sort();
    expect([...LATEX_SYMBOLS.keys()].sort()).toEqual(asciimath);
    expect([...MATHML_SYMBOLS.keys()].sort()).toEqual(asciimath);
    expect([...UNICODEMATH_SYMBOLS.keys()].sort()).toEqual(asciimath);
  });

  it("use the Ruby class key as the symbol id", () => {
    expect(ASCIIMATH_SYMBOLS.get("Sigma")).toBe("sigma");
    expect(LATEX_SYMBOLS.get("Sigma")).toBe("\\sigma");
    expect(MATHML_SYMBOLS.get("Sigma")).toEqual({ tag: "mi", text: "&#x3c3;" });

    expect(ASCIIMATH_SYMBOLS.get("Paren::Lround")).toBe("(");
    expect(MATHML_SYMBOLS.get("Paren::Lround")).toEqual({ tag: "mo", text: "(" });
  });

  it("reproduce what the corpus records for the symbols it covers", () => {
    // submodules/plurimath-testsuite/corpus/asciimath/symbols.yaml,
    // case `symbol-infinity`.
    expect(ASCIIMATH_SYMBOLS.get("Oo")).toBe("oo");
    expect(LATEX_SYMBOLS.get("Oo")).toBe("\\infty");
    expect(MATHML_SYMBOLS.get("Oo")).toEqual({ tag: "mo", text: "&#x221e;" });
  });

  it("hold a static MathML representation, never assembled output", () => {
    for (const [id, descriptor] of MATHML_SYMBOLS) {
      expect(["mi", "mo"], id).toContain(descriptor.tag);
      expect(descriptor.text.length, id).toBeGreaterThan(0);
    }
  });

  it("never emit an empty representation for a text format", () => {
    for (const [id, value] of ASCIIMATH_SYMBOLS) expect(value.length, id).toBeGreaterThan(0);
    for (const [id, value] of LATEX_SYMBOLS) expect(value.length, id).toBeGreaterThan(0);
    for (const [id, value] of UNICODEMATH_SYMBOLS) expect(value.length, id).toBeGreaterThan(0);
  });
});

describe("asciimath input tables", () => {
  it("resolve every input to a symbol id the slices carry", () => {
    for (const [input, id] of ASCIIMATH_SYMBOL_INPUT) {
      expect(ASCIIMATH_SYMBOLS.has(id), `${input} -> ${id}`).toBe(true);
    }
  });

  it("stay longest-first, which is what makes the ordered choice correct", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const literal of ASCIIMATH_LITERALS.keys()) {
      expect(literal.length).toBeLessThanOrEqual(previous);
      previous = literal.length;
    }
  });

  it("keep the structurally matched parens out of the literal list", () => {
    for (const paren of ASCIIMATH_SKIP_INPUT_PARENS) {
      expect(ASCIIMATH_LITERALS.has(paren), paren).toBe(false);
    }
  });

  it("mark paren inputs, and let the paren table win every collision", () => {
    for (const input of ASCIIMATH_PAREN_INPUTS) {
      expect(ASCIIMATH_SYMBOL_INPUT.get(input)?.startsWith("Paren::"), input).toBe(true);
    }
    for (const [input, symbolId, parenId] of ASCIIMATH_INPUT_COLLISIONS) {
      expect(symbolId).not.toBe(parenId);
      expect(ASCIIMATH_SYMBOL_INPUT.get(input), input).toBe(parenId);
    }
  });

  it("cover the symbols the AsciiMath grammar dispatches on", () => {
    expect(ASCIIMATH_SYMBOL_INPUT.get("sigma")).toBe("Sigma");
    expect(ASCIIMATH_SYMBOL_INPUT.get("(")).toBe("Paren::Lround");
    expect(ASCIIMATH_LITERALS.get("sqrt")).toBe("unary_class");
    expect(ASCIIMATH_LITERALS.get("sigma")).toBe("symbol");
    expect(ASCIIMATH_LITERALS.get("bb")).toBe("fonts");
    expect(ASCIIMATH_LITERALS.get("ZZ")).toBe("special_fonts");
  });
});

describe("generated provenance", () => {
  it("names the oracle the slices came from", () => {
    expect(GENERATED_PROVENANCE.oracle).toBe("plurimath");
    expect(GENERATED_PROVENANCE.oracleCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(GENERATED_PROVENANCE.generatorSha256).toMatch(/^[0-9a-f]{64}$/);
    // Ox is the canonical engine; Oga is a parity check only (§7).
    expect(GENERATED_PROVENANCE.xmlEngine).toContain("Ox");
  });

  it("was generated from clean checkouts, so the slices may be committed", () => {
    // §7: `--allow-dirty` output is non-committable and CI rejects it. Asserting
    // the flags' shape without asserting their value let exactly that state
    // reach a commit. The same assertion guards `src/core/generated`.
    expect(GENERATED_PROVENANCE.oracleClean).toBe(true);
    expect(GENERATED_PROVENANCE.generatorClean).toBe(true);
    expect(GENERATED_PROVENANCE.committable).toBe(true);
  });
});
