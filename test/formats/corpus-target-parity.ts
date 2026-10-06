/**
 * Parity against the corpus's own `omml` and `html` targets.
 *
 * Since plurimath-testsuite#22 every AsciiMath, LaTeX and UnicodeMath group
 * declares `omml` and `html` targets, so the gem's bytes for those two formats
 * are in the shared corpus itself, beside `mathml` and the rest. This is the
 * same two-layer check the four P1 formats get from their own
 * `render-parity.spec.ts`:
 *
 *  1. **Corpus layer** — rebuild each case's recorded `model:` and require the
 *     renderer to reproduce `expected.<format>` byte for byte. A parser bug
 *     cannot hide or cause a failure here.
 *  2. **Round-trip layer** — parse `input` with the parser for the notation the
 *     case is written in, render, and compare. That is what a caller runs.
 *
 * A `cases/2` case may record that the gem REFUSED this target. A refusal has
 * no bytes, so it is asserted the other way round: the port must refuse it too,
 * at render, after the parse succeeds.
 *
 * "Reachable" is `readCorpusCases()`: every pinned case except the one
 * `corpus/exclusions.yaml` withholds, `text-unitsml-valid` (UnitsML is
 * deferred). Its output is pinned as a known divergence in the fixture half of
 * each `render-parity.spec.ts`, not here.
 *
 * The generated `parity-fixtures.json` beside each spec sweeps the same inputs
 * and is kept: it also carries the corpus rejections and records the phase each
 * refusal happens in. The two are cross-checked below, so a fixture and a pin
 * that drift apart fail in a test that names the case.
 */
import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/index";
import { parseAsciimath } from "../../src/formats/asciimath/index";
import { parseLatex } from "../../src/formats/latex/index";
import { parseUnicodemath } from "../../src/formats/unicodemath/index";
import { aliasIndex, buildNode, readCensus, readCorpusCases } from "../core/model-builder";

/** The parser for each notation, keyed by the corpus's `input_format` spelling. */
const PARSERS: Readonly<Record<string, (input: string) => unknown>> = {
  asciimath: parseAsciimath,
  latex: parseLatex,
  unicode: parseUnicodemath,
};

export interface CorpusTargetPins {
  /** The corpus target key: `omml` or `html`. */
  readonly format: "html" | "omml";
  /** Renders a whole formula, as the gem's `Formula#to_<format>` does. */
  readonly renderFormula: (formula: never) => string;
  /** How many reachable cases carry `expected.<format>` bytes. */
  readonly rendered: number;
  /** The ids whose `<format>` target the gem refused, in pin order. */
  readonly refused: readonly string[];
  /** The generated parity fixture's rows, for the cross-check. */
  readonly fixtureRows: readonly {
    readonly id: string;
    readonly expected?: string;
    readonly raisedIn?: string;
  }[];
}

export function describeCorpusTargets(pins: CorpusTargetPins): void {
  const { format, renderFormula } = pins;
  const cases = readCorpusCases();
  const aliases = aliasIndex(readCensus());
  const rendered = cases.filter((entry) => entry.expected.has(format));
  const refused = cases.filter((entry) => entry.refusals.has(format));
  const fixtureById = new Map(pins.fixtureRows.map((row) => [row.id, row] as const));

  const expectedBytes = (entry: (typeof cases)[number]): string => {
    const bytes = entry.expected.get(format);
    if (bytes === undefined) throw new Error(`case ${entry.id}: no expected.${format} recorded`);
    return bytes;
  };
  const parse = (entry: (typeof cases)[number]): unknown => {
    const parser = PARSERS[entry.inputFormat];
    if (parser === undefined) {
      throw new Error(`case ${entry.id}: no parser for input format ${entry.inputFormat}`);
    }
    return parser(entry.input);
  };

  describe(`${format} corpus target: what the pin carries`, () => {
    it(`has ${pins.rendered} cases with ${format} bytes and ${pins.refused.length} refusals`, () => {
      expect(rendered.length).toBe(pins.rendered);
      expect(refused.map((entry) => entry.id)).toStrictEqual(pins.refused);
    });

    it("accounts for every case, as a rendering or as a refusal", () => {
      for (const entry of cases) {
        expect(entry.expected.has(format) || entry.refusals.has(format), entry.id).toBe(true);
      }
    });

    it("records every refusal as a parse_error", () => {
      for (const entry of refused) {
        expect(entry.refusals.get(format), entry.id).toBe("parse_error");
      }
    });

    it("has a parser for every case's input format", () => {
      for (const entry of cases) {
        expect(Object.hasOwn(PARSERS, entry.inputFormat), entry.id).toBe(true);
      }
    });

    it("agrees with the generated parity fixture on every case", () => {
      // The fixture and the pin were written by different generators from the
      // same oracle. A rendering must carry the same bytes in both; a refusal
      // must be a render-phase refusal in the fixture.
      for (const entry of rendered) {
        expect(fixtureById.get(entry.id)?.expected, entry.id).toBe(expectedBytes(entry));
      }
      for (const entry of refused) {
        const row = fixtureById.get(entry.id);
        expect(row?.expected, entry.id).toBeUndefined();
        expect(row?.raisedIn, entry.id).toBe("render");
      }
    });
  });

  describe(`${format} corpus target, corpus layer (recorded model -> bytes)`, () => {
    it.each(rendered.map((entry) => [entry.id, entry] as const))(
      "%s: rendering the gem's model reproduces the gem's bytes",
      (_id, entry) => {
        expect(renderFormula(buildNode(entry.model, aliases) as never)).toBe(expectedBytes(entry));
      },
    );

    it.each(refused.map((entry) => [entry.id, entry] as const))(
      "%s: rendering the gem's model is refused, as the gem refuses it",
      (_id, entry) => {
        const node = buildNode(entry.model, aliases);
        expect(() => renderFormula(node as never)).toThrow(RenderError);
      },
    );
  });

  describe(`${format} corpus target, round-trip layer (input -> parse -> render)`, () => {
    it.each(rendered.map((entry) => [entry.id, entry] as const))(
      "%s: parse + render reproduces the gem's bytes",
      (_id, entry) => {
        expect(renderFormula(parse(entry) as never)).toBe(expectedBytes(entry));
      },
    );

    it.each(refused.map((entry) => [entry.id, entry] as const))(
      "%s: parses, then refuses to render, as the gem does",
      (_id, entry) => {
        // Parsed outside the assertion: a parser that refused instead would be
        // a different divergence, and must fail as such.
        const tree = parse(entry);
        expect(() => renderFormula(tree as never)).toThrow(RenderError);
      },
    );
  });
}
