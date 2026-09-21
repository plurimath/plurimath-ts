/**
 * Mirrors `function/frac.rb` — `Frac#to_mathml_without_math_tag` (:33):
 * `<mfrac>` — or `<mrow>` under `hide_function_name` (probe frac-hide) —
 * over the two nil-safe slots. With the `mfrac` tag and a truthy `options`
 * hash, every option except `:choose` becomes an attribute (probes
 * frac-options / frac-options-choose); the reject runs on a hash only —
 * `Frac.new(x, y, "zz")` crashes the gem and raises here. Under intent the
 * fraction first passes `update_derivative` (a numerator that already carries
 * an unfinished `:derivative(...,)` gets its last argument from the
 * denominator, :162) and then `intentify(:frac)`, which tags a partial
 * derivative or a derivative (`IntentEncoding.frac_intent`).
 */

import { htmlEntityToUnicode } from "../../core/nodes";
import {
  el,
  fracIntent,
  gemCrash,
  hashOrNil,
  type MathmlRendered,
  type NodeOf,
  nameOf,
  nodesOf,
  present,
  type RenderContext,
  renderChild,
  setAttributesFromHash,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderFrac(node: NodeOf<"frac">, context: RenderContext): XmlElement {
  const tagName = present(node.hideFunctionName) ? "mrow" : "mfrac";
  const frac = new XmlElement(tagName);
  if (tagName === "mfrac" && present(node.options)) {
    const options = hashOrNil(node.options, node.kind, "frac.options");
    if (options !== null) {
      const kept = Object.fromEntries(Object.entries(options).filter(([key]) => key !== "choose"));
      setAttributesFromHash(frac, kept, node.kind, "frac.options");
    }
  }
  const numerator =
    node.parameterOne === null || node.parameterOne === undefined
      ? null
      : renderChild(node.parameterOne, context, "frac.parameterOne");
  const denominator =
    node.parameterTwo === null || node.parameterTwo === undefined
      ? null
      : renderChild(node.parameterTwo, context, "frac.parameterTwo");
  frac.append(numerator, denominator);
  if (!context.intent) return frac;
  updateDerivative(numerator, denominator);
  return fracIntent(frac);
}

/**
 * `Frac#update_derivative` (`frac.rb:162-174`) and `#validate_derivative`
 * (:176-192). Reads the numerator's first child's `intent`; when that is an
 * unfinished `:derivative(...,)` the denominator's `d`-letter fills it in.
 * The gem's `num.is_a?(::Array)` arm is dead — `num&.name` is sent first, and
 * an Array has no `name` — so a spliced-list numerator raises, as here.
 */
function updateDerivative(num: MathmlRendered, den: MathmlRendered): void {
  const at = "update_derivative";
  if (num !== null) {
    const name = nameOf(num, at);
    if (name === "mi" || name === "mo" || name === "mn") return;
  }
  // `num&.nodes&.first&.[]("intent")`: `String#[]` answers a substring or nil,
  // never one that starts with ":derivative", so a text first child is "none".
  const first = num === null ? undefined : nodesOf(num, at)[0];
  const intent = first instanceof XmlElement ? first.attributes.get("intent") : undefined;
  if (intent === undefined) return;
  if (!(intent.startsWith(":derivative") && intent.endsWith(",)"))) return;
  const fill = validateDerivative(nodesOf(den, at));
  el(first, at).setAttribute(
    "intent",
    htmlEntityToUnicode(intent.replace(/,\)$/, () => `,${fill})`)),
  );
}

function validateDerivative(denNodes: ReturnType<typeof nodesOf>): string {
  const at = "validate_derivative";
  let str = "";
  if (nameOf(denNodes[0], at) !== "mi") return str;
  const node = denNodes[1];
  const name = nameOf(node, at);
  if (name !== "msub" && name !== "msup") return str;
  const head = nodesOf(node, at)[0];
  const headName = nameOf(head, at);
  if (headName === "mi") {
    str = concat(str, htmlEntityToUnicode(nodesOf(head, at)[0] as string), at);
  } else if (headName === "mrow") {
    for (const element of nodesOf(head, at)) {
      if (nameOf(element, at) !== "mi") break;
      str = concat(str, decodedText(element, at), at);
    }
  }
  return str;
}

function decodedText(element: unknown, at: string): string | undefined {
  const text = nodesOf(element, at)[0];
  return typeof text === "string" ? htmlEntityToUnicode(text) : undefined;
}

function concat(left: string, right: string | undefined, at: string): string {
  if (right === undefined) throw gemCrash(at, "no implicit conversion of nil into String");
  return left + right;
}
