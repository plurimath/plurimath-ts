/**
 * Mirrors `function/binary_function.rb` and the name arms for the gem
 * classes the census folds into this carrier, EVERY reachable one of which
 * has its own mathml override: `power.rb`, `mod.rb`, `td.rb`, `lim.rb`,
 * `log.rb`, `root.rb`, `stackrel.rb`, and the two intent-bearing classes
 * `inf.rb` and `intent.rb`. The carrier default
 * (`binary_function.rb`'s `<mrow>` around an `<mo>` operator) is therefore
 * dead for the measured set, and an unmeasured name raises — the same guard
 * the asciimath file holds.
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import {
  attrOf,
  classNameOf,
  describeSlot,
  encode,
  FORMAT,
  functionIntent,
  gemCrash,
  hashOrNil,
  type MathmlRendered,
  type NodeOf,
  nameOf,
  nodesOf,
  present,
  type RenderContext,
  renderChild,
  requireElement,
  setAttributesFromHash,
  slotKind,
  unreachableName,
  validateMathmlFields,
} from "../../formats/mathml/render-shared";
import {
  MATHML_PAREN_ROLE_IDS,
  MATHML_REACHABLE_CARRIER_NAMES,
} from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

const REACHABLE_BINARY_NAMES: ReadonlySet<string> = new Set([
  ...MATHML_REACHABLE_CARRIER_NAMES.binary,
  "Power",
  "Mod",
  "Td",
  "Inf",
  "Intent",
]);

export function renderBinaryFunction(
  node: NodeOf<"binaryFunction">,
  context: RenderContext,
): MathmlRendered {
  const name = node.name;
  switch (name) {
    case "Power": {
      // `power.rb:21`: `<mover>` when the base's class_name is ubrace or
      // obrace (probe power-ubrace), `<msup>` otherwise; both slots through
      // `validate_mathml_fields` — nil contributes nothing (probe
      // power-nil-nil renders `<msup/>`).
      const baseName = classNameOf(node.parameterOne);
      const tag = baseName === "ubrace" || baseName === "obrace" ? "mover" : "msup";
      return new XmlElement(tag).append(
        validateMathmlFields(node.parameterOne, context, "power.parameterOne"),
        validateMathmlFields(node.parameterTwo, context, "power.parameterTwo"),
      );
    }
    case "Mod": {
      // `mod.rb:34-48`: `<mrow>` around `<mi>mod</mi>` (empty `<mi/>` under
      // hide_function_name — probe mod-hide), the slots nil-guarded by
      // truthiness.
      const mi = new XmlElement("mi");
      if (!present(node.hideFunctionName)) mi.append("mod");
      return new XmlElement("mrow").append(
        present(node.parameterOne)
          ? renderChild(node.parameterOne, context, "mod.parameterOne")
          : null,
        mi,
        present(node.parameterTwo)
          ? renderChild(node.parameterTwo, context, "mod.parameterTwo")
          : null,
      );
    }
    case "Td":
      return renderTd(node, context);
    case "Intent":
      return renderIntentFunction(node, context);
    case "Lim":
    case "Inf": {
      // `lim.rb:37`: `<mo>lim</mo>` bare without values; else
      // m{underover|under|over} by the slots' truthiness (probes lim-*).
      // `inf.rb:24` is the same body with `<mo>inf</mo>`, and both end in
      // `intentify(tag, intent, func_name: :function)`.
      const word = name === "Lim" ? "lim" : "inf";
      const mo = new XmlElement("mo").append(word);
      if (!present(node.parameterOne) && !present(node.parameterTwo)) return mo;
      const tag =
        present(node.parameterOne) && present(node.parameterTwo)
          ? "munderover"
          : present(node.parameterOne)
            ? "munder"
            : "mover";
      const script = new XmlElement(tag).append(
        mo,
        node.parameterOne === null || node.parameterOne === undefined
          ? null
          : renderChild(node.parameterOne, context, `${word}.parameterOne`),
        node.parameterTwo === null || node.parameterTwo === undefined
          ? null
          : renderChild(node.parameterTwo, context, `${word}.parameterTwo`),
      );
      return context.intent ? functionIntent(script, ":function") : script;
    }
    case "Log": {
      // `log.rb:82`: `<mi>log</mi>` (empty under hide — probe log-hide,
      // where the empty `<mi/>` STAYS as the first script child) bare
      // without values; else m{subsup|sub|sup}, slots through
      // `validate_mathml_fields`.
      const mi = new XmlElement("mi");
      if (!present(node.hideFunctionName)) mi.append("log");
      if (!present(node.parameterOne) && !present(node.parameterTwo)) return mi;
      const tag =
        present(node.parameterOne) && present(node.parameterTwo)
          ? "msubsup"
          : present(node.parameterOne)
            ? "msub"
            : "msup";
      return new XmlElement(tag).append(
        mi,
        validateMathmlFields(node.parameterOne, context, "log.parameterOne"),
        validateMathmlFields(node.parameterTwo, context, "log.parameterTwo"),
      );
    }
    case "Root": {
      // `root.rb:13-22`: `<mroot>` over [SECOND, FIRST] — the swap probed
      // (probe root), nil slots contributing nothing (probe root-nil-nil).
      return new XmlElement("mroot").append(
        node.parameterTwo === null || node.parameterTwo === undefined
          ? null
          : renderChild(node.parameterTwo, context, "root.parameterTwo"),
        node.parameterOne === null || node.parameterOne === undefined
          ? null
          : renderChild(node.parameterOne, context, "root.parameterOne"),
      );
    }
    case "Stackrel": {
      // `stackrel.rb:19` with `#mathml_values` (:74): `<mover>` over
      // [mrow(SECOND), mrow(FIRST)], a nil slot's mrow holding the empty
      // STRING — the long-form `<mrow></mrow>` (probe stackrel-nil-one). A
      // slot rendering to a spliced array crashes the gem's `<<` (probe
      // stackrel-nowrap-formula) and raises here.
      return new XmlElement("mover").append(
        stackrelValue(node.parameterTwo, node.kind, context, "stackrel.parameterTwo"),
        stackrelValue(node.parameterOne, node.kind, context, "stackrel.parameterOne"),
      );
    }
    default:
      if (!REACHABLE_BINARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      // Every reachable name has its own arm above; a listed name reaching
      // here means the census and this switch disagree.
      throw new RenderError(
        `binaryFunction name "${name}" is measured but has no mathml arm — renderer defect`,
        FORMAT,
        node.kind,
      );
  }
}

/** `Stackrel#mathml_values`: `ox_element("mrow") << (render || "")`. */
function stackrelValue(
  value: NodeParameter | undefined,
  kind: string,
  context: RenderContext,
  at: string,
): XmlElement {
  const mrow = new XmlElement("mrow");
  const rendered = value === null || value === undefined ? null : renderChild(value, context, at);
  if (rendered === null) return mrow.append("");
  if (Array.isArray(rendered)) {
    throw new RenderError(
      `${at}: rendered to a spliced list — the gem's << sends .xml_nodes to it and raises`,
      FORMAT,
      kind,
    );
  }
  return mrow.append(rendered);
}

