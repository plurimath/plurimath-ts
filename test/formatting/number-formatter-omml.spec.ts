/**
 * OMML's `formatter:` option on both of the gem's number paths
 * (`src/render/number/omml.ts`): the insert path every number inside a
 * formula takes (flat text in `m:r`/`m:t`, a semantic base included — the
 * gem's `0xff` quirk, TODO.plan/deferred.md), and the per-node path through
 * `Formatter::Numbers::OmmlRenderer` (`m:sSup` notation, `m:sSub` semantic
 * base). Measured rows and their command: `number-formatter-omml-cases.ts`.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { FormulaNode, FracNode, NumberNode, SymbolNode } from "../../src/core/nodes";
import { toOmml, toOmmlWithoutMathTag } from "../../src/formats/omml/renderer";
import { MEASURED } from "./number-formatter-omml-cases";

function compact(xml: string): string {
  return xml.replace(/>\s+</g, "><");
}

function omathInside(xml: string): string {
  const match = /<m:oMath>(.*)<\/m:oMath>/s.exec(compact(xml));
  if (match === null) throw new Error(`no m:oMath in ${xml}`);
  return match[1] as string;
}

const number = (value: string) => new NumberNode({ value });

describe("measured OMML formatter cases", () => {
  it("has 25 or more cases, with sSup, sSub and plain per-node shapes among them", () => {
    // Counts are measured: this is the length of the generated table.
    expect(MEASURED.length).toBeGreaterThanOrEqual(25);
    expect(MEASURED.some((row) => row[4].startsWith("<m:sSup>"))).toBe(true);
    expect(MEASURED.some((row) => row[4].startsWith("<m:sSub>"))).toBe(true);
    expect(MEASURED.some((row) => row[4].startsWith("<m:t>"))).toBe(true);
  });

  it.each(MEASURED.map((row) => [row[0], JSON.stringify(row[1]), row] as const))(
    "%s with %s",
    (_value, _formatter, [value, formatter, inserted, denominator, bare]) => {
      const run = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;
      expect(omathInside(toOmml(new FormulaNode({ value: [number(value)] }), { formatter }))).toBe(
        run(inserted),
      );
      const frac = omathInside(
        toOmml(
          new FormulaNode({
            value: [new FracNode({ parameterOne: number(value), parameterTwo: number("2") })],
          }),
          { formatter },
        ),
      );
      expect(frac).toContain(`<m:num>${run(inserted)}</m:num>`);
      expect(frac).toContain(`<m:den>${run(denominator)}</m:den>`);
      expect(compact(toOmmlWithoutMathTag(number(value), { formatter }))).toBe(bare);
    },
  );
});

describe("the formatter option on the OMML entries", () => {
  it("keeps a number raw with no formatter, or a null one", () => {
    const node = new FormulaNode({ value: [number("1234.5")] });
    expect(omathInside(toOmml(node))).toBe("<m:r><m:t>1234.5</m:t></m:r>");
    expect(omathInside(toOmml(node, { formatter: null }))).toBe("<m:r><m:t>1234.5</m:t></m:r>");
    expect(toOmmlWithoutMathTag(number("1234.5"), { formatter: null })).toBe("<m:t>1234.5</m:t>\n");
  });

  it("leaves a non-number untouched under a formatter", () => {
    const node = new FormulaNode({ value: [new SymbolNode({ value: "x" })] });
    expect(omathInside(toOmml(node, { formatter: {} }))).toBe(omathInside(toOmml(node)));
  });

  it("refuses a non-numeric value under a formatter, on both paths", () => {
    const formatter = {};
    expect(() => toOmml(new FormulaNode({ value: [number("abc")] }), { formatter })).toThrow(
      RenderError,
    );
    expect(() => toOmmlWithoutMathTag(number("abc"), { formatter })).toThrow(RenderError);
  });

  it("refuses an invalid formatter option on both entries", () => {
    const formatter = { options: { base: 3 } } as never;
    expect(() => toOmml(new FormulaNode({ value: [number("1")] }), { formatter })).toThrow(
      /formatter\.options\.base/,
    );
    expect(() => toOmmlWithoutMathTag(number("1"), { formatter })).toThrow(
      /formatter\.options\.base/,
    );
  });

  it("threads the formatter through a derived display-style context", () => {
    // `displayStyle: false` makes a new root context; the formatter must survive it.
    // Measured, oracle 00c52783: `Formula.new([Number.new("1234.5")]).to_omml(display_style:
    // false, formatter: Standard.new(options: { group: "." }))` writes `<m:t>1.234.5</m:t>`.
    const node = new FormulaNode({ value: [number("1234.5")] });
    expect(
      omathInside(toOmml(node, { displayStyle: false, formatter: { options: { group: "." } } })),
    ).toBe("<m:r><m:t>1.234.5</m:t></m:r>");
  });
});
