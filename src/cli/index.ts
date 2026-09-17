#!/usr/bin/env node
/**
 * The `plurimath` bin entry (package.json `bin`). Wires `run` (`./run.ts`)
 * to the real process: real stdin, real filesystem, real stdout/stderr, and
 * the process exit code.
 */

import { readFileSync } from "node:fs";
import { run } from "./run";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const exitCode = await run(process.argv.slice(2), {
  readStdin,
  readFile: (path) => readFileSync(path, "utf8"),
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
});

process.exitCode = exitCode;
