/**
 * The generated UnicodeMath grammar tables
 * (`src/formats/unicodemath/generated/`).
 *
 * `scripts/generate-unicodemath-parser-data.rb` already verifies these against
 * the gem: all 2,689 entries are parsed back through the rule each one builds,
 * the two tables that feed a second "negated" rule are parsed through both, and
 * every decimal marker is checked under its own locale. What that Ruby run
 * cannot do is fail in CI without Ruby, so the invariants a wrong regeneration
 * would break are asserted here too.
 *
 * **The headline is what is NOT here.** The LaTeX tables are emitted as tuples
 * because `Latex::Constants.symbols_constants` merges a Symbol-keyed hash into
 * a String-keyed one, so nineteen texts appear twice and a `Map` keyed by the
 * text would delete one of each pair. `UnicodeMath::Constants` has no hash of
 * that shape — every one of its 42 constants is uniformly Symbol-keyed with
 * String values, and the generator refuses to emit if that ever stops being
 * true (`assert_no_mixed_key_classes!`).
 *
 * A different collapse is live here instead, and it is why these tables are
 * arrays rather than Maps: nine of them repeat a text, because several named
 * symbols share one code point and `Hash#values` does not deduplicate.
 * `RELATIONAL_SYMBOLS.values` is 195 entries over 185 distinct texts. The test
 * below builds the collapsing Map on purpose and measures the loss.
 */

import { describe, expect, it } from "vitest";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_BINARY_SYMBOLS,
  UNICODEMATH_CLOSE_PARENTHESIS,
  UNICODEMATH_CLOSE_SYMBOLS,
  UNICODEMATH_CLOSE_SYMBOLS_KEYS,
  UNICODEMATH_COMBINING_SYMBOLS,
  UNICODEMATH_COMBINING_SYMBOLS_KEYS,
  UNICODEMATH_ENCODED_DECIMAL_MARKERS,
  UNICODEMATH_MATRIXS,
  UNICODEMATH_MATRIXS_KEYS,
  UNICODEMATH_NARY_SYMBOLS,
  UNICODEMATH_NEGATABLE_SYMBOLS,
  UNICODEMATH_OPEN_PARENTHESIS,
  UNICODEMATH_OPEN_SYMBOLS,
  UNICODEMATH_OPEN_SYMBOLS_KEYS,
  UNICODEMATH_ORDINARY_SYMBOLS,
  UNICODEMATH_RELATIONAL_SYMBOLS,
  UNICODEMATH_REPEATED_TEXT_TABLES,
  UNICODEMATH_SIZE_OVERRIDES_SYMBOLS,
  UNICODEMATH_SKIP_SYMBOLS,
  UNICODEMATH_SUB_CLOSE_PARENTHESIS,
  UNICODEMATH_SUB_OPEN_PARENTHESIS,
  UNICODEMATH_SUP_CLOSE_PARENTHESIS,
  UNICODEMATH_SUP_OPEN_PARENTHESIS,
  UNICODEMATH_SUP_OPERATORS,
  UNICODEMATH_UNARY_ARG_FUNCTIONS,
  UNICODEMATH_UNARY_ARG_FUNCTIONS_KEYS,
  UNICODEMATH_UNARY_SYMBOLS,
  UNICODEMATH_UNICODED_FONTS,
  UNICODEMATH_WRAPPER_SYMBOLS,
} from "../../../src/formats/unicodemath/generated/parser-tables";
import { UNICODEMATH_PARSER_GENERATED_PROVENANCE } from "../../../src/formats/unicodemath/generated/provenance";
import {
  DEFAULT_DECIMAL_MARKER,
  decimalMarkerFor,
  SUPPORTED_LOCALES,
} from "../../../src/formatting/index";

/** U+066B ARABIC DECIMAL SEPARATOR, by code point rather than by glyph. */
const ARABIC_DECIMAL_SEPARATOR = String.fromCodePoint(0x066b);

