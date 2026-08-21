/**
 * Shared semantics for the per-kind UnicodeMath render files
 * (`../../render/<kind>/unicodemath.ts`): the render context, the child-render
 * contract, and the cross-cutting predicates UnicodeMath needs and no other
 * format does. Every behaviour here was read off live gem instances against
 * the pinned oracle (plurimath 0.11.6, 00c52783) — PORTING-STANDARDS.md.
 *
 * ## What makes this format different
 *
 * LaTeX and MathML render a node from the node. UnicodeMath sometimes renders
 * a parent by first **asking a question of its child**, and the answer changes
 * the parent's output rather than the child's:
 *
 *   - `prime_unicode?` (gem `core.rb:415`) **swaps sub and sup order** in
 *     `Nary`, `PowerBase`, `Inf`, `Int` and `Multiscript`;
 *   - `mini_sized?` (`formula.rb:353`) changes the separator a formula joins
 *     its children with, and short-circuits `Fenced` and `Number`;
 *   - `negated_value?` (`formula.rb:482`) does the same to the separator.
 *
 * The render context carries only a `render` closure, which cannot answer any
 * of these — so they live here as pure structural queries over `MathNode`.
 * Their default answers are all falsy, which is exactly what makes them
 * dangerous: a wrong answer for one node kind is invisible on every other
 * shape, so each is pinned in `test/formats/unicodemath/render-shared.spec.ts`
 * against the gem's own result.
 */

import {
  type MathNode,
  MissingSymbolDataError,
  type NodeKind,
  RenderError,
} from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { rubyNumberToS } from "../../core/ruby-semantics";
import { UNICODEMATH_HEXCODE_IN_INPUT } from "../../generated/unicodemath/render-tables";

export const FORMAT = "unicodemath";

/**
 * The render context. UnicodeMath has no option axis: the generated exception
 * matrix (`src/generated/unicodemath/exceptions.ts`) is empty, because no
 * symbol varies on `intent`, `table` or `rspace` — measured, and pinned by
 * `test/generated/unicodemath-data.spec.ts` so a regeneration that introduces
 * variants fails loudly.
 */
export interface RenderContext {
  /**
   * `child.to_unicodemath(options:)`. Returns `null` exactly where the gem
   * returns nil, which callers observe: `Frac#to_unicodemath` falls off its
   * `elsif` chain returning nil when `options` names none of `:linethickness`,
   * `:displaystyle` or `:ldiv`, and `Table#unicodemath_class_name` has a bare
   * `return`.
   */
  readonly render: (node: MathNode) => string | null;
}

export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

export type RenderFn<K extends NodeKind> = (
  node: NodeOf<K>,
  context: RenderContext,
) => string | null;

/**
 * The five entities `prime_unicode?` looks for, as `Utility.primes_constants`
 * actually holds them — `PREFIXED_PRIMES` merged with `{ sprime: "&#x27;" }`.
 *
 * Entity text, not decoded glyphs, because both arms of
 * `unicodemath_field_value` return entity text and the gem's comparison is a
 * plain string match. An earlier version of this file held the DECODED glyphs
 * and compared them against the render. That agreed with the gem for all 1,460
 * concrete classes, which is why it survived so long, but it could not
 * reproduce the generic-symbol arm: `Symbol("&#x2032;")` through
 * `Symbol("&#x27;")` are all primes to the gem, and a generic symbol's render
 * is the undecoded entity, which matches no decoded glyph. Checking only
 * `&#x27;` caught one of the five.
 */
const PRIME_ENTITIES: readonly string[] = [
  "&#x2057;",
  "&#x2034;",
  "&#x2033;",
  "&#x2032;",
  "&#x27;",
];

/**
 * `Core#prime_unicode?` — whether this child makes its parent emit the
 * superscript **before** the subscript.
 *
 * False for anything that is not a symbol, which is the gem's first line and
 * the reason a `Formula` child never triggers the swap however many primes it
 * contains.
 *
 * The whole prime family answers true, not only the four `PREFIXED_PRIMES`
 * classes: `Dprime` and `Second` both render U+2033, `Third` U+2034, `Qprime`
 * U+2057, and the gem matches on the rendered value rather than the class, so
 * all of them swap. Probing only `prime`/`pprime`/`ppprime`/`pppprime` would
 * have suggested a four-class rule that is not the rule.
 */
