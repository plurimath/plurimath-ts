/**
 * Locale model parity (TODO.plan/p1-asciimath/04-asciimath-grammar.md): under a
 * comma-decimal locale, `parseAsciimath` must produce the model the gem
 * produces for the same input and locale, and the default must still read
 * `1.5` as one number.
 *
 * `grammar.spec.ts` pins the parse TREES under a comma marker; this file pins
 * the end-to-end MODEL (preprocess → grammar → transform → `normalize`), the
 * layer `model-parity.spec.ts` checks for the corpus. The shared case schema
 * has no locale axis, so these rows are a local fixture, as the plan item
 * says. The file name avoids `model-parity`, the `corpus-conformance` gate's
 * filter in `gates.json`: this suite reads no corpus.
 *
 * Every expected model below is what the oracle (plurimath 0.11.6,
 * `00c52783`, a clean checkout) returned, serialized by the corpus
 * generator's own `CorpusGenerator.serialize_node`
 * (`scripts/generate-corpus.rb`), from a one-off probe run with
 * `mise x -- bundle exec ruby -Ilib` in that checkout:
 *
 * ```ruby
 * require "json"
 * require "plurimath"
 * require "<this repo>/scripts/generate-corpus.rb"
 * [["1,5", :de], ["1,2,3", :de], ["1.5", :de], ["1.5", nil], ["1,5", nil],
 *  ["1,5", :fr]].each do |input, locale|
 *   f = locale ? Plurimath::Math.parse(input, :asciimath, locale: locale)
 *              : Plurimath::Math.parse(input, :asciimath)
 *   puts JSON.generate(CorpusGenerator.serialize_node(f, "$"))
 * end
 * ```
 *
 * The helpers below build exactly the serialized shapes that probe printed;
 * the rows were checked against its JSON output byte for byte before this
 * file was committed.
 */

import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";

/** `Math::Number`, as the generator serializes it. */
function number(value: string) {
  return {
    class: "Math::Number",
    fields: {
      base: null,
      // biome-ignore lint/style/useNamingConvention: the gem's own field name.
      mini_sub_sized: false,
      // biome-ignore lint/style/useNamingConvention: the gem's own field name.
      mini_sup_sized: false,
      value,
    },
  };
}

/** A value-less `Math::Symbols::*` node. */
function symbol(name: "Comma" | "Period") {
  return { class: `Math::Symbols::${name}`, fields: { value: null } };
}

/** The `Math::Formula` `Plurimath::Math.parse` returns for `input`. */
function formula(input: string, value: readonly unknown[]) {
  return {
    class: "Math::Formula",
    fields: {
      displaystyle: true,
      // biome-ignore lint/style/useNamingConvention: the gem's own field name.
      input_string: input,
      // biome-ignore lint/style/useNamingConvention: the gem's own field name.
      left_right_wrapper: true,
      value,
    },
  };
}

type Row = readonly [input: string, locale: string | null, model: unknown];

const ROWS: readonly Row[] = [
  // A comma-decimal locale reads the comma as the decimal marker.
  ["1,5", "de", formula("1,5", [number("1,5")])],
  ["1,5", "fr", formula("1,5", [number("1,5")])],
  // Only the first comma joins a number; the next is a separator again.
  ["1,2,3", "de", formula("1,2,3", [number("1,2"), symbol("Comma"), number("3")])],
  // Under that locale a full stop is a symbol between two numbers.
  ["1.5", "de", formula("1.5", [number("1"), symbol("Period"), number("5")])],
  // The default still parses `1.5` as one number, and `1,5` as a list.
  ["1.5", null, formula("1.5", [number("1.5")])],
  ["1,5", null, formula("1,5", [number("1"), symbol("Comma"), number("5")])],
];

describe("AsciiMath under a locale, end to end", () => {
  it.each(
    ROWS.map(([input, locale, model]) => [input, locale ?? "default", locale, model] as const),
  )("%s under %s: the parsed model deep-equals the gem's", (input, _label, locale, model) => {
    const parsed = locale === null ? parseAsciimath(input) : parseAsciimath(input, { locale });
    expect(normalize(parsed)).toStrictEqual(model);
  });
});
