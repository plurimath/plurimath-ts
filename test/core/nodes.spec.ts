/**
 * The node model against its source of truth (ARCHITECTURE.md §5).
 *
 * The union is declared *from the census*, not from what AsciiMath happens to
 * need, so the first thing the suite proves is that the two agree — kind for
 * kind, field for field. A hand-edited table that drifts from the gem is the
 * failure this catches.
 */

import { describe, expect, it } from "vitest";
import { EQUALITY_FIELDS } from "../../src/core/equality";
import {
  FormulaNode,
  FracNode,
  isMathNode,
  type MathNode,
  NODE_KINDS,
  type NodeKind,
  NumberNode,
  RUBY_ABSTRACT_CLASSES,
  SymbolNode,
  TableNode,
  TextNode,
  UnaryFunctionNode,
} from "../../src/core/nodes";
import { NODE_SPECS, rubyClassName } from "../../src/core/normalize";
import { readCensus } from "./model-builder";

const census = readCensus();
const implemented = census.classes.filter((entry) => entry.disposition === "implemented");
const kinds = Object.keys(NODE_SPECS) as NodeKind[];

function camel(field: string): string {
  return field.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

describe("census completeness", () => {
  it("gives every implemented census class exactly one node kind", () => {
    const declared = kinds.map((kind) => NODE_SPECS[kind].rubyClass).sort();
    const censused = implemented.map((entry) => entry.name).sort();
    expect(declared).toStrictEqual(censused);
    expect(kinds.length).toBe(census.summary.implemented);
  });

  it("keeps NODE_KINDS in step with the union", () => {
    expect([...NODE_KINDS].sort()).toStrictEqual([...kinds].sort());
    expect(new Set(NODE_KINDS).size).toBe(NODE_KINDS.length);
  });

  it("records Ruby's abstract classes without making them union members", () => {
    expect([...RUBY_ABSTRACT_CLASSES]).toStrictEqual([...census.policy.abstract]);
    // Three of them are also `implemented`: they are the concrete carriers for
    // the aliased function classes. `Symbols::Paren` is not, and has no kind.
    expect(kinds.map((kind) => NODE_SPECS[kind].rubyClass)).not.toContain("Math::Symbols::Paren");
  });

  it("never admits a deferred class", () => {
    for (const deferred of census.policy.deferred) {
      expect(kinds.map((kind) => NODE_SPECS[kind].rubyClass)).not.toContain(deferred);
    }
  });

  it("declares each kind's fields exactly as the census does", () => {
    for (const entry of implemented) {
      const kind = kinds.find((candidate) => NODE_SPECS[candidate].rubyClass === entry.name);
      expect(kind, entry.name).toBeDefined();
      const spec = NODE_SPECS[kind as NodeKind];
      expect(
        spec.fields.map(([rubyField]) => rubyField),
        entry.name,
      ).toStrictEqual([...(entry.fields ?? [])].sort());
      // Ruby serializes `variables.sort`, so the table must already be sorted.
      expect(
        spec.fields.map(([rubyField]) => rubyField),
        entry.name,
      ).toStrictEqual([...spec.fields.map(([rubyField]) => rubyField)].sort());
      for (const [rubyField, tsField] of spec.fields) {
        expect(tsField, `${entry.name}.${rubyField}`).toBe(camel(rubyField));
      }
    }
  });

  it("projects equality from each class's own `==`, not from its field list", () => {
    for (const entry of implemented) {
      const kind = kinds.find(
        (candidate) => NODE_SPECS[candidate].rubyClass === entry.name,
      ) as NodeKind;
      const expected = [...(entry.equality?.fields ?? [])]
        // `Linebreak#==` also compares `linebreak?`, which is `true` for every
        // instance of the class, so it can only ever match.
        .filter((field) => !field.endsWith("?"))
        .map(camel)
        .sort();
      expect([...EQUALITY_FIELDS[kind]].sort(), entry.name).toStrictEqual(expected);
    }
  });

  it("compares fewer fields than it holds, wherever Ruby does", () => {
    // The whole point of a separate projection: Formula has five fields and
    // compares two. If these ever coincided, the projection would be dead code.
    expect(NODE_SPECS.formula.fields.length).toBe(5);
    expect(EQUALITY_FIELDS.formula).toStrictEqual(["leftRightWrapper", "value"]);
    expect(NODE_SPECS.text.fields.map(([ruby]) => ruby)).toContain("lang");
    expect(EQUALITY_FIELDS.text).not.toContain("lang");
  });
});

describe("construction", () => {
  it("builds a node from an options object and exposes the fields", () => {
    const node = new FracNode({
      parameterOne: new SymbolNode({ value: "a" }),
      parameterTwo: new SymbolNode({ value: "b" }),
      options: { display: "block" },
    });
    expect(node.kind).toBe("frac");
    expect((node.parameterOne as SymbolNode).value).toBe("a");
    expect(node.options).toStrictEqual({ display: "block" });
    expect(node.hideFunctionName).toBeUndefined();
  });

  it("validates nothing — an empty or nonsensical node builds fine", () => {
    const empty = new FracNode();
    expect(empty.parameterOne).toBeUndefined();
    // A string where a node belongs is accepted; it fails at render, not here.
    expect(new FracNode({ parameterOne: "not a node" }).parameterOne).toBe("not a node");
  });

  it("defaults a symbol to the base Ruby class and carries an alias in `id`", () => {
    expect(new SymbolNode({ value: "x" }).id).toBe("Symbol");
    expect(rubyClassName(new SymbolNode({ value: "x" }))).toBe("Math::Symbols::Symbol");
    expect(rubyClassName(new SymbolNode({ id: "Paren::Lround" }))).toBe(
      "Math::Symbols::Paren::Lround",
    );
  });

  it("carries an aliased function class in `name`", () => {
    expect(rubyClassName(new UnaryFunctionNode({ name: "Sin" }))).toBe("Math::Function::Sin");
    expect(rubyClassName(new TableNode({ name: "Matrix" }))).toBe("Math::Function::Table::Matrix");
    expect(rubyClassName(new TableNode())).toBe("Math::Function::Table");
    expect(rubyClassName(new FormulaNode())).toBe("Math::Formula");
    expect(rubyClassName(new FormulaNode({ name: "Mstyle" }))).toBe("Math::Formula::Mstyle");
  });

  it("keeps `undefined` (Ruby never assigned) apart from `null` (Ruby assigned nil)", () => {
    expect(new NumberNode({ value: "2" }).base).toBeUndefined();
    expect(new NumberNode({ value: "2", base: null }).base).toBeNull();
  });
});

describe("immutability", () => {
  it("shallow-copies a list argument, so a later push cannot reach in", () => {
    const children: MathNode[] = [new SymbolNode({ value: "a" })];
    const formula = new FormulaNode({ value: children });
    children.push(new SymbolNode({ value: "b" }));
    expect(formula.value).toHaveLength(1);
  });

  it("shallow-copies a list handed to a parameter slot", () => {
    const cells: MathNode[] = [new SymbolNode({ value: "a" })];
    const row = new UnaryFunctionNode({ name: "Tr", parameterOne: cells });
    cells.push(new SymbolNode({ value: "b" }));
    expect(row.parameterOne).toHaveLength(1);
  });

  it("shallow-copies an options object, so a later key assignment cannot reach in", () => {
    const options: Record<string, unknown> = { columnalign: "left" };
    const table = new TableNode({ options });
    options.columnalign = "right";
    options.rowlines = "solid";
    expect(table.options).toStrictEqual({ columnalign: "left" });
  });

  it("does not deep-clone what the caller nested inside options — out of contract", () => {
    const nested = { style: "a" };
    const table = new TableNode({ options: { nested } });
    nested.style = "b";
    expect((table.options as { nested: { style: string } }).nested.style).toBe("b");
  });

  it("is readonly at compile time only: no setters, no runtime freeze", () => {
    const node = new NumberNode({ value: "2" });
    // @ts-expect-error — every field is `readonly` (ARCHITECTURE.md §5).
    node.value = "3";
    // Deliberately not frozen: `readonly` is a compile-time guarantee, and
    // frozen → editable would be the harder change to make later.
    expect(node.value).toBe("3");
    expect(Object.isFrozen(node)).toBe(false);
  });

  it("holds nodes, and nodes have no mutable interior", () => {
    const inner = new SymbolNode({ value: "x" });
    const outer = new FracNode({ parameterOne: inner });
    expect(outer.parameterOne).toBe(inner);
  });
});

describe("structural dispatch", () => {
  it("accepts any object carrying a known kind, whatever produced it", () => {
    expect(isMathNode({ kind: "frac", parameterOne: null })).toBe(true);
    expect(isMathNode(new TextNode({ parameterOne: "hi" }))).toBe(true);
  });

  it("rejects an unknown kind and non-objects", () => {
    expect(isMathNode({ kind: "unitsml" })).toBe(false);
    expect(isMathNode({ kind: 7 })).toBe(false);
    expect(isMathNode({})).toBe(false);
    expect(isMathNode(null)).toBe(false);
    expect(isMathNode("frac")).toBe(false);
  });
});
