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
import { buildTreeDump, type DisplayFormat } from "./to-display";

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
   * class reaches it: `this.data.$to_display(lang)` compiled and RUN through
   * Opal (`plurimath-js/src/index.ts:31-33`), not native Ruby.
   *
   * A prior version of this method believed a Ruby String could never match
   * `case type; when :asciimath ...` (`Symbol#===` on a String is `false` in
   * native MRI), so it always returned the bare placeholder. That is correct
   * for native MRI and WRONG for Opal, MEASURED (not read from source) by
   * compiling the exact `case`/`when` shape from `formula.rb:203-215` with
   * the same Opal version `plurimath-js` pins (1.8.3, `vendor/opal` at
   * `6b4253a`) and RUNNING the compiled JS with Node — a standalone
   * extraction rather than the full gem, because compiling the full gem
   * through `plurimath-js/build.sh` (its entire dependency graph:
   * lutaml-model, unitsml, omml, oga, parslet) did not finish inside this
   * task's time budget; the dispatch mechanism a bare `case`/`when` compiles
   * to does not depend on anything else in the file, so the extraction is
   * sound (`./to-display.ts`'s module doc has the full account, the
   * compiled JS excerpt, and the checked-in reproduction script). Measured:
   *
   *   probe.$to_display("latex")      // => "|_ Math zone\nLATEX-MATCHED"  (real dispatch)
   *   probe.$to_display("LATEX")      // => "|_ Math zone\n"               (no arm matches)
   *   probe.$to_display("Asciimath")  // => "|_ Math zone\n"               (no arm matches)
   *
   * So: a LOWERCASE valid name reaches the real per-node
   * `to_<format>_math_zone` tree dump (`./to-display.ts`, ported from the
   * gem's 17 math_zone files and cross-checked against the pinned oracle
   * calling `to_display` with a real Symbol — proven equivalent to Opal's
   * lowercase-string path by the measurement above). An UPPERCASE or
   * MIXED-CASE valid name is still accepted by the type-validity check
   * (which downcases before checking membership) but matches no `case` arm,
   * so it falls through to the bare `"|_ Math zone\n"` placeholder — content
   * independent, because no renderer ever runs on that path.
   *
   * `UnsupportedFormatError`, not `UnsupportedFeatureError`, for a bad
   * `lang`: this is a token rejected for not being one of a fixed set,
   * exactly what that error already means for the constructor's `format`
   * (`PARSERS` above) -- message text is not API (`core/errors.ts:1-8`), so
   * reusing it costs nothing and keeps the error taxonomy to two axes:
   * format-token validation, and no-parser-yet.
   */
  toDisplay(lang: string): string {
    const lower = lang.toLowerCase();
    if (!DISPLAY_TYPES.includes(lower)) {
      throw new UnsupportedFormatError(lang);
    }
    if (lang !== lower) return "|_ Math zone\n";
    return buildTreeDump(this.data, lower as DisplayFormat);
  }

  toUnicodemath(): string {
    return toUnicodemath(this.data);
  }
}
