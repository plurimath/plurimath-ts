import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { parseOmml } from "../../../src/formats/omml/index";
import { parseOmmlDocument } from "../../../src/formats/omml/omml-input";
import { OmmlTranslateError, translateOmml } from "../../../src/formats/omml/translator";

const namespace = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const argument = (text: string) => `<m:e><m:r><m:t>${text}</m:t></m:r></m:e>`;
const subscript = "<m:sub><m:r><m:t>c</m:t></m:r></m:sub>";
const expression = (argumentsXml: string) =>
  `<m:oMath ${namespace}><m:sSub>${argumentsXml}${subscript}</m:sSub></m:oMath>`;

describe("OMML subscript arguments", () => {
  it("accepts one base argument", () => {
    expect(normalize(parseOmml(expression(argument("a"))))).toBeDefined();
  });

  it("rejects two base arguments during translation, as Ruby 0.11.12 does", () => {
    const input = expression(argument("a") + argument("b"));
    const tree = parseOmmlDocument(input);
    expect(() => translateOmml(tree, input)).toThrow(OmmlTranslateError);
  });

  it("rejects two subscript arguments during translation, as Ruby 0.11.12 does", () => {
    const input = expression(argument("a") + subscript);
    const tree = parseOmmlDocument(input);
    expect(() => translateOmml(tree, input)).toThrow(OmmlTranslateError);
  });
});
