/**
 * Transform-engine conformance (ARCHITECTURE.md §6): `Parslet::Transform`
 * semantics, pinned the same way `conformance.spec.ts` pins the atoms.
 *
 * Every expectation here was measured on parslet 2.0.0 (through the oracle's
 * bundle, gem `00c52783`) before being written — probe scripts live in the
 * session scratchpad, and each block quotes the probe it encodes. The four
 * behaviours under test:
 *
 *   1. rules are tried in REVERSE definition order (`rule` uses `unshift`),
 *      and on a tie — two rules, same pattern — the later one wins;
 *   2. a pattern matches only when its key set is EXACTLY the node's key set
 *      (`return false unless exp.size == tree.size`);
 *   3. a rule's replacement is never run back through the rules — it is only
 *      seen again as part of its parent's match;
 *   4. a name bound twice in one pattern must have `==`-equal values, where
 *      slices compare by TEXT (offset ignored) and the FIRST binding stays;
 *      a first binding that is Ruby-falsy (nil/false) is silently overwritten
 *      instead of compared, and bindings are made in PATTERN definition order.
 */

import { describe, expect, it } from "vitest";
import { Slice, sequence, simple, subtree, Transform } from "../../src/pegkit/index";

/** Stand-in for a constructed model node: not a plain hash, not an array. */
class ConstructedNode {
  constructor(readonly children: readonly unknown[] = []) {}
}

describe("rule order", () => {
  it("a later rule wins a tie on the identical pattern", () => {
    // Measured: order_same_pattern_tie=:second
    const t = new Transform();
    t.rule({ x: simple("v") }, () => "first");
    t.rule({ x: simple("v") }, () => "second");
    expect(t.apply({ x: "q" })).toBe("second");
  });

  it("a later rule wins over an earlier overlapping one", () => {
    // Measured: order_overlapping_reverse=:later
    const t = new Transform();
    t.rule({ a: simple("p"), b: simple("q") }, () => "earlier");
    t.rule({ a: simple("p"), b: subtree("q") }, () => "later");
    expect(t.apply({ a: "1", b: "2" })).toBe("later");
  });

  it("a later rule that fails only on binding inequality falls back to an earlier one", () => {
    // Measured: order_later_rule_binding_failure_falls_back=[:earlier, :later]
    const t = new Transform();
    t.rule({ a: simple("p"), b: simple("q") }, () => "earlier");
    t.rule({ a: simple("v"), b: simple("v") }, () => "later");
    expect(t.apply({ a: "p", b: "q" })).toBe("earlier");
    expect(t.apply({ a: "s", b: "s" })).toBe("later");
  });
});

describe("exact key-set matching", () => {
  it("rejects a node that carries one extra key", () => {
    // Measured: keyset_extra_key_rejects={a: "1", b: "2"}   (unchanged)
    const t = new Transform();
    t.rule({ a: simple("x") }, () => "matched");
    expect(t.apply({ a: "1", b: "2" })).toEqual({ a: "1", b: "2" });
  });

  it("rejects a node that is missing a pattern key", () => {
    // Measured: keyset_missing_key_rejects={a: "1"}   (unchanged)
    const t = new Transform();
    t.rule({ a: simple("x"), b: simple("y") }, () => "matched");
    expect(t.apply({ a: "1" })).toEqual({ a: "1" });
  });

  it("still transforms the children of a rejected node", () => {
    // Measured: children_transformed_under_rejected_parent={a: "T", extra: "2"}
    const t = new Transform();
    t.rule({ x: simple("v") }, () => "T");
    expect(t.apply({ a: { x: "1" }, extra: "2" })).toEqual({ a: "T", extra: "2" });
  });

  it("matches an empty pattern against the empty node only", () => {
    // Measured: keyset_empty_pattern_vs_empty_node=:matched_empty
    const t = new Transform();
    t.rule({}, () => "empty");
    expect(t.apply({})).toBe("empty");
    expect(t.apply({ a: "1" })).toEqual({ a: "1" });
  });
});

