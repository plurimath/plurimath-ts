/**
 * The data `formatting` owns (`src/formatting/generated/`), pinned to values
 * the gem printed — every expectation here is a literal recorded from the
 * oracle (plurimath v0.11.6, `00c52783`, Ruby 4.0.1), never a value computed
 * from the generated table itself. The behavioural surface built on this data
 * is `test/formatting/locales.spec.ts`; this file guards the table and its
 * provenance directly, so a bad regeneration fails here even before a
 * consumer misbehaves.
 */

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import {
  DEFAULT_DECIMAL_MARKER,
  LOCALE_DECIMAL_MARKERS,
} from "../../src/formatting/generated/locale-decimals";
import {
  DEFAULT_GROUP_MARKER,
  LOCALE_GROUP_MARKERS,
} from "../../src/formatting/generated/locale-groups";
import { FORMATTING_GENERATED_PROVENANCE } from "../../src/formatting/generated/provenance";

/** U+066B ARABIC DECIMAL SEPARATOR — the `ar`/`fa` marker. */
const ARABIC_DECIMAL_SEPARATOR = String.fromCodePoint(0x066b);
/** U+066C ARABIC THOUSANDS SEPARATOR — the `ar`/`fa` group marker. */
const ARABIC_THOUSANDS_SEPARATOR = String.fromCodePoint(0x066c);

describe("the generated locale table", () => {
  it("carries the gem's whole table, in the gem's order", () => {
    // Formatter::SupportedLocales::LOCALES.size => 96, and declaration order
    // is data: it is what makes drift on a gem bump a straight diff.
    expect(LOCALE_DECIMAL_MARKERS).toHaveLength(96);
    expect(LOCALE_DECIMAL_MARKERS[0]).toStrictEqual(["sr-Cyrl-ME", ","]);
    expect(LOCALE_DECIMAL_MARKERS[27]).toStrictEqual(["fil", "."]);
    expect(LOCALE_DECIMAL_MARKERS[95]).toStrictEqual(["zu", "."]);
  });

  it("matches the gem's whole table, hashed — every entry, not a sample", () => {
    // Digest::SHA256 over JSON.generate of the gem's [locale, decimal] tuples
    // in declaration order (probe: SupportedLocales::LOCALES at 00c52783) —
    // printed by the oracle, byte-equal to JSON.stringify here, so ANY drifted
    // entry moves this hash. Closes the review's gap: the spot-checks below
    // sample three entries; this pins all 96.
    const json = JSON.stringify(LOCALE_DECIMAL_MARKERS);
    const hash = createHash("sha256").update(json).digest("hex");
    expect(hash).toBe("b0996c899752ac6886cacde35c34187b4753511a400434fc316edbb6cc200dff");
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

describe("the generated group table", () => {
  it("carries the gem's whole table, in the same order as the decimal table", () => {
    // Formatter::SupportedLocales::LOCALES.size => 96, same declaration order
    // as ./locale-decimals.ts — the two tables' rows line up by index.
    expect(LOCALE_GROUP_MARKERS).toHaveLength(96);
    expect(LOCALE_GROUP_MARKERS.map((entry) => entry[0])).toStrictEqual(
      LOCALE_DECIMAL_MARKERS.map((entry) => entry[0]),
    );
    expect(LOCALE_GROUP_MARKERS[0]).toStrictEqual(["sr-Cyrl-ME", "."]);
    expect(LOCALE_GROUP_MARKERS[27]).toStrictEqual(["fil", ","]);
    expect(LOCALE_GROUP_MARKERS[95]).toStrictEqual(["zu", ","]);
  });

  it("matches the gem's whole table, hashed — every entry, not a sample", () => {
    // Verified by a live render (module doc, ./locale-groups.ts): every
    // entry's group marker groups a seven-digit probe integer correctly
    // under `Plurimath::NumberFormatter.new(locale, localizer_symbols: {})`,
    // and no OTHER marker in the table would have. This pins the whole
    // table, not only the spot-checks below.
    const json = JSON.stringify(LOCALE_GROUP_MARKERS);
    const hash = createHash("sha256").update(json).digest("hex");
    expect(hash).toBe("b644e605db45795ba8550d1930f294bbb5f99860735ae1c65f0b945e16b07ed6");
  });

  it("holds each locale once, with a marker from the gem's marker set", () => {
    const locales = LOCALE_GROUP_MARKERS.map((entry) => entry[0]);
    expect(new Set(locales).size).toBe(96);
    const markers = new Set(LOCALE_GROUP_MARKERS.map((entry) => entry[1]));
    expect(markers.size).toBe(6);
  });

  it("spot-checks entries the gem printed, one per family of marker", () => {
    // Plurimath::Formatter::SupportedLocales::LOCALES[:de][:group] => "."
    // [:en][:group] => ","; [:ar][:group] => U+066C; [:"it-CH"][:group] => "’"
    expect(LOCALE_GROUP_MARKERS).toContainEqual(["de", "."]);
    expect(LOCALE_GROUP_MARKERS).toContainEqual(["en", ","]);
    expect(LOCALE_GROUP_MARKERS).toContainEqual(["ar", ARABIC_THOUSANDS_SEPARATOR]);
    expect(LOCALE_GROUP_MARKERS).toContainEqual(["it-CH", "’"]);
    // fr's group is U+202F NARROW NO-BREAK SPACE, not a plain space — the
    // generator escapes it rather than emitting an invisible byte verbatim
    // (`CoreDataGenerator::UNSAFE_IN_SOURCE`).
    expect(LOCALE_GROUP_MARKERS).toContainEqual(["fr", " "]);
  });

  it("keeps the Arabic thousands separator distinct from the decimal separator", () => {
    const marker = LOCALE_GROUP_MARKERS.find(([locale]) => locale === "ar")?.[1];
    expect(marker).toBe(ARABIC_THOUSANDS_SEPARATOR);
    expect(marker).not.toBe(ARABIC_DECIMAL_SEPARATOR);
  });

  it("carries the gem's default group marker", () => {
    // Formatter::Standard::DEFAULT_OPTIONS[:group] => ","
    expect(DEFAULT_GROUP_MARKER).toBe(",");
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
