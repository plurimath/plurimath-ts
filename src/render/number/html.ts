import {
  applyNumberFormat,
  FORMAT,
  interpolatedValue,
  isPlainFormattableNumber,
  type NodeOf,
  type RenderContext,
  refuseNonNumericUnderFormatter,
} from "../../formats/html/render-shared";

/**
 * `Number#to_html`: with no `formatter:` option, the raw value through
 * Ruby's text-number spelling, nil is empty. With one, and a value B2's
 * first slice measures (a plain digit string, `isPlainFormattableNumber`),
 * the default-symbol substitution (`../../formatting/number-format.ts`).
 *
 * A value that is neither refuses, matching `Formatter::Numbers::
 * Source#validate_numeric!` (`../../formatting/number-format.ts`'s
 * `refuseNonNumericUnderFormatter`): a value it lets through but
 * `isPlainFormattableNumber` already said no to is gem-valid and still
 * renders raw, unformatted — out of this slice's scope, not an error.
 */
export function renderNumber(node: NodeOf<"number">, context: RenderContext): string {
  const value = node.value;
  if (context.numberFormat !== null) {
    if (isPlainFormattableNumber(value)) return applyNumberFormat(value, context.numberFormat);
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
  }
  return interpolatedValue(value, node.kind, "number.value");
}
