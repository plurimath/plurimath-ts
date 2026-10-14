import { describe, expect, it } from "vitest";
import { runRuby } from "./oracle-harness";

function classify(paths: readonly string[]): readonly string[] {
  const result = runRuby(`
    require_relative "scripts/ci/oracle-artifacts"
    runner = OracleArtifacts::Runner.allocate
    runner.instance_variable_set(:@paths, ${JSON.stringify(paths)})
    puts JSON.generate(runner.omitted_family_paths)
  `);
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout.trim()) as readonly string[];
}

describe("oracle artifact second-generation ownership", () => {
  it("keeps native fence outputs in their separately verified generator family", () => {
    const parser = ["html", "unicodemath"].flatMap((format) =>
      ["parser-tables", "transform-tables", "provenance"].map(
        (name) => `src/formats/${format}/generated/${name}.ts`,
      ),
    );
    const native = ["ts", "manifest.yaml", "metadata.json"].map(
      (extension) => `src/formats/unicodemath/generated/paren-mask-sizes.${extension}`,
    );
    expect(classify([...parser, ...native])).toEqual(parser);
  });

  it("retains every omitted fixture family and excludes already regenerated fixtures", () => {
    const omitted = [
      "test/formats/cli/cli-fixtures.json",
      "test/formats/cli/cli-fixtures.manifest.yaml",
      "test/formats/evaluation/evaluation-fixtures.json",
      "test/formats/asciimath/render-options-fixtures.json",
      "test/formats/binary-function/render-kinds-fixtures.manifest.yaml",
      "test/xml/ox-contract.expected.json",
    ];
    const covered = [
      "test/formats/unitsml/probe-fixtures.json",
      "test/formats/unicodemath/completion-fixtures.json",
      "test/formats/html/model-fixtures.json",
      "test/xml/reader-fixtures.json",
    ];
    expect(classify([...omitted, ...covered])).toEqual(omitted);
  });
});
