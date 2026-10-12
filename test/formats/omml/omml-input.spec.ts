/** biome-ignore-all lint/style/useNamingConvention: expected models carry the gem's
 * field names (`parameter_one`). */
/**
 * The OMML element layer's own rules (`src/formats/omml/omml-input.ts`), where
 * it reads OMML differently from the gem's lutaml mapping on purpose. Each
 * case here is one entry of `OMML_INPUT_DIFFERENCES`; parity with the gem on
 * ordinary OMML is `./model-parity.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import {
  OMML_INPUT_DIFFERENCES,
  OmmlParseError,
  parseOmmlDocument,
} from "../../../src/formats/omml/omml-input";
import { parseOmml } from "../../../src/formats/omml/parser";

const NS =
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function omath(body: string): string {
  return `<m:oMath ${NS}>${body}</m:oMath>`;
}

/** The parsed formula's top-level values, normalized. */
function values(text: string): unknown {
  return (normalize(parseOmml(text)) as unknown as { fields: { value: unknown } }).fields.value;
}

const TEXT_X = { class: "Math::Function::Text", fields: { lang: "omml", parameter_one: "x" } };

describe("the documented differences", () => {
  it("lists each one with a reason", () => {
    expect(OMML_INPUT_DIFFERENCES.length).toBe(5);
    for (const [what, why] of OMML_INPUT_DIFFERENCES) {
      expect(what.length).toBeGreaterThan(0);
      expect(why.length).toBeGreaterThan(0);
    }
  });

  it("reads text split by CDATA or a comment as one string", () => {
    const text = parseOmmlDocument(omath("<m:r><m:t>a<!--x-->b<![CDATA[c]]></m:t></m:r>"));
    expect(text.children[0]?.children[0]?.text).toBe("abc");
    expect(values(omath("<m:r><m:t>a<!--x-->b</m:t></m:r>"))).toStrictEqual([
      { class: "Math::Function::Text", fields: { lang: "omml", parameter_one: "ab" } },
    ]);
  });

  it("matches attributes by namespace", () => {
    const foreign = omath(
      '<m:r xmlns:x="urn:x"><m:rPr><m:sty x:val="b"/></m:rPr><m:t>x</m:t></m:r>',
    );
    expect(values(foreign)).toStrictEqual([TEXT_X]);
    const own = parseOmmlDocument(omath('<m:r><m:rPr><m:sty m:val="b"/></m:rPr></m:r>'));
    expect(own.children[0]?.children[0]?.children[0]?.attributes.get("m:val")).toBe("b");
  });

  it("drops run properties that style nothing", () => {
    expect(values(omath('<m:r><m:rPr><m:sty m:val="b"/></m:rPr></m:r>'))).toStrictEqual([]);
    // A line break is content: the style applies to it.
    expect(values(omath('<m:r><m:rPr><m:sty m:val="i"/></m:rPr><w:br/></m:r>'))).toStrictEqual([
      {
        class: "Math::Function::FontStyle::Italic",
        fields: {
          parameter_one: {
            class: "Math::Function::Linebreak",
            fields: { attributes: {}, parameter_one: null },
          },
          parameter_two: "italic",
        },
      },
    ]);
    // Word properties that give no font class leave the math one alone.
    expect(values(omath('<m:r><m:rPr><m:sty m:val="i"/></m:rPr><w:rPr/></m:r>'))).toStrictEqual([]);
    expect(values(omath('<m:r><m:t>x</m:t><m:rPr><m:sty m:val="b"/></m:rPr></m:r>'))).toStrictEqual(
      [TEXT_X],
    );
  });

  it("reads math and Word run properties in document order", () => {
    // The gem reads this as italic (the math properties first, by name).
    expect(
      values(
        omath('<m:r><w:rPr><w:b/></w:rPr><m:rPr><m:sty m:val="i"/></m:rPr><m:t>x</m:t></m:r>'),
      ),
    ).toStrictEqual([
      {
        class: "Math::Function::FontStyle::Bold",
        fields: { parameter_one: TEXT_X, parameter_two: "mathbf" },
      },
    ]);
  });
});

describe("elements read by namespace", () => {
  it("skips a math-namespace proofErr or sym, which the gem refuses", () => {
    expect(values(omath("<m:proofErr/><m:r><m:t>x</m:t></m:r>"))).toStrictEqual([TEXT_X]);
    expect(values(omath("<m:r><m:sym/><m:t>x</m:t></m:r>"))).toStrictEqual([TEXT_X]);
  });

  it("drops a lone font style but keeps a run with both property kinds and no text", () => {
    expect(
      values(omath('<m:r><m:rPr><m:sty m:val="i"/></m:rPr><w:rPr><w:b/></w:rPr></m:r>')),
    ).toStrictEqual([
      {
        class: "Math::Function::FontStyle::Italic",
        fields: { parameter_one: null, parameter_two: "italic" },
      },
    ]);
  });
});

describe("text cost", () => {
  it("stays linear on a long run of inner whitespace", () => {
    const text = `a${" ".repeat(200_000)}b`;
    const started = performance.now();
    parseOmml(omath(`<m:r><m:t>${text}</m:t></m:r>`));
    // The anchored-regex strip this replaced took over 5 s at 16 000 spaces.
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe("the element layer", () => {
  it("refuses a root other than oMathPara or oMath", () => {
    expect(() => parseOmmlDocument(`<m:r ${NS}><m:t>a</m:t></m:r>`)).toThrow(OmmlParseError);
    expect(() => parseOmml('<math xmlns="http://www.w3.org/1998/Math/MathML"/>')).toThrow(
      ParseError,
    );
  });

  it("names elements by namespace, whatever prefix the document uses", () => {
    const tree = parseOmmlDocument(
      '<o:oMath xmlns:o="http://schemas.openxmlformats.org/officeDocument/2006/math">' +
        '<o:r><o:t>x</o:t></o:r><q:r xmlns:q="urn:x"/></o:oMath>',
    );
    expect(tree.kind).toBe("m:oMath");
    expect(tree.children.map((item) => item.kind)).toStrictEqual(["m:r"]);
  });
});
