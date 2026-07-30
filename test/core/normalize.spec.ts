/**
 * The normalized model against Ruby's.
 *
 * Every `model:` block in `corpus/asciimath/*.yaml` was serialized by the gem.
 * Rebuilding a node tree from one and normalizing it back must reproduce that
 * block exactly — same class names, same field sets, same nil-versus-absent
 * distinction. This is the strict projection: any tree difference shows up.
 */

import { describe, expect, it } from "vitest";
import {
  FormulaNode,
  FracNode,
  type MathNode,
  NumberNode,
  SymbolNode,
  TableNode,
  TextNode,
  UnaryFunctionNode,
} from "../../src/core/nodes";
import { NODE_SPECS, normalize, rubyClassName } from "../../src/core/normalize";
import { aliasIndex, buildNode, readCensus, readCorpusCases } from "./model-builder";

const cases = readCorpusCases();
const aliases = aliasIndex(readCensus());

describe("round trip against the Ruby-generated corpus", () => {
  it("reads every case the corpus ships", () => {
    expect(cases.length).toBe(69);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
  });

  for (const entry of cases) {
    it(`reproduces the gem's model for ${entry.id} (${entry.input})`, () => {
      const node = buildNode(entry.model, aliases);
      expect(normalize(node)).toStrictEqual(entry.model);
    });
  }

  it("covers the alias carriers, not just the classes with their own kind", () => {
    const classes = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      if (typeof value === "object" && value !== null && "class" in value) {
        classes.add((value as { class: string }).class);
        walk((value as unknown as { fields: unknown }).fields);
        return;
      }
      if (typeof value === "object" && value !== null) {
        for (const item of Object.values(value)) walk(item);
      }
    };
    for (const entry of cases) walk(entry.model);
    // Aliased Ruby classes the corpus exercises: they have no kind of their own.
    expect(classes).toContain("Math::Symbols::Paren::Lround");
    expect(classes).toContain("Math::Function::Sin");
    expect(classes).toContain("Math::Function::Power");
    expect(classes).toContain("Math::Function::PowerBase");
    expect(classes).toContain("Math::Function::Td");
    expect(classes.size).toBeGreaterThanOrEqual(24);
  });
});

describe("field presence", () => {
  it("omits a field Ruby never assigned and emits one Ruby set to nil", () => {
    expect(normalize(new NumberNode({ value: "2" }))).toStrictEqual({
      class: "Math::Number",
      fields: { value: "2" },
    });
    expect(normalize(new NumberNode({ value: "2", base: null }))).toStrictEqual({
      class: "Math::Number",
      fields: { base: null, value: "2" },
    });
  });

  it("emits fields in Ruby's `variables.sort` order", () => {
    const node = new NumberNode({
      value: "2",
      base: null,
      miniSubSized: false,
      miniSupSized: false,
    });
    expect(Object.keys(normalize(node).fields)).toStrictEqual([
      "base",
      "mini_sub_sized",
      "mini_sup_sized",
      "value",
    ]);
  });

  it("sorts the keys of an options hash, as the generator does", () => {
    const node = new TableNode({ value: [], options: { rowlines: "solid", columnalign: "left" } });
    const fields = normalize(node).fields as { options: Record<string, unknown> };
    expect(Object.keys(fields.options)).toStrictEqual(["columnalign", "rowlines"]);
  });
});

describe("Ruby class names", () => {
  it("folds an alias name back into the class name", () => {
    expect(normalize(new SymbolNode({ id: "Plus" })).class).toBe("Math::Symbols::Plus");
    expect(normalize(new UnaryFunctionNode({ name: "Sin" })).class).toBe("Math::Function::Sin");
  });

  it("uses the base class when no alias name is carried", () => {
    expect(normalize(new FormulaNode({ value: [] })).class).toBe("Math::Formula");
    expect(normalize(new TableNode({ value: [] })).class).toBe("Math::Function::Table");
  });

  it("agrees with NODE_SPECS for every kind's base class", () => {
    for (const [kind, spec] of Object.entries(NODE_SPECS)) {
      expect(spec.rubyClass.startsWith("Math::"), kind).toBe(true);
    }
  });
});

describe("failure semantics", () => {
  it("refuses to serialize a value it has no Ruby shape for", () => {
    const node = new FracNode({ parameterOne: (() => 1) as unknown as MathNode });
    expect(() => normalize(node)).toThrow(/Cannot normalize function/);
  });

  it("reports the path to the offending field", () => {
    const node = new FormulaNode({
      value: [new TextNode({ parameterOne: Symbol("x") as unknown as string })],
    });
    expect(() => normalize(node)).toThrow(/text\.parameterOne/);
  });

  it("refuses a node-shaped object carrying a kind the union does not declare", () => {
    const forged = { kind: "unitsml", text: "kg" } as unknown as MathNode;
    const node = new FracNode({ parameterOne: forged });
    expect(() => normalize(node)).toThrow(/Unknown node kind "unitsml"/);
  });

  it("carries the RenderError contract", () => {
    const node = new FracNode({ parameterOne: (() => 1) as unknown as MathNode });
    try {
      normalize(node);
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe("RENDER_ERROR");
    }
  });
});

describe("recursion", () => {
  it("walks nested nodes, node lists and plain hashes alike", () => {
    // Built by hand with the public constructors, then checked against the
    // block the gem itself wrote for `a/b` — no expectation restated here.
    const node = new FormulaNode({
      value: [
        new FracNode({
          parameterOne: new SymbolNode({ value: "a" }),
          parameterTwo: new SymbolNode({ value: "b" }),
        }),
      ],
      leftRightWrapper: true,
      displaystyle: true,
      inputString: "a/b",
    });
    const fracSimple = cases.find((entry) => entry.id === "frac-simple");
    expect(fracSimple?.input).toBe("a/b");
    expect(normalize(node)).toStrictEqual(fracSimple?.model);
  });

  it("matches the shape the corpus records for that very input", () => {
    const fracSimple = cases.find((entry) => entry.id === "frac-simple");
    expect(fracSimple).toBeDefined();
    expect(rubyClassName(buildNode(fracSimple?.model as never, aliases))).toBe("Math::Formula");
  });
});
