/**
 * Every ported transform rule is exercised by the fixture set.
 *
 * `model-parity.spec.ts` proves the port agrees with the gem on 97 inputs. It
 * cannot prove that a rule was ever REACHED — a rule with a typo in its action
 * passes vacuously if nothing routes to it — so `buildUnicodemathTransform`
 * counts each rule's firings, this suite drives the whole fixture set through
 * one transform, and a rule that never fires is a failure naming its Ruby line.
 *
 * The rule ids are the lines `transform.rb`'s `rule(` calls open on, so a gap
 * reads as "nothing covers transform.rb:1097" rather than as an index.
 *
 * This suite is what makes the slice boundary self-enforcing. The ported set
 * was DERIVED from what the corpus fires on the oracle, so "every ported rule
 * fires" and "every rule the corpus fires is ported" are the same claim seen
 * from two sides: the first is asserted here, the second by `model-parity`'s
 * refusal to leave an unmatched node in a supported input.
 *
 * **Per rule, not per branch.** The counter increments once per action call, so
 * a rule with three arms is "covered" when any one of them runs. Measured
 * rather than assumed: mutating `transform.rb:1097`'s cube-root arm — the
 * `&#x221b;`/`\cbrt` branch — from `Number("3")` to `Number("5")` leaves
 * `model-parity` green, because no corpus string spells a cube root. Widening
 * that needs inputs the corpus does not have, which is the next slice's
 * problem, not a claim this suite should make.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseUnicodemathTree } from "../../../src/formats/unicodemath/parser";
import { buildUnicodemathTransform, shapeOf } from "../../../src/formats/unicodemath/transform";
import { Slice, sequence, simple, Transform } from "../../../src/pegkit/index";

const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureCase {
  readonly input: string;
  readonly preprocessed?: string;
  readonly model?: unknown;
}

const fixtures = JSON.parse(readFileSync(join(HERE, "model-fixtures.json"), "utf8")) as {
  readonly cases: readonly FixtureCase[];
};

/**
 * One transform, driven over every input the gem parsed, counting firings.
 *
 * Driven through `parseUnicodemathTree(entry.input)` — preprocess, parse,
 * AND `Parser#post_processing`'s `#`-label wrap — rather than straight from
 * `entry.preprocessed` through the grammar alone: the `Mlabeledtr` pair
 * (`:598`, `:606`) only ever matches the `{labeled_tr_value:,
 * labeled_tr_id:}` shape that wrap builds, which the grammar alone never
 * produces, so a "table" coverage row that needs them (`"a#b"`, `"a b#c"`)
 * could not reach them any other way. Safe to route every OTHER row through
 * the extra preprocessing step too: `model-parity.spec.ts`'s own "re-derives
 * every recorded preprocessed text from the raw input" already proves
 * `preprocess(entry.input).text` equals the recorded `entry.preprocessed` for
 * every row, so this changes what runs, not what a passing row parses to.
 * Rule ids here are the line a `rule(` call OPENS on.
 */
const build = buildUnicodemathTransform();
let reached = 0;
for (const entry of fixtures.cases) {
  if (entry.model === undefined || entry.preprocessed === undefined) continue;
  build.transform.apply(parseUnicodemathTree(entry.input));
  reached += 1;
}

