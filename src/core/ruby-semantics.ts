/**
 * Ruby value semantics the port has to reproduce, in one place.
 *
 * These are properties of the LANGUAGE, not of any output format, and two
 * copies of them had already started to drift: `render-shared.ts` carried the
 * float rules for interpolating an option value, and `nodes.ts` grew a second
 * copy for coercing a symbol's value at construction. Five review rounds found
 * defects in that surface, several of them in one copy but not the other. One
 * implementation, measured once.
 */

/**
 * Ruby prints a Float in plain decimal on `[1e-4, 1e15)` and switches to
 * scientific outside it; JavaScript switches at `1e-6` and `1e21`. So Ruby's
 * plain range is the narrower, and inside it both print the same shortest
 * round-trip digits — verified over 5,000 random non-integral values in the
 * band, 5,000 agreements and 0 disagreements.
 *
 * The upper edge is CONSERVATIVE rather than exact. Ruby's choice is not decided
 * by magnitude alone: `1.5e15` prints as `"1.5e+15"` while `1202471614443916.8`,
 * at the same magnitude, prints in full. Some non-integral values at or above
 * 1e15 would therefore agree and are refused anyway. Refusing something that
 * would have matched is loud and recoverable; emitting something that does not
 * is silent and is not.
 */
const RUBY_PLAIN_FLOAT_MIN = 1e-4;
const RUBY_PLAIN_FLOAT_MAX = 1e15;

/**
 * A JS number as Ruby's `to_s` would print it, or `null` where the two
 * genuinely disagree and the caller must refuse rather than guess.
 *
 * Measured against the pinned oracle:
 *
 *   -0        "-0.0"    the one decidable integral case: Ruby has no Integer
 *                       negative zero, so a JS -0 can only be that Float
 *   5         "5"       integral values take the Integer reading, which is the
 *   1e21      "1000000000000000000000"   undecidable case — JS cannot tell `1`
 *                       from `1.0`, and `String(1e21)` would give "1e+21",
 *                       which Ruby's Integer#to_s never produces
 *   1.5       "1.5"     non-integral inside the band
 *   NaN       "NaN"     agree exactly
 *   Infinity  "Infinity"
 *   1.5e-5    null      Ruby "1.5e-05", JS "0.000015"
 *
 * Above 2^53 the integral value may not be the Integer the caller meant, and no
 * formatting choice recovers it — `10**30` is exact in Ruby while JS's `1e30`
 * IS `1000000000000000019884624838656`. That is a property of the double.
 */
export function rubyNumberToS(value: number): string | null {
  if (Object.is(value, -0)) return "-0.0";
  if (Number.isInteger(value)) return BigInt(value).toString();
  if (Number.isNaN(value) || !Number.isFinite(value)) return String(value);

  const magnitude = Math.abs(value);
  if (magnitude >= RUBY_PLAIN_FLOAT_MIN && magnitude < RUBY_PLAIN_FLOAT_MAX) {
    return String(value);
  }
  return null;
}

/**
 * Why a value cannot be reproduced, for an error message. Returns `null` when
 * it CAN be — every caller here refuses only the shapes this names.
 */
export function rubyUnreproducible(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "bigint") {
    return null;
  }
  if (typeof value === "number") {
    return rubyNumberToS(value) === null
      ? `the number ${String(value)} falls outside the range where Ruby's Float#to_s and JavaScript's agree`
      : null;
  }
  if (Array.isArray(value)) return null;
  if (typeof value === "object") {
    // An arbitrary Ruby object prints via its own `to_s`, which cannot be
    // reproduced in JavaScript at all: a Range gives "1..3", a Struct
    // "#<struct ...>", a custom class whatever it defines. A plain Hash could in
    // principle be reproduced — its form depends on key type (`{a: 1}` for
    // Symbol keys, `{"a" => 1}` for String keys) and JS sees both as strings,
    // but the gem's own constants are uniformly Symbol-keyed, so that default
    // would be defensible. Measured: `TABLE_PARENTHESIS`, `PARENTHESIS`,
    // `FONT_STYLES` and `OMML_NAMESPACES` all have `keys.map(&:class).uniq ==
    // [Symbol]`. A review round claimed these were String-keyed and mixed; that
    // was a misreading of Ruby's quoted-symbol syntax, where `{"a": 1}` is
    // `{:a => 1}`, and it is recorded here because the claim was briefly
    // believed and written into this file.
    //
    // Hashes are refused anyway, because nothing reaches this branch — the
    // parse path hands this slot only `null` or a string — and one refusal is
    // simpler to keep true than two behaviours.
    return "an arbitrary Ruby object prints via its own to_s, which JavaScript cannot determine";
  }
  return `a ${typeof value} has no Ruby equivalent here`;
}
