import {
  applyNumberFormat,
  interpolatedValue,
  isPlainFormattableNumber,
  type NodeOf,
  type RenderContext,
} from "../../formats/html/render-shared";

/**
 * `Number#to_html`: with no `formatter:` option, the raw value through
 * Ruby's text-number spelling, nil is empty. With one, and a value B2's
 * first slice measures (a plain digit string, `isPlainFormattableNumber`),
 * the default-symbol substitution (`../../formatting/number-format.ts`).
 */
export function renderNumber(node: NodeOf<"number">, context: RenderContext): string {
  const value = node.value;
  if (context.numberFormat !== null && isPlainFormattableNumber(value)) {
    return applyNumberFormat(value, context.numberFormat);
  }
  return interpolatedValue(value, node.kind, "number.value");
}
