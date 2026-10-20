#!/usr/bin/env node
/** Pack once, then check the exact tarball in a consumer without dev dependencies. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(manifest.name, "plurimath-ts");
assert.notEqual(manifest.private, true);
const scratch = mkdtempSync(join(tmpdir(), "plurimath-package-"));
const env = { ...process.env };
env.npm_config_cache = join(scratch, "npm-cache");
function run(command, args, cwd = scratch, input) {
  const result = spawnSync(command, args, { cwd, env, input, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

const [packed] = JSON.parse(
  run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], root),
);
assert.equal(packed.name, manifest.name);
assert.equal(packed.version, manifest.version);
for (const { path } of packed.files) {
  assert.ok(
    path.startsWith("dist/") || /^(package\.json|README\.md|LICENSE(?:\..*)?)$/.test(path),
    `Unexpected published file: ${path}`,
  );
}
const tarball = join(scratch, packed.filename);
writeFileSync(join(scratch, "package.json"), JSON.stringify({ private: true, type: "module" }));
run("npm", ["install", "--no-audit", "--no-fund", "--omit=dev", tarball]);
const installed = JSON.parse(
  readFileSync(join(scratch, "node_modules/plurimath-ts/package.json"), "utf8"),
);
assert.equal(installed.version, manifest.version);
const entries = Object.keys(manifest.exports)
  .filter((entry) => entry !== "./package.json")
  .map((entry) => (entry === "." ? manifest.name : manifest.name + entry.slice(1)));
for (const mode of ["module", "commonjs"]) {
  const script =
    mode === "module"
      ? `import assert from 'node:assert/strict';
       for (const name of ${JSON.stringify(entries)}) assert.ok(Object.keys(await import(name)).length);
       const {parseAsciimath}=await import('plurimath-ts/asciimath');
       const {toLatex}=await import('plurimath-ts/latex');
       assert.equal(toLatex(parseAsciimath('2')), '2');`
      : `const assert=require('node:assert/strict');
       for (const name of ${JSON.stringify(entries)}) assert.ok(Object.keys(require(name)).length);
       const {parseAsciimath}=require('plurimath-ts/asciimath');
       const {toLatex}=require('plurimath-ts/latex');
       assert.equal(toLatex(parseAsciimath('2')), '2');`;
  run(process.execPath, [`--input-type=${mode}`, "-e", script]);
}
const source = `import {parse} from 'plurimath-ts';
import {toLatex} from 'plurimath-ts/latex';
import {createMathmlParser} from 'plurimath-ts/mathml/leptris';
const formula = parse('2', 'asciimath');
const result: string = toLatex(formula);
void result; void createMathmlParser;\n`;
for (const extension of ["mts", "cts"]) {
  const file = join(scratch, `consumer.${extension}`);
  writeFileSync(file, source);
  run(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "es2022",
    "--module",
    "nodenext",
    "--moduleResolution",
    "nodenext",
    file,
  ]);
}
const cli = join(scratch, "node_modules/.bin/plurimath");
assert.match(run(cli, ["--help"]), /Usage:/i);
assert.equal(run(cli, ["convert", "--from", "asciimath", "--to", "latex"], scratch, "2\n"), "2\n");
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, `tarball=${tarball}\n`);
}
console.log(
  JSON.stringify({
    tarball,
    version: installed.version,
    entries: entries.length,
    esm: "pass",
    commonjs: "pass",
    types: "pass",
    cli: "pass",
  }),
);
