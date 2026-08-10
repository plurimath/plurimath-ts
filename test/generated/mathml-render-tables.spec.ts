/**
 * The generated MathML render tables (`src/generated/mathml/render-tables.ts`).
 *
 * The asciimath render-tables discipline, this format's slice: the
 * expectations are deliberately literal — a test that derived them from the
 * tables under test would pass against empty tables. Every pinned value was
 * measured by rendering live gem instances under the oracle's bundle
 * (probes probe-mathml-kinds.rb / probe-mathml-edges.rb, 2026-08-10) against
 * plurimath 0.11.6 at 00c52783877b38f6b8e6e109f1803f96bb34fc62; the
 * generator re-runs the same measurements — one verifying render per entry —
 * on every regeneration, so a truncated, reordered or emptied table fails
 * here instead of quietly changing what the renderer emits.
 */

import { describe, expect, it } from "vitest";
import {
  MATHML_COLOR_SYMBOL_LITERALS,
  MATHML_FONT_STYLE_CARRIER_VARIANTS,
  MATHML_FONT_STYLE_VARIANTS,
  MATHML_MUNDER_CLASS_NAMES,
  MATHML_PAREN_ROLE_IDS,
  MATHML_REACHABLE_CARRIER_NAMES,
  MATHML_SYMBOLS_INVERT,
  MATHML_TABLE_NAME_FAMILIES,
  MATHML_TABLE_PARENS,
  MATHML_UNARY_MI_NAMES,
  MATHML_UNDEROVER_TAG_IDS,
  MATHML_UNICODE_INVERT,
} from "../../src/generated/mathml/render-tables";

describe("the unary <mi> names", () => {
  it("hold Utility::UNARY_CLASSES in the gem's order — an ORDERED pin, 33 names", () => {
    // Order is the gem's own (membership-only at render time, but the diff
    // discipline keeps upstream edits one-to-one).
    expect(MATHML_UNARY_MI_NAMES).toEqual([
      "arccos",
      "arcsin",
      "arctan",
      "liminf",
      "limsup",
      "right",
      "sech",
      "sinh",
      "tanh",
      "cosh",
      "coth",
      "csch",
      "left",
      "max",
      "min",
      "sec",
      "sin",
      "sup",
      "deg",
      "det",
      "dim",
      "exp",
      "gcd",
      "glb",
      "lub",
      "lcm",
      "ker",
      "tan",
      "cos",
      "cot",
      "csc",
      "ln",
      "lg",
    ]);
  });
});

describe("the UNICODE_SYMBOLS invert", () => {
  it("carries the operator texts the big-operator heads read", () => {
    expect(MATHML_UNICODE_INVERT.get("int")).toBe("&#x222b;");
    expect(MATHML_UNICODE_INVERT.get("oint")).toBe("&#x222e;");
    expect(MATHML_UNICODE_INVERT.get("sum")).toBe("&#x2211;");
    expect(MATHML_UNICODE_INVERT.get("prod")).toBe("&#x220f;");
  });

  it("carries the Text substitution entries, alpha through the qquad spaces", () => {
    expect(MATHML_UNICODE_INVERT.get("alpha")).toBe("&#x3b1;");
    expect(MATHML_UNICODE_INVERT.get("qquad")).toBe("&#xa0;&#xa0;&#xa0;&#xa0;");
    expect(MATHML_UNICODE_INVERT.size).toBe(144);
  });

  it("keeps Ruby's last-wins invert for a duplicated name (verified live by the generator)", () => {
    // UNICODE_SYMBOLS maps both `&#x302;` and `"^"` to "hat" (and two
    // entries each to "bar" and "ul"); Hash#invert keeps the LAST, measured
    // through a live Text render per word-shaped winner.
    expect(MATHML_UNICODE_INVERT.get("hat")).toBe("^");
    expect(MATHML_UNICODE_INVERT.get("ul")).toBe("_");
  });
});

describe("the SYMBOLS invert", () => {
  it("is the 17-entry fallback with tilde its one word-shaped key", () => {
    expect(MATHML_SYMBOLS_INVERT.size).toBe(17);
    expect(MATHML_SYMBOLS_INVERT.get("tilde")).toBe("~");
  });
});