describe("the tables arr_to_expression folds into ordered choices", () => {
  it("carries every table at the size the generator measured", () => {
    // 48 tables in all; the ones whose size is load-bearing below, plus the
    // largest of each family, are pinned here. A regeneration that shortened
    // one of these silently dropped a grammar alternative.
    expect(UNICODEMATH_OPEN_SYMBOLS_KEYS.length).toBe(10);
    expect(UNICODEMATH_OPEN_SYMBOLS.length).toBe(10);
    expect(UNICODEMATH_CLOSE_SYMBOLS_KEYS.length).toBe(10);
    expect(UNICODEMATH_CLOSE_SYMBOLS.length).toBe(10);
    expect(UNICODEMATH_ACCENT_SYMBOLS.length).toBe(21);
    expect(UNICODEMATH_NEGATABLE_SYMBOLS.length).toBe(30);
    expect(UNICODEMATH_SKIP_SYMBOLS.length).toBe(9);
    expect(UNICODEMATH_NARY_SYMBOLS.length).toBe(25);
    expect(UNICODEMATH_UNARY_SYMBOLS.length).toBe(13);
    expect(UNICODEMATH_BINARY_SYMBOLS.length).toBe(47);
    expect(UNICODEMATH_ORDINARY_SYMBOLS.length).toBe(96);
    expect(UNICODEMATH_RELATIONAL_SYMBOLS.length).toBe(195);
    expect(UNICODEMATH_UNARY_ARG_FUNCTIONS.length).toBe(7);
    expect(UNICODEMATH_UNARY_ARG_FUNCTIONS_KEYS.length).toBe(7);
    expect(UNICODEMATH_WRAPPER_SYMBOLS.length).toBe(1492);
  });

  it("keeps the small tables in the gem's declaration order, entry for entry", () => {
    expect(UNICODEMATH_OPEN_PARENTHESIS).toStrictEqual(["[", "(", "{"]);
    expect(UNICODEMATH_CLOSE_PARENTHESIS).toStrictEqual(["]", ")", "}"]);
    expect(UNICODEMATH_SUP_OPERATORS).toStrictEqual(["&#x207a;", "&#x207b;", "&#x207c;"]);
    expect(UNICODEMATH_COMBINING_SYMBOLS_KEYS).toStrictEqual(["!!", "-+", "+-"]);
    expect(UNICODEMATH_COMBINING_SYMBOLS).toStrictEqual(["&#x203c;", "&#x2213;", "&#xb1;"]);
    expect(UNICODEMATH_SIZE_OVERRIDES_SYMBOLS).toStrictEqual(["A", "B", "C", "D"]);
    // `Constants::MATRIXS` — Symbol keys in the gem, projected onto `to_s`,
    // which is what Parslet's `str` does with them.
    expect(UNICODEMATH_MATRIXS_KEYS).toStrictEqual([
      "pmatrix",
      "vmatrix",
      "Vmatrix",
      "bmatrix",
      "Bmatrix",
      "eqarray",
      "matrix",
      "cases",
    ]);
    expect(UNICODEMATH_MATRIXS).toStrictEqual([
      "&#x24a8;",
      "&#x24b1;",
      "&#x24a9;",
      "&#x24e2;",
      "&#x24c8;",
      "&#x2588;",
      "&#x25a0;",
      "&#x24b8;",
    ]);
    // The sub/sup parenthesis tables are one entry each — `arr_to_expression`
    // takes its single-element branch for them, which is still a named atom.
    expect(UNICODEMATH_SUB_OPEN_PARENTHESIS).toStrictEqual(["&#x208d;"]);
    expect(UNICODEMATH_SUB_CLOSE_PARENTHESIS).toStrictEqual(["&#x208e;"]);
    expect(UNICODEMATH_SUP_OPEN_PARENTHESIS).toStrictEqual(["&#x207d;"]);
    expect(UNICODEMATH_SUP_CLOSE_PARENTHESIS).toStrictEqual(["&#x207e;"]);
  });

  /**
   * `Constants::NEGATABLE_SYMBOLS` is a `%w[]` array, and inside `%w[]` a
   * double quote is an ordinary character rather than a delimiter — so 26 of
   * its 30 entries carry literal `"` on both sides and the last four do not.
   * That reads like a mistake and is emitted unchanged anyway, because the
   * generator proved it is the gem's behaviour: every one of these was parsed
   * back through `op_negated`, quotes included, before emission.
   */
  it("carries NEGATABLE_SYMBOLS with the gem's own literal quote characters", () => {
    expect(UNICODEMATH_NEGATABLE_SYMBOLS[0]).toBe('"&#x2292;"');
    expect(UNICODEMATH_NEGATABLE_SYMBOLS.filter((text) => text.startsWith('"')).length).toBe(26);
    expect(UNICODEMATH_NEGATABLE_SYMBOLS.slice(-4)).toStrictEqual(["~", "=", "+", "-"]);
  });
});

