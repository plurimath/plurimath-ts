/**
 * Oracle-backed OMML first-slice pins measured by
 * `.codex-context/tasks/omml-slice1/oracle_probe.rb` in the clean, detached
 * oracle at 00c52783. The canonical probe command and its exit code are
 * recorded in the task handoff. The XML constants below are the probe's exact
 * Ox serializations, including their final newlines.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/errors";
import type { MathNode, NodeKind, NodeParameter } from "../../../src/core/nodes";
import {
  AbsNode,
  BarNode,
  BaseNode,
  BinaryFunctionNode,
  CeilNode,
  DdotNode,
  DotNode,
  FencedNode,
  FloorNode,
  FormulaNode,
  FracNode,
  HatNode,
  IntNode,
  MrowNode,
  NaryNode,
  NormNode,
  NumberNode,
  ObraceNode,
  OintNode,
  OverleftrightarrowNode,
  OversetNode,
  ProdNode,
  SumNode,
  SymbolNode,
  TableNode,
  TernaryFunctionNode,
  TextNode,
  TildeNode,
  UbraceNode,
  UlNode,
  UnaryFunctionNode,
  UndersetNode,
  VecNode,
} from "../../../src/core/nodes";
import { parseAsciimath } from "../../../src/formats/asciimath/index";
import { createRenderContext, ROOT_CONTEXT } from "../../../src/formats/omml/render";
import { serializeRendered } from "../../../src/formats/omml/render-shared";
import { toOmml, toOmmlWithoutMathTag } from "../../../src/formats/omml/renderer";

const xml = (...lines: readonly string[]): string => `${lines.join("\n")}\n`;
const symbol = (value = "x") => new SymbolNode({ value });
const nestedOverset = () =>
  new OversetNode({ options: {}, parameterOne: symbol("x"), parameterTwo: symbol("y") });

const nestedSlice2Containers = {
  sum: () =>
    new SumNode({
      options: {},
      parameterOne: symbol("a"),
      parameterTwo: symbol("b"),
      parameterThree: nestedOverset(),
    }),
  prod: () =>
    new ProdNode({
      options: {},
      parameterOne: symbol("a"),
      parameterTwo: symbol("b"),
      parameterThree: nestedOverset(),
    }),
  int: () =>
    new IntNode({
      options: {},
      parameterOne: symbol("a"),
      parameterTwo: symbol("b"),
      parameterThree: nestedOverset(),
    }),
  oint: () =>
    new OintNode({
      options: {},
      parameterOne: symbol("a"),
      parameterTwo: symbol("b"),
      parameterThree: nestedOverset(),
    }),
  overset: () =>
    new OversetNode({ options: {}, parameterOne: nestedOverset(), parameterTwo: symbol("z") }),
  underset: () =>
    new UndersetNode({ options: {}, parameterOne: nestedOverset(), parameterTwo: symbol("z") }),
  obrace: () => new ObraceNode({ attributes: {}, parameterOne: nestedOverset() }),
  ubrace: () => new UbraceNode({ attributes: {}, parameterOne: nestedOverset() }),
} as const;

interface Refusal {
  readonly kind: string;
  readonly message: string;
}

function expectRefusal(run: () => unknown, expected: Refusal): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(RenderError);
  expect(thrown).toMatchObject({
    code: "RENDER_ERROR",
    format: "omml",
    kind: expected.kind,
    message: expected.message,
  });
}

const ROOT_OPEN =
  '<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" ' +
  'xmlns:mv="urn:schemas-microsoft-com:mac:vml" ' +
  'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
  'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" ' +
  'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" ' +
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
  'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">';

const RUN_X = xml("<m:r>", "  <m:t>x</m:t>", "</m:r>");
const RUN_Y = xml("<m:r>", "  <m:t>y</m:t>", "</m:r>");
const PUBLIC_X = xml(
  ROOT_OPEN,
  "  <m:oMath>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:oMath>",
  "</m:oMathPara>",
);
const PUBLIC_EMPTY = xml(ROOT_OPEN, "  <m:oMath/>", "</m:oMathPara>");
const publicFragment = (fragment: string): string =>
  xml(
    ROOT_OPEN,
    "  <m:oMath>",
    ...fragment
      .trimEnd()
      .split("\n")
      .map((line) => `    ${line}`),
    "  </m:oMath>",
    "</m:oMathPara>",
  );

const publicText = (value: string): string =>
  xml(
    ROOT_OPEN,
    "  <m:oMath>",
    "    <m:r>",
    "      <m:rPr>",
    '        <m:sty m:val="p"/>',
    "      </m:rPr>",
    `      <m:t>${value}</m:t>`,
    "    </m:r>",
    "  </m:oMath>",
    "</m:oMathPara>",
  );

const UNARY_X = xml(
  "<m:func>",
  "  <m:funcPr>",
  "    <m:ctrlPr>",
  "      <w:rPr>",
  '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "        <w:i/>",
  "      </w:rPr>",
  "    </m:ctrlPr>",
  "  </m:funcPr>",
  "  <m:fName>",
  "    <m:r>",
  "      <w:rPr>",
  '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "      </w:rPr>",
  "      <m:t>unaryfunction</m:t>",
  "    </m:r>",
  "  </m:fName>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "</m:func>",
);

const BINARY_X = xml(
  "<m:r>",
  "  <m:r>",
  "    <m:t>x</m:t>",
  "  </m:r>",
  "  <m:r>",
  "    <m:t>x</m:t>",
  "  </m:r>",
  "</m:r>",
);

const BASE_X = xml(
  "<m:sSub>",
  "  <m:sSubPr>",
  "    <m:ctrlPr>",
  "      <w:rPr>",
  '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "        <w:i/>",
  "      </w:rPr>",
  "    </m:ctrlPr>",
  "  </m:sSubPr>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "  <m:sub>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:sub>",
  "</m:sSub>",
);

function contractSlot(tag: string, values: readonly string[]): readonly string[] {
  if (values.length === 0) return [`  <m:${tag}/>`];
  return [
    `  <m:${tag}>`,
    ...values.flatMap((value) => ["    <m:r>", `      <m:t>${value}</m:t>`, "    </m:r>"]),
    `  </m:${tag}>`,
  ];
}

function baseContractXml(base: readonly string[], sub: readonly string[]): string {
  return xml(
    "<m:sSub>",
    "  <m:sSubPr>",
    "    <m:ctrlPr>",
    "      <w:rPr>",
    '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "        <w:i/>",
    "      </w:rPr>",
    "    </m:ctrlPr>",
    "  </m:sSubPr>",
    ...contractSlot("e", base),
    ...contractSlot("sub", sub),
    "</m:sSub>",
  );
}

function lowLimitContractXml(base: readonly string[], limit: readonly string[]): string {
  return xml(
    "<m:limLow>",
    "  <m:limLowPr>",
    "    <m:ctrlPr>",
    "      <w:rPr>",
    '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "        <w:i/>",
    "      </w:rPr>",
    "    </m:ctrlPr>",
    "  </m:limLowPr>",
    ...contractSlot("e", base),
    ...contractSlot("lim", limit),
    "</m:limLow>",
  );
}

interface UndersetSlotCase {
  readonly displaystyle: boolean;
  readonly expectedOne: readonly string[];
  readonly expectedTwo: readonly string[];
  readonly name: string;
  readonly parameterOne: MathNode | readonly MathNode[] | null;
  readonly parameterTwo: MathNode | readonly MathNode[] | null;
}

const UNDERSET_SLOT_CASES: readonly UndersetSlotCase[] = ([true, false] as const).flatMap(
  (displaystyle) => [
    {
      displaystyle,
      expectedOne: ["&#8203;"],
      expectedTwo: ["&#8203;"],
      name: "nil / nil",
      parameterOne: null,
      parameterTwo: null,
    },
    {
      displaystyle,
      expectedOne: ["&#8203;"],
      expectedTwo: ["x"],
      name: "nil / node",
      parameterOne: null,
      parameterTwo: symbol(),
    },
    {
      displaystyle,
      expectedOne: ["x"],
      expectedTwo: ["&#8203;"],
      name: "node / nil",
      parameterOne: symbol(),
      parameterTwo: null,
    },
    {
      displaystyle,
      expectedOne: [],
      expectedTwo: ["x"],
      name: "empty array / node",
      parameterOne: [],
      parameterTwo: symbol(),
    },
    {
      displaystyle,
      expectedOne: ["x", "x"],
      expectedTwo: ["x"],
      name: "node array / node",
      parameterOne: [symbol(), symbol()],
      parameterTwo: symbol(),
    },
    {
      displaystyle,
      expectedOne: ["x"],
      expectedTwo: [],
      name: "node / empty array",
      parameterOne: symbol(),
      parameterTwo: [],
    },
    {
      displaystyle,
      expectedOne: ["x"],
      expectedTwo: ["x", "x"],
      name: "node / node array",
      parameterOne: symbol(),
      parameterTwo: [symbol(), symbol()],
    },
  ],
);

const POWER_X = xml(
  "<m:sSup>",
  "  <m:sSupPr>",
  "    <m:ctrlPr>",
  "      <w:rPr>",
  '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "        <w:i/>",
  "      </w:rPr>",
  "    </m:ctrlPr>",
  "  </m:sSupPr>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "  <m:sup>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:sup>",
  "</m:sSup>",
);

const POWER_BASE_X = xml(
  "<m:sSubSup>",
  "  <m:sSubSupPr>",
  "    <m:ctrlPr>",
  "      <w:rPr>",
  '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "        <w:i/>",
  "      </w:rPr>",
  "    </m:ctrlPr>",
  "  </m:sSubSupPr>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "  <m:sub>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:sub>",
  "  <m:sup>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:sup>",
  "</m:sSubSup>",
);

const FRAC_X = xml(
  "<m:f>",
  "  <m:fPr>",
  "    <m:ctrlPr>",
  "      <w:rPr>",
  '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "        <w:i/>",
  "      </w:rPr>",
  "    </m:ctrlPr>",
  "  </m:fPr>",
  "  <m:num>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:num>",
  "  <m:den>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:den>",
  "</m:f>",
);

const NARY_X = xml(
  "<m:nary>",
  "  <m:naryPr>",
  '    <m:chr m:val="x"/>',
  '    <m:limLoc m:val="subSup"/>',
  "    <m:ctrlPr>",
  "      <w:rPr>",
  '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "        <w:i/>",
  "      </w:rPr>",
  "    </m:ctrlPr>",
  "  </m:naryPr>",
  "  <m:sub>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:sub>",
  "  <m:sup>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:sup>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "</m:nary>",
);

const specializedNary = (operator: string, limitLocation: "subSup" | "undOvr"): string =>
  xml(
    "<m:nary>",
    "  <m:naryPr>",
    `    <m:chr m:val="${operator}"/>`,
    `    <m:limLoc m:val="${limitLocation}"/>`,
    '    <m:subHide m:val="0"/>',
    '    <m:supHide m:val="0"/>',
    "  </m:naryPr>",
    "  <m:sub>",
    "    <m:r>",
    "      <m:t>x</m:t>",
    "    </m:r>",
    "  </m:sub>",
    "  <m:sup>",
    "    <m:r>",
    "      <m:t>x</m:t>",
    "    </m:r>",
    "  </m:sup>",
    "  <m:e>",
    "    <m:r>",
    "      <m:t>x</m:t>",
    "    </m:r>",
    "  </m:e>",
    "</m:nary>",
  );

const limitXml = (position: "Low" | "Upp", limit: string, base = "x"): string =>
  xml(
    `<m:lim${position}>`,
    `  <m:lim${position}Pr>`,
    "    <m:ctrlPr>",
    "      <w:rPr>",
    '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "        <w:i/>",
    "      </w:rPr>",
    "    </m:ctrlPr>",
    `  </m:lim${position}Pr>`,
    "  <m:e>",
    "    <m:r>",
    `      <m:t>${base}</m:t>`,
    "    </m:r>",
    "  </m:e>",
    "  <m:lim>",
    "    <m:r>",
    `      <m:t>${limit}</m:t>`,
    "    </m:r>",
    "  </m:lim>",
    `</m:lim${position}>`,
  );

const UNDERSET_ACCENT = xml(
  "<m:groupChr>",
  "  <m:groupChrPR>",
  '    <m:chr m:val="_"/>',
  '    <m:pos m:val="bot"/>',
  "  </m:groupChrPR>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "</m:groupChr>",
);

const OBRACE_ACCENT = xml(
  "<m:acc>",
  "  <m:accPr>",
  '    <m:chr m:val="⏞"/>',
  "  </m:accPr>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "</m:acc>",
);

const indentFragment = (fragment: string, spaces: number): readonly string[] =>
  fragment
    .trimEnd()
    .split("\n")
    .map((line) => `${" ".repeat(spaces)}${line}`);

const literalLimitXml = (position: "Low" | "Upp", limit: string, base: string): string =>
  xml(
    `<m:lim${position}>`,
    `  <m:lim${position}Pr>`,
    "    <m:ctrlPr>",
    "      <w:rPr>",
    '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "        <w:i/>",
    "      </w:rPr>",
    "    </m:ctrlPr>",
    `  </m:lim${position}Pr>`,
    "  <m:e>",
    ...indentFragment(base, 4),
    "  </m:e>",
    "  <m:lim>",
    "    <m:r>",
    `      <m:t>${limit}</m:t>`,
    "    </m:r>",
    "  </m:lim>",
    `</m:lim${position}>`,
  );

const styledRun = (value: string): string =>
  xml(
    "<m:r>",
    "  <m:rPr>",
    '    <m:sty m:val="p"/>',
    "  </m:rPr>",
    `  <m:t>${value}</m:t>`,
    "</m:r>",
  );

const fencedXml = (
  open: string | null,
  close: string | null,
  body: string | null = RUN_X,
): string =>
  xml(
    "<m:d>",
    "  <m:dPr>",
    ...(open === null ? [] : [`    <m:begChr m:val="${open}"/>`]),
    '    <m:sepChr m:val=""/>',
    ...(close === null ? [] : [`    <m:endChr m:val="${close}"/>`]),
    "  </m:dPr>",
    ...(body === null ? ["  <m:e/>"] : ["  <m:e>", ...indentFragment(body, 4), "  </m:e>"]),
    "</m:d>",
  );

const absoluteXml = (includeOpen: boolean, includeClose: boolean, body = RUN_X): string =>
  xml(
    "<m:d>",
    "  <m:dPr>",
    "    <w:rPr>",
    '      <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "    </w:rPr>",
    ...(includeOpen ? ['    <m:begChr m:val="|"/>'] : []),
    ...(includeClose ? ['    <m:endChr m:val="|"/>'] : []),
    '    <m:sepChr m:val=""/>',
    "    <m:grow/>",
    "  </m:dPr>",
    "  <m:e>",
    ...indentFragment(body, 4),
    "  </m:e>",
    "</m:d>",
  );

const barXml = (): string =>
  xml(
    "<m:bar>",
    "  <m:barPr>",
    '    <m:pos m:val="top"/>',
    "    <m:ctrlPr>",
    "      <w:rPr>",
    '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "        <w:i/>",
    "      </w:rPr>",
    "    </m:ctrlPr>",
    "  </m:barPr>",
    "  <m:e>",
    ...indentFragment(RUN_X, 4),
    "  </m:e>",
    "</m:bar>",
  );

const accentXml = (character: string): string =>
  xml(
    "<m:acc>",
    "  <m:accPr>",
    `    <m:chr m:val="${character}"/>`,
    "  </m:accPr>",
    "  <m:e>",
    ...indentFragment(RUN_X, 4),
    "  </m:e>",
    "</m:acc>",
  );

const scriptXml = (position: "Sub" | "Sup", value: string): string => {
  const slot = position === "Sup" ? "sup" : "sub";
  return xml(
    `<m:s${position}>`,
    `  <m:s${position}Pr>`,
    "    <m:ctrlPr>",
    "      <w:rPr>",
    '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "        <w:i/>",
    "      </w:rPr>",
    "    </m:ctrlPr>",
    `  </m:s${position}Pr>`,
    "  <m:e>",
    ...indentFragment(RUN_X, 4),
    "  </m:e>",
    `  <m:${slot}>`,
    "    <m:r>",
    `      <m:t>${value}</m:t>`,
    "    </m:r>",
    `  </m:${slot}>`,
    `</m:s${position}>`,
  );
};

function expectAtBothDisplayStyles(
  node: MathNode,
  displayed: string,
  inline: string = displayed,
): void {
  for (const [displaystyle, expected] of [
    [true, displayed],
    [false, inline],
  ] as const) {
    const context = createRenderContext(displaystyle);
    expect(serializeRendered(context.render(node))).toBe(expected);
    expect(serializeRendered(context.insert(node))).toBe(expected);
  }
}

function expectDirectAndInsertion(node: MathNode, expected: string): void {
  expect(toOmmlWithoutMathTag(node)).toBe(expected);
  expect(serializeRendered(ROOT_CONTEXT.insert(node))).toBe(expected);
}

/** A fully populated fixed n-ary carrying an arbitrary `hide_function_name` value. */
function naryWithHideFlag(
  kind: "int" | "oint" | "prod" | "sum",
  hideFunctionName: unknown,
): MathNode {
  const init = {
    hideFunctionName: hideFunctionName as boolean | undefined,
    options: {},
    parameterOne: symbol(),
    parameterThree: symbol(),
    parameterTwo: symbol(),
  };
  if (kind === "int") return new IntNode(init);
  if (kind === "oint") return new OintNode(init);
  if (kind === "prod") return new ProdNode(init);
  return new SumNode(init);
}

