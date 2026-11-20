/** biome-ignore-all lint/style/useNamingConvention: shared YAML input_format and the public Plurimath export retain their source names. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { replayTextParseParity, type TextParseFixture } from "../../scripts/text-parse-parity.mjs";
import { FACADE_WASM_ASSET, initFacadeWasm } from "../../src/facade/wasm";
import { Plurimath } from "../../src/index";
import { PINNED_CORPUS_ROOT, pinnedSubmoduleCommit } from "../core/corpus-pin";
import { parseYaml } from "../core/corpus-yaml";

const root = join(import.meta.dirname, "../..");
const fixture: TextParseFixture = JSON.parse(
  readFileSync(join(root, "test/fixtures/facade/text-parse-parity.json"), "utf8"),
);

describe("opt-in facade WASM text parsing", () => {
  it("keeps every input, refusal and expected byte tied to a pinned shared row", () => {
    expect(fixture.source).toBe("plurimath/plurimath-testsuite");
    const pin = pinnedSubmoduleCommit(root);
    expect(fixture.revision).toBe(pin.headCommit);
    expect(fixture.revision).toBe(pin.indexCommit);
    expect(fixture.payloads).toHaveLength(6);
    const sources = new Map<string, { input: string; input_format: string; expected?: object }>();
    for (const payload of fixture.payloads) {
      const bytes = readFileSync(join(PINNED_CORPUS_ROOT, payload.path));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(payload.sha256);
      const document = parseYaml(bytes.toString("utf8")) as {
        cases: { id: string; input: string; input_format: string; expected?: object }[];
      };
      for (const row of document.cases) sources.set(row.id, row);
    }
    for (const row of [...fixture.rows, ...fixture.refusals]) {
      const source = sources.get(row.id);
      expect(source?.input).toBe(row.input);
      expect(source?.input_format).toBe(row.format);
    }
    for (const row of fixture.rows)
      for (const [target, bytes] of Object.entries(row.expected))
        expect(sources.get(row.id)?.expected).toHaveProperty(target, bytes);
    for (const row of fixture.refusals)
      expect(sources.get(row.id)).toHaveProperty("error.category", "parse_error");
  });

  it("matches current TS and shared writer bytes without changing TS defaults", async () => {
    const kernel = await initFacadeWasm(
      readFileSync(join(root, "assets/facade", FACADE_WASM_ASSET.file)),
    );
    expect(replayTextParseParity({ Plurimath }, kernel, fixture)).toEqual({
      rows: 6,
      comparisons: 18,
      refusals: 3,
      calls: 29,
    });
  });

  it("rejects empty evidence and a changed writer observation", async () => {
    const kernel = await initFacadeWasm(
      readFileSync(join(root, "assets/facade", FACADE_WASM_ASSET.file)),
    );
    expect(() => replayTextParseParity({ Plurimath }, kernel, { ...fixture, rows: [] })).toThrow(
      "expected six distinct parse rows",
    );
    const changed = structuredClone(fixture);
    const first = changed.rows[0];
    if (!first) throw new Error("missing selected shared row");
    expect(() =>
      replayTextParseParity({ Plurimath }, kernel, {
        ...changed,
        rows: [
          { ...first, expected: { ...first.expected, latex: "changed writer bytes" } },
          ...changed.rows.slice(1),
        ],
      }),
    ).toThrow("frac-simple -> latex");
  });
});
