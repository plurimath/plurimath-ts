/**
 * The HTML grammar, checked against the gem.
 *
 * Nothing here is reasoned out. Every expectation is the oracle's own answer,
 * captured by handing the input to `Plurimath::Html::Parse#parse` and
 * serialising the Parslet tree with slices flattened to their text — the same
 * projection `plain()` below performs on this port's tree, so the two meet in
 * one shape. A `null` expectation means the gem refused the input. Produced
 * against plurimath 0.11.6 at `00c52783877b38f6b8e6e109f1803f96bb34fc62` from a
 * clean checkout.
 *
 * Eight groups, each answering a different question.
 *
 * 1. **The gem's own HTML**: every pinned-corpus case parsed with the gem and
 *    rendered back out with `to_html`, then fed to the HTML grammar — 95
 *    distinct strings, 4 of which the gem itself refuses. The pinned corpus has
 *    no HTML cases of its own (its `targets` are asciimath, latex, mathml and
 *    unicodemath), so this is the round trip rather than a corpus read.
 * 2. **The gem's own HTML specs**: every `let(:string)` in the oracle's
 *    `spec/plurimath/html/{parse,parser,to_html_round_trip}_spec.rb` — 80
 *    strings the gem's own suite exercises, 6 of which it refuses.
 * 3. **A sweep**, with trees, not just verdicts: every string of length 1 and 2
 *    over a 26-character alphabet of the characters this grammar branches on,
 *    plus every length-3 string over a 10-character structural subset — 1,807
 *    inputs, of which the gem refuses 1,169. Ordering bugs surface here: a
 *    reordered alternative turns an accept into a refusal, or changes the tree.
 * 4. **Every table entry**, bare and wrapped and with arguments, so no
 *    alternative of the four generated tables ships untested.
 * 5. **Tags**: case, attributes, quoting, void tags, `<th>`-as-`td`, nesting,
 *    and the mismatched close tag. This is the group that exercises `scope` and
 *    `capture`, which `html/parse.rb:180` is the only user of in the whole gem.
 * 6. **Entities and numbers**, including the `repeat(1)` boundary that makes
 *    `&#x;` a symbol here and a unicode node under LaTeX and UnicodeMath.
 * 7. **The decimal marker** under all three of the gem's locales, with the
 *    other two markers probed under each — HTML's marker is exclusive.
 * 8. **What mutation testing found uncovered.** Twenty-nine mutations were
 *    applied to the grammar and to the generated tables. Four survived groups 1
 *    to 7, and three of those were real gaps — a closing tag carrying
 *    attributes, a parenthesised character that both `symbol` and `sub_sup`
 *    accept, and the sub/sup pair — so this group is the 67 oracle-measured
 *    inputs that close them. Twenty-four mutations die here; the five that
 *    remain are order swaps between alternatives no position can both reach,
 *    argued in a test of their own rather than covered.
 *
 * These inputs are what `Html::Parse` was handed. Groups 1 and 2 record what
 * `Html::Parser#normalized_text` produced first, because that is what the gem's
 * own path feeds Parslet; groups 3 to 8 are handed to the grammar directly, the
 * way `spec/plurimath/html/parse_spec.rb` does.
 */

import { describe, expect, it } from "vitest";
import {
  HTML_LPAREN,
  HTML_RPAREN,
  HTML_SUB_SUP_CLASSES,
  HTML_UNARY_CLASSES,
} from "../../../src/formats/html/generated/parser-tables";
import {
  createHtmlGrammar,
  htmlGrammar,
  parseHtmlNormalized,
} from "../../../src/formats/html/grammar";
import { ParseFailed, type ParseValue, Slice } from "../../../src/pegkit/index";

/**
 * The parse tree with slices flattened to their text, everything else
 * structural — what the Ruby side serialised. Key order is not compared: a
 * deep-equal on plain objects ignores it.
 */
type PlainTree = string | null | PlainTree[] | { [key: string]: PlainTree };

function plain(value: ParseValue): PlainTree {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return value.map(plain);
  const result: Record<string, PlainTree> = {};
  for (const [key, nested] of Object.entries(value)) result[key] = plain(nested);
  return result;
}

const grammar = createHtmlGrammar();

/** The input, and the tree the gem produced for it — or `null` if it refused. */
type Fixture = readonly [input: string, gemTree: string | null];

/**
 * One fixture checked: the tree if the gem produced one, a typed refusal if it
 * did not. Anything else — a thrown `TypeError`, a stack overflow — is a defect
 * of its own and reaches the runner rather than being reported as a refusal.
 */
function check([input, gemTree]: Fixture, which = grammar): void {
  if (gemTree === null) {
    expect(() => which.root.parse(input), input).toThrow(ParseFailed);
    return;
  }
  expect(plain(which.root.parse(input)), input).toStrictEqual(JSON.parse(gemTree));
}

/** The same check, batched, so a 1,807-case sweep is not 1,807 test names. */
function checkAll(fixtures: readonly Fixture[], which = grammar): void {
  const wrong: string[] = [];
  for (const fixture of fixtures) {
    const [input, gemTree] = fixture;
    let got: string;
    try {
      got = JSON.stringify(plain(which.root.parse(input)));
    } catch (error) {
      if (!(error instanceof ParseFailed)) throw error;
      got = "null";
    }
    const want = gemTree === null ? "null" : JSON.stringify(JSON.parse(gemTree));
    if (got !== want) wrong.push(`${JSON.stringify(input)}: want ${want}, got ${got}`);
  }
  expect(wrong).toStrictEqual([]);
}

/** A locale fixture: the marker the grammar was built with, the input, the tree. */
type LocaleFixture = readonly [marker: string, input: string, gemTree: string | null];

// --- group 1: the gem's own HTML, from the pinned corpus -------------------
//
// Each input is `Math.parse(case.input, case.input_format).to_html` with its
// whitespace stripped, then run through `Html::Parser#normalized_text` — the
// two steps the gem's own `to_html_round_trip_spec.rb` performs.
const CORPUS_FIXTURES: readonly Fixture[] = [
  [
    "<i>red</i><i>x</i>",
    '{"sequence":{"text":"r","expression":{"text":"e","expression":{"text":"d"}}},"expression":{"sequence":{"text":"x"}}}',
  ],
  [
    "<i>blue</i><i>x</i>+y",
    '{"sequence":{"text":"b","expression":{"text":"l","expression":{"text":"u","expression":{"text":"e"}}}},"expression":{"sequence":{"text":"x"},"expression":{"symbol":"+","expression":{"text":"y"}}}}',
  ],
  ["<i>(</i>x<i>)</i>", '{"parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}}'],
  [
    "<i>(</i>x+y<i>)</i>",
    '{"parse_parenthesis":{"lparen":"(","text":"x","expression":{"symbol":"+","expression":{"text":"y"}},"rparen":")"}}',
  ],
  [
    "<i>[</i>a,b<i>]</i>",
    '{"parse_parenthesis":{"lparen":"[","text":"a","expression":{"symbol":",","expression":{"text":"b"}},"rparen":"]"}}',
  ],
  ["<i>{</i>x<i>}</i>", '{"parse_parenthesis":{"lparen":"{","text":"x","rparen":"}"}}'],
  [
    "<i>(</i>a,b,c<i>)</i>",
    '{"parse_parenthesis":{"lparen":"(","text":"a","expression":{"symbol":",","expression":{"text":"b","expression":{"symbol":",","expression":{"text":"c"}}}},"rparen":")"}}',
  ],
  [
    "<i>x+y</i><i>2</i>",
    '{"sequence":{"text":"x","expression":{"symbol":"+","expression":{"text":"y"}}},"expression":{"sequence":{"number":"2"}}}',
  ],
  ["x", '{"text":"x"}'],
  ["A+B", '{"text":"A","expression":{"symbol":"+","expression":{"text":"B"}}}'],
  ["<i>a</i><i>b</i>", '{"sequence":{"text":"a"},"expression":{"sequence":{"text":"b"}}}'],
  ["<i>2</i><i>3</i>", '{"sequence":{"number":"2"},"expression":{"sequence":{"number":"3"}}}'],
  [
    "<i>a+b</i><i>c</i>",
    '{"sequence":{"text":"a","expression":{"symbol":"+","expression":{"text":"b"}}},"expression":{"sequence":{"text":"c"}}}',
  ],
  [
    "<i>x</i><i>y+z</i>",
    '{"sequence":{"text":"x"},"expression":{"sequence":{"text":"y","expression":{"symbol":"+","expression":{"text":"z"}}}}}',
  ],
  [
    "<i>a</i><i>b</i>+<i>c</i><i>d</i>",
    '{"sequence":{"text":"a"},"expression":{"sequence":{"text":"b"},"expression":{"symbol":"+","expression":{"sequence":{"text":"c"},"expression":{"sequence":{"text":"d"}}}}}}',
  ],
  [
    "<table><tr><td>a</td></tr><tr><td>b</td></tr></table>",
    '{"table_value":{"tr_value":{"td_value":{"text":"a"}},"expression":{"tr_value":{"td_value":{"text":"b"}}}}}',
  ],
  [
    "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>",
    '{"table_value":{"tr_value":{"td_value":{"text":"a"},"expression":{"td_value":{"text":"b"}}},"expression":{"tr_value":{"td_value":{"text":"c"},"expression":{"td_value":{"text":"d"}}}}}}',
  ],
  ["2&#x3c0;r", '{"number":"2","expression":{"symbol":"&#x3c0;","expression":{"text":"r"}}}'],
  [
    "&#x3b1;&#x3b2;&#x3b3;",
    '{"symbol":"&#x3b1;","expression":{"symbol":"&#x3b2;","expression":{"symbol":"&#x3b3;"}}}',
  ],
  [
    "f<i>(</i>x<i>)</i>=<i>x</i><sup>2</sup>",
    '{"sequence":{"text":"f","parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}},"expression":{"symbol":"=","expression":{"sub_sup":{"sequence":{"text":"x"}},"sup_value":{"number":"2"}}}}',
  ],
  [
    "<i><i>(</i>x+y<i>)</i></i><sup>2</sup>=<i>x</i><sup>2</sup>+2xy+<i>y</i><sup>2</sup>",
    '{"sub_sup":{"sequence":{"parse_parenthesis":{"lparen":"(","text":"x","expression":{"symbol":"+","expression":{"text":"y"}},"rparen":")"}}},"sup_value":{"number":"2"},"expression":{"symbol":"=","expression":{"sub_sup":{"sequence":{"text":"x"}},"sup_value":{"number":"2"},"expression":{"symbol":"+","expression":{"number":"2","expression":{"text":"x","expression":{"text":"y","expression":{"symbol":"+","expression":{"sub_sup":{"sequence":{"text":"y"}},"sup_value":{"number":"2"}}}}}}}}}}',
  ],
  [
    "<i>&#x2211;</i><sub>i=1</sub><sup>n</sup>=<i><i>(</i><i>n<i>(</i>n+1<i>)</i></i><i>2</i><i>)</i></i><sup>2</sup>",
    '{"sub_sup":{"sequence":{"sum_prod":"&#x2211;"}},"sub_value":{"text":"i","expression":{"symbol":"=","expression":{"number":"1"}}},"sup_value":{"text":"n"},"expression":{"symbol":"=","expression":{"sub_sup":{"sequence":{"parse_parenthesis":{"lparen":"(","sequence":{"text":"n","parse_parenthesis":{"lparen":"(","text":"n","expression":{"symbol":"+","expression":{"number":"1"}},"rparen":")"}},"expression":{"sequence":{"number":"2"}},"rparen":")"}}},"sup_value":{"number":"2"}}}}',
  ],
  [
    "<i>a</i><i>mod</i><i>b</i>",
    '{"first_value":{"sequence":{"text":"a"}},"binary":"mod","second_value":{"sequence":{"text":"b"}}}',
  ],
  [
    "<i>x</i><i>mod</i><i>2</i>",
    '{"first_value":{"sequence":{"text":"x"}},"binary":"mod","second_value":{"sequence":{"number":"2"}}}',
  ],
  [
    "<i><i>(</i>a+b<i>)</i></i><i>mod</i><i>n</i>",
    '{"first_value":{"sequence":{"parse_parenthesis":{"lparen":"(","text":"a","expression":{"symbol":"+","expression":{"text":"b"}},"rparen":")"}}},"binary":"mod","second_value":{"sequence":{"text":"n"}}}',
  ],
  [
    "<i>log</i><sub>2</sub>8",
    '{"sub_sup":{"sequence":{"sum_prod":"log"}},"sub_value":{"number":"2"},"expression":{"number":"8"}}',
  ],
  [
    "<i>lim</i><i>x&#x2192;&#x221e;</i>f<i>(</i>x<i>)</i>",
    '{"binary":"lim","first_value":{"sequence":{"text":"x","expression":{"symbol":"&#x2192;","expression":{"symbol":"&#x221e;"}}}},"second_value":{"text":"f"},"sequence":{"parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  [
    "<i>&#x2211;</i><sub>i=1</sub><sup>n</sup>",
    '{"sub_sup":{"sequence":{"sum_prod":"&#x2211;"}},"sub_value":{"text":"i","expression":{"symbol":"=","expression":{"number":"1"}}},"sup_value":{"text":"n"}}',
  ],
  [
    "<i>0</i><i>1</i><i>x</i>dx",
    '{"sequence":{"number":"0"},"expression":{"sequence":{"number":"1"},"expression":{"sequence":{"text":"x"},"expression":{"text":"d","expression":{"text":"x"}}}}}',
  ],
  [
    "<i>&#x220f;</i><sub>k=1</sub><sup>n</sup>",
    '{"sub_sup":{"sequence":{"sum_prod":"&#x220f;"}},"sub_value":{"text":"k","expression":{"symbol":"=","expression":{"number":"1"}}},"sup_value":{"text":"n"}}',
  ],
  ["<i>&#x2211;</i>x", '{"sequence":{"sum_prod":"&#x2211;"},"expression":{"text":"x"}}'],
  ["2", '{"number":"2"}'],
  ["2.5", '{"number":"2.5"}'],
  ["0", '{"number":"0"}'],
  ["123", '{"number":"123"}'],
  ["3.14159", '{"number":"3.14159"}'],
  ["x+y", '{"text":"x","expression":{"symbol":"+","expression":{"text":"y"}}}'],
  ["2x", '{"number":"2","expression":{"text":"x"}}'],
  ["a&#x22c5;b", '{"text":"a","expression":{"symbol":"&#x22c5;","expression":{"text":"b"}}}'],
  ["a&#x2212;b", '{"text":"a","expression":{"symbol":"&#x2212;","expression":{"text":"b"}}}'],
  ["x=y", '{"text":"x","expression":{"symbol":"=","expression":{"text":"y"}}}'],
  [
    "a+b+c",
    '{"text":"a","expression":{"symbol":"+","expression":{"text":"b","expression":{"symbol":"+","expression":{"text":"c"}}}}}',
  ],
  ["<i>sqrt</i>", '{"unary":"sqrt"}'],
  ["x^", '{"text":"x","expression":{"symbol":"^"}}'],
  ["<i>(</i>a", null],
  ["a)", null],
  ["))))", null],
  ["$", '{"symbol":"$"}'],
  [
    "<i>a</i><i>+</i>b",
    '{"sequence":{"text":"a"},"expression":{"sequence":{"symbol":"+"},"expression":{"text":"b"}}}',
  ],
  ["<i>x</i><sup>2</sup>", '{"sub_sup":{"sequence":{"text":"x"}},"sup_value":{"number":"2"}}'],
  [
    "<i>x</i><sup>n+1</sup>",
    '{"sub_sup":{"sequence":{"text":"x"}},"sup_value":{"text":"n","expression":{"symbol":"+","expression":{"number":"1"}}}}',
  ],
  ["<i>a</i><sub>1</sub>", '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"number":"1"}}'],
  [
    "<i>a</i><sub>n+1</sub>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"text":"n","expression":{"symbol":"+","expression":{"number":"1"}}}}',
  ],
  [
    "<i>x</i><sub>1</sub><sup>2</sup>",
    '{"sub_sup":{"sequence":{"text":"x"}},"sub_value":{"number":"1"},"sup_value":{"number":"2"}}',
  ],
  ["<i>e</i><sup>x</sup>", '{"sub_sup":{"sequence":{"text":"e"}},"sup_value":{"text":"x"}}'],
  ["<i>2</i><sup>10</sup>", '{"sub_sup":{"sequence":{"number":"2"}},"sup_value":{"number":"10"}}'],
  [
    "<i><i>x</i><sup>2</sup></i><i>4</i>",
    '{"sequence":{"sub_sup":{"sequence":{"text":"x"}},"sup_value":{"number":"2"}},"expression":{"sequence":{"number":"4"}}}',
  ],
  [
    "hello",
    '{"text":"h","expression":{"text":"e","expression":{"text":"l","expression":{"text":"l","expression":{"text":"o"}}}}}',
  ],
  [
    "helloworld",
    '{"text":"h","expression":{"text":"e","expression":{"text":"l","expression":{"text":"l","expression":{"text":"o","expression":{"text":"w","expression":{"text":"o","expression":{"text":"r","expression":{"text":"l","expression":{"text":"d"}}}}}}}}}}',
  ],
  ["kg", '{"text":"k","expression":{"text":"g"}}'],
  [
    "<i>sqrt</i><i>2</i>",
    '{"unary_function":{"unary":"sqrt","first_value":{"sequence":{"number":"2"}}}}',
  ],
  [
    "<i>sqrt</i><i>x+1</i>",
    '{"unary_function":{"unary":"sqrt","first_value":{"sequence":{"text":"x","expression":{"symbol":"+","expression":{"number":"1"}}}}}}',
  ],
  [
    "<i>sqrt</i><i><i>a</i><sup>2</sup>+<i>b</i><sup>2</sup></i>",
    '{"unary_function":{"unary":"sqrt","first_value":{"sequence":{"sub_sup":{"sequence":{"text":"a"}},"sup_value":{"number":"2"},"expression":{"symbol":"+","expression":{"sub_sup":{"sequence":{"text":"b"}},"sup_value":{"number":"2"}}}}}}}',
  ],
  [
    "<i>3</i><i>x+1</i>",
    '{"sequence":{"number":"3"},"expression":{"sequence":{"text":"x","expression":{"symbol":"+","expression":{"number":"1"}}}}}',
  ],
  ["&#x3b1;", '{"symbol":"&#x3b1;"}'],
  ["&#x3c0;", '{"symbol":"&#x3c0;"}'],
  ["&#x3c3;", '{"symbol":"&#x3c3;"}'],
  ["&#x221e;", '{"symbol":"&#x221e;"}'],
  ["xyz", '{"text":"x","expression":{"text":"y","expression":{"text":"z"}}}'],
  ["xy", '{"text":"x","expression":{"text":"y"}}'],
  [
    "<i>sin</i><i><i>(</i>x<i>)</i></i>",
    '{"unary_function":{"unary":"sin","first_value":{"sequence":{"parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}}}}}',
  ],
  [
    "<i>sin</i><i>x</i>",
    '{"unary_function":{"unary":"sin","first_value":{"sequence":{"text":"x"}}}}',
  ],
  [
    "<i>cos</i><i><i>(</i>2x<i>)</i></i>",
    '{"unary_function":{"unary":"cos","first_value":{"sequence":{"parse_parenthesis":{"lparen":"(","number":"2","expression":{"text":"x"},"rparen":")"}}}}}',
  ],
  [
    "<i>abs</i><i>x</i>",
    '{"unary_function":{"unary":"abs","first_value":{"sequence":{"text":"x"}}}}',
  ],
  ["<i>^</i><i>x</i>", '{"sequence":{"symbol":"^"},"expression":{"sequence":{"text":"x"}}}'],
  ["<i>¯</i><i>x</i>", '{"sequence":{"symbol":"¯"},"expression":{"sequence":{"text":"x"}}}'],
  [
    "<i>&#x2192;</i><i>v</i>",
    '{"sequence":{"symbol":"&#x2192;"},"expression":{"sequence":{"text":"v"}}}',
  ],
  ["ab", '{"text":"a","expression":{"text":"b"}}'],
  [
    "<i>&#x2211;</i><sub>i=1</sub><sup>n</sup>i",
    '{"sub_sup":{"sequence":{"sum_prod":"&#x2211;"}},"sub_value":{"text":"i","expression":{"symbol":"=","expression":{"number":"1"}}},"sup_value":{"text":"n"},"expression":{"text":"i"}}',
  ],
  [
    "<i>sqrt</i><i>x</i>",
    '{"unary_function":{"unary":"sqrt","first_value":{"sequence":{"text":"x"}}}}',
  ],
  ["<i>(</i>a<i>)</i>", '{"parse_parenthesis":{"lparen":"(","text":"a","rparen":")"}}'],
  ["<i>[</i>a<i>]</i>", '{"parse_parenthesis":{"lparen":"[","text":"a","rparen":"]"}}'],
  ["<i>\\{</i>a<i>}</i>", null],
  [
    "<i>&#x2329;</i>a<i>&#x232a;</i>",
    '{"sequence":{"symbol":"&#x2329;"},"expression":{"text":"a","expression":{"sequence":{"symbol":"&#x232a;"}}}}',
  ],
  [
    "<i>⌈</i>a<i>⌉</i>",
    '{"sequence":{"symbol":"⌈"},"expression":{"text":"a","expression":{"sequence":{"symbol":"⌉"}}}}',
  ],
  ["1", '{"number":"1"}'],
  ["3.14", '{"number":"3.14"}'],
  ["1,5", '{"number":"1","expression":{"symbol":",","expression":{"number":"5"}}}'],
  ["&#x2212;42", '{"symbol":"&#x2212;","expression":{"number":"42"}}'],
  ["a+b", '{"text":"a","expression":{"symbol":"+","expression":{"text":"b"}}}'],
  ["a&#xd7;b", '{"text":"a","expression":{"symbol":"&#xd7;","expression":{"text":"b"}}}'],
  ["a&#x2264;b", '{"text":"a","expression":{"symbol":"&#x2264;","expression":{"text":"b"}}}'],
  ["a&#x2261;b", '{"text":"a","expression":{"symbol":"&#x2261;","expression":{"text":"b"}}}'],
  ["a&#xb1;b", '{"text":"a","expression":{"symbol":"&#xb1;","expression":{"text":"b"}}}'],
  ["&#x2205;", '{"symbol":"&#x2205;"}'],
];

