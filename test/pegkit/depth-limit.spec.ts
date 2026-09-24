/**
 * `MAX_DEPTH`'s own mechanism, tested directly and environment-independently.
 *
 * The adversarial gate (`test/adversarial/adversarial-inputs.spec.ts`) exercises
 * `MAX_DEPTH` only through real grammar recursion, and whether that recursion
 * reaches `MAX_DEPTH` before the engine's actual JS stack runs out is NOT
 * invariant: measured directly (2026-09-23) on this machine, a plain recursive
 * function reaches roughly 12,300–13,700 frames before `RangeError` under
 * vitest's default `forks` pool, on both Node 20.20.2 and 24.18.0 — comfortably
 * BELOW `MAX_DEPTH` (20,000), so the engine stack always exhausts first there —
 * but roughly 49,700–55,200 frames inside a `worker_threads` worker (`--pool
 * threads`), comfortably ABOVE it, so `MAX_DEPTH` can and does fire first for
 * some adversarial rows under that pool. The gate's own tests were rewritten to
 * stop asserting which guard wins that race (TODO.plan/deferred.md, "The
 * parser's depth bound never fires").
 *
 * That leaves `MAX_DEPTH`'s own correctness needing a test that does not
 * depend on any environment's actual stack size at all: this file forces
 * `ctx.depth` past the bound directly, through the same `dynamic()` atom the
 * adversarial gate already uses to inject synthetic errors, rather than by
 * constructing 20,000+ real nested atoms.
 */

import { describe, expect, it } from "vitest";
import { DEPTH_LIMIT_MESSAGE, dynamic, type ParseContext, str } from "../../src/pegkit/atom";

describe("MAX_DEPTH fires on its own count, independent of the real call stack", () => {
  it("throws the depth-limit failure the instant ctx.depth is pushed past the bound", () => {
    // `dynamic`'s builder receives the live `ParseContext` (the same object
    // `Atom#apply` reads `ctx.depth` from), so this mutates it directly rather
    // than recursing: `apply` increments `ctx.depth` by exactly one more before
    // calling `tryParse`, so seeding it far past any plausible bound and then
    // applying one cheap leaf atom (`str`, no recursion of its own) is enough
    // to cross MAX_DEPTH with only two real JS frames on top of this test —
    // nowhere near exhausting any engine's actual stack, on any machine.
    const forcesMaxDepth = dynamic((ctx: ParseContext) => {
      ctx.depth = 1_000_000;
      return str("x");
    });
    expect(() => forcesMaxDepth.parse("x")).toThrow(DEPTH_LIMIT_MESSAGE);
  });

  it("does not fire for ordinary, shallow parses", () => {
    // The seeding above is what trips the guard, not `dynamic` or `str`
    // themselves — the same shapes with `ctx.depth` left alone parse cleanly.
    const ordinary = dynamic((_ctx: ParseContext) => str("x"));
    expect(ordinary.parse("x")).toBeTruthy();
  });

  it("fires exactly at the boundary, one past MAX_DEPTH, not one short of it", () => {
    // `ctx.depth` starts at 0 and `Atom#parse` applies the root atom once
    // before this builder runs, so seeding it to exactly the guard's own
    // threshold and applying one more leaf atom lands the check's `+1` exactly
    // on the line `if (++ctx.depth > MAX_DEPTH)` — proving the comparison is
    // `>`, not `>=` or off by one, without importing the private constant:
    // the boundary is found by search, both directions, rather than assumed.
    let low = 0;
    let high = 2_000_000;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const probe = dynamic((ctx: ParseContext) => {
        ctx.depth = mid;
        return str("x");
      });
      let firedAtMid = false;
      try {
        probe.parse("x");
      } catch (error) {
        firedAtMid = (error as Error).message === DEPTH_LIMIT_MESSAGE;
      }
      if (firedAtMid) high = mid;
      else low = mid + 1;
    }
    // `low` is now the smallest seed at which the guard fires. One less must
    // parse cleanly (proving `low` really is the boundary, not a plateau).
    const atBoundary = dynamic((ctx: ParseContext) => {
      ctx.depth = low;
      return str("x");
    });
    expect(() => atBoundary.parse("x")).toThrow(DEPTH_LIMIT_MESSAGE);
    const oneBelow = dynamic((ctx: ParseContext) => {
      ctx.depth = low - 1;
      return str("x");
    });
    expect(oneBelow.parse("x")).toBeTruthy();
  });
});
