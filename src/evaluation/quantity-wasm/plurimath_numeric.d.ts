/* tslint:disable */
/* eslint-disable */

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly plurimath_numeric_abi_version: () => number;
    readonly plurimath_numeric_alloc: (a: number) => number;
    readonly plurimath_numeric_dealloc: (a: number, b: number) => void;
    readonly plurimath_numeric_evaluate: (a: number, b: number) => number;
    readonly plurimath_numeric_result_free: (a: number) => void;
    readonly unitsml_abi_version: () => number;
    readonly unitsml_evaluate_json_v1: (a: number, b: number) => number;
    readonly unitsml_free_json_v1: (a: number) => void;
    readonly asciiunits_abi_version: () => number;
    readonly asciiunits_free_json_v1: (a: number) => void;
    readonly asciiunits_parse_json_v1: (a: number, b: number, c: number) => number;
    readonly parsanol_c_last_error: () => number;
    readonly parsanol_c_parse: (a: bigint, b: number, c: number, d: number) => number;
    readonly parsanol_c_parse_len: (a: bigint, b: number, c: number, d: number, e: number) => number;
    readonly parsanol_c_register: (a: number) => bigint;
    readonly parsanol_c_release: (a: bigint) => void;
    readonly parsanol_grammar_atom_count: (a: number) => number;
    readonly parsanol_grammar_free: (a: number) => void;
    readonly parsanol_grammar_new: (a: number) => number;
    readonly parsanol_grammar_new_with_error: (a: number, b: number) => number;
    readonly parsanol_grammar_root: (a: number) => number;
    readonly parsanol_parg_error: (a: number, b: number) => number;
    readonly parsanol_parg_free: (a: number) => void;
    readonly parsanol_parg_parse: (a: number, b: number) => number;
    readonly parsanol_parg_parse_recovering: (a: number, b: number, c: number) => number;
    readonly parsanol_parg_parse_with_compatibility: (a: number, b: number, c: number, d: number) => number;
    readonly parsanol_parse: (a: number, b: number, c: number) => number;
    readonly parsanol_parse_end_pos: (a: number, b: number) => number;
    readonly parsanol_parse_simple: (a: number, b: number) => number;
    readonly parsanol_result_ast_json: (a: number) => number;
    readonly parsanol_result_end_pos: (a: number) => number;
    readonly parsanol_result_error: (a: number) => number;
    readonly parsanol_result_free: (a: number) => void;
    readonly parsanol_result_success: (a: number) => number;
    readonly parsanol_string_free: (a: number) => void;
    readonly parsanol_version: () => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
