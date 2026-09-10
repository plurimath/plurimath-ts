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
 *
 * A second, independent review found the message builder itself over-claiming:
 * on ANY non-zero exit it named `bundle install` as the remedy and labeled
 * whatever came back on stderr "bundler said:" — including stderr the probe
 * produced for reasons that have nothing to do with the bundle, such as an
 * invalid `RUBYOPT`. The confident remedies are now earned by matching text
 * Bundler is actually known to emit; anything else gets a neutral report of
 * the command and its exit status, with no claim about who produced the
 * stderr.
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
   *
   * The assertion is EQUALITY between the probe's directory and the first
   * generator's, because that is the invariant: `mise` resolves the Ruby
   * runtime from the working directory upwards, so a probe run anywhere else
   * can clear a bundle the generator cannot load. Matching a substring of the
   * snapshot path is not enough — `testsuite --check` runs its generator in
   * `<snapshot>/submodules/plurimath-testsuite`, and a probe given the
   * snapshot root instead would still contain it.
   */
  it.each(["run_repo", "run_testsuite"])(
    "%s probes exactly where its first generator will run",
    (subcommand) => {
      const r = inOracle(`
        Dir.mktmpdir("fake-oracle-") do |oracle|
          File.write(File.join(oracle, "Gemfile"), "")
          Dir.mktmpdir("fake-snapshot-") do |snapshot|
            FileUtils.mkdir_p(File.join(snapshot, "submodules", "plurimath-testsuite"))

            probes = []
            generator_chdir = nil
            ok = Class.new { def success? = true }.new
            OracleGate.define_singleton_method(:capture_command) do |args, chdir: nil, env: {}|
              probes << { "chdir" => chdir, "env" => env }
              ["", "", ok]
            end
            OracleGate.define_singleton_method(:build_clean_repo_snapshot!) { |_tmp| snapshot }
            OracleGate.define_singleton_method(:require_submodule_snapshot_prerequisites!) { nil }
            OracleGate.define_singleton_method(:run_generator!) do |_script, _args, chdir:, gem_dir:|
              generator_chdir = chdir
              raise "REACHED_GENERATOR"
            end

            reached = begin
              OracleGate.${subcommand}(["--check", "--gem", oracle])
              "no generator ran"
            rescue RuntimeError => e
              e.message
            end
            {
              "reached" => reached,
              "probe_count" => probes.length,
              "matches_generator" => probes.length == 1 && probes[0]["chdir"] == generator_chdir,
              "probed_the_oracle" => probes.any? { |probe| probe["chdir"] == oracle },
              "env" => probes.map { |probe| probe["env"] },
            }
          end
        end
      `);
      expect(r.ok).toBe(true);
      // One probe, before the first generator, in that generator's directory.
      expect(r.output).toContain("REACHED_GENERATOR");
      expect(r.output).toContain('"probe_count" => 1');
      expect(r.output).toContain('"matches_generator" => true');
      expect(r.output).toContain('"probed_the_oracle" => false');
      expect(r.output).toContain('"BUNDLE_FROZEN" => "true"');
    },
  );
});

// Must match `OracleGate::FROZEN_BUNDLE_PROBE_COMMAND` rendered the way
// `frozen_bundle_probe_display` renders it — each argument through
// `Shellwords.escape`, so the empty `-e` argument shows as `''`. Duplicated
// here rather than read from the Ruby source because the neutral message is
// expected to quote exactly this.
//
// The trailing `''` is the whole point of duplicating it. This constant read
// `... ruby -e ` while the Ruby still joined on a space, and when the Ruby
// changed, that old string stayed a PREFIX of the new one — so `toContain`
// went on passing while no longer checking the part that had been wrong.
const FROZEN_BUNDLE_PROBE_COMMAND = "mise x -- bundle exec ruby -e ''";

const EMPTY_CHECKSUMS_STDERR =
  'Your lockfile has an empty CHECKSUMS entry for "rake", but cannot be updated ' +
  "because frozen mode is set (Bundler::ProductionError)";

