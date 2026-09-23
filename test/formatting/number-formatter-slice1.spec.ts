/**
 * B2's first slice acceptance gate: the per-call `formatter:` render
 * option's default-symbol behavior, against `plurimath-testsuite`'s
 * `calls/1` oracle case (PR #17, `corpus/asciimath/number-formatting.yaml`,
 * case `number-formatter-de-style-grouping`).
 *
 * This reads through `test/core/corpus-pin.ts`'s `loadPinnedCorpus()`, same
 * as every other corpus-driven spec: the pin (`TODO.plan/cross-cutting.md`)
 * now includes the `plurimath-testsuite` commit that added the `calls/1`
 * schema, and `corpus-pin.ts` reads that schema as first-class data — no
 * out-of-band `git show` against the submodule's object store is needed.
 *
 * `expected.mathml` IS compared here (`src/formats/mathml/renderer.ts`'s
 * `formatter` is implemented as of the MathML/OMML number-formatting slice,
 * TODO.plan/feature-roadmap.md) — the same payload the four text renderers
 * check against. OMML has no `expected.omml` field in this payload (`targets`
 * carries only asciimath/latex/mathml/unicodemath), so OMML's `formatter` is
 * checked elsewhere (`number-formatter-numeric-pipeline.spec.ts` for the pinned
 * cases that record OMML, `number-formatter-omml.spec.ts` for measured ones).
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

const CASE_ID = "number-formatter-de-style-grouping";

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

/** The one case this spec renders and checks, reduced from the pinned `calls/1` case. */
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
      decimal: requireString(options, "decimal", `${at} call.args.options`),
      group: requireString(options, "group", `${at} call.args.options`),
      groupDigits: requireNumber(options, "group_digits", `${at} call.args.options`),
    },
    // The payload records both as bare `precision:` / `string_format:` keys
    // with no value — the gem's nil, and the default `Formatter::Standard`
    // was constructed with, per `call.args`. Read as `null` directly rather
    // than parsed off the YAML: `resolveNumberFormat` treats absent and
    // `null` identically for a field this slice does not implement, so
    // which of the two the parser produces for a valueless key does not
    // change what this spec exercises.
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

describe(`calls/1 case "${CALL_CASE.id}" — the formatter: option's default-symbol behavior`, () => {
  it("carries the shape this spec expects (a sanity check on the pinned bytes)", () => {
    expect(CALL_CASE.formatter).toStrictEqual({
      locale: "en",
      options: { decimal: ",", group: ".", groupDigits: 3 },
      precision: null,
      stringFormat: null,
    });
    expect([...CALL_CASE.expected.keys()].sort()).toStrictEqual([
      "asciimath",
      "latex",
      "mathml",
      "unicodemath",
    ]);
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

  it("renders the plain no-formatter path unchanged (the whole pinned corpus's path)", () => {
    const node = buildFormula();
    expect(toAsciimath(node)).toBe("123456.789");
    expect(toLatex(node)).toBe("123456.789");
    expect(toUnicodemath(node)).toBe("123456.789");
  });
});