const TD_X = xml("<m:e>", "  <m:r>", "    <m:t>x</m:t>", "  </m:r>", "</m:e>");
const TR_X = xml(
  "<m:mr>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "</m:mr>",
);

const TABLE_X = xml(
  "<m:d>",
  "  <m:dPr>",
  '    <m:begChr m:val="["/>',
  '    <m:endChr m:val="]"/>',
  '    <m:sepChr m:val=""/>',
  "    <m:grow/>",
  "  </m:dPr>",
  "  <m:e>",
  "    <m:m>",
  "      <m:mPr>",
  "        <m:mcs>",
  "          <m:mc>",
  "            <m:mcPr>",
  '              <m:count m:val="2"/>',
  '              <m:mcJc m:val="center"/>',
  "            </m:mcPr>",
  "          </m:mc>",
  "        </m:mcs>",
  "        <m:ctrlPr>",
  "          <w:rPr>",
  '            <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "            <w:i/>",
  "          </w:rPr>",
  "        </m:ctrlPr>",
  "      </m:mPr>",
  "      <m:mr>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>x</m:t>",
  "          </m:r>",
  "        </m:e>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>x</m:t>",
  "          </m:r>",
  "        </m:e>",
  "      </m:mr>",
  "      <m:mr>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>x</m:t>",
  "          </m:r>",
  "        </m:e>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>x</m:t>",
  "          </m:r>",
  "        </m:e>",
  "      </m:mr>",
  "    </m:m>",
  "  </m:e>",
  "</m:d>",
);

function td(): BinaryFunctionNode {
  return new BinaryFunctionNode({ name: "Td", parameterOne: [symbol()] });
}

function tr(): UnaryFunctionNode {
  return new UnaryFunctionNode({ name: "Tr", parameterOne: [td(), td()] });
}

function table(): TableNode {
  return new TableNode({
    closeParen: symbol("]"),
    openParen: symbol("["),
    options: {},
    value: [tr(), tr()],
  });
}

function structuralContractXml(
  root: string,
  slots: readonly (readonly [tag: string, values: readonly string[]])[],
): string {
  return xml(
    `<m:${root}>`,
    `  <m:${root}Pr>`,
    "    <m:ctrlPr>",
    "      <w:rPr>",
    '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "        <w:i/>",
    "      </w:rPr>",
    "    </m:ctrlPr>",
    `  </m:${root}Pr>`,
    ...slots.flatMap(([tag, values]) => contractSlot(tag, values)),
    `</m:${root}>`,
  );
}

function naryContractXml(
  slots: readonly (readonly string[])[],
  values: readonly NodeParameter[],
  operator = "x",
): string {
  return xml(
    "<m:nary>",
    "  <m:naryPr>",
    `    <m:chr m:val="${operator}"/>`,
    '    <m:limLoc m:val="subSup"/>',
    ...(values[0] === null ? ['    <m:subHide m:val="1"/>'] : []),
    ...(values[1] === null ? ['    <m:supHide m:val="1"/>'] : []),
    "    <m:ctrlPr>",
    "      <w:rPr>",
    '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
    "        <w:i/>",
    "      </w:rPr>",
    "    </m:ctrlPr>",
    "  </m:naryPr>",
    ...contractSlot("sub", slots[0] ?? []),
    ...contractSlot("sup", slots[1] ?? []),
    ...contractSlot("e", slots[2] ?? []),
    "</m:nary>",
  );
}

interface ParameterShapeFixture {
  readonly expected: readonly string[];
  readonly name: string;
  readonly value: NodeParameter;
}

const PARAMETER_SHAPES: readonly ParameterShapeFixture[] = [
  { expected: ["&#8203;"], name: "nil", value: null },
  { expected: [], name: "empty array", value: [] },
  { expected: ["a", "b"], name: "node array", value: [symbol("a"), symbol("b")] },
];

interface ParameterCallerFixture {
  readonly build: (values: readonly NodeParameter[]) => MathNode;
  readonly expected: (
    slots: readonly (readonly string[])[],
    values: readonly NodeParameter[],
  ) => string;
  readonly kind: string;
  readonly slots: readonly string[];
}

const PARAMETER_CALLERS: readonly ParameterCallerFixture[] = [
  {
    build: ([parameterOne, parameterTwo]) => new BaseNode({ parameterOne, parameterTwo }),
    expected: (slots) =>
      structuralContractXml("sSub", [
        ["e", slots[0] ?? []],
        ["sub", slots[1] ?? []],
      ]),
    kind: "base",
    slots: ["parameterOne", "parameterTwo"],
  },
  {
    build: ([parameterOne, parameterTwo]) => new FracNode({ parameterOne, parameterTwo }),
    expected: (slots) =>
      structuralContractXml("f", [
        ["num", slots[0] ?? []],
        ["den", slots[1] ?? []],
      ]),
    kind: "frac",
    slots: ["parameterOne", "parameterTwo"],
  },
  {
    build: ([parameterOne, parameterTwo]) =>
      new BinaryFunctionNode({ name: "Power", parameterOne, parameterTwo }),
    expected: (slots) =>
      structuralContractXml("sSup", [
        ["e", slots[0] ?? []],
        ["sup", slots[1] ?? []],
      ]),
    kind: "power",
    slots: ["parameterOne", "parameterTwo"],
  },
  {
    build: ([parameterOne, parameterTwo, parameterThree]) =>
      new TernaryFunctionNode({
        name: "PowerBase",
        parameterOne,
        parameterTwo,
        parameterThree,
      }),
    expected: (slots) =>
      structuralContractXml("sSubSup", [
        ["e", slots[0] ?? []],
        ["sub", slots[1] ?? []],
        ["sup", slots[2] ?? []],
      ]),
    kind: "powerBase",
    slots: ["parameterOne", "parameterTwo", "parameterThree"],
  },
  {
    build: ([parameterTwo, parameterThree, parameterFour]) =>
      new NaryNode({
        options: {},
        parameterOne: symbol(),
        parameterTwo,
        parameterThree,
        parameterFour,
      }),
    expected: naryContractXml,
    kind: "nary",
    slots: ["parameterTwo", "parameterThree", "parameterFour"],
  },
];

describe("OMML first vertical slice", () => {
  it("pins the public Formula wrapper and Mrow inheritance", () => {
    expect(toOmml(new FormulaNode({ value: [symbol()] }))).toBe(PUBLIC_X);
    expect(toOmml(new MrowNode({ value: [symbol()] }))).toBe(PUBLIC_X);
  });

  it("pins Formula, Mrow, Symbol, Number, and Text fragments", () => {
    expect(toOmmlWithoutMathTag(new FormulaNode({ value: [symbol()] }))).toBe(RUN_X);
    expect(toOmmlWithoutMathTag(new MrowNode({ value: [symbol()] }))).toBe(RUN_X);
    expect(toOmmlWithoutMathTag(symbol())).toBe("x");
    expect(toOmmlWithoutMathTag(new NumberNode({ value: "1" }))).toBe(xml("<m:t>1</m:t>"));
    expect(toOmmlWithoutMathTag(new TextNode({ parameterOne: "x" }))).toBe(xml("<m:t>x</m:t>"));
  });

  it("pins Text's distinct insert_t_tag run properties", () => {
    expect(toOmml(new FormulaNode({ value: [new TextNode({ parameterOne: "x" })] }))).toBe(
      xml(
        ROOT_OPEN,
        "  <m:oMath>",
        "    <m:r>",
        "      <m:rPr>",
        '        <m:sty m:val="p"/>',
        "      </m:rPr>",
        "      <m:t>x</m:t>",
        "    </m:r>",
        "  </m:oMath>",
        "</m:oMathPara>",
      ),
    );
  });

  it("normalizes ordinary Text independently of unicode[:name] lookup", () => {
    expect(toOmmlWithoutMathTag(new TextNode({ parameterOne: "a b" }))).toBe(
      xml("<m:t>a&#xa0;b</m:t>"),
    );
    expect(toOmmlWithoutMathTag(new TextNode({ parameterOne: "π" }))).toBe(
      xml("<m:t>&#x3c0;</m:t>"),
    );
    expect(toOmmlWithoutMathTag(new TextNode({ parameterOne: "&pi;" }))).toBe(
      xml("<m:t>&#x3c0;</m:t>"),
    );
    expect(toOmml(new FormulaNode({ value: [new TextNode({ parameterOne: "a b" })] }))).toBe(
      xml(
        ROOT_OPEN,
        "  <m:oMath>",
        "    <m:r>",
        "      <m:rPr>",
        '        <m:sty m:val="p"/>',
        "      </m:rPr>",
        "      <m:t>a&#xa0;b</m:t>",
        "    </m:r>",
        "  </m:oMath>",
        "</m:oMathPara>",
      ),
    );
  });

  it.each([
    ["tab", "\t", "&#x9;"],
    ["line feed", "\n", "&#xa;"],
    ["carriage return", "\r", "&#xd;"],
    ["vertical tab", "\v", "&#xb;"],
    ["form feed", "\f", "&#xc;"],
    ["NUL", "\0", "&#x0;"],
  ])("hex-escapes Text %s on Formula insertion", (_name, control, encoded) => {
    const node = new TextNode({ parameterOne: `a${control}b` });
    expect(toOmml(new FormulaNode({ value: [node] }))).toBe(publicText(`a${encoded}b`));
  });

  it('suppresses only the exact Symbol spelling "&#x2062;"', () => {
    const encoded = new SymbolNode({ value: "&#x2062;" });
    expect(toOmmlWithoutMathTag(encoded)).toBe("");
    expect(toOmml(new FormulaNode({ value: [encoded] }))).toBe(PUBLIC_EMPTY);

    const character = new SymbolNode({ value: "⁢" });
    expect(toOmmlWithoutMathTag(character)).toBe("⁢");
    expect(toOmml(new FormulaNode({ value: [character] }))).toBe(
      xml(
        ROOT_OPEN,
        "  <m:oMath>",
        "    <m:r>",
        "      <m:t>⁢</m:t>",
        "    </m:r>",
        "  </m:oMath>",
        "</m:oMathPara>",
      ),
    );
  });

  it("pins the unary and binary carrier defaults", () => {
    expect(
      toOmmlWithoutMathTag(
        new UnaryFunctionNode({ name: "UnaryFunction", parameterOne: symbol() }),
      ),
    ).toBe(UNARY_X);
    expect(
      toOmmlWithoutMathTag(
        new BinaryFunctionNode({
          name: "BinaryFunction",
          parameterOne: symbol(),
          parameterTwo: symbol(),
        }),
      ),
    ).toBe(BINARY_X);
  });

  it("pins Base, Power, and PowerBase as three distinct script trees", () => {
    expect(
      toOmmlWithoutMathTag(new BaseNode({ parameterOne: symbol(), parameterTwo: symbol() })),
    ).toBe(BASE_X);
    expect(
      toOmmlWithoutMathTag(
        new BinaryFunctionNode({
          name: "Power",
          parameterOne: symbol(),
          parameterTwo: symbol(),
        }),
      ),
    ).toBe(POWER_X);
    expect(
      toOmmlWithoutMathTag(
        new TernaryFunctionNode({
          name: "PowerBase",
          parameterOne: symbol(),
          parameterTwo: symbol(),
          parameterThree: symbol(),
        }),
      ),
    ).toBe(POWER_BASE_X);
  });

  it("pins Frac and Nary structure", () => {
    expect(
      toOmmlWithoutMathTag(new FracNode({ parameterOne: symbol(), parameterTwo: symbol() })),
    ).toBe(FRAC_X);
    expect(
      toOmmlWithoutMathTag(
        new NaryNode({
          options: {},
          parameterOne: symbol(),
          parameterTwo: symbol(),
          parameterThree: symbol(),
          parameterFour: symbol(),
        }),
      ),
    ).toBe(NARY_X);
  });

  it("pins the measured Td, Tr, and two-column Table tree", () => {
    expect(toOmmlWithoutMathTag(td())).toBe(TD_X);
    expect(toOmmlWithoutMathTag(tr())).toBe(TR_X);
    expect(toOmmlWithoutMathTag(table())).toBe(TABLE_X);
  });

  it("reproduces the bare TernaryFunction refusal", () => {
    expectRefusal(
      () =>
        toOmmlWithoutMathTag(
          new TernaryFunctionNode({
            name: "TernaryFunction",
            parameterOne: symbol(),
            parameterTwo: symbol(),
            parameterThree: symbol(),
          }),
        ),
      {
        kind: "ternaryFunction",
        message:
          "TernaryFunction has no to_omml_without_math_tag in the pinned gem and refuses instead of emitting markup",
      },
    );
  });
});