export function primeUnicode(node: MathNode | undefined): boolean {
  if (node === undefined || node.kind !== "symbol") return false;

  // `return true if field&.value&.include?("&#x27;")` (`core.rb:417`) — the
  // gem's SECOND line, which reads the node's own raw `value` for the
  // apostrophe on EVERY symbol class, generic or concrete, before any hexcode
  // lookup happens.
  //
  // A rewrite of this function dropped that line, on a reading of the gem that
  // had "nothing between the guard and the field value". There is: this. The
  // cost was one silent wrong answer and two spurious throws — measured on a
  // concrete class carrying the entity as its value:
  //
  //   gem  PowerBase(x, x, Alpha("&#x27;"))   "xα_(x)"      port "x_(x)^(α)"  WRONG
  //   gem  PowerBase(x, x, Bar("&#x27;"))     "x¯_(x)"      port  RenderError
  //   gem  PowerBase(x, x, Lround("&#x27;"))  "x(_(x)"      port  RenderError
  //
  // Only `&#x27;` is tested here, not all five: the other four reach a concrete
  // class solely through `hexcode_in_input` below, which ignores `value`.
  const raw = node.value;
  if (typeof raw === "string" && raw.includes("&#x27;")) return true;

  // Raw entity text on both arms — see `unicodemathFieldValue`. A generic
  // symbol carrying ANY of the five is a prime, not just the apostrophe.
  const value = unicodemathFieldValue(node);

  // Past `core.rb:417` the gem's last line is
  // `unicodemath_field_value(field).include?(prime)`, with nothing further
  // guarding the nil — so BOTH arms raise when the field value is nil, and both
  // were once wrong here in the same direction:
  //
  //   - a concrete class whose `input(:unicodemath)` holds no `&#x…;` entry.
  //     Measured, 10 of 1,460 do: Bar, If, Ul, Paren and its six concrete
  //     parens. Returning false rendered `x^(¯)` where the gem refuses.
  //   - the GENERIC class holding a nil value, which `new SymbolNode()` — the
  //     public model API — produces by default. Measured:
  //       gem   PowerBase(x, a, Symbol(nil))  !! NoMethodError
  //       port                                => "x_(a)^()"
  //     That arm returned false because it tested `typeof value === "string"`,
  //     a JS shape test standing in for a Ruby method call that does not fail
  //     softly.
  if (value === null) {
    throw new RenderError(
      `${node.id}: unicodemath_field_value is nil — ` +
        (className(node.id) === "symbol"
          ? "this generic symbol carries no value"
          : "Utility.hexcode_in_input finds no entity for this class") +
        ", and the gem raises NoMethodError calling include? on it",
      FORMAT,
      "symbol",
    );
  }
  return PRIME_ENTITIES.some((entity) => value.includes(entity));
}

/**
 * `Core#mini_sized?`, and the three overrides that are not the default.
 *
 * The gem's default is `false` (`core.rb:352`); `Number` and `Symbol` answer
 * `mini_sub_sized || mini_sup_sized` from their own fields; `Fenced` asks its
 * three slots; and `Formula` asks **only its first child** (`formula.rb:353`,
 * `true if value&.first&.mini_sized?` — note it yields nil, not false, which
 * is falsy either way but is why nothing here returns a nullable boolean).
 */
export function miniSized(node: MathNode | undefined): boolean {
  if (node === undefined) return false;

  switch (node.kind) {
    case "number":
    case "symbol":
      return Boolean(node.miniSubSized) || Boolean(node.miniSupSized);
    case "fenced":
      return (
        miniSized(asNode(node.parameterOne, "fenced.parameterOne")) ||
        someMiniSized(node.parameterTwo) ||
        miniSized(asNode(node.parameterThree, "fenced.parameterThree"))
      );
    case "formula":
    case "mrow":
      // `Formula::Mrow < Formula` and overrides NEITHER `mini_sized?` nor
      // `negated_value?` (`formula/mrow.rb` defines 0 of them), so an Mrow
      // answers exactly as a Formula does — measured, both give true for the
      // same content. Omitting `mrow` here made every Mrow answer false and
      // join with a space the gem suppresses.
      //
      // First child only. Asking every child would answer true for shapes the
      // gem answers false for, and the difference is a separator that appears
      // or disappears in the output.
      // `true if value&.first&.mini_sized?` (`formula.rb:354`) — `&.` again,
      // so a non-node first child raises rather than answering false.
      return miniSized(asNode(node.value?.[0], `${node.kind}.value[0]`));
    default:
      return false;
  }
}

/**
 * `Formula#negated_value?` — the last child being the combining long solidus
 * overlay, which suppresses the join separator alongside `mini_sized?`.
 */
export function negatedValue(node: MathNode): boolean {
  // `mrow` as well as `formula`: `Formula::Mrow` inherits `negated_value?`
  // unchanged, and measured, an Mrow ending in the combining long solidus
  // answers true exactly as a Formula does.
  if (node.kind !== "formula" && node.kind !== "mrow") return false;

  // `value.last.is_a?(Math::Symbols::Symbol) && …` (`formula.rb:483`) — `is_a?`,
  // NOT `&.`, so this one genuinely answers false for a non-node instead of
  // raising. That is why it does not use the strict `asNode` the `mini_sized?`
  // sites need: the two predicates differ in the gem and must differ here.
  const last = node.value?.[node.value.length - 1];
  return isNode(last) && last.kind === "symbol" && last.value === NEGATION_VALUE;
}

