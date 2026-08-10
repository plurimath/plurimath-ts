/**
 * Mirrors `function/color.rb` — `Color#to_mathml_without_math_tag` (:33)
 * and `#mathml_options` (:79): `<mstyle>` over the SECOND slot, with a
 * `mathcolor` — `mathbackground` when `options[:backgroundcolor]` is truthy
 * (probe color-background) — built from the FIRST slot's ASCIIMATH render,
 * whitespace- then quote-stripped (`gsub(/\s/, '').gsub('"', '')`).
 *
 * That asciimath call is the one place the gem's mathml path crosses
 * formats, and this port's format slices are independent (§3) — so the
 * crossing is reproduced over the MEASURED first-slot shapes only, from the
 * mathml slice's own generated copy of the symbol literals:
 *
 *   - a formula/mrow joins its children's asciimath with a space
 *     (`Formula#to_asciimath`) — the shape every parsed `color(...)` has
 *     (probe color-p1-class: `color(red)(x)` holds a Formula of value
 *     symbols; `color(#ff0000)` mixes in an id symbol and a number);
 *   - a base symbol renders its value, an id symbol its generated literal
 *     (`Eqno` -> `"P{eqno}"`, probed end-to-end), a number its raw value,
 *     a text its quoted parameter with `unicode[:x]` unwrapped;
 *   - any OTHER first-slot kind — `Frac` renders `mathcolor="frac(x)(y)"`
 *     in the gem (probe color-frac-p1), a full asciimath render this
 *     format cannot own — raises `RenderError`, a recorded divergence
 *     (TODO.plan/deferred.md) rather than a silent approximation;
 *   - a bare `Number` FIRST slot crashes the gem's own formatter path
 *     (probe color-number) and raises here; the number arm below serves the
 *     nested-in-formula numbers the gem does render (probe `color(#ff0000)`).
 */

import type { MathNode, NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  hashOrNil,
  interpolatedValue,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  setDecodedAttribute,
  slotKind,
} from "../../formats/mathml/render-shared";
import { MATHML_COLOR_SYMBOL_LITERALS } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

export function renderColor(node: NodeOf<"color">, context: RenderContext): XmlElement {
  const mstyle = new XmlElement("mstyle");
  if (present(node.parameterOne)) {
    const options = hashOrNil(node.options, node.kind, "color.options");
    const key =
      options !== null && present(options.backgroundcolor) ? "mathbackground" : "mathcolor";
    const value = colorAsciimath(node.parameterOne, node.kind, true)
      .replace(/[ \t\r\n\f\v]/g, "")
      .replace(/"/g, "");
    // The engine wrapper's entity decode applies to every attribute write,
    // and here it is reachable from a parse: a quoted first slot carries its
    // text's raw bytes (`color("&#x2211;")(x)` renders mathcolor="∑" in the
    // gem — probe color-entity, oracle bytes e2 88 91).
    setDecodedAttribute(mstyle, key, value, node.kind, `color.${key}`);
  }
  if (node.parameterTwo !== null && node.parameterTwo !== undefined) {
    mstyle.append(renderChild(node.parameterTwo, context, "color.parameterTwo"));
  }
  return mstyle;
}

/**
 * `parameter_one.to_asciimath(options:)` over the measured shapes. `topLevel`
 * marks the direct slot: a bare `Number` there crashes the gem (its
 * asciimath formatter path dies before rendering — probe color-number),
 * while one nested in the formula renders its raw value (probe
 * `color(#ff0000)`).
 */
function colorAsciimath(value: NodeParameter | undefined, kind: string, topLevel: boolean): string {
  const valueKind = slotKind(value);
  switch (valueKind) {
    case "formula":
    case "mrow": {
      const children = (value as MathNode & { readonly value?: unknown }).value;
      if (!Array.isArray(children)) {
        throw new RenderError(
          `color.parameterOne.value: is ${describeSlot(children)}, not a list — ` +
            "the gem raises NoMethodError here",
          FORMAT,
          kind,
        );
      }
      return children.map((child) => colorAsciimath(child, kind, false)).join(" ");
    }
    case "symbol": {
      const symbol = value as MathNode & { readonly id?: string; readonly value?: unknown };
      if (symbol.id === undefined || symbol.id === "Symbol" || symbol.id === "Paren") {
        // `Symbols::Symbol#to_asciimath`: `value.nil? ? "" : value`.
        return interpolatedValue(symbol.value, kind, "color.parameterOne symbol value");
      }
      const literal = MATHML_COLOR_SYMBOL_LITERALS.get(symbol.id);
      if (literal === undefined) {
        throw new RenderError(
          `color.parameterOne: no measured asciimath literal for symbol "${symbol.id}"`,
          FORMAT,
          kind,
        );
      }
      return literal;
    }
    case "number": {
      if (topLevel) {
        throw new RenderError(
          "color.parameterOne: a bare Number first slot crashes the gem's own " +
            "formatter path (probe color-number)",
          FORMAT,
          kind,
        );
      }
      return interpolatedValue(
        (value as MathNode & { readonly value?: unknown }).value,
        kind,
        "color.parameterOne number value",
      );
    }
    case "text": {
      const text = (value as MathNode & { readonly parameterOne?: unknown }).parameterOne;
      if (text === null || text === undefined) return '""';
      if (typeof text !== "string") {
        throw new RenderError(
          `color.parameterOne: text holds ${describeSlot(text)} — the gem raises here`,
          FORMAT,
          kind,
        );
      }
      // `Text#to_asciimath`: quoted, `unicode[:x]` tokens unwrapped.
      return `"${text.replace(/unicode\[:(\w+)\]/g, "$1")}"`;
    }
    default:
      throw new RenderError(
        `color.parameterOne: holds ${describeSlot(value)}${
          valueKind === undefined ? "" : ` (kind "${valueKind}")`
        } — its mathcolor would be that node's FULL asciimath render, which this ` +
          "format does not own; recorded divergence (TODO.plan/deferred.md)",
        FORMAT,
        kind,
      );
  }
}
