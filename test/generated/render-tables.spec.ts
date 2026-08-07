/**
 * The generated AsciiMath render tables.
 *
 * Three constants, fifteen entries — the tables `to_asciimath` reads that the
 * parse tables cannot supply. They are small enough to hand-type, which is
 * exactly why they are generated: a hand-typed copy drifts silently the first
 * time upstream edits one. These assertions pin what the oracle said at
 * generation time, so a regeneration that truncates, reorders or empties a
 * table fails here instead of quietly changing what the renderer emits.
 *
 * The expectations are deliberately literal — a test that derived them from
 * the tables under test would pass against empty tables. They were measured
 * by rendering live gem instances under the oracle's bundle (session probe,
 * 2026-08-06), one render per entry:
 *
 *   FontStyle::Bold.new(Symbols::Symbol.new("x")).to_asciimath(options: {})
 *     # => "mathbf(x)"           (and so on for all fourteen subclasses)
 *   Table.new([row], Symbols::Symbol.new("ᑕ")).to_asciimath(options: {})
 *     # => "ᑕ[x]ᑐ"               (nil close paren, per listed open paren)
 *   Table::Array.new([row]).to_asciimath(options: {})
 *     # => "{:[x]:}"             (per SIMPLE_TABLES name)
 *
 * against plurimath 0.11.6 at 00c52783877b38f6b8e6e109f1803f96bb34fc62. The
 * generator re-runs the same measurement on every regeneration.
 */

import { describe, expect, it } from "vitest";
import { ASCIIMATH_TABLE_PARENTHESIS } from "../../src/generated/asciimath/grammar";
import {
  ASCIIMATH_FONT_STYLE_KEYWORDS,
  ASCIIMATH_SIMPLE_TABLE_NAMES,
  ASCIIMATH_TABLE_CLOSE_FALLBACK,
} from "../../src/generated/asciimath/render-tables";
import { ASCIIMATH_TRANSFORM_FONT_STYLES } from "../../src/generated/asciimath/transform-registry";

describe("the font-style render keywords", () => {
  it("hold exactly the eight measured wrapper keywords, sorted by basename", () => {
    // The six other subclasses (BoldFraktur, BoldItalic, BoldSansSerif,
    // BoldScript, SansSerifBoldItalic, SansSerifItalic) and the bare carrier
    // were measured rendering their value alone, so they carry no entry.
    expect([...ASCIIMATH_FONT_STYLE_KEYWORDS]).toEqual([
      ["Bold", "mathbf"],
      ["DoubleStruck", "mathbb"],
      ["Fraktur", "mathfrak"],
      ["Italic", "ii"],
      ["Monospace", "mathtt"],
      ["Normal", "rm"],
      ["SansSerif", "mathsf"],
      ["Script", "mathcal"],
    ]);
  });

  it("emit keywords that parse back to the class that emitted them", () => {
    // Round-trip closure: every emitted keyword is itself a FONT_STYLES input
    // key, and it resolves to the very subclass whose override emits it — so
    // a rendered font style re-parses to the same class. `bb` and `textbf`
    // also parse to Bold; only `mathbf` comes back out, which is why this
    // table cannot be derived from the parse direction.
    const byInput = new Map(
      ASCIIMATH_TRANSFORM_FONT_STYLES.map((entry) => [entry.name, entry.rubyClass]),
    );
    for (const [basename, keyword] of ASCIIMATH_FONT_STYLE_KEYWORDS) {
      expect(byInput.get(keyword), keyword).toBe(`Math::Function::FontStyle::${basename}`);
    }
  });
});

describe("the table close-paren fallback", () => {
  it("holds exactly what the gem holds, paired and in the gem's order", () => {
    expect([...ASCIIMATH_TABLE_CLOSE_FALLBACK]).toEqual([
      ["ᑕ", "ᑐ"],
      ["ℒ", "ℛ"],
      ["[", "]"],
      ["(", ")"],
    ]);
  });

  it("agrees with the grammar's reading of the same constant", () => {
    // `Asciimath::Constants::TABLE_PARENTHESIS` is read twice: parse-side by
    // `open_table`/`close_table` (grammar.ts) and render-side by the nil-close
    // fallback (this file). Both slices are generated from the one constant,
    // so they must never disagree.
    expect([...ASCIIMATH_TABLE_CLOSE_FALLBACK]).toEqual(
      ASCIIMATH_TABLE_PARENTHESIS.map((pair) => [...pair]),
    );
  });
});

describe("the simple-table names", () => {
  it("hold exactly what the gem holds, in the gem's order", () => {
    expect(ASCIIMATH_SIMPLE_TABLE_NAMES).toEqual(["array", "align", "split"]);
  });

  it("stay lowercased basenames, which is what the render dispatch compares", () => {
    // The gem's guard is `SIMPLE_TABLES.include?(class_name)` with class_name
    // lowercased; `matrix` takes its own identical-output branch and must
    // never migrate into this list silently.
    for (const name of ASCIIMATH_SIMPLE_TABLE_NAMES) {
      expect(name).toMatch(/^[a-z]+$/);
      expect(name).not.toBe("matrix");
    }
  });
});
