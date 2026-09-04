/**
 * HTML corpus-blocker probe (TODO.plan/p2-output-formats/04-symbol-data.md).
 *
 * Rebuilds every reachable pinned corpus case with the existing corpus reader,
 * runs the current HTML renderer over it, and classifies the first refusal.
 * It then walks each model tree independently, because the first thrown error
 * masks every later blocker in the same case — that walk is what separates
 * "this data removes the current error" from "this case now renders".
 *
 * It imports TypeScript sources, so bundle it first:
 *
 *   out=$(mktemp -d)
 *   node_modules/.bin/esbuild scripts/probes/html-corpus.mjs \
 *     --bundle --platform=node --format=esm --outfile="$out/probe.mjs"
 *   node "$out/probe.mjs"
 *
 * Run it from the repository root: the corpus and the pinned testsuite
 * submodule are resolved relative to process.cwd().
 */

import { join } from "node:path";
import { toHtml } from "../../src/formats/html/renderer.ts";
import { loadPinnedCorpus, readExclusions } from "../../test/core/corpus-pin.ts";
import { aliasIndex, buildNode, readCensus } from "../../test/core/model-builder.ts";

const root = process.cwd();
const pinned = loadPinnedCorpus(join(root, "submodules/plurimath-testsuite"));
const withheld = new Set(
  readExclusions(join(root, "corpus/exclusions.yaml")).map((entry) => entry.id),
);
const cases = pinned.cases.filter((entry) => !withheld.has(entry.id));
const aliases = aliasIndex(readCensus(join(root, "corpus/census.yaml")));

/** Categories this data work owns; everything else is another work item. */
const OWNED_BY_SYMBOL_DATA = new Set(["named-symbol-payload", "named-paren-payload"]);

/**
 * Nary dispatches on the error's `kind`, not on its prose. Every other row here
 * keys on a message that carries semantics no structural field holds, but Nary's
 * refusal is identified exactly by the kind that raised it — and matching prose
 * for it was already wrong once: this read `"Nary has no to_html"` while the
 * renderer said `"Nary has no HTML renderer in the pinned gem ..."`, so every
 * Nary case fell through to `other` and the breakdown under-counted it.
 */
function category(message, kind) {
  if (kind === "nary") return "oracle-nary-refusal";
  if (message.includes("needs generated HTML data, which belongs to phase two")) {
    return "named-symbol-payload";
  }
  if (message.includes("needs generated HTML symbol data")) return "named-paren-payload";
  if (message.includes("BinaryFunction alias")) return "binary-function-alias";
  if (message.includes("UnaryFunction alias")) return "unary-function-alias";
  if (message.includes("TernaryFunction alias")) return "ternary-function-alias";
  if (message.includes("unicode[:name] substitution")) return "text-unicode-substitution";
  return "other";
}

/**
 * Blockers reachable anywhere in the tree, not merely the one that threw
 * first. The exempted names are the carriers the current renderer already
 * handles.
 */
