/**
 * Mirrors `function/binary_function.rb` — `BinaryFunction#to_html` (:60-64) —
 * plus a name arm for each gem class the census folds into this carrier that
 * has its OWN `to_html` override.
 *
 * Which arm a name takes is not a guess: `klass.instance_method(:to_html).owner`
 * on the pinned oracle answers it. Of the fourteen classes carried here, six
 * override (`power.rb`, `mod.rb`, `lim.rb`, `log.rb`, `stackrel.rb`,
 * `menclose.rb`) and `td.rb` overrides with a shape of its own; the rest
 * inherit the carrier default.
 *
 * Measured pins, from a sweep of every slot-presence combination on the pinned
 * oracle (`Number` leaves rendering `1` and `2`):
 *
 *   - carrier default: `<i>1</i><i>2</i>`, each slot dropped entirely when
 *     absent, so a carrier with neither slot renders `""`;
 *   - `Power` (`power.rb:41-45`): `<i>1</i><sup>2</sup>` — the second slot is a
 *     `<sup>`, NOT the carrier's second `<i>`.
 *
 * The remaining overriding names are not measured here yet, and an unmeasured
 * name raises — the same guard the mathml and asciimath files hold.
 */
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderCarrierSlot,
  renderChild,
  renderTaggedSlot,
  s,
} from "../../formats/html/render-shared";

export function renderBinaryFunction(
  node: NodeOf<"binaryFunction">,
  context: RenderContext,
): string {
  const { name, parameterOne, parameterTwo } = node;
  switch (name) {
    case "Td":
      return renderTd(parameterOne, context);

    // `power.rb:41-45`.
    case "Power":
      return (
        renderCarrierSlot(parameterOne, context, "power.parameterOne") +
        renderTaggedSlot("sup", parameterTwo, context, "power.parameterTwo")
      );

    default:
      throw new RenderError(
        `BinaryFunction alias "${name}" has not been measured for HTML in this slice`,
        FORMAT,
        node.kind,
      );
  }
}

/** `Td#to_html`: cell children joined with no separator; attributes are ignored. */
function renderTd(value: unknown, context: RenderContext): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `Td.parameterOne: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      "binaryFunction",
    );
  }
  const inner = value
    .map((item, index) => s(renderChild(item, context, `Td.parameterOne[${index}]`)))
    .join("");
  return `<td>${inner}</td>`;
}

/** `BinaryFunction#to_html`: each present slot gets its own `<i>` wrapper. */
export function renderBinaryDefault(
  parameterOne: unknown,
  parameterTwo: unknown,
  context: RenderContext,
  at: string,
): string {
  return (
    renderCarrierSlot(parameterOne, context, `${at}.parameterOne`) +
    renderCarrierSlot(parameterTwo, context, `${at}.parameterTwo`)
  );
}
