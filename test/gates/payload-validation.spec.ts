/**
 * The `payload-validation` class-A gate (gates.json, ARCHITECTURE.md §7):
 * "Generated source tables match their recorded inputs; managed renderer
 * fixtures have paired sidecars, validated provenance and payload hashes."
 *
 * `corpus-pin.ts` verifies the pinned corpus against its provenance, and
 * `local-corpus.spec.ts` does the same for this repository's own
 * `corpus/*.manifest.yaml` sidecars. This gate covers the remaining generated
 * TypeScript under `src/` and the managed `parity-fixtures.json` and
 * `degenerate-fixtures.json` families under `test/formats/`.
 *
 *   **does this artifact bind to the recorded inputs and a valid envelope?**
 *
 * Every generated artifact records every Ruby script whose bytes can change
 * it. JSON fixture provenance is adjacent rather than embedded, and this gate
 * validates its schema, clean/committable state, oracle/runtime/dependency
 * record, payload byte count and SHA-256, and stable row ids. It does not prove
 * Ruby output equivalence; the class-B regeneration gate does that.
 *
 * That is not hypothetical. This gate was written after exactly that happened:
 * `scripts/generate-corpus.rb` was edited twice for the manifest-accuracy work
 * and only its own outputs regenerated, leaving `src/core/generated` and
 * `src/formatting/generated` recording a hash of a script version that no
 * longer exists.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORE_GENERATED_PROVENANCE } from "../../src/core/generated/provenance";
import { FORMATTING_GENERATED_PROVENANCE } from "../../src/formatting/generated/provenance";
import { GENERATED_PROVENANCE } from "../../src/generated/provenance";
import { loadPinnedCorpus, PIN_RELATIVE_PATH, pinnedSubmoduleCommit } from "../core/corpus-pin";
import { parseYaml } from "../core/corpus-yaml";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sha256OfFile(relative: string): string {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path))
    throw new Error(`${relative} is recorded as a generator input but is missing`);
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitFileSha256AtCommit(
  commit: string,
  relative: string,
  repository: string = REPO_ROOT,
): string {
  const result = spawnSync("git", ["show", `${commit}:${relative}`], { cwd: repository });
  if (result.error !== undefined) {
    throw new Error(`could not run git to read ${relative} at ${commit}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${relative} is not readable at recorded commit ${commit} ` +
        `(git exited ${result.status}): ${String(result.stderr).trim()}`,
    );
  }
  return createHash("sha256")
    .update(result.stdout ?? Buffer.alloc(0))
    .digest("hex");
}

/**
 * The generated JSON fixtures under `test/formats/`, and the provenance each
 * one carries.
 *
 * These managed families are generated data exactly as `src/generated` is, and
 * they were outside this gate entirely: nothing hashed the generators that
 * wrote them, so a fixture and its generator could be edited together and the
 * suite would stay green. Their basenames are explicit because three older
 * `render-sweep.json` files are one-off fixtures with no reproducible generator
 * or sidecar yet; the inventory assertion below keeps that exception closed.
 */
const FORMATS_ROOT = join(REPO_ROOT, "test", "formats");
const MANIFEST_SCHEMA = "plurimath-corpus/manifest/1";
const PIN_PROVENANCE_SCHEMA = "plurimath-corpus/provenance/2";
const CANONICAL_XML_ENGINE = "Plurimath::XmlEngine::OxEngine";
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const FIXTURE_SPECS = {
  "degenerate-fixtures.json": {
    generator: "scripts/probe-degenerate-slots.rb",
    schema: "plurimath-corpus/degenerate-slots/1",
    rows: "rows",
    usesCorpus: false,
    usesRenderInventory: true,
  },
  "parity-fixtures.json": {
    generator: "scripts/generate-parity-fixtures.rb",
    schema: "plurimath-corpus/render-parity/1",
    rows: "cases",
    usesCorpus: true,
    usesRenderInventory: false,
  },
} as const;
const FIXTURE_BASENAMES = Object.keys(FIXTURE_SPECS) as readonly (
  | "degenerate-fixtures.json"
  | "parity-fixtures.json"
)[];
const LEGACY_FORMAT_FIXTURES = [
  "test/formats/asciimath/render-sweep.json",
  "test/formats/latex/render-sweep.json",
  "test/formats/mathml/render-sweep.json",
] as const;

