/**
 * Mirrors `function/fenced.rb` — `Fenced#to_unicodemath` (:104).
 *
 * The most options-dependent kind in the format, and the one with the most
 * places the gem simply crashes. Every shape below was measured against the
 * pinned oracle (plurimath 0.11.6, 00c52783); the transcript is in the
 * comments, not paraphrased.
 *
 * Four things are worth naming up front:
 *
 *   - a **mini-sized** fence takes a different path entirely
 *     (`mini_sized_unicode`, :182): contents joined with nothing, no added
 *     parens, and both parens rendered UNGUARDED. The question that selects it
 *     (`mini_sized?`, :176) RECURSES — see the call site below;
 *   - a `Frac` carrying `:choose` is rendered by *this* node
 *     (`Frac#choose_frac`, `frac.rb:118`), and if it is the FIRST element it
 *     replaces the whole fence, parens included;
 *   - the open and close parens each resolve through their own three-branch
 *     chain reading `self.options` (:271, :284);
 *   - `convert_paren_size` (:301) rounds a **logarithm**. Ruby rounds half
 *     away from zero, JS `Math.round` rounds toward +infinity, and the values
 *     go negative for any size below 1em — so the difference is reachable,
 *     not theoretical. Hence `rubyRound`.
 *
 * Measured, `to_unicodemath` on a Fenced does NOT decode HTML entities: a
 * mini-sized `x` came back as `"(&#x2093;)"`. The decode belongs to
 * `Formula#to_unicodemath` and reaches this output only through a parent
 * formula, which is why `formulaBoundary` owns it.
 */

import { RenderError } from "../../core/index";
import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  FORMAT,
  isNode,
  miniSized,
  present,
  renderChild,
  renderOptionalChild,
  rubyRound,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";

/** U+251C and U+2524 — the prefixed-paren markers. */
const OPEN_PREFIX = "├";
const CLOSE_PREFIX = "┤";

function crash(at: string, gemError: string): RenderError {
  return new RenderError(`${at}: the gem raises ${gemError} here`, FORMAT, "fenced");
}

export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): string {
  // `Fenced#mini_sized?` (:176):
  //
  //   parameter_one&.mini_sized? ||
  //     Math::Formula.new(parameter_two)&.mini_sized? ||
  //     parameter_three&.mini_sized?
  //
  // Every term RECURSES, and this file used to ask a local flag test that did
  // not. `Formula#mini_sized?` is `value&.first&.mini_sized?` (`formula.rb:353`),
  // so a wrapped child answers for its own first child, however deep — and a
  // slot holding a Formula carries no `mini_sub_sized` field of its own, so the
  // flag test answered false for every nested shape. Measured on the oracle,
  // with the contents `[Formula([Number("1", mini_sub_sized: true)]), Number("2")]`:
  //
  //   Fenced[Formula[mini], 2]              => "(₁2)"    (this port gave "(₁ 2)")
  //   Fenced|Formula[mini]|                 => "|₁|"     (gave "|(₁)|")
  //   Fenced[Formula[mini]] open_prefixed   => "(₁)"     (gave "├(₁)")
  //   Fenced[Formula[mini]] minsize "2em"   => "(₁)"     (gave "├3(₁)")
  //
  // and `mini_sized?` itself answered `true` for `Fenced[Formula[mini]]`,
  // `Fenced[Formula[Formula[mini]]]`, `Fenced[Mrow[mini]]` and
  // `Fenced[Fenced[mini]]`, `nil` for `Fenced[Formula[plain]]` and for
  // `Fenced[plain, mini]` — the first-child rule survives the recursion.
  // The shared `miniSized` is that whole recursion, `Fenced` arm included, so
  // this asks it about the node itself rather than re-deriving the three terms.
  if (miniSized(node)) return miniSizedUnicode(node, context);

  const contents = node.parameterTwo;
  // `parameter_two&.map{…}` is guarded but the very next line,
  // `choose_frac?(parameter_two.first)`, is NOT. Measured: a Fenced with a nil
  // contents list raises `NoMethodError: undefined method 'first' for nil`,
  // so the guard on the line above buys nothing and this is a crash, not an
  // empty fence. An empty ARRAY is fine and gives "()" — measured.
  if (!Array.isArray(contents)) throw crash("fenced.parameterTwo", "NoMethodError on nil");

  // `param.to_unicodemath(options: options)` (`fenced.rb:107-111`) — no `&.`,
  // so a nil ELEMENT raises where a nil LIST raised on the line above.
  // `renderOptionalChild` returned "" for it. Measured:
  //   gem   Fenced("(", [Symbol("x"), nil], ")")  !! NoMethodError
  //   port                                        => "(x )"
  const rendered = contents
    .map((param) =>
      isChooseFrac(param)
        ? chooseFrac(param, context)
        : renderChild(param, context, "fenced.parameterTwo"),
    )
    .join(" ");

  // `return fenced_value if choose_frac?(parameter_two.first)` — a LEADING
  // choose-frac replaces the whole fence, parens and all. Measured:
  //   [choose]        -> "(n)⒞(k)"        (no outer parens)
  //   [choose, a]     -> "(n)⒞(k) a"      (no outer parens)
  //   [a, choose]     -> "(a (n)⒞(k))"    (parens kept — position matters)
  if (isChooseFrac(contents[0])) return rendered;

  // Measured: a Vert-fenced `|x|` gives "|(x)|" — the contents gain a paren
  // pair *inside* the existing fence.
  const body = isVertParen(node) ? `(${rendered})` : rendered;
  return `${openParen(node, context)}${body}${closeParen(node, context)}`;
}

