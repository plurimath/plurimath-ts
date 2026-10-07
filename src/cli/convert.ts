/**
 * The CLI's conversion core: format tokens and the function that drives them
 * through the compat `Plurimath` class (`src/compat/index.ts`).
 *
 * Only formats that actually work today are listed (ARCHITECTURE.md §4,
 * `feature-roadmap.md`'s input-format table): the compat constructor's
 * `PARSERS` map registers `asciimath`, `latex`, `html` and `unicode` (its
 * name for UnicodeMath), so those four are the CLI's input formats.
 * `mathml`/`omml`/`unitsml` input do not parse and are deliberately absent.
 * Every compat `to<Format>()` method works, so all six are output formats.
 *
 * CLI format tokens use each format's own directory name under `src/formats`
 * (`unicodemath`, not the compat class's ABI-frozen `unicode`) because the
 * CLI is a fresh surface with no ABI to preserve, and `unicodemath` is what
 * every other doc in this repository calls the format.
 */

import Plurimath, { type Format as CompatFormat } from "../compat/index";
import { mathmlWithOptions, ommlWithOptions } from "../compat/render-options";

export const INPUT_FORMATS = ["asciimath", "latex", "html", "unicodemath"] as const;
export type InputFormat = (typeof INPUT_FORMATS)[number];

export const OUTPUT_FORMATS = [
  "asciimath",
  "latex",
  "mathml",
  "html",
  "unicodemath",
  "omml",
] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export function isInputFormat(value: string): value is InputFormat {
  return (INPUT_FORMATS as readonly string[]).includes(value);
}

export function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value);
}

const TO_COMPAT_INPUT_FORMAT: Record<InputFormat, CompatFormat> = {
  asciimath: "asciimath",
  latex: "latex",
  html: "html",
  unicodemath: "unicode",
};

/**
 * The render options the CLI exposes. Each is what one flag sets
 * (`./args.ts`); an absent field is an absent flag.
 */
export interface RenderOptions {
  /** `--display-style <true|false>`; MathML and OMML only. */
  readonly displayStyle?: boolean;
  /** `--split-on-linebreak`; MathML and OMML only. */
  readonly splitOnLinebreak?: boolean;
  /** `--intent`; MathML only. */
  readonly intent?: boolean;
  /** `--math-rendering`: print the `toDisplay` tree instead of the output. */
  readonly mathRendering?: boolean;
}

/**
 * The options the gem's `plurimath convert` passes to `to_mathml`/`to_omml`
 * (`lib/plurimath/cli.rb`): `display_style` is always given, and is "true"
 * unless the flag says otherwise, so an absent `--display-style` is `true`
 * here too rather than the formula's own default.
 */
function xmlOptions(options: RenderOptions): {
  readonly displayStyle: boolean;
  readonly splitOnLinebreak?: true;
} {
  return {
    displayStyle: options.displayStyle ?? true,
    ...(options.splitOnLinebreak === true ? { splitOnLinebreak: true } : {}),
  };
}

const RENDER: Record<OutputFormat, (formula: Plurimath, options: RenderOptions) => string> = {
  asciimath: (formula) => formula.toAsciimath(),
  latex: (formula) => formula.toLatex(),
  mathml: (formula, options) =>
    mathmlWithOptions(formula, {
      ...xmlOptions(options),
      ...(options.intent === true ? { intent: true } : {}),
    }),
  html: (formula) => formula.toHtml(),
  unicodemath: (formula) => formula.toUnicodemath(),
  omml: (formula, options) => ommlWithOptions(formula, xmlOptions(options)),
};

/**
 * Parses `input` as `from` and renders it as `to`. Throws whatever the
 * underlying parser/renderer throws (`PlurimathError` subclasses from
 * `src/core/errors.ts`) — the CLI layer adds no error wrapping of its own.
 *
 * As in the gem's command, `mathRendering` returns the display tree before
 * any other option is read, and `displayStyle`/`splitOnLinebreak` are
 * ignored by the text formats. The display tree has no `html` form; asking
 * for one throws the compat class's `UnsupportedFormatError`.
 */
export function convert(
  input: string,
  from: InputFormat,
  to: OutputFormat,
  options: RenderOptions = {},
): string {
  const formula = new Plurimath(input, TO_COMPAT_INPUT_FORMAT[from]);
  if (options.mathRendering === true) return formula.toDisplay(to);
  return RENDER[to](formula, options);
}