/**
 * The combining long solidus overlay, compared as the gem compares it: against
 * the symbol's raw `value`, not a named id.
 *
 * Measured, because the obvious reading is wrong. No entry in
 * `src/generated/unicodemath/symbols.ts` carries U+0338 at all: the gem builds
 * this as a **generic** `Symbols::Symbol` holding the literal entity text, so
 * its `class_name` is `"symbol"` and its id in this port is the default
 * `"Symbol"`. Looking for a named symbol id finds nothing and the predicate
 * silently never fires.
 */
const NEGATION_VALUE = "&#x338;";

function someMiniSized(slot: unknown): boolean {
  if (!Array.isArray(slot)) return miniSized(asNode(slot, "fenced.parameterTwo"));
  // `Formula.new(parameter_two).mini_sized?` — a formula asks its first child,
  // so a list slot behaves the same way rather than asking all of them.
  return miniSized(asNode(slot[0], "fenced.parameterTwo"));
}

/**
 * A slot as `&.mini_sized?` sees it: nil short-circuits, anything else is sent
 * the message.
 *
 * This used to return `undefined` for EVERY non-node, which made `miniSized`
 * answer false for a slot the gem raises on — the `&.`-guards-nil-only trap.
 * It is normally masked, because the callers throw a few lines later for the
 * same slot; the leading-choose-frac early return skips that. Measured:
 *
 *   gem   Fenced("s", [Frac(n, k, choose: true)], ")")  !! NoMethodError
 *                                            ('mini_sized?' for an instance of String)
 *   port                                                 => "(n)⒞(k)"
 */
function asNode(value: unknown, slot: string): MathNode | undefined {
  if (value === null || value === undefined) return undefined;
  if (isNode(value)) return value;
  throw new RenderError(
    `${slot}: ${describeSlot(value)} does not answer mini_sized?, and the gem's ` +
      "`&.` guards nil only — it raises NoMethodError here",
    FORMAT,
    "fenced",
  );
}

/**
 * Ruby truthiness on a field: `nil` and `false` are falsy, everything else is
 * truthy.
 *
 * The gem guards its optional slots with a bare `if parameter_two`, and this
 * is that test. Checking `!== undefined` instead is WRONG and was wrong here:
 * the corpus records an absent slot as nil, the model builder gives it
 * `null`, and `null !== undefined` is true — so `Nary` emitted `∑_^ x` for
 * `sum x` where the gem gives `∑ x`, an underscore and a caret with nothing
 * attached to either. Nine kind files carried the same mistake.
 */
export function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/**
 * Ruby truthiness on a field: `nil` and `false` are falsy, everything else is
 * truthy.
 *
 * The gem guards its optional slots with a bare `if parameter_two`, and this
 * is that test. Checking `!== undefined` instead is WRONG and was wrong here:
 * the corpus records an absent slot as nil, the model builder gives it
 * `null`, and `null !== undefined` is true — so `Nary` emitted `∑_^ x` for
 * `sum x` where the gem gives `∑ x`, an underscore and a caret with nothing
 * attached to either. Nine kind files carried the same mistake.
 */
export function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

export function isNode(value: unknown): value is MathNode {
  return typeof value === "object" && value !== null && "kind" in value;
}

/**
 * `Core#unicodemath_parens` — wrap a field in `(…)` unless it is already
 * fenced, in which case the fence is the wrapping.
 */
export function unicodemathParens(field: unknown, context: RenderContext): string | null {
  // The trailing `if field` guard is a TRAP, and this helper used to fall for
  // it: the gem's first line is `paren = field.to_unicodemath(options:)`,
  // UNGUARDED, so a nil field raises before the guard is ever reached. The
  // guard only decides whether a successfully-rendered field gets wrapped —
  // it never rescues nil. Measured: `Sqrt.new(nil).to_unicodemath` raises
  // `NoMethodError: undefined method 'to_unicodemath' for nil`, and so does
  // `Monospace.new(nil)`.
  //
  // Returning null here instead made every caller silently render a bare
  // radical where the gem crashes. `renderChild` throws for exactly this
  // reason, so this delegates rather than repeating the check.
  const rendered = renderChild(field, context, "unicodemath_parens");
  // `renderChild` threw unless `field` is a node, so the trailing `if field`
  // can never be false here — which is the point: it is not a nil guard.
  // `return paren if field.is_a?(Math::Function::Fenced)` — a fence is its own
  // wrapping, so it is not wrapped again, and it may legitimately render nil.
  if ((field as MathNode).kind === "fenced") return rendered;

  // `"(#{paren})"` interpolates a nil child as empty, giving `()`.
  return `(${rendered ?? ""})`;
}