/**
 * `mini_sized_unicode` (:182) — joined with NOTHING, and no added parens.
 *
 * Both parens are rendered without safe navigation, unlike everywhere else in
 * this file. Measured: mini contents with a nil open paren raises
 * `NoMethodError: undefined method 'to_unicodemath' for nil`, so `renderChild`
 * (which throws) is correct here where `renderOptionalChild` would be wrong.
 */
function miniSizedUnicode(node: NodeOf<"fenced">, context: RenderContext): string {
  // `parameter_two&.map { … }` (`fenced.rb:183-185`): `&.` guards nil ONLY, so
  // a non-nil non-array is sent `map` and raises. Substituting `[]` for it
  // swallowed that. Measured:
  //   gem   Fenced(Number(mini), "s", ")")  !! NoMethodError ('map' for String)
  //   port                                   => "&#x2081;)"
  const raw = node.parameterTwo;
  if (raw !== null && raw !== undefined && !Array.isArray(raw)) {
    throw crash("fenced.parameterTwo", "NoMethodError on a non-array");
  }
  const contents = Array.isArray(raw) ? raw : [];
  // And inside the map the gem is again unguarded, so a nil ELEMENT raises too:
  //   gem   Fenced("(", [Number(mini), nil], ")")  !! NoMethodError
  //   port                                          => "(&#x2081;)"
  const inner = contents
    .map((param) => renderChild(param, context, "fenced.parameterTwo"))
    .join("");
  const open = renderChild(node.parameterOne, context, "fenced.parameterOne") ?? "";
  const close = renderChild(node.parameterThree, context, "fenced.parameterThree") ?? "";
  return `${open}${inner}${close}`;
}

/** `choose_frac?` (:297) — a Frac whose own options hash carries `:choose`. */
function isChooseFrac(param: unknown): boolean {
  if (!isNode(param) || param.kind !== "frac") return false;
  const options = (param as { readonly options?: Record<string, unknown> | null }).options;
  return options !== undefined && options !== null && "choose" in options;
}

/**
 * `Frac#choose_frac` (`frac.rb:118`) — rendered by the FENCE, not the frac.
 *
 * Each side goes through `unicodemath_parens`, and each is guarded by a bare
 * `if parameter_one` (Ruby truthiness), so a nil side contributes nothing
 * rather than crashing. Measured: `(n)⒞(k)`.
 */
function chooseFrac(param: unknown, context: RenderContext): string {
  const frac = param as { readonly parameterOne?: unknown; readonly parameterTwo?: unknown };
  const one = present(frac.parameterOne)
    ? (unicodemathParens(frac.parameterOne, context) ?? "")
    : "";
  const two = present(frac.parameterTwo)
    ? (unicodemathParens(frac.parameterTwo, context) ?? "")
    : "";
  // U+24B8 CIRCLED LATIN CAPITAL LETTER C.
  return `${one}⒞${two}`;
}

