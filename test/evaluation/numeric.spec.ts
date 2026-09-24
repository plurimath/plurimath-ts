/**
 * `multiply`'s size pre-check (`src/evaluation/numeric.ts`). A product of a
 * nonzero `a`-bit and `b`-bit value has `a+b-1` or `a+b` bits, so
 * `productCertainlyExceeds` refuses before multiplying only when `a+b-1` is
 * over the limit, and leaves `a+b-1 == limit` to the size check after the
 * product. Each boundary is checked twice: the predicate's answer for the
 * operands (which decides whether `multiply` computes the product at all), and
 * `multiply`'s observable result, which must match what the post-check alone
 * gave before the pre-check existed.
 */

import { describe, expect, it } from "vitest";
import { UnsupportedFeatureError } from "../../src/core/errors";
import {
  bitLength,
  INTEGER_BIT_LIMIT,
  integer,
  multiply,
  power,
  powerCertainlyExceeds,
  productCertainlyExceeds,
  RATIONAL_BIT_LIMIT,
  type RubyNumeric,
  rational,
} from "../../src/evaluation/numeric";

const L = INTEGER_BIT_LIMIT;
/** `rational()`'s pre-reduction bound on a numerator. */
const R2 = 2 * RATIONAL_BIT_LIMIT;

function refusal(run: () => RubyNumeric): UnsupportedFeatureError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(UnsupportedFeatureError);
    return error as UnsupportedFeatureError;
  }
  throw new Error("expected a refusal, got a value");
}

describe("multiply: Integer size pre-check at INTEGER_BIT_LIMIT", () => {
  it("computes an ordinary product", () => {
    expect(multiply(integer(6n), integer(7n))).toEqual({ kind: "integer", value: 42n });
  });

  it("a+b-1 == limit, product within the limit: computed and accepted", () => {
    const x = 1n << BigInt(L - 2); // L-1 bits
    const y = 2n; // 2 bits
    expect(bitLength(x) + bitLength(y) - 1).toBe(L);
    expect(productCertainlyExceeds(x, y, L)).toBe(false);
    const product = multiply(integer(x), integer(y));
    expect(product.kind).toBe("integer");
    expect(bitLength((product as { value: bigint }).value)).toBe(L);
  });

  it("a+b-1 == limit, product one bit over: computed, then refused by the post-check", () => {
    const x = (1n << BigInt(L - 1)) - 1n; // L-1 bits
    const y = 3n; // 2 bits; the product has L+1 bits
    expect(bitLength(x) + bitLength(y) - 1).toBe(L);
    expect(productCertainlyExceeds(x, y, L)).toBe(false);
    refusal(() => multiply(integer(x), integer(y)));
  });

  it("a+b-1 == limit+1: refused without computing, with the post-check's refusal", () => {
    const x = (1n << BigInt(L)) - 1n; // L bits: an admitted Integer
    const y = 3n; // 2 bits
    expect(bitLength(x) + bitLength(y) - 1).toBe(L + 1);
    expect(productCertainlyExceeds(x, y, L)).toBe(true);
    const pre = refusal(() => multiply(integer(x), integer(y)));
    const post = refusal(() => multiply(integer((1n << BigInt(L - 1)) - 1n), integer(3n)));
    expect(pre.message).toBe(post.message);
    expect(pre.code).toBe(post.code);
  });

  it("a zero factor is never refused, however long the other factor", () => {
    const x = (1n << BigInt(L)) - 1n;
    expect(productCertainlyExceeds(x, 0n, L)).toBe(false);
    expect(multiply(integer(x), integer(0n))).toEqual({ kind: "integer", value: 0n });
  });
});

