/**
 * The generated LaTeX grammar tables (`src/formats/latex/generated/`).
 *
 * `scripts/generate-latex-parser-data.rb` already verifies these against the
 * gem — every literal is parsed back through the rule it builds, every symbol
 * kind through `dynamic_rules`, every collision in both spellings, every
 * decimal marker under its own locale. What that Ruby run cannot do is fail in
 * CI without Ruby, so the invariants a wrong regeneration would break are
 * asserted here too.
 *
 * The headline is the **collision**. `Constants.symbols_constants` is
 * `SYMBOLS.merge(symbols_hash)` — a Symbol-keyed table merged into a
 * String-keyed one — so nineteen texts are present twice, once as `:operant`
 * and once as `:symbols`, and `dynamic_rules` (`latex/parse.rb:221`) gives the
 * two different grammars. `:operant` matches the bare text *or* the
 * backslashed one; `:symbols` matches only the backslashed one. A JavaScript
 * `Map` keyed by the text keeps one of each pair and silently deletes the
 * other, so the emitted shape is an ordered tuple array. The test below builds
 * that Map on purpose and measures the loss.
 *
 * Order is behaviour everywhere else: `arr_to_expression` and
 * `hash_to_expression` fold every table into a Parslet ordered choice with no
 * longest-match backtracking, so a table that lost its descending-length order
 * would let a short token shadow a longer one — `\lim` over `\liminf`.
 */

import { describe, expect, it } from "vitest";
import {
  LATEX_ENCODED_DECIMAL_MARKERS,
  LATEX_ENVIRONMENTS,
  LATEX_LEFT_RIGHT_PARENS,
  LATEX_LPAREN,
  LATEX_MATH_OPERATORS,
  LATEX_NUMERIC_VALUES,
  LATEX_RPAREN,
  LATEX_SYMBOL_CONSTANT_COLLISIONS,
  LATEX_SYMBOL_CONSTANTS,
  LATEX_UNDEROVER_CLASSES,
} from "../../../src/formats/latex/generated/parser-tables";
import { LATEX_PARSER_GENERATED_PROVENANCE } from "../../../src/formats/latex/generated/provenance";
import {
  DEFAULT_DECIMAL_MARKER,
  decimalMarkerFor,
  SUPPORTED_LOCALES,
} from "../../../src/formatting/index";

/** U+066B ARABIC DECIMAL SEPARATOR, by code point rather than by glyph. */
const ARABIC_DECIMAL_SEPARATOR = String.fromCodePoint(0x066b);

function nonIncreasingByLength(texts: readonly string[]): boolean {
  return texts.every(
    (text, index) => index === 0 || (texts[index - 1] as string).length >= text.length,
  );
}

