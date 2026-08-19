/**
 * The AsciiMath grammar, checked against the gem.
 *
 * The headline assertion is corpus parity: for every reachable case in the
 * pinned `plurimath-testsuite` corpus, this grammar's tree must deep-equal the
 * `parse_tree` Parslet produced for the same preprocessed input. That is the
 * point of the 1:1 port, and it is the only claim here that is evidence rather
 * than design — nothing below asserts *model* parity, because the transform
 * that turns a tree into nodes is a later item and does not exist yet.
 *
 * Three other things are tested on purpose, because the corpus cannot see them:
 *
 *   - **the rules the corpus never reaches** — base-prefix numbers, fonts,
 *     `mod`, `color`, `norm`, `read_text`, the backslash branch. Every
 *     expectation there was *measured* against the oracle, never reasoned out.
 *   - **failure positions.** `ParseFailed.index` is public contract
 *     (ARCHITECTURE.md §5) and two pegkit bugs once survived a conformance
 *     suite that only checked what parses (both fixed inside the pegkit-core
 *     squash `8eadb6a`; `test/pegkit/conformance.spec.ts` pins the positions).
 *   - **the decimal marker.** The gem builds it from
 *     `Plurimath.configuration.decimal` and uses it *twice* (`parse.rb:18` and
 *     `:86`), so a comma-decimal locale changes how commas parse too. The
 *     shared case schema has no locale axis, so these are local fixtures.
 *
 * Two conventions, both to keep a fixture honest:
 *
 * 1. **Expectations are the oracle's own output, pasted verbatim** — a JSON
 *    string, parsed at assert time, exactly as `serialize_tree` emitted it. A
 *    hand-shaped object literal would be a transcription, and a reviewer could
 *    not diff it against a fresh run. It also keeps Ruby's snake_case tree keys
 *    out of TypeScript object literals, where they are not identifiers but
 *    data.
 * 2. **Every input is already preprocessed**, because that is what the grammar
 *    takes. Where preprocessing changes the text, both forms are recorded and
 *    the preprocessed one came from the gem (`Asciimath::Parser.new(i).text`),
 *    not from a mental model of the rewrites — they are five sequential passes
 *    and do not behave like one ordered scan.
 */

import { describe, expect, it } from "vitest";
import {
  asciimathGrammar,
  createAsciimathGrammar,
  parseAsciimathPreprocessed,
} from "../../../src/formats/asciimath/grammar";
import { ParseFailed, type ParseValue, Slice } from "../../../src/pegkit/index";
import { loadPinnedCorpus, readExclusions } from "../../core/corpus-pin";
import type { YamlValue } from "../../core/corpus-yaml";

/**
 * The parse tree as the corpus records it: slices flattened to their text,
 * everything else structural.
 *
 * The generator does the same on the Ruby side (`serialize_tree`), so the two
 * meet in one shape. Key order is not compared — the generator sorts, and a
 * deep-equal on plain objects ignores order anyway.
 */
function plain(value: ParseValue): YamlValue {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return value.map(plain);
  const result: Record<string, YamlValue> = {};
  for (const [key, nested] of Object.entries(value)) result[key] = plain(nested);
  return result;
}

const grammar = createAsciimathGrammar();

function tree(preprocessed: string): YamlValue {
  return plain(grammar.root.parse(preprocessed));
}

/** The preprocessed input, and the tree the gem produced for it, verbatim. */
type Fixture = readonly [preprocessed: string, gemTree: string];

/**
 * Control characters as code points, never as escape sequences in the source.
 * Scripted edits have put literal control bytes into source files before
 * (PORTING-STANDARDS.md, "Verification hygiene"), and `test/core/corpus-yaml.ts`
 * writes its own escapes this way for the same reason.
 */
const TAB = String.fromCodePoint(0x09);
const LINE_FEED = String.fromCodePoint(0x0a);
const VERTICAL_TAB = String.fromCodePoint(0x0b);
const FORM_FEED = String.fromCodePoint(0x0c);
const CARRIAGE_RETURN = String.fromCodePoint(0x0d);
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
const EN_SPACE = String.fromCodePoint(0x2002);
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x3000);

