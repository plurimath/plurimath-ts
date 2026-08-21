/**
 * Mirrors `function/unary_function.rb` — `UnaryFunction#to_latex` (:61) and
 * `#latex_value` (:221) — plus the name arms for the gem classes the census
 * folds into this carrier with their *own* `to_latex` overrides: `left.rb`
 * (:30), `right.rb` (:30), `glb.rb` (:11), `lcm.rb` (:25), `tr.rb` (:33).
 * Every other name in `MEASURED_UNARY_NAMES` below renders the carrier
 * default.
 *
 * Measured pins worth naming, because source-reading gets them wrong:
 * `Glb` and `Lcm` render with no backslash (`glb{x}`, `lcm{x}`); every other
 * unary name gets `\\#{class_name}{…}` with arrays joined by " ".
 * `Left`/`Right` map their stored paren through
 * `Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert` with `.` on a miss — a
 * node in the slot is a hash-lookup miss (`.`), never an inspect leak, so
 * unlike the asciimath side there is nothing to refuse.
 */

import type { MathNode, NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  isNode,
  isPipeSymbol,
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/latex/render-shared";
import {
  LATEX_LEFT_RIGHT_PARENS,
  LATEX_UNARY_CARRIER_NAMES,
} from "../../generated/latex/render-tables";

/**
 * `Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert`, generated row by row
 * through `Left`/`Right` renders on the oracle. This is the complete
 * inverted constant — `&#x2016;` maps to `\|` because Ruby's `Hash#invert`
 * keeps the LAST key for a duplicated value — so any string missing here is
 * a genuine gem-side miss, which renders `.`.
 */
const LEFT_RIGHT_PARENS: ReadonlyMap<string, string> = LATEX_LEFT_RIGHT_PARENS;

/**
 * The class names this carrier has measured behaviour for. Three sources,
 * and only the first is generated:
 *
 *   - the AsciiMath-reachable set — every `get_class` basename from the
 *     generated reachability census with this carrier (the latex-owned
 *     projection, `LATEX_UNARY_CARRIER_NAMES`);
 *   - `Tr`, which the transform constructs directly without `get_class`
 *     (`newTr` in `../../formats/asciimath/transform.ts`);
 *   - `Hom`, which the transform never constructs at all, but whose
 *     `to_latex` is the carrier's own, so `renderUnaryDefault` below
 *     already emits the gem's bytes.
 *
 * `Hom` is measured, not read off the class list: on the pinned oracle
 * `Hom.instance_method(:to_latex).owner` is `UnaryFunction`, and of the 48
 * classes the census aliases onto this carrier it is the only one both
 * outside the reachable set and carrier-default here. It takes the
 * backslash, unlike `Glb`/`Lcm` above: `Hom.new(Symbol("x"))` renders
 * `"\\hom{x}"` and `Hom.new(nil)` renders `"\\hom{}"`.
 *
 * A name outside the set raises rather than rendering the carrier default,
 * because the gem class it denotes may override `to_latex`
 * (`unreachableName` in `../../formats/latex/render-shared.ts`).
 *
 * The last two entries are gem-derived data typed by hand — the exception
 * `TODO.plan/deferred.md` records under "The carrier name-guard sets are
 * partly hand-listed"; both are held by behavioural pins in
 * `test/formats/latex/renderer.spec.ts`.
 */
const MEASURED_UNARY_NAMES: ReadonlySet<string> = new Set([
  ...LATEX_UNARY_CARRIER_NAMES,
  "Tr",
  "Hom",
]);

export function renderUnaryFunction(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  const name = node.name;
  switch (name) {
    case "Left":
    case "Right": {
      // `"\\left #{latex_paren}"` (`left.rb:30`): the stored paren through
      // the inverted constant, `.` on any miss — including a NODE in the
      // slot, which is a hash-lookup miss in Ruby (measured).
      const keyword = name === "Left" ? "\\left" : "\\right";
      const paren = node.parameterOne;
      const mapped = typeof paren === "string" ? (LEFT_RIGHT_PARENS.get(paren) ?? ".") : ".";
      return `${keyword} ${mapped}`;
    }
    case "Glb":
    case "Lcm":
      // `"glb{…}"`, `"lcm{…}"` — no backslash (`glb.rb:11`, `lcm.rb:25`).
      return `${name.toLowerCase()}{${s(latexValue(node.parameterOne, context, `${name.toLowerCase()}.parameterOne`))}}`;
    case "Tr":
      return renderTr(node, context);
    default:
      if (!MEASURED_UNARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      return renderUnaryDefault(name.toLowerCase(), node.parameterOne, context);
  }
}

/**
 * `UnaryFunction#to_latex` (`unary_function.rb:61`):
 * `"\\#{class_name}{#{latex_value}}"`. Exported for the kind files of gem
 * classes that inherit it unchanged (`../sqrt/latex.ts`, `../abs/latex.ts`, ...).
 */
export function renderUnaryDefault(
  className: string,
  parameterOne: NodeParameter | undefined,
  context: RenderContext,
): string {
  return `\\${className}{${s(latexValue(parameterOne, context, `${className}.parameterOne`))}}`;
}

/**
 * `UnaryFunction#latex_value` (`unary_function.rb:221`): nil stays nil, a
 * list compacts and joins with " " (asciimath joins with "" — measured
 * difference), anything else renders directly. Exported for the inheriting
 * kind files (`../ceil/latex.ts`, `../mpadded/latex.ts`, `../linebreak/latex.ts`).
 */
export function latexValue(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => s(renderChild(item, context, at)))
      .join(" ");
  }
  return renderChild(value, context, at);
}

function renderTr(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  // `Tr#to_latex` (`tr.rb:33`): drop the `|` tds (either the td itself, or
  // its first cell), then join with " & ". The second reject check reads
  // `td.parameter_one.first`, so a td without a cell LIST crashes in the gem.
  const tds = node.parameterOne;
  if (!Array.isArray(tds)) {
    throw new RenderError(
      `tr.parameterOne: is ${describeSlot(tds)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  const kept: MathNode[] = [];
  for (const td of tds) {
    if (isPipeSymbol(td)) continue;
    const cells = isNode(td) ? (td as { readonly parameterOne?: unknown }).parameterOne : undefined;
    if (!Array.isArray(cells)) {
      throw new RenderError(
        `tr.parameterOne: a td holds ${describeSlot(cells)} instead of a cell list — ` +
          "the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    if (cells.length > 0 && isPipeSymbol(cells[0])) continue;
    kept.push(td as MathNode);
  }
  return kept.map((td) => s(renderChild(td, context, "tr.parameterOne"))).join(" & ");
}
