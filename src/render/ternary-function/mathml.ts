/**
 * Mirrors `function/power_base.rb` — `PowerBase#to_mathml_without_math_tag`
 * (:14) — for the one AsciiMath-reachable class the census folds into this
 * carrier. The script tag is `"m" + parameter_one&.tag_name` — `"subsup"`
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
  FORMAT,
  type NodeOf,
  type RenderContext,
  slotKind,
  unreachableName,
  validateMathmlFields,
} from "../../formats/mathml/render-shared";
import { MATHML_UNDEROVER_TAG_IDS } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

const REACHABLE_TERNARY_NAMES: ReadonlySet<string> = new Set(["PowerBase"]);

const UNDEROVER_IDS: ReadonlySet<string> = new Set(MATHML_UNDEROVER_TAG_IDS);

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): XmlElement {
  if (!REACHABLE_TERNARY_NAMES.has(node.name)) throw unreachableName(node.kind, node.name);
  const tag = `m${tagNameOf(node.parameterOne, node.kind)}`;
  return new XmlElement(tag).append(
    validateMathmlFields(node.parameterOne, context, "ternaryFunction.parameterOne"),
    validateMathmlFields(node.parameterTwo, context, "ternaryFunction.parameterTwo"),
    validateMathmlFields(node.parameterThree, context, "ternaryFunction.parameterThree"),
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
