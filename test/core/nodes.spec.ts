/**
 * The node model against its source of truth (ARCHITECTURE.md §5).
 *
 * The union is declared *from the census*, not from what AsciiMath happens to
 * need, so the first thing the suite proves is that the two agree — kind for
 * kind, field for field. A hand-edited table that drifts from the gem is the
 * failure this catches.
 */

import { describe, expect, it } from "vitest";
import { EQUALITY_FIELDS, equals } from "../../src/core/equality";
import { RenderError } from "../../src/core/errors";
import {
  AbsNode,
  BinaryFunctionNode,
  FontStyleNode,
  FormulaNode,
  FracNode,
  HatNode,
  hasNodeKind,
  type MathNode,
  MrowNode,
  NODE_KINDS,
  type NodeKind,
  NumberNode,
  RUBY_ABSTRACT_CLASSES,
  SymbolNode,
  TableNode,
  TextNode,
  UnaryFunctionNode,
} from "../../src/core/nodes";
import { NODE_SPECS, normalize, rubyClassName } from "../../src/core/normalize";
import { assertMathNodeShape } from "../../src/core/validate";
import {
  aliasIndex,
  buildNode,
  type CensusDefaults,
  oneOfEachKind,
  readCensus,
} from "./model-builder";

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
    // `Frac.new` in Ruby assigns both parameters, to nil.
    expect(empty.parameterOne).toBeNull();
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
    // `Symbol#initialize` assigns `@value` unconditionally and guards the
    // rest, so one bare symbol shows both states at once.
    const symbol = new SymbolNode({ id: "Plus" });
    expect(symbol.value).toBeNull();
    expect(symbol.slashed).toBeUndefined();
    expect(symbol.options).toBeUndefined();
    expect(symbol.miniSubSized).toBeUndefined();
    // No function's constructor sets `hide_function_name`; a transform does.
    expect(new FracNode({ parameterOne: null }).hideFunctionName).toBeUndefined();
  });

  it("materializes Ruby's constructor defaults rather than leaving fields unset", () => {
    // `Number.new("2")` assigns all four ivars. Anything less and the node is
    // a field short of the tree the gem serializes (see normalize.spec.ts,
    // which checks all 38 classes against the census).
    const number = new NumberNode({ value: "2" });
    expect(number.base).toBeNull();
    expect(number.miniSubSized).toBe(false);
    expect(number.miniSupSized).toBe(false);
    // `Formula.new` assigns three of its five, and `Text#initialize` is the
    // one constructor whose default is not nil.
    const formula = new FormulaNode();
    expect(formula.value).toStrictEqual([]);
    expect(formula.leftRightWrapper).toBe(true);
    expect(formula.displaystyle).toBe(true);
    expect(formula.inputString).toBeUndefined();
    expect(new TextNode().parameterOne).toBe("");
  });

  it("gives each node its own default hash and list", () => {
    // The defaults are built per call, so two nodes never share one object.
    expect(new HatNode().attributes).not.toBe(new HatNode().attributes);
    expect(new FormulaNode().value).not.toBe(new FormulaNode().value);
  });
});

