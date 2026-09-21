/**
 * UnicodeMath parse parity against the oracle: for every fixture input,
 * `parseUnicodemath(input)` → `normalize` must deep-equal the model the gem
 * recorded for `Plurimath::Math.parse(input, :unicode)`.
 *
 * The fixtures are generated, never hand-written
 * (`scripts/generate-unicodemath-model-fixtures.rb`), from one source: every
 * distinct `expected.unicodemath` string in the pinned corpus — UnicodeMath the
 * gem itself emitted, fed back in as a round trip.
 *
 * **The preprocessed text is now DERIVED, not read.** This suite used to feed
 * the grammar each row's recorded `preprocessed` string, because
 * `UnicodeMath::Parser#initialize`'s entity encoding, `⫷…⫸` deletion, `\uXXXX`
 * rewriting, `#` split and strip were a separate slice. `preprocess.ts` carries
 * that pass now, so every row is driven from its RAW `input` through the real
 * entry point, and the first test below asserts the port re-derives each
 * recorded `preprocessed` exactly — the crutch is gone rather than merely
 * unused. Every row moved; none had to stay behind.
 *
 * Refusals are pinned as first-class outcomes: a row with `raises` must fail
 * here too, and a row with a `model` must not.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { parseUnicodemath } from "../../../src/formats/unicodemath/index";
import { preprocess } from "../../../src/formats/unicodemath/preprocess";

const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureCase {
  readonly group: string;
  readonly input: string;
  readonly preprocessed?: string;
  readonly model?: unknown;
  readonly raises?: string;
  readonly raisedIn?: string;
}

interface Fixtures {
  readonly schema: string;
  readonly caseCount: number;
  readonly parsedCount: number;
  readonly raisedCount: number;
  readonly corpusUnicodemathCount: number;
  readonly cases: readonly FixtureCase[];
}

const fixtures = JSON.parse(readFileSync(join(HERE, "model-fixtures.json"), "utf8")) as Fixtures;

/**
 * The CORPUS inputs whose rules this slice still defers.
 *
 * `transform.rb`'s table/matrix family — measured at eighteen rules, not the
 * seventeen a prior survey counted (see `transform.ts`'s module header) —
 * used to be part of this list; `"⒨(a@b)"`, `"ⓢ(a&b@c&d)"` and four other
 * table/matrix-only corpus inputs below reached it (measured on the oracle: no
 * other corpus string fires any of the eighteen). The TABLE increment ported
 * the family, so those six rows have moved out of `DEFERRED_INPUTS` and now
 * compare for real below, in `supported`, the same as every other corpus row.
 * `"✎(blue&y + z)"` (`:1201`) and `"√(3&8)"`/`"√(n&x)"` (`:1530`) also carry a
 * `&` but route through `color`/`root`, not table; all three left this list
 * once their rules were ported (corpus rows, so they compare for real below).
 * Six NARY rows — a large operator with a single-token
 * `_(…)` script — moved the same way once `:1931`/`:1968` landed: `"∏_(k)▒
 * 〖k〗"`, `"∮_(C)▒〖f〗"`, `"⋃_(i) A_(i)"`, `"⋂_(i) A_(i)"`, `"∐_(i) A_(i)"`,
 * `"⨁_(i) A_(i)"`.
 *
 * They are listed here rather than dropped from the fixture set, because the
 * fixture set is the ORACLE's answer and stays complete. What is asserted is
 * that the port REFUSES them: with those rules absent the unmatched nodes reach
 * `finalize` as plain hashes and it throws, naming the keys. When a family
 * lands, its inputs move from this list into the parity list and the count
 * below fails until they do — so this list is a ratchet, not a suppression. An
 * input that starts parsing CORRECTLY fails here just as loudly as one that
 * starts parsing wrongly.
 *
 * The four UNICODE SPACE rows (NBSP and THREE-PER-EM SPACE runs, `"a \u00a0\u00a0 b"`
 * and its three siblings) left this list when `:104`, the `spaces` leaf, was
 * ported: with it registered all four parse to the oracle's model.
 *
 * The list grew from two to twenty-six when the corpus pin advanced to
 * `281d7003` (PR #84), which added cases reaching four families this port has
 * not started, then shrank by the six table/matrix-only rows the TABLE
 * increment above ported.
 */