/**
 * Render a slot that the type system cannot promise is a node.
 *
 * A slot holding a string, an array or nil is not something the gem can call
 * `to_unicodemath` on — it raises `NoMethodError` there — so this raises the
 * port's typed equivalent rather than inventing output for it.
 */
export function renderChild(value: unknown, context: RenderContext, at: string): string | null {
  if (isNode(value)) return context.render(value);
  throw new RenderError(
    `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

/**
 * A slot the gem guards with `&.`, where absent means "contribute nothing".
 *
 * `&.` short-circuits on **nil and nothing else**, so this accepts a node or
 * an absent slot and refuses everything else. Measured against the oracle:
 *
 *   nil&.to_unicodemath    => nil
 *   "x".to_unicodemath     !! NoMethodError
 *   [].to_unicodemath      !! NoMethodError
 *   false&.to_unicodemath  !! NoMethodError   (`&.` does not guard false)
 *
 * An earlier version returned `""` for any non-node, which quietly rendered a
 * bare string or a stray list as an empty slot where the gem raises — the
 * exact "more correct than the oracle" defect PORTING-STANDARDS.md forbids.
 * A slot the gem reads WITHOUT `&.` is `renderChild`, which refuses nil too.
 */
export function renderOptionalChild(value: unknown, context: RenderContext): string {
  if (value === null || value === undefined) return "";
  if (isNode(value)) return context.render(value) ?? "";
  throw new RenderError(
    `cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

/**
 * What a bad slot held, said precisely enough to debug.
 *
 * `typeof` alone calls a list "an object", null "an object", and would print
 * "a object" from a naive article fallback. The distinctions matter because
 * the three cases have different causes: a bare string is usually the gem's
 * own parse of something like `left(right)`, a bare list is a slot that should
 * have been wrapped in a Formula, and nil is a missing parameter.
 */
export function describeSlot(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (Array.isArray(value)) return "a bare list";
  // Explicit, because the article fallback would say "a object".
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/**
 * A carrier name outside the measured set.
 *
 * The census records what the AsciiMath transform can construct; a name beyond
 * it has no measured behaviour, and inventing a fallback would ship output
 * nothing pinned. Carriers raise instead, which keeps a missing subclass
 * visible.
 */
export function unreachableName(kind: string, name: string): RenderError {
  return new RenderError(
    `No measured unicodemath rendering for ${kind} name "${name}" — it is not ` +
      "reachable from the AsciiMath transform, and the gem class may override " +
      "to_unicodemath. Rendering a carrier default instead would diverge silently.",
    FORMAT,
    kind,
  );
}

/**
 * `Utility.html_entity_to_unicode`, applied by `Formula#to_unicodemath` at the
 * boundary — and by every *nested* formula too, because a parent calls the
 * same method on its children.
 *
 * Re-exported from core rather than reimplemented. The gem calls
 * `HTML_ENTITIES.decode`, which handles NAMED (`&amp;`), DECIMAL (`&#8467;`)
 * and hex in BOTH cases (`&#x2093;`, `&#X2093;`). A local copy here matched
 * only lowercase-x hex and silently left the other three forms undecoded —
 * measured against the gem, which decodes all four. Core's implementation
 * carries the full xhtml1 table and the gem's codepoint-range behaviour, and
 * `src/formats/mathml/render-shared.ts` already reaches it the same way.
 *
 * A nested `Formula` re-runs this decode, and that repetition used to be
 * justified here by calling the transform idempotent — "measured rather than
 * assumed", on the strength of `"a&#x2581;b"`. One example, generalised into a
 * property it does not have. Measured:
 *
 *   "a&#x2581;b"     -> "a▁b"        -> "a▁b"        idempotent
 *   "&amp;#x27;"     -> "&#x27;"     -> "'"          NOT
 *   "&amp;amp;"      -> "&amp;"      -> "&"          NOT
 *   "&#38;#x27;"     -> "&#x27;"     -> "'"          NOT
 *
 * What actually makes the repetition safe is that the gem re-enters
 * `Formula#to_unicodemath` per nesting level too, so both sides decode the same
 * number of times. Measured on `Symbol("&amp;#x27;")`, gem and port identical
 * at every depth:
 *
 *   Formula[sym] "&#x27;"   Formula[Formula[sym]] "'"   three deep "'"
 *   Formula[Mrow[sym]] "'"
 *
 * So this decode must stay exactly where the gem's is. Moving it somewhere the
 * gem does not have it changes output, and the idempotence claim would have
 * licensed precisely that.
 */
export { htmlEntityToUnicode };

/** The gem's `\s/\s -> /` squeeze, applied at the same boundary. */
function squeezeSolidus(text: string): string {
  return text.replace(new RegExp(`${RUBY_SPACE}/${RUBY_SPACE}`, "g"), "/");
}

/**
 * Ruby's `\s` — and it is NOT JavaScript's.
 *
 * Ruby matches exactly space, tab, CR, LF, FF and VT. JavaScript's `\s` also
 * matches U+00A0 NO-BREAK SPACE, U+2009 THIN SPACE and the rest of the Unicode
 * space separators. Measured: the gem leaves `"a\u00a0/\u00a0b"` untouched,
 * where a JS-flavoured `/\s\/\s/` collapses it to `"a/b"`.
 *
 * Symbol renders are already decoded by the time the boundary squeeze runs, so
 * a no-break space really can reach it.
 */
const RUBY_SPACE = "[ \\t\\r\\n\\f\\v]";

/**
 * Ruby string interpolation, `"#{value}"` — which calls `to_s` on ANYTHING.
 *
 * Option values reach the renderer as whatever the parser put there, and the
 * gem never type-checks them before interpolating. Measured on `Sum`'s `mask`:
 *
 *   mask: "x"    => "∑x_(a)^(b)▒〖c〗"
 *   mask: 5      => "∑5_(a)^(b)▒〖c〗"
 *   mask: false  => "∑false_(a)^(b)▒〖c〗"
 *   mask: :m     => "∑m_(a)^(b)▒〖c〗"
 *   mask: nil    => "∑_(a)^(b)▒〖c〗"
 *
 * So a `typeof value === "string"` test — which this port used at three mask
 * sites — silently drops every non-string, where the gem prints it. Only nil
 * interpolates to nothing; `false` does not.
 */
export function rubyInterpolate(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return rubyInspect(value);
}

/**
 * Ruby's `inspect`, for the values a JS runtime can represent faithfully.
 *
 * `"#{value}"` calls `to_s`, and for a String that is the string itself, while
 * for an Array or Hash `to_s` IS `inspect`. Measured on the pinned oracle
 * through a real `Mpadded` mask — the gem renders all of these, so refusing
 * them made this port LESS capable than its specification, which is its own
 * kind of divergence:
 *
 *   ["x", 2] => "⟡([\"x\", 2]&x)"      {a: 1} => "⟡({a: 1}&x)"
 *   1.0      => "⟡(1.0&x)"             5      => "⟡(5&x)"
 *   "s"      => "⟡(s&x)"               true   => "⟡(true&x)"
 *
 * What JavaScript genuinely cannot decide is an INTEGRAL number: JS has one
 * numeric type, so `1` and `1.0` are the same value while Ruby prints "1" and
 * "1.0". Those render as Ruby renders an Integer, which is wrong only for a
 * Float that happens to be integral. `0.0` and `-0.0` fall here too (Ruby
 * "0.0", JS "0"). `-0.0` is the exception and IS handled: Ruby has no Integer
 * negative zero, so a JS `-0` can only be that Float.
 *
 * That used to be called "exact for every Integer", which it was not: `String`
 * gives up on large magnitudes and emits exponential notation, which Ruby's
 * Integer#to_s never does. Measured:
 *
 *   gem  Sum(mask: 10**21)  "∑1000000000000000000000_(a)^(b)▒〖c〗"
 *   port Sum(mask: 1e21)    "∑1e+21_(a)^(b)▒〖c〗"        before
 *
 * `BigInt` prints the double's exact integer value with no exponent, which is
 * what Ruby does with the Integer that double stands for.
 *
 * Above 2^53 that value may not be the Integer the caller meant, and no
 * formatting choice can recover it — the information is gone before this
 * function is reached. Measured: `10**30` is `"1000000000000000000000000000000"`
 * in the gem, while JS's `1e30` IS `1000000000000000019884624838656` and prints
 * as such. That is a property of the double, not of this port.
 *
 * A NON-integral number used to be refused alongside it, on the stated grounds
 * that Ruby's `Float#to_s` "cannot be derived from a JavaScript number". That
 * is true only outside a band, and the refusal made the port emit nothing where
 * the gem emits `1.5` — a divergence pointing the opposite way from every other
 * one in this file. The two agree wherever BOTH print plain shortest-round-trip
 * decimal, and Ruby's plain range is the narrower of the two: measured on the
 * oracle, Ruby switches to scientific below 1e-4, and somewhere around 1e15 at
 * the top — "at or above 1e15" is too strong, as the counterexample further
 * down shows — where JS switches below 1e-6 and at or above 1e21. Within the
 * band Ruby-plain implies JS-plain,
 * and inside that band the digits are identical — verified over 5,000 random
 * non-integral values in it, 5,000 agreements and 0 disagreements.
 *
 * Outside the band a NON-INTEGRAL value is refused, because the two formats
 * differ there: `1.5e-5` is `"1.5e-05"` in Ruby and `"0.000015"` in JS.
 *
 * `1e15` is NOT an example of that, though an earlier version of this comment
 * claimed it was. It is integral, so it never reaches the band check at all —
 * it takes the Integer arm above, and it is the undecidable case rather than a
 * refused one. Measured, the gem answers differently depending on which Ruby
 * type it was:
 *
 *   mask 1e15 (Float)               "⟡(1.0e+15&x)"
 *   mask 1000000000000000 (Integer) "⟡(1000000000000000&x)"
 *
 * and JS has one numeric type, so this cannot tell them apart. It renders the
 * Integer reading, exactly as it does for `1.0` -> `"1"`.
 *
 * The band's upper edge is deliberately CONSERVATIVE rather than exact. Ruby's
 * choice of format is not decided by magnitude: `1.5e15` prints as `"1.5e+15"`
 * while `1202471614443916.8`, at the same magnitude, prints in full. Some
 * non-integral values at or above 1e15 would therefore agree with JS and are
 * refused anyway. Refusing something that would have matched is loud and
 * recoverable; emitting something that does not is silent and is not.
 *
 * Reconstructing Ruby's scientific form from `toExponential()` — pad the
 * exponent to two digits, give the mantissa a ".0" — looks like it closes the
 * rest, and very nearly does: 3,999 of 4,000 random values outside the band.
 * It is still WRONG, because Ruby's choice of format is not decided by
 * magnitude alone. The counterexample, measured:
 *
 *   1.2024716144439168e+15  ->  ruby "1202471614443916.8"  (plain, not scientific)
 *
 * while `1.5e15` at the same decimal exponent gives "1.5e+15". Two values of
 * equal magnitude, different formats, so the rule depends on the significant
 * digits and not just the exponent. A formatter that is right 99.98% of the
 * time is a silent wrong answer once in every few thousand, which is worse here
 * than refusing — so the refusal stays until the rule is pinned rather than
 * approximated.
 *
 * `NaN` and `±Infinity` are emitted because the two agree exactly there
 * (measured: "NaN", "Infinity", "-Infinity" on both sides).
 *
 * Hash keys are assumed to be Symbols, which is what every option hash in the
 * gem's own constants uses (`{mpadded: {...}, phantom: true}`); a String key
 * would print `{"a" => 1}` instead. Recorded in TODO.plan/deferred.md rather
 * than guessed at.
 */

function rubyInspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    // One implementation of Ruby's number semantics, shared with the symbol
    // constructor in `core/nodes.ts` — see `core/ruby-semantics.ts`. Two copies
    // of these rules had already drifted apart across five review rounds.
    const printed = rubyNumberToS(value);
    if (printed !== null) return printed;

    throw new RenderError(
      `cannot interpolate the number ${String(value)} — it falls outside the range ` +
        "this port has verified Ruby's Float#to_s and JavaScript's to agree on. Some " +
        "values out here would in fact agree; the band is deliberately conservative " +
        "because Ruby's format is not decided by magnitude alone (TODO.plan/deferred.md)",
      FORMAT,
      "unknown",
    );
  }
  if (Array.isArray(value)) return `[${value.map((entry) => rubyInspect(entry)).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries.map(([key, inner]) => `${key}: ${rubyInspect(inner)}`).join(", ")}}`;
  }
  throw new RenderError(`cannot interpolate ${describeSlot(value)}`, FORMAT, "unknown");
}

