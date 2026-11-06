/**
 * Replays every row of a pinned plurimath-testsuite stage generation through
 * this port, the way each Ruby stage gem replays its own pinned generation in
 * CI (amath, latexmath, umath, mml, omml: `.github/workflows/corpus.yml`,
 * `scripts/replay_corpus.rb`).
 *
 * Each row ends in exactly one of three states:
 *
 *   - `equal`: the port produced what the row records;
 *   - `differing`: the port produced something else (or refused where the row
 *     renders, or rendered where it refuses). The detail says what;
 *   - `unsupported`: the row records something this port has no equivalent
 *     of, so nothing can be compared. The reason says why.
 *
 * What is compared, per payload kind:
 *
 *   - legacy facade cases (`plurimath-corpus/<format>/1|2`): `input` is parsed
 *     with the port's parser for its notation and rendered to every declared
 *     target; each rendering must be byte-identical, each recorded refusal
 *     must be a render-time refusal here too;
 *   - legacy rejections (`plurimath-corpus/rejections/1`): the port must
 *     refuse with a `ParseError`; where the gem's offset is into an input
 *     preprocessing left unchanged, the port's offset must be the same;
 *   - legacy calls (`plurimath-corpus/calls/1|2`): as facade cases, with the
 *     recorded `number_formatter` or `unitsml` call applied to every render;
 *   - stage raw-tree rows: the port's grammar tree for `input` (the
 *     Parslet-shaped tree its `parse<Format>Tree` returns), written in the
 *     stage canonical tagged form, and its preprocessed text, against
 *     `expected.tree` and `expected.preprocessed`. A refusal must be a
 *     `ParseError` at the recorded byte offset;
 *   - stage typed-model rows: a refusal must be a `ParseError` from the
 *     port's parser at the recorded byte offset. A model is unsupported: it is
 *     the stage gem's own typed model, which the port does not build;
 *   - stage model-roundtrip rows (mathml, omml): a refusal must be a
 *     `ParseError`. A model and its `to_xml` bytes are unsupported: they are
 *     the `mml`/`omml` gems' lutaml models and serializers;
 *   - roundtrip rows (`plurimath-stage/roundtrip/1`): the source is parsed,
 *     rendered to each target and read back; every `output` must be
 *     byte-identical and every `lossless` must be what the port observes
 *     (`nodeEquals` between the formula read back and the one parsed).
 */

import type { FormulaNode, MathNode } from "../../src/core/index";
import { ParseError } from "../../src/core/index";
import { nodeEquals } from "../../src/core/nodes";
import { parseAsciimathPreprocessed } from "../../src/formats/asciimath/grammar";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { parseAsciimathTree } from "../../src/formats/asciimath/parser";
import { preprocess as preprocessAsciimath } from "../../src/formats/asciimath/preprocess";
import { toHtml } from "../../src/formats/html/index";
import { parseLatexPreprocessed } from "../../src/formats/latex/grammar";
import { toLatex } from "../../src/formats/latex/index";
import { parseLatexTree } from "../../src/formats/latex/parser";
import { preprocess as preprocessLatex } from "../../src/formats/latex/preprocess";
import { toMathml } from "../../src/formats/mathml/index";
import { toOmml } from "../../src/formats/omml/index";
import { parseUnicodemathPreprocessed } from "../../src/formats/unicodemath/grammar";
import { toUnicodemath } from "../../src/formats/unicodemath/index";
import { parseUnicodemathTree } from "../../src/formats/unicodemath/parser";
import { preprocess as preprocessUnicodemath } from "../../src/formats/unicodemath/preprocess";
import type {
  FormatterOptions,
  FormatterSymbolOptions,
  LocaleOptions,
} from "../../src/formatting/index";
import { parse } from "../../src/parse";
import type { ParseValue } from "../../src/pegkit/index";
import { ParseFailed, Slice } from "../../src/pegkit/index";
import { type PinnedCall, readCorpusPayload } from "../core/corpus-pin";
import type { YamlValue } from "../core/corpus-yaml";
import {
  asMapping,
  asString,
  type StageGeneration,
  type StageLanguage,
  type StagePayload,
} from "./stage-pin";