const DEFERRED_INPUTS: readonly string[] = [
  // DECORATION (`transform.rb:1286`-`:1491`) is ported now (`transform.ts`'s
  // module header). Three of the six corpus rows that used to sit here moved
  // out to `supported` below: `"⏟(a b)"`, `"⏟(a + b)"` and `"⏟(x)_(y)"` all
  // route only through `hbracket_class`. `"((a)̅)̅"` moved out with `:2640`
  // (the `accents` + paren combination, the FENCED slice), `"(y)┴(x)"`/
  // `"(y)┬x"` with `:969`/`:977`, and `"√(3&8)"`/`"√(n&x)"` with `:1530`; each
  // now compares for real, as a corpus row.
  // `"x^y^(z)"` (`:985`, a right-associative double exponent) sat here until
  // the SCRIPT/SUBSUP/BASE builders landed; it is a `supported` corpus row now.

  // UNICODE SPACE characters, not runs of ASCII spaces — the distinction
  // matters, because a plain-space literal here silently fails to match the
  // fixture and the case quietly rejoins the parity list. Measured from the
  // fixture bytes: NBSP (U+00A0) and THREE-PER-EM SPACE (U+2004). The grammar
  // maps only the ASCII space today.
  "a \u00a0\u00a0 b",
  "a \u00a0\u00a0 b \u00a0\u00a0 c",
  "a \u2004 b",
  "a \u00a0\u00a0\u00a0\u00a0 b",
];

const corpus = fixtures.cases.filter((entry) => entry.group === "corpus-unicodemath");
const boundary = fixtures.cases.filter((entry) => entry.group === "slice-boundary");
// Every row that is neither the corpus nor a boundary case: the RULE_COVERAGE
// groups the generator adds, one per ported family. This started as an
// afterthought and became the majority path — the corpus can no longer reach
// the rules being ported, so each new family arrives with its own group here.
const coverage = fixtures.cases.filter(
  (entry) => entry.group !== "corpus-unicodemath" && entry.group !== "slice-boundary",
);
const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const raised = fixtures.cases.filter((entry) => entry.raises !== undefined);
const deferred = corpus.filter(
  (entry) => entry.model !== undefined && DEFERRED_INPUTS.includes(entry.input),
);
const supported = corpus.filter(
  (entry) => entry.model !== undefined && !DEFERRED_INPUTS.includes(entry.input),
);
// The corpus does not reach the rules a slice has just ported -- that is why
// each family arrives with a coverage group -- so `supported` above, drawn from
// `corpus` alone, compares the model of nothing this slice added. Measured: with
// only that comparison, changing a newly ported fraction rule's options to
// `displaystyle: true` still passed every test in this file. The firing counts
// and the preprocessing checks do not see a wrong VALUE.
const coverageSupported = coverage.filter((entry) => entry.model !== undefined);

function parseFixture(entry: FixtureCase): unknown {
  return parseUnicodemath(entry.input);
}

