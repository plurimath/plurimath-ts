/**
 * The `render-options` class-A gate (gates.json, ARCHITECTURE.md §5, §7).
 *
 * Every render entry point must REFUSE an option key its format does not
 * accept, the way the gem does: its public render methods declare explicit
 * keywords and no `**rest`, so `to_asciimath(nosuchoption: 1)` and its five
 * siblings raise `ArgumentError: unknown keyword: :nosuchoption` before the
 * body runs (formula.rb:66, :76, :141, :149, :157, :187 on the pinned oracle,
 * plurimath 0.11.6 `00c52783`). Typing the options exactly is only the
 * compile-time half — a JavaScript caller or an `as any` walks through it —
 * and before the guard landed every entry point here accepted
 * `{nosuchoption: 1}` and rendered normally.
 *
 * The point of this file is that the omission cannot come back with the NEXT
 * format. So the entry points are not listed here: they are DERIVED, twice
 * over, from things that change when a format is added —
 *
 *   1. the format list is every directory under `src/formats` holding a
 *      `renderer.ts` (the same derivation the boundaries gate makes for the
 *      render kind inventory, scripts/gate-boundaries.mjs), and
 *   2. the entry points of a format are its `renderer.ts` module's exported
 *      functions whose name begins with `to` — the naming §4 fixes for the
 *      modern surface (`toAsciimath`, `toMathml`, ...).
 *
 * A new format's `src/formats/<F>/renderer.ts` therefore joins this suite the
 * moment it exists, and its `to<F>` fails here until the guard is wired in.
 *
 * A derivation is only as good as its own proof, which is the failure the
 * `selects` mechanism exists to catch one level up (test/gates/gate-selection
 * .spec.ts): a scan that quietly finds nothing, or finds the wrong things,
 * passes green having checked nothing. So the derivation is asserted before it
 * is used — it is non-empty, it still finds every format and entry point that
 * exists today, and no format contributes zero entry points.
 */

import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORMATS_DIR = join(REPO_ROOT, "src", "formats");

/**
 * The formats that exist today. This is a floor, not the list under test: the
 * suite runs over whatever the scan finds, and this only fails a scan that has
 * gone blind — the "cruised 0 modules is a failure, not a pass" rule the
 * boundaries gate learned the hard way.
 */
const FORMATS_TODAY = ["asciimath", "html", "latex", "mathml", "omml", "unicodemath"];

/** Likewise a floor: the entry points that exist today, `format.function`. */
const ENTRY_POINTS_TODAY = [
  "asciimath.toAsciimath",
  "html.toHtml",
  "latex.toLatex",
  "mathml.toMathml",
  "omml.toOmml",
  "omml.toOmmlWithoutMathTag",
  "unicodemath.toUnicodemath",
];

/** Every directory under src/formats that has a renderer.ts. */
function scanFormats(): string[] {
  return readdirSync(FORMATS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => readdirSync(join(FORMATS_DIR, name)).some((file) => file === "renderer.ts"))
    .sort();
}

interface EntryPoint {
  readonly format: string;
  readonly name: string;
  readonly id: string;
  readonly render: (node: unknown, options?: unknown) => string;
}

const FORMATS = scanFormats();

const ENTRY_POINTS: EntryPoint[] = [];
for (const format of FORMATS) {
  const module = (await import(
    pathToFileURL(join(FORMATS_DIR, format, "renderer.ts")).href
  )) as Record<string, unknown>;
  for (const [name, value] of Object.entries(module)) {
    if (typeof value !== "function" || !name.startsWith("to")) continue;
    ENTRY_POINTS.push({
      format,
      name,
      id: `${format}.${name}`,
      render: value as EntryPoint["render"],
    });
  }
}

/**
 * One root every entry point renders. `toMathml` and `toOmml` take a `formula`
 * or `mrow` only — `to_mathml` and `to_omml` live on `Formula` in the gem, and
 * every other class answers NoMethodError there — and the four text renderers
 * render a formula too, so a single root serves all seven (measured: each
 * returns a non-empty string for it).
 */
