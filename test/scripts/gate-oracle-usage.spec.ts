/**
 * Proof that `repo --help` names every model-fixture generator that is
 * registered, rather than a list someone remembered to update.
 *
 * The help text carried two script names on the day `FORMAT_FIXTURE_GENERATORS`
 * grew a third; a reader regenerating UnicodeMath fixtures by hand would not
 * have found the script that does it. A hand-kept second copy of a list is the
 * only way that happens, so the text is derived from the map now.
 *
 * The first two cases below would both stay green if the derivation were
 * replaced by a hardcoded list of today's three scripts. The third is the one
 * that cannot: it registers a fourth format at run time and requires the help
 * text to name it.
 */

import { describe, expect, it } from "vitest";

import { inOracle } from "./oracle-harness";

/** The script names the model-fixture family dispatches on, sorted. */
function registeredModelFixtureScripts(): string[] {
  const { output } = inOracle(`
    OracleGate::FORMAT_FIXTURE_GENERATORS
      .find { |generator| generator[:basename] == "model-fixtures.json" }
      .fetch(:script).values.sort
  `);
  return output.match(/"[^"]+\.rb"/g)?.map((quoted) => quoted.slice(1, -1)) ?? [];
}

describe("the repo --check help text", () => {
  it("names a model-fixture generator for every registered format", () => {
    const scripts = registeredModelFixtureScripts();
    expect(scripts.length).toBeGreaterThan(0);

    const { output } = inOracle("OracleGate.repo_usage");
    for (const script of scripts) expect(output).toContain(`scripts/${script}`);
  });

  it("still names the three formats that have committed model fixtures", () => {
    expect(registeredModelFixtureScripts()).toEqual([
      "generate-html-model-fixtures.rb",
      "generate-latex-model-fixtures.rb",
      "generate-unicodemath-model-fixtures.rb",
    ]);
  });

  it("names a format registered after the help text was written", () => {
    const { output } = inOracle(`
      begin
        widened = OracleGate::FORMAT_FIXTURE_GENERATORS.map do |generator|
          next generator unless generator[:basename] == "model-fixtures.json"

          generator.merge(
            script: generator[:script]
              .merge("mathml" => "generate-mathml-model-fixtures.rb").freeze,
          )
        end
        OracleGate.send(:remove_const, :FORMAT_FIXTURE_GENERATORS)
        OracleGate.const_set(:FORMAT_FIXTURE_GENERATORS, widened.freeze)
        OracleGate.repo_usage
      end
    `);
    expect(output).toContain("scripts/generate-mathml-model-fixtures.rb");
  });
});