/**
 * A node-list slot is stored the way Ruby stores it, and refused at RENDER.
 *
 * Two separate facts, and the branch that landed this once conflated them.
 *
 * **1. Never SPREAD.** `[...value]` reads any JavaScript iterable as its
 * elements; Ruby reads only an `Array` as one. Measured on the pinned oracle
 * (`00c52783`, Ruby 4.0.1), in all five landed formats:
 *
 * ```text
 *                              gem stores      gem renders (html)
 * Formula.new([sym])           [sym]           "a"
 * Formula.new(sym)             [sym]           "a"
 * Formula.new("")              [""]            !! ParseError
 * Formula.new(Set[sym])        [Set[sym]]      !! ParseError
 * Formula.new([sym].each)      [Enumerator]    !! ParseError
 * Formula.new({"k" => sym})    [Hash]          !! ParseError
 * ```
 *
 * A spread gave `[]` for the empty string and `[sym]` for the `Set`, so the
 * port rendered `""` and `"a"` where the gem refuses outright — invented bytes,
 * the one direction a parity defect must never run in.
 *
 * **2. The refusal belongs at RENDER.** ARCHITECTURE.md §5 and the `nodes.ts`
 * module docs both promise permissive constructors: an invalid hand-built tree
 * fails with `RenderError`, never a raw `TypeError`. An earlier fix for (1)
 * threw `TypeError` from these helpers, which broke that promise for every
 * format at once — and, because `Table`'s helper called `Array.from`, ran a
 * caller's iterator inside a constructor, so a throwing iterator escaped
 * `new TableNode` untyped. The gem never raises building any of these.
 *
 * So: the constructors store, default and shallow-copy, and nothing else. The
 * refusal is `./validate` and the format renderers, and the oracle-backed
 * byte-level proof is `test/formats/html/degenerate-slots.spec.ts`, whose
 * `formula[0]=node`, `mrow[0]=node`, `formula[0]=empty-string`,
 * `mrow[0]=empty-string` and `table[0]=empty-string` rows compare against the
 * gem's own outcome for each.
 */
