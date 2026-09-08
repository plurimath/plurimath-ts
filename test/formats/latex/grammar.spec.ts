/**
 * The LaTeX grammar, checked against the gem.
 *
 * Nothing here is reasoned out. Every expectation is the oracle's own answer,
 * pasted verbatim as the JSON string `serialize_tree` emitted — the same
 * serializer the shared corpus uses, so the two meet in one shape and a
 * reviewer can diff a fixture against a fresh run instead of reading a
 * hand-shaped object literal. Produced against plurimath 0.11.6 at
 * `00c52783877b38f6b8e6e109f1803f96bb34fc62`, Ruby 4.0.1, by parsing each
 * input through `Plurimath::Latex::Parse#parse`.
 *
 * Four groups, each answering a different question.
 *
 * 1. **Real LaTeX.** Every distinct `expected.latex` string in the pinned
 *    `plurimath-testsuite` corpus — 87 of them, the gem's own `to_latex`
 *    output for the shared cases — run back through `Latex::Parser`'s
 *    preprocessing and then its grammar. This is the closest thing to a corpus
 *    the LaTeX *input* side has: the shared cases are AsciiMath-in, so they
 *    carry no LaTeX parse tree of their own.
 * 2. **Every rule.** 145 inputs chosen so that each `rule(...)` in
 *    `latex/parse.rb`, each of the nine kinds `dynamic_rules` branches on, and
 *    each helper is exercised at least once — including all 22 bare operants
 *    and all 22 backslashed ones, which is where the Symbol/String collision
 *    would show if the generated table had collapsed.
 * 3. **A sweep**, at verdict level: every string of length 1 and 2 over a
 *    28-character alphabet, 812 inputs, of which the gem refuses 232. This is
 *    what guards the two departures in `symbolAlternation` — the hoisted
 *    backslash and the bucketed dispatch — because a dropped or reordered
 *    alternative turns an accept into a refusal or the reverse.
 * 4. **The decimal marker**, which the shared corpus has no axis for: the same
 *    eight inputs under three locales, whose markers are `.`, `,` and U+066B.
 *
 * These inputs are already preprocessed. `Latex::Parser#pre_processing`
 * (`latex/parser.rb:25`) is a separate slice; group 1 records what the gem's
 * own preprocessing produced, and groups 2-4 are written in the preprocessed
 * form directly, which is why they carry no unescaped spaces and spell `<` as
 * itself rather than as the `&#x3c;` a raw input would have become.
 */

import { describe, expect, it } from "vitest";
import {
  createLatexGrammar,
  latexGrammar,
  parseLatexPreprocessed,
} from "../../../src/formats/latex/grammar";
import { ParseFailed, type ParseValue, Slice } from "../../../src/pegkit/index";

/**
 * The parse tree with slices flattened to their text, everything else
 * structural — what `serialize_tree` produces on the Ruby side. Key order is
 * not compared: the generator sorts, and a deep-equal on plain objects ignores
 * order anyway.
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

const grammar = createLatexGrammar();

function tree(preprocessed: string): PlainTree {
  return plain(grammar.root.parse(preprocessed));
}

/** True when this grammar refuses the input, as the gem's does. */
function refuses(atomInput: string, which = grammar): boolean {
  try {
    which.root.parse(atomInput);
    return false;
  } catch (error) {
    // Only a typed refusal counts. Anything else is a defect of its own and
    // must reach the runner rather than be reported as "the port refused it".
    if (error instanceof ParseFailed) return true;
    throw error;
  }
}

/** The preprocessed input, and the tree the gem produced for it, verbatim. */
type Fixture = readonly [preprocessed: string, gemTree: string];

// --- group 1: the gem's own LaTeX, from the pinned corpus -------------------

const CORPUS_FIXTURES: readonly Fixture[] = [
  [
    "(a",
    '{"intermediate_exp":{"expression":{"symbols":"a"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(a,b,c)",
    '{"intermediate_exp":{"expression":{"expression":{"expression":{"expression":{"expression":{"symbols":"c"},"sequence":{"operant":","}},"sequence":{"symbols":"b"}},"sequence":{"operant":","}},"sequence":{"symbols":"a"}},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}',
  ],
  [
    "(x)",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}',
  ],
  [
    "(x+y)",
    '{"intermediate_exp":{"expression":{"expression":{"expression":{"symbols":"y"},"sequence":{"operant":"+"}},"sequence":{"symbols":"x"}},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}',
  ],
  [
    "(x+y)^{2}=x^{2}+2xy+y^{2}",
    '{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"power":{"supscript":{"expression":{"number":"2"}},"symbols":"y"}},"sequence":{"operant":"+"}},"sequence":{"symbols":"y"}},"sequence":{"symbols":"x"}},"sequence":{"number":"2"}},"sequence":{"operant":"+"}},"sequence":{"power":{"supscript":{"expression":{"number":"2"}},"symbols":"x"}}},"sequence":{"operant":"="}},"sequence":{"power":{"intermediate_exp":{"expression":{"expression":{"expression":{"symbols":"y"},"sequence":{"operant":"+"}},"sequence":{"symbols":"x"}},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}},"supscript":{"expression":{"number":"2"}}}}}',
  ],
  ["0", '{"number":"0"}'],
  ["123", '{"number":"123"}'],
  ["2", '{"number":"2"}'],
  [
    "2\\pir",
    '{"expression":{"expression":{"symbols":"r"},"sequence":{"symbols":"pi"}},"sequence":{"number":"2"}}',
  ],
  ["2x", '{"expression":{"symbols":"x"},"sequence":{"number":"2"}}'],
  ["2.5", '{"number":"2.5"}'],
  ["2^{10}", '{"power":{"number":"2","supscript":{"expression":{"number":"10"}}}}'],
  ["3.14159", '{"number":"3.14159"}'],
  [
    "[a,b]",
    '{"intermediate_exp":{"expression":{"expression":{"expression":{"symbols":"b"},"sequence":{"operant":","}},"sequence":{"symbols":"a"}},"left_paren":{"lparen":"["},"right_paren":{"rparen":"]"}}}',
  ],
  ["\\alpha", '{"symbols":"alpha"}'],
  [
    "\\alpha\\beta\\gamma",
    '{"expression":{"expression":{"symbols":"gamma"},"sequence":{"symbols":"beta"}},"sequence":{"symbols":"alpha"}}',
  ],
  [
    "\\cos{(2x)}",
    '{"unary_functions":{"first_value":{"expression":{"intermediate_exp":{"expression":{"expression":{"symbols":"x"},"sequence":{"number":"2"}},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}},"unary":"cos"}}',
  ],
  [
    "\\frac{2}{3}",
    '{"binary":{"binary":"frac","first_value":{"expression":{"number":"2"}},"second_value":{"expression":{"number":"3"}}}}',
  ],
  [
    "\\frac{a+b}{c}",
    '{"binary":{"binary":"frac","first_value":{"expression":{"expression":{"expression":{"symbols":"b"},"sequence":{"operant":"+"}},"sequence":{"symbols":"a"}}},"second_value":{"expression":{"symbols":"c"}}}}',
  ],
  [
    "\\frac{a}{+}b",
    '{"expression":{"symbols":"b"},"sequence":{"binary":{"binary":"frac","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"operant":"+"}}}}}',
  ],
  [
    "\\frac{a}{b}",
    '{"binary":{"binary":"frac","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}}}',
  ],
  [
    "\\frac{a}{b}+\\frac{c}{d}",
    '{"expression":{"expression":{"binary":{"binary":"frac","first_value":{"expression":{"symbols":"c"}},"second_value":{"expression":{"symbols":"d"}}}},"sequence":{"operant":"+"}},"sequence":{"binary":{"binary":"frac","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}}}}',
  ],
  [
    "\\frac{x+y}{2}",
    '{"binary":{"binary":"frac","first_value":{"expression":{"expression":{"expression":{"symbols":"y"},"sequence":{"operant":"+"}},"sequence":{"symbols":"x"}}},"second_value":{"expression":{"number":"2"}}}}',
  ],
  [
    "\\frac{x^{2}}{4}",
    '{"binary":{"binary":"frac","first_value":{"expression":{"power":{"supscript":{"expression":{"number":"2"}},"symbols":"x"}}},"second_value":{"expression":{"number":"4"}}}}',
  ],
  [
    "\\frac{x}{y+z}",
    '{"binary":{"binary":"frac","first_value":{"expression":{"symbols":"x"}},"second_value":{"expression":{"expression":{"expression":{"symbols":"z"},"sequence":{"operant":"+"}},"sequence":{"symbols":"y"}}}}}',
  ],
  ["\\hat{x}", '{"unary_functions":{"first_value":{"expression":{"symbols":"x"}},"unary":"hat"}}'],
  ["\\infty", '{"symbols":"infty"}'],
  [
    "\\int_{0}^{1}xdx",
    '{"expression":{"expression":{"symbols":"x"},"sequence":{"symbols":"d"}},"sequence":{"ternary_class":{"subscript":{"expression":{"number":"0"}},"supscript":{"expression":{"number":"1"}},"ternary_functions":"int","third_value":{"symbols":"x"}}}}',
  ],
  [
    "\\left(\\frac{a}{b}\\right)",
    '{"left_right":{"expression":{"binary":{"binary":"frac","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}}},"left":"\\\\left","left_paren":"(","right":"\\\\right","right_paren":")"}}',
  ],
  [
    "\\left(x\\right)",
    '{"left_right":{"expression":{"symbols":"x"},"left":"\\\\left","left_paren":"(","right":"\\\\right","right_paren":")"}}',
  ],
  [
    "\\left(\\begin{matrix}a\\\\b\\end{matrix}\\right)",
    '{"left_right":{"expression":{"environment":{"ending":{"environment":"matrix"},"environment":"matrix","table_data":{"expression":{"expression":{"symbols":"b"},"sequence":{"\\\\\\\\":"\\\\\\\\"}},"sequence":{"symbols":"a"}}}},"left":"\\\\left","left_paren":"(","right":"\\\\right","right_paren":")"}}',
  ],
  [
    "\\left[x\\right]",
    '{"left_right":{"expression":{"symbols":"x"},"left":"\\\\left","left_paren":"[","right":"\\\\right","right_paren":"]"}}',
  ],
  [
    "\\left[\\begin{matrix}a&b\\\\c&d\\end{matrix}\\right]",
    '{"left_right":{"expression":{"environment":{"ending":{"environment":"matrix"},"environment":"matrix","table_data":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"symbols":"d"},"sequence":{"operant":"&"}},"sequence":{"symbols":"c"}},"sequence":{"\\\\\\\\":"\\\\\\\\"}},"sequence":{"symbols":"b"}},"sequence":{"operant":"&"}},"sequence":{"symbols":"a"}}}},"left":"\\\\left","left_paren":"[","right":"\\\\right","right_paren":"]"}}',
  ],
  [
    "\\lim_{x\\to\\infty}f(x)",
    '{"expression":{"expression":{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}},"sequence":{"symbols":"f"}},"sequence":{"power_base":{"binary":"lim","subscript":{"expression":{"expression":{"expression":{"symbols":"infty"},"sequence":{"symbols":"to"}},"sequence":{"symbols":"x"}}}}}}',
  ],
  [
    "\\log_{2}8",
    '{"expression":{"number":"8"},"sequence":{"power_base":{"binary":"log","subscript":{"expression":{"number":"2"}}}}}',
  ],
  ["\\mathbb{x}", '{"fonts":"mathbb","intermediate_exp":{"expression":{"symbols":"x"}}}'],
  [
    "\\mathbf{A}+\\mathcal{B}",
    '{"expression":{"expression":{"fonts":"mathcal","intermediate_exp":{"expression":{"symbols":"B"}}},"sequence":{"operant":"+"}},"sequence":{"fonts":"mathbf","intermediate_exp":{"expression":{"symbols":"A"}}}}',
  ],
  ["\\mathbf{x}", '{"fonts":"mathbf","intermediate_exp":{"expression":{"symbols":"x"}}}'],
  ["\\mathcal{x}", '{"fonts":"mathcal","intermediate_exp":{"expression":{"symbols":"x"}}}'],
  ["\\mathdollar", '{"symbols":"mathdollar"}'],
  ["\\mathfrak{x}", '{"fonts":"mathfrak","intermediate_exp":{"expression":{"symbols":"x"}}}'],
  [
    "\\mathrm{kg}",
    '{"fonts":"mathrm","intermediate_exp":{"expression":{"expression":{"symbols":"g"},"sequence":{"symbols":"k"}}}}',
  ],
  ["\\mathsf{x}", '{"fonts":"mathsf","intermediate_exp":{"expression":{"symbols":"x"}}}'],
  ["\\mathtt{x}", '{"fonts":"mathtt","intermediate_exp":{"expression":{"symbols":"x"}}}'],
  [
    "\\overline{x}",
    '{"unary_functions":{"first_value":{"expression":{"symbols":"x"}},"unary":"overline"}}',
  ],
  ["\\pi", '{"symbols":"pi"}'],
  [
    "\\prod_{k=1}^{n}k",
    '{"ternary_class":{"subscript":{"expression":{"expression":{"expression":{"number":"1"},"sequence":{"operant":"="}},"sequence":{"symbols":"k"}}},"supscript":{"expression":{"symbols":"n"}},"ternary_functions":"prod","third_value":{"symbols":"k"}}}',
  ],
  ["\\sigma", '{"symbols":"sigma"}'],
  [
    "\\sin{(x)}",
    '{"unary_functions":{"first_value":{"expression":{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}},"unary":"sin"}}',
  ],
  ["\\sin{x}", '{"unary_functions":{"first_value":{"expression":{"symbols":"x"}},"unary":"sin"}}'],
  [
    "\\sqrt[3]{x+1}",
    '{"binary":{"first_value":{"expression":[{"number":"3"}],"lparen":"[","rparen":"]"},"root":"sqrt","second_value":{"expression":{"expression":{"expression":{"number":"1"},"sequence":{"operant":"+"}},"sequence":{"symbols":"x"}}}}}',
  ],
  ["\\sqrt{2}", '{"binary":{"intermediate_exp":{"expression":{"number":"2"}},"sqrt":"sqrt"}}'],
  [
    "\\sqrt{a^{2}+b^{2}}",
    '{"binary":{"intermediate_exp":{"expression":{"expression":{"expression":{"power":{"supscript":{"expression":{"number":"2"}},"symbols":"b"}},"sequence":{"operant":"+"}},"sequence":{"power":{"supscript":{"expression":{"number":"2"}},"symbols":"a"}}}},"sqrt":"sqrt"}}',
  ],
  [
    "\\sqrt{x+1}",
    '{"binary":{"intermediate_exp":{"expression":{"expression":{"expression":{"number":"1"},"sequence":{"operant":"+"}},"sequence":{"symbols":"x"}}},"sqrt":"sqrt"}}',
  ],
  ["\\sqrt{x}", '{"binary":{"intermediate_exp":{"expression":{"symbols":"x"}},"sqrt":"sqrt"}}'],
  ["\\sumx", '{"expression":{"symbols":"x"},"sequence":{"ternary":"sum"}}'],
  [
    "\\sum_{i=1}^{n}i",
    '{"ternary_class":{"subscript":{"expression":{"expression":{"expression":{"number":"1"},"sequence":{"operant":"="}},"sequence":{"symbols":"i"}}},"supscript":{"expression":{"symbols":"n"}},"ternary_functions":"sum","third_value":{"symbols":"i"}}}',
  ],
  [
    "\\sum_{i=1}^{n}i^{3}=(\\frac{n(n+1)}{2})^{2}",
    '{"expression":{"expression":{"power":{"intermediate_exp":{"expression":{"binary":{"binary":"frac","first_value":{"expression":{"expression":{"intermediate_exp":{"expression":{"expression":{"expression":{"number":"1"},"sequence":{"operant":"+"}},"sequence":{"symbols":"n"}},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}},"sequence":{"symbols":"n"}}},"second_value":{"expression":{"number":"2"}}}},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}},"supscript":{"expression":{"number":"2"}}}},"sequence":{"operant":"="}},"sequence":{"ternary_class":{"subscript":{"expression":{"expression":{"expression":{"number":"1"},"sequence":{"operant":"="}},"sequence":{"symbols":"i"}}},"supscript":{"expression":{"symbols":"n"}},"ternary_functions":"sum","third_value":{"power":{"supscript":{"expression":{"number":"3"}},"symbols":"i"}}}}}',
  ],
  ["\\text{hello world}", '{"first_value":"hello world","text":"text"}'],
  ["\\text{hello}", '{"first_value":"hello","text":"text"}'],
  ["\\vec{v}", '{"unary_functions":{"first_value":{"expression":{"symbols":"v"}},"unary":"vec"}}'],
  [
    "\\{x\\}",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"\\\\{"},"right_paren":{"rparen":"\\\\}"}}}',
  ],
  [
    "a+b+c",
    '{"expression":{"expression":{"expression":{"expression":{"symbols":"c"},"sequence":{"operant":"+"}},"sequence":{"symbols":"b"}},"sequence":{"operant":"+"}},"sequence":{"symbols":"a"}}',
  ],
  [
    "a-b",
    '{"expression":{"expression":{"symbols":"b"},"sequence":{"operant":"-"}},"sequence":{"symbols":"a"}}',
  ],
  [
    "a\\cdotb",
    '{"expression":{"expression":{"symbols":"b"},"sequence":{"symbols":"cdot"}},"sequence":{"symbols":"a"}}',
  ],
  ["ab", '{"expression":{"symbols":"b"},"sequence":{"symbols":"a"}}'],
  ["a_{1}", '{"base":{"subscript":{"expression":{"number":"1"}},"symbols":"a"}}'],
  [
    "a_{n+1}",
    '{"base":{"subscript":{"expression":{"expression":{"expression":{"number":"1"},"sequence":{"operant":"+"}},"sequence":{"symbols":"n"}}},"symbols":"a"}}',
  ],
  ["e^{x}", '{"power":{"supscript":{"expression":{"symbols":"x"}},"symbols":"e"}}'],
  [
    "f(x)=x^{2}",
    '{"expression":{"expression":{"expression":{"power":{"supscript":{"expression":{"number":"2"}},"symbols":"x"}},"sequence":{"operant":"="}},"sequence":{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}},"sequence":{"symbols":"f"}}',
  ],
  ["x", '{"symbols":"x"}'],
  [
    "x+y",
    '{"expression":{"expression":{"symbols":"y"},"sequence":{"operant":"+"}},"sequence":{"symbols":"x"}}',
  ],
  [
    "x=y",
    '{"expression":{"expression":{"symbols":"y"},"sequence":{"operant":"="}},"sequence":{"symbols":"x"}}',
  ],
  ["x^", '{"expression":{"operant":"^"},"sequence":{"symbols":"x"}}'],
  ["xy", '{"expression":{"symbols":"y"},"sequence":{"symbols":"x"}}'],
  [
    "xyz",
    '{"expression":{"expression":{"symbols":"z"},"sequence":{"symbols":"y"}},"sequence":{"symbols":"x"}}',
  ],
  ["x^{2}", '{"power":{"supscript":{"expression":{"number":"2"}},"symbols":"x"}}'],
  [
    "x^{n+1}",
    '{"power":{"supscript":{"expression":{"expression":{"expression":{"number":"1"},"sequence":{"operant":"+"}},"sequence":{"symbols":"n"}}},"symbols":"x"}}',
  ],
  [
    "x_{1}^{2}",
    '{"power_base":{"subscript":{"expression":{"number":"1"}},"supscript":{"expression":{"number":"2"}},"symbols":"x"}}',
  ],
  [
    "{(a+b)}\\mod{n}",
    '{"under_over":{"binary":"mod","first_value":{"expression":{"intermediate_exp":{"expression":{"expression":{"expression":{"symbols":"b"},"sequence":{"operant":"+"}},"sequence":{"symbols":"a"}},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}},"second_value":{"expression":{"symbols":"n"}}}}',
  ],
  [
    "{\\color{blue}x}+y",
    '{"expression":{"expression":{"symbols":"y"},"sequence":{"operant":"+"}},"sequence":{"binary":"color","first_value":{"symbol":"blue"},"second_value":{"symbols":"x"}}}',
  ],
  [
    "{\\color{red}x}",
    '{"binary":"color","first_value":{"symbol":"red"},"second_value":{"symbols":"x"}}',
  ],
  [
    "{a}\\mod{b}",
    '{"under_over":{"binary":"mod","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}}}',
  ],
  [
    "{x}\\mod{2}",
    '{"under_over":{"binary":"mod","first_value":{"expression":{"symbols":"x"}},"second_value":{"expression":{"number":"2"}}}}',
  ],
];

