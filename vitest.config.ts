import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
import { PINNED_CORPUS_ROOT, SUBMODULE_FIX } from "./test/core/corpus-pin";

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
  },
});
