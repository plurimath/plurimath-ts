/**
 * Mirrors `function/unary_function.rb` — `UnaryFunction#to_html` (:65-74) —
 * plus a name arm for each gem class the census folds into this carrier that
 * has its OWN `to_html` override.
 *
 * The carrier renders `"<i>#{invert_unicode_symbols}</i>#{first_value}"`, where
 * `first_value` is the parameter inside one `<i>` — a list rendering each
 * member and joining with no separator INSIDE that single wrapper, and an
 * absent parameter contributing nothing at all.
 *
 * The label is `Core#invert_unicode_symbols` (`core.rb:229-231`), which is
 * `Mathml::Constants::UNICODE_SYMBOLS.invert[class_name] || class_name` — NOT
 * simply the class basename downcased. The two agree for most names but not
 * all, and the disagreement is invisible until it is measured: of the names
 * reachable through this carrier, `Sup` alone resolves through the table, to
 * `&#x2283;` rather than `sup`. So each admitted name carries its MEASURED
 * label as a literal here rather than deriving one from the class name, which
 * is also how the dedicated kinds that share this helper pass theirs
 * (`bar` → `¯`, `vec` → `&#x2192;`, `ul` → `underline`, whose class_name is
 * `underline` and not `ul`).
 *
 * Measured pins, from a sweep of every carrier subclass on the pinned oracle
 * (a `Number` leaf rendering `1`):
 *
 *   - `Sin`: `<i>sin</i><i>1</i>`, and `<i>sin</i>` with the slot absent;
 *   - `Cos`: `<i>cos</i><i>1</i>`, and `<i>cos</i>` with the slot absent.
 *
 * Only names some corpus case constructs are admitted, so every arm here is
 * held to the gem's own bytes by a test. `Left` and `Right` own their `to_html`
 * and interpolate the parameter RAW — for a node that is Ruby's default
 * `Object#to_s`, a heap address, so neither is reproducible. The remaining
 * trigonometric and `log`-family names take the same carrier shape as `Sin` and
 * `Cos`, but no case exercises them; an unmeasured name raises.
 */
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
  renderUnarySlot,
  s,
} from "../../formats/html/render-shared";

/**
 * Admitted alias -> its measured `invert_unicode_symbols` label.
 *
 * A table rather than a rule: see the module note on `Sup`, where that label
 * and the downcased class name are not the same string.
 */
const MEASURED_LABELS: ReadonlyMap<string, string> = new Map([
  ["Sin", "sin"],
  ["Cos", "cos"],
]);

export function renderUnaryFunction(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  if (node.name === "Tr") return renderTr(node.parameterOne, context);

  const label = MEASURED_LABELS.get(node.name);
  if (label === undefined) {
    throw new RenderError(
      `UnaryFunction alias "${node.name}" has not been measured for HTML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  return renderUnaryDefault(label, node.parameterOne, context, "unaryFunction.parameterOne");
}

/** `Tr#to_html`: table cells joined with no separator inside one row tag. */
function renderTr(value: unknown, context: RenderContext): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `Tr.parameterOne: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      "unaryFunction",
    );
  }
  const inner = value
    .map((item, index) => s(renderChild(item, context, `Tr.parameterOne[${index}]`)))
    .join("");
  return `<tr>${inner}</tr>`;
}

/** `UnaryFunction#to_html`: italicized measured label followed by one slot wrapper. */
export function renderUnaryDefault(
  measuredLabel: string,
  parameterOne: unknown,
  context: RenderContext,
  at: string,
): string {
  return `<i>${measuredLabel}</i>${renderUnarySlot(parameterOne, context, at)}`;
}
