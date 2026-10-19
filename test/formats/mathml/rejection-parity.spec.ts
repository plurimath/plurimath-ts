import { describe, expect, it } from "vitest";
import { ParseError } from "../../../src/core/index";
import { parseMathml } from "../../../src/formats/mathml/parser";
import { loadPinnedCorpus } from "../../core/corpus-pin";
import { casesInInputFormat } from "../../core/model-builder";

const rejections = casesInInputFormat(loadPinnedCorpus().rejections, "mathml");

describe("shared MathML rejections", () => {
  it("includes recognized but untranslated elements", () => {
    expect(rejections.filter((entry) => entry.id.startsWith("mathml-unsupported-"))).toHaveLength(
      2,
    );
  });
  it.each(rejections)("rejects $id", (entry) => {
    expect(() => parseMathml(entry.input)).toThrow(ParseError);
  });
});
