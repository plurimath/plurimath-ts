/**
 * The normalized model against Ruby's.
 *
 * Every `model:` block in the pinned corpus (`submodules/plurimath-testsuite/
 * corpus/asciimath/*.yaml`) was serialized by the gem.
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
import {
  aliasIndex,
  buildNode,
  type CorpusCase,
  readCensus,
  readCorpusCases,
  type SerializedNode,
} from "./model-builder";

const cases = readCorpusCases();
const census = readCensus();
const aliases = aliasIndex(census);

describe("round trip against the Ruby-generated corpus", () => {
  it("reads every case the corpus ships", () => {
    expect(cases.length).toBe(75);
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

// Expectations are written as entry lists rather than object literals: the
// Ruby field names are snake_case, which the lint rules reject as property
// names (the same reason `NODE_SPECS` uses tuples). Order is asserted for
// free, which is what `variables.sort` guarantees.
const fieldEntries = (node: MathNode): readonly (readonly [string, unknown])[] =>
  Object.entries(normalize(node).fields);

describe("field presence", () => {
  it("emits every field Ruby's `initialize` assigns, including the nils", () => {
    // `Plurimath::Math::Number.new("2")` assigns all four instance variables —
    // `@base` to nil, both mini-sizing flags to false — so all four serialize.
    // Passing only `value` must reproduce that, not a one-field node.
    expect(fieldEntries(new NumberNode({ value: "2" }))).toStrictEqual([
      ["base", null],
      ["mini_sub_sized", false],
      ["mini_sup_sized", false],
      ["value", "2"],
    ]);
  });

  it("omits a field Ruby's `initialize` never assigns", () => {
    // `Symbol#initialize` guards every assignment but `@value`: `slashed` is
    // stored only when truthy, the mini-sizing flags only when true, `options`
    // only when non-empty. A bare symbol therefore has one instance variable.
    const plus = normalize(new SymbolNode({ id: "Plus" }));
    expect(plus.class).toBe("Math::Symbols::Plus");
    expect(Object.entries(plus.fields)).toStrictEqual([["value", null]]);
    // And `Formula.new` never touches `@input_string` — the parser sets it
    // afterwards — so a hand-built formula omits it where a parsed one has it.
    expect(Object.keys(normalize(new FormulaNode()).fields)).toStrictEqual([
      "displaystyle",
      "left_right_wrapper",
      "value",
    ]);
  });

  it("still tells an explicit nil apart from an unassigned field", () => {
    // `hide_function_name` is in every function's field list and in no
    // constructor, so it is the honest test of the distinction.
    expect(fieldEntries(new FracNode({ parameterOne: null }))).toStrictEqual([
      ["parameter_one", null],
      ["parameter_two", null],
    ]);
    expect(fieldEntries(new FracNode({ hideFunctionName: false }))).toStrictEqual([
      ["hide_function_name", false],
      ["parameter_one", null],
      ["parameter_two", null],
    ]);
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

/**
 * The census records, per class, what Ruby's `initialize` assigns when it is
 * called with nothing — measured by the generator instantiating the class, not
 * read off its source. A node built with no arguments must serialize to
 * exactly that, or every hand-built tree is a field or two away from Ruby's.
 */
describe("Ruby's constructor defaults, class by class", () => {
  const implemented = census.classes.filter((entry) => entry.disposition === "implemented");

  it("has a measured default set for every implemented class", () => {
    expect(implemented.length).toBe(census.summary.implemented);
    expect(implemented.filter((entry) => entry.defaults === undefined)).toStrictEqual([]);
  });

  for (const entry of implemented) {
    const defaults = entry.defaults;
    it(`builds ${entry.name} exactly as Ruby's argument-free constructor does`, () => {
      expect(defaults).toBeDefined();
      const node = buildNode({ class: entry.name, fields: {} }, aliases);
      const serialized = normalize(node);
      expect(serialized).toStrictEqual({ class: entry.name, fields: defaults?.assigned });
      // Stated separately because the two states are not each other's absence:
      // a field Ruby assigned nil is emitted as null, one it never touched is
      // gone. Collapsing them is the bug this whole block exists to catch.
      for (const field of defaults?.unassigned ?? []) {
        expect(Object.keys(serialized.fields), `${entry.name}.${field}`).not.toContain(field);
      }
    });
  }
});

describe("against the corpus `model:` blocks the gem wrote", () => {
  const numberInteger = cases.find((entry) => entry.id === "number-integer") as CorpusCase;

  it("reads the case it compares against", () => {
    expect(numberInteger).toBeDefined();
    expect(numberInteger.input).toBe("2");
  });

  it("reproduces the gem's Number for `2` from `value` alone", () => {
    const value = numberInteger.model.fields.value as readonly SerializedNode[];
    // No expectation restated here: this is the block the gem serialized.
    expect(normalize(new NumberNode({ value: "2" }))).toStrictEqual(value[0]);
  });

  it("reproduces the gem's Formula for `2` from its value and input string", () => {
    // `input_string` has to be supplied because `Formula#initialize` does not
    // set it — the parser does, afterwards. Everything else is a default.
    const formula = new FormulaNode({
      value: [new NumberNode({ value: "2" })],
      inputString: "2",
    });
    expect(normalize(formula)).toStrictEqual(numberInteger.model);
  });

  it("would not reproduce it if the defaults were dropped", () => {
    // The guard against this test passing vacuously: the pre-fix shape, one
    // field per node, is not what the gem recorded.
    expect(Object.keys(normalize(new NumberNode({ value: "2" })).fields)).not.toStrictEqual([
      "value",
    ]);
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
