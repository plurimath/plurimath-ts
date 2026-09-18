/**
 * B2's fraction-side grouping slice acceptance gate: the per-call
 * `formatter:` render option's `fraction_group`/`fraction_group_digits`
 * behavior, against `plurimath-testsuite`'s `calls/1` oracle case
 * `number-formatter-fraction-side-grouping`
 * (`corpus/asciimath/number-formatting.yaml`).
 *
 * **Why this reads a fetched, not-yet-merged commit, and not just
 * `origin/...`.** `number-formatter-slice1.spec.ts`'s case (PR #17,
 * `33acd2fd`) is reachable in the pinned submodule's object store because it
 * is an ancestor of `plurimath-testsuite`'s `origin/main`, which a plain
 * `git submodule update --init` already fetches. This case is further out:
 * it lives on `plurimath-testsuite`'s `feat/fraction-grouping-oracle-case`
 * branch, not yet merged to that repository's main, so it is not an
 * ancestor of anything `origin` serves. The commit was made reachable here
 * with one local, read-only fetch from a sibling worktree that has the
 * branch checked out:
 *
 *   git -C submodules/plurimath-testsuite fetch \
 *     ~/ruby_gems/wt-testsuite-fraction-grouping feat/fraction-grouping-oracle-case
 *
 * That fetch adds objects to the submodule's local `.git` store without
 * moving its checked-out commit (`git -C submodules/plurimath-testsuite
 * status` still reports the pinned commit, no diff) — the same
 * read-but-never-move discipline `number-formatter-slice1.spec.ts` follows,
 * one step further from the pin. Once `feat/fraction-grouping-oracle-case`
 * merges upstream and a later change bumps the pin to include it, this
 * fetch step stops being necessary and this comment can be trimmed.
 *
 * The payload's bytes are verified against a recorded sha256 before
 * anything trusts them, same as `number-formatter-slice1.spec.ts`.
 *
 * `expected.mathml` IS compared here, for the same reason as slice 1's
 * update: MathML's `formatter` support (the MathML/OMML number-formatting
 * slice) covers fraction-side grouping the same way the four text renderers
 * do, by threading the same resolved `NumberFormat` through
 * `applyNumberFormat`. OMML still has no `expected.omml` field to check
 * against in this payload, so its `formatter` support stays deferred.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ConstructedMathNode } from "../../src/core/nodes";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/index";
import { toUnicodemath } from "../../src/formats/unicodemath/index";
import type { FormatterOptions } from "../../src/formatting/index";
import { PINNED_CORPUS_ROOT } from "../core/corpus-pin";
import { parseYaml, type YamlValue } from "../core/corpus-yaml";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../core/model-builder";

/**
 * `plurimath-testsuite`'s commit generating the fraction-grouping case, on
 * the not-yet-merged `feat/fraction-grouping-oracle-case` branch — fetched
 * into the submodule's object store per this file's header, not present on
 * `origin/main`.
 */
const NUMBER_FORMATTING_COMMIT = "07bf58981dd0be9a2583df423a2478c03b315f4c";
const PAYLOAD_PATH = "corpus/asciimath/number-formatting.yaml";
/** `git -C submodules/plurimath-testsuite show <commit>:<path> | sha256sum`, recorded once. */
const EXPECTED_SHA256 = "82c6cd611c6866ece165142880d44e713d739b29d3176e8a1beb5d52a6cc4058";
const CASE_ID = "number-formatter-fraction-side-grouping";

function readPayloadAtCommit(): string {
  let text: string;
  try {
    text = execFileSync(
      "git",
      ["-C", PINNED_CORPUS_ROOT, "show", `${NUMBER_FORMATTING_COMMIT}:${PAYLOAD_PATH}`],
      { encoding: "utf8" },
    );
  } catch (error) {
    throw new Error(
      `could not read ${PAYLOAD_PATH} at ${NUMBER_FORMATTING_COMMIT} from the ` +
        `submodule checked out at ${PINNED_CORPUS_ROOT} — is the commit reachable there? ` +
        "This file's header documents the one-time fetch needed: " +
        `git -C ${PINNED_CORPUS_ROOT} fetch <path-to-the-oracle-branch-checkout> ` +
        `feat/fraction-grouping-oracle-case. (${String(error)})`,
    );
  }
  const digest = createHash("sha256").update(text, "utf8").digest("hex");
  if (digest !== EXPECTED_SHA256) {
    throw new Error(
      `${PAYLOAD_PATH}@${NUMBER_FORMATTING_COMMIT}: sha256 ${digest}, expected ` +
        `${EXPECTED_SHA256} — the recorded bytes have changed upstream.`,
    );
  }
  return text;
}

type Mapping = { readonly [key: string]: YamlValue };

