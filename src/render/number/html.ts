import {
  applyNumberFormat,
  FORMAT,
  interpolatedValue,
  isGemNumericValue,
  type NodeOf,
  type RenderContext,
  refuseNonNumericUnderFormatter,
} from "../../formats/html/render-shared";

/**
 * `Number#to_html`: with no `formatter:` option, the raw value through
 * Ruby's text-number spelling, nil is empty. With one, and a gem-numeric
 * value (`isGemNumericValue`), the numeric pipeline
 * (`../../formatting/number-format.ts`).
 *
 * A value that is neither refuses, matching `Formatter::Numbers::
 * Source#validate_numeric!` (`../../formatting/number-format.ts`'s
 * `refuseNonNumericUnderFormatter`).
 */
export function renderNumber(node: NodeOf<"number">, context: RenderContext): string {
  const value = node.value;
  if (context.numberFormat !== null) {
    if (isGemNumericValue(value)) return applyNumberFormat(value, context.numberFormat);
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
  }
  return interpolatedValue(value, node.kind, "number.value");
}
