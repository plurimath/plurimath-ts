/**
 * Every ported transform rule is exercised by the fixture set.
 *
 * `model-parity.spec.ts` proves the port agrees with the gem on 183 parsed
 * inputs. It cannot prove that a rule was ever REACHED — a rule with a typo in
 * its action passes vacuously if nothing routes to it, and 78 rules is too many
 * to eyeball. So `buildHtmlTransform` counts each rule's firings, this suite
 * drives the whole fixture set through one transform, and a rule that never
 * fires is a failure naming its Ruby line.
 *
 * The rule ids carry the FILE as well as the line — `transform:171`,
 * `base_number_prefix:36` — because three of the 78 come from the mixin
 * `html/transform.rb:6` includes rather than from that file.
 *
 * There is no unreachable list. Measured on the oracle over exactly these
 * inputs, with every registered block wrapped in a counter, all 78 rules
 * `Plurimath::Html::Transform` registers fire; the same must hold here.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { htmlGrammar } from "../../../src/formats/html/grammar";
import { preprocess } from "../../../src/formats/html/preprocess";
import { buildHtmlTransform, shapeOf } from "../../../src/formats/html/transform";
import { Slice, sequence, simple, Transform } from "../../../src/pegkit/index";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Every rule `Plurimath::Html::Transform` registers, in REGISTRATION order,
 * measured off the oracle: each block's `source_location` walked up to the
 * `rule(` it opens on, over `Plurimath::Html::Transform.rules` REVERSED —
 * `rule` unshifts, so that array is the matching order and its reverse is the
 * order the file registers in.
 *
 * Pinning the whole list rather than the count is what catches a rule that
 * moved to another line upstream, or one this port dropped and replaced.
 */
const ORACLE_RULE_IDS: readonly string[] = [
  "base_number_prefix:36",
  "base_number_prefix:37",
  "base_number_prefix:38",
  "transform:8",
  "transform:9",
  "transform:10",
  "transform:11",
  "transform:12",
  "transform:13",
  "transform:15",
  "transform:23",
  "transform:28",
  "transform:29",
  "transform:30",
  "transform:31",
  "transform:32",
  "transform:33",
  "transform:34",
  "transform:36",
  "transform:37",
  "transform:39",
  "transform:43",
  "transform:47",
  "transform:53",
  "transform:58",
  "transform:63",
  "transform:68",
  "transform:73",
  "transform:81",
  "transform:89",
  "transform:97",
  "transform:105",
  "transform:115",
  "transform:122",
  "transform:130",
  "transform:135",
  "transform:143",
  "transform:148",
  "transform:153",
  "transform:161",
  "transform:171",
  "transform:176",
  "transform:184",
  "transform:189",
  "transform:194",
  "transform:199",
  "transform:204",
  "transform:211",
  "transform:218",
  "transform:225",
  "transform:235",
  "transform:244",
  "transform:253",
  "transform:262",
  "transform:271",
  "transform:280",
  "transform:289",
  "transform:298",
  "transform:307",
  "transform:318",
  "transform:329",
  "transform:340",
  "transform:351",
  "transform:362",
  "transform:373",
  "transform:384",
  "transform:395",
  "transform:405",
  "transform:415",
  "transform:427",
  "transform:437",
  "transform:447",
  "transform:457",
  "transform:463",
  "transform:472",
  "transform:486",
  "transform:498",
  "transform:510",
];

interface FixtureCase {
  readonly input: string;
  readonly model?: unknown;
}

const fixtures = JSON.parse(readFileSync(join(HERE, "model-fixtures.json"), "utf8")) as {
  readonly cases: readonly FixtureCase[];
};

/**
 * `html/parser.rb:18`'s `JSON.parse(nodes.to_json)` — the same flattening
 * `parser.ts` performs, restated here so this suite drives the transform on
 * exactly the shape it is given in production.
 */
function plain(value: unknown): unknown {
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return value.map(plain);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = plain(entry);
    return result;
  }
  return value;
}

/** One transform, driven over every input the gem parsed, counting firings. */
const build = buildHtmlTransform();
let reached = 0;
for (const entry of fixtures.cases) {
  if (entry.model === undefined) continue;
  const { text } = preprocess(entry.input);
  build.transform.apply(plain(htmlGrammar().root.parse(text)));
  reached += 1;
}

describe("transform rule coverage", () => {
  it("drove every parseable fixture through one transform", () => {
    expect(reached).toBe(fixtures.cases.filter((entry) => entry.model !== undefined).length);
    expect(reached).toBeGreaterThan(100);
  });

  it("registers exactly the rules the gem does, in the same order", () => {
    // 75 `rule(` calls in html/transform.rb plus the three from the
    // BaseNumberPrefix mixin, counted off the oracle as
    // `Plurimath::Html::Transform.rules.length`. Order is behaviour, because
    // `rule` unshifts on both sides: registering in the gem's order is what
    // makes the MATCHING order the gem's too.
    expect(build.ruleIds).toStrictEqual(ORACLE_RULE_IDS);
    expect(build.ruleIds.length).toBe(78);
    expect(new Set(build.ruleIds).size).toBe(78);
    expect(build.ruleIds.filter((id) => id.startsWith("base_number_prefix:")).length).toBe(3);
  });

  it("fires every one of them at least once", () => {
    const never = build.ruleIds.filter((id) => build.fired.get(id) === 0);
    expect(
      never,
      `rules no fixture reaches: ${never.join(", ")}. Add an input to RULE_COVERAGE ` +
        "in scripts/generate-html-model-fixtures.rb and regenerate.",
    ).toStrictEqual([]);
  });
});

/**
 * `shapeOf` names the shape a value would BIND as, which is how the signatures
 * in `model-parity.spec.ts` are computed. `finalize` no longer accepts or
 * refuses on that basis — it keeps an unmatched hash the way the gem does — so
 * this is a mirror of the matchers, not a gate, and it still has to agree with
 * the matchers themselves rather than with a second reading of them. Each
 * probe is run through a real `Transform` carrying one `simple` rule and one
 * `sequence` rule on the same key, and the answer is compared with `shapeOf`.
 */
describe("shapeOf mirrors the pegkit matchers", () => {
  const probes: readonly unknown[] = [
    "x",
    null,
    1,
    true,
    [],
    ["a", "b"],
    [null],
    [{ a: "b" }],
    [["a"]],
    { a: "b" },
  ];

  it.each(probes.map((value, index) => [index, value] as const))(
    "probe %i agrees with what the engine binds",
    (_index, value) => {
      const t = new Transform();
      t.rule({ probe: simple("v") }, () => "simple");
      t.rule({ probe: sequence("v") }, () => "sequence");
      const applied = t.apply({ probe: value });
      const engine = typeof applied === "string" ? applied : "other";
      expect(shapeOf(value)).toBe(engine);
    },
  );
});
