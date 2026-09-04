import { defineConfig } from "vitest/config";

/** Ruby-backed unit regressions for the oracle runner, isolated from class A. */
export default defineConfig({
  test: {
    include: ["test/scripts/gate-oracle-differential.spec.ts"],
  },
});
