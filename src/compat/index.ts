/**
 * The frozen `plurimath-js` compatibility surface (ARCHITECTURE.md §4).
 *
 * One engine, two doors: this class is a thin set of delegations to the
 * per-format functions, so there is no second implementation to keep in step.
 * It exists because `@plurimath/plurimath` consumers construct an object and
 * call methods on it, and that shape has to survive the port.
 *
 * The surface is taken from plurimath-js SOURCE HEAD `ce297e2`
 * (`src/index.ts`), not from the published `0.2.2` artifact. Settled
 * 2026-09-04: this package has published nothing, so it carries no
 * compatibility debt to any consumer and no reason to inherit the published
 * declaration's `mahtml` misspelling, which exists only in a TypeScript type
 * and so is compile-time only. Consequences, all measured against `ce297e2`:
 * seven methods rather than six, `toMathml(intent?)` rather than
 * `toMathml()`, and `unicode` rather than `mahtml` in the format union.
 *
 * It is METHOD-exact, not OBJECT-exact, and deliberately so. The published
 * class exposes a writable `data` holding an Opal `ParserResult`, a runtime
 * value this port cannot reproduce. `data` here is a `readonly FormulaNode`:
 * same property name, this port's model behind it. A consumer that READS it
 * gets something meaningful; one that WRITES it was broken by either choice.
 */

import { type FormulaNode, UnsupportedFeatureError, UnsupportedFormatError } from "../core/index";
import { parseAsciimath, toAsciimath } from "../formats/asciimath/index";
import { parseHtml, toHtml } from "../formats/html/index";
import { parseLatex, toLatex } from "../formats/latex/index";
import { toMathml } from "../formats/mathml/index";
import { toOmml } from "../formats/omml/renderer";
import { parseUnicodemath, toUnicodemath } from "../formats/unicodemath/index";

/**
 * The input formats the published constructor accepts.
 *
 * `unicode`, not `unicodemath`: that is the gem's own spelling in
 * `Math::VALID_TYPES`, which the wrapper mirrors. The published `0.2.2`
 * declaration says `mahtml` where this says `unicode`; see the note above for
 * why this port follows source head instead.
 */
export type Format = "asciimath" | "latex" | "mathml" | "html" | "unicode" | "omml";

/** Every format the constructor names, in the union's own order. */
export const FORMATS: readonly Format[] = [
  "asciimath",
  "latex",
  "mathml",
  "html",
  "unicode",
  "omml",
] as const;

/**
 * The parser each input format uses, keyed by format.
 *
 * `mathml` and `omml` are still absent, and their constructor raises
 * `UnsupportedFormatError`. `html` and `unicode` are now registered, each
 * on the strength of a checked-in, oracle-verified battery — not prose, not
 * a one-off measurement — that follows the same shape
 * (`scripts/battery-*-fixtures.rb` generates recorded oracle models, and a
 * `test/compat/*-battery.spec.ts` compares the port against them, with
 * provenance checks on the oracle commit and the generator script's hash):
 *
 *   - `html`: `test/compat/html-battery.spec.ts`, 50/50 hand-typed inputs
 *     parsed to an exact match against the oracle.
 *   - `unicode`: `test/compat/unicodemath-battery.spec.ts`,
 *     `test/compat/unicodemath-battery-fixtures.json`, 47/49 hand-typed
 *     inputs parsed to an exact match (the 50th is a shared refusal both the
 *     port and the gem raise on), with two documented `KNOWN_PORT_GAPS`
 *     where the oracle parses but the 140-rule transform slice does not yet
 *     carry the needed rule family: chained interpunct multiplication
 *     (`a·b·c`) and primed function application (`f'(x)`). Both gaps raise
 *     `ParseError` rather than return a wrong model, so the divergence is a
 *     refusal gap, not a silent one.
 *
 * A partial parser behind this constructor is worse than an absent one, so
 * registration follows the same rule that kept `unicode` out before this
 * battery existed: a format listed here should answer what the gem answers,
 * or say up front (via `ParseError`/`UnsupportedFeatureError`, not a wrong
 * model) that it cannot. Both batteries measured zero silent divergences.
 *
 * A MAP rather than a set of parseable names, so that `format` actually selects
 * the parser. With a set, adding a name would have made that format construct
 * and then silently AsciiMath-parse its input -- measured, `"\\frac{1}{2}"`
 * came back as `"\\backslash \\frac{1}{2}"` rather than raising.
 */
const PARSERS: Partial<Record<Format, (input: string) => FormulaNode>> = {
  asciimath: parseAsciimath,
  latex: parseLatex,
  html: parseHtml,
  unicode: parseUnicodemath,
};

/**
 * The gem's `Formula::MATH_ZONE_TYPES` (`math/formula.rb:16`), downcased for
 * the case-insensitive comparison `to_display` itself does
 * (`type.downcase.to_sym`, `math/formula.rb:205`). Note this is `unicodemath`,
 * not `unicode` -- `to_display`'s type token is the gem's own spelling, not
 * this class's constructor `Format`.
 */
