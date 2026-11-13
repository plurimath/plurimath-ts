/** biome-ignore-all lint/style/useNamingConvention: fixtures retain source and native JSON wire property names. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateQuantityRequest,
  initNumericWasm,
  type NumericWasmEvaluator,
  type QuantityNumericValue,
  type QuantityRequest,
} from "../../src/evaluation/wasm";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = join(root, "test/fixtures/evaluation-wasm");
const profile = join(fixtures, "typed-quantity-accuracy-v1");
const load = (name: string) => readFileSync(join(profile, name));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const provenance = JSON.parse(load("provenance.json").toString("utf8"));
interface SourceCase {
  id: string;
  request_json: string;
  expected: { outcome: "ok"; unit: string; accuracy: { symbol: string } };
}
const source = JSON.parse(load("vectors.json").toString("utf8")) as { cases: SourceCase[] };
const numeric = JSON.parse(load("numeric-values.json").toString("utf8")) as {
  cases: { id: string; numeric_value: QuantityNumericValue }[];
};
const units = JSON.parse(load("unit-maps.json").toString("utf8")) as {
  units: { unit: string; terms: unknown; dimensions: unknown }[];
};
const values = new Map(numeric.cases.map((row) => [row.id, row.numeric_value]));
const unitMaps = new Map(units.units.map((row) => [row.unit, row]));

describe("typed quantity wire consumer", () => {
  let kernel: NumericWasmEvaluator;
  beforeAll(async () => {
    kernel = await initNumericWasm(readFileSync(join(root, "assets/wasm/plurimath_numeric.wasm")));
  });

  it("pins all 36 additive source observations and the numeric/unit encoders", () => {
    expect(source.cases).toHaveLength(36);
    expect(new Set(source.cases.map((row) => row.id)).size).toBe(36);
    expect(numeric.cases).toHaveLength(36);
    expect(hash(load("vectors.json"))).toBe(provenance.vectors_sha256);
    expect(hash(load("numeric-values.json"))).toBe(provenance.numeric_values_sha256);
    expect(hash(load("unit-maps.json"))).toBe(provenance.unit_maps_sha256);
    expect(hash(load("converted.json"))).toBe(provenance.converted_sha256);
  });

  it("preserves the legacy string request and complete native result", () => {
    const rows = JSON.parse(readFileSync(join(fixtures, "quantity-wasm-v1.json"), "utf8")).cases;
    const row = rows.find((entry: { request_json: string; expected_wire: string }) => {
      const expected = JSON.parse(entry.expected_wire);
      return expected.schema === "plurimath.evaluate.quantity/1" && expected.ok;
    });
    expect(row).toBeDefined();
    const request = JSON.parse(row.request_json) as QuantityRequest;
    const response = evaluateQuantityRequest(kernel, request);
    expect(response).toEqual(JSON.parse(row.expected_wire));
    if (!response.ok) throw new Error("legacy quantity unexpectedly refused");
    expect(response.result.value).not.toHaveProperty("numeric_value");
  });

  it("preserves all 36 source numeric values, accuracy and unit identities", () => {
    for (const row of source.cases) {
      const request = JSON.parse(row.request_json) as QuantityRequest;
      const before = JSON.stringify(request);
      const response = evaluateQuantityRequest(kernel, request);
      expect(JSON.stringify(request), row.id).toBe(before);
      // This additionally checks that no fields or nulls were filtered by the client.
      expect(response, row.id).toEqual(JSON.parse(kernel.evaluateRequest(row.request_json)));
      expect(response.ok, row.id).toBe(true);
      if (!response.ok) throw new Error(`${row.id}: ${response.error.code}`);
      expect(response.result.accuracy.symbol, row.id).toBe(row.expected.accuracy.symbol);
      const snapshot = response.result.value;
      const expected = values.get(row.id);
      expect(expected, row.id).toBeDefined();
      const tagged = Object.values(request.bindings ?? {}).some(
        (binding) => typeof binding.value === "object" && binding.value !== null,
      );
      if (tagged) {
        expect(snapshot.numeric_value, row.id).toEqual(expected);
      } else {
        expect(snapshot, row.id).not.toHaveProperty("numeric_value");
        if (expected?.kind !== "rational")
          throw new Error(`${row.id}: non-rational string control`);
        const magnitude =
          expected.denominator === "1"
            ? expected.numerator
            : `${expected.numerator}/${expected.denominator}`;
        expect(snapshot.magnitude, row.id).toBe(magnitude);
      }
      const unit = unitMaps.get(row.expected.unit);
      expect(unit, row.id).toBeDefined();
      expect(snapshot.terms, row.id).toEqual(unit?.terms);
      expect(snapshot.dimensions, row.id).toEqual(unit?.dimensions);
      expect(response.result.converted, row.id).toBeNull();
    }
  }, 60_000);
  it("preserves the two source-converted numeric classes, signed zero and units", () => {
    const converted = JSON.parse(load("converted.json").toString("utf8")) as {
      cases: { id: string; request_json: string; expected: Record<string, unknown> }[];
    };
    expect(converted.cases).toHaveLength(2);
    for (const row of converted.cases) {
      const response = evaluateQuantityRequest(
        kernel,
        JSON.parse(row.request_json) as QuantityRequest,
      );
      expect(response, row.id).toEqual(JSON.parse(kernel.evaluateRequest(row.request_json)));
      expect(response.ok, row.id).toBe(true);
      if (!response.ok) throw new Error(`${row.id}: ${response.error.code}`);
      expect(response.result, row.id).toMatchObject(row.expected);
    }
  });
});
