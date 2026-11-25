/** Exact historical-payload exceptions, following testsuite#59's path/hash/reason policy. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../../submodules/plurimath-testsuite/exceptions/rejection-offsets.json" with {
  type: "json",
};
import { loadPinnedCorpus, PINNED_CORPUS_ROOT, type PinnedRejection } from "./corpus-pin";

export type OffsetException = (typeof manifest.exceptions)[number];

/** Hash drift fails closed: a repin must deliberately retire or remeasure exceptions. */
export function validateOffsetExceptions(
  bytes: Uint8Array,
  entries: readonly PinnedRejection[],
): ReadonlyMap<string, OffsetException> {
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
    throw new Error("rejection offset exception payload digest changed");
  const result = new Map<string, OffsetException>();
  for (const exception of manifest.exceptions) {
    const entry = entries.find((row) => row.id === exception.id);
    if (!entry || entry.input !== exception.input || result.has(exception.id))
      throw new Error(`rejection offset exception row changed: ${exception.id}`);
    if (
      entry.inputFormat !== "unicode" ||
      entry.category !== "parse_error" ||
      entry.index !== exception.historicalPreprocessedOffset ||
      exception.currentOriginalOffset !== exception.rubyCharOffset
    )
      throw new Error(`invalid rejection offset exception: ${exception.id}`);
    result.set(exception.id, exception);
  }
  return result;
}

export function rejectionOffsetExceptions(): ReadonlyMap<string, OffsetException> {
  // Read only this authored payload, as the conformance reader does. The sealed
  // stage generation is deliberately untouched and keeps its historical values.
  const bytes = readFileSync(join(PINNED_CORPUS_ROOT, manifest.path));
  return validateOffsetExceptions(bytes, loadPinnedCorpus().rejections);
}
