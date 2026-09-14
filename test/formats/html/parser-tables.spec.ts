/**
 * The generated HTML grammar tables (`src/formats/html/generated/`).
 *
 * `scripts/generate-html-parser-data.rb` already verifies these against the
 * gem: all 39 entries are parsed back through the rule each one builds and the
 * resulting tree checked to be a single node under the expected tag, the entity
 * alternation's `repeat(1)` is measured against LaTeX's and UnicodeMath's
 * `repeat`, and every decimal marker is checked under its own locale and under
 * the others. What that Ruby run cannot do is fail in CI without Ruby, so the
 * invariants a wrong regeneration would break are asserted here too.
 *
 * **The headline is that neither earlier collision applies, and that this is a
 * measurement rather than an assumption.**
 *
 * The LaTeX tables are tuples because `Latex::Constants.symbols_constants`
 * merges a Symbol-keyed hash into a String-keyed one, so nineteen texts appear
 * twice and a `Map` keyed by the text deletes one of each pair. The UnicodeMath
 * tables are arrays because nine of them repeat a text — named symbols sharing
 * a code point — so keying them by text deletes 28 alternatives.
 * `Html::Constants` has neither shape: its two hashes are uniformly
 * Symbol-keyed, and none of the four projections the grammar reads repeats a
 * text.
 *
 * What it does have is the UnicodeMath shape one projection away.
 * `SUB_SUP_CLASSES.values` is eight entries over four distinct texts — `prod`
 * three times, `sum` three times, `log` and `lim` once each — because three
 * spellings of the product sign and three of the summation sign map onto one
 * class name apiece. The grammar never reads it — `html/utility.rb:12` does, on
 * the transform side — and `HTML_REPEATED_TEXT_PROJECTIONS` records it so the
 * array-not-Map decision carries its own evidence rather than an assertion that
 * nothing here could ever collapse.
 */

import { describe, expect, it } from "vitest";
import {
  HTML_LPAREN,
  HTML_RAW_DECIMAL_MARKERS,
  HTML_REPEATED_TEXT_PROJECTIONS,
  HTML_RPAREN,
  HTML_SUB_SUP_CLASSES,
  HTML_UNARY_CLASSES,
} from "../../../src/formats/html/generated/parser-tables";
import { HTML_PARSER_GENERATED_PROVENANCE } from "../../../src/formats/html/generated/provenance";
import {
  DEFAULT_DECIMAL_MARKER,
  decimalMarkerFor,
  SUPPORTED_LOCALES,
} from "../../../src/formatting/index";

/** U+066B ARABIC DECIMAL SEPARATOR, by code point rather than by glyph. */
const ARABIC_DECIMAL_SEPARATOR = String.fromCodePoint(0x066b);

/** Every emitted table, by the name the generator gives it. */
const EMITTED: ReadonlyArray<readonly [name: string, texts: readonly string[]]> = [
  ["HTML_UNARY_CLASSES", HTML_UNARY_CLASSES],
  ["HTML_LPAREN", HTML_LPAREN],
  ["HTML_RPAREN", HTML_RPAREN],
  ["HTML_SUB_SUP_CLASSES", HTML_SUB_SUP_CLASSES],
];

describe("the tables array_to_expression folds into ordered choices", () => {
  it("carries each table at the size the generator measured", () => {
    expect(HTML_UNARY_CLASSES.length).toBe(25);
    expect(HTML_LPAREN.length).toBe(3);
    expect(HTML_RPAREN.length).toBe(3);
    expect(HTML_SUB_SUP_CLASSES.length).toBe(8);
  });

  it("keeps the gem's declaration order, entry for entry", () => {
    expect(HTML_LPAREN).toStrictEqual(["(", "{", "["]);
    expect(HTML_RPAREN).toStrictEqual([")", "}", "]"]);
    // `Constants::SUB_SUP_CLASSES` — Symbol keys in the gem, projected onto
    // `to_s`, which is what Parslet's `str` does with them. Six of the eight
    // reach Parslet as typed; only `&prod;` and `&sum;` are rewritten by
    // `normalized_text`, into the hex forms two entries below them. All eight
    // are live alternatives of the rule itself, whose input is the normalised
    // text.
    expect(HTML_SUB_SUP_CLASSES).toStrictEqual([
      "&prod;",
      "&sum;",
      "&#x220f;",
      "&#x2211;",
      "log",
      "lim",
      "∏",
      "∑",
    ]);
    expect(HTML_UNARY_CLASSES.slice(0, 4)).toStrictEqual(["arcsin", "arccos", "arctan", "coth"]);
    expect(HTML_UNARY_CLASSES.slice(-2)).toStrictEqual(["ln", "lg"]);
  });

  /**
   * Order is behaviour, and this is the one way it can be wrong.
   *
   * `array_to_expression` (`html/parse.rb:133`) folds each table into a Parslet
   * ordered choice, which has no longest-match backtracking: an entry that is a
   * proper prefix of a LATER entry matches first and makes the later one
   * unreachable. `UNARY_CLASSES` is written longest-first by hand for exactly
   * that reason.
   *
   * The pairs are derived here rather than named, so a table that grew a
   * seventh pair is covered by the same test.
   */
  it("puts every prefix pair longest-first, in every table", () => {
    const pairs: Array<readonly [string, string]> = [];
    for (const [name, texts] of EMITTED) {
      for (let i = 0; i < texts.length; i += 1) {
        for (let j = i + 1; j < texts.length; j += 1) {
          const earlier = texts[i] as string;
          const later = texts[j] as string;
          expect(
            later.startsWith(earlier),
            `${name}: ${JSON.stringify(earlier)} shadows ${JSON.stringify(later)}`,
          ).toBe(false);
          if (earlier.startsWith(later)) pairs.push([later, earlier]);
        }
      }
    }
    // The six that exist today, so a table that lost one is a failure too.
    expect(pairs).toStrictEqual([
      ["cot", "coth"],
      ["tan", "tanh"],
      ["sec", "sech"],
      ["csc", "csch"],
      ["sin", "sinh"],
      ["cos", "cosh"],
    ]);
  });
});

