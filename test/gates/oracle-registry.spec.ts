import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Gate {
  id: string;
  class: string;
  activatesAt: string;
  run: string;
  selects?: string[];
}

const registry = JSON.parse(readFileSync(join(REPO_ROOT, "gates.json"), "utf8")) as {
  gates: Gate[];
};

describe("oracle gate registry", () => {
  const oracleGates = registry.gates.filter((gate) => gate.class === "B");

  it("splits the P1-baseline oracle regeneration gate by owner and failure meaning", () => {
    expect(oracleGates.map((gate) => gate.id)).not.toContain("oracle-regeneration");

    expect(oracleGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "oracle-repo-regeneration",
          class: "B",
          activatesAt: "P1-baseline",
          run: "scripts/oracle repo --check",
        }),
        expect.objectContaining({
          id: "oracle-testsuite-regeneration",
          class: "B",
          activatesAt: "P1-baseline",
          run: "scripts/oracle testsuite --check",
        }),
      ]),
    );
  });

  it("does not treat class-B runners as vitest filter gates", () => {
    for (const gate of oracleGates) expect(gate.selects).toBeUndefined();
  });
});
