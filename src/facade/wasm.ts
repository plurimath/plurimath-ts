/** biome-ignore-all lint/style/useNamingConvention: the facade ABI-v1 export names, the native wire keys and the WebAssembly.Memory constructor are fixed by the platform. */
/**
 * The native Plurimath format facade: the Rust `plurimath-facade` crate
 * compiled to WebAssembly (ABI v1), exposed through its JSON request wire.
 *
 * Parsing, the common model, options and writers all belong to the native
 * facade. This module is transport only: it owns the request input bytes it
 * allocates in the instance's memory, frees every native result exactly once,
 * maps native refusals to `FacadeError`, and keeps a model as the native
 * `{class, fields}` wire. It does not import any TypeScript parser, renderer or
 * evaluator, and it has no fallback.
 *
 * Importing this module never loads, fetches or instantiates WASM. The caller
 * initializes explicitly with the distributable asset
 * (`@plurimath/plurimath-ts/facade/plurimath_facade.wasm`) as bytes, a `fetch`
 * response or a URL. Nothing here touches `node:*`, the filesystem or ambient
 * configuration, so the same entry runs in browsers and in Node.
 *
 * The asset's SHA-256 is checked before compilation; a different build is
 * accepted only when the caller names its digest through `options.sha256`.
 * The bundled official wasm-bindgen glue holds one instance per module realm,
 * so the first successful `initFacadeWasm` owns this realm's facade: later
 * calls with the same digest reuse it, and a different digest is refused with
 * `AlreadyInitialized`.
 */
import { FACADE_WASM_ASSET } from "./asset";
import initGlue from "./facade-wasm/facade.js";

export { FACADE_WASM_ASSET };

/** Profile name of an explicitly typed Ruby value-tree source document. */
export const RUBY_VALUES_PROFILE = "plurimath.ruby-values/1";

/** Input formats the native parser accepts (`unicode` is an alias of `unicodemath`). */
export type FacadeInputFormat =
  | "asciimath"
  | "html"
  | "latex"
  | "mathml"
  | "omml"
  | "pma"
  | "unicodemath"
  | "unicode"
  | "unitsml";

/** Output formats the native writers produce. */
export type FacadeOutputFormat = "asciimath" | "latex" | "unicodemath" | "html" | "mathml" | "omml";

/** The native common-model wire: a source class name and its fields. */
export interface FacadeModel {
  readonly class: string;
  readonly fields: { readonly [field: string]: unknown };
}

/**
 * Parse options, passed to the native parser unchanged (for example `locale`,
 * `decimal` or `display_style`); the native facade validates them.
 */
export type FacadeParseOptions = { readonly [option: string]: unknown };

/**
 * Writer options, passed to the native writer unchanged. `formatterOptions`
 * takes the native formatter object, including its standard/base profile;
 * `null` or `false` disables formatting.
 */
export type FacadeWriteOptions = { readonly [option: string]: unknown };

/** The native refusal object: `code` and `message`, plus `source_class` when the source raises. */
export interface FacadeErrorDetails {
  readonly code: string;
  readonly message?: string;
  readonly source_class?: string;
  readonly [key: string]: unknown;
}

/** A structured refusal from the native facade (`ok: false`). */
export class FacadeError extends Error {
  /** Native error code, for example `PARSE_ERROR`, `invalid_request` or `render_error`. */
  readonly code: string;
  /** The Ruby source exception class, when the native facade reports one. */
  readonly sourceClass: string | undefined;
  /** The complete native error object. */
  readonly details: FacadeErrorDetails;
  constructor(details: FacadeErrorDetails) {
    super(typeof details.message === "string" ? details.message : JSON.stringify(details));
    this.name = "FacadeError";
    this.code = details.code;
    this.sourceClass = typeof details.source_class === "string" ? details.source_class : undefined;
    this.details = details;
  }
}

export type FacadeWasmErrorCode =
  | "InvalidAssetSource"
  | "WasmUnavailable"
  | "AssetFetchFailed"
  | "DigestUnavailable"
  | "AssetDigestMismatch"
  | "InvalidModule"
  | "UnsupportedAbi"
  | "AlreadyInitialized"
  | "KernelFailure"
  | "ProtocolError";

