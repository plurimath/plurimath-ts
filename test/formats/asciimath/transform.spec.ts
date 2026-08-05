/** biome-ignore-all lint/style/useNamingConvention: the literals here are
 * Parslet tree keys and Ruby-serialized model fields — snake_case is their
 * schema, as in the corpus payloads. */
/**
 * Pinned transform behaviour the corpus does not reach — above all the
 * oracle's oddities, which SURVIVE in this port rather than being "fixed"
 * (TODO.plan p1/05): normalizing any of them would be a silent divergence
 * the corpus could never catch.
 *
 * Every expected model here was MEASURED, not reasoned out: the gem ran the
 * same input through `Plurimath::Math.parse(input, :asciimath)` and its
 * formula was serialized with the corpus generator's `serialize_node`
 * (probe: `probe-oddities.rb` against plurimath 0.11.6 at `00c52783`,
 * 2026-08-05). The JSON blobs are pasted verbatim from that run.
 */

import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import {
  asciimathTransform,
  finalizeAsciimathParse,
} from "../../../src/formats/asciimath/transform";
import { Slice } from "../../../src/pegkit/index";

function model(input: string): unknown {
  return normalize(parseAsciimath(input));
}

/** [description, input, the gem's serialized model, verbatim]. */
const PINNED: readonly (readonly [string, string, string])[] = [
  [
    "table + power_value + base_value passes POWER into the base slot (transform.rb:917)",
    "[[x]]_a^b",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"[[x]]_a^b","left_right_wrapper":true,"value":[{"class":"Math::Function::PowerBase","fields":{"parameter_one":{"class":"Math::Function::Table","fields":{"close_paren":{"class":"Math::Symbols::Paren::Rsquare","fields":{"value":null}},"open_paren":{"class":"Math::Symbols::Paren::Lsquare","fields":{"value":null}},"options":{},"value":[{"class":"Math::Function::Tr","fields":{"parameter_one":[{"class":"Math::Function::Td","fields":{"parameter_one":[{"class":"Math::Symbols::Symbol","fields":{"value":"x"}}],"parameter_two":null}}]}}]}},"parameter_three":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Symbols::Symbol","fields":{"value":"b"}}}}]}}',
  ],
  [
    "table + base binds the RAW base value, no unfencing (transform.rb:907)",
    "[[x]]_a",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"[[x]]_a","left_right_wrapper":true,"value":[{"class":"Math::Function::Base","fields":{"parameter_one":{"class":"Math::Function::Table","fields":{"close_paren":{"class":"Math::Symbols::Paren::Rsquare","fields":{"value":null}},"open_paren":{"class":"Math::Symbols::Paren::Lsquare","fields":{"value":null}},"options":{},"value":[{"class":"Math::Function::Tr","fields":{"parameter_one":[{"class":"Math::Function::Td","fields":{"parameter_one":[{"class":"Math::Symbols::Symbol","fields":{"value":"x"}}],"parameter_two":null}}]}}]}},"parameter_two":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}}}}]}}',
  ],
  [
    "table + power binds the RAW power value (transform.rb:912)",
    "[[x]]^a",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"[[x]]^a","left_right_wrapper":true,"value":[{"class":"Math::Function::Power","fields":{"parameter_one":{"class":"Math::Function::Table","fields":{"close_paren":{"class":"Math::Symbols::Paren::Rsquare","fields":{"value":null}},"open_paren":{"class":"Math::Symbols::Paren::Lsquare","fields":{"value":null}},"options":{},"value":[{"class":"Math::Function::Tr","fields":{"parameter_one":[{"class":"Math::Function::Td","fields":{"parameter_one":[{"class":"Math::Symbols::Symbol","fields":{"value":"x"}}],"parameter_two":null}}]}}]}},"parameter_two":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}}}}]}}',
  ],
  [
    "left/right binds left_right_value into `left_right`, keeps raw paren text, and clears the wrapper flag (transform.rb:977)",
    "left(x right)",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"left(x right)","left_right_wrapper":false,"value":[{"class":"Math::Function::Left","fields":{"parameter_one":"("}},{"class":"Math::Symbols::Symbol","fields":{"value":"x"}},{"class":"Math::Function::Right","fields":{"parameter_one":")"}}]}}',
  ],
  [
    "an empty left/right body is the empty STRING, not nil (Parslet flatten_sequence)",
    // `(iteration.maybe >> sequence.maybe).as(:left_right_value)` with nothing
    // between `left(` and `right)`: Parslet folds the all-vanished sequence to
    // `''`, and that plain string rides into the formula between the wrappers.
    // Found by model sweep 4, fixed in pegkit's combineSeq — the conformance
    // suite pins the engine half, this pins the format-level consequence.
    "left(right)",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"left(right)","left_right_wrapper":false,"value":[{"class":"Math::Function::Left","fields":{"parameter_one":"("}},"",{"class":"Math::Function::Right","fields":{"parameter_one":")"}}]}}',
  ],
  [
    "the frac dance shifts the numerator's own value array before unfencing it (transform.rb:93)",
    "(a,b)/(c,d)",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"(a,b)/(c,d)","left_right_wrapper":true,"value":[{"class":"Math::Function::Frac","fields":{"parameter_one":{"class":"Math::Formula","fields":{"displaystyle":true,"left_right_wrapper":true,"value":[{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},{"class":"Math::Symbols::Comma","fields":{"value":null}},{"class":"Math::Symbols::Symbol","fields":{"value":"b"}}]}},"parameter_two":{"class":"Math::Formula","fields":{"displaystyle":true,"left_right_wrapper":true,"value":[{"class":"Math::Symbols::Symbol","fields":{"value":"c"}},{"class":"Math::Symbols::Comma","fields":{"value":null}},{"class":"Math::Symbols::Symbol","fields":{"value":"d"}}]}}}}]}}',
  ],
  [
    "a comma'd power_value sequence is shifted, then rejoined around the new node (transform.rb:493)",
    "x_a^1,2,",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"x_a^1,2,","left_right_wrapper":true,"value":[{"class":"Math::Function::PowerBase","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"x"}},"parameter_three":{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"1"}},"parameter_two":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}}}},{"class":"Math::Symbols::Comma","fields":{"value":null}},{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":"2"}},{"class":"Math::Symbols::Comma","fields":{"value":null}}]}}',
  ],
  [
    "a font keyword rides in parameter_two exactly as typed",
    "bb x",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"bb x","left_right_wrapper":true,"value":[{"class":"Math::Function::FontStyle::Bold","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"x"}},"parameter_two":"bb"}}]}}',
  ],
  [
    "a font keyword with a fenced value unfences it",
    "mathbf(x)",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"mathbf(x)","left_right_wrapper":true,"value":[{"class":"Math::Function::FontStyle::Bold","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"x"}},"parameter_two":"mathbf"}}]}}',
  ],
  [
    "an aliased unary class constructs through the UnaryFunction carrier",
    "cancel(x)",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"cancel(x)","left_right_wrapper":true,"value":[{"class":"Math::Function::Cancel","fields":{"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"x"}}}}]}}',
  ],
  [
    "Underset stores its empty options hash where Overset would not (underset.rb:21)",
    "underset(a)(b)",
    '{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":"underset(a)(b)","left_right_wrapper":true,"value":[{"class":"Math::Function::Underset","fields":{"options":{},"parameter_one":{"class":"Math::Symbols::Symbol","fields":{"value":"a"}},"parameter_two":{"class":"Math::Symbols::Symbol","fields":{"value":"b"}}}}]}}',
  ],
];

describe("pinned oracle oddities, end to end", () => {
  it.each(PINNED.map(([name, input, expected]) => [name, input, expected] as const))(
    "%s",
    (_name, input, expected) => {
      expect(model(input)).toStrictEqual(JSON.parse(expected));
    },
  );

  it("the power/base slot swap really is a swap", () => {
    // Restated as a direct assertion so the oddity's direction is readable
    // without decoding the JSON blob: the SUPERSCRIPT (`b`) sits in
    // parameter_two — PowerBase's base slot — and the subscript in three.
    const formula = parseAsciimath("[[x]]_a^b");
    const powerBase = (formula.value as readonly unknown[])[0] as {
      parameterTwo: { value: string };
      parameterThree: { value: string };
    };
    expect(powerBase.parameterTwo.value).toBe("b");
    expect(powerBase.parameterThree.value).toBe("a");
  });
});

describe("base-prefix numbers decimalize exactly (base_number_prefix.rb:36-38)", () => {
  it.each([
    // Ruby's `to_i(2)` is a bignum: 60 binary digits already exceed a
    // double's mantissa, so parseInt would have emitted ...846976. Values
    // measured through the gem (probe-oddities.rb, 2026-08-05).
    ["0b111111111111111111111111111111111111111111111111111111111111", 2, "1152921504606846975"],
    ["0o77777777777777777777777", 8, "590295810358705651711"],
    // Hex keeps its digits as written, case included.
    ["0x1F2e", 16, "1F2e"],
  ] as const)("%s", (input, base, value) => {
    const formula = parseAsciimath(input);
    const number = (formula.value as readonly unknown[])[0] as { base: number; value: string };
    expect(number.base).toBe(base);
    expect(number.value).toBe(value);
  });
});

describe("the RGB color-sequence rule (transform.rb:1047)", () => {
  it("is unpinnable in the gem, so this port refuses it loudly", () => {
    // The rule ignores `color_value` and stringifies the bound array through
    // `Array#to_s`, which inlines each node's `Object#inspect` — object
    // ADDRESS included. Measured twice on the oracle for `colorx//1,2,`:
    //
    //   run 1: value: "[#<Plurimath::Math::Symbols::Symbol:0x0000788dd1aa0550 @value=\"x\">, ...]"
    //   run 2: value: "[#<Plurimath::Math::Symbols::Symbol:0x00007ebee6181720 @value=\"x\">, ...]"
    //
    // The gem accepts the input but cannot reproduce its own output, so there
    // is no model to converge on; inventing a deterministic stand-in would be
    // a silent divergence. The port throws instead, naming the measurement.
    expect(() => parseAsciimath("colorx//1,2,")).toThrow(/address-dependent/);
  });
});

describe("third_value turns a Slice into nil (transform.rb:738)", () => {
  // No grammar path was found that leaves a raw Slice in `third_value` (the
  // preceding `space?` eats the whitespace that could become one), so the
  // branch is pinned at the transform layer with REAL Slice objects — which
  // is exactly what recorded corpus trees cannot supply, their slices having
  // been flattened to strings.
  it("nils a Slice third value and keeps a node one", () => {
    const withSlice = asciimathTransform().apply({
      ternary_class: new Slice("sum", 0),
      base: { base_value: { number: new Slice("1", 4) } },
      third_value: new Slice(" ", 5),
    });
    const formula = finalizeAsciimathParse(withSlice, "synthetic");
    expect(normalize(formula)).toStrictEqual({
      class: "Math::Formula",
      fields: {
        displaystyle: true,
        input_string: "synthetic",
        left_right_wrapper: true,
        value: [
          {
            class: "Math::Function::Sum",
            fields: {
              parameter_one: {
                class: "Math::Number",
                fields: { base: null, mini_sub_sized: false, mini_sup_sized: false, value: "1" },
              },
              parameter_three: null,
              parameter_two: null,
            },
          },
        ],
      },
    });

    const withNode = asciimathTransform().apply({
      ternary_class: new Slice("sum", 0),
      base: { base_value: { number: new Slice("1", 4) } },
      third_value: { symbol: new Slice("y", 6) },
    });
    const kept = finalizeAsciimathParse(withNode, "synthetic");
    const sum = (kept.value as readonly unknown[])[0] as {
      parameterThree: { value: string };
    };
    expect(sum.parameterThree.value).toBe("y");
  });
});
