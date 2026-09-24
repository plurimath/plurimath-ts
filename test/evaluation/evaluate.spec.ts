/**
 * Oracle-backed parity for `evaluate(formula, bindings, options)` (roadmap
 * B6: arithmetic, the exact functions and iterations, and the `Math` module
 * functions).
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
 * gem-evaluated node, a FINAL result a JS number cannot hold exactly, a Float
 * power or `Math` function result inside glibc's rounding band, a sin/cos/tan
 * argument inside `libm.ts`'s reduction guard, a Ruby `ArgumentError`, or an
 * exact intermediate beyond the port's size limit (the generator's header).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnsupportedFeatureError } from "../../src/core/errors";
import { FormulaNode, NumberNode, TextNode } from "../../src/core/nodes";
import {
  DEFAULT_MAX_ITERATIONS,
  Evaluator,
  type EvaluatorSettings,
  GEM_EVALUATED_FUNCTIONS,
} from "../../src/evaluation/evaluator";
import {
  DivisionByZeroError,
  type EvaluationBindings,
  type EvaluationErrorCode,
  type EvaluationOptions,
  evaluate,
  InvalidBindingError,
  InvalidBindingKeyError,
  MathDomainError,
  MissingVariableError,
  NonFiniteResultError,
  UnsupportedExpressionError,
} from "../../src/evaluation/index";
import { parseAsciimath } from "../../src/formats/asciimath/index";
import { parseLatex } from "../../src/formats/latex/index";

interface Row {
  readonly id: string;
  readonly group: string;
  readonly source: string;
  readonly input: { readonly format: string; readonly text: string };
  readonly bindings: Readonly<Record<string, number | string | boolean | null>>;
  readonly expected?: string;
  readonly raises?: string;
  readonly message?: string;
  readonly portRefusal?: string;
  readonly options?: EvaluationOptions;
}

/** The evaluator settings a row's `options` (the gem configuration it ran under) resolve to. */
function toSettings(row: Row): EvaluatorSettings {
  const cap = row.options?.evaluationMaxIterations;
  return { maxIterations: cap === undefined ? DEFAULT_MAX_ITERATIONS : cap };
}

/** The parser for a row's `input.format` — every format `evaluate()` fixtures cover so far. */
function parseRowInput(input: Row["input"]): ReturnType<typeof parseAsciimath> {
  switch (input.format) {
    case "asciimath":
      return parseAsciimath(input.text);
    case "latex":
      return parseLatex(input.text);
    default:
      throw new Error(`unknown fixture input format: ${input.format}`);
  }
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

/**
 * The refusal `Evaluator#unported` throws, and nothing else in `src/` does:
 * the gem class it names is captured.
 */
const UNPORTED_REFUSAL =
  /^evaluate is not supported yet: Function::(\w+) is evaluated by the gem but not ported to this slice yet$/;

/**
 * The gem class basenames a parsed formula's nodes stand for, read from the
 * tree directly rather than through `evaluator.ts`'s own maps: a function
 * carrier (`binaryFunction`/`unaryFunction`/`ternaryFunction`) holds the
 * basename in `name`; every other node kind is the basename in camelCase
 * (`sqrt` is `Sqrt`).
 */
function gemClassesIn(
  value: unknown,
  seen = new Set<object>(),
  out = new Set<string>(),
): Set<string> {
  if (typeof value !== "object" || value === null || seen.has(value)) return out;
  seen.add(value);
  const node = value as { kind?: unknown; name?: unknown };
  if (typeof node.kind === "string") {
    if (/^(binary|unary|ternary)Function$/.test(node.kind) && typeof node.name === "string") {
      out.add(node.name);
    } else {
      out.add(node.kind.charAt(0).toUpperCase() + node.kind.slice(1));
    }
  }
  for (const child of Object.values(value)) gemClassesIn(child, seen, out);
  return out;
}

describe("evaluate() against the oracle fixtures", () => {
  it("has fixture rows to check", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    const formula = parseRowInput(row.input);
    const bindings = toBindings(row.bindings);
    expect(Number(row.expected !== undefined) + Number(row.raises !== undefined), row.id).toBe(1);
    if (row.portRefusal !== undefined) {
      expect(() => evaluate(formula, bindings, row.options), row.id).toThrow(
        UnsupportedFeatureError,
      );
      return;
    }
    if (row.expected !== undefined) {
      // Only an Integer or a Float in the safe range may go unrefused; the
      // generator aborts otherwise, and this keeps that promise checked.
      expect(row.expected, row.id).toMatch(/^-?\d+$|[.eIN]/);
      const rubyKind = /^-?\d+$/.test(row.expected) ? "integer" : "float";
      const result = Evaluator.runWithKind(formula, bindings, toSettings(row));
      expect(result.value, row.id).toBe(Number(row.expected));
      expect(result.kind, row.id).toBe(rubyKind);
      if (rubyKind === "integer") expect(Number.isSafeInteger(result.value), row.id).toBe(true);
      expect(evaluate(formula, bindings, row.options), row.id).toBe(result.value);
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
      evaluate(formula, bindings, row.options);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, row.id).toBeInstanceOf(errorClass);
    expect((thrown as { code: string }).code, row.id).toBe(expectedCode);
    // Byte-exact, not merely "some message": a wrong phrase behind the right
    // class and `code` would otherwise pass silently (item 2's finding —
    // `describeUnsupportedNode`'s old `linebreak` vs the gem's own
    // `Function::Linebreak`, `evaluator.ts`). Every raised row records one
    // (the generator's header); a missing one here is the generator failing
    // to keep that promise, not something to skip past.
    expect(row.message, row.id).toBeDefined();
    expect((thrown as Error).message, row.id).toBe(row.message);
  });

  it("covers every refusal reason and both kinds", () => {
    const reasons = new Set(rows.flatMap((row) => (row.portRefusal ? [row.portRefusal] : [])));
    expect([...reasons].sort()).toEqual([
      "argument-error",
      "big-integer",
      "libm-reduction",
      "libm-rounding-band",
      "pow-rounding-band",
      "rational",
      "size-limit",
      "unported",
    ]);
    const plain = rows.filter((row) => row.portRefusal === undefined && row.expected !== undefined);
    expect(plain.some((row) => /^-?\d+$/.test(row.expected as string))).toBe(true);
    expect(plain.some((row) => !/^-?\d+$/.test(row.expected as string))).toBe(true);
  });
});

