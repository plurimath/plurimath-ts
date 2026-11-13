/* tslint:disable */
/* eslint-disable */

/**
 * The entity-registry face: bidirectional lookup, primary-name
 * preference, and the restoration policy.
 */
export class RegistryFace {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The Unicode codepoint for a name, or undefined.
     */
    codepoint_for_name(name: string): number | undefined;
    declared(name: string): boolean;
    /**
     * All names for a codepoint, in provider order.
     */
    names_for_codepoint(codepoint: number): string[];
    /**
     * Builds from parallel `(names, lexicals)` arrays in provider
     * order — the `:custom` provider path the dataset pins, so
     * multi-character and `"\\uXXXX"` lexicals parse exactly as
     * they do in Ruby.
     */
    constructor(names: string[], lexicals: string[]);
    /**
     * The primary name for a codepoint (lowercase preferred,
     * first-name fallback), or undefined.
     */
    primary_name_for_codepoint(codepoint: number): string | undefined;
    /**
     * The restoration policy: standard entities restore regardless
     * of config; other known codepoints restore only with
     * `restore_entities` (strict answers as lenient).
     */
    should_restore(codepoint: number, restore_entities: boolean, restoration_mode: string): boolean;
    /**
     * Whether a codepoint is one of the five XML predefined entities.
     */
    static standard_entity(codepoint: number): boolean;
}

/**
 * The wildcard face: namespace admission (§3.10.4.2) and the
 * match-level negative exclusion (§3.10.4.1).
 */
export class WildcardFace {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether the wildcard admits the namespace (`"local"`,
     * `"tns"`, or a URI).
     */
    covers(namespace: string): boolean;
    /**
     * Why the wildcard refuses an item outright:
     * `"not_qname"` / `"not_namespace"` (the dataset's committed
     * spellings), or undefined.
     */
    negative_exclusion(qname: string, namespace: string, defined: boolean, sibling_names: string[]): string | undefined;
    /**
     * Builds from the constructor spellings the dataset pins
     * (constraint in attribute form, `notNamespace`/`notQName` as
     * pre-resolution token lists).
     */
    constructor(constraint: string | null | undefined, process: string, not_namespace: string | null | undefined, not_qname: string[]);
}

/**
 * Every built-in type name the table serves.
 */
export function lexical_names(): string[];

/**
 * Translates an XSD pattern to the **JavaScript** RegExp dialect —
 * compile the returned string with the `u` flag and test values
 * through the JS engine. `undefined` when the pattern uses a
 * construct outside the translated subset: the engine's answer
 * then stands.
 */
export function translate_regex_js(pattern: string): string | undefined;

/**
 * Whether a lexical value is valid for a built-in type.
 * Err = the type is not in the table (loud, never a silent answer).
 */
export function valid_lexical(builtin: string, value: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly plurimath_facade_abi_version: () => number;
    readonly plurimath_facade_alloc: (a: number) => number;
    readonly plurimath_facade_dealloc: (a: number, b: number) => void;
    readonly plurimath_facade_free: (a: number) => void;
    readonly plurimath_facade_json: (a: number, b: number) => number;
    readonly asciiunits_abi_version: () => number;
    readonly asciiunits_free_json_v1: (a: number) => void;
    readonly asciiunits_parse_json_v1: (a: number, b: number, c: number) => number;
    readonly __wbg_registryface_free: (a: number, b: number) => void;
    readonly __wbg_wildcardface_free: (a: number, b: number) => void;
    readonly lexical_names: () => [number, number];
    readonly registryface_codepoint_for_name: (a: number, b: number, c: number) => number;
    readonly registryface_declared: (a: number, b: number, c: number) => number;
    readonly registryface_names_for_codepoint: (a: number, b: number) => [number, number];
    readonly registryface_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly registryface_primary_name_for_codepoint: (a: number, b: number) => [number, number];
    readonly registryface_should_restore: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly registryface_standard_entity: (a: number) => number;
    readonly translate_regex_js: (a: number, b: number) => [number, number];
    readonly valid_lexical: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wildcardface_covers: (a: number, b: number, c: number) => number;
    readonly wildcardface_negative_exclusion: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly wildcardface_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
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
    readonly parsanol_version: () => number;
    readonly parsanol_string_free: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
