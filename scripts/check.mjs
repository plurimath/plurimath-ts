#!/usr/bin/env node
/**
 * Runs every class-A gate that is active at the repository's current
 * milestone (ARCHITECTURE.md §7). Class-B gates need a Ruby oracle checkout
 * and live in scripts/oracle; class-C evidence is human and lives in the
 * phase-exit checklist.
 *
 * Failure semantics, per §7:
 *   - active gate whose runner fails      -> FAIL
 *   - active gate whose runner is missing -> FAIL (never silently skipped)
 *   - not-yet-active gate                 -> reported inactive, non-blocking
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(resolve(root, "gates.json"), "utf8"));

const { milestones, currentMilestone, gates } = registry;
const currentIndex = milestones.indexOf(currentMilestone);
if (currentIndex === -1) {
  console.error(`gates.json: currentMilestone "${currentMilestone}" is not in milestones`);
  process.exit(2);
}

const isActive = (gate) => {
  const index = milestones.indexOf(gate.activatesAt);
  if (index === -1) {
    console.error(`gates.json: gate "${gate.id}" activates at unknown milestone`);
    process.exit(2);
  }
  return index <= currentIndex;
};

const classA = gates.filter((gate) => gate.class === "A");
const active = classA.filter(isActive);
const inactive = classA.filter((gate) => !isActive(gate));

console.log(`milestone: ${currentMilestone}`);
console.log(`class-A gates: ${active.length} active, ${inactive.length} inactive\n`);

const failures = [];
for (const gate of active) {
  process.stdout.write(`▶ ${gate.id} — ${gate.run}\n`);
  const result = spawnSync(gate.run, { cwd: root, shell: true, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    failures.push(gate.id);
    console.log(`✗ ${gate.id}\n`);
  } else {
    console.log(`✓ ${gate.id}\n`);
  }
}

for (const gate of inactive) {
  console.log(`· ${gate.id} — inactive (activates at ${gate.activatesAt})`);
}

if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nAll active class-A gates passed at milestone ${currentMilestone}.`);
