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
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_DIACRITIC_BELOWS,
  UNICODEMATH_DIACRITIC_OVERLAYS,
  UNICODEMATH_FONTS_CLASSES,
  UNICODEMATH_HORIZONTAL_BRACKETS,
  UNICODEMATH_MATRIXS,
  UNICODEMATH_SIZE_OVERRIDES,
  UNICODEMATH_SUB_ALPHABETS,
  UNICODEMATH_SUB_DIGITS,
  UNICODEMATH_SUB_OPERATORS,
  UNICODEMATH_SUP_ALPHABETS,
  UNICODEMATH_SUP_DIGITS,
  UNICODEMATH_SUP_OPERATORS,
  UNICODEMATH_UNARY_ARG_FUNCTIONS,
  UNICODEMATH_UNARY_SYMBOLS,
  UNICODEMATH_UNDEF_UNARY_FUNCTIONS,
} from "../../src/generated/unicodemath/render-tables";
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
 * Every table's EXACT size, measured against the pinned oracle.
 *
 * This used to assert only that sixteen tables were non-empty, with exact
 * counts on four — so twelve of them could have shrunk to a single entry and
 * still passed, which is the shape of a generator that half-ran. "A shrinking
 * table is visible" was the claim; it was true of four tables and false of the
 * other twelve. A count is the cheapest assertion that actually holds it.
 */
const TABLE_SIZES: ReadonlyArray<readonly [string, ReadonlyMap<string, string>, number]> = [
  ["unary_symbols", UNICODEMATH_UNARY_SYMBOLS, 13],
  ["horizontal_brackets", UNICODEMATH_HORIZONTAL_BRACKETS, 8],
  ["accent_symbols", UNICODEMATH_ACCENT_SYMBOLS, 21],
  ["unary_arg_functions", UNICODEMATH_UNARY_ARG_FUNCTIONS, 7],
  ["size_overrides", UNICODEMATH_SIZE_OVERRIDES, 4],
  ["matrixs", UNICODEMATH_MATRIXS, 8],
  ["sub_alphabets", UNICODEMATH_SUB_ALPHABETS, 17],
  ["sup_alphabets", UNICODEMATH_SUP_ALPHABETS, 25],
  ["sub_digits", UNICODEMATH_SUB_DIGITS, 10],
  ["sup_digits", UNICODEMATH_SUP_DIGITS, 10],
  ["sub_operators", UNICODEMATH_SUB_OPERATORS, 4],
  ["sup_operators", UNICODEMATH_SUP_OPERATORS, 3],
];

const LIST_SIZES: ReadonlyArray<readonly [string, readonly string[], number]> = [
  ["undef_unary_functions", UNICODEMATH_UNDEF_UNARY_FUNCTIONS, 7],
  ["fonts_classes", UNICODEMATH_FONTS_CLASSES, 14],
  ["diacritic_overlays", UNICODEMATH_DIACRITIC_OVERLAYS, 23],
  ["diacritic_belows", UNICODEMATH_DIACRITIC_BELOWS, 52],
];

describe("the unicodemath render tables", () => {
  it.each(TABLE_SIZES)("%s carries exactly its measured rows", (_name, table, size) => {
    expect(table.size).toBe(size);
  });

  it.each(LIST_SIZES)("%s carries exactly its measured entries", (_name, list, size) => {
    expect(list.length).toBe(size);
    // Distinctness matters separately: a list that grew by duplication would
    // satisfy a count alone.
    expect(new Set(list).size).toBe(size);
  });

  it("covers every emitted table, so a new one cannot arrive unpinned", () => {
    // Without this, adding a table to the generator and forgetting to pin it
    // leaves it entirely unchecked while the suite stays green.
    expect(TABLE_SIZES.length + LIST_SIZES.length).toBe(16);
  });

  it("keeps the reverse-lookup tables free of duplicate values", () => {
    // `SIZE_OVERRIDES_SYMBOLS` is read through `.invert`, and Ruby's
    // `Hash#invert` keeps the LAST key for a duplicated value. The generator
    // refuses a duplicate there; this pins that the emitted table is clean, so
    // the port can invert it without having to guess which key won.
    const values = [...UNICODEMATH_SIZE_OVERRIDES.values()];
    expect(new Set(values).size).toBe(values.length);
  });

  it("does not deduplicate a table the gem reads forward", () => {
    // `UNARY_SYMBOLS` legitimately maps two names to one glyph — `underline`
    // and `underbar` are both U+2581 — and is only ever read forward. An
    // earlier version of the generator rejected this, which would have been a
    // false alarm on correct data.
    const values = [...UNICODEMATH_UNARY_SYMBOLS.values()];
    expect(new Set(values).size).toBeLessThan(values.length);
  });
});
