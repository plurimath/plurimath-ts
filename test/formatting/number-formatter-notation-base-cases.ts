/**
 * Notation x base cases measured on the pinned oracle (`~/ruby_gems/plurimath-oracle`
 * at 00c52783, v0.11.6), one row per `(value, formatter)`:
 * `[value, formatter, text, mathml]`.
 *
 * The command, per row (the formatter's options are the snake_case spelling of
 * the camelCase keys below; `hexCapital: "numbers_only"` is a String):
 *
 *   BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x -- bundle exec ruby -e '
 *     require "plurimath"
 *     f  = Plurimath::Formatter::Standard.new(locale: "en", options: OPTIONS, precision: PRECISION)
 *     fo = Plurimath::Math::Formula.new([Plurimath::Math::Number.new(VALUE)])
 *     puts fo.to_asciimath(formatter: f), fo.to_latex(formatter: f), fo.to_html(formatter: f),
 *          fo.to_unicodemath(formatter: f), fo.to_mathml(formatter: f)'
 *
 * Every row answered one identical string for asciimath, latex, html and
 * unicodemath (`text`): a notation never takes a semantic base's template, it
 * is `FormattedNotation#to_s` with the coefficient's literal prefix and
 * postfix. `mathml` is the inside of `<mstyle displaystyle="true">`,
 * whitespace between tags removed. The coefficient's digits are found in base
 * 10 and then converted as the gem's `format_parts` converts them, which is why
 * `255` under `notation: "e", base: 16` is `0x2.8ce2` (the gem's own answer,
 * mirrored byte for byte).
 */

import type { FormatterOptions } from "../../src/formatting/index";

// biome-ignore format: one measured row per line, the layout the oracle output was pasted in
export const NOTATION_BASE_MEASURED: ReadonlyArray<
  readonly [string, FormatterOptions, string, string]
