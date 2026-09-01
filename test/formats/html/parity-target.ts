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
 * A kind absent here used to be skipped silently. `power` was in the generator
 * and not here, so its 14 rows ran, asserted nothing, and reported green — the
 * "every kind × slot" claim in the spec header was false for 14 of 196 rows.
 * The arity is carried here rather than hidden in each closure so this file,
 * which no generator writes, independently determines the size and shape of the
 * expected matrix: a truncated fixture cannot agree with it.
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
 * All six are one gap: `Math::Function::Power` reaches the HTML renderer as a
 * `binaryFunction` node, and `src/render/binary-function/html.ts` has measured
 * only the `Td` alias, so every other alias raises `RenderError`. The gem
 * renders exactly the three values that leave a slot Ruby-falsy or a real node;
 * on `true`, `0`, `""` and `[]` it raises, and the port refusing there agrees.
 *
 * This list was 0 until now, because `power` had no builder and its rows were
 * skipped without a word.
 */
export const DEGENERATE_REFUSES: Readonly<Record<string, string>> = {
  "power[0]=nil": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[0]=false": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[0]=node": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[1]=nil": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[1]=false": 'BinaryFunction alias "Power" is not in the HTML slice',
  "power[1]=node": 'BinaryFunction alias "Power" is not in the HTML slice',
};
