/** biome-ignore-all lint/style/useNamingConvention: Ruby serialized field names are the contract. */
import { describe, expect, it } from "vitest";
import {
  AnnotationNode,
  NumberNode,
  normalize,
  UncertaintyNode,
  UnitsmlNode,
} from "../../src/core/index";
import { uncertaintyProblem } from "../../src/core/uncertainty";
import { toMathml as renderMathml } from "../../src/formats/mathml/index";

describe("Ruby 0.11.20 model fields", () => {
  it("keeps annotation fields unassigned until supplied and refuses standalone rendering", () => {
    expect(normalize(new AnnotationNode())).toEqual({
      class: "Math::Function::Semantics::Annotation",
      fields: {},
    });
    const node = new AnnotationNode({
      tag: "annotation",
      content: [new NumberNode({ value: "1" })],
    });
    expect(normalize(node).fields).toEqual({
      content: [
        {
          class: "Math::Number",
          fields: { base: null, mini_sub_sized: false, mini_sup_sized: false, value: "1" },
        },
      ],
      tag: "annotation",
    });
    expect(() => renderMathml(node)).toThrow("NoMethodError");
  });

  it("includes uncertainty distribution in model state and equality", () => {
    const init = { value: new NumberNode({ value: "1" }), category: "standard" as const };
    const normal = new UncertaintyNode({ ...init, distribution: "rect" });
    expect(normalize(new UncertaintyNode(init)).fields.distribution).toBeNull();
    expect(normalize(normal).fields.distribution).toBe("rect");
    expect(normal.equals(new UncertaintyNode({ ...init, distribution: "triang" }))).toBe(false);
  });

  it("validates the oracle's distribution tags and category restrictions", () => {
    const number = (value: string) => new NumberNode({ value });
    const init = { value: number("1"), magnitude: number("1"), category: "standard" as const };
    for (const distribution of ["rect", "triang", "arcsine"]) {
      expect(uncertaintyProblem(new UncertaintyNode({ ...init, distribution }))).toBeNull();
    }
    expect(uncertaintyProblem(new UncertaintyNode({ ...init, distribution: "normal" }))).toBe(
      "unknown distribution :normal",
    );
    expect(
      uncertaintyProblem(
        new UncertaintyNode({
          ...init,
          category: "expanded",
          coverageFactor: number("2"),
          distribution: "rect",
        }),
      ),
    ).toBe("distribution does not apply to a expanded uncertainty");
  });

  it("keeps UnitsML input_string unassigned and out of equality", () => {
    const plain = new UnitsmlNode({ text: "kg" });
    const parsed = new UnitsmlNode({ text: "kg", inputString: "unitsml(kg)" });
    expect(normalize(plain).fields).toEqual({ text: "kg" });
    expect(normalize(parsed).fields).toEqual({ text: "kg", input_string: "unitsml(kg)" });
    expect(plain.equals(parsed)).toBe(true);
  });
});