describe("OMML parameter-slot parity", () => {
  for (const caller of PARAMETER_CALLERS) {
    for (const [slotIndex, slot] of caller.slots.entries()) {
      for (const shape of PARAMETER_SHAPES) {
        it(`${caller.kind}.${slot} renders ${shape.name}`, () => {
          const values: NodeParameter[] = caller.slots.map(() => symbol());
          const expectedSlots: string[][] = caller.slots.map(() => ["x"]);
          values[slotIndex] = shape.value;
          expectedSlots[slotIndex] = [...shape.expected];

          if (caller.kind === "powerBase" && slotIndex === 0 && Array.isArray(shape.value)) {
            expectRefusal(() => toOmmlWithoutMathTag(caller.build(values)), {
              kind: "ternaryFunction",
              message:
                "powerBase.parameterOne: cannot inspect a list for omml_tag_name — the gem raises NoMethodError here",
            });
            return;
          }

          expect(toOmmlWithoutMathTag(caller.build(values))).toBe(
            caller.expected(expectedSlots, values),
          );
        });
      }
    }
  }

  it("renders an all-nil Nary with hidden limits and placeholder slots", () => {
    const values: readonly NodeParameter[] = [null, null, null];
    expect(
      toOmmlWithoutMathTag(
        new NaryNode({
          options: {},
          parameterOne: null,
          parameterTwo: null,
          parameterThree: null,
          parameterFour: null,
        }),
      ),
    ).toBe(naryContractXml([["&#8203;"], ["&#8203;"], ["&#8203;"]], values, ""));
  });

  it("retains the Base bare-string refusal", () => {
    expectRefusal(
      () => toOmmlWithoutMathTag(new BaseNode({ parameterOne: "bare", parameterTwo: symbol() })),
      {
        kind: "base",
        message:
          'base.parameterOne: cannot insert the bare string "bare" — the gem raises NoMethodError here',
      },
    );
  });
});

describe("OMML scripts and limits slice", () => {
  it.each(UNDERSET_SLOT_CASES)(
    "pins underset $name at Formula displaystyle=$displaystyle",
    ({ displaystyle, expectedOne, expectedTwo, parameterOne, parameterTwo }) => {
      const node = new UndersetNode({ options: {}, parameterOne, parameterTwo });
      const expected = displaystyle
        ? lowLimitContractXml(expectedOne, expectedTwo)
        : baseContractXml(expectedOne, expectedTwo);
      expect(toOmml(new FormulaNode({ displaystyle, value: [node] }))).toBe(
        publicFragment(expected),
      );
    },
  );

  it.each([true, false])(
    "ignores nested Base options at Formula displaystyle=%s",
    (displaystyle) => {
      const render = (options: Readonly<Record<string, unknown>>) =>
        toOmml(
          new FormulaNode({
            displaystyle,
            value: [
              new UndersetNode({
                options: {},
                parameterOne: new BaseNode({
                  options,
                  parameterOne: symbol(),
                  parameterTwo: symbol(),
                }),
                parameterTwo: symbol(),
              }),
            ],
          }),
        );
      expect(render({ ignored: true })).toBe(render({}));
    },
  );

  it.each([true, false])(
    "retains the nested Base bare-string refusal at Formula displaystyle=%s",
    (displaystyle) => {
      expectRefusal(
        () =>
          toOmml(
            new FormulaNode({
              displaystyle,
              value: [
                new UndersetNode({
                  options: {},
                  parameterOne: new BaseNode({
                    options: {},
                    parameterOne: "bare",
                    parameterTwo: symbol(),
                  }),
                  parameterTwo: symbol(),
                }),
              ],
            }),
          ),
        {
          kind: "base",
          message:
            'base.parameterOne: cannot insert the bare string "bare" — the gem raises NoMethodError here',
        },
      );
    },
  );

  it.each([
    ["sum", true, 1, 0],
    ["sum", false, 0, 1],
    ["prod", true, 1, 0],
    ["prod", false, 0, 1],
    ["int", true, 1, 0],
    ["int", false, 0, 1],
    ["oint", true, 1, 0],
    ["oint", false, 0, 1],
    ["overset", true, 2, 0],
    ["overset", false, 0, 2],
    ["underset", true, 1, 0],
    ["underset", false, 0, 1],
    ["obrace", true, 2, 0],
    ["obrace", false, 2, 0],
    ["ubrace", true, 1, 0],
    ["ubrace", false, 1, 0],
  ] as const)(
    "pins %s's nested display context at Formula displaystyle=%s",
    (kind, displaystyle, limUpp, sSup) => {
      const rendered = toOmml(
        new FormulaNode({ displaystyle, value: [nestedSlice2Containers[kind]()] }),
      );
      expect({
        limUpp: rendered.match(/<m:limUpp>/g)?.length ?? 0,
        sSup: rendered.match(/<m:sSup>/g)?.length ?? 0,
      }).toEqual({ limUpp, sSup });
    },
  );

  it.each([
    [
      "overset",
      true,
      new OversetNode({ options: {}, parameterOne: symbol(), parameterTwo: symbol() }),
      limitXml("Upp", "x"),
    ],
    [
      "overset",
      false,
      new OversetNode({ options: {}, parameterOne: symbol(), parameterTwo: symbol() }),
      POWER_X,
    ],
    [
      "underset",
      true,
      new UndersetNode({ options: {}, parameterOne: symbol(), parameterTwo: symbol() }),
      limitXml("Low", "x"),
    ],
    [
      "underset",
      false,
      new UndersetNode({ options: {}, parameterOne: symbol(), parameterTwo: symbol() }),
      BASE_X,
    ],
  ])("pins %s at Formula displaystyle=%s", (_kind, displaystyle, node, expected) => {
    expect(toOmml(new FormulaNode({ displaystyle, value: [node] }))).toBe(
      publicFragment(expected as string),
    );
  });

  it.each([
    [
      "sum",
      new SumNode({
        options: {},
        parameterOne: symbol(),
        parameterTwo: symbol(),
        parameterThree: symbol(),
      }),
      specializedNary("∑", "undOvr"),
    ],
    [
      "prod",
      new ProdNode({
        options: {},
        parameterOne: symbol(),
        parameterTwo: symbol(),
        parameterThree: symbol(),
      }),
      specializedNary("∏", "undOvr"),
    ],
    [
      "int",
      new IntNode({
        options: {},
        parameterOne: symbol(),
        parameterTwo: symbol(),
        parameterThree: symbol(),
      }),
      specializedNary("∫", "subSup"),
    ],
    [
      "oint",
      new OintNode({
        options: {},
        parameterOne: symbol(),
        parameterTwo: symbol(),
        parameterThree: symbol(),
      }),
      specializedNary("∮", "subSup"),
    ],
  ])("pins %s direct and insertion n-ary bytes", (_kind, node, expected) => {
    expectDirectAndInsertion(node, expected);
  });

  it.each([
    [
      "overset",
      new OversetNode({ options: {}, parameterOne: symbol(), parameterTwo: symbol() }),
      limitXml("Upp", "x"),
    ],
    [
      "underset",
      new UndersetNode({ options: {}, parameterOne: symbol(), parameterTwo: symbol() }),
      limitXml("Low", "x"),
    ],
    ["obrace", new ObraceNode({ attributes: {}, parameterOne: symbol() }), limitXml("Upp", "⏞")],
    ["ubrace", new UbraceNode({ attributes: {}, parameterOne: symbol() }), limitXml("Low", "⏟")],
  ])("pins %s direct and insertion limit bytes", (_kind, node, expected) => {
    expectDirectAndInsertion(node, expected);
  });

  it.each([
    ["sum", new SumNode({ options: {} }), xml("<m:r>", "  <m:t>&#x2211;</m:t>", "</m:r>")],
    ["prod", new ProdNode({ options: {} }), xml("<m:r>", "  <m:t>&#x220f;</m:t>", "</m:r>")],
    ["int", new IntNode({ options: {} }), xml("<m:r>", "  <m:t>&#x222b;</m:t>", "</m:r>")],
    ["oint", new OintNode({ options: {} }), xml("<m:r>", "  <m:t>&#x222e;</m:t>", "</m:r>")],
    ["overset", new OversetNode({ options: {} }), limitXml("Upp", "&#8203;", "&#8203;")],
    ["underset", new UndersetNode({ options: {} }), limitXml("Low", "&#8203;", "&#8203;")],
    ["obrace", new ObraceNode({ attributes: {} }), xml("<m:r>", "  <m:t>⏞</m:t>", "</m:r>")],
    ["ubrace", new UbraceNode({ attributes: {} }), xml("<m:r>", "  <m:t>⏟</m:t>", "</m:r>")],
  ])("pins %s's deterministic empty direct and insertion bytes", (_kind, node, expected) => {
    expectDirectAndInsertion(node, expected);
  });

  it.each([
    [
      "sum",
      new SumNode({
        hideFunctionName: true,
        options: {},
        parameterOne: symbol(),
        parameterTwo: symbol(),
        parameterThree: symbol(),
      }),
      "undOvr",
    ],
    [
      "prod",
      new ProdNode({
        hideFunctionName: true,
        options: {},
        parameterOne: symbol(),
        parameterTwo: symbol(),
        parameterThree: symbol(),
      }),
      "undOvr",
    ],
    [
      "int",
      new IntNode({
        hideFunctionName: true,
        options: {},
        parameterOne: symbol(),
        parameterTwo: symbol(),
        parameterThree: symbol(),
      }),
      "subSup",
    ],
    [
      "oint",
      new OintNode({
        hideFunctionName: true,
        options: {},
        parameterOne: symbol(),
        parameterTwo: symbol(),
        parameterThree: symbol(),
      }),
      "subSup",
    ],
  ])("pins %s's measured hidden operator", (_kind, node, limitLocation) => {
    expectDirectAndInsertion(node, specializedNary("", limitLocation as "subSup" | "undOvr"));
  });

  it.each([
    [
      "overset",
      true,
      false,
      new OversetNode({
        options: { accentunder: false },
        parameterOne: symbol(),
        parameterTwo: symbol(),
      }),
      limitXml("Upp", "x"),
    ],
    [
      "overset",
      true,
      true,
      new OversetNode({
        options: { accentunder: true },
        parameterOne: symbol(),
        parameterTwo: symbol(),
      }),
      limitXml("Upp", "x"),
    ],
    [
      "overset",
      false,
      false,
      new OversetNode({
        options: { accentunder: false },
        parameterOne: symbol(),
        parameterTwo: symbol(),
      }),
      POWER_X,
    ],
    [
      "overset",
      false,
      true,
      new OversetNode({
        options: { accentunder: true },
        parameterOne: symbol(),
        parameterTwo: symbol(),
      }),
      POWER_X,
    ],
    [
      "underset",
      true,
      false,
      new UndersetNode({
        options: { accentunder: false },
        parameterOne: symbol(),
        parameterTwo: symbol(),
      }),
      limitXml("Low", "x"),
    ],
    [
      "underset",
      true,
      true,
      new UndersetNode({
        options: { accentunder: true },
        parameterOne: symbol(),
        parameterTwo: symbol(),
      }),
      UNDERSET_ACCENT,
    ],
    [
      "underset",
      false,
      false,
      new UndersetNode({
        options: { accentunder: false },
        parameterOne: symbol(),
        parameterTwo: symbol(),
      }),
      BASE_X,
    ],
    [
      "underset",
      false,
      true,
      new UndersetNode({
        options: { accentunder: true },
        parameterOne: symbol(),
        parameterTwo: symbol(),
      }),
      BASE_X,
    ],
    [
      "obrace",
      true,
      false,
      new ObraceNode({ attributes: { accent: false }, parameterOne: symbol() }),
      limitXml("Upp", "⏞"),
    ],
    [
      "obrace",
      true,
      true,
      new ObraceNode({ attributes: { accent: true }, parameterOne: symbol() }),
      OBRACE_ACCENT,
    ],
    [
      "obrace",
      false,
      false,
      new ObraceNode({ attributes: { accent: false }, parameterOne: symbol() }),
      limitXml("Upp", "⏞"),
    ],
    [
      "obrace",
      false,
      true,
      new ObraceNode({ attributes: { accent: true }, parameterOne: symbol() }),
      OBRACE_ACCENT,
    ],
    [
      "ubrace",
      true,
      false,
      new UbraceNode({ attributes: { accent: false }, parameterOne: symbol() }),
      limitXml("Low", "⏟"),
    ],
    [
      "ubrace",
      true,
      true,
      new UbraceNode({ attributes: { accent: true }, parameterOne: symbol() }),
      limitXml("Low", "⏟"),
    ],
    [
      "ubrace",
      false,
      false,
      new UbraceNode({ attributes: { accent: false }, parameterOne: symbol() }),
      limitXml("Low", "⏟"),
    ],
    [
      "ubrace",
      false,
      true,
      new UbraceNode({ attributes: { accent: true }, parameterOne: symbol() }),
      limitXml("Low", "⏟"),
    ],
  ] as const)(
    "pins %s at Formula displaystyle=%s with accent=%s",
    (_kind, displaystyle, _accent, node, expected) => {
      expect(toOmml(new FormulaNode({ displaystyle, value: [node] }))).toBe(
        publicFragment(expected),
      );
    },
  );
});

