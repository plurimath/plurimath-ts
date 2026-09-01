/** Per-format wiring for render-parity.spec.ts and degenerate-slots.spec.ts.
 *  Copy to test/formats/html/parity-target.ts */
import * as C from "../../../src/core/index";
import { toHtml } from "../../../src/formats/html/renderer";

export const FORMAT = "html";
export const RENDER = (node: never): string =>
  toHtml(new C.FormulaNode({ value: [node] }) as never);

/**
 * Cases where the port deliberately differs from the gem, keyed by corpus id,
 * valued with WHY. Each must have an entry in TODO.plan/deferred.md.
 * Pinned as unequal: if one starts matching, the suite fails and the entry goes.
 */
export const KNOWN_DIVERGENCES: Readonly<Record<string, string>> = {
  "text-unitsml-valid":
    "UnitsML is deferred wholesale (ARCHITECTURE.md v9); the grammar rule is commented out so unitsml(...) degrades to text",
};

const sym = () => new C.SymbolNode({ value: "a" });
const at = (slot: number, value: unknown, arity: number): unknown[] => {
  const args: unknown[] = Array.from({ length: arity }, () => sym());
  args[slot] = value === undefined ? sym() : value;
  return args;
};

/**
 * kind -> build a node with `value` in `slot`. Mirrors the KINDS table in
 * scripts/probe-degenerate-slots.rb. A kind absent here is skipped, so this
 * table grows with the format's slice rather than blocking it.
 */
export const NODE_FOR: Readonly<Record<string, (slot: number, value: unknown) => unknown>> = {
  frac: (s, v) => {
    const [a, b] = at(s, v, 2);
    return new C.FracNode({ parameterOne: a, parameterTwo: b } as never);
  },
  base: (s, v) => {
    const [a, b] = at(s, v, 2);
    return new C.BaseNode({ parameterOne: a, parameterTwo: b } as never);
  },
  nary: (s, v) => {
    const [a, b, c, d] = at(s, v, 4);
    return new C.NaryNode({
      parameterOne: a,
      parameterTwo: b,
      parameterThree: c,
      parameterFour: d,
    } as never);
  },
  obrace: (s, v) => new C.ObraceNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  ubrace: (s, v) => new C.UbraceNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  bar: (s, v) => new C.BarNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  hat: (s, v) => new C.HatNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  dot: (s, v) => new C.DotNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  ddot: (s, v) => new C.DdotNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  tilde: (s, v) => new C.TildeNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  vec: (s, v) => new C.VecNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  ul: (s, v) => new C.UlNode({ parameterOne: at(s, v, 1)[0], attributes: {} } as never),
  abs: (s, v) => new C.AbsNode({ parameterOne: at(s, v, 1)[0] } as never),
  ceil: (s, v) => new C.CeilNode({ parameterOne: at(s, v, 1)[0] } as never),
  floor: (s, v) => new C.FloorNode({ parameterOne: at(s, v, 1)[0] } as never),
  norm: (s, v) => new C.NormNode({ parameterOne: at(s, v, 1)[0] } as never),
  sqrt: (s, v) => new C.SqrtNode({ parameterOne: at(s, v, 1)[0] } as never),
  overset: (s, v) => {
    const [a, b] = at(s, v, 2);
    return new C.OversetNode({ parameterOne: a, parameterTwo: b, options: {} } as never);
  },
  underset: (s, v) => {
    const [a, b] = at(s, v, 2);
    return new C.UndersetNode({ parameterOne: a, parameterTwo: b, options: {} } as never);
  },
};

/** Cases the port renders today. Raise it in the commit that earns the increase. */
export const RENDERED_BASELINE = 36;
/** Rows where the port and the gem disagree today. Lower it as they are fixed. */
export const DEGENERATE_BASELINE = 0;
