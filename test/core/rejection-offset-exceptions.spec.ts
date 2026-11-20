import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../submodules/plurimath-testsuite/exceptions/rejection-offsets.json" with {
  type: "json",
};
import { loadPinnedCorpus, PINNED_CORPUS_ROOT } from "./corpus-pin";
import { rejectionOffsetExceptions, validateOffsetExceptions } from "./rejection-offset-exceptions";

const rows = loadPinnedCorpus().rejections;
const bytes = readFileSync(join(PINNED_CORPUS_ROOT, manifest.path));
describe("historical rejection offset exceptions", () => {
  it("names exactly two measured rows without changing their historical offsets", () => {
    const exceptions = validateOffsetExceptions(bytes, rows);
    expect([...exceptions.keys()]).toEqual([
      "unicode-trailing-broken-bar",
      "unicode-greek-broken-bar",
    ]);
    expect(rejectionOffsetExceptions()).toEqual(exceptions);
    for (const entry of exceptions.values()) {
      expect(entry.historicalOriginalOffset).toBe(1);
      expect(entry.currentOriginalOffset).toBe(2);
    }
  });
  it("rejects edited payload bytes", () => {
    expect(() => validateOffsetExceptions(Buffer.concat([bytes, Buffer.from("\n")]), rows)).toThrow(
      /digest changed/,
    );
  });
  it("rejects a missing or changed row", () => {
    expect(() => validateOffsetExceptions(bytes, [])).toThrow(/row changed/);
    expect(() =>
      validateOffsetExceptions(
        bytes,
        rows.map((row) =>
          row.id === "unicode-trailing-broken-bar" ? { ...row, input: "a" } : row,
        ),
      ),
    ).toThrow(/row changed/);
  });
});
