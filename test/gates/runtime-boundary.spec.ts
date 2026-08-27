/**
 * The `runtime-boundary` class-A gate (gates.json, ARCHITECTURE.md §7).
 *
 * The gate's contract has two halves and the negative one is easy to
 * over-test: "unknown kind and non-node inputs raise `RenderError`; **valid
 * structural objects render**". Each renderer suite already exercises the
 * negative half heavily in its own file. What this gate asserts is the
 * contract itself, symmetrically, across every landed renderer — so a format
 * cannot be added that rejects what its siblings accept, or accepts what they
 * reject, without something failing.
 *
 * The positive half is the one that was missing. Before this file, every
 * structural-object use in the MathML suite sat inside a `toThrow`: nothing
 * anywhere proved that `toMathml` renders a plain object at all. A renderer
 * that rejected all constructor-less input would have passed the whole suite
 * while violating §5's structural dispatch.
 *
 * Renderer-specific edges — each format's own malformed-slot messages, its
 * option handling, its symbol paths — stay in the renderer suites. This file
 * holds only what every format must agree on.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { toAsciimath } from "../../src/formats/asciimath/renderer";
import { toLatex } from "../../src/formats/latex/renderer";
import { toMathml } from "../../src/formats/mathml/renderer";
import { toUnicodemath } from "../../src/formats/unicodemath/renderer";

/**
 * The four landed renderers. `toMathml` accepts only `formula` and `mrow` at
 * its root — `to_mathml` lives on `Formula` alone in the gem, and every other
 * kind raises `NoMethodError` there — so each format carries its own valid
 * root rather than sharing one.
 */
const RENDERERS = [
  {
    format: "asciimath",
    render: toAsciimath as (node: unknown) => string,
    validRoot: {
      kind: "frac",
      parameterOne: { kind: "number", value: "1" },
      parameterTwo: { kind: "symbol", id: "Plus", value: null },
    },
  },
  {
    format: "latex",
    render: toLatex as (node: unknown) => string,
    validRoot: {
      kind: "frac",
      parameterOne: { kind: "number", value: "1" },
      parameterTwo: { kind: "symbol", id: "Plus", value: null },
    },
  },
  {
    format: "mathml",
    render: toMathml as (node: unknown) => string,
    validRoot: {
      kind: "formula",
      value: [{ kind: "number", value: "1" }],
    },
  },
  {
    // Measured: `toUnicodemath` renders BOTH roots — `"(1)/(+)"` from the frac
    // and `"1"` from the formula — so it takes the frac root its two siblings
    // use rather than MathML's formula-only one.
    format: "unicodemath",
    render: toUnicodemath as (node: unknown) => string,
    validRoot: {
      kind: "frac",
      parameterOne: { kind: "number", value: "1" },
      parameterTwo: { kind: "symbol", id: "Plus", value: null },
    },
  },
] as const;

describe.each(RENDERERS.map((r) => [r.format, r] as const))("%s", (_format, renderer) => {
  describe("the positive half: valid structural objects render", () => {
    it("renders a plain object — no constructor involved", () => {
      // §5's structural dispatch: a caller assembling literal objects is a
      // supported path, not a degraded one.
      const out = renderer.render(renderer.validRoot);
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
    });

    it("renders a frozen tree — nothing on the render path writes to its input", () => {
      const frozen = JSON.parse(JSON.stringify(renderer.validRoot)) as Record<string, unknown>;
      const freezeDeep = (value: unknown): unknown => {
        if (value && typeof value === "object") Object.values(value).forEach(freezeDeep);
        return Object.freeze(value);
      };
      freezeDeep(frozen);
      expect(() => renderer.render(frozen)).not.toThrow();
    });

    it("does not mutate the tree it was given", () => {
      const before = JSON.stringify(renderer.validRoot);
      renderer.render(renderer.validRoot);
      expect(JSON.stringify(renderer.validRoot)).toBe(before);
    });
  });

  describe("the negative half: the boundary raises RenderError", () => {
    // Malformed-slot cases stay out of this gate. The pinned gem diverges for
    // `Frac`: AsciiMath and LaTeX serialize missing slots (`"frac"`,
    // `"frac(1)"`, `"\\frac{}{}"`, `"\\frac{1}{}"`), while MathML raises.
    // That is a renderer-specific rule, so it belongs in the format suites.

    it("rejects an unknown kind", () => {
      expect(() => renderer.render({ kind: "no-such-kind" })).toThrow(RenderError);
    });

    it("rejects a nested unknown kind, not only a root one", () => {
      const nested = structuredClone(renderer.validRoot) as Record<string, unknown>;
      if ("parameterOne" in nested) nested.parameterOne = { kind: "no-such-kind" };
      else nested.value = [{ kind: "no-such-kind" }];
      expect(() => renderer.render(nested)).toThrow(RenderError);
    });

    it("rejects values that are not nodes at all", () => {
      for (const value of [null, undefined, 42, "frac", [], true]) {
        expect(() => renderer.render(value)).toThrow(RenderError);
      }
    });
  });
});
