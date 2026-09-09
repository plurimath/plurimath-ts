/**
 * The class-B spec files, named once.
 *
 * These execute Ruby. `vitest.oracle.config.ts` INCLUDES them and its CI job
 * pins the Ruby runtime; `vitest.config.ts` EXCLUDES them so the default
 * class-A suite stays Node-only. Both read this list, because they were
 * separate literals once and a spec added to the class-B config kept running
 * in the class-A suite as well — green here, and a "no ruby available" throw
 * on any machine without Ruby.
 *
 * An explicit list rather than a `test/scripts/**` pattern, because that
 * directory also holds `gate-boundaries.spec.ts`, which is Node-only and
 * belongs in class A.
 */
export const CLASS_B_SPECS = [
  "test/scripts/gate-oracle-differential.spec.ts",
  "test/scripts/gate-oracle-preflight.spec.ts",
] as const;