function latentBlockers(rootNode) {
  const blockers = new Set();
  const seen = new Set();
  const visit = (value) => {
    if (value === null || value === undefined || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    switch (value.kind) {
      case "binaryFunction":
        if (value.name !== "Td") blockers.add(`binaryFunction:${value.name}`);
        break;
      case "unaryFunction":
        if (value.name !== "Sin" && value.name !== "Tr") {
          blockers.add(`unaryFunction:${value.name}`);
        }
        break;
      case "ternaryFunction":
        blockers.add(`ternaryFunction:${value.name}`);
        break;
      case "nary":
        blockers.add("nary:oracle-refusal");
        break;
      case "text":
        if (typeof value.parameterOne === "string" && /unicode\[:\w+\]/.test(value.parameterOne)) {
          blockers.add("text:unicode-substitution");
        }
        break;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(rootNode);
  return [...blockers].sort();
}

const successes = [];
const failures = [];
for (const entry of cases) {
  const node = buildNode(entry.model, aliases);
  const blockers = latentBlockers(node);
  try {
    const output = toHtml(node);
    successes.push({ id: entry.id, bytes: Buffer.byteLength(output), blockers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({
      id: entry.id,
      category: category(message, error?.kind ?? null),
      code: error?.code ?? null,
      kind: error?.kind ?? null,
      message,
      blockers,
    });
  }
}

const categories = Object.fromEntries(
  [...new Set(failures.map((entry) => entry.category))].sort().map((name) => {
    const entries = failures.filter((entry) => entry.category === name);
    return [name, { count: entries.length, ids: entries.map((entry) => entry.id).sort() }];
  }),
);

const messages = Object.fromEntries(
  [...new Set(failures.map((entry) => entry.message))].sort().map((message) => {
    const entries = failures.filter((entry) => entry.message === message);
    return [message, { count: entries.length, ids: entries.map((entry) => entry.id).sort() }];
  }),
);

const blockerOverlap = Object.fromEntries(
  Object.entries(categories).map(([name, summary]) => {
    const entries = failures.filter((entry) => entry.category === name);
    const blocked = entries.filter((entry) => entry.blockers.length > 0);
    return [
      name,
      {
        cases: summary.count,
        withLatentBlocker: blocked.length,
        ids: blocked.map((entry) => ({ id: entry.id, blockers: entry.blockers })),
      },
    ];
  }),
);

/**
 * The structural projection. This is arithmetic over the measurement above,
 * not an execution with data that does not exist yet: a case counted as newly
 * eligible is one whose first refusal this data removes AND whose tree holds
 * no other known blocker. The post-data corpus run must re-measure the real
 * rendered/threw split rather than assert these numbers came true.
 */
const ownedFailures = failures.filter((entry) => OWNED_BY_SYMBOL_DATA.has(entry.category));
const newlyEligible = ownedFailures.filter((entry) => entry.blockers.length === 0);
const reclassified = ownedFailures.filter((entry) => entry.blockers.length > 0);

/**
 * What a still-failing case will refuse on once the symbol data lands. A case
 * this data does not own keeps its measured category. A case it does own, but
 * whose tree holds another blocker, moves to that blocker's category — most
 * specific carrier first, so a tree with both a binary and a ternary alias is
 * counted once, under binary.
 */
const remainderKeyFor = (entry) => {
  if (!OWNED_BY_SYMBOL_DATA.has(entry.category)) return entry.category;
  const prefixes = [
    ["binaryFunction:", "binary-function-alias"],
    ["unaryFunction:", "unary-function-alias"],
    ["ternaryFunction:", "ternary-function-alias"],
    ["nary:", "oracle-nary-refusal"],
    ["text:", "text-unicode-substitution"],
  ];
  for (const [prefix, name] of prefixes) {
    if (entry.blockers.some((blocker) => blocker.startsWith(prefix))) return name;
  }
  return "other";
};

const remainder = {};
for (const entry of failures) {
  if (OWNED_BY_SYMBOL_DATA.has(entry.category) && entry.blockers.length === 0) continue;
  const key = remainderKeyFor(entry);
  remainder[key] = (remainder[key] ?? 0) + 1;
}

const projection = {
  firstRefusalRemovedFrom: ownedFailures.length,
  newlyEligibleToRender: newlyEligible.length,
  reclassifiedAsFunctionAlias: reclassified.map((entry) => ({
    id: entry.id,
    blockers: entry.blockers,
  })),
  knownRemainder: Object.fromEntries(Object.entries(remainder).sort()),
  knownRemainderTotal: Object.values(remainder).reduce((sum, count) => sum + count, 0),
};

console.log(
  JSON.stringify(
    {
      cases: cases.length,
      rendered: successes.length,
      threw: failures.length,
      categories,
      blockerOverlap,
      projection,
      messages,
    },
    null,
    2,
  ),
);
