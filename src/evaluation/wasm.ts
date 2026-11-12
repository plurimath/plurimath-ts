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
 * The Rust library evaluates the serialized requests. This module is
 * transport only: there is no TypeScript fallback, and it does not import the
 * TypeScript evaluator. The shipped kernel handles numeric, quantity, and GUM
 * requests through its own
 * verbatim wasm-bindgen glue (`quantity-wasm/plurimath_numeric.js`). The
 * asset's SHA-256 is checked before compilation; a different build is accepted
 * only when the caller names its digest explicitly through `options.sha256`.
 *
 * The generated glue holds one instance per module realm, so the first
 * successful `initNumericWasm` owns this realm's engine: later calls with the
 * same verified digest reuse it, and a different digest is refused with
 * `AlreadyInitialized`.
 */
import initGlue from "./quantity-wasm/plurimath_numeric.js";

/** The asset this release ships and pins (`assets/wasm/manifest.json`). */
export const NUMERIC_WASM_ASSET = Object.freeze({
  file: "plurimath_numeric.wasm",
  specifier: "@plurimath/plurimath-ts/evaluation/plurimath_numeric.wasm",
  sha256: "2c973c9e7c4403cd9a0f7bed2ca3605beb7735838e671675f5a9d2ede417a368",
  bytes: 7301547,
  abi: 1,
  schema: "plurimath.evaluate.numeric/1",
  schemas: Object.freeze([
    "plurimath.evaluate.numeric/1",
    "plurimath.evaluate.quantity/1",
    "plurimath.evaluate.gum/1",
  ]),
  source: Object.freeze({
    crate: "plurimath-numeric",
    version: "0.1.0",
    crateSha256: "09fe6954bfc62c2f9588a2afcc0152e8b985de1e39d7070d045ac2b6e2531f5d",
    revision: "f8b3f2c84105efd6e0291c1a247c2a450d692720",
    feature: "quantity",
  }),
  /** wasm-bindgen 0.2.130 `--target web` glue, bundled verbatim. */
  glue: Object.freeze({
    file: "plurimath_numeric.js",
    sha256: "7455faeb6e8aa4f77680f54e6fa2a40ab8eee8e57c3e499b32dc6cc8f24962e6",
  }),
  /** The pinned build also evaluates `plurimath.evaluate.quantity/1`. */
  quantity: true,
} as const);

export type NumericWasmErrorCode =
  | "InvalidAssetSource"
  | "WasmUnavailable"
  | "AssetFetchFailed"
  | "DigestUnavailable"
  | "AssetDigestMismatch"
  | "InvalidModule"
  | "UnsupportedAbi"
  | "AlreadyInitialized"
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
interface WasmModuleDescriptor {
  readonly module: string;
  readonly name: string;
}
interface WasmApi {
  compile(bytes: Uint8Array): Promise<object>;
  Module: {
    exports(module: object): readonly WasmModuleDescriptor[];
    imports(module: object): readonly WasmModuleDescriptor[];
  };
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
/** Host imports the bundled glue provides (`__wbg_get_imports`). */
const GLUE_MODULE = "./plurimath_numeric_bg.js";
const GLUE_IMPORTS = new Set([
  "__wbg___wbindgen_throw_4c88d8bf264fd984",
  "__wbg_getRandomValues_5d8c030b527203a6",
  "__wbindgen_init_externref_table",
]);

/** This realm's engine: the glue instantiates once per module realm. */
let engine: { readonly sha256: string; readonly ready: Promise<NumericWasmEvaluator> } | undefined;

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
 * Verify, compile and instantiate the kernel through the bundled glue. The
 * first success owns this realm's engine; later calls with the same digest
 * return that same evaluator, which serves any number of requests.
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
  if (engine) {
    if (engine.sha256 !== actual)
      throw new NumericWasmError(
        "AlreadyInitialized",
        `this realm already runs the WASM asset ${engine.sha256}; it cannot also load ${actual}`,
      );
    return engine.ready;
  }
  const wasm = (globalThis as { WebAssembly?: WasmApi }).WebAssembly;
  if (typeof wasm?.compile !== "function")
    throw new NumericWasmError("WasmUnavailable", "this runtime has no WebAssembly API");
  let module: object;
  try {
    module = await wasm.compile(bytes);
  } catch (error) {
    throw new NumericWasmError("InvalidModule", `cannot compile the WASM asset: ${error}`);
  }
  const exported = new Set(wasm.Module.exports(module).map((entry) => entry.name));
  if (
    !exported.has("memory") ||
    !exported.has("__wbindgen_start") ||
    KERNEL_FUNCTIONS.some((name) => !exported.has(name)) ||
    wasm.Module.imports(module).some(
      (entry) => entry.module !== GLUE_MODULE || !GLUE_IMPORTS.has(entry.name),
    )
  )
    throw new NumericWasmError(
      "InvalidModule",
      "the WASM asset does not match the bundled glue and numeric kernel ABI",
    );
  // A concurrent call may have claimed the realm while this one compiled.
  if (engine) return initNumericWasm(bytes, { sha256: actual });
  const ready = (async () => {
    let native: KernelExports;
    try {
      native = (await initGlue({
        module_or_path: module as never,
      })) as unknown as KernelExports;
    } catch (error) {
      throw new NumericWasmError("InvalidModule", `cannot instantiate the WASM asset: ${error}`);
    }
    if (native.plurimath_numeric_abi_version() !== 1)
      throw new NumericWasmError("UnsupportedAbi", "unsupported numeric kernel ABI");
    return createEvaluator(native, { sha256: actual, bytes: bytes.length, abi: 1 });
  })();
  engine = { sha256: actual, ready };
  return ready;
}

/** The ABI-v1 instance exports the transport reads. */
export interface NumericWasmKernelExports {
  readonly memory: { readonly buffer: ArrayBuffer };
  plurimath_numeric_abi_version(): number;
  plurimath_numeric_alloc(length: number): number;
  plurimath_numeric_dealloc(pointer: number, length: number): void;
  plurimath_numeric_evaluate(pointer: number, length: number): number;
  plurimath_numeric_result_free(pointer: number): void;
}

/**
 * Explicit asset-replacement path: wrap ABI-v1 exports that the caller's own
 * host glue already initialized (for example a separately built kernel whose
 * generated `init` needs host imports). The caller owns that asset's
 * verification and states its digest and size; nothing is fetched or checked
 * here beyond the ABI. Returns the same evaluator as `initNumericWasm`.
 */
export function numericWasmFromExports(
  exports: NumericWasmKernelExports,
  asset: { readonly sha256: string; readonly bytes: number },
): NumericWasmEvaluator {
  if (!SHA256.test(asset?.sha256 ?? "") || !Number.isInteger(asset.bytes) || asset.bytes <= 0)
    throw new NumericWasmError(
      "InvalidAssetSource",
      "asset needs a lowercase hex sha256 and a byte size",
    );
  const native = exports as unknown as KernelExports;
  if (
    !(native?.memory?.buffer instanceof ArrayBuffer) ||
    KERNEL_FUNCTIONS.some((name) => typeof native[name] !== "function")
  )
    throw new NumericWasmError("InvalidModule", "the exports lack the numeric kernel ABI");
  if (native.plurimath_numeric_abi_version() !== 1)
    throw new NumericWasmError("UnsupportedAbi", "unsupported numeric kernel ABI");
  return createEvaluator(native, { sha256: asset.sha256, bytes: asset.bytes, abi: 1 });
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
        "this kernel instance failed earlier; load a fresh module realm",
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
