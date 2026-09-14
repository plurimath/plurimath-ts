/** biome-ignore-all lint/style/useNamingConvention: these are Parslet pattern keys, snake_case like the grammar's own capture names. */
/**
 * Two defects a post-merge review found in the TABLE/matrix family
 * (`src/formats/unicodemath/transform.ts`), both fixed here:
 *
 *   1. `matrixSymbol` fell back to the raw, unvalidated text on a
 *      `MATRIXS_INVERTED` miss, and `buildMatrixTable` fed that straight into
 *      `getTableClass` with no check. The gem's `Object.const_get` raises
 *      `NameError` for an unrecognized class name; the port silently built a
 *      bogus `Table` subclass name instead. Fixed by validating the symbol
 *      against `UNICODEMATH_MATRIXS_KEYS` and throwing where the gem would.
 *
 *   2. `identity_matrix_number`'s value drove `Number(...)` where the gem's
 *      `Utility.identity_matrix` uses Ruby's `.to_i`. `Number("1e309")` is
 *      `Infinity`, and `identityMatrix`'s row/column loops are bounded by
 *      that size — an `Infinity` size never terminates. Fixed by routing the
 *      value through `rubyToI` (`src/core/ruby-semantics.ts`) instead.
 *
 * The real grammar constrains `identity_matrix_number` to a single `[0-9]`
 * character (`grammar.ts:1714`), so neither defect is reachable by feeding a
 * string through `parseUnicodemath` — the same reason `matrixSymbol`'s and
 * `identityMatrix`'s callers never see anything but grammar-shaped input in
 * practice. Both are exercised the way `transform-coverage.spec.ts` exercises
 * rules generally: driving `buildUnicodemathTransform()`'s `Transform`
 * directly over a hand-built parse-tree node matching the rule's pattern,
 * which is what a parse tree assembled by a different route — or a future
 * grammar change — could hand these functions.
 */

import { describe, expect, it } from "vitest";
import { buildUnicodemathTransform } from "../../../src/formats/unicodemath/transform";

describe("matrixSymbol / buildMatrixTable: refuses an unrecognized symbol", () => {
  it("throws instead of building a bogus Table subclass, for the array-shaped rule", () => {
    const build = buildUnicodemathTransform();
    expect(() =>
      build.transform.apply({ matrixs: "not-a-real-matrix-symbol", array: ["a"] }),
    ).toThrow(/not a known matrix symbol/);
  });

  it("throws for the identity-matrix-shaped rule too", () => {
    const build = buildUnicodemathTransform();
    expect(() =>
      build.transform.apply({
        matrixs: "not-a-real-matrix-symbol",
        identity_matrix_number: "3",
      }),
    ).toThrow(/not a known matrix symbol/);
  });

  it("still accepts every real MATRIXS entity and every real MATRIXS key", () => {
    const build = buildUnicodemathTransform();
    // Entities (the `op_matrixs` capture) and keys (the `\`-prefixed
    // `op_prefixed_matrixs` capture) are the two shapes `matrixSymbol` sees in
    // practice — both must keep working now that a miss on either is refused.
    const entities = [
      "&#x24a8;",
      "&#x24b1;",
      "&#x24a9;",
      "&#x24e2;",
      "&#x24c8;",
      "&#x2588;",
      "&#x25a0;",
      "&#x24b8;",
    ];
    const keys = [
      "pmatrix",
      "vmatrix",
      "Vmatrix",
      "bmatrix",
      "Bmatrix",
      "eqarray",
      "matrix",
      "cases",
    ];
    for (const matrixs of [...entities, ...keys]) {
      expect(() => build.transform.apply({ matrixs, array: ["a"] }), matrixs).not.toThrow();
    }
  });
});

describe("identity_matrix_number: Ruby to_i semantics, not Number()", () => {
  it("truncates a decimal instead of keeping the fraction", () => {
    const build = buildUnicodemathTransform();
    const withDecimal = build.transform.apply({
      matrixs: "&#x24a8;",
      identity_matrix_number: "2.5",
    });
    const withTwo = build.transform.apply({ matrixs: "&#x24a8;", identity_matrix_number: "2" });
    expect(withDecimal).toStrictEqual(withTwo);
  });

  it("reads a leading-digit prefix and drops trailing garbage", () => {
    const build = buildUnicodemathTransform();
    const withGarbage = build.transform.apply({
      matrixs: "&#x24a8;",
      identity_matrix_number: "3foo",
    });
    const withThree = build.transform.apply({ matrixs: "&#x24a8;", identity_matrix_number: "3" });
    expect(withGarbage).toStrictEqual(withThree);
  });

  it('does not read "0x10" as hex', () => {
    const build = buildUnicodemathTransform();
    const withHex = build.transform.apply({ matrixs: "&#x24a8;", identity_matrix_number: "0x10" });
    const withZero = build.transform.apply({ matrixs: "&#x24a8;", identity_matrix_number: "0" });
    expect(withHex).toStrictEqual(withZero);
  });

  it(
    'completes quickly on "1e309" instead of hanging: to_i reads the leading "1" ' +
      "and never sees scientific notation, where Number() would give Infinity",
    () => {
      const build = buildUnicodemathTransform();
      const start = Date.now();
      const result = build.transform.apply({
        matrixs: "&#x24a8;",
        identity_matrix_number: "1e309",
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(Number.isFinite(elapsed)).toBe(true);

      const withOne = build.transform.apply({ matrixs: "&#x24a8;", identity_matrix_number: "1" });
      expect(result).toStrictEqual(withOne);
    },
  );
});
