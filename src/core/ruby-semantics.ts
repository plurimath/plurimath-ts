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

import { RenderError } from "./errors";

/**
 * Refuses a Ruby hash iteration whose order a JavaScript object has already
 * lost. Ordinary-object enumeration hoists array-index keys into numeric order
 * regardless of where the caller inserted them; the original Ruby insertion
 * position cannot be reconstructed at an emission site.
 */
export function assertReproducibleRubyHashOrder(
  hash: object,
  format: string,
  kind: string,
  at: string,
): void {
  for (const key of Object.keys(hash)) {
    const index = Number(key);
    const isArrayIndex =
      Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
    if (isArrayIndex) {
      throw new RenderError(
        `${at}.${key}: integer-like hash keys are deferred (TODO.plan/deferred.md) because ` +
          "JavaScript object enumeration discards their insertion position, so Ruby hash " +
          "emission order cannot be reproduced",
        format,
        kind,
      );
    }
  }
}

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
    // EVERY object is refused, deliberately, after four review rounds each
    // found a hole in a cleverer rule. The history is the argument:
    //
    //   round 5: plain objects became "[object Object]" inside an array.
    //   round 6: refusing all objects was called an over-correction, because
    //            the gem accepts one with a custom `to_s` and JS can reproduce
    //            it — so the rule became "accept unless toString is
    //            Object.prototype.toString".
    //   round 7: that admitted BUILT-INS, which override toString and spell
    //            results differently — `new Number(1.5e-5)` gave "0.000015"
    //            where a Ruby Float gives "1.5e-05". So the rule became
    //            "accept unless toString is one of the built-in ones".
    //   round 8: that check is identity-based, so a built-in from ANOTHER
    //            REALM slips through; and it is simultaneously too strict,
    //            refusing `Symbol.toPrimitive`-only objects and boxed String
    //            and Boolean, which `String(value)` reproduces exactly.
    //
    // Round 8 also named why no rule works: the gem's contract is
    // `sym&.to_s` — "whatever coercion produces". Deciding that from a JS
    // object is not possible, because what Ruby would print depends on a Ruby
    // object that does not exist here. Every classification is a guess about a
    // correspondence that is not defined.
    //
    // Refusing is the conservative direction: loud and recoverable, where a
    // wrong guess is silent. And it costs nothing real — round 5 traced every
    // producer on the parse path and found only `null` and strings, and the
    // declared slot type is `string | null`, so reaching here is already a
    // caller type violation.
    return "an object cannot be coerced the way Ruby's to_s would coerce it, because what Ruby would print depends on a Ruby object that does not exist here";
  }
  return `a ${typeof value} has no Ruby equivalent here`;
}

/* -------------------------------------------------------------------------
 * `Array#inspect`, which is also `Array#to_s`.
 *
 * Three render sites hand a raw slot value to something that calls `to_s` on
 * it — `Number#to_latex` and `Number#to_unicodemath` through
 * `Formatter::Numbers::TextRenderer.render`, which answers `result.to_s` for
 * anything that is not a `FormattedNumber` (`text_renderer.rb:25`), and
 * `Color#to_latex` through the `Number#to_asciimath` that rides the same
 * renderer. For an Array that `to_s` IS `inspect`, so the gem RENDERS a list
 * in those slots and this port has to spell the same bytes.
 *
 * Everything below was measured on the pinned oracle 00c52783 (plurimath
 * 0.11.6, ruby 4.0.1) THROUGH those render sites rather than off a bare
 * `inspect` — probe1.rb, probe2.rb and probe4.rb, 2026-09-09. The string
 * sweep in probe2.rb covers every codepoint in U+0000..U+10FFFF and asserts
 * per codepoint that `Number.new([<char>]).to_latex(options: {})` equals
 * `"[" + <char>.inspect + "]"`: 0 mismatches over 1,112,064 codepoints (the
 * whole range less the surrogates, which no UTF-8 string can hold).
 * ---------------------------------------------------------------------- */

/**
 * The ten codepoints `String#inspect` writes as a NAMED escape. Every other
 * escaped codepoint takes a `\uXXXX` or `\u{…}` body.
 *
 * `JSON.stringify` agrees on five of these — `\b`, `\t`, `\n`, `\f`, `\r`
 * (and on `\"` and `\\`, which are the same two characters in both) — and
 * disagrees on `\a`, `\v` and `\e`, which it spells `\u0007`, `\u000b` and
 * `\u001b`. So a "Ruby and JavaScript agree on none of this" summary of the
 * table would be wrong; the table is needed for the three that differ.
 */
const RUBY_INSPECT_NAMED_ESCAPES: ReadonlyMap<number, string> = new Map([
  [0x07, "\\a"],
  [0x08, "\\b"],
  [0x09, "\\t"],
  [0x0a, "\\n"],
  [0x0b, "\\v"],
  [0x0c, "\\f"],
  [0x0d, "\\r"],
  [0x1b, "\\e"],
  [0x22, '\\"'],
  [0x5c, "\\\\"],
]);

