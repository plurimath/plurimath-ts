/**
 * `src/evaluation/big-decimal.ts` and the BigDecimal paths of `numeric.ts`,
 * against answers measured on the pinned oracle's Ruby 4.0.1 with
 * bigdecimal 4.1.3 (`ruby -rbigdecimal -e 'p <expression>'`), one per case.
 * The guarded fixture rows (`evaluate.spec.ts`) check `big-math.ts` itself;
 * these pin the primitives and coercions those rows reach only in part.
 */
import { describe, expect, it } from "vitest";
import * as D from "../../src/evaluation/big-decimal";
import { MathDomainError, NonFiniteResultError } from "../../src/evaluation/errors";
import {
  add,
  compare,
  divideAsRuby,
  float,
  integer,
  modulo,
  power,
  type RubyNumeric,
  rational,
} from "../../src/evaluation/numeric";
import {
  inspectEvaluationValue,
  inspectFloat,
  toEvaluationValue,
} from "../../src/evaluation/result";

const big = (text: string): D.BigDecimal => {
  const match = /^(-?)(\d*)(?:\.(\d*))?(?:e(-?\d+))?$/.exec(text) as RegExpExecArray;
  const [, sign = "", whole = "", fraction = "", exp = "0"] = match;
  const value = D.fromInteger(BigInt(`${sign}${whole}${fraction}` || "0"));
  return D.decimalShift(value, Number(exp) - fraction.length);
};
const show = (value: RubyNumeric): string => inspectEvaluationValue(toEvaluationValue(value));

describe("BigDecimal primitives", () => {
  it.each([
    ["BigDecimal(1).div(0, 10)", () => D.div(big("1"), big("0"), 10), "Infinity"],
    ["BigDecimal(0) / 0", () => D.quo(big("0"), big("0")), "NaN"],
    ["BigDecimal(-1) / 0", () => D.quo(big("-1"), big("0")), "-Infinity"],
    ["BigDecimal(0) * -1", () => D.mult(big("0"), big("-1")), "-0.0"],
    ["BigDecimal(1) - 1", () => D.sub(big("1"), big("1")), "0.0"],
    ["BigDecimal(-1) + 1", () => D.add(big("-1"), big("1")), "0.0"],
    ["-BigDecimal(0)", () => D.negate(big("0")), "-0.0"],
    ["BigDecimal(-0.0, 0)", () => D.fromFloat(-0), "-0.0"],
    ['BigDecimal("1.5").mult(1, 1)', () => D.mult(big("1.5"), big("1"), 1), "0.2e1"],
    ['BigDecimal("-1.5").mult(1, 1)', () => D.mult(big("-1.5"), big("1"), 1), "-0.2e1"],
    ['BigDecimal("2.5").truncate(0)', () => D.truncate(big("2.5"), 0), "0.2e1"],
    ['BigDecimal("-2.75").truncate(1)', () => D.truncate(big("-2.75"), 1), "-0.27e1"],
    ["BigDecimal(1) / 3", () => D.quo(big("1"), big("3")), "0.33333333333333333333333333333333e0"],
    ["BigDecimal::INFINITY + 1", () => D.add(D.POSITIVE_INFINITY, big("1")), "Infinity"],
    ["INFINITY - INFINITY", () => D.sub(D.POSITIVE_INFINITY, D.POSITIVE_INFINITY), "NaN"],
    ["BigDecimal::INFINITY * 0", () => D.mult(D.POSITIVE_INFINITY, big("0")), "NaN"],
    ["BigDecimal(Rational(1, 3), 5)", () => D.fromRational(1n, 3n, 5), "0.33333e0"],
    ["BigDecimal(0.30000000000000004, 0)", () => D.fromFloat(0.30000000000000004), "0.3e0"],
    ["BigDecimal(1e23, 0)", () => D.fromFloat(1e23), "0.1e24"],
    ["BigDecimal(5e-324, 0)", () => D.fromFloat(5e-324), "0.5e-323"],
    ["BigDecimal::INFINITY.sqrt(10)", () => D.sqrt(D.POSITIVE_INFINITY, 10), "Infinity"],
  ])("%s is %s", (_ruby, compute, expected) => {
    expect(D.inspect(compute())).toBe(expected);
  });

  it("divmod rounds the quotient toward negative infinity", () => {
    const [q1, m1] = D.divmod(big("-7"), big("2"));
    expect([q1, D.inspect(m1)]).toEqual([-4n, "0.1e1"]);
    const [q2, m2] = D.divmod(big("7"), big("-2.5"));
    expect([q2, D.inspect(m2)]).toEqual([-3n, "-0.5e0"]);
  });

  it("measures exponent and precision as the C extension does", () => {
    expect(D.exponent(big("0.1"))).toBe(0);
    expect(D.precision(big("123.45"))).toBe(5);
    expect(D.precision(big("0.000123"))).toBe(6);
    expect(D.precision(big("1e20"))).toBe(21);
    expect(D.precision(D.quo(big("1"), big("3")))).toBe(32);
  });

  it("converts to Float through strtod, flushing on the word exponent", () => {
    expect(D.toFloat(big("1e-400"))).toBe(0);
    expect(D.toFloat(big("4.9e-324"))).toBe(5e-324);
    expect(D.toFloat(big("1e-320"))).toBe(1e-320);
    expect(D.toFloat(D.POSITIVE_INFINITY)).toBe(Infinity);
  });

  it("converts to Rational exactly", () => {
    expect(D.toRational(big("1.23"))).toEqual([123n, 100n]);
  });

  it("raises FloatDomainError where Ruby does", () => {
    expect(() => D.floor(D.NAN_DECIMAL)).toThrow(NonFiniteResultError);
    expect(() => D.sqrt(big("-1"), 10)).toThrow(NonFiniteResultError);
  });
});