describe("the UnicodeMath fixture set", () => {
  it("is the schema this suite reads", () => {
    expect(fixtures.schema).toBe("plurimath-corpus/unicodemath-model/1");
  });

  // A suite that quietly ran zero cases has happened in this repository before;
  // the counts are pinned so a fixture regeneration that empties a category
  // fails here rather than passing green.
  it("has the counts its header records", () => {
    expect(fixtures.cases.length).toBe(fixtures.caseCount);
    expect(parsed.length).toBe(fixtures.parsedCount);
    expect(raised.length).toBe(fixtures.raisedCount);
    expect(parsed.length + raised.length).toBe(fixtures.caseCount);
    expect(corpus.length).toBe(fixtures.corpusUnicodemathCount);
    // Not `corpus + boundary`: that held only while those were the only two
    // groups, and silently became false the moment a coverage group arrived.
    expect(corpus.length + boundary.length + coverage.length).toBe(fixtures.caseCount);
    // And the coverage rows have to BE there. A regeneration that dropped every
    // one of them would keep the sum above consistent while quietly removing
    // the only inputs that reach the newly ported rules.
    expect(coverage.length).toBeGreaterThan(0);
  });

  // The crutch this slice removed. Every row carries the `Parser#text` the gem
  // produced; the port must re-derive it from the raw input, or the parity
  // results below would be measuring the grammar against text it was handed
  // rather than text it computed.
  it("re-derives every recorded preprocessed text from the raw input", () => {
    expect(fixtures.cases.every((entry) => entry.preprocessed !== undefined)).toBe(true);
    for (const entry of fixtures.cases) {
      expect(preprocess(entry.input).text).toBe(entry.preprocessed);
    }
  });

  it("draws its parity inputs from the pinned corpus's own UnicodeMath output", () => {
    expect(corpus.length).toBeGreaterThan(50);
    expect(boundary.length).toBeGreaterThan(0);
    // Every boundary input is one the GEM parses; a row that the gem refused
    // would prove nothing about the slice edge.
    expect(boundary.every((entry) => entry.model !== undefined)).toBe(true);
  });

  it("defers exactly the corpus inputs the still-unported families serve", () => {
    expect(deferred.length).toBe(DEFERRED_INPUTS.length);
    const corpusParsed = corpus.filter((entry) => entry.model !== undefined).length;
    expect(supported.length).toBe(corpusParsed - DEFERRED_INPUTS.length);
    expect(supported.length).toBeGreaterThan(90);
  });
});

describe("the parsed model", () => {
  it.each(supported.map((entry) => [entry.input, entry] as const))(
    "%j: deep-equals the gem's",
    (_input, entry) => {
      expect(normalize(parseFixture(entry) as never)).toStrictEqual(entry.model);
    },
  );
});

describe("the parsed model, for the hand-picked coverage inputs", () => {
  it("has rows to compare at all", () => {
    expect(coverageSupported.length).toBeGreaterThan(0);
  });

  it.each(coverageSupported.map((entry) => [entry.input, entry] as const))(
    "%j: deep-equals the gem's",
    (_input, entry) => {
      expect(normalize(parseFixture(entry) as never)).toStrictEqual(entry.model);
    },
  );
});