describe("a replacement is never revisited", () => {
  it("does not run a replacement back through the rules", () => {
    // Measured: replacement_not_revisited={y: "leaf"}  — the y-rule, although
    // it would match the replacement, never sees it.
    const t = new Transform();
    t.rule({ y: simple("v") }, () => "revisited");
    t.rule({ x: simple("v") }, () => ({ y: "leaf" }));
    expect(t.apply({ x: "a" })).toEqual({ y: "leaf" });
  });

  it("leaves a nested replacement alone too", () => {
    // Measured: nested_replacement_not_revisited={outer: {y: "leaf"}}
    const t = new Transform();
    t.rule({ y: simple("v") }, () => "revisited");
    t.rule({ x: simple("v") }, () => ({ y: "leaf" }));
    expect(t.apply({ outer: { x: "a" } })).toEqual({ outer: { y: "leaf" } });
  });

  it("lets the replacement participate in its PARENT's match", () => {
    // Measured: replacement_participates_in_parent_match="parent saw CHILD" —
    // bottom-up means the parent matches against already-transformed children.
    const t = new Transform();
    t.rule({ x: simple("v") }, () => "CHILD");
    t.rule({ outer: simple("v") }, (b) => `parent saw ${String(b.v)}`);
    expect(t.apply({ outer: { x: "a" } })).toBe("parent saw CHILD");
  });
});

