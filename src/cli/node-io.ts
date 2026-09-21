/**
 * Real-process I/O for the `plurimath` bin entry (`./index.ts`): stdin,
 * filesystem, strict UTF-8 decoding. Split out from `index.ts` so this
 * logic is importable by tests without executing the bin entry's top-level
 * `run()` call.
 */

import { readFileSync, statSync } from "node:fs";
import type { CliIo } from "./run";

/**
 * `Buffer#toString("utf8")` silently replaces invalid byte sequences with
 * U+FFFD rather than rejecting them, so malformed input would otherwise
 * parse as garbage instead of failing loudly. `fatal: true` throws instead;
 * `ignoreBOM`'s default (false) also strips a leading BOM rather than
 * preserving it as formula data.
 */
const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * A sanity ceiling, not a hard architectural constraint: this is a local CLI
 * reading one formula at a time, not a network service, so unbounded memory
 * use is not a security boundary here the way it would be for a server. The
 * limit exists so a mistakenly-piped multi-gigabyte file (e.g. `cat
 * video.mp4 | plurimath convert ...`) fails with a clear message instead of
 * exhausting memory silently. 50MB is generous for math markup — orders of
 * magnitude past any real formula — while still catching that mistake.
 */
export const DEFAULT_MAX_INPUT_BYTES = 50 * 1024 * 1024;

function tooLarge(maxBytes: number): Error {
  const mb = (maxBytes / (1024 * 1024)).toFixed(0);
  return new Error(`input exceeds the ${mb}mb limit`);
}

export async function readStdin(maxBytes: number = DEFAULT_MAX_INPUT_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) throw tooLarge(maxBytes);
    chunks.push(chunk as Buffer);
  }
  return strictUtf8Decoder.decode(Buffer.concat(chunks));
}

export function readFile(path: string, maxBytes: number = DEFAULT_MAX_INPUT_BYTES): string {
  const stats = statSync(path);
  if (stats.size > maxBytes) throw tooLarge(maxBytes);
  return strictUtf8Decoder.decode(readFileSync(path));
}

export const nodeIo: CliIo = {
  readStdin,
  readFile,
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
};
