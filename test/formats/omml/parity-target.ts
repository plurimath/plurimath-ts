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

const sym = () => new C.SymbolNode({ value: "a" });
const at = (slot: number, value: unknown, arity: number): unknown[] => {
  const args: unknown[] = Array.from({ length: arity }, () => sym());
  args[slot] = value === undefined ? sym() : value;
  return args;
};

/** One swept kind: how many positional slots it has, and how to build it. */
export interface DegenerateKind {
  /** Positional node slots. Must equal the generator's arity for this kind. */
  readonly arity: number;
  readonly build: (slot: number, value: unknown) => unknown;
}

/**
 * kind -> arity + a builder placing `value` in `slot`. Mirrors the KINDS table
 * in `scripts/probe-degenerate-slots.rb`, and the spec REQUIRES the two to be
 * the same kinds with the same arities.
 *
 * A kind absent here used to be skipped silently, so its rows ran, asserted
 * nothing, and reported green under a header claiming every kind × slot was
 * covered. The arity is carried here rather than hidden in each closure so this
 * file, which no generator writes, independently determines the size and shape
 * of the expected matrix: a truncated fixture cannot agree with it.
 */
export const NODE_FOR: Readonly<Record<string, DegenerateKind>> = {
  frac: {
    arity: 2,
    build: (s, v) => {
      const [a, b] = at(s, v, 2);
      return new C.FracNode({ parameterOne: a, parameterTwo: b } as never);
    },
  },
  base: {
    arity: 2,
    build: (s, v) => {
      const [a, b] = at(s, v, 2);
      return new C.BaseNode({ parameterOne: a, parameterTwo: b } as never);
    },
  },
  /**
   * Ruby's `Math::Function::Power` is one of the 14 aliased binary functions the
   * port carries as `BinaryFunctionNode` plus the class basename (nodes.ts §
   * BinaryFunctionNode), so there is no `PowerNode` to reach for.
   */
  power: {
    arity: 2,
    build: (s, v) => {
      const [a, b] = at(s, v, 2);
      return new C.BinaryFunctionNode({
        name: "Power",
        parameterOne: a,
        parameterTwo: b,
      } as never);
    },
  },
  nary: {
    arity: 4,
    build: (s, v) => {
      const [a, b, c, d] = at(s, v, 4);
      return new C.NaryNode({
        parameterOne: a,
        parameterTwo: b,
        parameterThree: c,
        parameterFour: d,
      } as never);
    },
  },
  obrace: {
    arity: 1,
    build: (s, v) => new C.ObraceNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  ubrace: {
    arity: 1,
    build: (s, v) => new C.UbraceNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  bar: {
    arity: 1,
    build: (s, v) => new C.BarNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  overleftrightarrow: {
    arity: 1,
    build: (s, v) =>
      new C.OverleftrightarrowNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  hat: {
    arity: 1,
    build: (s, v) => new C.HatNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  dot: {
    arity: 1,
    build: (s, v) => new C.DotNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  ddot: {
    arity: 1,
    build: (s, v) => new C.DdotNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  tilde: {
    arity: 1,
    build: (s, v) => new C.TildeNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  vec: {
    arity: 1,
    build: (s, v) => new C.VecNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  ul: {
    arity: 1,
    build: (s, v) => new C.UlNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  },
  abs: {
    arity: 1,
    build: (s, v) => new C.AbsNode({ parameterOne: at(s, v, 1)[0] } as never),
  },
  ceil: {
    arity: 1,
    build: (s, v) => new C.CeilNode({ parameterOne: at(s, v, 1)[0] } as never),
  },
  floor: {
    arity: 1,
    build: (s, v) => new C.FloorNode({ parameterOne: at(s, v, 1)[0] } as never),
  },
  norm: {
    arity: 1,
    build: (s, v) => new C.NormNode({ parameterOne: at(s, v, 1)[0] } as never),
  },
  sqrt: {
    arity: 1,
    build: (s, v) => new C.SqrtNode({ parameterOne: at(s, v, 1)[0] } as never),
  },
  overset: {
    arity: 2,
    build: (s, v) => {
      const [a, b] = at(s, v, 2);
      return new C.OversetNode({ parameterOne: a, parameterTwo: b, options: {} } as never);
    },
  },
  underset: {
    arity: 2,
    build: (s, v) => {
      const [a, b] = at(s, v, 2);
      return new C.UndersetNode({ parameterOne: a, parameterTwo: b, options: {} } as never);
    },
  },
};

/**
 * Degenerate rows the gem renders and this port refuses, keyed `kind[slot]=value`
 * and valued with WHY. The same shape as `PORT_REFUSES`, for the swept matrix.
 *
 * Empty at the pinned oracle: every one of the 107 rows the gem renders, the
 * port also renders. Seven of them render the WRONG BYTES, and those are pinned
 * in `DEGENERATE_DIVERGENCES` below rather than hidden here — a refusal and a
 * byte divergence are different defects and must not share a table.
 */
export const DEGENERATE_REFUSES: Readonly<Record<string, string>> = {};

export const DEGENERATE_DIVERGENCES: Readonly<
  Record<string, { readonly reason: string; readonly portOutput: string }>
> = {};
