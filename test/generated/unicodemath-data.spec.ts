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

import { createHash } from "node:crypto";
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
 * twenty-six constants emitted at that time — including every one added most
 * recently — so it could not do the job it was named for.
 *
 * This one carries no filter: it derives the emitted set from the module, so
 * a new constant fails by name here until it is pinned below. That is why no
 * total is quoted in this paragraph — the count has already grown once since
 * the sentence above was written, and a recited total would rot the same way
 * the exclusion list did.
 */
const MAP_SIZES: ReadonlyArray<readonly [string, ReadonlyMap<string, unknown>, number]> = [
  ["ACCENT_SYMBOLS", RenderTables.UNICODEMATH_ACCENT_SYMBOLS, 21],
  ["CLASS_OF_FAMILY", RenderTables.UNICODEMATH_CLASS_OF_FAMILY, 50],
  ["FONT_OF_CLASS", RenderTables.UNICODEMATH_FONT_OF_CLASS, 14],
  ["HEXCODE_IN_INPUT", RenderTables.UNICODEMATH_HEXCODE_IN_INPUT, 1450],
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
  ["SYMBOLS_WITHOUT_HEXCODE", RenderTables.UNICODEMATH_SYMBOLS_WITHOUT_HEXCODE, 10],
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

/**
 * Canonical serialization for the content digests below.
 *
 * Map keys are sorted so the digest cannot move just because the generator's
 * emission order changed; array order is PRESERVED, because these arrays are
 * committed files whose order is part of the data, and a reordering is a real
 * change the pin should catch. Nested objects sort their keys for the same
 * reason as maps.
 */
function canonical(value: unknown): string {
  if (value instanceof Map) {
    const rows = [...value.entries()].sort(([a], [b]) =>
      String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
    );
    return `Map[${rows.map(([k, v]) => `${JSON.stringify(String(k))}:${canonical(v)}`).join(",")}]`;
  }
  if (value instanceof Set) {
    return `Set[${[...value].map(canonical).sort().join(",")}]`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const rows = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${rows.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function digestOf(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/**
 * A sha256 per emitted constant, over its CONTENT.
 *
 * The size pins above are cardinality-only, and cardinality is a weak test of
 * a table whose whole purpose is to carry exact strings: changing a value in
 * place, or renaming a key while adding another, leaves every count identical
 * and passes them all. Measured, on copies rather than on the module: of eight
 * mutations, the size pins caught four (add, remove, list add, list remove)
 * and missed four (value change, key rename, list rename, and a list entry
 * duplicated to hold the length — that last one only failed because a separate
 * uniqueness check happened to exist).
 *
 * Nothing else in the repository closes this. `payload-validation.spec.ts`
 * hashes each GENERATOR SCRIPT against what the data records, which catches a
 * generator edited without regeneration but not a generated file edited by
 * hand — the script's hash is unchanged either way. Nothing hashes the emitted
 * TypeScript itself, so before this pin a single wrong hexcode among the 1,450
 * was invisible to every gate in the suite.
 *
 * These are regenerated the same way the data is: change the data through the
 * generator, then update these lines from the failure output.
 */
const CONTENT_DIGESTS: ReadonlyArray<readonly [string, string]> = [
  ["UNICODEMATH_ACCENT_SYMBOLS", "b0127716e91a0d84d0e8ef3a5a2af94374f6356c73819c5f2575639d4aaafe7c"],
  ["UNICODEMATH_BINARY_CARRIER_NAMES", "27a4f576b524d1ce380ca79032d7d66135bb1ac936f75f64c6a2ae8c6bc80d1b"],
  ["UNICODEMATH_CLASS_OF_FAMILY", "e8135a43cb60c8d636ffd0cb465fa7d60c6b2e60f170d9f4c1a37d3565e4bfc5"],
  ["UNICODEMATH_DIACRITIC_BELOWS", "04728959f4b1266d6d6698417b11c406c1a0e49edf6d6dda00b4f6da219d1483"],
  ["UNICODEMATH_DIACRITIC_OVERLAYS", "7e775f5541913bc672a89d6f3454f8d27af91611d2ebb9115fdf6842286ffdde"],
  ["UNICODEMATH_FONTS_CLASSES", "a382b21ceb8453b03955c0a5f65a875ded820c7b5d0bca6f4ffe3966a061ec4f"],
  ["UNICODEMATH_FONT_OF_CLASS", "c6b51d905cad71fdd831f7c7e85fee8dd2f02091f4fe7fdcfc42fe163bc20153"],
  ["UNICODEMATH_HEXCODE_IN_INPUT", "f797b536d90a5798af848cc8049af3bfb69b74ddf9c15b604087bdc01a9d6763"],
  ["UNICODEMATH_HORIZONTAL_BRACKETS", "5a9409d50c9d3ed3dc4400e0d9d6bf6ed16e8047ca3dd8b6a134f98eea17505b"],
  ["UNICODEMATH_MATRIXS", "70ffe5433db016877e3509522d60e5fda8d221a14d072179259b5dcdfd6b73aa"],
  ["UNICODEMATH_NIL_PAREN_MATRIX", "76aa34218eb9b491947875491c9a605c775476cba19f38158d62af25c96201df"],
  ["UNICODEMATH_PARENTHESIS_MATRICES", "d47f1e2150a867ec1efbc518cb1c27a9986f81a4fbe1898834bb9d479c8c0ec6"],
  ["UNICODEMATH_PHANTOM_SYMBOLS", "0c3920e75b729c79e4e840d7894f65c1f75cc24a93bb53076c9487c239f8a494"],
  ["UNICODEMATH_SIZE_OVERRIDES", "bb2a74e7fce584199bc6b6de0b33423ea948619c393d066389234e42a497f2b6"],
  ["UNICODEMATH_SUB_ALPHABETS", "19c01a4cc8d2679d4787f1cd8c0c15c4f4320458aca603f316a0501963be635b"],
  ["UNICODEMATH_SUB_DIGITS", "d7905264546ce9aa826ea72bbb02cb49fba5f3e2f8e4f9aced2c7cfd6a371404"],
  ["UNICODEMATH_SUB_OPERATORS", "e5596fbdd09d3be4d52355cb7ed13ea832b67aaae8128e2fc29d85c5f2605841"],
  ["UNICODEMATH_SUB_PARENTHESIS", "00a026f1ec4ce745a8aeed70f5964dd527dbfc60fdaf23d489dcd4c52a4beaa7"],
  ["UNICODEMATH_SUP_ALPHABETS", "99dd42801a4bc94a42798f452573d6d0c6ecc23311f08f120c7bfe2bd132823c"],
  ["UNICODEMATH_SUP_DIGITS", "222bc6f2a390c273948663df6fc04e6604ab8b8a60b94b50bd116787f749733f"],
  ["UNICODEMATH_SUP_OPERATORS", "df045c8fc2190acef52177923db2bc937cdde67993974943e1de5f5fc05b1490"],
  ["UNICODEMATH_SUP_PARENTHESIS", "289b61cf7da5e89f9b742c52c8379b39d63ecc20c0e463c9b7ffa29c0a18832a"],
  ["UNICODEMATH_SYMBOLS_WITHOUT_HEXCODE", "2143907738944ea38fba5bc8eec118cc7f4c3f8ef10e65c25bc35097453a8c6a"],
  ["UNICODEMATH_UNARY_ARG_FUNCTIONS", "f443db0936385c4b268863555bb19645796740aa12732892c3851e85fd313ebc"],
  ["UNICODEMATH_UNARY_CARRIER_NAMES", "4d31bdff16dd792602b6946c26e26020b44b2d729a544c93eadcee5df5f9b67c"],
  ["UNICODEMATH_UNARY_SYMBOLS", "a8df2333f5682187eafe12e4dfa48e67adefe450bcfe4a1bde0f44296c5cf852"],
  ["UNICODEMATH_UNDEF_UNARY_FUNCTIONS", "5244dcf5f08ff97bacbedbc40dd99ade31842241bc014ea26d7838add2418fcf"],
  ["UNICODEMATH_UNICODE_FRACTIONS", "d585a3b6f4fa03b2ac3acf54415fde4bd1badba4d22d7959068b1236135bf22c"],
];

describe("the emitted tables still carry the bytes they carried", () => {
  it("pins a digest for every emitted constant, with none left over", () => {
    // Derived from the module, like the size check above: a constant added to
    // the generator fails here by name until its digest is pinned, and a
    // digest left behind for a constant no longer emitted fails too.
    const pinned = CONTENT_DIGESTS.map(([name]) => name).sort();
    const emitted = Object.keys(RenderTables)
      .filter((k) => k.startsWith("UNICODEMATH_"))
      .sort();
    expect(pinned).toStrictEqual(emitted);
  });

  it.each(CONTENT_DIGESTS.map((row) => [row[0], row] as const))(
    "%s",
    (_label, [name, expected]) => {
      expect(digestOf((RenderTables as Record<string, unknown>)[name])).toBe(expected);
    },
  );

  it("actually notices the mutations the size pins miss", () => {
    // A pin nobody has watched fail is a guess. These run against COPIES; the
    // module is never mutated.
    const source = RenderTables.UNICODEMATH_HEXCODE_IN_INPUT;
    const [firstKey, firstValue] = [...source.entries()][0];
    const before = digestOf(source);

    const changedValue = new Map(source);
    changedValue.set(firstKey, `${firstValue}x`);
    expect(changedValue.size).toBe(source.size);
    expect(digestOf(changedValue)).not.toBe(before);

    const renamedKey = new Map(source);
    renamedKey.delete(firstKey);
    renamedKey.set(`${firstKey}_renamed`, firstValue);
    expect(renamedKey.size).toBe(source.size);
    expect(digestOf(renamedKey)).not.toBe(before);

    // Insertion order alone must NOT move the digest, or every regeneration
    // would churn these lines for no behavioural reason.
    const reordered = new Map([...source.entries()].reverse());
    expect(digestOf(reordered)).toBe(before);

    // A renamed list entry keeps both length and uniqueness, so it slips past
    // every size check; the digest must catch it.
    const list = RenderTables.UNICODEMATH_SYMBOLS_WITHOUT_HEXCODE;
    const renamedEntry = [...list];
    renamedEntry[0] = `${renamedEntry[0]}_renamed`;
    expect(renamedEntry.length).toBe(list.length);
    expect(new Set(renamedEntry).size).toBe(renamedEntry.length);
    expect(digestOf(renamedEntry)).not.toBe(digestOf(list));
  });
});
