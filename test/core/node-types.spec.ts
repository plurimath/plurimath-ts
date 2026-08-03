/**
 * The node model's **type-level** contract (ARCHITECTURE.md §4 and §5).
 *
 * This file is a compile-time fixture: most of what it asserts is checked by
 * `tsc --noEmit`, not by vitest. It exists because the two promises §4 and §5
 * make pull in opposite directions, and a runtime test cannot see either of
 * them fail:
 *
 * - §5: dispatch is **structural** — a plain object with a known `kind` and a
 *   valid shape is a node, whatever produced it.
 * - §4: `node.equals(other)` is a **method**.
 *
 * When both lived on one type, adding `equals` to the classes silently made
 * every plain object stop being a `MathNode`:
 *
 * ```text
 * error TS2322: Type '{ kind: "number"; value: string; base: null; ... }'
 *   is not assignable to type 'MathNode'.
 *   Property 'equals' is missing in type '{ ... }' but required in 'NumberNode'.
 * ```
 *
 * The suite was green throughout, because nothing tested assignability. Hence
 * two types and this file: `MathNode` is the structural data union, and
 * `ConstructedMathNode` is the class union that carries the method.
 *
 * Every `@ts-expect-error` below is an assertion too — it fails the build if
 * the line it marks ever starts compiling.
 */

import { describe, expect, it } from "vitest";
import { equals } from "../../src/core/equality";
import {
  type ConstructedMathNode,
  FracNode,
  type MathNode,
  NODE_KINDS,
  type NodeKind,
  NumberNode,
  SymbolNode,
} from "../../src/core/nodes";
import { normalize } from "../../src/core/normalize";

/* -------------------------------------------------------------------------
 * Direction 1: a plain object is a `MathNode` (§5).
 * ---------------------------------------------------------------------- */

/** The exact shape whose rejection was the regression. */
const plainNumber: MathNode = {
  kind: "number",
  value: "2",
  base: null,
  miniSubSized: false,
  miniSupSized: false,
};

/**
 * A kind with fields Ruby's `initialize` may never assign. They are declared
 * `T | undefined` rather than `?:`, so the data shape spells them out — that
 * is the model's existing nil-versus-unassigned distinction (§5), not
 * something the type split introduced.
 */
const plainFrac: MathNode = {
  kind: "frac",
  hideFunctionName: undefined,
  options: undefined,
  parameterOne: plainNumber,
  parameterTwo: null,
};

/** An instance is a `MathNode` too: the class union is assignable to the data union. */
const constructedAsData: MathNode = new NumberNode({ value: "2" });

/* -------------------------------------------------------------------------
 * Direction 2: `equals` is a method on a constructed node (§4).
 * ---------------------------------------------------------------------- */

const frac = new FracNode({ parameterOne: new SymbolNode({ value: "a" }) });
const fracEqualsTypechecks: boolean = frac.equals(plainFrac);
const constructed: ConstructedMathNode = frac;
const unionEqualsTypechecks: boolean = constructed.equals(constructed);

/* -------------------------------------------------------------------------
 * The two types are genuinely different, in the direction that matters.
 * ---------------------------------------------------------------------- */

// @ts-expect-error — a plain object is not a *constructed* node: it has no
// `equals`. This is the Ruby behaviour the split mirrors — a same-shape Hash
// does not respond to `==` (verified against the gem).
const plainIsNotConstructed: ConstructedMathNode = {
  kind: "number",
  value: "2",
  base: null,
  miniSubSized: false,
  miniSupSized: false,
};

// @ts-expect-error — and the method is not reachable through the data union.
const noMethodOnData = (node: MathNode): boolean => node.equals(node);

/* -------------------------------------------------------------------------
 * A wrong shape still fails, so the split did not buy assignability by
 * loosening the union into "any object".
 * ---------------------------------------------------------------------- */

// @ts-expect-error — `kind` is not a member of the closed union (§5: no
// `kind: string` escape hatch, no runtime-registered kinds).
const unknownKind: MathNode = { kind: "unitsml", text: "kg" };

// @ts-expect-error — right kind, missing `Number`'s other three fields.
const missingFields: MathNode = { kind: "number", value: "2" };

// Right kind and field set, wrong type in a field. (The directive sits on the
// offending property, which is where the compiler reports it.)
const wrongFieldType: MathNode = {
  kind: "number",
  // @ts-expect-error — `Number#value` is `string | null`.
  value: 2,
  base: null,
  miniSubSized: false,
  miniSupSized: false,
};

