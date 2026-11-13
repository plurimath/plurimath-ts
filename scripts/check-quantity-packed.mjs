#!/usr/bin/env node
/**
 * Pack the built package once, install the tarball in a consumer without dev
 * dependencies, and replay the 38 strict typed-quantity source cases through
 * the installed `./evaluation/wasm` entry: `evaluateQuantityRequest` and the
 * raw `evaluateRequest` wire, in Node (ESM and CJS) and in actual Chrome.
 * Chrome loads the installed ESM entry (which bundles the official
 * wasm-bindgen glue) and fetches the installed `plurimath_numeric.wasm`.
 * Every case is compared against its complete expected response.
 *
 * Usage: node scripts/check-quantity-packed.mjs [report.json]
 * CHROME_PATH selects the browser (default `google-chrome`).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = process.argv[2] ? resolve(process.argv[2]) : undefined;
const chromeExecutable = process.env.CHROME_PATH ?? "google-chrome";
const fixtures = join(root, "test/fixtures/evaluation-wasm");
const strictFile = join(fixtures, "typed-quantity-accuracy-v1/final-source-38.json");
const legacyFile = join(fixtures, "quantity-wasm-v1.json");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const provenance = JSON.parse(
  readFileSync(join(fixtures, "typed-quantity-accuracy-v1/provenance.json"), "utf8"),
);
if (sha256(readFileSync(strictFile)) !== provenance.final_source_38_sha256)
  throw new Error("final-source-38.json does not match its provenance digest");

/** Runs in Node and, as source text, in the browser page. */
const replay = async (api, asset, strict, legacy) => {
  const stable = (value) =>
    JSON.stringify(value, (_, x) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : x,
    );
  const kernel = await api.initNumericWasm(asset);
  const cases = [];
  for (const row of strict.cases) {
    const request = JSON.parse(row.request_json);
    const before = JSON.stringify(request);
    const typed = api.evaluateQuantityRequest(kernel, request);
    const wire = kernel.evaluateRequest(row.request_json);
    const expected = stable(row.expected);
    cases.push({
      id: row.id,
      typedEqual: stable(typed) === expected,
      wireEqual: stable(JSON.parse(wire)) === expected,
      requestUnchanged: JSON.stringify(request) === before,
      ...(stable(typed) === expected ? {} : { typed }),
      ...(stable(JSON.parse(wire)) === expected ? {} : { wire }),
    });
  }
  // A plain-string (legacy) quantity request keeps its response without numeric_value.
  const legacyRow = legacy.cases.find((entry) => {
    const expected = JSON.parse(entry.expected_wire);
    return expected.schema === "plurimath.evaluate.quantity/1" && expected.ok;
  });
  const legacyResponse = api.evaluateQuantityRequest(kernel, JSON.parse(legacyRow.request_json));
  return {
    asset: kernel.asset,
    cases,
    legacy: {
      id: legacyRow.id,
      equal: stable(legacyResponse) === stable(JSON.parse(legacyRow.expected_wire)),
      numericValueAbsent: !Object.hasOwn(legacyResponse.result?.value ?? {}, "numeric_value"),
    },
  };
};
const failures = (result) =>
  result.fatal
    ? [result.fatal]
    : [
        ...result.cases
          .filter((x) => !(x.typedEqual && x.wireEqual && x.requestUnchanged))
          .map((x) => x.id),
        ...(result.legacy.equal && result.legacy.numericValueAbsent ? [] : ["legacy-string"]),
      ];