describe("corpus parity", () => {
  const corpus = loadPinnedCorpus();
  const withheld = new Set(readExclusions().map((entry) => entry.id));
  const reachable = corpus.cases.filter((entry) => !withheld.has(entry.id));

  it("has the cases this port checks against", () => {
    // Guards the whole block: a reader that silently returned nothing would
    // make every `it.each` below vacuous.
    expect(corpus.cases.length).toBe(76);
    expect(reachable.length).toBe(75);
  });

  it.each(reachable.map((entry) => [entry.id, entry] as const))(
    "%s parses to the tree Parslet produced",
    (_id, entry) => {
      expect(tree(entry.preprocessed)).toStrictEqual(entry.parseTree);
    },
  );

  it("parses the withheld UnitsML case as plain text, which is the deferral", () => {
    // ARCHITECTURE.md §5: the `unitsml(...)` alternative stays commented out,
    // so the input falls through to plain quoted text. The tree therefore
    // differs from the gem's `{unitsml: ...}` by design — which is exactly why
    // the case is withheld rather than expected to match.
    const excluded = corpus.cases.find((entry) => entry.id === "text-unitsml-valid");
    expect(excluded?.preprocessed).toBe('"unitsml(kg)"');
    expect(excluded?.parseTree).toStrictEqual(JSON.parse('{"expr":{"sequence":{"unitsml":"kg"}}}'));
    expect(tree('"unitsml(kg)"')).toStrictEqual(
      JSON.parse('{"expr":{"sequence":{"text":"unitsml(kg)"}}}'),
    );
  });
});

/**
 * Trees measured against the oracle for inputs the corpus does not cover.
 *
 * Every expectation was produced by running the gem, not by reading the
 * grammar. The script reads a list of inputs and prints, per input, the
 * preprocessed text and the Parslet tree serialized exactly as the corpus
 * generator serializes it:
 *
 *   BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x -- \
 *     bundle exec ruby gem.rb
 *
 * against plurimath 0.11.6 at 00c52783877b38f6b8e6e109f1803f96bb34fc62.
 */
