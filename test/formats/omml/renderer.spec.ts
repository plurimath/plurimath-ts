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
  BaseNode,
  BinaryFunctionNode,
  FormulaNode,
  FracNode,
  MrowNode,
  NaryNode,
  NumberNode,
  SymbolNode,
  TableNode,
  TernaryFunctionNode,
  TextNode,
  UnaryFunctionNode,
} from "../../../src/core/nodes";
import { parseAsciimath } from "../../../src/formats/asciimath/index";
import { ROOT_CONTEXT } from "../../../src/formats/omml/render";
import { toOmml, toOmmlWithoutMathTag } from "../../../src/formats/omml/renderer";

const xml = (...lines: readonly string[]): string => `${lines.join("\n")}\n`;
const symbol = (value = "x") => new SymbolNode({ value });

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

function contractSlot(tag: string, values: readonly string[]): readonly string[] {
  if (values.length === 0) return [`  <m:${tag}/>`];
  return [
    `  <m:${tag}>`,
    ...values.flatMap((value) => ["    <m:r>", `      <m:t>${value}</m:t>`, "    </m:r>"]),
    `  </m:${tag}>`,
  ];
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

describe("OMML first-slice refusal boundary", () => {
  const omittedKinds = [
    "abs",
    "bar",
    "ceil",
    "color",
    "ddot",
    "dot",
    "fenced",
    "floor",
    "fontStyle",
    "hat",
    "int",
    "linebreak",
    "mpadded",
    "norm",
    "obrace",
    "oint",
    "overleftrightarrow",
    "overset",
    "prod",
    "sqrt",
    "sum",
    "tilde",
    "ubrace",
    "ul",
    "underset",
    "vec",
  ] as const satisfies readonly NodeKind[];

  it.each(omittedKinds)("refuses omitted kind %s", (kind) => {
    expectRefusal(() => ROOT_CONTEXT.render({ kind } as MathNode), {
      kind,
      message: `OMML rendering for node kind "${kind}" is outside the measured first slice`,
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
