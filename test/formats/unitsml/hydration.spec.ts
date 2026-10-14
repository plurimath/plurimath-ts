import { describe, expect, it } from "vitest";
import { type NormalizedNode, normalize } from "../../../src/core/index";
import { UNITSML_DATA } from "../../../src/unitsml/data";
import { hydrateModel } from "../../../src/unitsml/model";

const resolved = Object.entries(UNITSML_DATA.resolvedTokens ?? {}).filter(
  ([, model]) => typeof model.class === "string" && model.fields !== undefined,
);

describe("UnitsML native hydration selects the pinned Ruby class carrier", () => {
  it("uses the complete measured class census rather than a shared class prefix", () => {
    expect(UNITSML_DATA.modelKinds).toBeDefined();
    expect(resolved.length).toBeGreaterThan(0);
    for (const [, model] of resolved) expect(UNITSML_DATA.modelKinds?.[model.class]).toBeDefined();
  });

  it("keeps Sin unary, Power binary and Normal a font style", () => {
    // Verified on the pinned dependency: Sin < UnaryFunction. Power is the
    // generated negative-exponent case's binary function; Normal is its base.
    const sin = UNITSML_DATA.resolvedTokens?.sin;
    expect(sin?.class).toBe("Math::Function::Sin");
    expect(hydrateModel(sin as NormalizedNode).kind).toBe("unaryFunction");
    const value = UNITSML_DATA.special?.["m^-1"]?.model?.fields.value as readonly NormalizedNode[];
    const power = value[0] as NormalizedNode;
    expect(power.class).toBe("Math::Function::Power");
    expect(hydrateModel(power).kind).toBe("binaryFunction");
    const normal = power.fields.parameter_one as NormalizedNode;
    expect(normal.class).toBe("Math::Function::FontStyle::Normal");
    expect(hydrateModel(normal).kind).toBe("fontStyle");
  });

  it.each(resolved)("%s retains its measured carrier and every assigned field", (_token, model) => {
    const node = hydrateModel(model);
    expect(node.kind).toBe(UNITSML_DATA.modelKinds?.[model.class]);
    expect(normalize(node)).toStrictEqual(model);
  });
});
