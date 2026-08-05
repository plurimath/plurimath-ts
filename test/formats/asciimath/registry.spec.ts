/**
 * Registry completeness (TODO.plan p1/05): the hand-written tables in
 * `src/formats/asciimath/registry.ts` are checked against the GENERATED
 * reachability census in `src/generated/asciimath/transform-registry.ts` —
 * every name the gem's transform can hand to `Utility.get_class`, resolved
 * through the gem itself. That generated file exists precisely so this
 * assertion never happens by hand: a registry gap fails here, not at parse
 * time as an unexplained throw.
 *
 * Checked in both directions: every generated name resolves, and the registry
 * carries nothing the census cannot attribute — an extra entry would be
 * unmeasured behaviour.
 */

import { describe, expect, it } from "vitest";
import { FontStyleNode } from "../../../src/core/index";
import { NODE_SPECS } from "../../../src/core/normalize";
import {
  ASCIIMATH_CLASS_REGISTRY,
  ASCIIMATH_FONT_STYLE_CONSTRUCTOR,
  ASCIIMATH_FONT_STYLES,
  ASCIIMATH_UNARY_CLASS_NAMES,
} from "../../../src/formats/asciimath/registry";
import {
  ASCIIMATH_TRANSFORM_EXCLUDED,
  ASCIIMATH_TRANSFORM_FONT_STYLES,
  ASCIIMATH_TRANSFORM_GET_CLASS,
  ASCIIMATH_TRANSFORM_UNARY_CLASSES,
} from "../../../src/generated/asciimath/transform-registry";

/** The Ruby class a registry entry's (ctor, name) pair reconstructs. */
function registryRubyClass(name: string): string {
  const entry = ASCIIMATH_CLASS_REGISTRY.get(name);
  if (entry === undefined) throw new Error(`registry has no entry for "${name}"`);
  if (entry.name !== undefined) return `Math::Function::${entry.name}`;
  return NODE_SPECS[entry.kind].rubyClass;
}

describe("the get_class registry against the generated census", () => {
  it("has the census's population", () => {
    expect(ASCIIMATH_TRANSFORM_GET_CLASS.length).toBe(63);
    expect(ASCIIMATH_CLASS_REGISTRY.size).toBe(63);
  });

  it("serves every reachable name, resolving to the class the gem resolves", () => {
    for (const entry of ASCIIMATH_TRANSFORM_GET_CLASS) {
      expect(ASCIIMATH_CLASS_REGISTRY.has(entry.name), entry.name).toBe(true);
      expect(registryRubyClass(entry.name), entry.name).toBe(entry.rubyClass);
    }
  });

  it("lands every name on the census's carrier", () => {
    for (const entry of ASCIIMATH_TRANSFORM_GET_CLASS) {
      const registered = ASCIIMATH_CLASS_REGISTRY.get(entry.name);
      expect(registered, entry.name).toBeDefined();
      // The carrier is the implemented class the port constructs: the entry's
      // own kind for an implemented class, the abstract family root for an
      // aliased one — exactly `NODE_SPECS[kind].rubyClass` either way.
      expect(NODE_SPECS[(registered as { kind: keyof typeof NODE_SPECS }).kind].rubyClass).toBe(
        entry.carrier,
      );
    }
  });

  it("carries nothing the census does not attribute", () => {
    const reachable = new Set(ASCIIMATH_TRANSFORM_GET_CLASS.map((entry) => entry.name));
    for (const name of ASCIIMATH_CLASS_REGISTRY.keys()) {
      expect(reachable.has(name), name).toBe(true);
    }
  });

  it("has no deferred exclusions to honour", () => {
    // The census records none; if a regeneration adds one, the registry must
    // start withholding it and this pin must move deliberately.
    expect(ASCIIMATH_TRANSFORM_EXCLUDED.length).toBe(0);
  });
});

describe("the font-style table against the generated census", () => {
  it("has the census's population", () => {
    expect(ASCIIMATH_TRANSFORM_FONT_STYLES.length).toBe(50);
    expect(ASCIIMATH_FONT_STYLES.size).toBe(50);
  });

  it("maps every keyword to the subclass the gem maps it to", () => {
    for (const entry of ASCIIMATH_TRANSFORM_FONT_STYLES) {
      const basename = ASCIIMATH_FONT_STYLES.get(entry.name);
      expect(basename, entry.name).toBeDefined();
      expect(`Math::Function::FontStyle::${basename}`, entry.name).toBe(entry.rubyClass);
    }
    const known = new Set(ASCIIMATH_TRANSFORM_FONT_STYLES.map((entry) => entry.name));
    for (const name of ASCIIMATH_FONT_STYLES.keys()) {
      expect(known.has(name), name).toBe(true);
    }
  });

  it("constructs every keyword through the FontStyle carrier", () => {
    expect(ASCIIMATH_FONT_STYLE_CONSTRUCTOR).toBe(FontStyleNode);
    for (const entry of ASCIIMATH_TRANSFORM_FONT_STYLES) {
      expect(entry.carrier, entry.name).toBe("Math::Function::FontStyle");
    }
  });
});

describe("the unary-class list against the generated census", () => {
  it("is the gem's list, order included", () => {
    // Membership is all the transform asks, but pinning the order too makes a
    // regeneration diff loud instead of silently reshuffled.
    expect(ASCIIMATH_UNARY_CLASS_NAMES).toStrictEqual([...ASCIIMATH_TRANSFORM_UNARY_CLASSES]);
  });
});
