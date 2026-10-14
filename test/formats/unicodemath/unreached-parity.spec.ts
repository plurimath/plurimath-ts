/** Public model parity for faithfully projected Ruby rule-2323 witnesses. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { parseUnicodemath } from "../../../src/formats/unicodemath/index";

interface Witness {
  readonly input: string;
  readonly model: unknown;
  readonly targetFirings: Readonly<Record<string, number>>;
}

interface ProjectionMetadata {
  readonly oracle: string;
  readonly payloadSha256: string;
  readonly sourcePayloadSha256: string;
  readonly tracePositiveControls: Readonly<Record<string, number>>;
  readonly projection: { readonly rowCount: number };
}

const here = dirname(fileURLToPath(import.meta.url));
const payload = readFileSync(join(here, "unreached-fixtures.json"), "utf8");
const fixtures = JSON.parse(payload) as {
  readonly schema: string;
  readonly cases: readonly Witness[];
};
const metadata = JSON.parse(
  readFileSync(join(here, "unreached-fixtures.metadata.json"), "utf8"),
) as ProjectionMetadata;

describe("the measured rule-2323 witnesses", () => {
  it("retains a nonempty calibrated projection and its payload hash", () => {
    expect(fixtures.schema).toBe("plurimath-unicodemath-unreached/1");
    expect(metadata.oracle).toBe("00c52783877b38f6b8e6e109f1803f96bb34fc62");
    expect(metadata.sourcePayloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(createHash("sha256").update(payload).digest("hex")).toBe(metadata.payloadSha256);
    expect(fixtures.cases.length).toBe(metadata.projection.rowCount);
    expect(fixtures.cases.length).toBeGreaterThan(0);
    expect(metadata.tracePositiveControls["18"]).toBeGreaterThan(0);
    expect(metadata.tracePositiveControls["1609"]).toBeGreaterThan(0);
    for (const entry of fixtures.cases) {
      expect(entry.targetFirings["2323"], entry.input).toBeGreaterThan(0);
      expect(entry.model, entry.input).toBeDefined();
    }
  });

  it.each(fixtures.cases.map((entry) => [entry.input, entry] as const))(
    "%j: the public parser reproduces the measured Ruby model",
    (_input, entry) => {
      expect(normalize(parseUnicodemath(entry.input))).toStrictEqual(entry.model);
    },
  );
});
