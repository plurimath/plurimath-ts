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
 *   - carrier default, which `Root` is the reachable case of:
 *     `<i>1</i><i>2</i>`, each slot dropped entirely when absent, so a carrier
 *     with neither slot renders `""`;
 *   - `Power` (`power.rb:41-45`): `<i>1</i><sup>2</sup>` — the second slot is a
 *     `<sup>`, NOT the carrier's second `<i>`;
 *   - `Mod` (`mod.rb:56-60`): `<i>1</i><i>mod</i><i>2</i>` — the literal sits
 *     BETWEEN the slots, and is emitted even when both are absent (`<i>mod</i>`);
 *   - `Lim` (`lim.rb:31-35`): `<i>lim</i><i>1</i><i>2</i>` — literal first;
 *   - `Log` (`log.rb:56-60`): `<i>log</i><sub>1</sub><sup>2</sup>` — literal
 *     first, then a `<sub>`/`<sup>` pair.
 *
 * `Stackrel` and `Menclose` override too but stay unmeasured here: no corpus
 * case constructs either, so nothing in this suite would hold their bytes
 * honest. `Menclose#to_html` additionally interpolates `parameter_one` into a
 * `notation=` attribute RAW, which for a node is Ruby's default `Object#to_s`
 * — a heap address, and so not reproducible at all. An unmeasured name raises,
 * the same guard the mathml and asciimath files hold.
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

    // `mod.rb:56-60`. The literal is unconditional; only the slots are guarded.
    case "Mod":
      return (
        renderCarrierSlot(parameterOne, context, "mod.parameterOne") +
        "<i>mod</i>" +
        renderCarrierSlot(parameterTwo, context, "mod.parameterTwo")
      );

    // `lim.rb:31-35`.
    case "Lim":
      return (
        "<i>lim</i>" +
        renderCarrierSlot(parameterOne, context, "lim.parameterOne") +
        renderCarrierSlot(parameterTwo, context, "lim.parameterTwo")
      );

    // `log.rb:56-60`.
    case "Log":
      return (
        "<i>log</i>" +
        renderTaggedSlot("sub", parameterOne, context, "log.parameterOne") +
        renderTaggedSlot("sup", parameterTwo, context, "log.parameterTwo")
      );

    // `Root` inherits `BinaryFunction#to_html` unchanged (owner is the carrier).
    case "Root":
      return renderBinaryDefault(parameterOne, parameterTwo, context, "root");

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