// --- group 2: the strings the gem's own HTML specs parse -------------------
const GEM_SPEC_FIXTURES: readonly Fixture[] = [
  ["<i>&#x2211;</i>", '{"sequence":{"sum_prod":"&#x2211;"}}'],
  [
    "&#x2211;<sub>d</sub><sup>prod</sup>",
    '{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"text":"d"},"sup_value":{"text":"p","expression":{"text":"r","expression":{"text":"o","expression":{"text":"d"}}}}}',
  ],
  [
    "<div>&#x2211;<sub>&#x220f;</sub></div>",
    '{"sequence":{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"sum_prod":"&#x220f;"}}}',
  ],
  [
    "<div>&#x2211;<sup>&#x220f;</sup></div>",
    '{"sequence":{"sub_sup":{"sum_prod":"&#x2211;"},"sup_value":{"sum_prod":"&#x220f;"}}}',
  ],
  [
    "<div>&#x2211;<sub>&#x220f;</sub><sup>prod</sup></div>",
    '{"sequence":{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"sum_prod":"&#x220f;"},"sup_value":{"text":"p","expression":{"text":"r","expression":{"text":"o","expression":{"text":"d"}}}}}}',
  ],
  [
    "abs(3)",
    '{"unary_function":{"unary":"abs","first_value":{"lparen":"(","number":"3","rparen":")"}}}',
  ],
  [
    "abc[0]",
    '{"text":"a","expression":{"text":"b","expression":{"text":"c","parse_parenthesis":{"lparen":"[","number":"0","rparen":"]"}}}}',
  ],
  [
    "abc{0}",
    '{"text":"a","expression":{"text":"b","expression":{"text":"c","parse_parenthesis":{"lparen":"{","number":"0","rparen":"}"}}}}',
  ],
  [
    "abc(weatevertext[andthings])",
    '{"text":"a","expression":{"text":"b","expression":{"text":"c","parse_parenthesis":{"lparen":"(","text":"w","expression":{"text":"e","expression":{"text":"a","expression":{"text":"t","expression":{"text":"e","expression":{"text":"v","expression":{"text":"e","expression":{"text":"r","expression":{"text":"t","expression":{"text":"e","expression":{"text":"x","expression":{"text":"t","parse_parenthesis":{"lparen":"[","text":"a","expression":{"text":"n","expression":{"text":"d","expression":{"text":"t","expression":{"text":"h","expression":{"text":"i","expression":{"text":"n","expression":{"text":"g","expression":{"text":"s"}}}}}}}},"rparen":"]"}}}}}}}}}}}},"rparen":")"}}}}',
  ],
  ["ϑ(t)", '{"symbol":"ϑ","parse_parenthesis":{"lparen":"(","text":"t","rparen":")"}}'],
  ["<i>a</i><sup>2</sup>", '{"sub_sup":{"sequence":{"text":"a"}},"sup_value":{"number":"2"}}'],
  ["<i>a</i><sub>2</sub>", '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"number":"2"}}'],
  [
    "<i>a</i><sup><i>n</i></sup>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sup_value":{"sequence":{"text":"n"}}}',
  ],
  [
    "<i>a</i><sub><i>n</i></sub>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"sequence":{"text":"n"}}}',
  ],
  ["2<sup>3</sup>", '{"sub_sup":{"number":"2"},"sup_value":{"number":"3"}}'],
  [
    "2<sup>3+4</sup>",
    '{"sub_sup":{"number":"2"},"sup_value":{"number":"3","expression":{"symbol":"+","expression":{"number":"4"}}}}',
  ],
  [
    "2<sub>3+4</sub>",
    '{"sub_sup":{"number":"2"},"sub_value":{"number":"3","expression":{"symbol":"+","expression":{"number":"4"}}}}',
  ],
  [
    "<i>a</i><sub><i>b</i>+2</sub>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"sequence":{"text":"b"},"expression":{"symbol":"+","expression":{"number":"2"}}}}',
  ],
  [
    "<i>a</i><sup>-2</sup>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sup_value":{"symbol":"-","expression":{"number":"2"}}}',
  ],
  [
    "<i>a</i><sub>-2</sub>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"symbol":"-","expression":{"number":"2"}}}',
  ],
  [
    "<i>a</i><sup>-<i>n</i></sup>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sup_value":{"symbol":"-","expression":{"sequence":{"text":"n"}}}}',
  ],
  [
    "<i>a</i><sub>-<i>n</i></sub>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"symbol":"-","expression":{"sequence":{"text":"n"}}}}',
  ],
  [
    "<i>a</i><sub><i>n</i></sub><sup>2</sup>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"sequence":{"text":"n"}},"sup_value":{"number":"2"}}',
  ],
  [
    "<i>f</i>(<i>x</i>)",
    '{"sequence":{"text":"f"},"parse_parenthesis":{"lparen":"(","sequence":{"text":"x"},"rparen":")"}}',
  ],
  [
    "<i>f</i>(<i>g</i>(<i>x</i>))",
    '{"sequence":{"text":"f"},"parse_parenthesis":{"lparen":"(","sequence":{"text":"g"},"parse_parenthesis":{"lparen":"(","sequence":{"text":"x"},"rparen":")"},"rparen":")"}}',
  ],
  [
    "f&#x2211;(<i>n</i>)(<i>2</i>)",
    '{"text":"f","expression":{"sequence":{"symbol":"&#x2211;","parse_parenthesis":{"lparen":"(","sequence":{"text":"n"},"rparen":")"}},"expression":{"parse_parenthesis":{"lparen":"(","sequence":{"number":"2"},"rparen":")"}}}}',
  ],
  [
    "fib(<i>n</i>)",
    '{"text":"f","expression":{"text":"i","expression":{"text":"b","parse_parenthesis":{"lparen":"(","sequence":{"text":"n"},"rparen":")"}}}}',
  ],
  [
    "<i>f</i><sub>max</sub>",
    '{"sub_sup":{"sequence":{"text":"f"}},"sub_value":{"text":"m","expression":{"text":"a","expression":{"text":"x"}}}}',
  ],
  ["<i>&#x3c9;</i>", '{"sequence":{"symbol":"&#x3c9;"}}'],
  ["<i>&#x3a9;</i>", '{"sequence":{"symbol":"&#x3a9;"}}'],
  ["αβγ", '{"symbol":"α","expression":{"symbol":"β","expression":{"symbol":"γ"}}}'],
  ["абг", '{"symbol":"а","expression":{"symbol":"б","expression":{"symbol":"г"}}}'],
  [
    "<i>f</i><sup>-1</sup>(<i>x</i>)",
    '{"sub_sup":{"sequence":{"text":"f"}},"sup_value":{"symbol":"-","expression":{"number":"1"}},"expression":{"parse_parenthesis":{"lparen":"(","sequence":{"text":"x"},"rparen":")"}}}',
  ],
  [
    "<sub>sth</sub>",
    '{"sequence":{"text":"s","expression":{"text":"t","expression":{"text":"h"}}}}',
  ],
  [
    "root(<i>sth</i>)",
    '{"text":"r","expression":{"text":"o","expression":{"text":"o","expression":{"text":"t","parse_parenthesis":{"lparen":"(","sequence":{"text":"s","expression":{"text":"t","expression":{"text":"h"}}},"rparen":")"}}}}}',
  ],
  [
    "<table><tr><td>Something</td></tr></table>",
    '{"table_value":{"tr_value":{"td_value":{"text":"S","expression":{"text":"o","expression":{"text":"m","expression":{"text":"e","expression":{"text":"t","expression":{"text":"h","expression":{"text":"i","expression":{"text":"n","expression":{"text":"g"}}}}}}}}}}}}',
  ],
  [
    "&#x2211;<sub>drop</sub><sup>prod</sup>",
    '{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"text":"d","expression":{"text":"r","expression":{"text":"o","expression":{"text":"p"}}}},"sup_value":{"text":"p","expression":{"text":"r","expression":{"text":"o","expression":{"text":"d"}}}}}',
  ],
  [
    "&#x2211;<sub>drop</sub><sup>p</sup>",
    '{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"text":"d","expression":{"text":"r","expression":{"text":"o","expression":{"text":"p"}}}},"sup_value":{"text":"p"}}',
  ],
  ["&#x2211;<sup>p</sup>", '{"sub_sup":{"sum_prod":"&#x2211;"},"sup_value":{"text":"p"}}'],
  [
    "&#x2211;<sup>prod</sup>",
    '{"sub_sup":{"sum_prod":"&#x2211;"},"sup_value":{"text":"p","expression":{"text":"r","expression":{"text":"o","expression":{"text":"d"}}}}}',
  ],
  [
    "&#x2211;<sub>prod</sub>",
    '{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"text":"p","expression":{"text":"r","expression":{"text":"o","expression":{"text":"d"}}}}}',
  ],
  ["2<sub>3</sub>", '{"sub_sup":{"number":"2"},"sub_value":{"number":"3"}}'],
  [
    "&#x2211;<sub>3</sub><sup>5</sup>",
    '{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"number":"3"},"sup_value":{"number":"5"}}',
  ],
  [
    "2<sub>3</sub><sup>5</sup>",
    '{"sub_sup":{"number":"2"},"sub_value":{"number":"3"},"sup_value":{"number":"5"}}',
  ],
  [
    "2<sub>so</sub><sup>we</sup>",
    '{"sub_sup":{"number":"2"},"sub_value":{"text":"s","expression":{"text":"o"}},"sup_value":{"text":"w","expression":{"text":"e"}}}',
  ],
  [
    "2<sub>s</sub><sup>we</sup>",
    '{"sub_sup":{"number":"2"},"sub_value":{"text":"s"},"sup_value":{"text":"w","expression":{"text":"e"}}}',
  ],
  [
    "2<sub>so</sub><sup>w</sup>",
    '{"sub_sup":{"number":"2"},"sub_value":{"text":"s","expression":{"text":"o"}},"sup_value":{"text":"w"}}',
  ],
  [
    "s<sub>so</sub><sup>w</sup>",
    '{"sub_sup":{"text":"s"},"sub_value":{"text":"s","expression":{"text":"o"}},"sup_value":{"text":"w"}}',
  ],
  [
    "s<sub>so</sub><sup>we</sup>",
    '{"sub_sup":{"text":"s"},"sub_value":{"text":"s","expression":{"text":"o"}},"sup_value":{"text":"w","expression":{"text":"e"}}}',
  ],
  [
    "s<sub>s</sub><sup>we</sup>",
    '{"sub_sup":{"text":"s"},"sub_value":{"text":"s"},"sup_value":{"text":"w","expression":{"text":"e"}}}',
  ],
  [
    "<i>lim</i>(3)(e)",
    '{"binary":"lim","first_value":{"lparen":"(","number":"3","rparen":")"},"second_value":{"lparen":"(","text":"e","rparen":")"}}',
  ],
  [
    "<i>lim</i>(3e)(em)",
    '{"binary":"lim","first_value":{"lparen":"(","number":"3","expression":{"text":"e"},"rparen":")"},"second_value":{"lparen":"(","text":"e","expression":{"text":"m"},"rparen":")"}}',
  ],
  [
    "<i>lim</i>(3am)(rest)",
    '{"binary":"lim","first_value":{"lparen":"(","number":"3","expression":{"text":"a","expression":{"text":"m"}},"rparen":")"},"second_value":{"lparen":"(","text":"r","expression":{"text":"e","expression":{"text":"s","expression":{"text":"t"}}},"rparen":")"}}',
  ],
  [
    "<i>log</i><sub>3</sub><sup>e</sup>",
    '{"sub_sup":{"sequence":{"sum_prod":"log"}},"sub_value":{"number":"3"},"sup_value":{"text":"e"}}',
  ],
  ["2<i>mod</i>e", '{"first_value":{"number":"2"},"binary":"mod","second_value":{"text":"e"}}'],
  [
    "<i>2</i><i>mod</i><i>e</i>",
    '{"first_value":{"sequence":{"number":"2"}},"binary":"mod","second_value":{"sequence":{"text":"e"}}}',
  ],
  [
    "<i>2a</i><i>mod</i><i>em</i>",
    '{"first_value":{"sequence":{"number":"2","expression":{"text":"a"}}},"binary":"mod","second_value":{"sequence":{"text":"e","expression":{"text":"m"}}}}',
  ],
  [
    "2a<i>mod</i>em",
    '{"sequence":{"number":"2","expression":{"first_value":{"text":"a"},"binary":"mod","second_value":{"text":"e"}}},"expression":{"text":"m"}}',
  ],
  ["<sup>sth", null],
  ["<div>&#x2211;</div>", '{"sequence":{"sum_prod":"&#x2211;"}}'],
  ["1,2", '{"number":"1","expression":{"symbol":",","expression":{"number":"2"}}}'],
  ["1.2", '{"number":"1.2"}'],
  [
    "<span>1,2</span>",
    '{"sequence":{"number":"1","expression":{"symbol":",","expression":{"number":"2"}}}}',
  ],
  ["1٫2", '{"number":"1","expression":{"symbol":"٫","expression":{"number":"2"}}}'],
  [
    "<span>1٫2</span>",
    '{"sequence":{"number":"1","expression":{"symbol":"٫","expression":{"number":"2"}}}}',
  ],
  [
    "<i>a</i><sub><i>n+1</i></sub><sup><i>b</i>+</sup>",
    '{"sub_sup":{"sequence":{"text":"a"}},"sub_value":{"sequence":{"text":"n","expression":{"symbol":"+","expression":{"number":"1"}}}},"sup_value":{"sequence":{"text":"b"},"expression":{"symbol":"+"}}}',
  ],
  [
    "<i>sin</i><i>b</i>d",
    '{"unary_function":{"unary":"sin","first_value":{"sequence":{"text":"b"}}},"sequence":{"text":"d"}}',
  ],
  [
    "<i>sin</i><i>b</i>x+1",
    '{"unary_function":{"unary":"sin","first_value":{"sequence":{"text":"b"}}},"sequence":{"text":"x","expression":{"symbol":"+","expression":{"number":"1"}}}}',
  ],
  [
    "<i>(</i><i>sin</i><i>d</i><i>)</i>",
    '{"parse_parenthesis":{"lparen":"(","unary_function":{"unary":"sin","first_value":{"sequence":{"text":"d"}}},"rparen":")"}}',
  ],
  [
    "<VAR>&#x2211;</VAR><SUB>i</SUB>",
    '{"sub_sup":{"sequence":{"sum_prod":"&#x2211;"}},"sub_value":{"text":"i"}}',
  ],
  ["a<br/>b", '{"text":"a","expression":{"linebreak":"<br/>","expression":{"text":"b"}}}'],
  [
    "<table><tr><th>x</th><td>y</td></tr></table>",
    '{"table_value":{"tr_value":{"td_value":{"text":"x"},"expression":{"td_value":{"text":"y"}}}}}',
  ],
  ["<bravo>x</bravo>", '{"sequence":{"text":"x"}}'],
  ["<bravo/>x", null],
  ["<table><tr><tdx>1</td></tr></table>", null],
  ["<span<bad>x</span>", null],
  ["<i>x</x>", null],
  ["<table><tr><td>x</th></tr></table>", null],
  ["<math><mi>x</mi></math>", '{"sequence":{"sequence":{"text":"x"}}}'],
  ["<mathematics>x</mathematics>", '{"sequence":{"text":"x"}}'],
];

