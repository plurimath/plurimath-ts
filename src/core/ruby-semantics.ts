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
 * The `toString` implementations JavaScript supplies, as opposed to one a
 * caller wrote.
 *
 * The discriminator was `toString !== Object.prototype.toString`, which is too
 * permissive: a built-in overrides `toString` too, and spells the result
 * differently from the Ruby type it corresponds to. A review round measured the
 * damage — every one of these bypassed the number rules or the format entirely:
 *
 *   new Number(1.5e-5)  js "0.000015"   ruby Float   "1.5e-05"
 *   new Number(1e21)    js "1e+21"      ruby Integer "1000000000000000000000"
 *   new Number(-0)      js "0"          ruby Float   "-0.0"
 *   /ab/                js "/ab/"       ruby Regexp  "(?-mix:ab)"
 *   new Date(0)         js "Thu Jan 01 1970 …"       ruby Time "1970-01-01 …"
 *
 * A boxed primitive is not a special case worth unwrapping: Ruby has no boxing,
 * so a caller reaching this with `new Number(x)` meant to pass `x`, and the
 * primitive path already handles that exactly.
 */
const BUILTIN_TO_STRING: ReadonlySet<unknown> = new Set([
  Object.prototype.toString,
  Array.prototype.toString,
  Boolean.prototype.toString,
  Date.prototype.toString,
  Error.prototype.toString,
  Function.prototype.toString,
  Number.prototype.toString,
  RegExp.prototype.toString,
  String.prototype.toString,
  Symbol.prototype.toString,
]);

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
    // Ruby calls `to_s`; JavaScript calls `toString`. Where the caller has
    // SUPPLIED one, that is a faithful port and the value is reproducible —
    // measured, both sides give "CUSTOM!":
    //
    //   ruby  Symbol.new(obj_with_custom_to_s).value  "CUSTOM!"
    //   js    String({ toString: () => "CUSTOM!" })   "CUSTOM!"
    //
    // Refusing those was an over-correction, and a reviewer was right to call
    // it: the port refused an input the oracle accepts and JS can reproduce.
    //
    // What is NOT reproducible is an object still carrying the DEFAULT
    // `toString`, because the two languages disagree there and neither answer
    // can be derived from the other:
    //
    //   ruby  Symbol.new({a: 1}).value      "{a: 1}"        (Hash#to_s is inspect)
    //   ruby  Symbol.new(Object.new).value  "#<Object:0x…>" (carries an address)
    //   js    String({ a: 1 })              "[object Object]"
    //
    // A Hash could in principle be reproduced, but its inspect form depends on
    // the KEY TYPE and JS sees Symbol and String keys alike as strings. The
    // gem's own constants are uniformly Symbol-keyed — measured,
    // `TABLE_PARENTHESIS`, `PARENTHESIS`, `FONT_STYLES` and `OMML_NAMESPACES`
    // all give `keys.map(&:class).uniq == [Symbol]`.
    //
    // TWO review rounds read those as String-keyed, from two different
    // misreadings, so both are recorded here. In SOURCE, `{"a": 1}` is quoted
    // SYMBOL syntax and means `{:a => 1}`. In INSPECT output, Ruby >= 3.4 quotes
    // a symbol key that is not a valid identifier, so `:"["` prints as `"[":`.
    // The discriminator is the separator, not the quotes: a String key prints
    // with `=>`, a Symbol key with `:`.
    const printed = (value as { readonly toString?: unknown }).toString;
    if (typeof printed === "function" && !BUILTIN_TO_STRING.has(printed)) return null;
    return "this object carries a built-in toString, which JavaScript and Ruby spell differently";
  }
  return `a ${typeof value} has no Ruby equivalent here`;
}
