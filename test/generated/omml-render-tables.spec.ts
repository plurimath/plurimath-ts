/**
 * The generated OMML render tables (`src/generated/omml/render-tables.ts`).
 *
 * The mathml render-tables discipline, this format's slice: the expectations
 * are deliberately literal — a test that derived them from the tables under
 * test would pass against empty tables. Every pinned value was measured by
 * rendering live gem instances under the oracle's bundle against plurimath
 * 0.11.6 at 00c52783877b38f6b8e6e109f1803f96bb34fc62; the generator re-runs
 * the same measurements on every regeneration — a live `to_omml` render for
 * every WORD-shaped key, the only kind the grammar's `unicode[:\w+]` syntax
 * can reach (95 of 144 UNICODE entries, 1 of 17 SYMBOLS entries) — so a
 * truncated, reordered or emptied table fails here instead of quietly
 * changing what the renderer emits.
 *
 * `OMML_UNICODE_INVERT` and `OMML_SYMBOLS_INVERT` invert the SAME Ruby
 * constants (`Mathml::Constants::UNICODE_SYMBOLS`/`SYMBOLS`) the mathml
 * render-tables slice does, so their sizes and entries are byte-identical to
 * `MATHML_UNICODE_INVERT`/`MATHML_SYMBOLS_INVERT` — re-measured here as this
 * format's own generated copy rather than imported, because ARCHITECTURE.md
 * §3 rule 4 forbids an omml kind file reading mathml's generated slice.
 */

import { describe, expect, it } from "vitest";
import { OMML_SYMBOLS_INVERT, OMML_UNICODE_INVERT } from "../../src/generated/omml/render-tables";

describe("the UNICODE_SYMBOLS invert", () => {
  it("carries the Text substitution entries, alpha through the qquad spaces", () => {
    expect(OMML_UNICODE_INVERT.get("alpha")).toBe("&#x3b1;");
    expect(OMML_UNICODE_INVERT.get("kappa")).toBe("&#x3ba;");
    expect(OMML_UNICODE_INVERT.get("qquad")).toBe("&#xa0;&#xa0;&#xa0;&#xa0;");
    expect(OMML_UNICODE_INVERT.size).toBe(144);
  });

  it("keeps Ruby's last-wins invert for a duplicated name (verified live by the generator)", () => {
    // UNICODE_SYMBOLS maps both `&#x302;` and `"^"` to "hat" (and two
    // entries each to "bar" and "ul"); Hash#invert keeps the LAST, measured
    // through a live Text render per word-shaped winner.
    expect(OMML_UNICODE_INVERT.get("hat")).toBe("^");
    expect(OMML_UNICODE_INVERT.get("ul")).toBe("_");
  });
});

describe("the SYMBOLS invert", () => {
  it("is the 17-entry fallback with tilde its one word-shaped key", () => {
    expect(OMML_SYMBOLS_INVERT.size).toBe(17);
    expect(OMML_SYMBOLS_INVERT.get("tilde")).toBe("~");
  });
});
