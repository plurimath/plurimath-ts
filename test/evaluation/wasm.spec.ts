/** biome-ignore-all lint/style/useNamingConvention: vector keys are the kernel fixtures' snake_case. */
/**
 * The `./evaluation/wasm` facade against the pinned Rust kernel asset and the
 * kernel's own frozen request vectors (assets/wasm/manifest.json pins both).
 * Every expected wire is the kernel's; nothing here is computed in TypeScript.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
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
  request: unknown;
  expected_wire: string;
}
const vectors: [string, Vector][] = Object.keys(manifest.vectors).flatMap((file) => {
  const body = readFileSync(join(fixtures, file));
  expect(createHash("sha256").update(body).digest("hex")).toBe(manifest.vectors[file].sha256);
  return (JSON.parse(body.toString("utf8")).cases as Vector[]).map((c) => [file, c]);
});

describe("evaluation/wasm", () => {
  let kernel: NumericWasmEvaluator;
  beforeAll(async () => {
    kernel = await initNumericWasm(bytes);
  });

  it("pins the asset the manifest records", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.sha256);
    expect(NUMERIC_WASM_ASSET.sha256).toBe(manifest.sha256);
    expect(NUMERIC_WASM_ASSET.bytes).toBe(manifest.bytes);
    expect(NUMERIC_WASM_ASSET.quantity).toBe(false);
    expect(kernel.asset).toEqual({ sha256: manifest.sha256, bytes: manifest.bytes, abi: 1 });
  });

  it(`reproduces all ${manifest.vectors_total} exact wires on one reused instance`, () => {
    expect(vectors).toHaveLength(manifest.vectors_total);
    for (const [file, vector] of vectors) {
      expect(kernel.evaluateRequest(JSON.stringify(vector.request)), `${file} ${vector.id}`).toBe(
        vector.expected_wire,
      );
    }
    // A second pass on the same instance: reuse does not drift.
    for (const [, vector] of vectors) {
      expect(kernel.evaluateRequest(JSON.stringify(vector.request))).toBe(vector.expected_wire);
    }
  });

  it("refuses non-strings through the kernel's own InvalidRequest wire", () => {
    const wire = kernel.evaluateRequest(42 as unknown as string);
    expect(JSON.parse(wire)).toMatchObject({ ok: false, error: { code: "InvalidRequest" } });
    expect(kernel.evaluateRequest("{")).toBe(wire);
  });

  it("refuses unpinned or invalid assets with typed errors", async () => {
    const tampered = Uint8Array.from(bytes);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    const code = (promise: Promise<unknown>) =>
      promise.then(
        () => "resolved",
        (error) => (error instanceof NumericWasmError ? error.code : String(error)),
      );
    expect(await code(initNumericWasm(tampered))).toBe("AssetDigestMismatch");
    expect(await code(initNumericWasm(bytes, { sha256: "nope" }))).toBe("InvalidAssetSource");
    expect(await code(initNumericWasm({} as never))).toBe("InvalidAssetSource");
    expect(
      await code(
        initNumericWasm({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
      ),
    ).toBe("AssetFetchFailed");
    const empty = new Uint8Array(0);
    const emptyDigest = createHash("sha256").update(empty).digest("hex");
    expect(await code(initNumericWasm(empty, { sha256: emptyDigest }))).toBe("InvalidModule");
  });

  it("gives independent instances and accepts a fetch-style response", async () => {
    const other = await initNumericWasm({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    });
    expect(other).not.toBe(kernel);
    const [, first] = vectors[0] ?? [];
    expect(other.evaluateRequest(JSON.stringify(first?.request))).toBe(first?.expected_wire);
  });
});
