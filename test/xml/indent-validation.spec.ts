/**
 * `dump`'s indent contract, measured against Ox.
 *
 * `NaN` is a legal `number` and every comparison against it is false, so
 * `indent >= 0` was false and the serializer silently took its compact branch
 * — returning a document with no indentation rather than refusing. Ox raises
 * `Ox::ParseError: :indent must be a Fixnum.` for that and every other
 * non-integer: measured on the pinned oracle for `2.5`, `-2.5`, `2.0`, `"2"`,
 * `true`, `false`, `NaN`, `Infinity` and `-Infinity`.
 *
 * One case cannot be matched. Ox rejects Float `2.0`; JavaScript has no
 * Float/Integer distinction, so `2.0 === 2` and this port accepts it. That is
 * a representational limit rather than a decision, and it is why the accepted
 * cases below cannot simply mirror Ox's table.
 *
 * Assertions are on the error CLASS, not its message. `XmlIndentError` is
 * exported and carries the value it refused, and matching message text would
 * both break on a reword and pass for the wrong reason — a `TypeError` whose
 * message happened to contain "indent" would satisfy it.
 */

import { describe, expect, it } from "vitest";
import { dump, XmlElement, XmlIndentError } from "../../src/xml/index";

function sampleTree(): XmlElement {
  return new XmlElement("math").append(new XmlElement("mi").append("x"));
}

/** Asserts the class, and that the error reports the value it refused. */
function expectRefused(indent: number): void {
  expect(() => dump(sampleTree(), { indent })).toThrow(XmlIndentError);
  try {
    dump(sampleTree(), { indent });
    expect.unreachable(`expected indent ${String(indent)} to be refused`);
  } catch (error) {
    expect(error).toBeInstanceOf(XmlIndentError);
    // `Object.is` rather than `toBe`, so NaN compares equal to itself here.
    expect(Object.is((error as XmlIndentError).indent, indent)).toBe(true);
  }
}

describe("dump indent validation", () => {
  it("rejects non-integer numbers", () => {
    expectRefused(2.5);
    expectRefused(-2.5);
  });

  it("rejects non-finite numbers", () => {
    expectRefused(Number.NaN);
    expectRefused(Number.POSITIVE_INFINITY);
    expectRefused(Number.NEGATIVE_INFINITY);
  });

  it("still accepts integer values, including compact negative ones", () => {
    // Both byte strings are Ox's, measured: indent 2 opens with a newline and
    // indents by depth; any negative indent emits no newlines at all.
    expect(dump(sampleTree(), { indent: 2 })).toBe("\n<math>\n  <mi>x</mi>\n</math>\n");
    expect(dump(sampleTree(), { indent: -1 })).toBe("<math><mi>x</mi></math>");
  });

  it("falls back to Ox's default when indent is omitted or null", () => {
    // The gem's `indent: nil` path: Ox falls back to its default options,
    // whose indent stays 2 after plurimath's own configuration.
    const withDefault = dump(sampleTree());
    expect(withDefault).toBe(dump(sampleTree(), { indent: 2 }));
    expect(dump(sampleTree(), { indent: null })).toBe(withDefault);
  });
});