function filesUnder(root: string, accept: (name: string) => boolean): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (accept(entry.name)) found.push(relative(REPO_ROOT, path).split(sep).join("/"));
    }
  };
  walk(root);
  return found.sort();
}

function currentRendererPaths(format: string): string[] {
  const root = join(REPO_ROOT, "src", "render");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `src/render/${entry.name}/${format}.ts`)
    .filter((path) => existsSync(join(REPO_ROOT, path)) && statSync(join(REPO_ROOT, path)).isFile())
    .sort();
}

function kindFromRendererPath(path: string): string {
  const directory = path.split("/")[2];
  if (directory === undefined) throw new Error(`invalid renderer path: ${path}`);
  return directory.replace(/-([a-z])/g, (_whole, letter: string) => letter.toUpperCase());
}

function pathInventorySha256(paths: readonly string[]): string {
  return createHash("sha256")
    .update(`${paths.join("\n")}\n`)
    .digest("hex");
}

type Mapping = { readonly [key: string]: unknown };

function mapping(value: unknown, where: string): Mapping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be a mapping`);
  }
  return value as Mapping;
}

function mapField(record: Mapping, key: string, where: string): Mapping {
  return mapping(record[key], `${where}.${key}`);
}

function stringField(record: Mapping, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${where}.${key} must be a non-empty string`);
  }
  return value;
}

function stringValue(record: Mapping, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`${where}.${key} must be a string`);
  return value;
}

function booleanField(record: Mapping, key: string, where: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`${where}.${key} must be a boolean`);
  return value;
}

function integerField(record: Mapping, key: string, where: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${where}.${key} must be an integer`);
  }
  return value;
}

function arrayField(record: Mapping, key: string, where: string): readonly unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${where}.${key} must be an array`);
  return value;
}

function expectExactKeys(record: Mapping, expected: readonly string[], where: string): void {
  expect(Object.keys(record).sort(), `${where}: exact schema keys`).toStrictEqual(
    [...expected].sort(),
  );
}

interface FixtureRecord {
  readonly relative: string;
  readonly manifestRelative: string;
  readonly bytes: Buffer;
  readonly payload: Mapping;
  readonly manifest: Mapping;
  readonly spec: (typeof FIXTURE_SPECS)[keyof typeof FIXTURE_SPECS];
}