const DISPLAY_TYPES: readonly string[] = ["omml", "latex", "mathml", "asciimath", "unicodemath"];

export default class Plurimath {
  /**
   * The parsed formula.
   *
   * `readonly` at runtime, not only to TypeScript: it is installed with
   * `writable: false`, so a JavaScript consumer -- the majority, for a class
   * whose reason to exist is plurimath-js compatibility -- gets the guarantee
   * too. A bare `readonly` field would not have: reassigning it changes what
   * every later method renders, exactly as it does in the published class.
   *
   * The guarantee is that the value does not change, not that assigning throws.
   * Assignment to a non-writable property raises `TypeError` in strict mode and
   * fails silently in sloppy mode, and this package ships CJS, so a `require()`
   * consumer may well be in the latter. Either way `data` keeps its value.
   *
   * The object it holds is NOT deep-frozen. Mutating the tree through `data`
   * still changes later renders; the port's nodes are immutable by convention
   * and compile-time `readonly`, not by `Object.freeze` (ARCHITECTURE.md §5).
   */
  declare readonly data: FormulaNode;

  constructor(data: string, format: Format) {
    const parse = PARSERS[format];
    if (parse === undefined) throw new UnsupportedFormatError(format);
    Object.defineProperty(this, "data", {
      value: parse(data),
      writable: false,
      enumerable: true,
    });
  }

  toAsciimath(): string {
    return toAsciimath(this.data);
  }

  toLatex(): string {
    return toLatex(this.data);
  }

  /**
   * `intent` defaults to false, as the wrapper's own signature does.
   *
   * The false path delegates with no options at all, which is exact:
   * measured on the pinned oracle, `to_mathml(intent: false)` is
   * byte-identical to `to_mathml` with no keyword. The true path is the
   * renderer's `intent: true` (B4), which is the gem's pipeline; a tree it
   * raises on (a lone `UpcaseDd`, among others) raises `RenderError` here as
   * the gem's `ParseError` does there.
   */
  toMathml(intent: boolean = false): string {
    return intent ? toMathml(this.data, { intent: true }) : toMathml(this.data);
  }

  toHtml(): string {
    return toHtml(this.data);
  }

  toOmml(): string {
    return toOmml(this.data);
  }

  /**
   * `Formula#to_display` (`math/formula.rb:197-237`), reached the way THIS
   * class reaches it, not the way a Ruby caller would.
   *
   * The gem dispatches on `type` with `case type; when :asciimath ... when
   * :latex ...` -- a SYMBOL comparison, `Symbol#===`. `plurimath-js`'s own
   * `toDisplay(lang: string)` (`plurimath-js/src/index.ts:31-33`) calls
   * `this.data.$to_display(lang)`, and Opal always crosses a JS string as a
   * Ruby STRING, never a Symbol. `Symbol#===` on a String is `false`, so
   * every `when` branch fails to match and the `case` evaluates to `nil` --
   * none of the `to_<format>_math_zone` methods defined across the 17 node
   * classes for exactly this purpose is ever reached from a String argument.
   *
   * Measured directly on the pinned oracle, calling `to_display` the same
   * way (a Ruby String, exactly what Opal hands across):
   *
   *   f = Plurimath::Math::Formula.new([])
   *   f.to_display("latex")     # => "|_ Math zone\n"
   *   f.to_display("LATEX")     # => "|_ Math zone\n" (case-insensitive)
   *   f.to_display("asciimath") # => "|_ Math zone\n"
   *   f.to_display("html")      # raises InvalidTypeError: not a MATH_ZONE_TYPE
   *   f.to_display("unicode")   # raises InvalidTypeError: needs "unicodemath"
   *   f.to_display(nil)         # raises NoMethodError (undefined `downcase`)
   *
   * Repeated on `Plurimath::Asciimath.new("frac(1)(2)").to_formula` and on an
   * EMPTY formula: identical `"|_ Math zone\n"` either way, because no
   * renderer runs on this path at all -- the formula's content is never
   * inspected. So this is not the 17-file port this method once (correctly,
   * for a Ruby caller) said it was refusing. Reached the way this class's
   * `string`-typed signature reaches it, `to_display` is a literal constant
   * gated by a five-name allow-list; the tree-dump behavior exists only for a
   * caller able to pass a Ruby Symbol, which this surface cannot produce.
   *
   * `UnsupportedFormatError`, not `UnsupportedFeatureError`, for a bad `lang`:
   * this is a token rejected for not being one of a fixed set, exactly what
   * that error already means for the constructor's `format` (`PARSERS`
   * above) -- message text is not API (`core/errors.ts:1-8`), so reusing it
   * costs nothing and keeps the error taxonomy to two axes: format-token
   * validation, and no-parser-yet.
   */
  toDisplay(lang: string): string {
    if (!DISPLAY_TYPES.includes(lang.toLowerCase())) {
      throw new UnsupportedFormatError(lang);
    }
    return "|_ Math zone\n";
  }

  toUnicodemath(): string {
    return toUnicodemath(this.data);
  }
}
