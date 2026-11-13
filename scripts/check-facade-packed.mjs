#!/usr/bin/env node
/**
 * Pack the built package once, install the tarball in a consumer without dev
 * dependencies, and replay the frozen facade corpus through the installed
 * `./facade/wasm` entry and its `./facade/plurimath_facade.wasm` asset:
 * 3798 writer and 1349 parser source cases, the 87 residual text shapes, the
 * typed source-value documents and the API/wire contract, with native
 * allocation and release accounting.
 *
 *   node scripts/check-facade-packed.mjs <esm|cjs|chrome|all> [report.json] [--limit N]
 *
 * Node consumers import the package by name (ESM or CJS) and pass the asset
 * bytes. Chrome imports the installed ESM entry over HTTP and initializes from
 * a URL, which is fetched exactly once. Every runtime refuses an asset with
 * another digest, Node also checks that a second initialization with the same
 * bytes returns the same kernel, and once initialized the kernel performs no
 * fetch (warmed, no I/O). `--limit` runs a corpus prefix
 * for local smoke checks only (the 87 text shapes, typed source values and API
 * checks still run in full); CI runs everything. CHROME_PATH selects the
 * browser (default `google-chrome`).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FACADE_COUNTS, loadFacadeCorpus, replayFacade } from "./facade-corpus.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const limitAt = args.indexOf("--limit");
const limit = limitAt === -1 ? undefined : Number(args.splice(limitAt, 2)[1]);
const [mode = "all", reportArg] = args;
if (!["esm", "cjs", "chrome", "all"].includes(mode)) {
  console.error("usage: check-facade-packed.mjs <esm|cjs|chrome|all> [report.json] [--limit N]");
  process.exit(2);
}
const reportPath = reportArg ? resolve(reportArg) : undefined;
const chromeExecutable = process.env.CHROME_PATH ?? "google-chrome";
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const pin = JSON.parse(readFileSync(join(root, "assets/facade/manifest.json"), "utf8"));
if (pin.status !== "pinned") {
  console.error(
    "The facade WASM is not pinned (assets/facade/manifest.json status: " +
      `${pin.status}). Pin the final packet with scripts/pin-facade-wasm.mjs; nothing was replayed.`,
  );
  process.exit(1);
}

const data = loadFacadeCorpus(root);
const scratch = mkdtempSync(join(tmpdir(), "plurimath-facade-packed-"));
const dataFile = join(scratch, "facade-corpus.json");
writeFileSync(dataFile, JSON.stringify(data));

// Pack once and install the exact tarball.
const env = { ...process.env };
env.npm_config_cache = join(scratch, "npm-cache");
const run = (command, commandArgs, cwd) => {
  const result = spawnSync(command, commandArgs, {
    cwd,
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 1 << 30,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${commandArgs.join(" ")}: ${result.stderr}\n${result.stdout}`);
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
const entry = manifest.exports["./facade/wasm"];
const assetEntry = manifest.exports["./facade/plurimath_facade.wasm"];
const packageProvenance = {
  name: manifest.name,
  version: manifest.version,
  tarball: packed.filename,
  tarballSha256: sha256(readFileSync(tarball)),
  esmEntry: entry.import.default,
  esmEntrySha256: sha256(readFileSync(join(pkg, entry.import.default))),
  cjsEntry: entry.require.default,
  cjsEntrySha256: sha256(readFileSync(join(pkg, entry.require.default))),
  asset: assetEntry,
  assetSha256: sha256(readFileSync(join(pkg, assetEntry))),
  pinnedSha256: pin.sha256,
  source: pin.source.revision,
  corpusSha256: sha256(readFileSync(dataFile)),
};

const replaySource = `const replayFacade = ${replayFacade.toString()};`;
const limitSource = limit === undefined ? "{}" : `{ limit: ${limit} }`;

// Node: ESM and CJS consumers import the installed package by name.
const nodeRun = (moduleMode) => {
  const body = `${
    moduleMode === "esm"
      ? `import * as api from "@plurimath/plurimath-ts/facade/wasm";
import { readFileSync } from "node:fs"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);`
      : `const api = require("@plurimath/plurimath-ts/facade/wasm");
const { readFileSync } = require("node:fs");`
  }
${replaySource}
(async () => {
  const asset = readFileSync(require.resolve("@plurimath/plurimath-ts/facade/plurimath_facade.wasm"));
  const data = JSON.parse(readFileSync(${JSON.stringify(dataFile)}, "utf8"));
  const kernel = await api.initFacadeWasm(asset);
  const again = await api.initFacadeWasm(new Uint8Array(asset));
  let mismatch;
  try { await api.initFacadeWasm(asset, { sha256: "0".repeat(64) }); } catch (error) { mismatch = error.code; }
  let fetches = 0;
  globalThis.fetch = () => { fetches++; throw new Error("no I/O after initialization"); };
  const result = await replayFacade(api, kernel, data, ${limitSource});
  process.stdout.write(JSON.stringify({ ...result, sameKernel: again === kernel, digestMismatch: mismatch, warmedFetches: fetches }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
`;
  const file = join(scratch, moduleMode === "esm" ? "replay.mjs" : "replay.cjs");
  writeFileSync(file, body);
  const output = run(process.execPath, [file], scratch);
  return {
    runtime: `node ${process.version} ${moduleMode} ${process.platform}`,
    ...JSON.parse(output),
  };
};

// Chrome: the page imports the installed ESM entry over HTTP and loads the asset from a URL.
const chromeRun = async () => {
  const assetPath = `/pkg/${assetEntry.replace(/^\.\//, "")}`;
  const page = `<!DOCTYPE html><meta charset=utf-8><script type=module>
import * as api from ${JSON.stringify(`/pkg/${entry.import.default.replace(/^\.\//, "")}`)};
${replaySource}
(async () => {
  const data = await (await fetch("/data/corpus.json")).json();
  const kernel = await api.initFacadeWasm(new URL(${JSON.stringify(assetPath)}, location.href));
  // A different asset is refused on its digest; it is an in-memory response, so no second fetch.
  let mismatch;
  try { await api.initFacadeWasm(new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))); } catch (error) { mismatch = error.code; }
  const realFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (...args) => { fetches++; return realFetch(...args); };
  const result = await replayFacade(api, kernel, data, ${limitSource});
  return { runtime: navigator.userAgent, secureContext: isSecureContext, warmedFetches: fetches, digestMismatch: mismatch, ...result };
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
      if (path === "/data/corpus.json") file = dataFile;
      else if (path.startsWith("/pkg/")) {
        file = resolve(pkg, path.slice(5));
        if (!file.startsWith(`${pkg}${sep}`)) throw new Error("path outside the installed package");
      } else throw new Error(`unknown route ${path}`);
      res.setHeader(
        "Content-Type",
        { ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" }[
          extname(file)
        ] ?? "application/octet-stream",
      );
      res.end(readFileSync(file));
    } catch (error) {
      console.error("facade browser request failed", String(error));
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const profile = mkdtempSync(join(tmpdir(), "plurimath-facade-browser-"));
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
  const deadline = Date.now() + 150 * 60 * 1000;
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
      if (!browser) await delay(1000);
    }
    if (!browser) throw new Error("browser replay timeout");
  } finally {
    ws?.close();
    chrome.kill("SIGTERM");
    server.close();
  }
  if (stderr && reportPath) writeFileSync(`${reportPath}.chrome-stderr.log`, stderr);
  return {
    ...browser,
    chrome: chromeVersion,
    wasmFetches: requests.filter((x) => x.endsWith(".wasm")).length,
    requests,
  };
};

const runs = [];
if (mode === "esm" || mode === "all") runs.push(nodeRun("esm"));
if (mode === "cjs" || mode === "all") runs.push(nodeRun("cjs"));
if (mode === "chrome" || mode === "all") runs.push(await chromeRun());

const expectedIds = data.cases
  .slice(0, limit ?? data.cases.length)
  .map((c) => `${c.kind}:${c.format}:${c.id}`);
const problems = [];
for (const r of runs) {
  const label = r.runtime ?? "chrome";
  if (r.fatal) {
    problems.push(`${label}: ${r.fatal}`);
    continue;
  }
  if (JSON.stringify(r.executed) !== JSON.stringify(expectedIds))
    problems.push(`${label}: executed cases differ from the corpus`);
  if (r.mismatches.length) problems.push(`${label}: ${r.mismatches.length} corpus mismatches`);
  if (
    limit === undefined &&
    (r.counts.writer.cases !== FACADE_COUNTS.writer ||
      r.counts.parser.cases !== FACADE_COUNTS.parser)
  )
    problems.push(`${label}: ran ${JSON.stringify(r.counts)}`);
  {
    const { model, unbuilt, error, mismatches } = r.text87;
    if (mismatches.length || model !== 67 || unbuilt !== 11 || error !== 9)
      problems.push(
        `${label}: text87 ${JSON.stringify({ model, unbuilt, error, mismatches: mismatches.length })}`,
      );
    if (r.sourceValues.rows !== FACADE_COUNTS.sourceValues || r.sourceValues.mismatches.length)
      problems.push(`${label}: source values ${JSON.stringify(r.sourceValues.mismatches)}`);
  }
  for (const c of r.checks.filter((x) => !x.ok)) problems.push(`${label}: ${c.name}`);
  if (!r.balanced) problems.push(`${label}: unbalanced accounting ${JSON.stringify(r.accounting)}`);
  if (r.accounting.calls < r.publicCalls)
    problems.push(`${label}: fewer native calls than public calls`);
  if (r.asset?.sha256 !== packageProvenance.assetSha256) problems.push(`${label}: asset digest`);
  if ("sameKernel" in r && r.sameKernel !== true)
    problems.push(`${label}: a second initialization made another kernel`);
  if (r.digestMismatch !== "AssetDigestMismatch")
    problems.push(`${label}: digest mismatch not refused`);
  if (r.warmedFetches !== 0)
    problems.push(`${label}: ${r.warmedFetches} fetches after initialization`);
  if ("wasmFetches" in r) {
    if (r.wasmFetches !== 1) problems.push(`chrome fetched the WASM ${r.wasmFetches} times`);
    if (r.secureContext !== true) problems.push("chrome page is not a secure context");
  }
}
const summary = runs.map((r) => ({
  runtime: r.runtime ?? "chrome",
  chrome: r.chrome,
  counts: r.counts,
  exact: r.exact,
  text87: r.text87 && { ...r.text87, mismatches: r.text87.mismatches.length },
  sourceValues: r.sourceValues && {
    ...r.sourceValues,
    mismatches: r.sourceValues.mismatches.length,
  },
  checks: r.checks?.filter((x) => x.ok).length,
  accounting: r.accounting,
  publicCalls: r.publicCalls,
  wasmFetches: r.wasmFetches,
  warmedFetches: r.warmedFetches,
  seconds: r.seconds,
  fatal: r.fatal,
}));
const report = { package: packageProvenance, limit: limit ?? null, summary, problems, runs };
if (reportPath) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({ package: packageProvenance, summary, problems: problems.slice(0, 50) }, null, 2),
);
if (problems.length) process.exitCode = 1;
