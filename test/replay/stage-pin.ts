/**
 * The reader for a plurimath-testsuite stage pin: one language's generation
 * under `stages/<language>/generations/<NNNNNN>/`, named by a pin file in
 * `test/fixtures/testsuite-pins/<language>.yml`.
 *
 * The Ruby stage gems commit the same file (`spec/fixtures/testsuite-pin.yml`,
 * schema `plurimath-stage/pin/1`) and check it with the testsuite's own
 * `ruby scripts/validate-stages.rb <checkout> --pin <file>`. CI here runs that
 * validator too (`.github/workflows/ci.yml`, job `stage-replay`); this module
 * makes the same checks in Node so `vitest run` refuses a pin the validator
 * would refuse, without needing Ruby:
 *
 *   - the pin matches `schema/stage-pin.json` exactly;
 *   - its commit is the commit the submodule checkout is at, and the one the
 *     superproject index pins;
 *   - the ledger (`generations/<language>.yaml`) lists the pinned generation
 *     with the pinned digest;
 *   - the digest recomputed from the generation's files (`snapshot_digest` in
 *     `validate-stages.rb`) is the pinned one;
 *   - `provenance.yaml` lists exactly the payload files on disk, with the
 *     right byte count, sha256 and case ids, and the row count is the
 *     ledger's.
 *
 * Every failure throws with what to run; nothing is skipped.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PINNED_CORPUS_ROOT, pinnedSubmoduleCommit, REPO_ROOT } from "../core/corpus-pin";
import { parseYaml, type YamlValue } from "../core/corpus-yaml";

export const STAGE_LANGUAGES = [
  "asciimath",
  "latex",
  "unicode",
  "mathml",
  "omml",
  "html",
  "roundtrip",
] as const;
export type StageLanguage = (typeof STAGE_LANGUAGES)[number];

/** Where this repository commits its pins, one file per language. */
export const PIN_DIRECTORY = join(REPO_ROOT, "test", "fixtures", "testsuite-pins");

export function pinPath(language: StageLanguage): string {
  return join(PIN_DIRECTORY, `${language}.yml`);
}

const PIN_SCHEMA = "plurimath-stage/pin/1";
const LEDGER_SCHEMA = "plurimath-stage/ledger/1";
const PROVENANCE_SCHEMA = "plurimath-stage/provenance/1";
const REPOSITORY = "https://github.com/plurimath/plurimath-testsuite";
const PIN_KEYS = ["schema", "repository", "commit", "language", "generation", "snapshot_digest"];

type Mapping = { readonly [key: string]: YamlValue };

export function asMapping(value: YamlValue | undefined, where: string): Mapping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a mapping`);
  }
  return value as Mapping;
}

export function asSequence(value: YamlValue | undefined, where: string): readonly YamlValue[] {
  if (!Array.isArray(value)) throw new Error(`${where}: expected a sequence`);
  return value;
}

export function asString(value: YamlValue | undefined, where: string): string {
  if (typeof value !== "string") throw new Error(`${where}: expected a string`);
  return value;
}

function asInteger(value: YamlValue | undefined, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${where}: expected an integer`);
  }
  return value;
}

export interface StagePin {
  readonly schema: string;
  readonly repository: string;
  readonly commit: string;
  readonly language: StageLanguage;
  readonly generation: number;
  readonly snapshotDigest: string;
}

