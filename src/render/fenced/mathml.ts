/**
 * Mirrors `function/fenced.rb` — `Fenced#to_mathml_without_math_tag` (:22),
 * `#mathml_paren` (:254) and `#symbol_or_paren` (:324): an `<mrow>` of
 * `<mo>open</mo>`, the body, `<mo>close</mo>`. Each `<mo>`'s attributes come
 * from `options[:open_paren]` / `options[:close_paren]` (probe
 * fenced-options), and its text from the paren slot:
 *
 *   - a `Paren::*` symbol renders and contributes its element's text (probe
 *     fenced-round);
 *   - any OTHER symbol contributes its raw `value` — nil is the long-form
 *     `<mo></mo>` (probes fenced-symbol-parens / fenced-times-paren);
 *   - a `Number` its `value`, a `Text` its `parameter_one` (the gem's
 *     `field&.value` reaches both readers — probes fenced-number-paren /
 *     fenced-text-paren); a node without a `value` reader (`Sin`,
 *     `Linebreak`, ...) crashes the gem and raises here, as does a
 *     `Formula`/`Table` whose `value` is a list (`<<` crashes on it —
 *     probe raw-fenced-formula-paren);
 *   - a text containing `":"` — `"{:"`, `":}"` — and the four invisible
 *     UnicodeMath fences (`&#x3016;` …) blank to `""` (probe
 *     fenced-invisible).
 *
 * The body is `parameter_two&.map`, nil-safe per element and `[]` for nil
 * (probe fenced-nil-body); `intentify` is identity with intent off.
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  hashOrNil,
  type MathmlRendered,
  type NodeOf,
  type RenderContext,
  renderChild,
  setAttributesFromHash,
  slotKind,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

/** `unicodemath_syntax` (`fenced.rb:255`): the four invisible fence texts. */
const INVISIBLE_FENCES: ReadonlySet<string> = new Set([
  "&#x3016;",
  "&#x3017;",
  "&#x2524;",
  "&#x251c;",
]);

export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): XmlElement {
  const options = hashOrNil(node.options, node.kind, "fenced.options");
  const open = paren(node, node.parameterOne, context, "fenced.parameterOne");
  const openMo = new XmlElement("mo");
  applyParenAttributes(openMo, options?.open_paren, node.kind, "fenced.options.open_paren");
  openMo.append(open ?? "");

  const close = paren(node, node.parameterThree, context, "fenced.parameterThree");
  const closeMo = new XmlElement("mo");
  applyParenAttributes(closeMo, options?.close_paren, node.kind, "fenced.options.close_paren");
  closeMo.append(close ?? "");

  const body: MathmlRendered[] = [];
  const two = node.parameterTwo;
  if (two !== null && two !== undefined) {
    if (!Array.isArray(two)) {
      throw new RenderError(
        `fenced.parameterTwo: is ${describeSlot(two)}, not a list — the gem raises ` +
          "NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    for (const item of two) {
      if (item === null || item === undefined) continue; // `object&.` per element
      body.push(renderChild(item, context, "fenced.parameterTwo"));
    }
  }
  return new XmlElement("mrow").append(openMo, body, closeMo);
}

function applyParenAttributes(mo: XmlElement, value: unknown, kind: string, at: string): void {
  const attributes = hashOrNil(value, kind, at);
  if (attributes !== null) setAttributesFromHash(mo, attributes, kind, at);
}

/**
 * `mathml_paren` over `symbol_or_paren(field, lang: :mathml)`: the composed
 * text, or null where Ruby's is nil (the caller appends `""`).
 */
function paren(
  node: NodeOf<"fenced">,
  field: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string | null {
  const raw = symbolOrParen(node, field, context, at);
  if (raw === null) return null;
  if (raw.includes(":") || INVISIBLE_FENCES.has(raw)) return "";
  return raw;
}

function symbolOrParen(
  node: NodeOf<"fenced">,
  field: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string | null {
  if (field === null || field === undefined) return null;
  const kind = slotKind(field);
  if (kind === "symbol") {
    const symbol = field as { readonly id?: unknown; readonly value?: unknown };
    const id = symbol.id;
    if (typeof id === "string" && (id === "Paren" || id.startsWith("Paren::"))) {
      // `field.is_a?(Math::Symbols::Paren)` — render it and read the
      // element's first (text) node back, exactly the gem's
      // `.to_mathml_without_math_tag(...).nodes.first`.
      const rendered = renderChild(field, context, at);
      if (rendered instanceof XmlElement) {
        const first = rendered.children[0];
        return typeof first === "string" ? first : null;
      }
      return null;
    }
    // `field&.value` on any other symbol: the raw stored value.
    const value = symbol.value;
    if (value === null || value === undefined) return null;
    return requireParenText(value, node.kind, at);
  }
  if (kind === "number") {
    // `field&.value` reaches Number#value; only a string survives the
    // `include?`/`<<` sends that follow (a numeric or boolean value raises
    // NoMethodError in the gem before anything renders).
    const value = (field as { readonly value?: unknown }).value;
    if (value === null || value === undefined) return null;
    return requireParenText(value, node.kind, at);
  }
  if (kind === "text") {
    const value = (field as { readonly parameterOne?: unknown }).parameterOne;
    if (value === null || value === undefined) return null;
    return requireParenText(value, node.kind, at);
  }
  throw new RenderError(
    `${at}: holds ${describeSlot(field)}${kind === undefined ? "" : ` (kind "${kind}")`} — ` +
      "the gem's value read either raises NoMethodError or feeds << a non-string " +
      "(probes fenced-sin-paren, raw-fenced-formula-paren)",
    FORMAT,
    node.kind,
  );
}

/** The `<<`-bound paren text: `paren&.include?(":")` then `mo << paren` — only a string survives both. */
function requireParenText(value: unknown, kind: string, at: string): string {
  if (typeof value === "string") return value;
  throw new RenderError(
    `${at}: value holds ${describeSlot(value)} — the gem sends include? / << to it and raises`,
    FORMAT,
    kind,
  );
}
