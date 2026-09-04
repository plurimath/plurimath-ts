/**
 * Regression proof for the differential runner's comparator
 * (`scripts/gate-oracle.rb differential`).
 *
 * A differential runner that cannot FAIL is worse than no runner: it reports
 * parity it never checked. This one shipped able to do exactly that, and an
 * adversarial review found three separate ways:
 *
 *  1. **Malformed results were a silent pass.** The runner checked only that
 *     each half returned the right NUMBER of results. A half returning one
 *     `{}` per input produces valid JSON with the right count, and then every
 *     `result["ok"]` is nil — `nil != nil` is false so the accept/reject
 *     branch never fires, and `next unless gem["ok"]` skips the input. The run
 *     compared nothing and reported zero divergences.
 *  2. **A gem DEFECT was scored as a refusal.** A blanket `rescue
 *     StandardError` turned any `NoMethodError` or renderer crash into
 *     `{"ok" => false}`, which then agreed with a port refusal and counted as
 *     parity — two unrelated failures reported as a match.
 *  3. **Only the first differing format was reported**, though the command's
 *     own description says it reports every divergence.
 *
 * So this file asserts the comparator's failures, not its successes. It loads
 * the module body directly (the file's last lines are CLI dispatch) in Ruby
 * subprocesses and calls the comparison functions with hand-built results.
 * It needs no gem checkout, but it is a class-B test because Ruby is explicit.
 */

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORACLE = join(REPO_ROOT, "scripts", "gate-oracle.rb");
const RENDER_FIXTURE_PROVENANCE = join(REPO_ROOT, "scripts", "render-fixture-provenance.rb");

/**
 * Runs a Ruby snippet with the explicitly provisioned Ruby interpreter.
 *
 * The dedicated class-B CI job puts pinned Ruby 4.0.1 on PATH, so trying plain
 * `ruby` first mirrors CI. `mise x -- ruby` remains a local fallback for
 * machines where Ruby is available only through the version manager.
 */
function runRuby(source: string): { stdout: string; status: number | null } {
  const direct = spawnSync("ruby", ["-e", source], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 60_000,
  });
  if (direct.error === undefined) return { stdout: direct.stdout ?? "", status: direct.status };

  const viaMise = spawnSync("mise", ["x", "--", "ruby", "-e", source], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 60_000,
  });
  if (viaMise.error !== undefined) {
    // Neither works: fail loudly rather than skip. A gate that quietly does
    // not run is the failure mode this whole file exists to prevent.
    throw new Error("no ruby available: tried `ruby` and `mise x -- ruby`");
  }
  return { stdout: viaMise.stdout ?? "", status: viaMise.status };
}

function oracleResult(result: { stdout: string; status: number | null }): {
  ok: boolean;
  output: string;
} {
  if (result.status !== 0) {
    throw new Error(
      `Ruby harness exited ${result.status ?? "without a status"}: ${result.stdout.slice(-400)}`,
    );
  }
  const line = result.stdout.trim().split("\n").pop() ?? "";
  const parsed = JSON.parse(line) as { ok: boolean; value: string };
  return { ok: parsed.ok, output: parsed.value };
}

/**
 * Runs one expression against the module body and returns what it printed.
 *
 * `gate-oracle.rb` ends in a `begin`/`rescue` CLI dispatch that would print
 * usage and exit, so the body is loaded up to the module's closing `end`.
 */
function inOracle(expression: string): { ok: boolean; output: string } {
  const harness = `
    require "json"
    lines = File.read(${JSON.stringify(ORACLE)}).lines
    stop = lines.each_with_index.find { |line, i| line == "end\\n" && i > 100 }
    abort("could not find the module end") unless stop
    eval(lines[0..stop[1]].join)
    begin
      puts JSON.generate({ "ok" => true, "value" => (${expression}).inspect })
    rescue => e
      puts JSON.generate({ "ok" => false, "value" => "#{e.class}: #{e.message.lines.first.strip}" })
    end
  `;
  return oracleResult(runRuby(harness));
}