/** The three the gem itself refuses. Its refusals are the contract too. */
const CORPUS_REFUSED: readonly string[] = ["))))", "\\abs{x}", "a)"];

// --- group 2: one or more inputs per rule, kind and helper ------------------

const RULE_FIXTURES: readonly Fixture[] = [
  ["x_1", '{"base":{"subscript":{"number":"1"},"symbols":"x"}}'],
  ["x^2", '{"power":{"supscript":{"number":"2"},"symbols":"x"}}'],
  ["x_1^2", '{"power_base":{"subscript":{"number":"1"},"supscript":{"number":"2"},"symbols":"x"}}'],
  ["x^2_1", '{"power_base":{"subscript":{"number":"1"},"supscript":{"number":"2"},"symbols":"x"}}'],
  ["{x}", '{"expression":{"symbols":"x"}}'],
  [
    "[x]",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"["},"right_paren":{"rparen":"]"}}}',
  ],
  ["_", '{"operant":"_"}'],
  ["|", '{"operant":"|"}'],
  ["^", '{"operant":"^"}'],
  [">", '{"operant":">"}'],
  ["<", '{"operant":"<"}'],
  ["-", '{"operant":"-"}'],
  ["/", '{"operant":"/"}'],
  ["+", '{"operant":"+"}'],
  ["*", '{"operant":"*"}'],
  ["!", '{"operant":"!"}'],
  ["&", '{"operant":"&"}'],
  ["%", '{"operant":"%"}'],
  ["@", '{"operant":"@"}'],
  ["?", '{"operant":"?"}'],
  ["=", '{"operant":"="}'],
  [";", '{"operant":";"}'],
  [":", '{"operant":":"}'],
  [".", '{"operant":"."}'],
  [",", '{"operant":","}'],
  ["$", '{"operant":"$"}'],
  ["'", '{"operant":"\'"}'],
  ["#", '{"operant":"#"}'],
  ["\\_", '{"symbols":"_"}'],
  ["\\|", '{"symbols":"|"}'],
  ["\\^", '{"symbols":"^"}'],
  ["\\>", '{"symbols":">"}'],
  ["\\<", '{"symbols":"<"}'],
  ["\\-", '{"symbols":"-"}'],
  ["\\/", '{"symbols":"/"}'],
  ["\\+", '{"symbols":"+"}'],
  ["\\*", '{"symbols":"*"}'],
  ["\\!", '{"symbols":"!"}'],
  ["\\&", '{"symbols":"&"}'],
  ["\\%", '{"symbols":"%"}'],
  ["\\@", '{"symbols":"@"}'],
  ["\\?", '{"symbols":"?"}'],
  ["\\=", '{"symbols":"="}'],
  ["\\;", '{"three_per_em_space":"\\\\;"}'],
  ["\\:", '{"symbols":":"}'],
  ["\\.", '{"symbols":"."}'],
  ["\\,", '{"symbols":","}'],
  ["\\$", '{"symbols":"$"}'],
  ["\\'", '{"symbols":"\'"}'],
  ["\\#", '{"symbols":"#"}'],
  ["zero", '{"numeric_values":"zero"}'],
  ["nine", '{"numeric_values":"nine"}'],
  ["\\bmod", '{"binary":"bmod"}'],
  [
    "\\pmod",
    '{"expression":{"expression":{"symbols":"d"},"sequence":{"symbols":"o"}},"sequence":{"symbols":"pm"}}',
  ],
  ["\\mod", '{"binary":"mod"}'],
  [
    "a\\bmodb",
    '{"under_over":{"binary":"bmod","first_value":{"symbols":"a"},"second_value":{"symbols":"b"}}}',
  ],
  ["\\lg", '{"unary":"lg"}'],
  ["\\Pr", '{"unary_functions":"Pr"}'],
  ["\\gcd", '{"unary":"gcd"}'],
  ["\\sin", '{"unary":"sin"}'],
  ["\\arg", '{"unary_functions":"arg"}'],
  ["\\lim", '{"binary":"lim"}'],
  ["\\log", '{"binary":"log"}'],
  ["\\inf", '{"binary":"inf"}'],
  [
    "\\lim_0^1",
    '{"power_base":{"binary":"lim","subscript":{"number":"0"},"supscript":{"number":"1"}}}',
  ],
  [
    "\\lim^1_0",
    '{"power_base":{"binary":"lim","subscript":{"number":"0"},"supscript":{"number":"1"}}}',
  ],
  ["\\lim_0", '{"power_base":{"binary":"lim","subscript":{"number":"0"}}}'],
  ["\\lim^1", '{"power_base":{"binary":"lim","supscript":{"number":"1"}}}'],
  ["\\liminf", '{"unary":"liminf"}'],
  ["\\intercal", '{"symbols":"intercal"}'],
  ["\\top", '{"symbols":"top"}'],
  ["\\to", '{"symbols":"to"}'],
  ["\\overbrace", '{"underover":"overbrace"}'],
  [
    "\\overbrace_a^b",
    '{"subscript":{"symbols":"a"},"supscript":{"symbols":"b"},"underover":"overbrace"}',
  ],
  [
    "\\overbrace{x}_a",
    '{"first_value":{"expression":{"symbols":"x"}},"subscript":{"symbols":"a"},"underover":"overbrace"}',
  ],
  [
    "\\binom{a}{b}",
    '{"binary":{"binary":"binom","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}}}',
  ],
  [
    "\\overset{a}{b}",
    '{"binary":{"binary":"overset","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}}}',
  ],
  [
    "\\underset{a}{b}",
    '{"binary":{"binary":"underset","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}}}',
  ],
  [
    "\\stackrel{a}{b}",
    '{"binary":{"binary":"stackrel","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}}}',
  ],
  ["\\int", '{"ternary":"int"}'],
  [
    "\\int_0^1",
    '{"ternary_class":{"subscript":{"number":"0"},"supscript":{"number":"1"},"ternary_functions":"int"}}',
  ],
  [
    "\\int_0^1x",
    '{"ternary_class":{"subscript":{"number":"0"},"supscript":{"number":"1"},"ternary_functions":"int","third_value":{"symbols":"x"}}}',
  ],
  [
    "\\sum_0^1",
    '{"ternary_class":{"subscript":{"number":"0"},"supscript":{"number":"1"},"ternary_functions":"sum"}}',
  ],
  ["\\prod", '{"ternary":"prod"}'],
  ["\\oint", '{"ternary":"oint"}'],
  ["\\mbox{hi}", '{"first_value":"hi","text":"mbox"}'],
  ["\\text{a{b}c}", '{"first_value":"a{b}c","text":"text"}'],
  ["\\text{}", '{"first_value":[],"text":"text"}'],
  ["\\mathfrak{a}", '{"fonts":"mathfrak","intermediate_exp":{"expression":{"symbols":"a"}}}'],
  ["\\displaystylex", '{"fonts":"displaystyle","intermediate_exp":{"symbols":"x"}}'],
  ["\\mathcal{A}", '{"fonts":"mathcal","intermediate_exp":{"expression":{"symbols":"A"}}}'],
  [
    "\\tilde{x}",
    '{"unary_functions":{"first_value":{"expression":{"symbols":"x"}},"unary":"tilde"}}',
  ],
  ["\\overline", '{"unary":"overline"}'],
  [
    "\\overline{x}_a",
    '{"base":{"subscript":{"symbols":"a"},"unary_functions":{"first_value":{"expression":{"symbols":"x"}},"unary":"overline"}}}',
  ],
  [
    "\\overline\\left(x\\right)",
    '{"unary_functions":{"first_value":{"expression":{"symbols":"x"},"left":"\\\\left","left_paren":"(","right":"\\\\right","right_paren":")"},"unary":"overline"}}',
  ],
  [
    "\\phantom{x}",
    '{"unary_functions":{"first_value":{"expression":{"symbols":"x"}},"unary":"phantom"}}',
  ],
  [
    "\\sqrt[3]{x}",
    '{"binary":{"first_value":{"expression":[{"number":"3"}],"lparen":"[","rparen":"]"},"root":"sqrt","second_value":{"expression":{"symbols":"x"}}}}',
  ],
  [
    "\\sqrt[]{x}",
    '{"binary":{"first_value":{"lparen":"[","rparen":"]"},"root":"sqrt","second_value":{"expression":{"symbols":"x"}}}}',
  ],
  [
    "\\color{red}x",
    '{"binary":"color","first_value":{"symbol":"red"},"second_value":{"symbols":"x"}}',
  ],
  ["\\colorZ", '{"binary":"color","first_value":{"symbol":"Z"}}'],
  ["\\color{}x", '{"binary":"color","first_value":{"symbol":[]},"second_value":{"symbols":"x"}}'],
  [
    "\\left\\langlex\\right\\rangle",
    '{"left_right":{"expression":{"symbols":"x"},"left":"\\\\left","left_paren":"\\\\langle","right":"\\\\right","right_paren":"\\\\rangle"}}',
  ],
  [
    "\\left.x\\right.",
    '{"left_right":{"expression":{"symbols":"x"},"left":"\\\\left","right":"\\\\right"}}',
  ],
  [
    "\\left(a\\overb\\right)",
    '{"left_right":{"dividend":[{"symbols":"a"}],"divisor":[{"symbols":"b"}],"left":"\\\\left","left_paren":"(","right":"\\\\right","right_paren":")"}}',
  ],
  ["\\left(x", '{"left_right":{"expression":{"symbols":"x"},"left":"\\\\left","left_paren":"("}}'],
  ["{a\\overb}", '{"over":{"dividend":[{"symbols":"a"}],"divisor":[{"symbols":"b"}]}}'],
  [
    "{a\\overb}^2",
    '{"over":{"dividend":[{"symbols":"a"}],"divisor":[{"symbols":"b"}]},"supscript":{"number":"2"}}',
  ],
  ["a\\overb", '{"dividend":{"symbols":"a"},"divisor":{"symbols":"b"}}'],
  [
    "\\left(x\\right)^2",
    '{"over":{"number":"2","power":{"left_right":{"expression":{"symbols":"x"},"left":"\\\\left","left_paren":"(","right":"\\\\right","right_paren":")"}}}}',
  ],
  [
    "\\begin{matrix}a\\end{matrix}",
    '{"environment":{"ending":{"environment":"matrix"},"environment":"matrix","table_data":{"symbols":"a"}}}',
  ],
  [
    "\\begin{pmatrix}a&b\\end{pmatrix}",
    '{"environment":{"ending":{"environment":"pmatrix"},"environment":"pmatrix","table_data":{"expression":{"expression":{"symbols":"b"},"sequence":{"operant":"&"}},"sequence":{"symbols":"a"}}}}',
  ],
  [
    "\\begin{array}{cc}a&b\\end{array}",
    '{"environment":{"args":{"expression":{"symbols":"c"},"sequence":{"symbols":"c"}},"ending":{"environment":"array"},"environment":"array","table_data":{"expression":{"expression":{"symbols":"b"},"sequence":{"operant":"&"}},"sequence":{"symbols":"a"}}}}',
  ],
  [
    "\\begin{align*}x\\end{align*}",
    '{"environment":{"asterisk":"*","ending":{"environment":"align"},"environment":"align","table_data":{"symbols":"x"}}}',
  ],
  [
    "\\begin{align*}[l]x\\end{align*}",
    '{"environment":{"asterisk":"*","ending":{"environment":"align"},"environment":"align","options":{"symbols":"l"},"table_data":{"symbols":"x"}}}',
  ],
  ["\\matrix{x}", '{"table_data":{"environment":"matrix","expression":{"symbols":"x"}}}'],
  ["\\substack{a}", '{"expression":{"symbols":"a"},"substack":"substack"}'],
  [
    "\\rule[1]{2}{3}",
    '{"binary":{"first_value":{"expression":[{"number":"1"}],"lparen":"[","rparen":"]"},"rule":"rule","second_value":{"expression":{"number":"2"}},"third_value":{"expression":{"number":"3"}}}}',
  ],
  [
    "\\rule",
    '{"binary":{"first_value":null,"rule":"rule","second_value":null,"third_value":null}}',
  ],
  [
    "\\int\\limits_0^1",
    '{"limits":{"base":{"number":"0"},"first_value":{"ternary":"int"},"power":{"number":"1"}}}',
  ],
  [
    "\\int\\limits^1_0",
    '{"limits":{"base":{"number":"0"},"first_value":{"ternary":"int"},"power":{"number":"1"}}}',
  ],
  ["&#x3c0;", '{"unicode_symbols":"&#x3c0;"}'],
  ["&#x;", '{"unicode_symbols":"&#x;"}'],
  [
    "&#xZZ;",
    '{"expression":{"expression":{"expression":{"expression":{"expression":{"operant":";"},"sequence":{"symbols":"Z"}},"sequence":{"symbols":"Z"}},"sequence":{"symbols":"x"}},"sequence":{"operant":"#"}},"sequence":{"operant":"&"}}',
  ],
  [
    "&nosuchentity;",
    '{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"expression":{"operant":";"},"sequence":{"symbols":"y"}},"sequence":{"symbols":"t"}},"sequence":{"symbols":"i"}},"sequence":{"symbols":"t"}},"sequence":{"symbols":"n"}},"sequence":{"symbols":"e"}},"sequence":{"symbols":"h"}},"sequence":{"symbols":"c"}},"sequence":{"symbols":"u"}},"sequence":{"symbols":"s"}},"sequence":{"symbols":"o"}},"sequence":{"symbols":"n"}},"sequence":{"operant":"&"}}',
  ],
  ["\\ ", '{"space":"\\\\ "}'],
  ["\\\\", '{"\\\\\\\\":"\\\\\\\\"}'],
  ["\\operatorname{foo}", '{"symbols":"foo"}'],
  ['"', '{"symbol":"\\""}'],
  [
    '"x"',
    '{"expression":{"expression":{"symbol":"\\""},"sequence":{"symbols":"x"}},"sequence":{"symbol":"\\""}}',
  ],
  ["0x1f", '{"hex_number":"1f"}'],
  ["0XFF", '{"hex_number":"FF"}'],
  ["0b101", '{"binary_number":"101"}'],
  ["0o17", '{"octal_number":"17"}'],
  ["12", '{"number":"12"}'],
  ["1.5", '{"number":"1.5"}'],
  [".5", '{"expression":{"number":"5"},"sequence":{"operant":"."}}'],
  ["5.", '{"expression":{"operant":"."},"sequence":{"number":"5"}}'],
  [
    "(x",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(x\\.",
    '{"intermediate_exp":{"expression":{"expression":{"symbols":"."},"sequence":{"symbols":"x"}},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(x\\ .",
    '{"intermediate_exp":{"expression":{"expression":{"expression":{"operant":"."},"sequence":{"space":"\\\\ "}},"sequence":{"symbols":"x"}},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(x\\",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"("},"right_paren":{"rparen":"\\\\"}}}',
  ],
  [
    "\\lbrackx\\rbrack",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"\\\\lbrack"},"right_paren":{"rparen":"\\\\rbrack"}}}',
  ],
  [
    "\\langlex\\rangle",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"\\\\langle"},"right_paren":{"rparen":"\\\\rangle"}}}',
  ],
  [
    "\\Vertx\\Vert",
    '{"intermediate_exp":{"expression":{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"\\\\Vert"},"right_paren":null}},"sequence":{"symbols":"x"}},"left_paren":{"lparen":"\\\\Vert"},"right_paren":null}}',
  ],
  [
    "x\\limits^1_0",
    '{"limits":{"base":{"number":"0"},"first_value":{"symbols":"x"},"power":{"number":"1"}}}',
  ],
  // --- sequence's branch order where it is observable (parse.rb:145-147):
  //     a binary_function carrying a script, against the bare one below it
  [
    "\\sqrt{x}^2",
    '{"power":{"binary_functions":{"binary":{"intermediate_exp":{"expression":{"symbols":"x"}},"sqrt":"sqrt"}},"supscript":{"number":"2"}}}',
  ],
  [
    "\\sqrt{x}_2",
    '{"base":{"binary_functions":{"binary":{"intermediate_exp":{"expression":{"symbols":"x"}},"sqrt":"sqrt"}},"subscript":{"number":"2"}}}',
  ],
  [
    "{\\sqrt{x}^2}",
    '{"expression":{"power":{"binary_functions":{"binary":{"intermediate_exp":{"expression":{"symbols":"x"}},"sqrt":"sqrt"}},"supscript":{"number":"2"}}}}',
  ],
  [
    "\\frac{a}{b}^2",
    '{"power":{"binary":{"binary":"frac","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}},"supscript":{"number":"2"}}}',
  ],
  [
    "\\frac{a}{b}_2",
    '{"base":{"binary":{"binary":"frac","first_value":{"expression":{"symbols":"a"}},"second_value":{"expression":{"symbols":"b"}}},"subscript":{"number":"2"}}}',
  ],
  [
    "\\overline{x}^2",
    '{"power":{"supscript":{"number":"2"},"unary_functions":{"first_value":{"expression":{"symbols":"x"}},"unary":"overline"}}}',
  ],
  [
    "(\\sqrt{x}^2)",
    '{"intermediate_exp":{"expression":{"power":{"binary_functions":{"binary":{"intermediate_exp":{"expression":{"symbols":"x"}},"sqrt":"sqrt"}},"supscript":{"number":"2"}}},"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}',
  ],
  [
    "\\color{red}x^2",
    '{"binary":"color","first_value":{"symbol":"red"},"second_value":{"power":{"supscript":{"number":"2"},"symbols":"x"}}}',
  ],
];

