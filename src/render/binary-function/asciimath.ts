/**
 * Mirrors `function/binary_function.rb` — `BinaryFunction#to_asciimath` (:15)
 * and `#wrapped` (:168, hoisted to `../../formats/asciimath/render-shared.ts`) — plus the name arms for
 * the gem classes the census folds into this carrier with their *own*
 * `to_asciimath` overrides: `power.rb`, `mod.rb`, `td.rb`, `lim.rb`,
 * `log.rb`, `stackrel.rb`. Of the reachable names only `Root` falls through
 * to the carrier default, and it has no override.
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  classBasename,
  describeSlot,
  FORMAT,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
  slotKind,
  unreachableName,
  wrapped,
} from "../../formats/asciimath/render-shared";
import { ASCIIMATH_TRANSFORM_GET_CLASS } from "../../generated/asciimath/transform-registry";

/**
 * The class names this carrier has measured behaviour for — every `get_class`
 * name from the generated reachability census with this carrier, plus the
 * classes the transform constructs directly without `get_class` (`newPower`,
 * `newMod`, `newTd` in `../../formats/asciimath/transform.ts`). A name outside the set raises
 * (`unreachableName` in `../../formats/asciimath/render-shared.ts`).
 */
const REACHABLE_BINARY_NAMES: ReadonlySet<string> = new Set([
  ...ASCIIMATH_TRANSFORM_GET_CLASS.filter(
    (entry) => entry.carrier === "Math::Function::BinaryFunction",
  ).map((entry) => classBasename(entry.rubyClass)),
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
      // `parameter_one.to_asciimath` is unguarded in the gem (`power.rb:13`).
      const base = renderChild(node.parameterOne ?? null, context, "power.parameterOne");
      const exponent = present(node.parameterTwo)
        ? `^${wrapped(node.parameterTwo, context, "power.parameterTwo")}`
        : "";
      return `${s(base)}${exponent}`;
    }
    case "Mod": {
      // `"#{one} mod #{two}"` — nil-safe on both sides, never stripped
      // (`mod.rb:28`).
      const one =
        node.parameterOne === null || node.parameterOne === undefined
          ? ""
          : s(renderChild(node.parameterOne, context, "mod.parameterOne"));
      const two =
        node.parameterTwo === null || node.parameterTwo === undefined
          ? ""
          : s(renderChild(node.parameterTwo, context, "mod.parameterTwo"));
      return `${one} mod ${two}`;
    }
    case "Td": {
      // `Td#to_asciimath` (`td.rb:12`): nil-safe cells joined with " "; a
      // formula cell gets `table: true` merged into the options
      // (`td.rb:133-141`) — the one place the context axis flips.
      const cells = node.parameterOne;
      if (!Array.isArray(cells)) {
        throw new RenderError(
          `td.parameterOne: is ${describeSlot(cells)}, not a list — the gem raises NoMethodError here`,
          FORMAT,
          node.kind,
        );
      }
      return cells
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          const kind = slotKind(cell as NodeParameter);
          const cellContext = kind === "formula" || kind === "mrow" ? context.withTable : context;
          return s(renderChild(cell, cellContext, "td.parameterOne"));
        })
        .join(" ");
    }
    case "Lim":
    case "Log": {
      // `lim.rb:13` / `log.rb:32` — subsup prefixes, no strip.
      const keyword = name.toLowerCase();
      const one = present(node.parameterOne)
        ? `_${wrapped(node.parameterOne, context, `${keyword}.parameterOne`)}`
        : "";
      const two = present(node.parameterTwo)
        ? `^${wrapped(node.parameterTwo, context, `${keyword}.parameterTwo`)}`
        : "";
      return `${keyword}${one}${two}`;
    }
    case "Stackrel":
      // `stackrel.rb:13`, with its own `#wrapped` override (:69).
      return `stackrel${stackrelWrapped(node.parameterOne, context, "stackrel.parameterOne")}${stackrelWrapped(node.parameterTwo, context, "stackrel.parameterTwo")}`;
    default:
      if (!REACHABLE_BINARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      // `BinaryFunction#to_asciimath` (`binary_function.rb:15`) — of the
      // reachable names only `Root` lands here, and it has no override.
      return `${name.toLowerCase()}${wrapped(node.parameterOne, context, `${name}.parameterOne`)}${wrapped(node.parameterTwo, context, `${name}.parameterTwo`)}`;
  }
}

/** `Stackrel#wrapped` (`stackrel.rb:69`): always parens, unless the value already starts with one. */
function stackrelWrapped(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  const rendered = value === null || value === undefined ? "" : s(renderChild(value, context, at));
  return rendered.startsWith("(") ? rendered : `(${rendered})`;
}