// Pack once and install the exact tarball.
const scratch = mkdtempSync(join(tmpdir(), "plurimath-quantity-packed-"));
const env = { ...process.env };
env.npm_config_cache = join(scratch, "npm-cache");
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")}: ${result.stderr}\n${result.stdout}`);
  return result.stdout;
};
const [packed] = JSON.parse(
  run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], root),
);
const tarball = join(scratch, packed.filename);
writeFileSync(join(scratch, "package.json"), JSON.stringify({ private: true, type: "module" }));
run("npm", ["install", "--no-audit", "--no-fund", "--omit=dev", tarball], scratch);
const pkg = join(scratch, "node_modules/@plurimath/plurimath-ts");
const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const esmEntry = manifest.exports["./evaluation/wasm"].import.default;
const assetEntry = manifest.exports["./evaluation/plurimath_numeric.wasm"];
const packageProvenance = {
  name: manifest.name,
  version: manifest.version,
  tarball: packed.filename,
  tarballSha256: sha256(readFileSync(tarball)),
  esmEntry,
  esmEntrySha256: sha256(readFileSync(join(pkg, esmEntry))),
  cjsEntry: manifest.exports["./evaluation/wasm"].require.default,
  cjsEntrySha256: sha256(
    readFileSync(join(pkg, manifest.exports["./evaluation/wasm"].require.default)),
  ),
  asset: assetEntry,
  assetSha256: sha256(readFileSync(join(pkg, assetEntry))),
  fixtureSha256: provenance.final_source_38_sha256,
};

// Node: ESM and CJS consumers import the installed package by name.
const replaySource = `const replay = ${replay.toString()};`;
const nodeRun = (mode) => {
  const body =
    mode === "module"
      ? `import * as api from "@plurimath/plurimath-ts/evaluation/wasm";
         import { readFileSync } from "node:fs"; import { createRequire } from "node:module";
         ${replaySource}
         const asset = readFileSync(createRequire(import.meta.url).resolve("@plurimath/plurimath-ts/evaluation/plurimath_numeric.wasm"));
         const result = await replay(api, asset, JSON.parse(readFileSync(${JSON.stringify(strictFile)}, "utf8")), JSON.parse(readFileSync(${JSON.stringify(legacyFile)}, "utf8")));
         process.stdout.write(JSON.stringify(result));`
      : `const api = require("@plurimath/plurimath-ts/evaluation/wasm");
         const { readFileSync } = require("node:fs");
         ${replaySource}
         const asset = readFileSync(require.resolve("@plurimath/plurimath-ts/evaluation/plurimath_numeric.wasm"));
         replay(api, asset, JSON.parse(readFileSync(${JSON.stringify(strictFile)}, "utf8")), JSON.parse(readFileSync(${JSON.stringify(legacyFile)}, "utf8")))
           .then((result) => process.stdout.write(JSON.stringify(result)), (error) => { console.error(error); process.exitCode = 1; });`;
  const file = join(scratch, mode === "module" ? "replay.mjs" : "replay.cjs");
  writeFileSync(file, body);
  const result = JSON.parse(run(process.execPath, [file], scratch));
  return { runtime: `node ${process.version} ${mode === "module" ? "esm" : "cjs"}`, ...result };
};
const node = [nodeRun("module"), nodeRun("commonjs")];