// --- group 3: the sweep ----------------------------------------------------
//
// Length 1 and 2 over `< > / ( ) { } [ ] & # ; x 0 1 a A SP TAB , . - ' " = : _ b`,
// and length 3 over `< > / i ( ) & ; b 1`.
const SWEEP_FIXTURES: readonly Fixture[] = [
  ["<", null],
  [">", null],
  ["/", '{"symbol":"/"}'],
  ["(", null],
  [")", null],
  ["{", null],
  ["}", null],
  ["[", null],
  ["]", null],
  ["&", '{"symbol":"&"}'],
  ["#", '{"symbol":"#"}'],
  [";", '{"symbol":";"}'],
  ["a", '{"text":"a"}'],
  ["A", '{"text":"A"}'],
  [" ", '" "'],
  ["\t", '{"symbol":"\\t"}'],
  [",", '{"symbol":","}'],
  [".", '{"symbol":"."}'],
  ["-", '{"symbol":"-"}'],
  ["'", '{"symbol":"\'"}'],
  ['"', '{"symbol":"\\""}'],
  ["=", '{"symbol":"="}'],
  [":", '{"symbol":":"}'],
  ["_", '{"symbol":"_"}'],
  ["b", '{"text":"b"}'],
  ["<<", null],
  ["<>", null],
  ["</", null],
  ["<(", null],
  ["<)", null],
  ["<{", null],
  ["<}", null],
  ["<[", null],
  ["<]", null],
  ["<&", null],
  ["<#", null],
  ["<;", null],
  ["<x", null],
  ["<0", null],
  ["<1", null],
  ["<a", null],
  ["<A", null],
  ["< ", null],
  ["<\t", null],
  ["<,", null],
  ["<.", null],
  ["<-", null],
  ["<'", null],
  ['<"', null],
  ["<=", null],
  ["<:", null],
  ["<_", null],
  ["<b", null],
  ["><", null],
  [">>", null],
  [">/", null],
  [">(", null],
  [">)", null],
  [">{", null],
  [">}", null],
  [">[", null],
  [">]", null],
  [">&", null],
  [">#", null],
  [">;", null],
  [">x", null],
  [">0", null],
  [">1", null],
  [">a", null],
  [">A", null],
  ["> ", null],
  [">\t", null],
  [">,", null],
  [">.", null],
  [">-", null],
  [">'", null],
  ['>"', null],
  [">=", null],
  [">:", null],
  [">_", null],
  [">b", null],
  ["/<", null],
  ["/>", null],
  ["//", '{"symbol":"/","expression":{"symbol":"/"}}'],
  ["/(", null],
  ["/)", null],
  ["/{", null],
  ["/}", null],
  ["/[", null],
  ["/]", null],
  ["/&", '{"symbol":"/","expression":{"symbol":"&"}}'],
  ["/#", '{"symbol":"/","expression":{"symbol":"#"}}'],
  ["/;", '{"symbol":"/","expression":{"symbol":";"}}'],
  ["/x", '{"symbol":"/","expression":{"text":"x"}}'],
  ["/0", '{"symbol":"/","expression":{"number":"0"}}'],
  ["/1", '{"symbol":"/","expression":{"number":"1"}}'],
  ["/a", '{"symbol":"/","expression":{"text":"a"}}'],
  ["/A", '{"symbol":"/","expression":{"text":"A"}}'],
  ["/ ", '{"symbol":"/","expression":" "}'],
  ["/\t", '{"symbol":"/","expression":{"symbol":"\\t"}}'],
  ["/,", '{"symbol":"/","expression":{"symbol":","}}'],
  ["/.", '{"symbol":"/","expression":{"symbol":"."}}'],
  ["/-", '{"symbol":"/","expression":{"symbol":"-"}}'],
  ["/'", '{"symbol":"/","expression":{"symbol":"\'"}}'],
  ['/"', '{"symbol":"/","expression":{"symbol":"\\""}}'],
  ["/=", '{"symbol":"/","expression":{"symbol":"="}}'],
  ["/:", '{"symbol":"/","expression":{"symbol":":"}}'],
  ["/_", '{"symbol":"/","expression":{"symbol":"_"}}'],
  ["/b", '{"symbol":"/","expression":{"text":"b"}}'],
  ["(<", null],
  ["(>", null],
  ["(/", null],
  ["((", null],
  ["()", null],
  ["({", null],
  ["(}", null],
  ["([", null],
  ["(]", null],
  ["(&", null],
  ["(#", null],
  ["(;", null],
  ["(x", null],
  ["(0", null],
  ["(1", null],
  ["(a", null],
  ["(A", null],
  ["( ", null],
  ["(\t", null],
  ["(,", null],
  ["(.", null],
  ["(-", null],
  ["('", null],
  ['("', null],
  ["(=", null],
  ["(:", null],
  ["(_", null],
  ["(b", null],
  [")<", null],
  [")>", null],
  [")/", null],
  [")(", null],
  ["))", null],
  ["){", null],
  [")}", null],
  [")[", null],
  [")]", null],
  [")&", null],
  [")#", null],
  [");", null],
  [")x", null],
  [")0", null],
  [")1", null],
  [")a", null],
  [")A", null],
  [") ", null],
  [")\t", null],
  ["),", null],
  [").", null],
  [")-", null],
  [")'", null],
  [')"', null],
  [")=", null],
  ["):", null],
  [")_", null],
  [")b", null],
  ["{<", null],
  ["{>", null],
  ["{/", null],
  ["{(", null],
  ["{)", null],
  ["{{", null],
  ["{}", null],
  ["{[", null],
  ["{]", null],
  ["{&", null],
  ["{#", null],
  ["{;", null],
  ["{x", null],
  ["{0", null],
  ["{1", null],
  ["{a", null],
  ["{A", null],
  ["{ ", null],
  ["{\t", null],
  ["{,", null],
  ["{.", null],
  ["{-", null],
  ["{'", null],
  ['{"', null],
  ["{=", null],
  ["{:", null],
  ["{_", null],
  ["{b", null],
  ["}<", null],
  ["}>", null],
  ["}/", null],
  ["}(", null],
  ["})", null],
  ["}{", null],
  ["}}", null],
  ["}[", null],
  ["}]", null],
  ["}&", null],
  ["}#", null],
  ["};", null],
  ["}x", null],
  ["}0", null],
  ["}1", null],
  ["}a", null],
  ["}A", null],
  ["} ", null],
  ["}\t", null],
  ["},", null],
  ["}.", null],
  ["}-", null],
  ["}'", null],
  ['}"', null],
  ["}=", null],
  ["}:", null],
  ["}_", null],
  ["}b", null],
  ["[<", null],
  ["[>", null],
  ["[/", null],
  ["[(", null],
  ["[)", null],
  ["[{", null],
  ["[}", null],
  ["[[", null],
  ["[]", null],
  ["[&", null],
  ["[#", null],
  ["[;", null],
  ["[x", null],
  ["[0", null],
  ["[1", null],
  ["[a", null],
  ["[A", null],
  ["[ ", null],
  ["[\t", null],
  ["[,", null],
  ["[.", null],
  ["[-", null],
  ["['", null],
  ['["', null],
  ["[=", null],
  ["[:", null],
  ["[_", null],
  ["[b", null],
  ["]<", null],
  ["]>", null],
  ["]/", null],
  ["](", null],
  ["])", null],
  ["]{", null],
  ["]}", null],
  ["][", null],
  ["]]", null],
  ["]&", null],
  ["]#", null],
  ["];", null],
  ["]x", null],
  ["]0", null],
  ["]1", null],
  ["]a", null],
  ["]A", null],
  ["] ", null],
  ["]\t", null],
  ["],", null],
  ["].", null],
  ["]-", null],
  ["]'", null],
  [']"', null],
  ["]=", null],
  ["]:", null],
  ["]_", null],
  ["]b", null],
  ["&<", null],
  ["&>", null],
  ["&/", '{"symbol":"&","expression":{"symbol":"/"}}'],
  ["&(", null],
  ["&)", null],
  ["&{", null],
  ["&}", null],
  ["&[", null],
  ["&]", null],
  ["&&", '{"symbol":"&","expression":{"symbol":"&"}}'],
  ["&#", '{"symbol":"&","expression":{"symbol":"#"}}'],
  ["&;", '{"symbol":"&","expression":{"symbol":";"}}'],
  ["&x", '{"symbol":"&","expression":{"text":"x"}}'],
  ["&0", '{"symbol":"&","expression":{"number":"0"}}'],
  ["&1", '{"symbol":"&","expression":{"number":"1"}}'],
  ["&a", '{"symbol":"&","expression":{"text":"a"}}'],
  ["&A", '{"symbol":"&","expression":{"text":"A"}}'],
  ["& ", '{"symbol":"&","expression":" "}'],
  ["&\t", '{"symbol":"&","expression":{"symbol":"\\t"}}'],
  ["&,", '{"symbol":"&","expression":{"symbol":","}}'],
  ["&.", '{"symbol":"&","expression":{"symbol":"."}}'],
  ["&-", '{"symbol":"&","expression":{"symbol":"-"}}'],
  ["&'", '{"symbol":"&","expression":{"symbol":"\'"}}'],
  ['&"', '{"symbol":"&","expression":{"symbol":"\\""}}'],
  ["&=", '{"symbol":"&","expression":{"symbol":"="}}'],
  ["&:", '{"symbol":"&","expression":{"symbol":":"}}'],
  ["&_", '{"symbol":"&","expression":{"symbol":"_"}}'],
  ["&b", '{"symbol":"&","expression":{"text":"b"}}'],
  ["#<", null],
  ["#>", null],
  ["#/", '{"symbol":"#","expression":{"symbol":"/"}}'],
  ["#(", null],
  ["#)", null],
  ["#{", null],
  ["#}", null],
  ["#[", null],
  ["#]", null],
  ["#&", '{"symbol":"#","expression":{"symbol":"&"}}'],
  ["##", '{"symbol":"#","expression":{"symbol":"#"}}'],
  ["#;", '{"symbol":"#","expression":{"symbol":";"}}'],
  ["#x", '{"symbol":"#","expression":{"text":"x"}}'],
  ["#0", '{"symbol":"#","expression":{"number":"0"}}'],
  ["#1", '{"symbol":"#","expression":{"number":"1"}}'],
  ["#a", '{"symbol":"#","expression":{"text":"a"}}'],
  ["#A", '{"symbol":"#","expression":{"text":"A"}}'],
  ["# ", '{"symbol":"#","expression":" "}'],
  ["#\t", '{"symbol":"#","expression":{"symbol":"\\t"}}'],
  ["#,", '{"symbol":"#","expression":{"symbol":","}}'],
  ["#.", '{"symbol":"#","expression":{"symbol":"."}}'],
  ["#-", '{"symbol":"#","expression":{"symbol":"-"}}'],
  ["#'", '{"symbol":"#","expression":{"symbol":"\'"}}'],
  ['#"', '{"symbol":"#","expression":{"symbol":"\\""}}'],
  ["#=", '{"symbol":"#","expression":{"symbol":"="}}'],
  ["#:", '{"symbol":"#","expression":{"symbol":":"}}'],
  ["#_", '{"symbol":"#","expression":{"symbol":"_"}}'],
  ["#b", '{"symbol":"#","expression":{"text":"b"}}'],
  [";<", null],
  [";>", null],
  [";/", '{"symbol":";","expression":{"symbol":"/"}}'],
  [";(", null],
  [";)", null],
  [";{", null],
  [";}", null],
  [";[", null],
  [";]", null],
  [";&", '{"symbol":";","expression":{"symbol":"&"}}'],
  [";#", '{"symbol":";","expression":{"symbol":"#"}}'],
  [";;", '{"symbol":";","expression":{"symbol":";"}}'],
  [";x", '{"symbol":";","expression":{"text":"x"}}'],
  [";0", '{"symbol":";","expression":{"number":"0"}}'],
  [";1", '{"symbol":";","expression":{"number":"1"}}'],
  [";a", '{"symbol":";","expression":{"text":"a"}}'],
  [";A", '{"symbol":";","expression":{"text":"A"}}'],
  ["; ", '{"symbol":";","expression":" "}'],
  [";\t", '{"symbol":";","expression":{"symbol":"\\t"}}'],
  [";,", '{"symbol":";","expression":{"symbol":","}}'],
  [";.", '{"symbol":";","expression":{"symbol":"."}}'],
  [";-", '{"symbol":";","expression":{"symbol":"-"}}'],
  [";'", '{"symbol":";","expression":{"symbol":"\'"}}'],
  [';"', '{"symbol":";","expression":{"symbol":"\\""}}'],
  [";=", '{"symbol":";","expression":{"symbol":"="}}'],
  [";:", '{"symbol":";","expression":{"symbol":":"}}'],
  [";_", '{"symbol":";","expression":{"symbol":"_"}}'],
  [";b", '{"symbol":";","expression":{"text":"b"}}'],
  ["x<", null],
  ["x>", null],
  ["x/", '{"text":"x","expression":{"symbol":"/"}}'],
  ["x(", null],
  ["x)", null],
  ["x{", null],
  ["x}", null],
  ["x[", null],
  ["x]", null],
  ["x&", '{"text":"x","expression":{"symbol":"&"}}'],
  ["x#", '{"text":"x","expression":{"symbol":"#"}}'],
  ["x;", '{"text":"x","expression":{"symbol":";"}}'],
  ["xx", '{"text":"x","expression":{"text":"x"}}'],
  ["x0", '{"text":"x","expression":{"number":"0"}}'],
  ["x1", '{"text":"x","expression":{"number":"1"}}'],
  ["xa", '{"text":"x","expression":{"text":"a"}}'],
  ["xA", '{"text":"x","expression":{"text":"A"}}'],
  ["x ", '{"text":"x","expression":" "}'],
  ["x\t", '{"text":"x","expression":{"symbol":"\\t"}}'],
  ["x,", '{"text":"x","expression":{"symbol":","}}'],
  ["x.", '{"text":"x","expression":{"symbol":"."}}'],
  ["x-", '{"text":"x","expression":{"symbol":"-"}}'],
  ["x'", '{"text":"x","expression":{"symbol":"\'"}}'],
  ['x"', '{"text":"x","expression":{"symbol":"\\""}}'],
  ["x=", '{"text":"x","expression":{"symbol":"="}}'],
  ["x:", '{"text":"x","expression":{"symbol":":"}}'],
  ["x_", '{"text":"x","expression":{"symbol":"_"}}'],
  ["xb", '{"text":"x","expression":{"text":"b"}}'],
  ["0<", null],
  ["0>", null],
  ["0/", '{"number":"0","expression":{"symbol":"/"}}'],
  ["0(", null],
  ["0)", null],
  ["0{", null],
  ["0}", null],
  ["0[", null],
  ["0]", null],
  ["0&", '{"number":"0","expression":{"symbol":"&"}}'],
  ["0#", '{"number":"0","expression":{"symbol":"#"}}'],
  ["0;", '{"number":"0","expression":{"symbol":";"}}'],
  ["0x", '{"number":"0","expression":{"text":"x"}}'],
  ["00", '{"number":"00"}'],
  ["01", '{"number":"01"}'],
  ["0a", '{"number":"0","expression":{"text":"a"}}'],
  ["0A", '{"number":"0","expression":{"text":"A"}}'],
  ["0 ", '{"number":"0","expression":" "}'],
  ["0\t", '{"number":"0","expression":{"symbol":"\\t"}}'],
  ["0,", '{"number":"0","expression":{"symbol":","}}'],
  ["0.", '{"number":"0","expression":{"symbol":"."}}'],
  ["0-", '{"number":"0","expression":{"symbol":"-"}}'],
  ["0'", '{"number":"0","expression":{"symbol":"\'"}}'],
  ['0"', '{"number":"0","expression":{"symbol":"\\""}}'],
  ["0=", '{"number":"0","expression":{"symbol":"="}}'],
  ["0:", '{"number":"0","expression":{"symbol":":"}}'],
  ["0_", '{"number":"0","expression":{"symbol":"_"}}'],
  ["0b", '{"number":"0","expression":{"text":"b"}}'],
  ["1<", null],
  ["1>", null],
  ["1/", '{"number":"1","expression":{"symbol":"/"}}'],
  ["1(", null],
  ["1)", null],
  ["1{", null],
  ["1}", null],
  ["1[", null],
  ["1]", null],
  ["1&", '{"number":"1","expression":{"symbol":"&"}}'],
  ["1#", '{"number":"1","expression":{"symbol":"#"}}'],
  ["1;", '{"number":"1","expression":{"symbol":";"}}'],
  ["1x", '{"number":"1","expression":{"text":"x"}}'],
  ["10", '{"number":"10"}'],
  ["11", '{"number":"11"}'],
  ["1a", '{"number":"1","expression":{"text":"a"}}'],
  ["1A", '{"number":"1","expression":{"text":"A"}}'],
  ["1 ", '{"number":"1","expression":" "}'],
  ["1\t", '{"number":"1","expression":{"symbol":"\\t"}}'],
  ["1,", '{"number":"1","expression":{"symbol":","}}'],
  ["1.", '{"number":"1","expression":{"symbol":"."}}'],
  ["1-", '{"number":"1","expression":{"symbol":"-"}}'],
  ["1'", '{"number":"1","expression":{"symbol":"\'"}}'],
  ['1"', '{"number":"1","expression":{"symbol":"\\""}}'],
  ["1=", '{"number":"1","expression":{"symbol":"="}}'],
  ["1:", '{"number":"1","expression":{"symbol":":"}}'],
  ["1_", '{"number":"1","expression":{"symbol":"_"}}'],
  ["1b", '{"number":"1","expression":{"text":"b"}}'],
  ["a<", null],
  ["a>", null],
  ["a/", '{"text":"a","expression":{"symbol":"/"}}'],
  ["a(", null],
  ["a{", null],
  ["a}", null],
  ["a[", null],
  ["a]", null],
  ["a&", '{"text":"a","expression":{"symbol":"&"}}'],
  ["a#", '{"text":"a","expression":{"symbol":"#"}}'],
  ["a;", '{"text":"a","expression":{"symbol":";"}}'],
  ["ax", '{"text":"a","expression":{"text":"x"}}'],
  ["a0", '{"text":"a","expression":{"number":"0"}}'],
  ["a1", '{"text":"a","expression":{"number":"1"}}'],
  ["aa", '{"text":"a","expression":{"text":"a"}}'],
  ["aA", '{"text":"a","expression":{"text":"A"}}'],
  ["a ", '{"text":"a","expression":" "}'],
  ["a\t", '{"text":"a","expression":{"symbol":"\\t"}}'],
  ["a,", '{"text":"a","expression":{"symbol":","}}'],
  ["a.", '{"text":"a","expression":{"symbol":"."}}'],
  ["a-", '{"text":"a","expression":{"symbol":"-"}}'],
  ["a'", '{"text":"a","expression":{"symbol":"\'"}}'],
  ['a"', '{"text":"a","expression":{"symbol":"\\""}}'],
  ["a=", '{"text":"a","expression":{"symbol":"="}}'],
  ["a:", '{"text":"a","expression":{"symbol":":"}}'],
  ["a_", '{"text":"a","expression":{"symbol":"_"}}'],
  ["A<", null],
  ["A>", null],
  ["A/", '{"text":"A","expression":{"symbol":"/"}}'],
  ["A(", null],
  ["A)", null],
  ["A{", null],
  ["A}", null],
  ["A[", null],
  ["A]", null],
  ["A&", '{"text":"A","expression":{"symbol":"&"}}'],
  ["A#", '{"text":"A","expression":{"symbol":"#"}}'],
  ["A;", '{"text":"A","expression":{"symbol":";"}}'],
  ["Ax", '{"text":"A","expression":{"text":"x"}}'],
  ["A0", '{"text":"A","expression":{"number":"0"}}'],
  ["A1", '{"text":"A","expression":{"number":"1"}}'],
  ["Aa", '{"text":"A","expression":{"text":"a"}}'],
  ["AA", '{"text":"A","expression":{"text":"A"}}'],
  ["A ", '{"text":"A","expression":" "}'],
  ["A\t", '{"text":"A","expression":{"symbol":"\\t"}}'],
  ["A,", '{"text":"A","expression":{"symbol":","}}'],
  ["A.", '{"text":"A","expression":{"symbol":"."}}'],
  ["A-", '{"text":"A","expression":{"symbol":"-"}}'],
  ["A'", '{"text":"A","expression":{"symbol":"\'"}}'],
  ['A"', '{"text":"A","expression":{"symbol":"\\""}}'],
  ["A=", '{"text":"A","expression":{"symbol":"="}}'],
  ["A:", '{"text":"A","expression":{"symbol":":"}}'],
  ["A_", '{"text":"A","expression":{"symbol":"_"}}'],
  ["Ab", '{"text":"A","expression":{"text":"b"}}'],
  [" <", null],
  [" >", null],
  [" /", '{"expression":{"symbol":"/"}}'],
  [" (", null],
  [" )", null],
  [" {", null],
  [" }", null],
  [" [", null],
  [" ]", null],
  [" &", '{"expression":{"symbol":"&"}}'],
  [" #", '{"expression":{"symbol":"#"}}'],
  [" ;", '{"expression":{"symbol":";"}}'],
  [" x", '{"expression":{"text":"x"}}'],
  [" 0", '{"expression":{"number":"0"}}'],
  [" 1", '{"expression":{"number":"1"}}'],
  [" a", '{"expression":{"text":"a"}}'],
  [" A", '{"expression":{"text":"A"}}'],
  ["  ", '"  "'],
  [" \t", '{"expression":{"symbol":"\\t"}}'],
  [" ,", '{"expression":{"symbol":","}}'],
  [" .", '{"expression":{"symbol":"."}}'],
  [" -", '{"expression":{"symbol":"-"}}'],
  [" '", '{"expression":{"symbol":"\'"}}'],
  [' "', '{"expression":{"symbol":"\\""}}'],
  [" =", '{"expression":{"symbol":"="}}'],
  [" :", '{"expression":{"symbol":":"}}'],
  [" _", '{"expression":{"symbol":"_"}}'],
  [" b", '{"expression":{"text":"b"}}'],
  ["\t<", null],
  ["\t>", null],
  ["\t/", '{"symbol":"\\t","expression":{"symbol":"/"}}'],
  ["\t(", null],
  ["\t)", null],
  ["\t{", null],
  ["\t}", null],
  ["\t[", null],
  ["\t]", null],
  ["\t&", '{"symbol":"\\t","expression":{"symbol":"&"}}'],
  ["\t#", '{"symbol":"\\t","expression":{"symbol":"#"}}'],
  ["\t;", '{"symbol":"\\t","expression":{"symbol":";"}}'],
  ["\tx", '{"symbol":"\\t","expression":{"text":"x"}}'],
  ["\t0", '{"symbol":"\\t","expression":{"number":"0"}}'],
  ["\t1", '{"symbol":"\\t","expression":{"number":"1"}}'],
  ["\ta", '{"symbol":"\\t","expression":{"text":"a"}}'],
  ["\tA", '{"symbol":"\\t","expression":{"text":"A"}}'],
  ["\t ", '{"symbol":"\\t","expression":" "}'],
  ["\t\t", '{"symbol":"\\t","expression":{"symbol":"\\t"}}'],
  ["\t,", '{"symbol":"\\t","expression":{"symbol":","}}'],
  ["\t.", '{"symbol":"\\t","expression":{"symbol":"."}}'],
  ["\t-", '{"symbol":"\\t","expression":{"symbol":"-"}}'],
  ["\t'", '{"symbol":"\\t","expression":{"symbol":"\'"}}'],
  ['\t"', '{"symbol":"\\t","expression":{"symbol":"\\""}}'],
  ["\t=", '{"symbol":"\\t","expression":{"symbol":"="}}'],
  ["\t:", '{"symbol":"\\t","expression":{"symbol":":"}}'],
  ["\t_", '{"symbol":"\\t","expression":{"symbol":"_"}}'],
  ["\tb", '{"symbol":"\\t","expression":{"text":"b"}}'],
  [",<", null],
  [",>", null],
  [",/", '{"symbol":",","expression":{"symbol":"/"}}'],
  [",(", null],
  [",)", null],
  [",{", null],
  [",}", null],
  [",[", null],
  [",]", null],
  [",&", '{"symbol":",","expression":{"symbol":"&"}}'],
  [",#", '{"symbol":",","expression":{"symbol":"#"}}'],
  [",;", '{"symbol":",","expression":{"symbol":";"}}'],
  [",x", '{"symbol":",","expression":{"text":"x"}}'],
  [",0", '{"symbol":",","expression":{"number":"0"}}'],
  [",1", '{"symbol":",","expression":{"number":"1"}}'],
  [",a", '{"symbol":",","expression":{"text":"a"}}'],
  [",A", '{"symbol":",","expression":{"text":"A"}}'],
  [", ", '{"symbol":",","expression":" "}'],
  [",\t", '{"symbol":",","expression":{"symbol":"\\t"}}'],
  [",,", '{"symbol":",","expression":{"symbol":","}}'],
  [",.", '{"symbol":",","expression":{"symbol":"."}}'],
  [",-", '{"symbol":",","expression":{"symbol":"-"}}'],
  [",'", '{"symbol":",","expression":{"symbol":"\'"}}'],
  [',"', '{"symbol":",","expression":{"symbol":"\\""}}'],
  [",=", '{"symbol":",","expression":{"symbol":"="}}'],
  [",:", '{"symbol":",","expression":{"symbol":":"}}'],
  [",_", '{"symbol":",","expression":{"symbol":"_"}}'],
  [",b", '{"symbol":",","expression":{"text":"b"}}'],
  [".<", null],
  [".>", null],
  ["./", '{"symbol":".","expression":{"symbol":"/"}}'],
  [".(", null],
  [".)", null],
  [".{", null],
  [".}", null],
  [".[", null],
  [".]", null],
  [".&", '{"symbol":".","expression":{"symbol":"&"}}'],
  [".#", '{"symbol":".","expression":{"symbol":"#"}}'],
  [".;", '{"symbol":".","expression":{"symbol":";"}}'],
  [".x", '{"symbol":".","expression":{"text":"x"}}'],
  [".0", '{"symbol":".","expression":{"number":"0"}}'],
  [".1", '{"symbol":".","expression":{"number":"1"}}'],
  [".a", '{"symbol":".","expression":{"text":"a"}}'],
  [".A", '{"symbol":".","expression":{"text":"A"}}'],
  [". ", '{"symbol":".","expression":" "}'],
  [".\t", '{"symbol":".","expression":{"symbol":"\\t"}}'],
  [".,", '{"symbol":".","expression":{"symbol":","}}'],
  ["..", '{"symbol":".","expression":{"symbol":"."}}'],
  [".-", '{"symbol":".","expression":{"symbol":"-"}}'],
  [".'", '{"symbol":".","expression":{"symbol":"\'"}}'],
  ['."', '{"symbol":".","expression":{"symbol":"\\""}}'],
  [".=", '{"symbol":".","expression":{"symbol":"="}}'],
  [".:", '{"symbol":".","expression":{"symbol":":"}}'],
  ["._", '{"symbol":".","expression":{"symbol":"_"}}'],
  [".b", '{"symbol":".","expression":{"text":"b"}}'],
  ["-<", null],
  ["->", null],
  ["-/", '{"symbol":"-","expression":{"symbol":"/"}}'],
  ["-(", null],
  ["-)", null],
  ["-{", null],
  ["-}", null],
  ["-[", null],
  ["-]", null],
  ["-&", '{"symbol":"-","expression":{"symbol":"&"}}'],
  ["-#", '{"symbol":"-","expression":{"symbol":"#"}}'],
  ["-;", '{"symbol":"-","expression":{"symbol":";"}}'],
  ["-x", '{"symbol":"-","expression":{"text":"x"}}'],
  ["-0", '{"symbol":"-","expression":{"number":"0"}}'],
  ["-1", '{"symbol":"-","expression":{"number":"1"}}'],
  ["-a", '{"symbol":"-","expression":{"text":"a"}}'],
  ["-A", '{"symbol":"-","expression":{"text":"A"}}'],
  ["- ", '{"symbol":"-","expression":" "}'],
  ["-\t", '{"symbol":"-","expression":{"symbol":"\\t"}}'],
  ["-,", '{"symbol":"-","expression":{"symbol":","}}'],
  ["-.", '{"symbol":"-","expression":{"symbol":"."}}'],
  ["--", '{"symbol":"-","expression":{"symbol":"-"}}'],
  ["-'", '{"symbol":"-","expression":{"symbol":"\'"}}'],
  ['-"', '{"symbol":"-","expression":{"symbol":"\\""}}'],
  ["-=", '{"symbol":"-","expression":{"symbol":"="}}'],
  ["-:", '{"symbol":"-","expression":{"symbol":":"}}'],
  ["-_", '{"symbol":"-","expression":{"symbol":"_"}}'],
  ["-b", '{"symbol":"-","expression":{"text":"b"}}'],
  ["'<", null],
  ["'>", null],
  ["'/", '{"symbol":"\'","expression":{"symbol":"/"}}'],
  ["'(", null],
  ["')", null],
  ["'{", null],
  ["'}", null],
  ["'[", null],
  ["']", null],
  ["'&", '{"symbol":"\'","expression":{"symbol":"&"}}'],
  ["'#", '{"symbol":"\'","expression":{"symbol":"#"}}'],
  ["';", '{"symbol":"\'","expression":{"symbol":";"}}'],
  ["'x", '{"symbol":"\'","expression":{"text":"x"}}'],
  ["'0", '{"symbol":"\'","expression":{"number":"0"}}'],
  ["'1", '{"symbol":"\'","expression":{"number":"1"}}'],
  ["'a", '{"symbol":"\'","expression":{"text":"a"}}'],
  ["'A", '{"symbol":"\'","expression":{"text":"A"}}'],
  ["' ", '{"symbol":"\'","expression":" "}'],
  ["'\t", '{"symbol":"\'","expression":{"symbol":"\\t"}}'],
  ["',", '{"symbol":"\'","expression":{"symbol":","}}'],
  ["'.", '{"symbol":"\'","expression":{"symbol":"."}}'],
  ["'-", '{"symbol":"\'","expression":{"symbol":"-"}}'],
  ["''", '{"symbol":"\'","expression":{"symbol":"\'"}}'],
  ["'\"", '{"symbol":"\'","expression":{"symbol":"\\""}}'],
  ["'=", '{"symbol":"\'","expression":{"symbol":"="}}'],
  ["':", '{"symbol":"\'","expression":{"symbol":":"}}'],
  ["'_", '{"symbol":"\'","expression":{"symbol":"_"}}'],
  ["'b", '{"symbol":"\'","expression":{"text":"b"}}'],
  ['"<', null],
  ['">', null],
  ['"/', '{"symbol":"\\"","expression":{"symbol":"/"}}'],
  ['"(', null],
  ['")', null],
  ['"{', null],
  ['"}', null],
  ['"[', null],
  ['"]', null],
  ['"&', '{"symbol":"\\"","expression":{"symbol":"&"}}'],
  ['"#', '{"symbol":"\\"","expression":{"symbol":"#"}}'],
  ['";', '{"symbol":"\\"","expression":{"symbol":";"}}'],
  ['"x', '{"symbol":"\\"","expression":{"text":"x"}}'],
  ['"0', '{"symbol":"\\"","expression":{"number":"0"}}'],
  ['"1', '{"symbol":"\\"","expression":{"number":"1"}}'],
  ['"a', '{"symbol":"\\"","expression":{"text":"a"}}'],
  ['"A', '{"symbol":"\\"","expression":{"text":"A"}}'],
  ['" ', '{"symbol":"\\"","expression":" "}'],
  ['"\t', '{"symbol":"\\"","expression":{"symbol":"\\t"}}'],
  ['",', '{"symbol":"\\"","expression":{"symbol":","}}'],
  ['".', '{"symbol":"\\"","expression":{"symbol":"."}}'],
  ['"-', '{"symbol":"\\"","expression":{"symbol":"-"}}'],
  ["\"'", '{"symbol":"\\"","expression":{"symbol":"\'"}}'],
  ['""', '{"symbol":"\\"","expression":{"symbol":"\\""}}'],
  ['"=', '{"symbol":"\\"","expression":{"symbol":"="}}'],
  ['":', '{"symbol":"\\"","expression":{"symbol":":"}}'],
  ['"_', '{"symbol":"\\"","expression":{"symbol":"_"}}'],
  ['"b', '{"symbol":"\\"","expression":{"text":"b"}}'],
  ["=<", null],
  ["=>", null],
  ["=/", '{"symbol":"=","expression":{"symbol":"/"}}'],
  ["=(", null],
  ["=)", null],
  ["={", null],
  ["=}", null],
  ["=[", null],
  ["=]", null],
  ["=&", '{"symbol":"=","expression":{"symbol":"&"}}'],
  ["=#", '{"symbol":"=","expression":{"symbol":"#"}}'],
  ["=;", '{"symbol":"=","expression":{"symbol":";"}}'],
  ["=x", '{"symbol":"=","expression":{"text":"x"}}'],
  ["=0", '{"symbol":"=","expression":{"number":"0"}}'],
  ["=1", '{"symbol":"=","expression":{"number":"1"}}'],
  ["=a", '{"symbol":"=","expression":{"text":"a"}}'],
  ["=A", '{"symbol":"=","expression":{"text":"A"}}'],
  ["= ", '{"symbol":"=","expression":" "}'],
  ["=\t", '{"symbol":"=","expression":{"symbol":"\\t"}}'],
  ["=,", '{"symbol":"=","expression":{"symbol":","}}'],
  ["=.", '{"symbol":"=","expression":{"symbol":"."}}'],
  ["=-", '{"symbol":"=","expression":{"symbol":"-"}}'],
  ["='", '{"symbol":"=","expression":{"symbol":"\'"}}'],
  ['="', '{"symbol":"=","expression":{"symbol":"\\""}}'],
  ["==", '{"symbol":"=","expression":{"symbol":"="}}'],
  ["=:", '{"symbol":"=","expression":{"symbol":":"}}'],
  ["=_", '{"symbol":"=","expression":{"symbol":"_"}}'],
  ["=b", '{"symbol":"=","expression":{"text":"b"}}'],
  [":<", null],
  [":>", null],
  [":/", '{"symbol":":","expression":{"symbol":"/"}}'],
  [":(", null],
  [":)", null],
  [":{", null],
  [":}", null],
  [":[", null],
  [":]", null],
  [":&", '{"symbol":":","expression":{"symbol":"&"}}'],
  [":#", '{"symbol":":","expression":{"symbol":"#"}}'],
  [":;", '{"symbol":":","expression":{"symbol":";"}}'],
  [":x", '{"symbol":":","expression":{"text":"x"}}'],
  [":0", '{"symbol":":","expression":{"number":"0"}}'],
  [":1", '{"symbol":":","expression":{"number":"1"}}'],
  [":a", '{"symbol":":","expression":{"text":"a"}}'],
  [":A", '{"symbol":":","expression":{"text":"A"}}'],
  [": ", '{"symbol":":","expression":" "}'],
  [":\t", '{"symbol":":","expression":{"symbol":"\\t"}}'],
  [":,", '{"symbol":":","expression":{"symbol":","}}'],
  [":.", '{"symbol":":","expression":{"symbol":"."}}'],
  [":-", '{"symbol":":","expression":{"symbol":"-"}}'],
  [":'", '{"symbol":":","expression":{"symbol":"\'"}}'],
  [':"', '{"symbol":":","expression":{"symbol":"\\""}}'],
  [":=", '{"symbol":":","expression":{"symbol":"="}}'],
  ["::", '{"symbol":":","expression":{"symbol":":"}}'],
  [":_", '{"symbol":":","expression":{"symbol":"_"}}'],
  [":b", '{"symbol":":","expression":{"text":"b"}}'],
  ["_<", null],
  ["_>", null],
  ["_/", '{"symbol":"_","expression":{"symbol":"/"}}'],
  ["_(", null],
  ["_)", null],
  ["_{", null],
  ["_}", null],
  ["_[", null],
  ["_]", null],
  ["_&", '{"symbol":"_","expression":{"symbol":"&"}}'],
  ["_#", '{"symbol":"_","expression":{"symbol":"#"}}'],
  ["_;", '{"symbol":"_","expression":{"symbol":";"}}'],
  ["_x", '{"symbol":"_","expression":{"text":"x"}}'],
  ["_0", '{"symbol":"_","expression":{"number":"0"}}'],
  ["_1", '{"symbol":"_","expression":{"number":"1"}}'],
  ["_a", '{"symbol":"_","expression":{"text":"a"}}'],
  ["_A", '{"symbol":"_","expression":{"text":"A"}}'],
  ["_ ", '{"symbol":"_","expression":" "}'],
  ["_\t", '{"symbol":"_","expression":{"symbol":"\\t"}}'],
  ["_,", '{"symbol":"_","expression":{"symbol":","}}'],
  ["_.", '{"symbol":"_","expression":{"symbol":"."}}'],
  ["_-", '{"symbol":"_","expression":{"symbol":"-"}}'],
  ["_'", '{"symbol":"_","expression":{"symbol":"\'"}}'],
  ['_"', '{"symbol":"_","expression":{"symbol":"\\""}}'],
  ["_=", '{"symbol":"_","expression":{"symbol":"="}}'],
  ["_:", '{"symbol":"_","expression":{"symbol":":"}}'],
  ["__", '{"symbol":"_","expression":{"symbol":"_"}}'],
  ["_b", '{"symbol":"_","expression":{"text":"b"}}'],
  ["b<", null],
  ["b>", null],
  ["b/", '{"text":"b","expression":{"symbol":"/"}}'],
  ["b(", null],
  ["b)", null],
  ["b{", null],
  ["b}", null],
  ["b[", null],
  ["b]", null],
  ["b&", '{"text":"b","expression":{"symbol":"&"}}'],
  ["b#", '{"text":"b","expression":{"symbol":"#"}}'],
  ["b;", '{"text":"b","expression":{"symbol":";"}}'],
  ["bx", '{"text":"b","expression":{"text":"x"}}'],
  ["b0", '{"text":"b","expression":{"number":"0"}}'],
  ["b1", '{"text":"b","expression":{"number":"1"}}'],
  ["ba", '{"text":"b","expression":{"text":"a"}}'],
  ["bA", '{"text":"b","expression":{"text":"A"}}'],
  ["b ", '{"text":"b","expression":" "}'],
  ["b\t", '{"text":"b","expression":{"symbol":"\\t"}}'],
  ["b,", '{"text":"b","expression":{"symbol":","}}'],
  ["b.", '{"text":"b","expression":{"symbol":"."}}'],
  ["b-", '{"text":"b","expression":{"symbol":"-"}}'],
  ["b'", '{"text":"b","expression":{"symbol":"\'"}}'],
  ['b"', '{"text":"b","expression":{"symbol":"\\""}}'],
  ["b=", '{"text":"b","expression":{"symbol":"="}}'],
  ["b:", '{"text":"b","expression":{"symbol":":"}}'],
  ["b_", '{"text":"b","expression":{"symbol":"_"}}'],
  ["bb", '{"text":"b","expression":{"text":"b"}}'],
  ["<<<", null],
  ["<<>", null],
  ["<</", null],
  ["<<i", null],
  ["<<(", null],
  ["<<)", null],
  ["<<&", null],
  ["<<;", null],
  ["<<b", null],
  ["<<1", null],
  ["<><", null],
  ["<>>", null],
  ["<>/", null],
  ["<>i", null],
  ["<>(", null],
  ["<>)", null],
  ["<>&", null],
  ["<>;", null],
  ["<>b", null],
  ["<>1", null],
  ["</<", null],
  ["</>", null],
  ["<//", null],
  ["</i", null],
  ["</(", null],
  ["</)", null],
  ["</&", null],
  ["</;", null],
  ["</b", null],
  ["</1", null],
  ["<i<", null],
  ["<i>", null],
  ["<i/", null],
  ["<ii", null],
  ["<i(", null],
  ["<i)", null],
  ["<i&", null],
  ["<i;", null],
  ["<ib", null],
  ["<i1", null],
  ["<(<", null],
  ["<(>", null],
  ["<(/", null],
  ["<(i", null],
  ["<((", null],
  ["<()", null],
  ["<(&", null],
  ["<(;", null],
  ["<(b", null],
  ["<(1", null],
  ["<)<", null],
  ["<)>", null],
  ["<)/", null],
  ["<)i", null],
  ["<)(", null],
  ["<))", null],
  ["<)&", null],
  ["<);", null],
  ["<)b", null],
  ["<)1", null],
  ["<&<", null],
  ["<&>", null],
  ["<&/", null],
  ["<&i", null],
  ["<&(", null],
  ["<&)", null],
  ["<&&", null],
  ["<&;", null],
  ["<&b", null],
  ["<&1", null],
  ["<;<", null],
  ["<;>", null],
  ["<;/", null],
  ["<;i", null],
  ["<;(", null],
  ["<;)", null],
  ["<;&", null],
  ["<;;", null],
  ["<;b", null],
  ["<;1", null],
  ["<b<", null],
  ["<b>", null],
  ["<b/", null],
  ["<bi", null],
  ["<b(", null],
  ["<b)", null],
  ["<b&", null],
  ["<b;", null],
  ["<bb", null],
  ["<b1", null],
  ["<1<", null],
  ["<1>", null],
  ["<1/", null],
  ["<1i", null],
  ["<1(", null],
  ["<1)", null],
  ["<1&", null],
  ["<1;", null],
  ["<1b", null],
  ["<11", null],
  ["><<", null],
  ["><>", null],
  ["></", null],
  ["><i", null],
  ["><(", null],
  ["><)", null],
  ["><&", null],
  ["><;", null],
  ["><b", null],
  ["><1", null],
  [">><", null],
  [">>>", null],
  [">>/", null],
  [">>i", null],
  [">>(", null],
  [">>)", null],
  [">>&", null],
  [">>;", null],
  [">>b", null],
  [">>1", null],
  [">/<", null],
  [">/>", null],
  [">//", null],
  [">/i", null],
  [">/(", null],
  [">/)", null],
  [">/&", null],
  [">/;", null],
  [">/b", null],
  [">/1", null],
  [">i<", null],
  [">i>", null],
  [">i/", null],
  [">ii", null],
  [">i(", null],
  [">i)", null],
  [">i&", null],
  [">i;", null],
  [">ib", null],
  [">i1", null],
  [">(<", null],
  [">(>", null],
  [">(/", null],
  [">(i", null],
  [">((", null],
  [">()", null],
  [">(&", null],
  [">(;", null],
  [">(b", null],
  [">(1", null],
  [">)<", null],
  [">)>", null],
  [">)/", null],
  [">)i", null],
  [">)(", null],
  [">))", null],
  [">)&", null],
  [">);", null],
  [">)b", null],
  [">)1", null],
  [">&<", null],
  [">&>", null],
  [">&/", null],
  [">&i", null],
  [">&(", null],
  [">&)", null],
  [">&&", null],
  [">&;", null],
  [">&b", null],
  [">&1", null],
  [">;<", null],
  [">;>", null],
  [">;/", null],
  [">;i", null],
  [">;(", null],
  [">;)", null],
  [">;&", null],
  [">;;", null],
  [">;b", null],
  [">;1", null],
  [">b<", null],
  [">b>", null],
  [">b/", null],
  [">bi", null],
  [">b(", null],
  [">b)", null],
  [">b&", null],
  [">b;", null],
  [">bb", null],
  [">b1", null],
  [">1<", null],
  [">1>", null],
  [">1/", null],
  [">1i", null],
  [">1(", null],
  [">1)", null],
  [">1&", null],
  [">1;", null],
  [">1b", null],
  [">11", null],
  ["/<<", null],
  ["/<>", null],
  ["/</", null],
  ["/<i", null],
  ["/<(", null],
  ["/<)", null],
  ["/<&", null],
  ["/<;", null],
  ["/<b", null],
  ["/<1", null],
  ["/><", null],
  ["/>>", null],
  ["/>/", null],
  ["/>i", null],
  ["/>(", null],
  ["/>)", null],
  ["/>&", null],
  ["/>;", null],
  ["/>b", null],
  ["/>1", null],
  ["//<", null],
  ["//>", null],
  ["///", '{"symbol":"/","expression":{"symbol":"/","expression":{"symbol":"/"}}}'],
  ["//i", '{"symbol":"/","expression":{"symbol":"/","expression":{"text":"i"}}}'],
  ["//(", null],
  ["//)", null],
  ["//&", '{"symbol":"/","expression":{"symbol":"/","expression":{"symbol":"&"}}}'],
  ["//;", '{"symbol":"/","expression":{"symbol":"/","expression":{"symbol":";"}}}'],
  ["//b", '{"symbol":"/","expression":{"symbol":"/","expression":{"text":"b"}}}'],
  ["//1", '{"symbol":"/","expression":{"symbol":"/","expression":{"number":"1"}}}'],
  ["/i<", null],
  ["/i>", null],
  ["/i/", '{"symbol":"/","expression":{"text":"i","expression":{"symbol":"/"}}}'],
  ["/ii", '{"symbol":"/","expression":{"text":"i","expression":{"text":"i"}}}'],
  ["/i(", null],
  ["/i)", null],
  ["/i&", '{"symbol":"/","expression":{"text":"i","expression":{"symbol":"&"}}}'],
  ["/i;", '{"symbol":"/","expression":{"text":"i","expression":{"symbol":";"}}}'],
  ["/ib", '{"symbol":"/","expression":{"text":"i","expression":{"text":"b"}}}'],
  ["/i1", '{"symbol":"/","expression":{"text":"i","expression":{"number":"1"}}}'],
  ["/(<", null],
  ["/(>", null],
  ["/(/", null],
  ["/(i", null],
  ["/((", null],
  ["/()", null],
  ["/(&", null],
  ["/(;", null],
  ["/(b", null],
  ["/(1", null],
  ["/)<", null],
  ["/)>", null],
  ["/)/", null],
  ["/)i", null],
  ["/)(", null],
  ["/))", null],
  ["/)&", null],
  ["/);", null],
  ["/)b", null],
  ["/)1", null],
  ["/&<", null],
  ["/&>", null],
  ["/&/", '{"symbol":"/","expression":{"symbol":"&","expression":{"symbol":"/"}}}'],
  ["/&i", '{"symbol":"/","expression":{"symbol":"&","expression":{"text":"i"}}}'],
  ["/&(", null],
  ["/&)", null],
  ["/&&", '{"symbol":"/","expression":{"symbol":"&","expression":{"symbol":"&"}}}'],
  ["/&;", '{"symbol":"/","expression":{"symbol":"&","expression":{"symbol":";"}}}'],
  ["/&b", '{"symbol":"/","expression":{"symbol":"&","expression":{"text":"b"}}}'],
  ["/&1", '{"symbol":"/","expression":{"symbol":"&","expression":{"number":"1"}}}'],
  ["/;<", null],
  ["/;>", null],
  ["/;/", '{"symbol":"/","expression":{"symbol":";","expression":{"symbol":"/"}}}'],
  ["/;i", '{"symbol":"/","expression":{"symbol":";","expression":{"text":"i"}}}'],
  ["/;(", null],
  ["/;)", null],
  ["/;&", '{"symbol":"/","expression":{"symbol":";","expression":{"symbol":"&"}}}'],
  ["/;;", '{"symbol":"/","expression":{"symbol":";","expression":{"symbol":";"}}}'],
  ["/;b", '{"symbol":"/","expression":{"symbol":";","expression":{"text":"b"}}}'],
  ["/;1", '{"symbol":"/","expression":{"symbol":";","expression":{"number":"1"}}}'],
  ["/b<", null],
  ["/b>", null],
  ["/b/", '{"symbol":"/","expression":{"text":"b","expression":{"symbol":"/"}}}'],
  ["/bi", '{"symbol":"/","expression":{"text":"b","expression":{"text":"i"}}}'],
  ["/b(", null],
  ["/b)", null],
  ["/b&", '{"symbol":"/","expression":{"text":"b","expression":{"symbol":"&"}}}'],
  ["/b;", '{"symbol":"/","expression":{"text":"b","expression":{"symbol":";"}}}'],
  ["/bb", '{"symbol":"/","expression":{"text":"b","expression":{"text":"b"}}}'],
  ["/b1", '{"symbol":"/","expression":{"text":"b","expression":{"number":"1"}}}'],
  ["/1<", null],
  ["/1>", null],
  ["/1/", '{"symbol":"/","expression":{"number":"1","expression":{"symbol":"/"}}}'],
  ["/1i", '{"symbol":"/","expression":{"number":"1","expression":{"text":"i"}}}'],
  ["/1(", null],
  ["/1)", null],
  ["/1&", '{"symbol":"/","expression":{"number":"1","expression":{"symbol":"&"}}}'],
  ["/1;", '{"symbol":"/","expression":{"number":"1","expression":{"symbol":";"}}}'],
  ["/1b", '{"symbol":"/","expression":{"number":"1","expression":{"text":"b"}}}'],
  ["/11", '{"symbol":"/","expression":{"number":"11"}}'],
  ["i<<", null],
  ["i<>", null],
  ["i</", null],
  ["i<i", null],
  ["i<(", null],
  ["i<)", null],
  ["i<&", null],
  ["i<;", null],
  ["i<b", null],
  ["i<1", null],
  ["i><", null],
  ["i>>", null],
  ["i>/", null],
  ["i>i", null],
  ["i>(", null],
  ["i>)", null],
  ["i>&", null],
  ["i>;", null],
  ["i>b", null],
  ["i>1", null],
  ["i/<", null],
  ["i/>", null],
  ["i//", '{"text":"i","expression":{"symbol":"/","expression":{"symbol":"/"}}}'],
  ["i/i", '{"text":"i","expression":{"symbol":"/","expression":{"text":"i"}}}'],
  ["i/(", null],
  ["i/)", null],
  ["i/&", '{"text":"i","expression":{"symbol":"/","expression":{"symbol":"&"}}}'],
  ["i/;", '{"text":"i","expression":{"symbol":"/","expression":{"symbol":";"}}}'],
  ["i/b", '{"text":"i","expression":{"symbol":"/","expression":{"text":"b"}}}'],
  ["i/1", '{"text":"i","expression":{"symbol":"/","expression":{"number":"1"}}}'],
  ["ii<", null],
  ["ii>", null],
  ["ii/", '{"text":"i","expression":{"text":"i","expression":{"symbol":"/"}}}'],
  ["iii", '{"text":"i","expression":{"text":"i","expression":{"text":"i"}}}'],
  ["ii(", null],
  ["ii)", null],
  ["ii&", '{"text":"i","expression":{"text":"i","expression":{"symbol":"&"}}}'],
  ["ii;", '{"text":"i","expression":{"text":"i","expression":{"symbol":";"}}}'],
  ["iib", '{"text":"i","expression":{"text":"i","expression":{"text":"b"}}}'],
  ["ii1", '{"text":"i","expression":{"text":"i","expression":{"number":"1"}}}'],
  ["i(<", null],
  ["i(>", null],
  ["i(/", null],
  ["i(i", null],
  ["i((", null],
  ["i()", null],
  ["i(&", null],
  ["i(;", null],
  ["i(b", null],
  ["i(1", null],
  ["i)<", null],
  ["i)>", null],
  ["i)/", null],
  ["i)i", null],
  ["i)(", null],
  ["i))", null],
  ["i)&", null],
  ["i);", null],
  ["i)b", null],
  ["i)1", null],
  ["i&<", null],
  ["i&>", null],
  ["i&/", '{"text":"i","expression":{"symbol":"&","expression":{"symbol":"/"}}}'],
  ["i&i", '{"text":"i","expression":{"symbol":"&","expression":{"text":"i"}}}'],
  ["i&(", null],
  ["i&)", null],
  ["i&&", '{"text":"i","expression":{"symbol":"&","expression":{"symbol":"&"}}}'],
  ["i&;", '{"text":"i","expression":{"symbol":"&","expression":{"symbol":";"}}}'],
  ["i&b", '{"text":"i","expression":{"symbol":"&","expression":{"text":"b"}}}'],
  ["i&1", '{"text":"i","expression":{"symbol":"&","expression":{"number":"1"}}}'],
  ["i;<", null],
  ["i;>", null],
  ["i;/", '{"text":"i","expression":{"symbol":";","expression":{"symbol":"/"}}}'],
  ["i;i", '{"text":"i","expression":{"symbol":";","expression":{"text":"i"}}}'],
  ["i;(", null],
  ["i;)", null],
  ["i;&", '{"text":"i","expression":{"symbol":";","expression":{"symbol":"&"}}}'],
  ["i;;", '{"text":"i","expression":{"symbol":";","expression":{"symbol":";"}}}'],
  ["i;b", '{"text":"i","expression":{"symbol":";","expression":{"text":"b"}}}'],
  ["i;1", '{"text":"i","expression":{"symbol":";","expression":{"number":"1"}}}'],
  ["ib<", null],
  ["ib>", null],
  ["ib/", '{"text":"i","expression":{"text":"b","expression":{"symbol":"/"}}}'],
  ["ibi", '{"text":"i","expression":{"text":"b","expression":{"text":"i"}}}'],
  ["ib(", null],
  ["ib)", null],
  ["ib&", '{"text":"i","expression":{"text":"b","expression":{"symbol":"&"}}}'],
  ["ib;", '{"text":"i","expression":{"text":"b","expression":{"symbol":";"}}}'],
  ["ibb", '{"text":"i","expression":{"text":"b","expression":{"text":"b"}}}'],
  ["ib1", '{"text":"i","expression":{"text":"b","expression":{"number":"1"}}}'],
  ["i1<", null],
  ["i1>", null],
  ["i1/", '{"text":"i","expression":{"number":"1","expression":{"symbol":"/"}}}'],
  ["i1i", '{"text":"i","expression":{"number":"1","expression":{"text":"i"}}}'],
  ["i1(", null],
  ["i1)", null],
  ["i1&", '{"text":"i","expression":{"number":"1","expression":{"symbol":"&"}}}'],
  ["i1;", '{"text":"i","expression":{"number":"1","expression":{"symbol":";"}}}'],
  ["i1b", '{"text":"i","expression":{"number":"1","expression":{"text":"b"}}}'],
  ["i11", '{"text":"i","expression":{"number":"11"}}'],
  ["(<<", null],
  ["(<>", null],
  ["(</", null],
  ["(<i", null],
  ["(<(", null],
  ["(<)", null],
  ["(<&", null],
  ["(<;", null],
  ["(<b", null],
  ["(<1", null],
  ["(><", null],
  ["(>>", null],
  ["(>/", null],
  ["(>i", null],
  ["(>(", null],
  ["(>)", null],
  ["(>&", null],
  ["(>;", null],
  ["(>b", null],
  ["(>1", null],
  ["(/<", null],
  ["(/>", null],
  ["(//", null],
  ["(/i", null],
  ["(/(", null],
  ["(/)", '{"parse_parenthesis":{"lparen":"(","symbol":"/","rparen":")"}}'],
  ["(/&", null],
  ["(/;", null],
  ["(/b", null],
  ["(/1", null],
  ["(i<", null],
  ["(i>", null],
  ["(i/", null],
  ["(ii", null],
  ["(i(", null],
  ["(i)", '{"parse_parenthesis":{"lparen":"(","text":"i","rparen":")"}}'],
  ["(i&", null],
  ["(i;", null],
  ["(ib", null],
  ["(i1", null],
  ["((<", null],
  ["((>", null],
  ["((/", null],
  ["((i", null],
  ["(((", null],
  ["(()", null],
  ["((&", null],
  ["((;", null],
  ["((b", null],
  ["((1", null],
  ["()<", null],
  ["()>", null],
  ["()/", null],
  ["()i", null],
  ["()(", null],
  ["())", null],
  ["()&", null],
  ["();", null],
  ["()b", null],
  ["()1", null],
  ["(&<", null],
  ["(&>", null],
  ["(&/", null],
  ["(&i", null],
  ["(&(", null],
  ["(&)", '{"parse_parenthesis":{"lparen":"(","symbol":"&","rparen":")"}}'],
  ["(&&", null],
  ["(&;", null],
  ["(&b", null],
  ["(&1", null],
  ["(;<", null],
  ["(;>", null],
  ["(;/", null],
  ["(;i", null],
  ["(;(", null],
  ["(;)", '{"parse_parenthesis":{"lparen":"(","symbol":";","rparen":")"}}'],
  ["(;&", null],
  ["(;;", null],
  ["(;b", null],
  ["(;1", null],
  ["(b<", null],
  ["(b>", null],
  ["(b/", null],
  ["(bi", null],
  ["(b(", null],
  ["(b)", '{"parse_parenthesis":{"lparen":"(","text":"b","rparen":")"}}'],
  ["(b&", null],
  ["(b;", null],
  ["(bb", null],
  ["(b1", null],
  ["(1<", null],
  ["(1>", null],
  ["(1/", null],
  ["(1i", null],
  ["(1(", null],
  ["(1)", '{"parse_parenthesis":{"lparen":"(","number":"1","rparen":")"}}'],
  ["(1&", null],
  ["(1;", null],
  ["(1b", null],
  ["(11", null],
  [")<<", null],
  [")<>", null],
  [")</", null],
  [")<i", null],
  [")<(", null],
  [")<)", null],
  [")<&", null],
  [")<;", null],
  [")<b", null],
  [")<1", null],
  [")><", null],
  [")>>", null],
  [")>/", null],
  [")>i", null],
  [")>(", null],
  [")>)", null],
  [")>&", null],
  [")>;", null],
  [")>b", null],
  [")>1", null],
  [")/<", null],
  [")/>", null],
  [")//", null],
  [")/i", null],
  [")/(", null],
  [")/)", null],
  [")/&", null],
  [")/;", null],
  [")/b", null],
  [")/1", null],
  [")i<", null],
  [")i>", null],
  [")i/", null],
  [")ii", null],
  [")i(", null],
  [")i)", null],
  [")i&", null],
  [")i;", null],
  [")ib", null],
  [")i1", null],
  [")(<", null],
  [")(>", null],
  [")(/", null],
  [")(i", null],
  [")((", null],
  [")()", null],
  [")(&", null],
  [")(;", null],
  [")(b", null],
  [")(1", null],
  ["))<", null],
  ["))>", null],
  ["))/", null],
  ["))i", null],
  ["))(", null],
  [")))", null],
  ["))&", null],
  ["));", null],
  ["))b", null],
  ["))1", null],
  [")&<", null],
  [")&>", null],
  [")&/", null],
  [")&i", null],
  [")&(", null],
  [")&)", null],
  [")&&", null],
  [")&;", null],
  [")&b", null],
  [")&1", null],
  [");<", null],
  [");>", null],
  [");/", null],
  [");i", null],
  [");(", null],
  [");)", null],
  [");&", null],
  [");;", null],
  [");b", null],
  [");1", null],
  [")b<", null],
  [")b>", null],
  [")b/", null],
  [")bi", null],
  [")b(", null],
  [")b)", null],
  [")b&", null],
  [")b;", null],
  [")bb", null],
  [")b1", null],
  [")1<", null],
  [")1>", null],
  [")1/", null],
  [")1i", null],
  [")1(", null],
  [")1)", null],
  [")1&", null],
  [")1;", null],
  [")1b", null],
  [")11", null],
  ["&<<", null],
  ["&<>", null],
  ["&</", null],
  ["&<i", null],
  ["&<(", null],
  ["&<)", null],
  ["&<&", null],
  ["&<;", null],
  ["&<b", null],
  ["&<1", null],
  ["&><", null],
  ["&>>", null],
  ["&>/", null],
  ["&>i", null],
  ["&>(", null],
  ["&>)", null],
  ["&>&", null],
  ["&>;", null],
  ["&>b", null],
  ["&>1", null],
  ["&/<", null],
  ["&/>", null],
  ["&//", '{"symbol":"&","expression":{"symbol":"/","expression":{"symbol":"/"}}}'],
  ["&/i", '{"symbol":"&","expression":{"symbol":"/","expression":{"text":"i"}}}'],
  ["&/(", null],
  ["&/)", null],
  ["&/&", '{"symbol":"&","expression":{"symbol":"/","expression":{"symbol":"&"}}}'],
  ["&/;", '{"symbol":"&","expression":{"symbol":"/","expression":{"symbol":";"}}}'],
  ["&/b", '{"symbol":"&","expression":{"symbol":"/","expression":{"text":"b"}}}'],
  ["&/1", '{"symbol":"&","expression":{"symbol":"/","expression":{"number":"1"}}}'],
  ["&i<", null],
  ["&i>", null],
  ["&i/", '{"symbol":"&","expression":{"text":"i","expression":{"symbol":"/"}}}'],
  ["&ii", '{"symbol":"&","expression":{"text":"i","expression":{"text":"i"}}}'],
  ["&i(", null],
  ["&i)", null],
  ["&i&", '{"symbol":"&","expression":{"text":"i","expression":{"symbol":"&"}}}'],
  ["&i;", '{"symbol":"&i;"}'],
  ["&ib", '{"symbol":"&","expression":{"text":"i","expression":{"text":"b"}}}'],
  ["&i1", '{"symbol":"&","expression":{"text":"i","expression":{"number":"1"}}}'],
  ["&(<", null],
  ["&(>", null],
  ["&(/", null],
  ["&(i", null],
  ["&((", null],
  ["&()", null],
  ["&(&", null],
  ["&(;", null],
  ["&(b", null],
  ["&(1", null],
  ["&)<", null],
  ["&)>", null],
  ["&)/", null],
  ["&)i", null],
  ["&)(", null],
  ["&))", null],
  ["&)&", null],
  ["&);", null],
  ["&)b", null],
  ["&)1", null],
  ["&&<", null],
  ["&&>", null],
  ["&&/", '{"symbol":"&","expression":{"symbol":"&","expression":{"symbol":"/"}}}'],
  ["&&i", '{"symbol":"&","expression":{"symbol":"&","expression":{"text":"i"}}}'],
  ["&&(", null],
  ["&&)", null],
  ["&&&", '{"symbol":"&","expression":{"symbol":"&","expression":{"symbol":"&"}}}'],
  ["&&;", '{"symbol":"&","expression":{"symbol":"&","expression":{"symbol":";"}}}'],
  ["&&b", '{"symbol":"&","expression":{"symbol":"&","expression":{"text":"b"}}}'],
  ["&&1", '{"symbol":"&","expression":{"symbol":"&","expression":{"number":"1"}}}'],
  ["&;<", null],
  ["&;>", null],
  ["&;/", '{"symbol":"&","expression":{"symbol":";","expression":{"symbol":"/"}}}'],
  ["&;i", '{"symbol":"&","expression":{"symbol":";","expression":{"text":"i"}}}'],
  ["&;(", null],
  ["&;)", null],
  ["&;&", '{"symbol":"&","expression":{"symbol":";","expression":{"symbol":"&"}}}'],
  ["&;;", '{"symbol":"&","expression":{"symbol":";","expression":{"symbol":";"}}}'],
  ["&;b", '{"symbol":"&","expression":{"symbol":";","expression":{"text":"b"}}}'],
  ["&;1", '{"symbol":"&","expression":{"symbol":";","expression":{"number":"1"}}}'],
  ["&b<", null],
  ["&b>", null],
  ["&b/", '{"symbol":"&","expression":{"text":"b","expression":{"symbol":"/"}}}'],
  ["&bi", '{"symbol":"&","expression":{"text":"b","expression":{"text":"i"}}}'],
  ["&b(", null],
  ["&b)", null],
  ["&b&", '{"symbol":"&","expression":{"text":"b","expression":{"symbol":"&"}}}'],
  ["&b;", '{"symbol":"&b;"}'],
  ["&bb", '{"symbol":"&","expression":{"text":"b","expression":{"text":"b"}}}'],
  ["&b1", '{"symbol":"&","expression":{"text":"b","expression":{"number":"1"}}}'],
  ["&1<", null],
  ["&1>", null],
  ["&1/", '{"symbol":"&","expression":{"number":"1","expression":{"symbol":"/"}}}'],
  ["&1i", '{"symbol":"&","expression":{"number":"1","expression":{"text":"i"}}}'],
  ["&1(", null],
  ["&1)", null],
  ["&1&", '{"symbol":"&","expression":{"number":"1","expression":{"symbol":"&"}}}'],
  ["&1;", '{"symbol":"&","expression":{"number":"1","expression":{"symbol":";"}}}'],
  ["&1b", '{"symbol":"&","expression":{"number":"1","expression":{"text":"b"}}}'],
  ["&11", '{"symbol":"&","expression":{"number":"11"}}'],
  [";<<", null],
  [";<>", null],
  [";</", null],
  [";<i", null],
  [";<(", null],
  [";<)", null],
  [";<&", null],
  [";<;", null],
  [";<b", null],
  [";<1", null],
  [";><", null],
  [";>>", null],
  [";>/", null],
  [";>i", null],
  [";>(", null],
  [";>)", null],
  [";>&", null],
  [";>;", null],
  [";>b", null],
  [";>1", null],
  [";/<", null],
  [";/>", null],
  [";//", '{"symbol":";","expression":{"symbol":"/","expression":{"symbol":"/"}}}'],
  [";/i", '{"symbol":";","expression":{"symbol":"/","expression":{"text":"i"}}}'],
  [";/(", null],
  [";/)", null],
  [";/&", '{"symbol":";","expression":{"symbol":"/","expression":{"symbol":"&"}}}'],
  [";/;", '{"symbol":";","expression":{"symbol":"/","expression":{"symbol":";"}}}'],
  [";/b", '{"symbol":";","expression":{"symbol":"/","expression":{"text":"b"}}}'],
  [";/1", '{"symbol":";","expression":{"symbol":"/","expression":{"number":"1"}}}'],
  [";i<", null],
  [";i>", null],
  [";i/", '{"symbol":";","expression":{"text":"i","expression":{"symbol":"/"}}}'],
  [";ii", '{"symbol":";","expression":{"text":"i","expression":{"text":"i"}}}'],
  [";i(", null],
  [";i)", null],
  [";i&", '{"symbol":";","expression":{"text":"i","expression":{"symbol":"&"}}}'],
  [";i;", '{"symbol":";","expression":{"text":"i","expression":{"symbol":";"}}}'],
  [";ib", '{"symbol":";","expression":{"text":"i","expression":{"text":"b"}}}'],
  [";i1", '{"symbol":";","expression":{"text":"i","expression":{"number":"1"}}}'],
  [";(<", null],
  [";(>", null],
  [";(/", null],
  [";(i", null],
  [";((", null],
  [";()", null],
  [";(&", null],
  [";(;", null],
  [";(b", null],
  [";(1", null],
  [";)<", null],
  [";)>", null],
  [";)/", null],
  [";)i", null],
  [";)(", null],
  [";))", null],
  [";)&", null],
  [";);", null],
  [";)b", null],
  [";)1", null],
  [";&<", null],
  [";&>", null],
  [";&/", '{"symbol":";","expression":{"symbol":"&","expression":{"symbol":"/"}}}'],
  [";&i", '{"symbol":";","expression":{"symbol":"&","expression":{"text":"i"}}}'],
  [";&(", null],
  [";&)", null],
  [";&&", '{"symbol":";","expression":{"symbol":"&","expression":{"symbol":"&"}}}'],
  [";&;", '{"symbol":";","expression":{"symbol":"&","expression":{"symbol":";"}}}'],
  [";&b", '{"symbol":";","expression":{"symbol":"&","expression":{"text":"b"}}}'],
  [";&1", '{"symbol":";","expression":{"symbol":"&","expression":{"number":"1"}}}'],
  [";;<", null],
  [";;>", null],
  [";;/", '{"symbol":";","expression":{"symbol":";","expression":{"symbol":"/"}}}'],
  [";;i", '{"symbol":";","expression":{"symbol":";","expression":{"text":"i"}}}'],
  [";;(", null],
  [";;)", null],
  [";;&", '{"symbol":";","expression":{"symbol":";","expression":{"symbol":"&"}}}'],
  [";;;", '{"symbol":";","expression":{"symbol":";","expression":{"symbol":";"}}}'],
  [";;b", '{"symbol":";","expression":{"symbol":";","expression":{"text":"b"}}}'],
  [";;1", '{"symbol":";","expression":{"symbol":";","expression":{"number":"1"}}}'],
  [";b<", null],
  [";b>", null],
  [";b/", '{"symbol":";","expression":{"text":"b","expression":{"symbol":"/"}}}'],
  [";bi", '{"symbol":";","expression":{"text":"b","expression":{"text":"i"}}}'],
  [";b(", null],
  [";b)", null],
  [";b&", '{"symbol":";","expression":{"text":"b","expression":{"symbol":"&"}}}'],
  [";b;", '{"symbol":";","expression":{"text":"b","expression":{"symbol":";"}}}'],
  [";bb", '{"symbol":";","expression":{"text":"b","expression":{"text":"b"}}}'],
  [";b1", '{"symbol":";","expression":{"text":"b","expression":{"number":"1"}}}'],
  [";1<", null],
  [";1>", null],
  [";1/", '{"symbol":";","expression":{"number":"1","expression":{"symbol":"/"}}}'],
  [";1i", '{"symbol":";","expression":{"number":"1","expression":{"text":"i"}}}'],
  [";1(", null],
  [";1)", null],
  [";1&", '{"symbol":";","expression":{"number":"1","expression":{"symbol":"&"}}}'],
  [";1;", '{"symbol":";","expression":{"number":"1","expression":{"symbol":";"}}}'],
  [";1b", '{"symbol":";","expression":{"number":"1","expression":{"text":"b"}}}'],
  [";11", '{"symbol":";","expression":{"number":"11"}}'],
  ["b<<", null],
  ["b<>", null],
  ["b</", null],
  ["b<i", null],
  ["b<(", null],
  ["b<)", null],
  ["b<&", null],
  ["b<;", null],
  ["b<b", null],
  ["b<1", null],
  ["b><", null],
  ["b>>", null],
  ["b>/", null],
  ["b>i", null],
  ["b>(", null],
  ["b>)", null],
  ["b>&", null],
  ["b>;", null],
  ["b>b", null],
  ["b>1", null],
  ["b/<", null],
  ["b/>", null],
  ["b//", '{"text":"b","expression":{"symbol":"/","expression":{"symbol":"/"}}}'],
  ["b/i", '{"text":"b","expression":{"symbol":"/","expression":{"text":"i"}}}'],
  ["b/(", null],
  ["b/)", null],
  ["b/&", '{"text":"b","expression":{"symbol":"/","expression":{"symbol":"&"}}}'],
  ["b/;", '{"text":"b","expression":{"symbol":"/","expression":{"symbol":";"}}}'],
  ["b/b", '{"text":"b","expression":{"symbol":"/","expression":{"text":"b"}}}'],
  ["b/1", '{"text":"b","expression":{"symbol":"/","expression":{"number":"1"}}}'],
  ["bi<", null],
  ["bi>", null],
  ["bi/", '{"text":"b","expression":{"text":"i","expression":{"symbol":"/"}}}'],
  ["bii", '{"text":"b","expression":{"text":"i","expression":{"text":"i"}}}'],
  ["bi(", null],
  ["bi)", null],
  ["bi&", '{"text":"b","expression":{"text":"i","expression":{"symbol":"&"}}}'],
  ["bi;", '{"text":"b","expression":{"text":"i","expression":{"symbol":";"}}}'],
  ["bib", '{"text":"b","expression":{"text":"i","expression":{"text":"b"}}}'],
  ["bi1", '{"text":"b","expression":{"text":"i","expression":{"number":"1"}}}'],
  ["b(<", null],
  ["b(>", null],
  ["b(/", null],
  ["b(i", null],
  ["b((", null],
  ["b()", null],
  ["b(&", null],
  ["b(;", null],
  ["b(b", null],
  ["b(1", null],
  ["b)<", null],
  ["b)>", null],
  ["b)/", null],
  ["b)i", null],
  ["b)(", null],
  ["b))", null],
  ["b)&", null],
  ["b);", null],
  ["b)b", null],
  ["b)1", null],
  ["b&<", null],
  ["b&>", null],
  ["b&/", '{"text":"b","expression":{"symbol":"&","expression":{"symbol":"/"}}}'],
  ["b&i", '{"text":"b","expression":{"symbol":"&","expression":{"text":"i"}}}'],
  ["b&(", null],
  ["b&)", null],
  ["b&&", '{"text":"b","expression":{"symbol":"&","expression":{"symbol":"&"}}}'],
  ["b&;", '{"text":"b","expression":{"symbol":"&","expression":{"symbol":";"}}}'],
  ["b&b", '{"text":"b","expression":{"symbol":"&","expression":{"text":"b"}}}'],
  ["b&1", '{"text":"b","expression":{"symbol":"&","expression":{"number":"1"}}}'],
  ["b;<", null],
  ["b;>", null],
  ["b;/", '{"text":"b","expression":{"symbol":";","expression":{"symbol":"/"}}}'],
  ["b;i", '{"text":"b","expression":{"symbol":";","expression":{"text":"i"}}}'],
  ["b;(", null],
  ["b;)", null],
  ["b;&", '{"text":"b","expression":{"symbol":";","expression":{"symbol":"&"}}}'],
  ["b;;", '{"text":"b","expression":{"symbol":";","expression":{"symbol":";"}}}'],
  ["b;b", '{"text":"b","expression":{"symbol":";","expression":{"text":"b"}}}'],
  ["b;1", '{"text":"b","expression":{"symbol":";","expression":{"number":"1"}}}'],
  ["bb<", null],
  ["bb>", null],
  ["bb/", '{"text":"b","expression":{"text":"b","expression":{"symbol":"/"}}}'],
  ["bbi", '{"text":"b","expression":{"text":"b","expression":{"text":"i"}}}'],
  ["bb(", null],
  ["bb)", null],
  ["bb&", '{"text":"b","expression":{"text":"b","expression":{"symbol":"&"}}}'],
  ["bb;", '{"text":"b","expression":{"text":"b","expression":{"symbol":";"}}}'],
  ["bbb", '{"text":"b","expression":{"text":"b","expression":{"text":"b"}}}'],
  ["bb1", '{"text":"b","expression":{"text":"b","expression":{"number":"1"}}}'],
  ["b1<", null],
  ["b1>", null],
  ["b1/", '{"text":"b","expression":{"number":"1","expression":{"symbol":"/"}}}'],
  ["b1i", '{"text":"b","expression":{"number":"1","expression":{"text":"i"}}}'],
  ["b1(", null],
  ["b1)", null],
  ["b1&", '{"text":"b","expression":{"number":"1","expression":{"symbol":"&"}}}'],
  ["b1;", '{"text":"b","expression":{"number":"1","expression":{"symbol":";"}}}'],
  ["b1b", '{"text":"b","expression":{"number":"1","expression":{"text":"b"}}}'],
  ["b11", '{"text":"b","expression":{"number":"11"}}'],
  ["1<<", null],
  ["1<>", null],
  ["1</", null],
  ["1<i", null],
  ["1<(", null],
  ["1<)", null],
  ["1<&", null],
  ["1<;", null],
  ["1<b", null],
  ["1<1", null],
  ["1><", null],
  ["1>>", null],
  ["1>/", null],
  ["1>i", null],
  ["1>(", null],
  ["1>)", null],
  ["1>&", null],
  ["1>;", null],
  ["1>b", null],
  ["1>1", null],
  ["1/<", null],
  ["1/>", null],
  ["1//", '{"number":"1","expression":{"symbol":"/","expression":{"symbol":"/"}}}'],
  ["1/i", '{"number":"1","expression":{"symbol":"/","expression":{"text":"i"}}}'],
  ["1/(", null],
  ["1/)", null],
  ["1/&", '{"number":"1","expression":{"symbol":"/","expression":{"symbol":"&"}}}'],
  ["1/;", '{"number":"1","expression":{"symbol":"/","expression":{"symbol":";"}}}'],
  ["1/b", '{"number":"1","expression":{"symbol":"/","expression":{"text":"b"}}}'],
  ["1/1", '{"number":"1","expression":{"symbol":"/","expression":{"number":"1"}}}'],
  ["1i<", null],
  ["1i>", null],
  ["1i/", '{"number":"1","expression":{"text":"i","expression":{"symbol":"/"}}}'],
  ["1ii", '{"number":"1","expression":{"text":"i","expression":{"text":"i"}}}'],
  ["1i(", null],
  ["1i)", null],
  ["1i&", '{"number":"1","expression":{"text":"i","expression":{"symbol":"&"}}}'],
  ["1i;", '{"number":"1","expression":{"text":"i","expression":{"symbol":";"}}}'],
  ["1ib", '{"number":"1","expression":{"text":"i","expression":{"text":"b"}}}'],
  ["1i1", '{"number":"1","expression":{"text":"i","expression":{"number":"1"}}}'],
  ["1(<", null],
  ["1(>", null],
  ["1(/", null],
  ["1(i", null],
  ["1((", null],
  ["1()", null],
  ["1(&", null],
  ["1(;", null],
  ["1(b", null],
  ["1(1", null],
  ["1)<", null],
  ["1)>", null],
  ["1)/", null],
  ["1)i", null],
  ["1)(", null],
  ["1))", null],
  ["1)&", null],
  ["1);", null],
  ["1)b", null],
  ["1)1", null],
  ["1&<", null],
  ["1&>", null],
  ["1&/", '{"number":"1","expression":{"symbol":"&","expression":{"symbol":"/"}}}'],
  ["1&i", '{"number":"1","expression":{"symbol":"&","expression":{"text":"i"}}}'],
  ["1&(", null],
  ["1&)", null],
  ["1&&", '{"number":"1","expression":{"symbol":"&","expression":{"symbol":"&"}}}'],
  ["1&;", '{"number":"1","expression":{"symbol":"&","expression":{"symbol":";"}}}'],
  ["1&b", '{"number":"1","expression":{"symbol":"&","expression":{"text":"b"}}}'],
  ["1&1", '{"number":"1","expression":{"symbol":"&","expression":{"number":"1"}}}'],
  ["1;<", null],
  ["1;>", null],
  ["1;/", '{"number":"1","expression":{"symbol":";","expression":{"symbol":"/"}}}'],
  ["1;i", '{"number":"1","expression":{"symbol":";","expression":{"text":"i"}}}'],
  ["1;(", null],
  ["1;)", null],
  ["1;&", '{"number":"1","expression":{"symbol":";","expression":{"symbol":"&"}}}'],
  ["1;;", '{"number":"1","expression":{"symbol":";","expression":{"symbol":";"}}}'],
  ["1;b", '{"number":"1","expression":{"symbol":";","expression":{"text":"b"}}}'],
  ["1;1", '{"number":"1","expression":{"symbol":";","expression":{"number":"1"}}}'],
  ["1b<", null],
  ["1b>", null],
  ["1b/", '{"number":"1","expression":{"text":"b","expression":{"symbol":"/"}}}'],
  ["1bi", '{"number":"1","expression":{"text":"b","expression":{"text":"i"}}}'],
  ["1b(", null],
  ["1b)", null],
  ["1b&", '{"number":"1","expression":{"text":"b","expression":{"symbol":"&"}}}'],
  ["1b;", '{"number":"1","expression":{"text":"b","expression":{"symbol":";"}}}'],
  ["1bb", '{"number":"1","expression":{"text":"b","expression":{"text":"b"}}}'],
  ["1b1", '{"number":"1","expression":{"text":"b","expression":{"number":"1"}}}'],
  ["11<", null],
  ["11>", null],
  ["11/", '{"number":"11","expression":{"symbol":"/"}}'],
  ["11i", '{"number":"11","expression":{"text":"i"}}'],
  ["11(", null],
  ["11)", null],
  ["11&", '{"number":"11","expression":{"symbol":"&"}}'],
  ["11;", '{"number":"11","expression":{"symbol":";"}}'],
  ["11b", '{"number":"11","expression":{"text":"b"}}'],
  ["111", '{"number":"111"}'],
];

