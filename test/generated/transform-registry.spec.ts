/**
 * The generated AsciiMath transform class registry (TODO.plan p1/05).
 *
 * `transform.rb` builds most nodes by name — `Utility.get_class(text)` — so
 * the port's registry must serve every name the transform can reach, asserted
 * against this generated list rather than by hand. These assertions pin what
 * the oracle said at generation time: a regeneration that truncates a table,
 * resolves a name to a class the census does not know, or lands on a carrier
 * the node model does not declare fails here instead of surfacing later as a
 * transform that cannot construct what it parsed.
 *
 * The expectations are deliberately literal — a test that derived them from
 * the tables under test would pass against empty tables. They were measured
 * by the registry section of `scripts/generate-corpus.rb` against plurimath
 * 0.11.6 at 00c52783877b38f6b8e6e109f1803f96bb34fc62, and re-derived
 * independently by a second extraction (session log, 2026-08-05) before being
 * pinned here.
 */

import { describe, expect, it } from "vitest";
import { NODE_SPECS } from "../../src/core/normalize";
import {
  ASCIIMATH_BINARY_CLASSES,
  ASCIIMATH_SUB_SUP_CLASSES,
  ASCIIMATH_TERNARY_CLASSES,
} from "../../src/generated/asciimath/grammar";
import { ASCIIMATH_LITERALS } from "../../src/generated/asciimath/input";
import {
  ASCIIMATH_TRANSFORM_EXCLUDED,
  ASCIIMATH_TRANSFORM_FONT_STYLES,
  ASCIIMATH_TRANSFORM_GET_CLASS,
  ASCIIMATH_TRANSFORM_UNARY_CLASSES,
  type AsciimathTransformClassEntry,
} from "../../src/generated/asciimath/transform-registry";
import { aliasIndex, readCensus } from "../core/model-builder";

/** Both entry tables, so the shared invariants stay symmetric. */
const ENTRY_TABLES = {
  getClass: ASCIIMATH_TRANSFORM_GET_CLASS,
  fontStyles: ASCIIMATH_TRANSFORM_FONT_STYLES,
} as const;

/** The measurements the generator can attribute an entry to — nothing else. */
const KNOWN_SOURCES = new Set([
  "unary_class",
  "binary_class",
  "ternary_class",
  "literal",
  "utility_unary_classes",
  "font_styles",
]);

function entriesWithSource(
  entries: readonly AsciimathTransformClassEntry[],
  source: string,
): readonly AsciimathTransformClassEntry[] {
  return entries.filter((entry) => entry.sources.includes(source));
}

function byName(
  entries: readonly AsciimathTransformClassEntry[],
): ReadonlyMap<string, AsciimathTransformClassEntry> {
  return new Map(entries.map((entry) => [entry.name, entry]));
}

describe("the transform class registry, counted", () => {
  it("holds the measured tables, not truncations of them", () => {
    expect(ASCIIMATH_TRANSFORM_GET_CLASS.length).toBe(63);
    expect(ASCIIMATH_TRANSFORM_FONT_STYLES.length).toBe(50);
    expect(ASCIIMATH_TRANSFORM_UNARY_CLASSES.length).toBe(33);
    expect(ASCIIMATH_TRANSFORM_EXCLUDED.length).toBe(0);
  });

  it("attributes every entry to the measured source counts", () => {
    const entries = ASCIIMATH_TRANSFORM_GET_CLASS;
    expect(entriesWithSource(entries, "unary_class").length).toBe(44);
    expect(entriesWithSource(entries, "binary_class").length).toBe(7);
    expect(entriesWithSource(entries, "ternary_class").length).toBe(4);
    expect(entriesWithSource(entries, "literal").length).toBe(1);
    expect(entriesWithSource(entries, "utility_unary_classes").length).toBe(33);
    for (const entry of ASCIIMATH_TRANSFORM_FONT_STYLES) {
      expect(entry.sources).toEqual(["font_styles"]);
    }
  });

  it("uses only the measurement vocabulary in `sources`", () => {
    for (const [table, entries] of Object.entries(ENTRY_TABLES)) {
      for (const entry of entries) {
        expect(entry.sources.length, `${table} ${entry.name}`).toBeGreaterThan(0);
        for (const source of entry.sources) {
          expect(KNOWN_SOURCES.has(source), `${table} ${entry.name}: ${source}`).toBe(true);
        }
      }
    }
  });

  it("never repeats a name, and keeps each table sorted for lookup", () => {
    for (const [table, entries] of Object.entries(ENTRY_TABLES)) {
      const names = entries.map((entry) => entry.name);
      expect(new Set(names).size, table).toBe(names.length);
      // All names are ASCII, so JS code-unit ordering agrees with the
      // generator's Ruby byte-wise sort.
      expect([...names].sort(), table).toEqual(names);
    }
  });
});

