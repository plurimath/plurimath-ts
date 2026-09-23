/**
 * OMML `formatter:` cases measured on the pinned oracle
 * (`~/ruby_gems/plurimath-oracle` at 00c52783, v0.11.6), one row per
 * `(value, formatter)`. Each row is `[value, formatter, inserted, denominator,
 * bare]`:
 *
 *   - `inserted`: the `m:t` text `Formula#to_omml` writes for the number — the
 *     `Number#insert_t_tag` path, the formatter's result as flat text;
 *   - `denominator`: the `m:t` text of the `2` in `Frac.new(number, 2)`, the
 *     same path one level down (the numerator is checked equal to `inserted`);
 *   - `bare`: `Number#to_omml_without_math_tag`'s element, dumped as
 *     `Core#dump_nodes(indent: 2)` does, whitespace between tags removed —
 *     `Formatter::Numbers::OmmlRenderer.render`'s `m:sSup`/`m:sSub`/`m:t`.
 *
 * The command, per row (options are the snake_case spelling of the camelCase
 * keys below; `notation` is passed as a Symbol):
 *
 *   BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x -- bundle exec ruby -e '
 *     require "plurimath"
 *     M = Plurimath::Math
 *     f = Plurimath::Formatter::Standard.new(options: OPTIONS, string_format: STRING_FORMAT)
 *     puts M::Formula.new([M::Number.new(VALUE)]).to_omml(formatter: f)
 *     puts M::Formula.new([M::Function::Frac.new(M::Number.new(VALUE), M::Number.new("2"))])
 *            .to_omml(formatter: f)
 *     n = M::Number.new(VALUE)
 *     puts n.to_omml_without_math_tag(true, options: { formatter: f })
 *           .map { |el| n.dump_nodes(el, indent: 2) }.join'
 */

import type { FormatterOptions } from "../../src/formatting/index";

