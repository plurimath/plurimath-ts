/**
 * Regression proof that `scripts/gate-oracle.rb` names no version manager.
 *
 * `run_generator!` and `assert_frozen_bundle_usable!` used to hard-code
 * `mise x -- bundle exec ruby ...`, so a developer with a perfectly good Ruby
 * via rbenv, asdf, rvm, or the system — just not mise — got "mise is required
 * but could not be executed" instead of a working generator run. A first fix
 * tried `bundle exec ruby` and fell back to `mise x --`, which moved the
 * assumption down a level rather than removing it: mise was still the one
 * manager the file knew by name.
 *
 * Both now share `capture_generator_command`, which runs ONE command —
 * `bundle exec ruby` by default, or whatever `--ruby-command` /
 * `PLURIMATH_RUBY_COMMAND` says. There is no fallback chain to test, because
 * there is no chain: a machine whose Ruby needs a wrapper passes its own.
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

describe("run_generator! runs the configured Ruby command", () => {
  it("defaults to bundle exec ruby and names no version manager", () => {
    const r = withStubbedCommand(
      ["ok"],
      'OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain('["bundle", "exec", "ruby", "/tmp/script.rb"]');
    expect(r.output).not.toContain("mise");
  });

  it("runs whatever PLURIMATH_RUBY_COMMAND says, and only that", () => {
    const r = withStubbedCommand(
      ["ok"],
      `ENV["PLURIMATH_RUBY_COMMAND"] = "mise x -- bundle exec ruby"
       begin
         OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")
       ensure
         ENV.delete("PLURIMATH_RUBY_COMMAND")
       end`,
    );
    expect(r.ok).toBe(true);
    // One attempt, not a chain: exactly the configured command, nothing before it.
    expect(r.output).toContain('["mise", "x", "--", "bundle", "exec", "ruby", "/tmp/script.rb"]');
    expect(r.output).not.toContain('["bundle", "exec", "ruby", "/tmp/script.rb"]');
  });

  it("splits the configured command the way a shell would", () => {
    const r = withStubbedCommand(
      ["ok"],
      `ENV["PLURIMATH_RUBY_COMMAND"] = "docker run --rm -v /x:/x img bundle exec ruby"
       begin
         OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")
       ensure
         ENV.delete("PLURIMATH_RUBY_COMMAND")
       end`,
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain('"docker", "run", "--rm"');
    expect(r.output).toContain('"img", "bundle", "exec", "ruby", "/tmp/script.rb"');
  });

  it("does not swallow a failure that is not a missing executable", () => {
    const r = withStubbedCommand(
      ["broken"],
      'OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain("raised");
    expect(r.output).toContain("boom: bundle exists but is broken");
    expect(r.output).not.toContain("mise");
  });

  it("names the command it tried and how to change it", () => {
    const r = withStubbedCommand(
      ["missing"],
      'OracleGate.run_generator!("/tmp/script.rb", [], chdir: "/tmp", gem_dir: "/gem")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain("raised");
    // The remedy has to be actionable without reading the source: the command
    // that was tried, and the two ways to change it.
    expect(r.output).toContain("bundle exec ruby");
    expect(r.output).toContain("--ruby-command");
    expect(r.output).toContain("PLURIMATH_RUBY_COMMAND");
  });
});

describe("assert_frozen_bundle_usable! runs the configured Ruby command", () => {
  it("defaults to bundle exec ruby and names no version manager", () => {
    const r = withStubbedCommand(
      ["ok"],
      'OracleGate.assert_frozen_bundle_usable!("/gem", chdir: "/tmp")',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain('["bundle", "exec", "ruby", "-e", ""]');
    expect(r.output).not.toContain("mise");
  });

  it("probes through the configured command, not a fallback chain", () => {
    const r = withStubbedCommand(
      ["ok"],
      `ENV["PLURIMATH_RUBY_COMMAND"] = "mise x -- bundle exec ruby"
       begin
         OracleGate.assert_frozen_bundle_usable!("/gem", chdir: "/tmp")
       ensure
         ENV.delete("PLURIMATH_RUBY_COMMAND")
       end`,
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain('["mise", "x", "--", "bundle", "exec", "ruby", "-e", ""]');
    expect(r.output).not.toContain('["bundle", "exec", "ruby", "-e", ""]');
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