describe("rules the corpus does not reach", () => {
  const fixtures: readonly Fixture[] = [
    // --- base_number_prefix.rb, mixed into the parser at parse.rb:6 --------
    ["0x1f", '{"expr":{"sequence":{"hex_number":"1f"}}}'],
    ["0XFF", '{"expr":{"sequence":{"hex_number":"FF"}}}'],
    ["0b1010", '{"expr":{"sequence":{"binary_number":"1010"}}}'],
    ["0B11", '{"expr":{"sequence":{"binary_number":"11"}}}'],
    ["0o17", '{"expr":{"sequence":{"octal_number":"17"}}}'],
    ["0O7", '{"expr":{"sequence":{"octal_number":"7"}}}'],
    // a prefix with no digits after it is not a base literal at all
    ["0x", '{"expr":{"sequence":{"number":"0"},"expr":{"sequence":{"symbol":"x"}}}}'],

    // --- number's last alternative: a bare `.` is a symbol (parse.rb:20) ---
    [".", '{"expr":{"sequence":{"symbol":"."}}}'],

    // --- comma_separated (parse.rb:86) ------------------------------------
    [
      "1,2",
      '{"expr":{"sequence":{"comma_separated":[{"number":"1","comma":","}]},"expr":{"sequence":{"number":"2"}}}}',
    ],
    [
      "1,2,3",
      '{"expr":{"sequence":{"comma_separated":[{"number":"1","comma":","},{"number":"2","comma":","}]},"expr":{"sequence":{"number":"3"}}}}',
    ],
    // the repetition is one digit wide, so a two-digit run is not separated
    [
      "12,5",
      '{"expr":{"sequence":{"number":"12"},"expr":{"comma":",","expr":{"sequence":{"number":"5"}}}}}',
    ],

    // --- fonts (parse.rb:199) ---------------------------------------------
    ["bb x", '{"expr":{"sequence":{"fonts_class":"bb","fonts_value":{"symbol":"x"}}}}'],
    [
      "mathbb(x)",
      '{"expr":{"sequence":{"fonts_class":"mathbb","fonts_value":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":")"}}}}}',
    ],

    // --- special_fonts (parse.rb:200) -------------------------------------
    ["ZZ", '{"expr":{"sequence":{"bold_fonts":"ZZ"}}}'],
    ["CC", '{"expr":{"sequence":{"bold_fonts":"CC"}}}'],

    // --- unary_class, ordinary branch (parse.rb:213) ----------------------
    [
      "ul(x)",
      '{"expr":{"sequence":{"unary":{"unary_class":"ul","intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":")"}}}}}',
    ],
    // a unary with nothing after it still parses — `sequence.maybe`
    ["sqrt", '{"expr":{"sequence":{"unary":{"unary_class":"sqrt"}}}}'],

    // --- unary_class, the underbrace/ubrace branch (parse.rb:210) ---------
    // Selected by comparing `first_value.to_s` to `"'underbrace'"` — quotes
    // included, because that is how `Parslet::Atoms::Str` renders itself.
    ["underbrace_", '{"expr":{"sequence":{"unary":{"unary_class":"underbrace","symbol":"_"}}}}'],
    ["ubrace_", '{"expr":{"sequence":{"unary":{"unary_class":"ubrace","symbol":"_"}}}}'],
    [
      "underbrace(x)",
      '{"expr":{"sequence":{"unary":{"unary_class":"underbrace","intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":")"}}}}}',
    ],

    // --- read_text, through every opening paren it can hold (parse.rb:179)
    // `[` is the one that forces the escape: Ruby's interpolation produces
    // `[^]]`, which the `u` flag rejects outright.
    ["text(abc)", '{"expr":{"sequence":{"intermediate_exp":{"text":"abc"}}}}'],
    ["text[abc]", '{"expr":{"sequence":{"intermediate_exp":{"text":"abc"}}}}'],
    ["text{abc}", '{"expr":{"sequence":{"intermediate_exp":{"text":"abc"}}}}'],
    // it stops at the closer, and the closer itself is optional
    ["text(x", '{"expr":{"sequence":{"intermediate_exp":{"text":"x"}}}}'],

    // --- base's negative lookahead: `__|` is not a subscript (parse.rb:9) --
    ["x__|", '{"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":"__|"}}}}'],

    // --- a leading `_` or `^` is a literal, not a base/power marker -------
    // These pin `expression`'s alternative order: alternative 2 (`iteration >>
    // space? >> expression`) reaches them through the literal table, so
    // alternatives 3 and 4 — which would name them `symbol` at the top level —
    // never fire. Swapping alternatives 2 and 3 changes every tree here, and
    // nothing else in this file notices.
    ["_x", '{"expr":{"sequence":{"symbol":"_"},"expr":{"sequence":{"symbol":"x"}}}}'],
    ["^x", '{"expr":{"sequence":{"symbol":"^"},"expr":{"sequence":{"symbol":"x"}}}}'],
    ["^_", '{"expr":{"sequence":{"symbol":"^"},"expr":{"sequence":{"symbol":"_"}}}}'],
    ["_^", '{"expr":{"sequence":{"symbol":"_"},"expr":{"sequence":{"symbol":"^"}}}}'],
    [
      "x_^",
      '{"expr":{"power_base":{"power_base":{"symbol":"x"},"base":{"base_value":{"symbol":"^"}}}}}',
    ],
    // `^^` and `^^^` are literals in their own right, longer than `^`
    [
      "x^^y",
      '{"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":"^^"},"expr":{"sequence":{"symbol":"y"}}}}}',
    ],

    // --- a bare comma is `iteration`'s third alternative (parse.rb:146) ---
    [
      "a,b",
      '{"expr":{"sequence":{"symbol":"a"},"expr":{"comma":",","expr":{"sequence":{"symbol":"b"}}}}}',
    ],
    // `{` opens a table only when a row follows; otherwise it is `lparen`
    [
      "{(a),(b)}",
      '{"expr":{"sequence":{"intermediate_exp":{"lparen":"{","expr":{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":")"}},"expr":{"comma":",","expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"b"}}},"rparen":")"}}}}}},"rparen":"}"}}}}',
    ],

    // --- the `dx` intermediate (parse.rb:88) ------------------------------
    ["dx", '{"expr":{"sequence":{"intermediate_exp":{"d":"d","x":"x"}}}}'],

    // --- mod (parse.rb:137) -----------------------------------------------
    [
      "a mod b",
      '{"expr":{"mod":{"dividend":{"symbol":"a"},"mod":"mod","divisor":{"sequence":{"symbol":"b"}}}}}',
    ],

    // --- the `//` symbol the solidus lookaround keeps out of `frac` -------
    [
      "a//b",
      '{"expr":{"sequence":{"symbol":"a"},"symbol":"//","expr":{"sequence":{"symbol":"b"}}}}',
    ],

    // --- open_table / close_table are named twice (parse.rb:47, :110) -----
    // `arr_to_expression` already applies `.as(:table_left)` and `table`
    // applies it again, so the tree really is nested twice. Transcribed, not
    // tidied.
    [
      "[[a]]",
      '{"left_right":{"table":{"table_left":{"table_left":"["},"table_row":{"open_tr":"[","tds_list":{"td":{"expr":{"sequence":{"symbol":"a"}}}}},"table_right":{"table_right":"]"}}}}',
    ],
    // --- norm-prefixed table (parse.rb:111) -------------------------------
    [
      "norm[[a]]",
      '{"left_right":{"table":{"norm":"norm","table_left":{"table_left":"["},"table_row":{"open_tr":"[","tds_list":{"td":{"expr":{"sequence":{"symbol":"a"}}}}},"table_right":{"table_right":"]"}}}}',
    ],
    // --- vertical-bar table (parse.rb:112) --------------------------------
    [
      "|(a)|",
      '{"left_right":{"table":{"table_left":"|","table_row":{"open_tr":"(","tds_list":{"td":{"expr":{"sequence":{"symbol":"a"}}}}},"table_right":"|"}}}',
    ],

    // --- ternary, with and without a third value (parse.rb:31) ------------
    [
      "sum_1^2 x",
      '{"expr":{"ternary":{"ternary_class":"sum","base_value":{"number":"1"},"power_value":{"number":"2"},"third_value":{"sequence":{"symbol":"x"}}}}}',
    ],
    [
      "prod_1^2",
      '{"expr":{"ternary":{"ternary_class":"prod","base_value":{"number":"1"},"power_value":{"number":"2"}}}}',
    ],

    // --- sub_sup_classes, tagged `:binary_class` in the gem (parse.rb:44) -
    [
      "log_2",
      '{"expr":{"power_base":{"binary_class":"log","base":{"base_value":{"number":"2"}}}}}',
    ],

    // --- binary_classes (parse.rb:40, :104) -------------------------------
    [
      "root(3)(x)",
      '{"expr":{"power_base":{"binary_class":"root","base_value":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"number":"3"}}},"rparen":")"}},"power_value":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":")"}}}}}',
    ],

    // --- color, through two of its three parens (parse.rb:26, :122) -------
    [
      "color(red)x",
      '{"expr":{"color":{"intermediate_exp":{"lparen":"(","rgb_color":{"expr":{"sequence":{"symbol":"r"},"expr":{"sequence":{"symbol":"e"},"expr":{"sequence":{"symbol":"d"}}}}},"rparen":")"}},"color_value":{"symbol":"x"}}}',
    ],
    [
      "color{red}x",
      '{"expr":{"color":{"intermediate_exp":{"lparen":"{","rgb_color":{"expr":{"sequence":{"symbol":"r"},"expr":{"sequence":{"symbol":"e"},"expr":{"sequence":{"symbol":"d"}}}}},"rparen":"}"}},"color_value":{"symbol":"x"}}}',
    ],

    // --- the backslash branch every `:symbol` literal carries (parse.rb:197)
    // `"\s"` there is a Ruby double-quoted escape for U+0020, not the `\s`
    // character class, so the branch is backslash, then spaces, then newline.
    [`\\   ${LINE_FEED}`, '{"expr":{"sequence":{"slash":"\\\\"}}}'],
    [`\\${LINE_FEED}`, '{"expr":{"sequence":{"slash":"\\\\"}}}'],
    // and one of the two backslash-initial literals it is hoisted in front of
    ["\\", '{"expr":{"sequence":{"symbol":"\\\\"}}}'],

    // --- left ... right (parse.rb:70) -------------------------------------
    [
      "left(x right)",
      '{"left_right":{"left":"(","left_right_value":{"sequence":{"symbol":"x"}},"right":")"}}',
    ],

    // --- preprocessing output is ordinary input by the time it gets here ---
    // raw input `{:x:}`
    [
      "ℒxℛ",
      '{"expr":{"sequence":{"intermediate_exp":{"lparen":"ℒ","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":"ℛ"}}}}',
    ],
    // raw input `(:x:)`
    [
      "ᑕxᑐ",
      '{"expr":{"sequence":{"intermediate_exp":{"lparen":"ᑕ","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":"ᑐ"}}}}',
    ],
    // Preprocessing is blind to quoting, so those characters also turn up
    // *inside* quoted text and `text(...)`, where they are plain content and
    // must not be read as structure. Raw inputs `"{:x:}"` and `text({:x:})`.
    ['"ℒxℛ"', '{"expr":{"sequence":{"text":"ℒxℛ"}}}'],
    ["text(ℒxℛ)", '{"expr":{"sequence":{"intermediate_exp":{"text":"ℒxℛ"}}}}'],

    // --- an unpaired `(` leaves `rparen` null, not "" (parse.rb:127) ------
    [
      "(x",
      '{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":null}}}}',
    ],

    // --- a surrogate pair is one character to `match`, as it is in Ruby ---
    [
      "\u{1D465}(",
      '{"expr":{"sequence":{"symbol":"𝑥"},"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}}',
    ],
  ];

  it.each(fixtures)("%j", (preprocessed, gemTree) => {
    expect(tree(preprocessed)).toStrictEqual(JSON.parse(gemTree));
  });
});

