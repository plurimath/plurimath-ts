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