export type RowStatus = "equal" | "differing" | "unsupported";

/** The payload kinds a row can come from, as the report groups them. */
export type RowKind =
  | "facade"
  | "rejection"
  | "calls"
  | "raw-tree"
  | "typed-model"
  | "model-roundtrip"
  | "roundtrip";

export interface RowResult {
  readonly id: string;
  readonly payload: string;
  readonly kind: RowKind;
  readonly status: RowStatus;
  /** For `differing`, what differed; for `unsupported`, the reason. */
  readonly note?: string;
}

type Mapping = { readonly [key: string]: YamlValue };
type Outcome = { readonly status: RowStatus; readonly note?: string };

const EQUAL: Outcome = { status: "equal" };
const differ = (note: string): Outcome => ({ status: "differing", note });
const unsupported = (note: string): Outcome => ({ status: "unsupported", note });

/**
 * Why a row cannot be compared. Each is one sentence a reader can check
 * against the row: the stage gem's root class is named so a gem that changes
 * its model, and a port that grows one, both show up as a changed reason.
 */
export const UNSUPPORTED_REASONS = {
  asciimathTypedModel:
    "typed-model: the row is Amath.parse's own typed model (Amath::Document); " +
    "plurimath-ts parses AsciiMath straight into the Plurimath Math::Core model and builds no Amath model",
  latexTypedModel:
    "typed-model: the row is Latexmath.parse's own typed model (Latexmath::Model::Document); " +
    "plurimath-ts parses LaTeX straight into the Plurimath Math::Core model and builds no Latexmath model",
  unicodeTypedModel:
    "typed-model: the row is Umath.parse's own typed model (Umath::Model::Document); " +
    "plurimath-ts parses UnicodeMath straight into the Plurimath Math::Core model and builds no Umath model",
  mathmlModelRoundtrip:
    "model-roundtrip: the row is the mml gem's lutaml model (Mml::V3::Math) and its to_xml bytes; " +
    "plurimath-ts reads MathML into its own element tree and has neither that model nor that serializer",
  ommlModelRoundtrip:
    "model-roundtrip: the row is the omml gem's lutaml model (Omml::Models::OMathPara) and its to_xml bytes; " +
    "plurimath-ts reads OMML into its own element tree and has neither that model nor that serializer",
} as const;

const TYPED_MODEL_REASON: Partial<Record<StageLanguage, string>> = {
  asciimath: UNSUPPORTED_REASONS.asciimathTypedModel,
  latex: UNSUPPORTED_REASONS.latexTypedModel,
  unicode: UNSUPPORTED_REASONS.unicodeTypedModel,
};

const MODEL_ROUNDTRIP_REASON: Partial<Record<StageLanguage, string>> = {
  mathml: UNSUPPORTED_REASONS.mathmlModelRoundtrip,
  omml: UNSUPPORTED_REASONS.ommlModelRoundtrip,
};

// --- rendering -------------------------------------------------------------

type RenderOptions = { readonly formatter?: FormatterOptions; readonly unitsml?: { xml: true } };
type Renderer = (node: MathNode, options?: RenderOptions) => string;

/** The renderer for each target, keyed by the corpus's spelling of it. */
const RENDERERS: Readonly<Record<string, Renderer>> = {
  asciimath: (node, options) => toAsciimath(node, options as never),
  latex: (node, options) => toLatex(node, options as never),
  mathml: (node, options) => toMathml(node, options as never),
  html: (node, options) => toHtml(node, options as never),
  omml: (node, options) => toOmml(node, options as never),
  unicodemath: (node, options) => toUnicodemath(node, options as never),
  // The roundtrip payloads spell the UnicodeMath target as the input format.
  unicode: (node, options) => toUnicodemath(node, options as never),
};

