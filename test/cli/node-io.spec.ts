/**
 * Real-process I/O (`src/cli/node-io.ts`): strict UTF-8 decoding, since
 * `Buffer#toString("utf8")` would otherwise silently replace invalid byte
 * sequences with U+FFFD instead of failing loudly.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { readFile, readStdin } from "../../src/cli/node-io";

describe("readStdin", () => {
  const originalStdin = process.stdin;

  afterEach(() => {
    Object.defineProperty(process, "stdin", { value: originalStdin, configurable: true });
  });

  function stubStdin(chunks: Buffer[]) {
    const stream = new PassThrough();
    for (const chunk of chunks) stream.write(chunk);
    stream.end();
    Object.defineProperty(process, "stdin", { value: stream, configurable: true });
  }

  it("decodes valid UTF-8", async () => {
    stubStdin([Buffer.from("frac(1)(2)", "utf8")]);
    await expect(readStdin()).resolves.toBe("frac(1)(2)");
  });

  it("strips a leading BOM rather than preserving it as data", async () => {
    stubStdin([Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("1+2", "utf8")])]);
    await expect(readStdin()).resolves.toBe("1+2");
  });

  it("rejects invalid UTF-8 instead of silently replacing it", async () => {
    stubStdin([Buffer.from([0xff])]);
    await expect(readStdin()).rejects.toThrow(/utf-8/i);
  });
});

describe("readFile", () => {
  function tempFile(bytes: Buffer): string {
    const dir = mkdtempSync(join(tmpdir(), "plurimath-cli-test-"));
    const path = join(dir, "input.txt");
    writeFileSync(path, bytes);
    return path;
  }

  it("decodes a valid UTF-8 file", () => {
    const path = tempFile(Buffer.from("frac(1)(2)", "utf8"));
    expect(readFile(path)).toBe("frac(1)(2)");
  });

  it("rejects a file with invalid UTF-8 instead of silently replacing it", () => {
    const path = tempFile(Buffer.from([0xff]));
    expect(() => readFile(path)).toThrow(/utf-8/i);
  });
});