describe("what the names resolve to", () => {
  const getClass = byName(ASCIIMATH_TRANSFORM_GET_CLASS);
  const fontStyles = byName(ASCIIMATH_TRANSFORM_FONT_STYLES);

  it("resolves through the gem's constant aliases, not by capitalizing", () => {
    // `Overbrace = Obrace`, `Underbrace = Ubrace`, `Underline = Ul` in the
    // gem: three names whose class is not `capitalize(name)`. These are the
    // proof that resolution must be measured; a mechanical registry would
    // invent Math::Function::Overbrace and diverge from every recorded model.
    expect(getClass.get("overbrace")?.rubyClass).toBe("Math::Function::Obrace");
    expect(getClass.get("underbrace")?.rubyClass).toBe("Math::Function::Ubrace");
    expect(getClass.get("underline")?.rubyClass).toBe("Math::Function::Ul");
  });

  it("records the census disposition each side of the alias split", () => {
    expect(getClass.get("sqrt")).toEqual({
      name: "sqrt",
      rubyClass: "Math::Function::Sqrt",
      disposition: "implemented",
      carrier: "Math::Function::Sqrt",
      sources: ["unary_class"],
    });
    expect(getClass.get("cancel")).toEqual({
      name: "cancel",
      rubyClass: "Math::Function::Cancel",
      disposition: "aliased",
      carrier: "Math::Function::UnaryFunction",
      sources: ["unary_class"],
    });
    expect(getClass.get("lim")).toEqual({
      name: "lim",
      rubyClass: "Math::Function::Lim",
      disposition: "aliased",
      carrier: "Math::Function::BinaryFunction",
      sources: ["binary_class"],
    });
  });

  it("keeps the two-source entries honest", () => {
    // `text` is both a quoted `get_class("text")` argument and a grammar
    // unary literal; `deg` is reachable only through the Utility membership
    // list, never from the grammar.
    expect(getClass.get("text")?.sources).toEqual(["literal", "unary_class"]);
    expect(getClass.get("deg")?.sources).toEqual(["utility_unary_classes"]);
  });

  it("maps every font-style key onto a FontStyle class", () => {
    expect(fontStyles.get("mathbb")?.rubyClass).toBe("Math::Function::FontStyle::DoubleStruck");
    expect(fontStyles.get("Bbb")?.rubyClass).toBe("Math::Function::FontStyle::DoubleStruck");
    for (const entry of ASCIIMATH_TRANSFORM_FONT_STYLES) {
      expect(entry.rubyClass, entry.name).toMatch(/^Math::Function::FontStyle::/);
      expect(entry.carrier, entry.name).toBe("Math::Function::FontStyle");
    }
  });
});

describe("agreement with the census", () => {
  const census = readCensus();
  const aliases = aliasIndex(census);
  const dispositions = new Map(census.classes.map((entry) => [entry.name, entry.disposition]));

  it("names only classes the census knows, with the census's disposition", () => {
    for (const [table, entries] of Object.entries(ENTRY_TABLES)) {
      for (const entry of entries) {
        const where = `${table} ${entry.name} -> ${entry.rubyClass}`;
        expect(dispositions.get(entry.rubyClass), where).toBe(entry.disposition);
        // `aliasIndex` covers implemented and aliased classes only, so an
        // unknown or deferred class fails here rather than resolving.
        expect(aliases.get(entry.rubyClass), where).toBe(entry.carrier);
      }
    }
  });

  it("carries no class the census defers, and says so explicitly", () => {
    const deferred = new Set(census.policy.deferred);
    expect(deferred.size).toBeGreaterThan(0);
    for (const [table, entries] of Object.entries(ENTRY_TABLES)) {
      for (const entry of entries) {
        expect(deferred.has(entry.rubyClass), `${table} ${entry.name}`).toBe(false);
      }
    }
    // The exclusion slot exists so a deferred resolution is recorded rather
    // than silently dropped; today the measurement finds none.
    expect(ASCIIMATH_TRANSFORM_EXCLUDED).toEqual([]);
  });
});