/**
 * Ruby's falsy set is `nil`/`false` alone: `0` and `""` are truthy there and
 * falsy in JavaScript. Every case below is the pinned oracle's byte output for
 * a slot or flag holding one of those four values, measured at 00c52783 by
 * `falsy_probe.rb` (recorded in the task handoff).
 */
describe("OMML Ruby-falsy parity", () => {
  // `narypr(hide_function_name ? "" : "∑")` — Ruby-truthy, so `0` and `""`
  // suppress the operator in the gem exactly as `true` does.
  it.each([
    ["sum", "undOvr"],
    ["prod", "undOvr"],
    ["int", "subSup"],
    ["oint", "subSup"],
  ] as const)(
    "suppresses %s's operator for every Ruby-truthy hideFunctionName",
    (kind, limitLoc) => {
      for (const flag of [true, 0, ""]) {
        expectDirectAndInsertion(
          naryWithHideFlag(kind, flag),
          specializedNary("", limitLoc as "subSup" | "undOvr"),
        );
      }
    },
  );

  it.each([
    ["sum", "undOvr"],
    ["prod", "undOvr"],
    ["int", "subSup"],
    ["oint", "subSup"],
  ] as const)("keeps %s's operator for every Ruby-falsy hideFunctionName", (kind, limitLoc) => {
    const operator = { int: "∫", oint: "∮", prod: "∏", sum: "∑" }[kind];
    for (const flag of [undefined, null, false]) {
      expectDirectAndInsertion(
        naryWithHideFlag(kind, flag),
        specializedNary(operator, limitLoc as "subSup" | "undOvr"),
      );
    }
  });

  // `return r_element("⏞", rpr_tag: false) unless parameter_one` — Ruby-falsy,
  // so `false` takes the bare-brace path that `nil` takes.
  it.each([
    ["obrace", "⏞"],
    ["ubrace", "⏟"],
  ] as const)("renders a bare %s brace for a false parameterOne", (kind, brace) => {
    const node =
      kind === "obrace"
        ? new ObraceNode({ attributes: {}, parameterOne: false as unknown as NodeParameter })
        : new UbraceNode({ attributes: {}, parameterOne: false as unknown as NodeParameter });
    expectDirectAndInsertion(node, xml("<m:r>", `  <m:t>${brace}</m:t>`, "</m:r>"));
  });

  // `Core#omml_parameter` is `return empty_tag(tag) unless field` — Ruby-falsy,
  // so a `false` slot yields the same zero-width placeholder a `nil` slot does.
  it("fills a false Base slot with the nil placeholder", () => {
    expect(
      toOmmlWithoutMathTag(
        new BaseNode({ parameterOne: false as unknown as NodeParameter, parameterTwo: symbol() }),
      ),
    ).toBe(baseContractXml(["&#8203;"], ["x"]));
  });

  it("fills a false Frac slot with the nil placeholder", () => {
    expect(
      toOmmlWithoutMathTag(
        new FracNode({
          options: {},
          parameterOne: false as unknown as NodeParameter,
          parameterTwo: symbol(),
        }),
      ),
    ).toBe(
      structuralContractXml("f", [
        ["num", ["&#8203;"]],
        ["den", ["x"]],
      ]),
    );
  });

  // `Nary#hide_tags` is `return nar unless field.nil?` — an explicit nil test,
  // NOT Ruby-falsy. A `false` slot keeps its hide tag OFF while still taking
  // `omml_parameter`'s placeholder.
  it("omits Nary's hide tags for a false slot while placeholding it", () => {
    expect(
      toOmmlWithoutMathTag(
        new NaryNode({
          options: {},
          parameterOne: symbol(),
          parameterTwo: false as unknown as NodeParameter,
          parameterThree: symbol(),
          parameterFour: symbol(),
        }),
      ),
    ).toBe(naryContractXml([["&#8203;"], ["x"], ["x"]], [symbol(), symbol()]));
  });

  // The other half of the same boundary: `0` and `""` are TRUTHY in Ruby, so
  // the gem walks into them and raises NoMethodError. Widening any of the
  // guards above to plain JavaScript falsiness would silently emit markup here.
  it.each([
    ["a number", 0],
    ['the bare string ""', ""],
  ] as const)("refuses %s in a Base slot rather than placeholding it", (described, value) => {
    expectRefusal(
      () =>
        toOmmlWithoutMathTag(
          new BaseNode({ parameterOne: value as unknown as NodeParameter, parameterTwo: symbol() }),
        ),
      {
        kind: "base",
        message: `base.parameterOne: cannot insert ${described} — the gem raises NoMethodError here`,
      },
    );
  });

  it.each([
    ["obrace", "a number", 0],
    ["obrace", 'the bare string ""', ""],
    ["ubrace", "a number", 0],
    ["ubrace", 'the bare string ""', ""],
  ] as const)(
    "refuses %s carrying %s rather than emitting a bare brace",
    (kind, described, value) => {
      const node =
        kind === "obrace"
          ? new ObraceNode({ attributes: {}, parameterOne: value as unknown as NodeParameter })
          : new UbraceNode({ attributes: {}, parameterOne: value as unknown as NodeParameter });
      expectRefusal(() => toOmmlWithoutMathTag(node), {
        kind,
        message: `${kind}.parameterOne: cannot insert ${described} — the gem raises NoMethodError here`,
      });
    },
  );

  // Ruby reads an unassigned ivar as nil, so an absent field is `nil` too.
  it("hides Nary's limits for slots absent from a node-shaped value", () => {
    expect(
      toOmmlWithoutMathTag({
        kind: "nary",
        options: {},
        parameterOne: symbol(),
        parameterFour: symbol(),
      } as unknown as MathNode),
    ).toBe(naryContractXml([["&#8203;"], ["&#8203;"], ["x"]], [null, null]));
  });
});