/**
 * A slot the gem guards with a bare `if parameter_one` — Ruby truthiness, so
 * `nil` AND `false` contribute nothing, and anything else is sent the message.
 *
 * Distinct from both neighbours, and the distinction is measured:
 *   `Base.new(false, x).to_unicodemath`   => "_(x)"        (false is skipped)
 *   `Color.new(false, x).to_unicodemath`  !! NoMethodError (unguarded)
 *   `renderOptionalChild` (`&.`)          skips nil only, raises on false
 */
export function renderTruthyChild(value: unknown, context: RenderContext, at: string): string {
  if (!present(value)) return "";
  return renderChild(value, context, at) ?? "";
}

/**
 * `Core#class_name` — `self.class.name.split("::").last.downcase`.
 *
 * The gem gets this from reflection; the port carries the Ruby class basename
 * on the node (`UnaryFunctionInit.name`), so this is the same expression
 * evaluated against that. It is *output* here, not just control flow: the
 * unary carrier writes the name straight into the result.
 */
export function className(rubyName: string): string {
  return rubyName.slice(rubyName.lastIndexOf(":") + 1).toLowerCase();
}

/**
 * `Formula#to_unicodemath` (`formula.rb:187`) together with
 * `Formula#unicodemath_value` (`:486`) — the format's boundary pass.
 *
 * Shared by `formula` and `mrow` because `Formula::Mrow` inherits this method
 * rather than the child path, so a nested Mrow really does re-run the whole
 * boundary — safe because the gem re-runs it at the same points, NOT because
 * the entity decode is idempotent (it is not; see `htmlEntityToUnicode` above).
 */
