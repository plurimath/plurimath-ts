/**
 * The data `formatting` owns (`src/formatting/generated/`), pinned to values
 * the gem printed — every expectation here is a literal recorded from the
 * oracle (plurimath v0.11.6, `00c52783`, Ruby 4.0.1), never a value computed
 * from the generated table itself. The behavioural surface built on this data
 * is `test/formatting/locales.spec.ts`; this file guards the table and its
 * provenance directly, so a bad regeneration fails here even before a
 * consumer misbehaves.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_DECIMAL_MARKER,
  LOCALE_DECIMAL_MARKERS,
} from "../../src/formatting/generated/locale-decimals";
import { FORMATTING_GENERATED_PROVENANCE } from "../../src/formatting/generated/provenance";

/** U+066B ARABIC DECIMAL SEPARATOR — the `ar`/`fa` marker. */
const ARABIC_DECIMAL_SEPARATOR = String.fromCodePoint(0x066b);

describe("the generated locale table", () => {
  it("carries the gem's whole table, in the gem's order", () => {
    // Formatter::SupportedLocales::LOCALES.size => 96, and declaration order
    // is data: it is what makes drift on a gem bump a straight diff.
    expect(LOCALE_DECIMAL_MARKERS).toHaveLength(96);
    expect(LOCALE_DECIMAL_MARKERS[0]).toStrictEqual(["sr-Cyrl-ME", ","]);
    expect(LOCALE_DECIMAL_MARKERS[27]).toStrictEqual(["fil", "."]);
    expect(LOCALE_DECIMAL_MARKERS[95]).toStrictEqual(["zu", "."]);
  });

  it("holds each locale once, with a marker from the gem's marker set", () => {
    const locales = LOCALE_DECIMAL_MARKERS.map((entry) => entry[0]);
    expect(new Set(locales).size).toBe(96);
    for (const [locale, marker] of LOCALE_DECIMAL_MARKERS) {
      expect([",", ".", ARABIC_DECIMAL_SEPARATOR], locale).toContain(marker);
    }
  });

  it("spot-checks entries the gem printed, one per marker", () => {
    // decimal_for("de", default: ".") => ","; ("en") => "."; ("ar") => U+066B.
    expect(LOCALE_DECIMAL_MARKERS).toContainEqual(["de", ","]);
    expect(LOCALE_DECIMAL_MARKERS).toContainEqual(["en", "."]);
    expect(LOCALE_DECIMAL_MARKERS).toContainEqual(["ar", ARABIC_DECIMAL_SEPARATOR]);
  });

  it("carries the gem's default marker", () => {
    // Plurimath::Configuration::DEFAULT_DECIMAL => "."
    expect(DEFAULT_DECIMAL_MARKER).toBe(".");
  });
});

describe("formatting's generated provenance", () => {
  it("names the generator and the oracle the table came from", () => {
    expect(FORMATTING_GENERATED_PROVENANCE.generator).toBe("scripts/generate-formatting-data.rb");
    expect(FORMATTING_GENERATED_PROVENANCE.oracle).toBe("plurimath");
    expect(FORMATTING_GENERATED_PROVENANCE.oracleCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("hashes every generator input, not only the entry point", () => {
    // The generator borrows TypeScript emission from generate-core-data.rb and
    // git/hashing helpers from generate-corpus.rb, so a change to either moves
    // this table. Hashing only the script that was run would let that happen
    // with the provenance unchanged.
    const inputs = FORMATTING_GENERATED_PROVENANCE.generatorInputs;
    expect(inputs.get("scripts/generate-formatting-data.rb")).toMatch(/^[0-9a-f]{64}$/);
    expect(inputs.get("scripts/generate-core-data.rb")).toMatch(/^[0-9a-f]{64}$/);
    expect(inputs.get("scripts/generate-corpus.rb")).toMatch(/^[0-9a-f]{64}$/);
    expect(inputs.has(FORMATTING_GENERATED_PROVENANCE.generator)).toBe(true);
    for (const [path, hash] of inputs) {
      expect(path, path).toMatch(/^scripts\/[\w.-]+\.rb$/);
      expect(hash, path).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("was generated from clean checkouts, so the table may be committed", () => {
    // §7: `--allow-dirty` output is marked non-committable and CI rejects it.
    // This is the assertion that makes "CI rejects it" true rather than a
    // claim — it fails until the table is regenerated from a clean tree.
    expect(FORMATTING_GENERATED_PROVENANCE.oracleClean).toBe(true);
    expect(FORMATTING_GENERATED_PROVENANCE.generatorClean).toBe(true);
    expect(FORMATTING_GENERATED_PROVENANCE.committable).toBe(true);
  });
});