/**
 * `Td#to_mathml_without_math_tag` (`td.rb:18-28`): the EMPTY STRING when the
 * first cell entry is a `Vert` paren — or any symbol whose value is `"|"`
 * (`Utility.symbol_value`, lib/plurimath/utility.rb:202-209; probe symbol-pipe-td) — else
 * `<mtd>` with `parameter_two` as attributes when non-empty (`&.any?`),
 * cells mapped nil-safely.
 */
function renderTd(node: NodeOf<"binaryFunction">, context: RenderContext): MathmlRendered {
  const cells = node.parameterOne;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      `td.parameterOne: is ${describeSlot(cells)}, not a list — the gem sends .first ` +
        "to it and raises NoMethodError",
      FORMAT,
      node.kind,
    );
  }
  if (isVertOnly(cells[0])) return "";
  const mtd = new XmlElement("mtd");
  const attributes = hashOrNil(node.parameterTwo, node.kind, "td.parameterTwo");
  if (attributes !== null && Object.keys(attributes).length > 0) {
    setAttributesFromHash(mtd, attributes, node.kind, "td.parameterTwo");
  }
  for (const cell of cells) {
    if (cell === null || cell === undefined) continue;
    mtd.append(renderChild(cell, context, "td.parameterOne"));
  }
  return mtd;
}

const VERT_IDS: ReadonlySet<string> = new Set(MATHML_PAREN_ROLE_IDS.vert);

/** `Utility.symbol_value(object, "|")`, exported for the table kind file's column scan. */
export function isVertOnly(cell: unknown): boolean {
  if (typeof cell !== "object" || cell === null || Array.isArray(cell)) return false;
  const record = cell as {
    readonly kind?: unknown;
    readonly id?: unknown;
    readonly value?: unknown;
  };
  if (record.kind !== "symbol") return false;
  if (typeof record.id === "string" && VERT_IDS.has(record.id)) return true;
  return record.value === "|";
}

/**
 * `Intent#to_mathml_without_math_tag` (`intent.rb:7-12`): the first parameter's
 * render with an `intent` attribute written straight into its Ox attributes (no
 * entity decode, like `function_intent`). Unlike every other intent writer it
 * does NOT look at the `intent` option — the class exists to carry an author's
 * own intent, so it writes with `intent: false` too. A first parameter that
 * renders to anything but one element (a wrapperless `Formula` splices a list)
 * has no `attributes` and raises.
 */
function renderIntentFunction(node: NodeOf<"binaryFunction">, context: RenderContext): XmlElement {
  const rendered = renderChild(node.parameterOne, context, "intent.parameterOne");
  const element = requireElement(rendered, node.kind, "intent.parameterOne");
  element.setAttribute("intent", encodedIntent(node, element));
  return element;
}