describe("OMML delimiters and accents slice", () => {
  const canonicalCases = [
    ["abs", new AbsNode({ parameterOne: symbol() }), absoluteXml(true, true)],
    ["ceil", new CeilNode({ parameterOne: symbol() }), fencedXml("⌈", "⌉")],
    ["floor", new FloorNode({ parameterOne: symbol() }), styledRun("⌊") + RUN_X + styledRun("⌋")],
    ["norm", new NormNode({ parameterOne: symbol() }), styledRun("∥") + RUN_X + styledRun("∥")],
    [
      "fenced",
      new FencedNode({
        options: {},
        parameterOne: symbol(),
        parameterTwo: [symbol()],
        parameterThree: symbol(),
      }),
      fencedXml("x", "x"),
    ],
    ["bar", new BarNode({ attributes: {}, parameterOne: symbol() }), barXml()],
    ["dot", new DotNode({ attributes: {}, parameterOne: symbol() }), limitXml("Upp", ".")],
    ["ddot", new DdotNode({ attributes: {}, parameterOne: symbol() }), limitXml("Upp", "..")],
    [
      "hat",
      new HatNode({ attributes: {}, parameterOne: symbol() }),
      limitXml("Upp", "&#x302;"),
      scriptXml("Sup", "&#x302;"),
    ],
    ["tilde", new TildeNode({ attributes: {}, parameterOne: symbol() }), limitXml("Upp", "~")],
    ["vec", new VecNode({ attributes: {}, parameterOne: symbol() }), limitXml("Upp", "→")],
    ["ul", new UlNode({ attributes: {}, parameterOne: symbol() }), limitXml("Low", "&#x332;")],
    [
      "overleftrightarrow",
      new OverleftrightarrowNode({ attributes: {}, parameterOne: symbol() }),
      limitXml("Upp", "⃡"),
    ],
  ] as const;

  it.each(canonicalCases)(
    "pins %s direct and insertion bytes at both displaystyle values",
    (_kind, node, displayed, inline = displayed) => {
      expectAtBothDisplayStyles(node, displayed, inline);
      expect(toOmmlWithoutMathTag(node)).toBe(displayed);
    },
  );

  it.each([
    [
      "ddot",
      new DdotNode({
        attributes: {},
        parameterOne: new HatNode({ attributes: {}, parameterOne: symbol() }),
      }),
      "Upp",
      "..",
    ],
    [
      "dot",
      new DotNode({
        attributes: {},
        parameterOne: new HatNode({ attributes: {}, parameterOne: symbol() }),
      }),
      "Upp",
      ".",
    ],
    [
      "overleftrightarrow",
      new OverleftrightarrowNode({
        attributes: {},
        parameterOne: new HatNode({ attributes: {}, parameterOne: symbol() }),
      }),
      "Upp",
      "⃡",
    ],
    [
      "tilde",
      new TildeNode({
        attributes: {},
        parameterOne: new HatNode({ attributes: {}, parameterOne: symbol() }),
      }),
      "Upp",
      "~",
    ],
    [
      "ul",
      new UlNode({
        attributes: {},
        parameterOne: new HatNode({ attributes: {}, parameterOne: symbol() }),
      }),
      "Low",
      "&#x332;",
    ],
    [
      "vec",
      new VecNode({
        attributes: {},
        parameterOne: new HatNode({ attributes: {}, parameterOne: symbol() }),
      }),
      "Upp",
      "→",
    ],
  ] as const)(
    "renders nested Hat in %s's forced display context",
    (_kind, node, position, limit) => {
      const expected = literalLimitXml(position, limit, limitXml("Upp", "&#x302;"));
      const inline = createRenderContext(false);
      expect(serializeRendered(inline.render(node))).toBe(expected);
      expect(serializeRendered(inline.insert(node))).toBe(expected);
    },
  );

  it.each([
    ["abs", new AbsNode(), absoluteXml(true, true, xml("<m:r>", "  <m:t>&#8203;</m:t>", "</m:r>"))],
    ["ceil", new CeilNode(), fencedXml("⌈", "⌉", null)],
    ["floor", new FloorNode(), styledRun("⌊") + styledRun("⌋")],
    ["norm", new NormNode(), styledRun("∥") + styledRun("∥")],
    ["fenced", new FencedNode({ options: {} }), fencedXml(null, null, null)],
    ["bar", new BarNode({ attributes: {} }), xml("<m:r>", "  <m:t>&#xaf;</m:t>", "</m:r>")],
    ["dot", new DotNode({ attributes: {} }), xml("<m:r>", "  <m:t>.</m:t>", "</m:r>")],
    ["ddot", new DdotNode({ attributes: {} }), xml("<m:r>", "  <m:t>..</m:t>", "</m:r>")],
    ["hat", new HatNode({ attributes: {} }), xml("<m:r>", "  <m:t>^</m:t>", "</m:r>")],
    ["tilde", new TildeNode({ attributes: {} }), xml("<m:r>", "  <m:t>~</m:t>", "</m:r>")],
    ["vec", new VecNode({ attributes: {} }), xml("<m:r>", "  <m:t>&#x2192;</m:t>", "</m:r>")],
    ["ul", new UlNode({ attributes: {} }), xml("<m:r>", "  <m:t>&#x332;</m:t>", "</m:r>")],
    [
      "overleftrightarrow",
      new OverleftrightarrowNode({ attributes: {} }),
      xml("<m:r>", "  <m:t>&#x20e1;</m:t>", "</m:r>"),
    ],
  ])("pins %s's deterministic empty direct and insertion bytes", (_kind, node, expected) => {
    expectDirectAndInsertion(node as MathNode, expected as string);
  });

  it.each([
    ["bar", new BarNode({ attributes: { accent: true }, parameterOne: symbol() }), accentXml("‾")],
    ["dot", new DotNode({ attributes: { accent: true }, parameterOne: symbol() }), accentXml(".")],
    [
      "ddot",
      new DdotNode({ attributes: { accent: true }, parameterOne: symbol() }),
      limitXml("Upp", ".."),
    ],
    ["hat", new HatNode({ attributes: { accent: true }, parameterOne: symbol() }), accentXml("̂")],
    [
      "tilde",
      new TildeNode({ attributes: { accent: true }, parameterOne: symbol() }),
      accentXml("˜"),
    ],
    ["vec", new VecNode({ attributes: { accent: true }, parameterOne: symbol() }), accentXml("→")],
    [
      "overleftrightarrow",
      new OverleftrightarrowNode({ attributes: { accent: true }, parameterOne: symbol() }),
      accentXml("⃡"),
    ],
    [
      "ul/accent",
      new UlNode({ attributes: { accent: true }, parameterOne: symbol() }),
      limitXml("Low", "&#x332;"),
    ],
    [
      "ul/accentunder",
      new UlNode({ attributes: { accentunder: true }, parameterOne: symbol() }),
      UNDERSET_ACCENT,
    ],
  ])("pins %s's non-uniform accent option behavior", (_kind, node, expected) => {
    expectAtBothDisplayStyles(node as MathNode, expected as string);
  });

  it("pins Hat's measured hide_function_name branch without deriving a class label", () => {
    expectAtBothDisplayStyles(
      new HatNode({ attributes: {}, hideFunctionName: true, parameterOne: symbol() }),
      RUN_X,
    );
  });

  it.each([
    [
      "abs/open",
      new AbsNode({ openParen: symbol(), parameterOne: symbol() }),
      absoluteXml(false, true),
    ],
    [
      "abs/close",
      new AbsNode({ closeParen: symbol(), parameterOne: symbol() }),
      absoluteXml(true, false),
    ],
    [
      "abs/both",
      new AbsNode({ closeParen: symbol(), openParen: symbol(), parameterOne: symbol() }),
      absoluteXml(false, false),
    ],
    [
      "ceil/open",
      new CeilNode({ openParen: symbol(), parameterOne: symbol() }),
      fencedXml(null, "⌉"),
    ],
    [
      "ceil/close",
      new CeilNode({ closeParen: symbol(), parameterOne: symbol() }),
      fencedXml("⌈", null),
    ],
    [
      "ceil/both",
      new CeilNode({ closeParen: symbol(), openParen: symbol(), parameterOne: symbol() }),
      fencedXml(null, null),
    ],
    [
      "floor/open",
      new FloorNode({ openParen: symbol(), parameterOne: symbol() }),
      RUN_X + styledRun("⌋"),
    ],
    [
      "floor/close",
      new FloorNode({ closeParen: symbol(), parameterOne: symbol() }),
      styledRun("⌊") + RUN_X,
    ],
    [
      "floor/both",
      new FloorNode({ closeParen: symbol(), openParen: symbol(), parameterOne: symbol() }),
      RUN_X,
    ],
    [
      "norm/open",
      new NormNode({ openParen: symbol(), parameterOne: symbol() }),
      RUN_X + styledRun("∥"),
    ],
    [
      "norm/close",
      new NormNode({ closeParen: symbol(), parameterOne: symbol() }),
      styledRun("∥") + RUN_X,
    ],
    [
      "norm/both",
      new NormNode({ closeParen: symbol(), openParen: symbol(), parameterOne: symbol() }),
      RUN_X,
    ],
  ])("pins %s's measured delimiter suppression", (_case, node, expected) => {
    expectAtBothDisplayStyles(node as MathNode, expected as string);
  });

  it("renders Fenced's deterministic scalar, empty-composite, and bare-body cases", () => {
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: symbol("("),
        parameterTwo: symbol(),
        parameterThree: symbol(")"),
      }),
      fencedXml("(", ")"),
    );
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: new NumberNode({ value: "1" }),
        parameterTwo: [symbol()],
        parameterThree: new NumberNode({ value: "2" }),
      }),
      fencedXml("1", "2"),
    );
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: new TextNode({ parameterOne: "open" }),
        parameterTwo: [symbol()],
        parameterThree: new TextNode({ parameterOne: "close" }),
      }),
      fencedXml("open", "close"),
    );
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: new SymbolNode(),
        parameterTwo: [symbol()],
        parameterThree: new NumberNode(),
      }),
      fencedXml(null, null),
    );
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: new SymbolNode({ id: "Paren::Lround" }),
        parameterTwo: [symbol()],
        parameterThree: new SymbolNode({ id: "Paren::Rround" }),
      }),
      fencedXml("(", ")"),
    );

    for (const composite of [
      new FormulaNode({ value: [] }),
      new MrowNode({ value: [] }),
      new TableNode({ options: {}, value: [] }),
    ]) {
      expectDirectAndInsertion(
        new FencedNode({
          options: {},
          parameterOne: composite,
          parameterTwo: [symbol()],
          parameterThree: composite,
        }),
        fencedXml("[]", "[]"),
      );
    }

    for (const composite of [
      new FormulaNode({ value: ["x"] }),
      new MrowNode({ value: ["x"] }),
      new TableNode({ options: {}, value: ["x"] }),
    ]) {
      expectDirectAndInsertion(
        new FencedNode({
          options: {},
          parameterOne: composite,
          parameterTwo: [symbol()],
          parameterThree: composite,
        }),
        fencedXml("[&quot;x&quot;]", "[&quot;x&quot;]"),
      );
    }

    for (const kind of ["formula", "mrow", "table"] as const) {
      const composite = { kind, value: [null] } as unknown as MathNode;
      expectDirectAndInsertion(
        new FencedNode({
          options: {},
          parameterOne: composite,
          parameterTwo: [symbol()],
          parameterThree: composite,
        }),
        fencedXml("[nil]", "[nil]"),
      );
    }
  });

  it("pins Fenced's explicit empty and two-child body shapes", () => {
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: symbol("("),
        parameterTwo: [],
        parameterThree: symbol(")"),
      }),
      fencedXml("(", ")", null),
    );
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: symbol("("),
        parameterTwo: [symbol("x"), symbol("y")],
        parameterThree: symbol(")"),
      }),
      fencedXml("(", ")", RUN_X + RUN_Y),
    );
  });

  it.each([
    ["empty", "", "[&quot;&quot;]"],
    ["quote", '"', String.raw`[&quot;\&quot;&quot;]`],
    ["backslash", "\\", String.raw`[&quot;\\&quot;]`],
    ["controls", "\0\u0007\b\t\n\v\f\r\u001b", String.raw`[&quot;\u0000\a\b\t\n\v\f\r\e&quot;]`],
    ["hex controls", "\u000e\u001f\u007f", String.raw`[&quot;\u000E\u001F\u007F&quot;]`],
    ["unicode", "π", "[&quot;π&quot;]"],
    ["interpolation", "#{x} #@x #$x", String.raw`[&quot;\#{x} \#@x \#$x&quot;]`],
  ])("pins Fenced's Ruby string #inspect spelling for %s", (_case, value, paren) => {
    const composite = new FormulaNode({ value: [value] });
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: composite,
        parameterTwo: [symbol()],
        parameterThree: composite,
      }),
      fencedXml(paren, paren),
    );
  });

  it("pins the delimiter values Fenced reads and the shapes it refuses", () => {
    for (const [open, expected] of [
      [new TextNode({ parameterOne: "open" }), "open"],
      [new TextNode({ parameterOne: { a: "b" } }), "{&quot;a&quot; =&gt; &quot;b&quot;}"],
      [
        new TextNode({ parameterOne: ["a", 2, true, null] as never }),
        "[&quot;a&quot;, 2, true, nil]",
      ],
      [
        {
          kind: "formula",
          value: [5, true, null, ["a", 2], { a: "b" }],
        } as unknown as MathNode,
        "[5, true, nil, [&quot;a&quot;, 2], {&quot;a&quot; =&gt; &quot;b&quot;}]",
      ],
    ] as const) {
      expectDirectAndInsertion(
        new FencedNode({
          options: {},
          parameterOne: open,
          parameterTwo: [symbol()],
          parameterThree: symbol(")"),
        }),
        fencedXml(expected, ")"),
      );
    }

    expectRefusal(
      () =>
        toOmmlWithoutMathTag(
          new FencedNode({
            options: {},
            parameterOne: new FormulaNode({ value: [symbol()] }),
            parameterTwo: [symbol()],
            parameterThree: symbol(")"),
          }),
        ),
      {
        kind: "fenced",
        message:
          'fenced.parameterOne: holds a "formula" node whose value contains node objects with nondeterministic Ruby #inspect addresses',
      },
    );
    expectRefusal(
      () =>
        toOmmlWithoutMathTag(
          new FencedNode({
            options: {},
            parameterOne: "(",
            parameterTwo: [symbol()],
            parameterThree: ")",
          }),
        ),
      {
        kind: "fenced",
        message:
          'fenced.parameterOne: cannot read a value from the bare string "(" — the gem raises NoMethodError here',
      },
    );
    expectRefusal(
      () =>
        toOmmlWithoutMathTag(
          new FencedNode({
            options: {},
            parameterOne: new AbsNode({ parameterOne: symbol() }),
            parameterTwo: [symbol()],
            parameterThree: symbol(")"),
          }),
        ),
      {
        kind: "fenced",
        message:
          'fenced.parameterOne: a "abs" node has no value reader — the gem raises NoMethodError here',
      },
    );
    expectRefusal(
      () =>
        toOmmlWithoutMathTag(
          new FencedNode({
            options: {},
            parameterOne: symbol("("),
            parameterTwo: [null] as unknown as readonly MathNode[],
            parameterThree: symbol(")"),
          }),
        ),
      {
        kind: "fenced",
        message: "fenced.parameterTwo[0]: cannot insert nil — the gem raises NoMethodError here",
      },
    );
    expectRefusal(
      () =>
        toOmmlWithoutMathTag(
          new FencedNode({
            options: {},
            parameterOne: symbol("("),
            parameterTwo: "x",
            parameterThree: symbol(")"),
          }),
        ),
      {
        kind: "fenced",
        message:
          'fenced.parameterTwo[0]: cannot insert the bare string "x" — the gem raises NoMethodError here',
      },
    );
  });
});

/**
 * `Ms` is the ONE `UnaryFunction` subclass the gem gives a value reader:
 * `ms.rb:29-31` is `def value; parameter_one; end`. Measured over every class
 * under `Plurimath::Math::Function` at `00c52783`, exactly three define
 * `#value` — `Ms`, `Table` and `Text` — and the other two are already
 * delimiter carriers here. So a blanket "a unary function has no value reader"
 * refusal is false for this one class, and the gem really does render it.
 *
 * Measured at `00c52783`: `Fenced(Ms("open"), [x], nil)` gives
 * `<m:begChr m:val="open"/>`, `Fenced(nil, [x], Ms("close"))` gives
 * `<m:endChr m:val="close"/>`, and `Ms("&amp;#x28;")` gives
 * `<m:begChr m:val="("/>` — the same two decodes every other delimiter gets.
 */
describe("OMML fenced Ms delimiters", () => {
  const ms = (value: string) => new UnaryFunctionNode({ name: "Ms", parameterOne: value });

  it("renders an Ms open delimiter, which the gem reads through Ms#value", () => {
    expectDirectAndInsertion(fencedWithOpen(ms("open")), fencedXml("open", null));
  });

  it("renders an Ms close delimiter", () => {
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: null,
        parameterTwo: [symbol()],
        parameterThree: ms("close") as never,
      }),
      fencedXml(null, "close"),
    );
  });

  it("decodes an Ms delimiter's entities twice, as it does every other delimiter", () => {
    expectDirectAndInsertion(fencedWithOpen(ms("&amp;#x28;")), fencedXml("(", null));
  });

  it("still refuses a unary function that has no value reader", () => {
    expectRefusal(
      () => toOmmlWithoutMathTag(fencedWithOpen(new UnaryFunctionNode({ name: "Sin" }))),
      {
        kind: "fenced",
        message:
          'fenced.parameterOne: a "unaryFunction" node named "Sin" has no value reader — the gem raises NoMethodError here',
      },
    );
  });
});

/** A `Fenced` whose open delimiter is a hand-built carrier, with `x` for a body. */
function fencedWithOpen(open: unknown): MathNode {
  return new FencedNode({
    options: {},
    parameterOne: open as never,
    parameterTwo: [symbol()],
    parameterThree: null,
  });
}

/** A `Formula` delimiter holding one list, which the attribute write inspects. */
function fencedListDelimiter(value: readonly unknown[]): MathNode {
  return fencedWithOpen({ kind: "formula", value });
}

/**
 * `Fenced`'s delimiter attribute is entity-decoded TWICE, and both decodes
 * change the bytes. `Utility.html_entity_to_unicode` runs on what
 * `symbol_or_paren` returned (`fenced.rb:225`), and the XML wrapper runs it
 * again on every attribute it writes (`ox_engine/element.rb:104-110`). The
 * port did one decode and shipped `&#x28;` where the gem ships `(`.
 *
 * Every row below is the oracle's own `m:begChr` at `00c52783`, from
 * `Fenced.new(Symbols::Symbol.new(value), [x], nil, {})`. The `&`-carrying
 * outputs are verbatim: Ox escapes `<` inside an attribute and leaves `&`
 * alone, so `&nope;` really does reach the file spelled `&nope;`.
 */
describe("OMML fenced delimiter entity decoding", () => {
  it.each([
    ["a literal paren", "(", "("],
    ["one hex entity", "&#x28;", "("],
    ["one decimal entity written twice", "&amp;#40;", "("],
    ["a hex entity written twice", "&amp;#x28;", "("],
    ["a hex entity written three times", "&amp;amp;#x28;", "&#x28;"],
    ["one named entity", "&copy;", "©"],
    ["a named entity written twice", "&amp;copy;", "©"],
    ["a bare ampersand entity", "&amp;", "&"],
    ["an ampersand entity written twice", "&amp;amp;", "&"],
    ["a less-than entity written twice", "&amp;lt;", "&lt;"],
    ["an entity the xhtml1 table does not have", "&nope;", "&nope;"],
    ["an unknown entity written twice", "&amp;nope;", "&nope;"],
    ["an astral entity written twice", "&amp;#x1F600;", "😀"],
  ])("decodes %s", (_case, value, expected) => {
    expectDirectAndInsertion(fencedWithOpen(new SymbolNode({ value })), fencedXml(expected, null));
  });

  it.each([
    ["a surrogate entity", "&#xD800;", "invalid codepoint 0xD800 in UTF-8"],
    ["a surrogate entity written twice", "&amp;#xD800;", "invalid codepoint 0xD800 in UTF-8"],
    ["an out-of-range entity written twice", "&amp;#x110000;", "Invalid code point 1114112"],
  ])("refuses %s, where the gem raises RangeError", (_case, value, detail) => {
    expectRefusal(() => toOmmlWithoutMathTag(fencedWithOpen(new SymbolNode({ value }))), {
      kind: "fenced",
      message:
        "fenced.parameterOne: the entities here name a code point UTF-8 cannot hold — " +
        `the gem raises RangeError here (${detail})`,
    });
  });

  it("decodes a list twice only when the list itself holds a bare ampersand", () => {
    // `html_entity_to_unicode` returns its argument untouched unless
    // `include?("&")` is true, and on a list that is a MEMBER test. So the
    // first decode reaches the list's `#inspect` text only when some element
    // IS "&" — and then the second decode sees what the first left behind.
    expectDirectAndInsertion(
      fencedListDelimiter(["&", "&amp;#x28;"]),
      fencedXml("[&quot;&&quot;, &quot;(&quot;]", null),
    );
    expectDirectAndInsertion(
      fencedListDelimiter(["x", "&amp;#x28;"]),
      fencedXml("[&quot;x&quot;, &quot;&#x28;&quot;]", null),
    );
  });
});

