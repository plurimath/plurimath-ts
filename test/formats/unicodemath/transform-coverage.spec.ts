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
 *
 * The still-deferred-family inputs (`DEFERRED_INPUTS` in
 * `model-parity.spec.ts`) are driven too: their transform runs to completion
 * and only `finalize` refuses them, so their rule firings count here even
 * though `model-parity.spec.ts` expects a refusal.
 *
 * They are NOT special cover for anything. This said they were "the sole cover
 * for `transform.rb:2619` on a `Fenced` built around a table"; measured, they
 * fire `:13`, `:18`, `:39` and `:92` and never reach `:2619` at all — they are
 * refused at the FORMULA root with `{table=...}`, so no `Fenced` is built.
 * `:2619` fires 40 times across 32 other rows, starting with `(x)` and `{x}`.
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

  it("registers the 188 rules the slice carries", () => {
  it("registers the 210 rules the slice carries", () => {
  it("registers every rule the slice carries", () => {
  it("registers the rules the slice carries", () => {
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
    // coverage group — plus 11 DECORATION: seven of the eight rules
    // `transform.rb:1286`-`:1491` builds (`:1375` was unreachable by
    // anything this increment carried and was left out — slice F registers it
    // below), plus the four unwraps every one of
    // them routes through (`:40`, `:81`, `:88`, `:94`) — reached by the
    // hand-picked "decoration" coverage group, not the corpus — plus 10
    // RELATION/OPERATOR (`:30`, `:49`, `:99`, `:184`, `:401`, `:745`, `:1412`,
    // `:2269`, `:2317`, `:2447`), chosen by what unblocks
    // `src/compat/index.ts`'s 50-input battery rather than by a Ruby class
    // family — reached by the hand-picked "relation" coverage group, which
    // also carries `"±"` and `"a≤b"`, the two inputs that used to prove
    // `:99` and `:745` absent from `SLICE_BOUNDARY` (`transform.ts`'s own
    // header names both) — plus 12 NARY: eleven `nary_class`/`nary`/
    // `nary_sub_sup` rules (`:84`, `:175`, `:725`, `:730`, `:1831`, `:1874`,
    // `:1931`, `:1953`, `:2856`, `:2911`, `:3588`) and one small prerequisite,
    // `:255` (`{symbol:, expr:}`, the shape `:725`/`:730`/`:1874` need to
    // reach a SEQUENCE) — reached by the hand-picked "nary" coverage group —
    // see the module header for the eight SEQUENCE-`sub`/`sup` NARY rules
    // this slice still defers, gated on the same `atoms` combinator FRACTION's
    // own boundary section named.
    //
    // The count is rules REGISTERED, not branches reached: the multiscript
    // group carries four extra inputs whose trailing script is fenced, because
    // the twelve that name a rule each all carry BARE scripts, and bypassing
    // every `unfencedValue` call in `:2958`, `:3662`, `:3853` and `:3978` left
    // the suite green without them. The table group carries one input per
    // `Constants::MATRIXS` character (eight) for the same reason: all eight
    // fire `:1649`/`:1670`/`:1691` with an identical trace and take four
    // different branches to eight different table classes — plus 3 ATOMS:
    // the `{atom:, atoms:}` combinator's directly-verifiable unwraps
    // (`:486`, `:496`, `:1851`) — `:30` and `:49`, this family's own base
    // unwraps, were already ported by RELATION/OPERATOR above (`"2·3"`
    // needed `:49`, and RELATION's own probing separately reached `:30`) —
    // reached by the existing corpus and coverage groups, not a new
    // hand-picked one.
    //
    // Plus 10 from the ROOT/OVER-UNDER/ACCENT leftovers: `:341`, `:969`,
    // `:977`, `:1404`, `:1506`, `:1530`, `:1538`, `:2221`, and two unwraps
    // they need first, `:31` and `:118`.
    expect(build.ruleIds.length).toBe(188);
    expect(new Set(build.ruleIds).size).toBe(188);
    // hand-picked one — plus 23 SYMBOL/OPERATOR/NUMBER leaves: the three
    // `BaseNumberPrefix::Transform` rules (`bnp:36`-`bnp:38`) and twenty
    // `unicode_math/transform.rb` rules (`:109`, `:134`, `:191`, `:243`,
    // `:250`, `:266`, `:272`, `:278`, `:302`, `:309`, `:320`, `:396`, `:451`,
    // `:456`, `:466`, `:476`, `:481`, `:527`, `:2085`, `:2091`) — reached by
    // the hand-picked "symbol" coverage group.
    expect(build.ruleIds.length).toBe(0); // TODO-INT
    expect(new Set(build.ruleIds).size).toBe(0); // TODO-INT
    // plus 56 COMBINATORS: rules whose body builds nothing — single-key
    // unwraps and the list-join combinators (`[a, b]`, `[a] + b`, `a + b`) —
    // and whose input the oracle parses to a model the port reproduces:
    // `:36`, `:59`, `:60`, `:64`, `:73`, `:104`, `:222`, `:371`, `:386`, `:406`,
    // `:411`, `:431`, `:436`, `:491`, `:543`, `:548`, `:700`, `:705`, `:765`,
    // `:770`, `:775`, `:785`, `:790`, `:805`, `:810`, `:815`, `:855`, `:885`,
    // `:895`, `:900`, `:905`, `:910`, `:915`, `:935`, `:940`, `:950`, `:955`,
    // `:1716`, `:1721`, `:1726`, `:1731`, `:1736`, `:1741`, `:1791`, `:1796`,
    // `:1821`, `:2029`, `:2233`, `:2239`, `:2257`, `:2263`, `:2293`, `:2299`,
    // `:2305`, `:2311`, `:2329` — reached by the hand-picked "combinators"
    // coverage group. `:104` is the one rule of them that builds a node (a
    // `Symbol` with `options: { space: true }`); it is here because it is
    // the spaces leaf every space-bearing input needs.
    // The other 83 pure rules of the gem are not registered: none has an
    // input the port can parse to the oracle's model yet, because each one
    // reaches an unported BUILDING rule first (see `transform.ts`).
    expect(build.ruleIds.length).toBe(210);
    expect(new Set(build.ruleIds).size).toBe(210);
    //
    // Plus 32 from slice E (FRACTIONS), reached by the hand-picked
    // "fractions_seq" coverage group: 25 that build (the ten sequence-shaped
    // `Utility.fractions` sites `:1619`-`:1644`, `:2203`, `:2359`, `:2365`,
    // `:2371`; `Utility.unicode_fractions` and its callers `:96`, `:212`,
    // `:217`, `:3277`; `:2048`, `:2393`, `:2797`; the fraction-holding fences
    // `:2685`, `:2707`, `:3411`, `:3422`; slice B's `:284`, `:290`, `:296`,
    // `:666`) and 7 prerequisite folds owned by other slices and registered
    // under their ids (`:396`, `:561`, `:592`, `:675`, `:1756`, `:2055`,
    // `:2067`).
    expect(build.ruleIds.length).toBe(220);
    expect(new Set(build.ruleIds).size).toBe(220);
    // Plus 49 from slice F, the SCRIPT/SUBSUP/BASE builders and the NARY
    // remainder: 42 building rules (`:53`, `:86`, `:113`, `:511`, `:516`,
    // `:521`, `:533`, `:553`, `:561`, `:567`, `:575`, `:584`, `:592`, `:614`,
    // `:622`, `:630`, `:635`, `:640`, `:646`, `:652`, `:985`, `:1011`,
    // `:1054`, `:1069`, `:1078`, `:1139`, `:1148`, `:1164`, `:1183`, `:1919`,
    // `:2142`, `:2153`, `:2163`, `:2173`, `:2183`, `:2827`, `:2841`, `:2884`,
    // `:2993`, `:3020`, `:3047`, and DECORATION's `:1375`, which `:1054` unblocks) and 7 slice-A prerequisites registered under
    // A's own ids (`:38`, `:59`, `:60`, `:65`, `:66`, `:89`, `:830`) —
    // reached by the "script-subsup-nary" coverage group. Two of F's claimed
    // rules are NOT registered: `:1003` (`{sub_script:, recursion:}` — no
    // grammar rule emits a `recursion` key) and `:2403` (`{base:, sub:
    // sequence, sub_recursion:}` — no reaching input found).
    expect(build.ruleIds.length).toBe(237);
    expect(new Set(build.ruleIds).size).toBe(237);
    //
    // Plus 23 FENCED (slice G1, `transform.rb:2020`-`:2983`): every `Fenced`-
    // building rule of that range not claimed by another slice — `:2020`,
    // `:2457`, `:2485`, `:2495`, `:2505`, `:2515`, `:2525`, `:2536`, `:2547`,
    // `:2557`, `:2567`, `:2577`, `:2587`, `:2597`, `:2609`, `:2640`, `:2650`,
    // `:2668`, `:2724`, `:2746`, `:2761`, `:2769`, `:2983` — reached by the
    // hand-picked "fenced_g1" coverage group (`:2640` is also reached by the
    // corpus row `"((a)̅)̅"`) — plus 6 prerequisites owned by other slices' pure
    // rules, registered under their own ids so the SEQUENCE-paren and
    // mini-paren witnesses can compare: `:60`, `:85`, `:97`, `:561`, `:2055`, `:2067`.
    expect(build.ruleIds.length).toBe(217);
    expect(new Set(build.ruleIds).size).toBe(217);
    //
    // Plus 47 from the bracket-pair family in `transform.rb:3000` to the end
    // (slice G2): 42 `Fenced` rules (`:3085`, `:3108`, `:3119`, `:3132`, `:3143`,
    // `:3167`, `:3178`, `:3200`, `:3255`, `:3277`, `:3288`, `:3299`, `:3310`,
    // `:3345`, `:3367`, `:3389`, `:3400`, `:3411`, `:3422`, `:3455`, `:3499`,
    // `:3510`, `:3521`, `:3531`, `:3542`, `:3553`, `:3564`, `:3576`, `:3640`,
    // `:3651`, `:3676`, `:3711`, `:3723`, `:3739`, `:3755`, `:3792`, `:3804`,
    // `:3840`, `:3897`, `:3909`, `:3922`, `:3935`) reached by the hand-picked
    // "fenced_g2" coverage group, and five prerequisites registered under
    // the ids slices A and B claim (`:191`, `:196`, `:204`, `:2055`, `:2067`). Twenty-one more rules in that
    // range are NOT registered: no input among the ~5,100 traced on the oracle
    // reaches them (see `.codex-context/tasks/unicodemath-rule-claims/G2.deferred`).
    expect(build.ruleIds.length).toBe(235);
    expect(new Set(build.ruleIds).size).toBe(235);
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