/** Typed failure of loading or transport; never a format answer. */
export class FacadeWasmError extends Error {
  readonly code: FacadeWasmErrorCode;
  constructor(code: FacadeWasmErrorCode, message: string) {
    super(message);
    this.name = "FacadeWasmError";
    this.code = code;
  }
}

/** Structural subset of a `fetch` `Response`. */
export interface FacadeWasmResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
/** A URL is fetched once with `globalThis.fetch`; bytes are used as given. */
export type FacadeWasmSource =
  | ArrayBuffer
  | ArrayBufferView
  | FacadeWasmResponse
  | PromiseLike<FacadeWasmResponse>
  | URL;

export interface FacadeWasmOptions {
  /**
   * Expected lowercase hex SHA-256 of the asset. Defaults to
   * `FACADE_WASM_ASSET.sha256`; set it only to load a different, separately
   * proven ABI-v1 build.
   */
  readonly sha256?: string;
}

/** Native allocation and release counts of one facade instance. */
export interface FacadeAccounting {
  /** `plurimath_facade_json` calls. */
  readonly calls: number;
  /** Input buffers obtained from `plurimath_facade_alloc`. */
  readonly allocations: number;
  /** Results released with `plurimath_facade_free`. */
  readonly resultFrees: number;
  /** Input buffers released with `plurimath_facade_dealloc`. */
  readonly inputFrees: number;
}

/** The successful native envelope. */
export interface FacadeEnvelope {
  readonly abi_version: 1;
  readonly ok: true;
  readonly model?: unknown;
  readonly output?: unknown;
  readonly [key: string]: unknown;
}

export interface FacadeKernel {
  /** Digest and size of the bytes this instance was compiled from. */
  readonly asset: { readonly sha256: string; readonly bytes: number; readonly abi: 1 };
  /**
   * The raw wire: one UTF-8 JSON request in, the native JSON envelope out,
   * unchanged, including `ok: false` refusals.
   */
  requestJson(json: string): string;
  /** Send a JSON-compatible request; returns the `ok: true` envelope or throws `FacadeError`. */
  request(value: unknown): FacadeEnvelope;
  /** Parse with the native parser; `options` go to the parser unchanged. */
  parse(text: string, format: FacadeInputFormat, options?: FacadeParseOptions): Formula;
  /** Retain a common model after validation by the native core. */
  fromModel(model: FacadeModel): Formula;
  /** Validate and own a `plurimath.ruby-values/1` source document. */
  fromSourceModel(document: unknown): SourceFormula;
  /** Counts of native calls, allocations and releases so far. */
  accounting(): FacadeAccounting;
}