/**
 * `\s` is not the same character set in Ruby and JavaScript, and the difference
 * is visible in the tree. Measured on the oracle, not looked up:
 *
 *   ruby /\s/   -> U+0009 U+000A U+000B U+000C U+000D U+0020   (six)
 *   js   /\s/u  -> those, plus nineteen more, U+00A0 among them
 *
 * `parse.rb` writes `\s` twice — the `space` rule at `:11` and the catch-all
 * negated class at `:90` — so a verbatim port swallowed U+00A0 as whitespace
 * where the gem reads it as a symbol, losing a node. These are the regression
 * guard. Every expectation below came from the gem.
 */
describe("Ruby's whitespace, not JavaScript's", () => {
  const TwoSymbols = '{"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":"y"}}}}';
  const threeSymbols = (character: string): string =>
    `{"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":${JSON.stringify(
      character,
    )}},"expr":{"sequence":{"symbol":"y"}}}}}`;

  it.each([[" "], [TAB], [VERTICAL_TAB], [FORM_FEED], [CARRIAGE_RETURN], [LINE_FEED]])(
    "%j is whitespace to both, so it disappears",
    (character) => {
      expect(tree(`x${character}y`)).toStrictEqual(JSON.parse(TwoSymbols));
    },
  );

  it.each([[NO_BREAK_SPACE], [EN_SPACE], [IDEOGRAPHIC_SPACE]])(
    "%j is whitespace only to JavaScript, so it stays a symbol",
    (character) => {
      expect(tree(`x${character}y`)).toStrictEqual(JSON.parse(threeSymbols(character)));
    },
  );

  it("reads a lone no-break space as a symbol", () => {
    expect(tree(NO_BREAK_SPACE)).toStrictEqual(
      JSON.parse(`{"expr":{"sequence":{"symbol":${JSON.stringify(NO_BREAK_SPACE)}}}}`),
    );
  });
});

