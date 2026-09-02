/**
 * Per-format wiring for `render-parity.spec.ts` and `degenerate-slots.spec.ts`.
 *
 * Everything here is a PIN, not a knob. Each table names the exact subjects the
 * two specs expect to see, so a change in either direction — a case that starts
 * rendering, one that stops, a row whose bytes move, a kind the generator sweeps
 * that this file cannot build — fails in a test that names it. Pinning two
 * integers instead let equal-sized swaps (one case regressed, one improved) pass
 * while naming neither, which is the shape of defect these tables exist to catch.
 */
import * as C from "../../../src/core/index";
import { toOmml } from "../../../src/formats/omml/renderer";

export const FORMAT = "omml";
export const RENDER = (node: never): string =>
  toOmml(new C.FormulaNode({ value: [node] }) as never);

/**
 * The `m:oMathPara` open tag every `to_omml` document carries, written out here
 * rather than read back from a fixture or from `src/formats/omml/renderer.ts`.
 * A pin that sourced it from the thing under test would move with it.
 */
const OMATH_PARA_OPEN =
  '<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">';

/** One whole `to_omml` document: the open tag, the body lines, the close, a newline. */
const doc = (...lines: readonly string[]): string =>
  `${[OMATH_PARA_OPEN, ...lines, "</m:oMathPara>"].join("\n")}\n`;

/**
 * Cases where the port deliberately differs from the gem, keyed by corpus id.
 * Each must have an entry in TODO.plan/deferred.md.
 *
 * `portOutput` is the port's EXACT bytes today. Asserting only "not the gem's
 * bytes" accepted any corruption at all — a renderer that returned the empty
 * string, or the wrong node's render, satisfied it. Pinned both ways: if the
 * port's own output moves, or if it starts matching the gem, this fails and the
 * entry is revisited.
 */
export const KNOWN_DIVERGENCES: Readonly<
  Record<string, { readonly reason: string; readonly portOutput: string }>
> = {
  "text-unitsml-valid": {
    reason:
      "UnitsML is deferred wholesale (ARCHITECTURE.md §5, TODO.plan/deferred.md); the grammar rule is present but commented out, so unitsml(kg) degrades to the literal text and the gem's kg run is never reached",
    portOutput: doc(
      "  <m:oMath>",
      "    <m:r>",
      "      <m:rPr>",
      '        <m:sty m:val="p"/>',
      "      </m:rPr>",
      "      <m:t>unitsml(kg)</m:t>",
      "    </m:r>",
      "  </m:oMath>",
    ),
  },
};

/**
 * Corpus cases the gem renders and this port refuses — the OMML slice's gap,
 * enumerated rather than counted.
 *
 * A count let a regression and an improvement cancel out, and named neither. An
 * id here that renders, or one absent from here that refuses, fails in that
 * case's own test. Shrinking this list is the work; each removal belongs to the
 * commit that earns it.
 *
 * Measured at 50 ids against the pinned oracle: 37 are the generated
 * symbol-data gap (`Symbol "…" needs generated OMML data`), 6 an unmeasured
 * UnaryFunction alias, 6 an unmeasured BinaryFunction alias, and one the
 * deferred single-column `m:eqArr` table branch.
 */
export const PORT_REFUSES: ReadonlySet<string> = new Set([
  "colour-in-sum",
  "fence-round-expression",
  "fence-square-pair",
  "fence-round-triple",
  "fence-over-number",
  "font-mixed",
  "frac-fenced-numerator",
  "frac-fenced-denominator",
  "frac-sum-of-fracs",
  "left-right-round",
  "left-right-square",
  "left-right-around-frac",
  "matrix-column",
  "matrix-two-by-two",
  "mixed-implicit-product",
  "mixed-greek-sequence",
  "mixed-function-definition",
  "mixed-binomial-square",
  "mixed-sum-of-cubes",
  "mod-simple",
  "mod-numeric",
  "mod-in-expression",
  "nary-log-base",
  "nary-lim",
  "nary-sum-bounded",
  "nary-prod-bounded",
  "operator-plus",
  "operator-asterisk",
  "operator-minus",
  "operator-equals",
  "operator-plus-chain",
  "permissive-trailing-caret",
  "permissive-unopened-paren",
  "permissive-closing-run",
  "permissive-bare-dollar",
  "permissive-frac-then-operator",
  "power-fenced-exponent",
  "subscript-fenced",
  "root-sqrt-expression",
  "root-sqrt-pythagoras",
  "root-cube",
  "symbol-greek-alpha",
  "symbol-greek-pi",
  "symbol-greek-sigma",
  "symbol-infinity",
  "unary-sin-fenced",
  "unary-sin-bare",
  "unary-cos-product",
  "whitespace-around-operator",
  "whitespace-in-subscript",
]);