describe("a node-list slot is stored, never spread and never refused", () => {
  const sym = () => new SymbolNode({ value: "a" });
  const generator = () =>
    (function* () {
      yield sym();
    })();

  /** Every carrier the port can be handed, and what Ruby does with each. */
  const carriers: readonly (readonly [string, () => unknown])[] = [
    ["an array", () => [sym()]],
    ["a bare node", () => sym()],
    ["a bare string", () => ""],
    ["a Set", () => new Set([sym()])],
    ["a Map", () => new Map([["k", sym()]])],
    ["a generator", generator],
    ["a number", () => 0],
    ["a boolean", () => false],
    ["null", () => null],
  ];

  // `Formula` and its `Mrow` subclass share one `initialize`, so they share one
  // policy: `@value = value.is_a?(Array) ? value : [value]` (`formula.rb:44`).
  const wrappers: readonly (readonly [string, (value: unknown) => { value: unknown }])[] = [
    ["FormulaNode", (value) => new FormulaNode({ value } as never)],
    ["MrowNode", (value) => new MrowNode({ value } as never)],
  ];

  describe.each(wrappers)("%s", (_name, build) => {
    it("wraps a bare string whole, as Ruby's `[value]` does", () => {
      // `[...""]` is `[]` and `[..."ab"]` is `["a", "b"]`; neither is a list
      // Ruby ever builds here.
      expect(build("").value).toStrictEqual([""]);
      expect(build("ab").value).toStrictEqual(["ab"]);
    });

    it("wraps a bare node whole, which the gem then RENDERS", () => {
      // `Formula.new(sym).to_html` is `"a"` on the oracle. The port used to
      // throw here, making it stricter than the gem for no reason.
      const node = sym();
      expect(build(node).value).toStrictEqual([node]);
    });

    const iterables: readonly (readonly [string, () => object])[] = [
      ["a Set", () => new Set([sym()])],
      ["a Map", () => new Map([["k", sym()]])],
      ["a generator", generator],
    ];
    it.each(iterables)("wraps %s whole, rather than reading its elements", (_label, make) => {
      // Identity, not deep equality: the claim is that the carrier itself became
      // the single element, and a spread would have put its MEMBERS here.
      const carrier = make();
      const value = build(carrier).value as readonly unknown[];
      expect(value).toHaveLength(1);
      expect(value[0]).toBe(carrier);
    });

    it("never runs the caller's iterator", () => {
      // Ruby's wrap touches nothing iterable. Reading one here would run a
      // caller's code inside a constructor and let it escape untyped.
      let asked = 0;
      const carrier = {
        [Symbol.iterator]() {
          asked += 1;
          throw new Error("the constructor consumed a lazy iterator");
        },
      };
      expect(() => build(carrier)).not.toThrow();
      expect(asked).toBe(0);
    });

    it("still copies an array, and still keeps nil apart from unset", () => {
      const given = [sym()];
      const node = build(given);
      expect(node.value).toStrictEqual(given);
      expect(node.value).not.toBe(given);
      // Ruby has no `undefined`, so `Formula.new(nil)` wraps to `[nil]`; this
      // port keeps assigned-nil apart from unset and stores `null`. The stored
      // shape differs, the outcome does not — measured, both refuse in all five
      // landed formats.
      expect(build(null).value).toBeNull();
    });

    it.each(carriers)("builds without throwing when handed %s", (_label, make) => {
      expect(() => build(make())).not.toThrow();
    });
  });

  /**
   * `Table#initialize` is NOT `Formula#initialize`: it assigns `@value = value`
   * untouched (`function/table.rb:22-30`) and its renderers call `map` on
   * whatever arrived, so a carrier renders in the gem when it answers `map` and
   * yields renderable rows. Measured on the oracle with one `Tr` of one `Td`:
   *
   * ```text
   * Table.new([tr], nil, nil, {})       <table><tr><td>a</td></tr></table>
   * Table.new(Set[tr], nil, nil, {})    <table><tr><td>a</td></tr></table>
   * Table.new([tr].each, nil, nil, {})  <table><tr><td>a</td></tr></table>
   * Table.new({"k" => tr}, ...)         NoMethodError — Hash#map yields pairs
   * Table.new("", nil, nil, {})         NoMethodError — String#map
   * Table.new(tr, nil, nil, {})         NoMethodError — Tr#map
   * ```
   *
   * The port refuses the `Set` and the `Enumerator` at render, where the gem
   * renders them: a known divergence in the LOUD direction, and the price of
   * not consuming an iterator at construction.
   */
  describe("TableNode stores its carrier untouched", () => {
    const table = (value: unknown) => new TableNode({ value } as never);

    it("copies an array, as every other list slot does", () => {
      const given = [sym()];
      const node = table(given);
      expect(node.value).toStrictEqual(given);
      expect(node.value).not.toBe(given);
    });

    const asGiven: readonly (readonly [string, () => unknown])[] = [
      ["a Set", () => new Set([sym()])],
      ["a Map", () => new Map([["k", sym()]])],
      ["a bare string", () => ""],
      ["a bare node", () => sym()],
    ];
    it.each(asGiven)("stores %s as it arrived — no wrap, no materialisation", (_label, make) => {
      const given = make();
      expect(table(given).value).toBe(given);
    });

    it("does not wrap a non-array the way Formula does", () => {
      const set = new Set([sym()]);
      expect(table(set).value).toBe(set);
      expect(new FormulaNode({ value: set as never }).value).toStrictEqual([set]);
    });

    it("never runs the caller's iterator", () => {
      // `Array.from` here consumed a lazy iterator at construction and let a
      // throwing one escape `new TableNode` as its own untyped error. Ruby
      // iterates at render, in `value.map`, and so must this.
      let asked = 0;
      const carrier = {
        [Symbol.iterator]() {
          asked += 1;
          throw new Error("the constructor consumed a lazy iterator");
        },
      };
      expect(() => table(carrier)).not.toThrow();
      expect(asked).toBe(0);
    });

    it.each(carriers)("builds without throwing when handed %s", (_label, make) => {
      expect(() => table(make())).not.toThrow();
    });

    it("keeps nil apart from unset", () => {
      // `Table.new` defaults `value` to nil, so BOTH are nil here — unlike
      // Formula, whose Ruby default is `[]`.
      expect(table(null).value).toBeNull();
      expect(new TableNode().value).toBeNull();
    });
  });

  /**
   * The other half of the contract: what the constructor no longer refuses is
   * refused at render instead, as `RenderError` naming the slot.
   *
   * `assertMathNodeShape` is the entry-point check every renderer runs, and it
   * rejects a class instance wherever it sits — the only objects a Ruby node
   * holds are nodes and plain hashes. Carriers it CANNOT see (a bare string, a
   * number, a boolean) are legal slot values elsewhere in the model and are
   * refused by each format's own list guard instead; those are pinned against
   * the gem's own outcome in `test/formats/html/degenerate-slots.spec.ts`.
   */
  describe("the refusal lands at render, as RenderError", () => {
    const objectCarriers: readonly (readonly [string, () => object])[] = [
      ["a Set", () => new Set([sym()])],
      ["a Map", () => new Map([["k", sym()]])],
      ["a generator", generator],
    ];

    it.each(objectCarriers)("FormulaNode wrapping %s", (label, make) => {
      const node = new FormulaNode({ value: make() as never });
      expect(() => assertMathNodeShape(node, "html")).toThrow(RenderError);
      expect(() => assertMathNodeShape(node, "html"), label).toThrow(/node\.value\[0\]/);
    });

    it.each(objectCarriers)("MrowNode wrapping %s", (label, make) => {
      const node = new MrowNode({ value: make() as never });
      expect(() => assertMathNodeShape(node, "html"), label).toThrow(RenderError);
    });

    it.each(objectCarriers)("TableNode storing %s", (label, make) => {
      const node = new TableNode({ value: make() as never });
      expect(() => assertMathNodeShape(node, "html")).toThrow(RenderError);
      expect(() => assertMathNodeShape(node, "html"), label).toThrow(/node\.value/);
    });

    it("a throwing iterator is refused at render, and never invoked before it", () => {
      let asked = 0;
      const carrier = {
        [Symbol.iterator]() {
          asked += 1;
          throw new Error("the walk consumed a lazy iterator");
        },
      };
      // A plain object: `assertMathNodeShape` walks its own enumerable string
      // keys (it has none) and passes, exactly as it would for an options hash.
      // The format's table guard is what refuses it, and neither reads
      // `Symbol.iterator`.
      const node = new TableNode({ value: carrier as never });
      expect(() => assertMathNodeShape(node, "html")).not.toThrow();
      expect(asked).toBe(0);
    });
  });
});

