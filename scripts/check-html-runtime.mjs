import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = process.argv[2];
if (!entry) throw new Error("Pass an installed Parsanol Node entry path");
const receipt = {
  nodeEntry: resolve(entry),
  browserEntry: process.argv[3] ? resolve(process.argv[3]) : undefined,
  webWasm: process.argv[4] ? resolve(process.argv[4]) : undefined,
};
const { createHtmlParser } = await import(
  pathToFileURL(resolve(repo, "dist/html-parsanol.js")).href
);
const { normalize } = await import(pathToFileURL(resolve(repo, "dist/core.js")).href);
const rows = JSON.parse(readFileSync(`${repo}/test/formats/html/initialized-source.json`)).cases;
const results = [];
for (const target of receipt.browserEntry ? ["node", "web-target-in-node"] : ["node"]) {
  const sdk = await import(
    pathToFileURL(target === "node" ? receipt.nodeEntry : receipt.browserEntry)
  );
  if (target !== "node") await sdk.initialize(readFileSync(receipt.webWasm));
  const runtimes = new Map(
    ["dot", "comma", "arabic"].map((name) => {
      const text = readFileSync(`${repo}/assets/html/${name}.json`, "utf8");
      return [JSON.parse(text).provenance.decimal, new sdk.PargRuntime(text, "document")];
    }),
  );
  const parse = createHtmlParser((decimal) => {
    const rt = runtimes.get(decimal);
    if (!rt) throw Error(`Missing ${decimal}`);
    return rt;
  });
  const cases = rows.map((row) => {
    try {
      const actual = normalize(parse(row.input));
      return {
        id: row.id,
        equal: "model" in row && isDeepStrictEqual(actual, row.model),
        unexpectedSuccess: !("model" in row),
        actual,
        expected: row.model,
      };
    } catch (error) {
      return {
        id: row.id,
        equal: "error" in row,
        error: { name: error.name, message: error.message, index: error.index },
        source: row.error,
      };
    }
  });
  const localeRows = JSON.parse(
    readFileSync(`${repo}/test/formats/html/model-fixtures.json`),
  ).cases.filter((row) => row.locale);
  for (const row of localeRows) {
    try {
      const actual = normalize(parse(row.input, { locale: row.locale }));
      cases.push({
        id: row.id,
        equal: row.model !== undefined && isDeepStrictEqual(actual, row.model),
        unexpectedSuccess: !!row.raises,
        actual,
        expected: row.model,
      });
    } catch (error) {
      cases.push({
        id: row.id,
        equal: !!row.raises,
        error: { name: error.name, message: error.message },
      });
    }
  }
  const summary = {
    requests: cases.length,
    localeChecks: localeRows.length,
    exactModels: cases.filter((x) => x.equal && !x.error).length,
    matchingRefusals: cases.filter((x) => x.equal && x.error).length,
    wrongSuccesses: cases.filter((x) => x.unexpectedSuccess).length,
    mismatches: cases.filter((x) => !x.equal).map((x) => x.id),
  };
  if (process.env.HTML_RUNTIME_REPORT)
    writeFileSync(
      `${process.env.HTML_RUNTIME_REPORT}-${target}.json`,
      JSON.stringify({ summary, cases }, null, 2),
    );
  results.push({ target, summary });
  for (const rt of runtimes.values()) rt.artifact.free();
}

console.log(JSON.stringify(results, null, 2));
if (results.some((x) => x.summary.mismatches.length)) process.exitCode = 1;
