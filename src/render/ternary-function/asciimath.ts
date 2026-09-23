/**
 * Mirrors `function/ternary_function.rb` — `TernaryFunction#to_asciimath`
 * (:26) and `#ascii_wrap` (:188). The census folds one AsciiMath-reachable
 * class into this carrier: `PowerBase` (`power_base.rb`, constructed directly
 * by `newPowerBase` in `../../formats/asciimath/transform.ts`), which adds nothing to the carrier
 * default.
 *
 * Three more classes are reached only through the LaTeX and UnicodeMath
 * parsers, or a hand-built tree: `Limits` (`limits.rb`, no `to_asciimath` of
 * its own, so the carrier default renders it), `Multiscript`
 * (`multiscript.rb:14`) and `Rule` (`rule.rb:14`, which is `""`). Each was
 * checked byte-for-byte against the gem by the `ternary-function` group of
 * `test/formats/ternary-function/render-fixtures.json`.
 */

import { type NodeParameter, RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
  slotKind,
  unreachableName,
  wrapped,
} from "../../formats/asciimath/render-shared";

/**
 * The names that take the carrier default: `Limits` inherits it unchanged,
 * and `Underover#to_asciimath` (`underover.rb`) is a byte-identical copy of
 * `TernaryFunction#to_asciimath` (measured and read side by side — same three
 * guarded assignments, same interpolation).
 */
const CARRIER_DEFAULT_NAMES: ReadonlySet<string> = new Set(["PowerBase", "Limits", "Underover"]);

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): string {
  // `def to_asciimath(**) = ""` (`rule.rb:14`): no slot is read at all.
  if (node.name === "Rule") return "";
  if (node.name === "Multiscript") return renderMultiscript(node, context);
  if (!CARRIER_DEFAULT_NAMES.has(node.name)) throw unreachableName(node.kind, node.name);
  // `TernaryFunction#to_asciimath` — `PowerBase` and `Limits` add nothing to it.
  const one = present(node.parameterOne)
    ? asciiWrap(node.parameterOne, context, "ternaryFunction.parameterOne")
    : "";
  const two = present(node.parameterTwo)
    ? `_${wrapped(node.parameterTwo, context, "ternaryFunction.parameterTwo")}`
    : "";
  const three = present(node.parameterThree)
    ? `^${wrapped(node.parameterThree, context, "ternaryFunction.parameterThree")}`
    : "";
  return `${one}${two}${three}`;
}

/**
 * `TernaryFunction#ascii_wrap` (`ternary_function.rb:188`): parenthesizes
 * ONLY a formula (`Mrow` and `Mstyle` included — they are `Formula`
 * subclasses). The `field.class.name.include?("Function")` arm is dead code
 * in the gem (it sits after `||` on the class itself), so `sin x` in a first
 * slot stays bare. The obrace/ubrace early return is equally inert — neither
 * is a `Formula` — but it is the gem's code path, so the answer is the same.
 */
function asciiWrap(value: NodeParameter | undefined, context: RenderContext, at: string): string {
  const rendered = s(renderChild(value, context, at));
  const kind = slotKind(value);
  return kind === "formula" || kind === "mrow" ? `(${rendered})` : rendered;
}

/**
 * `Multiscript#to_asciimath` (`multiscript.rb:14`). Its `unless
 * valid_value_exist?(field)` guards test `!field && (field&.empty? || ...)`,
 * which is falsy for nil (the `&.` calls answer nil) and for every truthy
 * field, so both scripts and the `\ ` prescript prefix are ALWAYS emitted: a
 * nil script reads `nil&.map…&.join`, which is nil and interpolates as the
 * empty string, giving `_()`. A script that is anything but a list or nil —
 * `false` included — has no `map` (or `empty?`) and the gem raises
 * NoMethodError.
 */
function renderMultiscript(node: NodeOf<"ternaryFunction">, context: RenderContext): string {
  const sub = scriptList(node.parameterTwo, context, "ternaryFunction.parameterTwo");
  const sup = scriptList(node.parameterThree, context, "ternaryFunction.parameterThree");
  const base = optionalChild(node.parameterOne, context, "ternaryFunction.parameterOne");
  return `\\ _(${sub})^(${sup})${base}`;
}

/** `field&.map { |param| param.to_asciimath(options:) }&.join`, as a string. */
function scriptList(value: NodeParameter | undefined, context: RenderContext, at: string): string {
  if (value === null || value === undefined) return "";
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}: is ${describeSlot(value)}, not a list — the gem raises NoMethodError calling map`,
      FORMAT,
      "ternaryFunction",
    );
  }
  return value.map((item, index) => s(renderChild(item, context, `${at}[${index}]`))).join("");
}

/** `field&.to_asciimath(options:)`: only nil short-circuits, so `false` still raises. */
function optionalChild(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  if (value === null || value === undefined) return "";
  return s(renderChild(value, context, at));
}