/** The three characters after a `#` that make Ruby escape it. */
const RUBY_INSPECT_HASH_FOLLOWERS: ReadonlySet<string> = new Set(["{", "$", "@"]);

/**
 * The highest codepoint this port will spell.
 *
 * NOT a fact about Ruby, and the distinction matters for the refusal message.
 * Ruby escapes exactly the codepoints it treats as non-printable, and the
 * sweep found 814,799 codepoints whose inspect body is not the character
 * itself — 10 named escapes, 1,429 spelled `\uXXXX` and 813,360 spelled
 * `\u{…}` — interleaved with printable ones that pass through verbatim.
 * Reproducing that needs a Unicode printability table, which this port does
 * not carry and could not keep in step with Ruby's Unicode version anyway.
 *
 * So the line is drawn where the port can be exhaustive from a rule rather
 * than a table: U+0000..U+0377, inside which the escaped set is exactly the
 * C0 controls, `"`, `\` and the C1 block. U+0378 is the first escaped
 * codepoint above the C1 block (measured, probe4.rb), so U+0377 is the last
 * one this rule covers. Above it the answer is a refusal even for the
 * codepoints Ruby WOULD pass through verbatim (π at U+03C0, 😀 at U+1F600) —
 * refusing something that would have matched is loud and recoverable, where
 * spelling one that would not is silent.
 */
const RUBY_INSPECT_VERBATIM_MAX = 0x377;

/**
 * Ruby's `String#inspect`, quotes included, or `null` above the range this
 * port spells from a rule (`RUBY_INSPECT_VERBATIM_MAX`).
 *
 * Inside U+0000..U+0377, measured exhaustively:
 *
 *   - the ten named escapes above;
 *   - every other codepoint below U+0020, plus U+007F..U+009F, as `\uXXXX`
 *     with four digits and UPPERCASE hex — `\u001A`, never `\u001a`;
 *   - `#` escaped ONLY before `{`, `$` or `@`, where Ruby would have read an
 *     interpolation: `"a#b"` inspects as `"a#b"`, `'a#{b}'` as `"a\#{b}"`;
 *   - everything else verbatim, U+00A0..U+0377 included (é is `"é"`).
 *
 * An unpaired surrogate is refused by the ceiling: no UTF-8 Ruby string can
 * hold one, so there is nothing to be byte-identical to.
 */
function rubyStringInspect(value: string): string | null {
  let body = "";
  // The UTF-16 offset one past the character just consumed — `for…of` walks
  // codepoints, and the `#` rule needs to look at the next code unit.
  let next = 0;
  for (const character of value) {
    next += character.length;
    const codepoint = character.codePointAt(0) as number;
    if (codepoint > RUBY_INSPECT_VERBATIM_MAX) return null;

    const named = RUBY_INSPECT_NAMED_ESCAPES.get(codepoint);
    if (named !== undefined) {
      body += named;
      continue;
    }
    if (codepoint < 0x20 || (codepoint >= 0x7f && codepoint <= 0x9f)) {
      body += `\\u${codepoint.toString(16).toUpperCase().padStart(4, "0")}`;
      continue;
    }
    if (character === "#" && RUBY_INSPECT_HASH_FOLLOWERS.has(value[next] ?? "")) {
      body += "\\#";
      continue;
    }
    body += character;
  }
  return `"${body}"`;
}

/** One element's inspect, or the reason it has no reproducible spelling. */
type ElementInspect = { readonly text: string } | { readonly why: string };

/**
 * A number element's inspect.
 *
 * The ambiguity that governs this is Ruby's Integer/Float split against
 * JavaScript's single numeric type, and it decides each arm:
 *
 *   - `-0` has ONE preimage. Ruby has no Integer negative zero, so the JS
 *     value can only be the Float `-0.0` (measured: `[-0.0]` => `"[-0.0]"`).
 *   - NaN and ±Infinity have one preimage each and identical spellings
 *     (measured: `"[NaN]"`, `"[Infinity]"`, `"[-Infinity]"`).
 *   - Every other INTEGRAL value has two, and they inspect differently:
 *     `[5]` is `"[5]"` and `[5.0]` is `"[5.0]"`. Refused. This is also why
 *     `rubyNumberToS` cannot simply be delegated to here — it resolves the
 *     ambiguity by taking the Integer reading, which is the right answer for
 *     a slot the gem coerces with `to_s` and the wrong one for a slot it
 *     inspects (`1e21` would spell `"1000000000000000000000"` where the gem's
 *     Float says `"1.0e+21"`).
 *   - A NON-integral finite value has one preimage — no Integer is 1.5 — so
 *     it is admitted wherever the two languages spell it alike, which is the
 *     band `rubyNumberToS` already carries. Outside it they diverge
 *     (`[1.5e-5]` is `"[1.5e-05]"` in Ruby, `"0.000015"` in JavaScript).
 *
 * There is no unambiguous way for a caller to MEAN the Integer: `inspectElement`
 * explains why a BigInt is not an arm.
 */