/** Reads and schema-checks a pin (`schema/stage-pin.json`); nothing else. */
export function readPinFile(path: string): StagePin {
  if (!existsSync(path)) throw new Error(`${path}: the stage pin does not exist`);
  const pin = asMapping(parseYaml(readFileSync(path, "utf8")), path);
  const keys = Object.keys(pin).sort();
  if (keys.join(",") !== [...PIN_KEYS].sort().join(",")) {
    throw new Error(`${path}: a pin has exactly the keys ${PIN_KEYS.join(", ")}; found ${keys}`);
  }
  const schema = asString(pin.schema, `${path} schema`);
  if (schema !== PIN_SCHEMA) throw new Error(`${path}: schema must be ${PIN_SCHEMA}`);
  const repository = asString(pin.repository, `${path} repository`);
  if (repository !== REPOSITORY) throw new Error(`${path}: repository must be ${REPOSITORY}`);
  const commit = asString(pin.commit, `${path} commit`);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${path}: commit is not a full sha`);
  const language = asString(pin.language, `${path} language`);
  if (!(STAGE_LANGUAGES as readonly string[]).includes(language)) {
    throw new Error(`${path}: language ${language} is not one of ${STAGE_LANGUAGES.join(", ")}`);
  }
  const generation = asInteger(pin.generation, `${path} generation`);
  if (generation < 1) throw new Error(`${path}: generation must be at least 1`);
  const snapshotDigest = asString(pin.snapshot_digest, `${path} snapshot_digest`);
  if (!/^sha256:[0-9a-f]{64}$/.test(snapshotDigest)) {
    throw new Error(`${path}: snapshot_digest is not sha256:<64 hex>`);
  }
  return {
    schema,
    repository,
    commit,
    language: language as StageLanguage,
    generation,
    snapshotDigest,
  };
}

export interface LedgerEntry {
  readonly generation: number;
  readonly path: string;
  readonly snapshotDigest: string;
  readonly payloads: number;
  readonly rows: number;
}

export function readLedger(language: StageLanguage, root: string = PINNED_CORPUS_ROOT) {
  const path = join(root, "generations", `${language}.yaml`);
  if (!existsSync(path)) throw new Error(`${path}: the ${language} ledger does not exist`);
  const ledger = asMapping(parseYaml(readFileSync(path, "utf8")), path);
  if (ledger.schema !== LEDGER_SCHEMA) throw new Error(`${path}: schema must be ${LEDGER_SCHEMA}`);
  if (ledger.language !== language) throw new Error(`${path}: language must be ${language}`);
  return asSequence(ledger.entries, `${path} entries`).map((value, index): LedgerEntry => {
    const at = `${path} entries[${index}]`;
    const entry = asMapping(value, at);
    return {
      generation: asInteger(entry.generation, `${at} generation`),
      path: asString(entry.path, `${at} path`),
      snapshotDigest: asString(entry.snapshot_digest, `${at} snapshot_digest`),
      payloads: asInteger(entry.payloads, `${at} payloads`),
      rows: asInteger(entry.rows, `${at} rows`),
    };
  });
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * `Testsuite::Stages.snapshot_digest`: sha256 over `<sha256>  <path>\n` for
 * every file of the generation, paths relative to the generation directory
 * and ordered by their bytes.
 */
export function snapshotDigest(files: ReadonlyMap<string, Buffer>): string {
  const paths = [...files.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const lines = paths.map((path) => `${sha256(files.get(path) as Buffer)}  ${path}\n`).join("");
  return `sha256:${sha256(Buffer.from(lines, "utf8"))}`;
}

export interface StagePayload {
  /** Relative to the generation directory, e.g. `payloads/raw-frac.yaml`. */
  readonly path: string;
  readonly document: Mapping;
  readonly schema: string;
  readonly cases: readonly Mapping[];
}

export interface StageGeneration {
  readonly pin: StagePin;
  readonly entry: LedgerEntry;
  /** True when the pinned generation is the ledger's last. */
  readonly latest: boolean;
  readonly directory: string;
  readonly payloads: readonly StagePayload[];
  readonly rows: number;
}

export interface LoadOptions {
  /** The testsuite checkout. */
  readonly root?: string;
  /** The commit the checkout is at; read from git when omitted. */
  readonly head?: string;
}

/** The checkout's HEAD, which must also be what the superproject pins. */
export function submoduleHead(): string {
  const pinned = pinnedSubmoduleCommit();
  if (pinned.headCommit !== pinned.indexCommit) {
    throw new Error(
      `submodules/plurimath-testsuite is checked out at ${pinned.headCommit}, but the ` +
        `superproject pins ${pinned.indexCommit}. Run: git submodule update --init --recursive`,
    );
  }
  return pinned.headCommit;
}

/** `validate-stages.rb --pin`, then the generation's rows, verified. */
export function loadStageGeneration(pinFile: string, options: LoadOptions = {}): StageGeneration {
  const root = options.root ?? PINNED_CORPUS_ROOT;
  const pin = readPinFile(pinFile);
  const head = options.head ?? submoduleHead();
  if (pin.commit !== head) {
    throw new Error(`${pinFile}: /commit: pins ${pin.commit}, but the checkout is at ${head}`);
  }

  const ledger = readLedger(pin.language, root);
  const entry = ledger.find((candidate) => candidate.generation === pin.generation);
  if (entry === undefined) {
    throw new Error(`${pinFile}: /generation: ${pin.language} has no generation ${pin.generation}`);
  }
  if (entry.snapshotDigest !== pin.snapshotDigest) {
    throw new Error(
      `${pinFile}: /snapshot_digest: pins ${pin.snapshotDigest}, but the ledger records ` +
        entry.snapshotDigest,
    );
  }
  const expectedPath = `stages/${pin.language}/generations/${String(pin.generation).padStart(6, "0")}`;
  if (entry.path !== expectedPath) {
    throw new Error(
      `generations/${pin.language}.yaml: generation ${pin.generation} path must be ${expectedPath}`,
    );
  }

  const directory = join(root, ...expectedPath.split("/"));
  const payloadDirectory = join(directory, "payloads");
  if (!existsSync(join(directory, "provenance.yaml")) || !existsSync(payloadDirectory)) {
    throw new Error(`${directory}: the pinned generation is not on disk`);
  }
  const files = new Map<string, Buffer>();
  files.set("provenance.yaml", readFileSync(join(directory, "provenance.yaml")));
  for (const name of readdirSync(payloadDirectory)) {
    files.set(`payloads/${name}`, readFileSync(join(payloadDirectory, name)));
  }
  const recomputed = snapshotDigest(files);
  if (recomputed !== pin.snapshotDigest) {
    throw new Error(
      `${pinFile}: /snapshot_digest: the generation's files hash to ${recomputed}, not the ` +
        `pinned ${pin.snapshotDigest}. Restore the checkout: git -C submodules/plurimath-testsuite checkout .`,
    );
  }

  const provenancePath = join(directory, "provenance.yaml");
  const provenance = asMapping(
    parseYaml((files.get("provenance.yaml") as Buffer).toString("utf8")),
    provenancePath,
  );
  if (provenance.schema !== PROVENANCE_SCHEMA) {
    throw new Error(`${provenancePath}: schema must be ${PROVENANCE_SCHEMA}`);
  }
  if (provenance.language !== pin.language || provenance.generation !== pin.generation) {
    throw new Error(`${provenancePath}: names another language or generation`);
  }
  const listed = asSequence(provenance.payloads, `${provenancePath} payloads`).map((value, i) =>
    asMapping(value, `${provenancePath} payloads[${i}]`),
  );
  const listedPaths = listed.map((record, i) =>
    asString(record.path, `${provenancePath} payloads[${i}].path`),
  );
  const onDisk = [...files.keys()].filter((path) => path !== "provenance.yaml").sort();
  if ([...listedPaths].sort().join("\n") !== onDisk.join("\n")) {
    throw new Error(
      `${provenancePath}: lists ${listedPaths.length} payloads, ${onDisk.length} are on disk`,
    );
  }

  const seen = new Set<string>();
  const payloads = listed.map((record, index): StagePayload => {
    const path = listedPaths[index] as string;
    const at = `${directory}/${path}`;
    const bytes = files.get(path) as Buffer;
    if (record.sha256 !== sha256(bytes)) throw new Error(`${at}: sha256 disagrees with provenance`);
    if (record.bytes !== bytes.length)
      throw new Error(`${at}: byte count disagrees with provenance`);
    const document = asMapping(parseYaml(bytes.toString("utf8")), at);
    const cases = asSequence(document.cases, `${at} cases`).map((value, i) =>
      asMapping(value, `${at} cases[${i}]`),
    );
    const ids = cases.map((entry, i) => asString(entry.id, `${at} cases[${i}].id`));
    const rows = asSequence(record.rows, `${provenancePath} payloads[${index}].rows`);
    if (ids.join("\n") !== rows.join("\n")) {
      throw new Error(`${at}: case ids disagree with the provenance's rows`);
    }
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`${at}: case id ${id} appears twice in the generation`);
      seen.add(id);
    }
    return { path, document, schema: asString(document.schema, `${at} schema`), cases };
  });

  const rows = payloads.reduce((total, payload) => total + payload.cases.length, 0);
  if (rows !== entry.rows || payloads.length !== entry.payloads) {
    throw new Error(
      `${expectedPath}: ${payloads.length} payloads and ${rows} rows, the ledger records ` +
        `${entry.payloads} and ${entry.rows}`,
    );
  }
  if (rows === 0)
    throw new Error(`${expectedPath}: no replayable rows; an empty replay is not a pass`);

  const last = ledger[ledger.length - 1];
  return {
    pin,
    entry,
    latest: last !== undefined && last.generation === entry.generation,
    directory,
    payloads,
    rows,
  };
}
