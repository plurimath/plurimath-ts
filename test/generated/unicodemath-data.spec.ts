/**
 * The generated UnicodeMath slice.
 *
 * Two generators produce a UnicodeMath value per symbol, for different reasons:
 * `generate-core-data.rb` emits `SYMBOL_CANONICAL_VALUES` so
 * `Symbols::Symbol#==` has a comparison fallback, and `generate-corpus.rb`
 * emits `UNICODEMATH_SYMBOLS` for the renderer.
 *
 * **They are not independent, and this file used to claim they were.**
 * `generate-core-data.rb` requires `generate-corpus.rb` and reuses its symbol
 * discovery and id derivation, and for a concrete symbol
 * `default_value_for_comparison` reaches the same `to_unicodemath` the corpus
 * generator calls directly. So agreement here catches a stale file, a
 * serialization mistake, an exclusion applied on one side only, or the two
 * runs disagreeing — and cannot catch a shared enumeration bug or a wrong
 * answer from the gem itself. Worth having, worth not overstating.
 */

import { describe, expect, it } from "vitest";
import {
  SYMBOL_CANONICAL_VALUES,
  SYMBOLS_WITHOUT_CANONICAL_VALUE,
} from "../../src/core/generated/symbol-canonical";
import { UNICODEMATH_SYMBOL_EXCEPTIONS } from "../../src/generated/unicodemath/exceptions";
import * as RenderTables from "../../src/generated/unicodemath/render-tables";
import { UNICODEMATH_SYMBOLS } from "../../src/generated/unicodemath/symbols";

describe("the unicodemath symbol slice", () => {
  it("covers every symbol, as the other slices do", () => {
    expect(UNICODEMATH_SYMBOLS.size).toBe(1459);
  });

  it("agrees with the canonical values, which a different generator emitted", () => {
    const disagreed: string[] = [];
    const absent: string[] = [];
    for (const [id, value] of UNICODEMATH_SYMBOLS) {
      const canonical = SYMBOL_CANONICAL_VALUES.get(id);
      if (canonical === undefined) absent.push(id);
      else if (canonical !== value) disagreed.push(id);
    }
    expect(disagreed).toStrictEqual([]);
    // Measured: the two slices hold exactly the same 1,459 ids, so nothing is
    // absent at all. `Paren` and `Symbol` are abstract and appear in neither —
    // the canonical generator records them in
    // `SYMBOLS_WITHOUT_CANONICAL_VALUE` rather than emitting a value, and the
    // symbol slice never had them. Asserting that agreement is the point: two
    // generators written for unrelated reasons produced identical id sets.
    expect(absent).toStrictEqual([]);
    expect(UNICODEMATH_SYMBOLS.size).toBe(SYMBOL_CANONICAL_VALUES.size);
    for (const id of SYMBOLS_WITHOUT_CANONICAL_VALUE) {
      expect(UNICODEMATH_SYMBOLS.has(id), id).toBe(false);
    }
  });

  it("has no context-dependent symbols, because none vary on any axis", () => {
    // Measured, and the measurement had to be fixed before this comment was
    // true. `CONTEXT_AXES` scopes each axis to named formats, and `table` and
    // `rspace` originally listed only asciimath, latex and mathml — so
    // `axis_combinations("unicodemath")` returned a single baseline
    // combination and nothing was varied at all. The matrix was empty because
    // nothing was probed, while this file said it was empty because nothing
    // varied. With both axes now applied to unicodemath the matrix is still
    // empty, so the claim is finally backed by the probe it names. (`intent`
    // is not expressible: `to_unicodemath` takes no such argument.)
    expect(UNICODEMATH_SYMBOL_EXCEPTIONS).toStrictEqual([]);
  });
});

/**
 * Every emitted constant's EXACT size, measured against the pinned oracle.
 *
 * Two earlier versions of this were weaker than they read. The first asserted
 * only that sixteen tables were non-empty, so twelve could have shrunk to one
 * entry and passed. The second pinned exact sizes but its "covers every
 * emitted table" check carried an EXCLUSION LIST that skipped ten of the
 * twenty-six emitted constants — including every one added most recently —
 * so it could not do the job it was named for. This one enumerates all
 * twenty-six and derives the emitted set from the module, with no filter.
 */