/**
 * `Nary#chr_value` reaches the operator through TWO decodes that happen at
 * different moments, and only the second one reaches the attribute.
 *
 * `nary.rb:155-160` decodes once and tests THAT value as its suppression
 * predicate — `first_value = Utility.html_entity_to_unicode(...)`, then
 * `unless first_value == "∫"`. The attribute is decoded a second time when the
 * document is written: `ox_engine/element.rb:105-107` runs every attribute
 * through `html_entity_to_unicode` in `update_attrs`, and the Oga engine does
 * the same at `oga/dumper.rb:90`. So the predicate reads decode^1 while the
 * written value is decode^2, and an operator written double-encoded lands on
 * opposite sides of the two.
 *
 * Every row below is the oracle's own output at `00c52783`, measured over
 * `Nary(Symbol(v), x, x, x, {})`. The four double-encoded integrals are the
 * regression: one collapsed decode makes them equal the suppressed operator
 * and drops an element the gem emits.
 *
 * The pins are exact whole-document bytes. `toContain` cannot fail on a
 * MISSING element — the exact shape of this defect, and why the earlier
 * version of this block shipped green.
 */
describe("OMML Nary operator entity decoding", () => {
  const naryWith = (value: string) =>
    new NaryNode({
      options: {},
      parameterOne: new SymbolNode({ value }),
      parameterTwo: symbol(),
      parameterThree: symbol(),
      parameterFour: symbol(),
    });

  /** `NARY_X`'s shape with the operator substituted, or no `m:chr` at all. */
  const naryOperatorXml = (operator: string | null): string =>
    xml(
      "<m:nary>",
      "  <m:naryPr>",
      ...(operator === null ? [] : [`    <m:chr m:val="${operator}"/>`]),
      '    <m:limLoc m:val="subSup"/>',
      "    <m:ctrlPr>",
      "      <w:rPr>",
      '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
      "        <w:i/>",
      "      </w:rPr>",
      "    </m:ctrlPr>",
      "  </m:naryPr>",
      "  <m:sub>",
      "    <m:r>",
      "      <m:t>x</m:t>",
      "    </m:r>",
      "  </m:sub>",
      "  <m:sup>",
      "    <m:r>",
      "      <m:t>x</m:t>",
      "    </m:r>",
      "  </m:sup>",
      "  <m:e>",
      "    <m:r>",
      "      <m:t>x</m:t>",
      "    </m:r>",
      "  </m:e>",
      "</m:nary>",
    );

  // Written operator -> the gem's `m:chr` value, or `null` where the gem
  // suppresses the element. decode^1 is what the predicate tests.
  it.each([
    // decode^1 is already the integral: the gem suppresses.
    ["\u222b", null],
    ["&#x222b;", null],
    ["&#x222B;", null],
    ["&#8747;", null],
    ["&int;", null],
    // decode^1 is still an entity, so the gem does NOT suppress, and the
    // written value is decode^2 \u2014 the integral itself.
    ["&amp;#x222b;", "\u222b"],
    ["&amp;#x222B;", "\u222b"],
    ["&amp;#8747;", "\u222b"],
    ["&amp;int;", "\u222b"],
    // Operators unrelated to the suppressed one, decoded once and twice.
    ["&#x28;", "("],
    ["&amp;#x28;", "("],
    ["&amp;copy;", "\u00a9"],
    ["&amp;#x2211;", "\u2211"],
  ] as const)("renders the operator written as %s", (written, expected) => {
    expect(toOmmlWithoutMathTag(naryWith(written))).toBe(naryOperatorXml(expected));
  });
});

/**
 * Ruby's `String#inspect` escapes far more than the C0 controls and DEL the
 * port used to escape. Past the named escapes it copies a character through
 * only when `rb_enc_isprint` calls it printable, and that predicate reads
 * Onigmo's Unicode tables: C1 controls, U+2028/U+2029, unassigned code points
 * and noncharacters all escape, while NBSP, ZWSP, U+FEFF, U+061C, private use
 * and emoji do not. The spelling is `\uXXXX` up to U+FFFF and `\u{XXXXX}`
 * above it, and a run of escapes is never grouped.
 *
 * Each row is the oracle's own `m:begChr` at `00c52783`, from a `Formula`
 * delimiter holding one string. The escaped rows are what the port used to get
 * wrong: it emitted the raw character for every one of them.
 */
describe("OMML fenced delimiter Ruby #inspect escapes", () => {
  it.each([
    ["a C1 control at the low edge", [0x61, 0x80, 0x62], "a\\u0080b"],
    ["NEL", [0x61, 0x85, 0x62], "a\\u0085b"],
    ["a C1 control at the high edge", [0x61, 0x9f, 0x62], "a\\u009Fb"],
    ["the line separator", [0x61, 0x2028, 0x62], "a\\u2028b"],
    ["the paragraph separator", [0x61, 0x2029, 0x62], "a\\u2029b"],
    ["an unassigned BMP code point", [0x61, 0x378, 0x62], "a\\u0378b"],
    ["the code point just below the surrogates", [0x61, 0xd7ff, 0x62], "a\\uD7FFb"],
    ["a noncharacter in the Arabic block", [0x61, 0xfdd0, 0x62], "a\\uFDD0b"],
    ["a BMP noncharacter", [0x61, 0xfffe, 0x62], "a\\uFFFEb"],
    ["a supplementary noncharacter", [0x61, 0x10fffe, 0x62], "a\\u{10FFFE}b"],
    ["an unassigned supplementary code point", [0x61, 0x1000c, 0x62], "a\\u{1000C}b"],
    [
      "a run of escapes, which stays ungrouped",
      [0x378, 0x379, 0x10fffe, 0x10ffff],
      "\\u0378\\u0379\\u{10FFFE}\\u{10FFFF}",
    ],
    ["a hash before an escape, which stays bare", [0x23, 0x378], "#\\u0378"],
  ] as [string, number[], string][])("escapes %s", (_case, codepoints, inspected) => {
    expectDirectAndInsertion(
      fencedListDelimiter([String.fromCodePoint(...codepoints)]),
      fencedXml(`[&quot;${inspected}&quot;]`, null),
    );
  });

  it.each([
    ["a no-break space", 0xa0],
    ["a zero-width space", 0x200b],
    ["a byte-order mark", 0xfeff],
    ["an Arabic letter mark", 0x61c],
    ["a private-use code point", 0xf0000],
    ["an emoji", 0x1f600],
    ["an ideographic space", 0x3000],
  ] as [string, number][])("copies %s through", (_case, codepoint) => {
    const character = String.fromCodePoint(codepoint);
    expectDirectAndInsertion(
      fencedListDelimiter([`a${character}b`]),
      fencedXml(`[&quot;a${character}b&quot;]`, null),
    );
  });

  it("refuses a lone surrogate the gem would render as byte escapes", () => {
    expectRefusal(
      () => toOmmlWithoutMathTag(fencedListDelimiter([`a${String.fromCharCode(0xd800)}b`])),
      {
        kind: "fenced",
        message:
          'fenced.parameterOne[0]: a "formula" node contains the lone surrogate U+D800, ' +
          "which this port refuses rather than emit the gem's byte escapes",
      },
    );
  });
});

/**
 * `attributes && attributes[:accent]` — the guard seven accent kinds open
 * with. Both halves matter, and the port had both wrong: it read
 * `attributes.accent` straight, so an absent or nil carrier died as a
 * `TypeError` where the gem takes the no-accent branch, and a truthy non-hash
 * read `undefined` and took that branch where the gem raises.
 *
 * Measured on the oracle at `00c52783` over all eight accent kinds and ten
 * carriers each. `Ddot` is the control: it never reads attributes, so every
 * carrier renders.
 */
describe("OMML accent attribute carriers", () => {
  const accentKinds = ["bar", "dot", "hat", "tilde", "vec", "ul", "overleftrightarrow"];
  const refusedCarriers: [label: string, carrier: unknown, described: string][] = [
    ["an integer", 0, "a number"],
    ["an empty string", "", 'the bare string ""'],
    ["a list", [], "a list"],
    ["true", true, "a boolean"],
    ["a float", 1.5, "a number"],
  ];

  /** A hand-built accent node: the class constructors coerce `attributes` to a hash. */
  const accent = (kind: string, attributes?: unknown): MathNode => {
    const node: Record<string, unknown> = { kind, parameterOne: symbol() };
    if (attributes !== undefined) node.attributes = attributes;
    return node as unknown as MathNode;
  };

  it.each([...accentKinds, "ddot"])(
    "takes %s's no-accent branch for an absent, nil or false carrier",
    (kind) => {
      const forEmptyHash = toOmmlWithoutMathTag(accent(kind, {}));
      expect(toOmmlWithoutMathTag(accent(kind))).toBe(forEmptyHash);
      expect(toOmmlWithoutMathTag(accent(kind, null))).toBe(forEmptyHash);
      expect(toOmmlWithoutMathTag(accent(kind, false))).toBe(forEmptyHash);
      expect(forEmptyHash).not.toContain("<m:acc>");
      expect(forEmptyHash).not.toContain("<m:groupChr>");
    },
  );

  it.each(
    accentKinds.flatMap((kind) =>
      refusedCarriers.map(([label, carrier, described]): [string, string, unknown, string] => [
        kind,
        label,
        carrier,
        described,
      ]),
    ),
  )(
    "refuses %s carrying %s, which the gem indexes and raises on",
    (kind, _label, carrier, described) => {
      const member = kind === "ul" ? "accentunder" : "accent";
      expectRefusal(() => toOmmlWithoutMathTag(accent(kind, carrier)), {
        kind,
        message: `${kind}.attributes: cannot read :${member} from ${described} — the gem indexes it there and raises`,
      });
    },
  );

  it.each(refusedCarriers)(
    "leaves Ddot rendering for %s, which it never reads",
    (_label, carrier) => {
      expect(toOmmlWithoutMathTag(accent("ddot", carrier))).toBe(
        toOmmlWithoutMathTag(accent("ddot", {})),
      );
    },
  );
});

/**
 * `Fenced#to_omml_without_math_tag` wraps its body in
 * `Formula.new(Array(parameter_two))`, and `Ceil` reaches the same line
 * through `Fenced.new(lceil, Array(parameter_one), rceil)`. `Kernel#Array` is
 * not `[value]`: it takes a Hash's PAIRS, so an empty options hash — which
 * `NodeParameter` admits — collapses to an empty body rather than to an
 * uninsertable object. Measured on the oracle at `00c52783`.
 */
describe("OMML Kernel#Array on the fenced body", () => {
  it("renders an empty options hash as an empty body", () => {
    expectDirectAndInsertion(
      new FencedNode({
        options: {},
        parameterOne: symbol(),
        parameterTwo: {} as never,
        parameterThree: symbol(),
      }),
      fencedXml("x", "x", null),
    );
    expectDirectAndInsertion(
      new CeilNode({ parameterOne: {} as never }),
      fencedXml("⌈", "⌉", null),
    );
  });

  it.each([
    [
      "fenced",
      (): MathNode =>
        new FencedNode({
          options: {},
          parameterOne: symbol(),
          parameterTwo: { a: "b" } as never,
          parameterThree: symbol(),
        }),
      "fenced.parameterTwo[0]",
    ],
    [
      "ceil",
      (): MathNode => new CeilNode({ parameterOne: { a: "b" } as never }),
      "ceil.parameterOne[0]",
    ],
  ] as [string, () => MathNode, string][])(
    "refuses the pair a one-entry hash becomes in %s",
    (kind, build, at) => {
      expectRefusal(() => toOmmlWithoutMathTag(build()), {
        kind,
        message: `${at}: cannot insert a list — the gem raises NoMethodError here`,
      });
    },
  );
});

/**
 * `symbol_or_paren` hands back `field&.value` untouched, and the attribute
 * write sends `include?` and then `to_s` to whatever that is. `to_s` is
 * identity on a String and `#inspect` on a list or a hash — so a `Table`
 * delimiter holding a bare string renders that string unquoted, and one
 * holding a hash renders the hash's inspection. The port refused both.
 *
 * `Formula` and `Mrow` differ, and not in the renderer: `Fenced#initialize`
 * runs `ModelHelper.validate_left_right`, which sends `first` to the value of
 * any `Math::Formula` among the three slots. Those two carriers therefore
 * accept a list or a hash and raise on everything else, before rendering
 * starts. `Table` is not a `Math::Formula` and is exempt. All measured on the
 * oracle at `00c52783`.
 */