// --- group 3: the length-1 and length-2 sweep ------------------------------

/**
 * The alphabet the sweep is built over: every character that starts a rule in
 * `latex/parse.rb`, plus a letter, a digit and the punctuation the
 * Symbol/String collision covers.
 */
const SWEEP_ALPHABET = [...'\\{}[]()^_&#%$ax1.,;:"|*+-<=>'];

/** Every swept string the gem accepts, with the tree it produced. */
const SWEEP_FIXTURES: readonly Fixture[] = [
  ["[", '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}}'],
  ["(", '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}}'],
  ["^", '{"operant":"^"}'],
  ["_", '{"operant":"_"}'],
  ["&", '{"operant":"&"}'],
  ["#", '{"operant":"#"}'],
  ["%", '{"operant":"%"}'],
  ["$", '{"operant":"$"}'],
  ["a", '{"symbols":"a"}'],
  ["x", '{"symbols":"x"}'],
  ["1", '{"number":"1"}'],
  [".", '{"operant":"."}'],
  [",", '{"operant":","}'],
  [";", '{"operant":";"}'],
  [":", '{"operant":":"}'],
  ['"', '{"symbol":"\\""}'],
  ["|", '{"operant":"|"}'],
  ["*", '{"operant":"*"}'],
  ["+", '{"operant":"+"}'],
  ["-", '{"operant":"-"}'],
  ["<", '{"operant":"<"}'],
  ["=", '{"operant":"="}'],
  [">", '{"operant":">"}'],
  ["\\\\", '{"\\\\\\\\":"\\\\\\\\"}'],
  [
    "\\{",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"\\\\{"},"right_paren":null}}',
  ],
  [
    "\\[",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"\\\\["},"right_paren":null}}',
  ],
  [
    "\\(",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"\\\\("},"right_paren":null}}',
  ],
  ["\\^", '{"symbols":"^"}'],
  ["\\_", '{"symbols":"_"}'],
  ["\\&", '{"symbols":"&"}'],
  ["\\#", '{"symbols":"#"}'],
  ["\\%", '{"symbols":"%"}'],
  ["\\$", '{"symbols":"$"}'],
  ["\\.", '{"symbols":"."}'],
  ["\\,", '{"symbols":","}'],
  ["\\;", '{"three_per_em_space":"\\\\;"}'],
  ["\\:", '{"symbols":":"}'],
  ["\\|", '{"symbols":"|"}'],
  ["\\*", '{"symbols":"*"}'],
  ["\\+", '{"symbols":"+"}'],
  ["\\-", '{"symbols":"-"}'],
  ["\\<", '{"symbols":"<"}'],
  ["\\=", '{"symbols":"="}'],
  ["\\>", '{"symbols":">"}'],
  ["{}", '{"expression":null}'],
  [
    "[\\",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":{"rparen":"\\\\"}}}',
  ],
  [
    "[[",
    '{"intermediate_exp":{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[]",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":{"rparen":"]"}}}',
  ],
  [
    "[(",
    '{"intermediate_exp":{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[)",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":{"rparen":")"}}}',
  ],
  [
    "[^",
    '{"intermediate_exp":{"expression":{"operant":"^"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[_",
    '{"intermediate_exp":{"expression":{"operant":"_"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[&",
    '{"intermediate_exp":{"expression":{"operant":"&"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[#",
    '{"intermediate_exp":{"expression":{"operant":"#"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[%",
    '{"intermediate_exp":{"expression":{"operant":"%"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[$",
    '{"intermediate_exp":{"expression":{"operant":"$"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[a",
    '{"intermediate_exp":{"expression":{"symbols":"a"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[x",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[1",
    '{"intermediate_exp":{"expression":{"number":"1"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[.",
    '{"intermediate_exp":{"expression":{"operant":"."},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[,",
    '{"intermediate_exp":{"expression":{"operant":","},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[;",
    '{"intermediate_exp":{"expression":{"operant":";"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[:",
    '{"intermediate_exp":{"expression":{"operant":":"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    '["',
    '{"intermediate_exp":{"expression":{"symbol":"\\""},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[|",
    '{"intermediate_exp":{"expression":{"operant":"|"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[*",
    '{"intermediate_exp":{"expression":{"operant":"*"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[+",
    '{"intermediate_exp":{"expression":{"operant":"+"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[-",
    '{"intermediate_exp":{"expression":{"operant":"-"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[<",
    '{"intermediate_exp":{"expression":{"operant":"<"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[=",
    '{"intermediate_exp":{"expression":{"operant":"="},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "[>",
    '{"intermediate_exp":{"expression":{"operant":">"},"left_paren":{"lparen":"["},"right_paren":null}}',
  ],
  [
    "(\\",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":{"rparen":"\\\\"}}}',
  ],
  [
    "([",
    '{"intermediate_exp":{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(]",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":{"rparen":"]"}}}',
  ],
  [
    "((",
    '{"intermediate_exp":{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "()",
    '{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":{"rparen":")"}}}',
  ],
  [
    "(^",
    '{"intermediate_exp":{"expression":{"operant":"^"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(_",
    '{"intermediate_exp":{"expression":{"operant":"_"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(&",
    '{"intermediate_exp":{"expression":{"operant":"&"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(#",
    '{"intermediate_exp":{"expression":{"operant":"#"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(%",
    '{"intermediate_exp":{"expression":{"operant":"%"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "($",
    '{"intermediate_exp":{"expression":{"operant":"$"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(a",
    '{"intermediate_exp":{"expression":{"symbols":"a"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(x",
    '{"intermediate_exp":{"expression":{"symbols":"x"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(1",
    '{"intermediate_exp":{"expression":{"number":"1"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(.",
    '{"intermediate_exp":{"expression":{"operant":"."},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(,",
    '{"intermediate_exp":{"expression":{"operant":","},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(;",
    '{"intermediate_exp":{"expression":{"operant":";"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(:",
    '{"intermediate_exp":{"expression":{"operant":":"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    '("',
    '{"intermediate_exp":{"expression":{"symbol":"\\""},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(|",
    '{"intermediate_exp":{"expression":{"operant":"|"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(*",
    '{"intermediate_exp":{"expression":{"operant":"*"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(+",
    '{"intermediate_exp":{"expression":{"operant":"+"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(-",
    '{"intermediate_exp":{"expression":{"operant":"-"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(<",
    '{"intermediate_exp":{"expression":{"operant":"<"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(=",
    '{"intermediate_exp":{"expression":{"operant":"="},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "(>",
    '{"intermediate_exp":{"expression":{"operant":">"},"left_paren":{"lparen":"("},"right_paren":null}}',
  ],
  [
    "^[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"^"}}',
  ],
  [
    "^(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"^"}}',
  ],
  ["^^", '{"expression":{"operant":"^"},"sequence":{"operant":"^"}}'],
  ["^_", '{"expression":{"operant":"_"},"sequence":{"operant":"^"}}'],
  ["^&", '{"expression":{"operant":"&"},"sequence":{"operant":"^"}}'],
  ["^#", '{"expression":{"operant":"#"},"sequence":{"operant":"^"}}'],
  ["^%", '{"expression":{"operant":"%"},"sequence":{"operant":"^"}}'],
  ["^$", '{"expression":{"operant":"$"},"sequence":{"operant":"^"}}'],
  ["^a", '{"expression":{"symbols":"a"},"sequence":{"operant":"^"}}'],
  ["^x", '{"expression":{"symbols":"x"},"sequence":{"operant":"^"}}'],
  ["^1", '{"expression":{"number":"1"},"sequence":{"operant":"^"}}'],
  ["^.", '{"expression":{"operant":"."},"sequence":{"operant":"^"}}'],
  ["^,", '{"expression":{"operant":","},"sequence":{"operant":"^"}}'],
  ["^;", '{"expression":{"operant":";"},"sequence":{"operant":"^"}}'],
  ["^:", '{"expression":{"operant":":"},"sequence":{"operant":"^"}}'],
  ['^"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"^"}}'],
  ["^|", '{"expression":{"operant":"|"},"sequence":{"operant":"^"}}'],
  ["^*", '{"expression":{"operant":"*"},"sequence":{"operant":"^"}}'],
  ["^+", '{"expression":{"operant":"+"},"sequence":{"operant":"^"}}'],
  ["^-", '{"expression":{"operant":"-"},"sequence":{"operant":"^"}}'],
  ["^<", '{"expression":{"operant":"<"},"sequence":{"operant":"^"}}'],
  ["^=", '{"expression":{"operant":"="},"sequence":{"operant":"^"}}'],
  ["^>", '{"expression":{"operant":">"},"sequence":{"operant":"^"}}'],
  [
    "_[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"_"}}',
  ],
  [
    "_(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"_"}}',
  ],
  ["_^", '{"expression":{"operant":"^"},"sequence":{"operant":"_"}}'],
  ["__", '{"expression":{"operant":"_"},"sequence":{"operant":"_"}}'],
  ["_&", '{"expression":{"operant":"&"},"sequence":{"operant":"_"}}'],
  ["_#", '{"expression":{"operant":"#"},"sequence":{"operant":"_"}}'],
  ["_%", '{"expression":{"operant":"%"},"sequence":{"operant":"_"}}'],
  ["_$", '{"expression":{"operant":"$"},"sequence":{"operant":"_"}}'],
  ["_a", '{"expression":{"symbols":"a"},"sequence":{"operant":"_"}}'],
  ["_x", '{"expression":{"symbols":"x"},"sequence":{"operant":"_"}}'],
  ["_1", '{"expression":{"number":"1"},"sequence":{"operant":"_"}}'],
  ["_.", '{"expression":{"operant":"."},"sequence":{"operant":"_"}}'],
  ["_,", '{"expression":{"operant":","},"sequence":{"operant":"_"}}'],
  ["_;", '{"expression":{"operant":";"},"sequence":{"operant":"_"}}'],
  ["_:", '{"expression":{"operant":":"},"sequence":{"operant":"_"}}'],
  ['_"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"_"}}'],
  ["_|", '{"expression":{"operant":"|"},"sequence":{"operant":"_"}}'],
  ["_*", '{"expression":{"operant":"*"},"sequence":{"operant":"_"}}'],
  ["_+", '{"expression":{"operant":"+"},"sequence":{"operant":"_"}}'],
  ["_-", '{"expression":{"operant":"-"},"sequence":{"operant":"_"}}'],
  ["_<", '{"expression":{"operant":"<"},"sequence":{"operant":"_"}}'],
  ["_=", '{"expression":{"operant":"="},"sequence":{"operant":"_"}}'],
  ["_>", '{"expression":{"operant":">"},"sequence":{"operant":"_"}}'],
  [
    "&[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"&"}}',
  ],
  [
    "&(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"&"}}',
  ],
  ["&^", '{"expression":{"operant":"^"},"sequence":{"operant":"&"}}'],
  ["&_", '{"expression":{"operant":"_"},"sequence":{"operant":"&"}}'],
  ["&&", '{"expression":{"operant":"&"},"sequence":{"operant":"&"}}'],
  ["&#", '{"expression":{"operant":"#"},"sequence":{"operant":"&"}}'],
  ["&%", '{"expression":{"operant":"%"},"sequence":{"operant":"&"}}'],
  ["&$", '{"expression":{"operant":"$"},"sequence":{"operant":"&"}}'],
  ["&a", '{"expression":{"symbols":"a"},"sequence":{"operant":"&"}}'],
  ["&x", '{"expression":{"symbols":"x"},"sequence":{"operant":"&"}}'],
  ["&1", '{"expression":{"number":"1"},"sequence":{"operant":"&"}}'],
  ["&.", '{"expression":{"operant":"."},"sequence":{"operant":"&"}}'],
  ["&,", '{"expression":{"operant":","},"sequence":{"operant":"&"}}'],
  ["&;", '{"expression":{"operant":";"},"sequence":{"operant":"&"}}'],
  ["&:", '{"expression":{"operant":":"},"sequence":{"operant":"&"}}'],
  ['&"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"&"}}'],
  ["&|", '{"expression":{"operant":"|"},"sequence":{"operant":"&"}}'],
  ["&*", '{"expression":{"operant":"*"},"sequence":{"operant":"&"}}'],
  ["&+", '{"expression":{"operant":"+"},"sequence":{"operant":"&"}}'],
  ["&-", '{"expression":{"operant":"-"},"sequence":{"operant":"&"}}'],
  ["&<", '{"expression":{"operant":"<"},"sequence":{"operant":"&"}}'],
  ["&=", '{"expression":{"operant":"="},"sequence":{"operant":"&"}}'],
  ["&>", '{"expression":{"operant":">"},"sequence":{"operant":"&"}}'],
  [
    "#[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"#"}}',
  ],
  [
    "#(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"#"}}',
  ],
  ["#^", '{"expression":{"operant":"^"},"sequence":{"operant":"#"}}'],
  ["#_", '{"expression":{"operant":"_"},"sequence":{"operant":"#"}}'],
  ["#&", '{"expression":{"operant":"&"},"sequence":{"operant":"#"}}'],
  ["##", '{"expression":{"operant":"#"},"sequence":{"operant":"#"}}'],
  ["#%", '{"expression":{"operant":"%"},"sequence":{"operant":"#"}}'],
  ["#$", '{"expression":{"operant":"$"},"sequence":{"operant":"#"}}'],
  ["#a", '{"expression":{"symbols":"a"},"sequence":{"operant":"#"}}'],
  ["#x", '{"expression":{"symbols":"x"},"sequence":{"operant":"#"}}'],
  ["#1", '{"expression":{"number":"1"},"sequence":{"operant":"#"}}'],
  ["#.", '{"expression":{"operant":"."},"sequence":{"operant":"#"}}'],
  ["#,", '{"expression":{"operant":","},"sequence":{"operant":"#"}}'],
  ["#;", '{"expression":{"operant":";"},"sequence":{"operant":"#"}}'],
  ["#:", '{"expression":{"operant":":"},"sequence":{"operant":"#"}}'],
  ['#"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"#"}}'],
  ["#|", '{"expression":{"operant":"|"},"sequence":{"operant":"#"}}'],
  ["#*", '{"expression":{"operant":"*"},"sequence":{"operant":"#"}}'],
  ["#+", '{"expression":{"operant":"+"},"sequence":{"operant":"#"}}'],
  ["#-", '{"expression":{"operant":"-"},"sequence":{"operant":"#"}}'],
  ["#<", '{"expression":{"operant":"<"},"sequence":{"operant":"#"}}'],
  ["#=", '{"expression":{"operant":"="},"sequence":{"operant":"#"}}'],
  ["#>", '{"expression":{"operant":">"},"sequence":{"operant":"#"}}'],
  [
    "%[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"%"}}',
  ],
  [
    "%(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"%"}}',
  ],
  ["%^", '{"expression":{"operant":"^"},"sequence":{"operant":"%"}}'],
  ["%_", '{"expression":{"operant":"_"},"sequence":{"operant":"%"}}'],
  ["%&", '{"expression":{"operant":"&"},"sequence":{"operant":"%"}}'],
  ["%#", '{"expression":{"operant":"#"},"sequence":{"operant":"%"}}'],
  ["%%", '{"expression":{"operant":"%"},"sequence":{"operant":"%"}}'],
  ["%$", '{"expression":{"operant":"$"},"sequence":{"operant":"%"}}'],
  ["%a", '{"expression":{"symbols":"a"},"sequence":{"operant":"%"}}'],
  ["%x", '{"expression":{"symbols":"x"},"sequence":{"operant":"%"}}'],
  ["%1", '{"expression":{"number":"1"},"sequence":{"operant":"%"}}'],
  ["%.", '{"expression":{"operant":"."},"sequence":{"operant":"%"}}'],
  ["%,", '{"expression":{"operant":","},"sequence":{"operant":"%"}}'],
  ["%;", '{"expression":{"operant":";"},"sequence":{"operant":"%"}}'],
  ["%:", '{"expression":{"operant":":"},"sequence":{"operant":"%"}}'],
  ['%"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"%"}}'],
  ["%|", '{"expression":{"operant":"|"},"sequence":{"operant":"%"}}'],
  ["%*", '{"expression":{"operant":"*"},"sequence":{"operant":"%"}}'],
  ["%+", '{"expression":{"operant":"+"},"sequence":{"operant":"%"}}'],
  ["%-", '{"expression":{"operant":"-"},"sequence":{"operant":"%"}}'],
  ["%<", '{"expression":{"operant":"<"},"sequence":{"operant":"%"}}'],
  ["%=", '{"expression":{"operant":"="},"sequence":{"operant":"%"}}'],
  ["%>", '{"expression":{"operant":">"},"sequence":{"operant":"%"}}'],
  [
    "$[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"$"}}',
  ],
  [
    "$(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"$"}}',
  ],
  ["$^", '{"expression":{"operant":"^"},"sequence":{"operant":"$"}}'],
  ["$_", '{"expression":{"operant":"_"},"sequence":{"operant":"$"}}'],
  ["$&", '{"expression":{"operant":"&"},"sequence":{"operant":"$"}}'],
  ["$#", '{"expression":{"operant":"#"},"sequence":{"operant":"$"}}'],
  ["$%", '{"expression":{"operant":"%"},"sequence":{"operant":"$"}}'],
  ["$$", '{"expression":{"operant":"$"},"sequence":{"operant":"$"}}'],
  ["$a", '{"expression":{"symbols":"a"},"sequence":{"operant":"$"}}'],
  ["$x", '{"expression":{"symbols":"x"},"sequence":{"operant":"$"}}'],
  ["$1", '{"expression":{"number":"1"},"sequence":{"operant":"$"}}'],
  ["$.", '{"expression":{"operant":"."},"sequence":{"operant":"$"}}'],
  ["$,", '{"expression":{"operant":","},"sequence":{"operant":"$"}}'],
  ["$;", '{"expression":{"operant":";"},"sequence":{"operant":"$"}}'],
  ["$:", '{"expression":{"operant":":"},"sequence":{"operant":"$"}}'],
  ['$"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"$"}}'],
  ["$|", '{"expression":{"operant":"|"},"sequence":{"operant":"$"}}'],
  ["$*", '{"expression":{"operant":"*"},"sequence":{"operant":"$"}}'],
  ["$+", '{"expression":{"operant":"+"},"sequence":{"operant":"$"}}'],
  ["$-", '{"expression":{"operant":"-"},"sequence":{"operant":"$"}}'],
  ["$<", '{"expression":{"operant":"<"},"sequence":{"operant":"$"}}'],
  ["$=", '{"expression":{"operant":"="},"sequence":{"operant":"$"}}'],
  ["$>", '{"expression":{"operant":">"},"sequence":{"operant":"$"}}'],
  [
    "a[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"symbols":"a"}}',
  ],
  [
    "a(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"symbols":"a"}}',
  ],
  ["a^", '{"expression":{"operant":"^"},"sequence":{"symbols":"a"}}'],
  ["a_", '{"expression":{"operant":"_"},"sequence":{"symbols":"a"}}'],
  ["a&", '{"expression":{"operant":"&"},"sequence":{"symbols":"a"}}'],
  ["a#", '{"expression":{"operant":"#"},"sequence":{"symbols":"a"}}'],
  ["a%", '{"expression":{"operant":"%"},"sequence":{"symbols":"a"}}'],
  ["a$", '{"expression":{"operant":"$"},"sequence":{"symbols":"a"}}'],
  ["aa", '{"expression":{"symbols":"a"},"sequence":{"symbols":"a"}}'],
  ["ax", '{"expression":{"symbols":"x"},"sequence":{"symbols":"a"}}'],
  ["a1", '{"expression":{"number":"1"},"sequence":{"symbols":"a"}}'],
  ["a.", '{"expression":{"operant":"."},"sequence":{"symbols":"a"}}'],
  ["a,", '{"expression":{"operant":","},"sequence":{"symbols":"a"}}'],
  ["a;", '{"expression":{"operant":";"},"sequence":{"symbols":"a"}}'],
  ["a:", '{"expression":{"operant":":"},"sequence":{"symbols":"a"}}'],
  ['a"', '{"expression":{"symbol":"\\""},"sequence":{"symbols":"a"}}'],
  ["a|", '{"expression":{"operant":"|"},"sequence":{"symbols":"a"}}'],
  ["a*", '{"expression":{"operant":"*"},"sequence":{"symbols":"a"}}'],
  ["a+", '{"expression":{"operant":"+"},"sequence":{"symbols":"a"}}'],
  ["a-", '{"expression":{"operant":"-"},"sequence":{"symbols":"a"}}'],
  ["a<", '{"expression":{"operant":"<"},"sequence":{"symbols":"a"}}'],
  ["a=", '{"expression":{"operant":"="},"sequence":{"symbols":"a"}}'],
  ["a>", '{"expression":{"operant":">"},"sequence":{"symbols":"a"}}'],
  [
    "x[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"symbols":"x"}}',
  ],
  [
    "x(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"symbols":"x"}}',
  ],
  ["x^", '{"expression":{"operant":"^"},"sequence":{"symbols":"x"}}'],
  ["x_", '{"expression":{"operant":"_"},"sequence":{"symbols":"x"}}'],
  ["x&", '{"expression":{"operant":"&"},"sequence":{"symbols":"x"}}'],
  ["x#", '{"expression":{"operant":"#"},"sequence":{"symbols":"x"}}'],
  ["x%", '{"expression":{"operant":"%"},"sequence":{"symbols":"x"}}'],
  ["x$", '{"expression":{"operant":"$"},"sequence":{"symbols":"x"}}'],
  ["xa", '{"expression":{"symbols":"a"},"sequence":{"symbols":"x"}}'],
  ["xx", '{"expression":{"symbols":"x"},"sequence":{"symbols":"x"}}'],
  ["x1", '{"expression":{"number":"1"},"sequence":{"symbols":"x"}}'],
  ["x.", '{"expression":{"operant":"."},"sequence":{"symbols":"x"}}'],
  ["x,", '{"expression":{"operant":","},"sequence":{"symbols":"x"}}'],
  ["x;", '{"expression":{"operant":";"},"sequence":{"symbols":"x"}}'],
  ["x:", '{"expression":{"operant":":"},"sequence":{"symbols":"x"}}'],
  ['x"', '{"expression":{"symbol":"\\""},"sequence":{"symbols":"x"}}'],
  ["x|", '{"expression":{"operant":"|"},"sequence":{"symbols":"x"}}'],
  ["x*", '{"expression":{"operant":"*"},"sequence":{"symbols":"x"}}'],
  ["x+", '{"expression":{"operant":"+"},"sequence":{"symbols":"x"}}'],
  ["x-", '{"expression":{"operant":"-"},"sequence":{"symbols":"x"}}'],
  ["x<", '{"expression":{"operant":"<"},"sequence":{"symbols":"x"}}'],
  ["x=", '{"expression":{"operant":"="},"sequence":{"symbols":"x"}}'],
  ["x>", '{"expression":{"operant":">"},"sequence":{"symbols":"x"}}'],
  [
    "1[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"number":"1"}}',
  ],
  [
    "1(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"number":"1"}}',
  ],
  ["1^", '{"expression":{"operant":"^"},"sequence":{"number":"1"}}'],
  ["1_", '{"expression":{"operant":"_"},"sequence":{"number":"1"}}'],
  ["1&", '{"expression":{"operant":"&"},"sequence":{"number":"1"}}'],
  ["1#", '{"expression":{"operant":"#"},"sequence":{"number":"1"}}'],
  ["1%", '{"expression":{"operant":"%"},"sequence":{"number":"1"}}'],
  ["1$", '{"expression":{"operant":"$"},"sequence":{"number":"1"}}'],
  ["1a", '{"expression":{"symbols":"a"},"sequence":{"number":"1"}}'],
  ["1x", '{"expression":{"symbols":"x"},"sequence":{"number":"1"}}'],
  ["11", '{"number":"11"}'],
  ["1.", '{"expression":{"operant":"."},"sequence":{"number":"1"}}'],
  ["1,", '{"expression":{"operant":","},"sequence":{"number":"1"}}'],
  ["1;", '{"expression":{"operant":";"},"sequence":{"number":"1"}}'],
  ["1:", '{"expression":{"operant":":"},"sequence":{"number":"1"}}'],
  ['1"', '{"expression":{"symbol":"\\""},"sequence":{"number":"1"}}'],
  ["1|", '{"expression":{"operant":"|"},"sequence":{"number":"1"}}'],
  ["1*", '{"expression":{"operant":"*"},"sequence":{"number":"1"}}'],
  ["1+", '{"expression":{"operant":"+"},"sequence":{"number":"1"}}'],
  ["1-", '{"expression":{"operant":"-"},"sequence":{"number":"1"}}'],
  ["1<", '{"expression":{"operant":"<"},"sequence":{"number":"1"}}'],
  ["1=", '{"expression":{"operant":"="},"sequence":{"number":"1"}}'],
  ["1>", '{"expression":{"operant":">"},"sequence":{"number":"1"}}'],
  [
    ".[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"."}}',
  ],
  [
    ".(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"."}}',
  ],
  [".^", '{"expression":{"operant":"^"},"sequence":{"operant":"."}}'],
  ["._", '{"expression":{"operant":"_"},"sequence":{"operant":"."}}'],
  [".&", '{"expression":{"operant":"&"},"sequence":{"operant":"."}}'],
  [".#", '{"expression":{"operant":"#"},"sequence":{"operant":"."}}'],
  [".%", '{"expression":{"operant":"%"},"sequence":{"operant":"."}}'],
  [".$", '{"expression":{"operant":"$"},"sequence":{"operant":"."}}'],
  [".a", '{"expression":{"symbols":"a"},"sequence":{"operant":"."}}'],
  [".x", '{"expression":{"symbols":"x"},"sequence":{"operant":"."}}'],
  [".1", '{"expression":{"number":"1"},"sequence":{"operant":"."}}'],
  ["..", '{"expression":{"operant":"."},"sequence":{"operant":"."}}'],
  [".,", '{"expression":{"operant":","},"sequence":{"operant":"."}}'],
  [".;", '{"expression":{"operant":";"},"sequence":{"operant":"."}}'],
  [".:", '{"expression":{"operant":":"},"sequence":{"operant":"."}}'],
  ['."', '{"expression":{"symbol":"\\""},"sequence":{"operant":"."}}'],
  [".|", '{"expression":{"operant":"|"},"sequence":{"operant":"."}}'],
  [".*", '{"expression":{"operant":"*"},"sequence":{"operant":"."}}'],
  [".+", '{"expression":{"operant":"+"},"sequence":{"operant":"."}}'],
  [".-", '{"expression":{"operant":"-"},"sequence":{"operant":"."}}'],
  [".<", '{"expression":{"operant":"<"},"sequence":{"operant":"."}}'],
  [".=", '{"expression":{"operant":"="},"sequence":{"operant":"."}}'],
  [".>", '{"expression":{"operant":">"},"sequence":{"operant":"."}}'],
  [
    ",[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":","}}',
  ],
  [
    ",(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":","}}',
  ],
  [",^", '{"expression":{"operant":"^"},"sequence":{"operant":","}}'],
  [",_", '{"expression":{"operant":"_"},"sequence":{"operant":","}}'],
  [",&", '{"expression":{"operant":"&"},"sequence":{"operant":","}}'],
  [",#", '{"expression":{"operant":"#"},"sequence":{"operant":","}}'],
  [",%", '{"expression":{"operant":"%"},"sequence":{"operant":","}}'],
  [",$", '{"expression":{"operant":"$"},"sequence":{"operant":","}}'],
  [",a", '{"expression":{"symbols":"a"},"sequence":{"operant":","}}'],
  [",x", '{"expression":{"symbols":"x"},"sequence":{"operant":","}}'],
  [",1", '{"expression":{"number":"1"},"sequence":{"operant":","}}'],
  [",.", '{"expression":{"operant":"."},"sequence":{"operant":","}}'],
  [",,", '{"expression":{"operant":","},"sequence":{"operant":","}}'],
  [",;", '{"expression":{"operant":";"},"sequence":{"operant":","}}'],
  [",:", '{"expression":{"operant":":"},"sequence":{"operant":","}}'],
  [',"', '{"expression":{"symbol":"\\""},"sequence":{"operant":","}}'],
  [",|", '{"expression":{"operant":"|"},"sequence":{"operant":","}}'],
  [",*", '{"expression":{"operant":"*"},"sequence":{"operant":","}}'],
  [",+", '{"expression":{"operant":"+"},"sequence":{"operant":","}}'],
  [",-", '{"expression":{"operant":"-"},"sequence":{"operant":","}}'],
  [",<", '{"expression":{"operant":"<"},"sequence":{"operant":","}}'],
  [",=", '{"expression":{"operant":"="},"sequence":{"operant":","}}'],
  [",>", '{"expression":{"operant":">"},"sequence":{"operant":","}}'],
  [
    ";[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":";"}}',
  ],
  [
    ";(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":";"}}',
  ],
  [";^", '{"expression":{"operant":"^"},"sequence":{"operant":";"}}'],
  [";_", '{"expression":{"operant":"_"},"sequence":{"operant":";"}}'],
  [";&", '{"expression":{"operant":"&"},"sequence":{"operant":";"}}'],
  [";#", '{"expression":{"operant":"#"},"sequence":{"operant":";"}}'],
  [";%", '{"expression":{"operant":"%"},"sequence":{"operant":";"}}'],
  [";$", '{"expression":{"operant":"$"},"sequence":{"operant":";"}}'],
  [";a", '{"expression":{"symbols":"a"},"sequence":{"operant":";"}}'],
  [";x", '{"expression":{"symbols":"x"},"sequence":{"operant":";"}}'],
  [";1", '{"expression":{"number":"1"},"sequence":{"operant":";"}}'],
  [";.", '{"expression":{"operant":"."},"sequence":{"operant":";"}}'],
  [";,", '{"expression":{"operant":","},"sequence":{"operant":";"}}'],
  [";;", '{"expression":{"operant":";"},"sequence":{"operant":";"}}'],
  [";:", '{"expression":{"operant":":"},"sequence":{"operant":";"}}'],
  [';"', '{"expression":{"symbol":"\\""},"sequence":{"operant":";"}}'],
  [";|", '{"expression":{"operant":"|"},"sequence":{"operant":";"}}'],
  [";*", '{"expression":{"operant":"*"},"sequence":{"operant":";"}}'],
  [";+", '{"expression":{"operant":"+"},"sequence":{"operant":";"}}'],
  [";-", '{"expression":{"operant":"-"},"sequence":{"operant":";"}}'],
  [";<", '{"expression":{"operant":"<"},"sequence":{"operant":";"}}'],
  [";=", '{"expression":{"operant":"="},"sequence":{"operant":";"}}'],
  [";>", '{"expression":{"operant":">"},"sequence":{"operant":";"}}'],
  [
    ":[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":":"}}',
  ],
  [
    ":(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":":"}}',
  ],
  [":^", '{"expression":{"operant":"^"},"sequence":{"operant":":"}}'],
  [":_", '{"expression":{"operant":"_"},"sequence":{"operant":":"}}'],
  [":&", '{"expression":{"operant":"&"},"sequence":{"operant":":"}}'],
  [":#", '{"expression":{"operant":"#"},"sequence":{"operant":":"}}'],
  [":%", '{"expression":{"operant":"%"},"sequence":{"operant":":"}}'],
  [":$", '{"expression":{"operant":"$"},"sequence":{"operant":":"}}'],
  [":a", '{"expression":{"symbols":"a"},"sequence":{"operant":":"}}'],
  [":x", '{"expression":{"symbols":"x"},"sequence":{"operant":":"}}'],
  [":1", '{"expression":{"number":"1"},"sequence":{"operant":":"}}'],
  [":.", '{"expression":{"operant":"."},"sequence":{"operant":":"}}'],
  [":,", '{"expression":{"operant":","},"sequence":{"operant":":"}}'],
  [":;", '{"expression":{"operant":";"},"sequence":{"operant":":"}}'],
  ["::", '{"expression":{"operant":":"},"sequence":{"operant":":"}}'],
  [':"', '{"expression":{"symbol":"\\""},"sequence":{"operant":":"}}'],
  [":|", '{"expression":{"operant":"|"},"sequence":{"operant":":"}}'],
  [":*", '{"expression":{"operant":"*"},"sequence":{"operant":":"}}'],
  [":+", '{"expression":{"operant":"+"},"sequence":{"operant":":"}}'],
  [":-", '{"expression":{"operant":"-"},"sequence":{"operant":":"}}'],
  [":<", '{"expression":{"operant":"<"},"sequence":{"operant":":"}}'],
  [":=", '{"expression":{"operant":"="},"sequence":{"operant":":"}}'],
  [":>", '{"expression":{"operant":">"},"sequence":{"operant":":"}}'],
  [
    '"[',
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"symbol":"\\""}}',
  ],
  [
    '"(',
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"symbol":"\\""}}',
  ],
  ['"^', '{"expression":{"operant":"^"},"sequence":{"symbol":"\\""}}'],
  ['"_', '{"expression":{"operant":"_"},"sequence":{"symbol":"\\""}}'],
  ['"&', '{"expression":{"operant":"&"},"sequence":{"symbol":"\\""}}'],
  ['"#', '{"expression":{"operant":"#"},"sequence":{"symbol":"\\""}}'],
  ['"%', '{"expression":{"operant":"%"},"sequence":{"symbol":"\\""}}'],
  ['"$', '{"expression":{"operant":"$"},"sequence":{"symbol":"\\""}}'],
  ['"a', '{"expression":{"symbols":"a"},"sequence":{"symbol":"\\""}}'],
  ['"x', '{"expression":{"symbols":"x"},"sequence":{"symbol":"\\""}}'],
  ['"1', '{"expression":{"number":"1"},"sequence":{"symbol":"\\""}}'],
  ['".', '{"expression":{"operant":"."},"sequence":{"symbol":"\\""}}'],
  ['",', '{"expression":{"operant":","},"sequence":{"symbol":"\\""}}'],
  ['";', '{"expression":{"operant":";"},"sequence":{"symbol":"\\""}}'],
  ['":', '{"expression":{"operant":":"},"sequence":{"symbol":"\\""}}'],
  ['""', '{"expression":{"symbol":"\\""},"sequence":{"symbol":"\\""}}'],
  ['"|', '{"expression":{"operant":"|"},"sequence":{"symbol":"\\""}}'],
  ['"*', '{"expression":{"operant":"*"},"sequence":{"symbol":"\\""}}'],
  ['"+', '{"expression":{"operant":"+"},"sequence":{"symbol":"\\""}}'],
  ['"-', '{"expression":{"operant":"-"},"sequence":{"symbol":"\\""}}'],
  ['"<', '{"expression":{"operant":"<"},"sequence":{"symbol":"\\""}}'],
  ['"=', '{"expression":{"operant":"="},"sequence":{"symbol":"\\""}}'],
  ['">', '{"expression":{"operant":">"},"sequence":{"symbol":"\\""}}'],
  [
    "|[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"|"}}',
  ],
  [
    "|(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"|"}}',
  ],
  ["|^", '{"expression":{"operant":"^"},"sequence":{"operant":"|"}}'],
  ["|_", '{"expression":{"operant":"_"},"sequence":{"operant":"|"}}'],
  ["|&", '{"expression":{"operant":"&"},"sequence":{"operant":"|"}}'],
  ["|#", '{"expression":{"operant":"#"},"sequence":{"operant":"|"}}'],
  ["|%", '{"expression":{"operant":"%"},"sequence":{"operant":"|"}}'],
  ["|$", '{"expression":{"operant":"$"},"sequence":{"operant":"|"}}'],
  ["|a", '{"expression":{"symbols":"a"},"sequence":{"operant":"|"}}'],
  ["|x", '{"expression":{"symbols":"x"},"sequence":{"operant":"|"}}'],
  ["|1", '{"expression":{"number":"1"},"sequence":{"operant":"|"}}'],
  ["|.", '{"expression":{"operant":"."},"sequence":{"operant":"|"}}'],
  ["|,", '{"expression":{"operant":","},"sequence":{"operant":"|"}}'],
  ["|;", '{"expression":{"operant":";"},"sequence":{"operant":"|"}}'],
  ["|:", '{"expression":{"operant":":"},"sequence":{"operant":"|"}}'],
  ['|"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"|"}}'],
  ["||", '{"expression":{"operant":"|"},"sequence":{"operant":"|"}}'],
  ["|*", '{"expression":{"operant":"*"},"sequence":{"operant":"|"}}'],
  ["|+", '{"expression":{"operant":"+"},"sequence":{"operant":"|"}}'],
  ["|-", '{"expression":{"operant":"-"},"sequence":{"operant":"|"}}'],
  ["|<", '{"expression":{"operant":"<"},"sequence":{"operant":"|"}}'],
  ["|=", '{"expression":{"operant":"="},"sequence":{"operant":"|"}}'],
  ["|>", '{"expression":{"operant":">"},"sequence":{"operant":"|"}}'],
  [
    "*[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"*"}}',
  ],
  [
    "*(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"*"}}',
  ],
  ["*^", '{"expression":{"operant":"^"},"sequence":{"operant":"*"}}'],
  ["*_", '{"expression":{"operant":"_"},"sequence":{"operant":"*"}}'],
  ["*&", '{"expression":{"operant":"&"},"sequence":{"operant":"*"}}'],
  ["*#", '{"expression":{"operant":"#"},"sequence":{"operant":"*"}}'],
  ["*%", '{"expression":{"operant":"%"},"sequence":{"operant":"*"}}'],
  ["*$", '{"expression":{"operant":"$"},"sequence":{"operant":"*"}}'],
  ["*a", '{"expression":{"symbols":"a"},"sequence":{"operant":"*"}}'],
  ["*x", '{"expression":{"symbols":"x"},"sequence":{"operant":"*"}}'],
  ["*1", '{"expression":{"number":"1"},"sequence":{"operant":"*"}}'],
  ["*.", '{"expression":{"operant":"."},"sequence":{"operant":"*"}}'],
  ["*,", '{"expression":{"operant":","},"sequence":{"operant":"*"}}'],
  ["*;", '{"expression":{"operant":";"},"sequence":{"operant":"*"}}'],
  ["*:", '{"expression":{"operant":":"},"sequence":{"operant":"*"}}'],
  ['*"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"*"}}'],
  ["*|", '{"expression":{"operant":"|"},"sequence":{"operant":"*"}}'],
  ["**", '{"expression":{"operant":"*"},"sequence":{"operant":"*"}}'],
  ["*+", '{"expression":{"operant":"+"},"sequence":{"operant":"*"}}'],
  ["*-", '{"expression":{"operant":"-"},"sequence":{"operant":"*"}}'],
  ["*<", '{"expression":{"operant":"<"},"sequence":{"operant":"*"}}'],
  ["*=", '{"expression":{"operant":"="},"sequence":{"operant":"*"}}'],
  ["*>", '{"expression":{"operant":">"},"sequence":{"operant":"*"}}'],
  [
    "+[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"+"}}',
  ],
  [
    "+(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"+"}}',
  ],
  ["+^", '{"expression":{"operant":"^"},"sequence":{"operant":"+"}}'],
  ["+_", '{"expression":{"operant":"_"},"sequence":{"operant":"+"}}'],
  ["+&", '{"expression":{"operant":"&"},"sequence":{"operant":"+"}}'],
  ["+#", '{"expression":{"operant":"#"},"sequence":{"operant":"+"}}'],
  ["+%", '{"expression":{"operant":"%"},"sequence":{"operant":"+"}}'],
  ["+$", '{"expression":{"operant":"$"},"sequence":{"operant":"+"}}'],
  ["+a", '{"expression":{"symbols":"a"},"sequence":{"operant":"+"}}'],
  ["+x", '{"expression":{"symbols":"x"},"sequence":{"operant":"+"}}'],
  ["+1", '{"expression":{"number":"1"},"sequence":{"operant":"+"}}'],
  ["+.", '{"expression":{"operant":"."},"sequence":{"operant":"+"}}'],
  ["+,", '{"expression":{"operant":","},"sequence":{"operant":"+"}}'],
  ["+;", '{"expression":{"operant":";"},"sequence":{"operant":"+"}}'],
  ["+:", '{"expression":{"operant":":"},"sequence":{"operant":"+"}}'],
  ['+"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"+"}}'],
  ["+|", '{"expression":{"operant":"|"},"sequence":{"operant":"+"}}'],
  ["+*", '{"expression":{"operant":"*"},"sequence":{"operant":"+"}}'],
  ["++", '{"expression":{"operant":"+"},"sequence":{"operant":"+"}}'],
  ["+-", '{"expression":{"operant":"-"},"sequence":{"operant":"+"}}'],
  ["+<", '{"expression":{"operant":"<"},"sequence":{"operant":"+"}}'],
  ["+=", '{"expression":{"operant":"="},"sequence":{"operant":"+"}}'],
  ["+>", '{"expression":{"operant":">"},"sequence":{"operant":"+"}}'],
  [
    "-[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"-"}}',
  ],
  [
    "-(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"-"}}',
  ],
  ["-^", '{"expression":{"operant":"^"},"sequence":{"operant":"-"}}'],
  ["-_", '{"expression":{"operant":"_"},"sequence":{"operant":"-"}}'],
  ["-&", '{"expression":{"operant":"&"},"sequence":{"operant":"-"}}'],
  ["-#", '{"expression":{"operant":"#"},"sequence":{"operant":"-"}}'],
  ["-%", '{"expression":{"operant":"%"},"sequence":{"operant":"-"}}'],
  ["-$", '{"expression":{"operant":"$"},"sequence":{"operant":"-"}}'],
  ["-a", '{"expression":{"symbols":"a"},"sequence":{"operant":"-"}}'],
  ["-x", '{"expression":{"symbols":"x"},"sequence":{"operant":"-"}}'],
  ["-1", '{"expression":{"number":"1"},"sequence":{"operant":"-"}}'],
  ["-.", '{"expression":{"operant":"."},"sequence":{"operant":"-"}}'],
  ["-,", '{"expression":{"operant":","},"sequence":{"operant":"-"}}'],
  ["-;", '{"expression":{"operant":";"},"sequence":{"operant":"-"}}'],
  ["-:", '{"expression":{"operant":":"},"sequence":{"operant":"-"}}'],
  ['-"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"-"}}'],
  ["-|", '{"expression":{"operant":"|"},"sequence":{"operant":"-"}}'],
  ["-*", '{"expression":{"operant":"*"},"sequence":{"operant":"-"}}'],
  ["-+", '{"expression":{"operant":"+"},"sequence":{"operant":"-"}}'],
  ["--", '{"expression":{"operant":"-"},"sequence":{"operant":"-"}}'],
  ["-<", '{"expression":{"operant":"<"},"sequence":{"operant":"-"}}'],
  ["-=", '{"expression":{"operant":"="},"sequence":{"operant":"-"}}'],
  ["->", '{"expression":{"operant":">"},"sequence":{"operant":"-"}}'],
  [
    "<[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"<"}}',
  ],
  [
    "<(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"<"}}',
  ],
  ["<^", '{"expression":{"operant":"^"},"sequence":{"operant":"<"}}'],
  ["<_", '{"expression":{"operant":"_"},"sequence":{"operant":"<"}}'],
  ["<&", '{"expression":{"operant":"&"},"sequence":{"operant":"<"}}'],
  ["<#", '{"expression":{"operant":"#"},"sequence":{"operant":"<"}}'],
  ["<%", '{"expression":{"operant":"%"},"sequence":{"operant":"<"}}'],
  ["<$", '{"expression":{"operant":"$"},"sequence":{"operant":"<"}}'],
  ["<a", '{"expression":{"symbols":"a"},"sequence":{"operant":"<"}}'],
  ["<x", '{"expression":{"symbols":"x"},"sequence":{"operant":"<"}}'],
  ["<1", '{"expression":{"number":"1"},"sequence":{"operant":"<"}}'],
  ["<.", '{"expression":{"operant":"."},"sequence":{"operant":"<"}}'],
  ["<,", '{"expression":{"operant":","},"sequence":{"operant":"<"}}'],
  ["<;", '{"expression":{"operant":";"},"sequence":{"operant":"<"}}'],
  ["<:", '{"expression":{"operant":":"},"sequence":{"operant":"<"}}'],
  ['<"', '{"expression":{"symbol":"\\""},"sequence":{"operant":"<"}}'],
  ["<|", '{"expression":{"operant":"|"},"sequence":{"operant":"<"}}'],
  ["<*", '{"expression":{"operant":"*"},"sequence":{"operant":"<"}}'],
  ["<+", '{"expression":{"operant":"+"},"sequence":{"operant":"<"}}'],
  ["<-", '{"expression":{"operant":"-"},"sequence":{"operant":"<"}}'],
  ["<<", '{"expression":{"operant":"<"},"sequence":{"operant":"<"}}'],
  ["<=", '{"expression":{"operant":"="},"sequence":{"operant":"<"}}'],
  ["<>", '{"expression":{"operant":">"},"sequence":{"operant":"<"}}'],
  [
    "=[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":"="}}',
  ],
  [
    "=(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":"="}}',
  ],
  ["=^", '{"expression":{"operant":"^"},"sequence":{"operant":"="}}'],
  ["=_", '{"expression":{"operant":"_"},"sequence":{"operant":"="}}'],
  ["=&", '{"expression":{"operant":"&"},"sequence":{"operant":"="}}'],
  ["=#", '{"expression":{"operant":"#"},"sequence":{"operant":"="}}'],
  ["=%", '{"expression":{"operant":"%"},"sequence":{"operant":"="}}'],
  ["=$", '{"expression":{"operant":"$"},"sequence":{"operant":"="}}'],
  ["=a", '{"expression":{"symbols":"a"},"sequence":{"operant":"="}}'],
  ["=x", '{"expression":{"symbols":"x"},"sequence":{"operant":"="}}'],
  ["=1", '{"expression":{"number":"1"},"sequence":{"operant":"="}}'],
  ["=.", '{"expression":{"operant":"."},"sequence":{"operant":"="}}'],
  ["=,", '{"expression":{"operant":","},"sequence":{"operant":"="}}'],
  ["=;", '{"expression":{"operant":";"},"sequence":{"operant":"="}}'],
  ["=:", '{"expression":{"operant":":"},"sequence":{"operant":"="}}'],
  ['="', '{"expression":{"symbol":"\\""},"sequence":{"operant":"="}}'],
  ["=|", '{"expression":{"operant":"|"},"sequence":{"operant":"="}}'],
  ["=*", '{"expression":{"operant":"*"},"sequence":{"operant":"="}}'],
  ["=+", '{"expression":{"operant":"+"},"sequence":{"operant":"="}}'],
  ["=-", '{"expression":{"operant":"-"},"sequence":{"operant":"="}}'],
  ["=<", '{"expression":{"operant":"<"},"sequence":{"operant":"="}}'],
  ["==", '{"expression":{"operant":"="},"sequence":{"operant":"="}}'],
  ["=>", '{"expression":{"operant":">"},"sequence":{"operant":"="}}'],
  [
    ">[",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"["},"right_paren":null}},"sequence":{"operant":">"}}',
  ],
  [
    ">(",
    '{"expression":{"intermediate_exp":{"expression":null,"left_paren":{"lparen":"("},"right_paren":null}},"sequence":{"operant":">"}}',
  ],
  [">^", '{"expression":{"operant":"^"},"sequence":{"operant":">"}}'],
  [">_", '{"expression":{"operant":"_"},"sequence":{"operant":">"}}'],
  [">&", '{"expression":{"operant":"&"},"sequence":{"operant":">"}}'],
  [">#", '{"expression":{"operant":"#"},"sequence":{"operant":">"}}'],
  [">%", '{"expression":{"operant":"%"},"sequence":{"operant":">"}}'],
  [">$", '{"expression":{"operant":"$"},"sequence":{"operant":">"}}'],
  [">a", '{"expression":{"symbols":"a"},"sequence":{"operant":">"}}'],
  [">x", '{"expression":{"symbols":"x"},"sequence":{"operant":">"}}'],
  [">1", '{"expression":{"number":"1"},"sequence":{"operant":">"}}'],
  [">.", '{"expression":{"operant":"."},"sequence":{"operant":">"}}'],
  [">,", '{"expression":{"operant":","},"sequence":{"operant":">"}}'],
  [">;", '{"expression":{"operant":";"},"sequence":{"operant":">"}}'],
  [">:", '{"expression":{"operant":":"},"sequence":{"operant":">"}}'],
  ['>"', '{"expression":{"symbol":"\\""},"sequence":{"operant":">"}}'],
  [">|", '{"expression":{"operant":"|"},"sequence":{"operant":">"}}'],
  [">*", '{"expression":{"operant":"*"},"sequence":{"operant":">"}}'],
  [">+", '{"expression":{"operant":"+"},"sequence":{"operant":">"}}'],
  [">-", '{"expression":{"operant":"-"},"sequence":{"operant":">"}}'],
  ["><", '{"expression":{"operant":"<"},"sequence":{"operant":">"}}'],
  [">=", '{"expression":{"operant":"="},"sequence":{"operant":">"}}'],
  [">>", '{"expression":{"operant":">"},"sequence":{"operant":">"}}'],
];

