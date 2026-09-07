import {
  hasNodeKind,
  type MathNode,
  OversetNode,
  RenderError,
  UndersetNode,
} from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  type OmmlRendered,
  ommlSlot,
  present,
  type RenderContext,
  structuralProperties,
  symbolOmmlTagName,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * `Core#omml_tag_name` (`core.rb:40-42`), the answer every node inherits
 * unless it overrides the method. Written here rather than read off the
 * generated symbol slice: that file's `OMML_DEFAULT_SYMBOL_TAG_NAME` is the
 * measured answer of `Symbols::Symbol`, a different class that happens to give
 * the same string.
 */
const CORE_OMML_TAG_NAME = "subSup";

/**
 * The node kinds that are NOT symbols and still answer `undOvr`. Measured on
 * the pinned oracle `00c52783` by grepping every `def omml_tag_name` in the
 * gem and calling each: `Math::Function::Ubrace` (`ubrace.rb:44-46`) and
 * `Math::Function::Sum` (`sum.rb:127-129`) answer `"undOvr"`; `Core` answers
 * `"subSup"` and nothing else in `Math::Function` overrides it. `Nary` in
 * particular does NOT — it is a bare `Core` subclass, and `PowerBase` over an
 * `Nary` renders `m:sSubSup` (measured, one live render).
 */
const UNDOVR_KINDS: ReadonlySet<string> = new Set(["sum", "ubrace"]);

/** `parameter_one&.omml_tag_name`, over the node kinds this port carries. */
function ommlTagName(value: MathNode): string {
  if (value.kind === "symbol") return symbolOmmlTagName(value as NodeOf<"symbol">);
  return UNDOVR_KINDS.has(value.kind) ? "undOvr" : CORE_OMML_TAG_NAME;
}

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): OmmlRendered {
  if (node.name === "TernaryFunction") {
    throw new RenderError(
      "TernaryFunction has no to_omml_without_math_tag in the pinned gem and refuses instead of emitting markup",
      FORMAT,
      node.kind,
    );
  }
  if (node.name !== "PowerBase") {
    throw new RenderError(
      `TernaryFunction alias "${node.name}" has not been measured for OMML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  if (Array.isArray(node.parameterOne)) {
    throw new RenderError(
      "powerBase.parameterOne: cannot inspect a list for omml_tag_name — the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  // `PowerBase` reads its base before the slot helper does, so this slot is NOT
  // Ruby-falsy the way an ordinary `omml_parameter` slot is. Measured on the
  // oracle at `00c52783`: `PowerBase.new(nil, a, a)` renders with the
  // zero-width-space placeholder, while `PowerBase.new(false, a, a)` raises —
  // `false` answers none of the methods the base is asked for. Sending both
  // through `ommlSlot` placeholdered the `false` case and invented output the
  // gem refuses.
  if ((node.parameterOne as unknown) === false) {
    throw new RenderError(
      "powerBase.parameterOne: is false, which answers no omml tag method — the gem raises here, though it renders a placeholder for nil",
      FORMAT,
      node.kind,
    );
  }
  // `PowerBase#to_omml_without_math_tag` opens on
  // `parameter_one&.omml_tag_name == "undOvr"` (`power_base.rb:39-43`) and
  // takes `TernaryFunction#underover` when it holds. Before the generated
  // symbol slice was wired there was no way to answer that question for a
  // symbol base, and this file assumed the `m:sSubSup` arm for everything.
  if (hasNodeKind(node.parameterOne) && ommlTagName(node.parameterOne as MathNode) === "undOvr") {
    // `TernaryFunction#underover` (`ternary_function.rb:243-255`) builds the
    // structure out of two OTHER nodes and renders those: an `Overset` of the
    // base and the SUPERSCRIPT, then — only when `parameter_two` is truthy —
    // an `Underset` of that over the subscript. `unless parameter_two` is
    // Ruby-falsy, so a `false` subscript takes the overset-only arm exactly as
    // `nil` does.
    const overset = new OversetNode({
      parameterOne: node.parameterOne,
      parameterTwo: node.parameterThree,
    });
    if (!present(node.parameterTwo)) return context.render(overset);
    return context.render(
      new UndersetNode({ parameterOne: overset, parameterTwo: node.parameterTwo }),
    );
  }
  return new XmlElement("m:sSubSup").append(
    structuralProperties("sSubSup"),
    ommlSlot(node.parameterOne, "e", context, node.kind, "powerBase.parameterOne"),
    ommlSlot(node.parameterTwo, "sub", context, node.kind, "powerBase.parameterTwo"),
    ommlSlot(node.parameterThree, "sup", context, node.kind, "powerBase.parameterThree"),
  );
}