describe("the rule families this slice defers", () => {
  it.each(deferred.map((entry) => [entry.input, entry] as const))(
    "%j: refuses loudly, naming the unmatched keys",
    (_input, entry) => {
      // The transform's own message survives the entry point's normalisation,
      // so the refusal still names the keys — but it now reaches a caller as a
      // `ParseError` rather than a bare `Error`, which is what the gem's public
      // boundary does with anything a `StandardError` escapes into.
      expect(() => parseFixture(entry)).toThrow(ParseError);
      expect(() => parseFixture(entry)).toThrow(/no rule matched \{/);
    },
  );
});

/**
 * The slice EDGE: inputs the corpus reaches that fire an unported rule.
 *
 * Each of these fires one `transform.rb` rule the port does not carry — `:99`,
 * `:765`, `:745`, `:1791` — and the gem answers each with a perfectly ordinary
 * model, recorded in the fixture row beside it. The port must REFUSE rather
 * than answer differently, and two of the four are here because it did not:
 *
 *   - `±` reaches the transform as a ROOT hash, and `Kernel#Array`'s fold into
 *     `[key, value]` pairs used to happen before anything validated it, so the
 *     port returned `Formula([["combined_symbols", "&#xb1;"]])` where the gem
 *     returns `Formula([Pm])`.
 *   - `x a/b c` leaves `{frac:, expr:}` — the same KEY SET the corpus's
 *     `(a)/(+) b` leaves unmatched, but with both values resolved, which is the
 *     case rule `:1791` matches. A key-set allowlist admitted it; the shape
 *     signature the port now records does not.
 */
describe("inputs whose rules sit outside the slice", () => {
  it.each(boundary.map((entry) => [entry.input, entry] as const))(
    "%j: is refused rather than answered differently",
    (_input, entry) => {
      expect(() => parseFixture(entry)).toThrow(ParseError);
      expect(() => parseFixture(entry)).toThrow(/no rule matched \{/);
    },
  );
});

describe("the inputs the gem refuses", () => {
  it.each(raised.map((entry) => [entry.input, entry] as const))(
    "%j: is refused here too",
    (_input, entry) => {
      // Every row here raised `Plurimath::Math::ParseError` inside `parse`
      // (`raisedIn`), which for UnicodeMath means the grammar itself refused —
      // there is no `rescue` under `lib/plurimath/unicode_math/`. The port's
      // grammar throws `ParseFailed`, and this suite now stands AT the public
      // boundary, so the refusal must arrive as a `ParseError` carrying the
      // format token the gem names in its own message.
      expect(entry.raisedIn).toBe("parse");
      let thrown: unknown;
      try {
        parseFixture(entry);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ParseError);
      const failure = thrown as ParseError;
      expect(failure.format).toBe("unicode");
      expect(failure.input).toBe(entry.input);
      // The position indexes the CALLER's input, never the encoded text.
      expect(failure.index).toBeLessThanOrEqual(entry.input.length);
    },
  );
});

/**
 * `"∫∫f g"` — bare doubled-nary, not carried by the pinned corpus, so it lives
 * here rather than in the fixture set. Both the gem and the port ultimately
 * refuse it, but at different PHASES, measured directly against the oracle
 * (`plurimath-oracle`, 2026-09-15) rather than assumed from the fixture shape:
 *
 *   - `Plurimath::Math.parse("∫∫f g", :unicode)` does not raise. It returns a
 *     `Formula` whose value is
 *     `[[:nary, {nary_class: "&#x222b;", naryand: [Int(…), Symbol("g")]}]]` —
 *     `Kernel#Array` folding the outermost `{nary:, ...}` hash into its
 *     `[key, value]` pairs, same as the `±`/`(a)/(+) b` cases this port
 *     already reproduces. The malformed `Formula` is handed back successfully.
 *   - Only RENDERING it raises: `formula.to_unicodemath` throws
 *     `Plurimath::Math::ParseError`, because no renderer branch reads a
 *     `[:nary, Hash]` pair.
 *
 * The port refuses earlier: `nary=other` is not in
 * `GEM_UNMATCHED_SIGNATURES` (measured — no pinned corpus input produces it),
 * so `assertGemLeavesUnmatched` throws at the FORMULA root, before the
 * `Kernel#Array` pair-fold equivalent in `finalizeUnicodemathParse` ever runs.
 * `parseUnicodemath` itself refuses, where the gem's `Math.parse` would not.
 *
 * This is the measured, accepted divergence Codex's review of #116 flagged as
 * undocumented: WHEN each side refuses differs (parse-time here, render-time
 * on the gem), but WHETHER either side produces usable output does not — both
 * refuse. Nothing here says the phase difference is a bug to fix; it is
 * recorded so a future change to `GEM_UNMATCHED_SIGNATURES` or to
 * `finalizeUnicodemathParse`'s ordering trips this test rather than silently
 * moving the refusal's phase.
 */
describe("a doubled nary the gem parses but cannot render", () => {
  const input = "∫∫f g";

  it("is refused by the port at parse time, naming the nary signature", () => {
    expect(() => parseUnicodemath(input)).toThrow(ParseError);
    expect(() => parseUnicodemath(input)).toThrow(/no rule matched \{nary=other\}/);
  });
});
