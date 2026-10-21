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
      "test/formats/asciimath/render-sweep.json",
      "test/formats/latex/render-sweep.json",
      "test/formats/mathml/render-sweep.json",
      "test/formats/cli/cli-fixtures.json",
      "test/formats/cli/cli-fixtures.manifest.yaml",
      "test/formats/evaluation/evaluation-fixtures.json",
      "test/formats/asciimath/render-options-fixtures.json",
      "test/formats/binary-function/render-kinds-fixtures.manifest.yaml",
      "test/xml/ox-contract.expected.json",
      "src/formats/html/generated-text/symbols.ts",
      "src/formats/html/generated-text/provenance.json",
      "src/formats/mathml/generated-recognition/elements.ts",
      "src/formats/mathml/generated-recognition/context-probes.json",
      "src/formats/mathml/generated-recognition/provenance.json",
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

describe("format lookup artifact replay", () => {
  it("includes the new generated lookups in both export and verification", () => {
    const result = runRuby(`
      require_relative "scripts/ci/oracle-artifacts"
      runner = OracleArtifacts::Runner.allocate
      runner.instance_variable_set(:@oracle, "/oracle")
      jobs = runner.inventory("/output").select { |name, _, _| %w[html-text-data mathml-recognition-data].include?(name) }
      puts JSON.generate({ jobs: jobs, roots: OracleArtifacts::ROOTS })
    `);
    expect(result.status).toBe(0);
    const recorded = JSON.parse(result.stdout.trim()) as {
      jobs: readonly [string, string, readonly string[]][];
      roots: readonly string[];
    };
    expect(recorded.jobs).toEqual([
      [
        "html-text-data",
        "generate-html-text-data.rb",
        ["--source-checkout", "/oracle", "--out", "/output/src/formats/html/generated-text"],
      ],
      [
        "mathml-recognition-data",
        "generate-mathml-recognition-data.rb",
        [
          "--source-checkout",
          "/oracle",
          "--out",
          "/output/src/formats/mathml/generated-recognition",
        ],
      ],
    ]);
    expect(recorded.roots).toContain("src/formats/html/generated-text");
    expect(recorded.roots).toContain("src/formats/mathml/generated-recognition");
  });
});
