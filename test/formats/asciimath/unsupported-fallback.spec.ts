/** biome-ignore-all lint/style/useNamingConvention: Ruby-serialized model fields stay snake_case. */
/**
 * Deferred UnitsML fallback through the REAL AsciiMath entry point:
 * `parseAsciimath` parses `"unitsml(...)"` as text, reports the divergence,
 * and keeps caller-facing offsets in the original input.
 *
 * Oracle note: the Ruby gem does NOT do this. On the pinned oracle
 * (plurimath 0.11.6 at 00c52783), `"unitsml(kg)"` renders as `rm(kg)`,
 * `\mathrm{kg}`, and a normal-variant `<mi>kg</mi>` tree. This spec pins the
 * deliberate TypeScript divergence ARCHITECTURE.md §5 records, not a Ruby
 * output.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalize,
  resetUnsupportedWarnings,
  type UnsupportedDiagnostic,
} from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toAsciimath } from "../../../src/formats/asciimath/renderer";
import { toLatex } from "../../../src/formats/latex/renderer";
import { toMathml } from "../../../src/formats/mathml/renderer";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";

function math(inner: string, displaystyle = "true"): string {
  return (
    `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n` +
    `  <mstyle displaystyle="${displaystyle}">\n${inner}\n  </mstyle>\n</math>\n`
  );
}

afterEach(() => {
  resetUnsupportedWarnings();
  vi.restoreAllMocks();
});

describe("unsupported UnitsML fallback", () => {
  it("normalizes to Text and renders through every landed format", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const formula = parseAsciimath('"unitsml(kg)"');

    expect(normalize(formula)).toStrictEqual({
      class: "Math::Formula",
      fields: {
        displaystyle: true,
        input_string: '"unitsml(kg)"',
        left_right_wrapper: true,
        value: [
          {
            class: "Math::Function::Text",
            fields: {
              lang: null,
              parameter_one: "unitsml(kg)",
            },
          },
        ],
      },
    });
    expect(toAsciimath(formula)).toBe('"unitsml(kg)"');
    expect(toLatex(formula)).toBe("\\text{unitsml(kg)}");
    expect(toMathml(formula)).toBe(math("    <mtext>unitsml(kg)</mtext>"));
    // Measured on the pinned oracle: `Formula#to_unicodemath` over the same
    // `Text` node answers `"unitsml(kg)"`, quotes included — the same bytes as
    // to_asciimath, not the LaTeX or MathML wrapping.
    expect(toUnicodemath(formula)).toBe('"unitsml(kg)"');
  });

  it("replaces the default warning when a callback is supplied", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: UnsupportedDiagnostic[] = [];

    parseAsciimath('"unitsml(kg)"', {
      onUnsupported: (diagnostic) => {
        seen.push(diagnostic);
      },
    });

    expect(warn).not.toHaveBeenCalled();
    expect(seen).toStrictEqual([
      {
        feature: "unitsml",
        text: '"unitsml(kg)"',
        index: 0,
        message:
          'UnitsML is not supported yet; "unitsml(kg)" was parsed as plain text. ' +
          "Pass onUnsupported to silence or reroute this warning.",
      },
    ]);
  });

  it("is silenced by a no-op callback", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    parseAsciimath('"unitsml(kg)"', { onUnsupported: () => {} });

    expect(warn).not.toHaveBeenCalled();
  });

  it("lets a caller escalate by throwing from the callback", () => {
    expect(() =>
      parseAsciimath('"unitsml(kg)"', {
        onUnsupported: (diagnostic) => {
          throw new Error(`refusing: ${diagnostic.text}`);
        },
      }),
    ).toThrow('refusing: "unitsml(kg)"');
  });

  it("warns once per unique construct through parseAsciimath", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    parseAsciimath('"unitsml(kg)" + "unitsml(kg)"');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'UnitsML is not supported yet; "unitsml(kg)" was parsed as plain text. ' +
        "Pass onUnsupported to silence or reroute this warning.",
    );
  });

  it("warns separately for distinct constructs through parseAsciimath", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    parseAsciimath('"unitsml(kg)" + "unitsml(m/s^2)"');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls).toStrictEqual([
      [
        'UnitsML is not supported yet; "unitsml(kg)" was parsed as plain text. ' +
          "Pass onUnsupported to silence or reroute this warning.",
      ],
      [
        'UnitsML is not supported yet; "unitsml(m/s^2)" was parsed as plain text. ' +
          "Pass onUnsupported to silence or reroute this warning.",
      ],
    ]);
  });

  it("reports the original-input offset after preprocessing rewrites", () => {
    const input = '{:x:} + "unitsml(kg)"';
    const seen: UnsupportedDiagnostic[] = [];

    parseAsciimath(input, {
      onUnsupported: (diagnostic) => {
        seen.push(diagnostic);
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      feature: "unitsml",
      text: '"unitsml(kg)"',
      index: input.indexOf('"unitsml(kg)"'),
    });
    const diagnostic = seen[0] as UnsupportedDiagnostic;
    expect(input[diagnostic.index]).toBe('"');
  });

  it("cuts the reported construct at the end of input or before trailing text", () => {
    const atEnd: UnsupportedDiagnostic[] = [];
    parseAsciimath('"unitsml(kg)"', {
      onUnsupported: (diagnostic) => {
        atEnd.push(diagnostic);
      },
    });
    expect(atEnd).toHaveLength(1);
    expect(atEnd[0]?.text).toBe('"unitsml(kg)"');

    const withTail: UnsupportedDiagnostic[] = [];
    parseAsciimath('"unitsml(kg)" + x', {
      onUnsupported: (diagnostic) => {
        withTail.push(diagnostic);
      },
    });
    expect(withTail).toHaveLength(1);
    expect(withTail[0]).toMatchObject({
      text: '"unitsml(kg)"',
      index: 0,
    });
  });
});
