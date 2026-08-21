/**
 * The two capacity boundaries, pinned against the oracle.
 *
 * Neither was covered before, and they diverged in opposite directions: the
 * port serialized trees *deeper* than Ox will emit, and *failed* on trees
 * wider than the gem renders fine. Both were measured on both sides against
 * the pinned oracle (plurimath 0.11.6 @ 00c52783, Ox 2.14.28) before being
 * fixed here.
 *
 * Depth — `chain(n)` is a root with n nested descendants:
 *
 *     oracle  indent=2   last-ok n=1000   first-fail n=1001
 *     oracle  indent=-1  last-ok n=1000   first-fail n=1001
 *     port    (before)   last-ok n=4999   first-fail n=5000  (indent=2)
 *     port    (before)   last-ok n=6953   first-fail n=6954  (indent=-1)
 *
 * The oracle's boundary does not move with indent, because it is the compiled
 * constant `MAX_DEPTH` (ox-2.14.28/ext/ox/dump.c:17, raising at :582-583) and
 * not stack exhaustion. The port's did move, which is why it is now an
 * explicit limit rather than whatever the stack happens to allow.
 *
 * Width — a flat list of children:
 *
 *     oracle  200,000 children  OK, 3,400,140 chars
 *     port    (before)          RangeError past ~125k, threshold stack-dependent
 *
 * No width boundary is pinned as a number on purpose: the old one moved with
 * render depth, so there was never a safe figure to assert. What is pinned is
 * that a width the oracle handles no longer throws here.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { FormulaNode, SqrtNode, SymbolNode } from "../../src/core/nodes";
import { toMathml } from "../../src/formats/mathml/renderer";
import { dump, XmlDepthLimitError, XmlElement } from "../../src/xml/index";

/** A root with `levels` nested descendants and a text leaf innermost. */
function chain(levels: number): XmlElement {
  let element = new XmlElement("d").append("leaf");
  for (let i = 0; i < levels; i++) element = new XmlElement("d").append(element);
  return element;
}

/** The same, but with NOTHING inside the deepest element. */
function bareChain(levels: number): XmlElement {
  let element = new XmlElement("d");
  for (let i = 0; i < levels; i++) element = new XmlElement("d").append(element);
  return element;
}

describe("serialization depth", () => {
  it("allows one more level when the deepest element is childless, as Ox does", () => {
    // Ox tests the depth inside `dump_gen_nodes`, guarded by `if (0 < cnt)`
    // (`dump.c:1104`), so an element with no child nodes is emitted however deep
    // it sits. Measured on the pinned oracle, a chain of bare `<a/>`:
    //
    //                     root+1000   root+1001   root+1002
    //   childless deepest    ok          ok        SystemStackError
    //   text leaf innermost  ok       SystemStackError   SystemStackError
    //
    // This port checked the depth on ENTRY to every element, so it refused
    // root+1001 in both rows — one level stricter than the oracle. The tests
    // below never caught it because `chain` always puts a text leaf innermost,
    // which is the row where the two agree.
    for (const indent of [2, -1]) {
      expect(() => dump(bareChain(1001), { indent })).not.toThrow();
      expect(() => dump(bareChain(1002), { indent })).toThrow(XmlDepthLimitError);
      // and the text-leaf row is unchanged
      expect(() => dump(chain(1000), { indent })).not.toThrow();
      expect(() => dump(chain(1001), { indent })).toThrow(XmlDepthLimitError);
    }
  });

  for (const indent of [2, -1]) {
    describe(`indent ${indent}`, () => {
      it("serializes a root plus 1000 descendants, as Ox does", () => {
        expect(() => dump(chain(1000), { indent })).not.toThrow();
      });

      it("refuses the 1001st level, where Ox raises", () => {
        expect(() => dump(chain(1001), { indent })).toThrow(XmlDepthLimitError);
      });
    });
  }

  it("puts the boundary in the same place regardless of indent", () => {
    // The property that proves this models Ox's constant rather than a stack:
    // an output-size-dependent limit would move between these two.
    expect(() => dump(chain(1000), { indent: 2 })).not.toThrow();
    expect(() => dump(chain(1000), { indent: -1 })).not.toThrow();
    expect(() => dump(chain(1001), { indent: 2 })).toThrow(XmlDepthLimitError);
    expect(() => dump(chain(1001), { indent: -1 })).toThrow(XmlDepthLimitError);
  });

  it("no longer emits documents the gem cannot produce", () => {
    // The old divergence window: the port emitted at 1200 and 2000 levels,
    // depths at which the gem raises SystemStackError.
    for (const levels of [1200, 2000]) {
      expect(() => dump(chain(levels))).toThrow(XmlDepthLimitError);
    }
  });

  it("names the limit in the error it throws", () => {
    expect(() => dump(chain(1001))).toThrow(/maximum depth exceeded/);
    try {
      dump(chain(1001));
      expect.unreachable("expected a depth error");
    } catch (error) {
      expect(error).toBeInstanceOf(XmlDepthLimitError);
      expect((error as XmlDepthLimitError).limit).toBe(1000);
    }
  });
});

