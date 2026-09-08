/**
 * Shared Ruby harness for the class-B specs that exercise `scripts/*.rb`.
 *
 * These specs call the Ruby functions directly rather than driving the CLI, so
 * they need no gem checkout and no bundle. Extracted from
 * `gate-oracle-differential.spec.ts` when a second spec needed the same
 * machinery.
 */

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ORACLE = join(REPO_ROOT, "scripts", "gate-oracle.rb");
export const RENDER_FIXTURE_PROVENANCE = join(REPO_ROOT, "scripts", "render-fixture-provenance.rb");

/**
 * Runs a Ruby snippet with the explicitly provisioned Ruby interpreter.
 *
 * The dedicated class-B CI job puts pinned Ruby 4.0.1 on PATH, so trying plain
 * `ruby` first mirrors CI. `mise x -- ruby` remains a local fallback for
 * machines where Ruby is available only through the version manager.
 */
export function runRuby(source: string): { stdout: string; status: number | null } {
  const direct = spawnSync("ruby", ["-e", source], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 60_000,
  });
  if (direct.error === undefined) return { stdout: direct.stdout ?? "", status: direct.status };
  // Only a missing executable is a reason to try the version manager. A Ruby
  // that exists and then times out or cannot be executed is a real failure,
  // and reporting it as "no ruby available" sends the reader looking for a
  // Ruby they already have.
  if (!isMissingExecutable(direct.error)) throw direct.error;

  const viaMise = spawnSync("mise", ["x", "--", "ruby", "-e", source], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 60_000,
  });
  if (viaMise.error !== undefined) {
    // Neither works: fail loudly rather than skip. A gate that quietly does
    // not run is the failure mode this whole file exists to prevent. Say which
    // failure it was — only a missing `mise` means neither Ruby is installed.
    if (!isMissingExecutable(viaMise.error)) throw viaMise.error;
    throw new Error("no ruby available: tried `ruby` and `mise x -- ruby`");
  }
  return { stdout: viaMise.stdout ?? "", status: viaMise.status };
}

/** `spawnSync` reports a missing binary as `ENOENT`; everything else ran. */
function isMissingExecutable(error: Error): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function oracleResult(result: { stdout: string; status: number | null }): {
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
export function inOracle(expression: string): { ok: boolean; output: string } {
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
