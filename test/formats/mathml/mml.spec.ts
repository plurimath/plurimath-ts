/**
 * The MathML element layer's own rules (`src/formats/mathml/mml.ts`), where it
 * reads MathML differently from the gem's lutaml mapping on purpose. Each case
 * here is one entry of `MATHML_INPUT_DIFFERENCES`; parity with the gem on
 * ordinary MathML is `./model-parity.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import {
  MATHML_INPUT_DIFFERENCES,
  type MmlNode,
  MmlParseError,
  parseMml,
} from "../../../src/formats/mathml/mml";
import { parseMathml } from "../../../src/formats/mathml/parser";
import { ANNOTATION_XML_TO_S } from "../../../src/formats/mathml/translator";

const NS = 'xmlns="http://www.w3.org/1998/Math/MathML"';

function first(text: string): MmlNode {
  const child = parseMml(text).children[0];
  if (child === undefined || typeof child === "string") throw new Error("no element child");
  return child;
}

describe("the documented differences", () => {
  it("lists each one with a reason", () => {
    expect(MATHML_INPUT_DIFFERENCES.length).toBe(7);
    for (const [what, why] of MATHML_INPUT_DIFFERENCES) {
      expect(what.length).toBeGreaterThan(0);
      expect(why.length).toBeGreaterThan(0);
    }
  });

  it("refuses a root other than math", () => {
    expect(() => parseMml(`<foo ${NS}><mi>a</mi></foo>`)).toThrow(MmlParseError);
    expect(() => parseMathml(`<foo ${NS}><mi>a</mi></foo>`)).toThrow(ParseError);
  });

  it("skips an element in a non-MathML namespace, and reads a document without one", () => {
    expect(parseMml(`<math ${NS}><mi xmlns="urn:x">a</mi></math>`).children).toStrictEqual([]);
    expect(first("<math><mi>a</mi></math>").kind).toBe("Mi");
  });

  it("keeps children and text wherever they appear", () => {
    const mn = first(`<math ${NS}><mn>1<mi>z</mi>2</mn></math>`);
    expect(mn.value).toStrictEqual(["1", "2"]);
    expect(mn.children.map((c) => (typeof c === "string" ? c : c.kind))).toStrictEqual([
      "1",
      "Mi",
      "2",
    ]);
  });

  it("skips prefixed attributes", () => {
    const mi = first(
      `<math ${NS}><mi mathvariant="normal" xmlns:e="urn:e" e:mathvariant="bold">x</mi></math>`,
    );
    expect([...mi.attributes]).toStrictEqual([["mathvariant", "normal"]]);
  });

  it("reads CDATA as text", () => {
    expect(first(`<math ${NS}><mi><![CDATA[x]]></mi></math>`).value).toStrictEqual(["x"]);
  });

  it("reads index and length only as plain decimal integers", () => {
    const glyph = (index: string) => first(`<math ${NS}><mglyph index="${index}"/></math>`);
    expect(glyph(" 4 ").attributes.get("index")).toBe(4);
    expect(glyph("010").attributes.get("index")).toBe(10);
    expect(glyph("1.5").attributes.has("index")).toBe(false);
    expect(glyph("1e2").attributes.has("index")).toBe(false);
  });

  it("keeps a token's value as a list of its text nodes", () => {
    expect(first(`<math ${NS}><annotation>q</annotation></math>`).value).toStrictEqual(["q"]);
  });
});

describe("annotation-xml inside semantics", () => {
  it("records the gem's to_s text without the object address", () => {
    const model = normalize(
      parseMathml(
        `<math ${NS}><semantics><mi>x</mi><annotation-xml><ci>x</ci></annotation-xml></semantics></math>`,
      ),
    );
    expect(JSON.stringify(model)).toContain(JSON.stringify(ANNOTATION_XML_TO_S));
  });
});
