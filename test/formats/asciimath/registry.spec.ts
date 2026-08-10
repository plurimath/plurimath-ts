/**
 * The derived AsciiMath registry (TODO.plan p1/05). The tables in
 * `src/formats/asciimath/registry.ts` are DERIVED from the generated
 * reachability census in `src/generated/asciimath/transform-registry.ts`, so
 * name-for-name agreement between the two is construction, not evidence, and
 * is not asserted here — the census itself is pinned in
 * `test/generated/transform-registry.spec.ts`.
 *
 * What derivation cannot guarantee is the hand-written half: the
 * kind → constructor bindings. The compiler proves that table total over
 * `NodeKind`; it cannot prove each kind names ITS OWN class rather than a
 * sibling's, so that is checked here through the constructed nodes' own
 * discriminants — and, for every census name, through the identity the
 * constructed node reconstructs.
 */

import { describe, expect, it } from "vitest";
import { FontStyleNode, NODE_KINDS } from "../../../src/core/index";
import { NODE_SPECS, rubyClassName } from "../../../src/core/normalize";
import {
  ASCIIMATH_CLASS_REGISTRY,
  ASCIIMATH_FONT_STYLE_CONSTRUCTOR,
  ASCIIMATH_FONT_STYLES,
  ASCIIMATH_NODE_CONSTRUCTORS,
  ASCIIMATH_UNARY_CLASS_NAMES,
  ASCIIMATH_UNARY_CLASS_SET,
} from "../../../src/formats/asciimath/registry";
import {
  ASCIIMATH_TRANSFORM_EXCLUDED,
  ASCIIMATH_TRANSFORM_FONT_STYLES,
  ASCIIMATH_TRANSFORM_GET_CLASS,
} from "../../../src/generated/asciimath/transform-registry";

describe("the hand-written kind → constructor map", () => {
  it("binds every declared kind to the class that declares it", () => {
    // The census-complete model has 38 kinds; a shorter walk here would mean
    // the loop below quietly proved less than the whole map.
    expect(NODE_KINDS.length).toBe(38);
    for (const kind of NODE_KINDS) {
      const node = new ASCIIMATH_NODE_CONSTRUCTORS[kind]({});
      // The node's own discriminant, not the map's key: `abs: BarNode` type
      // checks (both are `new (init) => MathNode`) and only fails here.
      expect(node.kind, kind).toBe(kind);
      expect(rubyClassName(node), kind).toBe(NODE_SPECS[kind].rubyClass);
    }
  });
});

describe("the get_class registry against the generated census", () => {
  it("iterates the full census", () => {
    // Emptiness guard for the loop below: a truncated census must fail loudly
    // here, not shrink the walk (PORTING-STANDARDS.md, "Tests must be able to
    // fail").
    expect(ASCIIMATH_TRANSFORM_GET_CLASS.length).toBe(63);
  });

  it("constructs every reachable name as the class the gem resolves", () => {
    for (const census of ASCIIMATH_TRANSFORM_GET_CLASS) {
      const entry = ASCIIMATH_CLASS_REGISTRY.get(census.name);
      expect(entry, census.name).toBeDefined();
      if (entry === undefined) continue;
      // Through the REAL constructor: what the runtime node says about
      // itself — its discriminant and the Ruby class name it reconstructs —
      // must land on the census's carrier and resolved class. This is where a
      // wrong constructor binding or a mangled alias identity surfaces.
      const node = new entry.ctor(entry.name === undefined ? {} : { name: entry.name });
      expect(node.kind, census.name).toBe(entry.kind);
      expect(NODE_SPECS[node.kind].rubyClass, census.name).toBe(census.carrier);
      expect(rubyClassName(node), census.name).toBe(census.rubyClass);
    }
  });

  it("has no deferred exclusions to honour", () => {
    // The derivation maps the census as-is. If a regeneration ever records an
    // exclusion, the registry must start withholding it, and this pin must
    // move deliberately with that change.
    expect(ASCIIMATH_TRANSFORM_EXCLUDED.length).toBe(0);
  });
});

describe("the font-style table against the generated census", () => {
  it("iterates the full census", () => {
    expect(ASCIIMATH_TRANSFORM_FONT_STYLES.length).toBe(50);
  });

  it("constructs every keyword through the FontStyle carrier as the gem's subclass", () => {
    // The carrier binding is hand-written (one constructor for all fifty
    // keywords); the subclass identity must survive the round trip through it.
    expect(ASCIIMATH_FONT_STYLE_CONSTRUCTOR).toBe(FontStyleNode);
    for (const census of ASCIIMATH_TRANSFORM_FONT_STYLES) {
      const basename = ASCIIMATH_FONT_STYLES.get(census.name);
      expect(basename, census.name).toBeDefined();
      const node = new ASCIIMATH_FONT_STYLE_CONSTRUCTOR({ name: basename });
      expect(node.kind, census.name).toBe("fontStyle");
      expect(rubyClassName(node), census.name).toBe(census.rubyClass);
    }
  });
});

describe("the unary-class list", () => {
  // No assertion ties ASCIIMATH_UNARY_CLASS_NAMES back to the generated list
  // it re-exports: the only divergence such a check could catch — serving a
  // copy instead of the same array — is behaviour-neutral for a membership
  // table, so the check could never fail for a reason that matters.

  it("collapses no member into the Set", () => {
    // The generated spec pins duplicate-freedom for the entry tables but not
    // for this list; a duplicate here would vanish in the Set and narrow the
    // keeps-its-fence membership check.
    expect(ASCIIMATH_UNARY_CLASS_NAMES.length).toBe(33);
    expect(ASCIIMATH_UNARY_CLASS_SET.size).toBe(33);
  });
});