describe("reaching the depth limit through the renderer", () => {
  // Kept beside the boundary it is about rather than in the renderer suite:
  // what is proven here is that the limit is real at the delivery path, and
  // that a layer-1 error the `xml` module raises arrives as the `RenderError`
  // the §5 contract promises. `xml` cannot import `RenderError` (layer 1
  // imports nothing internal), so the conversion is the renderer's catch.
  //
  // Note the limit is NOT reachable from parsed input: the AsciiMath parser
  // refuses a 1200-deep source first, with "Input is nested too deeply to
  // parse". A model built directly is the path that reaches it.

  function deepSqrt(depth: number): FormulaNode {
    let node: unknown = new SymbolNode({ id: "Symbol", value: "x" } as never);
    for (let i = 0; i < depth; i++) node = new SqrtNode({ parameterOne: node } as never);
    return new FormulaNode({ value: [node] } as never);
  }

  it("renders a tree inside the limit", () => {
    expect(toMathml(deepSqrt(500) as never).length).toBeGreaterThan(0);
  });

  it("surfaces the depth limit as RenderError, not as a raw throw", () => {
    // Before the fix this emitted 2,910,133 characters at a depth where the
    // gem raises SystemStackError (measured: gem to_mathml last-ok at
    // sqrt-depth 997, first-fail at 998).
    expect(() => toMathml(deepSqrt(1200) as never)).toThrow(RenderError);
    expect(() => toMathml(deepSqrt(1200) as never)).toThrow(/maximum depth exceeded/);
  });
});

describe("append width", () => {
  it("attaches a child list far wider than the old spread allowed", () => {
    // 200,000 threw RangeError before; the oracle emits 3,400,140 chars for
    // the same shape.
    const children = Array.from({ length: 200_000 }, (_, i) =>
      new XmlElement("mn").append(String(i)),
    );
    const root = new XmlElement("mrow").append(children);
    expect(root.children.length).toBe(200_000);
  });

  it("keeps document order and the gem's nil-skipping through a wide list", () => {
    const items = [new XmlElement("a"), null, "text", undefined, new XmlElement("b")];
    const root = new XmlElement("mrow").append(items);
    expect(root.children.length).toBe(3);
    expect((root.children[0] as XmlElement).name).toBe("a");
    expect(root.children[1]).toBe("text");
    expect((root.children[2] as XmlElement).name).toBe("b");
  });

  it("still flattens nested arrays at any nesting level", () => {
    const root = new XmlElement("mrow").append([
      new XmlElement("a"),
      [new XmlElement("b"), [new XmlElement("c")]],
    ]);
    expect(root.children.map((child) => (child as XmlElement).name)).toEqual(["a", "b", "c"]);
  });
});
