/**
 * `Formatter::Numbers::TextRenderer` (`text_renderer.rb`) — a `FormattedNumber`
 * as the text of one of the four plain-text targets. A number with no base
 * notation, and one whose caller gave a `base_prefix` or `base_postfix`
 * (`literal?`), is just `FormattedNumber#to_s`; a non-default base with
 * neither affix (`semantic?`) takes the target's own template, so the digits
 * and the base stay distinguishable (`ff_(16)`, `\mathrm{ff}_{16}`).
 *
 * MathML draws the same semantic form as `<msub>` (`render/number/mathml.ts`);
 * `semanticBaseParts` is what it reads.
 */

import { isSemanticBase } from "./base-notation";
import {
  digitsString,
  type FormattedNumber,
  formattedNumberText,
  hasBaseNotation,
  signText,
} from "./formatted-number";

/** The targets `TextRenderer::BASE_TEMPLATES` has a template for. */
export type TextTarget = "asciimath" | "unicodemath" | "latex" | "html";

/** `TextRenderer::BASE_TEMPLATES`, as functions of the sign, digits and base. */
const BASE_TEMPLATES: Readonly<
  Record<TextTarget, (sign: string, digits: string, base: number) => string>
> = {
  asciimath: (sign, digits, base) => `${sign}${digits}_(${base})`,
  unicodemath: (sign, digits, base) => `${sign}${digits}_(${base})`,
  latex: (sign, digits, base) => `${sign}\\mathrm{${digits}}_{${base}}`,
  html: (sign, digits, base) => `${sign}${digits}<sub>${base}</sub>`,
};

/** `TextRenderer.render`. */
export function renderNumberText(number: FormattedNumber, target: TextTarget): string {
  if (!hasBaseNotation(number) || !isSemanticBase(number.baseNotation)) {
    return formattedNumberText(number);
  }
  return BASE_TEMPLATES[target](
    signText(number) ?? "",
    digitsString(number),
    number.baseNotation.base,
  );
}

/**
 * What `MathmlRenderer.render_semantic_base` draws: the sign (or `null`), the
 * digits and the base — or `null` when the number is not a semantic base and
 * renders as the plain `<mn>` of its `to_s`.
 */
export function semanticBaseParts(
  number: FormattedNumber,
): { readonly sign: string | null; readonly digits: string; readonly base: number } | null {
  if (!isSemanticBase(number.baseNotation)) return null;
  return {
    sign: signText(number),
    digits: digitsString(number),
    base: number.baseNotation.base,
  };
}