// A field belonging to another kind is excess, so a `table`-shaped object
// cannot pass as a `number`.
const foreignField: MathNode = {
  kind: "number",
  value: "2",
  base: null,
  miniSubSized: false,
  miniSupSized: false,
  // @ts-expect-error — `openParen` belongs to `table`, not `number`.
  openParen: null,
};

/* -------------------------------------------------------------------------
 * The union is still discriminated, and still exhaustive.
 * ---------------------------------------------------------------------- */

function assertNever(value: never): never {
  throw new Error(`unhandled node kind: ${JSON.stringify(value)}`);
}

/**
 * Compiles only while every kind is handled. Add a member to the union
 * without adding a `case` and this stops building — the guard §5 relies on.
 */
function everyKindNarrows(node: MathNode): string {
  switch (node.kind) {
    // Narrowing proper: each of these reads a field only that kind has.
    case "number":
      return node.value ?? "";
    case "symbol":
      return node.id;
    case "table":
      return `${node.name ?? "Table"}/${String(node.openParen)}`;
    case "formula":
      return `formula(${node.value?.length ?? 0})`;
    case "abs":
    case "bar":
    case "base":
    case "binaryFunction":
    case "ceil":
    case "color":
    case "ddot":
    case "dot":
    case "fenced":
    case "floor":
    case "fontStyle":
    case "frac":
    case "hat":
    case "int":
    case "linebreak":
    case "mpadded":
    case "mrow":
    case "nary":
    case "norm":
    case "obrace":
    case "oint":
    case "overleftrightarrow":
    case "overset":
    case "prod":
    case "sqrt":
    case "sum":
    case "ternaryFunction":
    case "text":
    case "tilde":
    case "ubrace":
    case "ul":
    case "unaryFunction":
    case "underset":
    case "vec":
      return node.kind;
    default:
      return assertNever(node);
  }
}

/** The other half of the same guard: an unhandled kind is a compile error. */
function incompleteSwitch(node: MathNode): string {
  switch (node.kind) {
    case "number":
      return "number";
    default:
      // @ts-expect-error — 37 kinds remain, so `node` is not `never` here.
      return assertNever(node);
  }
}

// The discriminant really discriminates: `openParen` belongs to `table`, and a
// node narrowed to `number` does not have it.
const narrowingIsReal = (node: MathNode): unknown =>
  // @ts-expect-error — narrowed to `number`, which has no `openParen`.
  node.kind === "number" ? node.openParen : undefined;

/* -------------------------------------------------------------------------
 * What the two types are for: the structural surface takes either.
 * ---------------------------------------------------------------------- */

const equalsTakesPlainObjects: boolean = equals(plainNumber, constructedAsData);
const normalizeTakesPlainObjects: string = normalize(plainNumber).class;

/**
 * Runtime cover for the same claims, so the fixture is not purely declarative
 * and the plain objects above are actually exercised.
 */
describe("the structural node type", () => {
  it("compares a plain object against a constructed node, both ways", () => {
    expect(equalsTakesPlainObjects).toBe(true);
    expect(equals(constructedAsData, plainNumber)).toBe(true);
    expect(normalizeTakesPlainObjects).toBe("Math::Number");
  });

  it("reaches the same projection through the method", () => {
    expect(fracEqualsTypechecks).toBe(false);
    expect(unionEqualsTypechecks).toBe(true);
    expect(frac.equals(frac)).toBe(equals(frac, frac));
  });

  it("keeps the plain objects the type checker accepted usable at runtime", () => {
    expect(everyKindNarrows(plainNumber)).toBe("2");
    expect(everyKindNarrows(plainFrac)).toBe("frac");
    expect(incompleteSwitch(plainNumber)).toBe("number");
    expect(narrowingIsReal(plainNumber)).toBeUndefined();
    // The rejected shapes are still real objects; only their *types* are wrong.
    expect(plainIsNotConstructed.kind).toBe("number");
    expect(unknownKind.kind).toBe("unitsml");
    expect(missingFields.kind).toBe("number");
    expect(wrongFieldType.kind).toBe("number");
    expect(foreignField.kind).toBe("number");
    expect(noMethodOnData).toBeTypeOf("function");
  });

  it("reaches a case for every kind the union declares, never `assertNever`", () => {
    // The compile-time half is `everyKindNarrows` building at all. This is the
    // runtime half: no declared kind falls through to the exhaustiveness guard.
    for (const kind of NODE_KINDS as readonly NodeKind[]) {
      expect(
        () => everyKindNarrows({ ...plainFrac, kind } as unknown as MathNode),
        kind,
      ).not.toThrow();
    }
    expect(() => everyKindNarrows({ kind: "unitsml" } as unknown as MathNode)).toThrow(
      /unhandled node kind/,
    );
  });
});
