/**
 * Mirrors `function/nary.rb` — `Nary#to_mathml_without_math_tag` (:49) and
 * `#tag_name` (:219): the script tag from `options[:type]` — `"undOvr"`
 * selects the munderover family (probe nary-undovr) — and the second/third
 * slots' presence, falling to a bare `<mrow>` with neither (probe
 * nary-bare); slots through `validate_mathml_fields`. A fourth slot appends
 * behind the script, wrapped in `<mrow>` UNLESS its render already is one —
 * the gem's one literal-true `wrap_mrow` (probes nary-p4-sym /
 * nary-p4-formula). `self.options[:mask]` reads truthily (`nary.rb:56`):
 * a nil options hash crashes the gem, and a live mask rewrites the script
 * tag in place (`maskedNaryScript`). Under intent the outer `<mrow>` is tagged by
 * `naryand_intent` with the operator's own name (`intentName`).
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  hashOrNil,
  maskedNaryScript,
  type NodeOf,
  naryandIntent,
  present,
  type RenderContext,
  slotKind,
  validateMathmlFields,
  wrapMrow,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * The 13 symbol classes with `is_nary_symbol?` true, and the `nary_intent_name`
 * each answers (`symbols/{bigwedge,clockoint,cntclockoint,coprod,dint,duni,
 * iiiint,iiint,iint,intclockwise,oiiint,oiint,oint}.rb`). Hand-listed; the
 * `intent-nary` fixture group renders every one of them through `Nary` under
 * `intent: true` and records the gem's `intent` attribute, so a wrong name
 * here fails a byte comparison. (Symbols outside this set answer nil for
 * `is_nary_symbol?`, which `Nary#intent_name` maps to `":n-ary"`.)
 */
const NARY_SYMBOL_INTENT_NAMES: ReadonlyMap<string, string> = new Map([
  ["Bigwedge", ":n-ary"],
  ["Clockoint", ":n-ary"],
  ["Cntclockoint", ":anticlockwise contour integral"],
  ["Coprod", ":coproduct"],
  ["Dint", ":n-ary"],
  ["Duni", ":n-ary"],
  ["Iiiint", ":quadruple integral"],
  ["Iiint", ":triple integral"],
  ["Iint", ":double integral"],
  ["Intclockwise", ":clockwise contour integral"],
  ["Oiiint", ":volume integral"],
  ["Oiint", ":surface integral"],
  ["Oint", ":contour integral"],
]);

/**
 * `Nary#intent_name` (nary.rb:233): `":n-ary"` unless `parameter_one` is one
 * of the nary symbols, whose own name it then is. `false&.` and `nil&.` skip;
 * anything that is not a node answers no `is_nary_symbol?` and raises.
 */
function intentName(node: NodeOf<"nary">): string {
  const first: NodeParameter | undefined = node.parameterOne;
  if (first === null || first === undefined || (first as unknown) === false) return ":n-ary";
  if (slotKind(first) === undefined) {
    throw new RenderError(
      `nary.parameterOne: ${describeSlot(first)} does not answer is_nary_symbol? — the gem ` +
        "raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  if (slotKind(first) !== "symbol") return ":n-ary";
  const id = (first as { readonly id?: unknown }).id;
  return (typeof id === "string" ? NARY_SYMBOL_INTENT_NAMES.get(id) : undefined) ?? ":n-ary";
}

export function renderNary(node: NodeOf<"nary">, context: RenderContext): XmlElement {
  // Gem order kept: the three slots render FIRST, then `tag_name` reads
  // `options[:type]` — which is where a nil or non-hash options slot
  // crashes (`nil[:type]` NoMethodError, `"zz"[:type]` TypeError).
  const children = [
    validateMathmlFields(node.parameterOne, context, "nary.parameterOne"),
    validateMathmlFields(node.parameterTwo, context, "nary.parameterTwo"),
    validateMathmlFields(node.parameterThree, context, "nary.parameterThree"),
  ];
  const options = node.options;
  if (options === null || options === undefined) {
    throw new RenderError(
      "nary.options: is nil — tag_name reads options[:type] unguarded and the gem " +
        "raises NoMethodError",
      FORMAT,
      node.kind,
    );
  }
  const hash = hashOrNil(options, node.kind, "nary.options");
  let script = new XmlElement(naryTagName(node, hash)).append(children);
  if (hash !== null && present(hash.mask)) {
    script = maskedNaryScript(
      script,
      hash.mask,
      { lowerIsNil: isNil(node.parameterTwo), upperIsNil: isNil(node.parameterThree) },
      node.kind,
      "nary.options.mask",
    );
  }
  if (!present(node.parameterFour)) return script;
  // `wrap_mrow(..., true)`: the literal `true` wraps whatever is not an `<mrow>`.
  const wrapped = wrapMrow(
    validateMathmlFields(node.parameterFour, context, "nary.parameterFour"),
    true,
    node.kind,
    "nary.parameterFour",
  );
  const mrow = new XmlElement("mrow").append(script, wrapped);
  return context.intent ? naryandIntent(mrow, intentName(node)) : mrow;
}

/**
 * `Nary#tag_name` (`nary.rb:219-230`). The gem declares it PROTECTED, so
 * `PowerBase` calling it on a `Nary` first slot raises NoMethodError (probe
 * raw-powerbase-nary) — the ternary kind file refuses that shape itself,
 * which is why nothing here is exported.
 */
function naryTagName(node: NodeOf<"nary">, options: Record<string, unknown> | null): string {
  const tag = options !== null && options.type === "undOvr" ? "munderover" : "msubsup";
  if (present(node.parameterTwo) && present(node.parameterThree)) return tag;
  if (present(node.parameterTwo)) return tag === "munderover" ? "munder" : "msub";
  if (present(node.parameterThree)) return tag === "munderover" ? "mover" : "msup";
  return "mrow";
}

/** Ruby `nil?`: `false` is not nil, unlike in the truthiness tests above. */
function isNil(value: unknown): boolean {
  return value === null || value === undefined;
}
