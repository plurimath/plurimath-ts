/**
 * Signed AsciiMath operand behavior measured from plurimath 0.11.12 at
 * ae20be11 with the frozen Ruby 4.0.1 / published-dependency oracle wrapper.
 * Each expected model string below is the oracle's serialized model, verbatim.
 * Models were serialized with the corpus generator's `serialize_node` shape.
 * Controls pin the boundary: signed base-prefixed tokens, unary minus outside
 * a script/mod operand, plus sign, and a parenthesized operand remain separate.
 */

import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toAsciimath } from "../../../src/formats/asciimath/renderer";

/** [input, locale, Ruby model JSON, Ruby AsciiMath rendering]. */
const ORACLE_CASES = [
  [
    "a^-2",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a^-2","left_right_wrapper":true,"value":[{"class":"Math::Function::Power","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-2"}}}}]}}',
    "a^(-2)",
  ],
  [
    "a_-2",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a_-2","left_right_wrapper":true,"value":[{"class":"Math::Function::Base","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-2"}}}}]}}',
    "a_(-2)",
  ],
  [
    "a_1^-2",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a_1^-2","left_right_wrapper":true,"value":[{"class":"Math::Function::PowerBase","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_three":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-2"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"1"}}}}]}}',
    "a_(1)^(-2)",
  ],
  [
    "a_-2^3",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a_-2^3","left_right_wrapper":true,"value":[{"class":"Math::Function::PowerBase","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_three":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"3"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-2"}}}}]}}',
    "a_(-2)^(3)",
  ],
  [
    "a_-2^-3",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a_-2^-3","left_right_wrapper":true,"value":[{"class":"Math::Function::PowerBase","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_three":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-3"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-2"}}}}]}}',
    "a_(-2)^(-3)",
  ],
  [
    "a^-2.5",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a^-2.5","left_right_wrapper":true,"value":[{"class":"Math::Function::Power","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-2.5"}}}}]}}',
    "a^(-2.5)",
  ],
  [
    "7 mod -3",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"7 mod -3","left_right_wrapper":true,"value":[{"class":"Math::Function::Mod","fields":{"parameter_one":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"7"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-3"}}}}]}}',
    "7 mod -3",
  ],
  [
    "7 mod -3.5",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"7 mod -3.5","left_right_wrapper":true,"value":[{"class":"Math::Function::Mod","fields":{"parameter_one":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"7"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-3.5"}}}}]}}',
    "7 mod -3.5",
  ],
  [
    "7 mod -0",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"7 mod -0","left_right_wrapper":true,"value":[{"class":"Math::Function::Mod","fields":{"parameter_one":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"7"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-0"}}}}]}}',
    "7 mod -0",
  ],
  [
    "7 mod -0.0",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"7 mod -0.0","left_right_wrapper":true,"value":[{"class":"Math::Function::Mod","fields":{"parameter_one":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"7"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-0.0"}}}}]}}',
    "7 mod -0.0",
  ],
  [
    "0 mod -3",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"0 mod -3","left_right_wrapper":true,"value":[{"class":"Math::Function::Mod","fields":{"parameter_one":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"0"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-3"}}}}]}}',
    "0 mod -3",
  ],
  [
    "a^0xFF",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a^0xFF","left_right_wrapper":true,"value":[{"class":"Math::Function::Power","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Number","fields":{"base":16,"mini_sub_sized":false,"mini_sup_sized":false,"value":"FF"}}}}]}}',
    "a^(FF)",
  ],
  [
    "a^-0xFF",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a^-0xFF","left_right_wrapper":true,"value":[{"class":"Math::Function::Power","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Symbols::Minus","fields":{"value":null}}}},{"class":"Math::Number","fields":{"base":16,"mini_sub_sized":false,"mini_sup_sized":false,"value":"FF"}}]}}',
    "a^(-) FF",
  ],
  [
    "a_-0xFF",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a_-0xFF","left_right_wrapper":true,"value":[{"class":"Math::Function::Base","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Symbols::Minus","fields":{"value":null}}}},{"class":"Math::Number","fields":{"base":16,"mini_sub_sized":false,"mini_sup_sized":false,"value":"FF"}}]}}',
    "a_(-) FF",
  ],
  [
    "a^+2",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a^+2","left_right_wrapper":true,"value":[{"class":"Math::Function::Power","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Symbols::Plus","fields":{"value":null}}}},{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"2"}}]}}',
    "a^(+) 2",
  ],
  [
    "7 mod 0xFF",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"7 mod 0xFF","left_right_wrapper":true,"value":[{"class":"Math::Function::Mod","fields":{"parameter_one":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"7"}},"parameter_two":{"class":"Math::Number","fields":{"base":16,"mini_sub_sized":false,"mini_sup_sized":false,"value":"FF"}}}}]}}',
    "7 mod FF",
  ],
  [
    "7 mod -0xFF",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"7 mod -0xFF","left_right_wrapper":true,"value":[{"class":"Math::Function::Mod","fields":{"parameter_one":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"7"}},"parameter_two":{"class":"Math::Symbols::Minus","fields":{"value":null}}}},{"class":"Math::Number","fields":{"base":16,"mini_sub_sized":false,"mini_sup_sized":false,"value":"FF"}}]}}',
    "7 mod - FF",
  ],
  [
    "-2",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"-2","left_right_wrapper":true,"value":[{"class":"Math::Symbols::Minus","fields":{"value":null}},{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"2"}}]}}',
    "- 2",
  ],
  [
    "a^-(2)",
    null,
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a^-(2)","left_right_wrapper":true,"value":[{"class":"Math::Function::Power","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Symbols::Minus","fields":{"value":null}}}},{"class":"Math::Function::Fenced","fields":{"options":{},"parameter_one":{"class":"Math::Symbols::Paren::Lround","fields":{"value":null}},"parameter_three":{"class":"Math::Symbols::Paren::Rround","fields":{"value":null}},"parameter_two":[{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"2"}}]}}]}}',
    "a^(-) (2)",
  ],
  [
    "a^-2,5",
    "fr",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"a^-2,5","left_right_wrapper":true,"value":[{"class":"Math::Function::Power","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"-2,5"}}}}]}}',
    "a^(-2,5)",
  ],
] as const;

describe("signed AsciiMath operands against the 0.11.12 oracle", () => {
  it.each(ORACLE_CASES)(
    "matches the oracle model for %s (%s locale)",
    (input, locale, model, rendered) => {
      const parsed = parseAsciimath(input, locale === null ? undefined : { locale });
      expect(normalize(parsed)).toStrictEqual(JSON.parse(model));
      if (locale === null) expect(toAsciimath(parsed)).toBe(rendered);
    },
  );
});
