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
 *
 * The first review of this file found its tests could not detect the fix being
 * REMOVED: they exercised only the message builder, so deleting the probe and
 * both its call sites left every one of them green. The probe and the call
 * sites are asserted here first, and the message after.
 */

import { describe, expect, it } from "vitest";

import { inOracle } from "./oracle-harness";

/**
 * Calls the probe with `capture_command` replaced, and reports what it did.
 *
 * The stub is what makes this a test of the probe rather than of bundler: it
 * records the arguments and returns whichever outcome the case needs.
 */
function probeWith(succeeds: boolean, chdir: string): { ok: boolean; output: string } {
  return inOracle(`
    begin
      status = Class.new do
        def initialize(ok) = @ok = ok
        def success? = @ok
      end.new(${succeeds ? "true" : "false"})
      seen = nil
      OracleGate.define_singleton_method(:capture_command) do |args, chdir: nil, env: {}|
        seen = { "args" => args, "chdir" => chdir, "env" => env }
        ["", "an empty CHECKSUMS entry for \\"rake\\"", status]
      end
      result = begin
        OracleGate.assert_frozen_bundle_usable!("/oracle/checkout", chdir: ${JSON.stringify(chdir)})
        "returned"
      rescue OracleGate::Error => e
        "raised: #{e.message.lines.first.strip}"
      end
      { "result" => result, "seen" => seen }
    end
  `);
}

describe("the preflight runs before any generator does", () => {
  it("refuses a bundle that cannot start, naming the remedy", () => {
    const r = probeWith(false, "/snapshot");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("raised:");
    expect(r.output).toContain("no usable frozen bundle");
  });

  it("lets a usable bundle through", () => {
    const r = probeWith(true, "/snapshot");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("returned");
  });

  it("probes where the generators will run, not in the oracle checkout", () => {
    // mise resolves the Ruby runtime from the working directory upwards, so a
    // probe run somewhere else can select a different interpreter and clear a
    // bundle the generators cannot load.
    const r = probeWith(true, "/snapshot");
    expect(r.output).toContain('"chdir" => "/snapshot"');
    expect(r.output).not.toContain('"chdir" => "/oracle/checkout"');
  });

  it("probes under the same frozen environment the generators get", () => {
    const r = probeWith(true, "/snapshot");
    expect(r.output).toContain('"BUNDLE_FROZEN" => "true"');
    expect(r.output).toContain('"BUNDLE_GEMFILE" => "/oracle/checkout/Gemfile"');
  });

  /**
   * RUNS each subcommand, rather than reading the source for the call.
   *
   * A source-level version of this test passed when both call sites were
   * commented out and when both passed the oracle checkout as `chdir` — a
   * commented line still contains the substring, and so does a wrong argument.
   * Only the call itself proves the call.
   */
  it.each(["run_repo", "run_testsuite"])(
    "%s probes the snapshot's directory before running any generator",
    (subcommand) => {
      const r = inOracle(`
        begin
          require "tmpdir"
          oracle = Dir.mktmpdir("fake-oracle-")
          File.write(File.join(oracle, "Gemfile"), "")
          snapshot = Dir.mktmpdir("fake-snapshot-")
          Dir.mkdir(File.join(snapshot, "submodules"))
          Dir.mkdir(File.join(snapshot, "submodules", "plurimath-testsuite"))

          probes = []
          ok = Class.new { def success? = true }.new
          OracleGate.define_singleton_method(:capture_command) do |args, chdir: nil, env: {}|
            probes << { "chdir" => chdir, "env" => env }
            ["", "", ok]
          end
          OracleGate.define_singleton_method(:build_clean_repo_snapshot!) { |_tmp| snapshot }
          OracleGate.define_singleton_method(:require_submodule_snapshot_prerequisites!) { nil }
          OracleGate.define_singleton_method(:run_generator!) do |*|
            raise "REACHED_GENERATOR"
          end

          reached = begin
            OracleGate.${subcommand}(["--check", "--gem", oracle])
            "no generator ran"
          rescue RuntimeError => e
            e.message
          end
          { "reached" => reached, "probes" => probes }
        end
      `);
      expect(r.ok).toBe(true);
      // The probe ran, and it ran before the first generator.
      expect(r.output).toContain("REACHED_GENERATOR");
      expect(r.output).toContain('"BUNDLE_FROZEN" => "true"');
      // In the snapshot, never in the oracle checkout.
      expect(r.output).toContain("fake-snapshot-");
      expect(r.output).not.toContain('"chdir" => "/oracle');
      expect(r.output).not.toMatch(/"chdir" => "[^"]*fake-oracle-/);
    },
  );
});

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
