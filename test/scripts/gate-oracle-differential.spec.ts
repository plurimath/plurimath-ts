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
 * the module body directly (the file's last lines are CLI dispatch) and calls
 * the comparison functions with hand-built results — no gem checkout, no
 * subprocesses, so it stays a class-A test.
 */

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORACLE = join(REPO_ROOT, "scripts", "gate-oracle.rb");

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
  const result = spawnSync("mise", ["x", "--", "ruby", "-e", harness], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  const line = result.stdout.trim().split("\n").pop() ?? "";
  const parsed = JSON.parse(line) as { ok: boolean; value: string };
  return { ok: parsed.ok, output: parsed.value };
}

const GOOD = '{"ok"=>true,"asciimath"=>"a","latex"=>"b","mathml"=>"c"}';

describe("the shape guard refuses what the count check could not see", () => {
  it("rejects one empty object per input, which used to pass silently", () => {
    const r = inOracle('OracleGate.assert_differential_shape!([{}], "gem", ["x"])');
    expect(r.ok).toBe(false);
    expect(r.output).toContain('has no boolean "ok"');
  });

  it("rejects an accepted result whose format field is not a string", () => {
    const r = inOracle(
      'OracleGate.assert_differential_shape!([{"ok"=>true,"asciimath"=>"a","latex"=>nil,"mathml"=>"c"}], "gem", ["x"])',
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
});

describe("the comparator reports what it used to hide", () => {
  it("reports every differing format, not just the first", () => {
    const r = inOracle(
      `OracleGate.differential_divergences(["x"], [${GOOD}], ` +
        '[{"ok"=>true,"asciimath"=>"X","latex"=>"Y","mathml"=>"Z"}]).map { |d| d["format"] }',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toBe('["asciimath", "latex", "mathml"]');
  });

  it("never scores a gem defect as agreement with a port refusal", () => {
    const r = inOracle(
      'OracleGate.differential_divergences(["x"], [{"ok"=>false,"defect"=>"NoMethodError"}], ' +
        '[{"ok"=>false}]).map { |d| d["format"] }',
    );
    expect(r.ok).toBe(true);
    expect(r.output).toBe('["gem-defect"]');
  });

  it("still scores a genuine mutual refusal as parity", () => {
    // The control. Without this, every assertion above is satisfied by a
    // comparator that simply calls everything a divergence.
    const r = inOracle(
      'OracleGate.differential_divergences(["x"], [{"ok"=>false}], [{"ok"=>false}]).length',
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
      `OracleGate.differential_divergences(["x"], [${GOOD}], [{"ok"=>false}]).map { |d| d["format"] }`,
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
    const result = spawnSync("mise", ["x", "--", "ruby", "-e", harness], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: 60_000,
    });
    const line = (result.stdout ?? "").trim().split("\n").pop() ?? "";
    // Raised by the runner itself, well inside the harness's own 60s ceiling —
    // if the deadlock were back, spawnSync would kill it instead.
    expect(line.startsWith("RAISED")).toBe(true);
  });
});
