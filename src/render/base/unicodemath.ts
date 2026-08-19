/**
 * Mirrors `function/base.rb` — `Base#to_unicodemath` (:85).
 *
 * Two things are specific to this kind:
 *
 *   - **it overrides `unicodemath_parens`** (`base.rb:131`). When the node
 *     carries options, the wrapper becomes white lenticular brackets instead
 *     of round ones, and only otherwise falls through to `Core`'s. Using the
 *     shared helper here would silently emit the wrong bracket.
 *   - the subscript branch interrogates the child three ways: another `Base`
 *     nests, a mini-sized child is emitted bare, and a nil child becomes the
 *     literal `()`.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  isNode,
  miniSized,
  present,
  renderOptionalChild,
  renderTruthyChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import { UNICODEMATH_SIZE_OVERRIDES } from "../../generated/unicodemath/render-tables";

export function renderBase(node: NodeOf<"base">, context: RenderContext): string {
  // A bare `if parameter_one` guard, not `&.`: measured,
  // `Base.new(false, x)` renders "_(x)" rather than raising.
  const first = renderTruthyChild(node.parameterOne, context, "base.parameterOne");
  const two = node.parameterTwo;
  const overrides = sizeOverrides(node);

  let second: string;
  if (isNode(two) && two.kind === "base") {
    second = `_${overrides}${renderOptionalChild(two, context)}`;
  } else if (miniSized(isNode(two) ? two : undefined)) {
    second = renderOptionalChild(two, context);
  } else if (two === undefined || two === null) {
    second = "()";
  } else {
    second = `_${overrides}${baseParens(node, two, context) ?? ""}`;
  }

  return `${first}${second}`;
}

/**
 * `Base#unicodemath_parens` (`base.rb:131`) — white lenticular brackets when
 * the node has options of its own, `Core`'s round parens otherwise.
 */
function baseParens(node: NodeOf<"base">, field: unknown, context: RenderContext): string | null {
  const options = node.options;
  if (options !== undefined && options !== null && Object.keys(options).length > 0) {
    return `〖${renderOptionalChild(field, context)}〗`;
  }
  return unicodemathParens(field, context);
}

/**
 * `Base#size_overrides` (`base.rb:125`) — empty unless the node has options
 * carrying a `size`, and a reverse lookup into the size table.
 */
function sizeOverrides(node: NodeOf<"base">): string {
  const options = node.options;
  if (options === undefined || options === null || Object.keys(options).length === 0) return "";

  // `"Ⅎ#{...invert[options[:size]]}" if options[:size]` — Ruby TRUTHINESS on the
  // value, then a reverse lookup whose miss interpolates as empty. So the marker
  // is emitted for any truthy size and only the NAME is conditional. Measured:
  //   size: "1.25em" => "x_ℲA〖y〗"    size: "zzz" => "x_Ⅎ〖y〗"
  //   size: 5        => "x_Ⅎ〖y〗"     size: nil   => "x_〖y〗"
  // Testing `typeof size !== "string"` dropped the integer case, which the gem
  // renders as a bare `Ⅎ`.
  const size = options.size;
  if (!present(size)) return "";

  for (const [name, value] of UNICODEMATH_SIZE_OVERRIDES) {
    if (value === size) return `Ⅎ${name}`;
  }
  return "Ⅎ";
}
