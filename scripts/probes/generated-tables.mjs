/**
 * Generated-table probe (TODO.plan/p2-output-formats/04-symbol-data.md).
 *
 * Reads the committed generated symbol maps and reports their row count,
 * distinct-payload count and key order. It is the independent counterpart to
 * scripts/probes/symbol-surface.rb: that probe measures the gem, this one
 * measures what was emitted from it, and the two must agree.
 *
 * It imports TypeScript sources, so bundle it first:
 *
 *   out=$(mktemp -d)
 *   node_modules/.bin/esbuild scripts/probes/generated-tables.mjs \
 *     --bundle --platform=node --format=esm --outfile="$out/probe.mjs"
 *   node "$out/probe.mjs"
 *
 * Adding an emitted format means adding it to TABLES below. A format whose
 * slice has not landed yet is deliberately absent rather than optional: an
 * import of a file that does not exist must fail loudly.
 */

import { ASCIIMATH_SYMBOLS } from "../../src/generated/asciimath/symbols.ts";
import { LATEX_SYMBOLS } from "../../src/generated/latex/symbols.ts";
import { MATHML_SYMBOLS } from "../../src/generated/mathml/symbols.ts";
import { UNICODEMATH_SYMBOLS } from "../../src/generated/unicodemath/symbols.ts";

const TABLES = {
  asciimath: ASCIIMATH_SYMBOLS,
  latex: LATEX_SYMBOLS,
  mathml: MATHML_SYMBOLS,
  unicodemath: UNICODEMATH_SYMBOLS,
};

const entries = Object.entries(TABLES);

const measured = Object.fromEntries(
  entries.map(([format, table]) => {
    const payloads = [...table.values()].map((value) => JSON.stringify(value));
    const multiplicity = new Map();
    for (const payload of payloads) {
      multiplicity.set(payload, (multiplicity.get(payload) ?? 0) + 1);
    }
    return [
      format,
      {
        rows: table.size,
        distinctPayloads: multiplicity.size,
        duplicateRowsBeyondFirst: table.size - multiplicity.size,
        maxPayloadMultiplicity: Math.max(...multiplicity.values()),
      },
    ];
  }),
);

/**
 * Every emitted slice must key in the canonical symbol-id order — the order
 * scripts/probes/symbol-surface.rb reports as `static_symbol_ids`. Comparing
 * the slices to each other catches a generator that reorders one format's
 * rows; `--expect-ids <file>` additionally pins them to the oracle's own list.
 */
const [reference, ...others] = entries;
const referenceKeys = [...reference[1].keys()];
const order = {
  referenceFormat: reference[0],
  keys: referenceKeys.length,
  identicalAcrossFormats: others.every(([, table]) => {
    const keys = [...table.keys()];
    return keys.length === referenceKeys.length && keys.every((key, i) => key === referenceKeys[i]);
  }),
};

const expectIdsFlag = process.argv.indexOf("--expect-ids");
if (expectIdsFlag !== -1) {
  const path = process.argv[expectIdsFlag + 1];
  if (!path) {
    console.error("--expect-ids needs a path to a JSON file with a static_symbol_ids array");
    process.exit(2);
  }
  const { readFileSync } = await import("node:fs");
  const expected = JSON.parse(readFileSync(path, "utf8")).static_symbol_ids;
  order.expectedIdsSource = path;
  order.matchesExpectedIds =
    Array.isArray(expected) &&
    expected.length === referenceKeys.length &&
    expected.every((id, i) => id === referenceKeys[i]);
}

console.log(JSON.stringify({ formats: measured, order }, null, 2));

if (!order.identicalAcrossFormats || order.matchesExpectedIds === false) {
  console.error("row order is not canonical across every table checked");
  process.exit(1);
}