describe("the repeated texts that make these arrays rather than Maps", () => {
  it("names exactly the nine tables that repeat a text", () => {
    expect(UNICODEMATH_REPEATED_TEXT_TABLES.map(([name]) => name)).toStrictEqual([
      "UNICODEMATH_OPEN_SYMBOLS",
      "UNICODEMATH_CLOSE_SYMBOLS",
      "UNICODEMATH_ACCENT_SYMBOLS",
      "UNICODEMATH_SKIP_SYMBOLS",
      "UNICODEMATH_NARY_SYMBOLS",
      "UNICODEMATH_UNARY_SYMBOLS",
      "UNICODEMATH_BINARY_SYMBOLS",
      "UNICODEMATH_ORDINARY_SYMBOLS",
      "UNICODEMATH_RELATIONAL_SYMBOLS",
    ]);
  });

  /**
   * The measurement the emitted shape rests on. Keying any of these by the text
   * — a `Map`, a `Set`, an object literal — is not a tidy-up: it deletes
   * alternatives from a Parslet ordered choice.
   */
  it("loses 28 alternatives across nine tables when keyed by text", () => {
    const tables: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["UNICODEMATH_OPEN_SYMBOLS", UNICODEMATH_OPEN_SYMBOLS],
      ["UNICODEMATH_CLOSE_SYMBOLS", UNICODEMATH_CLOSE_SYMBOLS],
      ["UNICODEMATH_ACCENT_SYMBOLS", UNICODEMATH_ACCENT_SYMBOLS],
      ["UNICODEMATH_SKIP_SYMBOLS", UNICODEMATH_SKIP_SYMBOLS],
      ["UNICODEMATH_NARY_SYMBOLS", UNICODEMATH_NARY_SYMBOLS],
      ["UNICODEMATH_UNARY_SYMBOLS", UNICODEMATH_UNARY_SYMBOLS],
      ["UNICODEMATH_BINARY_SYMBOLS", UNICODEMATH_BINARY_SYMBOLS],
      ["UNICODEMATH_ORDINARY_SYMBOLS", UNICODEMATH_ORDINARY_SYMBOLS],
      ["UNICODEMATH_RELATIONAL_SYMBOLS", UNICODEMATH_RELATIONAL_SYMBOLS],
    ];
    let lost = 0;
    for (const [name, texts] of tables) {
      const collapsed = new Map(texts.map((text) => [text, true])).size;
      const recorded = UNICODEMATH_REPEATED_TEXT_TABLES.find(([table]) => table === name);
      expect(recorded).toBeDefined();
      const [, entries, distinct, repeats] = recorded as readonly [string, number, number, number];
      expect(entries).toBe(texts.length);
      expect(distinct).toBe(collapsed);
      expect(repeats).toBe(texts.length - collapsed);
      lost += texts.length - collapsed;
    }
    expect(lost).toBe(28);
    // The worst single case, spelled out so the number has a face.
    expect(UNICODEMATH_RELATIONAL_SYMBOLS.length).toBe(195);
    expect(new Set(UNICODEMATH_RELATIONAL_SYMBOLS).size).toBe(185);
  });

  it("leaves every other table free of repeats", () => {
    const repeating = new Set(UNICODEMATH_REPEATED_TEXT_TABLES.map(([name]) => name));
    for (const [name, texts] of [
      ["UNICODEMATH_OPEN_SYMBOLS_KEYS", UNICODEMATH_OPEN_SYMBOLS_KEYS],
      ["UNICODEMATH_CLOSE_SYMBOLS_KEYS", UNICODEMATH_CLOSE_SYMBOLS_KEYS],
      ["UNICODEMATH_MATRIXS", UNICODEMATH_MATRIXS],
      ["UNICODEMATH_NEGATABLE_SYMBOLS", UNICODEMATH_NEGATABLE_SYMBOLS],
      ["UNICODEMATH_WRAPPER_SYMBOLS", UNICODEMATH_WRAPPER_SYMBOLS],
    ] as ReadonlyArray<readonly [string, readonly string[]]>) {
      expect(repeating.has(name)).toBe(false);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });
});