/**
 * `vert_paren?` (:318).
 *
 * The gem reads `parameter_one.class_name` UNGUARDED, then falls back to
 * `is_a?(Paren::Vert)`. Three measurements fix the shape:
 *   - a nil open paren raises `NoMethodError: undefined method 'class_name'`;
 *   - `Paren::Vert` answers true even though its `value` is nil, which is why
 *     the class test cannot be replaced by a value test;
 *   - `Paren::Lround` answers false.
 * `Paren::Vert` has no subclasses (measured), so `is_a?` is an exact match and
 * an id comparison is faithful. `class_name == "symbol"` is likewise exact:
 * it is the basename of the class, so only a plain `Symbols::Symbol` — whose
 * id the port leaves as the default `"Symbol"` — takes the value branch.
 */
function isVertParen(node: NodeOf<"fenced">): boolean {
  const open = node.parameterOne;
  if (!isNode(open)) throw crash("fenced.parameterOne", "NoMethodError on nil");
  if (open.kind === "symbol" && open.id === "Symbol") {
    const value = (open as { readonly value?: string | null }).value;
    // `parameter_one&.value&.include?("|")` — a nil value is falsy, not a crash.
    return typeof value === "string" && value.includes("|");
  }
  return open.kind === "symbol" && open.id === "Paren::Vert";
}

/**
 * `unicode_open_paren` (:271). Measured, in the gem's own branch order:
 *   {open_paren: {minsize: "0.5em"}} -> "├-3(x)"
 *   {open_paren: {minsize: "2em"}}   -> "├3(x)"
 *   {open_paren: {}}                 -> NoMethodError (nil.delete_suffix)
 *   {open_prefixed: true}, plain     -> "├(x)"
 *   {open_prefixed: true}, open "{:" -> "├x)"     (open_or_begin?, paren dropped)
 *   no options, open "{:"            -> "├x┤"
 */
function openParen(node: NodeOf<"fenced">, context: RenderContext): string {
  const paren = renderOptionalChild(node.parameterOne, context);
  const options = node.options;
  const has = (key: string) => options !== undefined && options !== null && key in options;

  if (has("open_paren")) {
    const minsize = (options?.open_paren as { minsize?: unknown } | undefined)?.minsize;
    return `${OPEN_PREFIX}${parenSize(minsize, "open_paren")}${paren}`;
  }
  if (has("open_prefixed") && !isOpenOrBegin(node)) return `${OPEN_PREFIX}${paren}`;
  if (has("open_prefixed") || paren === "{:") return OPEN_PREFIX;

  return paren;
}

/** `unicode_close_paren` (:284) — the same chain on the closing side. */
function closeParen(node: NodeOf<"fenced">, context: RenderContext): string {
  const paren = renderOptionalChild(node.parameterThree, context);
  const options = node.options;
  const has = (key: string) => options !== undefined && options !== null && key in options;

  if (has("close_paren")) {
    const minsize = (options?.close_paren as { minsize?: unknown } | undefined)?.minsize;
    return `${CLOSE_PREFIX}${parenSize(minsize, "close_paren")}${paren}`;
  }
  if (has("close_prefixed") && !isCloseOrEnd(node)) return `${CLOSE_PREFIX}${paren}`;
  if (has("close_prefixed") || paren === ":}") return CLOSE_PREFIX;

  return paren;
}

/** `open_or_begin?` (:306) and `close_or_end?` (:312), both `&.`-guarded. */
function isOpenOrBegin(node: NodeOf<"fenced">): boolean {
  return valueHasAny(node.parameterOne, ["&#x251c;", "&#x3016;", "{:"]);
}

function isCloseOrEnd(node: NodeOf<"fenced">): boolean {
  return valueHasAny(node.parameterThree, ["&#x2524;", "&#x3017;", ":}"]);
}