/**
 * How many of the gem-renderable corpus cases the port renders today.
 *
 * Derived from `PORT_REFUSES`, and cross-checked against it by the spec: the
 * two disagree only when one was edited without the other.
 */
export const RENDERED_BASELINE = 41;

/**
 * What fills a slot that is NOT the one being swept, by the slot's declared
 * type. Mirrors `FILLERS` in the generator; the spec pins the type list per
 * sweep entry, so a builder that fills a sequence slot with a bare node fails
 * in a test that names the entry rather than as a byte mismatch further down.
 */
export type SlotFiller = "node" | "sequence" | "string";

const sym = () => new C.SymbolNode({ value: "a" });
const FILL: Readonly<Record<SlotFiller, () => unknown>> = {
  node: () => sym(),
  sequence: () => [sym()],
  string: () => "a",
};

const at = (slot: number, value: unknown, slots: readonly SlotFiller[]): unknown[] => {
  const args: unknown[] = slots.map((type) => FILL[type]());
  args[slot] = value === undefined ? sym() : value;
  return args;
};

/** One sweep entry: which renderer it exercises, and how to build its node. */
export interface DegenerateKind {
  /** The `src/render/<kind>/omml.ts` this entry exercises. */
  readonly renderKind: C.NodeKind;
  /** The concrete Ruby class the generator instantiated, fully qualified. */
  readonly rubyClass: string;
  /** Positional slots, by filler type. Must equal the generator's list. */
  readonly slots: readonly SlotFiller[];
  readonly build: (slot: number, value: unknown) => unknown;
}

/**
 * Sweep id -> the renderer it covers, the Ruby class it mirrors, its slot
 * shape, and a builder placing `value` in `slot`. Mirrors the `SWEEP` table in
 * `scripts/probe-degenerate-slots.rb`, and the spec REQUIRES the two to agree
 * entry for entry — on `renderKind`, on `rubyClass`, and on `slots`.
 *
 * **Every landed OMML renderer must appear as some entry's `renderKind`.** The
 * spec reads the `src/render` inventory itself and fails naming any renderer no
 * entry covers. Before that check existed both tables were hand lists holding
 * 21 of the 38 landed renderers, so a failure injected into `linebreak` — which
 * `src/formats/omml/render.ts` registers and neither hand list named — left both
 * OMML parity specs green at 327/327.
 *
 * More than one entry may name the same renderer where the Ruby side reaches it
 * through several classes with different constructors: `binaryFunction` is
 * swept as both `power` and `td`, `unaryFunction` as both `sin` and `tr`, and
 * the two differ in slot shape as well as in what the OMML slice has measured.
 *
 * A kind absent here used to be skipped silently. `power` was in the generator
 * and not here, so its 14 rows ran, asserted nothing, and reported green — the
 * "every kind × slot" claim in the spec header was false for 14 of 196 rows.
 * The slot shape is carried here rather than hidden in each closure so this
 * file, which no generator writes, independently determines the size and shape
 * of the expected matrix: a truncated fixture cannot agree with it.
 */
