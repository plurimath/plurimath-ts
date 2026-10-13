import { describe, expect, it } from "vitest";
import { evaluate, FormulaNode, NumberNode, UnsupportedFeatureError } from "../../src/index";

/** A finite public tree, built iteratively so construction cannot overflow. */
function nestedFormula(depth: number): FormulaNode {
  let node = new FormulaNode({ value: [new NumberNode({ value: "1" })] });
  for (let index = 0; index < depth; index++) {
    node = new FormulaNode({ value: [node] });
  }
  return node;
}

describe("the public evaluation depth boundary", () => {
  it("evaluates a shallow nested formula", () => {
    expect(evaluate(nestedFormula(10))).toBe(1);
  });

  it("refuses genuine stack exhaustion with a stable feature error", () => {
    // Well beyond the default stacks of the supported Node runtimes; this
    // asserts the boundary, not a particular supported depth threshold.
    const formula = nestedFormula(20_000);
    let caught: unknown;
    try {
      evaluate(formula);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnsupportedFeatureError);
    expect(caught).toMatchObject({ code: "UNSUPPORTED_FEATURE", feature: "evaluate" });
    expect((caught as Error).message).toContain("call stack");
  });

  it.each(["Out of range", "Maximum call stack size exceeded while allocating a buffer"])(
    "preserves an unrelated RangeError: %s",
    (message) => {
      const error = new RangeError(message);
      const formula = nestedFormula(0);
      Object.defineProperty(formula, "value", {
        get() {
          throw error;
        },
      });
      let caught: unknown;
      try {
        evaluate(formula);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(error);
    },
  );
});
