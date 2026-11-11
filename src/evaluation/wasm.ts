/** biome-ignore-all lint/style/useNamingConvention: the kernel ABI-v1 export names and the WebAssembly.Memory constructor are fixed by the platform. */
/**
 * Optional canonical numeric evaluator: the Rust `plurimath-numeric` kernel
 * compiled to WebAssembly (ABI v1), behind the same JSON-in/JSON-out contract
 * as the root `evaluateRequest`.
 *
 * Importing this module never loads, fetches or instantiates WASM. The caller
 * initializes explicitly with the distributable asset
 * (`@plurimath/plurimath-ts/evaluation/plurimath_numeric.wasm`) as bytes, a
 * `fetch` response or a URL. Nothing here touches `node:*`, the filesystem or
 * ambient configuration, so the same entry runs in browsers and in Node.
 *
 * The Rust library owns every numeric answer. This module is transport only:
 * there is no TypeScript fallback, and it does not import the TypeScript
 * evaluator. The asset's SHA-256 is checked before compilation; a different
 * (for example quantity-enabled) build is accepted only when the caller names
 * its digest explicitly through `options.sha256`.
 */

/** The asset this release ships and pins (`assets/wasm/manifest.json`). */
export const NUMERIC_WASM_ASSET = Object.freeze({
  file: "plurimath_numeric.wasm",
  specifier: "@plurimath/plurimath-ts/evaluation/plurimath_numeric.wasm",
  sha256: "5c1412d8eb7456bc7bf766cad3255a7bf44954b5f5965f6b05a73b3c42c53cea",
  bytes: 790352,
  abi: 1,
  schema: "plurimath.evaluate.numeric/1",
  source: Object.freeze({
    crate: "plurimath-numeric",
    version: "0.1.0",
    crateSha256: "b310a6968a4c17496357b910fd9e05cb67591e7c102e0efc33a80807bbe1a718",
    revision: "7f986456",
  }),
  /** The pinned build evaluates `plurimath.evaluate.numeric/1` only. */
  quantity: false,
} as const);

export type NumericWasmErrorCode =
  | "InvalidAssetSource"
  | "WasmUnavailable"
  | "AssetFetchFailed"
  | "DigestUnavailable"
  | "AssetDigestMismatch"
  | "InvalidModule"
  | "UnsupportedAbi"
  | "KernelFailure";

/** Typed refusal from the WASM transport; never a numeric answer. */
export class NumericWasmError extends Error {
  readonly code: NumericWasmErrorCode;
  constructor(code: NumericWasmErrorCode, message: string) {
    super(message);
    this.name = "NumericWasmError";
    this.code = code;
  }
}

/** Structural subset of a `fetch` `Response`. */
export interface NumericWasmResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
/** A URL is fetched with `globalThis.fetch`; bytes are used as given. */
export type NumericWasmSource =
  | ArrayBuffer
  | ArrayBufferView
  | NumericWasmResponse
  | PromiseLike<NumericWasmResponse>
  | URL;

export interface NumericWasmOptions {
  /**
   * Expected lowercase hex SHA-256 of the asset. Defaults to
   * `NUMERIC_WASM_ASSET.sha256`; set it only to load a different,
   * separately proven ABI-v1 build.
   */
  readonly sha256?: string;
}

export interface NumericWasmEvaluator {
  /** Digest and size of the bytes this instance was compiled from. */
  readonly asset: { readonly sha256: string; readonly bytes: number; readonly abi: 1 };
  /** Same signature and wire contract as the root `evaluateRequest`. */
  evaluateRequest(json: string): string;
}

/** The WebAssembly JS API surface used here (the project's lib is ES2022 only). */
interface WasmApi {
  instantiate(
    bytes: Uint8Array,
    imports: object,
  ): Promise<{ instance: { exports: Record<string, unknown> } }>;
  Memory: abstract new (...args: never[]) => { readonly buffer: ArrayBuffer };
}
interface KernelExports {
  memory: { readonly buffer: ArrayBuffer };
  plurimath_numeric_abi_version(): number;
  plurimath_numeric_alloc(length: number): number;
  plurimath_numeric_dealloc(pointer: number, length: number): void;
  plurimath_numeric_evaluate(pointer: number, length: number): number;
  plurimath_numeric_result_free(pointer: number): void;
}
const KERNEL_FUNCTIONS = [
  "plurimath_numeric_abi_version",
  "plurimath_numeric_alloc",
  "plurimath_numeric_dealloc",
  "plurimath_numeric_evaluate",
  "plurimath_numeric_result_free",
] as const;
const SHA256 = /^[0-9a-f]{64}$/;

