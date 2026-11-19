/** Actual initialized stages -> common model -> writers, against pinned source observations. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { toAsciimath } from "../dist/asciimath.js";
import { createAsciimathParser } from "../dist/asciimath-amath.js";
import { normalize } from "../dist/core.js";
import { toHtml } from "../dist/html.js";
import { toLatex } from "../dist/latex.js";
import { createLatexParser } from "../dist/latex-latexmath.js";
import { toMathml } from "../dist/mathml.js";
import { createMathmlParser } from "../dist/mathml-leptris.js";
import { toOmml } from "../dist/omml.js";
import { createOmmlParser } from "../dist/omml-leptris.js";
import { toUnicodemath } from "../dist/unicodemath.js";
import { createUnicodemathParser } from "../dist/unicodemath-umath.js";
import { parseYaml } from "../test/core/corpus-yaml.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entries = process.argv.slice(2);
if (entries.length !== 4)
  throw new Error("Pass installed amath, latexmath, umath and Leptris entry paths");
const modules = await Promise.all(
  entries.map((entry) => import(pathToFileURL(resolve(entry)).href)),
);
const [amath, latexmath, umath, leptris] = modules;
await leptris.init();
const parsers = {
  asciimath: createAsciimathParser(await amath.initialize()),
  latex: createLatexParser(await latexmath.initialize()),
  unicode: createUnicodemathParser(
    await umath.initialize(),
    readFileSync(new URL("../artifacts/umath.json", pathToFileURL(resolve(entries[2]))), "utf8"),
  ),
  mathml: createMathmlParser(leptris),
  omml: createOmmlParser(leptris),
};
const writers = {
  asciimath: toAsciimath,
  latex: toLatex,
  unicode: toUnicodemath,
  mathml: toMathml,
  omml: toOmml,
  html: toHtml,
};
const generations = { asciimath: 3, latex: 4, unicode: 4, mathml: 2, omml: 2 };
const expectedCounts = { asciimath: 160, latex: 125, unicode: 20, mathml: 287, omml: 190 };
const sources = [];
const cases = [];
// The immutable stage generations still prove source models. Writers use the
// current, separately versioned facade observations at this testsuite pin.
const corpusRoot = join(root, "submodules/plurimath-testsuite");
const provenancePath = join(corpusRoot, "corpus/provenance.yaml");
const provenanceBytes = readFileSync(provenancePath);
const provenance = parseYaml(provenanceBytes.toString("utf8"));
assert.equal(provenance.committable, true, "facade source must be committable");
const testsuiteCommit = execFileSync("git", ["-C", corpusRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const writerProfile = {
  name: "current-facade-corpus",
  testsuiteCommit,
  oracle: provenance.oracle,
  provenance: {
    path: provenancePath.slice(root.length + 1),
    sha256: createHash("sha256").update(provenanceBytes).digest("hex"),
  },
};

function currentFacadeRows(format) {
  const rows = new Map();
  const dir = join(corpusRoot, "corpus", format);
  for (const name of readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()) {
    const path = join(dir, name),
      bytes = readFileSync(path);
    const source = {
      profile: writerProfile.name,
      path: path.slice(root.length + 1),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const document = parseYaml(bytes.toString("utf8"));
    for (const row of document.cases ?? []) {
      assert.equal(rows.has(row.id), false, `${format}: duplicate facade id ${row.id}`);
      rows.set(row.id, { row, source });
    }
  }
  return rows;
}

function callOptions(call) {
  if (!call) return undefined;
  if (call.method === "unitsml") return { unitsml: { xml: true } };
  if (call.method !== "number_formatter") throw new Error(`unknown source call ${call.method}`);
  const args = call.args;
  const options = Object.fromEntries(
    Object.entries(args.options ?? {}).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
  return {
    formatter: {
      locale: String(args.locale),
      options,
      precision: typeof args.precision === "number" ? args.precision : null,
      ...(args.string_format == null ? {} : { stringFormat: String(args.string_format) }),
    },
  };
}

for (const [format, generation] of Object.entries(generations)) {
  const started = performance.now();
  const dir = join(
    root,
    "submodules/plurimath-testsuite/stages",
    format,
    "generations",
    String(generation).padStart(6, "0"),
    "payloads",
  );
  const selected = [];
  const current = currentFacadeRows(format);
  for (const name of readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()) {
    const path = join(dir, name),
      bytes = readFileSync(path),
      document = parseYaml(bytes.toString("utf8"));
    const rows = (document.cases ?? []).filter(
      (row) =>
        typeof row.input === "string" && row.model?.class === "Math::Formula" && row.expected,
    );
    if (!rows.length) continue;
    sources.push({
      path: path.slice(root.length + 1),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      rows: rows.length,
    });
    selected.push(...rows);
  }
  if (selected.length !== expectedCounts[format])
    throw new Error(
      `${format}: found ${selected.length}, expected ${expectedCounts[format]} source cases`,
    );
  for (const row of selected) {
    const profile = current.get(row.id);
    assert.ok(profile, `${format}/${row.id}: missing current facade observation`);
    // A writer-profile upgrade must never silently change its source or model.
    assert.equal(profile.row.input, row.input, `${format}/${row.id}: facade input changed`);
    assert.deepEqual(profile.row.call, row.call, `${format}/${row.id}: facade call changed`);
    assert.deepEqual(profile.row.model, row.model, `${format}/${row.id}: facade model changed`);
    const result = { format, id: row.id, source: profile.source, modelEqual: false, writers: [] };
    try {
      const model = parsers[format](row.input);
      result.modelEqual = isDeepStrictEqual(normalize(model), row.model);
      for (const [target, observation] of Object.entries(row.expected)) {
        const name = target === "unicodemath" ? "unicode" : target;
        const currentObservation = profile.row.expected[target];
        assert.ok(currentObservation !== undefined, `${format}/${row.id}: no current ${target}`);
        const expected =
          typeof currentObservation === "string" ? currentObservation : currentObservation.output;
        const historical = typeof observation === "string" ? observation : observation.output;
        try {
          const actual = writers[name](model, callOptions(row.call));
          const equal = actual === expected;
          const historicalEqual = actual === historical;
          result.writers.push({
            target: name,
            equal,
            historicalEqual,
            ...(equal && !historicalEqual ? { historicalDifference: true } : {}),
            ...(equal ? {} : { actual, expected }),
          });
        } catch (error) {
          result.writers.push({
            target: name,
            equal:
              typeof currentObservation === "object" &&
              currentObservation.error?.category === "parse_error",
            error: { name: error.name, message: error.message },
          });
        }
      }
    } catch (error) {
      result.error = { name: error.name, message: error.message };
    }
    cases.push(result);
  }
  console.log(
    JSON.stringify({
      format,
      checked: selected.length,
      elapsedMs: Math.round(performance.now() - started),
    }),
  );
}
const outcomes = cases.flatMap((row) => row.writers);
const summary = {
  inputs: cases.length,
  exactModels: cases.filter((row) => row.modelEqual).length,
  writerObservations: outcomes.length,
  qualifiedWriterObservations: outcomes.filter((row) => row.equal).length,
  historicalDifferences: outcomes.filter((row) => row.historicalDifference).length,
  failures: cases
    .filter((row) => !row.modelEqual || row.error || row.writers.some((writer) => !writer.equal))
    .map((row) => `${row.format}/${row.id}`),
};
const report = {
  schema: "initialized-source-corpus/1",
  node: process.version,
  entries,
  generations,
  writerProfile,
  sources,
  summary,
  cases,
};
if (process.env.INITIALIZED_CORPUS_REPORT)
  writeFileSync(process.env.INITIALIZED_CORPUS_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failures.length) process.exitCode = 1;