function message(error: unknown): string {
  const text =
    error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
  return text.split("\n")[0]?.slice(0, 160) ?? "";
}

function render(target: string, node: MathNode, options?: RenderOptions): string {
  const renderer = RENDERERS[target];
  if (renderer === undefined) throw new Error(`no renderer for target ${target}`);
  return renderer(node, options);
}

/** UTF-8 byte offset of a UTF-16 offset into `text`. */
function byteOffset(text: string, index: number): number {
  return Buffer.byteLength(text.slice(0, index), "utf8");
}

/** Code-point offset of a UTF-16 offset into `text` (Ruby's character index). */
function charOffset(text: string, index: number): number {
  return [...text.slice(0, index)].length;
}

// --- legacy payloads -------------------------------------------------------

function parseOrError(input: string, format: string, options?: object): FormulaNode | Error {
  try {
    return parse(input, format as never, options as never);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** Every declared target of one legacy case, rendered or refused as recorded. */
function compareTargets(
  input: string,
  inputFormat: string,
  expected: ReadonlyMap<string, string>,
  refusals: ReadonlyMap<string, string>,
  options?: RenderOptions,
): Outcome {
  const tree = parseOrError(input, inputFormat);
  if (tree instanceof Error) return differ(`the port refuses to parse it: ${message(tree)}`);
  const differences: string[] = [];
  for (const [target, bytes] of expected) {
    try {
      if (render(target, tree, options) !== bytes) differences.push(`${target} bytes differ`);
    } catch (error) {
      differences.push(`${target} refused: ${message(error)}`);
    }
  }
  for (const target of refusals.keys()) {
    try {
      render(target, tree, options);
      differences.push(`${target} renders where the gem refuses`);
    } catch {
      // refused, as recorded
    }
  }
  return differences.length === 0 ? EQUAL : differ(differences.join("; "));
}

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/** A recorded call as render options; see number-formatter-numeric-pipeline.spec.ts. */
function callOptions(call: PinnedCall): RenderOptions {
  const args = asMapping(call.args, "call.args");
  if (call.method === "unitsml") return { unitsml: { xml: true } };
  const options = asMapping(args.options ?? {}, "call.args.options");
  const converted: Record<string, unknown> = {};
  for (const key of Object.keys(options)) converted[camel(key)] = options[key];
  const precision = args.precision ?? null;
  return {
    formatter: {
      locale: String(args.locale),
      options: converted as FormatterSymbolOptions,
      precision: typeof precision === "number" ? precision : null,
      ...(args.string_format === null || args.string_format === undefined
        ? {}
        : { stringFormat: String(args.string_format) }),
    },
  };
}

function replayLegacy(payload: StagePayload): RowResult[] | undefined {
  const read = readCorpusPayload(payload.path, payload.document);
  if (read === undefined) return undefined;
  const row = (id: string, kind: RowKind, outcome: Outcome): RowResult => ({
    id,
    payload: payload.path,
    kind,
    ...outcome,
  });
  switch (read.kind) {
    case "cases":
      return read.payload.cases.map((entry) =>
        row(
          entry.id,
          "facade",
          compareTargets(entry.input, entry.inputFormat, entry.expected, entry.refusals),
        ),
      );
    case "calls":
      return read.payload.cases.map((entry) =>
        row(
          entry.id,
          "calls",
          compareTargets(
            entry.input,
            entry.inputFormat,
            entry.expected,
            entry.refusals,
            callOptions(entry.call),
          ),
        ),
      );
    case "rejections":
      return read.payload.cases.map((entry) => {
        const result = parseOrError(entry.input, entry.inputFormat);
        if (!(result instanceof Error))
          return row(entry.id, "rejection", differ("the port parses it"));
        if (!(result instanceof ParseError)) {
          return row(entry.id, "rejection", differ(`refused with ${message(result)}`));
        }
        if (entry.index !== undefined && entry.preprocessed === entry.input) {
          const at = charOffset(entry.input, result.index);
          if (at !== entry.index) {
            return row(
              entry.id,
              "rejection",
              differ(`refused at ${at}, the gem at ${entry.index}`),
            );
          }
        }
        return row(entry.id, "rejection", EQUAL);
      });
  }
}

// --- stage payloads --------------------------------------------------------

/** A tagged string (`{str: ...}`) as its text. */
function taggedString(value: YamlValue | undefined, where: string): string {
  return asString(asMapping(value, where).str, `${where}.str`);
}

/** The port's options for a row's `options`, or why they cannot be given. */
function rowOptions(options: YamlValue | undefined): { locale?: string } | string {
  const given = asMapping(options ?? {}, "options");
  const result: { locale?: string } = {};
  for (const [key, value] of Object.entries(given)) {
    if (key === "decimal" && value === ".") continue; // the default marker
    if (key === "locale" && typeof value === "string") {
      result.locale = value;
      continue;
    }
    return `option ${key}: ${JSON.stringify(value)}`;
  }
  return result;
}

/**
 * Hash keys the gem's grammar writes as Ruby Strings rather than Symbols.
 * The port's tree is a plain object, so it cannot say which a key was; this
 * is the grammar's own record of it. LaTeX has exactly one: the row separator
 * `"\\\\"` at `latex/parse.rb:111` (see the header of
 * `src/formats/latex/grammar.ts`).
 */
const STRING_KEYS: Partial<Record<StageLanguage, ReadonlySet<string>>> = {
  latex: new Set(["\\\\"]),
};

/**
 * A grammar tree in the stage canonical tagged form
 * (`schema/stage-cases.json#/$defs/value`): hashes keep insertion order and
 * their key type, slices carry their byte and character offsets.
 */
export function tagTree(
  value: ParseValue,
  text: string,
  stringKeys: ReadonlySet<string> = new Set(),
): YamlValue {
  if (value === null) return { nil: true };
  if (typeof value === "string") return { str: value };
  if (value instanceof Slice) {
    return {
      slice: value.text,
      // biome-ignore lint/style/useNamingConvention: the stage-cases schema's key
      byte_offset: byteOffset(text, value.offset),
      // biome-ignore lint/style/useNamingConvention: the stage-cases schema's key
      char_offset: charOffset(text, value.offset),
    };
  }
  if (Array.isArray(value)) {
    return { array: value.map((item) => tagTree(item, text, stringKeys)) };
  }
  return {
    hash: Object.entries(value as Record<string, ParseValue>).map(([key, nested]) => [
      stringKeys.has(key) ? { str: key } : { sym: key },
      tagTree(nested, text, stringKeys),
    ]),
  };
}

function canonical(value: YamlValue): string {
  return JSON.stringify(value);
}

interface TreeParsers {
  /** Input -> grammar tree, offsets mapped to the input on refusal. */
  readonly tree: (input: string, options: LocaleOptions) => ParseValue;
  readonly preprocess: (input: string) => string;
  /** Preprocessed text -> grammar tree; throws `ParseFailed` at a preprocessed offset. */
  readonly grammar: (preprocessed: string, options: LocaleOptions) => ParseValue;
}

const TREE_PARSERS: Partial<Record<StageLanguage, TreeParsers>> = {
  asciimath: {
    tree: parseAsciimathTree,
    preprocess: (input) => preprocessAsciimath(input).text,
    grammar: parseAsciimathPreprocessed,
  },
  latex: {
    tree: parseLatexTree,
    preprocess: (input) => preprocessLatex(input).text,
    grammar: parseLatexPreprocessed,
  },
  unicode: {
    tree: parseUnicodemathTree,
    preprocess: (input) => preprocessUnicodemath(input).text,
    grammar: parseUnicodemathPreprocessed,
  },
};

/**
 * Which text a raw-tree refusal's `byte_offset` counts in, as each stage
 * payload's own description states it: umath's raw rows give "a refusal with
 * its byte offset into the preprocessed text" (`⟨a` fails at byte 9, the end
 * of `&#x27e8;a`), latexmath's and amath's "in the caller's input". Every
 * typed-model refusal counts in the caller's input.
 */
const RAW_REFUSAL_SPACE: Partial<Record<StageLanguage, "input" | "preprocessed">> = {
  unicode: "preprocessed",
};

/**
 * Where the port refuses, in the text the row counts in. The port's
 * `ParseError.index` is mapped back to the caller's input (ARCHITECTURE.md
 * §5); for a row that counts in the preprocessed text, the offset of the
 * port's own grammar failure there (`ParseFailed.index`) is used instead,
 * when it is the grammar that refuses. A refusal from preprocessing or the
 * transform has no preprocessed position, so its input offset stands.
 */
function refusalOffset(
  language: StageLanguage,
  space: "input" | "preprocessed",
  input: string,
  options: LocaleOptions,
  thrown: ParseError,
): number {
  const parsers = TREE_PARSERS[language];
  if (space === "preprocessed" && parsers !== undefined) {
    const preprocessed = attempt(() => parsers.preprocess(input));
    if (preprocessed.thrown === undefined) {
      const text = preprocessed.value as string;
      const grammar = attempt(() => parsers.grammar(text, options));
      if (grammar.thrown instanceof ParseFailed) return byteOffset(text, grammar.thrown.index);
    }
  }
  return byteOffset(input, thrown.index);
}

/** A recorded refusal, compared against what the port threw (or did not). */
function compareRefusal(
  language: StageLanguage,
  space: "input" | "preprocessed",
  refusal: Mapping,
  input: string,
  options: LocaleOptions,
  thrown: unknown,
): Outcome {
  if (thrown === undefined) return differ("the port accepts it");
  if (!(thrown instanceof ParseError)) return differ(`refused with ${message(thrown)}`);
  const expected = refusal.byte_offset;
  if (typeof expected === "number") {
    const at = refusalOffset(language, space, input, options, thrown);
    if (at !== expected) return differ(`refused at byte ${at}, the gem at byte ${expected}`);
  }
  return EQUAL;
}

function attempt(run: () => unknown): { value?: unknown; thrown?: unknown } {
  try {
    return { value: run() };
  } catch (error) {
    return { thrown: error ?? new Error("thrown undefined") };
  }
}

function replayRawTree(language: StageLanguage, entry: Mapping): Outcome {
  const parsers = TREE_PARSERS[language];
  if (parsers === undefined) return differ(`no grammar tree for ${language}`);
  const input = taggedString(entry.input, "input");
  const options = rowOptions(entry.options);
  if (typeof options === "string") return unsupported(`raw-tree with ${options}`);
  const expected = asMapping(entry.expected, "expected");
  const run = attempt(() => parsers.tree(input, options));
  if (expected.refusal !== undefined) {
    const refusal = asMapping(expected.refusal, "refusal");
    const space = RAW_REFUSAL_SPACE[language] ?? "input";
    return compareRefusal(language, space, refusal, input, options, run.thrown);
  }
  if (run.thrown !== undefined) return differ(`the port refuses it: ${message(run.thrown)}`);
  const preprocessed = parsers.preprocess(input);
  const notes: string[] = [];
  if (preprocessed !== taggedString(expected.preprocessed, "expected.preprocessed")) {
    notes.push("preprocessed text differs");
  }
  const tree = tagTree(run.value as ParseValue, preprocessed, STRING_KEYS[language]);
  if (canonical(tree) !== canonical(expected.tree ?? null)) notes.push("tree differs");
  return notes.length === 0 ? EQUAL : differ(notes.join("; "));
}

function replayTypedModel(language: StageLanguage, entry: Mapping): Outcome {
  const expected = asMapping(entry.expected, "expected");
  const input = taggedString(entry.input, "input");
  if (expected.refusal === undefined) {
    return unsupported(TYPED_MODEL_REASON[language] ?? `typed-model rows for ${language}`);
  }
  const options = rowOptions(entry.options);
  if (typeof options === "string") return unsupported(`typed-model refusal with ${options}`);
  const run = attempt(() => parse(input, language as never, options as never));
  const refusal = asMapping(expected.refusal, "refusal");
  return compareRefusal(language, "input", refusal, input, options, run.thrown);
}

function replayModelRoundtrip(language: StageLanguage, entry: Mapping): Outcome {
  const expected = asMapping(entry.expected, "expected");
  if (expected.refusal === undefined) {
    return unsupported(MODEL_ROUNDTRIP_REASON[language] ?? `model-roundtrip rows for ${language}`);
  }
  const input = taggedString(entry.input, "input");
  const run = attempt(() => parse(input, language as never));
  // The gems record an exception class and no offset; the port's offset for
  // an XML refusal is not comparable to anything, so only the refusal is.
  if (run.thrown === undefined) return differ("the port accepts it");
  if (!(run.thrown instanceof ParseError)) return differ(`refused with ${message(run.thrown)}`);
  return EQUAL;
}

/** The parse-back language for a roundtrip target. */
const READ_BACK: Readonly<Record<string, string>> = {
  asciimath: "asciimath",
  unicode: "unicode",
  mathml: "mathml",
  omml: "omml",
};

const TEXT_FORMATS: ReadonlySet<string> = new Set(["asciimath", "unicode", "latex", "html"]);

function replayRoundtrip(entry: Mapping): Outcome {
  const source = asMapping(entry.source, "source");
  const language = asString(source.language, "source.language");
  const input = asString(source.input, "source.input");
  const options = rowOptions(entry.options);
  if (typeof options === "string") return unsupported(`roundtrip with ${options}`);
  const parseIn = (text: string, format: string) =>
    parse(text, format as never, (TEXT_FORMATS.has(format) ? options : undefined) as never);
  const expected = asMapping(entry.expected, "expected");
  const parsed = attempt(() => parseIn(input, language));
  const notes: string[] = [];
  for (const [target, value] of Object.entries(expected)) {
    const outcome = asMapping(value, `expected.${target}`);
    if (outcome.refusal !== undefined) {
      if (parsed.thrown !== undefined) {
        if (!(parsed.thrown instanceof ParseError))
          notes.push(`${target}: ${message(parsed.thrown)}`);
        continue;
      }
      const rendered = attempt(() => render(target, parsed.value as MathNode));
      if (rendered.thrown === undefined) {
        notes.push(`${target}: the gem refuses, the port parses the source and renders it`);
      }
      continue;
    }
    if (parsed.thrown !== undefined) {
      notes.push(`the port refuses the source: ${message(parsed.thrown)}`);
      break;
    }
    const formula = parsed.value as FormulaNode;
    const rendered = attempt(() => render(target, formula));
    if (rendered.thrown !== undefined) {
      notes.push(`${target} refused: ${message(rendered.thrown)}`);
      continue;
    }
    const output = rendered.value as string;
    if (output !== asString(outcome.output, `expected.${target}.output`)) {
      notes.push(`${target} output differs`);
      continue;
    }
    const format = READ_BACK[target];
    if (format === undefined) throw new Error(`no read-back format for roundtrip target ${target}`);
    const back = attempt(() => parseIn(output, format));
    const lossless = back.thrown === undefined && nodeEquals(formula, back.value);
    if (lossless !== outcome.lossless) {
      notes.push(
        `${target} read back ${lossless ? "lossless" : "lossy"}, the gem's ${outcome.lossless ? "lossless" : "lossy"}`,
      );
    }
  }
  return notes.length === 0 ? EQUAL : differ(notes.join("; "));
}

function stageKind(payload: StagePayload): RowKind {
  if (payload.schema === "plurimath-stage/roundtrip/1") return "roundtrip";
  const boundary = asString(payload.document.boundary, `${payload.path} boundary`);
  if (boundary === "raw-tree" || boundary === "typed-model" || boundary === "model-roundtrip") {
    return boundary;
  }
  throw new Error(`${payload.path}: boundary ${boundary} is not one this replay knows`);
}

function replayStage(language: StageLanguage, payload: StagePayload): RowResult[] {
  const kind = stageKind(payload);
  return payload.cases.map((entry) => {
    const id = asString(entry.id, `${payload.path} id`);
    let outcome: Outcome;
    try {
      switch (kind) {
        case "raw-tree":
          outcome = replayRawTree(language, entry);
          break;
        case "typed-model":
          outcome = replayTypedModel(language, entry);
          break;
        case "model-roundtrip":
          outcome = replayModelRoundtrip(language, entry);
          break;
        default:
          outcome = replayRoundtrip(entry);
      }
    } catch (error) {
      outcome = differ(`the replay itself failed: ${message(error)}`);
    }
    return { id, payload: payload.path, kind, ...outcome };
  });
}

const STAGE_SCHEMA = /^plurimath-stage\/(?:[a-z]+\/cases\/1|roundtrip\/1)$/;

/** Every row of the generation, in payload then file order. */
export function replayGeneration(generation: StageGeneration): RowResult[] {
  const language = generation.pin.language;
  return generation.payloads.flatMap((payload) => {
    if (STAGE_SCHEMA.test(payload.schema)) return replayStage(language, payload);
    const legacy = replayLegacy(payload);
    if (legacy === undefined) {
      throw new Error(`${payload.path}: schema ${payload.schema} is not one this replay knows`);
    }
    return legacy;
  });
}

// --- the committed record ----------------------------------------------------

export interface LanguageRecord {
  readonly commit: string;
  readonly generation: number;
  readonly snapshotDigest: string;
  readonly rows: number;
  readonly equal: number;
  readonly differing: number;
  readonly unsupported: number;
  /** Per payload kind: rows, equal, differing, unsupported. */
  readonly kinds: Readonly<Record<string, readonly [number, number, number, number]>>;
  /** Reason -> the ids it covers. The count is the list's length. */
  readonly unsupportedRows: Readonly<
    Record<string, { readonly count: number; readonly ids: readonly string[] }>
  >;
  /** Id -> what differed. */
  readonly differingRows: Readonly<Record<string, string>>;
}

export function summarize(
  generation: StageGeneration,
  results: readonly RowResult[],
): LanguageRecord {
  const count = (status: RowStatus) => results.filter((row) => row.status === status).length;
  const kinds: Record<string, [number, number, number, number]> = {};
  for (const row of results) {
    const tally = kinds[row.kind] ?? [0, 0, 0, 0];
    kinds[row.kind] = tally;
    tally[0] += 1;
    tally[row.status === "equal" ? 1 : row.status === "differing" ? 2 : 3] += 1;
  }
  const unsupportedRows: Record<string, { count: number; ids: string[] }> = {};
  const differingRows: Record<string, string> = {};
  for (const row of results) {
    if (row.status === "unsupported") {
      const reason = row.note ?? "";
      const entry = unsupportedRows[reason] ?? { count: 0, ids: [] };
      unsupportedRows[reason] = entry;
      entry.count += 1;
      entry.ids.push(row.id);
    } else if (row.status === "differing") {
      differingRows[row.id] = row.note ?? "";
    }
  }
  return {
    commit: generation.pin.commit,
    generation: generation.pin.generation,
    snapshotDigest: generation.pin.snapshotDigest,
    rows: results.length,
    equal: count("equal"),
    differing: count("differing"),
    unsupported: count("unsupported"),
    kinds,
    unsupportedRows: unsupportedRows,
    differingRows: differingRows,
  };
}
