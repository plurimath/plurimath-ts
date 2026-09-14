import { existsSync } from "node:fs";
import { join } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import { PINNED_CORPUS_ROOT, SUBMODULE_FIX } from "./test/core/corpus-pin";
import { CLASS_B_SPECS } from "./test/scripts/class-b-specs";

// The conformance cases are not in this repository; they come from the pinned
// `plurimath-testsuite` submodule (TODO.plan/cross-cutting.md). A clone made
// without `--recursive` leaves that directory empty, and a suite that ran
// anyway would report a wall of green while checking nothing. The reader throws
// too — this only moves the same failure to before the first test file loads,
// so the diagnosis is one message rather than one per spec.
if (!existsSync(join(PINNED_CORPUS_ROOT, "corpus", "provenance.yaml"))) {
  throw new Error(
    `The conformance corpus is missing: ${PINNED_CORPUS_ROOT} has no corpus/provenance.yaml.\n` +
      `Run: ${SUBMODULE_FIX}`,
  );
}

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    // These specs execute the Ruby in scripts/*.rb. Keep the default class-A
    // suite Node-only; the dedicated class-B config and CI job pin the Ruby
    // runtime explicitly. The list is shared with that config so a spec cannot
    // be added to one and forgotten in the other.
    exclude: [...configDefaults.exclude, ...CLASS_B_SPECS],
  },
});
