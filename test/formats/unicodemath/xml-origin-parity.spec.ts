/** Ruby public-model observations for UnicodeMath harvested from XML corpus rows. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { parseUnicodemath } from "../../../src/formats/unicodemath/index";
import { buildUnicodemathTransform } from "../../../src/formats/unicodemath/transform";

interface Witness {
  readonly input: string;
  readonly model?: unknown;
  readonly raises?: string;
  readonly sourceCaseIds: readonly string[];
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
  readonly sourceInputs: Readonly<Record<string, string>>;
  readonly sourceRun: { readonly runId: string; readonly conclusion: string };
  readonly parslet: {
    readonly version: string;
    readonly engineInputs: Readonly<Record<string, string>>;
  };
  readonly registeredRuleCount: number;
  readonly registeredRuleIds: readonly string[];
  readonly unreachableRuleIds: readonly string[];
  readonly unattemptedPriorityInputs: readonly string[];
  readonly traceControlsPassed: boolean;
  readonly controlFirings: Readonly<Record<string, number>>;
  readonly targetFirings: Readonly<Record<string, number>>;
  readonly candidates: {
    readonly path: string;
    readonly sha256: string;
    readonly corpus: string;
    readonly sourceRecordCount: number;
    readonly rowCount: number;
  };
  readonly projection: {
    readonly rowCount: number;
    readonly modelCount: number;
    readonly refusalCount: number;
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const payload = readFileSync(join(here, "xml-origin-fixtures.json"), "utf8");
const fixtures = JSON.parse(payload) as {
  readonly schema: string;
  readonly cases: readonly Witness[];
};
const metadata = JSON.parse(
  readFileSync(join(here, "xml-origin-fixtures.metadata.json"), "utf8"),
) as Metadata;
const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const refused = fixtures.cases.filter((entry) => entry.raises !== undefined);

describe("the XML-origin UnicodeMath observations", () => {
  it("retains the pinned measurement and candidate provenance", () => {
    expect(fixtures.schema).toBe("plurimath-unicodemath-xml-origin/1");
    expect(metadata.schema).toBe("plurimath-unicodemath-xml-origin-projection/1");
    expect(metadata.sourceSchema).toBe("plurimath-unicode-unreached-probe/2");
    expect(metadata.source).toBe("f5627717558f7d6c99bd0c113c70994f330a62c5");
    expect(metadata.sourceDirty).toBe(false);
    expect(metadata.oracle).toBe("00c52783877b38f6b8e6e109f1803f96bb34fc62");
    expect(metadata.lockSha256).toBe(
      "03bdd3de3d9bcd911e87a7d37605f2e8ee5d003a511881779a82490425f18121",
    );
    expect(metadata.sourcePayloadSha256).toBe(
      "d781e6ede9da8f778f9a2d8986a516622f49a86904809c0bd9ead6b7934cd7c7",
    );
    expect(metadata.sourceRun.runId).toBe("38573439568");
    expect(metadata.sourceRun.conclusion).toBe("success");
    expect(metadata.parslet.version).toBe("2.0.0");
    expect(metadata.candidates.corpus).toBe("cf3c5ebf8b8ce35ade189b11a741f272ae93c8a0");
    expect(metadata.candidates.sourceRecordCount).toBe(454);
    expect(metadata.candidates.sha256).toBe(metadata.sourceInputs[metadata.candidates.path]);
    for (const hash of Object.values(metadata.parslet.engineInputs)) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(createHash("sha256").update(payload).digest("hex")).toBe(metadata.payloadSha256);
    expect(metadata.unattemptedPriorityInputs).toStrictEqual([]);
    expect(metadata.traceControlsPassed).toBe(true);
    for (const id of ["18", "1609"]) expect(metadata.controlFirings[id]).toBeGreaterThan(0);
    expect(metadata.targetFirings["2323"]).toBeGreaterThan(0);
  });

  it("retains every harvested candidate and exclusive parse outcome", () => {
    expect(fixtures.cases.length).toBe(440);
    expect(fixtures.cases.length).toBe(metadata.candidates.rowCount);
    expect(fixtures.cases.length).toBe(metadata.projection.rowCount);
    expect(parsed.length).toBe(354);
    expect(parsed.length).toBe(metadata.projection.modelCount);
    expect(refused.length).toBe(86);
    expect(refused.length).toBe(metadata.projection.refusalCount);
    expect(parsed.length + refused.length).toBe(fixtures.cases.length);
    expect(new Set(fixtures.cases.map((entry) => entry.input)).size).toBe(fixtures.cases.length);
    for (const entry of fixtures.cases) {
      expect(entry.model !== undefined, entry.input).not.toBe(entry.raises !== undefined);
      expect(entry.sourceCaseIds.length, entry.input).toBeGreaterThan(0);
      if (entry.raises !== undefined) expect(entry.raises).toBe("Plurimath::Math::ParseError");
    }
  });

  it("partitions every measured Ruby registration into ported or unreachable rules", () => {
    const ported = buildUnicodemathTransform().ruleIds;
    const unreachable = metadata.unreachableRuleIds;
    const registered = metadata.registeredRuleIds;
    expect(ported.length).toBe(484);
    expect(unreachable.length).toBe(35);
    expect(registered.length).toBe(519);
    expect(registered.length).toBe(metadata.registeredRuleCount);
    for (const ids of [ported, unreachable, registered]) expect(new Set(ids).size).toBe(ids.length);
    const portedSet = new Set(ported);
    expect(unreachable.filter((id) => portedSet.has(id))).toStrictEqual([]);
    expect([...ported, ...unreachable].sort()).toStrictEqual([...registered].sort());
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
