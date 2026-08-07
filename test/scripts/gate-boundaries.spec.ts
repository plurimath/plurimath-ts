/**
 * Regression proof for the boundaries gate (scripts/gate-boundaries.mjs) on
 * the node-major render layout (ARCHITECTURE.md §3 rule 8). A gate is only as
 * good as the failures it can produce, so each violation class the layout
 * decision named is demonstrated actually failing: a complete minimal fixture
 * passes as the control, and each single-mutation variant fails naming the
 * rule (or inventory check) that caught it. The fixtures carry a byte-copy of
 * the real .dependency-cruiser.cjs, so what is proven is the shipped rule
 * text, not a restatement of it.
 *
 * These are gate tests, not renderer tests: no renderer behaviour is
 * exercised here, and the renderer suites do not overlap this file.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = join(REPO_ROOT, "scripts", "gate-boundaries.mjs");
const CONFIG = readFileSync(join(REPO_ROOT, ".dependency-cruiser.cjs"), "utf8");

/**
 * Three kinds and two formats keep every rule reachable: `fontStyle` proves
 * the camelCase-key -> kebab-case-directory mapping, and the second format
 * gives the cross-format mutations a real file to reach for.
 */
const KINDS = ["sqrt", "frac", "fontStyle"];
const FORMATS = ["asciimath", "latex"];

const fixtureRoots: string[] = [];
afterAll(() => {
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
});

/** A minimal complete node-major tree that the gate must pass unmutated. */
function writeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "plurimath-gate-fixture-"));
  fixtureRoots.push(root);
  const write = (relative: string, content: string) => {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  write(".dependency-cruiser.cjs", CONFIG);
  write("tsconfig.json", `${JSON.stringify({ compilerOptions: {} })}\n`);
  write("src/core/index.ts", "export const core = 1;\n");
  for (const format of FORMATS) {
    write(`src/generated/${format}/data.ts`, `export const data = "${format}";\n`);
    const entries = KINDS.map((kind) => `  ${kind}: 1,`).join("\n");
    write(
      `src/formats/${format}/render.ts`,
      `const RENDERERS = {\n${entries}\n};\nexport const table = RENDERERS;\n`,
    );
    for (const kind of KINDS) {
      const dir = kind.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      write(`src/render/${dir}/${format}.ts`, `export const render = "${dir}/${format}";\n`);
    }
  }
  return root;
}

function runGate(root: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [GATE, root], { encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe("the boundaries gate on the node-major render layout", () => {
  it("passes the complete, boundary-clean fixture (the control)", () => {
    const { status, output } = runGate(writeFixture());
    expect(output).toContain("inventory: 3 kinds x 2 format(s), complete");
    expect(status).toBe(0);
  });

  it("fails when a kind file imports another format's kind file", () => {
    const root = writeFixture();
    writeFileSync(
      join(root, "src/render/sqrt/asciimath.ts"),
      'import "./latex";\nexport const render = "sqrt/asciimath";\n',
    );
    const { status, output } = runGate(root);
    expect(status).toBe(1);
    expect(output).toContain("render-kind-file-imports-allowed-set-only");
  });

  it("fails when a kind file imports another format's generated data", () => {
    const root = writeFixture();
    writeFileSync(
      join(root, "src/render/sqrt/asciimath.ts"),
      'import "../../generated/latex/data";\nexport const render = "sqrt/asciimath";\n',
    );
    const { status, output } = runGate(root);
    expect(status).toBe(1);
    expect(output).toContain("render-kind-file-imports-own-generated-data-only");
  });

  it("fails when a format root imports another format's generated data", () => {
    const root = writeFixture();
    const renderTs = join(root, "src/formats/asciimath/render.ts");
    writeFileSync(
      renderTs,
      `import "../../generated/latex/data";\n${readFileSync(renderTs, "utf8")}`,
    );
    const { status, output } = runGate(root);
    expect(status).toBe(1);
    expect(output).toContain("format-imports-own-generated-data-only");
  });

  it("fails when core imports render", () => {
    const root = writeFixture();
    writeFileSync(
      join(root, "src/core/index.ts"),
      'import "../render/sqrt/asciimath";\nexport const core = 1;\n',
    );
    const { status, output } = runGate(root);
    expect(status).toBe(1);
    expect(output).toContain("only-formats-reach-render");
  });

  it("fails when a kind's format file is missing (incomplete inventory)", () => {
    const root = writeFixture();
    rmSync(join(root, "src/render/sqrt/asciimath.ts"));
    const { status, output } = runGate(root);
    expect(status).toBe(1);
    expect(output).toContain("missing src/render/sqrt/asciimath.ts");
  });

  it("fails when a directory impersonates a render file (Copilot's catch)", () => {
    const root = writeFixture();
    rmSync(join(root, "src/render/sqrt/asciimath.ts"));
    mkdirSync(join(root, "src/render/sqrt/asciimath.ts"));
    const { status, output } = runGate(root);
    expect(status).toBe(1);
    expect(output).toContain("src/render/sqrt/asciimath.ts is not a regular file");
    expect(output).toContain("missing src/render/sqrt/asciimath.ts");
  });

  it("fails on a stray non-kind file under src/render", () => {
    const root = writeFixture();
    writeFileSync(join(root, "src/render/shared.ts"), "export const stray = 1;\n");
    const { status, output } = runGate(root);
    expect(status).toBe(1);
    expect(output).toContain("src/render/shared.ts is not a kind directory");
  });

  it("fails when src/render holds no render files at all", () => {
    const root = writeFixture();
    rmSync(join(root, "src/render"), { recursive: true });
    const { status, output } = runGate(root);
    expect(status).toBe(1);
    expect(output).toContain("src/render does not exist");
  });
});
