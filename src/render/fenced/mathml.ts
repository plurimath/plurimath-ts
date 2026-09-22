/**
 * Mirrors `function/fenced.rb` — `Fenced#to_mathml_without_math_tag` (:35),
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
 * (probe fenced-nil-body). Under intent the body first passes the
 * partial-derivative rewrite (`mathml_value`, :407) and the `<mrow>` is then
 * tagged by `intentify(:interval_fence)`: `:fenced`, an interval name
 * (`open-interval(a,b)` ...), or `binomial-coefficient(n,k)` — chosen from the
 * paren texts and the body's shape by `intent_value` (:338) and its helpers.
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  describeSlot,
  type FencedIntentName,
  FORMAT,
  fencedPartialDerivative,
  gemCrash,
  hashOrNil,
  intervalFenceIntent,
  type MathmlRendered,
  type NodeOf,
  nameOf,
  nodesOf,
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
      // `object&.` per element: a nil stays in the list (it counts toward the
      // interval test's `value.length`) and `update_nodes` skips it.
      body.push(
        item === null || item === undefined
          ? null
          : renderChild(item, context, "fenced.parameterTwo"),
      );
    }
  }
  if (context.intent) fencedPartialDerivative(body);
  const fenced = new XmlElement("mrow").append(openMo, body, closeMo);
  if (!context.intent) return fenced;
  // `mrow_value`: the paren `<mo>`s around the body, as the gem's list.
  const mrowValue: MathmlRendered[] = [openMo, ...body, closeMo];
  return intervalFenceIntent(fenced, intentValue(node, mrowValue, context));
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

/**
 * The four `Paren` classes whose `to_latex` is a bracket `intent_value` compares
 * against (measured: of the 25 `Symbols::Paren` classes on the pinned oracle,
 * exactly `Lround`, `Rround`, `Lsquare`, `Rsquare` answer `(`, `)`, `[`, `]`;
 * none of the 25 raises). Any other `Paren` answers something these
 * comparisons never match, which is all the interval test needs.
 */
const PAREN_LATEX: ReadonlyMap<string, string> = new Map([
  ["Paren::Lround", "("],
  ["Paren::Rround", ")"],
  ["Paren::Lsquare", "["],
  ["Paren::Rsquare", "]"],
]);

/**
 * `symbol_or_paren(field, lang: :latex)` (:324): a `Paren` answers its LaTeX,
 * anything else its `value`. The value branch is `symbolOrParen`'s own.
 */
function latexParen(
  node: NodeOf<"fenced">,
  field: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string | null {
  const id = slotKind(field) === "symbol" ? (field as { readonly id?: unknown }).id : undefined;
  if (typeof id === "string" && (id === "Paren" || id.startsWith("Paren::"))) {
    return PAREN_LATEX.get(id) ?? "\0";
  }
  return symbolOrParen(node, field, context, at);
}

/** `intent_value` (:338): which `intent_names` key tags this fence. */
function intentValue(
  node: NodeOf<"fenced">,
  mrowValue: readonly MathmlRendered[],
  context: RenderContext,
): FencedIntentName | undefined {
  if (binomialCoefficient(node)) return "binomialCoefficient";
  const open = latexParen(node, node.parameterOne, context, "fenced.parameterOne");
  const close = latexParen(node, node.parameterThree, context, "fenced.parameterThree");
  if (!intervalIntent(mrowValue, open, close)) return "fenced";
  return intervalIntentName(open, close);
}

/** `binomial_coefficient?` (:359): the first body node is a `Frac` carrying `:choose`. */
function binomialCoefficient(node: NodeOf<"fenced">): boolean {
  const two = node.parameterTwo;
  const first = Array.isArray(two) ? two[0] : undefined;
  if (slotKind(first) !== "frac") return false;
  const options = hashOrNil(
    (first as { readonly options?: unknown }).options,
    node.kind,
    "frac.options",
  );
  return (
    options !== null &&
    options.choose !== null &&
    options.choose !== undefined &&
    options.choose !== false
  );
}

/**
 * `interval_intent` (:355-368): `nil` where the pair is not one of the
 * interval shapes — unreachable after `interval_intent?` answered true, but the
 * gem's `case` is kept.
 */
function intervalIntentName(
  open: string | null,
  close: string | null,
): FencedIntentName | undefined {
  switch (open) {
    case "(":
      return close === "]" ? "openClosedInterval" : undefined;
    case "[":
      if (close === "]") return "closedInterval";
      return close === "[" || close === ")" ? "closedOpenInterval" : undefined;
    case "]":
      if (close === "]") return "openClosedInterval";
      return close === "[" ? "openInterval" : undefined;
    default:
      return undefined;
  }
}

/** `interval_intent?` (:370-379). */
function intervalIntent(
  value: readonly MathmlRendered[],
  open: string | null,
  close: string | null,
): boolean {
  if (value.length !== 5) return false;
  if (!intervalIntentValue(value)) return false;
  switch (open) {
    case "(":
      return close === "]";
    case "]":
      return close === "[" || close === "]";
    case "[":
      return close === "[" || close === "]" || close === ")";
    default:
      return false;
  }
}

/** `interval_intent_value?` (:381-386). */
function intervalIntentValue(value: readonly MathmlRendered[]): boolean {
  if (nodesOf(value[2], "interval_intent_value?")[0] !== ",") return false;
  return validIntentValue(value[1]) && validIntentValue(value[3]);
}

/** `valid_intent_value?` (:388-399): nil (falsy) for a node name the `case` does not list. */
function validIntentValue(node: unknown): boolean {
  const at = "valid_intent_value?";
  switch (nameOf(node, at)) {
    case "mrow": {
      const names = nodesOf(node, at).map((child) => nameOf(child, at));
      return names.every((n) => n === "mn") || names.every((n) => n === "mo" || n === "mi");
    }
    case "mi":
    case "mo":
      return matchesText(node, /[A-Za-z]/);
    case "mn":
      return matchesText(node, /[0-9]/);
    default:
      return false;
  }
}

/** `node.nodes.first.match?(regex)`: nil and elements have no `match?`. */
function matchesText(node: unknown, pattern: RegExp): boolean {
  const first = nodesOf(node, "match_node_value?")[0];
  if (typeof first !== "string") throw gemCrash("match_node_value?", "no match? on a non-String");
  return pattern.test(first);
}
