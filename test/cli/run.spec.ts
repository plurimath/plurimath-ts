/**
 * `run` orchestration tests (`src/cli/run.ts`) — argv in, mocked I/O, exit
 * code and written text out. Exercises real conversion, not a stub.
 */

import { describe, expect, it, vi } from "vitest";
import { EXIT_OK, EXIT_RUNTIME_ERROR, EXIT_USAGE_ERROR, run } from "../../src/cli/run";

function fakeIo(opts: { stdin?: string; files?: Record<string, string> } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      readStdin: vi.fn(async () => opts.stdin ?? ""),
      readFile: vi.fn((path: string) => {
        const content = opts.files?.[path];
        if (content === undefined) throw new Error(`no such file: ${path}`);
        return content;
      }),
      writeOut: vi.fn((text: string) => out.push(text)),
      writeErr: vi.fn((text: string) => err.push(text)),
    },
    out,
    err,
  };
}

describe("run", () => {
  it("prints usage and exits 0 with no arguments", async () => {
    const { io, out } = fakeIo();
    const code = await run([], io);
    expect(code).toBe(EXIT_OK);
    expect(out.join("")).toMatch(/Usage: plurimath convert/);
  });

  it("converts from stdin when no file is given", async () => {
    const { io, out } = fakeIo({ stdin: "frac(1)(2)" });
    const code = await run(["convert", "--from", "asciimath", "--to", "latex"], io);
    expect(code).toBe(EXIT_OK);
    expect(out.join("")).toBe("\\frac{1}{2}\n");
    expect(io.readStdin).toHaveBeenCalledOnce();
    expect(io.readFile).not.toHaveBeenCalled();
  });

  it("converts from a file when one is given", async () => {
    const { io, out } = fakeIo({ files: { "formula.txt": "frac(1)(2)" } });
    const code = await run(["convert", "--from", "asciimath", "--to", "latex", "formula.txt"], io);
    expect(code).toBe(EXIT_OK);
    expect(out.join("")).toBe("\\frac{1}{2}\n");
    expect(io.readFile).toHaveBeenCalledWith("formula.txt");
    expect(io.readStdin).not.toHaveBeenCalled();
  });

  it("does not double up a trailing newline the renderer already produced", async () => {
    const { io, out } = fakeIo({ stdin: "frac(1)(2)" });
    // toMathml() output does not end in "\n", so run() adds exactly one.
    const code = await run(["convert", "--from", "asciimath", "--to", "mathml"], io);
    expect(code).toBe(EXIT_OK);
    expect(out.join("").endsWith("\n")).toBe(true);
    expect(out.join("").endsWith("\n\n")).toBe(false);
  });

  it("exits 2 with a usage error for a bad argument combination, and does not touch I/O", async () => {
    const { io, err } = fakeIo();
    const code = await run(["convert", "--from", "bogus", "--to", "latex"], io);
    expect(code).toBe(EXIT_USAGE_ERROR);
    expect(err.join("")).toMatch(/Unknown input format "bogus"/);
    expect(io.readStdin).not.toHaveBeenCalled();
    expect(io.readFile).not.toHaveBeenCalled();
  });

  it("exits 1 and reports a missing file without a stack trace leaking through", async () => {
    const { io, err } = fakeIo();
    const code = await run(["convert", "--from", "asciimath", "--to", "latex", "missing.txt"], io);
    expect(code).toBe(EXIT_RUNTIME_ERROR);
    expect(err.join("")).toMatch(/could not read input/);
  });

  it("exits 1 and reports the PlurimathError code for malformed input", async () => {
    const { io, err } = fakeIo({ stdin: "\\frac{1}" });
    const code = await run(["convert", "--from", "latex", "--to", "asciimath"], io);
    expect(code).toBe(EXIT_RUNTIME_ERROR);
    expect(err.join("")).toMatch(/plurimath: \[.+\]/);
  });
});
