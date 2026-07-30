#!/usr/bin/env node
/**
 * Layer-boundary gate (ARCHITECTURE.md §3, §7).
 *
 * Wraps dependency-cruiser to close a trap found while scaffolding: passing a
 * bare directory made it cruise **zero** modules and report success, so the
 * gate was green while checking nothing. A gate that inspects nothing is a
 * failure, not a pass — this asserts it actually walked the tree.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync(
  "npx",
  ["depcruise", "src/**/*.ts", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
  { cwd: root, encoding: "utf8" },
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
  console.error("boundaries: cruised 0 modules — the gate inspected nothing, which is a failure");
  process.exit(1);
}

if (summary.error > 0) {
  console.error(`boundaries: ${summary.error} violation(s)`);
  for (const violation of summary.violations) {
    console.error(`  ${violation.rule.name}: ${violation.from} -> ${violation.to}`);
  }
  process.exit(1);
}

const warnings = summary.warn > 0 ? `, ${summary.warn} warning(s)` : "";
console.log(
  `boundaries: ${summary.totalCruised} modules, ` +
    `${summary.totalDependenciesCruised} dependencies, no violations${warnings}`,
);
