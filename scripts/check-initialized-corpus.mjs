/** Actual initialized stages -> common model -> writers, against pinned source observations. */
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
  unicode: createUnicodemathParser(await umath.initialize()),
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
const generations = { asciimath: 3, latex: 3, unicode: 4, mathml: 2, omml: 2 };
const expectedCounts = { asciimath: 160, latex: 125, unicode: 20, mathml: 287, omml: 190 };
const sources = [];
const cases = [];
const currentQuotedText = parseYaml(
  readFileSync(
    join(root, "submodules/plurimath-testsuite/corpus/asciimath/quoted-text.yaml"),
    "utf8",
  ),
);
const currentUnitProfile = currentQuotedText.cases.find((row) => row.id === "text-unitsml-valid");
if (!currentUnitProfile) throw new Error("missing current facade UnitsML source profile");

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
    const result = { format, id: row.id, modelEqual: false, writers: [] };
    try {
      const model = parsers[format](row.input);
      result.modelEqual = isDeepStrictEqual(normalize(model), row.model);
      for (const [target, observation] of Object.entries(row.expected)) {
        const name = target === "unicodemath" ? "unicode" : target;
        try {
          const actual = writers[name](model, callOptions(row.call));
          const expected = typeof observation === "string" ? observation : observation.output;
          const historicalEqual = actual === expected;
          // Keep the old stage oracle immutable. The current facade corpus is
          // a separately named source profile; this is not normative promotion.
          const currentProfileEqual =
            format === "asciimath" &&
            row.id === "text-unitsml-valid" &&
            name === "unicode" &&
            actual === currentUnitProfile.expected.unicodemath;
          result.writers.push({
            target: name,
            equal: historicalEqual || currentProfileEqual,
            historicalEqual,
            ...(currentProfileEqual && !historicalEqual
              ? { profile: "current-facade-quoted-unitsml", historicalDifference: true }
              : {}),
            ...(historicalEqual || currentProfileEqual ? {} : { actual, expected }),
          });
        } catch (error) {
          result.writers.push({
            target: name,
            equal: typeof observation === "object" && observation.error?.category === "parse_error",
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
  sources,
  summary,
  cases,
};
if (process.env.INITIALIZED_CORPUS_REPORT)
  writeFileSync(process.env.INITIALIZED_CORPUS_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failures.length) process.exitCode = 1;