/** `parameter_two.value`: `Text#value` is its `parameter_one`; a `Symbol`/`Number` its `value`. */
function valueOfSecond(node: NodeOf<"binaryFunction">): unknown {
  const two = node.parameterTwo;
  switch (slotKind(two)) {
    case "text":
      return (two as { readonly parameterOne?: unknown }).parameterOne;
    case "symbol":
    case "number":
      return (two as { readonly value?: unknown }).value;
    default:
      throw new RenderError(
        `intent.parameterTwo: ${describeSlot(two)} — the gem sends .value to it and raises ` +
          "or feeds the result to html_entity_to_unicode",
        FORMAT,
        node.kind,
      );
  }
}

/** `Intent#encoded_intent` (`intent.rb:25-34`). */
function encodedIntent(node: NodeOf<"binaryFunction">, tag: XmlElement): string {
  const value = valueOfSecond(node);
  if (value === ":derivative" && encodable(node)) return derivativeIntent(node, tag);
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new RenderError(
      "intent.parameterTwo: value is not a String — html_entity_to_unicode raises on it",
      FORMAT,
      node.kind,
    );
  }
  // `html_entity_to_unicode(nil)` is nil, and `attributes["intent"] = nil` dumps as "".
  return htmlEntityToUnicode((value as string | null | undefined) ?? "");
}

/**
 * The symbol classes for which `Core#prime_unicode?` (core.rb:415) is true by
 * way of `hexcode_in_input` — measured by asking the pinned oracle's
 * `prime_unicode?` about an instance of every one of the 1,436 `Symbols::Symbol`
 * descendants (nine answered true; `Bar`, `If`, `Paren` and `Ul` raise).
 */
const PRIME_SYMBOL_IDS: ReadonlySet<string> = new Set([
  "Dprime",
  "Pppprime",
  "Ppprime",
  "Pprime",
  "Prime",
  "Qprime",
  "Second",
  "Sprime",
  "Third",
]);
const PRIME_CRASH_IDS: ReadonlySet<string> = new Set(["Bar", "If", "Paren", "Ul"]);
const PRIME_ENTITIES: readonly string[] = [
  "&#x2057;",
  "&#x2034;",
  "&#x2033;",
  "&#x2032;",
  "&#x27;",
];

function primeUnicode(field: unknown, kind: string): boolean {
  if (slotKind(field as never) !== "symbol") return false;
  const symbol = field as { readonly id?: unknown; readonly value?: unknown };
  const id = typeof symbol.id === "string" ? symbol.id : "Symbol";
  if (typeof symbol.value === "string" && symbol.value.includes("&#x27;")) return true;
  if (id === "Symbol") {
    if (typeof symbol.value !== "string") throw gemCrash("prime_unicode?", "nil has no include?");
    return PRIME_ENTITIES.some((prime) => (symbol.value as string).includes(prime));
  }
  if (PRIME_CRASH_IDS.has(id)) {
    throw new RenderError(`prime_unicode?: ${id} raises NoMethodError in the gem`, FORMAT, kind);
  }
  return PRIME_SYMBOL_IDS.has(id);
}

/** `Intent#encodable?` (`intent.rb:36-43`). */
function encodable(node: NodeOf<"binaryFunction">): boolean {
  const one = node.parameterOne;
  const oneKind = slotKind(one);
  if (oneKind !== "formula" && oneKind !== "mrow") return false;
  const list = (one as { readonly value?: unknown }).value;
  const field = Array.isArray(list) ? list[0] : undefined;
  if (slotKind(field as never) !== "binaryFunction") return false;
  if ((field as { readonly name?: unknown }).name !== "Power") return false;
  const power = field as { readonly parameterOne?: unknown; readonly parameterTwo?: unknown };
  return (
    primeUnicode(power.parameterTwo, node.kind) &&
    slotKind(power.parameterOne as never) === "symbol"
  );
}

/** The `:derivative(1,<name>[(<args>)],<args>)` string (`intent.rb:26-31`, `fence_value` :45). */
function derivativeIntent(node: NodeOf<"binaryFunction">, tag: XmlElement): string {
  const at = "encoded_intent";
  const list = (node.parameterOne as { readonly value: readonly unknown[] }).value;
  const power = list[0] as { readonly parameterOne: { readonly value?: unknown } };
  const unicode = encode(power.parameterOne.value, at);
  const second = nodesOf(tag, at)[1];
  let unfenced: string | undefined;
  if (attrOf(second, "intent", at) === ":fenced") {
    const inner = nodesOf(second, at);
    // `nodes[1..-2]`: nil for an empty list, else all but the first and last.
    if (inner.length === 0) throw gemCrash(at, "nil has no each");
    unfenced = "";
    for (const child of inner.slice(1, Math.max(inner.length - 1, 1))) {
      if (nameOf(child, at) !== "mi") break;
      const text = encode(nodesOf(child, at)[0], at);
      if (text === undefined) throw gemCrash(at, "no implicit conversion of nil into String");
      unfenced += text;
    }
  }
  if (unfenced === undefined) throw gemCrash(at, "nil has no empty?");
  const fenced = unfenced === "" ? "" : `(${unfenced})`;
  return `:derivative(1,${unicode ?? ""}${fenced},${unfenced})`;
}