/** Every swept string the gem refuses, in sweep order. */
const SWEEP_REFUSED: readonly string[] = [
  "\\",
  "{",
  "}",
  "]",
  ")",
  "\\}",
  "\\]",
  "\\)",
  "\\a",
  "\\x",
  "\\1",
  '\\"',
  "{\\",
  "{{",
  "{[",
  "{]",
  "{(",
  "{)",
  "{^",
  "{_",
  "{&",
  "{#",
  "{%",
  "{$",
  "{a",
  "{x",
  "{1",
  "{.",
  "{,",
  "{;",
  "{:",
  '{"',
  "{|",
  "{*",
  "{+",
  "{-",
  "{<",
  "{=",
  "{>",
  "}\\",
  "}{",
  "}}",
  "}[",
  "}]",
  "}(",
  "})",
  "}^",
  "}_",
  "}&",
  "}#",
  "}%",
  "}$",
  "}a",
  "}x",
  "}1",
  "}.",
  "},",
  "};",
  "}:",
  '}"',
  "}|",
  "}*",
  "}+",
  "}-",
  "}<",
  "}=",
  "}>",
  "[{",
  "[}",
  "]\\",
  "]{",
  "]}",
  "][",
  "]]",
  "](",
  "])",
  "]^",
  "]_",
  "]&",
  "]#",
  "]%",
  "]$",
  "]a",
  "]x",
  "]1",
  "].",
  "],",
  "];",
  "]:",
  ']"',
  "]|",
  "]*",
  "]+",
  "]-",
  "]<",
  "]=",
  "]>",
  "({",
  "(}",
  ")\\",
  "){",
  ")}",
  ")[",
  ")]",
  ")(",
  "))",
  ")^",
  ")_",
  ")&",
  ")#",
  ")%",
  ")$",
  ")a",
  ")x",
  ")1",
  ").",
  "),",
  ");",
  "):",
  ')"',
  ")|",
  ")*",
  ")+",
  ")-",
  ")<",
  ")=",
  ")>",
  "^\\",
  "^{",
  "^}",
  "^]",
  "^)",
  "_\\",
  "_{",
  "_}",
  "_]",
  "_)",
  "&\\",
  "&{",
  "&}",
  "&]",
  "&)",
  "#\\",
  "#{",
  "#}",
  "#]",
  "#)",
  "%\\",
  "%{",
  "%}",
  "%]",
  "%)",
  "$\\",
  "${",
  "$}",
  "$]",
  "$)",
  "a\\",
  "a{",
  "a}",
  "a]",
  "a)",
  "x\\",
  "x{",
  "x}",
  "x]",
  "x)",
  "1\\",
  "1{",
  "1}",
  "1]",
  "1)",
  ".\\",
  ".{",
  ".}",
  ".]",
  ".)",
  ",\\",
  ",{",
  ",}",
  ",]",
  ",)",
  ";\\",
  ";{",
  ";}",
  ";]",
  ";)",
  ":\\",
  ":{",
  ":}",
  ":]",
  ":)",
  '"\\',
  '"{',
  '"}',
  '"]',
  '")',
  "|\\",
  "|{",
  "|}",
  "|]",
  "|)",
  "*\\",
  "*{",
  "*}",
  "*]",
  "*)",
  "+\\",
  "+{",
  "+}",
  "+]",
  "+)",
  "-\\",
  "-{",
  "-}",
  "-]",
  "-)",
  "<\\",
  "<{",
  "<}",
  "<]",
  "<)",
  "=\\",
  "={",
  "=}",
  "=]",
  "=)",
  ">\\",
  ">{",
  ">}",
  ">]",
  ">)",
];

