/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-html-parser-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/formats/html/generated/provenance.ts`.
 *
 * The constant tables `Plurimath::Html::Transform` builds its nodes from.
 *
 * `html/transform.rb` resolves a captured name at RUNTIME —
 * `Object.const_get("Plurimath::Math::Function::#{capitalize(text)}")`
 * (`utility.rb:139`) — so every name it can reach is resolved here,
 * through the gem, and emitted with the class it reached.
 * `src/formats/html/registry.ts` binds these to `core` constructors;
 * nothing restates them.
 *
 * Unlike LaTeX's table this one has no unresolvable half: every name
 * reachable from `html/transform.rb` resolves, and the generator stops if
 * one stops resolving rather than emitting the gap.
 */

import { HTML_SYMBOLS } from "../../../generated/html/symbols";

/**
 * How the census disposes of a resolved class — the same vocabulary
 * `src/formats/latex/generated/transform-tables.ts` uses. An `aliased`
 * class adds no field and no equality of its own, so the port carries
 * it as its carrier plus a name.
 */
export type HtmlTransformDisposition = "implemented" | "aliased";

/**
 * Which Ruby `initialize` shape a `get_class` name resolves to,
 * measured off the runtime by `CorpusGenerator` (instantiate, read the
 * assigned ivars back, then re-verify parameter wiring with sentinel
 * arguments).
 */
export type HtmlTransformConstructorFamily = "binary" | "ternary" | "unary" | "unaryAttributes";

/**
 * One resolved name: the text as CAPTURED (the registry is keyed by it,
 * so nothing has to reimplement `capitalize`), the class the gem
 * reached, its census disposition, the implemented carrier the port
 * constructs, and the measured constructor family. `sources` names the
 * grammar tags — or the `html/parse.rb` literal — that carry the text.
 */
export interface HtmlTransformClassEntry {
  readonly name: string;
  readonly rubyClass: string;
  readonly disposition: HtmlTransformDisposition;
  readonly carrier: string;
  readonly family: HtmlTransformConstructorFamily;
  readonly sources: readonly string[];
}

/**
 * Every name `Utility.get_class` can receive from the HTML transform,
 * sorted by name.
 *
 * `unary` and `sum_prod` are grammar tags, so their texts are the
 * `Html::Constants` tables the grammar built those rules from. `lim` and
 * `mod` are `html/parse.rb` literals (`:10` and `:16`), not table
 * entries, and `lim` carries both tags because `SUB_SUP_CLASSES` maps
 * the text `lim` onto the class `lim` as well.
 */
export const HTML_TRANSFORM_GET_CLASS: readonly HtmlTransformClassEntry[] = [
  {
    name: "abs",
    rubyClass: "Math::Function::Abs",
    disposition: "implemented",
    carrier: "Math::Function::Abs",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "arccos",
    rubyClass: "Math::Function::Arccos",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "arcsin",
    rubyClass: "Math::Function::Arcsin",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "arctan",
    rubyClass: "Math::Function::Arctan",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "ceil",
    rubyClass: "Math::Function::Ceil",
    disposition: "implemented",
    carrier: "Math::Function::Ceil",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "cos",
    rubyClass: "Math::Function::Cos",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "cosh",
    rubyClass: "Math::Function::Cosh",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "cot",
    rubyClass: "Math::Function::Cot",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "coth",
    rubyClass: "Math::Function::Coth",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "csc",
    rubyClass: "Math::Function::Csc",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "csch",
    rubyClass: "Math::Function::Csch",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "det",
    rubyClass: "Math::Function::Det",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "exp",
    rubyClass: "Math::Function::Exp",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "gcd",
    rubyClass: "Math::Function::Gcd",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "lcm",
    rubyClass: "Math::Function::Lcm",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "lg",
    rubyClass: "Math::Function::Lg",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "lim",
    rubyClass: "Math::Function::Lim",
    disposition: "aliased",
    carrier: "Math::Function::BinaryFunction",
    family: "binary",
    sources: ["binary", "sum_prod"],
  },
  {
    name: "ln",
    rubyClass: "Math::Function::Ln",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "log",
    rubyClass: "Math::Function::Log",
    disposition: "aliased",
    carrier: "Math::Function::BinaryFunction",
    family: "binary",
    sources: ["sum_prod"],
  },
  {
    name: "mod",
    rubyClass: "Math::Function::Mod",
    disposition: "aliased",
    carrier: "Math::Function::BinaryFunction",
    family: "binary",
    sources: ["mod"],
  },
  {
    name: "prod",
    rubyClass: "Math::Function::Prod",
    disposition: "implemented",
    carrier: "Math::Function::Prod",
    family: "ternary",
    sources: ["sum_prod"],
  },
  {
    name: "sec",
    rubyClass: "Math::Function::Sec",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "sech",
    rubyClass: "Math::Function::Sech",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "sin",
    rubyClass: "Math::Function::Sin",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "sinh",
    rubyClass: "Math::Function::Sinh",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "sqrt",
    rubyClass: "Math::Function::Sqrt",
    disposition: "implemented",
    carrier: "Math::Function::Sqrt",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "sum",
    rubyClass: "Math::Function::Sum",
    disposition: "implemented",
    carrier: "Math::Function::Sum",
    family: "ternary",
    sources: ["sum_prod"],
  },
  {
    name: "tan",
    rubyClass: "Math::Function::Tan",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "tanh",
    rubyClass: "Math::Function::Tanh",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary"],
  },
  {
    name: "vec",
    rubyClass: "Math::Function::Vec",
    disposition: "implemented",
    carrier: "Math::Function::Vec",
    family: "unaryAttributes",
    sources: ["unary"],
  },
];

/**
 * `Constants::SUB_SUP_CLASSES` whole, in the gem's order.
 *
 * `transform.rb:49` INDEXES it — `SUB_SUP_CLASSES[sum_prod.to_sym]` —
 * and `Utility.sub_sup_method?` (`html/utility.rb:12`) tests its VALUES,
 * so a port needs both halves of the same hash. The keys are the same
 * eight texts `HTML_SUB_SUP_CLASSES` carries for the grammar, asserted
 * equal at generation time. Emitted as one ordered pair list, from which
 * `registry.ts` derives both readers: a Map for the keyed lookup and a
 * Set for the values. A Map here would hold the same eight pairs, and
 * `new Set(map.values())` the same four names — so this is the
 * arrangement, not a constraint.
 */
export const HTML_TRANSFORM_SUB_SUP_CLASSES: ReadonlyArray<
  readonly [key: string, className: string]
> = [
  ["&prod;", "prod"],
  ["&sum;", "sum"],
  ["&#x220f;", "prod"],
  ["&#x2211;", "sum"],
  ["log", "log"],
  ["lim", "lim"],
  ["∏", "prod"],
  ["∑", "sum"],
];

/**
 * The 26 of 1436 `HTML_SYMBOL_CLASS_INPUT` rows that inverting
 * `HTML_SYMBOLS` does not produce: texts no symbol renders to, and
 * shared texts the gem resolves to an id other than the smallest.
 */
export const HTML_SYMBOL_CLASS_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["&#x1d70b;", "Pi"],
  ["&#x1d715;", "Partial"],
  ["&#x1d703;", "Theta"],
  ["&#x2001;", "Quad"],
  ["&#x2215;", "Slash"],
  ["&#x27ea;", "Paren::UpcaseLangle"],
  ["&#x3c0;", "Pi"],
  ["&times;", "Times"],
  ["&#x302;", "Hat"],
  ["&#x3d;", "Equal"],
  ["&#x26;", "Ampersand"],
  ["&sdot;", "Cdot"],
  ["&#x2f;", "Mathslash"],
  ["..", "Ddot"],
  ["𝜋", "Pi"],
  ["/", "Slash"],
  ["π", "Pi"],
  ["!", "Exclam"],
  ["-", "Minus"],
  [",", "Comma"],
  ["%", "Percent"],
  ["+", "Plus"],
  [".", "Period"],
  ["&#x27e9;", "Paren::Rangle"],
  ["&#x27e8;", "Paren::Langle"],
  ["&#x7c;", "Paren::Vert"],
]);

/**
 * Texts inverting `HTML_SYMBOLS` produces that
 * `Utility.all_symbols_classes(:html)` has no row for.
 */
export const HTML_SYMBOL_CLASS_REMOVED: readonly string[] = ["&"];

/**
 * sha256 over the measured table, one "text TAB id LF" line per
 * row, the lines sorted by their UTF-8 bytes, so a spec can prove the
 * derivation below reproduces what the generator measured.
 */
export const HTML_SYMBOL_CLASS_INPUT_SHA256: string =
  "02fcf6ee2b76fabfb23470465cf268a1dd46a88b066fd02bf7c09e9c8478fc4e";

/**
 * `Utility.all_symbols_classes(:html)` — the table
 * `Utility.symbols_class(text, lang: :html)` (`utility.rb:212`)
 * looks a STRIPPED text up in, as input text -> symbol id.
 *
 * Both halves of the merge are String-keyed, so a Map collapses
 * nothing; the parens half is merged last and wins its
 * 3 overlapping texts — see
 * `HTML_SYMBOL_CLASS_PAREN_OVERLAP`.
 *
 * Derived: `HTML_SYMBOLS` inverted, keeping the smallest id per text,
 * then `HTML_SYMBOL_CLASS_REMOVED` and `HTML_SYMBOL_CLASS_OVERRIDES`.
 *
 * A miss is not an error: `symbols_class` falls back to a bare
 * `Math::Symbols::Symbol` carrying the text.
 */
export const HTML_SYMBOL_CLASS_INPUT: ReadonlyMap<string, string> = /* @__PURE__ */ (() => {
  const table = new Map<string, string>();
  for (const [id, text] of HTML_SYMBOLS) {
    const held = table.get(text);
    if (held === undefined || id < held) table.set(text, id);
  }
  for (const text of HTML_SYMBOL_CLASS_REMOVED) table.delete(text);
  for (const [text, id] of HTML_SYMBOL_CLASS_OVERRIDES) table.set(text, id);
  return table;
})();

/**
 * The texts present in BOTH halves of `all_symbols_classes(:html)`.
 * `symbols_hash.merge(parens_hash)` means the paren class wins each one;
 * emitted so a test can prove the Map above kept the winning side.
 */
export const HTML_SYMBOL_CLASS_PAREN_OVERLAP: readonly string[] = [
  "&#x27e7;",
  "&#x27ea;",
  "&#x27eb;",
];

/**
 * `TransformUtility.normalize_symbol` (`html/transform_utility.rb:53-58`)
 * measured on both of its branches: a text already matching
 * `HTML_ENTITY` is returned unchanged, anything else is run through
 * `Utility.string_to_html_entity`. A SAMPLE of 9
 * texts, not exhaustive coverage; `symbol_normalization_rows` in
 * `scripts/generate-html-parser-data.rb` picks them. No test reads this
 * table yet; it is a recorded oracle measurement, not an enforced one.
 */
export const HTML_SYMBOL_NORMALIZATION_PROBES: ReadonlyArray<
  readonly [text: string, normalized: string]
> = [
  ["&#xa0;&#xa0;&#xa0;&#xa0;", "&#x26;#xa0;&#x26;#xa0;&#x26;#xa0;&#x26;#xa0;"],
  ["&#xa0;&#xa0;", "&#x26;#xa0;&#x26;#xa0;"],
  ["&#x1d70b;", "&#x1d70b;"],
  ["+", "+"],
  ["-", "-"],
  ["=", "="],
  ["<", "&#x3c;"],
  [">", "&#x3e;"],
  ["x", "x"],
];
