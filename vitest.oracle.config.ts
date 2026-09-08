import { defineConfig } from "vitest/config";

import { CLASS_B_SPECS } from "./test/scripts/class-b-specs";

/** Ruby-backed unit regressions for the oracle runner, isolated from class A. */
export default defineConfig({
  test: {
    include: [...CLASS_B_SPECS],
  },
});