describe("the font-style variants", () => {
  it("hold all fourteen subclasses' measured mathvariants", () => {
    expect([...MATHML_FONT_STYLE_VARIANTS]).toEqual([
      ["Bold", "bold"],
      ["BoldFraktur", "bold-fraktur"],
      ["BoldItalic", "bold-italic"],
      ["BoldSansSerif", "bold-sans-serif"],
      ["BoldScript", "bold-script"],
      ["DoubleStruck", "double-struck"],
      ["Fraktur", "fraktur"],
      ["Italic", "italic"],
      ["Monospace", "monospace"],
      ["Normal", "normal"],
      ["SansSerif", "sans-serif"],
      ["SansSerifBoldItalic", "sans-serif-bold-italic"],
      ["SansSerifItalic", "sans-serif-italic"],
      ["Script", "script"],
    ]);
  });

  it("resolve all fifty carrier keywords, bb and mathbf both to bold", () => {
    expect(MATHML_FONT_STYLE_CARRIER_VARIANTS.size).toBe(50);
    expect(MATHML_FONT_STYLE_CARRIER_VARIANTS.get("bb")).toBe("bold");
    expect(MATHML_FONT_STYLE_CARRIER_VARIANTS.get("mathbf")).toBe("bold");
    expect(MATHML_FONT_STYLE_CARRIER_VARIANTS.get("Bbb")).toBe("double-struck");
    expect(MATHML_FONT_STYLE_CARRIER_VARIANTS.get("cc")).toBe("script");
  });
});

describe("the structural routing tables", () => {
  it("MUNDER_CLASSES is the gem's ordered five", () => {
    expect(MATHML_MUNDER_CLASS_NAMES).toEqual(["ubrace", "obrace", "right", "max", "min"]);
  });

  it("the underover tag ids are the eight measured symbol overrides", () => {
    expect(MATHML_UNDEROVER_TAG_IDS).toEqual([
      "Clockoint",
      "Cntclockoint",
      "Intclockwise",
      "Oiiint",
      "Oiint",
      "Oint",
      "Prod",
      "Sum",
    ]);
  });

  it("the paren roles are single-class today — a new subclass lands on regeneration", () => {
    expect(MATHML_PAREN_ROLE_IDS).toEqual({
      close: ["Paren::CloseParen"],
      norm: ["Paren::Norm"],
      vert: ["Paren::Vert"],
      hline: ["Hline"],
    });
  });

  it("the table families route matrix/array/bmatrix to their own bodies, the rest to base", () => {
    expect([...MATHML_TABLE_NAME_FAMILIES]).toEqual([
      ["Align", "base"],
      ["Array", "array"],
      ["Bmatrix", "bmatrix"],
      ["Cases", "base"],
      ["Eqarray", "base"],
      ["Matrix", "matrix"],
      ["Multline", "base"],
      ["Pmatrix", "base"],
      ["Split", "base"],
      ["Vmatrix", "base"],
    ]);
  });

  it("the reachable carrier names mirror the asciimath registry's census", () => {
    expect(MATHML_REACHABLE_CARRIER_NAMES.unary.length).toBe(34);
    expect(MATHML_REACHABLE_CARRIER_NAMES.unary).toContain("Sin");
    expect(MATHML_REACHABLE_CARRIER_NAMES.unary).toContain("Cancel");
    expect(MATHML_REACHABLE_CARRIER_NAMES.binary).toEqual(["Lim", "Log", "Root", "Stackrel"]);
  });
});

describe("the table paren pipeline data", () => {
  it("holds all 24 Paren classes with the measured texts and crash markers", () => {
    expect(MATHML_TABLE_PARENS.size).toBe(24);
    expect(MATHML_TABLE_PARENS.get("Paren::Lsquare")).toEqual({ present: true, text: "[" });
    expect(MATHML_TABLE_PARENS.get("Paren::Lround")).toEqual({ present: true, text: "(" });
    // CloseParen/OpenParen: present, but their paren_value is the invisible
    // fence, blanked to "" (probe table-open-paren-classes).
    expect(MATHML_TABLE_PARENS.get("Paren::CloseParen")).toEqual({ present: true, text: "" });
    expect(MATHML_TABLE_PARENS.get("Paren::OpenParen")).toEqual({ present: true, text: "" });
    // The crash set: encoded/paren_value both private or missing — the gem
    // raises NoMethodError, the renderer RenderError (probe table-lbbrack).
    expect(MATHML_TABLE_PARENS.get("Paren::Lbbrack")).toEqual({ present: true, text: null });
    expect(MATHML_TABLE_PARENS.get("Paren::UpcaseLangle")).toEqual({ present: true, text: null });
  });
});

describe("the color literals", () => {
  it("re-emit the asciimath symbol measurement, Eqno's quoted wrapper included", () => {
    expect(MATHML_COLOR_SYMBOL_LITERALS.size).toBe(1459);
    expect(MATHML_COLOR_SYMBOL_LITERALS.get("Eqno")).toBe('"P{eqno}"');
    expect(MATHML_COLOR_SYMBOL_LITERALS.get("Alpha")).toBe("alpha");
  });
});