// The generator proves each `unported` label against `evaluator.ts`'s source
// text; this proves it against the port's behaviour, so a dispatch change
// that starts evaluating one of these classes fails here instead of leaving a
// stale label that source-text matching cannot see.
describe("evaluate() refuses every unported fixture row from the unported path", () => {
  const unported = rows.filter((row) => row.portRefusal === "unported");

  it("has unported rows to check", () => {
    expect(unported.length).toBeGreaterThan(0);
  });

  it.each(unported.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    const formula = parseRowInput(row.input);
    let thrown: unknown;
    try {
      evaluate(formula, toBindings(row.bindings), row.options);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, row.id).toBeInstanceOf(UnsupportedFeatureError);
    expect((thrown as UnsupportedFeatureError).feature, row.id).toBe("evaluate");
    const match = UNPORTED_REFUSAL.exec((thrown as Error).message);
    expect(match, `${row.id}: ${(thrown as Error).message}`).not.toBeNull();
    const gemClass = (match as RegExpExecArray)[1] as string;
    expect(GEM_EVALUATED_FUNCTIONS.has(gemClass), `${row.id}: ${gemClass}`).toBe(true);
    expect([...gemClassesIn(formula)], row.id).toContain(gemClass);
  });
});

describe("evaluate() — measurements not covered by the oracle fixtures", () => {
  it("accepts a Formula returned by parseAsciimath directly", () => {
    expect(evaluate(parseAsciimath("2+3"))).toBe(5);
  });

  it("defaults bindings to an empty object", () => {
    expect(() => evaluate(parseAsciimath("a"))).toThrow(MissingVariableError);
  });

  // The per-call cap stands in for the gem's global configuration, which the
  // fixtures exercise (`sum-custom-cap-*`, `sum-no-cap`); an untyped caller
  // passing something the gem's `<=` could not compare is refused up front.
  it("rejects an evaluationMaxIterations that is neither a number nor null", () => {
    const options = { evaluationMaxIterations: "5" } as unknown as EvaluationOptions;
    expect(() => evaluate(parseAsciimath("sum_(i=1)^3 i"), {}, options)).toThrow(TypeError);
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

describe("evaluate's number literal pattern", () => {
  it("rejects a long malformed digit run in linear time", () => {
    // The earlier quadratic pattern took 4.6-20 s at 50,000 digits. Four
    // times the length is at least sixteen times that, far past the default
    // 5 s timeout, while the linear pattern stays in milliseconds.
    const formula = new FormulaNode({
      value: [new NumberNode({ value: `${"0".repeat(200_000)}x` })],
    });
    expect(() => evaluate(formula)).toThrow(UnsupportedExpressionError);
  });
});

describe("evaluate's Text variable-name strip", () => {
  it("strips in linear time when a long inner run of strip characters precedes the end", () => {
    // Measured on the gem: Text.new("a\0\0a") keeps its inner NULs after
    // String#strip and raises MissingVariableError. The earlier trailing-class
    // regex took 9.7 s at 50,000 NULs; four times that length is at least
    // sixteen times slower, far past the default 5 s timeout.
    const formula = new FormulaNode({
      value: [new TextNode({ parameterOne: `a${"\0".repeat(200_000)}a` })],
    });
    expect(() => evaluate(formula)).toThrow(MissingVariableError);
  });

  it("keeps inner NULs and strips outer ones, as Ruby's String#strip does", () => {
    // Measured on the gem: Text.new("\0a\0\0a\0") raises MissingVariableError
    // with "missing value for variable `a\u0000\u0000a`".
    const inner = new FormulaNode({ value: [new TextNode({ parameterOne: "\0a\0\0a\0" })] });
    expect(() => evaluate(inner)).toThrow("missing value for variable `a\0\0a`");
  });
});
