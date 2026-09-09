import { BaseNode } from "../../core/index";
import {
  type NodeOf,
  type OmmlRendered,
  ommlSlot,
  present,
  type RenderContext,
  renderOverUnder,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): OmmlRendered {
  if (!context.displaystyle) {
    return context.render(
      new BaseNode({ parameterOne: node.parameterOne, parameterTwo: node.parameterTwo }),
    );
  }

  if (!present(node.options.accentunder)) {
    return renderOverUnder(node.kind, "Low", node.parameterOne, node.parameterTwo, context);
  }

  // `m:groupChrPR`, not `m:groupChrPr`. That capitalisation is the GEM's, and it
  // is reproduced deliberately: byte parity with the oracle is this port's
  // contract, so a spelling the gem emits is a spelling we emit. Measured on
  // `00c52783`, the gem builds 18 distinct OMML properties elements and 17 end
  // `Pr` -- `accPr`, `barPr`, `dPr`, `fPr`, `naryPr`, `radPr` and the rest.
  // Exactly one ends `PR`, at `underset.rb:62` and `ul.rb:72`, which is where
  // this comes from. ECMA-376 spells it `m:groupChrPr`, so a consumer reading
  // the schema drops these properties -- an upstream defect, logged for repair
  // there rather than diverged from here.
  const properties = new XmlElement("m:groupChrPR").append(
    new XmlElement("m:chr").setAttribute("m:val", "_"),
    new XmlElement("m:pos").setAttribute("m:val", "bot"),
  );
  return new XmlElement("m:groupChr").append(
    properties,
    ommlSlot(node.parameterTwo, "e", context, node.kind, "underset.parameterTwo"),
  );
}
