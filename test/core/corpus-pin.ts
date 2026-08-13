/**
 * The reader for the pinned conformance corpus.
 *
 * The cases are not in this repository. They live in `plurimath-testsuite`,
 * consumed as a git submodule pinned to a reviewed commit
 * (`TODO.plan/cross-cutting.md`): one generator writes them from the gem, and
 * every implementation reads the same bytes. This module is this port's half —
 * the reader, and nothing else.
 *
 * It is loud on purpose. A clone made without `--recursive` leaves
 * `submodules/plurimath-testsuite` an empty directory, and a reader that
 * shrugged at that would report zero cases and let the whole conformance suite
 * pass while checking nothing. Every failure below throws with the command that
 * fixes it:
 *
 *   - the submodule is absent or uninitialised;
 *   - `corpus/provenance.yaml` is missing, malformed, or a schema this reader
 *     does not know;
 *   - the pin is marked `committable: false`, or was generated with an XML
 *     engine other than Ox — a pin is one `git add` away from moving, and
 *     neither of those was generated the canonical way (ARCHITECTURE.md §7);
 *   - a payload on disk is not in the provenance list, or vice versa;
 *   - a payload's bytes or sha256 disagree with the provenance;
 *   - a payload has no group, no cases, or a case missing a target key;
 *   - the pin yields no payloads or no cases at all.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml, type YamlValue } from "./corpus-yaml";

/** Resolved from this file, so nothing here depends on the working directory. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The submodule path recorded in `.gitmodules`. */
export const PIN_RELATIVE_PATH = "submodules/plurimath-testsuite";

/** The pinned testsuite checkout. */
export const PINNED_CORPUS_ROOT = join(REPO_ROOT, ...PIN_RELATIVE_PATH.split("/"));

/** The generated corpus files this repository owns directly. */
export const LOCAL_CORPUS_ROOT = join(REPO_ROOT, "corpus");

/** The one command that turns an uninitialised submodule into a usable one. */
export const SUBMODULE_FIX = "git submodule update --init --recursive";

const PROVENANCE_SCHEMA = "plurimath-corpus/provenance/2";
const CASE_SCHEMA = "plurimath-corpus/asciimath/1";
const MANIFEST_SCHEMA = "plurimath-corpus/manifest/1";

/**
 * Ox is the canonical engine (ARCHITECTURE.md §7). Oga is a parity check, and
 * its output is not what the expectations were recorded from.
 */
const CANONICAL_XML_ENGINE = "Plurimath::XmlEngine::OxEngine";

export interface PayloadRecord {
  /** Relative to the testsuite's `corpus/`, e.g. `asciimath/frac.yaml`. */
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface PinProvenance {
  readonly schema: string;
  readonly committable: boolean;
  readonly xmlEngine: string;
  readonly oracleVersion: string;
  readonly oracleCommit: string;
  readonly payloads: readonly PayloadRecord[];
}

export interface PinnedCase {
  readonly id: string;
  readonly group: string;
  readonly input: string;
  readonly inputFormat: string;
  readonly preprocessed: string;
  /** One entry per target format the payload declares. */
  readonly expected: ReadonlyMap<string, string>;
  readonly parseTree: YamlValue;
  /** The gem's serialization of the formula; `model-builder` rebuilds it. */
  readonly model: YamlValue;
}

export interface PinnedPayload {
  /** Relative to the testsuite's `corpus/`. */
  readonly path: string;
  readonly group: string;
  readonly inputFormat: string;
  readonly targets: readonly string[];
  readonly cases: readonly PinnedCase[];
}

export interface PinnedCorpus {
  readonly root: string;
  readonly provenance: PinProvenance;
  readonly payloads: readonly PinnedPayload[];
  readonly cases: readonly PinnedCase[];
}

type Mapping = { readonly [key: string]: YamlValue };

function describeValue(value: YamlValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a sequence";
  if (typeof value === "object") return "a mapping";
  return `${typeof value} ${JSON.stringify(value)}`;
}

function asMapping(value: YamlValue, where: string): Mapping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a mapping, found ${describeValue(value)}`);
  }
  return value as Mapping;
}

function requiredString(map: Mapping, key: string, where: string): string {
  const value = map[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(
      `${where}: "${key}" must be a non-empty string, found ${describeValue(value ?? null)}`,
    );
  }
  return value;
}

function requiredBoolean(map: Mapping, key: string, where: string): boolean {
  const value = map[key];
  if (typeof value !== "boolean") {
    throw new Error(`${where}: "${key}" must be a boolean, found ${describeValue(value ?? null)}`);
  }
  return value;
}

function requiredInteger(map: Mapping, key: string, where: string): number {
  const value = map[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${where}: "${key}" must be an integer, found ${describeValue(value ?? null)}`);
  }
  return value;
}

