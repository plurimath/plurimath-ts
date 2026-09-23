/**
 * Oracle-backed parity for `evaluate(formula, bindings)` (roadmap B6, first
 * slice: `Number`/`Symbol`/binary-arithmetic evaluation only).
 *
 * The rows are `test/formats/evaluation/evaluation-fixtures.json`, written by
 * `scripts/generate-evaluation-fixtures.rb` from the pinned gem (plurimath
 * 0.11.6, `00c52783`). `expected` is Ruby's `Integer#inspect`/`Float#inspect`
 * STRING, so each row checks two things: the value (`Object.is`, so `-0.0`
 * and `0` stay apart) and the Ruby kind the string records (`5` is an
 * Integer, `2.0` a Float) against the kind the port tracks internally
 * (`src/evaluation/numeric.ts`) — the tracking that decides where the port
 * must refuse. A row with `portRefusal` is one the port refuses with
 * `UnsupportedFeatureError` whatever the oracle answered: an unported
 * gem-evaluated node, or a result a JS number cannot hold exactly.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnsupportedFeatureError } from "../../src/core/errors";
import { Evaluator } from "../../src/evaluation/evaluator";
import {
  DivisionByZeroError,
  type EvaluationBindings,
  type EvaluationErrorCode,
  evaluate,
  InvalidBindingError,
  InvalidBindingKeyError,
  MathDomainError,
  MissingVariableError,
  NonFiniteResultError,
  UnsupportedExpressionError,
} from "../../src/evaluation/index";
import { parseAsciimath } from "../../src/formats/asciimath/index";

interface Row {
  readonly id: string;
  readonly group: string;
  readonly source: string;
  readonly input: { readonly format: string; readonly text: string };
  readonly bindings: Readonly<Record<string, number | string | boolean | null>>;
  readonly expected?: string;
  readonly raises?: string;
  readonly portRefusal?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(HERE, "..", "formats", "evaluation", "evaluation-fixtures.json"), "utf8"),
) as { readonly cases: readonly Row[] };
const rows = fixture.cases;

/**
 * Ruby class name -> the port's error constructor and expected `code`. The
 * generator's `json_safe` turns a non-finite `Float` binding value into the
 * literal string Ruby's own `Float#to_s` prints (`"NaN"`, `"Infinity"`,
 * `"-Infinity"`) because raw JSON has no such values; this reverses exactly
 * that, and nothing else — `"x"` (a deliberately non-numeric binding, not a
 * stand-in for a non-finite one) is never one of those three strings, so it
 * passes through unchanged into the intentionally-invalid call.
 */
// A `Map`, not an object literal: an object literal's keys are properties,
// and biome's naming-convention lint (camelCase) and its formatter (quotes
// only where a key needs them) disagree about `"NaN"`/`"Infinity"` — the
// formatter strips the quotes the lint rule then flags. A `Map`'s keys are
// data, not properties, so neither rule applies to them.
const NON_FINITE_LITERALS: ReadonlyMap<string, number> = new Map([
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
]);

const ERROR_CLASSES: Readonly<Record<string, new (...args: never[]) => Error>> = {
  "Plurimath::Errors::Evaluation::DivisionByZeroError": DivisionByZeroError,
  "Plurimath::Errors::Evaluation::MathDomainError": MathDomainError,
  "Plurimath::Errors::Evaluation::NonFiniteResultError": NonFiniteResultError,
  "Plurimath::Errors::Evaluation::UnsupportedExpressionError": UnsupportedExpressionError,
  "Plurimath::Errors::Evaluation::MissingVariableError": MissingVariableError,
  "Plurimath::Errors::Evaluation::InvalidBindingError": InvalidBindingError,
  "Plurimath::Errors::Evaluation::InvalidBindingKeyError": InvalidBindingKeyError,
};

/** The `code` each class above is expected to carry — `errors.ts`'s own union, restated as data. */
const ERROR_CODES: Readonly<Record<string, EvaluationErrorCode>> = {
  "Plurimath::Errors::Evaluation::DivisionByZeroError": "EVAL_DIVISION_BY_ZERO",
  "Plurimath::Errors::Evaluation::MathDomainError": "EVAL_MATH_DOMAIN",
  "Plurimath::Errors::Evaluation::NonFiniteResultError": "EVAL_NON_FINITE_RESULT",
  "Plurimath::Errors::Evaluation::UnsupportedExpressionError": "EVAL_UNSUPPORTED_EXPRESSION",
  "Plurimath::Errors::Evaluation::MissingVariableError": "EVAL_MISSING_VARIABLE",
  "Plurimath::Errors::Evaluation::InvalidBindingError": "EVAL_INVALID_BINDING",
  "Plurimath::Errors::Evaluation::InvalidBindingKeyError": "EVAL_INVALID_BINDING_KEY",
};

