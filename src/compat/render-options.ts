/**
 * Option-aware MathML and OMML rendering of a compat `Plurimath`'s tree, for
 * the CLI (`src/cli/convert.ts`).
 *
 * The compat class's own `toMathml(intent)` and `toOmml()` are frozen to the
 * `plurimath-js` signatures, which take no display-style or split options.
 * The CLI needs both, and only `compat` and the root entry may import across
 * formats (ARCHITECTURE.md §3 rule 5), so the two calls live here rather than
 * in `src/cli`. Not re-exported by any package entry.
 */

import { type MathmlOptions, toMathml } from "../formats/mathml/index";
import { type OmmlOptions, toOmml } from "../formats/omml/index";
import type Plurimath from "./index";

export function mathmlWithOptions(formula: Plurimath, options: MathmlOptions): string {
  return toMathml(formula.data, options);
}

export function ommlWithOptions(formula: Plurimath, options: OmmlOptions): string {
  return toOmml(formula.data, options);
}
