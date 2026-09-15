/**
 * `newNary`'s explicit-`null`-vs-omitted `options` distinction
 * (`src/formats/unicodemath/transform.ts:704`-`728`).
 *
 * A Codex review of PR #116 found `options ?? {}` collapsing an explicit
 * `null` into `{}`, the same way an omitted argument does — but
 * `Math::Function::Nary.new(p1, p2, p3, p4, nil)` (measured on the oracle)
 * stores `@options = nil`, a third state distinct from both "omitted" (`{}`,
 * the Ruby default) and an explicit `{}` (also `{}`, but because it was
 * passed).
 *
 * No rule in this slice's own grammar ever passes an explicit `null` for
 * this argument — every caller either omits `options` or builds one from a
 * bound `mask` capture — so this is currently LATENT: nothing in the fixture
 * corpus reaches it. `newNary` is exported for exactly this test, the same
 * rationale `matrix-transform.spec.ts` gives for driving otherwise-
 * unreachable transform code directly rather than through a parse.
 */

import { describe, expect, it } from "vitest";
import { NaryNode } from "../../../src/core/nodes";
import { newNary } from "../../../src/formats/unicodemath/transform";

describe("newNary: options distinction", () => {
  it("defaults an omitted options argument to {}", () => {
    const draft = newNary("a", "b", "c", "d");
    expect(draft.fields.options).toStrictEqual({});
  });

  it("keeps an explicit {} as {}", () => {
    const draft = newNary("a", "b", "c", "d", {});
    expect(draft.fields.options).toStrictEqual({});
  });

  it("passes an explicit null through unchanged, distinct from omitted", () => {
    const draft = newNary("a", "b", "c", "d", null);
    expect(draft.fields.options).toBeNull();
  });

  it("passes a non-empty options object through unchanged", () => {
    const draft = newNary("a", "b", "c", "d", { mask: true });
    expect(draft.fields.options).toStrictEqual({ mask: true });
  });

  // The downstream consumer: `NaryNode`'s constructor runs `draft.fields`
  // through `assignedOptions`, which is what actually has to survive an
  // explicit `null` without silently spreading it back into `{}`
  // (`{ ...null }` is `{}` in JavaScript) and without `copyOptions`-style
  // classes throwing on `Object.keys(null)`.
  it("an explicit null options reaches NaryNode as null, not {}, and does not throw", () => {
    const draft = newNary("a", "b", "c", "d", null);
    expect(() => new NaryNode(draft.fields)).not.toThrow();
    const node = new NaryNode(draft.fields);
    expect(node.options).toBeNull();
  });
});