/**
 * The two constructs that used to diverge from the gem, kept as tests because
 * they are the sharpest regression guard this file has. Both were pegkit's, and
 * both are now implemented there; every tree below is the gem's, measured with
 * `bundle exec ruby tree-probe.rb '""' '"""' 'text()' … ')' 'x)' '2)' ']' '}' ')x'`.
 */
describe("the two constructs that used to diverge", () => {
  // Parslet's `flatten_repetition(list, named)` returns `[]` for an empty list
  // under `.as(...)` and an empty string without one. Two constructs in this
  // grammar have a named repetition that can match zero times:
  //
  //   quoted_text alt 1 (parse.rb:76)   `""`      -> {"text":[]}
  //   read_text via .as(:text) (:128)   `text()`  -> {"text":[]}
  //
  // No corpus case reaches either. Note `"""`: the SECOND quote runs out of
  // input and takes `quoted_text`'s alternative 2, which is `str("").as(:text)`
  // — a named empty *string*, not a repetition, so it stays `""`. The two
  // shapes sitting side by side in one tree is why this is worth pinning.
  it.each([
    ['""', '{"expr":{"sequence":{"text":[]}}}'],
    ['"""', '{"expr":{"sequence":{"text":[]},"expr":{"sequence":{"text":""}}}}'],
    ["text()", '{"expr":{"sequence":{"intermediate_exp":{"text":[]}}}}'],
    ["text(", '{"expr":{"sequence":{"intermediate_exp":{"text":[]}}}}'],
    ["text[]", '{"expr":{"sequence":{"intermediate_exp":{"text":[]}}}}'],
  ])("%j gives an empty named repetition an empty array, as Parslet does", (input, gem) => {
    expect(tree(input)).toStrictEqual(JSON.parse(gem));
  });

  // The bigger one, and the only one here that changed whether an input parses
  // at all.
  //
  // `expression`'s alternative 5 is `str("")`, which always succeeds and
  // consumes nothing, so alternatives 6-9 are reachable only through Parslet's
  // `consume_all` retry: an alternative that succeeds while leaving input
  // behind is turned into a failure inside the alternative loop, and the next
  // alternative is tried. Alternative 6 is the one that matters:
  //
  //   (rparen.as(:rparen) >> space? >> controversial_symbols >>
  //      comma.as(:comma).maybe >> expression).repeat(1).as(:expr)
  //
  // so any input with a closing paren that no opening paren claimed reaches it.
  it.each([
    [")", '{"expr":[{"rparen":")"}]}'],
    ["x)", '{"expr":{"sequence":{"symbol":"x"},"expr":[{"rparen":")"}]}}'],
    ["2)", '{"expr":{"sequence":{"number":"2"},"expr":[{"rparen":")"}]}}'],
    ["]", '{"expr":[{"rparen":"]"}]}'],
    ["}", '{"expr":[{"rparen":"}"}]}'],
    [")x", '{"expr":[{"rparen":")","expr":{"sequence":{"symbol":"x"}}}]}'],
  ])("%j reaches expression's alternative 6, as it does in the gem", (input, gem) => {
    expect(tree(input)).toStrictEqual(JSON.parse(gem));
  });

  it("still stops at alternative 5 for the empty input", () => {
    // The one case where alternative 5 is the gem's answer too: there is no
    // leftover input, so nothing turns its success into a failure.
    expect(tree("")).toStrictEqual("");
  });
});

