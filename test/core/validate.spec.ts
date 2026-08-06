/**
 * The shape validator (`assertMathNodeShape`): the runtime half of §5's
 * structural-dispatch contract. Positive direction: every constructed node —
 * one of each kind — and plain same-shape objects pass. Negative direction:
 * an unknown kind, a nameless abstract carrier, a non-string identity, and a
 * slot holding something no Ruby node could hold each raise `RenderError`
 * with the offending path in the message, never a raw `TypeError`.
 *
 * Mutation-tested (PORTING-STANDARDS.md, "a suite that guards a guard"):
 * with the validator's body gutted to a no-op, the 9 malformed-input tests
 * below fail and the positive ones stay green (run 2026-08-06). A guard spec
 * never seen red proves nothing.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { assertMathNodeShape } from "../../src/core/validate";
import { oneOfEachKind } from "./model-builder";

const FORMAT = "spec";

function failure(value: unknown): RenderError {
  try {
    assertMathNodeShape(value, FORMAT);
  } catch (error) {
    if (error instanceof RenderError) return error;
    throw new Error(`expected a RenderError, got ${String(error)}`);
  }
  throw new Error("expected assertMathNodeShape to throw, and it did not");
}

describe("assertMathNodeShape, positive direction", () => {
  it("accepts one constructed node of every kind", () => {
    const nodes = oneOfEachKind();
    expect(nodes.length).toBe(38);
    for (const [kind, node] of nodes) {
      expect(() => assertMathNodeShape(node, FORMAT), kind).not.toThrow();
    }
  });

  it("accepts a plain object with a known kind and valid shape", () => {
    expect(() =>
      assertMathNodeShape(
        {
          kind: "frac",
          parameterOne: { kind: "number", value: "1" },
          parameterTwo: { kind: "symbol", id: "Plus", value: null },
        },
        FORMAT,
      ),
    ).not.toThrow();
  });

  it("accepts missing optional slots and ignores extra keys", () => {
    // A missing field is Ruby's unassigned ivar; an extra key is what the
    // constructors themselves ignore.
    expect(() => assertMathNodeShape({ kind: "sqrt" }, FORMAT)).not.toThrow();
    expect(() => assertMathNodeShape({ kind: "sqrt", bogus: Symbol("x") }, FORMAT)).not.toThrow();
  });

  it("accepts nodes and plain values inside options hashes", () => {
    expect(() =>
      assertMathNodeShape(
        {
          kind: "table",
          value: [],
          openParen: { kind: "symbol", id: "Paren::Lround", value: null },
          options: { columnlines: "none", paren: { kind: "symbol", value: "(" } },
        },
        FORMAT,
      ),
    ).not.toThrow();
  });
});

describe("assertMathNodeShape, malformed inputs", () => {
  it("rejects non-objects and null", () => {
    for (const value of [null, undefined, 42, "frac", true, [{ kind: "frac" }]]) {
      const error = failure(value);
      expect(error.code).toBe("RENDER_ERROR");
      expect(error.format).toBe(FORMAT);
    }
  });

  it("rejects an unknown kind, naming it", () => {
    const error = failure({ kind: "fraction" });
    expect(error.message).toContain('"fraction"');
    expect(error.kind).toBe("fraction");
  });

  it("rejects a missing kind", () => {
    expect(failure({ value: [] }).code).toBe("RENDER_ERROR");
  });

  it("rejects an abstract carrier without its name (missing slot)", () => {
    for (const kind of ["unaryFunction", "binaryFunction", "ternaryFunction"]) {
      const error = failure({ kind });
      expect(error.message, kind).toContain('"name"');
      expect(error.message, kind).toContain("abstract");
      expect(error.kind, kind).toBe(kind);
    }
  });

  it("accepts a concrete carrier without its name", () => {
    // Formula, Symbol, Table, FontStyle exist as bare Ruby classes.
    for (const kind of ["formula", "symbol", "table", "fontStyle"]) {
      expect(() => assertMathNodeShape({ kind }, FORMAT), kind).not.toThrow();
    }
  });

  it("rejects a non-string identity slot (wrong slot type)", () => {
    const error = failure({ kind: "symbol", id: 42 });
    expect(error.message).toContain("node.id");
    const named = failure({ kind: "unaryFunction", name: ["Sin"] });
    expect(named.message).toContain("node.name");
  });

  it("rejects a slot holding what no Ruby node can hold (wrong slot type)", () => {
    const fn = failure({ kind: "sqrt", parameterOne: () => "x" });
    expect(fn.message).toContain("node.parameterOne");
    expect(fn.message).toContain("function");
    const sym = failure({ kind: "bar", parameterOne: Symbol("x") });
    expect(sym.message).toContain("symbol");
  });

  it("rejects a forged node kind anywhere in the tree, with its path", () => {
    const error = failure({
      kind: "formula",
      value: [{ kind: "frac", parameterOne: { kind: "nope" } }],
    });
    expect(error.message).toContain('"nope"');
    expect(error.message).toContain("node.value[0].parameterOne");
    expect(error.kind).toBe("nope");
  });

  it("rejects a forged node inside an options hash, as normalize would", () => {
    const error = failure({ kind: "mpadded", options: { attr: { kind: "bogus" } } });
    expect(error.message).toContain('"bogus"');
    expect(error.message).toContain("node.options.attr");
  });

  it("rejects malformed nested nodes reached through lists", () => {
    const error = failure({
      kind: "table",
      value: [{ kind: "unaryFunction" }],
    });
    expect(error.message).toContain("abstract");
  });
});
