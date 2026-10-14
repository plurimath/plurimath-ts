/**
 * Public UnicodeMath parsing and rendering against the GHA completion probe.
 * The fixture and its provenance sidecar are generated from the pinned Ruby
 * oracle; expected models, rendered bytes and refusals are never maintained
 * here. Cases cover both masked-fence shapes, Float overflow, root branches
 * and raw hashes that the gem leaves unmatched.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize, ParseError, RenderError } from "../../../src/core/index";
import { parseUnicodemath, toUnicodemath } from "../../../src/formats/unicodemath/index";

interface ProbeCase {
  readonly input: string;
  readonly model?: unknown;
  readonly raises?: string;
  readonly unicodemath?: string;
  readonly unicodemathError?: { readonly class: string; readonly message: string };
}

interface ProbeFixture {
  readonly schema: string;
  readonly cases: readonly ProbeCase[];
}

interface ProbeMetadata {
  readonly oracle: string;
  readonly measured: boolean;
  readonly payloads: { readonly "unicode-probe.json": string };
  readonly stages: readonly { readonly name: string; readonly exit: number }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const payload = readFileSync(join(here, "completion-fixtures.json"), "utf8");
const fixture = JSON.parse(payload) as ProbeFixture;
const metadata = JSON.parse(
  readFileSync(join(here, "completion-fixtures.metadata.json"), "utf8"),
) as ProbeMetadata;
const parsed = fixture.cases.filter((entry) => entry.model !== undefined);
const refused = fixture.cases.filter((entry) => entry.raises !== undefined);
const rendered = parsed.filter((entry) => entry.unicodemath !== undefined);
const renderRefused = parsed.filter((entry) => entry.unicodemathError !== undefined);

describe("the generated UnicodeMath completion witnesses", () => {
  it("retains the measured payload and pinned oracle provenance", () => {
    expect(metadata.measured).toBe(true);
    expect(metadata.oracle).toBe("00c52783877b38f6b8e6e109f1803f96bb34fc62");
    expect(metadata.stages.find((stage) => stage.name === "small-probe")?.exit).toBe(0);
    expect(createHash("sha256").update(payload).digest("hex")).toBe(
      metadata.payloads["unicode-probe.json"],
    );
  });

  it("has the measured schema, inputs and both parse outcomes", () => {
    expect(fixture.schema).toBe("plurimath-unicode-probe/1");
    expect(fixture.cases.length).toBeGreaterThanOrEqual(30);
    const inputs = new Set(fixture.cases.map((entry) => entry.input));
    expect(inputs.size).toBe(fixture.cases.length);
    for (const input of ["├23(a┤23)", "├23(a b c┤23)", "├3181(a┤3181)", "∛x", "∜x"]) {
      expect(inputs.has(input), input).toBe(true);
    }
    expect(parsed.length).toBeGreaterThan(0);
    expect(refused.length).toBeGreaterThan(0);
    expect(parsed.length + refused.length).toBe(fixture.cases.length);
    for (const entry of fixture.cases) {
      expect(entry.model !== undefined, entry.input).not.toBe(entry.raises !== undefined);
    }
    expect(rendered.length).toBeGreaterThan(0);
    expect(renderRefused.length).toBeGreaterThan(0);
    expect(rendered.length + renderRefused.length).toBe(parsed.length);
  });

  it.each(parsed.map((entry) => [entry.input, entry] as const))(
    "%j: the public parser reproduces the whole Ruby model",
    (_input, entry) => {
      expect(normalize(parseUnicodemath(entry.input))).toStrictEqual(entry.model);
    },
  );

  it.each(refused.map((entry) => [entry.input, entry] as const))(
    "%j: the public parser refuses the Ruby rejection",
    (_input, entry) => {
      expect(() => parseUnicodemath(entry.input)).toThrow(ParseError);
    },
  );

  it.each(rendered.map((entry) => [entry.input, entry] as const))(
    "%j: parse and render reproduce the Ruby bytes",
    (_input, entry) => {
      expect(toUnicodemath(parseUnicodemath(entry.input))).toBe(entry.unicodemath);
    },
  );

  it.each(renderRefused.map((entry) => [entry.input, entry] as const))(
    "%j: rendering refuses the Ruby crash at the modern error boundary",
    (_input, entry) => {
      expect(() => toUnicodemath(parseUnicodemath(entry.input))).toThrow(RenderError);
    },
  );
});