async function bytesOf(source: NumericWasmSource): Promise<Uint8Array> {
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  if (ArrayBuffer.isView(source))
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
  let response: unknown = source;
  if (typeof URL === "function" && source instanceof URL) {
    if (typeof globalThis.fetch !== "function")
      throw new NumericWasmError("InvalidAssetSource", "fetch is unavailable; pass the bytes");
    try {
      response = await globalThis.fetch(source);
    } catch (error) {
      throw new NumericWasmError("AssetFetchFailed", `cannot fetch ${source.href}: ${error}`);
    }
  } else if (response && typeof (response as PromiseLike<unknown>).then === "function") {
    response = await (response as PromiseLike<unknown>);
  }
  const candidate = response as Partial<NumericWasmResponse> | null;
  if (!candidate || typeof candidate.arrayBuffer !== "function")
    throw new NumericWasmError(
      "InvalidAssetSource",
      "expected WASM bytes, a fetch Response or a URL",
    );
  if (candidate.ok !== true)
    throw new NumericWasmError("AssetFetchFailed", `asset response status ${candidate.status}`);
  return new Uint8Array(await candidate.arrayBuffer());
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle)
    throw new NumericWasmError(
      "DigestUnavailable",
      "crypto.subtle is unavailable (browsers expose it only in secure contexts)",
    );
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify, compile and instantiate the kernel. Each call returns an
 * independent instance; one instance serves any number of requests.
 */
export async function initNumericWasm(
  source: NumericWasmSource,
  options: NumericWasmOptions = {},
): Promise<NumericWasmEvaluator> {
  const expected = options.sha256 ?? NUMERIC_WASM_ASSET.sha256;
  if (!SHA256.test(expected))
    throw new NumericWasmError(
      "InvalidAssetSource",
      "options.sha256 must be 64 lowercase hex digits",
    );
  const bytes = await bytesOf(source);
  const actual = await sha256(bytes);
  if (actual !== expected)
    throw new NumericWasmError(
      "AssetDigestMismatch",
      `WASM asset sha256 ${actual} does not match the expected ${expected}`,
    );
  const wasm = (globalThis as { WebAssembly?: WasmApi }).WebAssembly;
  if (typeof wasm?.instantiate !== "function")
    throw new NumericWasmError("WasmUnavailable", "this runtime has no WebAssembly API");
  let native: KernelExports;
  try {
    const { instance } = await wasm.instantiate(bytes, {});
    native = instance.exports as unknown as KernelExports;
  } catch (error) {
    throw new NumericWasmError("InvalidModule", `cannot instantiate the WASM asset: ${error}`);
  }
  if (
    !(native.memory instanceof wasm.Memory) ||
    KERNEL_FUNCTIONS.some((name) => typeof native[name] !== "function")
  )
    throw new NumericWasmError("InvalidModule", "the WASM asset lacks the numeric kernel ABI");
  if (native.plurimath_numeric_abi_version() !== 1)
    throw new NumericWasmError("UnsupportedAbi", "unsupported numeric kernel ABI");
  return createEvaluator(native, { sha256: actual, bytes: bytes.length, abi: 1 });
}

/** ABI-v1 transport, as in the kernel's `bindings/js/kernel.js`. */
function createEvaluator(
  native: KernelExports,
  asset: NumericWasmEvaluator["asset"],
): NumericWasmEvaluator {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let failed = false;
  const evaluateJson = (input: string): string => {
    if (failed)
      throw new NumericWasmError(
        "KernelFailure",
        "this kernel instance failed earlier; initialize a new one",
      );
    const data = encoder.encode(input);
    let source = 0;
    let result = 0;
    try {
      source = native.plurimath_numeric_alloc(data.length);
      new Uint8Array(native.memory.buffer, source, data.length).set(data);
      result = native.plurimath_numeric_evaluate(source, data.length);
      if (!result) throw new NumericWasmError("KernelFailure", "numeric kernel runtime failure");
      const memory = new Uint8Array(native.memory.buffer);
      let end = result;
      while (end < memory.length && memory[end] !== 0) end++;
      if (end === memory.length)
        throw new NumericWasmError("KernelFailure", "unterminated kernel result");
      return decoder.decode(memory.subarray(result, end));
    } catch (error) {
      failed = true;
      if (error instanceof NumericWasmError) throw error;
      throw new NumericWasmError("KernelFailure", `numeric kernel trapped: ${error}`);
    } finally {
      if (!failed) {
        if (result) native.plurimath_numeric_result_free(result);
        native.plurimath_numeric_dealloc(source, data.length);
      }
    }
  };
  return Object.freeze({
    asset: Object.freeze({ ...asset }),
    // A non-string is not a request; the kernel's own answer to non-object JSON is the refusal.
    evaluateRequest: (json: string): string =>
      evaluateJson(typeof json === "string" ? json : "null"),
  });
}
