import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv[2]) throw new Error("Pass an installed Parsanol package directory");
const sdk = resolve(process.argv[2]);
const report = process.env.HTML_BROWSER_REPORT;
const chromeExecutable = process.env.CHROME_PATH ?? "google-chrome";
const page = `<!DOCTYPE html><meta charset=utf-8><script type=module>
import * as sdk from '/sdk/dist/browser.js';
import {createHtmlParser} from '/main/html-parsanol.js';
import {normalize} from '/main/core.js';
globalThis.resultPromise=(async()=>{
 await sdk.initialize(await (await fetch('/sdk/vendor/parsanol-web/parsanol_bg.wasm')).arrayBuffer());
 const runtimes=new Map();
 for(const name of ['dot','comma','arabic']){const text=await(await fetch('/artifact/'+name+'.json')).text();runtimes.set(JSON.parse(text).provenance.decimal,new sdk.PargRuntime(text,'document'));}
 const parse=createHtmlParser(decimal=>{const r=runtimes.get(decimal);if(!r)throw Error('missing decimal '+decimal);return r;});
 const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
 const rows=(await(await fetch('/cases.json')).json()).cases;
 const results=[];
 for(const row of rows){try{const actual=normalize(parse(row.input));results.push({id:row.id,equal:'model'in row&&stable(actual)===stable(row.model),unexpectedSuccess:!('model'in row)});}catch(e){results.push({id:row.id,equal:'error'in row,error:{name:e.name,message:e.message,index:e.index}});}}
 const localeRows=(await(await fetch('/locale-cases.json')).json()).cases.filter(x=>x.locale);
 for(const row of localeRows){try{const actual=normalize(parse(row.input,{locale:row.locale}));results.push({id:row.id,locale:row.locale,equal:row.model!==undefined&&stable(actual)===stable(row.model),unexpectedSuccess:!!row.raises});}catch(e){results.push({id:row.id,locale:row.locale,equal:!!row.raises,error:{name:e.name,message:e.message}});}}
 const summary={requests:results.length,sourceModels:results.slice(0,rows.length).filter(x=>x.equal&&!x.error).length,sourceRefusals:results.slice(0,rows.length).filter(x=>x.equal&&x.error).length,localeChecks:localeRows.length,mismatches:results.filter(x=>!x.equal),wrongSuccesses:results.filter(x=>x.unexpectedSuccess).length};
 for(const r of runtimes.values())r.artifact.free();
 return {userAgent:navigator.userAgent,summary,results};
})();globalThis.resultPromise.then(r=>globalThis.finalResult=r,e=>globalThis.finalResult={fatal:String(e),stack:e.stack});
</script>`;
const requests = [];
const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let file;
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(page);
      return;
    }
    if (url.pathname.startsWith("/sdk/")) file = resolve(sdk, url.pathname.slice(5));
    else if (url.pathname.startsWith("/main/"))
      file = resolve(repo + "/dist", url.pathname.slice(6));
    else if (url.pathname.startsWith("/artifact/"))
      file = resolve(repo + "/assets/html", url.pathname.slice(10));
    else if (url.pathname === "/cases.json")
      file = repo + "/test/formats/html/initialized-source.json";
    else if (url.pathname === "/locale-cases.json")
      file = repo + "/test/formats/html/model-fixtures.json";
    if (
      !file ||
      ![repo + "/dist/", repo + "/assets/html/", repo + "/test/formats/html/", sdk + "/"].some(
        (prefix) => file.startsWith(prefix),
      )
    )
      throw Error("invalid path");
    const type =
      { ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" }[
        extname(file)
      ] ?? "application/octet-stream";
    res.setHeader("Content-Type", type);
    res.end(readFileSync(file));
    requests.push(url.pathname);
  } catch (e) {
    res.statusCode = 404;
    res.end(String(e));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const profile = mkdtempSync(join(tmpdir(), "plurimath-html-browser-"));
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
    `http://127.0.0.1:${port}/`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
chrome.stderr.on("data", (x) => (stderr += x));
const deadline = Date.now() + 90000;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let debugPort;
  while (Date.now() < deadline) {
    try {
      debugPort = readFileSync(profile + "/DevToolsActivePort", "utf8").split("\n")[0];
      break;
    } catch {}
    await delay(100);
  }
  if (!debugPort) throw Error("Chrome debug port timeout");
  let pageTarget;
  while (Date.now() < deadline) {
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    pageTarget = pages.find((x) => x.type === "page");
    if (pageTarget) break;
    await delay(100);
  }
  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id) {
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++seq;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  let result;
  while (Date.now() < deadline) {
    const msg = await send("Runtime.evaluate", {
      expression: "globalThis.finalResult",
      returnByValue: true,
    });
    result = msg.result?.result?.value;
    if (result) break;
    await delay(100);
  }
  if (!result) throw Error("browser replay timeout");
  result.httpRequests = requests;
  result.wasmFetches = requests.filter((x) => x.endsWith(".wasm")).length;
  if (report) writeFileSync(report, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        summary: result.summary,
        fatal: result.fatal,
        userAgent: result.userAgent,
        wasmFetches: result.wasmFetches,
      },
      null,
      2,
    ),
  );
  if (result.fatal || result.summary.mismatches.length || result.summary.wrongSuccesses)
    process.exitCode = 1;
  await send("Browser.close");
} finally {
  ws?.close();
  chrome.kill("SIGTERM");
  server.close();
  if (report) writeFileSync(report + ".stderr", stderr);
}