function sweepInputs(): string[] {
  const inputs = [...SWEEP_ALPHABET];
  for (const first of SWEEP_ALPHABET) {
    for (const second of SWEEP_ALPHABET) inputs.push(first + second);
  }
  return inputs;
}

// --- group 4: the decimal marker -------------------------------------------

/**
 * `decimal_marker` (`latex/parse.rb:205`) under the three markers the gem's 96
 * locales resolve to, measured with `Plurimath.with_configuration`. The marker
 * the grammar matches is the *encoded* one, so under `ar` the single-Number
 * reading is of `1&#x66b;5` and not of the raw code point — which is exactly
 * what `Latex::Parser` would have handed it.
 */
const MARKER_FIXTURES: ReadonlyArray<readonly [locale: string | null, cases: readonly Fixture[]]> =
  [
    [
      null,
      [
        ["1.5", '{"number":"1.5"}'],
        [
          "1,5",
          '{"expression":{"expression":{"number":"5"},"sequence":{"operant":","}},"sequence":{"number":"1"}}',
        ],
        [
          "1&#x66b;5",
          '{"expression":{"expression":{"number":"5"},"sequence":{"unicode_symbols":"&#x66b;"}},"sequence":{"number":"1"}}',
        ],
        ["12.34", '{"number":"12.34"}'],
        [".5", '{"expression":{"number":"5"},"sequence":{"operant":"."}}'],
        ["5.", '{"expression":{"operant":"."},"sequence":{"number":"5"}}'],
        ["1", '{"number":"1"}'],
        [".", '{"operant":"."}'],
      ],
    ],
    [
      "de",
      [
        [
          "1.5",
          '{"expression":{"expression":{"number":"5"},"sequence":{"operant":"."}},"sequence":{"number":"1"}}',
        ],
        ["1,5", '{"number":"1,5"}'],
        [
          "1&#x66b;5",
          '{"expression":{"expression":{"number":"5"},"sequence":{"unicode_symbols":"&#x66b;"}},"sequence":{"number":"1"}}',
        ],
        [
          "12.34",
          '{"expression":{"expression":{"number":"34"},"sequence":{"operant":"."}},"sequence":{"number":"12"}}',
        ],
        [".5", '{"expression":{"number":"5"},"sequence":{"operant":"."}}'],
        ["5.", '{"expression":{"operant":"."},"sequence":{"number":"5"}}'],
        ["1", '{"number":"1"}'],
        [".", '{"operant":"."}'],
      ],
    ],
    [
      "ar",
      [
        [
          "1.5",
          '{"expression":{"expression":{"number":"5"},"sequence":{"operant":"."}},"sequence":{"number":"1"}}',
        ],
        [
          "1,5",
          '{"expression":{"expression":{"number":"5"},"sequence":{"operant":","}},"sequence":{"number":"1"}}',
        ],
        ["1&#x66b;5", '{"number":"1&#x66b;5"}'],
        [
          "12.34",
          '{"expression":{"expression":{"number":"34"},"sequence":{"operant":"."}},"sequence":{"number":"12"}}',
        ],
        [".5", '{"expression":{"number":"5"},"sequence":{"operant":"."}}'],
        ["5.", '{"expression":{"operant":"."},"sequence":{"number":"5"}}'],
        ["1", '{"number":"1"}'],
        [".", '{"operant":"."}'],
      ],
    ],
  ];

