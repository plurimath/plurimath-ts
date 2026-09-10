/**
 * Regression proof that `scripts/gate-oracle.rb` no longer assumes `mise`.
 *
 * `run_generator!` and `assert_frozen_bundle_usable!` used to hard-code
 * `mise x -- bundle exec ruby ...`, so a developer with a perfectly good Ruby
 * via rbenv, asdf, rvm, or the system — just not mise — got "mise is required
 * but could not be executed" instead of a working generator run. Both now
 * share `capture_generator_command`, which tries `bundle exec ruby` directly
 * first and falls back to `mise x -- bundle exec ruby` only when the direct
 * attempt could not find an executable at all — mirroring the try-PATH-
 * then-mise split in `test/scripts/oracle-harness.ts#runRuby`.
 *
 * These stub `capture_command`, the seam `gate-oracle-preflight.spec.ts`
 * already uses to test `assert_frozen_bundle_usable!` without a real bundle,
 * so no real subprocess runs here either. A "broken" outcome raises a plain
 * `RuntimeError` rather than the `OracleGate::Error` a missing executable
 * produces, proving the fallback triggers on "not found", not on "failed".
 */

import { describe, expect, it } from "vitest";

import { inOracle } from "./oracle-harness";

type Outcome = "ok" | "missing" | "broken";

/**
 * Stubs `capture_command` to answer from a queue of outcomes, one per call,
 * then evaluates `call` and reports both the result and every intercepted
 * command line.
 */
function withStubbedCommand(
  outcomes: readonly Outcome[],
  call: string,
): { ok: boolean; output: string } {
  return inOracle(`
    begin
      outcomes = ${JSON.stringify(outcomes)}
      calls = []
      OracleGate.define_singleton_method(:capture_command) do |args, chdir: nil, env: {}|
        step = outcomes[calls.length] or raise "ran out of stubbed outcomes for #{args.inspect}"
        calls << args
        case step
        when "ok"
          status = Class.new { def success? = true }.new
          ["stdout", "", status]
        when "missing"
          raise OracleGate::Error, "#{args.first} is required but could not be executed (No such file or directory)"
        when "broken"
          raise "boom: #{args.first} exists but is broken"
        end
      end
      run_result = begin
        { "returned" => (${call}) }
      rescue => e
        { "raised" => "#{e.class}: #{e.message}" }
      end
      run_result.merge("calls" => calls)
    end
  `);
}

describe("run_generator! tries a Ruby on PATH before mise", () => {
  it("never reaches for mise when bundle exec ruby succeeds directly", () => {
    const r = withStubbedCommand(
      ["ok"],
      'OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain('["bundle", "exec", "ruby", "/tmp/script.rb"]');
    expect(r.output).not.toContain("mise");
  });

  it("falls back to mise only when bundle itself could not be executed", () => {
    const r = withStubbedCommand(
      ["missing", "ok"],
      'OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain('["bundle", "exec", "ruby", "/tmp/script.rb"]');
    expect(r.output).toContain('["mise", "x", "--", "bundle", "exec", "ruby", "/tmp/script.rb"]');
  });

  it("does not guess at mise for a failure that is not a missing executable", () => {
    const r = withStubbedCommand(
      ["broken"],
      'OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain("raised");
    expect(r.output).toContain("boom: bundle exists but is broken");
    expect(r.output).not.toContain("mise");
  });

  it("names both attempts when neither bundle nor mise can be executed", () => {
    const r = withStubbedCommand(
      ["missing", "missing"],
      'OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain("raised");
    expect(r.output).toContain("bundle");
    expect(r.output).toContain("mise");
  });
});

describe("assert_frozen_bundle_usable! tries a Ruby on PATH before mise", () => {
  it("never reaches for mise when the direct probe succeeds", () => {
    const r = withStubbedCommand(
      ["ok"],
      'OracleGate.assert_frozen_bundle_usable!("/gem", chdir: "/tmp")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain('["bundle", "exec", "ruby", "-e", ""]');
    expect(r.output).not.toContain("mise");
  });

  it("falls back to mise only when bundle itself could not be executed", () => {
    const r = withStubbedCommand(
      ["missing", "ok"],
      'OracleGate.assert_frozen_bundle_usable!("/gem", chdir: "/tmp")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain('["mise", "x", "--", "bundle", "exec", "ruby", "-e", ""]');
  });
  it("names a missing working directory instead of blaming bundler", () => {
    // Both a missing binary and a missing chdir surface as `Errno::ENOENT`, so
    // "the rescue fired" never meant "bundle is absent". Measured:
    // `Open3.capture3({}, "true", chdir: "/nope")` raises
    // `No such file or directory - /nope`. Falling back to mise there would
    // report that neither bundle nor mise is on PATH — the wrong diagnosis, of
    // exactly the kind this file exists to stop making.
    const r = withStubbedCommand(
      ["ok"],
      'OracleGate.run_generator!("/x/script.rb", [], chdir: "/definitely-not-a-directory-xyz", gem_dir: "/gem")',
    );
    // `withStubbedCommand` catches inside the harness, so `ok` stays true and
    // the outcome is in the output — same as the sibling tests above.
    expect(r.output).toContain("raised");
    expect(r.output).toContain("/definitely-not-a-directory-xyz");
    expect(r.output).toContain("does not exist");
    expect(r.output).not.toContain("not on PATH");
    // and it never got as far as trying anything
    expect(r.output).toContain('"calls" => []');
  });
});
