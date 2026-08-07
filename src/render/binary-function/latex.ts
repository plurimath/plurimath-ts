/**
 * Mirrors `function/binary_function.rb` — `BinaryFunction#to_latex` (:48)
 * and `#latex_wrapped` (:159, hoisted to `../../formats/latex/render-shared.ts` beside its
 * byte-equivalent ternary twin) — plus the name arms for the gem classes the
 * census folds into this carrier with their *own* `to_latex` overrides:
 * `power.rb` (:35), `mod.rb` (:50), `td.rb` (:30), `lim.rb` (:25), `log.rb`
 * (:44). Of the reachable names only `Stackrel` falls through to the carrier
 * default, and it has no override.
 *
 * Measured pin worth naming, because source-reading gets it wrong: `Lim`
 * interpolates `_{…}`/`^{…}` plainly where `Log` goes through
 * `latex_wrapped` — measured, not guessed.
 */

import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  isPipeSymbol,
  latexWrapped,
  type NodeOf,
  nilSafe,
  present,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/latex/render-shared";
import { LATEX_BINARY_CARRIER_NAMES } from "../../generated/latex/render-tables";

/**
 * The class names this carrier has measured behaviour for — every `get_class`
 * basename from the generated reachability census with this carrier (the
 * latex-owned projection, `LATEX_BINARY_CARRIER_NAMES`), plus the classes
 * the transform constructs directly without `get_class` (`newPower`,
 * `newMod`, `newTd` in `../../formats/asciimath/transform.ts`). A name
 * outside the set raises (`unreachableName` in
 * `../../formats/latex/render-shared.ts`).
 */
const REACHABLE_BINARY_NAMES: ReadonlySet<string> = new Set([
  ...LATEX_BINARY_CARRIER_NAMES,
  "Power",
  "Mod",
  "Td",
]);

export function renderBinaryFunction(
  node: NodeOf<"binaryFunction">,
  context: RenderContext,
): string {
  const name = node.name;
  switch (name) {
    case "Power": {
      // `parameter_one.to_latex` is unguarded (`power.rb:35`); `^{…}` is
      // always appended, a nil exponent leaving `^{}` (measured).
      const base = renderChild(node.parameterOne ?? null, context, "power.parameterOne");
      const exponent = present(node.parameterTwo)
        ? renderChild(node.parameterTwo, context, "power.parameterTwo")
        : null;
      return `${s(base)}^{${s(exponent)}}`;
    }
    case "Mod": {
      // `"#{first} \\mod #{second}"` where each side is `{…}` only when
      // present (`mod.rb:50`).
      const one = present(node.parameterOne)
        ? `{${s(renderChild(node.parameterOne, context, "mod.parameterOne"))}}`
        : "";
      const two = present(node.parameterTwo)
        ? `{${s(renderChild(node.parameterTwo, context, "mod.parameterTwo"))}}`
        : "";
      return `${one} \\mod ${two}`;
    }
    case "Td":
      return renderTd(node, context);
    case "Lim": {
      // Plain `_{…}`/`^{…}` (`lim.rb:25`) — no latex_wrapped.
      const one = present(node.parameterOne)
        ? `_{${s(renderChild(node.parameterOne, context, "lim.parameterOne"))}}`
        : "";
      const two = present(node.parameterTwo)
        ? `^{${s(renderChild(node.parameterTwo, context, "lim.parameterTwo"))}}`
        : "";
      return `\\lim${one}${two}`;
    }
    case "Log": {
      // `_#{latex_wrapped(…)}` (`log.rb:44`) — measured against Lim's plain
      // braces.
      const one = present(node.parameterOne)
        ? `_${latexWrapped(node.parameterOne, context, "log.parameterOne")}`
        : "";
      const two = present(node.parameterTwo)
        ? `^${latexWrapped(node.parameterTwo, context, "log.parameterTwo")}`
        : "";
      return `\\log${one}${two}`;
    }
    case "Root":
      // `"\\sqrt[#{one}]{#{two}}"`, nil-safe (`root.rb:24`).
      return `\\sqrt[${nilSafe(node.parameterOne, context, "root.parameterOne")}]{${nilSafe(node.parameterTwo, context, "root.parameterTwo")}}`;
    default:
      if (!REACHABLE_BINARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      // `BinaryFunction#to_latex` (`binary_function.rb:48`) — of the
      // reachable names only `Stackrel` lands here, and it has no override.
      return `\\${name.toLowerCase()}${
        present(node.parameterOne)
          ? latexWrapped(node.parameterOne, context, `${name}.parameterOne`)
          : ""
      }${
        present(node.parameterTwo)
          ? latexWrapped(node.parameterTwo, context, `${name}.parameterTwo`)
          : ""
      }`;
  }
}

function renderTd(node: NodeOf<"binaryFunction">, context: RenderContext): string {
  // `Td#to_latex` (`td.rb:30`): "" when the first cell is a `|`; otherwise
  // nil-safe cells joined with " ". No table-context flip on the latex path
  // (unlike to_asciimath) — the generated latex exception matrix is empty.
  const cells = node.parameterOne;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      `td.parameterOne: is ${describeSlot(cells)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  if (cells.length > 0 && isPipeSymbol(cells[0])) return "";
  return cells
    .map((cell) =>
      cell === null || cell === undefined ? "" : s(renderChild(cell, context, "td.parameterOne")),
    )
    .join(" ");
}
