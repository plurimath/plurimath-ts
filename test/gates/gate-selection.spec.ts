/**
 * Proof that each gate's runner selects the spec files it claims to.
 *
 * Several class-A gates run a vitest path filter (`pnpm test <patterns>`).
 * Vitest exits non-zero when a filter matches nothing, so an empty selection
 * cannot pass unnoticed. The failure this file exists to catch is the other
 * one: a filter that matches the WRONG files runs green while proving something
 * else entirely.
 *
 * That is not hypothetical. `corpus-conformance` shipped as
 * `pnpm test -- corpus`, which under pnpm 10 dropped the pattern and ran the
 * whole suite. Correcting only the separator would not have been enough — the
 * corrected `pnpm test corpus` resolves to the two corpus-pin *reader* specs
 * and to none of the parse-tree, model or renderer conformance suites the
 * gate's description promises. Two distinct defects, one behind the other.
 *
 * So a gate whose runner is a path filter carries `selects` in gates.json: the
 * exact set of spec files that filter must resolve to. This file re-resolves
 * every one of them against the tree on disk and asserts set equality, so
 * adding, renaming or moving a spec fails here rather than silently widening or
 * narrowing what a gate covers.
 *
 * These are gate tests, not behaviour tests: nothing here exercises the parser,
 * the model or a renderer.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEST_ROOT = join(REPO_ROOT, "test");

interface Gate {
  id: string;
  class: string;
  activatesAt: string;
  run: string;
  selects?: string[];
}

const registry = JSON.parse(readFileSync(join(REPO_ROOT, "gates.json"), "utf8")) as {
  milestones: string[];
  currentMilestone: string;
  gates: Gate[];
};

/** Every spec file in the tree, repo-relative and slash-separated. */
function allSpecFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".spec.ts"))
        found.push(relative(REPO_ROOT, path).split(sep).join("/"));
    }
  };
  walk(TEST_ROOT);
  return found.sort();
}

/**
 * The patterns a `pnpm test a b c` runner passes to vitest. Vitest treats each
 * positional argument as a substring matched against the file path, and ORs
 * them together.
 *
 * The separator form matters and is asserted below. Under pnpm 10,
 * `pnpm test -- corpus` does NOT forward `corpus` as a filter: it runs the
 * whole suite and the pattern is silently dropped. Every filter gate was
 * originally registered that way, so each would have passed by running
 * everything while claiming to prove one specific thing.
 */
const RUN_PREFIX = "pnpm test ";
const BROKEN_PREFIX = "pnpm test -- ";

function filterPatterns(run: string): string[] | null {
  if (run === "pnpm test") return null; // the whole-suite gate, not a filter
  if (!run.startsWith(RUN_PREFIX)) return null;
  const rest = run.slice(RUN_PREFIX.length).trim();
  if (rest.startsWith("--")) return []; // broken form; reported by its own test
  return rest.split(/\s+/).filter(Boolean);
}

function resolveFilter(patterns: string[], files: string[]): string[] {
  return files.filter((file) => patterns.some((pattern) => file.includes(pattern))).sort();
}

const SPEC_FILES = allSpecFiles();
const filterGates = registry.gates.filter((gate) => filterPatterns(gate.run) !== null);

describe("gate selection", () => {
  it("finds the spec tree it is about to reason over", () => {
    // Guards this file against the failure it exists to catch: a walker that
    // silently found nothing would make every assertion below vacuously true.
    expect(SPEC_FILES.length).toBeGreaterThan(0);
    expect(SPEC_FILES).toContain("test/gates/gate-selection.spec.ts");
  });

  it("finds gates whose runner is a vitest path filter", () => {
    expect(filterGates.length).toBeGreaterThan(0);
  });

  it("passes filters in the form pnpm actually forwards", () => {
    // `pnpm test -- corpus` runs the entire suite under pnpm 10: the separator
    // is consumed and the pattern never reaches vitest, so the gate passes
    // green having proven nothing in particular. Verified by running all three
    // forms against this repo — `pnpm test -- corpus-` selected 41 files,
    // `pnpm test corpus-` and `vitest run corpus-` each selected 2.
    const broken = registry.gates.filter((gate) => gate.run.startsWith(BROKEN_PREFIX));
    expect(broken.map((gate) => gate.id)).toEqual([]);
  });

  it("requires every filter gate to declare what it selects", () => {
    // Without this, a gate that simply omits `selects` opts out of the whole
    // guard — which is how six of the seven filter gates were unprotected in
    // the first draft of this file. `symbol-context-matrix` already resolves
    // to a real spec, so renaming that spec would have silently emptied the
    // gate with nothing failing.
    const undeclared = filterGates.filter((gate) => gate.selects === undefined).map((g) => g.id);
    expect(undeclared).toEqual([]);
  });

  describe.each(filterGates.map((gate) => [gate.id, gate] as const))("%s", (_id, gate) => {
    const patterns = filterPatterns(gate.run) as string[];
    const resolved = resolveFilter(patterns, SPEC_FILES);
    const declared = [...(gate.selects ?? [])].sort();

    it("selects exactly the files it declares", () => {
      expect(resolved).toEqual(declared);
    });

    it("declares only files that exist", () => {
      for (const file of declared) expect(SPEC_FILES).toContain(file);
    });

    it("is inactive if it selects nothing", () => {
      // An empty declaration is legitimate while a gate's specs have not
      // landed — but only while the gate is inactive. Active with an empty
      // selection means vitest exits non-zero on "No test files found", so
      // this would be an active gate that cannot pass. ARCHITECTURE.md §7
      // forbids active-but-unrunnable, and this is the registry-level form of
      // that rule.
      if (declared.length > 0) return;
      const milestones = registry.milestones;
      const current = milestones.indexOf(registry.currentMilestone);
      expect(milestones.indexOf(gate.activatesAt)).toBeGreaterThan(current);
    });
  });
});
