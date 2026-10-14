/** Public model and output parity for measured UnicodeMath compositions. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type FormulaNode, normalize, ParseError, PlurimathError } from "../../../src/core/index";
import { toAsciimath } from "../../../src/formats/asciimath/index";
import { toHtml } from "../../../src/formats/html/index";
import { toLatex } from "../../../src/formats/latex/index";
import { toMathml } from "../../../src/formats/mathml/index";
import { toOmml } from "../../../src/formats/omml/index";
import { parseUnicodemath, toUnicodemath } from "../../../src/formats/unicodemath/index";

const renderers = {
  asciimath: toAsciimath,
  latex: toLatex,
  mathml: toMathml,
  html: toHtml,
  omml: toOmml,
  unicodemath: toUnicodemath,
};
type Format = keyof typeof renderers;
interface Witness {
  readonly input: string;
  readonly model: unknown;
  readonly [key: string]: unknown;
}
const here = dirname(fileURLToPath(import.meta.url));
const payload = readFileSync(join(here, "scope-gap-fixtures.json"), "utf8");
const fixtures = JSON.parse(payload) as { readonly cases: readonly Witness[] };
const metadata = JSON.parse(
  readFileSync(join(here, "scope-gap-fixtures.metadata.json"), "utf8"),
) as {
  readonly oracle: string;
  readonly source: string;
  readonly sourceDirty: boolean;
  readonly sourcePayloadSha256: string;
  readonly payloadSha256: string;
  readonly traceControlsPassed: boolean;
  readonly unattemptedPriorityInputs: readonly string[];
  readonly projection: { readonly rowCount: number };
};

describe("measured UnicodeMath composition boundaries", () => {
  it.each(
    fixtures.cases
      .filter((entry) => entry.raises !== undefined)
      .map((entry) => [entry.input, entry] as const),
  )("%j: preserves the reference parse refusal", (_input, entry) => {
    expect(() => parseUnicodemath(entry.input)).toThrow(ParseError);
  });
  it("binds the projection to a clean, calibrated reference measurement", () => {
    expect(metadata.oracle).toBe("00c52783877b38f6b8e6e109f1803f96bb34fc62");
    expect(metadata.source).toBe("2f6bae3b8db4d97b1de3fff95794b53199e82f24");
    expect(metadata.sourceDirty).toBe(false);
    expect(metadata.traceControlsPassed).toBe(true);
    expect(metadata.unattemptedPriorityInputs).toStrictEqual([]);
    expect(metadata.sourcePayloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(createHash("sha256").update(payload).digest("hex")).toBe(metadata.payloadSha256);
    expect(fixtures.cases.length).toBe(metadata.projection.rowCount);
    expect(fixtures.cases.length).toBeGreaterThan(0);
  });

  it.each(
    fixtures.cases
      .filter((entry) => entry.model !== undefined)
      .map((entry) => [entry.input, entry] as const),
  )("%j: preserves Ruby's public model and measured rendering boundaries", (_input, entry) => {
    const formula: FormulaNode = parseUnicodemath(entry.input);
    expect(normalize(formula)).toStrictEqual(entry.model);
    for (const format of Object.keys(renderers) as Format[]) {
      if (Object.hasOwn(entry, `${format}Error`)) {
        expect(() => renderers[format](formula), `${entry.input}: ${format}`).toThrow(
          PlurimathError,
        );
      } else {
        expect(Object.hasOwn(entry, format), `${entry.input}: missing ${format}`).toBe(true);
        expect(renderers[format](formula), `${entry.input}: ${format}`).toBe(entry[format]);
      }
    }
  });
});
