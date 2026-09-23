/**
 * `stringFormat` (the gem's `string_format:`) cases measured on the pinned
 * oracle (`~/ruby_gems/plurimath-oracle` at 00c52783, v0.11.6), one row per
 * `(value, formatter)`. Each row is `[value, formatter, expected]`.
 *
 * The command, per row (the formatter's options are the snake_case spelling of
 * the camelCase keys below; `notation` is passed as a Symbol):
 *
 *   BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x -- bundle exec ruby -e '
 *     require "plurimath"
 *     f  = Plurimath::Formatter::Standard.new(locale: LOCALE, options: OPTIONS,
 *                                             string_format: STRING_FORMAT, precision: PRECISION)
 *     fo = Plurimath::Math::Formula.new([Plurimath::Math::Number.new(VALUE)])
 *     puts fo.to_asciimath(formatter: f), fo.to_latex(formatter: f), fo.to_html(formatter: f),
 *          fo.to_unicodemath(formatter: f), fo.to_mathml(formatter: f), fo.to_omml(formatter: f)'
 *
 * The templates cover matching and non-matching spellings, every separator
 * position filled with edge characters (`\r`, tab, U+2028/U+2029, U+00A0,
 * U+2009, astral and emoji characters, a combining mark, regex-special
 * characters), templates holding several candidate matches (only the first
 * counts), and a matching template combined with locale, explicit symbols,
 * precision, significant digits, digit count, padding, sign, each notation and
 * semantic and prefixed bases.
 *
 * `expected` is one string when the four text targets all answer it, MathML
 * answers `<mn>` of it and OMML `<m:r><m:t>` of it. Otherwise `expected` holds
 * the six answers: `mathml` is the inside of `<mstyle displaystyle="true">`
 * and `omml` the inside of `<m:oMath>`, whitespace between tags removed.
 */

import type { FormatterOptions } from "../../src/formatting/index";

export interface PerTarget {
  readonly asciimath: string;
  readonly latex: string;
  readonly html: string;
  readonly unicodemath: string;
  readonly mathml: string;
  readonly omml: string;
}

