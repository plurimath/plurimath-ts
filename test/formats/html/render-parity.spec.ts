/**
 * Oracle-backed parity for a format the shared corpus carries no target for.
 *
 * The four P1 formats get this from `corpus-conformance`. OMML and HTML did
 * not, which is how six parity defects reached review with 2,900 tests green.
 *
 * Fixtures are generated, never hand-typed:
 *   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
 *     scripts/generate-parity-fixtures.rb --oracle /path/to/plurimath \
 *     --format html
 *
 * What is asserted, in the order the failures matter:
 *
 *   1. **The fixture is the whole corpus.** Its case ids and inputs are checked
 *      against `loadPinnedCorpus()` — a different file, written by a different
 *      generator — and its own `caseCount`/`renderedCount`/`raisedCount` are
 *      checked against its own rows. A reviewer deleted all 16 oracle-raise
 *      cases and one more besides, left `caseCount: 104` in place, and the
 *      earlier version of this spec passed 90 tests. Nothing read those numbers.
 *   2. **Every gem-renderable case gets its own test**, and produces either the
 *      gem's exact bytes or, for the ids in `PORT_REFUSES`, a `RenderError`.
 *      Exceptions used to be swallowed per case and counted in aggregate, so
 *      breaking a renderer failed one test that named no case at all, and a
 *      regression cancelled by an improvement failed nothing.
 *   3. **Every case the gem REFUSES gets its own test** — that the port refuses
 *      too, and in the same phase. Those 16 rows were previously filtered out
 *      and never looked at again.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ParseError, RenderError } from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/index";
import { parseLatex } from "../../../src/formats/latex/index";
import { parseUnicodemath } from "../../../src/formats/unicodemath/index";
import { loadPinnedCorpus } from "../../core/corpus-pin";
import { parseYaml } from "../../core/corpus-yaml";
import { casesInInputFormat } from "../../core/model-builder";
import {
  FORMAT,
  KNOWN_DIVERGENCES,
  PORT_REFUSES,
  RENDER,
  RENDERED_BASELINE,
} from "./parity-target";

interface Case {
  readonly group: string;
  readonly id: string;
  readonly inputFormat: InputFormat;
  readonly input: string;
  readonly expected?: string;
  readonly raises?: string;
  readonly raisedIn?: "parse" | "render";
}

interface Fixture {
  readonly schema: string;
  readonly format: string;
  readonly caseCount: number;
  readonly renderedCount: number;
  readonly raisedCount: number;
  readonly cases: readonly Case[];
}

interface FixtureManifest {
  readonly oracle: { readonly commit: string };
  readonly payload: { readonly schema: string };
}

// ESM-safe, and the same idiom `test/core/corpus-pin.ts` uses: this package is
// `"type": "module"`, so `__dirname` exists here only because Vite's transform
// supplies it. Relying on that shim makes the file's fixture reads depend on the
// test runner rather than on the module system, and diverges from the one other
// place in this suite that resolves a path.
const HERE = dirname(fileURLToPath(import.meta.url));

const fixture = JSON.parse(readFileSync(join(HERE, "parity-fixtures.json"), "utf8")) as Fixture;
const manifest = parseYaml(
  readFileSync(join(HERE, "parity-fixtures.manifest.yaml"), "utf8"),
) as unknown as FixtureManifest;

const pin = loadPinnedCorpus();

/**
 * The parser for each notation the generator sweeps, keyed by the corpus's
 * `input_format` spelling. Mirrors `PARSEABLE_INPUT_FORMATS` in
 * `scripts/generate-parity-fixtures.rb`: the generator parses each case with
 * the gem's parser for the notation it is WRITTEN in, and every test below runs
 * the port's parser for that same notation. The corpus spells UnicodeMath
 * `unicode`.
 *
 * The corpus also carries MathML, OMML and HTML input. Those are not swept:
 * this port reads HTML through a separate model-fixture layer, and has no
 * MathML or OMML parser. Handing one notation's source to another's parser
 * would record whatever fell out as though it were the gem's answer.
 */
const PARSERS = {
  asciimath: parseAsciimath,
  latex: parseLatex,
  unicode: parseUnicodemath,
} as const;
type InputFormat = keyof typeof PARSERS;
const INPUT_FORMATS = Object.keys(PARSERS) as InputFormat[];

const parse = (c: Case) => PARSERS[c.inputFormat](c.input);

/**
 * The corpus cases the generator sweeps: every conformance case plus every
 * rejection case written in one of the `PARSERS` notations, keyed by id.
 *
 * `casesInInputFormat` throws rather than returning an empty list, so a corpus
 * that stopped carrying one of the three notations fails here instead of
 * turning this file green while it checks nothing for it.
 */
const pinnedInputs = new Map<string, { readonly inputFormat: string; readonly input: string }>(
  INPUT_FORMATS.flatMap((format) => [
    ...casesInInputFormat(pin.cases, format).map(
      (c) => [c.id, { inputFormat: c.inputFormat, input: c.input }] as const,
    ),
    ...casesInInputFormat(pin.rejections, format).map(
      (r) => [r.id, { inputFormat: r.inputFormat, input: r.input }] as const,
    ),
  ]),
);

const renderable = fixture.cases.filter((c) => typeof c.expected === "string");
const raising = fixture.cases.filter((c) => typeof c.raises === "string");
const renderableIds = new Set(renderable.map((c) => c.id));

