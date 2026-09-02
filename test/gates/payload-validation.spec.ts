/**
 * The `payload-validation` class-A gate (gates.json, ARCHITECTURE.md §7):
 * "Generated data still matches the generators it names, and declares itself
 * committable."
 *
 * The registry entry used to read "Generated payloads validate against their
 * schema and manifest hashes", which described work that already existed
 * elsewhere rather than anything this gate adds. Payload *content* is checked
 * there and deliberately not repeated here — `corpus-pin.ts` verifies the pinned corpus against its provenance,
 * and `local-corpus.spec.ts` does the same for this repository's own
 * `corpus/*.manifest.yaml` sidecars. What neither covers is the generated
 * TypeScript under `src/`, and specifically the question those sidecars answer
 * for YAML and nothing answered for code:
 *
 *   **is this generated file still the output of the generator it names?**
 *
 * Every generated-data module records the script that produced it and the
 * sha256 of that script — `src/core/generated` and `src/formatting/generated`
 * additionally record every *other* script they consumed, because
 * `generate-corpus.rb` feeds them. Nothing verified any of those hashes against
 * the files on disk, so a generator could be edited and committed without
 * regeneration and the data would go on claiming a provenance that no longer
 * existed. The suite would stay green: the existing provenance tests assert
 * the shape of these records (`generatorSha256` matches /^[0-9a-f]{64}$/,
 * `committable` is true) but never that the recorded hash is the file's.
 *
 * That is not hypothetical. This gate was written after exactly that happened:
 * `scripts/generate-corpus.rb` was edited twice for the manifest-accuracy work
 * and only its own outputs regenerated, leaving `src/core/generated` and
 * `src/formatting/generated` recording a hash of a script version that no
 * longer exists.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORE_GENERATED_PROVENANCE } from "../../src/core/generated/provenance";
import { FORMATTING_GENERATED_PROVENANCE } from "../../src/formatting/generated/provenance";
import { GENERATED_PROVENANCE } from "../../src/generated/provenance";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sha256OfFile(relative: string): string {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path))
    throw new Error(`${relative} is recorded as a generator input but is missing`);
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Every (file, recorded hash) pair the three provenance modules assert.
 *
 * `src/generated` records one script as `generatorSha256`; the other two
 * record a map because they consume more than one. Both shapes reduce to the
 * same claim, so both are checked the same way.
 */
const RECORDED: ReadonlyArray<readonly [label: string, file: string, hash: string]> = [
  ["src/generated", GENERATED_PROVENANCE.generator, GENERATED_PROVENANCE.generatorSha256],
  ...[...CORE_GENERATED_PROVENANCE.generatorInputs].map(
    ([file, hash]) => ["src/core/generated", file, hash] as const,
  ),
  ...[...FORMATTING_GENERATED_PROVENANCE.generatorInputs].map(
    ([file, hash]) => ["src/formatting/generated", file, hash] as const,
  ),
];

describe("generated data still matches the generators it names", () => {
  it("has something to check", () => {
    // The failure this file exists to catch is a silent one, so it must not be
    // possible for the list itself to be empty and every assertion vacuous.
    expect(RECORDED.length).toBeGreaterThan(3);
  });

  it.each(RECORDED.map((entry) => [`${entry[0]} -> ${entry[1]}`, entry] as const))(
    "%s",
    (_label, [, file, recorded]) => {
      expect(sha256OfFile(file)).toBe(recorded);
    },
  );

  it("records each generator it names as an existing file", () => {
    for (const [, file] of RECORDED) {
      expect(existsSync(join(REPO_ROOT, file))).toBe(true);
    }
  });

  it("names every generator this repository ships", () => {
    // A generator that produces committed data but is recorded by nothing
    // would sit outside this gate entirely. Pinned so adding one is a
    // deliberate act.
    const recordedFiles = new Set(RECORDED.map(([, file]) => file));
    expect([...recordedFiles].sort()).toStrictEqual([
      "scripts/generate-core-data.rb",
      "scripts/generate-corpus.rb",
      "scripts/generate-formatting-data.rb",
    ]);
  });
});

describe("the generated payloads declare themselves committable", () => {
  it.each([
    ["src/generated", GENERATED_PROVENANCE.committable],
    ["src/core/generated", CORE_GENERATED_PROVENANCE.committable],
    ["src/formatting/generated", FORMATTING_GENERATED_PROVENANCE.committable],
  ])("%s", (_label, committable) => {
    // `committable: false` marks output generated from a dirty checkout (§7).
    // Shipping it is the thing this flag exists to prevent.
    expect(committable).toBe(true);
  });
});

/**
 * `PORTING-STANDARDS.md` requires that a provenance `repository.commit` be an
 * ancestor of the branch tip, "not an orphaned pre-amend hash". Nothing
 * enforced it, and the way this repository merges makes it easy to break: a
 * squash merge replaces the source commit with a new one, so the hash the
 * manifests recorded stops existing on the target branch. `gate-oracle.rb`
 * blanks that field before diffing — correctly, because it changes on every
 * regeneration — which means the byte comparison cannot catch it either.
 *
 * The consequence is not cosmetic. The recorded commit is the only pointer
 * back to the tree that produced the data, so an orphaned hash makes the
 * question "was this data generated from the source beside it?" unanswerable
 * after the fact.
 *
 * Skipped, not failed, where the commit is simply unknown to this checkout: a
 * shallow clone or a fresh worktree legitimately lacks the object, and failing
 * there would punish the environment rather than the data.
 */
describe("the commit that generated the data is still reachable", () => {
  const Manifests = ["corpus/census.manifest.yaml", "corpus/exclusions.manifest.yaml"] as const;

  const recordedCommit = (relative: string): string | null => {
    const text = readFileSync(join(REPO_ROOT, relative), "utf8");
    const match = /repository:\s*\n\s*commit:\s*'?([0-9a-f]{40})'?/.exec(text);
    return match?.[1] ?? null;
  };

  it.each(Manifests)("%s records a commit", (relative) => {
    expect(recordedCommit(relative)).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(Manifests)("%s's commit is an ancestor of HEAD", (relative) => {
    const commit = recordedCommit(relative);
    if (commit === null) throw new Error(`${relative}: no repository.commit recorded`);

    const known = spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT });
    if (known.status !== 0) {
      // Unknown to this checkout — shallow clone, or a worktree without the
      // object. Not a claim about the data.
      return;
    }

    const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
      cwd: REPO_ROOT,
    });
    expect(
      ancestor.status,
      `${relative} records ${commit.slice(0, 12)}, which is not an ancestor of HEAD. ` +
        "A squash merge rewrites the source commit, so the data must be regenerated " +
        "after the merge, or the merge must preserve it.",
    ).toBe(0);
  });
});
