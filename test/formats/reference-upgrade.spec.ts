/** Focused branches measured with clean Ruby ae20be11 (0.11.12), frozen lock
 * 4aafd716; full generated render fixtures cover the broader model inventory. */
import { describe, expect, it } from "vitest";
import { ParseError } from "../../src/core/errors";
import type { NodeParameter } from "../../src/core/nodes";
import {
  FormulaNode,
  OversetNode,
  SymbolNode,
  TableNode,
  UnaryFunctionNode,
  UndersetNode,
} from "../../src/core/nodes";
import { parseAsciimath } from "../../src/formats/asciimath/index";
import { toLatex } from "../../src/formats/latex/renderer";
import { toMathml } from "../../src/formats/mathml/renderer";
import { parseOmml } from "../../src/formats/omml/parser";
import { toOmml } from "../../src/formats/omml/renderer";
import { dump, dumpNodes, XmlElement } from "../../src/xml/index";

describe("Ruby 0.11.12 changes", () => {
  it("keeps deeply nested AsciiMath failures typed during diagnostic recovery", () => {
    const input = `${"sqrt(".repeat(2_000)}x${")".repeat(2_000)}`;
    expect(() => parseAsciimath(input)).toThrow(ParseError);
  });

  it("pairs the norm delimiters", () => {
    expect(toLatex(parseAsciimath("norm(x)"))).toBe("{\\lVert x \\rVert}");
  });

  it("does not insert an array column descriptor in a generic empty matrix", () => {
    expect(toLatex(new TableNode({ value: [] }))).toBe(
      "\\left .\\begin{matrix}\\end{matrix}\\right .",
    );
  });

  it.each([true, false])(
    "keeps direct over/undersets in operand order, display=%s",
    (displayStyle) => {
      for (const Node of [OversetNode, UndersetNode]) {
        const value = toOmml(
          new FormulaNode({
            value: [
              new Node({
                parameterOne: new SymbolNode({ value: "SCRIPT" }),
                parameterTwo: new SymbolNode({ value: "BASE" }),
              }),
            ],
          }),
          { displayStyle },
        );
        expect(value).toMatch(/<m:e>\s*<m:r>\s*<m:t>BASE<\/m:t>/);
        expect(value).toMatch(/<m:(?:lim|sup|sub)>\s*<m:r>\s*<m:t>SCRIPT<\/m:t>/);
      }
    },
  );

  it.each([
    { nodeType: OversetNode, displayStyle: true, label: "overset" },
    { nodeType: OversetNode, displayStyle: false, label: "overset" },
    { nodeType: UndersetNode, displayStyle: true, label: "underset" },
  ] as const)(
    "names the invalid $label operand, display=$displayStyle",
    ({ nodeType: Node, displayStyle }) => {
      for (const field of ["parameterOne", "parameterTwo"] as const) {
        const node = new Node({
          parameterOne: new SymbolNode({ value: "SCRIPT" }),
          parameterTwo: new SymbolNode({ value: "BASE" }),
          [field]: 42 as unknown as NodeParameter,
        });
        expect(() => toOmml(new FormulaNode({ value: [node] }), { displayStyle })).toThrow(
          `${node.kind}.${field}: cannot insert`,
        );
      }
    },
  );

  it.each(["limUpp", "limLow"])("keeps a named function in %s as a script label", (tag) => {
    const parsed = parseOmml(
      `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:${tag}><m:e><m:r><m:t>x</m:t></m:r></m:e><m:lim><m:r><m:t>sin</m:t></m:r></m:lim></m:${tag}></m:oMath>`,
    );
    expect(parsed.value).toMatchObject([
      {
        kind: tag === "limUpp" ? "overset" : "underset",
        parameterOne: { kind: "unaryFunction", name: "Sin" },
        parameterTwo: { kind: "text", parameterOne: "x" },
      },
    ]);
  });

  it.each([
    [{}, "mi", ""],
    [{ rspace: null }, "mi", ""],
    [{ rspace: "" }, "mo", ' rspace=""'],
    [{ rspace: false }, "mo", ' rspace="false"'],
    [{ rspace: "0.5em" }, "mo", ' rspace="0.5em"'],
  ] as const)("selects a base-symbol tag for %j", (options, tag, attribute) => {
    const value = toMathml(new FormulaNode({ value: [new SymbolNode({ value: "x", options })] }));
    expect(value).toContain(`<${tag}${attribute}>x</${tag}>`);
  });

  it("preserves cancellation as an OMML diagonal strike", () => {
    const value = toOmml(parseAsciimath("cancel(x)"));
    expect(value).toContain('<m:strikeBLTR m:val="on"/>');
    expect(value).toMatch(/<m:e>\s*<m:r>\s*<m:t>x<\/m:t>/);
  });

  it.each([
    null,
    [],
    [null],
    new UnaryFunctionNode({ name: "Merror" }),
    new FormulaNode({ value: [] }),
  ])("omits a cancellation whose content renders empty: %j", (parameterOne) => {
    const value = toOmml(
      new FormulaNode({
        value: [
          new UnaryFunctionNode({
            name: "Cancel",
            parameterOne: parameterOne as unknown as NodeParameter,
          }),
        ],
      }),
    );
    expect(value).not.toContain("m:borderBox");
    expect(value).toContain("<m:oMath/>");
  });

  it("keeps Ruby false's placeholder inside the cancellation", () => {
    const value = toOmml(
      new FormulaNode({
        value: [
          new UnaryFunctionNode({
            name: "Cancel",
            parameterOne: false as unknown as NodeParameter,
          }),
        ],
      }),
    );
    expect(value).toContain('<m:strikeBLTR m:val="on"/>');
    expect(value).toContain("<m:t>&#8203;</m:t>");
  });

  it("keeps the base and both limits in their OMML slots", () => {
    const value = toOmml(parseAsciimath("lim_a^b x"));
    expect(value).toMatch(
      /<m:limUpp>[\s\S]*<m:e>\s*<m:r>\s*<m:t>lim<\/m:t>[\s\S]*<m:lim>\s*<m:r>\s*<m:t>b<\/m:t>/,
    );
    expect(value).toMatch(/<\/m:limUpp>\s*<\/m:e>\s*<m:lim>\s*<m:r>\s*<m:t>a<\/m:t>/);
  });

  it("drops XML-invalid controls only in the formula serializer", () => {
    const tree = new XmlElement("t")
      .setAttribute("k", "a\u0000\u000bb\tc\nd\re")
      .append("a\u0000\u000bb\tc\nd\re");
    expect(dump(tree)).toContain("a&#x0000;&#x000b;b\tc\nd\re");
    expect(dumpNodes(tree)).toBe('<t k="ab\tc\nd\re">ab\tc\nd\re</t>\n');
  });
});
