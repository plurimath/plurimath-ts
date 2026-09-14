/**
 * The UnicodeMath class registry is complete, and complete against the
 * GENERATED tables rather than against a list written beside it.
 *
 * `unicode_math/transform.rb` resolves class names by reflection, so the port's
 * registry is the one place a name can silently resolve to nothing. What is
 * checked here:
 *
 *   - every name the generator measured is served, with the carrier and
 *     constructor family it measured;
 *   - the names the GEM cannot resolve are served by nobody, so the port's
 *     throw lands where the gem's `NameError` does;
 *   - every `font_class` text has a `FontStyle` subclass AND that subclass's
 *     own default `parameter_two`, which is not derivable from the name;
 *   - the `is_a?` families the transform branches on are non-empty and contain
 *     the class they are keyed by.
 */

import { describe, expect, it } from "vitest";
import {
  UNICODEMATH_IS_A_CLASSES,
  UNICODEMATH_SYMBOL_CLASS_INPUT,
  UNICODEMATH_SYMBOL_CLASS_OVERLAP,
  UNICODEMATH_TRANSFORM_FONT_STYLES,
  UNICODEMATH_TRANSFORM_GET_CLASS,
  UNICODEMATH_TRANSFORM_NAMED_SYMBOLS,
  UNICODEMATH_TRANSFORM_UNRESOLVED,
} from "../../../src/formats/unicodemath/generated/transform-tables";
import {
  namedSymbolId,
  UNICODEMATH_CLASS_REGISTRY,
  UNICODEMATH_FONT_STYLES,
} from "../../../src/formats/unicodemath/registry";

describe("get_class", () => {
  it("serves every measured name", () => {
    expect(UNICODEMATH_TRANSFORM_GET_CLASS.length).toBeGreaterThan(20);
    expect([...UNICODEMATH_CLASS_REGISTRY.keys()].sort()).toStrictEqual(
      UNICODEMATH_TRANSFORM_GET_CLASS.map((entry) => entry.name).sort(),
    );
  });

  it("carries each name's measured constructor family", () => {
    for (const census of UNICODEMATH_TRANSFORM_GET_CLASS) {
      expect(UNICODEMATH_CLASS_REGISTRY.get(census.name)?.family, census.name).toBe(census.family);
    }
  });

  it("names an aliased class by the basename it rides under", () => {
    const aliased = UNICODEMATH_TRANSFORM_GET_CLASS.filter(
      (entry) => entry.disposition === "aliased",
    );
    expect(aliased.length).toBeGreaterThan(0);
    for (const census of aliased) {
      const entry = UNICODEMATH_CLASS_REGISTRY.get(census.name);
      expect(entry?.name, census.name).toBe(census.rubyClass.split("::").pop());
    }
  });

  it("serves none of the names the gem itself cannot resolve", () => {
    // Empty on the pinned oracle — every reachable name resolves — so this is
    // a guard against a future upstream removal rather than a live case.
    for (const name of UNICODEMATH_TRANSFORM_UNRESOLVED) {
      expect(UNICODEMATH_CLASS_REGISTRY.has(name), name).toBe(false);
    }
  });
});

describe("FONT_STYLES", () => {
  it("serves every measured keyword with its subclass and default keyword", () => {
    expect(UNICODEMATH_TRANSFORM_FONT_STYLES.length).toBeGreaterThan(10);
    expect([...UNICODEMATH_FONT_STYLES.keys()].sort()).toStrictEqual(
      UNICODEMATH_TRANSFORM_FONT_STYLES.map((entry) => entry.name).sort(),
    );
    for (const census of UNICODEMATH_TRANSFORM_FONT_STYLES) {
      const entry = UNICODEMATH_FONT_STYLES.get(census.name);
      expect(entry?.name, census.name).toBe(census.rubyClass.split("::").pop());
      expect(entry?.keyword, census.name).toBe(census.defaultKeyword);
    }
  });

  it("carries the three shapes the measurement found, so a uniform default is not assumed", () => {
    const keywords = UNICODEMATH_TRANSFORM_FONT_STYLES.map((entry) => entry.defaultKeyword);
    // `mbf` -> "bold" (the name's own word), `mup` -> "rm" (a different word),
    // and six subclasses -> nil. A port that derived the keyword from the
    // class name would get the second and third groups wrong.
    expect(keywords).toContain("bold");
    expect(keywords).toContain("rm");
    expect(keywords.filter((keyword) => keyword === null).length).toBe(6);
  });
});

describe("symbols_class", () => {
  it("carries the whole merged table, parens winning their overlaps", () => {
    expect(UNICODEMATH_SYMBOL_CLASS_INPUT.size).toBeGreaterThan(3000);
    expect(UNICODEMATH_SYMBOL_CLASS_OVERLAP.length).toBe(3);
    for (const text of UNICODEMATH_SYMBOL_CLASS_OVERLAP) {
      expect(UNICODEMATH_SYMBOL_CLASS_INPUT.get(text), text).toMatch(/^Paren::/);
    }
  });
});

describe("the classes the transform names directly", () => {
  it("resolves every role, and refuses one it has no entry for", () => {
    expect(UNICODEMATH_TRANSFORM_NAMED_SYMBOLS.size).toBeGreaterThan(0);
    for (const [role, id] of UNICODEMATH_TRANSFORM_NAMED_SYMBOLS) {
      expect(namedSymbolId(role)).toBe(id);
    }
    expect(() => namedSymbolId("nosuchrole")).toThrow(/no generated symbol id/);
  });
});

describe("the is_a? families", () => {
  it("contain the class they are keyed by, and none is empty", () => {
    expect(UNICODEMATH_IS_A_CLASSES.size).toBe(8);
    for (const [key, family] of UNICODEMATH_IS_A_CLASSES) {
      expect(family.length, key).toBeGreaterThan(0);
      expect(family, key).toContain(key);
      expect([...family], key).toStrictEqual([...family].sort());
    }
  });

  it("records the inheritance the port cannot see, not just identity", () => {
    // `is_a?` is the reason these are enumerated: `Math::Formula` has two
    // subclasses and `BinaryFunction` has thirty-odd, so an identity test would
    // answer differently from the gem.
    expect(UNICODEMATH_IS_A_CLASSES.get("Math::Formula")?.length).toBeGreaterThan(1);
    expect(UNICODEMATH_IS_A_CLASSES.get("Math::Function::BinaryFunction")?.length).toBeGreaterThan(
      10,
    );
  });
});