// --- group 4: every entry of every generated table -------------------------
const TABLE_FIXTURES: readonly Fixture[] = [
  ["arcsinx", '{"unary_function":{"unary":"arcsin","first_value":{"text":"x"}}}'],
  [
    "arcsin(x)",
    '{"unary_function":{"unary":"arcsin","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>arcsin</i>x", '{"unary_function":{"unary":"arcsin","first_value":{"text":"x"}}}'],
  [
    "<i>arcsin</i>(x)",
    '{"unary_function":{"unary":"arcsin","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["arcsin", '{"unary":"arcsin"}'],
  ["arccosx", '{"unary_function":{"unary":"arccos","first_value":{"text":"x"}}}'],
  [
    "arccos(x)",
    '{"unary_function":{"unary":"arccos","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>arccos</i>x", '{"unary_function":{"unary":"arccos","first_value":{"text":"x"}}}'],
  [
    "<i>arccos</i>(x)",
    '{"unary_function":{"unary":"arccos","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["arccos", '{"unary":"arccos"}'],
  ["arctanx", '{"unary_function":{"unary":"arctan","first_value":{"text":"x"}}}'],
  [
    "arctan(x)",
    '{"unary_function":{"unary":"arctan","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>arctan</i>x", '{"unary_function":{"unary":"arctan","first_value":{"text":"x"}}}'],
  [
    "<i>arctan</i>(x)",
    '{"unary_function":{"unary":"arctan","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["arctan", '{"unary":"arctan"}'],
  ["cothx", '{"unary_function":{"unary":"coth","first_value":{"text":"x"}}}'],
  [
    "coth(x)",
    '{"unary_function":{"unary":"coth","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>coth</i>x", '{"unary_function":{"unary":"coth","first_value":{"text":"x"}}}'],
  [
    "<i>coth</i>(x)",
    '{"unary_function":{"unary":"coth","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["coth", '{"unary":"coth"}'],
  ["tanhx", '{"unary_function":{"unary":"tanh","first_value":{"text":"x"}}}'],
  [
    "tanh(x)",
    '{"unary_function":{"unary":"tanh","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>tanh</i>x", '{"unary_function":{"unary":"tanh","first_value":{"text":"x"}}}'],
  [
    "<i>tanh</i>(x)",
    '{"unary_function":{"unary":"tanh","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["tanh", '{"unary":"tanh"}'],
  ["sechx", '{"unary_function":{"unary":"sech","first_value":{"text":"x"}}}'],
  [
    "sech(x)",
    '{"unary_function":{"unary":"sech","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>sech</i>x", '{"unary_function":{"unary":"sech","first_value":{"text":"x"}}}'],
  [
    "<i>sech</i>(x)",
    '{"unary_function":{"unary":"sech","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["sech", '{"unary":"sech"}'],
  ["cschx", '{"unary_function":{"unary":"csch","first_value":{"text":"x"}}}'],
  [
    "csch(x)",
    '{"unary_function":{"unary":"csch","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>csch</i>x", '{"unary_function":{"unary":"csch","first_value":{"text":"x"}}}'],
  [
    "<i>csch</i>(x)",
    '{"unary_function":{"unary":"csch","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["csch", '{"unary":"csch"}'],
  ["sqrtx", '{"unary_function":{"unary":"sqrt","first_value":{"text":"x"}}}'],
  [
    "sqrt(x)",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>sqrt</i>x", '{"unary_function":{"unary":"sqrt","first_value":{"text":"x"}}}'],
  [
    "<i>sqrt</i>(x)",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["sqrt", '{"unary":"sqrt"}'],
  ["ceilx", '{"unary_function":{"unary":"ceil","first_value":{"text":"x"}}}'],
  [
    "ceil(x)",
    '{"unary_function":{"unary":"ceil","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>ceil</i>x", '{"unary_function":{"unary":"ceil","first_value":{"text":"x"}}}'],
  [
    "<i>ceil</i>(x)",
    '{"unary_function":{"unary":"ceil","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["ceil", '{"unary":"ceil"}'],
  ["sinhx", '{"unary_function":{"unary":"sinh","first_value":{"text":"x"}}}'],
  [
    "sinh(x)",
    '{"unary_function":{"unary":"sinh","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>sinh</i>x", '{"unary_function":{"unary":"sinh","first_value":{"text":"x"}}}'],
  [
    "<i>sinh</i>(x)",
    '{"unary_function":{"unary":"sinh","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["sinh", '{"unary":"sinh"}'],
  ["coshx", '{"unary_function":{"unary":"cosh","first_value":{"text":"x"}}}'],
  [
    "cosh(x)",
    '{"unary_function":{"unary":"cosh","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>cosh</i>x", '{"unary_function":{"unary":"cosh","first_value":{"text":"x"}}}'],
  [
    "<i>cosh</i>(x)",
    '{"unary_function":{"unary":"cosh","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["cosh", '{"unary":"cosh"}'],
  ["sinx", '{"unary_function":{"unary":"sin","first_value":{"text":"x"}}}'],
  [
    "sin(x)",
    '{"unary_function":{"unary":"sin","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>sin</i>x", '{"unary_function":{"unary":"sin","first_value":{"text":"x"}}}'],
  [
    "<i>sin</i>(x)",
    '{"unary_function":{"unary":"sin","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["sin", '{"unary":"sin"}'],
  ["cosx", '{"unary_function":{"unary":"cos","first_value":{"text":"x"}}}'],
  [
    "cos(x)",
    '{"unary_function":{"unary":"cos","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>cos</i>x", '{"unary_function":{"unary":"cos","first_value":{"text":"x"}}}'],
  [
    "<i>cos</i>(x)",
    '{"unary_function":{"unary":"cos","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["cos", '{"unary":"cos"}'],
  ["gcdx", '{"unary_function":{"unary":"gcd","first_value":{"text":"x"}}}'],
  [
    "gcd(x)",
    '{"unary_function":{"unary":"gcd","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>gcd</i>x", '{"unary_function":{"unary":"gcd","first_value":{"text":"x"}}}'],
  [
    "<i>gcd</i>(x)",
    '{"unary_function":{"unary":"gcd","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["gcd", '{"unary":"gcd"}'],
  ["cscx", '{"unary_function":{"unary":"csc","first_value":{"text":"x"}}}'],
  [
    "csc(x)",
    '{"unary_function":{"unary":"csc","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>csc</i>x", '{"unary_function":{"unary":"csc","first_value":{"text":"x"}}}'],
  [
    "<i>csc</i>(x)",
    '{"unary_function":{"unary":"csc","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["csc", '{"unary":"csc"}'],
  ["absx", '{"unary_function":{"unary":"abs","first_value":{"text":"x"}}}'],
  [
    "abs(x)",
    '{"unary_function":{"unary":"abs","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>abs</i>x", '{"unary_function":{"unary":"abs","first_value":{"text":"x"}}}'],
  [
    "<i>abs</i>(x)",
    '{"unary_function":{"unary":"abs","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["abs", '{"unary":"abs"}'],
  ["vecx", '{"unary_function":{"unary":"vec","first_value":{"text":"x"}}}'],
  [
    "vec(x)",
    '{"unary_function":{"unary":"vec","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>vec</i>x", '{"unary_function":{"unary":"vec","first_value":{"text":"x"}}}'],
  [
    "<i>vec</i>(x)",
    '{"unary_function":{"unary":"vec","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["vec", '{"unary":"vec"}'],
  ["expx", '{"unary_function":{"unary":"exp","first_value":{"text":"x"}}}'],
  [
    "exp(x)",
    '{"unary_function":{"unary":"exp","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>exp</i>x", '{"unary_function":{"unary":"exp","first_value":{"text":"x"}}}'],
  [
    "<i>exp</i>(x)",
    '{"unary_function":{"unary":"exp","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["exp", '{"unary":"exp"}'],
  ["secx", '{"unary_function":{"unary":"sec","first_value":{"text":"x"}}}'],
  [
    "sec(x)",
    '{"unary_function":{"unary":"sec","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>sec</i>x", '{"unary_function":{"unary":"sec","first_value":{"text":"x"}}}'],
  [
    "<i>sec</i>(x)",
    '{"unary_function":{"unary":"sec","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["sec", '{"unary":"sec"}'],
  ["tanx", '{"unary_function":{"unary":"tan","first_value":{"text":"x"}}}'],
  [
    "tan(x)",
    '{"unary_function":{"unary":"tan","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>tan</i>x", '{"unary_function":{"unary":"tan","first_value":{"text":"x"}}}'],
  [
    "<i>tan</i>(x)",
    '{"unary_function":{"unary":"tan","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["tan", '{"unary":"tan"}'],
  ["cotx", '{"unary_function":{"unary":"cot","first_value":{"text":"x"}}}'],
  [
    "cot(x)",
    '{"unary_function":{"unary":"cot","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>cot</i>x", '{"unary_function":{"unary":"cot","first_value":{"text":"x"}}}'],
  [
    "<i>cot</i>(x)",
    '{"unary_function":{"unary":"cot","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["cot", '{"unary":"cot"}'],
  ["lcmx", '{"unary_function":{"unary":"lcm","first_value":{"text":"x"}}}'],
  [
    "lcm(x)",
    '{"unary_function":{"unary":"lcm","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>lcm</i>x", '{"unary_function":{"unary":"lcm","first_value":{"text":"x"}}}'],
  [
    "<i>lcm</i>(x)",
    '{"unary_function":{"unary":"lcm","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["lcm", '{"unary":"lcm"}'],
  ["detx", '{"unary_function":{"unary":"det","first_value":{"text":"x"}}}'],
  [
    "det(x)",
    '{"unary_function":{"unary":"det","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>det</i>x", '{"unary_function":{"unary":"det","first_value":{"text":"x"}}}'],
  [
    "<i>det</i>(x)",
    '{"unary_function":{"unary":"det","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["det", '{"unary":"det"}'],
  ["lnx", '{"unary_function":{"unary":"ln","first_value":{"text":"x"}}}'],
  [
    "ln(x)",
    '{"unary_function":{"unary":"ln","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>ln</i>x", '{"unary_function":{"unary":"ln","first_value":{"text":"x"}}}'],
  [
    "<i>ln</i>(x)",
    '{"unary_function":{"unary":"ln","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["ln", '{"unary":"ln"}'],
  ["lgx", '{"unary_function":{"unary":"lg","first_value":{"text":"x"}}}'],
  [
    "lg(x)",
    '{"unary_function":{"unary":"lg","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["<i>lg</i>x", '{"unary_function":{"unary":"lg","first_value":{"text":"x"}}}'],
  [
    "<i>lg</i>(x)",
    '{"unary_function":{"unary":"lg","first_value":{"lparen":"(","text":"x","rparen":")"}}}',
  ],
  ["lg", '{"unary":"lg"}'],
  ["(x)", '{"parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}}'],
  ["{x}", '{"parse_parenthesis":{"lparen":"{","text":"x","rparen":"}"}}'],
  [
    "sqrt{x}",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"{","text":"x","rparen":"}"}}}',
  ],
  ["[x]", '{"parse_parenthesis":{"lparen":"[","text":"x","rparen":"]"}}'],
  ["<i>[</i>x<i>]</i>", '{"parse_parenthesis":{"lparen":"[","text":"x","rparen":"]"}}'],
  [
    "sqrt[x]",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"[","text":"x","rparen":"]"}}}',
  ],
  ["&prod;", '{"sum_prod":"&prod;"}'],
  ["&prod;<sub>a</sub>", '{"sub_sup":{"sum_prod":"&prod;"},"sub_value":{"text":"a"}}'],
  ["&prod;<sup>b</sup>", '{"sub_sup":{"sum_prod":"&prod;"},"sup_value":{"text":"b"}}'],
  [
    "&prod;<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"sum_prod":"&prod;"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "&prod;<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"sum_prod":"&prod;"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["&sum;", '{"sum_prod":"&sum;"}'],
  ["&sum;<sub>a</sub>", '{"sub_sup":{"sum_prod":"&sum;"},"sub_value":{"text":"a"}}'],
  ["&sum;<sup>b</sup>", '{"sub_sup":{"sum_prod":"&sum;"},"sup_value":{"text":"b"}}'],
  [
    "&sum;<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"sum_prod":"&sum;"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "&sum;<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"sum_prod":"&sum;"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["&#x220f;", '{"sum_prod":"&#x220f;"}'],
  ["&#x220f;<sub>a</sub>", '{"sub_sup":{"sum_prod":"&#x220f;"},"sub_value":{"text":"a"}}'],
  ["&#x220f;<sup>b</sup>", '{"sub_sup":{"sum_prod":"&#x220f;"},"sup_value":{"text":"b"}}'],
  [
    "&#x220f;<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"sum_prod":"&#x220f;"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "&#x220f;<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"sum_prod":"&#x220f;"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["&#x2211;", '{"sum_prod":"&#x2211;"}'],
  ["&#x2211;<sub>a</sub>", '{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"text":"a"}}'],
  ["&#x2211;<sup>b</sup>", '{"sub_sup":{"sum_prod":"&#x2211;"},"sup_value":{"text":"b"}}'],
  [
    "&#x2211;<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"sum_prod":"&#x2211;"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "&#x2211;<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"sum_prod":"&#x2211;"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["log", '{"sum_prod":"log"}'],
  ["log<sub>a</sub>", '{"sub_sup":{"sum_prod":"log"},"sub_value":{"text":"a"}}'],
  ["log<sup>b</sup>", '{"sub_sup":{"sum_prod":"log"},"sup_value":{"text":"b"}}'],
  [
    "log<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"sum_prod":"log"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "log<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"sum_prod":"log"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["lim", '{"sum_prod":"lim"}'],
  ["lim<sub>a</sub>", '{"sub_sup":{"binary":"lim"},"sub_value":{"text":"a"}}'],
  ["lim<sup>b</sup>", '{"sub_sup":{"binary":"lim"},"sup_value":{"text":"b"}}'],
  [
    "lim<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"binary":"lim"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "lim<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"binary":"lim"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["∏", '{"sum_prod":"∏"}'],
  ["∏<sub>a</sub>", '{"sub_sup":{"sum_prod":"∏"},"sub_value":{"text":"a"}}'],
  ["∏<sup>b</sup>", '{"sub_sup":{"sum_prod":"∏"},"sup_value":{"text":"b"}}'],
  [
    "∏<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"sum_prod":"∏"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "∏<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"sum_prod":"∏"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["∑", '{"sum_prod":"∑"}'],
  ["∑<sub>a</sub>", '{"sub_sup":{"sum_prod":"∑"},"sub_value":{"text":"a"}}'],
  ["∑<sup>b</sup>", '{"sub_sup":{"sum_prod":"∑"},"sup_value":{"text":"b"}}'],
  [
    "∑<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"sum_prod":"∑"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "∑<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"sum_prod":"∑"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["limx", '{"binary":"lim","first_value":{"text":"x"}}'],
  [
    "lim(x)(y)",
    '{"binary":"lim","first_value":{"lparen":"(","text":"x","rparen":")"},"second_value":{"lparen":"(","text":"y","rparen":")"}}',
  ],
  ["<i>lim</i>x", '{"binary":"lim","first_value":{"text":"x"}}'],
  ["xmody", '{"first_value":{"text":"x"},"binary":"mod","second_value":{"text":"y"}}'],
  ["x<i>mod</i>y", '{"first_value":{"text":"x"},"binary":"mod","second_value":{"text":"y"}}'],
  ["mod", '{"text":"m","expression":{"text":"o","expression":{"text":"d"}}}'],
];

// --- group 5: tags ---------------------------------------------------------
const TAG_FIXTURES: readonly Fixture[] = [
  ["<i>x</i>", '{"sequence":{"text":"x"}}'],
  ["<I>x</I>", '{"sequence":{"text":"x"}}'],
  ["<i>x</I>", '{"sequence":{"text":"x"}}'],
  ["<I>x</i>", '{"sequence":{"text":"x"}}'],
  ["<i>x</j>", null],
  ["<i><b>x</b></i>", '{"sequence":{"sequence":{"text":"x"}}}'],
  ["<i><b>x</i></b>", null],
  ["<b><b>x</b></b>", '{"sequence":{"sequence":{"text":"x"}}}'],
  ["<div>x</div>", '{"sequence":{"text":"x"}}'],
  ['<div class="a">x</div>', '{"sequence":{"text":"x"}}'],
  ["<div class='a'>x</div>", '{"sequence":{"text":"x"}}'],
  ["<div id='a>b'>x</div>", '{"sequence":{"text":"x"}}'],
  ['<div id="a>b">x</div>', '{"sequence":{"text":"x"}}'],
  ["<div id='a<b'>x</div>", '{"sequence":{"text":"x"}}'],
  ["<sub>a</sub>", '{"sequence":{"text":"a"}}'],
  ["<sup>a</sup>", '{"sequence":{"text":"a"}}'],
  ["x<sub>a</sub>", '{"sub_sup":{"text":"x"},"sub_value":{"text":"a"}}'],
  ["x<sup>a</sup>", '{"sub_sup":{"text":"x"},"sup_value":{"text":"a"}}'],
  [
    "x<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"text":"x"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "x<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"text":"x"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["<subx>a</subx>", '{"sequence":{"text":"a"}}'],
  ["<sub/>a</sub>", '{"sequence":{"text":"a"}}'],
  ["<sub >a</sub>", '{"sequence":{"text":"a"}}'],
  ["<sub\tclass='c'>a</sub>", '{"sequence":{"text":"a"}}'],
  ["<br>", '{"linebreak":"<br>"}'],
  ["<br/>", '{"linebreak":"<br/>"}'],
  ["<br />", '{"linebreak":"<br />"}'],
  ["<br class='c'>", '{"linebreak":"<br class=\'c\'>"}'],
  ["x<br>y", '{"text":"x","expression":{"linebreak":"<br>","expression":{"text":"y"}}}'],
  ["<brx>", null],
  ["<td>x</td>", '{"td_value":{"text":"x"}}'],
  ["<th>x</th>", '{"td_value":{"text":"x"}}'],
  ["<tr><td>x</td></tr>", '{"tr_value":{"td_value":{"text":"x"}}}'],
  ["<table><tr><td>x</td></tr></table>", '{"table_value":{"tr_value":{"td_value":{"text":"x"}}}}'],
  [
    "<table><tr><td>x</td><td>y</td></tr></table>",
    '{"table_value":{"tr_value":{"td_value":{"text":"x"},"expression":{"td_value":{"text":"y"}}}}}',
  ],
  ["<table><tr><th>x</th></tr></table>", '{"table_value":{"tr_value":{"td_value":{"text":"x"}}}}'],
  ["<a:b>x</a:b>", '{"sequence":{"text":"x"}}'],
  ["<a.b>x</a.b>", '{"sequence":{"text":"x"}}'],
  ["<a-b>x</a-b>", '{"sequence":{"text":"x"}}'],
  ["<a_b>x</a_b>", '{"sequence":{"text":"x"}}'],
  ["<a1>x</a1>", '{"sequence":{"text":"x"}}'],
  ["<1a>x</1a>", null],
  ["<>x</>", null],
  ["</i>", null],
  ["<i></i>", null],
  ["<i>x</i><b>y</b>", '{"sequence":{"text":"x"},"expression":{"sequence":{"text":"y"}}}'],
];

// --- group 6: entities and numbers -----------------------------------------
const ENTITY_FIXTURES: readonly Fixture[] = [
  ["&#x20;", '{"symbol":"&#x20;"}'],
  ["&#xa0;", '{"symbol":"&#xa0;"}'],
  ["&#xA0;", '{"symbol":"&#xA0;"}'],
  [
    "&#X20;",
    '{"symbol":"&","expression":{"symbol":"#","expression":{"text":"X","expression":{"number":"20","expression":{"symbol":";"}}}}}',
  ],
  [
    "&#x;",
    '{"symbol":"&","expression":{"symbol":"#","expression":{"text":"x","expression":{"symbol":";"}}}}',
  ],
  ["&#x0;", '{"symbol":"&#x0;"}'],
  ["&#32;", '{"symbol":"&#32;"}'],
  ["&#0;", '{"symbol":"&#0;"}'],
  ["&#;", '{"symbol":"&","expression":{"symbol":"#","expression":{"symbol":";"}}}'],
  ["&a;", '{"symbol":"&a;"}'],
  ["&ab;", '{"symbol":"&ab;"}'],
  ["&ab1;", '{"symbol":"&ab1;"}'],
  ["&A;", '{"symbol":"&A;"}'],
  ["&Ab1;", '{"symbol":"&Ab1;"}'],
  [
    "&#xzz;",
    '{"symbol":"&","expression":{"symbol":"#","expression":{"text":"x","expression":{"text":"z","expression":{"text":"z","expression":{"symbol":";"}}}}}}',
  ],
  [
    "&#xg;",
    '{"symbol":"&","expression":{"symbol":"#","expression":{"text":"x","expression":{"text":"g","expression":{"symbol":";"}}}}}',
  ],
  ["&amp;", '{"symbol":"&amp;"}'],
  ["&#x26;", '{"symbol":"&#x26;"}'],
  ["&#x3c;", '{"symbol":"&#x3c;"}'],
  [
    "&#x20",
    '{"symbol":"&","expression":{"symbol":"#","expression":{"text":"x","expression":{"number":"20"}}}}',
  ],
  ["a&#x20;b", '{"text":"a","expression":{"symbol":"&#x20;","expression":{"text":"b"}}}'],
  ["&#x20;&#x21;", '{"symbol":"&#x20;","expression":{"symbol":"&#x21;"}}'],
];

const NUMBER_FIXTURES: readonly Fixture[] = [
  ["12", '{"number":"12"}'],
  ["0x1F", '{"hex_number":"1F"}'],
  ["0X1f", '{"hex_number":"1f"}'],
  ["0xg", '{"number":"0","expression":{"text":"x","expression":{"text":"g"}}}'],
  ["0b1", '{"binary_number":"1"}'],
  ["0B0", '{"binary_number":"0"}'],
  ["0b2", '{"number":"0","expression":{"text":"b","expression":{"number":"2"}}}'],
  ["0o7", '{"octal_number":"7"}'],
  ["0O0", '{"octal_number":"0"}'],
  ["0o8", '{"number":"0","expression":{"text":"o","expression":{"number":"8"}}}'],
  ["0o", '{"number":"0","expression":{"text":"o"}}'],
  ["1.5", '{"number":"1.5"}'],
  ["12.34", '{"number":"12.34"}'],
  [".5", '{"symbol":".","expression":{"number":"5"}}'],
  ["5.", '{"number":"5","expression":{"symbol":"."}}'],
  ["1.2.3", '{"number":"1.2","expression":{"symbol":".","expression":{"number":"3"}}}'],
  ["1.5<sub>a</sub>", '{"sub_sup":{"number":"1.5"},"sub_value":{"text":"a"}}'],
  ["0x1F<sup>2</sup>", '{"sub_sup":{"hex_number":"1F"},"sup_value":{"number":"2"}}'],
  [
    "sqrt(1.5)",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","number":"1.5","rparen":")"}}}',
  ],
];

// --- group 8: the inputs mutation testing found uncovered -----------------
//
// Twenty-nine mutations were applied to the grammar and the generated
// tables; four survived the first seven groups. Three of the four were real
// coverage gaps, and these are the inputs that close them: a closing tag
// carrying attributes, a parenthesised character that both `symbol` and
// `sub_sup` accept, and a sub/sup pair where `sub_sup_tags` has to prefer the
// pair over the single. The fourth is inert and is argued in the test below
// rather than covered, because no input can distinguish it.
const GAP_FIXTURES: readonly Fixture[] = [
  ["<i>x</i >", null],
  ['<i>x</i class="a">', null],
  ["<div>x</div class='a'>", null],
  ["<i>x</i/>", null],
  ["<i>x</i\t>", null],
  ["<td>x</td class='a'>", null],
  ["<sub>a</sub class='c'>", null],
  ["(∏)", '{"parse_parenthesis":{"lparen":"(","symbol":"∏","rparen":")"}}'],
  ["(∑)", '{"parse_parenthesis":{"lparen":"(","symbol":"∑","rparen":")"}}'],
  ["(&#x220f;)", '{"parse_parenthesis":{"lparen":"(","symbol":"&#x220f;","rparen":")"}}'],
  ["(&#x2211;)", '{"parse_parenthesis":{"lparen":"(","symbol":"&#x2211;","rparen":")"}}'],
  ["[∏]", '{"parse_parenthesis":{"lparen":"[","symbol":"∏","rparen":"]"}}'],
  ["{∑}", '{"parse_parenthesis":{"lparen":"{","symbol":"∑","rparen":"}"}}'],
  ["(log)", '{"parse_parenthesis":{"lparen":"(","sum_prod":"log","rparen":")"}}'],
  ["(lim)", '{"parse_parenthesis":{"lparen":"(","sum_prod":"lim","rparen":")"}}'],
  ["(&prod;)", '{"parse_parenthesis":{"lparen":"(","symbol":"&prod;","rparen":")"}}'],
  ["(&sum;)", '{"parse_parenthesis":{"lparen":"(","symbol":"&sum;","rparen":")"}}'],
  ["(x)", '{"parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}}'],
  ["(1)", '{"parse_parenthesis":{"lparen":"(","number":"1","rparen":")"}}'],
  ["(<br>)", '{"parse_parenthesis":{"lparen":"(","linebreak":"<br>","rparen":")"}}'],
  ["( )", '{"parse_parenthesis":{"lparen":"(","rparen":")"}}'],
  ["(sqrt)", '{"parse_parenthesis":{"lparen":"(","unary":"sqrt","rparen":")"}}'],
  [
    "x<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"text":"x"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "x<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"text":"x"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  ["x<sub>a</sub>", '{"sub_sup":{"text":"x"},"sub_value":{"text":"a"}}'],
  ["x<sup>b</sup>", '{"sub_sup":{"text":"x"},"sup_value":{"text":"b"}}'],
  [
    "∏<sub>a</sub><sup>b</sup>",
    '{"sub_sup":{"sum_prod":"∏"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}',
  ],
  [
    "∏<sup>b</sup><sub>a</sub>",
    '{"sub_sup":{"sum_prod":"∏"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}',
  ],
  [
    "sqrt(x)y",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","text":"x","rparen":")"}},"sequence":{"text":"y"}}',
  ],
  [
    "lim(x)(y)z",
    '{"binary":"lim","first_value":{"lparen":"(","text":"x","rparen":")"},"second_value":{"lparen":"(","text":"y","rparen":")"},"sequence":{"text":"z"}}',
  ],
  [
    "sqrtlimx",
    '{"unary_function":{"unary":"sqrt","first_value":{"sum_prod":"lim"}},"sequence":{"text":"x"}}',
  ],
  ["limsqrtx", '{"binary":"lim","first_value":{"unary":"sqrt"},"second_value":{"text":"x"}}'],
  ["lcmx", '{"unary_function":{"unary":"lcm","first_value":{"text":"x"}}}'],
  ["lnx", '{"unary_function":{"unary":"ln","first_value":{"text":"x"}}}'],
  ["lgx", '{"unary_function":{"unary":"lg","first_value":{"text":"x"}}}'],
  ["limx", '{"binary":"lim","first_value":{"text":"x"}}'],
  ["lim", '{"sum_prod":"lim"}'],
  ["sqrt", '{"unary":"sqrt"}'],
  [
    "<i>lim</i>(x)(y)",
    '{"binary":"lim","first_value":{"lparen":"(","text":"x","rparen":")"},"second_value":{"lparen":"(","text":"y","rparen":")"}}',
  ],
  [
    "<i>sqrt</i>(x)y",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","text":"x","rparen":")"}},"sequence":{"text":"y"}}',
  ],
  ["<a:b>x</a:b>", '{"sequence":{"text":"x"}}'],
  ["<a.b>x</a.b>", '{"sequence":{"text":"x"}}'],
  ["<a-b>x</a-b>", '{"sequence":{"text":"x"}}'],
  ["<a_b>x</a_b>", '{"sequence":{"text":"x"}}'],
  ["<a b>x</a>", '{"sequence":{"text":"x"}}'],
  ["<a\tb>x</a>", '{"sequence":{"text":"x"}}'],
  ["<div a='<'>x</div>", '{"sequence":{"text":"x"}}'],
  ['<div a="<">x</div>', '{"sequence":{"text":"x"}}'],
  ["<div a=<>x</div>", null],
  ["<div a='>'>x</div>", '{"sequence":{"text":"x"}}'],
  ["<div a=b>x</div>", '{"sequence":{"text":"x"}}'],
  ["<div a=''>x</div>", '{"sequence":{"text":"x"}}'],
  ["xmody", '{"first_value":{"text":"x"},"binary":"mod","second_value":{"text":"y"}}'],
  ["x<i>mod</i>y", '{"first_value":{"text":"x"},"binary":"mod","second_value":{"text":"y"}}'],
  ["1mod2", '{"first_value":{"number":"1"},"binary":"mod","second_value":{"number":"2"}}'],
  [
    "(x)mod(y)",
    '{"sequence":{"parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}},"expression":{"text":"m","expression":{"text":"o","expression":{"text":"d","parse_parenthesis":{"lparen":"(","text":"y","rparen":")"}}}}}',
  ],
  ["xy", '{"text":"x","expression":{"text":"y"}}'],
  ["xyz", '{"text":"x","expression":{"text":"y","expression":{"text":"z"}}}'],
  [
    "sqrtxy",
    '{"unary_function":{"unary":"sqrt","first_value":{"text":"x"}},"sequence":{"text":"y"}}',
  ],
  [
    "x(y)z",
    '{"sequence":{"text":"x","parse_parenthesis":{"lparen":"(","text":"y","rparen":")"}},"expression":{"text":"z"}}',
  ],
  [
    "(x)(y)",
    '{"sequence":{"parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}},"expression":{"parse_parenthesis":{"lparen":"(","text":"y","rparen":")"}}}',
  ],
  [
    "(x)y",
    '{"sequence":{"parse_parenthesis":{"lparen":"(","text":"x","rparen":")"}},"expression":{"text":"y"}}',
  ],
  ["1.5", '{"number":"1.5"}'],
  ["1.", '{"number":"1","expression":{"symbol":"."}}'],
  [".5", '{"symbol":".","expression":{"number":"5"}}'],
  ["1.5.5", '{"number":"1.5","expression":{"symbol":".","expression":{"number":"5"}}}'],
  ["0x1.5", '{"hex_number":"1","expression":{"symbol":".","expression":{"number":"5"}}}'],
];

// --- group 7: the decimal marker under every supported locale --------------
const LOCALE_FIXTURES: readonly LocaleFixture[] = [
  [",", "1.5", '{"number":"1","expression":{"symbol":".","expression":{"number":"5"}}}'],
  [",", "1,5", '{"number":"1,5"}'],
  [",", "1٫5", '{"number":"1","expression":{"symbol":"٫","expression":{"number":"5"}}}'],
  [",", "12.34", '{"number":"12","expression":{"symbol":".","expression":{"number":"34"}}}'],
  [
    ",",
    "1.5<sub>a</sub>",
    '{"number":"1","expression":{"symbol":".","expression":{"sub_sup":{"number":"5"},"sub_value":{"text":"a"}}}}',
  ],
  [
    ",",
    "sqrt(1,5)",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","number":"1,5","rparen":")"}}}',
  ],
  [
    ",",
    "(1٫5)",
    '{"parse_parenthesis":{"lparen":"(","number":"1","expression":{"symbol":"٫","expression":{"number":"5"}},"rparen":")"}}',
  ],
  [".", "1.5", '{"number":"1.5"}'],
  [".", "1,5", '{"number":"1","expression":{"symbol":",","expression":{"number":"5"}}}'],
  [".", "1٫5", '{"number":"1","expression":{"symbol":"٫","expression":{"number":"5"}}}'],
  [".", "12.34", '{"number":"12.34"}'],
  [".", "1.5<sub>a</sub>", '{"sub_sup":{"number":"1.5"},"sub_value":{"text":"a"}}'],
  [
    ".",
    "sqrt(1,5)",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","number":"1","expression":{"symbol":",","expression":{"number":"5"}},"rparen":")"}}}',
  ],
  [
    ".",
    "(1٫5)",
    '{"parse_parenthesis":{"lparen":"(","number":"1","expression":{"symbol":"٫","expression":{"number":"5"}},"rparen":")"}}',
  ],
  ["٫", "1.5", '{"number":"1","expression":{"symbol":".","expression":{"number":"5"}}}'],
  ["٫", "1,5", '{"number":"1","expression":{"symbol":",","expression":{"number":"5"}}}'],
  ["٫", "1٫5", '{"number":"1٫5"}'],
  ["٫", "12.34", '{"number":"12","expression":{"symbol":".","expression":{"number":"34"}}}'],
  [
    "٫",
    "1.5<sub>a</sub>",
    '{"number":"1","expression":{"symbol":".","expression":{"sub_sup":{"number":"5"},"sub_value":{"text":"a"}}}}',
  ],
  [
    "٫",
    "sqrt(1,5)",
    '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","number":"1","expression":{"symbol":",","expression":{"number":"5"}},"rparen":")"}}}',
  ],
  ["٫", "(1٫5)", '{"parse_parenthesis":{"lparen":"(","number":"1٫5","rparen":")"}}'],
];

/**
 * What `Html::Parser#normalized_text` (`html/parser.rb:27`) does to an input,
 * measured on the oracle: [raw, normalised].
 *
 * Recorded here because the grammar's contract depends on it. The pass rewrites
 * only substrings matching `HTML_ENTITY` (`html/parser.rb:8`), where LaTeX's
 * (`latex/parser.rb:27`) encodes the whole text — so a bare U+220F and a whole
 * `<td>` both survive it, and `&prod;` does not. That is why four of
 * `SUB_SUP_CLASSES`'s eight alternatives are unreachable through the gem's own
 * entry point and four are reachable, and why the decimal marker is matched
 * raw.
 *
 * The pass itself is a later slice; this table is its evidence, not its port.
 */
const NORMALISATION_PAIRS: ReadonlyArray<readonly [raw: string, normalised: string]> = [
  ["&prod;", "&#x220f;"],
  ["&sum;", "&#x2211;"],
  ["&#x220f;", "&#x220f;"],
  ["∏", "∏"],
  ["∑", "∑"],
  ["&amp;", "&#x26;"],
  ["&lt;", "&#x3c;"],
  ["&nbsp;", "&#xa0;"],
  ["&PROD;", "&#x26;PROD;"],
  ["<td>x</td>", "<td>x</td>"],
  ["٫", "٫"],
  [",", ","],
  [".", "."],
  ["&#x;", "&#x;"],
  ["a&b", "a&b"],
  ["&#X220F;", "&#x220f;"],
];

// --- the checks -----------------------------------------------------------

describe("the gem's own HTML, round-tripped through the grammar", () => {
  it("covers the whole pinned corpus", () => {
    expect(CORPUS_FIXTURES.length).toBe(95);
    // The corpus is asciimath and latex input; `to_html` is what makes it HTML,
    // and four of the results the gem's own HTML parser will not read back.
    expect(CORPUS_FIXTURES.filter(([, gemTree]) => gemTree === null).length).toBe(4);
  });

  it.each(CORPUS_FIXTURES)("%s", (input, gemTree) => {
    check([input, gemTree]);
  });
});

describe("the strings the gem's own HTML specs parse", () => {
  it("covers all three spec files", () => {
    expect(GEM_SPEC_FIXTURES.length).toBe(80);
    expect(GEM_SPEC_FIXTURES.filter(([, gemTree]) => gemTree === null).length).toBe(6);
  });

  it.each(GEM_SPEC_FIXTURES)("%s", (input, gemTree) => {
    check([input, gemTree]);
  });
});

describe("a sweep over the characters this grammar branches on", () => {
  it("is the whole sweep, and the gem refuses most of it", () => {
    expect(SWEEP_FIXTURES.length).toBe(1807);
    expect(SWEEP_FIXTURES.filter(([, gemTree]) => gemTree === null).length).toBe(1169);
  });

  // Batched in tenths: a failure names every input it disagreed on, which is
  // what makes an ordering mistake legible rather than one arbitrary case.
  for (let start = 0; start < 1807; start += 200) {
    it(`agrees with the gem on ${start}..${Math.min(start + 200, 1807) - 1}`, () => {
      checkAll(SWEEP_FIXTURES.slice(start, start + 200));
    });
  }
});

describe("every entry of the four generated tables", () => {
  it("exercises each one bare, wrapped, and with arguments", () => {
    expect(TABLE_FIXTURES.length).toBe(177);
    // Every one of these the gem accepts: a table entry the grammar cannot
    // reach would be a dead alternative, and the generator refuses to emit one.
    expect(TABLE_FIXTURES.filter(([, gemTree]) => gemTree === null).length).toBe(0);
  });

  it.each(TABLE_FIXTURES)("%s", (input, gemTree) => {
    check([input, gemTree]);
  });
});

describe("tags: case, attributes, void tags, nesting, and the matching close", () => {
  it.each(TAG_FIXTURES)("%s", (input, gemTree) => {
    check([input, gemTree]);
  });

  /**
   * `wrapped_tag` (`html/parse.rb:179`) is the only Parslet `scope` in the
   * whole gem, and this is what it buys: the inner element's captured name must
   * not survive into the outer element's closing tag.
   *
   * Spelled out rather than left inside the fixture list because it is the one
   * behaviour a port can get structurally right and semantically wrong — drop
   * the `scope` and `<i><b>x</b></i>` still parses, while
   * `<i><b>x</b></i><b>y</b>` and the mismatched cases stop agreeing.
   */
  it("closes each element with its own name, whatever is nested inside", () => {
    expect(plain(grammar.root.parse("<i><b>x</b></i>"))).toStrictEqual({
      sequence: { sequence: { text: "x" } },
    });
    expect(() => grammar.root.parse("<i><b>x</i></b>")).toThrow(ParseFailed);
    expect(() => grammar.root.parse("<i>x</j>")).toThrow(ParseFailed);
  });

  /**
   * `html_tag_name` (`html/parse.rb:196`) makes a named tag case-insensitive
   * through `case_insensitive_string`, and `matching_close_tag` builds the
   * closing tag from the captured text, so an element opened lowercase closes
   * uppercase and the other way round.
   */
  it("matches an element name in either case", () => {
    const lower = plain(grammar.root.parse("<i>x</i>"));
    for (const input of ["<I>x</I>", "<i>x</I>", "<I>x</i>"]) {
      expect(plain(grammar.root.parse(input)), input).toStrictEqual(lower);
    }
  });

  /**
   * `tag_name_boundary` (`html/parse.rb:199`) is a lookahead, so a named tag
   * cannot be a prefix of a longer element name: `<subx>` is not a `<sub>`, and
   * falls through to the generic `wrapped_tag` instead.
   *
   * The pair has to be probed where `sub_tag` is actually reachable. At the
   * root it is not — `tag_parse` (`html/parse.rb:116`) offers `table`, `tr`,
   * `td`/`th` and the wrapper, and nothing else — so `<sub>a</sub>` and
   * `<subx>a</subx>` give the *same* tree there. Measured on the oracle, which
   * is how this test came to be written this way rather than the way it reads.
   */
  it("does not let a named tag match a longer element name", () => {
    expect(plain(grammar.root.parse("x<sub>a</sub>"))).toStrictEqual(
      JSON.parse('{"sub_sup":{"text":"x"},"sub_value":{"text":"a"}}'),
    );
    expect(plain(grammar.root.parse("x<subx>a</subx>"))).toStrictEqual(
      JSON.parse('{"text":"x","expression":{"sequence":{"text":"a"}}}'),
    );
    // At the root, where `sub_tag` is unreachable, the two are identical.
    expect(plain(grammar.root.parse("<subx>a</subx>"))).toStrictEqual(
      plain(grammar.root.parse("<sub>a</sub>")),
    );
  });
});

describe("entities and numbers", () => {
  it.each(ENTITY_FIXTURES)("%s", (input, gemTree) => {
    check([input, gemTree]);
  });

  it.each(NUMBER_FIXTURES)("%s", (input, gemTree) => {
    check([input, gemTree]);
  });

  /**
   * The one character that separates HTML's entity rule from the other two
   * formats'. `html/parse.rb:166-167` spells its digit runs `repeat(1)`;
   * `latex/parse.rb:93` and `unicode_math/parse.rb:30` spell theirs `repeat`.
   * So `&#x;` is a unicode node there and four separate leaves here — measured
   * on the oracle, and asserted in `scripts/generate-html-parser-data.rb`
   * against all three grammars so the difference cannot be normalised away in
   * either direction without a generator failure.
   */
  it("requires at least one digit in a numeric entity", () => {
    expect(plain(grammar.root.parse("&#x0;"))).toStrictEqual({ symbol: "&#x0;" });
    expect(plain(grammar.root.parse("&#0;"))).toStrictEqual({ symbol: "&#0;" });
    expect(plain(grammar.root.parse("&#x;"))).toStrictEqual({
      symbol: "&",
      expression: {
        symbol: "#",
        expression: { text: "x", expression: { symbol: ";" } },
      },
    });
  });
});

describe("the inputs mutation testing found uncovered", () => {
  it.each(GAP_FIXTURES)("%s", (input, gemTree) => {
    check([input, gemTree]);
  });

  /**
   * `parse_tag` (`html/parse.rb:151`) adds `tag_attributes` only when `opts` is
   * `:open`, so a closing tag goes straight from the name to `>`. Nothing in the
   * first seven groups closed a tag with anything after the name, so a port that
   * attached attributes to both forms passed all of them.
   */
  it("refuses a closing tag that carries anything after the name", () => {
    for (const input of ['<i>x</i class="a">', "<i>x</i >", "<div>x</div class='a'>"]) {
      expect(() => grammar.root.parse(input), input).toThrow(ParseFailed);
    }
    expect(plain(grammar.root.parse("<i>x</i>"))).toStrictEqual(
      JSON.parse('{"sequence":{"text":"x"}}'),
    );
  });

  /**
   * `parse_parenthesis` (`html/parse.rb:99`) tries `symbol_text_or_tag` before
   * `intermediate_exp`, and the order is not cosmetic even though the second
   * rule contains the first: `intermediate_exp` puts `sub_sup` ahead of
   * `symbol_text_or_tag`, so `(∏)` is a `:symbol` under the real order and would
   * be a `:sum_prod` under the reversed one. Both branches are live — `(log)`
   * takes the second, because `symbol_text_or_tag` can only take `l` from it.
   */
  it("prefers symbol_text_or_tag inside parentheses, where the two branches differ", () => {
    expect(plain(grammar.root.parse("(∏)"))).toStrictEqual(
      JSON.parse('{"parse_parenthesis":{"lparen":"(","symbol":"∏","rparen":")"}}'),
    );
    expect(plain(grammar.root.parse("(log)"))).toStrictEqual(
      JSON.parse('{"parse_parenthesis":{"lparen":"(","sum_prod":"log","rparen":")"}}'),
    );
  });

  /**
   * `sub_sup_tags` (`html/parse.rb:42`) puts the two-tag alternatives ahead of
   * the one-tag ones, so `x<sub>a</sub><sup>b</sup>` is one node with both
   * values rather than a subscript followed by a stray superscript.
   */
  it("prefers a sub/sup pair over a single script", () => {
    expect(plain(grammar.root.parse("x<sub>a</sub><sup>b</sup>"))).toStrictEqual(
      JSON.parse('{"sub_sup":{"text":"x"},"sub_value":{"text":"a"},"sup_value":{"text":"b"}}'),
    );
    expect(plain(grammar.root.parse("x<sup>b</sup><sub>a</sub>"))).toStrictEqual(
      JSON.parse('{"sub_sup":{"text":"x"},"sup_value":{"text":"b"},"sub_value":{"text":"a"}}'),
    );
  });

  /**
   * The five surviving mutations, and why no fixture closes them.
   *
   * Twenty-nine mutations were applied in all. Twenty-four die against the
   * groups above. The five that survive are all the same kind of change — two
   * alternatives of one ordered choice exchanged — in places where no position
   * can reach both, so no input can tell the two orders apart:
   *
   *   `sequence`'s `unary_args` and `binary_args` branches
   *   (`html/parse.rb:106-107`), whose heads are the 25 `UNARY_CLASSES` and the
   *   single word `lim`; `sub_sup_tags`'s two ordered pairs (`:43-44`), whose
   *   heads are `<sub` and `<sup`; `open_paren`'s and `mod`'s wrapped and bare
   *   forms (`:33-34`, `:16-17`), where the wrapped form must start with `<`
   *   and no table entry does; and `unary_args`'s parenthesised and
   *   intermediate branches (`:50-51`), where `intermediate_exp` refuses every
   *   opening delimiter outright.
   *
   * Disjointness is the whole argument, so the checkable part of it is asserted
   * rather than described. Parslet's `str` matches only a prefix of the input,
   * so two literal-headed alternatives can both match at one position exactly
   * when one head is a prefix of the other. The last of the five is the one
   * this cannot fully settle by assertion — `parse_parenthesis` can also begin
   * with `<`, through `wrapped_tag(lparen)` — and it was settled by measurement
   * instead: the two orders produce byte-identical trees on all 14,424 token
   * sequences of length up to three over a 24-token alphabet.
   */
  it("has no input that could tell the five inert alternative swaps apart", () => {
    const prefixes = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);
    // `sequence`: unary heads against the one binary head.
    for (const unary of HTML_UNARY_CLASSES) {
      expect(prefixes(unary, "lim"), unary).toBe(false);
    }
    // `sub_sup_tags`: the two ordered pairs.
    expect(prefixes("<sub", "<sup")).toBe(false);
    // `mod` and `open_paren`: a wrapped form starts with `<`, a bare one never
    // does, so `alt(wrappedTag(X), X)` is order-inert for every table.
    for (const text of [
      ...HTML_UNARY_CLASSES,
      ...HTML_LPAREN,
      ...HTML_RPAREN,
      ...HTML_SUB_SUP_CLASSES,
      "lim",
      "mod",
    ]) {
      expect(text.startsWith("<"), text).toBe(false);
    }
    // `unary_args`: `intermediate_exp` refuses every delimiter, so it cannot
    // compete with `parse_parenthesis` for one that starts with one.
    for (const delimiter of [...HTML_LPAREN, ...HTML_RPAREN]) {
      expect(() => grammar.rules.intermediateExp.parse(delimiter), delimiter).toThrow(ParseFailed);
    }

    // And the swaps that are NOT inert, in the same rules, do change a tree —
    // so the rules themselves are covered.
    expect(plain(grammar.root.parse("sqrt(x)y"))).toStrictEqual(
      JSON.parse(
        '{"unary_function":{"unary":"sqrt","first_value":{"lparen":"(","text":"x","rparen":")"}},"sequence":{"text":"y"}}',
      ),
    );
    expect(plain(grammar.root.parse("lim(x)(y)z"))).toStrictEqual(
      JSON.parse(
        '{"binary":"lim","first_value":{"lparen":"(","text":"x","rparen":")"},"second_value":{"lparen":"(","text":"y","rparen":")"},"sequence":{"text":"z"}}',
      ),
    );
  });
});

describe("what the normalisation pass hands the grammar", () => {
  it("rewrites a named entity to hex and leaves a bare code point alone", () => {
    const byRaw = new Map(NORMALISATION_PAIRS);
    expect(byRaw.get("&prod;")).toBe("&#x220f;");
    expect(byRaw.get("&sum;")).toBe("&#x2211;");
    expect(byRaw.get("∏")).toBe("∏");
    expect(byRaw.get("∑")).toBe("∑");
    // The reason the pass cannot encode everything: the tags would go with it.
    expect(byRaw.get("<td>x</td>")).toBe("<td>x</td>");
  });

  /**
   * The four `SUB_SUP_CLASSES` spellings a user can actually reach, and the two
   * that are rewritten away before Parslet sees them. All eight are still live
   * alternatives of `sub_sup` itself, which is this module's input.
   */
  it("leaves four of the eight sum/prod spellings reachable end to end", () => {
    // Tree keys are Ruby's, so they are built through `JSON.parse` rather than
    // written as object literals — `sum_prod` is data, not an identifier.
    const sumProd = (text: string): PlainTree => Object.fromEntries([["sum_prod", text]]);
    for (const text of ["&#x220f;", "&#x2211;", "∏", "∑"]) {
      expect(plain(grammar.root.parse(text)), text).toStrictEqual(sumProd(text));
    }
    for (const [raw, normalised] of NORMALISATION_PAIRS) {
      if (raw !== "&prod;" && raw !== "&sum;") continue;
      // The rewritten form is a live alternative; the raw one is unreachable
      // through `Html::Parser` and still parses here, because this module's
      // input is the normalised text rather than a user's.
      expect(plain(grammar.root.parse(normalised))).toStrictEqual(sumProd(normalised));
      expect(plain(grammar.root.parse(raw))).toStrictEqual(sumProd(raw));
    }
  });
});

describe("the decimal marker", () => {
  it("agrees with the gem under every locale the gem supports", () => {
    const byMarker = new Map<string, ReturnType<typeof createHtmlGrammar>>();
    for (const [marker, input, gemTree] of LOCALE_FIXTURES) {
      let which = byMarker.get(marker);
      if (which === undefined) {
        which = createHtmlGrammar(marker);
        byMarker.set(marker, which);
      }
      check([input, gemTree], which);
    }
    expect(byMarker.size).toBe(3);
  });

  /**
   * HTML's marker is exclusive, as LaTeX's is: under `fr` a full stop is not a
   * decimal point. UnicodeMath's is not — its `op_decimal` hard-codes `,` and
   * `.` alongside the configured marker — so a port that copied UnicodeMath's
   * shape would accept `1.5` everywhere.
   */
  it("is exclusive: only the configured marker joins two digit runs", () => {
    const comma = createHtmlGrammar(",");
    expect(plain(comma.root.parse("1,5"))).toStrictEqual({ number: "1,5" });
    expect(plain(comma.root.parse("1.5"))).toStrictEqual({
      number: "1",
      expression: { symbol: ".", expression: { number: "5" } },
    });
  });

  /**
   * The marker is matched **raw**, which is the difference from both other
   * formats: theirs match `Utility.string_to_html_entity(marker)` because their
   * parsers encode the whole input first.
   */
  it("matches the Arabic marker as a code point, not as an entity", () => {
    const arabic = createHtmlGrammar(String.fromCodePoint(0x066b));
    expect(plain(arabic.root.parse(`1${String.fromCodePoint(0x066b)}5`))).toStrictEqual({
      number: `1${String.fromCodePoint(0x066b)}5`,
    });
    expect(() => arabic.root.parse("1&#x66b;5")).not.toThrow();
    expect(plain(arabic.root.parse("1&#x66b;5"))).not.toStrictEqual({ number: "1&#x66b;5" });
  });
});

describe("the module's entry points", () => {
  it("caches one grammar per marker and resolves a locale through formatting", () => {
    expect(htmlGrammar()).toBe(htmlGrammar());
    expect(htmlGrammar({ locale: "fr" })).toBe(htmlGrammar({ locale: "fr" }));
    expect(htmlGrammar({ locale: "fr" })).not.toBe(htmlGrammar());
    expect(htmlGrammar({ locale: "fr" }).decimalMarker).toBe(",");
  });

  it("parses through the convenience wrapper and throws a typed refusal", () => {
    expect(plain(parseHtmlNormalized("<i>x</i>"))).toStrictEqual({ sequence: { text: "x" } });
    expect(() => parseHtmlNormalized("<i>x</j>")).toThrow(ParseFailed);
  });

  it("exposes every rule in html/parse.rb, none of them undefined", () => {
    // 24 `rule(...)` declarations in `html/parse.rb` plus the three the
    // `BaseNumberPrefix` mixin adds at `html/parse.rb:6`.
    expect(Object.keys(grammar.rules).length).toBe(27);
    for (const [name, atom] of Object.entries(grammar.rules)) {
      expect(atom, name).toBeDefined();
    }
  });
});