function requiredSequence(map: Mapping, key: string, where: string): readonly YamlValue[] {
  const value = map[key];
  if (!Array.isArray(value)) {
    throw new Error(`${where}: "${key}" must be a sequence, found ${describeValue(value ?? null)}`);
  }
  return value;
}

function requiredPresent(map: Mapping, key: string, where: string): YamlValue {
  if (!(key in map)) throw new Error(`${where}: "${key}" is missing`);
  return map[key] ?? null;
}

/**
 * The message every "there are no cases here" path ends at. Naming the command
 * matters more than the diagnosis: the usual cause is a plain `git clone`.
 */
function submoduleError(root: string, detail: string): Error {
  return new Error(
    `The pinned corpus is not readable at ${root}: ${detail}\n` +
      `The shared conformance cases live in the ${PIN_RELATIVE_PATH} submodule, ` +
      "which this checkout has not initialised.\n" +
      `Run: ${SUBMODULE_FIX}`,
  );
}

/** Every `*.yaml` under `corpus/`, relative to it, POSIX-separated and sorted. */
function payloadFilesOnDisk(corpusDirectory: string): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) walk(child, `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".yaml")) found.push(`${prefix}${entry.name}`);
    }
  };
  walk(corpusDirectory, "");
  return found.sort();
}

function readProvenance(root: string): PinProvenance {
  const path = join(root, "corpus", "provenance.yaml");
  if (!existsSync(path)) {
    const detail = existsSync(root)
      ? `${path} does not exist (the directory is present but empty)`
      : "the directory does not exist";
    throw submoduleError(root, detail);
  }

  const document = asMapping(parseYaml(readFileSync(path, "utf8")), path);
  const schema = requiredString(document, "schema", path);
  if (schema !== PROVENANCE_SCHEMA) {
    throw new Error(
      `${path}: schema is "${schema}", this reader knows "${PROVENANCE_SCHEMA}". ` +
        "Move the pin to a commit this reader understands, or teach it the new schema.",
    );
  }

  if (!requiredBoolean(document, "committable", path)) {
    const warnings = requiredSequence(document, "warnings", path);
    throw new Error(
      `${path}: the pin is marked committable: false — it was not generated the ` +
        "canonical way (ARCHITECTURE.md §7), so its expectations are not evidence.\n" +
        `Warnings recorded in the pin: ${warnings.map((entry) => String(entry)).join("; ") || "(none)"}\n` +
        `Move ${PIN_RELATIVE_PATH} to a commit whose corpus/provenance.yaml says committable: true.`,
    );
  }

  const xmlEngine = requiredString(document, "xml_engine", path);
  if (xmlEngine !== CANONICAL_XML_ENGINE) {
    throw new Error(
      `${path}: generated with ${xmlEngine}, not ${CANONICAL_XML_ENGINE}. ` +
        "Ox is the canonical engine (ARCHITECTURE.md §7); Oga output is a parity " +
        `check, not the recorded expectation. Move ${PIN_RELATIVE_PATH} to an Ox-generated commit.`,
    );
  }

  const oracle = asMapping(requiredPresent(document, "oracle", path), `${path} oracle`);
  const entries = requiredSequence(document, "payloads", path);
  if (entries.length === 0) {
    throw new Error(`${path}: "payloads" is empty; the pin records no corpus files.`);
  }

  const payloads = entries.map((entry, index) => {
    const where = `${path} payloads[${index}]`;
    const record = asMapping(entry, where);
    return {
      path: requiredString(record, "path", where),
      sha256: requiredString(record, "sha256", where),
      bytes: requiredInteger(record, "bytes", where),
    };
  });

  return {
    schema,
    committable: true,
    xmlEngine,
    oracleVersion: requiredString(oracle, "version", `${path} oracle`),
    oracleCommit: requiredString(oracle, "commit", `${path} oracle`),
    payloads,
  };
}

function verifyPayloadBytes(path: string, record: PayloadRecord): string {
  const bytes = readFileSync(path);
  if (bytes.length !== record.bytes) {
    throw new Error(
      `${path}: ${bytes.length} bytes on disk, provenance records ${record.bytes}. ` +
        "The pinned corpus has been edited in place; restore it with " +
        `\`git -C ${PIN_RELATIVE_PATH} checkout .\`.`,
    );
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== record.sha256) {
    throw new Error(
      `${path}: sha256 ${digest}, provenance records ${record.sha256}. ` +
        "The pinned corpus has been edited in place; restore it with " +
        `\`git -C ${PIN_RELATIVE_PATH} checkout .\`.`,
    );
  }
  return bytes.toString("utf8");
}