describe("failure positions", () => {
  /** The index a failed parse reports, or `null` if the parse succeeded. */
  function failureIndex(input: string): number | null {
    try {
      grammar.root.parse(input);
      return null;
    } catch (error) {
      if (error instanceof ParseFailed) return error.index;
      throw error;
    }
  }

  // Parslet is *not* the oracle for the index: its reporter blames the root
  // atom and says "line 1 char 1" for every one of these. What is checked
  // against the gem is which inputs fail at all — `bundle exec ruby tree.rb
  // 'a/' 'x/' 'right' 'left(x right'` raises `Parslet::ParseFailed` for all
  // four. The index is pegkit's own contract: how far the parse got.
  it.each([
    ["a/", 1],
    ["x/", 1],
    ["right", 0],
    ["left(x right", 7],
  ])("%j fails at index %i", (input, index) => {
    expect(failureIndex(input)).toBe(index);
  });

  it("reports an index inside the input, never past its end", () => {
    for (const input of ["a/", "x/", "right", "left(x right"]) {
      const index = failureIndex(input);
      expect(index).not.toBeNull();
      expect(index as number).toBeGreaterThanOrEqual(0);
      expect(index as number).toBeLessThanOrEqual(input.length);
    }
  });

  it("indexes UTF-16 code units, so a surrogate pair counts as two", () => {
    // ARCHITECTURE.md §5: `ParseError.index` is a UTF-16 offset, because that
    // is what a JavaScript caller indexes a string with. The grammar is handed
    // *preprocessed* text, so this offset is into that string; mapping it back
    // through the SourceMap is the format entry point's job, not this file's.
    let thrown: unknown;
    try {
      grammar.root.parse("\u{1D465}/");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ParseFailed);
    // The astral character occupies two code units, so the solidus sits at 2.
    expect((thrown as ParseFailed).index).toBe(2);
  });

  it("constructs every rule body, so no escape survived that the `u` flag rejects", () => {
    // `new RegExp("\\-", "yu")` throws at *construction*, so a character class
    // copied verbatim from `match('\-')` fails before parsing anything —
    // a `SyntaxError`, not a `ParseFailed`.
    //
    // Calling `createAsciimathGrammar()` alone would not prove this: `rule()`
    // is lazy, and the whole grammar builds in 0.4 ms precisely because no rule
    // body has run yet. So every rule is applied here, which forces its thunk
    // and with it every `match(...)` in that body. A `ParseFailed` is the
    // expected outcome for most of them and is not what this is looking for.
    const fresh = createAsciimathGrammar();
    for (const [name, atom] of Object.entries(fresh.rules)) {
      const force = (): void => {
        try {
          atom.parse("x_1^2");
        } catch (error) {
          if (!(error instanceof ParseFailed)) throw error;
        }
      };
      expect(force, `rule ${name}`).not.toThrow();
    }
    // `read_text` builds its class at parse time from the captured paren, so it
    // is forced separately — once per opening paren, since `[` is the one whose
    // Ruby form (`[^]]`) the `u` flag rejects.
    for (const input of ["text(a)", "text[a]", "text{a}"]) {
      expect(() => grammar.root.parse(input), input).not.toThrow();
    }
  });
});

