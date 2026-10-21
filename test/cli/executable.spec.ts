/**
 * End-to-end subprocess tests for the built `plurimath` bin
 * (`dist/cli.mjs`, from `src/cli/index.ts` via `tsdown`).
 *
 * `test/cli/run.spec.ts` and `test/cli/node-io.spec.ts` exercise the CLI's
 * logic through injected I/O and direct function calls; neither ever spawns
 * the real executable, so a defect in the bin wiring itself (shebang,
 * `process.exitCode`, argv slicing, actual stdin/file I/O) could pass both
 * suites and still be broken for a real user. This spec runs `node
 * dist/cli.mjs` as a genuine child process instead.
 *
 * It assumes `pnpm build` has already produced `dist/cli.mjs` — there is no
 * build-then-test wiring elsewhere in this repo's `package.json` scripts, so
 * a fresh checkout that hasn't run `pnpm build` would otherwise fail here
 * confusingly. `describe.skipIf` reports a clear skip reason instead.
 */

import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI_PATH = join(REPO_ROOT, "dist", "cli.mjs");
const FIXTURE_PATH = join(REPO_ROOT, "test", "cli", "fixtures", "formula.txt");
const MATHML_FIXTURE_PATH = join(REPO_ROOT, "test", "cli", "fixtures", "fraction.mml");
const OMML_FIXTURE_PATH = join(REPO_ROOT, "test", "cli", "fixtures", "fraction.omml");
const OMML_INPUT =
  '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>x</m:t></m:r></m:oMath>';

function runCli(args: string[], stdin?: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    input: stdin ?? "",
    encoding: "utf8",
  });
}

describe.skipIf(!existsSync(CLI_PATH))("plurimath CLI executable (dist/cli.mjs)", () => {
  it("converts via stdin", () => {
    const result = runCli(["convert", "--from", "asciimath", "--to", "latex"], "frac(1)(2)");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("\\frac{1}{2}\n");
  });

  it("converts via a file argument", () => {
    const result = runCli(["convert", "--from", "asciimath", "--to", "latex", FIXTURE_PATH]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("\\frac{1}{2}\n");
  });

  it("converts MathML from a file", () => {
    const result = runCli(["convert", "--from", "mathml", "--to", "latex", MATHML_FIXTURE_PATH]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("\\frac{1}{2}\n");
    expect(result.stderr).toBe("");
  });

  it("converts OMML from stdin", () => {
    const result = runCli(["convert", "--from", "omml", "--to", "latex"], `${OMML_INPUT}\n`);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("\\text{x}\n");
    expect(result.stderr).toBe("");
  });

  it("converts OMML from a file", () => {
    const result = runCli(["convert", "--from", "omml", "--to", "latex", OMML_FIXTURE_PATH]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("\\frac{1}{2}\n");
    expect(result.stderr).toBe("");
  });

  it.each(["mathml", "omml"])("exits 1 on malformed %s stdin", (from) => {
    const result = runCli(["convert", "--from", from, "--to", "latex"], "<math");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^plurimath: \[PARSE_ERROR\]/);
  });

  it("exits 2 on an unknown format (usage error)", () => {
    const result = runCli(["convert", "--from", "bogus", "--to", "latex"], "");
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Unknown input format "bogus"/);
  });

  it("exits 1 on a missing file", () => {
    const result = runCli([
      "convert",
      "--from",
      "asciimath",
      "--to",
      "latex",
      join(REPO_ROOT, "test", "cli", "fixtures", "does-not-exist.txt"),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/could not read input/);
  });
});

if (!existsSync(CLI_PATH)) {
  console.warn(
    `Skipping test/cli/executable.spec.ts: ${CLI_PATH} does not exist. Run "pnpm build" first.`,
  );
}