const GOOD = '{"ok"=>true,"asciimath"=>"a","latex"=>"b","mathml"=>"c","unicodemath"=>"d"}';

describe("the Ruby unit harness", () => {
  it("rejects plausible JSON printed by a failed subprocess", () => {
    expect(() => oracleResult({ stdout: '{"ok":true,"value":"1"}\n', status: 7 })).toThrow(
      /Ruby harness exited 7/,
    );
  });
});

describe("the shape guard refuses what the count check could not see", () => {
  it("rejects one empty object per input, which used to pass silently", () => {
    const r = inOracle('OracleGate.assert_differential_shape!([{}], "gem", ["x"])');
    expect(r.ok).toBe(false);
    expect(r.output).toContain('has no boolean "ok"');
  });

  it("rejects an accepted result whose format field is not a string", () => {
    const r = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>true,"asciimath"=>"a","latex"=>nil,"mathml"=>"c","unicodemath"=>"d"}], "gem", ["x"])',
    );
    expect(r.ok).toBe(false);
    expect(r.output).toContain("not a string");
  });

  it("still rejects the wrong number of results", () => {
    const r = inOracle('OracleGate.assert_differential_shape!([], "gem", ["x"])');
    expect(r.ok).toBe(false);
    expect(r.output).toContain("0 results for 1 inputs");
  });

  it("accepts a well-formed result, so the guard is not simply always failing", () => {
    const r = inOracle(`OracleGate.assert_differential_shape!([${GOOD}], "gem", ["x"]).length`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe("1");
  });

  it("rejects a port refusal without one of the typed public error codes", () => {
    const missing = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>false}], "port", ["x"])',
    );
    const unknown = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>false,"code"=>"TYPE_ERROR"}], "port", ["x"])',
    );
    expect(missing.ok).toBe(false);
    expect(missing.output).toContain("must contain only a typed code");
    expect(unknown.ok).toBe(false);
    expect(unknown.output).toContain("must contain only a typed code");
  });

  it("accepts the distinct gem-refusal and gem-defect envelopes", () => {
    const refusal = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>false}], "gem", ["x"]).length',
    );
    const defect = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>false,"defect"=>"NoMethodError"}], "gem", ["x"]).length',
    );
    const port = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>false,"code"=>"PARSE_ERROR"}], "port", ["x"]).length',
    );
    expect(refusal).toEqual({ ok: true, output: "1" });
    expect(defect).toEqual({ ok: true, output: "1" });
    expect(port).toEqual({ ok: true, output: "1" });
  });

  it("rejects malformed gem defects and extra accepted-result fields", () => {
    const defect = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>false,"defect"=>""}], "gem", ["x"])',
    );
    const accepted = inOracle(
      `OracleGate.assert_differential_shape!([${GOOD}.merge("code"=>"PARSE_ERROR")], "port", ["x"])`,
    );
    expect(defect.ok).toBe(false);
    expect(defect.output).toContain("invalid defect");
    expect(accepted.ok).toBe(false);
    expect(accepted.output).toContain("accepted result");
  });

  it("rejects result envelopes under the wrong producer label", () => {
    const gemWithCode = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>false,"code"=>"PARSE_ERROR"}], "gem", ["x"])',
    );
    const portWithDefect = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>false,"defect"=>"NoMethodError"}], "port", ["x"])',
    );
    const unknownLabel = inOracle(
      `OracleGate.assert_differential_shape!([${GOOD}], "other", ["x"])`,
    );
    expect(gemWithCode.ok).toBe(false);
    expect(gemWithCode.output).toContain("invalid keys");
    expect(portWithDefect.ok).toBe(false);
    expect(portWithDefect.output).toContain("must contain only a typed code");
    expect(unknownLabel.ok).toBe(false);
    expect(unknownLabel.output).toContain("unknown differential result label");
  });
});

