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
    // A Ruby Hash prints as its `inspect`, and the form depends on the KEY TYPE
    // — `{a: 1}` for Symbol keys, `{"a" => 1}` for String keys — which JS cannot
    // distinguish, since both arrive as JS strings. A reviewer confirmed the
    // gem's own constants use both: `TABLE_PARENTHESIS` and `PARENTHESIS`
    // (asciimath/constants.rb) are String-keyed, `FONT_STYLES` (utility.rb) is
    // mixed. So there is no safe default. And an arbitrary Ruby object prints
    // via its own `to_s`, which cannot be reproduced at all: a Range gives
    // "1..3", a Struct "#<struct ...>", a custom class whatever it defines.
    return "a Ruby Hash prints by key type and an arbitrary object by its own to_s, neither of which JavaScript can determine";
  }
  return `a ${typeof value} has no Ruby equivalent here`;
}
