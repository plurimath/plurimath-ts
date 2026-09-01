/**
 * Per-format wiring for `render-parity.spec.ts` and `degenerate-slots.spec.ts`.
 *
 * Everything here is a PIN, not a knob. Each table names the exact subjects the
 * two specs expect to see, so a change in either direction — a case that starts
 * rendering, one that stops, a kind the generator sweeps that this file cannot
 * build — fails in a test that names it. The earlier version pinned two integers
 * instead, and equal-sized swaps (one case regressed, one improved) passed.
 */
import * as C from "../../../src/core/index";
import { toHtml } from "../../../src/formats/html/renderer";

export const FORMAT = "html";
export const RENDER = (node: never): string =>
  toHtml(new C.FormulaNode({ value: [node] }) as never);

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
      "UnitsML is deferred wholesale (ARCHITECTURE.md §5, decided 2026-07-29); the grammar rule is present but commented out, so unitsml(...) degrades to text",
    portOutput: "unitsml(kg)",
  },
};

/**
 * Corpus cases the gem renders and this port refuses — the HTML slice's gap,
 * enumerated rather than counted.
 *
 * A count let a regression and an improvement cancel out, and named neither. An
 * id here that renders, or one absent from here that refuses, fails in that
 * case's own test. Shrinking this list is the work; each removal belongs to the
 * commit that earns it.
 */