describe("OMML fenced delimiters that are not lists", () => {
  it.each([
    ["a bare string", "table", "raw", "raw"],
    ["an empty string", "table", "", ""],
    ["a hash", "table", { a: "b" }, "{&quot;a&quot; =&gt; &quot;b&quot;}"],
    ["an empty hash", "table", {}, "{}"],
    ["a doubly-encoded entity string", "table", "&amp;#x28;", "("],
    ["a hash", "formula", { a: "b" }, "{&quot;a&quot; =&gt; &quot;b&quot;}"],
    ["a hash", "mrow", { a: "b" }, "{&quot;a&quot; =&gt; &quot;b&quot;}"],
  ] as [string, string, unknown, string][])(
    "renders %s held by a %s carrier",
    (_case, kind, value, expected) => {
      expectDirectAndInsertion(fencedWithOpen({ kind, value }), fencedXml(expected, null));
    },
  );

  it("drops the tag for a Table carrying no value at all", () => {
    expectDirectAndInsertion(fencedWithOpen({ kind: "table", value: null }), fencedXml(null, null));
  });

  it("refuses a Table value the gem cannot send include? to", () => {
    expectRefusal(() => toOmmlWithoutMathTag(fencedWithOpen({ kind: "table", value: 7 })), {
      kind: "fenced",
      message:
        'fenced.parameterOne: a "table" node holds a number; the gem sends include? to it and raises NoMethodError here',
    });
  });

  it.each([
    ["formula", "a bare string", "raw", 'the bare string "raw"'],
    ["formula", "a number", 7, "a number"],
    ["formula", "nothing", null, "nil"],
    ["mrow", "a bare string", "raw", 'the bare string "raw"'],
  ] as [string, string, unknown, string][])(
    "refuses a %s carrier holding %s, which the gem's constructor rejects",
    (kind, _case, value, described) => {
      expectRefusal(() => toOmmlWithoutMathTag(fencedWithOpen({ kind, value })), {
        kind: "fenced",
        message:
          `fenced.parameterOne: a "${kind}" node holds ${described}, and the gem's Fenced ` +
          "constructor sends `first` to it before rendering — it raises NoMethodError there",
      });
    },
  );
});

/**
 * `symbol_or_paren` branches on `is_a?(Math::Symbols::Paren)` — the class
 * decides. `validate.ts` deliberately admits a concrete carrier with its
 * identity slot omitted, because the bare carrier IS a Ruby class, so a
 * `symbol` node can reach this renderer with no `id` at all. The port read
 * `id.startsWith` unguarded and died as a `TypeError` wrapped in a
 * `RenderError`; the gem treats such a carrier as the bare `Symbol`, which is
 * not a Paren — measured, `Fenced.new(Symbols::Symbol.new("("), [x], nil, {})`
 * emits `m:begChr m:val="("`.
 */
describe("OMML fenced delimiter carriers without an identity", () => {
  it.each([
    ["symbol", { kind: "symbol", value: "(" }, "("],
    ["text", { kind: "text", parameterOne: "open" }, "open"],
  ] as [string, unknown, string][])(
    "reads the value off a bare %s carrier",
    (_kind, carrier, expected) => {
      expectDirectAndInsertion(fencedWithOpen(carrier), fencedXml(expected, null));
    },
  );
});

/**
 * A recorded divergence, not a defect. Ruby's `#inspect` prints a recursion
 * marker for a self-referential delimiter — measured on the oracle at
 * `00c52783`, a `Table` holding a self-referential list emits
 * `m:begChr m:val="[[...]]"` and one holding a self-referential hash emits
 * `{"self" => {...}}` — while this port's global shape check rejects any
 * cyclic tree before a renderer sees it. The divergence and the trigger that
 * brings it back are in TODO.plan/deferred.md; this test pins the refusal so
 * the divergence cannot drift silently into something else.
 */
describe("OMML fenced delimiter recursion markers", () => {
  it("refuses a self-referential delimiter the gem prints a marker for", () => {
    const list: unknown[] = [];
    list.push(list);
    const hash: Record<string, unknown> = {};
    hash.self = hash;

    for (const [value, path] of [
      [list, "node.parameterOne.value[0]"],
      [hash, "node.parameterOne.value.self"],
    ] as [unknown, string][]) {
      expectRefusal(() => toOmmlWithoutMathTag(fencedWithOpen({ kind: "table", value })), {
        kind: "unknown",
        message: `${path}: the tree cycles — the value here is also its own ancestor, so no walk of it can terminate`,
      });
    }
  });
});

/**
 * Every accent kind opens by asking whether it has a base at all. The gem asks
 * with Ruby truthiness — `nil` and `false` both mean "no base" — and emits the
 * accent character alone as a bare run. Measured on the oracle at `00c52783`:
 * `Bar.new(nil)` and `Bar.new(false)` produce the same bare run, with no
 * `m:bar` wrapper on either.
 *
 * The port asked `=== null || === undefined`, so `false` fell through to the
 * accent path and wrapped a zero-width-space base in a full accent element.
 * Eight kinds read the base through the same Ruby-truthiness helper, so they
 * share this test.
 */
describe("OMML accents without a base", () => {
  it.each([
    ["bar", (v: NodeParameter) => new BarNode({ attributes: {}, parameterOne: v })],
    ["hat", (v: NodeParameter) => new HatNode({ attributes: {}, parameterOne: v })],
    ["dot", (v: NodeParameter) => new DotNode({ attributes: {}, parameterOne: v })],
    ["ddot", (v: NodeParameter) => new DdotNode({ attributes: {}, parameterOne: v })],
    ["tilde", (v: NodeParameter) => new TildeNode({ attributes: {}, parameterOne: v })],
    ["vec", (v: NodeParameter) => new VecNode({ attributes: {}, parameterOne: v })],
    ["ul", (v: NodeParameter) => new UlNode({ attributes: {}, parameterOne: v })],
    [
      "overleftrightarrow",
      (v: NodeParameter) => new OverleftrightarrowNode({ attributes: {}, parameterOne: v }),
    ],
  ] as const)("renders %s the same for a false base as for nil", (_kind, build) => {
    const forNil = toOmmlWithoutMathTag(build(null));
    const forFalse = toOmmlWithoutMathTag(build(false as unknown as NodeParameter));
    expect(forFalse).toBe(forNil);
    expect(forFalse).not.toContain("&#8203;");
  });
});

/**
 * `Fenced` reads its delimiters through a deterministic `#inspect`, which walks
 * a hash in insertion order. JavaScript hoists array-index keys ahead of
 * everything inserted before them, so that order is already gone by the time
 * the renderer sees the object and cannot be recovered at the emission site.
 * The shared guard from `core/ruby-semantics` refuses rather than emit an order
 * the gem would not produce.
 */
describe("OMML fenced delimiter hash ordering", () => {
  it("refuses a delimiter carrier holding an integer-like key", () => {
    const delimiters: Record<string, string> = {};
    delimiters.named = "open";
    delimiters["1"] = "close";
    expect(Object.keys(delimiters)[0]).toBe("1");

    const fenced = new FencedNode({
      options: {},
      parameterOne: new FormulaNode({ value: [delimiters as never] }),
      parameterTwo: [symbol()],
      parameterThree: symbol(")"),
    });
    expectRefusal(() => toOmmlWithoutMathTag(fenced), {
      kind: "fenced",
      message:
        "fenced.parameterOne[0].1: integer-like hash keys are deferred (TODO.plan/deferred.md) " +
        "because JavaScript object enumeration discards their insertion position, so Ruby hash " +
        "emission order cannot be reproduced",
    });
  });
});

describe("generated OMML symbol-data deferral", () => {
  it("uses a named Symbol's explicit value only on insertion", () => {
    const node = new SymbolNode({ id: "Plus", value: "WRONG" });
    expectRefusal(() => toOmmlWithoutMathTag(node), {
      kind: "symbol",
      message: 'Symbol "Plus" needs generated OMML data, deferred to the symbol-data follow-up',
    });
    expect(toOmml(new FormulaNode({ value: [node] }))).toBe(
      xml(
        ROOT_OPEN,
        "  <m:oMath>",
        "    <m:r>",
        "      <m:t>WRONG</m:t>",
        "    </m:r>",
        "  </m:oMath>",
        "</m:oMathPara>",
      ),
    );
  });

  it("refuses named Symbol output", () => {
    expectRefusal(() => toOmmlWithoutMathTag(new SymbolNode({ id: "Plus" })), {
      kind: "symbol",
      message: 'Symbol "Plus" needs generated OMML data, deferred to the symbol-data follow-up',
    });
  });

  it("refuses Text unicode substitutions", () => {
    expectRefusal(() => toOmmlWithoutMathTag(new TextNode({ parameterOne: "unicode[:kappa]" })), {
      kind: "text",
      message:
        "text.parameterOne: unicode[:name] substitution needs generated OMML data, deferred to the symbol-data follow-up",
    });
  });

  it("refuses a Table paren that needs the generated symbol value", () => {
    const node = new TableNode({
      closeParen: new SymbolNode({ id: "Paren::Rsquare" }),
      openParen: new SymbolNode({ id: "Paren::Lsquare" }),
      options: {},
      value: [tr(), tr()],
    });
    expectRefusal(() => toOmmlWithoutMathTag(node), {
      kind: "table",
      message:
        'table.openParen: Symbol "Paren::Lsquare" needs generated OMML data, deferred to the symbol-data follow-up',
    });

    const closeNode = new TableNode({
      closeParen: new SymbolNode({ id: "Paren::Rsquare" }),
      openParen: symbol("["),
      options: {},
      value: [tr(), tr()],
    });
    expectRefusal(() => toOmmlWithoutMathTag(closeNode), {
      kind: "table",
      message:
        'table.closeParen: Symbol "Paren::Rsquare" needs generated OMML data, deferred to the symbol-data follow-up',
    });

    const valuedOpenNode = new TableNode({
      closeParen: symbol("]"),
      openParen: new SymbolNode({ id: "Paren::Lsquare", value: "WRONG" }),
      options: {},
      value: [tr(), tr()],
    });
    expectRefusal(() => toOmmlWithoutMathTag(valuedOpenNode), {
      kind: "table",
      message:
        'table.openParen: Symbol "Paren::Lsquare" needs generated OMML data, deferred to the symbol-data follow-up',
    });
  });

  it("refuses a Nary operator that needs the generated symbol value", () => {
    const node = new NaryNode({
      options: {},
      parameterOne: new SymbolNode({ id: "Sum" }),
      parameterTwo: symbol(),
      parameterThree: symbol(),
      parameterFour: symbol(),
    });
    expectRefusal(() => toOmmlWithoutMathTag(node), {
      kind: "nary",
      message:
        'nary.parameterOne: Symbol "Sum" needs generated OMML data, deferred to the symbol-data follow-up',
    });

    const valuedNode = new NaryNode({
      options: {},
      parameterOne: new SymbolNode({ id: "Sum", value: "WRONG" }),
      parameterTwo: symbol(),
      parameterThree: symbol(),
      parameterFour: symbol(),
    });
    expect(toOmmlWithoutMathTag(valuedNode)).toBe(
      NARY_X.replace('m:chr m:val="x"', 'm:chr m:val="WRONG"'),
    );
  });
});

describe("OMML partial refusal boundary", () => {
  const omittedKinds = [
    "color",
    "fontStyle",
    "linebreak",
    "mpadded",
    "sqrt",
  ] as const satisfies readonly NodeKind[];

  it.each(omittedKinds)("refuses omitted kind %s", (kind) => {
    expectRefusal(() => ROOT_CONTEXT.render({ kind } as MathNode), {
      kind,
      message: `OMML rendering for node kind "${kind}" is outside the measured OMML slices`,
    });
  });

  it("refuses a non-Formula public root", () => {
    expectRefusal(() => toOmml(symbol()), {
      kind: "symbol",
      message: 'to_omml is defined on Formula and its subclasses only — received "symbol"',
    });
  });

  it("refuses unmeasured carrier aliases instead of transforming their names", () => {
    expectRefusal(
      () => toOmmlWithoutMathTag(new UnaryFunctionNode({ name: "Sin", parameterOne: symbol() })),
      {
        kind: "unaryFunction",
        message: 'UnaryFunction alias "Sin" has not been measured for OMML in this slice',
      },
    );
    expectRefusal(
      () =>
        toOmmlWithoutMathTag(
          new BinaryFunctionNode({
            name: "Overset",
            parameterOne: symbol(),
            parameterTwo: symbol(),
          }),
        ),
      {
        kind: "binaryFunction",
        message: 'BinaryFunction alias "Overset" has not been measured for OMML in this slice',
      },
    );
    expectRefusal(
      () => toOmmlWithoutMathTag(new FormulaNode({ name: "Mstyle", value: [symbol()] })),
      {
        kind: "formula",
        message: 'Formula alias "Mstyle" has not been measured for OMML in this slice',
      },
    );
  });
});

/**
 * Parity pins for the degenerate shapes the conformance corpus never builds:
 * ragged tables, control characters inside `Text`, the `Nary` operator
 * attribute, `hide_function_name`, and a Ruby-`false` parameter slot.
 *
 * Every expected string below is the oracle's own answer at `00c52783`,
 * captured by building the identical tree in Ruby and dumping it — the probe
 * and its raw output live with the task notes. None of these shapes appears in
 * the corpus, which is why the renderer was wrong on all five and green.
 */

const cellTd = (value: string): BinaryFunctionNode =>
  new BinaryFunctionNode({ name: "Td", parameterOne: [symbol(value)] });

const cellTr = (...values: readonly string[]): UnaryFunctionNode =>
  new UnaryFunctionNode({ name: "Tr", parameterOne: values.map(cellTd) });

const cellTable = (rows: readonly UnaryFunctionNode[]): TableNode =>
  new TableNode({
    closeParen: symbol("]"),
    openParen: symbol("["),
    options: {},
    value: rows,
  });

/** `[1] / [2, 3]` — one cell then two. `m:count` follows the FIRST row. */
const RAGGED_1_2_X = xml(
  "<m:d>",
  "  <m:dPr>",
  '    <m:begChr m:val="["/>',
  '    <m:endChr m:val="]"/>',
  '    <m:sepChr m:val=""/>',
  "    <m:grow/>",
  "  </m:dPr>",
  "  <m:e>",
  "    <m:m>",
  "      <m:mPr>",
  "        <m:mcs>",
  "          <m:mc>",
  "            <m:mcPr>",
  '              <m:count m:val="1"/>',
  '              <m:mcJc m:val="center"/>',
  "            </m:mcPr>",
  "          </m:mc>",
  "        </m:mcs>",
  "        <m:ctrlPr>",
  "          <w:rPr>",
  '            <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "            <w:i/>",
  "          </w:rPr>",
  "        </m:ctrlPr>",
  "      </m:mPr>",
  "      <m:e>",
  "        <m:r>",
  "          <m:t>1</m:t>",
  "        </m:r>",
  "      </m:e>",
  "      <m:mr>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>2</m:t>",
  "          </m:r>",
  "        </m:e>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>3</m:t>",
  "          </m:r>",
  "        </m:e>",
  "      </m:mr>",
  "    </m:m>",
  "  </m:e>",
  "</m:d>",
);