function toBindings(raw: Row["bindings"]): EvaluationBindings {
  const bindings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    bindings[key] =
      typeof value === "string" && NON_FINITE_LITERALS.has(value)
        ? NON_FINITE_LITERALS.get(value)
        : value;
  }
  // Cast: some rows deliberately carry a non-number value (a string, a
  // boolean, `null`) to exercise `InvalidBindingError` — exactly the
  // untyped-caller case `bindings.ts`'s header describes.
  return bindings as EvaluationBindings;
}

describe("evaluate() against the oracle fixtures", () => {
  it("has fixture rows to check", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    const formula = parseAsciimath(row.input.text);
    const bindings = toBindings(row.bindings);
    expect(Number(row.expected !== undefined) + Number(row.raises !== undefined), row.id).toBe(1);
    if (row.portRefusal !== undefined) {
      expect(() => evaluate(formula, bindings), row.id).toThrow(UnsupportedFeatureError);
      return;
    }
    if (row.expected !== undefined) {
      // Only an Integer or a Float in the safe range may go unrefused; the
      // generator aborts otherwise, and this keeps that promise checked.
      expect(row.expected, row.id).toMatch(/^-?\d+$|[.eIN]/);
      const rubyKind = /^-?\d+$/.test(row.expected) ? "integer" : "float";
      const result = Evaluator.runWithKind(formula, bindings);
      expect(result.value, row.id).toBe(Number(row.expected));
      expect(result.kind, row.id).toBe(rubyKind);
      if (rubyKind === "integer") expect(Number.isSafeInteger(result.value), row.id).toBe(true);
      expect(evaluate(formula, bindings), row.id).toBe(result.value);
      return;
    }
    const raises = row.raises as string;
    const errorClass = ERROR_CLASSES[raises];
    const expectedCode = ERROR_CODES[raises];
    if (errorClass === undefined || expectedCode === undefined) {
      throw new Error(`${row.id}: no port error class mapped for ${raises}`);
    }
    let thrown: unknown;
    try {
      evaluate(formula, bindings);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, row.id).toBeInstanceOf(errorClass);
    expect((thrown as { code: string }).code, row.id).toBe(expectedCode);
  });

  it("covers every refusal reason and both kinds", () => {
    const reasons = new Set(rows.flatMap((row) => (row.portRefusal ? [row.portRefusal] : [])));
    expect([...reasons].sort()).toEqual([
      "big-integer",
      "pow-rounding-band",
      "rational",
      "unported",
    ]);
    const plain = rows.filter((row) => row.portRefusal === undefined && row.expected !== undefined);
    expect(plain.some((row) => /^-?\d+$/.test(row.expected as string))).toBe(true);
    expect(plain.some((row) => !/^-?\d+$/.test(row.expected as string))).toBe(true);
  });
});

describe("evaluate() — measurements not covered by the oracle fixtures", () => {
  it("accepts a Formula returned by parseAsciimath directly", () => {
    expect(evaluate(parseAsciimath("2+3"))).toBe(5);
  });

  it("defaults bindings to an empty object", () => {
    expect(() => evaluate(parseAsciimath("a"))).toThrow(MissingVariableError);
  });

  /**
   * `InvalidBindingKeyError` is defined for one-to-one parity with the gem
   * (`src/evaluation/errors.ts`'s header) but UNREACHABLE through this port's
   * typed bindings surface: every JavaScript object key is already a string,
   * so there is no "wrong type of key" a plain `Readonly<Record<string,
   * number>>` can ever carry. This constructs it directly rather than
   * claiming a fixture row exercises it, which would be false — see
   * `TODO.plan/deferred.md`'s "Parked ideas" entry on this error family.
   */
  it("InvalidBindingKeyError message shape, constructed directly (unreachable via evaluate())", () => {
    const error = new InvalidBindingKeyError("Array");
    expect(error.code).toBe("EVAL_INVALID_BINDING_KEY");
    expect(error.message).toBe(
      "wrong type for binding key (given Array, expected String or Symbol)",
    );
  });
});