describe("fixture-manifest generating-commit normalization", () => {
  it("normalizes only the direct generator.repository.commit path", () => {
    const direct = "a".repeat(40);
    const nested = "b".repeat(40);
    const corpus = "c".repeat(40);
    const oracle = "d".repeat(40);
    const nestedGenerator = "e".repeat(40);
    const yaml = [
      "generator:",
      "  repository:",
      `    commit: ${direct}`,
      "  metadata:",
      "    repository:",
      `      commit: ${nested}`,
      "corpus:",
      "  repository:",
      `    commit: ${corpus}`,
      "oracle:",
      `  commit: ${oracle}`,
      "metadata:",
      "  generator:",
      "    repository:",
      `      commit: ${nestedGenerator}`,
      "",
    ].join("\n");
    const expression = `Dir.mktmpdir do |dir|
      path = File.join(dir, "fixture.manifest.yaml")
      File.binwrite(path, ${JSON.stringify(yaml)})
      OracleGate.normalize_generating_commit_file!(path)
      File.binread(path)
    end`;

    const result = inOracle(expression);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("commit: <normalized>");
    expect(result.output).not.toContain(direct);
    expect(result.output).toContain(nested);
    expect(result.output).toContain(corpus);
    expect(result.output).toContain(oracle);
    expect(result.output).toContain(nestedGenerator);
  });
});

describe("renderer fixture managed outputs", () => {
  function managedOutputPaths(payloadPath: string): { ok: boolean; output: string } {
    const expression = `
      source = File.read(${JSON.stringify(RENDER_FIXTURE_PROVENANCE)})
      source = source.lines.reject { |line| line.include?('require_relative "generate-corpus"') }.join
      eval(source)
      RenderFixtureProvenance.managed_output_paths(${JSON.stringify(payloadPath)}, repo_root: "/repo")
    `;
    return inOracle(expression);
  }

  it("treats both canonical fixture pairs as one generated family", () => {
    const result = managedOutputPaths("/repo/test/formats/html/parity-fixtures.json");

    expect(result.ok).toBe(true);
    expect(result.output).toBe(
      '["/repo/test/formats/html/degenerate-fixtures.json", ' +
        '"/repo/test/formats/html/degenerate-fixtures.manifest.yaml", ' +
        '"/repo/test/formats/html/parity-fixtures.json", ' +
        '"/repo/test/formats/html/parity-fixtures.manifest.yaml"]',
    );
  });

  it("does not widen a custom output into the canonical family", () => {
    const result = managedOutputPaths("/tmp/probe.json");

    expect(result.ok).toBe(true);
    expect(result.output).toBe('["/tmp/probe.json", "/tmp/probe.manifest.yaml"]');
  });

  it("does not widen a canonical basename outside the managed directory", () => {
    const result = managedOutputPaths("/tmp/parity-fixtures.json");

    expect(result.ok).toBe(true);
    expect(result.output).toBe(
      '["/tmp/parity-fixtures.json", "/tmp/parity-fixtures.manifest.yaml"]',
    );
  });
});