export const NODE_FOR: Readonly<Record<string, DegenerateKind>> = {
  frac: {
    renderKind: "frac",
    rubyClass: "Plurimath::Math::Function::Frac",
    slots: ["node", "node"],
    build: (s, v) => {
      const [a, b] = at(s, v, ["node", "node"]);
      return new C.FracNode({ parameterOne: a, parameterTwo: b } as never);
    },
  },
  base: {
    renderKind: "base",
    rubyClass: "Plurimath::Math::Function::Base",
    slots: ["node", "node"],
    build: (s, v) => {
      const [a, b] = at(s, v, ["node", "node"]);
      return new C.BaseNode({ parameterOne: a, parameterTwo: b } as never);
    },
  },
  /**
   * Ruby's `Math::Function::Power` is one of the 14 aliased binary functions the
   * port carries as `BinaryFunctionNode` plus the class basename (nodes.ts §
   * BinaryFunctionNode), so there is no `PowerNode` to reach for.
   */
  power: {
    renderKind: "binaryFunction",
    rubyClass: "Plurimath::Math::Function::Power",
    slots: ["node", "node"],
    build: (s, v) => {
      const [a, b] = at(s, v, ["node", "node"]);
      return new C.BinaryFunctionNode({
        name: "Power",
        parameterOne: a,
        parameterTwo: b,
      } as never);
    },
  },
  /** `Td` fills its first slot from a node LIST, where `Power` takes a node. */
  td: {
    renderKind: "binaryFunction",
    rubyClass: "Plurimath::Math::Function::Td",
    slots: ["sequence", "node"],
    build: (s, v) => {
      const [a, b] = at(s, v, ["sequence", "node"]);
      return new C.BinaryFunctionNode({
        name: "Td",
        parameterOne: a,
        parameterTwo: b,
      } as never);
    },
  },
  nary: {
    renderKind: "nary",
    rubyClass: "Plurimath::Math::Function::Nary",
    slots: ["node", "node", "node", "node"],
    build: (s, v) => {
      const [a, b, c, d] = at(s, v, ["node", "node", "node", "node"]);
      return new C.NaryNode({
        parameterOne: a,
        parameterTwo: b,
        parameterThree: c,
        parameterFour: d,
      } as never);
    },
  },
  obrace: {
    renderKind: "obrace",
    rubyClass: "Plurimath::Math::Function::Obrace",
    slots: ["node"],
    build: (s, v) =>
      new C.ObraceNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  ubrace: {
    renderKind: "ubrace",
    rubyClass: "Plurimath::Math::Function::Ubrace",
    slots: ["node"],
    build: (s, v) =>
      new C.UbraceNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  bar: {
    renderKind: "bar",
    rubyClass: "Plurimath::Math::Function::Bar",
    slots: ["node"],
    build: (s, v) =>
      new C.BarNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  hat: {
    renderKind: "hat",
    rubyClass: "Plurimath::Math::Function::Hat",
    slots: ["node"],
    build: (s, v) =>
      new C.HatNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  dot: {
    renderKind: "dot",
    rubyClass: "Plurimath::Math::Function::Dot",
    slots: ["node"],
    build: (s, v) =>
      new C.DotNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  ddot: {
    renderKind: "ddot",
    rubyClass: "Plurimath::Math::Function::Ddot",
    slots: ["node"],
    build: (s, v) =>
      new C.DdotNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  tilde: {
    renderKind: "tilde",
    rubyClass: "Plurimath::Math::Function::Tilde",
    slots: ["node"],
    build: (s, v) =>
      new C.TildeNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  vec: {
    renderKind: "vec",
    rubyClass: "Plurimath::Math::Function::Vec",
    slots: ["node"],
    build: (s, v) =>
      new C.VecNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  ul: {
    renderKind: "ul",
    rubyClass: "Plurimath::Math::Function::Ul",
    slots: ["node"],
    build: (s, v) => new C.UlNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  abs: {
    renderKind: "abs",
    rubyClass: "Plurimath::Math::Function::Abs",
    slots: ["node"],
    build: (s, v) => new C.AbsNode({ parameterOne: at(s, v, ["node"])[0] } as never),
  },
  ceil: {
    renderKind: "ceil",
    rubyClass: "Plurimath::Math::Function::Ceil",
    slots: ["node"],
    build: (s, v) => new C.CeilNode({ parameterOne: at(s, v, ["node"])[0] } as never),
  },
  floor: {
    renderKind: "floor",
    rubyClass: "Plurimath::Math::Function::Floor",
    slots: ["node"],
    build: (s, v) => new C.FloorNode({ parameterOne: at(s, v, ["node"])[0] } as never),
  },
  norm: {
    renderKind: "norm",
    rubyClass: "Plurimath::Math::Function::Norm",
    slots: ["node"],
    build: (s, v) => new C.NormNode({ parameterOne: at(s, v, ["node"])[0] } as never),
  },
  sqrt: {
    renderKind: "sqrt",
    rubyClass: "Plurimath::Math::Function::Sqrt",
    slots: ["node"],
    build: (s, v) => new C.SqrtNode({ parameterOne: at(s, v, ["node"])[0] } as never),
  },
  overset: {
    renderKind: "overset",
    rubyClass: "Plurimath::Math::Function::Overset",
    slots: ["node", "node"],
    build: (s, v) => {
      const [a, b] = at(s, v, ["node", "node"]);
      return new C.OversetNode({ parameterOne: a, parameterTwo: b, options: {} } as never);
    },
  },
  underset: {
    renderKind: "underset",
    rubyClass: "Plurimath::Math::Function::Underset",
    slots: ["node", "node"],
    build: (s, v) => {
      const [a, b] = at(s, v, ["node", "node"]);
      return new C.UndersetNode({ parameterOne: a, parameterTwo: b, options: {} } as never);
    },
  },
  color: {
    renderKind: "color",
    rubyClass: "Plurimath::Math::Function::Color",
    slots: ["node", "node"],
    build: (s, v) => {
      const [a, b] = at(s, v, ["node", "node"]);
      return new C.ColorNode({ parameterOne: a, parameterTwo: b } as never);
    },
  },
  fenced: {
    renderKind: "fenced",
    rubyClass: "Plurimath::Math::Function::Fenced",
    slots: ["node", "node", "node"],
    build: (s, v) => {
      const [a, b, c] = at(s, v, ["node", "node", "node"]);
      return new C.FencedNode({
        parameterOne: a,
        parameterTwo: b,
        parameterThree: c,
      } as never);
    },
  },
  /**
   * `Math::Function::FontStyle` itself, with no alias basename — the bare
   * carrier's `nil` defaults, which is what `FontStyle.new(a, b)` builds.
   */
  fontStyle: {
    renderKind: "fontStyle",
    rubyClass: "Plurimath::Math::Function::FontStyle",
    slots: ["node", "node"],
    build: (s, v) => {
      const [a, b] = at(s, v, ["node", "node"]);
      return new C.FontStyleNode({ parameterOne: a, parameterTwo: b } as never);
    },
  },
  formula: {
    renderKind: "formula",
    rubyClass: "Plurimath::Math::Formula",
    slots: ["sequence"],
    build: (s, v) => new C.FormulaNode({ value: at(s, v, ["sequence"])[0] } as never),
  },
  int: {
    renderKind: "int",
    rubyClass: "Plurimath::Math::Function::Int",
    slots: ["node", "node", "node"],
    build: (s, v) => {
      const [a, b, c] = at(s, v, ["node", "node", "node"]);
      return new C.IntNode({ parameterOne: a, parameterTwo: b, parameterThree: c } as never);
    },
  },
  linebreak: {
    renderKind: "linebreak",
    rubyClass: "Plurimath::Math::Function::Linebreak",
    slots: ["node"],
    build: (s, v) =>
      new C.LinebreakNode({ parameterOne: at(s, v, ["node"])[0], attributes: {} } as never),
  },
  mpadded: {
    renderKind: "mpadded",
    rubyClass: "Plurimath::Math::Function::Mpadded",
    slots: ["node"],
    build: (s, v) => new C.MpaddedNode({ parameterOne: at(s, v, ["node"])[0] } as never),
  },
  mrow: {
    renderKind: "mrow",
    rubyClass: "Plurimath::Math::Formula::Mrow",
    slots: ["sequence"],
    build: (s, v) => new C.MrowNode({ value: at(s, v, ["sequence"])[0] } as never),
  },
  number: {
    renderKind: "number",
    rubyClass: "Plurimath::Math::Number",
    slots: ["string"],
    build: (s, v) => new C.NumberNode({ value: at(s, v, ["string"])[0] } as never),
  },
  oint: {
    renderKind: "oint",
    rubyClass: "Plurimath::Math::Function::Oint",
    slots: ["node", "node", "node"],
    build: (s, v) => {
      const [a, b, c] = at(s, v, ["node", "node", "node"]);
      return new C.OintNode({ parameterOne: a, parameterTwo: b, parameterThree: c } as never);
    },
  },
  overleftrightarrow: {
    renderKind: "overleftrightarrow",
    rubyClass: "Plurimath::Math::Function::Overleftrightarrow",
    slots: ["node"],
    build: (s, v) =>
      new C.OverleftrightarrowNode({
        parameterOne: at(s, v, ["node"])[0],
        attributes: {},
      } as never),
  },
  prod: {
    renderKind: "prod",
    rubyClass: "Plurimath::Math::Function::Prod",
    slots: ["node", "node", "node"],
    build: (s, v) => {
      const [a, b, c] = at(s, v, ["node", "node", "node"]);
      return new C.ProdNode({ parameterOne: a, parameterTwo: b, parameterThree: c } as never);
    },
  },
  sum: {
    renderKind: "sum",
    rubyClass: "Plurimath::Math::Function::Sum",
    slots: ["node", "node", "node"],
    build: (s, v) => {
      const [a, b, c] = at(s, v, ["node", "node", "node"]);
      return new C.SumNode({ parameterOne: a, parameterTwo: b, parameterThree: c } as never);
    },
  },
  symbol: {
    renderKind: "symbol",
    rubyClass: "Plurimath::Math::Symbols::Symbol",
    slots: ["string"],
    build: (s, v) => new C.SymbolNode({ value: at(s, v, ["string"])[0] } as never),
  },
  table: {
    renderKind: "table",
    rubyClass: "Plurimath::Math::Function::Table",
    slots: ["sequence", "node", "node"],
    build: (s, v) => {
      const [a, b, c] = at(s, v, ["sequence", "node", "node"]);
      return new C.TableNode({
        value: a,
        openParen: b,
        closeParen: c,
        options: {},
      } as never);
    },
  },
  sin: {
    renderKind: "unaryFunction",
    rubyClass: "Plurimath::Math::Function::Sin",
    slots: ["node"],
    build: (s, v) =>
      new C.UnaryFunctionNode({ name: "Sin", parameterOne: at(s, v, ["node"])[0] } as never),
  },
  tr: {
    renderKind: "unaryFunction",
    rubyClass: "Plurimath::Math::Function::Tr",
    slots: ["sequence"],
    build: (s, v) =>
      new C.UnaryFunctionNode({ name: "Tr", parameterOne: at(s, v, ["sequence"])[0] } as never),
  },
  powerBase: {
    renderKind: "ternaryFunction",
    rubyClass: "Plurimath::Math::Function::PowerBase",
    slots: ["node", "node", "node"],
    build: (s, v) => {
      const [a, b, c] = at(s, v, ["node", "node", "node"]);
      return new C.TernaryFunctionNode({
        name: "PowerBase",
        parameterOne: a,
        parameterTwo: b,
        parameterThree: c,
      } as never);
    },
  },
  text: {
    renderKind: "text",
    rubyClass: "Plurimath::Math::Function::Text",
    slots: ["string"],
    build: (s, v) => new C.TextNode({ parameterOne: at(s, v, ["string"])[0] } as never),
  },
};

/**
 * Degenerate rows the gem RENDERS and this port refuses with `RenderError`,
 * keyed `id[slot]=value` and valued with WHY. The same shape as `PORT_REFUSES`,
 * for the swept matrix. Shrinking this list is the work; each removal belongs to
 * the commit that earns it, and none of them is a decision to diverge.
 */
export const DEGENERATE_REFUSES: Readonly<Record<string, string>> = {
  // `Td#initialize` calls `super(Array(parameter_one), ...)`, so nil becomes the
  // empty list and the gem renders `<m:e/>`. `BinaryFunctionNode` assigns the
  // slot unconditionally, leaving it null, and `renderTd` refuses a non-list.
  // The port is missing Ruby's `Array()` coercion.
  "td[0]=nil": "Td#initialize coerces nil to [] with Array(); BinaryFunctionNode does not",
  "td[0]=empty-array": "renderTd's empty-cell branch is deferred until separately measured",

  // `Number#initialize` stores its argument as-is and `Number#to_omml`
  // interpolates it, so Ruby spells any object into `<m:t>`. `requireString`
  // takes a measured string and refuses the rest rather than guess at Ruby's
  // spelling — 0 and "" reach it here only because JavaScript-falsy is wider
  // than Ruby-falsy, which is the root cause this whole sweep exists for.
  "number[0]=nil": "the gem interpolates nil as the empty string; requireString refuses nil",
  "number[0]=false": 'the gem interpolates false as "false"; requireString refuses a boolean',
  "number[0]=true": 'the gem interpolates true as "true"; requireString refuses a boolean',
  "number[0]=zero": 'the gem interpolates 0 as "0"; requireString refuses a finite number',
  "number[0]=empty-array": 'the gem interpolates [] as "[]"; requireString refuses a list',

  // `Symbols::Symbol#initialize` stores `sym&.to_s`, so nil stays nil and the
  // gem renders a bare `<m:t/>`. `requireString` refuses nil.
  "symbol[0]=nil": "the gem renders nil as an empty <m:t/>; requireString refuses nil",

  // `Text#initialize` stores its argument as-is and the gem interpolates it.
  "text[0]=nil": "the gem interpolates nil as the empty string; requireString refuses nil",

  // The gem renders an empty single-column `m:eqArr`; the port defers that
  // branch until it is separately measured.
  "table[0]=empty-array": "the single-column m:eqArr branch is deferred until separately measured",

  // `renderUnaryFunction` carries only the aliases the OMML slice has measured;
  // `Sin` is not among them. The gem renders each of these four.
  "sin[0]=nil": 'UnaryFunction alias "Sin" is not in the OMML slice',
  "sin[0]=false": 'UnaryFunction alias "Sin" is not in the OMML slice',
  "sin[0]=empty-array": 'UnaryFunction alias "Sin" is not in the OMML slice',
  "sin[0]=node": 'UnaryFunction alias "Sin" is not in the OMML slice',
};

/**
 * Degenerate rows both sides render, where the port's bytes DIFFER from the
 * gem's. Pinned BOTH ways — the port's exact bytes, and inequality with the
 * gem's — so neither further corruption nor the fix passes unnoticed.
 *
 * Kept separate from `DEGENERATE_REFUSES` on purpose: a refusal and a byte
 * divergence are different defects and must not share a table.
 */
export const DEGENERATE_DIVERGENCES: Readonly<
  Record<string, { readonly reason: string; readonly portOutput: string }>
> = {};

/**
 * Degenerate rows the gem REFUSES and this port RENDERS, pinned with the port's
 * exact bytes.
 *
 * This is the dangerous direction: the port inventing confident, plausible,
 * WRONG bytes for a tree the gem will not render. Every other departure named in
 * this file is the port refusing or diverging loudly; this one is silent.
 *
 * Every entry here is a DEFECT AWAITING A FIX, not an accepted divergence. It is
 * pinned only so the sweep can name it and so that emptying the table is a
 * visible unit of work.
 */
export const DEGENERATE_PORT_RENDERS: Readonly<
  Record<string, { readonly reason: string; readonly portOutput: string }>
> = {
  // Two faces of one defect. `assignedSequence` (src/core/nodes.ts) SPREADS its
  // argument, and `[..."" ]` is `[]`, so a bare empty string becomes an empty
  // node list and renders an empty `m:oMath`. Ruby's `Formula#initialize` wraps
  // a non-Array as `[value]` and then cannot render the string it wrapped, so
  // the gem raises `ParseError` for both.
  "formula[0]=empty-string": {
    reason: 'assignedSequence spreads, and [..."" ] is []; the gem wraps "" as [""] and refuses it',
    portOutput: doc("  <m:oMath/>"),
  },
  "mrow[0]=empty-string": {
    reason: 'assignedSequence spreads, and [..."" ] is []; the gem wraps "" as [""] and refuses it',
    portOutput: doc("  <m:oMath/>"),
  },

  // The Ruby-falsy/JavaScript-falsy split again, and in the direction that
  // invents bytes. `PowerBase#to_omml` reaches its base slot with `false` and
  // the gem raises; the port treats the slot as absent and emits a zero-width
  // space base. Slots 1 and 2 take `false` and render in both, so this is the
  // base slot specifically.
};

/**
 * Rows the port cannot even BUILD: the node constructor throws `TypeError`
 * because the value is one its declared slot type excludes, and only a cast
 * reaches it at all. Every row here is a static type error in TypeScript — the
 * sweep gets to it through `as never`, which is what makes hand-built trees a
 * supported use (ARCHITECTURE.md §5) worth probing.
 */
export const PORT_TYPE_REFUSES: Readonly<Record<string, string>> = {
  // `assignedSequence` spreads its argument, so anything non-iterable throws
  // `TypeError` before any renderer is reached. Ten of these agree with the gem,
  // which refuses them too. Two do not: `Formula#initialize` wraps a bare node
  // as `[node]` and renders it, so `formula[0]=node` and `mrow[0]=node` are port
  // gaps named here rather than counted, and they leave this table when the wrap
  // lands.
  "formula[0]=false": "assignedSequence spreads its argument; false is not iterable",
  "formula[0]=true": "assignedSequence spreads its argument; true is not iterable",
  "formula[0]=zero": "assignedSequence spreads its argument; 0 is not iterable",
  "formula[0]=node":
    "the gem wraps a bare node as [node] and renders it; assignedSequence spreads and throws",
  "mrow[0]=false": "assignedSequence spreads its argument; false is not iterable",
  "mrow[0]=true": "assignedSequence spreads its argument; true is not iterable",
  "mrow[0]=zero": "assignedSequence spreads its argument; 0 is not iterable",
  "mrow[0]=node":
    "the gem wraps a bare node as [node] and renders it; assignedSequence spreads and throws",
  "table[0]=false": "assignedSequence spreads its argument; false is not iterable",
  "table[0]=true": "assignedSequence spreads its argument; true is not iterable",
  "table[0]=zero": "assignedSequence spreads its argument; 0 is not iterable",
  "table[0]=node": "assignedSequence spreads its argument; a bare node is not iterable",

  // `SymbolNode` refuses an object outright: Ruby's `sym&.to_s` spelling is a
  // heap address, which is why the gem's own output for this row is unstable.
  "symbol[0]=node": "SymbolNode refuses an object: Ruby's sym&.to_s spelling is not reproducible",
};

/**
 * Rows whose gem output is NOT reproducible, so no byte claim is possible.
 *
 * The generator PROVES each one rather than trusting this list: it probes every
 * cell twice and sets `stable: false` only where the two probes disagreed. A row
 * named here that probes identically twice fails, and a row that is
 * nondeterministic and not named here fails too. What is still asserted for
 * these rows is that the port reaches a CLEAN outcome — bytes or a typed
 * refusal, never an untyped throw.
 */
export const UNSTABLE_OUTPUT: Readonly<Record<string, string>> = {
  "number[0]=node": "Number#to_omml interpolates the object, spelling its heap address",
  "symbol[0]=node": "Symbol#initialize stores sym.to_s, which is the object's heap address",
};