describe("wrapper symbols, the placeholders the gem cannot spell", () => {
  /**
   * `Constants.wrapper_symbols` greps `Utility.symbols_hash(:unicodemath)` for
   * keys shaped like `"P{name}"` — the literal text
   * `Math::Symbols::Symbol.parsing_wrapper` renders for `lang: :unicode`. They
   * are round-trip placeholders, not UnicodeMath anyone writes, and they are in
   * the grammar only because the gem's own `wrapper_symbols` rule puts them
   * there.
   */
  it("is 1,492 entries, every one of them a P{...} placeholder", () => {
    expect(UNICODEMATH_WRAPPER_SYMBOLS.length).toBe(1492);
    const shape = /^"P\{[^}]+\}"$/;
    expect(UNICODEMATH_WRAPPER_SYMBOLS.every((text) => shape.test(text))).toBe(true);
  });
});

describe("UNICODED_FONTS, whose two branches are different grammars", () => {
  it("keeps the gem's four fonts and their entries", () => {
    expect(UNICODEMATH_UNICODED_FONTS).toStrictEqual([
      ["script", [["H", "&#x210b;"]]],
      ["fraktur", [["H", "&#x210c;"]]],
      ["double", [["H", "&#x210d;"]]],
      [
        "mitBbb",
        [
          ["D", "&#x2145;"],
          ["d", "&#x2146;"],
          ["e", "&#x2147;"],
          ["i", "&#x2148;"],
          ["j", "&#x2149;"],
        ],
      ],
    ]);
  });

  /**
   * `hash_values` branches on the inner hash's size: one entry yields a bare
   * `str(text)` that puts nothing in the tree, more than one yields a named
   * alternation. Three fonts take the first branch and one the second, which
   * the generator measured by parsing rather than reading off the source.
   */
  it("splits three one-entry fonts from the one many-entry font", () => {
    const single = UNICODEMATH_UNICODED_FONTS.filter(([, entries]) => entries.length === 1);
    const many = UNICODEMATH_UNICODED_FONTS.filter(([, entries]) => entries.length > 1);
    expect(single.map(([font]) => font)).toStrictEqual(["script", "fraktur", "double"]);
    expect(many.map(([font]) => font)).toStrictEqual(["mitBbb"]);
  });
});

describe("the encoded decimal markers", () => {
  it("covers every marker src/formatting can resolve", () => {
    expect([...UNICODEMATH_ENCODED_DECIMAL_MARKERS]).toStrictEqual([
      [",", ","],
      [".", "."],
      [ARABIC_DECIMAL_SEPARATOR, "&#x66b;"],
    ]);
    expect(UNICODEMATH_ENCODED_DECIMAL_MARKERS.has(DEFAULT_DECIMAL_MARKER)).toBe(true);
    for (const locale of SUPPORTED_LOCALES) {
      expect(UNICODEMATH_ENCODED_DECIMAL_MARKERS.has(decimalMarkerFor(locale))).toBe(true);
    }
  });

  /**
   * `.` and `,` encode to themselves; U+066B does not, and a grammar matching
   * the raw code point would never fire, because `UnicodeMath::Parser`
   * entity-encodes its input before Parslet sees it.
   */
  it("encodes the one marker that is not its own encoding", () => {
    expect(UNICODEMATH_ENCODED_DECIMAL_MARKERS.get(ARABIC_DECIMAL_SEPARATOR)).toBe("&#x66b;");
    expect(UNICODEMATH_ENCODED_DECIMAL_MARKERS.get(".")).toBe(".");
    expect(UNICODEMATH_ENCODED_DECIMAL_MARKERS.get(",")).toBe(",");
  });
});

describe("provenance", () => {
  it("records a committable run against the pinned oracle", () => {
    expect(UNICODEMATH_PARSER_GENERATED_PROVENANCE.committable).toBe(true);
    expect(UNICODEMATH_PARSER_GENERATED_PROVENANCE.oracleClean).toBe(true);
    expect(UNICODEMATH_PARSER_GENERATED_PROVENANCE.generatorClean).toBe(true);
    expect(UNICODEMATH_PARSER_GENERATED_PROVENANCE.oracle).toBe("plurimath");
    expect(UNICODEMATH_PARSER_GENERATED_PROVENANCE.generator).toBe(
      "scripts/generate-unicodemath-parser-data.rb",
    );
  });

  it("hashes every generator whose bytes can move a table", () => {
    const inputs = [...UNICODEMATH_PARSER_GENERATED_PROVENANCE.generatorInputs].map(
      ([file]) => file,
    );
    expect(inputs).toStrictEqual([
      "scripts/generate-core-data.rb",
      "scripts/generate-corpus.rb",
      "scripts/generate-unicodemath-parser-data.rb",
    ]);
  });
});