function readPayload(root: string, record: PayloadRecord): PinnedPayload {
  const path = join(root, "corpus", ...record.path.split("/"));
  if (!existsSync(path)) {
    throw submoduleError(root, `${path} is listed in corpus/provenance.yaml but is not on disk`);
  }
  const text = verifyPayloadBytes(path, record);
  const document = asMapping(parseYaml(text), path);

  const schema = requiredString(document, "schema", path);
  if (schema !== CASE_SCHEMA) {
    throw new Error(`${path}: schema is "${schema}", this reader knows "${CASE_SCHEMA}".`);
  }

  // A payload without a group is a payload nothing can name in a failure
  // message, so it fails here rather than being loaded as an unnamed pile.
  const group = requiredString(document, "group", path);
  const stem = record.path.slice(record.path.lastIndexOf("/") + 1).replace(/\.yaml$/, "");
  if (group !== stem) {
    throw new Error(`${path}: group is "${group}" but the file is named "${stem}.yaml".`);
  }

  const inputFormat = requiredString(document, "input_format", path);
  const targets = requiredSequence(document, "targets", path).map((target, index) => {
    if (typeof target !== "string" || target === "") {
      throw new Error(`${path}: targets[${index}] is not a format name`);
    }
    return target;
  });
  if (targets.length === 0) throw new Error(`${path}: "targets" is empty`);

  const entries = requiredSequence(document, "cases", path);
  if (entries.length === 0) throw new Error(`${path}: "cases" is empty; the group has no cases.`);

  const cases = entries.map((entry, index) => {
    const where = `${path} cases[${index}]`;
    const caseRecord = asMapping(entry, where);
    const id = requiredString(caseRecord, "id", where);
    const at = `${path} case ${id}`;
    const expectedMap = asMapping(requiredPresent(caseRecord, "expected", at), `${at} expected`);
    const expected = new Map<string, string>();
    for (const target of targets) {
      const rendered = expectedMap[target];
      if (typeof rendered !== "string") {
        throw new Error(
          `${at}: expected.${target} is missing or not a string. The payload ` +
            `declares targets ${targets.join(", ")}; every case must carry all of them.`,
        );
      }
      expected.set(target, rendered);
    }
    return {
      id,
      group,
      input: requiredString(caseRecord, "input", at),
      inputFormat: requiredString(caseRecord, "input_format", at),
      preprocessed: requiredString(caseRecord, "preprocessed", at),
      expected,
      parseTree: requiredPresent(caseRecord, "parse_tree", at),
      model: asMapping(requiredPresent(caseRecord, "model", at), `${at} model`),
    };
  });

  return { path: record.path, group, inputFormat, targets, cases };
}

/**
 * Loads and verifies the whole pin. `root` is a parameter so the failure paths
 * can be proven against a scratch copy rather than argued from the code.
 */
export function loadPinnedCorpus(root: string = PINNED_CORPUS_ROOT): PinnedCorpus {
  const provenance = readProvenance(root);
  const corpusDirectory = join(root, "corpus");

  const onDisk = payloadFilesOnDisk(corpusDirectory).filter((path) => path !== "provenance.yaml");
  const recorded = provenance.payloads.map((payload) => payload.path).sort();
  const unrecorded = onDisk.filter((path) => !recorded.includes(path));
  if (unrecorded.length > 0) {
    throw new Error(
      `${corpusDirectory}: ${unrecorded.join(", ")} ${unrecorded.length === 1 ? "is" : "are"} ` +
        "not listed in corpus/provenance.yaml, so nothing vouches for the bytes. " +
        "Regenerate the pin in plurimath-testsuite, or move the pin to a commit that lists them.",
    );
  }

  const payloads = provenance.payloads.map((record) => readPayload(root, record));
  if (payloads.length === 0) throw new Error(`${corpusDirectory}: no payloads were loaded.`);

  const cases: PinnedCase[] = [];
  const seen = new Map<string, string>();
  for (const payload of payloads) {
    for (const entry of payload.cases) {
      const previous = seen.get(entry.id);
      if (previous !== undefined) {
        throw new Error(`duplicate case id "${entry.id}" in ${previous} and ${payload.path}`);
      }
      seen.set(entry.id, payload.path);
      cases.push(entry);
    }
  }
  if (cases.length === 0) {
    throw new Error(
      `${corpusDirectory}: ${payloads.length} payloads loaded, but no cases in them.`,
    );
  }

  return { root, provenance, payloads, cases };
}