export const PORT_REFUSES: ReadonlySet<string> = new Set([
  "colour-in-sum",
  "fence-round-single",
  "fence-round-expression",
  "fence-square-pair",
  "fence-curly-single",
  "fence-round-triple",
  "fence-over-number",
  "font-mixed",
  "frac-fenced-numerator",
  "frac-fenced-denominator",
  "frac-sum-of-fracs",
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
  "permissive-unclosed-paren",
  "permissive-unopened-paren",
  "permissive-closing-run",
  "permissive-bare-dollar",
  "permissive-frac-then-operator",
  "power-square",
  "power-fenced-exponent",
  "subscript-fenced",
  "power-and-subscript",
  "power-exponential",
  "power-of-two",
  "power-over-number",
  "root-sqrt-expression",
  "root-sqrt-pythagoras",
  "root-cube",
  "symbol-greek-alpha",
  "symbol-greek-pi",
  "symbol-greek-sigma",
  "symbol-infinity",
  "unary-sin-fenced",
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
export const RENDERED_BASELINE = 36;

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
  /** The `src/render/<kind>/html.ts` this entry exercises. */
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
 * **Every landed HTML renderer must appear as some entry's `renderKind`.** The
 * spec reads the `src/render` inventory itself and fails naming any renderer no
 * entry covers. Before that check existed both tables were hand lists holding
 * 20 of the 38 landed renderers, and `renderMpadded` could be replaced
 * wholesale by `__BROKEN_MPADDED_HTML__` with both parity specs green at
 * 319/319.
 *
 * More than one entry may name the same renderer where the Ruby side reaches it
 * through several classes with different constructors: `binaryFunction` is
 * swept as both `power` (no measured HTML) and `td` (measured), `unaryFunction`
 * as both `sin` and `tr`.
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
  /** `Td` is the one binary alias the HTML slice has measured, so it renders. */
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
 *
 * The `power` six were the whole list while the sweep covered 20 of the 38
 * landed HTML renderers. Extending it to all 38 added twelve more, in three
 * groups, every one a slot the corpus never constructs.
 */
export const DEGENERATE_REFUSES: Readonly<Record<string, string>> = {
  "power[0]=nil": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[0]=false": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[0]=node": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[1]=nil": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[1]=false": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[1]=node": 'BinaryFunction alias "Power" is not in the HTML slice',

  // `Td#initialize` calls `super(Array(parameter_one), ...)`, so nil becomes the
  // empty list and the gem renders `<td></td>`. `BinaryFunctionNode` assigns the
  // slot unconditionally (nodes.ts, `assignedParameter`), leaving it null, and
  // `renderTd` refuses a non-list. The port is missing Ruby's `Array()` coercion.
  "td[0]=nil": "Td#initialize coerces nil to [] with Array(); BinaryFunctionNode does not",

  // `Number#initialize` stores its argument as-is and `Number#to_html`
  // interpolates it, so Ruby spells any object. `interpolatedValue`
  // (render-shared.ts) reproduces only null, string, boolean and non-finite
  // number, and refuses the rest rather than guess at Ruby's spelling.
  "number[0]=zero": 'the gem interpolates 0 as "0"; interpolatedValue refuses a finite number',
  "number[0]=empty-array": 'the gem interpolates [] as "[]"; interpolatedValue refuses an array',

  // `renderTernaryFunction` throws for every alias: the HTML slice has measured
  // none of the five. The gem renders each present slot in its own wrapper.
  "powerBase[0]=nil": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
  "powerBase[0]=false": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
  "powerBase[0]=node": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
  "powerBase[1]=nil": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
  "powerBase[1]=false": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
  "powerBase[1]=node": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
  "powerBase[2]=nil": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
  "powerBase[2]=false": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
  "powerBase[2]=node": 'TernaryFunction alias "PowerBase" is not in the HTML slice',
};

/**
 * Degenerate rows the gem REFUSES and this port renders, pinned with the port's
 * exact bytes — the same both-ways pin `KNOWN_DIVERGENCES` uses for the corpus.
 * If the port's output moves, or it starts refusing, the row fails and the entry
 * is revisited.
 *
 * This is the dangerous direction: the port inventing confident, plausible,
 * WRONG bytes for a tree the gem will not render. Every other departure named in
 * this file is the port refusing, which is loud and safe; this one is silent.
 *
 * **Empty, and kept empty.** The table stays so a row that starts inventing has
 * somewhere to be named — the sweep sends it here by name — and so that emptying
 * it again is a visible unit of work.
 *
 * It held three rows, all one root cause. `assignedSequence` spread its
 * argument, and `[...""]` is `[]`, so `Formula.new("")`, `Mrow.new("")` and
 * `Table.new("")` rendered `""`, `""` and `"<table></table>"` where the gem
 * raises `ParseError` on all three: Ruby's `Formula#initialize` wraps a
 * non-Array as `[value]` and then cannot render the string it wrapped, and
 * `Table#initialize` stores the string untouched and cannot render that either.
 * `src/core/nodes.ts` no longer spreads — an array is copied, a bare string is
 * wrapped as Ruby wraps it, and the wrapped string earns the same `RenderError`
 * every other bare string in a node list earns.
 */
export const DEGENERATE_PORT_RENDERS: Readonly<
  Record<string, { readonly reason: string; readonly portOutput: string }>
> = {};

/**
 * Rows the port cannot even BUILD: the node constructor throws `TypeError`
 * because the value is one its declared slot type excludes, and only a cast
 * reaches it at all. Every row here is a static type error in TypeScript — the
 * sweep gets to it through `as never`, which is what makes hand-built trees a
 * supported use (ARCHITECTURE.md §5) worth probing.
 *
 * Ten of the thirteen agree with the gem, which refuses these too. Three render
 * in the gem: `Formula#initialize` wraps a non-Array as `[value]`, so a bare
 * node in `formula[0]` and `mrow[0]` renders where the port refuses, and
 * `symbol[0]=node` renders an unreproducible heap address (`UNSTABLE_OUTPUT`).
 * The first two are a port gap, named here rather than counted, and they leave
 * this table when the wrap lands.
 *
 * `assignedSequence` refuses these because it takes an array or a bare string
 * and nothing else. It used to spread instead, which threw for the same rows by
 * accident and rendered invented bytes for the iterables it did not throw on —
 * see `DEGENERATE_PORT_RENDERS`.
 */
export const PORT_TYPE_REFUSES: Readonly<Record<string, string>> = {
  "formula[0]=false": "assignedSequence takes an array or a bare string; false is neither",
  "formula[0]=true": "assignedSequence takes an array or a bare string; true is neither",
  "formula[0]=zero": "assignedSequence takes an array or a bare string; 0 is neither",
  "formula[0]=node":
    "the gem wraps a bare node as [node] and renders it; assignedSequence refuses it",
  "mrow[0]=false": "assignedSequence takes an array or a bare string; false is neither",
  "mrow[0]=true": "assignedSequence takes an array or a bare string; true is neither",
  "mrow[0]=zero": "assignedSequence takes an array or a bare string; 0 is neither",
  "mrow[0]=node": "the gem wraps a bare node as [node] and renders it; assignedSequence refuses it",
  "table[0]=false": "assignedSequence takes an array or a bare string; false is neither",
  "table[0]=true": "assignedSequence takes an array or a bare string; true is neither",
  "table[0]=zero": "assignedSequence takes an array or a bare string; 0 is neither",
  "table[0]=node": "assignedSequence takes an array or a bare string; a bare node is neither",
  "symbol[0]=node": "SymbolNode refuses an object: Ruby's sym&.to_s spelling is not reproducible",
};

/**
 * Rows whose gem output is NOT reproducible, so no byte claim is possible.
 *
 * Both are the same fact: `Symbols::Symbol#initialize` stores `sym&.to_s` and
 * `Number#initialize` stores its argument untouched, so a node in either slot
 * reaches `to_html` as Ruby's default `Object#to_s` — a heap address that
 * differs on every run.
 *
 * The generator PROVES each one rather than trusting this list: it probes every
 * cell twice and sets `stable: false` only where the two probes disagreed. A row
 * named here that probes identically twice fails, and a row that is
 * nondeterministic and not named here fails too. What is still asserted for
 * these rows is that the port reaches a CLEAN outcome — bytes or a typed
 * refusal, never an untyped throw.
 */
export const UNSTABLE_OUTPUT: Readonly<Record<string, string>> = {
  "number[0]=node": "Number#to_html interpolates the object, spelling its heap address",
  "symbol[0]=node": "Symbol#initialize stores sym.to_s, which is the object's heap address",
};
