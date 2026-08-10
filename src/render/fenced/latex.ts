/**
 * Mirrors `function/fenced.rb` — `Fenced#to_latex` (:71), `#latex_paren`
 * (:246) and `#symbol_or_paren` (:324): the two spaces around the body are
 * the gem's own, and a second slot that is not a list raises `NoMethodError`
 * there and `RenderError` here (the §5 runtime-boundary mapping).
 *
 * Measured pin worth naming: a `Paren`-classed slot renders via `to_latex`
 * (specific_values included for the abstract base) but any OTHER node
 * contributes its raw `value` ivar — so a base `Symbol` slot skips
 * `specific_values` while a base `Paren` slot applies it.
 */

import { type NodeParameter, RenderError } from "../../core/index";
import { NODE_SPECS } from "../../core/normalize";
import {
  classBasename,
  describeSlot,
  FORMAT,
  isNode,
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/latex/render-shared";

export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): string {
  const open = latexParen(fencedSlotValue(node.parameterOne, context, "fenced.parameterOne"));
  const close = latexParen(fencedSlotValue(node.parameterThree, context, "fenced.parameterThree"));
  const two = node.parameterTwo;
  let body = "";
  if (two !== null && two !== undefined) {
    if (!Array.isArray(two)) {
      throw new RenderError(
        `fenced.parameterTwo: is ${describeSlot(two)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    body = two.map((item) => s(renderChild(item, context, "fenced.parameterTwo"))).join(" ");
  }
  return `${open} ${body} ${close}`;
}

/**
 * `Fenced#symbol_or_paren(field, lang: :latex)` (`fenced.rb:324`): a
 * `Paren`-classed field renders via `to_latex` (specific_values included for
 * the abstract base); any OTHER field contributes its raw `value` ivar — a
 * base `Symbol`'s stored string, a number's digits, a text's string. Fields
 * whose `value` is a node list (formula, mrow, table) would interpolate
 * Ruby's default `#inspect` — an object address no byte-level port can
 * reproduce — so those raise instead (recorded in TODO.plan/deferred.md);
 * fields with no `value` method raise NoMethodError in the gem.
 */
function fencedSlotValue(
  field: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string | null {
  if (field === null || field === undefined) return null;
  if (!isNode(field)) {
    throw new RenderError(
      `${at}: cannot read a paren from ${describeSlot(field)} — the gem raises NoMethodError here`,
      FORMAT,
      "fenced",
    );
  }
  switch (field.kind) {
    case "symbol": {
      const id = field.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
      if (id === "Paren") {
        // The abstract base is the one Paren id that renders its stored
        // value, so it is the one Paren id whose render can hand
        // `latex_paren` a raw non-string — the same crash surface the
        // non-paren arms guard below (probe fenced-base-paren-ivar-true =>
        // NoMethodError). Checked BEFORE rendering, so the admission the
        // symbol renderer makes for interpolation contexts never leaks into
        // this string-operating one.
        strictParenValue(field.value, at);
        return context.render(field);
      }
      if (id.startsWith("Paren::")) return context.render(field);
      if (field.value === null || field.value === undefined) return null;
      return strictParenValue(field.value, at);
    }
    case "number":
      if (field.value === null || field.value === undefined) return null;
      return strictParenValue(field.value, at);
    case "text": {
      const text = field.parameterOne;
      if (text === null || text === undefined) return null;
      if (typeof text === "string") return text;
      throw new RenderError(
        `${at}: text holds ${describeSlot(text)}; the gem interpolates a ` +
          "nondeterministic #inspect here, which cannot be reproduced",
        FORMAT,
        "fenced",
      );
    }
    case "formula":
    case "mrow":
    case "table":
      throw new RenderError(
        `${at}: holds a "${field.kind}" node, whose value is a list; the gem ` +
          "interpolates a nondeterministic #inspect address here, which cannot be reproduced",
        FORMAT,
        "fenced",
      );
    default:
      throw new RenderError(
        `${at}: a "${field.kind}" node has no value ivar — the gem raises NoMethodError here`,
        FORMAT,
        "fenced",
      );
  }
}

/**
 * The strict half of `symbol_or_paren`'s raw `value` read: only nil and a
 * string are admissible HERE, although the symbol renderer itself admits
 * booleans and the non-finite floats for interpolation contexts. This slot
 * feeds `latex_paren`, which sends `include?` to the value — NoMethodError
 * in the gem for booleans, every number, and nodes (probe
 * probe-latex-degenerate.rb, 2026-08-10: fenced-number-true/nan/int-5/node
 * and fenced-symbol-forced-true all raise) — and a hash slips through
 * `include?` (Hash has one) into interpolation bytes `String()` cannot
 * match (fenced-number-hash renders `"{a: 1} x )"`). Loud either way, never
 * silently divergent bytes.
 */
function strictParenValue(value: unknown, at: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new RenderError(
    `${at}: holds ${describeSlot(value)} — the gem's latex_paren sends include? to it ` +
      "(NoMethodError there), or interpolates bytes String() cannot match",
    FORMAT,
    "fenced",
  );
}

/** `Fenced#latex_paren` (`fenced.rb:246`): nil → "", `{:`/`:}` lose the colon. */
function latexParen(paren: string | null): string {
  if (paren === null) return "";
  if (paren === "{:" || paren === ":}") return paren.replace(/:/g, "");
  return paren;
}