describe("transform rule coverage", () => {
  it("drove every parseable fixture through one transform", () => {
    expect(reached).toBe(fixtures.cases.filter((entry) => entry.model !== undefined).length);
    expect(reached).toBeGreaterThan(90);
  });

  it("registers the 118 rules the slice carries", () => {
    // 78 corpus-derived (86 the pinned corpus fires on the oracle, minus the
    // eight-rule table/matrix family the first slice deferred: `transform.rb:8`,
    // `:9`, `:14`, `:32`, `:1569`, `:1574`, `:1584`, `:1649`) plus 13
    // MULTISCRIPT — twelve `Math::Function::Multiscript` constructors
    // (`:1992`-`:3978`) and the `:57` unwrap every one of them routes through —
    // reached by the hand-picked "multiscript" coverage group, not the corpus —
    // plus 8 FRACTION, on top of `:1609` (already one of the 78, the corpus's
    // own plain fraction shape): its six option-carrying `Utility.fractions`/
    // `Fenced` siblings (`:1614`, `:2197`, `:2209`, `:2347`, `:2353`,
    // `:2377`), plus the two standalone SUP_DIGITS/SUB_DIGITS unwraps (`:165`,
    // `:170`) `:1614`'s mini shape needs — reached by the hand-picked
    // "fraction" coverage group, not the corpus — plus 19 TABLE: the eight the
    // first slice deferred, the nine more that family needed but the corpus
    // never reached (`:15`, `:598`, `:606`, `:1579`, `:1589`, `:1594`, `:1599`,
    // `:1604`, `:1691`), `:1670`, which a prior survey missed — see the module
    // header — and `:17` (`:13`'s SEQUENCE twin), the one small prerequisite a
    // "table" coverage witness needed — reached by the hand-picked "table"
    // coverage group.
    //
    // The count is rules REGISTERED, not branches reached: the multiscript
    // group carries four extra inputs whose trailing script is fenced, because
    // the twelve that name a rule each all carry BARE scripts, and bypassing
    // every `unfencedValue` call in `:2958`, `:3662`, `:3853` and `:3978` left
    // the suite green without them. The table group carries one input per
    // `Constants::MATRIXS` character (eight) for the same reason: all eight
    // fire `:1649`/`:1670`/`:1691` with an identical trace and take four
    // different branches to eight different table classes.
    expect(build.ruleIds.length).toBe(118);
    expect(new Set(build.ruleIds).size).toBe(118);
    // `transform.rb:845` shares its signature with `:870` and `rule` unshifts,
    // so `:870` wins every tie and `:845` can never match. Porting it would add
    // a rule this suite could never cover.
    //
    // This asserted `"846"` until it was measured: 846 is the CONTINUATION of
    // the header that opens on 845, and every id in `ruleIds` is a `rule(`
    // opening line, so the assertion could not have failed however the port
    // changed.
    expect(build.ruleIds).not.toContain("845");
  });

  it("fires every one of them at least once", () => {
    const never = build.ruleIds.filter((id) => build.fired.get(id) === 0);
    expect(
      never,
      `transform.rb rules no fixture reaches: ${never.join(", ")}. The slice is defined by ` +
        "what the corpus fires on the oracle, so a rule nothing reaches does not belong in it.",
    ).toStrictEqual([]);
  });
});

/**
 * `shapeOf` decides whether a hash the transform left behind is one the GEM
 * also leaves behind, so it has to agree with the engine that does the binding.
 * Checked against `pegkit`'s own `Transform` rather than against a restatement:
 * a one-key tree is driven through a transform carrying a `simple` rule and a
 * `sequence` rule, and which of the two fires — or neither — is the answer
 * `shapeOf` must give.
 */
describe("shapeOf agrees with pegkit's matchers", () => {
  const Values: ReadonlyArray<readonly [label: string, value: unknown]> = [
    ["a slice", new Slice("x", 0)],
    ["a string", "x"],
    ["null", null],
    ["a number", 1],
    ["a node-like object", new (class {})()],
    ["an empty array", []],
    ["an array of leaves", ["a", new Slice("b", 0)]],
    ["an array holding an array", [["a"]]],
    // The nested hashes are keyed `zz`, not `k`: `Transform.apply` rewrites a
    // value BEFORE the enclosing node is matched, so a `{ k: ... }` inner hash
    // would be replaced by one of the probe's own rules and never reach the
    // matcher as a hash at all.
    ["an array holding a hash", [{ zz: "v" }]],
    ["a hash", { zz: "v" }],
    ["an empty hash", {}],
  ];

  it.each(Values.map(([label, value]) => [label, value] as const))("%s", (_label, value) => {
    const probe = new Transform();
    probe.rule({ k: sequence("v") }, () => "sequence");
    probe.rule({ k: simple("v") }, () => "simple");
    const applied = probe.apply({ k: value });
    const engine = typeof applied === "string" ? applied : "other";
    expect(shapeOf(value)).toBe(engine);
  });

  it("drove a value of every shape, so the agreement is not vacuous", () => {
    const shapes = new Set(Values.map(([, value]) => shapeOf(value)));
    expect([...shapes].sort()).toStrictEqual(["other", "sequence", "simple"]);
  });
});