/** `[1, 2] / [3]` — the ragged row is the LAST one, and `m:count` is 2. */
const RAGGED_2_1_X = xml(
  "<m:d>",
  "  <m:dPr>",
  '    <m:begChr m:val="["/>',
  '    <m:endChr m:val="]"/>',
  '    <m:sepChr m:val=""/>',
  "    <m:grow/>",
  "  </m:dPr>",
  "  <m:e>",
  "    <m:m>",
  "      <m:mPr>",
  "        <m:mcs>",
  "          <m:mc>",
  "            <m:mcPr>",
  '              <m:count m:val="2"/>',
  '              <m:mcJc m:val="center"/>',
  "            </m:mcPr>",
  "          </m:mc>",
  "        </m:mcs>",
  "        <m:ctrlPr>",
  "          <w:rPr>",
  '            <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "            <w:i/>",
  "          </w:rPr>",
  "        </m:ctrlPr>",
  "      </m:mPr>",
  "      <m:mr>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>1</m:t>",
  "          </m:r>",
  "        </m:e>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>2</m:t>",
  "          </m:r>",
  "        </m:e>",
  "      </m:mr>",
  "      <m:e>",
  "        <m:r>",
  "          <m:t>3</m:t>",
  "        </m:r>",
  "      </m:e>",
  "    </m:m>",
  "  </m:e>",
  "</m:d>",
);

/** `[1] / [2, 3] / [4, 5, 6]` — three different widths in one matrix. */
const RAGGED_1_2_3_X = xml(
  "<m:d>",
  "  <m:dPr>",
  '    <m:begChr m:val="["/>',
  '    <m:endChr m:val="]"/>',
  '    <m:sepChr m:val=""/>',
  "    <m:grow/>",
  "  </m:dPr>",
  "  <m:e>",
  "    <m:m>",
  "      <m:mPr>",
  "        <m:mcs>",
  "          <m:mc>",
  "            <m:mcPr>",
  '              <m:count m:val="1"/>',
  '              <m:mcJc m:val="center"/>',
  "            </m:mcPr>",
  "          </m:mc>",
  "        </m:mcs>",
  "        <m:ctrlPr>",
  "          <w:rPr>",
  '            <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "            <w:i/>",
  "          </w:rPr>",
  "        </m:ctrlPr>",
  "      </m:mPr>",
  "      <m:e>",
  "        <m:r>",
  "          <m:t>1</m:t>",
  "        </m:r>",
  "      </m:e>",
  "      <m:mr>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>2</m:t>",
  "          </m:r>",
  "        </m:e>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>3</m:t>",
  "          </m:r>",
  "        </m:e>",
  "      </m:mr>",
  "      <m:mr>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>4</m:t>",
  "          </m:r>",
  "        </m:e>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>5</m:t>",
  "          </m:r>",
  "        </m:e>",
  "        <m:e>",
  "          <m:r>",
  "            <m:t>6</m:t>",
  "          </m:r>",
  "        </m:e>",
  "      </m:mr>",
  "    </m:m>",
  "  </m:e>",
  "</m:d>",
);

const SINGLE_CELL_ROW_X = xml("<m:e>", "  <m:r>", "    <m:t>1</m:t>", "  </m:r>", "</m:e>");
const EMPTY_ROW_X = xml("<m:mr/>");

describe("OMML ragged tables", () => {
  it("renders a matrix when only the first row is single-celled", () => {
    expect(toOmmlWithoutMathTag(cellTable([cellTr("1"), cellTr("2", "3")]))).toBe(RAGGED_1_2_X);
  });

  it("renders a matrix when a later row is single-celled", () => {
    expect(toOmmlWithoutMathTag(cellTable([cellTr("1", "2"), cellTr("3")]))).toBe(RAGGED_2_1_X);
  });

  it("renders three different row widths in one matrix", () => {
    expect(
      toOmmlWithoutMathTag(cellTable([cellTr("1"), cellTr("2", "3"), cellTr("4", "5", "6")])),
    ).toBe(RAGGED_1_2_3_X);
  });

  it("drops the m:mr wrapper for a one-cell row and keeps it for an empty one", () => {
    expect(toOmmlWithoutMathTag(cellTr("1"))).toBe(SINGLE_CELL_ROW_X);
    expect(toOmmlWithoutMathTag(new UnaryFunctionNode({ name: "Tr", parameterOne: [] }))).toBe(
      EMPTY_ROW_X,
    );
  });

  it("still defers eqArr when EVERY row is single-celled", () => {
    for (const rows of [[cellTr("1")], [cellTr("1"), cellTr("2")]]) {
      expectRefusal(() => toOmmlWithoutMathTag(cellTable(rows)), {
        kind: "table",
        message:
          "table.value: the single-column eqArr branch is deferred until separately measured",
      });
    }
  });

  // A row-less table is the same gem path, not a separate one: `[].all?` is
  // true, so `single_table?` holds and `Table.new([])` renders an `m:eqArr`
  // carrying only its `m:eqArrPr` — measured on the oracle at `00c52783`. It
  // must therefore reach the eqArr deferral and report that reason, rather
  // than a second refusal of its own.
  it("defers eqArr for a table with no rows at all", () => {
    expectRefusal(() => toOmmlWithoutMathTag(cellTable([])), {
      kind: "table",
      message: "table.value: the single-column eqArr branch is deferred until separately measured",
    });
  });
});

/**
 * `<m:t>` bodies for every C0 control, the space (which becomes NBSP before
 * encoding) and DEL. Measured one codepoint at a time; the lowercase,
 * UNPADDED spelling is `HTMLEntities`', and is what distinguishes this layer
 * from Ox's four-digit `&#x000b;`.
 */
const CONTROL_TEXT_BODIES: readonly (readonly [string, number, string])[] = [
  ["U+0000", 0x00, "&#x0;"],
  ["U+0001", 0x01, "&#x1;"],
  ["U+0002", 0x02, "&#x2;"],
  ["U+0003", 0x03, "&#x3;"],
  ["U+0004", 0x04, "&#x4;"],
  ["U+0005", 0x05, "&#x5;"],
  ["U+0006", 0x06, "&#x6;"],
  ["U+0007", 0x07, "&#x7;"],
  ["U+0008", 0x08, "&#x8;"],
  ["U+0009", 0x09, "&#x9;"],
  ["U+000A", 0x0a, "&#xa;"],
  ["U+000B", 0x0b, "&#xb;"],
  ["U+000C", 0x0c, "&#xc;"],
  ["U+000D", 0x0d, "&#xd;"],
  ["U+000E", 0x0e, "&#xe;"],
  ["U+000F", 0x0f, "&#xf;"],
  ["U+0010", 0x10, "&#x10;"],
  ["U+0011", 0x11, "&#x11;"],
  ["U+0012", 0x12, "&#x12;"],
  ["U+0013", 0x13, "&#x13;"],
  ["U+0014", 0x14, "&#x14;"],
  ["U+0015", 0x15, "&#x15;"],
  ["U+0016", 0x16, "&#x16;"],
  ["U+0017", 0x17, "&#x17;"],
  ["U+0018", 0x18, "&#x18;"],
  ["U+0019", 0x19, "&#x19;"],
  ["U+001A", 0x1a, "&#x1a;"],
  ["U+001B", 0x1b, "&#x1b;"],
  ["U+001C", 0x1c, "&#x1c;"],
  ["U+001D", 0x1d, "&#x1d;"],
  ["U+001E", 0x1e, "&#x1e;"],
  ["U+001F", 0x1f, "&#x1f;"],
  ["U+0020", 0x20, "&#xa0;"],
  ["U+007F", 0x7f, "&#x7f;"],
];

describe("OMML Text control-character encoding", () => {
  it.each(CONTROL_TEXT_BODIES)("encodes %s as its own hex reference", (_label, codepoint, body) => {
    expect(
      toOmmlWithoutMathTag(new TextNode({ parameterOne: String.fromCodePoint(codepoint) })),
    ).toBe(xml(`<m:t>${body}</m:t>`));
  });

  it("leaves printable ASCII alone apart from the five basic entities", () => {
    expect(
      toOmmlWithoutMathTag(new TextNode({ parameterOne: "~!#$%()*+,-./0:;=?@[\\]^_`{|}" })),
    ).toBe(xml("<m:t>~!#$%()*+,-./0:;=?@[\\]^_`{|}</m:t>"));
    expect(toOmmlWithoutMathTag(new TextNode({ parameterOne: ">" }))).toBe(
      xml("<m:t>&#x3e;</m:t>"),
    );
    expect(toOmmlWithoutMathTag(new TextNode({ parameterOne: "&#x20;" }))).toBe(
      xml("<m:t> </m:t>"),
    );
  });

  it("encodes an astral character from its own codepoint", () => {
    expect(toOmmlWithoutMathTag(new TextNode({ parameterOne: "\u{1D400}" }))).toBe(
      xml("<m:t>&#x1d400;</m:t>"),
    );
  });

  it("carries a control character through a parsed formula", () => {
    expect(toOmml(parseAsciimath(`text(a${String.fromCodePoint(1)}b)`))).toBe(
      publicText("a&#x1;b"),
    );
    expect(toOmml(parseAsciimath(`"a${String.fromCodePoint(0x7f)}b"`))).toBe(
      publicText("a&#x7f;b"),
    );
  });
});

const NARY_INTEGRAL_X = xml(
  "<m:nary>",
  "  <m:naryPr>",
  '    <m:limLoc m:val="subSup"/>',
  "    <m:ctrlPr>",
  "      <w:rPr>",
  '        <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>',
  "        <w:i/>",
  "      </w:rPr>",
  "    </m:ctrlPr>",
  "  </m:naryPr>",
  "  <m:sub>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:sub>",
  "  <m:sup>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:sup>",
  "  <m:e>",
  "    <m:r>",
  "      <m:t>x</m:t>",
  "    </m:r>",
  "  </m:e>",
  "</m:nary>",
);

const naryOperator = (value: string | null): NaryNode =>
  new NaryNode({
    options: {},
    parameterOne: value === null ? null : symbol(value),
    parameterTwo: symbol(),
    parameterThree: symbol(),
    parameterFour: symbol(),
  });

describe("OMML Nary operator attribute", () => {
  it.each(["∫", "&#x222b;", "&#x222B;"])("suppresses m:chr for the integral %s", (value) => {
    expect(toOmmlWithoutMathTag(naryOperator(value))).toBe(NARY_INTEGRAL_X);
  });

  it.each(["∑", "&#x2211;"])("writes the decoded character for %s", (value) => {
    expect(toOmmlWithoutMathTag(naryOperator(value))).toBe(
      NARY_X.replace('m:chr m:val="x"', 'm:chr m:val="∑"'),
    );
  });

  it("keeps the empty m:chr for a nil operator", () => {
    expect(toOmmlWithoutMathTag(naryOperator(null))).toBe(
      NARY_X.replace('m:chr m:val="x"', 'm:chr m:val=""'),
    );
  });
});

describe("OMML UnaryFunction hide_function_name", () => {
  const carrier = (hideFunctionName?: boolean): UnaryFunctionNode =>
    new UnaryFunctionNode({ name: "UnaryFunction", parameterOne: symbol(), hideFunctionName });

  it("drops the whole m:func wrapper when the flag is set", () => {
    expect(toOmmlWithoutMathTag(carrier(true))).toBe(RUN_X);
  });

  it("keeps the wrapper when the flag is false or unset", () => {
    expect(toOmmlWithoutMathTag(carrier(false))).toBe(UNARY_X);
    expect(toOmmlWithoutMathTag(carrier())).toBe(UNARY_X);
  });
});

describe("OMML Ruby-false parameter slots", () => {
  const RubyFalse = false as unknown as NodeParameter;
  const falseSlotCases: readonly {
    readonly den: readonly string[];
    readonly name: string;
    readonly num: readonly string[];
    readonly parameterOne: NodeParameter;
    readonly parameterTwo: NodeParameter;
  }[] = [
    {
      den: ["x"],
      name: "parameterOne",
      num: ["&#8203;"],
      parameterOne: RubyFalse,
      parameterTwo: symbol(),
    },
    {
      den: ["&#8203;"],
      name: "parameterTwo",
      num: ["x"],
      parameterOne: symbol(),
      parameterTwo: RubyFalse,
    },
    {
      den: ["&#8203;"],
      name: "both slots",
      num: ["&#8203;"],
      parameterOne: RubyFalse,
      parameterTwo: RubyFalse,
    },
  ];

  it.each(falseSlotCases)("renders a Frac whose $name is false", (fixture) => {
    expect(
      toOmmlWithoutMathTag(
        new FracNode({
          parameterOne: fixture.parameterOne,
          parameterTwo: fixture.parameterTwo,
        }),
      ),
    ).toBe(
      structuralContractXml("f", [
        ["num", fixture.num],
        ["den", fixture.den],
      ]),
    );
  });

  it("renders a Nary whose limits are false, with no subHide or supHide", () => {
    expect(
      toOmmlWithoutMathTag(
        new NaryNode({
          options: {},
          parameterOne: symbol(),
          parameterTwo: RubyFalse,
          parameterThree: RubyFalse,
          parameterFour: RubyFalse,
        }),
      ),
    ).toBe(naryContractXml([["&#8203;"], ["&#8203;"], ["&#8203;"]], [symbol(), symbol()]));
  });
});
