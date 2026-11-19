/**
 * UnicodeMath through umath-ts, the way the Ruby gem parses it through umath
 * (plurimath main 99ebfb21, `UnicodeMath::Parser#parse`): umath preprocesses
 * and parses the input into its typed model, the mapper turns the model into
 * the capture tree, and the UnicodeMath transform builds the Formula.
 *
 * The caller initializes umath-ts (`await initialize()`) and passes the
 * initialized parser and its compiled artifact (`artifacts/umath.json`, read
 * for the grammar's capture order). Importing this entry loads no WASM and
 * selects no fallback grammar.
 */
import { type FormulaNode, ParseError } from "../../core/index";
import { decimalMarkerFor } from "../../formatting/index";
import { bytePositions, isStageParseError, positionAt } from "../../pegkit/stage-captures";
import {
  postProcessing,
  preprocessOrParseError,
  transformUnicodemathTree,
  type UnicodemathParseOptions,
  validateOptions,
} from "./consumer";
import {
  artifactEntry,
  CaptureOrder,
  type UmathArtifact,
  UmathMapperError,
  UnicodemathMapper,
} from "./mapper";

export type { UnicodemathParseOptions } from "./consumer";
export type { UmathArtifact, UmathGrammar } from "./mapper";

/** The part of an initialized umath-ts parser this entry calls. */
export interface UnicodemathStageBinding {
  parse(input: string, options: UmathParseOptions): { readonly expression?: unknown };
}

/**
 * The options this entry parses with. The Ruby gem's umath runs Parsanol's
 * Ruby engine, so the umath-ts policy that matches it is `parslet` (memo and
 * ordered-choice semantics) with the `deepest` failure reporter; umath-ts
 * replays generation 5 with the same pair.
 */
export interface UmathParseOptions {
  readonly decimal: UmathDecimal;
  readonly compatibility: "parslet";
  readonly reporter: "deepest";
}

/** The decimal markers umath has a grammar entry for. */
export type UmathDecimal = "." | "," | "٫";

/**
 * A `\u` escape of one to five hexadecimal digits that does not follow a
 * backslash (`Parser::U_ESCAPE`).
 */
const U_ESCAPE = /(?<!\\)\\u([\da-fA-F]{1,5})/g;
/** Escapes that stay with umath: its comment brackets would act as brackets once written out. */
const U_ESCAPE_KEPT: ReadonlySet<number> = new Set([0x2af7, 0x2af8]);

/**
 * Writes each `\u` escape of a non-ASCII character as the character itself
 * (`Parser#expand_escapes`), so umath reads `αx` as α followed by x. An
 * ASCII escape, a comment bracket and a value that is not a character stay
 * for umath.
 */
function expandEscapes(text: string): string {
  return text.replace(U_ESCAPE, (found, digits: string) => {
    const code = Number.parseInt(digits, 16);
    if (code < 0x80 || U_ESCAPE_KEPT.has(code) || (code >= 0xd800 && code <= 0xdfff)) return found;
    if (code > 0x10ffff) return found;
    return String.fromCodePoint(code);
  });
}

function grammarOf(loaded: UmathArtifact, decimal: string) {
  const entry = loaded.entries?.[artifactEntry(decimal)];
  if (entry === undefined) throw new TypeError(`umath artifact has no ${decimal} entry`);
  return entry.grammar;
}

export function createUnicodemathParser(
  binding: UnicodemathStageBinding,
  artifact: UmathArtifact | string,
): (input: string, options?: UnicodemathParseOptions | null) => FormulaNode {
  const loaded: UmathArtifact = typeof artifact === "string" ? JSON.parse(artifact) : artifact;
  const mappers = new Map<string, UnicodemathMapper>();
  const mapperFor = (decimal: string) => {
    let mapper = mappers.get(decimal);
    if (mapper === undefined) {
      mapper = new UnicodemathMapper(CaptureOrder.for(grammarOf(loaded, decimal)));
      mappers.set(decimal, mapper);
    }
    return mapper;
  };
  return (input, options) => {
    validateOptions(options);
    // The label split is Plurimath's own (`Parser#pre_processing`); umath
    // reads the whole input and runs its own preprocessing.
    const { label } = preprocessOrParseError(input);
    const decimal = decimalMarkerFor(options?.locale) as UmathDecimal;
    const expanded = expandEscapes(input);
    let tree: ReturnType<UnicodemathMapper["call"]>;
    try {
      const mapper = mapperFor(decimal);
      tree = mapper.call(
        binding.parse(expanded, { decimal, compatibility: "parslet", reporter: "deepest" }),
      );
    } catch (error) {
      if (isStageParseError(error)) {
        const at =
          error.byteOffset === null
            ? 0
            : positionAt(bytePositions(expanded), Math.min(error.byteOffset, byteLength(expanded)));
        throw new ParseError(error.message, input, "unicode", Math.min(at, input.length));
      }
      if (error instanceof UmathMapperError)
        throw new ParseError(error.message, input, "unicode", 0);
      throw error;
    }
    return transformUnicodemathTree(
      label === undefined ? tree : postProcessing(tree, label),
      input,
    );
  };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
