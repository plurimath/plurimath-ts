#!/usr/bin/env node
/**
 * Layer-boundary gate (ARCHITECTURE.md §3, §7): two checks over one tree.
 *
 * 1. dependency-cruiser over the rules in .dependency-cruiser.cjs — the eight
 *    layering rules, including the node-major render closure (rule 8).
 * 2. The render kind inventory: the expected kind set is derived from each
 *    format's dispatch-table keys (`RENDERERS` in src/formats/<F>/render.ts),
 *    and src/render must hold exactly one <F>.ts per kind for every format
 *    that has a dispatch table. A missing file, a stray file, or an empty
 *    scan is a failure — a gate that inspects nothing is a failure, not a
 *    pass (the same trap closed for dependency-cruiser below: passing a bare
 *    directory once cruised **zero** modules and reported success).
 *
 * The optional positional argument names the tree to gate (default: this
 * repository). The gate regression spec (test/scripts/gate-boundaries.spec.ts)
 * points it at scratch fixtures to prove each violation class actually fails.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = process.argv[2] === undefined ? repoRoot : resolve(process.argv[2]);

const failures = [];

// --- 1. dependency-cruiser over the rule set -------------------------------

// The binary is resolved from THIS repository, not from the gated tree, so a
// fixture tree needs no node_modules of its own (and nothing ever falls back
// to a network install).
const depcruise = resolve(repoRoot, "node_modules/.bin/depcruise");
const result = spawnSync(
  depcruise,
  ["src/**/*.ts", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
  { cwd: targetRoot, encoding: "utf8" },
);

if (result.error) {
  console.error(`boundaries: could not run dependency-cruiser: ${result.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("boundaries: dependency-cruiser produced no parseable report");
  console.error(result.stdout || result.stderr);
  process.exit(1);
}

const { summary } = report;
if (summary.totalCruised === 0) {
  failures.push("cruised 0 modules — the gate inspected nothing, which is a failure");
}
if (summary.error > 0) {
  for (const violation of summary.violations) {
    if (violation.rule.severity !== "error") continue;
    failures.push(`${violation.rule.name}: ${violation.from} -> ${violation.to}`);
  }
}

// --- 2. render kind inventory ----------------------------------------------

/** `fontStyle` (a NodeKind / dispatch key) names the directory `font-style`. */
function kindDirName(key) {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** The RENDERERS keys of one format's dispatch table, or null if unreadable. */
function dispatchKinds(renderTsPath) {
  const source = readFileSync(renderTsPath, "utf8");
  const table = source.match(/const RENDERERS[\s\S]*?\n\};/);
  if (table === null) return null;
  return [...table[0].matchAll(/^\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gm)].map((m) => m[1]);
}

const formatsDir = join(targetRoot, "src", "formats");
const renderDir = join(targetRoot, "src", "render");

const formats = existsSync(formatsDir)
  ? readdirSync(formatsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(formatsDir, e.name, "render.ts")))
      .map((e) => e.name)
      .sort()
  : [];
if (formats.length === 0) {
  failures.push("inventory: no format with a render.ts dispatch table found under src/formats");
}

const expected = new Map(); // format -> Set of kind directory names
for (const format of formats) {
  const kinds = dispatchKinds(join(formatsDir, format, "render.ts"));
  if (kinds === null || kinds.length === 0) {
    failures.push(
      `inventory: could not read the RENDERERS table keys from src/formats/${format}/render.ts`,
    );
    continue;
  }
  expected.set(format, new Set(kinds.map(kindDirName)));
}

if (!existsSync(renderDir)) {
  failures.push(
    "inventory: src/render does not exist — zero render files found, which is a failure",
  );
} else {
  const allKinds = new Set([...expected.values()].flatMap((set) => [...set]));
  const seen = new Map([...expected.keys()].map((format) => [format, new Set()]));
  let fileCount = 0;
  for (const entry of readdirSync(renderDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      failures.push(
        `inventory: src/render/${entry.name} is not a kind directory — ` +
          "only <kind>/<format>.ts files live under src/render",
      );
      continue;
    }
    if (!allKinds.has(entry.name)) {
      failures.push(
        `inventory: src/render/${entry.name}/ does not correspond to any dispatch-table kind`,
      );
      continue;
    }
    for (const fileEntry of readdirSync(join(renderDir, entry.name), {
      withFileTypes: true,
    })) {
      const file = fileEntry.name;
      if (!fileEntry.isFile()) {
        failures.push(
          `inventory: src/render/${entry.name}/${file} is not a regular file — ` +
            "a directory or link cannot satisfy a render-format slot",
        );
        continue;
      }
      fileCount += 1;
      const format = file.endsWith(".ts") ? file.slice(0, -".ts".length) : null;
      if (format === null || !expected.has(format)) {
        failures.push(
          `inventory: src/render/${entry.name}/${file} does not belong to any render format`,
        );
      } else if (!expected.get(format).has(entry.name)) {
        failures.push(
          `inventory: src/render/${entry.name}/${file} has no ${format} dispatch-table entry ` +
            `for kind "${entry.name}"`,
        );
      } else {
        seen.get(format).add(entry.name);
      }
    }
  }
  if (fileCount === 0) {
    failures.push(
      "inventory: zero render files found under src/render — " +
        "the gate inspected nothing, which is a failure",
    );
  }
  for (const [format, kinds] of expected) {
    for (const kind of kinds) {
      if (!seen.get(format).has(kind)) {
        failures.push(
          `inventory: missing src/render/${kind}/${format}.ts — ` +
            `the ${format} dispatch table has kind "${kind}"`,
        );
      }
    }
  }
}

// --- verdict ----------------------------------------------------------------

if (failures.length > 0) {
  console.error(`boundaries: ${failures.length} violation(s)`);
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

const kindCount = expected.size > 0 ? expected.values().next().value.size : 0;
const warnings = summary.warn > 0 ? `, ${summary.warn} warning(s)` : "";
console.log(
  `boundaries: ${summary.totalCruised} modules, ` +
    `${summary.totalDependenciesCruised} dependencies, no violations${warnings}; ` +
    `inventory: ${kindCount} kinds x ${expected.size} format(s), complete`,
);
