/**
 * Mirrors `function/power_base.rb` — `PowerBase#to_mathml_without_math_tag`
 * (:14) — for the one AsciiMath-reachable class the census folds into this
 * carrier, plus the three classes only the LaTeX and UnicodeMath parsers (or a
 * hand-built tree) reach: `Limits` (`limits.rb:14`), `Multiscript`
 * (`multiscript.rb:44`) and `Rule` (`rule.rb:25`), each checked byte-for-byte
 * against the gem by the `ternary-function` group of
 * `test/formats/ternary-function/render-fixtures.json`. For `PowerBase`, the script tag is `"m" + parameter_one&.tag_name` — `"subsup"`
 * for nearly everything (`Core#tag_name`), `"underover"` for the measured
 * symbol ids (generated `MATHML_UNDEROVER_TAG_IDS` — probe powerbase-sum)
 * and for an `Ubrace` first slot (`function/ubrace.rb:40` — probe powerbase-ubrace);
 * a `Nary` first slot crashes the gem (`tag_name` is protected there —
 * probe raw-powerbase-nary) and raises here. Slots through
 * `validate_mathml_fields` (probe powerbase-nil-mid).
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type MathmlRendered,
  type NodeOf,
  present,
  type RenderContext,
  slotKind,
  unreachableName,
  validateMathmlFields,
} from "../../formats/mathml/render-shared";
import { MATHML_UNDEROVER_TAG_IDS } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

const UNDEROVER_IDS: ReadonlySet<string> = new Set(MATHML_UNDEROVER_TAG_IDS);

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): XmlElement {
  switch (node.name) {
    case "PowerBase": {
      const tag = `m${tagNameOf(node.parameterOne, node.kind)}`;
      return renderSlots(tag, node, context);
    }
    // `Limits#to_mathml_without_math_tag` (`limits.rb:14`): the same three
    // `validate_mathml_fields` slots in a fixed `<munderover>`.
    case "Limits":
      return renderSlots("munderover", node, context);
    case "Multiscript":
      return renderMultiscript(node, context);
    // `Rule#to_mathml_without_math_tag` (`rule.rb:25`) is a bare `<mi/>`.
    case "Rule":
      return new XmlElement("mi");
    default:
      throw unreachableName(node.kind, node.name);
  }
}

function renderSlots(
  tag: string,
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): XmlElement {
  return new XmlElement(tag).append(
    validateMathmlFields(node.parameterOne, context, "ternaryFunction.parameterOne"),
    validateMathmlFields(node.parameterTwo, context, "ternaryFunction.parameterTwo"),
    validateMathmlFields(node.parameterThree, context, "ternaryFunction.parameterThree"),
  );
}

/**
 * `Multiscript#to_mathml_without_math_tag` (`multiscript.rb:44`): the base
 * through `mmultiscript`, an `<mprescripts/>` when either script is truthy (an
 * empty list is truthy), then `prescripts`.
 */
function renderMultiscript(node: NodeOf<"ternaryFunction">, context: RenderContext): XmlElement {
  const { parameterOne, parameterTwo, parameterThree } = node;
  const prescriptsMarker =
    present(parameterTwo) || present(parameterThree) ? new XmlElement("mprescripts") : null;
  return new XmlElement("mmultiscripts").append(
    mmultiscript(parameterOne, context),
    prescriptsMarker,
    validateMathmlFields(
      prescripts(parameterTwo, parameterThree),
      context,
      "multiscript.prescripts",
    ),
  );
}

/**
 * `parameter_one&.mmultiscript(intent, options:)`. Only `PowerBase` defines
 * `mmultiscript` (`power_base.rb:103`: its three slots through
 * `validate_mathml_fields`, with no wrapping tag); a base of any other class
 * has no such method and the gem raises NoMethodError.
 */
