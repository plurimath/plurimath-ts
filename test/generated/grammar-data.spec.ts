/**
 * The generated AsciiMath grammar tables (TODO.plan p1/04).
 *
 * Five constants, twenty entries. They are small enough to hand-type, which is
 * exactly why they are generated: a hand-typed copy drifts silently the first
 * time upstream edits one. These assertions pin what the oracle said at
 * generation time, so a regeneration that truncates, reorders or empties a list
 * fails here instead of quietly changing what the grammar parses.
 *
 * The expectations are deliberately literal — a test that derived them from the
 * table under test would pass against an empty table. They were measured with:
 *
 *   cd ~/ruby_gems/plurimath-oracle && BUNDLE_GEMFILE=Gemfile \
 *     mise x -- bundle exec ruby -Ilib -e \
 *     'require "plurimath"; p Plurimath::Asciimath::Constants::PARENTHESIS'
 *
 * against plurimath 0.11.6 at 00c52783877b38f6b8e6e109f1803f96bb34fc62.
 */

import { describe, expect, it } from "vitest";
import {
  ASCIIMATH_BINARY_CLASSES,
  ASCIIMATH_PARENTHESIS,
  ASCIIMATH_SUB_SUP_CLASSES,
  ASCIIMATH_TABLE_PARENTHESIS,
  ASCIIMATH_TERNARY_CLASSES,
  type AsciimathParenPair,
} from "../../src/generated/asciimath/grammar";
import {
  ASCIIMATH_INPUT_COLLISIONS,
  ASCIIMATH_LITERALS,
  ASCIIMATH_SYMBOL_INPUT,
} from "../../src/generated/asciimath/input";

/** The three lists `power_base_rules` reduces into one ordered choice. */
const CLASS_LISTS = {
  ternary: ASCIIMATH_TERNARY_CLASSES,
  binary: ASCIIMATH_BINARY_CLASSES,
  subSup: ASCIIMATH_SUB_SUP_CLASSES,
} as const;

/** Both paren tables, so the shared invariants stay symmetric. */
const PAREN_TABLES = {
  table: ASCIIMATH_TABLE_PARENTHESIS,
  all: ASCIIMATH_PARENTHESIS,
} as const;

/**
 * The preprocessing substitutions (`asciimath/parser.rb:11-14`). These are real
 * content, not corruption, and each is a single BMP code point — so a mojibake
 * or re-encoding regression changes the code point and fails here.
 */
const SUBSTITUTIONS = [
  { character: "ᑕ", codePoint: 0x1455, source: "(:" },
  { character: "ᑐ", codePoint: 0x1450, source: ":)" },
  { character: "ℒ", codePoint: 0x2112, source: "{:" },
  { character: "ℛ", codePoint: 0x211b, source: ":}" },
] as const;

describe("asciimath grammar class lists", () => {
  it("hold exactly what the gem holds, in the gem's order", () => {
    // Order is behaviour: Parslet's `|` is an ordered choice, and
    // `asciimath/parse.rb:82-84` reduces all three lists into one of them.
    expect(ASCIIMATH_TERNARY_CLASSES).toEqual(["prod", "oint", "sum", "int"]);
    expect(ASCIIMATH_BINARY_CLASSES).toEqual(["underset", "stackrel", "overset", "frac", "root"]);
    expect(ASCIIMATH_SUB_SUP_CLASSES).toEqual(["lim", "log"]);
  });

  it("never repeat an entry, within a list or across the three", () => {
    const seen = new Map<string, string>();
    for (const [name, list] of Object.entries(CLASS_LISTS)) {
      expect(list.length, name).toBeGreaterThan(0);
      for (const entry of list) {
        expect(seen.get(entry), `${entry} in ${name} and ${seen.get(entry)}`).toBeUndefined();
        seen.set(entry, name);
      }
    }
    expect(seen.size).toBe(11);
  });

  it("carry no whitespace, so each is a single literal alternative", () => {
    for (const [name, list] of Object.entries(CLASS_LISTS)) {
      for (const entry of list) {
        expect(entry, name).toMatch(/^[a-z]+$/);
      }
    }
  });
});