// biome-ignore format: one measured row per line, the layout the oracle output was generated in
export const MEASURED: ReadonlyArray<readonly [string, FormatterOptions, string, string, string]> = [
  ["1234567.891", {  }, "1,234,567.891", "2", "<m:t>1,234,567.891</m:t>\n"],
  ["1234567.891", { options: { notation: "e" } }, "1.234'567'891e6", "2e0", "<m:t>1.234'567'891e6</m:t>\n"],
  ["1234567.891", { options: { notation: "scientific" } }, "1.234'567'891 x 10^6", "2 x 10^0", "<m:sSup><m:sSupPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSupPr><m:e><m:r><m:t>1.234'567'891</m:t></m:r><m:r><m:t> x </m:t></m:r><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>6</m:t></m:r></m:sup></m:sSup>\n"],
  ["1234567.891", { options: { notation: "engineering" } }, "1.234'567'891 x 10^6", "2 x 10^0", "<m:sSup><m:sSupPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSupPr><m:e><m:r><m:t>1.234'567'891</m:t></m:r><m:r><m:t> x </m:t></m:r><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>6</m:t></m:r></m:sup></m:sSup>\n"],
  ["-0.000123", { options: { notation: "scientific" } }, "-1.23 x 10^-4", "2 x 10^0", "<m:sSup><m:sSupPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSupPr><m:e><m:r><m:t>-1.23</m:t></m:r><m:r><m:t> x </m:t></m:r><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>-4</m:t></m:r></m:sup></m:sSup>\n"],
  ["255", { options: { notation: "scientific", times: "\u00b7" } }, "2.55 \u00b7 10^2", "2 \u00b7 10^0", "<m:sSup><m:sSupPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSupPr><m:e><m:r><m:t>2.55</m:t></m:r><m:r><m:t> \u00b7 </m:t></m:r><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>\n"],
  ["255", { options: { notation: "scientific", exponentSign: "plus" } }, "2.55 x 10^+2", "2 x 10^0", "<m:sSup><m:sSupPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSupPr><m:e><m:r><m:t>2.55</m:t></m:r><m:r><m:t> x </m:t></m:r><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>+2</m:t></m:r></m:sup></m:sSup>\n"],
  ["255", { options: { base: 16 } }, "0xff", "0x2", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>ff</m:t></m:r></m:e><m:sub><m:r><m:t>16</m:t></m:r></m:sub></m:sSub>\n"],
  ["255", { options: { base: 2 } }, "0b11,111,111", "0b10", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>11,111,111</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub>\n"],
  ["-255", { options: { base: 8 } }, "-0o377", "0o2", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>-377</m:t></m:r></m:e><m:sub><m:r><m:t>8</m:t></m:r></m:sub></m:sSub>\n"],
  ["-255", { options: { base: 16 } }, "-0xff", "0x2", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>-ff</m:t></m:r></m:e><m:sub><m:r><m:t>16</m:t></m:r></m:sub></m:sSub>\n"],
  ["255", { options: { base: 16, numberSign: "plus" } }, "+0xff", "+0x2", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>+ff</m:t></m:r></m:e><m:sub><m:r><m:t>16</m:t></m:r></m:sub></m:sSub>\n"],
  ["255", { options: { base: 16, hexCapital: true } }, "0xFF", "0x2", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>FF</m:t></m:r></m:e><m:sub><m:r><m:t>16</m:t></m:r></m:sub></m:sSub>\n"],
  ["12.5", { options: { base: 8 } }, "0o14.4", "0o2", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>14.4</m:t></m:r></m:e><m:sub><m:r><m:t>8</m:t></m:r></m:sub></m:sSub>\n"],
  ["255", { options: { base: 16, basePrefix: "0x" } }, "0xff", "0x2", "<m:t>0xff</m:t>\n"],
  ["255", { options: { base: 16, basePostfix: "h" } }, "ffh", "2h", "<m:t>ffh</m:t>\n"],
  ["255", { options: { base: 16, basePrefix: null } }, "ff", "2", "<m:t>ff</m:t>\n"],
  ["255", { options: { base: 2, notation: "scientific" } }, "0b10.10 x 10^2", "0b10 x 10^0", "<m:sSup><m:sSupPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSupPr><m:e><m:r><m:t>0b10.10</m:t></m:r><m:r><m:t> x </m:t></m:r><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>\n"],
  ["255", { options: { base: 10 } }, "255", "2", "<m:t>255</m:t>\n"],
  ["1234.5678", { options: { precision: 2, decimal: ",", group: "." } }, "1.234,56", "2,00", "<m:t>1.234,56</m:t>\n"],
  ["14236.39239", { options: { significant: 3 } }, "14,200", "2", "<m:t>14,200</m:t>\n"],
  ["5", { options: { paddingDigits: 3, numberSign: "plus" } }, "+005", "+002", "<m:t>+005</m:t>\n"],
  ["1234567.1234567", { stringFormat: "#.##0,## #", options: { notation: "scientific" } }, "1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07 x 10^6", "2 x 10^0", "<m:sSup><m:sSupPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSupPr><m:e><m:r><m:t>1,23\u00a045\u00a067\u00a012\u00a034\u00a056\u00a07</m:t></m:r><m:r><m:t> x </m:t></m:r><m:r><m:t>10</m:t></m:r></m:e><m:sup><m:r><m:t>6</m:t></m:r></m:sup></m:sSup>\n"],
  ["255", { stringFormat: "#.##0,## #", options: { base: 16 } }, "0xff", "0x2", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>ff</m:t></m:r></m:e><m:sub><m:r><m:t>16</m:t></m:r></m:sub></m:sSub>\n"],
  ["12345678", { stringFormat: "# ##0.## #", options: { base: 2 } }, "0b101\u00a0111\u00a0000\u00a0110\u00a0000\u00a0101\u00a0001\u00a0110", "0b10", "<m:sSub><m:sSubPr><m:ctrlPr><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/><w:i/></w:rPr></m:ctrlPr></m:sSubPr><m:e><m:r><m:t>101\u00a0111\u00a0000\u00a0110\u00a0000\u00a0101\u00a0001\u00a0110</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub>\n"],
];