describe("the decimal marker comes from formatting, not a hardcoded dot", () => {
  const commaGrammar = createAsciimathGrammar(",");

  function commaTree(input: string): YamlValue {
    return plain(commaGrammar.root.parse(input));
  }

  it("defaults to a full stop", () => {
    expect(createAsciimathGrammar().decimalMarker).toBe(".");
    expect(asciimathGrammar().decimalMarker).toBe(".");
    expect(tree("2.5")).toStrictEqual(JSON.parse('{"expr":{"sequence":{"number":"2.5"}}}'));
  });

  it("resolves a locale through formatting", () => {
    expect(asciimathGrammar({ locale: "de" }).decimalMarker).toBe(",");
    expect(asciimathGrammar({ locale: "en-US" }).decimalMarker).toBe(".");
    // Three markers exist, not two — `ar` uses U+066B.
    expect(asciimathGrammar({ locale: "ar" }).decimalMarker).toBe(String.fromCodePoint(0x066b));
  });

  it("returns one grammar per marker, not one per locale", () => {
    expect(asciimathGrammar({ locale: "de" })).toBe(asciimathGrammar({ locale: "fr" }));
    expect(asciimathGrammar({ locale: "en-US" })).not.toBe(asciimathGrammar({ locale: "de" }));
  });

  it("reads a comma as a decimal point under a comma locale (parse.rb:18)", () => {
    // The gem, for the same input and locale:
    //   parse("1,5", :asciimath, locale: :de) => Number("1,5")
    expect(commaTree("1,5")).toStrictEqual(JSON.parse('{"expr":{"sequence":{"number":"1,5"}}}'));
  });

  it("stops treating that comma as a separator (parse.rb:86)", () => {
    // Under the default marker the same input is a comma-separated list. The
    // `absent?` guard at parse.rb:86 is what flips, so the marker reaches more
    // than the number rule — which is the whole reason it is a parameter.
    expect(tree("1,5")).toStrictEqual(
      JSON.parse(
        '{"expr":{"sequence":{"comma_separated":[{"number":"1","comma":","}]},"expr":{"sequence":{"number":"5"}}}}',
      ),
    );
    // gem: parse("1,2,3", :asciimath, locale: :de) => Number("1,2") Comma Number("3")
    expect(commaTree("1,2,3")).toStrictEqual(
      JSON.parse(
        '{"expr":{"sequence":{"number":"1,2"},"expr":{"comma":",","expr":{"sequence":{"number":"3"}}}}}',
      ),
    );
  });

  it("leaves `.` a symbol under a comma locale, because parse.rb:20 hardcodes it", () => {
    // gem: parse("1.5", :asciimath, locale: :de) => Number("1") Period Number("5")
    expect(commaTree(".")).toStrictEqual(JSON.parse('{"expr":{"sequence":{"symbol":"."}}}'));
    expect(commaTree("1.5")).toStrictEqual(
      JSON.parse(
        '{"expr":{"sequence":{"number":"1"},"expr":{"sequence":{"symbol":"."},"expr":{"sequence":{"number":"5"}}}}}',
      ),
    );
  });
});