describe("agreement with the node model", () => {
  const kindByRubyClass = new Map(
    Object.entries(NODE_SPECS).map(([kind, spec]) => [spec.rubyClass, kind]),
  );

  it("lands every carrier on a declared node kind", () => {
    for (const [table, entries] of Object.entries(ENTRY_TABLES)) {
      for (const entry of entries) {
        expect(
          kindByRubyClass.get(entry.carrier),
          `${table} ${entry.name}: no node kind for ${entry.carrier}`,
        ).toBeDefined();
      }
    }
  });

  it("gives every aliased entry an identity its carrier can express", () => {
    let aliased = 0;
    for (const [table, entries] of Object.entries(ENTRY_TABLES)) {
      for (const entry of entries) {
        if (entry.rubyClass === entry.carrier) continue;
        aliased += 1;
        const kind = kindByRubyClass.get(entry.carrier);
        expect(kind, `${table} ${entry.name}`).toBeDefined();
        if (kind === undefined) continue;
        const identity = NODE_SPECS[kind as keyof typeof NODE_SPECS].identity;
        expect(
          identity,
          `${table} ${entry.name}: ${entry.carrier} has no identity slot`,
        ).toBeDefined();
        if (identity === undefined) continue;
        const prefix = `${identity.prefix}::`;
        expect(entry.rubyClass.startsWith(prefix), `${table} ${entry.name}`).toBe(true);
        expect(entry.rubyClass.length, `${table} ${entry.name}`).toBeGreaterThan(prefix.length);
      }
    }
    // A check that matched nothing would prove nothing: 38 aliased get_class
    // names plus all 50 font-style keys.
    expect(aliased).toBe(38 + 50);
  });
});

describe("agreement with the sibling grammar tables", () => {
  const getClass = byName(ASCIIMATH_TRANSFORM_GET_CLASS);

  it("covers exactly the binary and ternary grammar keywords", () => {
    const binary = [...ASCIIMATH_BINARY_CLASSES, ...ASCIIMATH_SUB_SUP_CLASSES];
    for (const name of binary) {
      expect(getClass.get(name)?.sources, name).toContain("binary_class");
    }
    for (const name of ASCIIMATH_TERNARY_CLASSES) {
      expect(getClass.get(name)?.sources, name).toContain("ternary_class");
    }
    expect(entriesWithSource(ASCIIMATH_TRANSFORM_GET_CLASS, "binary_class").length).toBe(
      binary.length,
    );
    expect(entriesWithSource(ASCIIMATH_TRANSFORM_GET_CLASS, "ternary_class").length).toBe(
      ASCIIMATH_TERNARY_CLASSES.length,
    );
  });

  it("covers exactly the unary_class literals the grammar dispatches on", () => {
    const unaryLiterals = [...ASCIIMATH_LITERALS]
      .filter(([, kind]) => kind === "unary_class")
      .map(([text]) => text);
    expect(unaryLiterals.length).toBe(44);
    for (const name of unaryLiterals) {
      expect(getClass.get(name)?.sources, name).toContain("unary_class");
    }
    expect(entriesWithSource(ASCIIMATH_TRANSFORM_GET_CLASS, "unary_class").length).toBe(
      unaryLiterals.length,
    );
  });

  it("serves every font key the grammar can capture", () => {
    // The transform indexes FONT_STYLES with the captured `fonts_class` text,
    // so a fonts literal missing from the table would be a nil-index crash.
    const fontNames = new Set(ASCIIMATH_TRANSFORM_FONT_STYLES.map((entry) => entry.name));
    const fontLiterals = [...ASCIIMATH_LITERALS]
      .filter(([, kind]) => kind === "fonts")
      .map(([text]) => text);
    expect(fontLiterals.length).toBe(14);
    for (const name of fontLiterals) {
      expect(fontNames.has(name), name).toBe(true);
    }
  });

  it("hears every Utility membership name as a get_class entry", () => {
    for (const name of ASCIIMATH_TRANSFORM_UNARY_CLASSES) {
      expect(getClass.get(name)?.sources, name).toContain("utility_unary_classes");
    }
  });
});