describe("the collision that is not here, and the one that is one projection away", () => {
  it("has no repeated text in any table the grammar reads", () => {
    for (const [name, texts] of EMITTED) {
      // Building the collapsing Map on purpose, which is what a `Map` or a
      // `Set` keyed by the text would be. Here it loses nothing; in the
      // UnicodeMath tables the same construction loses 28 alternatives.
      expect(new Map(texts.map((text) => [text, true])).size, name).toBe(texts.length);
    }
  });

  it("never names an emitted table among the repeated projections", () => {
    const emittedNames = new Set(EMITTED.map(([name]) => name));
    for (const [projection] of HTML_REPEATED_TEXT_PROJECTIONS) {
      expect(emittedNames.has(projection)).toBe(false);
    }
  });

  /**
   * `SUB_SUP_CLASSES.values` measured, because "no collision here" is only
   * interesting next to the collision that would have happened.
   *
   * The grammar reads `.keys`, which is eight distinct entity and character
   * spellings. `.values` is the same eight positions mapped onto `:prod` and
   * `:sum`, so a table built from it would be four entries long — which is
   * precisely how UnicodeMath lost 28 alternatives before its generator started
   * emitting arrays.
   */
  it("records SUB_SUP_CLASSES.values as eight entries over four distinct texts", () => {
    expect(HTML_REPEATED_TEXT_PROJECTIONS).toStrictEqual([
      [
        "SUB_SUP_CLASSES.values",
        8,
        4,
        4,
        "html/utility.rb:12 (`Utility.sub_sup_method?`), transform side",
      ],
    ]);
    // The two halves of the same hash: as many values as keys, and half as
    // many distinct values (`prod`, `sum`, `log`, `lim`) as distinct keys.
    expect(HTML_SUB_SUP_CLASSES.length).toBe(8);
    expect(new Set(HTML_SUB_SUP_CLASSES).size).toBe(8);
  });
});

describe("the decimal markers, which HTML matches raw", () => {
  /**
   * The claim `createHtmlGrammar` rests on. LaTeX and UnicodeMath both emit a
   * marker -> encoded-marker Map, because their parsers entity-encode the whole
   * input before Parslet sees it. `Html::Parser` encodes only substrings that
   * already look like entities, so there is nothing to translate and the
   * grammar matches `str(marker)` directly.
   */
  it("covers every marker the locale table can resolve to", () => {
    const resolvable = new Set([
      DEFAULT_DECIMAL_MARKER,
      ...SUPPORTED_LOCALES.map((locale) => decimalMarkerFor(locale)),
    ]);
    expect([...resolvable].sort()).toStrictEqual([...HTML_RAW_DECIMAL_MARKERS].sort());
  });

  it("is the three markers the gem supports, sorted", () => {
    expect(HTML_RAW_DECIMAL_MARKERS).toStrictEqual([",", ".", ARABIC_DECIMAL_SEPARATOR]);
    expect(HTML_RAW_DECIMAL_MARKERS).toContain(DEFAULT_DECIMAL_MARKER);
  });

  /**
   * Raw means raw: not one of these is an entity. The `ar` marker is the one
   * that would break a copied-from-LaTeX port, because there the grammar
   * matches the seven characters `&#x66b;` instead.
   */
  it("holds no entity-encoded marker", () => {
    for (const marker of HTML_RAW_DECIMAL_MARKERS) {
      expect(marker.length).toBe(1);
      expect(marker.startsWith("&")).toBe(false);
    }
    expect(ARABIC_DECIMAL_SEPARATOR.codePointAt(0)).toBe(0x066b);
  });
});

describe("provenance", () => {
  it("records the oracle these tables were measured from", () => {
    expect(HTML_PARSER_GENERATED_PROVENANCE.generator).toBe("scripts/generate-html-parser-data.rb");
    expect(HTML_PARSER_GENERATED_PROVENANCE.oracle).toBe("plurimath");
    expect(HTML_PARSER_GENERATED_PROVENANCE.oracleClean).toBe(true);
    expect(HTML_PARSER_GENERATED_PROVENANCE.generatorClean).toBe(true);
    expect(HTML_PARSER_GENERATED_PROVENANCE.committable).toBe(true);
  });

  it("hashes every generator whose bytes can move a table", () => {
    expect([...HTML_PARSER_GENERATED_PROVENANCE.generatorInputs.keys()]).toStrictEqual([
      "scripts/generate-core-data.rb",
      "scripts/generate-corpus.rb",
      "scripts/generate-html-parser-data.rb",
    ]);
  });
});
