/**
 * Regression proof for the frozen-bundle preflight in
 * `scripts/gate-oracle.rb repo --check` and `testsuite --check`.
 *
 * Both checks run their generators under `BUNDLE_FROZEN=true`. Frozen mode
 * refuses a lockfile whose CHECKSUMS section is present but empty — what
 * `bundle install` writes when every gem is satisfied from an already-installed
 * copy instead of being fetched. The gem does not track its lockfile, so an
 * oracle checkout reaching that state is ordinary, not a mistake.
 *
 * Before the preflight the run got several minutes in, then died with a raw
 * Bundler stack trace reported as `generate-corpus.rb failed with exit 1` —
 * blaming the generator for a condition of the bundle, and naming no remedy.
 * These tests assert the message, because the message is the whole fix.
 */

import { describe, expect, it } from "vitest";

import { inOracle } from "./oracle-harness";

const EMPTY_CHECKSUMS_STDERR =
  'Your lockfile has an empty CHECKSUMS entry for "rake", but cannot be updated ' +
  "because frozen mode is set (Bundler::ProductionError)";

function frozenBundleError(stderr: string): string {
  const r = inOracle(
    `OracleGate.frozen_bundle_error("/oracle/checkout", ${JSON.stringify(stderr)})`,
  );
  expect(r.ok).toBe(true);
  return r.output;
}

describe("the frozen-bundle error names a remedy", () => {
  it("prescribes --add-checksums for the empty CHECKSUMS entry", () => {
    const message = frozenBundleError(EMPTY_CHECKSUMS_STDERR);
    expect(message).toContain("bundle lock --add-checksums");
    expect(message).toContain("/oracle/checkout");
  });

  it("falls back to bundle install for every other frozen failure", () => {
    const message = frozenBundleError("Could not find rake-12.3.3 in locally installed gems");
    expect(message).toContain("bundle install");
    expect(message).not.toContain("--add-checksums");
  });

  it("quotes what bundler actually said, so the remedy can be second-guessed", () => {
    const message = frozenBundleError("Could not find rake-12.3.3 in locally installed gems");
    expect(message).toContain("Could not find rake-12.3.3");
  });

  it("blames the bundle rather than the generator that had not run yet", () => {
    const message = frozenBundleError(EMPTY_CHECKSUMS_STDERR);
    expect(message).toContain("no usable frozen bundle");
    expect(message).not.toContain("generate-corpus");
  });
});

describe("the preflight and the generators share one bundler context", () => {
  it("builds the same env for both, so the probe cannot pass where a run fails", () => {
    const r = inOracle('OracleGate.frozen_generator_env("/oracle/checkout")');
    expect(r.ok).toBe(true);
    expect(r.output).toContain('"BUNDLE_FROZEN" => "true"');
    expect(r.output).toContain('"BUNDLE_GEMFILE" => "/oracle/checkout/Gemfile"');
  });
});
