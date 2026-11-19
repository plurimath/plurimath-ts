/**
 * Replays the stage rows that record a stage gem's own model through that
 * gem's TypeScript port, the same way each port replays its pinned generation
 * in its own CI:
 *
 *   - latex typed-model rows through latexmath-ts (`Parser.parse`, the model
 *     wire of its `scripts/replay-corpus.mjs`);
 *   - unicode typed-model rows through umath-ts (`parse` with the parslet
 *     compatibility and deepest reporter, as `scripts/replay-corpus.mjs`);
 *   - mathml model-roundtrip rows through mml-ts (`parseMath` then
 *     `stringifyMath`, against the recorded `to_xml` bytes);
 *   - omml model-roundtrip rows through omml-ts (`parseOmml` then
 *     `stringifyOmml`, against the recorded `to_xml` bytes and the recorded
 *     model wire, with that package's `scripts/model-wire.mjs`).
 *
 * plurimath-ts itself parses straight into the Plurimath Math::Core model,
 * so these rows have nothing in the port to compare against; the stage
 * packages are the TypeScript side of the same gems. None of them is an npm
 * dependency yet, so each is read from a built checkout named by an
 * environment variable (`<NAME>_TS_DIST`, its `dist/` directory). CI checks
 * out and builds the pinned revisions. A language whose package is not
 * given replays without it; the spec then skips the record check for it.
 *
 * Every function here returns an outcome per row id; `stage-replay.ts` uses
 * it in place of "unsupported" for exactly the rows it covers.
 */

import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { YamlValue } from "../core/corpus-yaml";
import { asMapping, asString, type StageGeneration, type StageLanguage } from "./stage-pin";

type Mapping = { readonly [key: string]: YamlValue };
export type StageOutcome = {
  readonly status: "equal" | "differing" | "unsupported";
  readonly note?: string;
};
/** Row id -> outcome, for the rows a stage package replays. */
export type StageOutcomes = ReadonlyMap<string, StageOutcome>;

const EQUAL: StageOutcome = { status: "equal" };
const differ = (note: string): StageOutcome => ({ status: "differing", note });

/** The environment variable naming each stage package's built `dist/`. */
export const STAGE_PACKAGE_DIST: Partial<Record<StageLanguage, string>> = {
  latex: "LATEXMATH_TS_DIST",
  unicode: "UMATH_TS_DIST",
  mathml: "MML_TS_DIST",
  omml: "OMML_TS_DIST",
};

/**
 * XML rows the Ruby gems accept and the TypeScript ports refuse: the input is
 * not well-formed XML, which the ports' XML reader (moxml-ts on leptris)
 * rejects as the W3C XML specification requires. Each port lists the same
 * rows as known refusals in its own replay.
 */
export const MALFORMED_XML_REASON =
  "model-roundtrip: the input is not well-formed XML; the Ruby gem's parser recovers it, " +
  "the TypeScript port refuses it as XML 1.0 requires (the port's own replay lists it as a known refusal)";

const KNOWN_REFUSALS: Partial<Record<StageLanguage, ReadonlySet<string>>> = {
  mathml: new Set([
    "mathml-unclosed-math.model-roundtrip",
    "mathml-unclosed-token.model-roundtrip",
    "mathml-unclosed-operator.model-roundtrip",
    "mathml-mismatched-close.model-roundtrip",
  ]),
  omml: new Set([
    "omml-equation-arrays-007.model-roundtrip",
    "omml-matrices-017.model-roundtrip",
    "omml-unclosed-para.model-roundtrip",
    "omml-crossed-close.model-roundtrip",
  ]),
};

const text = (value: YamlValue | undefined, where: string): string =>
  asString(asMapping(value, where).str, `${where}.str`);

const message = (error: unknown): string =>
  error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);

function firstDifference(actual: string, expected: string): string {
  let at = 0;
  while (at < actual.length && actual[at] === expected[at]) at += 1;
  return `differs at ${at}: …${JSON.stringify(actual.slice(Math.max(0, at - 40), at + 80))}`;
}

const importDist = async (dist: string, file = "index.js") =>
  import(pathToFileURL(join(dist, file)).href);

function rowsOf(generation: StageGeneration, boundary: string): Mapping[] {
  return generation.payloads
    .filter((payload) => payload.document.boundary === boundary)
    .flatMap((payload) => payload.cases);
}

// --- typed models: latexmath-ts and umath-ts --------------------------------

interface Wire {
  readonly str?: string;
  readonly array?: readonly (Wire | undefined)[];
  readonly node?: string;
  readonly fields?: readonly (readonly [string, Wire | undefined])[];
}