function valueHasAny(field: unknown, needles: readonly string[]): boolean {
  // `parameter_one&.value&.include?(…)`. The FIRST `&.` guards nil only, so
  // anything else is sent `value` — and a node kind that has no such field
  // raises rather than answering false. `"value" in node` is the port's
  // `respond_to?(:value)`: measured, the two agree on `Abs` and `Fenced`
  // (neither), and on `Formula`, `Symbol` and `Number` (all three).
  //
  //   gem   Fenced(Abs(x), [x], ")", open_prefixed: true)  !! NoMethodError
  //   port                                                  => "⒜(x)x)"
  if (field === null || field === undefined) return false;
  if (!isNode(field) || !("value" in field)) {
    throw crash("fenced.parameterOne/Three", "NoMethodError reading value");
  }

  // The SECOND `&.` guards a nil value. A `Formula`'s value is an Array, where
  // `Array#include?` is element equality against a needle string and so is
  // always false — measured, gem and port agree on that shape.
  const value = (field as { readonly value?: unknown }).value;
  if (typeof value !== "string") return false;
  return needles.some((needle) => value.includes(needle));
}

/**
 * `convert_paren_size` (:301) — `(Math.log(size) / Math.log(1.25)).round`.
 *
 * Every failure mode here is a gem crash, measured:
 *   nil       -> NoMethodError  (nil.delete_suffix)
 *   "abc"     -> FloatDomainError -Infinity  (Ruby's `to_f` gives 0.0, log(0) is -Inf)
 *   "0em"     -> FloatDomainError -Infinity
 *   "-1em"    -> Math::DomainError
 * and the successful values are:
 *   "0.5em" -> -3   "0.8em" -> -1   "1em" -> 0   "1.25em" -> 1   "2em" -> 3
 */
function parenSize(minsize: unknown, at: string): string {
  if (typeof minsize !== "string") {
    throw crash(`fenced.options.${at}.minsize`, "NoMethodError on nil");
  }
  const size = rubyToFloat(minsize.replace(/em$/, ""));
  // Ruby reaches FloatDomainError from BOTH ends: `log(0)` is -Infinity for a
  // size that parses to zero, and `log(Infinity)` is +Infinity for a size like
  // "1e309em" whose `to_f` overflows. `Number.isFinite` folds the overflow to
  // zero above, so both arrive here — the message names the pair rather than
  // claiming the negative one for an input that overflowed upward.
  if (size === 0)
    throw crash(`fenced.options.${at}.minsize`, "FloatDomainError (log is not finite)");
  if (size < 0) throw crash(`fenced.options.${at}.minsize`, "Math::DomainError");

  return String(rubyRound(Math.log(size) / Math.log(1.25)));
}

/**
 * Ruby's `String#to_f`: parse the leading numeric run, and give 0.0 when there
 * is none — where JS `parseFloat` gives NaN. The difference is load-bearing:
 * the gem reaches `Math.log(0.0)` and raises FloatDomainError, so "abc" must
 * become 0 here and take the crash branch above, not fall through as NaN.
 */
function rubyToFloat(text: string): number {
  // Ruby's grammar, not JavaScript's. `parseFloat` accepts spellings `to_f`
  // rejects, and the difference is reachable: measured on the oracle,
  //
  //   "Infinity".to_f => 0.0      "NaN".to_f  => 0.0      "0x10".to_f => 0.0
  //   "1e3".to_f      => 1000.0   "1.5abc".to_f => 1.5
  //
  // so `minsize: "Infinity"` makes the gem raise FloatDomainError while
  // `parseFloat` returned Infinity and this port emitted `├Infinity(x)` —
  // plausible output where the specification refuses. The match is anchored
  // and covers only what Ruby's numeric prefix allows.
  // An underscore is legal only BETWEEN digits, which `(?:_\d+)*` encodes, and
  // a leading `.` is a valid float. Both were wrong in the first version of
  // this regex — measured against Ruby over 25 spellings:
  //   ".5"   to_f 0.5  (the old pattern required a leading digit -> 0)
  //   "1__0" to_f 1.0  (the old pattern stripped every `_` -> 10)
  // Ruby stops at the DOUBLE underscore, keeping only the leading `1`.
  const match =
    /^[ \t\r\n\f\v]*[+-]?(?:\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?|\.\d+(?:_\d+)*)(?:[eE][+-]?\d+(?:_\d+)*)?/.exec(
      text,
    );
  if (match === null) return 0;
  const parsed = Number.parseFloat(match[0].replace(/_/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
