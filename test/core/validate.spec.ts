/**
 * The shape validator (`assertMathNodeShape`): the runtime half of §5's
 * structural-dispatch contract. Positive direction: every constructed node —
 * one of each kind — and plain same-shape objects pass. Negative direction:
 * an unknown kind, a nameless abstract carrier, a non-string identity, and a
 * slot holding something no Ruby node could hold each raise `RenderError`
 * with the offending path in the message, never a raw `TypeError`.
 *
 * Negative direction also covers what the walk itself must survive: a cyclic
 * tree fails as `RenderError` naming the cycle's path (not a `RangeError`
 * stack overflow), a tree deeper than the walk's own stack and a property
 * read that throws are wrapped the same way, and an explicit `undefined`
 * entry inside a list or hash is rejected — while shared non-cyclic objects
 * stay accepted.
 *
 * Mutation-tested (PORTING-STANDARDS.md, "a suite that guards a guard"):
 * with the validator's body gutted to a no-op, the 29 rejection tests below
 * fail and the positive ones stay green; with the cycle detector's
 * ancestor-set never pruned, the shared-object positive test fails alone
 * (both runs 2026-08-07; re-measured 2026-08-10 after the engine-throw wrap
 * tests landed — each of those three was also seen red one wrap-removal
 * mutation at a time). A guard spec never seen red proves nothing.
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

describe("assertMathNodeShape, non-plain objects", () => {
  // A Date, Map, Set, RegExp, or arbitrary class instance often carries zero
  // enumerable own entries, so the plain-hash walk alone would wave it
  // through — but no Ruby ivar can hold one, and the contract is
  // RenderError-or-pass. Only a record whose prototype is `Object.prototype`
  // or `null` is a hash.
  class Widget {
    readonly size = 3;
  }

  it("rejects a class instance in a value slot, naming path and class", () => {
    const date = failure({ kind: "sqrt", parameterOne: new Date(0) });
    expect(date.message).toContain("node.parameterOne");
    expect(date.message).toContain("Date");
    const map = failure({ kind: "formula", value: [new Map()] });
    expect(map.message).toContain("node.value[0]");
    expect(map.message).toContain("Map");
    const widget = failure({ kind: "bar", parameterOne: new Widget() });
    expect(widget.message).toContain("node.parameterOne");
    expect(widget.message).toContain("Widget");
  });

  it("rejects boxed primitives everywhere, by the same prototype rule", () => {
    // `new String("2")` is typeof "object" with String.prototype behind it —
    // a class instance, not the primitive Ruby's ivar holds. In the kind and
    // identity slots the string typeof checks reject it first.
    const boxed = failure({ kind: "number", value: new String("2") });
    expect(boxed.message).toContain("node.value");
    expect(boxed.message).toContain("String");
    expect(failure({ kind: "sqrt", parameterOne: new Number(2) }).message).toContain("Number");
    expect(failure({ kind: "bar", parameterOne: new Boolean(true) }).message).toContain("Boolean");
    expect(failure({ kind: new String("sqrt") }).message).toContain("String");
    const identity = failure({ kind: "table", name: new String("Matrix") });
    expect(identity.message).toContain("node.name");
    expect(identity.message).toContain("String");
  });

  it("rejects a class instance inside an options hash", () => {
    const date = failure({ kind: "sqrt", options: { when: new Date(0) } });
    expect(date.message).toContain("node.options.when");
    expect(date.message).toContain("Date");
    const map = failure({ kind: "mpadded", options: { attr: new Map() } });
    expect(map.message).toContain("node.options.attr");
    expect(map.message).toContain("Map");
    const widget = failure({ kind: "table", options: { paren: new Widget() } });
    expect(widget.message).toContain("node.options.paren");
    expect(widget.message).toContain("Widget");
  });

  it("accepts a null-prototype record in an options slot", () => {
    // Key-value data with no class behaviour behind it is still a hash.
    const options: Record<string, unknown> = Object.create(null);
    options.mathvariant = "bold";
    expect(() => assertMathNodeShape({ kind: "sqrt", options }, FORMAT)).not.toThrow();
  });
});

describe("assertMathNodeShape, the walk itself", () => {
  // The contract is RenderError-or-pass — including when the INPUT defeats
  // the walk rather than any single check: a tree deeper than the call stack,
  // or an accessor that throws when read. The gem raises on the same inputs
  // (probe probe-sweep-depth.rb on the pinned oracle: a 10,000-deep sqrt
  // chain raises SystemStackError from `to_asciimath`, direct and through
  // the Formula boundary alike), so a raw RangeError escape here would be a
  // class-for-class parity break, not just an unpolished error.
  it("rejects a tree deeper than the walk's stack as RenderError, not RangeError", () => {
    let node: unknown = { kind: "number", value: "1" };
    for (let i = 0; i < 50_000; i += 1) node = { kind: "sqrt", parameterOne: node };
    const error = failure(node);
    expect(error.message).toContain("deep");
  });

  it("wraps a property read that itself throws into RenderError", () => {
    // No Ruby ivar read runs code, but a JS getter does — and its throw
    // would otherwise escape the walk raw, neither pass nor RenderError.
    const error = failure({
      kind: "sqrt",
      get parameterOne(): unknown {
        throw new Error("hostile accessor");
      },
    });
    expect(error.message).toContain("hostile accessor");
  });

  it("a thrown value whose stringification throws RangeError keeps the accessor branding and the read's path", () => {
    // Formerly the pinned misbranding: describing a thrown value was a bare
    // `String(error)` call, so this secondary RangeError reached the entry
    // point indistinguishable from genuine stack exhaustion and took the
    // too-deep RenderError (seen red exactly so). The description now falls
    // back to a fixed phrase at the read site — no secondary throw travels,
    // and the read's path survives into the message.
    const error = failure({
      kind: "sqrt",
      get parameterOne(): unknown {
        throw {
          toString(): string {
            throw new RangeError("secondary");
          },
        };
      },
    });
    expect(error.message).toContain("node.parameterOne");
    expect(error.message).toContain("a thrown value that cannot be described");
    expect(error.message).not.toContain("too deep");
  });

  it("a chain whose every description throws still wraps as RenderError at the read's path", () => {
    // Formerly the one raw escape: the getter's throw could not be
    // stringified, and neither could the value describing THAT failure — the
    // chain left the walk bare (seen red exactly so, caught === the thrown
    // value). With the fallback phrase there is no chain at all. Not through
    // `failure()`: its own diagnostic stringifies the caught value, which is
    // exactly what this input refuses.
    const selfThrowing = {
      toString(): string {
        throw selfThrowing;
      },
    };
    let caught: unknown;
    try {
      assertMathNodeShape(
        {
          kind: "sqrt",
          get parameterOne(): unknown {
            throw selfThrowing;
          },
        },
        FORMAT,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RenderError);
    expect((caught as RenderError).message).toContain("node.parameterOne");
    expect((caught as RenderError).message).toContain("a thrown value that cannot be described");
  });

  it("wraps an engine throw outside any wrapped read — Array.isArray on a revoked proxy", () => {
    // The reads are wrapped at their sites, but `Array.isArray` is an engine
    // operation, not a property read — on a revoked proxy it throws a raw
    // TypeError with no read-site wrap under it, and only the entry point's
    // catch-all keeps the RenderError-or-pass contract. `toAsciimath` calls
    // this validator OUTSIDE its own try/catch, so without the catch-all the
    // raw TypeError escapes the public render path. Seen red exactly so:
    // with the entry catch-all rethrowing raw, this input's TypeError left
    // `assertMathNodeShape` unwrapped.
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    const error = failure({ kind: "formula", value: [proxy] });
    expect(error.message).toContain("reading the tree itself threw");
    expect(error.message).toContain("node");
  });

  it("wraps a throwing ownKeys trap as the accessor failure at the hash's path", () => {
    // `Object.keys` on a hash slot runs the input's ownKeys trap — the one
    // wrapped read `readProperty` does not cover. Seen red with the
    // `readOwnKeys` wrap removed: the trap's Error escaped raw.
    const options = new Proxy(
      {},
      {
        ownKeys(): never {
          throw new Error("hostile ownKeys");
        },
      },
    );
    const error = failure({ kind: "sqrt", options });
    expect(error.message).toContain("node.options");
    expect(error.message).toContain("hostile ownKeys");
    expect(error.message).toContain("reading the tree itself threw");
  });

  it("wraps a throwing getPrototypeOf trap as the accessor failure at the hash's path", () => {
    // The plain-hash test reads the slot's prototype — a proxy trap the
    // `readPrototype` wrap covers. Seen red with that wrap removed: the
    // trap's Error escaped raw.
    const options = new Proxy(
      {},
      {
        getPrototypeOf(): never {
          throw new Error("hostile prototype");
        },
      },
    );
    const error = failure({ kind: "sqrt", options });
    expect(error.message).toContain("node.options");
    expect(error.message).toContain("hostile prototype");
    expect(error.message).toContain("reading the tree itself threw");
  });

  it("a getter's own RangeError surfaces as the accessor failure, not the too-deep rejection", () => {
    // `RangeError` is also what the engine throws on stack exhaustion, but
    // an input's getter can throw one deliberately. Only genuine overflow of
    // the walk's own recursion may take the too-deep branch; the input's own
    // throw keeps its message and the path of the read that raised it.
    const error = failure({
      kind: "sqrt",
      get parameterOne(): unknown {
        throw new RangeError("custom message");
      },
    });
    expect(error.message).toContain("custom message");
    expect(error.message).toContain("node.parameterOne");
    expect(error.message).not.toContain("too deep");
  });
});

describe("assertMathNodeShape, cycles", () => {
  it("rejects a formula that contains itself, naming the cycle path", () => {
    // The documented contract is RenderError-or-pass; a cyclic tree must not
    // escape as a RangeError stack overflow instead.
    const formula: { kind: string; value: unknown[] } = { kind: "formula", value: [] };
    formula.value.push(formula);
    const error = failure(formula);
    expect(error.message).toContain("node.value[0]");
    expect(error.message).toContain("cycle");
  });

  it("rejects a cycle through an options hash and through a bare list", () => {
    const options: Record<string, unknown> = {};
    options.self = options;
    const viaHash = failure({ kind: "sqrt", options });
    expect(viaHash.message).toContain("node.options.self");
    expect(viaHash.message).toContain("cycle");

    const list: unknown[] = [];
    list.push(list);
    const viaList = failure({ kind: "formula", value: list });
    expect(viaList.message).toContain("node.value[0]");
    expect(viaList.message).toContain("cycle");
  });

  it("accepts the same object appearing twice without a cycle", () => {
    // Ruby aliases nodes and arrays freely (PORTING-STANDARDS.md: rules
    // mutate shared arrays); a diamond renders fine — only an ancestor loop
    // cannot terminate. Seen red against a keep-everything visited set.
    const shared = { kind: "number", value: "1" };
    expect(() =>
      assertMathNodeShape({ kind: "frac", parameterOne: shared, parameterTwo: shared }, FORMAT),
    ).not.toThrow();
    const sharedList = [shared];
    expect(() =>
      assertMathNodeShape(
        {
          kind: "formula",
          value: [
            { kind: "mrow", value: sharedList },
            { kind: "mrow", value: sharedList },
          ],
        },
        FORMAT,
      ),
    ).not.toThrow();
  });
});

describe("assertMathNodeShape, explicit undefined entries", () => {
  // An absent ivar is Ruby's only undefined analogue, and that is a missing
  // field (legal, handled in `assertNode`) — a *present* entry holding
  // `undefined` inside a list or hash is not Ruby-representable, and
  // `normalize` already refuses the same shapes.
  it("rejects undefined inside a list", () => {
    const error = failure({ kind: "formula", value: [undefined] });
    expect(error.message).toContain("node.value[0]");
    expect(error.message).toContain("undefined");
  });

  it("rejects a sparse array's holes the same way — a lying length is holes", () => {
    // The index loop reads a hole back as `undefined` (the reason it is an
    // index loop and not `forEach`); an array whose `length` was stretched
    // past its entries is the same shape.
    const sparse: unknown[] = ["x"];
    sparse.length = 3;
    const error = failure({ kind: "formula", value: sparse });
    expect(error.message).toContain("node.value[1]");
    expect(error.message).toContain("undefined");
  });

  it("rejects undefined inside options and attributes hashes", () => {
    const viaOptions = failure({ kind: "sqrt", options: { mathvariant: undefined } });
    expect(viaOptions.message).toContain("node.options.mathvariant");
    expect(viaOptions.message).toContain("undefined");
    const viaAttributes = failure({ kind: "bar", attributes: { accent: undefined } });
    expect(viaAttributes.message).toContain("node.attributes.accent");
  });
});

describe("assertMathNodeShape, lying array lengths", () => {
  // `Array.isArray` sees through a proxy to its array target, but the
  // `length` the walk then reads comes from the proxy's own trap — and a
  // walk that trusts `Infinity` as its loop bound never terminates, a third
  // outcome the RenderError-or-pass contract does not have. A native array's
  // length is spec-clamped to a Uint32 (ECMA-262 ArraySetLength refuses
  // anything else with RangeError), so the bound check these tests pin is
  // unreachable for every genuine array: only a proxy or forged accessor can
  // report a length outside [0, 2**32 - 1] or a non-integer.
  //
  // Red-first evidence is split by termination. The terminating lies below
  // ran red pre-fix in this suite. The exact Infinity proxy CANNOT run red
  // in-suite — pre-fix it IS the hang — so its red half was demonstrated
  // out-of-tree: the same input against a scratch bundle of the pre-fix
  // walk, killed by timeout(1) at 5s (exit 124), with an instrumented
  // variant counting 100,000,000 index reads before being stopped.
  it("rejects the exact Infinity-lying proxy from the finding, promptly", () => {
    const proxy = new Proxy([], {
      get: (_target, key): unknown => (key === "length" ? Number.POSITIVE_INFINITY : null),
    });
    expect(Array.isArray(proxy)).toBe(true);
    const error = failure({ kind: "formula", value: proxy });
    expect(error.message).toContain("node.value.length");
    expect(error.message).toContain("Infinity");
  });

  it("rejects a huge finite length lie (2**40) before any index read", () => {
    // Pre-fix this terminated only by luck of the trap: the walk trusted the
    // bound, entered the loop, and rejected the first `undefined` element at
    // node.value[0] with indexReads = 1. The fix rejects the bound itself.
    let indexReads = 0;
    const proxy = new Proxy([], {
      get: (_target, key): unknown => {
        if (key === "length") return 2 ** 40;
        indexReads += 1;
        return undefined;
      },
    });
    const error = failure({ kind: "formula", value: proxy });
    expect(error.message).toContain("node.value.length");
    expect(error.message).toContain("1099511627776");
    expect(indexReads).toBe(0);
  });

  it("rejects lengths no native array can report: NaN, a float, a negative, a string", () => {
    // Pre-fix, every one of these PASSED validation: `0 < NaN` and `0 < -1`
    // are false (zero iterations), and the float and numeric-string bounds
    // walked a few null elements and returned — a lying proxy accepted as a
    // valid tree.
    const lies: ReadonlyArray<readonly [unknown, string]> = [
      [Number.NaN, "NaN"],
      [1.5, "1.5"],
      [-1, "-1"],
      ["3", '"3"'],
    ];
    for (const [lie, shown] of lies) {
      const proxy = new Proxy([], {
        get: (_target, key): unknown => (key === "length" ? lie : null),
      });
      const error = failure({ kind: "formula", value: proxy });
      expect(error.message, shown).toContain("node.value.length");
      expect(error.message, shown).toContain(shown);
    }
  });

  it("keeps a throwing length read as the accessor failure, not the length rejection", () => {
    // The read-site wrap runs before the bound check can look at the value:
    // a throwing `length` getter is the input's own failure and keeps its
    // message, exactly as before the bound check existed.
    const proxy = new Proxy([], {
      get: (_target, key): unknown => {
        if (key === "length") throw new Error("hostile length");
        return null;
      },
    });
    const error = failure({ kind: "formula", value: proxy });
    expect(error.message).toContain("node.value.length");
    expect(error.message).toContain("hostile length");
    expect(error.message).toContain("reading the tree itself threw");
  });

  it("never fires for a genuine array — the engine refuses illegitimate lengths first", () => {
    expect(() => assertMathNodeShape({ kind: "formula", value: [] }, FORMAT)).not.toThrow();
    const big = Array.from({ length: 10_000 }, () => ({ kind: "number", value: "1" }));
    expect(() => assertMathNodeShape({ kind: "formula", value: big }, FORMAT)).not.toThrow();
    // The unreachability claim, executable: a real array cannot even be
    // GIVEN a length outside the Uint32 range — ArraySetLength throws.
    expect(() => {
      const arr: unknown[] = [];
      arr.length = 2 ** 32; // one past 2**32 - 1
    }).toThrow(RangeError);
    expect(() => {
      const arr: unknown[] = [];
      arr.length = 1.5;
    }).toThrow(RangeError);
  });
});