describe("repeated binding names", () => {
  const bindBoth = () => {
    const t = new Transform();
    t.rule({ a: simple("v"), b: simple("v") }, (b) => ({ bound: b.v }));
    return t;
  };

  it("matches when both values are equal", () => {
    // Measured: repeated_binding_equal_strings="bound=x"
    expect(bindBoth().apply({ a: "x", b: "x" })).toEqual({ bound: "x" });
  });

  it("does not match when the values differ", () => {
    // Measured: repeated_binding_unequal_strings={a: "x", b: "y"}  (unchanged)
    expect(bindBoth().apply({ a: "x", b: "y" })).toEqual({ a: "x", b: "y" });
  });

  it("compares slices by text — offsets are ignored — and keeps the FIRST binding", () => {
    // Measured on a real parse ((str('x').as(:a) >> str('x').as(:b)).parse("xx")):
    //   repeated_binding_slices_same_text_different_offsets="bound=\"x\"@0"
    //   equal_binding_action_sees_first_value_offset=0
    const result = bindBoth().apply({ a: new Slice("x", 0), b: new Slice("x", 5) });
    expect(result).toEqual({ bound: new Slice("x", 0) });
  });

  it("compares a slice and a string by text, in both directions", () => {
    // Measured: repeated_binding_slice_then_string="bound=\"x\"@0"
    //           repeated_binding_string_then_slice="bound=\"x\""
    // Ruby keeps the first binding on the comparison path, so the bound value
    // keeps the first occurrence's type:
    //   repeated_binding_first_value_kept_not_overwritten=["Parslet::Slice", "String"]
    expect(bindBoth().apply({ a: new Slice("x", 2), b: "x" })).toEqual({
      bound: new Slice("x", 2),
    });
    expect(bindBoth().apply({ a: "x", b: new Slice("x", 2) })).toEqual({ bound: "x" });
    expect(bindBoth().apply({ a: new Slice("x", 0), b: new Slice("y", 1) })).toEqual({
      a: new Slice("x", 0),
      b: new Slice("y", 1),
    });
  });

  it("overwrites a first binding that is null or false instead of comparing", () => {
    // Parslet's guard `bound_value = bindings[var_name]` skips the equality
    // check when the stored value is Ruby-falsy. Measured:
    //   repeated_binding_nil_first_then_string="bound=\"y\""
    //   repeated_binding_false_first_then_string="bound=\"y\""
    //   repeated_binding_string_first_then_nil={a: "y", b: nil}  (unchanged)
    expect(bindBoth().apply({ a: null, b: "y" })).toEqual({ bound: "y" });
    expect(bindBoth().apply({ a: false, b: "y" })).toEqual({ bound: "y" });
    expect(bindBoth().apply({ a: "y", b: null })).toEqual({ a: "y", b: null });
  });

  it("binds in PATTERN definition order, not node order", () => {
    // Pattern defines :b before :a, so "y" binds first and "y" == nil fails.
    // Measured: repeated_binding_iteration_is_pattern_order={a: nil, b: "y"}
    const t = new Transform();
    t.rule({ b: simple("v"), a: simple("v") }, (b) => ({ bound: b.v }));
    expect(t.apply({ a: null, b: "y" })).toEqual({ a: null, b: "y" });
    // The same node under the a-first pattern matches (the falsy overwrite).
    expect(bindBoth().apply({ a: null, b: "y" })).toEqual({ bound: "y" });
  });

  it("applies the same equality to subtree bindings", () => {
    // Measured: repeated_binding_subtree_equal_hashes="bound={k: \"1\"}"
    //           repeated_binding_subtree_unequal_hashes=(unchanged)
    const t = new Transform();
    t.rule({ a: subtree("v"), b: subtree("v") }, (b) => ({ bound: b.v }));
    expect(t.apply({ a: { k: "1" }, b: { k: "1" } })).toEqual({ bound: { k: "1" } });
    expect(t.apply({ a: { k: "1" }, b: { k: "2" } })).toEqual({ a: { k: "1" }, b: { k: "2" } });
  });

  it("applies the same equality to sequence bindings, element-wise", () => {
    // Measured: repeated_binding_sequence_matcher_equal_arrays="bound=[\"x\"@0, \"z\"]"
    const t = new Transform();
    t.rule({ a: sequence("v"), b: sequence("v") }, (b) => ({ bound: b.v }));
    expect(t.apply({ a: [new Slice("x", 0), "z"], b: ["x", "z"] })).toEqual({
      bound: [new Slice("x", 0), "z"],
    });
    expect(t.apply({ a: ["x"], b: ["x", "z"] })).toEqual({ a: ["x"], b: ["x", "z"] });
  });

  it("compares deeply through arrays of hashes, still by slice text", () => {
    // Measured: repeated_binding_sequence_equal_slice_vs_string_arrays
    //   ="bound=[{i: \"x\"@0}]"  — offsets 0 and 2 on the two sides.
    const t = new Transform();
    t.rule({ a: subtree("v"), b: subtree("v") }, (b) => ({ bound: b.v }));
    expect(t.apply({ a: [{ i: new Slice("x", 0) }], b: [{ i: new Slice("x", 2) }] })).toEqual({
      bound: [{ i: new Slice("x", 0) }],
    });
  });

  it("dispatches to a constructed node's own equality, as Ruby's `==` does", () => {
    // Measured: two separately built Number.new("2") — `equal?` false, `==`
    // true — satisfy a repeated `simple(:v)` binding in Parslet. The engine
    // must ask the object, not compare identity. Review finding on PR #7.
    const t = new Transform();
    t.rule({ a: simple("v"), b: simple("v") }, () => "matched");
    // A class instance, not an object literal: a literal is a hash to the
    // engine and `simple` rightly rejects it — the first draft of this test
    // failed for exactly that reason. Model nodes are instances.
    class EqualsByValue {
      constructor(readonly value: string) {}
      equals(other: unknown): boolean {
        return other instanceof EqualsByValue && other.value === this.value;
      }
    }
    const left = new EqualsByValue("2");
    const right = new EqualsByValue("2");
    expect(Object.is(left, right)).toBe(false);
    expect(t.apply({ a: left as never, b: right as never })).toBe("matched");
    expect(t.apply({ a: left as never, b: new EqualsByValue("3") as never })).not.toBe("matched");
  });

  it("keeps Ruby's numeric equality, not Object.is", () => {
    // Ruby: NaN == NaN is false; -0.0 == 0.0 is true. `Object.is` inverts both.
    const t = new Transform();
    t.rule({ a: simple("v"), b: simple("v") }, () => "matched");
    expect(t.apply({ a: Number.NaN as never, b: Number.NaN as never })).not.toBe("matched");
    expect(t.apply({ a: -0 as never, b: 0 as never })).toBe("matched");
  });
});

