/**
 * The generator's symbol-slice registry (ARCHITECTURE.md §5,
 * TODO.plan/p1-asciimath/02-symbol-data.md, and for the HTML and OMML slices
 * specifically TODO.plan/p2-output-formats/04-symbol-data.md, which arrives with
 * its own branch and is not present here yet).
 *
 * `scripts/generate-corpus.rb` emits one physical slice per entry in
 * `SYMBOL_FORMATS`, and probes each of them across the axes `CONTEXT_AXES`
 * manifests. Three lists therefore have to agree, and nothing compared them:
 * the format list, the `case format` arm in `representation` (the symbol's own
 * render method) and the arm in `render_host` (the same symbol inside a host
 * formula).
 *
 * The failure that makes this worth a spec already happened once and is
 * recorded in `render_host` itself: a format reached the list with no arm
 * there, the generator's own `Error` was swallowed by the probe's rescue, and
 * the run finished reporting 5,848 "probe failures" — a number that read as a
 * finding about UnicodeMath and was a finding about a missing four-line arm.
 * A missing arm is now a failing assertion instead of a plausible-looking
 * measurement.
 *
 * **This spec reads the generator, never its output.** It is the contract test
 * for the source commit that adds a format, which by design lands before the
 * slice that format emits exists on disk (the two-commit protocol in
 * `02-symbol-data.md`: generator source first, generated data second). An
 * assertion here that imported `src/generated/<format>/` would fail on the
 * commit it exists to cover.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENERATOR = readFileSync(join(REPO_ROOT, "scripts", "generate-corpus.rb"), "utf8");

/** The words of a `%w[a b c]` literal. */
function words(literal: string): string[] {
  const match = /^%w\[([^\]]*)\]/.exec(literal.trim());
  expect(match, `not a %w[] literal: ${literal}`).not.toBeNull();
  return (match?.[1] ?? "").split(/\s+/).filter(Boolean);
}

/**
 * The single assignment of a Ruby constant, right-hand side only. Asserting on
 * a unique match is what stops a rename or a second assignment from leaving
 * these checks comparing a value the generator no longer uses.
 */
function assignment(name: string): string {
  const found = [...GENERATOR.matchAll(new RegExp(`^  ${name} = (.+)$`, "gm"))];
  expect(found.length, `generate-corpus.rb should assign ${name} exactly once`).toBe(1);
  return found[0]?.[1] ?? "";
}

/** `SYMBOL_FORMATS`, resolved through the `TARGET_FORMATS` it is built from. */
function symbolFormats(): string[] {
  const targets = words(assignment("TARGET_FORMATS"));
  const rhs = assignment("SYMBOL_FORMATS");
  const extra = /^\(TARGET_FORMATS \+ (%w\[[^\]]*\])\)\.freeze$/.exec(rhs);
  expect(
    extra,
    `SYMBOL_FORMATS is no longer TARGET_FORMATS plus a %w[] literal: ${rhs}`,
  ).not.toBeNull();
  return [...targets, ...words(extra?.[1] ?? "")];
}

/** The body of a two-space-indented method, `def` line to its `end`. */
function methodBody(name: string): string {
  const found = [
    ...GENERATOR.matchAll(new RegExp(String.raw`^  def ${name}\b[\s\S]*?\n  end$`, "gm")),
  ];
  expect(found.length, `generate-corpus.rb should define ${name} exactly once`).toBe(1);
  return found[0]?.[0] ?? "";
}

/** The formats a `case format` dispatch names, in source order. */
function caseArms(method: string): string[] {
  return [...methodBody(method).matchAll(/^\s*when "([a-z]+)"/gm)].map((m) => m[1] as string);
}

/** Each manifested axis, with the formats it declares itself applicable to. */
function contextAxes(): { name: string; formats: string[] }[] {
  const block = /^ {2}CONTEXT_AXES = \[$([\s\S]*?)^ {2}\]\.freeze$/m.exec(GENERATOR);
  expect(block, "CONTEXT_AXES is no longer a bracketed literal").not.toBeNull();
  const entries = [
    ...(block?.[1] ?? "").matchAll(
      /"name" => "([a-z_]+)",[\s\S]*?"formats" => (%w\[[^\]]*\])\.freeze,/g,
    ),
  ];
  return entries.map((entry) => ({
    name: entry[1] as string,
    formats: words(entry[2] as string),
  }));
}

const FORMATS = symbolFormats();
const AXES = contextAxes();