describe("asciimath paren tables", () => {
  it("hold exactly what the gem holds, paired and in the gem's order", () => {
    expect(ASCIIMATH_TABLE_PARENTHESIS).toEqual([
      ["ᑕ", "ᑐ"],
      ["ℒ", "ℛ"],
      ["[", "]"],
      ["(", ")"],
    ]);
    expect(ASCIIMATH_PARENTHESIS).toEqual([
      ["ᑕ", "ᑐ"],
      ["ℒ", "ℛ"],
      ["(", ")"],
      ["{", "}"],
      ["[", "]"],
    ]);
  });

  it("stay pairs, so the open and close halves cannot drift apart", () => {
    // `read_text` resolves the closing paren from the captured opening one at
    // parse time (`asciimath/parse.rb:181`), so the mapping is load-bearing —
    // two separate key and value lists would lose it.
    for (const [name, pairs] of Object.entries(PAREN_TABLES)) {
      expect(pairs.length, name).toBeGreaterThan(0);
      for (const pair of pairs) {
        expect(pair.length, `${name} ${pair.join("")}`).toBe(2);
      }
    }
  });

  it("never repeat an opening or a closing paren", () => {
    for (const [name, pairs] of Object.entries(PAREN_TABLES)) {
      const opens = pairs.map(([open]) => open);
      const closes = pairs.map(([, close]) => close);
      expect(new Set(opens).size, `${name} opens`).toBe(pairs.length);
      expect(new Set(closes).size, `${name} closes`).toBe(pairs.length);
    }
  });

  it("close with a single character, which `read_text` needs", () => {
    // The gem interpolates the closing paren into `match("[^...]")`, a
    // character class; anything longer would silently mean something else.
    for (const [name, pairs] of Object.entries(PAREN_TABLES)) {
      for (const [open, close] of pairs) {
        expect([...close].length, `${name} ${open}`).toBe(1);
      }
    }
  });

  it("agree with each other wherever both name the same opening paren", () => {
    const all = new Map<string, string>(ASCIIMATH_PARENTHESIS as readonly AsciimathParenPair[]);
    for (const [open, close] of ASCIIMATH_TABLE_PARENTHESIS) {
      expect(all.get(open), open).toBe(close);
    }
    // A check that matched nothing would prove nothing: the table parens are a
    // proper subset, so all four must have been found above.
    expect(ASCIIMATH_TABLE_PARENTHESIS.length).toBe(4);
    expect(ASCIIMATH_PARENTHESIS.length).toBe(5);
  });

  it("keep the preprocessing substitutions as themselves", () => {
    const characters = [...ASCIIMATH_PARENTHESIS.flat(), ...ASCIIMATH_TABLE_PARENTHESIS.flat()];
    for (const { character, codePoint, source } of SUBSTITUTIONS) {
      expect(character.codePointAt(0), source).toBe(codePoint);
      expect(characters, `${source} -> ${character}`).toContain(character);
    }
  });
});

describe("the asciimath literal list, counted", () => {
  it("holds 3,330 literals — not the 6,609 tuple lines of input.ts", () => {
    // 6,609 is the number of `[...]` tuple lines in
    // `src/generated/asciimath/input.ts`, which is all three of its tuple
    // tables added together. Only the last of them is the literal list.
    expect(ASCIIMATH_LITERALS.size).toBe(3330);
    expect(ASCIIMATH_SYMBOL_INPUT.size).toBe(3276);
    expect(ASCIIMATH_INPUT_COLLISIONS.length).toBe(3);
    expect(
      ASCIIMATH_SYMBOL_INPUT.size + ASCIIMATH_INPUT_COLLISIONS.length + ASCIIMATH_LITERALS.size,
    ).toBe(6609);
  });

  it("shares no entry with the grammar class lists", () => {
    // The eleven class words are structural keywords with their own rules; none
    // of them is a symbol, so none can be shadowed by the literal dispatch.
    for (const [name, list] of Object.entries(CLASS_LISTS)) {
      for (const entry of list) {
        expect(ASCIIMATH_LITERALS.has(entry), `${name} ${entry}`).toBe(false);
        expect(ASCIIMATH_SYMBOL_INPUT.has(entry), `${name} ${entry}`).toBe(false);
      }
    }
  });
});