function inspectNumber(value: number, at: string): ElementInspect {
  if (Object.is(value, -0)) return { text: "-0.0" };
  if (!Number.isFinite(value)) return { text: String(value) };
  if (Number.isInteger(value)) {
    return {
      why:
        `${at}: the integral number ${String(value)} has two Ruby preimages whose ` +
        'inspect differs — Integer 5 spells "5" where Float 5.0 spells "5.0", and ' +
        'Integer 10**21 spells "1000000000000000000000" where Float 1e21 spells ' +
        '"1.0e+21" — and one JavaScript number cannot choose between them',
    };
  }
  const printed = rubyNumberToS(value);
  if (printed !== null) return { text: printed };
  // Unreachable in practice: for a non-integral finite number `rubyNumberToS`
  // answers null on exactly the condition `rubyUnreproducible` describes, so
  // the fallback is here only because the shared helper's type allows null.
  return {
    why: `${at}: ${
      rubyUnreproducible(value) ?? "Ruby's Float#to_s and JavaScript's do not agree on this value"
    }`,
  };
}

/**
 * One element of an inspected Array, recursively.
 *
 * Admitted, all measured through a real render: `nil` (JavaScript's `null`),
 * `true`, `false`, the numbers `inspectNumber` allows, strings through
 * `rubyStringInspect`, and nested arrays joined by `", "` — comma AND space,
 * measured (`[nil, nil]` is `"[nil, nil]"`).
 *
 * Refused: everything else. An object is the interesting case, because the
 * reason is not one thing. `[Object.new]` inspects as
 * `"[#<Object:0x000071bfcee272f0>]"` — a heap address that is not stable
 * even between two runs of Ruby — and a JS object cannot say it stands for a
 * Hash rather than for that. Even granting it is a Hash, it cannot say
 * whether a key was the Symbol `:a` or the String `"a"`: measured, `[{a: 1}]`
 * inspects as `"[{a: 1}]"` and `[{"a" => 1}]` as `"[{\"a\" => 1}]"`, and both
 * are the same JavaScript object. The empty case is not carved out, because
 * "this object is a Hash at all" is exactly the part that cannot be decided.
 *
 * A BigInt is deliberately NOT an arm. It would be the one unambiguous
 * spelling of a Ruby Integer — the ambiguity `inspectNumber` refuses — but
 * `assertSlot` in `./validate.ts` rejects a bigint in any node slot before a
 * renderer sees it, so an arm here would be code no caller can reach. If that
 * grammar ever admits one, `[5n]` should render `"[5]"`; the render specs pin
 * today's refusal so the change is caught here rather than assumed.
 *
 * `undefined` is folded into the nil arm for the same reason `interpolatedValue`
 * and `describeSlot` do it — the two JS nils stand for the one Ruby nil — and
 * not because a render site can deliver one: `assertSlot` rejects an explicit
 * `undefined` list entry too.
 */
function inspectElement(value: unknown, at: string): ElementInspect {
  if (value === null || value === undefined) return { text: "nil" };
  if (typeof value === "boolean") return { text: String(value) };
  if (typeof value === "number") return inspectNumber(value, at);
  if (typeof value === "string") {
    const inspected = rubyStringInspect(value);
    if (inspected === null) {
      return {
        why:
          `${at}: the string holds a codepoint above U+0377, and up there Ruby's ` +
          "String#inspect escapes exactly the codepoints it treats as non-printable " +
          "(814,732 of them above U+0377, measured) — this port carries no printability " +
          "table, so it refuses rather than guess, including for the codepoints Ruby " +
          "would have passed through",
      };
    }
    return { text: inspected };
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const [index, item] of value.entries()) {
      const part = inspectElement(item, `${at}[${index}]`);
      if ("why" in part) return part;
      parts.push(part.text);
    }
    return { text: `[${parts.join(", ")}]` };
  }
  if (typeof value === "object") {
    return {
      why:
        `${at}: an object inspects with its class and heap address ` +
        "(#<Object:0x…>), which is not stable between runs — and a JavaScript " +
        "object cannot say it stands for a Hash instead, nor whether a Hash key " +
        'was the Symbol :a or the String "a", which inspect as {a: 1} and {"a" => 1}',
    };
  }
  return { why: `${at}: ${rubyUnreproducible(value) ?? `a ${typeof value} has no Ruby inspect`}` };
}

/**
 * `Array#inspect`, or a `RenderError` naming the element that stopped it.
 *
 * The throwing shape lives here, next to the rules, rather than in each
 * format's `render-shared.ts`: three render sites in two formats need the
 * same answer, and a format helper cannot be shared across formats (§3 rule
 * 8). `assertReproducibleRubyHashOrder` above takes the same
 * `format`/`kind`/`at` triple for the same reason.
 *
 * `at` is the slot path and grows an index per level, so a refusal says WHICH
 * element it could not spell — `number.value[1][1]`, not just "the list".
 */
export function rubyArrayInspectOrThrow(
  value: readonly unknown[],
  format: string,
  kind: string,
  at: string,
): string {
  const result = inspectElement(value, at);
  if ("why" in result) throw new RenderError(result.why, format, kind);
  return result.text;
}
