/**
 * Mirrors `formula.rb` — `Formula#to_mathml_without_math_tag` (:121) and
 * `#mathml_content` (:133): a formula with a falsy `left_right_wrapper`
 * returns its rendered children RAW (an array `update_nodes` splices —
 * probe formula-nowrap), a truthy one wraps them in `<mrow>` — carrying, under
 * `intent`, the `intent_attribute` `:function` marker (:491). Under intent
 * the children also pass through `intent_post_processing` first
 * (`mathml_content`, :133), wrapper or not. The child map is strict — a bare string in `value` (the gem's
 * own parse of `""` puts one there) raises NoMethodError in the gem and
 * `RenderError` here.
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import { rubyClassName } from "../../core/normalize";
import {
  classBasename,
  classNameOf,
  describeSlot,
  FORMAT,
  gemCrash,
  intentPostProcessing,
  type MathmlRendered,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  slotKind,
  unreachableName,
} from "../../formats/mathml/render-shared";
import { MATHML_FORMULA_NAMES } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

/**
 * The class names this carrier has measured behaviour for — `Mstyle`, the
 * one class the census folds onto `Formula` (its
 * `to_mathml_without_math_tag` owner is `Math::Formula`; probe mstyle
 * renders byte-identically to the bare carrier), generated
 * (`MATHML_FORMULA_NAMES`, `src/generated/mathml/render-tables.ts`). The
 * same generated set the asciimath and latex formula files guard, same
 * justification.
 */
const MEASURED_FORMULA_NAMES: ReadonlySet<string> = new Set(MATHML_FORMULA_NAMES);

export function renderFormula(node: NodeOf<"formula">, context: RenderContext): MathmlRendered {
  if (node.name !== undefined && !MEASURED_FORMULA_NAMES.has(node.name))
    throw unreachableName(node.kind, node.name);
  return renderFormulaMathml(node.value, node.leftRightWrapper, context, "formula");
}

/**
 * The shared body, exported for `../mrow/mathml.ts` (`Mrow` is a `Formula`
 * subclass inheriting `to_mathml_without_math_tag` unchanged).
 */
export function renderFormulaMathml(
  value: unknown,
  leftRightWrapper: unknown,
  context: RenderContext,
  at: string,
): MathmlRendered {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      at,
    );
  }
  const children = value.map((item) => renderChild(item, context, `${at}.value`));
  if (context.intent) intentPostProcessing(children);
  if (!present(leftRightWrapper)) return children;
  const mrow = new XmlElement("mrow");
  if (context.intent && validFirstParameter(value[0])) mrow.setAttribute("intent", ":function");
  return mrow.append(children);
}

/**
 * `Formula::UNDEF_UNARY_FUNCTIONS` (`unicode_math/constants.rb:45`): the
 * symbol values `valid_first_parameter?` admits as a function name.
 */
const UNDEF_UNARY_FUNCTIONS: ReadonlySet<string> = new Set([
  "arg",
  "def",
  "erf",
  "Im",
  "Pr",
  "Re",
  "tg",
]);

/**
 * `Function::UnaryFunction` and its 66 subclasses — every class for which
 * `param.is_a?(Function::UnaryFunction)` is true. Measured on the pinned
 * oracle by loading every `Math::Function` constant and listing
 * `ObjectSpace.each_object(Class).select { |c| c <= UnaryFunction }` (67
 * classes, `Lim` not among them — it is a `BinaryFunction`); hand-listed here
 * because no generated table carries the ancestry, and held by the
 * `formula-intent-attribute` fixture rows, which put a member and a
 * non-member behind `Power`/`Base`.
 */
const UNARY_FUNCTION_CLASSES: ReadonlySet<string> = new Set([
  "Abs",
  "Arccos",
  "Arcsin",
  "Arctan",
  "Bar",
  "Cancel",
  "Ceil",
  "Cos",
  "Cosh",
  "Cot",
  "Coth",
  "Csc",
  "Csch",
  "Ddot",
  "Deg",
  "Det",
  "Dim",
  "Dot",
  "Exp",
  "Floor",
  "Gcd",
  "Glb",
  "Hat",
  "Hom",
  "Ker",
  "Lcm",
  "Left",
  "Lg",
  "Liminf",
  "Limsup",
  "Linebreak",
  "Ln",
  "Longdiv",
  "Lub",
  "Max",
  "Mbox",
  "Merror",
  "Mglyph",
  "Min",
  "Mpadded",
  "Ms",
  "Msgroup",
  "Msline",
  "None",
  "Norm",
  "Obrace",
  "Overleftrightarrow",
  "Phantom",
  "Right",
  "Scarries",
  "Scarry",
  "Sec",
  "Sech",
  "Sin",
  "Sinh",
  "Sqrt",
  "Substack",
  "Sup",
  "Tan",
  "Tanh",
  "Text",
  "Tilde",
  "Tr",
  "Ubrace",
  "Ul",
  "UnaryFunction",
  "Vec",
]);

const POWER_BASE_CLASSES: ReadonlySet<string> = new Set(["powerbase", "power", "base"]);

/** `is_a?(Function::UnaryFunction) || is_a?(Function::Lim)` for a slot value. */
function isUnaryFunctionOrLim(value: NodeParameter | undefined): boolean {
  if (slotKind(value) === undefined) return false;
  const rubyClass = rubyClassName(value as never);
  if (!rubyClass.startsWith("Math::Function::")) return false;
  const basename = classBasename(rubyClass);
  return UNARY_FUNCTION_CLASSES.has(basename) || basename === "Lim";
}

/**
 * `Formula#valid_first_parameter?` (formula.rb:498-506), the test behind the
 * `intent_attribute` `:function` marker on a wrapped formula's `<mrow>`:
 * a symbol whose value names an undefined function, or a `Power`/`PowerBase`/
 * `Base` whose base is a unary function or `lim`. `nil.class_name` raises, so a
 * wrapped EMPTY formula raises under intent.
 */
function validFirstParameter(param: unknown): boolean {
  if (param === null || param === undefined) {
    throw gemCrash("valid_first_parameter?", "nil has no class_name");
  }
  const kind = slotKind(param as NodeParameter);
  if (kind === "symbol") {
    const value = (param as { readonly value?: unknown }).value;
    if (typeof value === "string" && UNDEF_UNARY_FUNCTIONS.has(value)) return true;
  }
  const className = classNameOf(param as NodeParameter);
  if (className === undefined) {
    throw gemCrash("valid_first_parameter?", "a non-node has no class_name");
  }
  if (!POWER_BASE_CLASSES.has(className)) return false;
  return isUnaryFunctionOrLim((param as { readonly parameterOne?: NodeParameter }).parameterOne);
}
