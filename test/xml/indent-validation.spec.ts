import { describe, expect, it } from "vitest";
import { dump, XmlElement } from "../../src/xml/index";

function sampleTree(): XmlElement {
  return new XmlElement("math").append(new XmlElement("mi").append("x"));
}

describe("dump indent validation", () => {
  it("rejects non-integer numbers", () => {
    expect(() => dump(sampleTree(), { indent: 2.5 })).toThrowError(/indent/i);
    expect(() => dump(sampleTree(), { indent: -2.5 })).toThrowError(/indent/i);
  });

  it("rejects non-finite numbers", () => {
    expect(() => dump(sampleTree(), { indent: Number.NaN })).toThrowError(/indent/i);
    expect(() => dump(sampleTree(), { indent: Number.POSITIVE_INFINITY })).toThrowError(/indent/i);
    expect(() => dump(sampleTree(), { indent: Number.NEGATIVE_INFINITY })).toThrowError(/indent/i);
  });

  it("still accepts integer values, including compact negative ones", () => {
    expect(dump(sampleTree(), { indent: 2 })).toBe("\n<math>\n  <mi>x</mi>\n</math>\n");
    expect(dump(sampleTree(), { indent: -1 })).toBe("<math><mi>x</mi></math>");
  });
});
