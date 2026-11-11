/** biome-ignore-all lint/style/useNamingConvention: vector keys are the kernel fixtures' snake_case. */
/**
 * Replay the pinned Rust kernel's numeric, quantity, and GUM wire fixtures
 * through one WASM instance. The Rust evaluator supplies every expected wire.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  initNumericWasm,
  NUMERIC_WASM_ASSET,
  NumericWasmError,
  type NumericWasmEvaluator,
} from "../../src/evaluation/wasm";

const root = join(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(join(root, "assets/wasm/manifest.json"), "utf8"));
const bytes = readFileSync(join(root, "assets/wasm", manifest.file));
const fixtures = join(root, "test/fixtures/evaluation-wasm");
interface Vector {
  id: string;
  profile?: "numeric" | "quantity";
  request_json: string;
  expected_wire: string;
}
const vectors: Vector[] = Object.keys(manifest.vectors).flatMap((file) => {
  const body = readFileSync(join(fixtures, file));
  expect(createHash("sha256").update(body).digest("hex")).toBe(manifest.vectors[file].sha256);
  return JSON.parse(body.toString("utf8")).cases as Vector[];
});
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    // By name: a module reset (fresh realm) re-creates the class.
    (error) => (error?.name === NumericWasmError.name ? error.code : String(error)),
  );

describe("evaluation/wasm", () => {
  let kernel: NumericWasmEvaluator;
  beforeAll(async () => {
    kernel = await initNumericWasm(bytes);
  });

  it("pins the evaluator asset and glue the manifest records", () => {
    expect(sha(bytes)).toBe(manifest.sha256);
    expect(NUMERIC_WASM_ASSET.sha256).toBe(manifest.sha256);
    expect(NUMERIC_WASM_ASSET.bytes).toBe(manifest.bytes);
    expect(NUMERIC_WASM_ASSET.quantity).toBe(true);
    expect(NUMERIC_WASM_ASSET.schemas).toEqual(manifest.request_schemas);
    expect(NUMERIC_WASM_ASSET.source.revision).toBe(manifest.source.revision);
    expect(NUMERIC_WASM_ASSET.glue.sha256).toBe(manifest.glue.sha256);
    expect(sha(readFileSync(join(root, manifest.glue.file)))).toBe(manifest.glue.sha256);
    expect(kernel.asset).toEqual({ sha256: manifest.sha256, bytes: manifest.bytes, abi: 1 });
  });

  it("accounts for every pinned wire profile", () => {
    expect(vectors).toHaveLength(manifest.vectors_total);
    expect(vectors.filter((v) => v.profile === "numeric")).toHaveLength(159);
    expect(vectors.filter((v) => v.profile === "quantity")).toHaveLength(3);
    expect(vectors.filter((v) => v.profile === undefined)).toHaveLength(41);
  });

  it("reproduces the numeric and quantity wires on repeated calls", () => {
    const baseline = vectors.filter((v) => v.profile !== undefined);
    for (const vector of [...baseline, ...baseline]) {
      expect(kernel.evaluateRequest(vector.request_json), vector.id).toBe(vector.expected_wire);
    }
  }, 30_000);

  it("reproduces every GUM wire on the same engine", () => {
    const gum = vectors.filter((v) => v.profile === undefined);
    for (const vector of gum) {
      expect(kernel.evaluateRequest(vector.request_json), vector.id).toBe(vector.expected_wire);
    }
  }, 120_000);

  it("refuses non-strings through the kernel's own InvalidRequest wire", () => {
    const wire = kernel.evaluateRequest(42 as unknown as string);
    expect(JSON.parse(wire)).toMatchObject({ ok: false, error: { code: "InvalidRequest" } });
    expect(kernel.evaluateRequest("{")).toBe(wire);
  });

  it("refuses unpinned or invalid assets with typed errors", async () => {
    const tampered = Uint8Array.from(bytes);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(await code(initNumericWasm(tampered))).toBe("AssetDigestMismatch");
    expect(await code(initNumericWasm(bytes, { sha256: "nope" }))).toBe("InvalidAssetSource");
    expect(await code(initNumericWasm({} as never))).toBe("InvalidAssetSource");
    expect(
      await code(
        initNumericWasm({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
      ),
    ).toBe("AssetFetchFailed");
    const empty = new Uint8Array(0);
    expect(await code(initNumericWasm(empty, { sha256: sha(empty) }))).toBe("AlreadyInitialized");
  });

  it("reuses the realm's engine for the same digest, including fetch-style responses", async () => {
    const again = await initNumericWasm({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    });
    expect(again).toBe(kernel);
    const both = await Promise.all([initNumericWasm(bytes), initNumericWasm(bytes)]);
    expect(both[0]).toBe(kernel);
    expect(both[1]).toBe(kernel);
  });

  it("refuses modules that do not match the glue in a fresh realm without claiming it", async () => {
    vi.resetModules();
    const fresh = await import("../../src/evaluation/wasm");
    const empty = new Uint8Array(0);
    expect(await code(fresh.initNumericWasm(empty, { sha256: sha(empty) }))).toBe("InvalidModule");
    // An import-free module that is valid WASM but lacks the glue contract.
    const bare = Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0);
    expect(await code(fresh.initNumericWasm(bare, { sha256: sha(bare) }))).toBe("InvalidModule");
    const engine = await fresh.initNumericWasm(bytes);
    const quantity = vectors.find((v) => v.profile === "quantity");
    expect(engine.evaluateRequest(quantity?.request_json ?? "")).toBe(quantity?.expected_wire);
  });
});