export function formulaBoundary(node: MathNode, context: RenderContext): string | null {
  // `FormulaNode.value` and `MrowNode.value` are `NodeSequence | null` and are
  // assigned in the constructor, so they are never `undefined`: testing for it
  // was the `=== undefined` trap this file warns about elsewhere, and the guard
  // never fired. A nil value falls through to the map below, where the gem also
  // fails — `negated_value?` calls `value.last` on it. Measured, both refuse:
  //
  //   gem   Formula.new(nil).to_unicodemath  !! Math::ParseError
  //   port  FormulaNode({value: null})       !! RenderError
  //
  // Written as a nil test so the throw carries this format's own error rather
  // than a laundered TypeError from `null.map`.
  const children = (node as { readonly value?: readonly unknown[] | null }).value;
  if (children === null || children === undefined) {
    throw new RenderError(
      `${node.kind}.value is nil — the gem raises reading value.last in negated_value?`,
      FORMAT,
      node.kind,
    );
  }

  // `join_str = " " if !(negated_value? || mini_sized?)` — Ruby's `join(nil)`
  // concatenates, so a suppressed separator is the empty string, not a space.
  const separator = negatedValue(node) || miniSized(node) ? "" : " ";
  // `value&.map { |v| v.to_unicodemath(options: options) }` — the `&.` guards
  // `value`, NOT each element `v`, so a non-node element is sent the message
  // and raises. Mapping it to "" instead made this the ONLY lane that renders
  // a tree the gem refuses: the port's own parser produces exactly that tree
  // for `left(right)` (a bare `""` between Left and Right), and measured,
  //
  //   gem  to_asciimath/to_latex/to_mathml/to_unicodemath  ALL raise ParseError
  //   port asciimath/latex/mathml  throw RenderError        unicodemath  "(  )"
  //
  // which is the "more correct than the oracle" defect PORTING-STANDARDS.md
  // forbids. `renderChild` is the strict helper the other three lanes use.
  const rendered = children.map((child) => renderChild(child, context, "formula.value") ?? "");

  return squeezeSolidus(htmlEntityToUnicode(rendered.join(separator)));
}

