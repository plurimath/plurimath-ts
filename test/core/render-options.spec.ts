/**
 * The options guard (`assertKnownOptions`): the runtime half of §5's
 * renderer-options convention. Positive direction: no options at all, an
 * explicit `undefined` or `null`, an empty object, and every key the format
 * accepts all pass. Negative direction: a key outside the accepted set is
 * refused BY NAME as `RenderError`, as the gem's explicit keywords refuse one
 * with `ArgumentError: unknown keyword: :nosuchoption`, and an options
 * argument that is not a keyword hash is refused rather than ToObject-coerced
 * into behaving as empty options.
 *
 * The per-entry-point half of this contract — that every landed renderer
 * actually calls the guard, and that a format added later cannot skip it —
 * is the `render-options` gate (test/gates/render-options.spec.ts).
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { assertKnownOptions } from "../../src/core/render-options";

const FORMAT = "spec";
const ACCEPTED = ["displayStyle", "unaryFunctionSpacing"];

function failure(options: unknown, accepted: readonly string[] = ACCEPTED): RenderError {
  try {
    assertKnownOptions(options, accepted, FORMAT);
  } catch (error) {
    if (error instanceof RenderError) return error;
    throw new Error(`expected a RenderError, got ${String(error)}`);
  }
  throw new Error("expected assertKnownOptions to throw, and it did not");
}

describe("what passes", () => {
  it("accepts undefined and null — the gem's keywords all have defaults", () => {
    expect(() => assertKnownOptions(undefined, ACCEPTED, FORMAT)).not.toThrow();
    expect(() => assertKnownOptions(null, ACCEPTED, FORMAT)).not.toThrow();
  });

  it("accepts an empty object, whatever the accepted set is", () => {
    expect(() => assertKnownOptions({}, ACCEPTED, FORMAT)).not.toThrow();
    expect(() => assertKnownOptions({}, [], FORMAT)).not.toThrow();
  });

  it("accepts every key the format declares, singly and together", () => {
    expect(() => assertKnownOptions({ displayStyle: false }, ACCEPTED, FORMAT)).not.toThrow();
    expect(() =>
      assertKnownOptions({ unaryFunctionSpacing: null }, ACCEPTED, FORMAT),
    ).not.toThrow();
    expect(() =>
      assertKnownOptions({ displayStyle: "true", unaryFunctionSpacing: true }, ACCEPTED, FORMAT),
    ).not.toThrow();
  });

  it("does not see inherited keys, as Object.hasOwn does not", () => {
    // Every renderer reads its options with `Object.hasOwn`, so a key only the
    // prototype carries is invisible to the render too. Refusing it here would
    // reject an object the renderer would then treat as empty.
    const inherited = Object.create({ nosuchoption: 1 }) as Record<string, unknown>;
    expect(() => assertKnownOptions(inherited, ACCEPTED, FORMAT)).not.toThrow();
  });

  it("does not see symbol-keyed entries — no Ruby hash can hold one", () => {
    // core/validate.ts takes the same stance for node slots, for the same
    // reason: nothing on the render path can read them.
    expect(() =>
      assertKnownOptions({ [Symbol("nosuchoption")]: 1 }, ACCEPTED, FORMAT),
    ).not.toThrow();
  });
});

describe("what is refused", () => {
  it("names the offending key, as the gem's ArgumentError does", () => {
    const error = failure({ nosuchoption: 1 });
    expect(error.message).toContain('"nosuchoption"');
    expect(error.code).toBe("RENDER_ERROR");
    expect(error.format).toBe(FORMAT);
  });

  it("refuses an unknown key even where every other key is accepted", () => {
    const error = failure({ displayStyle: false, nosuchoption: 1 });
    expect(error.message).toContain('"nosuchoption"');
    expect(error.message).not.toContain('unknown options "displayStyle"');
  });

  it("names every offending key, and switches to Ruby's plural form", () => {
    const error = failure({ alpha: 1, beta: 2 });
    expect(error.message).toContain('unknown options "alpha", "beta"');
  });

  it("says what the format would have accepted", () => {
    expect(failure({ nosuchoption: 1 }).message).toContain('"displayStyle"');
    expect(failure({ nosuchoption: 1 }, []).message).toContain("accepts no options");
  });

  it("refuses a present key whose value is undefined — Ruby refuses nil too", () => {
    // `to_asciimath(nosuchoption: nil)` raises the same ArgumentError as any
    // other value: the keyword was passed. An accepted-but-unimplemented key
    // whose explicit `undefined` reads as absent is the owning renderer's
    // accommodation, not this guard's.
    expect(failure({ nosuchoption: undefined }).message).toContain('"nosuchoption"');
  });

  it("refuses an options argument that is not a keyword hash", () => {
    for (const bad of ["oops", 5, true, 0, ""]) {
      expect(failure(bad).message).toContain("expected a plain options object");
    }
    expect(failure(["displayStyle"]).message).toContain("found an array");
  });

  it("refuses a string rather than reporting its indices as unknown options", () => {
    // `Object.keys("ab")` is ["0", "1"], so without the keyword-hash check
    // above the rejection would name "0" and "1" instead of the real mistake.
    const error = failure("ab");
    expect(error.message).toContain("found a string");
    expect(error.message).not.toContain('"0"');
  });

  it("wraps a throwing options object instead of letting the throw out raw", () => {
    // The guard runs ahead of the renderers' own try/catch, so it wraps its
    // own key read: the boundary contract is RenderError or pass.
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new TypeError("trap");
        },
      },
    );
    const error = failure(hostile);
    expect(error.message).toContain("reading the options object itself threw");
    expect(error.message).toContain("trap");
  });
});