const FORMAT_DIRECTORIES = readdirSync(FORMATS_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const ALL_FORMAT_JSON_PAYLOADS = filesUnder(FORMATS_ROOT, (name) => name.endsWith(".json"));
const FIXTURE_PAYLOADS = FORMAT_DIRECTORIES.flatMap((format) =>
  FIXTURE_BASENAMES.filter((name) => existsSync(join(FORMATS_ROOT, format, name))).map(
    (name) => `test/formats/${format}/${name}`,
  ),
).sort();
const FIXTURE_MANIFESTS = filesUnder(FORMATS_ROOT, (name) => name.endsWith(".manifest.yaml"));
const EXPECTED_FIXTURE_MANIFESTS = FIXTURE_PAYLOADS.map((relative) =>
  relative.replace(/\.json$/, ".manifest.yaml"),
).sort();

const FIXTURE_RECORDS: readonly FixtureRecord[] = FIXTURE_PAYLOADS.filter((relative) =>
  existsSync(join(REPO_ROOT, relative.replace(/\.json$/, ".manifest.yaml"))),
).map((relative) => {
  const name = basename(relative) as keyof typeof FIXTURE_SPECS;
  const manifestRelative = relative.replace(/\.json$/, ".manifest.yaml");
  const bytes = readFileSync(join(REPO_ROOT, relative));
  return {
    relative,
    manifestRelative,
    bytes,
    payload: mapping(JSON.parse(bytes.toString("utf8")), relative),
    manifest: mapping(
      parseYaml(readFileSync(join(REPO_ROOT, manifestRelative), "utf8")),
      manifestRelative,
    ),
    spec: FIXTURE_SPECS[name],
  };
});

function fixtureGeneratorInputs(record: FixtureRecord): Mapping {
  return mapField(
    mapField(record.manifest, "generator", record.manifestRelative),
    "inputs",
    record.manifestRelative,
  );
}

const FIXTURE_GENERATOR_HASHES: ReadonlyArray<
  readonly [label: string, file: string, hash: string]
> = FIXTURE_RECORDS.flatMap((record) =>
  Object.entries(fixtureGeneratorInputs(record)).map(([file, hash]) => {
    if (typeof hash !== "string") {
      throw new Error(`${record.manifestRelative}: generator.inputs.${file} must be a string`);
    }
    return [record.relative, file, hash] as const;
  }),
);

/**
 * Every (file, recorded hash) pair the provenance records assert.
 *
 * `src/generated` records one script as `generatorSha256`; the other two
 * modules record a map because they consume more than one; each generated
 * fixture records the one script that wrote it. Every shape reduces to the
 * same claim, so all are checked the same way.
 */
const RECORDED: ReadonlyArray<readonly [label: string, file: string, hash: string]> = [
  ["src/generated", GENERATED_PROVENANCE.generator, GENERATED_PROVENANCE.generatorSha256],
  ...[...CORE_GENERATED_PROVENANCE.generatorInputs].map(
    ([file, hash]) => ["src/core/generated", file, hash] as const,
  ),
  ...[...FORMATTING_GENERATED_PROVENANCE.generatorInputs].map(
    ([file, hash]) => ["src/formatting/generated", file, hash] as const,
  ),
  ...FIXTURE_GENERATOR_HASHES,
];

describe("per-format generated fixtures have complete sidecar provenance", () => {
  it("pairs every discovered payload with one sidecar, and has no orphan sidecars", () => {
    expect(FIXTURE_PAYLOADS.length).toBeGreaterThan(0);
    expect(FIXTURE_MANIFESTS).toStrictEqual(EXPECTED_FIXTURE_MANIFESTS);
  });

  it("accounts for every other per-format JSON payload as an explicit legacy gap", () => {
    expect([...FIXTURE_PAYLOADS, ...LEGACY_FORMAT_FIXTURES].sort()).toStrictEqual(
      ALL_FORMAT_JSON_PAYLOADS,
    );
  });

  it.each(FIXTURE_RECORDS.map((record) => [record.relative, record] as const))(
    "%s",
    (_label, record) => {
      const at = record.manifestRelative;
      const manifest = record.manifest;
      expectExactKeys(
        manifest,
        [
          "schema",
          "committable",
          "warnings",
          "generator",
          "oracle",
          "ruby",
          "xml_engine",
          "configuration",
          "dependencies",
          ...(record.spec.usesCorpus ? ["corpus"] : []),
          "payload",
        ],
        at,
      );
      expect(stringField(manifest, "schema", at)).toBe(MANIFEST_SCHEMA);
      expect(booleanField(manifest, "committable", at)).toBe(true);
      expect(arrayField(manifest, "warnings", at)).toStrictEqual([]);

      const generator = mapField(manifest, "generator", at);
      const inputs = mapField(generator, "inputs", `${at}.generator`);
      expectExactKeys(
        generator,
        [
          "path",
          "sha256",
          "inputs",
          "repository",
          ...(record.spec.usesRenderInventory ? ["inventory"] : []),
        ],
        `${at}.generator`,
      );
      expect(stringField(generator, "path", `${at}.generator`)).toBe(record.spec.generator);
      expect(stringField(generator, "sha256", `${at}.generator`)).toBe(
        stringField(inputs, record.spec.generator, `${at}.generator.inputs`),
      );
      expect(Object.keys(inputs).sort()).toStrictEqual(
        [
          "scripts/generate-corpus.rb",
          "scripts/render-fixture-provenance.rb",
          record.spec.generator,
        ].sort(),
      );
      const generatorRepository = mapField(generator, "repository", `${at}.generator`);
      expectExactKeys(
        generatorRepository,
        ["commit", "clean", "dirty_paths"],
        `${at}.generator.repository`,
      );
      const generatorCommit = stringField(
        generatorRepository,
        "commit",
        `${at}.generator.repository`,
      );
      for (const [path, hash] of Object.entries(inputs)) {
        expect(hash, `${at}.generator.inputs.${path}`).toMatch(SHA256);
        expect(sha256OfFile(path), `${at}.generator.inputs.${path}`).toBe(hash);
      }

      expect(generatorCommit).toMatch(COMMIT);
      expect(booleanField(generatorRepository, "clean", `${at}.generator.repository`)).toBe(true);
      expect(arrayField(generatorRepository, "dirty_paths", `${at}.generator.repository`)).toEqual(
        [],
      );

      if (record.spec.usesRenderInventory) {
        const inventory = mapField(generator, "inventory", `${at}.generator`);
        expectExactKeys(inventory, ["glob", "paths", "sha256"], `${at}.generator.inventory`);
        const format = stringField(record.payload, "format", record.relative);
        expect(stringField(inventory, "glob", `${at}.generator.inventory`)).toBe(
          `src/render/*/${format}.ts`,
        );
        const paths = arrayField(inventory, "paths", `${at}.generator.inventory`).map(
          (path, index) => {
            expect(typeof path, `${at}.generator.inventory.paths[${index}]`).toBe("string");
            expect(
              String(path).length,
              `${at}.generator.inventory.paths[${index}]`,
            ).toBeGreaterThan(0);
            return String(path);
          },
        );
        expect(paths.length, `${at}.generator.inventory.paths`).toBeGreaterThan(0);
        expect(paths, `${at}.generator.inventory.paths sorted`).toStrictEqual([...paths].sort());
        expect(new Set(paths).size, `${at}.generator.inventory.paths unique`).toBe(paths.length);
        expect(stringField(inventory, "sha256", `${at}.generator.inventory`)).toBe(
          pathInventorySha256(paths),
        );
        expect(paths, `${at}.generator.inventory current tree`).toStrictEqual(
          currentRendererPaths(format),
        );
        const payloadInventory = arrayField(record.payload, "inventory", record.relative)
          .map(String)
          .sort();
        expect(
          paths.map(kindFromRendererPath).sort(),
          `${at}.generator.inventory kinds`,
        ).toStrictEqual(payloadInventory);
      } else {
        expect(generator.inventory, `${at}.generator.inventory`).toBeUndefined();
      }

      const pin = loadPinnedCorpus().provenance;
      const oracle = mapField(manifest, "oracle", at);
      expectExactKeys(
        oracle,
        ["gem", "version", "kind", "commit", "clean", "dirty_paths"],
        `${at}.oracle`,
      );
      expect(stringField(oracle, "gem", `${at}.oracle`)).toBe("plurimath");
      expect(stringField(oracle, "kind", `${at}.oracle`)).toBe("git-checkout");
      expect(stringField(oracle, "version", `${at}.oracle`)).toBe(pin.oracleVersion);
      expect(stringField(oracle, "commit", `${at}.oracle`)).toBe(pin.oracleCommit);
      expect(booleanField(oracle, "clean", `${at}.oracle`)).toBe(true);
      expect(arrayField(oracle, "dirty_paths", `${at}.oracle`)).toEqual([]);

      if (record.spec.usesCorpus) {
        const corpus = mapField(manifest, "corpus", at);
        expectExactKeys(corpus, ["path", "repository", "provenance"], `${at}.corpus`);
        expect(stringField(corpus, "path", `${at}.corpus`)).toBe(PIN_RELATIVE_PATH);
        const corpusRepository = mapField(corpus, "repository", `${at}.corpus`);
        expectExactKeys(
          corpusRepository,
          ["commit", "clean", "dirty_paths"],
          `${at}.corpus.repository`,
        );
        const pin = pinnedSubmoduleCommit();
        expect(pin.mode).toBe("160000");
        const corpusCommit = stringField(corpusRepository, "commit", `${at}.corpus.repository`);
        expect(corpusCommit).toBe(pin.indexCommit);
        expect(pin.headCommit).toBe(pin.indexCommit);
        expect(booleanField(corpusRepository, "clean", `${at}.corpus.repository`)).toBe(true);
        expect(arrayField(corpusRepository, "dirty_paths", `${at}.corpus.repository`)).toEqual([]);
        const corpusManifest = mapField(corpus, "provenance", `${at}.corpus`);
        expectExactKeys(corpusManifest, ["path", "schema", "sha256"], `${at}.corpus.provenance`);
        expect(stringField(corpusManifest, "path", `${at}.corpus.provenance`)).toBe(
          "corpus/provenance.yaml",
        );
        expect(stringField(corpusManifest, "schema", `${at}.corpus.provenance`)).toBe(
          PIN_PROVENANCE_SCHEMA,
        );
        expect(stringField(corpusManifest, "sha256", `${at}.corpus.provenance`)).toBe(
          sha256OfFile(`${PIN_RELATIVE_PATH}/corpus/provenance.yaml`),
        );
        expect(stringField(corpusManifest, "sha256", `${at}.corpus.provenance`)).toBe(
          gitFileSha256AtCommit(
            corpusCommit,
            "corpus/provenance.yaml",
            join(REPO_ROOT, PIN_RELATIVE_PATH),
          ),
        );
      } else {
        expect(
          manifest.corpus,
          `${at}: a non-corpus generator must not claim a corpus input`,
        ).toBeUndefined();
      }

      const ruby = mapField(manifest, "ruby", at);
      expectExactKeys(ruby, ["engine", "version"], `${at}.ruby`);
      expect(stringField(ruby, "engine", `${at}.ruby`)).toBe("ruby");
      expect(stringField(ruby, "version", `${at}.ruby`)).toMatch(/^\d+\.\d+\.\d+$/);
      expect(stringField(manifest, "xml_engine", at)).toBe(CANONICAL_XML_ENGINE);
      expect(mapping(manifest.configuration, `${at}.configuration`)).toStrictEqual({});

      const dependencies = mapField(manifest, "dependencies", at);
      expectExactKeys(
        dependencies,
        ["lockfile", "sources", "direct_runtime"],
        `${at}.dependencies`,
      );
      const lockfile = mapField(dependencies, "lockfile", `${at}.dependencies`);
      expectExactKeys(
        lockfile,
        ["path", "sha256", "resolved_gems", "platforms", "bundler"],
        `${at}.dependencies.lockfile`,
      );
      expect(stringField(lockfile, "path", `${at}.dependencies.lockfile`)).toBe("Gemfile.lock");
      expect(stringField(lockfile, "sha256", `${at}.dependencies.lockfile`)).toMatch(SHA256);
      expect(
        integerField(lockfile, "resolved_gems", `${at}.dependencies.lockfile`),
      ).toBeGreaterThan(0);
      const platforms = arrayField(lockfile, "platforms", `${at}.dependencies.lockfile`);
      expect(platforms.length).toBeGreaterThan(0);
      for (const [index, platform] of platforms.entries()) {
        expect(typeof platform, `${at}.dependencies.lockfile.platforms[${index}]`).toBe("string");
        expect(
          String(platform).length,
          `${at}.dependencies.lockfile.platforms[${index}]`,
        ).toBeGreaterThan(0);
      }
      expect(stringField(lockfile, "bundler", `${at}.dependencies.lockfile`)).toMatch(
        /^\d+\.\d+\.\d+/,
      );

      const sources = arrayField(dependencies, "sources", `${at}.dependencies`);
      expect(sources.length).toBeGreaterThan(0);
      for (const [index, sourceValue] of sources.entries()) {
        const source = mapping(sourceValue, `${at}.dependencies.sources[${index}]`);
        const sourceAt = `${at}.dependencies.sources[${index}]`;
        const kind = stringField(source, "kind", sourceAt);
        expect(["gem", "git", "path"], `${sourceAt}.kind`).toContain(kind);
        const remote = stringField(source, "remote", sourceAt);
        const gems = arrayField(source, "gems", sourceAt);
        expect(gems.length, `${sourceAt}.gems`).toBeGreaterThan(0);
        for (const [gemIndex, gem] of gems.entries()) {
          expect(typeof gem, `${sourceAt}.gems[${gemIndex}]`).toBe("string");
          expect(String(gem).length, `${sourceAt}.gems[${gemIndex}]`).toBeGreaterThan(0);
        }
        expect(new Set(gems).size, `${sourceAt}.gems must be unique`).toBe(gems.length);
        if (kind === "git") {
          expectExactKeys(source, ["kind", "remote", "revision", "gems"], sourceAt);
          expect(stringField(source, "revision", sourceAt)).toMatch(IMMUTABLE_REVISION);
        } else {
          expectExactKeys(source, ["kind", "remote", "gems"], sourceAt);
          expect(source.revision, `${sourceAt}.revision`).toBeUndefined();
          if (kind === "path") expect(remote, `${sourceAt}.remote`).toBe(".");
        }
      }

      const directRuntime = arrayField(dependencies, "direct_runtime", `${at}.dependencies`);
      expect(directRuntime.length).toBeGreaterThan(0);
      const directNames: string[] = [];
      for (const [index, dependencyValue] of directRuntime.entries()) {
        const dependency = mapping(dependencyValue, `${at}.dependencies.direct_runtime[${index}]`);
        const dependencyAt = `${at}.dependencies.direct_runtime[${index}]`;
        directNames.push(stringField(dependency, "name", dependencyAt));
        stringField(dependency, "version", dependencyAt);
        stringField(dependency, "platform", dependencyAt);
        const sourceKind = stringField(dependency, "source_kind", dependencyAt);
        expect(["gem", "git", "path"], `${dependencyAt}.source_kind`).toContain(sourceKind);
        const source = stringField(dependency, "source", dependencyAt);
        const baseKeys = ["name", "version", "platform", "source_kind", "source"];
        if (sourceKind === "git") {
          expectExactKeys(dependency, [...baseKeys, "revision"], dependencyAt);
          expect(stringField(dependency, "revision", dependencyAt)).toMatch(IMMUTABLE_REVISION);
        } else {
          expectExactKeys(dependency, baseKeys, dependencyAt);
          expect(dependency.revision, `${dependencyAt}.revision`).toBeUndefined();
          if (sourceKind === "path") expect(source, `${dependencyAt}.source`).toBe(".");
        }
      }
      expect(new Set(directNames).size, `${at}.dependencies.direct_runtime names`).toBe(
        directNames.length,
      );

      const payload = mapField(manifest, "payload", at);
      expectExactKeys(payload, ["path", "schema", "sha256", "bytes"], `${at}.payload`);
      expect(stringField(payload, "path", `${at}.payload`)).toBe(basename(record.relative));
      expect(stringField(payload, "schema", `${at}.payload`)).toBe(record.spec.schema);
      expect(stringField(payload, "sha256", `${at}.payload`)).toBe(
        createHash("sha256").update(record.bytes).digest("hex"),
      );
      expect(integerField(payload, "bytes", `${at}.payload`)).toBe(record.bytes.byteLength);
      expect(stringField(record.payload, "schema", record.relative)).toBe(record.spec.schema);
      expect(stringField(record.payload, "format", record.relative)).toBe(
        basename(dirname(record.relative)),
      );
      stringField(record.payload, "$comment", record.relative);

      const rows = arrayField(record.payload, record.spec.rows, record.relative);
      expect(rows.length).toBeGreaterThan(0);
      const ids = rows.map((row, index) => {
        const item = mapping(row, `${record.relative}.${record.spec.rows}[${index}]`);
        if (record.spec.rows === "cases") return stringField(item, "id", record.relative);
        return `${stringField(item, "kind", record.relative)}[${integerField(item, "slot", record.relative)}]=${stringField(item, "value", record.relative)}`;
      });
      expect(new Set(ids).size, `${record.relative}: stable row ids must be unique`).toBe(
        ids.length,
      );

      if (record.spec.rows === "cases") {
        expectExactKeys(
          record.payload,
          ["$comment", "schema", "format", "caseCount", "renderedCount", "raisedCount", "cases"],
          record.relative,
        );
        expect(integerField(record.payload, "caseCount", record.relative)).toBe(rows.length);
        const rendered = rows.filter((row, index) => {
          const item = mapping(row, `${record.relative}.cases[${index}]`);
          stringField(item, "group", record.relative);
          stringValue(item, "input", record.relative);
          const hasExpected = typeof item.expected === "string";
          const hasRefusal = typeof item.raises === "string";
          expect(
            Number(hasExpected) + Number(hasRefusal),
            `${record.relative}.cases[${index}] outcome`,
          ).toBe(1);
          if (hasRefusal) {
            expectExactKeys(
              item,
              ["group", "id", "input", "raises", "raisedIn"],
              `${record.relative}.cases[${index}]`,
            );
            expect(stringField(item, "raises", record.relative)).toBe(
              "Plurimath::Math::ParseError",
            );
            expect(["parse", "render"]).toContain(stringField(item, "raisedIn", record.relative));
          } else {
            expectExactKeys(
              item,
              ["group", "id", "input", "expected"],
              `${record.relative}.cases[${index}]`,
            );
          }
          return hasExpected;
        }).length;
        expect(integerField(record.payload, "renderedCount", record.relative)).toBe(rendered);
        expect(integerField(record.payload, "raisedCount", record.relative)).toBe(
          rows.length - rendered,
        );
      } else {
        expectExactKeys(
          record.payload,
          [
            "$comment",
            "schema",
            "format",
            "inventory",
            "kinds",
            "rowCount",
            "constructsCount",
            "rendersCount",
            "unstableCount",
            "rows",
          ],
          record.relative,
        );
        const inventory = arrayField(record.payload, "inventory", record.relative);
        expect(inventory.length).toBeGreaterThan(0);
        for (const [index, kind] of inventory.entries()) {
          expect(typeof kind, `${record.relative}.inventory[${index}]`).toBe("string");
          expect(String(kind).length, `${record.relative}.inventory[${index}]`).toBeGreaterThan(0);
        }
        expect(new Set(inventory).size, `${record.relative}.inventory must be unique`).toBe(
          inventory.length,
        );
        const kinds = mapField(record.payload, "kinds", record.relative);
        expect(Object.keys(kinds).length).toBeGreaterThan(0);
        const renderKinds: string[] = [];
        for (const [kind, value] of Object.entries(kinds)) {
          const entry = mapping(value, `${record.relative}.kinds.${kind}`);
          expectExactKeys(
            entry,
            ["renderKind", "rubyClass", "slots"],
            `${record.relative}.kinds.${kind}`,
          );
          renderKinds.push(stringField(entry, "renderKind", `${record.relative}.kinds.${kind}`));
          stringField(entry, "rubyClass", `${record.relative}.kinds.${kind}`);
          const slots = arrayField(entry, "slots", `${record.relative}.kinds.${kind}`);
          expect(slots.length, `${record.relative}.kinds.${kind}.slots`).toBeGreaterThan(0);
          for (const [index, slot] of slots.entries()) {
            expect(typeof slot, `${record.relative}.kinds.${kind}.slots[${index}]`).toBe("string");
            expect(["node", "sequence", "string"]).toContain(slot);
          }
        }
        expect(
          [...new Set(renderKinds)].sort(),
          `${record.relative}: inventory/render kinds`,
        ).toStrictEqual([...inventory].map(String).sort());
        expect(integerField(record.payload, "rowCount", record.relative)).toBe(rows.length);
        let constructs = 0;
        let renders = 0;
        let unstable = 0;
        const rowKinds = new Set<string>();
        for (const [index, rowValue] of rows.entries()) {
          const item = mapping(rowValue, `${record.relative}.rows[${index}]`);
          const kind = stringField(item, "kind", record.relative);
          rowKinds.add(kind);
          expect(kinds).toHaveProperty(kind);
          const slot = integerField(item, "slot", record.relative);
          expect(slot, `${record.relative}.rows[${index}].slot`).toBeGreaterThanOrEqual(0);
          const slots = arrayField(
            mapField(kinds, kind, `${record.relative}.kinds`),
            "slots",
            record.relative,
          );
          expect(slot, `${record.relative}.rows[${index}].slot`).toBeLessThan(slots.length);
          stringField(item, "value", record.relative);
          const constructsRow = booleanField(item, "constructs", record.relative);
          if (!constructsRow) {
            expectExactKeys(
              item,
              ["kind", "slot", "value", "constructs", "constructError"],
              `${record.relative}.rows[${index}]`,
            );
            expect(stringField(item, "constructError", record.relative)).toBe("NoMethodError");
            continue;
          }
          constructs += 1;
          const rendersRow = booleanField(item, "renders", record.relative);
          if (!rendersRow) {
            expectExactKeys(
              item,
              ["kind", "slot", "value", "constructs", "renders", "error"],
              `${record.relative}.rows[${index}]`,
            );
            expect(stringField(item, "error", record.relative)).toBe("Plurimath::Math::ParseError");
            continue;
          }
          renders += 1;
          if (item.stable === false) {
            expectExactKeys(
              item,
              ["kind", "slot", "value", "constructs", "renders", "stable"],
              `${record.relative}.rows[${index}]`,
            );
            unstable += 1;
          } else {
            expectExactKeys(
              item,
              ["kind", "slot", "value", "constructs", "renders", "output"],
              `${record.relative}.rows[${index}]`,
            );
            stringValue(item, "output", record.relative);
          }
        }
        expect([...rowKinds].sort(), `${record.relative}: rows/kinds`).toStrictEqual(
          Object.keys(kinds).sort(),
        );
        expect(integerField(record.payload, "constructsCount", record.relative)).toBe(constructs);
        expect(integerField(record.payload, "rendersCount", record.relative)).toBe(renders);
        expect(integerField(record.payload, "unstableCount", record.relative)).toBe(unstable);
      }
    },
  );
});

describe("generated data binds to the generator inputs it names", () => {
  it("has something to check", () => {
    // The failure this file exists to catch is a silent one, so it must not be
    // possible for the list itself to be empty and every assertion vacuous.
    expect(RECORDED.length).toBeGreaterThan(3);
  });

  it("found the generated fixtures under test/formats", () => {
    // Zero discovered fixtures would make every fixture assertion below
    // vacuous while the suite stayed green.
    expect(FIXTURE_RECORDS.length).toBeGreaterThan(0);
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

  it("accounts for every Ruby data-generator entrypoint, including the known XML gap", () => {
    const shipped = readdirSync(join(REPO_ROOT, "scripts"))
      .filter(
        (name) =>
          (name.startsWith("generate-") || name === "probe-degenerate-slots.rb") &&
          name.endsWith(".rb"),
      )
      .map((name) => `scripts/${name}`)
      .sort();
    const fixtureEntrypoints = FIXTURE_RECORDS.map((record) => record.spec.generator);
    const recordedEntrypoints = [
      GENERATED_PROVENANCE.generator,
      CORE_GENERATED_PROVENANCE.generator,
      FORMATTING_GENERATED_PROVENANCE.generator,
      ...fixtureEntrypoints,
    ];
    // This is an explicit gap, not a generator silently omitted from a
    // hard-coded "complete" list. Its output predates sidecar provenance and
    // belongs to a separate XML-contract change.
    const knownUnmanifested = ["scripts/generate-xml-fixtures.rb"];
    expect(new Set(recordedEntrypoints).has(knownUnmanifested[0] as string)).toBe(false);
    expect([...new Set([...recordedEntrypoints, ...knownUnmanifested])].sort()).toStrictEqual(
      shipped,
    );
  });
});

const COMMITTABLE_RECORDS: ReadonlyArray<readonly [string, boolean]> = [
  ["src/generated", GENERATED_PROVENANCE.committable],
  ["src/core/generated", CORE_GENERATED_PROVENANCE.committable],
  ["src/formatting/generated", FORMATTING_GENERATED_PROVENANCE.committable],
  ...FIXTURE_RECORDS.map(
    (record) =>
      [
        record.relative,
        booleanField(record.manifest, "committable", record.manifestRelative),
      ] as const,
  ),
];

describe("the generated payloads declare themselves committable", () => {
  it.each(COMMITTABLE_RECORDS)("%s", (_label, committable) => {
    // `committable: false` marks output generated from a dirty checkout (§7).
    // Shipping it is the thing this flag exists to prevent.
    expect(committable).toBe(true);
  });
});