/**
 * A generated model value in the stage's tagged wire: `{node, fields}` with
 * unset fields left out, fields in declaration order. `derived` names fields
 * the model computes from bound data (latexmath's symbol catalog) that a row
 * written before the model declared them does not record; such a field is
 * left out when the recorded node has no entry for it, as latexmath-ts's
 * replay does.
 */
function wire(
  value: unknown,
  expected: unknown,
  prefix: string,
  rubyPrefix: string,
  derived: Readonly<Record<string, ReadonlySet<string>>> = {},
): Wire | undefined {
  if (value === null || value === undefined || typeof value === "symbol") return undefined;
  if (typeof value === "string") return { str: value };
  if (Array.isArray(value)) {
    const items = (expected as Wire | undefined)?.array ?? [];
    return { array: value.map((item, i) => wire(item, items[i], prefix, rubyPrefix, derived)) };
  }
  const name = (value as object).constructor.name;
  if (!name.startsWith(prefix)) throw new TypeError(`not a ${prefix} model: ${name}`);
  const node = `${rubyPrefix}${name.slice(prefix.length)}`;
  const recordedNode = expected as Wire | undefined;
  const recorded =
    recordedNode?.node === node ? new Map(recordedNode.fields ?? []) : new Map<string, unknown>();
  const fields: [string, Wire][] = [];
  for (const [key, field] of Object.entries(value as object)) {
    if (derived[node]?.has(key) && recordedNode?.node === node && !recorded.has(key)) continue;
    const encoded = wire(field, recorded.get(key), prefix, rubyPrefix, derived);
    if (encoded !== undefined) fields.push([key, encoded]);
  }
  return { node, fields };
}

interface TypedStage {
  readonly prefix: string;
  readonly rubyPrefix: string;
  /** How the row's recorded node names map to the port's. */
  readonly recordedPrefix: string;
  readonly derived?: Readonly<Record<string, ReadonlySet<string>>>;
  readonly parse: (input: string, options: Mapping) => unknown;
  readonly isParseError: (error: unknown) => boolean;
}

function replayTypedModels(generation: StageGeneration, stage: TypedStage): StageOutcomes {
  const outcomes = new Map<string, StageOutcome>();
  for (const entry of rowsOf(generation, "typed-model")) {
    const id = asString(entry.id, "id");
    const input = text(entry.input, `${id} input`);
    const options = asMapping(entry.options ?? {}, `${id} options`);
    const expected = asMapping(entry.expected, `${id} expected`);
    let actual: unknown;
    let thrown: unknown;
    try {
      actual = stage.parse(input, options);
    } catch (error) {
      thrown = error;
    }
    if (expected.refusal !== undefined) {
      const at = (thrown as { byteOffset?: number } | undefined)?.byteOffset;
      const want = asMapping(expected.refusal, `${id} refusal`).byte_offset;
      outcomes.set(
        id,
        stage.isParseError(thrown) && at === want
          ? EQUAL
          : differ(`the stage package refuses at ${at ?? message(thrown)}, the row at ${want}`),
      );
      continue;
    }
    if (thrown !== undefined) {
      outcomes.set(id, differ(`the stage package refuses it: ${message(thrown)}`));
      continue;
    }
    const recorded = JSON.stringify(expected.tree ?? null).replaceAll(
      `"${stage.recordedPrefix}`,
      `"${stage.rubyPrefix}`,
    );
    const actualWire = JSON.stringify(
      wire(actual, JSON.parse(recorded), stage.prefix, stage.rubyPrefix, stage.derived),
    );
    outcomes.set(
      id,
      actualWire === recorded
        ? EQUAL
        : differ(`typed model ${firstDifference(actualWire, recorded)}`),
    );
  }
  return outcomes;
}

async function latexOutcomes(generation: StageGeneration, dist: string): Promise<StageOutcomes> {
  const latexmath = await importDist(dist);
  const parser = await latexmath.initialize();
  return replayTypedModels(generation, {
    prefix: "LatexmathModel",
    rubyPrefix: "Latexmath::Model::",
    recordedPrefix: "Latexmath::Model::",
    derived: { "Latexmath::Model::MathSymbol": new Set(["value", "kind"]) },
    parse: (input, options) => parser.parse(input, options),
    isParseError: (error) => error instanceof latexmath.ParseError,
  });
}

async function unicodeOutcomes(generation: StageGeneration, dist: string): Promise<StageOutcomes> {
  const umath = await importDist(dist);
  const parser = await umath.initialize();
  return replayTypedModels(generation, {
    prefix: "UmathModel",
    rubyPrefix: "Umath::Model::",
    recordedPrefix: "Unicodemath::Model::",
    parse: (input, options) =>
      parser.parse(input, {
        decimal: typeof options.decimal === "string" ? options.decimal : ".",
        compatibility: "parslet",
        reporter: "deepest",
      }),
    isParseError: (error) => error instanceof umath.ParseError,
  });
}

