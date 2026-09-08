/**
 * The LaTeX class registry is complete, and complete against the GENERATED
 * tables rather than against a list written beside it.
 *
 * `latex/transform.rb` resolves class names by reflection, so the port's
 * registry is the one place a name can silently resolve to nothing. Three
 * things are checked here:
 *
 *   - every name the generator measured is served, with the carrier and
 *     constructor family it measured;
 *   - the four names the GEM cannot resolve are served by nobody, so the
 *     port's throw lands where the gem's `NameError` does;
 *   - `capitalize`'s tail-downcasing fold is preserved — `vmatrix` and
 *     `Vmatrix` reach one class, which a naive first-letter capitalization
 *     would not produce.
 */

import { describe, expect, it } from "vitest";
import {
  LATEX_FONT_STYLE_FALLBACK_TEXTS,
  LATEX_TRANSFORM_FONT_STYLES,
  LATEX_TRANSFORM_GET_CLASS,
  LATEX_TRANSFORM_TABLE_CLASS,
  LATEX_TRANSFORM_UNRESOLVED,
} from "../../../src/formats/latex/generated/transform-tables";
import {
  LATEX_CLASS_REGISTRY,
  LATEX_FONT_STYLES,
  LATEX_TABLE_CLASS_REGISTRY,
} from "../../../src/formats/latex/registry";

describe("get_class", () => {
  it("serves every measured name", () => {
    expect(LATEX_TRANSFORM_GET_CLASS.length).toBeGreaterThan(50);
    expect([...LATEX_CLASS_REGISTRY.keys()].sort()).toStrictEqual(
      LATEX_TRANSFORM_GET_CLASS.map((entry) => entry.name).sort(),
    );
  });

  it("carries each name's measured constructor family", () => {
    for (const census of LATEX_TRANSFORM_GET_CLASS) {
      expect(LATEX_CLASS_REGISTRY.get(census.name)?.family, census.name).toBe(census.family);
    }
  });

  it("names an aliased class by the basename it rides under", () => {
    const aliased = LATEX_TRANSFORM_GET_CLASS.filter((entry) => entry.disposition === "aliased");
    expect(aliased.length).toBeGreaterThan(0);
    for (const census of aliased) {
      const entry = LATEX_CLASS_REGISTRY.get(census.name);
      expect(entry?.name, census.name).toBe(census.rubyClass.split("::").pop());
    }
  });

  it("serves none of the names the gem itself cannot resolve", () => {
    // `Pr`, `binom`, `bmod`, `pmod`. Three are rewritten by their call sites
    // before `get_class` runs; `Pr` genuinely raises, and `\Pr_1` must fail
    // here for the same reason.
    expect(LATEX_TRANSFORM_UNRESOLVED.length).toBe(4);
    for (const name of LATEX_TRANSFORM_UNRESOLVED) {
      expect(LATEX_CLASS_REGISTRY.has(name), name).toBe(false);
    }
  });
});

describe("get_table_class", () => {
  it("serves every MATRICES key", () => {
    expect([...LATEX_TABLE_CLASS_REGISTRY.keys()].sort()).toStrictEqual(
      LATEX_TRANSFORM_TABLE_CLASS.map((entry) => entry.name).sort(),
    );
  });

  it("folds case-differing environment names onto one class", () => {
    // `capitalize` splits on `_`, capitalizes each part and downcases the
    // tail, so `vmatrix` and `Vmatrix` are the same constant. A port doing
    // `s[0].toUpperCase() + s.slice(1)` would look for `Table::VMatrix`.
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["vmatrix", "Vmatrix"],
      ["bmatrix", "Bmatrix"],
    ];
    for (const [lower, upper] of pairs) {
      const a = LATEX_TABLE_CLASS_REGISTRY.get(lower);
      const b = LATEX_TABLE_CLASS_REGISTRY.get(upper);
      expect(a, lower).toBeDefined();
      expect(b?.name, upper).toBe(a?.name);
    }
  });
});

describe("FONT_STYLES", () => {
  it("serves every measured keyword", () => {
    expect([...LATEX_FONT_STYLES.keys()].sort()).toStrictEqual(
      LATEX_TRANSFORM_FONT_STYLES.map((entry) => entry.name).sort(),
    );
  });

  it("has no entry for the texts that take the generic-FontStyle fallback", () => {
    // The fallback branch (`transform.rb:423`) is not dead: these seven texts
    // are `SYMBOLS[:fonts]` entries with no `FONT_STYLES` row.
    expect(LATEX_FONT_STYLE_FALLBACK_TEXTS.length).toBe(7);
    for (const text of LATEX_FONT_STYLE_FALLBACK_TEXTS) {
      expect(LATEX_FONT_STYLES.has(text), text).toBe(false);
    }
  });
});
