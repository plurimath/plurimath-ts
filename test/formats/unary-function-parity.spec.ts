/**
 * Oracle-backed parity for the unary-function kinds the LaTeX, HTML and
 * UnicodeMath parsers can build — `Mbox`, `Ln`, `Det`, `Gcd`, `Max`, `Cancel`,
 * `Hom`, `Left`, `Substack` and `Phantom` — in all six formats.
 *
 * The rows are the `unary-function` group of
 * `test/formats/<format>/render-options-fixtures.json`, generated, never typed:
 *   ruby scripts/generate-render-options-fixtures.rb --oracle <clean pinned checkout>
 * Each row is an input (a text the gem parses, or a hand-built model after the
 * gem's own unit specs) and the gem's exact bytes for a default call.
 *
 * Every row is asserted. Where the gem renders, the port renders the same bytes
 * — or, for the rows named in `PORT_REFUSES`, refuses with a kind renderer's
 * own message. Where the gem refuses, the port refuses too, and the two kinds of
 * refusal are kept apart: a row the gem could not PARSE must not parse here, and
 * a row the gem could not RENDER must parse and then raise a `RenderError`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type MathNode, RenderError } from "../../src/core/index";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { parseHtml, toHtml } from "../../src/formats/html/index";
import { parseLatex, toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/renderer";
import { toOmml } from "../../src/formats/omml/renderer";
import { parseUnicodemath, toUnicodemath } from "../../src/formats/unicodemath/index";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../core/model-builder";

const FORMATS = ["asciimath", "latex", "mathml", "html", "omml", "unicodemath"] as const;
type Format = (typeof FORMATS)[number];

interface Row {
  readonly id: string;
  readonly group: string;
  readonly source: string;
  readonly input: {
    readonly model?: SerializedNode;
    readonly format?: string;
    readonly text?: string;
  };
  readonly options: Readonly<Record<string, unknown>>;
  readonly expected?: string;
  readonly raises?: string;
  readonly raisedIn?: string;
}

interface Fixture {
  readonly cases: readonly Row[];
}

const GROUP = "unary-function";
const HERE = dirname(fileURLToPath(import.meta.url));
const CENSUS_ALIASES = aliasIndex(readCensus());

const RENDERERS: Readonly<Record<Format, (node: MathNode) => string>> = {
  asciimath: (node) => toAsciimath(node),
  latex: (node) => toLatex(node),
  mathml: (node) => toMathml(node),
  html: (node) => toHtml(node),
  omml: (node) => toOmml(node),
  unicodemath: (node) => toUnicodemath(node),
};

/**
 * Rows the gem renders that this port refuses, per format: id (without the
 * `unary-function-` prefix) to the refusal a kind renderer gives. Each is a gap
 * in a kind this slice does not own, or a case measured and deliberately kept
 * refused, and the reason is named at the entry. An entry that starts rendering
 * fails its test until it is dropped.
 */
const PORT_REFUSES: Readonly<Record<Format, Readonly<Record<string, RegExp>>>> = {
  asciimath: {},
  latex: {},
  mathml: {},
  html: {},
  omml: {},
  unicodemath: {},
};

function build(row: Row): MathNode {
  if (row.input.model !== undefined) return buildNode(row.input.model, CENSUS_ALIASES);
  const text = row.input.text as string;
  switch (row.input.format) {
    case "latex":
      return parseLatex(text);
    case "html":
      return parseHtml(text);
    case "unicodemath":
      return parseUnicodemath(text);
    default:
      throw new Error(`${row.id}: unknown input format ${row.input.format}`);
  }
}

function load(format: Format): readonly Row[] {
  const fixture = JSON.parse(
    readFileSync(join(HERE, format, "render-options-fixtures.json"), "utf8"),
  ) as Fixture;
  // `underover` rides alongside: `Underover` is a `TernaryFunction` subclass
  // the `get_class` census never reaches, hand-built by the generator's
  // `underover_rows` (see `scripts/generate-render-options-fixtures.rb`) the
  // same way this group's own hand-built rows are. Only the OPTION-FREE rows
  // (OMML also carries `displayStyle: true`/`false` variants, which this file
  // cannot assert — every render call here is the plain `to_<format>` with no
  // options — and which `split-display-parity.spec.ts` owns instead).
  return fixture.cases.filter(
    (row) =>
      row.group === GROUP || (row.group === "underover" && Object.keys(row.options).length === 0),
  );
}

/** A row's id, without the `unary-function-` prefix every one carries. */
function short(row: Row): string {
  return row.id.replace(/^unary-function-/, "");
}

for (const format of FORMATS) {
  const rows = load(format);
  const render = RENDERERS[format];
  const refuses = new Map(Object.entries(PORT_REFUSES[format]));
  const rendered = rows.filter((row) => row.expected !== undefined);
  const parseRefused = rows.filter((row) => row.raisedIn === "parse");
  const renderRefused = rows.filter((row) => row.raisedIn === "render");

  describe(`${format} unary-function parity`, () => {
    it("is not vacuous", () => {
      expect(rows.length).toBeGreaterThan(100);
      expect(rendered.length + parseRefused.length + renderRefused.length).toBe(rows.length);
      expect(rendered.length).toBeGreaterThan(0);
    });

    it("names only rows the gem renders", () => {
      const ids = new Set(rendered.map((row) => row.id));
      expect([...refuses.keys()].filter((id) => !ids.has(`${GROUP}-${id}`))).toEqual([]);
    });

    it.each(rendered.map((row) => [short(row), row] as const))(
      "%s matches the gem byte-for-byte",
      (_id, row) => {
        const refusal = refuses.get(short(row));
        if (refusal !== undefined) {
          expect(() => render(build(row))).toThrow(RenderError);
          expect(() => render(build(row))).toThrow(refusal);
          return;
        }
        expect(render(build(row))).toBe(row.expected);
      },
    );

    if (parseRefused.length > 0) {
      it.each(parseRefused.map((row) => [short(row), row] as const))(
        "%s: the gem cannot parse it, and neither can the port",
        (_id, row) => {
          expect(() => build(row)).toThrow();
        },
      );
    }

    if (renderRefused.length > 0) {
      it.each(renderRefused.map((row) => [short(row), row] as const))(
        "%s: the gem parses it and cannot render it, and the port refuses the render",
        (_id, row) => {
          const node = build(row);
          expect(() => render(node)).toThrow(RenderError);
        },
      );
    }
  });
}