describe("the generator's symbol-slice registry", () => {
  it("finds the declarations it is about to reason over", () => {
    // A parser that silently matched nothing would make every assertion below
    // vacuously true, which is the failure mode this whole file guards against
    // elsewhere.
    expect(FORMATS.length).toBeGreaterThan(0);
    expect(AXES.length).toBeGreaterThan(0);
  });

  it("emits a slice for every format the port renders symbols in", () => {
    // Pinned by name rather than counted: adding or removing a slice is a
    // deliberate act with a generated directory and a renderer behind it.
    expect(FORMATS).toStrictEqual(["asciimath", "latex", "mathml", "unicodemath", "html", "omml"]);
  });

  it("names each format once", () => {
    expect([...new Set(FORMATS)]).toStrictEqual(FORMATS);
  });

  it("gives every declared format its own direct-render arm", () => {
    expect(caseArms("representation").sort()).toStrictEqual([...FORMATS].sort());
  });

  it("gives every declared format its own host-render arm", () => {
    expect(caseArms("render_host").sort()).toStrictEqual([...FORMATS].sort());
  });

  it("manifests axes only for formats it generates a slice for", () => {
    for (const axis of AXES) {
      for (const format of axis.formats) expect(FORMATS, axis.name).toContain(format);
    }
  });

  it("exercises every declared format on at least one axis", () => {
    const probed = new Set(AXES.flatMap((axis) => axis.formats));
    for (const format of FORMATS) expect([...probed], format).toContain(format);
  });

  it("probes the display-style argument OMML threads to a symbol", () => {
    // Measured as moving no symbol's output on the pinned oracle. That is the
    // reason it must stay manifested: an axis nothing probes cannot report the
    // day it starts to matter, and a slice generated without it would look
    // exactly as static as one generated with it.
    const axis = AXES.find((candidate) => candidate.name === "display_style");
    expect(axis?.formats).toStrictEqual(["omml"]);
  });

  it("derives the baseline context from the manifest instead of restating it", () => {
    // The emitted descriptor is "every axis at its first value". Written out by
    // hand, that hash silently keeps describing the old axis set the moment an
    // axis is added — the descriptors stay green and stop meaning what they say.
    expect(assignment("BASELINE_CONTEXT")).toContain("CONTEXT_AXES");
    const restated = GENERATOR.split("\n").filter((line) =>
      AXES.every((axis) => line.includes(`"${axis.name}" =>`)),
    );
    expect(restated).toStrictEqual([]);
  });
});

/**
 * `omml_tag_name` is the second per-symbol OMML property. `PowerBase` branches
 * on it (`power_base.rb:39-42`) and the branch changes rendered *structure*, so
 * a slice carrying only the payload string is not the whole static contract —
 * the missing arm silently emits `m:sSubSup` for every symbol, which is wrong
 * bytes rather than a refusal.
 *
 * These assertions read the generator, for the same reason the block above
 * does: they are the contract for the source commit, which lands before the
 * slice it emits exists on disk.
 */
describe("the generator's omml tag-name axis", () => {
  /** `methodBody`, for a name ending in `!` — where its `\b` cannot match. */
  function bangMethodBody(name: string): string {
    const found = [
      ...GENERATOR.matchAll(new RegExp(String.raw`^  def ${name}[\s\S]*?\n  end$`, "gm")),
    ];
    expect(found.length, `generate-corpus.rb should define ${name} exactly once`).toBe(1);
    return found[0]?.[0] ?? "";
  }

  const body = methodBody("omml_symbol_tag_names");

  it("measures the default off the symbol root instead of taking the majority", () => {
    // "1451 of 1459 say subSup" is a coincidence of the current hierarchy. The
    // inherited answer is the actual default, and it is read, not counted.
    expect(body).toContain("measured_omml_tag_name(symbol_root)");
  });

  it("derives membership by asking every symbol class", () => {
    // The whole point: a list found by reading eight class files is how the
    // ninth gets missed. Membership comes from the classes handed in.
    expect(body).toMatch(/classes\.filter_map do \|klass\|/);
    expect(body).toContain("measured_omml_tag_name(klass)");
  });

  it("names no symbol in the method that decides which symbols are in the set", () => {
    // A quoted PascalCase word with no spaces is a symbol id ("Sum",
    // "Paren::Lround"). One appearing here means the set went back to a list.
    const idLiterals = [...body.matchAll(/"([A-Z][A-Za-z]*(?:::[A-Z][A-Za-z]*)?)"/g)].map(
      (match) => match[1],
    );
    expect(idLiterals).toStrictEqual([]);
  });

  it("stops rather than emit a tag name whose output it has not measured", () => {
    // Only two values are proved to reach output by a live render. A third is a
    // finding, not a row: emitting it would give the port a value with no
    // evidence of the structure it produces.
    expect(assignment("OMML_UNDOVR_TAG")).toBe('"undOvr"');
    expect(body).toContain("unmodelled");
    expect(body).toMatch(/raise Error/);
  });

  it("proves the axis reaches output in both directions", () => {
    // A membership table that never renders anything would pass while
    // discriminating nothing, which is how two earlier verification scripts
    // gave false confidence.
    expect(body).toContain("assert_omml_tag_name_reaches_output!");
    const proof = bangMethodBody("assert_omml_tag_name_reaches_output!");
    expect(proof).toContain("OMML_UNDOVR_MARKERS");
    expect(proof).toContain("<m:sSubSup>");
  });

  it("emits the axis only for the omml slice", () => {
    const emitter = methodBody("emit_symbols_file");
    expect(emitter).toContain("omml_tag_name_sections(omml_tag_names,");
    expect(emitter).toContain('if format == "omml"');
  });
});
