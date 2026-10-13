/**
 * `HTML_SYMBOLS` and `HTML_SYMBOL_CLASS_INPUT` are built at module load from
 * smaller generated tables (`src/generated/html/symbols.ts`,
 * `src/formats/html/generated/transform-tables.ts`). The generators replay the
 * same derivation against the gem before emitting, and emit a sha256 of the
 * table they measured; these specs prove the TypeScript derivation reproduces
 * that table row for row.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  HTML_SYMBOL_CLASS_INPUT,
  HTML_SYMBOL_CLASS_INPUT_SHA256,
} from "../../src/formats/html/generated/transform-tables";
import { HTML_SYMBOLS, HTML_SYMBOLS_SHA256 } from "../../src/generated/html/symbols";

/** The generators' digest: "key TAB value LF" per row, lines sorted by UTF-8 bytes. */
function tableSha256(table: ReadonlyMap<string, string>): string {
  const lines = [...table].map(([key, value]) => Buffer.from(`${key}\t${value}\n`, "utf8"));
  lines.sort(Buffer.compare);
  return createHash("sha256").update(Buffer.concat(lines)).digest("hex");
}

describe("the derived HTML tables", () => {
  it("rebuild HTML_SYMBOLS exactly as the generator measured it", () => {
    expect(HTML_SYMBOLS.size).toBe(1459);
    expect(tableSha256(HTML_SYMBOLS)).toBe(HTML_SYMBOLS_SHA256);
  });

  it("rebuild HTML_SYMBOL_CLASS_INPUT exactly as the generator measured it", () => {
    expect(HTML_SYMBOL_CLASS_INPUT.size).toBe(1436);
    expect(tableSha256(HTML_SYMBOL_CLASS_INPUT)).toBe(HTML_SYMBOL_CLASS_INPUT_SHA256);
  });
});