const VALID_ROOT = { kind: "formula", value: [{ kind: "number", value: "1" }] } as const;

/** A key no format declares, and no gem render keyword is spelled. */
const UNKNOWN_KEY = "nosuchoption";

/**
 * A sample of accepted options per format, for the "alongside" case below.
 * Absent means the empty object, which every format accepts — so a new format
 * needs no row here, and one that grows a real option can gain one. These are
 * values, not the accepted SET: nothing here is the gate's source of truth.
 */
const ACCEPTED_SAMPLE: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  mathml: { displayStyle: false, unaryFunctionSpacing: false },
};

describe("the derivation this gate reasons over", () => {
  it("finds the format directories", () => {
    expect(FORMATS.length).toBeGreaterThan(0);
    for (const format of FORMATS_TODAY) expect(FORMATS).toContain(format);
  });

  it("finds an entry point in every format it found", () => {
    // A format whose renderer.ts exports nothing named `to…` would drop out of
    // the suite silently — the exact shape of the failure this gate exists to
    // prevent, one level up.
    const empty = FORMATS.filter(
      (format) => !ENTRY_POINTS.some((entry) => entry.format === format),
    );
    expect(empty).toEqual([]);
  });

  it("finds the entry points that exist today", () => {
    const found = ENTRY_POINTS.map((entry) => entry.id).sort();
    for (const id of ENTRY_POINTS_TODAY) expect(found).toContain(id);
  });
});

describe.each(ENTRY_POINTS.map((entry) => [entry.id, entry] as const))("%s", (_id, entry) => {
  it("renders the shared root, so the refusals below mean what they say", () => {
    // Without this, an entry point that rejected everything would pass every
    // assertion that follows.
    expect(entry.render(VALID_ROOT)).toBeTypeOf("string");
    expect(entry.render(VALID_ROOT).length).toBeGreaterThan(0);
  });

  it("accepts a missing, undefined, null or empty options argument", () => {
    // The gem's keywords all have defaults, so calling with none is its normal
    // path; `null` is the spelling §4's signatures give that.
    const rendered = entry.render(VALID_ROOT);
    expect(entry.render(VALID_ROOT, undefined)).toBe(rendered);
    expect(entry.render(VALID_ROOT, null)).toBe(rendered);
    expect(entry.render(VALID_ROOT, {})).toBe(rendered);
  });

  it("refuses an unknown option by name", () => {
    let caught: unknown;
    try {
      entry.render(VALID_ROOT, { [UNKNOWN_KEY]: 1 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    // Naming the key is what separates this from the tree's own rejections —
    // and it is what the gem's ArgumentError does.
    expect((caught as RenderError).message).toContain(UNKNOWN_KEY);
    expect((caught as RenderError).code).toBe("RENDER_ERROR");
    expect((caught as RenderError).format).toBe(entry.format);
  });

  it("refuses an unknown option riding alongside the keys the format accepts", () => {
    // The accepted keys differ per format, so this reuses whatever the entry
    // itself accepts: an options object that renders on its own must still be
    // refused once the unknown key joins it.
    const accepted = ACCEPTED_SAMPLE[entry.format] ?? {};
    expect(entry.render(VALID_ROOT, accepted)).toBeTypeOf("string");
    expect(() => entry.render(VALID_ROOT, { ...accepted, [UNKNOWN_KEY]: 1 })).toThrow(RenderError);
  });

  it("refuses an options argument that is not a keyword hash", () => {
    // A primitive would ToObject-coerce through `Object.hasOwn` and behave as
    // empty options; an array is not a keyword hash either. Both are the
    // caller's mistake, not a rendering.
    for (const bad of ["oops", 5, true, [UNKNOWN_KEY]]) {
      expect(() => entry.render(VALID_ROOT, bad)).toThrow(RenderError);
    }
  });
});
