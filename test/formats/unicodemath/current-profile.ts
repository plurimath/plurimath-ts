/** Current Ruby measurements of the immutable historical investigation inputs. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

interface CurrentWitness {
  readonly input: string;
  readonly model?: unknown;
  readonly raises?: string;
  readonly [key: string]: unknown;
}
const here = dirname(fileURLToPath(import.meta.url));
const profiles = JSON.parse(readFileSync(join(here, "current-profiles.json"), "utf8")) as {
  schema: string;
  oracle: string;
  lockSha256: string;
  historicalInputs: Record<string, string>;
  groups: Record<string, CurrentWitness[]>;
};

export function currentSourceProfile(group: string): ReadonlyMap<string, CurrentWitness> {
  expect(profiles.schema).toBe("plurimath-unicodemath-current-profiles/1");
  expect(profiles.oracle).toBe("1a3033d0881d6c6ba655ab3ce00e0dc3cccfe5b4");
  expect(profiles.lockSha256).toBe(
    "f96dc6cd975477125156e67e1e9254993dc0dd6dc4ce517dd60b42d711d2a906",
  );
  const name = `${group}-fixtures.json`;
  const bytes = readFileSync(join(here, name));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    profiles.historicalInputs[`test/formats/unicodemath/${name}`],
  );
  const historical = JSON.parse(bytes.toString()) as { cases: { input: string }[] };
  const current = profiles.groups[group];
  if (current === undefined) throw new Error(`No current source profile for ${group}`);
  expect(current.length).toBeGreaterThan(0);
  expect(current.map((row) => row.input)).toStrictEqual(historical.cases.map((row) => row.input));
  expect(new Set(current.map((row) => row.input)).size).toBe(current.length);
  return new Map(current.map((row) => [row.input, row]));
}
