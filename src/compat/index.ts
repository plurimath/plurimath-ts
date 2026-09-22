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
   * `Formula#to_display`, which the port does not have.
   *
   * Not a thin wrapper over the renderers: the gem defines a per-format
   * `to_<format>_math_zone` on each node class — 16, 16, 16, 17 and 16
   * definitions across the five `MATH_ZONE_TYPES` — so this is its own port,
   * not a switch. It raises rather than approximate one.
   */
  toDisplay(_lang: string): string {
    throw new UnsupportedFeatureError(
      "toDisplay",
      "the per-format math-zone renderers it needs are not ported",
    );
  }

  toUnicodemath(): string {
    return toUnicodemath(this.data);
  }
}