export interface Exclusion {
  readonly id: string;
  readonly group: string;
  readonly input: string;
  readonly inputFormat: string;
  readonly feature: string;
  readonly matched: string;
  /**
   * Whether the gem raises on this input, measured by the generator rather
   * than described in prose. It is what makes textual matching necessary for
   * some deferred cases and not others, and it is checkable — see
   * `local-corpus.spec.ts`.
   */
  readonly raises: boolean;
  readonly reason: string;
}

/**
 * The cases this port withholds because they use a deferred construct
 * (ARCHITECTURE.md §5). Unlike the cases, this file is **not** shared: it
 * encodes this port's roadmap, so it stays here and is read from here.
 */
export function readExclusions(
  path: string = join(REPO_ROOT, "corpus", "exclusions.yaml"),
): readonly Exclusion[] {
  if (!existsSync(path))
    throw new Error(`${path} is missing; it is generated into this repository`);
  const document = asMapping(parseYaml(readFileSync(path, "utf8")), path);
  return requiredSequence(document, "excluded", path).map((entry, index) => {
    const where = `${path} excluded[${index}]`;
    const record = asMapping(entry, where);
    return {
      id: requiredString(record, "id", where),
      group: requiredString(record, "group", where),
      input: requiredString(record, "input", where),
      inputFormat: requiredString(record, "input_format", where),
      feature: requiredString(record, "feature", where),
      matched: requiredString(record, "matched", where),
      raises: requiredBoolean(record, "raises", where),
      reason: requiredString(record, "reason", where),
    };
  });
}

export interface LocalPayloadManifest {
  /** Relative to `corpus/`, e.g. `census.manifest.yaml`. */
  readonly manifestPath: string;
  /** Relative to `corpus/`, e.g. `census.yaml`. */
  readonly payloadPath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly document: YamlValue;
}

/**
 * Loads the sidecar manifests this repository owns directly and verifies that
 * each recorded payload exists and still matches the recorded bytes and sha256.
 * `root` is the `corpus/` directory itself, so scratch copies can be checked
 * without recreating a whole repository checkout.
 */
export function loadLocalPayloadManifests(
  root: string = LOCAL_CORPUS_ROOT,
): readonly LocalPayloadManifest[] {
  if (!existsSync(root))
    throw new Error(`${root} is missing; it is generated into this repository`);

  const manifestPaths = payloadFilesOnDisk(root).filter((path) => path.endsWith(".manifest.yaml"));
  if (manifestPaths.length === 0) throw new Error(`${root}: no *.manifest.yaml files were found.`);

  return manifestPaths.map((relativePath) => {
    const path = join(root, ...relativePath.split("/"));
    const document = asMapping(parseYaml(readFileSync(path, "utf8")), path);
    const schema = requiredString(document, "schema", path);
    if (schema !== MANIFEST_SCHEMA) {
      throw new Error(`${path}: schema is "${schema}", this reader knows "${MANIFEST_SCHEMA}".`);
    }

    const payload = asMapping(requiredPresent(document, "payload", path), `${path} payload`);
    const payloadRecord = {
      path: requiredString(payload, "path", `${path} payload`),
      sha256: requiredString(payload, "sha256", `${path} payload`),
      bytes: requiredInteger(payload, "bytes", `${path} payload`),
    };
    const payloadFile = join(root, ...payloadRecord.path.split("/"));
    if (!existsSync(payloadFile)) {
      throw new Error(
        `${path}: payload.path "${payloadRecord.path}" is not on disk at ${payloadFile}.`,
      );
    }
    verifyPayloadBytes(payloadFile, payloadRecord);

    return {
      manifestPath: relativePath,
      payloadPath: payloadRecord.path,
      sha256: payloadRecord.sha256,
      bytes: payloadRecord.bytes,
      document,
    };
  });
}