// biome-ignore format: one measured row per line, the layout the oracle output was generated in
export const MEASURED: ReadonlyArray<readonly [string, FormatterOptions, string | PerTarget]> = [
  ["1234567.1234567", { stringFormat: "#,##0.00" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#,##0.###" }, "1,234,567.1234567"],
  ["1234567.1234567", { stringFormat: "##0.#" }, "1234567.1234567"],
  ["1234567.1234567", { stringFormat: "#0.#" }, "1234567.1234567"],
  ["1234567.1234567", { stringFormat: "#,##0.## #" }, "1,234,567.12\u00a034\u00a056\u00a07"],
  ["1234567.1234567", { stringFormat: "# ##0,### #" }, "1\u00a0234\u00a0567,123\u00a0456\u00a07"],
  ["1234567.1234567", { stringFormat: "#.###,##" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#.##0,##" }, "1.234.567,1234567"],
  ["1234567.1234567", { stringFormat: "0.00" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#,###.##" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#,##0" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "abc#,##0.###'xyz" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#,##0.00;#,##0.00" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "##,##0.0#" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "##0.##_#" }, "1234567.12_34_56_7"],
  ["1234567.1234567", { stringFormat: "#\u00a0##0.##" }, "1\u00a0234\u00a0567.1234567"],
  ["1234567.1234567", { stringFormat: "#,##0.###\u2009#" }, "1,234,567.123\u2009456\u20097"],
  ["1234567.1234567", { stringFormat: "#,##0\n###" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#,##0\r###" }, "1,234,567\r1234567"],
  ["1234567.1234567", { stringFormat: "" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#0##0.##" }, "1234567#1020304050607"],
  ["1234567.1234567", { stringFormat: "ab##0.##cd" }, "1b234b567.12c34c56c7"],
  ["1234567.1234567", { stringFormat: "\ud83d\ude00##0\ud83d\ude01##\ud83d\ude02" }, "1\ud83d\ude00234\ud83d\ude00567\ud83d\ude0112\ud83d\ude0234\ud83d\ude0256\ud83d\ude027"],
  ["1234567.1234567", { stringFormat: "##0\t##" }, "1234567\t1234567"],
  ["1234567.1234567", { stringFormat: "##0\u2028##" }, "1234567\u20281234567"],
  ["1234567.1234567", { stringFormat: "#,#0.#" }, "1,23,45,67.1234567"],
  ["1234567.1234567", { stringFormat: "#,#####0.#######-" }, "1,234567.1234567"],
  ["1234567.1234567", { stringFormat: "0##0.##" }, "102340567.1234567"],
  ["1234567.1234567", { stringFormat: "##0.##0" }, "1234567.1203405607"],
  ["1234567.1234567", { stringFormat: "#" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "0" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#0" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: ".##" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#0." }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#0.0" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "0.#" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "##0.##;##0.##" }, "1234567.12;34;56;7"],
  ["1234567.1234567", { stringFormat: "#,##0.##|#,##0.#" }, "1,234,567.12|34|56|7"],
  ["1234567.1234567", { stringFormat: "x#,##0.## #y#.##0,##z" }, "1,234,567.12\u00a034\u00a056\u00a07"],
  ["1234567.1234567", { stringFormat: "#.##0,##  #" }, "1.234.567,12\u00a034\u00a056\u00a07"],
  ["1234567.1234567", { stringFormat: "##0..##" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "##0.#.#" }, "1234567.1.2.3.4.5.6.7"],
  ["1234567.1234567", { stringFormat: "##0 ## " }, "1234567 12\u00a034\u00a056\u00a07"],
  ["1234567.1234567", { stringFormat: "##0\u0301##" }, "1234567\u03011234567"],
  ["1234567.1234567", { stringFormat: "#\u0301##0.##" }, "1\u0301234\u0301567.1234567"],
  ["1234567.1234567", { stringFormat: ",#0.## " }, "1,23,45,67.12\u00a034\u00a056\u00a07"],
  ["1234567.1234567", { stringFormat: "'##0_###-" }, "1'234'567_123-456-7"],
  ["1234567.1234567", { stringFormat: "\u00a0###0\u2009####\t" }, "123\u00a04567\u20091234\t567"],
  ["1234567.1234567", { stringFormat: "\r#0\u2028#\u2029" }, "1\r23\r45\r67\u20281\u20292\u20293\u20294\u20295\u20296\u20297"],
  ["1234567.1234567", { stringFormat: "\ud83d\ude00##0\ud835\udfd8##*" }, "1\ud83d\ude00234\ud83d\ude00567\ud835\udfd812*34*56*7"],
  ["1234567.1234567", { stringFormat: "+###0?###(" }, "123+4567?123(456(7"],
  ["1234567.1234567", { stringFormat: ")#0[####]" }, "1)23)45)67[1234]567"],
  ["1234567.1234567", { stringFormat: "{##0}#|" }, "1{234{567}1|2|3|4|5|6|7"],
  ["1234567.1234567", { stringFormat: "^###0$##\\" }, "123^4567$12\\34\\56\\7"],
  ["1234567.1234567", { stringFormat: "/#00###\u0301" }, "1/23/45/670123\u0301456\u03017"],
  ["1234567.1234567", { stringFormat: "##0,##" }, "1234567,1234567"],
  ["1234567.1234567", { stringFormat: "##0.##" }, "1234567.1234567"],
  ["1234567.1234567", { stringFormat: "##0 ##" }, "1234567 1234567"],
  ["1234567.1234567", { stringFormat: "##0'##" }, "1234567'1234567"],
  ["1234567.1234567", { stringFormat: "##0_##" }, "1234567_1234567"],
  ["1234567.1234567", { stringFormat: "##0-##" }, "1234567-1234567"],
  ["1234567.1234567", { stringFormat: "##0\u00a0##" }, "1234567\u00a01234567"],
  ["1234567.1234567", { stringFormat: "##0\u2009##" }, "1234567\u20091234567"],
  ["1234567.1234567", { stringFormat: "##0\r##" }, "1234567\r1234567"],
  ["1234567.1234567", { stringFormat: "##0\u2029##" }, "1234567\u20291234567"],
  ["1234567.1234567", { stringFormat: "##0\ud83d\ude00##" }, "1234567\ud83d\ude001234567"],
  ["1234567.1234567", { stringFormat: "##0\ud835\udfd8##" }, "1234567\ud835\udfd81234567"],
  ["1234567.1234567", { stringFormat: "##0*##" }, "1234567*1234567"],
  ["1234567.1234567", { stringFormat: "##0+##" }, "1234567+1234567"],
  ["1234567.1234567", { stringFormat: "##0?##" }, "1234567?1234567"],
  ["1234567.1234567", { stringFormat: "##0(##" }, "1234567(1234567"],
  ["1234567.1234567", { stringFormat: "##0)##" }, "1234567)1234567"],
  ["1234567.1234567", { stringFormat: "##0[##" }, "1234567[1234567"],
  ["1234567.1234567", { stringFormat: "##0]##" }, "1234567]1234567"],
  ["1234567.1234567", { stringFormat: "##0{##" }, "1234567{1234567"],
  ["1234567.1234567", { stringFormat: "##0}##" }, "1234567}1234567"],
  ["1234567.1234567", { stringFormat: "##0|##" }, "1234567|1234567"],
  ["1234567.1234567", { stringFormat: "##0^##" }, "1234567^1234567"],
  ["1234567.1234567", { stringFormat: "##0$##" }, "1234567$1234567"],
  ["1234567.1234567", { stringFormat: "##0\\##" }, "1234567\\1234567"],
  ["1234567.1234567", { stringFormat: "##0/##" }, "1234567/1234567"],
  ["1234567.1234567", { stringFormat: "##00##" }, "123456701234567"],
  ["1234567.1234567", { locale: "de", stringFormat: "#.##0,## #" }, "1.234.567,12\u00a034\u00a056\u00a07"],
  ["1234567.1234567", { locale: "fr", stringFormat: "#.##0,## #" }, "1.234.567,12\u00a034\u00a056\u00a07"],
  ["1234567.1234567", { locale: "de", stringFormat: "#,##0.00" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { locale: "de", stringFormat: "#.###,##" }, "1,234,567.123'456'7"],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { decimal: "X", group: "Y", groupDigits: 2, fractionGroup: "Z", fractionGroupDigits: 1 } }, "1.234.567,12\u00a034\u00a056\u00a07"],
  ["1234567.1234567", { stringFormat: "#,##0.00", options: { decimal: "X", group: "Y", groupDigits: 2 } }, "1Y23Y45Y67X123'456'7"],
  ["1234567.1234567", { precision: 2, stringFormat: "#.##0,## #" }, "1.234.567,12"],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { precision: 3 } }, "1.234.567,12\u00a03"],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { significant: 4 } }, "1.235.000"],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { digitCount: 10 } }, "1.234.567,12\u00a03"],
  ["12.5", { stringFormat: "#.##0,## #", options: { paddingDigits: 6 } }, "000.012,5"],
  ["12.5", { stringFormat: "#.##0,## #", options: { numberSign: "plus" } }, "+12,5"],
  ["-1234.5678", { stringFormat: "#.##0,## #" }, "-1.234,56\u00a078"],
  ["1234567", { stringFormat: "#.##0,## #" }, "1.234.567"],
  ["0.000123", { stringFormat: "#.##0,## #" }, "0,00\u00a001\u00a023"],
  ["1.5e10", { stringFormat: "#.##0,## #" }, "15.000.000.000"],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { notation: "scientific" } }, { asciimath: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", latex: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", html: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", unicodemath: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", mathml: "<mrow><mn>1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07</mn><mo>x</mo><msup><mn>10</mn><mn>6</mn></msup></mrow>", omml: "<m:r><m:t>1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6</m:t></m:r>" }],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { notation: "e" } }, "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07e6"],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { notation: "engineering" } }, { asciimath: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", latex: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", html: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", unicodemath: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", mathml: "<mrow><mn>1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07</mn><mo>x</mo><msup><mn>10</mn><mn>6</mn></msup></mrow>", omml: "<m:r><m:t>1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6</m:t></m:r>" }],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { notation: "scientific", times: "\u00b7", exponentSign: "plus" } }, { asciimath: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 \u00b7 10^+6", latex: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 \u00b7 10^+6", html: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 \u00b7 10^+6", unicodemath: "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 \u00b7 10^+6", mathml: "<mrow><mn>1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07</mn><mo>\u00b7</mo><msup><mn>10</mn><mn>+6</mn></msup></mrow>", omml: "<m:r><m:t>1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 \u00b7 10^+6</m:t></m:r>" }],
  ["255", { stringFormat: "#.##0,## #", options: { base: 16 } }, { asciimath: "ff_(16)", latex: "\\mathrm{ff}_{16}", html: "ff<sub>16</sub>", unicodemath: "ff_(16)", mathml: "<msub><mn>ff</mn><mn>16</mn></msub>", omml: "<m:r><m:t>0xff</m:t></m:r>" }],
  ["12345678", { stringFormat: "#.##0,## #", options: { base: 2 } }, { asciimath: "101.111.000.110.000.101.001.110_(2)", latex: "\\mathrm{101.111.000.110.000.101.001.110}_{2}", html: "101.111.000.110.000.101.001.110<sub>2</sub>", unicodemath: "101.111.000.110.000.101.001.110_(2)", mathml: "<msub><mn>101.111.000.110.000.101.001.110</mn><mn>2</mn></msub>", omml: "<m:r><m:t>0b101.111.000.110.000.101.001.110</m:t></m:r>" }],
  ["12345678", { stringFormat: "#.##0,## #", options: { base: 2, basePrefix: "0b" } }, "0b101.111.000.110.000.101.001.110"],
  ["12.5", { stringFormat: "#.##0,## #", options: { base: 8 } }, { asciimath: "14,4_(8)", latex: "\\mathrm{14,4}_{8}", html: "14,4<sub>8</sub>", unicodemath: "14,4_(8)", mathml: "<msub><mn>14,4</mn><mn>8</mn></msub>", omml: "<m:r><m:t>0o14,4</m:t></m:r>" }],
  ["-255", { stringFormat: "#.##0,## #", options: { base: 16, hexCapital: true } }, { asciimath: "-FF_(16)", latex: "-\\mathrm{FF}_{16}", html: "-FF<sub>16</sub>", unicodemath: "-FF_(16)", mathml: "<mrow><mo>-</mo><msub><mn>FF</mn><mn>16</mn></msub></mrow>", omml: "<m:r><m:t>-0xFF</m:t></m:r>" }],
  ["12345678", { stringFormat: "#.##0,## #", options: { base: 8, notation: "scientific" } }, { asciimath: "0o1,17\u00a000\u00a062\u00a04 x 10^7", latex: "0o1,17\u00a000\u00a062\u00a04 x 10^7", html: "0o1,17\u00a000\u00a062\u00a04 x 10^7", unicodemath: "0o1,17\u00a000\u00a062\u00a04 x 10^7", mathml: "<mrow><mn>0o1,17\u00a000\u00a062\u00a04</mn><mo>x</mo><msup><mn>10</mn><mn>7</mn></msup></mrow>", omml: "<m:r><m:t>0o1,17\u00a000\u00a062\u00a04 x 10^7</m:t></m:r>" }],
  ["1234567.1234567", { stringFormat: null }, "1,234,567.123'456'7"],
];