/**
 * `is_a?(Math::Function::Power)` and `is_a?(Math::Function::Base)`, as the port
 * can ask them.
 *
 * The census aliases `Power` onto `BinaryFunction` and `PowerBase` onto
 * `TernaryFunction`, so a `Power` here is a `binaryFunction` node carrying that
 * Ruby class basename — there is no `power` kind to match on. `Base` is
 * implemented in its own right, so it is a plain kind check.
 */
export function isPower(node: unknown): boolean {
  return isNode(node) && node.kind === "binaryFunction" && node.name === "Power";
}

export function isBase(node: unknown): boolean {
  return isNode(node) && node.kind === "base";
}

/**
 * `naryand_value` — `ternary_function.rb:257`, and `nary.rb:212` byte for byte.
 *
 * The body under an n-ary operator. A `Fenced` child supplies its own
 * delimiters, so it gets the naryand mark alone; anything else is additionally
 * wrapped in white lenticular brackets.
 */
export function naryandValue(field: unknown, context: RenderContext): string {
  // `return "" unless field` — RUBY TRUTHINESS, so only nil and false
  // short-circuit; everything else is sent `to_unicodemath`, and a non-node
  // raises. Testing `!isNode(field)` swallowed that. Measured:
  //
  //   gem  Nary(∑, x, x, "s")  !! NoMethodError   port  => "&#x2211;_(x)^(x)"
  //   gem  Nary(∑, x, x, [])   !! NoMethodError   port  => "&#x2211;_(x)^(x)"
  //   gem  Nary(∑, x, x, nil)  => "&#x2211;_(x)^(x)"    and false likewise, both agree
  if (!present(field)) return "";

  const rendered = renderChild(field, context, "naryand") ?? "";
  // U+2592 MEDIUM SHADE is UnicodeMath's naryand separator.
  return isNode(field) && field.kind === "fenced" ? `▒${rendered}` : `▒〖${rendered}〗`;
}

/**
 * `sub_value` as `Int` and `Prod` define it (`int.rb:151`, `prod.rb:165` —
 * identical bodies, not shared in the gem).
 */
export function naryandSubValue(field: unknown, context: RenderContext): string {
  if (miniSized(isNode(field) ? field : undefined)) return renderOptionalChild(field, context);
  if (isBase(field)) return `_${renderOptionalChild(field, context)}`;

  return `_${unicodemathParens(field, context) ?? ""}`;
}

/**
 * `sup_value` as `Int` and `Prod` define it (`int.rb:141`, `prod.rb:155`).
 *
 * The mini-sized and prime cases emit the child *bare* — no `^` — because the
 * character itself already reads as a superscript.
 */
