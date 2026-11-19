/**
 * Replays the typed-model rows of the pinned unicode stage generation through
 * umath-ts, the parser `./unicodemath/umath` reads UnicodeMath with. The main
 * replay (`stage-replay.spec.ts`) has no typed model of its own to compare
 * these rows against and records them as unsupported; here each row's model is
 * umath-ts's `Umath::Model::Document` for the row's input, encoded the way the
 * stage records it, and each refusal is a umath-ts `ParseError` at the
 * recorded byte offset.
 *
 * umath-ts is not an npm dependency yet, so the spec runs only when
 * `UMATH_TS_DIST` names a built umath-ts `dist/` (CI checks out the pinned
 * revision and builds it).
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { loadStageGeneration, pinPath } from "./stage-pin";

const DIST = process.env.UMATH_TS_DIST;

type Value = unknown;

interface Encoded {
  readonly str?: string;
  readonly array?: readonly (Encoded | undefined)[];
  readonly node?: string;
  readonly fields?: readonly (readonly [string, Encoded | undefined])[];
}

/** A umath-ts model value as the stage records it (umath-ts scripts/replay-corpus.mjs). */
function model(value: Value): Encoded | undefined {
  if (value === null || value === undefined || typeof value === "symbol") return undefined;
  if (typeof value === "string") return { str: value };
  if (Array.isArray(value)) return { array: value.map(model) };
  const name = (value as object).constructor.name;
  if (!name.startsWith("UmathModel")) throw new TypeError(`not a umath model: ${name}`);
  return {
    node: `Umath::Model::${name.slice("UmathModel".length)}`,
    fields: Object.entries(value as object)
      .map(([key, field]) => [key, model(field)] as const)
      .filter(([, field]) => field !== undefined),
  };
}

const mapping = (value: Value): Record<string, Value> => value as Record<string, Value>;
const text = (value: Value): string => {
  const tagged = mapping(value);
  if (typeof tagged.str !== "string") throw new TypeError("expected a tagged string");
  return tagged.str;
};

describe.skipIf(DIST === undefined)("the unicode typed-model rows through umath-ts", () => {
  const generation = loadStageGeneration(pinPath("unicode"));
  const rows = generation.payloads
    .filter((payload) => payload.document.boundary === "typed-model")
    .flatMap((payload) => payload.cases);

  it(`replays every typed-model row (${rows.length}) equal`, async () => {
    const umath = await import(pathToFileURL(join(DIST as string, "index.js")).href);
    const parser = await umath.initialize();
    const differing: string[] = [];
    let models = 0;
    let refusals = 0;
    for (const row of rows) {
      const entry = mapping(row);
      const id = String(entry.id);
      const input = text(entry.input);
      const options = mapping(entry.options ?? {});
      const decimal = typeof options.decimal === "string" ? options.decimal : ".";
      const expected = mapping(entry.expected);
      let actual: unknown;
      let thrown: unknown;
      try {
        actual = parser.parse(input, { decimal, compatibility: "parslet", reporter: "deepest" });
      } catch (error) {
        thrown = error;
      }
      if (expected.refusal !== undefined) {
        refusals += 1;
        const at = (thrown as { byteOffset?: number } | undefined)?.byteOffset;
        if (!(thrown instanceof umath.ParseError) || at !== mapping(expected.refusal).byte_offset) {
          differing.push(`${id}: refusal ${at}`);
        }
        continue;
      }
      models += 1;
      const recorded = JSON.stringify(expected.tree).replaceAll(
        '"Unicodemath::Model::',
        '"Umath::Model::',
      );
      if (thrown !== undefined || JSON.stringify(model(actual)) !== recorded) differing.push(id);
    }
    console.log(`umath typed-model rows: ${models} models, ${refusals} refusals`);
    expect(differing).toStrictEqual([]);
    expect(models + refusals).toBe(rows.length);
  }, 900_000);
});
