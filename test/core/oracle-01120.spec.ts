/** biome-ignore-all lint/style/useNamingConvention: Ruby serialized field names are the contract. */
import { describe, expect, it } from "vitest";
import {
  AnnotationNode,
  NumberNode,
  normalize,
  UncertaintyNode,
  UnitsmlNode,
} from "../../src/core/index";
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
    const normal = new UncertaintyNode({ ...init, distribution: "normal" });
    expect(normalize(new UncertaintyNode(init)).fields.distribution).toBeNull();
    expect(normalize(normal).fields.distribution).toBe("normal");
    expect(normal.equals(new UncertaintyNode({ ...init, distribution: "rectangular" }))).toBe(
      false,
    );
  });

  it("keeps UnitsML input_string unassigned and out of equality", () => {
    const plain = new UnitsmlNode({ text: "kg" });
    const parsed = new UnitsmlNode({ text: "kg", inputString: "unitsml(kg)" });
    expect(normalize(plain).fields).toEqual({ text: "kg" });
    expect(normalize(parsed).fields).toEqual({ text: "kg", input_string: "unitsml(kg)" });
    expect(plain.equals(parsed)).toBe(true);
  });
});