export function naryandSupValue(field: unknown, context: RenderContext): string {
  const node = isNode(field) ? field : undefined;
  const rendered = renderOptionalChild(field, context);
  if (miniSized(node) || primeUnicode(node)) return rendered;
  if (isPower(field)) return `^${rendered}`;

  return `^${unicodemathParens(field, context) ?? ""}`;
}

/**
 * `Core#unicodemath_field_value` (`core.rb:484-486`):
 *
 *   field.class_name == "symbol" ? field.value : Utility.hexcode_in_input(field)
 *
 * RAW PARSE-INPUT ENTITY TEXT — never the rendered glyph. Its callers compare
 * it against entity-valued constants AND interpolate it into output, so on the
 * gem side the comparison is entity-to-entity and the emitted bytes are entity
 * text.
 *
 * An earlier version had no generated parse-input table, so it decoded the
 * RENDER and looked that up, on the stated reasoning that the decode is a
 * bijection. It is not. Six classes render an ASCII shorthand rather than the
 * entity they parse from — `Dots`, `Hat`, `Paren::Langle`, `Paren::Rangle`,
 * `Slash`, `Tilde` — and ten carry no `/&#x.+;/` entry at all, where the gem
 * interpolates nil as `""` and the proxy wrote the render instead. Measured
 * over `Overset(<class>, Acute)` across all 1,460 symbol classes: the proxy
 * differed from the gem on 1,439 bare and 15 through `Formula`, and `Underset`
 * on 2. With this table, 0, 0 and 0.
 *
 * Returns null for the gem's nil. What nil DOES is the CALLER's business and
 * differs by call site: `prime_unicode?` raises on it, both `unicode_accent?`
 * answer false, and the emit paths interpolate it as `""`. That decision does
 * not belong in here.
 */
export function unicodemathFieldValue(field: NodeOf<"symbol">): string | null {
  // Typed to the symbol node because every call site narrows first, and for the
  // gem's own reason: `hexcode_in_input` sends `input` to whatever it is given,
  // so a non-symbol does not return nil here — it raises. The two callers that
  // can be handed one raise there explicitly rather than widening this.
  //
  // `class_name` is `self.class.name.split("::").last.downcase`, so only the
  // generic `Symbols::Symbol` answers "symbol" — measured across all 1,460
  // concrete classes, no basename collides and none is named `Symbol`.
  if (className(field.id) === "symbol") return field.value;
  return UNICODEMATH_HEXCODE_IN_INPUT.get(field.id) ?? null;
}

/**
 * Ruby's `Float#round`: half away from zero.
 *
 * JS `Math.round` rounds half toward +infinity, so the two disagree at exactly
 * `-x.5`. `Fenced#convert_paren_size` rounds a logarithm that is negative for
 * any paren size below 1em (`0.5em` gives -3.106), so this is reachable rather
 * than theoretical.
 */
export function rubyRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * The instances THIS walk minted, so `./renderer.ts` can pass its own
 * deliberate throw through the boundary while wrapping every other one.
 *
 * Not `instanceof`: the dual ESM/CJS build means two copies of the class
 * exist, and the class is constructible by the caller too — a hostile getter
 * can mint a `MissingSymbolDataError` naming a real missing id and throw it
 * mid-render, which is an input failure, not a symbol-table miss. Membership
 * in this set is the only thing that separates them. (An error this walk
 * minted, that a getter caught and re-threw, is still the walk's own throw
 * carrying exactly the report it was minted with — it passes through, as on
 * the latex path.)
 *
 * The set lives here because this file is the one module both sides may
 * import (§3 rule 8): the throw site is `../../render/symbol/unicodemath.ts`
 * and the boundary is `./renderer.ts`. Core cannot hold it — `src/index.ts`
 * star-re-exports the core barrel, so a factory there would land on the
 * public surface. A `WeakSet` never serializes, never widens the public error
 * type, and holds weakly, so a caught-and-dropped error stays collectable.
 */
const OWN_MISSING_SYMBOL_ERRORS = new WeakSet<MissingSymbolDataError>();

/** The symbol table's one deliberate non-RenderError throw, recorded as our own. */
export function missingSymbol(symbolId: string): MissingSymbolDataError {
  const error = new MissingSymbolDataError(symbolId, FORMAT);
  OWN_MISSING_SYMBOL_ERRORS.add(error);
  return error;
}

/** Membership in the factory's set — shape and prototype prove nothing here. */
export function isOwnMissingSymbolDataError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    OWN_MISSING_SYMBOL_ERRORS.has(error as MissingSymbolDataError)
  );
}

export function missingRenderer(kind: string, at: string): RenderError {
  // `RenderError` carries `format` and `kind` as fields, not just in the
  // message: ARCHITECTURE.md §5 makes them part of the error contract, so a
  // caller can branch on the kind without parsing prose.
  return new RenderError(`${at}: no unicodemath renderer for kind "${kind}"`, FORMAT, kind);
}
