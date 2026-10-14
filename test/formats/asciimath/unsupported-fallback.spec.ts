/** biome-ignore-all lint/style/useNamingConvention: Ruby-serialized model fields stay snake_case. */
/** Native UnitsML regression tests for the old fallback boundary. */
import { describe, expect, it, vi } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";

// Regression guard: native UnitsML must never fall back to plain text or report
// itself as unsupported. Measured render bytes live in the inline integration suite.
describe("native UnitsML replaces the former fallback", () => {
  it("stores unit text without eagerly expanding render options", () => {
    const formula = parseAsciimath('"unitsml(kg)"');
    expect(formula.value).toHaveLength(1);
    expect(formula.value?.[0]).toMatchObject({ kind: "unitsml", text: "kg" });
  });

  it("keeps onUnsupported accepted without warning for supported UnitsML", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callback = vi.fn();
    try {
      parseAsciimath('"unitsml(kg)"', { onUnsupported: callback });
      expect(callback).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