> = [
  ["255", {"options": {"notation": "e", "base": 16}}, "0x2.8ce2", "<mn>0x2.8ce2</mn>"],
  ["255", {"options": {"notation": "scientific", "base": 16}}, "0x2.8c x 10^2", "<mrow><mn>0x2.8c</mn><mo>x</mo><msup><mn>10</mn><mn>2</mn></msup></mrow>"],
  ["255", {"options": {"notation": "engineering", "base": 16}}, "0xff x 10^0", "<mrow><mn>0xff</mn><mo>x</mo><msup><mn>10</mn><mn>0</mn></msup></mrow>"],
  ["-255.5", {"options": {"notation": "e", "base": 2}}, "-0b10.100e2", "<mn>-0b10.100e2</mn>"],
  ["1234.5", {"options": {"notation": "scientific", "base": 8}}, "0o1.170'0 x 10^3", "<mrow><mn>0o1.170'0</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["1234.5", {"options": {"notation": "scientific", "base": 16, "basePrefix": ""}}, "1.3c0'8 x 10^3", "<mrow><mn>1.3c0'8</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["1234.5", {"options": {"notation": "scientific", "base": 16, "basePostfix": "h"}}, "1.3c0'8h x 10^3", "<mrow><mn>1.3c0'8h</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["1234.5", {"options": {"notation": "e", "base": 16, "basePrefix": "#", "basePostfix": "!"}}, "#1.3c0'8!e3", "<mn>#1.3c0'8!e3</mn>"],
  ["48879.75", {"options": {"notation": "scientific", "base": 16, "hexCapital": true}}, "0x4.E35'254 x 10^4", "<mrow><mn>0x4.E35'254</mn><mo>x</mo><msup><mn>10</mn><mn>4</mn></msup></mrow>"],
  ["48879.75", {"options": {"notation": "scientific", "base": 16, "hexCapital": "numbers_only"}}, "0x4.E35'254 x 10^4", "<mrow><mn>0x4.E35'254</mn><mo>x</mo><msup><mn>10</mn><mn>4</mn></msup></mrow>"],
  ["48879.75", {"options": {"notation": "e", "base": 16, "hexCapital": true, "e": "E", "exponentSign": "plus"}}, "0x4.E35'254E+4", "<mn>0x4.E35'254E+4</mn>"],
  ["1234.5", {"options": {"notation": "scientific", "base": 16, "times": "*"}, "precision": 3}, "0x1.3c0 * 10^3", "<mrow><mn>0x1.3c0</mn><mo>*</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["1234.5", {"options": {"notation": "engineering", "base": 2}, "precision": 4}, "0b1.001'1 x 10^3", "<mrow><mn>0b1.001'1</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["123456.789", {"options": {"notation": "engineering", "base": 16}}, "0x7b.74f'01f x 10^3", "<mrow><mn>0x7b.74f'01f</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["123456.789", {"options": {"notation": "engineering", "base": 16, "significant": 4}}, "0x7b.74 x 10^3", "<mrow><mn>0x7b.74</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["123456.789", {"options": {"notation": "scientific", "base": 16, "significant": 4}}, "0x1.3 x 10^5", "<mrow><mn>0x1.3</mn><mo>x</mo><msup><mn>10</mn><mn>5</mn></msup></mrow>"],
  ["123456.789", {"options": {"notation": "scientific", "base": 16, "significant": 8}}, "0x1.3c0'c x 10^5", "<mrow><mn>0x1.3c0'c</mn><mo>x</mo><msup><mn>10</mn><mn>5</mn></msup></mrow>"],
  ["0.0123", {"options": {"notation": "scientific", "base": 16}}, "0x1.3a x 10^-2", "<mrow><mn>0x1.3a</mn><mo>x</mo><msup><mn>10</mn><mn>-2</mn></msup></mrow>"],
  ["0.0123", {"options": {"notation": "scientific", "base": 16, "significant": 3}}, "0x1.3b x 10^-2", "<mrow><mn>0x1.3b</mn><mo>x</mo><msup><mn>10</mn><mn>-2</mn></msup></mrow>"],
  ["0.0123", {"options": {"notation": "e", "base": 8, "digitCount": 5}}, "0o1.165'6e-2", "<mn>0o1.165'6e-2</mn>"],
  ["0.0123", {"options": {"notation": "engineering", "base": 8, "digitCount": 5}}, "0o14.231 x 10^-3", "<mrow><mn>0o14.231</mn><mo>x</mo><msup><mn>10</mn><mn>-3</mn></msup></mrow>"],
  ["0", {"options": {"notation": "scientific", "base": 16}}, "0x0 x 10^0", "<mrow><mn>0x0</mn><mo>x</mo><msup><mn>10</mn><mn>0</mn></msup></mrow>"],
  ["0", {"options": {"notation": "engineering", "base": 2, "significant": 3}}, "0b0 x 10^0", "<mrow><mn>0b0</mn><mo>x</mo><msup><mn>10</mn><mn>0</mn></msup></mrow>"],
  ["0.5", {"options": {"notation": "scientific", "base": 2}}, "0b101 x 10^-1", "<mrow><mn>0b101</mn><mo>x</mo><msup><mn>10</mn><mn>-1</mn></msup></mrow>"],
  ["-0.5", {"options": {"notation": "e", "base": 2, "numberSign": "plus"}}, "-0b101e-1", "<mn>-0b101e-1</mn>"],
  ["4096", {"options": {"notation": "scientific", "base": 16, "numberSign": "plus"}}, "+0x4.189 x 10^3", "<mrow><mn>+0x4.189</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["4096", {"options": {"notation": "scientific", "base": 10, "basePrefix": "x"}}, "4.096 x 10^3", "<mrow><mn>4.096</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["1234.5", {"options": {"notation": "scientific", "base": 16, "significant": 4}, "precision": 2}, "0x1.3c x 10^3", "<mrow><mn>0x1.3c</mn><mo>x</mo><msup><mn>10</mn><mn>3</mn></msup></mrow>"],
  ["1234567", {"options": {"notation": "scientific", "base": 16, "precision": 1}}, "0x1.3 x 10^6", "<mrow><mn>0x1.3</mn><mo>x</mo><msup><mn>10</mn><mn>6</mn></msup></mrow>"],
  ["1234567", {"options": {"notation": "engineering", "base": 8, "groupDigits": 2, "group": "_"}}, "0o1.170'062 x 10^6", "<mrow><mn>0o1.170'062</mn><mo>x</mo><msup><mn>10</mn><mn>6</mn></msup></mrow>"],
  ["1234567.891", {"options": {"notation": "scientific", "base": 2, "fractionGroupDigits": 4, "fractionGroup": " "}, "precision": 12}, "0b1.0011 1100 0000 x 10^6", "<mrow><mn>0b1.0011 1100 0000</mn><mo>x</mo><msup><mn>10</mn><mn>6</mn></msup></mrow>"],
  ["99999", {"options": {"notation": "scientific", "base": 16, "basePrefix": "0x", "decimal": ","}}, "0x9,fff'9 x 10^4", "<mrow><mn>0x9,fff'9</mn><mo>x</mo><msup><mn>10</mn><mn>4</mn></msup></mrow>"],
];

/** `[formatter, the gem's root cause]`: the gem raises, wrapped in `ParseError` by `Formula#to_*`. */
// biome-ignore format: one measured row per line
export const NOTATION_BASE_REFUSED: ReadonlyArray<readonly [unknown, string]> = [
  [{"options": {"notation": "scientific", "base": 3}}, "Plurimath::Errors::UnsupportedBase"],
  [{"options": {"notation": "scientific", "base": 16, "hexCapital": 1}}, "Plurimath::ConfigurationError"],
];
