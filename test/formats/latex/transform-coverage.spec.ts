/**
 * Every ported transform rule is exercised by the fixture set.
 *
 * `model-parity.spec.ts` proves the port agrees with the gem on 220 inputs. It
 * cannot prove that a rule was ever REACHED — a rule with a typo in its action
 * passes vacuously if nothing routes to it, and 114 rules is far too many to
 * eyeball. So `buildLatexTransform` counts each rule's firings, this suite
 * drives the whole fixture set through one transform, and a rule that never
 * fires is a failure naming its Ruby line.
 *
 * The rule ids are `latex/transform.rb` line numbers (and `bnp:NN` for the
 * three `BaseNumberPrefix::Transform` mixes in), so a gap reads as "nothing
 * covers transform.rb:404" rather than as an index.
 *
 * `transform.rb:747` is deliberately absent from the ported set: it has the
 * same key set as `:756`, `Parslet::Transform.rule` unshifts, and the oracle
 * confirms `:756` wins — so `:747` can never match and porting it would add a
 * rule this suite could never cover.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latexGrammar } from "../../../src/formats/latex/grammar";
import { preprocess } from "../../../src/formats/latex/preprocess";
import { buildLatexTransform } from "../../../src/formats/latex/transform";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The three ported rules no input reaches, and why — each argued from the
 * grammar and then CONFIRMED against the gem: the same 255 inputs were driven
 * through `Plurimath::Latex::Transform` with every registered block wrapped in
 * a counter, and these three (plus the dead `:747`) were the only rule
 * openings that never fired there either.
 *
 * - `46` (`text: simple` alone). The only atom tagged `:text` is
 *   `dynamic_rules`' `:text` branch (`parse.rb:245`), which always emits
 *   `first_value` alongside it, so a one-key `{text:}` node cannot be built.
 * - `67` and `75` (`left_right` with a subscript / supscript). `sequence`'s
 *   alternatives 9 and 10 (`parse.rb:152-153`) are strictly dominated by
 *   `over_class`'s second and third (`:179-180`): both start with `left_right`
 *   and continue with the same `power`/`base` plus `intermediate_exp`, and
 *   `over_class` is tried first, so whenever 9 or 10 could match, 8 already has.
 *
 * They are ported anyway — "unreachable" is a claim about the whole grammar,
 * and the oracle still carries them — but they are listed here so the set
 * cannot silently grow.
 */
const UNREACHABLE: readonly string[] = ["46", "67", "75"];

interface FixtureCase {
  readonly input: string;
  readonly model?: unknown;
}

const fixtures = JSON.parse(readFileSync(join(HERE, "model-fixtures.json"), "utf8")) as {
  readonly cases: readonly FixtureCase[];
};

/** One transform, driven over every input the gem parsed, counting firings. */
const build = buildLatexTransform();
let reached = 0;
for (const entry of fixtures.cases) {
  if (entry.model === undefined) continue;
  const { text } = preprocess(entry.input);
  build.transform.apply(latexGrammar().root.parse(text));
  reached += 1;
}

describe("transform rule coverage", () => {
  it("drove every parseable fixture through one transform", () => {
    expect(reached).toBe(fixtures.cases.filter((entry) => entry.model !== undefined).length);
    expect(reached).toBeGreaterThan(100);
  });

  it("registers the 117 rules the port carries", () => {
    // 115 `rule(` calls in latex/transform.rb, minus the dead `:747`, plus the
    // three from the BaseNumberPrefix mixin: 114 + 3.
    expect(build.ruleIds.length).toBe(117);
    expect(build.ruleIds).not.toContain("747");
    expect(build.ruleIds.filter((id) => id.startsWith("bnp:")).length).toBe(3);
  });

  it("fires every one of them at least once, bar the three the grammar cannot reach", () => {
    const never = build.ruleIds.filter((id) => build.fired.get(id) === 0);
    expect(
      never,
      `transform.rb rules no fixture reaches: ${never.join(", ")}. Add an input to ` +
        "RULE_COVERAGE in scripts/generate-latex-model-fixtures.rb and regenerate, " +
        "or justify the addition to UNREACHABLE below.",
    ).toStrictEqual(UNREACHABLE);
  });
});