describe("the tables arr_to_expression folds into ordered choices", () => {
  it("carries the gem's seven literal tables at the sizes it measured", () => {
    expect(LATEX_NUMERIC_VALUES.length).toBe(10);
    expect(LATEX_UNDEROVER_CLASSES.length).toBe(3);
    expect(LATEX_MATH_OPERATORS.length).toBe(29);
    expect(LATEX_LPAREN.length).toBe(40);
    expect(LATEX_RPAREN.length).toBe(149);
    expect(LATEX_LEFT_RIGHT_PARENS.length).toBe(24);
    expect(LATEX_ENVIRONMENTS.length).toBe(10);
  });

  it("keeps the small tables in the gem's declaration order, entry for entry", () => {
    expect(LATEX_NUMERIC_VALUES).toStrictEqual([
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
    ]);
    expect(LATEX_UNDEROVER_CLASSES).toStrictEqual(["bmod", "pmod", "mod"]);
    // `Constants::MATRICES.keys` — Symbols in the gem, projected onto their
    // `to_s`, which is what `str` does with them.
    expect(LATEX_ENVIRONMENTS).toStrictEqual([
      "multline",
      "Vmatrix",
      "vmatrix",
      "pmatrix",
      "Bmatrix",
      "bmatrix",
      "matrix",
      "split",
      "align",
      "array",
    ]);
    // Both `left_parens` (`:58`) and `right_parens` (`:62`) are built from
    // this one array. Not a copy-paste slip: the hash maps delimiter token ->
    // HTML entity, so `\lfloor` and `\rfloor` are both keys.
    expect(LATEX_LEFT_RIGHT_PARENS).toStrictEqual([
      "\\backslash",
      "\\langle",
      "\\rangle",
      "\\lfloor",
      "\\rfloor",
      "\\lceil",
      "\\rceil",
      "\\lbrace",
      "\\rbrace",
      "\\lbrack",
      "\\rbrack",
      "\\Vert",
      "\\vert",
      "\\|",
      "\\}",
      "\\{",
      "(",
      ")",
      "<",
      ">",
      "/",
      "|",
      "[",
      "]",
    ]);
  });

  it("keeps MATH_OPERATORS longest-first, which is what stops `ln` shadowing `liminf`", () => {
    expect(nonIncreasingByLength(LATEX_MATH_OPERATORS)).toBe(true);
    expect(LATEX_MATH_OPERATORS[0]).toBe("liminf");
    expect(LATEX_MATH_OPERATORS.at(-1)).toBe("lg");
    expect(LATEX_MATH_OPERATORS.indexOf("liminf")).toBeLessThan(LATEX_MATH_OPERATORS.indexOf("ln"));
  });

  it("keeps the opening delimiters longest-first, from reverse_sort_hash", () => {
    expect(nonIncreasingByLength(LATEX_LPAREN)).toBe(true);
    expect(LATEX_LPAREN[0]).toBe("\\text{P[lceiling]}");
    expect(LATEX_LPAREN.slice(-5)).toStrictEqual(["\\{", "\\[", "\\(", "(", "["]);
  });

  it("carries the closing delimiters as the gem flattens them, repeats and all", () => {
    // `Constants.parenthesis.values.flatten` — several opening delimiters
    // share one closing list, and the gem does not deduplicate. The repeats
    // are dead alternatives there too; they are kept so the two tables match.
    expect(new Set(LATEX_RPAREN).size).toBe(26);
    expect(LATEX_RPAREN[0]).toBe("\\rceil");
    expect(LATEX_RPAREN.at(-1)).toBe("]");
  });
});

describe("the symbol alternation hash_to_expression folds", () => {
  it("carries every entry the gem's table holds", () => {
    expect(LATEX_SYMBOL_CONSTANTS.length).toBe(3327);
  });

  it("is ordered by descending text length, so a longer token always wins", () => {
    expect(nonIncreasingByLength(LATEX_SYMBOL_CONSTANTS.map(([text]) => text))).toBe(true);
  });

  it("uses exactly the nine kinds dynamic_rules branches on", () => {
    const kinds = [...new Set(LATEX_SYMBOL_CONSTANTS.map(([, kind]) => kind))].sort();
    expect(kinds).toStrictEqual([
      "binary",
      "fonts",
      "operant",
      "power_base",
      "symbols",
      "ternary",
      "text",
      "unary",
      "underover",
    ]);
  });

  it("holds the kinds in the counts the gem's table has", () => {
    const tally = new Map<string, number>();
    for (const [, kind] of LATEX_SYMBOL_CONSTANTS) tally.set(kind, (tally.get(kind) ?? 0) + 1);
    expect([...tally].sort()).toStrictEqual([
      ["binary", 6],
      ["fonts", 31],
      ["operant", 22],
      ["power_base", 3],
      ["symbols", 3221],
      ["ternary", 4],
      ["text", 2],
      ["unary", 37],
      ["underover", 1],
    ]);
  });
});