describe("matcher shapes", () => {
  const only = (matcher: () => ReturnType<typeof simple>) => {
    const t = new Transform();
    t.rule({ k: matcher() }, (b) => ({ matched: b.v }));
    return t;
  };

  it("simple matches null", () => {
    // Measured: simple_matches_nil="matched nil"
    expect(only(() => simple("v")).apply({ k: null })).toEqual({ matched: null });
  });

  it("simple matches a constructed node, even one containing arrays", () => {
    // Measured: simple_matches_constructed_object="matched Object"
    //           simple_matches_node_containing_array="matched NodeWithArray"
    const bare = new ConstructedNode();
    const withArray = new ConstructedNode(["a", "b"]);
    expect(only(() => simple("v")).apply({ k: bare })).toEqual({ matched: bare });
    expect(only(() => simple("v")).apply({ k: withArray })).toEqual({ matched: withArray });
  });

  it("simple rejects arrays and hashes, even empty ones", () => {
    // Measured: simple_rejects_array, simple_rejects_empty_array,
    //           simple_rejects_hash, simple_rejects_empty_hash — all unchanged.
    const t = only(() => simple("v"));
    expect(t.apply({ k: ["a"] })).toEqual({ k: ["a"] });
    expect(t.apply({ k: [] })).toEqual({ k: [] });
    expect(t.apply({ k: { inner: "a" } })).toEqual({ k: { inner: "a" } });
    expect(t.apply({ k: {} })).toEqual({ k: {} });
  });

  it("sequence matches an EMPTY array", () => {
    // Measured: sequence_matches_empty_array="matched []"
    expect(only(() => sequence("v")).apply({ k: [] })).toEqual({ matched: [] });
  });

  it("sequence matches an array of leaves, including null and constructed nodes", () => {
    // Measured: sequence_matches_array_of_leaves="matched [\"a\", nil, \"b\"]"
    //           sequence_matches_array_containing_constructed_node
    const node = new ConstructedNode([1]);
    expect(only(() => sequence("v")).apply({ k: ["a", null, "b"] })).toEqual({
      matched: ["a", null, "b"],
    });
    expect(only(() => sequence("v")).apply({ k: ["a", node] })).toEqual({ matched: ["a", node] });
  });

  it("sequence rejects arrays containing arrays or hashes", () => {
    // Measured: sequence_rejects_array_containing_array,
    //           sequence_rejects_array_containing_hash — both unchanged.
    const t = only(() => sequence("v"));
    expect(t.apply({ k: ["a", ["b"]] })).toEqual({ k: ["a", ["b"]] });
    expect(t.apply({ k: ["a", { h: "1" }] })).toEqual({ k: ["a", { h: "1" }] });
  });

  it("sequence rejects non-arrays", () => {
    // Measured: sequence_rejects_non_array=[{k: "a"}, {k: nil}]  (unchanged)
    const t = only(() => sequence("v"));
    expect(t.apply({ k: "a" })).toEqual({ k: "a" });
    expect(t.apply({ k: null })).toEqual({ k: null });
  });

  it("subtree matches everything", () => {
    // Measured: subtree_matches_everything, subtree_matches_hash_value
    const t = only(() => subtree("v"));
    expect(t.apply({ k: null })).toEqual({ matched: null });
    expect(t.apply({ k: [] })).toEqual({ matched: [] });
    expect(t.apply({ k: [["deep"]] })).toEqual({ matched: [["deep"]] });
    expect(t.apply({ k: "a" })).toEqual({ matched: "a" });
    expect(t.apply({ k: { inner: "a", extra: "b" } })).toEqual({
      matched: { inner: "a", extra: "b" },
    });
  });
});