// --- the suites ------------------------------------------------------------

describe("the gem's own LaTeX, round-tripped through the grammar", () => {
  it("has the cases it checks against", () => {
    // A reader that silently returned nothing would make every case below
    // vacuous while the suite stayed green.
    expect(CORPUS_FIXTURES.length + CORPUS_REFUSED.length).toBe(87);
    expect(CORPUS_REFUSED.length).toBe(3);
  });

  it.each(CORPUS_FIXTURES)("%s", (preprocessed, gemTree) => {
    expect(tree(preprocessed)).toStrictEqual(JSON.parse(gemTree));
  });

  it.each(CORPUS_REFUSED.map((text) => [text] as const))("refuses %s, as the gem does", (text) => {
    expect(refuses(text)).toBe(true);
  });
});

describe("every rule, kind and helper in latex/parse.rb", () => {
  it("has the cases it checks against", () => {
    expect(RULE_FIXTURES.length).toBe(153);
  });

  it.each(RULE_FIXTURES)("%s", (preprocessed, gemTree) => {
    expect(tree(preprocessed)).toStrictEqual(JSON.parse(gemTree));
  });
});

describe("the length-1 and length-2 sweep", () => {
  const inputs = sweepInputs();

  it("sweeps what it says it sweeps", () => {
    expect(SWEEP_ALPHABET.length).toBe(28);
    expect(inputs.length).toBe(28 + 28 * 28);
    expect(new Set(inputs).size).toBe(inputs.length);
    // An all-accepted or all-refused sweep would prove much less, so both ends
    // are pinned to what the gem answered, and the two halves must account for
    // every swept input exactly once.
    expect(SWEEP_FIXTURES.length).toBe(580);
    expect(SWEEP_REFUSED.length).toBe(232);
    expect([...SWEEP_FIXTURES.map(([text]) => text), ...SWEEP_REFUSED].sort()).toStrictEqual(
      [...inputs].sort(),
    );
  });

  it("answers the gem's tree, or the gem's refusal, for all 812", () => {
    // One assertion rather than 812 cases: the divergence list is the useful
    // output, and an empty one is the claim. Key order is not compared —
    // `toStrictEqual` on plain objects ignores it, and the Ruby serializer
    // sorts where this does not.
    const expected = new Map<string, string | null>(SWEEP_FIXTURES);
    for (const text of SWEEP_REFUSED) expected.set(text, null);
    const divergences: string[] = [];
    for (const input of inputs) {
      const gemTree = expected.get(input) ?? null;
      let actual: PlainTree | null;
      try {
        actual = plain(grammar.root.parse(input));
      } catch (error) {
        if (!(error instanceof ParseFailed)) throw error;
        actual = null;
      }
      const wanted = gemTree === null ? null : (JSON.parse(gemTree) as PlainTree);
      try {
        expect(actual).toStrictEqual(wanted);
      } catch {
        divergences.push(
          `${JSON.stringify(input)}: gem ${gemTree ?? "REFUSED"}, port ${
            actual === null ? "REFUSED" : JSON.stringify(actual)
          }`,
        );
      }
    }
    expect(divergences).toStrictEqual([]);
  });
});