describe("the rule inventory", () => {
  it("names every rule parse.rb defines, plus the three from the mixin", () => {
    // 33 rules in parse.rb + hex/binary/octal from BaseNumberPrefix::Parser.
    expect(Object.keys(grammar.rules).length).toBe(36);
  });

  it("roots at `expression` (parse.rb:169)", () => {
    expect(grammar.root).toBe(grammar.rules.expression);
  });

  it("shares one atom per rule, so the packrat cache is shared as Parslet's is", () => {
    // Parslet memoizes an Entity per rule per parser instance; referencing a
    // rule twice must not build two atoms, or one cache becomes two.
    expect(grammar.rules.expression).toBe(grammar.rules.expression);
    expect(createAsciimathGrammar().rules.expression).not.toBe(grammar.rules.expression);
  });

  it("exposes rules that can be driven on their own, for a transform to reuse", () => {
    // `td` is the clearest case: it exists only to wrap `expression`, and
    // nothing reaches it except `tr`.
    expect(plain(grammar.rules.td.parse("a"))).toStrictEqual(
      JSON.parse('{"td":{"expr":{"sequence":{"symbol":"a"}}}}'),
    );
    expect(plain(grammar.rules.quotedText.parse('"hi"'))).toStrictEqual(
      JSON.parse('{"text":"hi"}'),
    );
  });

  it("parses through the convenience entry, which resolves the locale itself", () => {
    expect(plain(parseAsciimathPreprocessed("2.5"))).toStrictEqual(
      JSON.parse('{"expr":{"sequence":{"number":"2.5"}}}'),
    );
    expect(plain(parseAsciimathPreprocessed("1,5", { locale: "de" }))).toStrictEqual(
      JSON.parse('{"expr":{"sequence":{"number":"1,5"}}}'),
    );
  });
});