describe(`${FORMAT} parity fixture covers the pinned corpus`, () => {
  it("came from the pinned oracle, and is not empty", () => {
    expect(fixture.schema).toBe("plurimath-corpus/render-parity/2");
    expect(manifest.payload.schema).toBe(fixture.schema);
    expect(fixture.format).toBe(FORMAT);
    expect(fixture.cases.length).toBeGreaterThan(0);
    expect(manifest.oracle.commit).toBe(pin.provenance.oracleCommit);
  });

  it("carries exactly the pinned corpus's case ids", () => {
    expect(fixture.cases.map((c) => c.id).sort()).toEqual([...pinnedInputs.keys()].sort());
  });

  it("carries no duplicate ids", () => {
    const ids = fixture.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("quotes each case's input and notation as the corpus records them", () => {
    for (const c of fixture.cases) {
      expect(c.input, c.id).toBe(pinnedInputs.get(c.id)?.input);
      expect(c.inputFormat, c.id).toBe(pinnedInputs.get(c.id)?.inputFormat);
    }
  });

  it.each(INPUT_FORMATS)("sweeps %s cases the gem renders", (format) => {
    expect(
      fixture.cases.filter((c) => c.inputFormat === format && typeof c.expected === "string")
        .length,
    ).toBeGreaterThan(0);
  });

  it("its metadata counts its own rows", () => {
    expect(fixture.caseCount, "caseCount").toBe(fixture.cases.length);
    expect(fixture.renderedCount, "renderedCount").toBe(renderable.length);
    expect(fixture.raisedCount, "raisedCount").toBe(raising.length);
  });

  it("gives every case exactly one outcome", () => {
    for (const c of fixture.cases) {
      expect(
        (c.expected === undefined) !== (c.raises === undefined),
        `${c.id} is neither rendered nor raised, or is both`,
      ).toBe(true);
      if (c.raises !== undefined) {
        // The generator now rescues only this class; anything else aborts it.
        expect(c.raises, c.id).toBe("Plurimath::Math::ParseError");
        expect(c.raisedIn, c.id).toMatch(/^(?:parse|render)$/);
      }
    }
  });

  it("records every corpus rejection as a parse-phase refusal", () => {
    // Scoped like the map above: the pin also carries HTML, MathML and OMML
    // rejections, which have no fixture row here, and rightly so. The scope is
    // what keeps them out.
    const rejections = INPUT_FORMATS.flatMap((format) =>
      casesInInputFormat(pin.rejections, format),
    );
    expect(rejections.length).toBeGreaterThan(0);
    for (const rejection of rejections) {
      const entry = fixture.cases.find((c) => c.id === rejection.id);
      expect(entry, `${rejection.id} is a pinned rejection with no fixture row`).toBeDefined();
      expect(entry?.raisedIn, rejection.id).toBe("parse");
    }
  });
});

describe(`${FORMAT} parity, the cases the gem renders`, () => {
  it("the gem renders a non-empty subset", () => {
    expect(renderable.length).toBeGreaterThan(0);
  });

  it("every id in PORT_REFUSES is a case the gem renders", () => {
    const strays = [...PORT_REFUSES].filter((id) => !renderableIds.has(id));
    expect(strays, "PORT_REFUSES names cases this fixture does not render").toEqual([]);
  });

  it("every id in KNOWN_DIVERGENCES is a case the port renders", () => {
    for (const id of Object.keys(KNOWN_DIVERGENCES)) {
      expect(renderableIds.has(id), `${id} is not a gem-renderable case`).toBe(true);
      expect(PORT_REFUSES.has(id), `${id} cannot both diverge and refuse`).toBe(false);
    }
  });

  it(`renders exactly ${RENDERED_BASELINE} of the gem-renderable cases`, () => {
    expect(
      renderable.length - PORT_REFUSES.size,
      "RENDERED_BASELINE and PORT_REFUSES disagree — one was edited without the other",
    ).toBe(RENDERED_BASELINE);
  });

  it.each(renderable.map((c) => [c.id, c] as const))(
    "%s matches the gem byte-for-byte",
    (_id, c) => {
      if (PORT_REFUSES.has(c.id)) {
        expect(
          () => RENDER(parse(c) as never),
          `${c.id} is pinned as refused but now renders — drop it from PORT_REFUSES and raise RENDERED_BASELINE`,
        ).toThrow(RenderError);
        return;
      }

      // Deliberately unguarded: an unexpected refusal throws out of THIS test,
      // which carries the case id in its name. The aggregate count it replaced
      // reported only "Coverage REGRESSED to 33".
      const actual = RENDER(parse(c) as never);

      const divergence = KNOWN_DIVERGENCES[c.id];
      if (divergence !== undefined) {
        // A divergence recorded in TODO.plan/deferred.md. Both halves are
        // pinned: the port's exact bytes, so unrelated corruption is not
        // mistaken for the known difference, and inequality with the gem, so a
        // fix is noticed and the entry goes.
        expect(actual, `${c.id}: ${divergence.reason}`).toBe(divergence.portOutput);
        expect(
          actual,
          `${c.id} now matches the gem — drop it from KNOWN_DIVERGENCES (${divergence.reason})`,
        ).not.toBe(c.expected);
        return;
      }

      expect(actual).toBe(c.expected);
    },
  );
});

describe(`${FORMAT} parity, the cases the gem refuses`, () => {
  it("the gem refuses a non-empty subset", () => {
    expect(raising.length).toBeGreaterThan(0);
  });

  it.each(raising.map((c) => [c.id, c] as const))(
    "%s: the port refuses it in the same phase as the gem",
    (_id, c) => {
      if (c.raisedIn === "parse") {
        expect(() => parse(c), `${c.id}: the gem refuses this at parse`).toThrow(ParseError);
        return;
      }
      // The gem parsed this and refused to render it. So must the port, at the
      // same step: a parser that rejects it instead is a different divergence,
      // and this fails naming the case.
      const tree = parse(c);
      expect(
        () => RENDER(tree as never),
        `${c.id}: the gem parses this and refuses to render it`,
      ).toThrow(RenderError);
    },
  );
});