describe("the decimal marker", () => {
  it.each(MARKER_FIXTURES)("locale %s", (locale, cases) => {
    const local = latexGrammar(locale === null ? null : { locale });
    for (const [preprocessed, gemTree] of cases) {
      expect(plain(local.root.parse(preprocessed)), preprocessed).toStrictEqual(
        JSON.parse(gemTree),
      );
    }
  });

  it("matches the encoded marker, not the marker", () => {
    expect(latexGrammar().encodedDecimalMarker).toBe(".");
    expect(latexGrammar({ locale: "de" }).encodedDecimalMarker).toBe(",");
    expect(latexGrammar({ locale: "ar" }).encodedDecimalMarker).toBe("&#x66b;");
    expect(latexGrammar({ locale: "ar" }).decimalMarker).toBe(String.fromCodePoint(0x066b));
  });

  it("shares one grammar between locales that share a marker", () => {
    expect(latexGrammar({ locale: "de" })).toBe(latexGrammar({ locale: "fr" }));
    expect(latexGrammar({ locale: "ar" })).not.toBe(latexGrammar({ locale: "de" }));
  });
});

describe("the module's own surface", () => {
  it("parses through the entry point the later slices will use", () => {
    expect(plain(parseLatexPreprocessed("x^2"))).toStrictEqual(
      JSON.parse('{"power":{"supscript":{"number":"2"},"symbols":"x"}}'),
    );
  });

  it("throws ParseFailed rather than answering null, as the gem raises", () => {
    // There is no `rescue` anywhere under `lib/plurimath/latex/`, so
    // `Parslet::ParseFailed` escapes `Latex::Parser#parse` uncaught. Swallowing
    // it here would change the contract.
    expect(() => parseLatexPreprocessed("a)")).toThrow(ParseFailed);
  });

  it("names all 34 rules of parse.rb plus the mixin's three", () => {
    // The inventory is part of the port's claim to be rule-for-rule: 35
    // `rule(` calls in the oracle, 34 distinct names because `optional_args`
    // is defined twice with identical bodies, and three more from
    // `BaseNumberPrefix::Parser`.
    expect(Object.keys(grammar.rules).length).toBe(37);
  });
});
