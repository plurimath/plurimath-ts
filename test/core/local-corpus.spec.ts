import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  LOCAL_CORPUS_ROOT,
  loadLocalPayloadManifests,
  loadPinnedCorpus,
  readExclusions,
} from "./corpus-pin";
import type { YamlValue } from "./corpus-yaml";

const scratches: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "plurimath-local-corpus-"));
  scratches.push(root);
  return root;
}

afterAll(() => {
  for (const root of scratches) rmSync(root, { recursive: true, force: true });
});

function activeLocalCorpusRoot(): string {
  return process.env.PLURIMATH_LOCAL_CORPUS_ROOT ?? LOCAL_CORPUS_ROOT;
}

function damagedCopy(mutate: (root: string) => void): string {
  const root = scratch();
  cpSync(LOCAL_CORPUS_ROOT, root, { recursive: true });
  mutate(root);
  return root;
}

function editFile(path: string, edit: (text: string) => string): void {
  writeFileSync(path, edit(readFileSync(path, "utf8")));
}

function stableKey(value: YamlValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableKey(entry)).join(",")}]`;
  const record = value as { readonly [key: string]: YamlValue };
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableKey(record[key] ?? null)}`)
    .join(",")}}`;
}

function findDuplicateListEntries(value: YamlValue, at: string): readonly string[] {
  const findings: string[] = [];
  if (Array.isArray(value)) {
    const seen = new Map<string, number>();
    const duplicates: string[] = [];
    value.forEach((entry, index) => {
      const key = stableKey(entry);
      const first = seen.get(key);
      if (first === undefined) seen.set(key, index);
      else duplicates.push(`${at}[${first}] and ${at}[${index}] repeat ${key}`);
      findings.push(...findDuplicateListEntries(entry, `${at}[${index}]`));
    });
    return [...duplicates, ...findings];
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      findings.push(...findDuplicateListEntries(entry, `${at}.${key}`));
    }
  }
  return findings;
}

function assertNoDuplicateManifestEntries(root: string): void {
  const findings = loadLocalPayloadManifests(root).flatMap((manifest) =>
    findDuplicateListEntries(manifest.document, manifest.manifestPath),
  );
  if (findings.length > 0) {
    throw new Error(`duplicate entries in manifest lists:\n${findings.join("\n")}`);
  }
}

/**
 * `raises` is the fact the old free-form reason got wrong, now recorded as
 * data by the generator instead of asserted in prose. That makes it checkable,
 * and this is the check: the shared pin only contains cases the gem actually
 * produced a formula for, so an exclusion claiming to raise cannot also be in
 * the pin, and one claiming not to raise must be.
 *
 * The earlier version of this test pattern-matched the reason text for
 * "raises" and similar. That fired on wording which was accurate — a reason
 * may legitimately explain that *invalid* inputs raise while this one does
 * not — and it could never have verified the claim it was policing. Prose is
 * not verifiable; a boolean is.
 */
function assertExclusionRaisesHold(root: string): void {
  const pinnedIds = new Set(loadPinnedCorpus().cases.map((entry) => entry.id));
  for (const entry of readExclusions(join(root, "exclusions.yaml"))) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(entry.matched);
    } catch (error) {
      throw new Error(`${entry.id}: matched is not a valid regex — ${String(error)}`);
    }
    if (!pattern.test(entry.input)) {
      throw new Error(`${entry.id}: matched does not match the input it excluded`);
    }
    const inPin = pinnedIds.has(entry.id);
    if (entry.raises && inPin) {
      throw new Error(`${entry.id}: recorded as raising, but the shared pin carries a case for it`);
    }
    if (!entry.raises && !inPin) {
      throw new Error(
        `${entry.id}: recorded as not raising, but the shared pin has no case for it`,
      );
    }
  }
}

function setRaisesForId(text: string, id: string, value: boolean): string {
  const lines = text.split("\n");
  let inEntry = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (line.startsWith("- id: ")) inEntry = line.slice("- id: ".length).trim() === id;
    if (inEntry && line.trim().startsWith("raises:")) {
      lines[index] = `  raises: ${value}`;
      return lines.join("\n");
    }
  }
  throw new Error(`no raises field for ${id}`);
}

describe("local corpus manifests as shipped", () => {
  it("load the two local sidecar manifests and verify their payload hashes", () => {
    const manifests = loadLocalPayloadManifests(activeLocalCorpusRoot());
    expect(
      manifests.map((manifest) => [manifest.manifestPath, manifest.payloadPath]),
    ).toStrictEqual([
      ["census.manifest.yaml", "census.yaml"],
      ["exclusions.manifest.yaml", "exclusions.yaml"],
    ]);
  });

  it("carry no duplicate entries in any manifest list", () => {
    expect(() => assertNoDuplicateManifestEntries(activeLocalCorpusRoot())).not.toThrow();
  });

  it("record raises for every excluded case, agreeing with the shared pin", () => {
    expect(() => assertExclusionRaisesHold(activeLocalCorpusRoot())).not.toThrow();
  });
});

describe("the local-manifest guards prove their own failure modes", () => {
  it("fails when a manifest list repeats a structural entry", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "census.manifest.yaml"), (text) =>
        text.replace("    - ffi\n    - fuzzy_match", "    - ffi\n    - ffi\n    - fuzzy_match"),
      );
    });
    expect(() => assertNoDuplicateManifestEntries(root)).toThrow(
      /duplicate entries in manifest lists/,
    );
  });

  it("fails when a payload changes without its sidecar hash changing", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "census.yaml"), (text) =>
        text.replace("Math::Function::Base", "Math::Function::BasE"),
      );
    });
    expect(() => loadLocalPayloadManifests(root)).toThrow(/sha256/);
  });

  it("fails when a payload length changes without its sidecar bytes changing", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "exclusions.yaml"), (text) => `${text}\n`);
    });
    expect(() => loadLocalPayloadManifests(root)).toThrow(/bytes on disk, provenance records/);
  });

  it("fails when a case that parses is recorded as raising", () => {
    // The defect this guards: `text-unitsml-valid` is `"unitsml(kg)"`, which
    // the gem parses fine. Claiming it raised is exactly what the old shared
    // reason string did, and what nothing caught.
    const root = damagedCopy((where) => {
      editFile(join(where, "exclusions.yaml"), (text) =>
        setRaisesForId(text, "text-unitsml-valid", true),
      );
    });
    expect(() => assertExclusionRaisesHold(root)).toThrow(/recorded as raising/);
  });

  it("fails when a case that raises is recorded as parsing", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "exclusions.yaml"), (text) =>
        setRaisesForId(text, "text-unitsml-invalid", false),
      );
    });
    expect(() => assertExclusionRaisesHold(root)).toThrow(/recorded as not raising/);
  });
});
