/** Historical public-model parity from the bounded nine-rule Ruby investigation. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { parseUnicodemath } from "../../../src/formats/unicodemath/index";

interface Witness {
  readonly input: string;
  readonly model?: unknown;
  readonly raises?: string;
}

interface Metadata {
  readonly schema: string;
  readonly sourceSchema: string;
  readonly source: string;
  readonly sourceDirty: boolean;
  readonly oracle: string;
  readonly lockSha256: string;
  readonly sourcePayloadSha256: string;
  readonly payloadSha256: string;
  readonly sourceRun: { readonly runId: string; readonly conclusion: string };
  readonly sourceInputs: Readonly<Record<string, string>>;
  readonly oracleInputs: Readonly<Record<string, string>>;
  readonly parslet: {
    readonly version: string;
    readonly engineInputs: Readonly<Record<string, string>>;
  };
  readonly attemptedCount: number;
  readonly traceControlsPassed: boolean;
  readonly unattemptedPriorityInputs: readonly string[];
  readonly controlFirings: Readonly<Record<string, number>>;
  readonly targetFirings: Readonly<Record<string, number>>;
  readonly projection: {
    readonly rowCount: number;
    readonly modelCount: number;
    readonly refusalCount: number;
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const payload = readFileSync(join(here, "reachability-fixtures.json"), "utf8");
const fixtures = JSON.parse(payload) as {
  readonly schema: string;
  readonly cases: readonly Witness[];
};
const metadata = JSON.parse(
  readFileSync(join(here, "reachability-fixtures.metadata.json"), "utf8"),
) as Metadata;
const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const refused = fixtures.cases.filter((entry) => entry.raises !== undefined);

describe("the measured public inputs from the nine-rule investigation", () => {
  it("retains the historical source, payload and engine calibration", () => {
    expect(fixtures.schema).toBe("plurimath-unicodemath-reachability/1");
    expect(metadata.schema).toBe("plurimath-unicodemath-reachability-projection/1");
    expect(metadata.sourceSchema).toBe("plurimath-unicode-unreached-probe/2");
    expect(metadata.source).toBe("0fa4603fec369c61283712ee750157dda24c14d2");
    expect(metadata.sourceDirty).toBe(false);
    expect(metadata.oracle).toBe("00c52783877b38f6b8e6e109f1803f96bb34fc62");
    expect(metadata.lockSha256).toBe(
      "03bdd3de3d9bcd911e87a7d37605f2e8ee5d003a511881779a82490425f18121",
    );
    expect(metadata.sourcePayloadSha256).toBe(
      "00a02cb65da7505ceb6ee6f84fc26a61bd3de385749e91e95bc6798f87da9620",
    );
    expect(metadata.sourceRun.runId).toBe("38567541059");
    expect(metadata.sourceRun.conclusion).toBe("success");
    expect(metadata.parslet.version).toBe("2.0.0");
    for (const inputs of [
      metadata.sourceInputs,
      metadata.oracleInputs,
      metadata.parslet.engineInputs,
    ]) {
      expect(Object.keys(inputs).length).toBeGreaterThan(0);
      for (const hash of Object.values(inputs)) expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(createHash("sha256").update(payload).digest("hex")).toBe(metadata.payloadSha256);
    expect(metadata.traceControlsPassed).toBe(true);
    expect(metadata.unattemptedPriorityInputs).toStrictEqual([]);
    for (const id of ["18", "1609"]) expect(metadata.controlFirings[id]).toBeGreaterThan(0);
    expect(metadata.targetFirings["2323"]).toBeGreaterThan(0);
  });

  it("preserves every attempted model or public refusal", () => {
    expect(fixtures.cases.length).toBe(metadata.attemptedCount);
    expect(fixtures.cases.length).toBe(metadata.projection.rowCount);
    expect(parsed.length).toBe(metadata.projection.modelCount);
    expect(refused.length).toBe(metadata.projection.refusalCount);
    expect(parsed.length).toBe(671);
    expect(refused.length).toBe(27);
    expect(parsed.length + refused.length).toBe(fixtures.cases.length);
    expect(new Set(fixtures.cases.map((entry) => entry.input)).size).toBe(fixtures.cases.length);
    for (const entry of fixtures.cases) {
      expect(entry.model !== undefined, entry.input).not.toBe(entry.raises !== undefined);
      if (entry.raises !== undefined) expect(entry.raises).toBe("Plurimath::Math::ParseError");
    }
  });

  it.each(parsed.map((entry) => [entry.input, entry] as const))(
    "%j: the public parser reproduces the measured Ruby model",
    (_input, entry) => {
      expect(normalize(parseUnicodemath(entry.input))).toStrictEqual(entry.model);
    },
  );

  it.each(refused.map((entry) => [entry.input, entry] as const))(
    "%j: the public parser refuses the measured Ruby rejection",
    (_input, entry) => {
      expect(() => parseUnicodemath(entry.input)).toThrow(ParseError);
    },
  );
});