describe("multiply: Rational numerator pre-check at 2 * RATIONAL_BIT_LIMIT", () => {
  const allOnes = (1n << BigInt(RATIONAL_BIT_LIMIT)) - 1n; // RATIONAL_BIT_LIMIT bits

  it("a+b-1 == bound, reducing within the limit: computed and accepted", () => {
    const x = allOnes * allOnes; // R2 bits
    expect(bitLength(x) + bitLength(1n) - 1).toBe(R2);
    expect(productCertainlyExceeds(x, 1n, R2)).toBe(false);
    expect(multiply(integer(x), rational(1n, allOnes))).toEqual({
      kind: "rational",
      num: allOnes,
      den: 1n,
    });
  });

  it("a+b-1 == bound, reducing to one bit over: computed, then refused by the post-check", () => {
    const x = 1n << BigInt(R2 - 1); // R2 bits
    const den = 1n << BigInt(RATIONAL_BIT_LIMIT - 1); // reduces x to RATIONAL_BIT_LIMIT + 1 bits
    expect(productCertainlyExceeds(x, 1n, R2)).toBe(false);
    refusal(() => multiply(integer(x), rational(1n, den)));
  });

  it("a+b-1 == bound+1: refused without computing, with the post-check's refusal", () => {
    const x = 1n << BigInt(R2); // R2 + 1 bits
    expect(bitLength(x) + bitLength(1n) - 1).toBe(R2 + 1);
    expect(productCertainlyExceeds(x, 1n, R2)).toBe(true);
    const pre = refusal(() => multiply(integer(x), rational(1n, 3n)));
    const post = refusal(() =>
      multiply(integer(1n << BigInt(R2 - 1)), rational(1n, 1n << BigInt(RATIONAL_BIT_LIMIT - 1))),
    );
    expect(pre.message).toBe(post.message);
    expect(pre.code).toBe(post.code);
  });

  it("computes an ordinary Rational product", () => {
    expect(multiply(rational(1n, 2n), rational(2n, 3n))).toEqual({
      kind: "rational",
      num: 1n,
      den: 3n,
    });
  });
});

describe("power: Rational-part pre-check at 2 * RATIONAL_BIT_LIMIT", () => {
  // A part of bit length b > 1 raised to e has at least (b-1)*e + 1 bits.
  const half = rational(1n, 2n);

  it("computes an ordinary Rational power within the limit", () => {
    expect(power(half, integer(BigInt(RATIONAL_BIT_LIMIT - 1)))).toEqual({
      kind: "rational",
      num: 1n,
      den: 1n << BigInt(RATIONAL_BIT_LIMIT - 1),
    });
  });

  it("lower bound == bound: computed, then refused by the post-check", () => {
    const e = BigInt(R2 - 1); // (2-1)*e + 1 == R2
    expect(powerCertainlyExceeds(2n, e, R2)).toBe(false);
    // 2^(R2-1) has exactly R2 bits: it passes rational()'s pre-reduction
    // bound, and a reduced part of R2 bits is then over RATIONAL_BIT_LIMIT.
    refusal(() => power(half, integer(e)));
  });

  it("lower bound == bound+1: refused without computing, with the post-check's refusal", () => {
    const e = BigInt(R2); // (2-1)*e + 1 == R2 + 1
    expect(powerCertainlyExceeds(2n, e, R2)).toBe(true);
    const pre = refusal(() => power(half, integer(e)));
    const preNegative = refusal(() => power(half, integer(-e)));
    const post = refusal(() => power(half, integer(BigInt(R2 - 1))));
    expect(pre.message).toBe(post.message);
    expect(pre.code).toBe(post.code);
    expect(preNegative.message).toBe(post.message);
  });

  it("a 0, 1 or -1 part is never refused, however large the exponent", () => {
    const huge = (1n << 62n) - 1n;
    for (const part of [0n, 1n, -1n]) expect(powerCertainlyExceeds(part, huge, R2)).toBe(false);
    // The 1 numerator is skipped; only the 2 denominator decides the refusal.
    expect(powerCertainlyExceeds(2n, huge, R2)).toBe(true);
    refusal(() => power(half, integer(huge)));
  });
});

describe("power: the Rational pre-check keeps Ruby's ArgumentError precedence", () => {
  // The messages each exponent gave before the pre-check existed, pinned.
  const exponentTooLarge =
    "evaluate is not supported yet: Ruby raises ArgumentError (exponent is too large) here, " +
    "which is not an evaluation error";
  const sizeLimit =
    "evaluate is not supported yet: an exact intermediate value exceeds this port's size limit " +
    `(${INTEGER_BIT_LIMIT} bits for an Integer, ${RATIONAL_BIT_LIMIT} for a Rational part)`;
  const fixnumMin = -(1n << 62n);
  const fixnumMax = (1n << 62n) - 1n;

  it.each([
    ["-2^62 (Fixnum min; its magnitude is a Bignum)", fixnumMin, exponentTooLarge],
    ["-2^62 - 1 (a Bignum)", fixnumMin - 1n, exponentTooLarge],
    ["+2^62 (a Bignum)", fixnumMax + 1n, exponentTooLarge],
    ["+2^62 + 1 (a Bignum)", fixnumMax + 2n, exponentTooLarge],
    ["-2^62 + 1 (Fixnum magnitude)", fixnumMin + 1n, sizeLimit],
    ["+2^62 - 1 (Fixnum max)", fixnumMax, sizeLimit],
  ])("(1/2) and (3/2) to %s", (_label, e, message) => {
    for (const base of [rational(1n, 2n), rational(3n, 2n)]) {
      expect(refusal(() => power(base, integer(e))).message).toBe(message);
    }
  });
});