// Chrome: the page imports the installed ESM entry over HTTP.
const page = `<!DOCTYPE html><meta charset=utf-8><script type=module>
import * as api from ${JSON.stringify(`/pkg/${esmEntry.replace(/^\.\//, "")}`)};
${replaySource}
(async () => {
  const strict = await (await fetch("/data/strict.json")).json();
  const legacy = await (await fetch("/data/legacy.json")).json();
  const result = await replay(api, await fetch(${JSON.stringify(`/pkg/${assetEntry.replace(/^\.\//, "")}`)}), strict, legacy);
  return { runtime: navigator.userAgent, secureContext: isSecureContext, ...result };
})().then((r) => (globalThis.finalResult = r), (e) => (globalThis.finalResult = { fatal: String(e), stack: e.stack }));
</script>`;
const requests = [];
const server = createServer((req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    requests.push(path);
    if (path === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(page);
      return;
    }
    let file;
    if (path === "/data/strict.json") file = strictFile;
    else if (path === "/data/legacy.json") file = legacyFile;
    else if (path.startsWith("/pkg/")) {
      file = resolve(pkg, path.slice(5));
      if (!file.startsWith(`${pkg}/`)) throw new Error("path outside the installed package");
    } else throw new Error(`unknown route ${path}`);
    res.setHeader(
      "Content-Type",
      { ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" }[
        extname(file)
      ] ?? "application/octet-stream",
    );
    res.end(readFileSync(file));
  } catch (error) {
    console.error("quantity browser request failed", String(error));
    res.statusCode = 404;
    res.end("{}");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const profile = mkdtempSync(join(tmpdir(), "plurimath-quantity-browser-"));
const chrome = spawn(
  chromeExecutable,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${server.address().port}/`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
chrome.stderr.on("data", (x) => (stderr += x));
const chromeVersion = spawnSync(chromeExecutable, ["--version"], {
  encoding: "utf8",
}).stdout.trim();
const deadline = Date.now() + 300000;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let browser;
try {
  let debugPort;
  while (Date.now() < deadline && !debugPort) {
    try {
      debugPort = readFileSync(`${profile}/DevToolsActivePort`, "utf8").split("\n")[0];
    } catch {
      await delay(100);
    }
  }
  if (!debugPort) throw new Error("Chrome debug port timeout");
  let target;
  while (Date.now() < deadline && !target) {
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    target = pages.find((x) => x.type === "page");
    if (!target) await delay(100);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let seq = 0;
  let pending;
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (pending && message.id === pending.id) {
      const { resolve: done } = pending;
      pending = undefined;
      done(message);
    }
  };
  const evaluate = () =>
    new Promise((done) => {
      pending = { id: ++seq, resolve: done };
      ws.send(
        JSON.stringify({
          id: seq,
          method: "Runtime.evaluate",
          params: { expression: "globalThis.finalResult", returnByValue: true },
        }),
      );
    });
  while (Date.now() < deadline && !browser) {
    browser = (await evaluate()).result?.result?.value;
    if (!browser) await delay(250);
  }
  if (!browser) throw new Error("browser replay timeout");
  browser.chrome = chromeVersion;
  browser.wasmFetches = requests.filter((x) => x.endsWith(".wasm")).length;
  browser.requests = requests;
} finally {
  ws?.close();
  chrome.kill("SIGTERM");
  server.close();
}

const runs = [...node, browser];
const summary = runs.map((r) => ({
  runtime: r.runtime ?? "chrome",
  cases: r.cases?.length ?? 0,
  exact: r.cases?.filter((x) => x.typedEqual && x.wireEqual && x.requestUnchanged).length ?? 0,
  legacy: r.legacy,
  asset: r.asset,
  failures: failures(r),
}));
const report = {
  package: packageProvenance,
  chrome: chromeVersion,
  executedIds: browser.cases?.map((x) => x.id),
  summary,
  runs,
};
if (reportPath) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (stderr && reportPath) writeFileSync(`${reportPath}.chrome-stderr.log`, stderr);
console.log(
  JSON.stringify({ package: packageProvenance, chrome: chromeVersion, summary }, null, 2),
);
const expectedIds = JSON.parse(readFileSync(strictFile, "utf8")).cases.map((x) => x.id);
const problems = summary.flatMap((s) => [
  ...s.failures.map((f) => `${s.runtime}: ${f}`),
  ...(s.cases === expectedIds.length ? [] : [`${s.runtime}: ran ${s.cases} cases`]),
  ...(s.asset?.sha256 === packageProvenance.assetSha256 ? [] : [`${s.runtime}: asset digest`]),
]);
for (const r of runs)
  if (JSON.stringify(r.cases?.map((x) => x.id)) !== JSON.stringify(expectedIds))
    problems.push(`${r.runtime}: executed ids differ from the fixture`);
if (browser.wasmFetches !== 1) problems.push(`chrome fetched WASM ${browser.wasmFetches} times`);
if (browser.secureContext !== true) problems.push("chrome page is not a secure context");
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
}