// --- model roundtrips: mml-ts and omml-ts -----------------------------------

interface RoundtripStage {
  readonly language: StageLanguage;
  /** Reads and writes the input; resolves to the bytes and the model read. */
  readonly roundtrip: (input: string) => Promise<readonly [string, unknown]>;
  /** The first difference between the model read and the recorded wire, if compared. */
  readonly modelDifference?: (model: unknown, recorded: YamlValue | undefined) => string | null;
}

async function replayModelRoundtrips(
  generation: StageGeneration,
  stage: RoundtripStage,
): Promise<StageOutcomes> {
  const outcomes = new Map<string, StageOutcome>();
  const known = KNOWN_REFUSALS[stage.language] ?? new Set<string>();
  for (const entry of rowsOf(generation, "model-roundtrip")) {
    const id = asString(entry.id, "id");
    const options = asMapping(entry.options ?? {}, `${id} options`);
    if (Object.keys(options).length > 0) {
      outcomes.set(id, differ(`options ${JSON.stringify(options)} have no stage equivalent`));
      continue;
    }
    const expected = asMapping(entry.expected, `${id} expected`);
    let actual: readonly [string, unknown] | undefined;
    let thrown: unknown;
    try {
      actual = await stage.roundtrip(text(entry.input, `${id} input`));
    } catch (error) {
      thrown = error;
    }
    if (known.has(id)) {
      outcomes.set(
        id,
        thrown === undefined
          ? differ("listed as malformed XML, but the stage package reads it")
          : { status: "unsupported", note: MALFORMED_XML_REASON },
      );
      continue;
    }
    if (expected.refusal !== undefined) {
      outcomes.set(id, thrown === undefined ? differ("the stage package accepts it") : EQUAL);
      continue;
    }
    if (actual === undefined) {
      outcomes.set(id, differ(`the stage package refuses it: ${message(thrown)}`));
      continue;
    }
    const bytes = text(expected.output, `${id} output`);
    if (actual[0] !== bytes) {
      outcomes.set(id, differ(`to_xml bytes ${firstDifference(actual[0], bytes)}`));
      continue;
    }
    const modelDifference = stage.modelDifference?.(actual[1], expected.model);
    outcomes.set(id, modelDifference ? differ(`model wire: ${modelDifference}`) : EQUAL);
  }
  return outcomes;
}

async function mathmlOutcomes(generation: StageGeneration, dist: string): Promise<StageOutcomes> {
  const mml = await importDist(dist);
  return replayModelRoundtrips(generation, {
    language: "mathml",
    roundtrip: async (input) => {
      const model = await mml.parseMath(input);
      return [await mml.stringifyMath(model), model] as const;
    },
  });
}

async function ommlOutcomes(generation: StageGeneration, dist: string): Promise<StageOutcomes> {
  const omml = await importDist(dist);
  // The wire writer lives beside dist/ in the omml-ts checkout.
  const modelWire = await import(
    pathToFileURL(join(dirname(dist), "scripts", "model-wire.mjs")).href
  );
  return replayModelRoundtrips(generation, {
    language: "omml",
    roundtrip: async (input) => {
      const model = await omml.parseOmml(input);
      return [await omml.stringifyOmml(model), model] as const;
    },
    modelDifference: (model, recorded) => {
      const { normalized } = modelWire.normalizeExpected(recorded);
      const actual = JSON.stringify(modelWire.wire(model));
      const want = JSON.stringify(normalized);
      return actual === want ? null : firstDifference(actual, want);
    },
  });
}

const LOADERS: Partial<
  Record<StageLanguage, (generation: StageGeneration, dist: string) => Promise<StageOutcomes>>
> = {
  latex: latexOutcomes,
  unicode: unicodeOutcomes,
  mathml: mathmlOutcomes,
  omml: ommlOutcomes,
};

/** The variable a language's stage package is read from, when it has one and it is unset. */
export function missingStagePackage(language: StageLanguage): string | undefined {
  const variable = STAGE_PACKAGE_DIST[language];
  return variable !== undefined && !process.env[variable] ? variable : undefined;
}

/**
 * The stage package's outcome for every model row of the generation, or
 * undefined when the language has no stage package or its dist is not given.
 */
export async function stageOutcomes(
  generation: StageGeneration,
): Promise<StageOutcomes | undefined> {
  const language = generation.pin.language;
  const variable = STAGE_PACKAGE_DIST[language];
  const dist = variable === undefined ? undefined : process.env[variable];
  const load = LOADERS[language];
  if (dist === undefined || dist === "" || load === undefined) return undefined;
  return load(generation, dist);
}
