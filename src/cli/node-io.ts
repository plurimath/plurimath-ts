/**
 * Real-process I/O for the `plurimath` bin entry (`./index.ts`): stdin,
 * filesystem, strict UTF-8 decoding. Split out from `index.ts` so this
 * logic is importable by tests without executing the bin entry's top-level
 * `run()` call.
 */

import { readFileSync } from "node:fs";
import type { CliIo } from "./run";

/**
 * `Buffer#toString("utf8")` silently replaces invalid byte sequences with
 * U+FFFD rather than rejecting them, so malformed input would otherwise
 * parse as garbage instead of failing loudly. `fatal: true` throws instead;
 * `ignoreBOM`'s default (false) also strips a leading BOM rather than
 * preserving it as formula data.
 */
const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return strictUtf8Decoder.decode(Buffer.concat(chunks));
}

export function readFile(path: string): string {
  return strictUtf8Decoder.decode(readFileSync(path));
}

export const nodeIo: CliIo = {
  readStdin,
  readFile,
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
};
