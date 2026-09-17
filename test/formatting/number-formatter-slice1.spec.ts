/**
 * B2's first slice acceptance gate: the per-call `formatter:` render
 * option's default-symbol behavior, against `plurimath-testsuite`'s
 * `calls/1` oracle case (PR #17, `corpus/asciimath/number-formatting.yaml`,
 * case `number-formatter-de-style-grouping`).
 *
 * **Why this does not go through `test/core/corpus-pin.ts`.** That reader
 * knows three payload schemas — `plurimath-corpus/<format>/1`,
 * `.../<format>/2`, and `.../rejections/1` — and throws on anything else, by
 * design (`loadPinnedCorpus`'s "an unknown kind stops the load"). `calls/1`
 * is a fourth kind, added by the same PR this case comes from, and the
 * submodule commit this repository pins (`TODO.plan/cross-cutting.md`,
 * `281d7003`) predates that PR's merge commit (`33acd2fd`). Bumping the
 * pin to include it would change what every OTHER corpus-driven suite in
 * this repository loads and verifies against `corpus/provenance.yaml` — the
 * hardcoded payload/case counts in `test/core/corpus-pin.spec.ts` among
 * them — which is out of scope for this slice.
 *
 * So this spec reads the one payload directly: `git show` against the
 * ALREADY-INITIALISED submodule's local object store, at the known merge
 * commit — read-only, and it never moves the submodule's checkout off its
 * pinned commit. `33acd2fd` is reachable there because it is an ancestor of
 * `origin/main`, which a plain `git submodule update --init` fetches
 * alongside the pinned commit. The payload's bytes are then verified against
 * a recorded sha256 before anything trusts them, the same "verify, don't
 * just read" discipline `corpus-pin.ts` applies to the payloads it owns.
 *
 * `expected.mathml` in the payload is not compared here: MathML still
 * refuses `formatter` by name (`src/formats/mathml/renderer.ts`,
 * `DEFERRED_OPTIONS`), per this slice's scope
 * (TODO.plan/feature-roadmap.md's build order covers MathML/OMML in a later
 * slice) — this spec instead confirms that refusal still fires.
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

/** `plurimath-testsuite`'s merge commit for PR #17 (`plurimath/plurimath-testsuite#17`). */
const NUMBER_FORMATTING_COMMIT = "33acd2fd1f4653ebb1a541b95aaef0bc9dd9f92a";
const PAYLOAD_PATH = "corpus/asciimath/number-formatting.yaml";
/** `git -C submodules/plurimath-testsuite show <commit>:<path> | sha256sum`, recorded once. */
const EXPECTED_SHA256 = "d01a37e70eb066508636c6a1ab77de4ed5b08b6422acfc9fca8c4013a68d689e";

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
        `Run: git -C ${PINNED_CORPUS_ROOT} fetch origin. (${String(error)})`,
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

/** The one case this payload carries, reduced to what this spec renders and checks. */
interface CallCase {
  readonly id: string;
  readonly formatter: FormatterOptions;
  readonly model: SerializedNode;
  readonly expected: ReadonlyMap<string, string>;
}

function readCallCase(text: string): CallCase {
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
  if (!Array.isArray(cases) || cases.length !== 1) {
    throw new Error(
      `${PAYLOAD_PATH}: expected exactly one case (this spec has not measured a second), ` +
        `found ${Array.isArray(cases) ? cases.length : "none"}`,
    );
  }
  const entry = asMapping(cases[0] ?? null, `${PAYLOAD_PATH} cases[0]`);
  const id = requireString(entry, "id", `${PAYLOAD_PATH} cases[0]`);
  const at = `${PAYLOAD_PATH} case ${id}`;

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

  return { id, formatter, model, expected };
}

const CALL_CASE = readCallCase(readPayloadAtCommit());

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

  it("still refuses formatter by name on mathml — that slice is not this one", () => {
    const node = buildFormula();
    // `MathmlOptions` deliberately has no `formatter` field (it is a DEFERRED
    // key, recognised only by `ACCEPTED_OPTIONS` for its named refusal) — the
    // cast puts the same unknown-to-the-type key a JavaScript caller could
    // pass, which is exactly the shape `assertKnownOptions` and the deferred
    // check both guard against silently letting through.
    expect(() =>
      toMathml(node, { formatter: CALL_CASE.formatter } as Parameters<typeof toMathml>[1]),
    ).toThrow(/formatter/);
  });

  it("renders the plain no-formatter path unchanged (the whole pinned corpus's path)", () => {
    const node = buildFormula();
    expect(toAsciimath(node)).toBe("123456.789");
    expect(toLatex(node)).toBe("123456.789");
    expect(toUnicodemath(node)).toBe("123456.789");
  });
});