describe("clean snapshot git metadata", () => {
  it("canonicalizes a relative gitdir before copying it elsewhere", () => {
    const expression = `Dir.mktmpdir do |dir|
      repository = File.join(dir, "repository")
      source = File.join(dir, "nested", "source")
      destination = File.join(dir, "copied", "deep", "destination")
      FileUtils.mkdir_p([repository, source, destination])
      system("git", "init", "-q", repository) || raise("git init failed")
      File.write(File.join(source, ".git"), "gitdir: ../../repository/.git\\n")
      OracleGate.copy_git_entry!(source, destination)
      copied = File.read(File.join(destination, ".git")).strip
      resolved, stderr, status = Open3.capture3(
        "git", "-C", destination, "rev-parse", "--absolute-git-dir"
      )
      raise(stderr) unless status.success?
      [copied, resolved.strip]
    end`;

    const result = inOracle(expression);
    expect(result.ok).toBe(true);
    const match = result.output.match(/^\["gitdir: (.+)", "(.+)"\]$/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(match?.[2]);
  });
});

describe("the comparator reports what it used to hide", () => {
  it("reports every differing format, not just the first", () => {
    const r = inOracle(
      `OracleGate.differential_divergences(["x"], [${GOOD}], ` +
        '[{"ok"=>true,"asciimath"=>"X","latex"=>"Y","mathml"=>"Z","unicodemath"=>"W"}]).map { |d| d["format"] }',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toBe('["asciimath", "latex", "mathml", "unicodemath"]');
  });

  it("never scores a gem defect as agreement with a port refusal", () => {
    const r = inOracle(
      'OracleGate.differential_divergences(["x"], [{"ok"=>false,"defect"=>"NoMethodError"}], ' +
        '[{"ok"=>false,"code"=>"RENDER_ERROR"}]).map { |d| d["format"] }',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toBe('["gem-defect"]');
  });

  it("still scores a genuine mutual refusal as parity", () => {
    // The control. Without this, every assertion above is satisfied by a
    // comparator that simply calls everything a divergence.
    const r = inOracle(
      'OracleGate.differential_divergences(["x"], [{"ok"=>false}], ' +
        '[{"ok"=>false,"code"=>"PARSE_ERROR"}]).length',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toBe("0");
  });

  it("still scores genuine agreement as parity", () => {
    const r = inOracle(`OracleGate.differential_divergences(["x"], [${GOOD}], [${GOOD}]).length`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe("0");
  });

  it("reports an accept/reject split", () => {
    const r = inOracle(
      `OracleGate.differential_divergences(["x"], [${GOOD}], ` +
        `[{"ok"=>false,"code"=>"PARSE_ERROR"}]).map { |d| d["format"] }`,
    );
    expect(r.ok).toBe(true);
    expect(r.output).toBe('["accept/reject"]');
  });
});

describe("the timeout bounds the whole exchange, not just the wait", () => {
  /**
   * The first version of this timeout joined the process thread with a
   * deadline — but wrote stdin INLINE, before that join. A child that stops
   * reading fills the pipe, `stdin.write` blocks, and execution never reaches
   * the deadline at all: the bound covered everything except the most likely
   * place to hang. It also killed only the direct pid, so a `bundle exec ruby`
   * child could outlive the kill and hold the pipes open past the deadline the
   * runner had just announced.
   *
   * Measured before the fix: an external `timeout 4s` had to kill the probe
   * (exit 124). After: the runner raises on its own deadline.
   */
  it("raises on its own deadline when the child never reads stdin", () => {
    const harness = `
      lines = File.read(${JSON.stringify(ORACLE)}).lines
      stop = lines.each_with_index.find { |l, i| l == "end\\n" && i > 100 }
      eval(lines[0..stop[1]].join)
      OracleGate.send(:remove_const, :DIFFERENTIAL_TIMEOUT_SECONDS)
      OracleGate.const_set(:DIFFERENTIAL_TIMEOUT_SECONDS, 3)
      started = Time.now
      begin
        OracleGate.capture_bounded({}, "ruby", "-e", "sleep 600",
          stdin_data: "x" * (4 * 1024 * 1024), chdir: Dir.pwd, label: "probe")
        puts "NO_TIMEOUT"
      rescue OracleGate::Error => e
        puts "RAISED #{(Time.now - started).round}"
      end
    `;
    const result = runRuby(harness);
    const line = result.stdout.trim().split("\n").pop() ?? "";
    // Raised by the runner itself, well inside the harness's own 60s ceiling —
    // if the deadlock were back, spawnSync would kill it instead.
    expect(line.startsWith("RAISED")).toBe(true);
  });
});
