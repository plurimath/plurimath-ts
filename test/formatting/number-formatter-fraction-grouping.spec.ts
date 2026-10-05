/**
 * B2's fraction-side grouping slice acceptance gate: the per-call
 * `formatter:` render option's `fraction_group`/`fraction_group_digits`
 * behavior, against `plurimath-testsuite`'s `calls/1` oracle case
 * `number-formatter-fraction-side-grouping`
 * (`corpus/asciimath/number-formatting.yaml`).
 *
 * This reads through `test/core/corpus-pin.ts`'s `loadPinnedCorpus()`, same
 * as every other corpus-driven spec: the pin (`TODO.plan/cross-cutting.md`)
 * now includes the `plurimath-testsuite` commit that merged this case
 * (`feat/fraction-grouping-oracle-case` merged upstream, then folded into
 * the same pin bump as PR #17's case) — no out-of-band `git show`/`git
 * fetch` against a sibling worktree is needed.
 *
 * `expected.mathml` IS compared here, for the same reason as slice 1's
 * update: MathML's `formatter` support (the MathML/OMML number-formatting
 * slice) covers fraction-side grouping the same way the four text renderers
 * do, by threading the same resolved `NumberFormat` through
 * `applyNumberFormat`. OMML has no `expected.omml` field to check against in
 * this payload; its `formatter` is checked in `number-formatter-omml.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import type { ConstructedMathNode } from "../../src/core/nodes";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/index";
import { toUnicodemath } from "../../src/formats/unicodemath/index";
import type { FormatterOptions } from "../../src/formatting/index";
import { loadPinnedCorpus, type PinnedCallCase } from "../core/corpus-pin";
import type { YamlValue } from "../core/corpus-yaml";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../core/model-builder";

const CASE_ID = "number-formatter-fraction-side-grouping";

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

function findCase(caseId: string): PinnedCallCase {
  const corpus = loadPinnedCorpus();
  const found = corpus.calls.filter((entry) => entry.id === caseId);
  if (found.length !== 1) {
    throw new Error(
      `the pinned corpus: expected exactly one calls/1 case with id "${caseId}", found ${found.length}`,
    );
  }
  return found[0] as PinnedCallCase;
}

function reduceCallCase(entry: PinnedCallCase): CallCase {
  const at = `calls/1 case ${entry.id}`;
  if (entry.call.method !== "number_formatter") {
    throw new Error(`${at}: call.method is not "number_formatter"`);
  }
  const args = asMapping(entry.call.args, `${at} call.args`);
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

  const model = entry.model as unknown as SerializedNode;
  if (
    typeof model !== "object" ||
    model === null ||
    typeof (model as SerializedNode).class !== "string"
  ) {
    throw new Error(`${at}: "model" is not a serialized node`);
  }

  return { id: entry.id, formatter, model, expected: entry.expected };
}

const CALL_CASE = reduceCallCase(findCase(CASE_ID));

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