const encode = (value: unknown): string => {
  const text = JSON.stringify(value);
  if (typeof text !== "string") throw new TypeError("the facade request is not JSON-serializable");
  return text;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A native common-model value with native writers; its model is an owned snapshot. */
export class Formula {
  readonly #kernel: FacadeKernel;
  readonly #modelJson: string;

  /** @internal Use `FacadeKernel.parse`, `fromModel` or `fromSourceModel`. */
  constructor(kernel: FacadeKernel, modelJson: string) {
    this.#kernel = kernel;
    this.#modelJson = modelJson;
  }

  /** A fresh copy of the model wire; changing it never changes this formula. */
  get model(): FacadeModel {
    return JSON.parse(this.#modelJson);
  }

  protected writeRequest(format: FacadeOutputFormat, options: FacadeWriteOptions): object {
    return { op: "write", format, model: this.model, options };
  }

  /** Write with the native writer; `options` go to the writer unchanged. */
  write(format: FacadeOutputFormat, options: FacadeWriteOptions = {}): string {
    const reply = this.#kernel.request(this.writeRequest(format, options));
    if (typeof reply.output !== "string")
      throw new FacadeWasmError("ProtocolError", "the facade returned a non-string writer result");
    return reply.output;
  }

  toAsciimath(options?: FacadeWriteOptions): string {
    return this.write("asciimath", options);
  }
  toLatex(options?: FacadeWriteOptions): string {
    return this.write("latex", options);
  }
  toMathml(options?: FacadeWriteOptions): string {
    return this.write("mathml", options);
  }
  toOmml(options?: FacadeWriteOptions): string {
    return this.write("omml", options);
  }
  toUnicodemath(options?: FacadeWriteOptions): string {
    return this.write("unicodemath", options);
  }
  toHtml(options?: FacadeWriteOptions): string {
    return this.write("html", options);
  }
}

/**
 * Owned snapshot of an explicitly typed Ruby value-tree document. The profile
 * preserves value kinds, not Ruby object identity; writers receive the
 * document with its `source_profile`.
 */
export class SourceFormula extends Formula {
  readonly sourceProfile = RUBY_VALUES_PROFILE;

  /** A fresh copy of the typed source document, including its producer assertions. */
  get sourceModel(): { readonly [key: string]: unknown } {
    return this.model as unknown as { readonly [key: string]: unknown };
  }

  protected override writeRequest(format: FacadeOutputFormat, options: FacadeWriteOptions): object {
    return { ...super.writeRequest(format, options), source_profile: RUBY_VALUES_PROFILE };
  }
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
}

/** The ABI-v1 instance exports the transport reads. */
export interface FacadeWasmKernelExports {
  readonly memory: { readonly buffer: ArrayBuffer };
  plurimath_facade_abi_version(): number;
  plurimath_facade_alloc(length: number): number;
  plurimath_facade_dealloc(pointer: number, length: number): void;
  plurimath_facade_json(pointer: number, length: number): number;
  plurimath_facade_free(pointer: number): void;
}
const FACADE_FUNCTIONS = [
  "plurimath_facade_abi_version",
  "plurimath_facade_alloc",
  "plurimath_facade_dealloc",
  "plurimath_facade_json",
  "plurimath_facade_free",
] as const;
const SHA256 = /^[0-9a-f]{64}$/;
/** Host imports the bundled glue provides (`__wbg_get_imports`). */
const GLUE_MODULE = "./facade_bg.js";
const GLUE_IMPORTS = new Set([
  "__wbg_Error_208446807d0d1e30",
  "__wbg___wbindgen_string_get_7ce8eee7fd327545",
  "__wbg___wbindgen_throw_4c88d8bf264fd984",
  "__wbg_getRandomValues_5d8c030b527203a6",
  "__wbindgen_generic_0000000000000001",
  "__wbindgen_init_externref_table",
]);

/** This realm's facade: the glue instantiates once per module realm. */
let engine: { readonly sha256: string; readonly ready: Promise<FacadeKernel> } | undefined;

async function bytesOf(source: FacadeWasmSource): Promise<Uint8Array> {
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  if (ArrayBuffer.isView(source))
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
  let response: unknown = source;
  if (typeof URL === "function" && source instanceof URL) {
    if (typeof globalThis.fetch !== "function")
      throw new FacadeWasmError("InvalidAssetSource", "fetch is unavailable; pass the bytes");
    try {
      response = await globalThis.fetch(source);
    } catch (error) {
      throw new FacadeWasmError("AssetFetchFailed", `cannot fetch ${source.href}: ${error}`);
    }
  } else if (response && typeof (response as PromiseLike<unknown>).then === "function") {
    response = await (response as PromiseLike<unknown>);
  }
  const candidate = response as Partial<FacadeWasmResponse> | null;
  if (!candidate || typeof candidate.arrayBuffer !== "function")
    throw new FacadeWasmError(
      "InvalidAssetSource",
      "expected WASM bytes, a fetch Response or a URL",
    );
  if (candidate.ok !== true)
    throw new FacadeWasmError("AssetFetchFailed", `asset response status ${candidate.status}`);
  return new Uint8Array(await candidate.arrayBuffer());
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle)
    throw new FacadeWasmError(
      "DigestUnavailable",
      "crypto.subtle is unavailable (browsers expose it only in secure contexts)",
    );
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify, compile and instantiate the facade through the bundled glue. The
 * first success owns this realm's facade; later calls with the same digest
 * return that same kernel, which serves any number of requests.
 */
export async function initFacadeWasm(
  source: FacadeWasmSource,
  options: FacadeWasmOptions = {},
): Promise<FacadeKernel> {
  const expected = options.sha256 ?? FACADE_WASM_ASSET.sha256;
  if (expected === null)
    throw new FacadeWasmError(
      "InvalidAssetSource",
      "this build pins no facade WASM asset; pass options.sha256 for a separately proven build",
    );
  if (!SHA256.test(expected))
    throw new FacadeWasmError(
      "InvalidAssetSource",
      "options.sha256 must be 64 lowercase hex digits",
    );
  const bytes = await bytesOf(source);
  const actual = await sha256(bytes);
  if (actual !== expected)
    throw new FacadeWasmError(
      "AssetDigestMismatch",
      `WASM asset sha256 ${actual} does not match the expected ${expected}`,
    );
  if (engine) {
    if (engine.sha256 !== actual)
      throw new FacadeWasmError(
        "AlreadyInitialized",
        `this realm already runs the facade asset ${engine.sha256}; it cannot also load ${actual}`,
      );
    return engine.ready;
  }
  const wasm = (globalThis as { WebAssembly?: WasmApi }).WebAssembly;
  if (typeof wasm?.compile !== "function")
    throw new FacadeWasmError("WasmUnavailable", "this runtime has no WebAssembly API");
  let module: object;
  try {
    module = await wasm.compile(bytes);
  } catch (error) {
    throw new FacadeWasmError("InvalidModule", `cannot compile the WASM asset: ${error}`);
  }
  const exported = new Set(wasm.Module.exports(module).map((entry) => entry.name));
  if (
    !exported.has("memory") ||
    !exported.has("__wbindgen_start") ||
    FACADE_FUNCTIONS.some((name) => !exported.has(name)) ||
    wasm.Module.imports(module).some(
      (entry) => entry.module !== GLUE_MODULE || !GLUE_IMPORTS.has(entry.name),
    )
  )
    throw new FacadeWasmError(
      "InvalidModule",
      "the WASM asset does not match the bundled glue and facade ABI",
    );
  // A concurrent call may have claimed the realm while this one compiled.
  if (engine) return initFacadeWasm(bytes, { sha256: actual });
  const ready = (async () => {
    let native: FacadeWasmKernelExports;
    try {
      native = (await initGlue({
        module_or_path: module as never,
      })) as unknown as FacadeWasmKernelExports;
    } catch (error) {
      throw new FacadeWasmError("InvalidModule", `cannot instantiate the WASM asset: ${error}`);
    }
    if (native.plurimath_facade_abi_version() !== 1)
      throw new FacadeWasmError("UnsupportedAbi", "unsupported facade ABI");
    return createKernel(native, { sha256: actual, bytes: bytes.length, abi: 1 });
  })();
  engine = { sha256: actual, ready };
  return ready;
}

/**
 * Explicit asset-replacement path: wrap ABI-v1 exports that the caller's own
 * host glue already initialized. The caller owns that asset's verification and
 * states its digest and size; nothing is fetched or checked here beyond the
 * ABI. Returns the same kernel as `initFacadeWasm`.
 */
export function facadeWasmFromExports(
  exports: FacadeWasmKernelExports,
  asset: { readonly sha256: string; readonly bytes: number },
): FacadeKernel {
  if (!SHA256.test(asset?.sha256 ?? "") || !Number.isInteger(asset.bytes) || asset.bytes <= 0)
    throw new FacadeWasmError(
      "InvalidAssetSource",
      "asset needs a lowercase hex sha256 and a byte size",
    );
  if (
    !(exports?.memory?.buffer instanceof ArrayBuffer) ||
    FACADE_FUNCTIONS.some((name) => typeof exports[name] !== "function")
  )
    throw new FacadeWasmError("InvalidModule", "the exports lack the facade ABI");
  if (exports.plurimath_facade_abi_version() !== 1)
    throw new FacadeWasmError("UnsupportedAbi", "unsupported facade ABI");
  return createKernel(exports, { sha256: asset.sha256, bytes: asset.bytes, abi: 1 });
}

/**
 * ABI-v1 transport. Input: `plurimath_facade_alloc(length)`, copy the UTF-8
 * request, `plurimath_facade_json(pointer, length)`. Output: read the owned
 * NUL-terminated UTF-8 result, release it once with `plurimath_facade_free`,
 * then release the input with `plurimath_facade_dealloc(pointer, length)`,
 * also when decoding fails. A request above the native 16 MiB limit gets no
 * allocation; the native facade itself answers it with its refusal envelope.
 * A WebAssembly trap leaves the instance's state unknown, so the kernel stops
 * serving requests instead of releasing into it.
 */
function createKernel(native: FacadeWasmKernelExports, asset: FacadeKernel["asset"]): FacadeKernel {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const counts = { calls: 0, allocations: 0, resultFrees: 0, inputFrees: 0 };
  let trapped = false;

  const requestJson = (json: string): string => {
    if (trapped)
      throw new FacadeWasmError(
        "KernelFailure",
        "this facade instance trapped earlier; load a fresh module realm",
      );
    if (typeof json !== "string") throw new TypeError("requestJson takes a JSON string");
    const data = encoder.encode(json);
    let input = 0;
    let result = 0;
    let stage: "native" | "decode" = "native";
    try {
      if (data.length <= FACADE_WASM_ASSET.maxRequestBytes) {
        input = native.plurimath_facade_alloc(data.length);
        if (!input) throw new FacadeWasmError("KernelFailure", "facade input allocation refused");
        counts.allocations++;
        new Uint8Array(native.memory.buffer, input, data.length).set(data);
      }
      result = native.plurimath_facade_json(input, data.length);
      counts.calls++;
      stage = "decode";
      if (!result) throw new FacadeWasmError("ProtocolError", "the facade returned a null result");
      const memory = new Uint8Array(native.memory.buffer);
      let end = result;
      while (end < memory.length && memory[end] !== 0) end++;
      if (end === memory.length)
        throw new FacadeWasmError("ProtocolError", "unterminated facade result");
      try {
        return decoder.decode(memory.subarray(result, end));
      } catch (error) {
        throw new FacadeWasmError("ProtocolError", `the facade result is not UTF-8: ${error}`);
      }
    } catch (error) {
      if (stage === "native" && !(error instanceof FacadeWasmError)) {
        trapped = true;
        throw new FacadeWasmError("KernelFailure", `the facade trapped: ${error}`);
      }
      throw error;
    } finally {
      if (!trapped) {
        if (result) {
          native.plurimath_facade_free(result);
          counts.resultFrees++;
        }
        if (input) {
          native.plurimath_facade_dealloc(input, data.length);
          counts.inputFrees++;
        }
      }
    }
  };

  const request = (value: unknown): FacadeEnvelope => {
    let reply: unknown;
    try {
      reply = JSON.parse(requestJson(encode(value)));
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new FacadeWasmError("ProtocolError", "the facade returned invalid JSON");
      throw error;
    }
    if (!isRecord(reply) || reply.abi_version !== 1)
      throw new FacadeWasmError("ProtocolError", "invalid facade ABI envelope");
    if (reply.ok === false && isRecord(reply.error) && typeof reply.error.code === "string")
      throw new FacadeError(reply.error as FacadeErrorDetails);
    if (reply.ok !== true) throw new FacadeWasmError("ProtocolError", "invalid facade outcome");
    return reply as FacadeEnvelope;
  };

  const modelOf = (reply: FacadeEnvelope): string => {
    const model = reply.model;
    if (!isRecord(model) || typeof model.class !== "string" || !isRecord(model.fields))
      throw new FacadeWasmError("ProtocolError", "the facade returned an invalid common model");
    return encode(model);
  };

  const kernel: FacadeKernel = Object.freeze({
    asset: Object.freeze({ ...asset }),
    requestJson,
    request,
    parse(text: string, format: FacadeInputFormat, options: FacadeParseOptions = {}) {
      return new Formula(kernel, modelOf(request({ op: "parse", format, input: text, options })));
    },
    fromModel(model: FacadeModel) {
      return new Formula(kernel, modelOf(request({ op: "model", model })));
    },
    fromSourceModel(document: unknown) {
      const reply = request({ op: "source_model", model: document });
      const model = reply.model;
      if (
        !isRecord(model) ||
        model.schema !== RUBY_VALUES_PROFILE ||
        !isRecord(model.producer) ||
        !Array.isArray(model.root)
      )
        throw new FacadeWasmError(
          "ProtocolError",
          "the facade returned an invalid source document",
        );
      return new SourceFormula(kernel, encode(model));
    },
    accounting: () => Object.freeze({ ...counts }),
  });
  return kernel;
}