function asMapping(value: YamlValue, where: string): Mapping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a mapping`);
  }
  return value as Mapping;
}

function requireString(map: Mapping, key: string, where: string): string {
  const value = map[key];
  if (typeof value !== "string") throw new Error(`${where}: "${key}" must be a string`);
  return value;
}

function requireNumber(map: Mapping, key: string, where: string): number {
  const value = map[key];
  if (typeof value !== "number") throw new Error(`${where}: "${key}" must be a number`);
  return value;
}

/** The one case this spec reads out of the payload's two cases. */
interface CallCase {
  readonly id: string;
  readonly formatter: FormatterOptions;
  readonly model: SerializedNode;
  readonly expected: ReadonlyMap<string, string>;
}

function readCallCase(text: string, caseId: string): CallCase {
  const document = asMapping(parseYaml(text), PAYLOAD_PATH);
  const schema = requireString(document, "schema", PAYLOAD_PATH);
  if (schema !== "plurimath-corpus/calls/1") {
    throw new Error(`${PAYLOAD_PATH}: schema is "${schema}", this spec knows "calls/1"`);
  }
  const targets = document.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error(`${PAYLOAD_PATH}: "targets" is missing or empty`);
  }

  const cases = document.cases;
  if (!Array.isArray(cases)) {
    throw new Error(`${PAYLOAD_PATH}: "cases" is missing`);
  }
  const entries = cases
    .map((entry) => asMapping(entry ?? null, `${PAYLOAD_PATH} cases[]`))
    .filter((entry) => entry.id === caseId);
  if (entries.length !== 1) {
    throw new Error(
      `${PAYLOAD_PATH}: expected exactly one case with id "${caseId}", found ${entries.length}`,
    );
  }
  const entry = entries[0] as Mapping;
  const at = `${PAYLOAD_PATH} case ${caseId}`;

  const call = asMapping(entry.call ?? null, `${at} call`);
  if (requireString(call, "method", `${at} call`) !== "number_formatter") {
    throw new Error(`${at}: call.method is not "number_formatter"`);
  }
  const args = asMapping(call.args ?? null, `${at} call.args`);
  const locale = requireString(args, "locale", `${at} call.args`);
  const options = asMapping(args.options ?? null, `${at} call.args.options`);
  const formatter: FormatterOptions = {
    locale,
    options: {
      fractionGroup: requireString(options, "fraction_group", `${at} call.args.options`),
      fractionGroupDigits: requireNumber(
        options,
        "fraction_group_digits",
        `${at} call.args.options`,
      ),
    },
    // Same reasoning as number-formatter-slice1.spec.ts: the payload records
    // both as bare, valueless keys — the gem's nil — which this port treats
    // identically to an absent key for a field it does not implement yet.
    precision: null,
    stringFormat: null,
  };

  const expectedMap = asMapping(entry.expected ?? null, `${at} expected`);
  const expected = new Map<string, string>();
  for (const target of targets) {
    if (typeof target !== "string") continue;
    const outcome = asMapping(expectedMap[target] ?? null, `${at} expected.${target}`);
    expected.set(target, requireString(outcome, "output", `${at} expected.${target}`));
  }

  const model = entry.model as unknown as SerializedNode;
  if (
    typeof model !== "object" ||
    model === null ||
    typeof (model as SerializedNode).class !== "string"
  ) {
    throw new Error(`${at}: "model" is not a serialized node`);
  }

  return { id: caseId, formatter, model, expected };
}

const CALL_CASE = readCallCase(readPayloadAtCommit(), CASE_ID);

function buildFormula(): ConstructedMathNode {
  const census = readCensus();
  const aliases = aliasIndex(census);
  return buildNode(CALL_CASE.model, aliases);
}

describe(`calls/1 case "${CALL_CASE.id}" — fraction-side digit grouping`, () => {
  it("carries the shape this spec expects (a sanity check on the pinned bytes)", () => {
    expect(CALL_CASE.formatter).toStrictEqual({
      locale: "en",
      options: { fractionGroup: "_", fractionGroupDigits: 3 },
      precision: null,
      stringFormat: null,
    });
    expect([...CALL_CASE.expected.keys()].sort()).toStrictEqual([
      "asciimath",
      "latex",
      "mathml",
      "unicodemath",
    ]);
    expect(CALL_CASE.expected.get("asciimath")).toBe("1.123_456_789");
  });

  it("renders asciimath byte-identical to the oracle", () => {
    const node = buildFormula();
    expect(toAsciimath(node, { formatter: CALL_CASE.formatter })).toBe(
      CALL_CASE.expected.get("asciimath"),
    );
  });

  it("renders latex byte-identical to the oracle", () => {
    const node = buildFormula();
    expect(toLatex(node, { formatter: CALL_CASE.formatter })).toBe(CALL_CASE.expected.get("latex"));
  });

  it("renders unicodemath byte-identical to the oracle", () => {
    const node = buildFormula();
    expect(toUnicodemath(node, { formatter: CALL_CASE.formatter })).toBe(
      CALL_CASE.expected.get("unicodemath"),
    );
  });

  it("renders mathml byte-identical to the oracle", () => {
    const node = buildFormula();
    expect(toMathml(node, { formatter: CALL_CASE.formatter })).toBe(
      CALL_CASE.expected.get("mathml"),
    );
  });
});