function mmultiscript(value: NodeParameter | undefined, context: RenderContext): MathmlRendered {
  if (value === null || value === undefined) return null;
  if ((value as unknown) === false || !isPowerBase(value)) {
    throw new RenderError(
      `ternaryFunction.parameterOne: ${describeSlot(value)}${
        slotKind(value) === undefined ? "" : ` (${slotKind(value)})`
      } does not answer mmultiscript — the gem raises NoMethodError here; only PowerBase does`,
      FORMAT,
      "ternaryFunction",
    );
  }
  return [
    validateMathmlFields(value.parameterOne, context, "powerBase.parameterOne"),
    validateMathmlFields(value.parameterTwo, context, "powerBase.parameterTwo"),
    validateMathmlFields(value.parameterThree, context, "powerBase.parameterThree"),
  ];
}

function isPowerBase(value: NodeParameter): value is NodeOf<"ternaryFunction"> {
  return (
    slotKind(value) === "ternaryFunction" &&
    (value as NodeOf<"ternaryFunction">).name === "PowerBase"
  );
}

/**
 * `Multiscript#prescripts` (`multiscript.rb:103`, private). Line by line:
 *
 *   return parameter_three if parameter_two&.nil? || parameter_two&.empty?
 *   return parameter_two   if parameter_three.nil? || parameter_three.empty?
 *   Array(parameter_two).zip(Array(parameter_three)).flatten.compact
 *
 * `x&.nil?` is nil for a nil receiver, so a nil `parameter_two` skips the
 * first line and reaches the zip with `Array(nil)`, which is `[]` and zips to
 * nothing — the superscripts are dropped. The zip is as long as
 * `parameter_two`, so a longer `parameter_three` loses its tail. `empty?` on a
 * script that is not a list (a node, or `false`) is a NoMethodError.
 */
function prescripts(
  two: NodeParameter | undefined,
  three: NodeParameter | undefined,
): NodeParameter | undefined {
  if (two !== null && two !== undefined) {
    if (!Array.isArray(two)) throw scriptNotList("ternaryFunction.parameterTwo", two);
    if (two.length === 0) return three;
  }
  if (three === null || three === undefined) return two;
  if (!Array.isArray(three)) throw scriptNotList("ternaryFunction.parameterThree", three);
  if (three.length === 0) return two;
  if (two === null || two === undefined) return [];
  const paired: NodeParameter[] = [];
  (two as readonly NodeParameter[]).forEach((item, index) => {
    paired.push(item, three[index] as NodeParameter);
  });
  return paired
    .flat(Number.POSITIVE_INFINITY)
    .filter((item) => item !== null && item !== undefined) as NodeParameter;
}

function scriptNotList(at: string, value: unknown): RenderError {
  return new RenderError(
    `${at}: is ${describeSlot(value)}, not a list — the gem raises NoMethodError calling empty?`,
    FORMAT,
    "ternaryFunction",
  );
}

/**
 * `parameter_one&.tag_name || "subsup"`: `Core#tag_name` answers `"subsup"`
 * for every node except the measured underover symbols and `Ubrace`; `Nary`
 * declares its own PROTECTED — the call site crashes on it in the gem.
 */
function tagNameOf(value: NodeParameter | undefined, kind: string): string {
  if (value === null || value === undefined) return "subsup";
  const valueKind = slotKind(value);
  if (valueKind === undefined) {
    // `false&.tag_name`, `"x".tag_name`, a list, a plain hash — none answers
    // tag_name; the gem crashes before any slot renders.
    throw new RenderError(
      "ternaryFunction.parameterOne: does not answer tag_name — the gem raises " +
        "NoMethodError here",
      FORMAT,
      kind,
    );
  }
  if (valueKind === "nary") {
    throw new RenderError(
      "ternaryFunction.parameterOne: Nary#tag_name is protected — the gem raises " +
        "NoMethodError here (probe raw-powerbase-nary)",
      FORMAT,
      kind,
    );
  }
  if (valueKind === "ubrace") return "underover";
  if (valueKind === "symbol") {
    const id = (value as { readonly id?: unknown }).id;
    if (typeof id === "string" && UNDEROVER_IDS.has(id)) return "underover";
  }
  return "subsup";
}