// A failure Bundler itself actually raises for a locked gem it cannot
// resolve, reproduced directly against the Bundler this repo pins by locking
// a Gemfile against a gem that does not exist: the "Could not find gem"
// phrasing is real (bundler/resolver.rb and three other call sites), and the
// "(Bundler::GemNotFound)" suffix is how Ruby renders an uncaught exception
// of that class.
const BUNDLER_GEM_NOT_FOUND_STDERR =
  "Could not find gem 'rake (= 12.3.3)' in locally installed gems (Bundler::GemNotFound)";

// What this project's probe itself produces for a failure that has nothing to
// do with Bundler or the bundle — reproduced directly by running the exact
// probe command with `RUBYOPT=--definitely-invalid-option` set.
const INVALID_RUBYOPT_STDERR =
  "ruby: invalid option --definitely-invalid-option  (-h will show valid options) (RuntimeError)";

function frozenBundleError(stderr: string, exitstatus = 1): string {
  const r = inOracle(`
    begin
      status = Struct.new(:exitstatus).new(${exitstatus})
      OracleGate.frozen_bundle_error("/oracle/checkout", ${JSON.stringify(stderr)}, status)
    end
  `);
  expect(r.ok).toBe(true);
  return r.output;
}

describe("the frozen-bundle error names a remedy only where the evidence supports it", () => {
  it("prescribes --add-checksums for the empty CHECKSUMS entry", () => {
    const message = frozenBundleError(EMPTY_CHECKSUMS_STDERR);
    expect(message).toContain("bundle lock --add-checksums");
    expect(message).toContain("/oracle/checkout");
  });

  it("falls back to bundle install for a differently-shaped bundler failure", () => {
    const message = frozenBundleError(BUNDLER_GEM_NOT_FOUND_STDERR);
    expect(message).toContain("bundle install");
    expect(message).not.toContain("--add-checksums");
  });

  it("quotes what bundler actually said, so the remedy can be second-guessed", () => {
    const message = frozenBundleError(BUNDLER_GEM_NOT_FOUND_STDERR);
    expect(message).toContain("Could not find gem 'rake (= 12.3.3)'");
  });

  it("prints a probe command a reader can paste back into a shell", () => {
    // The probe's last argument is the EMPTY string, the program handed to
    // `-e`. Joining the array on a space dropped it, so the message read
    // `ruby -e ` and the line could not be re-run as written. Asserted on the
    // rendered message rather than on the helper, because it is the message a
    // reader copies from.
    const message = frozenBundleError(INVALID_RUBYOPT_STDERR);
    expect(message).toContain("bundle exec ruby -e ''");
    expect(message).not.toMatch(/ruby -e `/);
  });

  it("blames the bundle rather than the generator that had not run yet", () => {
    const message = frozenBundleError(EMPTY_CHECKSUMS_STDERR);
    expect(message).toContain("no usable frozen bundle");
    expect(message).not.toContain("generate-corpus");
  });

  /**
   * The regression this file exists to catch a second time: a probe failure
   * unrelated to Bundler — here, the exact stderr an invalid `RUBYOPT`
   * produces — used to get the same "no usable frozen bundle, run `bundle
   * install`, bundler said:" message as a real Bundler failure. Nothing here
   * shows the stderr came from Bundler, so the message must not claim it did.
   */
  it("reports a non-bundler failure plainly, prescribing nothing", () => {
    const message = frozenBundleError(INVALID_RUBYOPT_STDERR, 1);
    expect(message).not.toContain("bundle install");
    expect(message).not.toContain("bundler said");
    expect(message).not.toContain("no usable frozen bundle");
    expect(message).toContain("failed with exit 1");
    expect(message).toContain(FROZEN_BUNDLE_PROBE_COMMAND);
    expect(message).toContain(INVALID_RUBYOPT_STDERR);
  });
});