/**
 * 21 of the 1,552 aliased classes override `initialize` with defaults their
 * carrier does not have — `FontStyle::Bold.new(nil)` comes out with
 * `parameter_two: "bold"`, `Table::Matrix.new` with round parens. The carrier
 * node is one class for all of them, so it looks the alias up by identity.
 *
 * The expectations are the census's `defaults.assigned`, which the generator
 * measured by instantiating each class — not read off the Ruby source, which
 * would get `Table::Matrix` wrong: its `initialize` defaults the parens to the
 * strings `"("` and `")"`, and `Table#initialize` coerces them into
 * `Paren::Lround`/`Paren::Rround` nodes on the way in.
 */
describe("constructor defaults an aliased class brings with it", () => {
  const aliases = aliasIndex(census);
  const aliased = census.classes.filter((entry) => entry.disposition === "aliased");
  const diverging = aliased.filter((entry) => entry.defaults !== undefined);
  const defaultsOf = (name: string): CensusDefaults | undefined =>
    census.classes.find((entry) => entry.name === name)?.defaults;

  it("finds every aliased class the census says diverges", () => {
    // The census records `defaults` on an aliased entry only when they differ
    // from its carrier's, so this set is exactly the divergent one.
    expect(diverging.map((entry) => entry.name).sort()).toStrictEqual(
      [
        "Math::Function::FontStyle::Bold",
        "Math::Function::FontStyle::DoubleStruck",
        "Math::Function::FontStyle::Fraktur",
        "Math::Function::FontStyle::Italic",
        "Math::Function::FontStyle::Monospace",
        "Math::Function::FontStyle::Normal",
        "Math::Function::FontStyle::SansSerif",
        "Math::Function::FontStyle::Script",
        "Math::Function::Mglyph",
        "Math::Function::Table::Align",
        "Math::Function::Table::Array",
        "Math::Function::Table::Bmatrix",
        "Math::Function::Table::Cases",
        "Math::Function::Table::Eqarray",
        "Math::Function::Table::Matrix",
        "Math::Function::Table::Multline",
        "Math::Function::Table::Pmatrix",
        "Math::Function::Table::Split",
        "Math::Function::Table::Vmatrix",
        "Math::Function::Td",
        "Math::Function::Tr",
      ].sort(),
    );
  });

  for (const entry of diverging) {
    it(`builds ${entry.name} exactly as Ruby's constructor does`, () => {
      const node = buildNode({ class: entry.name, fields: {} }, aliases);
      const serialized = normalize(node);
      expect(serialized).toStrictEqual({ class: entry.name, fields: entry.defaults?.assigned });
      for (const field of entry.defaults?.unassigned ?? []) {
        expect(Object.keys(serialized.fields), `${entry.name}.${field}`).not.toContain(field);
      }
    });
  }

  it("leaves every other aliased class on its carrier's defaults", () => {
    // The complement, all 1,531 of it: materializing a default where Ruby has
    // none would be the same bug in the other direction.
    const unchanged = aliased.filter((entry) => entry.defaults === undefined);
    expect(unchanged.length).toBe(aliased.length - diverging.length);
    let checked = 0;
    for (const entry of unchanged) {
      const carrier = defaultsOf(entry.aliases as string);
      if (carrier === undefined) continue;
      expect(
        normalize(buildNode({ class: entry.name, fields: {} }, aliases)),
        entry.name,
      ).toStrictEqual({
        class: entry.name,
        fields: carrier.assigned,
      });
      checked += 1;
    }
    expect(checked).toBe(unchanged.length);
  });

  it("keys the lookup by kind *and* name, never by name alone", () => {
    // `Td` is a BinaryFunction alias and `Tr` a UnaryFunction one. A node of
    // the other carrier with the same name is a different Ruby class and gets
    // nothing.
    expect(new BinaryFunctionNode({ name: "Td" }).parameterOne).toStrictEqual([]);
    expect(new UnaryFunctionNode({ name: "Td" }).parameterOne).toBeNull();
    expect(new UnaryFunctionNode({ name: "Tr" }).parameterOne).toStrictEqual([]);
    expect(new BinaryFunctionNode({ name: "Tr" }).parameterOne).toBeNull();
  });

  it("keeps the carrier's own defaults for a name the gem does not have", () => {
    // Construction stays permissive (§5): an unknown name is not an error.
    expect(new TableNode({ name: "Nosuch" }).openParen).toBeNull();
    expect(new TableNode({ name: "Nosuch" }).value).toBeNull();
    expect(new FontStyleNode({ name: "Nosuch" }).parameterTwo).toBeNull();
    expect(new TableNode().openParen).toBeNull();
    expect(new FontStyleNode().parameterTwo).toBeNull();
    expect(new UnaryFunctionNode({ name: "Sin" }).parameterOne).toBeNull();
  });

  it("materializes what the caller omitted and nothing else", () => {
    // An explicit value wins, including the falsy ones a `??` would swallow.
    expect(new FontStyleNode({ name: "Bold", parameterTwo: null }).parameterTwo).toBeNull();
    expect(new FontStyleNode({ name: "Bold", parameterTwo: "bf" }).parameterTwo).toBe("bf");
    expect(new TableNode({ name: "Matrix", openParen: null }).openParen).toBeNull();
    expect(new TableNode({ name: "Matrix", value: null }).value).toBeNull();
    expect(new TableNode({ name: "Matrix", value: [] }).value).toStrictEqual([]);
    expect(new TableNode({ name: "Matrix", options: {} }).options).toStrictEqual({});
    expect(new UnaryFunctionNode({ name: "Tr", parameterOne: null }).parameterOne).toBeNull();
    expect(new UnaryFunctionNode({ name: "Mglyph", parameterOne: null }).parameterOne).toBeNull();
  });

  it("allocates fresh values per construction, never a shared table", () => {
    const first = new TableNode({ name: "Matrix" });
    const second = new TableNode({ name: "Matrix" });
    expect(first.openParen).not.toBe(second.openParen);
    expect(first.closeParen).not.toBe(second.closeParen);
    expect(first.value).not.toBe(second.value);
    expect(first.options).not.toBe(second.options);
    // Two `Vert` parens on one node must also be two objects.
    const vmatrix = new TableNode({ name: "Vmatrix" });
    expect(vmatrix.openParen).not.toBe(vmatrix.closeParen);
    expect(new UnaryFunctionNode({ name: "Tr" }).parameterOne).not.toBe(
      new UnaryFunctionNode({ name: "Tr" }).parameterOne,
    );
    expect(new UnaryFunctionNode({ name: "Mglyph" }).parameterOne).not.toBe(
      new UnaryFunctionNode({ name: "Mglyph" }).parameterOne,
    );
    expect(new BinaryFunctionNode({ name: "Td" }).parameterOne).not.toBe(
      new BinaryFunctionNode({ name: "Td" }).parameterOne,
    );
  });

  it("hands out a materialized default the caller can safely mutate", () => {
    // The fresh-per-construction rule is only worth anything if a caller
    // reaching into one node's default cannot reach the next node's.
    const row = new UnaryFunctionNode({ name: "Tr" });
    (row.parameterOne as MathNode[]).push(new SymbolNode({ value: "a" }));
    expect(new UnaryFunctionNode({ name: "Tr" }).parameterOne).toStrictEqual([]);
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

  it("shallow-copies a hash handed to a parameter slot", () => {
    // `Mglyph` is the only class whose parameter slot holds an attribute hash
    // rather than a node or a list, so widening `NodeParameter` to admit one
    // left it as the single slot the copy helpers did not cover.
    const attributes: Record<string, unknown> = { alt: "before" };
    const glyph = new UnaryFunctionNode({ name: "Mglyph", parameterOne: attributes });
    attributes.alt = "after";
    expect(glyph.parameterOne).toEqual({ alt: "before" });
  });

  it("copies that hash even when it carries a `kind` key", () => {
    // `kind` is a real mglyph attribute — the gem renders
    // `<mglyph kind="decorative"/>` — so a hash and plain node data cannot be
    // told apart by shape. Which slot it is decides, not what it looks like.
    const attributes: Record<string, unknown> = { kind: "decorative", alt: "before" };
    const glyph = new UnaryFunctionNode({ name: "Mglyph", parameterOne: attributes });
    attributes.alt = "after";
    expect(glyph.parameterOne).toEqual({ kind: "decorative", alt: "before" });
  });

  it("does not clone a node handed to a node slot", () => {
    const inner = new SymbolNode({ value: "x" });
    const sin = new UnaryFunctionNode({ name: "Sin", parameterOne: inner });
    expect(sin.parameterOne).toBe(inner);
  });

  it("copies a node it cannot recognise, rather than trusting it", () => {
    // A node from a second copy of the package carries that copy's private
    // brand, so this one does not recognise it. The safe direction is to copy:
    // the result is structurally identical and `normalize`/`equals` cannot tell
    // the difference, whereas trusting an unrecognised value would let a caller
    // reach into a finished node. The brand is deliberately NOT `Symbol.for`,
    // which any caller could read and set.
    const foreign = { kind: "symbol", value: "x" };
    const sin = new UnaryFunctionNode({ name: "Sin", parameterOne: foreign as never });

    expect(sin.parameterOne).not.toBe(foreign);
    expect(sin.parameterOne).toStrictEqual(foreign);

    // And the copy is genuinely detached.
    (foreign as { value: string }).value = "mutated";
    expect((sin.parameterOne as { value: string }).value).toBe("x");
  });

  it("copies an options hash even when it carries an `equals` function", () => {
    // `NodeOptions` is `Record<string, unknown>`, so a function is a legal
    // value. Recognising nodes by their `equals` method therefore mistook a
    // hash like this for a node and left it aliased.
    const attributes: Record<string, unknown> = {
      alt: "before",
      equals() {
        return false;
      },
    };
    const glyph = new UnaryFunctionNode({ name: "Mglyph", parameterOne: attributes });
    attributes.alt = "after";
    expect((glyph.parameterOne as Record<string, unknown>).alt).toBe("before");
  });

  it("copies a hash handed to a slot Ruby never assigns", () => {
    // These four paren slots have no default to consult, but the public type
    // accepts a hash through `NodeParameter`, so a caller can pass one. Ruby's
    // own constructors never do — the exposure is ours, not the gem's.
    const attributes: Record<string, unknown> = { alt: "before" };
    const node = new AbsNode({ openParen: attributes });
    attributes.alt = "after";
    expect(node.openParen).toEqual({ alt: "before" });
  });

  it("gives each node its own copy of a hash default", () => {
    const first = new UnaryFunctionNode({ name: "Mglyph" });
    const second = new UnaryFunctionNode({ name: "Mglyph" });
    (first.parameterOne as Record<string, unknown>).alt = "leaked";
    expect(second.parameterOne).toEqual({});
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

/**
 * ARCHITECTURE.md §4 promises `node.equals(other)` as a method, not only as
 * the module function `equals(a, b)`. It used to exist as the function alone,
 * so `new AbsNode().equals(x)` threw `TypeError`.
 */
describe("equals as a method", () => {
  // `oneOfEachKind` builds through the constructors, so it returns the class
  // union and `.equals` is reachable without a cast. The structural `MathNode`
  // deliberately has no `equals`; that contract is proven in `node-types.spec.ts`.
  const kinds = oneOfEachKind();
  const twins = oneOfEachKind();

  it("exists on every node class in the union", () => {
    expect(kinds).toHaveLength(NODE_KINDS.length);
    for (const [kind, node] of kinds) {
      expect(typeof node.equals, kind).toBe("function");
    }
  });

  it("gives the same answer as the module function, kind by kind", () => {
    for (const [index, entry] of kinds.entries()) {
      const [kind, node] = entry;
      const twin = (twins[index] as readonly [NodeKind, MathNode])[1];
      expect(node.equals(twin), kind).toBe(true);
      expect(node.equals(twin), kind).toBe(equals(node, twin));
      expect(node.equals(null), kind).toBe(false);
      expect(node.equals("not a node"), kind).toBe(false);
    }
  });

  it("compares deeply through the method, as the function does", () => {
    const left = new FracNode({ parameterOne: new SymbolNode({ id: "Plus" }) });
    const right = new FracNode({ parameterOne: new SymbolNode({ id: "Plus", value: "+" }) });
    expect(left.equals(right)).toBe(true);
    expect(left.equals(new FracNode({ parameterOne: new SymbolNode({ id: "Minus" }) }))).toBe(
      false,
    );
  });

  it("adds no field to a node, only a prototype method", () => {
    // A base carrying state would put an instance variable on every node that
    // Ruby does not have, which `normalize` would then have to know about.
    const node = new SymbolNode({ id: "Plus" });
    expect(Object.hasOwn(node, "equals")).toBe(false);
    expect(Object.keys(node)).not.toContain("equals");
  });
});

describe("structural dispatch", () => {
  it("accepts any object carrying a known kind, whatever produced it", () => {
    expect(hasNodeKind({ kind: "frac", parameterOne: null })).toBe(true);
    expect(hasNodeKind(new TextNode({ parameterOne: "hi" }))).toBe(true);
  });

  it("rejects an unknown kind and non-objects", () => {
    expect(hasNodeKind({ kind: "unitsml" })).toBe(false);
    expect(hasNodeKind({ kind: 7 })).toBe(false);
    expect(hasNodeKind({})).toBe(false);
    expect(hasNodeKind(null)).toBe(false);
    expect(hasNodeKind("frac")).toBe(false);
  });
});
