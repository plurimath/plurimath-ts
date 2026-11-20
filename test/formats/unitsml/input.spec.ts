import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../../../src/cli/args";
import { convert, type OutputFormat } from "../../../src/cli/convert";
import { normalize, ParseError, ParseOptionError, RenderError } from "../../../src/core/index";
import Plurimath, { parse } from "../../../src/index";
import { parseUnitsml } from "../../../src/unitsml/input";
import { parseYaml } from "../../core/corpus-yaml";

type Output = { readonly value?: string; readonly error?: string };
interface Case {
  readonly input: string;
  readonly model?: unknown;
  readonly error?: string;
  readonly outputs?: Readonly<Record<OutputFormat, Output>>;
}
const fixtureUrl = new URL("./standalone-input.yaml", import.meta.url);
const fixtureBytes = readFileSync(fixtureUrl);
const fixture = parseYaml(fixtureBytes.toString()) as unknown as { schema: string; cases: Case[] };
const provenance = parseYaml(
  readFileSync(new URL("./standalone-input.provenance.yaml", import.meta.url), "utf8"),
) as {
  oracle: { commit: string; dirty: boolean; lockSha256: string };
  generator: { dirty: boolean; inputs: Record<string, string> };
  payloadSha256: string;
};
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const writers = {
  asciimath: (p: Plurimath) => p.toAsciimath(),
  latex: (p: Plurimath) => p.toLatex(),
  mathml: (p: Plurimath) => p.toMathml(),
  omml: (p: Plurimath) => p.toOmml(),
  unicodemath: (p: Plurimath) => p.toUnicodemath(),
  html: (p: Plurimath) => p.toHtml(),
};

describe("standalone UnitsML against Ruby's Formula input boundary", () => {
  it("pins nonempty acceptances/refusals and their generator inputs", () => {
    expect(fixture.schema).toBe("plurimath-unitsml-input/1");
    expect(fixture.cases.some((row) => row.model !== undefined)).toBe(true);
    expect(fixture.cases.some((row) => row.error !== undefined)).toBe(true);
    expect(provenance.oracle.commit).toBe("b0a695cbc5ce31fe8d0d3934d0c93428bb6d200e");
    expect(provenance.oracle.dirty).toBe(false);
    expect(provenance.oracle.lockSha256).toBe(
      hash(readFileSync(new URL("../../../scripts/ci/oracle/Gemfile.lock", import.meta.url))),
    );
    expect(provenance.generator.dirty).toBe(false);
    expect(provenance.payloadSha256).toBe(hash(fixtureBytes));
    expect(Object.keys(provenance.generator.inputs)).toHaveLength(3);
    for (const [path, expected] of Object.entries(provenance.generator.inputs)) {
      expect(hash(readFileSync(new URL(`../../../${path}`, import.meta.url))), path).toBe(expected);
    }
  });

  it.each(fixture.cases)("$input retains the reference model or parse refusal", (row) => {
    for (const parseInput of [
      parseUnitsml,
      (input: string) => parse(input, "unitsml"),
      (input: string) => new Plurimath(input, "unitsml").data,
    ]) {
      if (row.error !== undefined) {
        expect(row.error).toBe("Plurimath::Math::ParseError");
        expect(() => parseInput(row.input)).toThrow(ParseError);
      } else {
        expect(normalize(parseInput(row.input))).toStrictEqual(row.model);
      }
    }
  });

  it.each(fixture.cases)("$input renders the reference bytes through the API and CLI", (row) => {
    if (row.error !== undefined) {
      expect(() => convert(row.input, "unitsml", "latex")).toThrow(ParseError);
      return;
    }
    expect(Object.keys(row.outputs ?? {}).sort()).toEqual(Object.keys(writers).sort());
    const formula = new Plurimath(row.input, "unitsml");
    for (const format of Object.keys(writers) as OutputFormat[]) {
      const expected = row.outputs?.[format];
      expect(expected).toBeDefined();
      for (const render of [
        () => writers[format](formula),
        () => convert(row.input, "unitsml", format),
      ]) {
        if (expected?.error !== undefined) expect(render).toThrow(RenderError);
        else expect(render(), `${row.input} -> ${format}`).toBe(expected?.value);
      }
    }
  });

  it("accepts absent, null and empty options and rejects unsupported options before parsing", () => {
    const expected = normalize(parse("kg", "unitsml"));
    expect(normalize(parse("kg", "unitsml", null))).toStrictEqual(expected);
    expect(normalize(parse("kg", "unitsml", {}))).toStrictEqual(expected);
    expect(() => parse("zzz", "unitsml", { locale: "de" } as never)).toThrow(ParseOptionError);
  });

  it("accepts unitsml as CLI input and keeps it out of output formats", () => {
    expect(parseArgs(["convert", "--from", "unitsml", "--to", "mathml"]).kind).toBe("convert");
    expect(parseArgs(["convert", "--from", "unitsml", "--to", "unitsml"]).kind).toBe("error");
  });
});
