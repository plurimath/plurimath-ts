/**
 * The FontStyle carrier, which the pinned corpus never reaches.
 *
 * The one corpus case that would exercise it is the withheld UnitsML case, so
 * every branch here is unpinned by parity. Measured directly against the
 * pinned oracle (plurimath 0.11.6, 00c52783):
 *
 *   FontStyle::<Name>.new(Symbol("x"), nil).to_unicodemath
 *     Bold                 \mbfx        BoldFraktur          \mbffrakx
 *     BoldItalic           \mbfitx      BoldSansSerif        \mbfsansx
 *     BoldScript           \mbfscrx     DoubleStruck         \Bbbx
 *     Fraktur              \mfrakx      Italic               \mitx
 *     Monospace            ￗ(x)         Normal               \mupx
 *     SansSerif            \msansx      SansSerifBoldItalic  \mbfitsansx
 *     SansSerifItalic      \mitsansx    Script               \mscrx
 *
 *   FontStyle.new(Symbol("x"), <family>).to_unicodemath   (the BARE carrier)
 *     "bold"          \mbfx      "mathbf"        \mbfx
 *     "monospace"     \mttx      "mtt"           \mttx
 *     "double-struck" \Bbbx      "zzz-unknown"   x
 *
 * Three things that a source reading gets wrong:
 *
 *  1. **`Monospace` is the only subclass with its own `to_unicodemath`**, and
 *     it emits U+FFD7 with parens rather than a backslash command.
 *  2. **The bare carrier holding the family `"monospace"` is NOT a
 *     `Monospace`.** It measures `\mttx`, not `ￗ(x)`. So the font must be
 *     resolved from the CLASS when there is one, and only from the family
 *     string when there is not — a single family-keyed table gets this wrong.
 *  3. **An unrecognised family is not an error.** The gem's `find` falls
 *     through to nil, which interpolates as empty, so the child renders with
 *     no prefix at all.
 */

import { describe, expect, it } from "vitest";
import { FontStyleNode, SymbolNode } from "../../../src/core/index";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";

const x = () => new SymbolNode({ id: "Symbol", value: "x" });

/** Every subclass in `Utility::FONT_STYLES.values.uniq`, measured. */
const SUBCLASSES: ReadonlyArray<readonly [string, string]> = [
  ["Bold", "\\mbfx"],
  ["BoldFraktur", "\\mbffrakx"],
  ["BoldItalic", "\\mbfitx"],
  ["BoldSansSerif", "\\mbfsansx"],
  ["BoldScript", "\\mbfscrx"],
  ["DoubleStruck", "\\Bbbx"],
  ["Fraktur", "\\mfrakx"],
  ["Italic", "\\mitx"],
  ["Monospace", "ￗ(x)"],
  ["Normal", "\\mupx"],
  ["SansSerif", "\\msansx"],
  ["SansSerifBoldItalic", "\\mbfitsansx"],
  ["SansSerifItalic", "\\mitsansx"],
  ["Script", "\\mscrx"],
];

/** The bare carrier, resolving through the family string instead. */
const FAMILIES: ReadonlyArray<readonly [string, string]> = [
  ["bold", "\\mbfx"],
  ["mathbf", "\\mbfx"],
  ["monospace", "\\mttx"],
  ["mtt", "\\mttx"],
  ["double-struck", "\\Bbbx"],
  ["zzz-unknown", "x"],
];

describe("every FontStyle subclass renders what the gem renders", () => {
  it.each(SUBCLASSES)("%s", (name, expected) => {
    expect(toUnicodemath(new FontStyleNode({ name, parameterOne: x() }))).toBe(expected);
  });

  it("covers all fourteen, so a shrunken list is not silent coverage", () => {
    expect(SUBCLASSES.length).toBe(14);
  });

  it("gives Monospace the only non-command rendering", () => {
    // Asserted as a property: exactly one subclass escapes the `\command`
    // shape, and it is the one with its own `to_unicodemath`.
    const nonCommand = SUBCLASSES.filter(([, out]) => !out.startsWith("\\")).map(([name]) => name);
    expect(nonCommand).toStrictEqual(["Monospace"]);
  });
});

describe("the bare carrier resolves through its family string", () => {
  it.each(FAMILIES)("family %s", (family, expected) => {
    expect(toUnicodemath(new FontStyleNode({ parameterOne: x(), parameterTwo: family }))).toBe(
      expected,
    );
  });

  it("does NOT treat the monospace family as the Monospace class", () => {
    // The trap. A one-hop family->font table would render this as `ￗ(x)`.
    const byFamily = toUnicodemath(
      new FontStyleNode({ parameterOne: x(), parameterTwo: "monospace" }),
    );
    const byClass = toUnicodemath(new FontStyleNode({ name: "Monospace", parameterOne: x() }));
    expect(byFamily).toBe("\\mttx");
    expect(byClass).toBe("ￗ(x)");
    expect(byFamily).not.toBe(byClass);
  });

  it("renders an unrecognised family with no prefix rather than failing", () => {
    expect(
      toUnicodemath(new FontStyleNode({ parameterOne: x(), parameterTwo: "zzz-unknown" })),
    ).toBe("x");
  });
});
