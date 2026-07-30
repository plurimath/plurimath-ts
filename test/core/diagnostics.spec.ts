/**
 * Unsupported-construct diagnostics (ARCHITECTURE.md §5).
 *
 * A deferred construct is processed as text rather than failing, so the
 * warning is what keeps that divergence honest.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reportUnsupported,
  resetUnsupportedWarnings,
  type UnsupportedDiagnostic,
} from "../../src/core/index";

const diagnostic = (text: string): UnsupportedDiagnostic => ({
  feature: "unitsml",
  text,
  index: 0,
  message: `plurimath: "${text}" is not supported yet and is processed as text.`,
});

afterEach(() => {
  resetUnsupportedWarnings();
  vi.restoreAllMocks();
});

describe("reportUnsupported", () => {
  it("warns once per unique construct, not once per occurrence", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportUnsupported(diagnostic("unitsml(kg)"));
    reportUnsupported(diagnostic("unitsml(kg)"));
    reportUnsupported(diagnostic("unitsml(kg)"));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns separately for genuinely different constructs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportUnsupported(diagnostic("unitsml(kg)"));
    reportUnsupported(diagnostic("unitsml(m/s^2)"));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("hands the diagnostic to a callback instead of warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: UnsupportedDiagnostic[] = [];
    reportUnsupported(diagnostic("unitsml(kg)"), (received) => seen.push(received));
    expect(warn).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.feature).toBe("unitsml");
  });

  it("is silenced by a no-op callback", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportUnsupported(diagnostic("unitsml(kg)"), () => {});
    expect(warn).not.toHaveBeenCalled();
  });

  it("lets a caller escalate by throwing from the callback", () => {
    expect(() =>
      reportUnsupported(diagnostic("unitsml(kg)"), (received) => {
        throw new Error(`refusing: ${received.feature}`);
      }),
    ).toThrow("refusing: unitsml");
  });

  it("does not deduplicate when a callback is supplied", () => {
    const seen: UnsupportedDiagnostic[] = [];
    const collect = (received: UnsupportedDiagnostic) => seen.push(received);
    reportUnsupported(diagnostic("unitsml(kg)"), collect);
    reportUnsupported(diagnostic("unitsml(kg)"), collect);
    expect(seen).toHaveLength(2);
  });
});
