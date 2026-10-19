import { describe, expect, it } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toHtml } from "../../../src/formats/html/renderer";
import { unitsmlXmlForEmbedding } from "../../../src/formats/mathml/render-shared";
import { toMathml } from "../../../src/formats/mathml/renderer";
import { unitsmlXml } from "../../../src/unitsml/index";
import { readXml } from "../../../src/xml/index";

describe("UnitsML raw-Ox XML embedding", () => {
  // Measured through the locked Ruby Unitsml#to_xml and public Plurimath
  // renderers: standalone XML keeps the entity; embedded raw Ox decodes it.
  it.each(["uF", "uH"])("decodes both HTML symbol fields for %s only when embedded", (unit) => {
    const model = parseAsciimath(`"unitsml(${unit})"`);
    const suffix = unit.slice(1);
    const standalone = unitsmlXml(unit);
    expect(standalone).toContain(`<UnitSymbol type="HTML">&micro;${suffix}</UnitSymbol>`);
    expect(standalone).toContain('<PrefixSymbol type="HTML">&micro;</PrefixSymbol>');
    expect(toHtml(model)).toBe(`&#xb5;${suffix}`);
    const embedded = toMathml(model, { unitsml: { xml: true } });
    expect(embedded).toContain(`<UnitSymbol type="HTML">µ${suffix}</UnitSymbol>`);
    expect(embedded).toContain('<PrefixSymbol type="HTML">µ</PrefixSymbol>');
    expect(embedded).not.toContain("&micro;");
  });
  it("keeps encoded references single-pass in text and attributes", () => {
    const xml = unitsmlXmlForEmbedding(
      '<root a="&micro;">&micro; &amp;micro; &#xB5; &lt;b&gt; &Omega; &Aring;</root>',
    );
    const tree = readXml(xml);
    expect(tree.attributes).toEqual([["a", "µ"]]);
    expect(tree.children).toEqual([{ kind: "text", text: "µ &micro; µ <b> ω å" }]);
    expect(unitsmlXmlForEmbedding("<root>&nonentity;</root>")).toBe("<root>&nonentity;</root>");
  });

  it("leaves comments, CDATA and processing instructions untouched", () => {
    const xml = "<root><!-- &micro; --><![CDATA[&micro;]]><?x &micro;?></root>";
    expect(unitsmlXmlForEmbedding(xml)).toBe(xml);
  });
});