describe("BigDecimal coercion with the other numeric classes", () => {
  it.each([
    [
      'BigDecimal("1e30") + Rational(1, 3)',
      () => add(big("1e30"), rational(1n, 3n)),
      "0.100000000000000000000000000000033333333333333333333333333333333e31",
    ],
    [
      "1.0 / BigDecimal(3)",
      () => divideAsRuby(float(1), big("3")),
      "0.33333333333333333333333333333333e0",
    ],
    ["BigDecimal(3) / 1.0", () => divideAsRuby(big("3"), float(1)), "0.3e1"],
    [
      "Rational(1, 3) % BigDecimal(1)",
      () => modulo(rational(1n, 3n), big("1")),
      "0.33333333333333333333333333333333e0",
    ],
    ['BigDecimal("-7") % 2', () => modulo(big("-7"), integer(2n)), "0.1e1"],
    ['7 % BigDecimal("-2.5")', () => modulo(integer(7n), big("-2.5")), "-0.5e0"],
    ["2.5 % BigDecimal(1)", () => modulo(float(2.5), big("1")), "0.5e0"],
    ['BigDecimal("-2") ** 2.0', () => power(big("-2"), float(2)), "0.4e1"],
    ['BigDecimal("2") ** -2', () => power(big("2"), integer(-2n)), "0.25e0"],
    [
      'BigDecimal("2") ** 0.5',
      () => power(big("2"), float(0.5)),
      "0.14142135623730950488016887242097e1",
    ],
    ["BigDecimal(2) ** BigDecimal(0)", () => power(big("2"), big("0")), "0.1e1"],
    ["Rational(1, 2) ** BigDecimal(0)", () => power(rational(1n, 2n), big("0")), "(1/1)"],
    ["2 ** (BigDecimal(1) - 1)", () => power(integer(2n), big("0")), "0.1e1"],
  ])("%s is %s", (_ruby, compute, expected) => {
    expect(show(compute())).toBe(expected);
  });

  it("compares through the coerced value", () => {
    expect(compare(big("1.5"), rational(3n, 2n))).toBe(0);
    // The Rational becomes 45 digits of 1/3 against a 40-digit BigDecimal.
    expect(compare(rational(1n, 3n), D.div(big("1"), big("3"), 40))).toBe(1);
    expect(compare(float(0.1), big("0.1"))).toBe(0);
    // The Float keeps 16 digits, 0.3.
    expect(compare(float(0.30000000000000004), big("0.3"))).toBe(0);
  });

  it("raises Math::DomainError for a negative base to a fractional power", () => {
    expect(() => power(big("-8"), rational(1n, 3n))).toThrow(
      new MathDomainError("Computation results in complex number"),
    );
  });
});

describe("Float#inspect", () => {
  it.each([
    [1e15, "1.0e+15"],
    [1e14, "100000000000000.0"],
    [123456789012345.6, "123456789012345.6"],
    [1234567890123456.0, "1.234567890123456e+15"],
    [1234567890123456.8, "1234567890123456.8"],
    [0.0001, "0.0001"],
    [0.00012345, "0.00012345"],
    [1e-5, "1.0e-05"],
    [12345678901234568, "1.2345678901234568e+16"],
    [100.0, "100.0"],
    [1.5e300, "1.5e+300"],
    [5e-324, "5.0e-324"],
    [-0, "-0.0"],
  ])("%s is %s", (value, expected) => {
    expect(inspectFloat(value)).toBe(expected);
  });
});