const MAP_SIZES: ReadonlyArray<readonly [string, ReadonlyMap<string, unknown>, number]> = [
  ["ACCENT_SYMBOLS", RenderTables.UNICODEMATH_ACCENT_SYMBOLS, 21],
  ["CLASS_OF_FAMILY", RenderTables.UNICODEMATH_CLASS_OF_FAMILY, 50],
  ["FONT_OF_CLASS", RenderTables.UNICODEMATH_FONT_OF_CLASS, 14],
  ["HORIZONTAL_BRACKETS", RenderTables.UNICODEMATH_HORIZONTAL_BRACKETS, 8],
  ["MATRIXS", RenderTables.UNICODEMATH_MATRIXS, 8],
  ["PARENTHESIS_MATRICES", RenderTables.UNICODEMATH_PARENTHESIS_MATRICES, 5],
  ["PHANTOM_SYMBOLS", RenderTables.UNICODEMATH_PHANTOM_SYMBOLS, 7],
  ["SIZE_OVERRIDES", RenderTables.UNICODEMATH_SIZE_OVERRIDES, 4],
  ["SUB_ALPHABETS", RenderTables.UNICODEMATH_SUB_ALPHABETS, 17],
  ["SUB_DIGITS", RenderTables.UNICODEMATH_SUB_DIGITS, 10],
  ["SUB_OPERATORS", RenderTables.UNICODEMATH_SUB_OPERATORS, 4],
  ["SUB_PARENTHESIS", RenderTables.UNICODEMATH_SUB_PARENTHESIS, 2],
  ["SUP_ALPHABETS", RenderTables.UNICODEMATH_SUP_ALPHABETS, 25],
  ["SUP_DIGITS", RenderTables.UNICODEMATH_SUP_DIGITS, 10],
  ["SUP_OPERATORS", RenderTables.UNICODEMATH_SUP_OPERATORS, 3],
  ["SUP_PARENTHESIS", RenderTables.UNICODEMATH_SUP_PARENTHESIS, 2],
  ["UNARY_ARG_FUNCTIONS", RenderTables.UNICODEMATH_UNARY_ARG_FUNCTIONS, 7],
  ["UNARY_SYMBOLS", RenderTables.UNICODEMATH_UNARY_SYMBOLS, 13],
  ["UNICODE_FRACTIONS", RenderTables.UNICODEMATH_UNICODE_FRACTIONS, 18],
];

const LIST_SIZES: ReadonlyArray<readonly [string, readonly string[], number]> = [
  ["BINARY_CARRIER_NAMES", RenderTables.UNICODEMATH_BINARY_CARRIER_NAMES, 4],
  ["DIACRITIC_BELOWS", RenderTables.UNICODEMATH_DIACRITIC_BELOWS, 52],
  ["DIACRITIC_OVERLAYS", RenderTables.UNICODEMATH_DIACRITIC_OVERLAYS, 23],
  ["FONTS_CLASSES", RenderTables.UNICODEMATH_FONTS_CLASSES, 14],
  ["UNARY_CARRIER_NAMES", RenderTables.UNICODEMATH_UNARY_CARRIER_NAMES, 34],
  ["UNDEF_UNARY_FUNCTIONS", RenderTables.UNICODEMATH_UNDEF_UNARY_FUNCTIONS, 7],
];

/** The one emitted scalar: `PARENTHESIS_MATRICES.key(nil)`, read with Ruby's own `Hash#key`. */
const SCALARS: ReadonlyArray<readonly [string, string, string]> = [
  ["NIL_PAREN_MATRIX", RenderTables.UNICODEMATH_NIL_PAREN_MATRIX, "eqarray"],
];

describe("the unicodemath render tables", () => {
  it.each(MAP_SIZES)("%s carries exactly its measured rows", (_name, table, size) => {
    expect(table.size).toBe(size);
  });

  it.each(LIST_SIZES)("%s carries exactly its measured entries", (_name, list, size) => {
    expect(list.length).toBe(size);
    // Distinctness separately: a list that grew by duplication satisfies a count.
    expect(new Set(list).size).toBe(size);
  });

  it.each(SCALARS)("%s holds its measured value", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("pins every emitted constant, with no exclusions", () => {
    // DERIVED from the module and compared as a SET. No filter: an exclusion
    // list is what let the previous version skip ten constants while claiming
    // to cover them all. A new constant fails here by name until it is pinned.
    const pinned = new Set([
      ...MAP_SIZES.map(([n]) => n),
      ...LIST_SIZES.map(([n]) => n),
      ...SCALARS.map(([n]) => n),
    ]);
    const emitted = new Set(
      Object.keys(RenderTables)
        .filter((k) => k.startsWith("UNICODEMATH_"))
        .map((k) => k.slice("UNICODEMATH_".length)),
    );
    expect([...pinned].sort()).toStrictEqual([...emitted].sort());
  });

  it("keeps the reverse-lookup tables free of duplicate values", () => {
    // `SIZE_OVERRIDES_SYMBOLS` is read through `.invert`, and Ruby's
    // `Hash#invert` keeps the LAST key for a duplicated value. The generator
    // refuses a duplicate there; this pins that the emitted table is clean, so
    // the port can invert it without having to guess which key won.
    const values = [...RenderTables.UNICODEMATH_SIZE_OVERRIDES.values()];
    expect(new Set(values).size).toBe(values.length);
  });

  it("does not deduplicate a table the gem reads forward", () => {
    // `UNARY_SYMBOLS` legitimately maps two names to one glyph — `underline`
    // and `underbar` are both U+2581 — and is only ever read forward. An
    // earlier version of the generator rejected this, which would have been a
    // false alarm on correct data.
    const values = [...RenderTables.UNICODEMATH_UNARY_SYMBOLS.values()];
    expect(new Set(values).size).toBeLessThan(values.length);
  });
});