describe("the Symbol/String collision the tuple array exists to survive", () => {
  it("names the nineteen texts the gem's table holds twice", () => {
    expect(LATEX_SYMBOL_CONSTANT_COLLISIONS).toStrictEqual([
      "!",
      "#",
      "$",
      "%",
      "&",
      "'",
      "+",
      ",",
      "-",
      ".",
      "/",
      ":",
      ";",
      "<",
      "=",
      ">",
      "?",
      "@",
      "^",
    ]);
  });

  it("gives each of them both kinds, symbols first", () => {
    for (const text of LATEX_SYMBOL_CONSTANT_COLLISIONS) {
      const kinds = LATEX_SYMBOL_CONSTANTS.filter(([candidate]) => candidate === text).map(
        ([, kind]) => kind,
      );
      expect(kinds, text).toStrictEqual(["symbols", "operant"]);
    }
  });

  it("has no repeated text outside that list", () => {
    const seen = new Map<string, number>();
    for (const [text] of LATEX_SYMBOL_CONSTANTS) seen.set(text, (seen.get(text) ?? 0) + 1);
    const repeated = [...seen].filter(([, count]) => count > 1).map(([text]) => text);
    expect(repeated.sort()).toStrictEqual([...LATEX_SYMBOL_CONSTANT_COLLISIONS].sort());
  });

  it("loses exactly nineteen alternatives the moment it is keyed by text", () => {
    // The defect this shape prevents, demonstrated rather than described: a
    // `Map` (or an object literal) built from the same pairs silently drops
    // one entry of every colliding pair, and the survivor is the LAST one —
    // the `:operant` entry, whose grammar happens to cover both spellings.
    // Had the gem's order been the other way round, the same collapse would
    // have stopped bare `#`, `&`, `.`, `-`, `<` and `=` parsing at all.
    const keyed = new Map(LATEX_SYMBOL_CONSTANTS);
    expect(LATEX_SYMBOL_CONSTANTS.length - keyed.size).toBe(
      LATEX_SYMBOL_CONSTANT_COLLISIONS.length,
    );
    for (const text of LATEX_SYMBOL_CONSTANT_COLLISIONS) {
      expect(keyed.get(text), text).toBe("operant");
    }
  });
});

describe("the encoded decimal marker", () => {
  it("covers every marker src/formatting can hand the grammar", () => {
    const reachable = new Set([
      DEFAULT_DECIMAL_MARKER,
      ...SUPPORTED_LOCALES.map((locale) => decimalMarkerFor(locale)),
    ]);
    expect([...reachable].sort()).toStrictEqual([...LATEX_ENCODED_DECIMAL_MARKERS.keys()].sort());
  });

  it("encodes the way Latex::Parser encodes its input, not the way it reads", () => {
    // `decimal_marker` (`latex/parse.rb:205`) matches
    // `Utility.string_to_html_entity(marker)`, because `pre_processing`
    // entity-encodes the input first. ASCII markers encode to themselves; the
    // Arabic separator does not, and that is the whole reason this table is
    // generated rather than assumed to be the marker itself.
    expect(LATEX_ENCODED_DECIMAL_MARKERS.get(".")).toBe(".");
    expect(LATEX_ENCODED_DECIMAL_MARKERS.get(",")).toBe(",");
    expect(LATEX_ENCODED_DECIMAL_MARKERS.get(ARABIC_DECIMAL_SEPARATOR)).toBe("&#x66b;");
    expect(LATEX_ENCODED_DECIMAL_MARKERS.size).toBe(3);
  });
});

describe("the generated tables' provenance", () => {
  it("records the oracle the rest of this repository is pinned to", () => {
    expect(LATEX_PARSER_GENERATED_PROVENANCE.oracle).toBe("plurimath");
    expect(LATEX_PARSER_GENERATED_PROVENANCE.oracleCommit).toBe(
      "00c52783877b38f6b8e6e109f1803f96bb34fc62",
    );
    expect(LATEX_PARSER_GENERATED_PROVENANCE.oracleClean).toBe(true);
  });
});
