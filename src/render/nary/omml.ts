import { hasNodeKind, RenderError } from "../../core/index";
import {
  controlProperties,
  decodeEntities,
  describeSlot,
  FORMAT,
  type NodeOf,
  naryAttrValue,
  ommlSlot,
  type RenderContext,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * `Nary#chr_value` (nary.rb:155-160) suppresses the whole `m:chr` element for
 * exactly one value, and it tests the SINGLY decoded operator to decide:
 *
 * ```ruby
 * first_value = Utility.html_entity_to_unicode(parameter_one&.nary_attr_value(options: options))
 * unless first_value == "∫"
 *   narypr << XmlHelper.ox_element("chr", namespace: "m", attributes: { "m:val": first_value })
 * ```
 *
 * The attribute it writes is decoded a second time on the way out, by the XML
 * engine rather than by this method. So the predicate reads decode^1 and the
 * document carries decode^2.
 *
 * Measured on the oracle at `00c52783` over `Nary(Symbol(v), x, x, x, {})`:
 * `"∫"`, `"&#x222b;"`, `"&#x222B;"`, `"&#8747;"` and `"&int;"` each give an
 * `m:naryPr` whose first child is `m:limLoc`; `"&amp;#x222b;"` and the other
 * three double-encoded spellings give `<m:chr m:val="∫"/>`, because decode^1
 * leaves an entity standing and only decode^2 reaches the integral; and
 * `"&#x2211;"` gives `<m:chr m:val="∑"/>` — the decoded character, never the
 * entity as written.
 */
const SUPPRESSED_NARY_OPERATOR = "∫";

/** Ruby `nil`, which this model spells as either an assigned `null` or an absent field. */
function isNil(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * `parameter_one.nary_attr_value(options:)`. Four classes answer it: `Symbol`
 * (`symbols/symbol.rb:101-105`, `naryAttrValue`), `Sum` and `Prod`, whose
 * readers return the literal `"∑"` and `"∏"` (`function/sum.rb:131-133`,
 * `function/prod.rb:125-127`) and never look at their own slots, and `Formula`
 * (`formula.rb:294-296`), which FORWARDS to `value.first.nary_attr_value` —
 * so a `Nary` operator slot that was split into a one-element `Formula` by
 * `splitOnLinebreak` (line-break-073) reads through to whatever that single
 * element is, recursively if it is itself a `Formula`. A `Nary` whose operator
 * is a `Sum` or `Prod` is what the gem's `omml_spec.rb` builds for
 * `EX_182`/`EX_183`. Any other class has no such reader and the gem raises
 * `NoMethodError`, so anything else stays a refusal (`null`).
 */
function operatorText(first: unknown, kind: string): string | null {
  if (!hasNodeKind(first)) return null;
  switch ((first as { readonly kind: string }).kind) {
    case "symbol":
      return naryAttrValue(first as NodeOf<"symbol">, kind, "nary.parameterOne");
    case "sum":
      return "∑";
    case "prod":
      return "∏";
    case "formula": {
      const value = (first as NodeOf<"formula">).value;
      const head = value === null || value.length === 0 ? undefined : value[0];
      return operatorText(head, kind);
    }
    default:
      return null;
  }
}

export function renderNary(node: NodeOf<"nary">, context: RenderContext): XmlElement {
  const limitLocation = limitLocationValue(node);
  const first = node.parameterOne;
  const rawOperator = isNil(first) ? "" : operatorText(first, node.kind);
  if (rawOperator === null) {
    throw new RenderError(
      "nary.parameterOne: only a Symbol, Sum or Prod operator is implemented in this slice",
      FORMAT,
      node.kind,
    );
  }
  // The operator is decoded twice HERE, and the two decodes are read by
  // different things and must not be collapsed into one. `Nary#chr_value`
  // (nary.rb:155-160) tests `first_value` — ONE decode — as its suppression
  // predicate, while the attribute is decoded a second time only when the
  // document is written (`ox_engine/element.rb:105-107` in `update_attrs`, and
  // `oga/dumper.rb:90` for the other engine). Collapsing them suppresses
  // `m:chr` for an operator written double-encoded, which the gem emits.
  // Both stages go through the shared guarded decode, so a code point UTF-8
  // cannot hold refuses here rather than reaching the renderer boundary as a
  // stack-depth error.
  //
  // A THIRD decode sits upstream of these two, inside `nary_attr_value`, and
  // on the generated-literal arm only; `naryAttrValue` carries it, because
  // that is where the gem puts it.
  const firstValue = decodeEntities(rawOperator, node.kind, "nary.parameterOne");
  const operatorValue = decodeEntities(firstValue, node.kind, "nary.parameterOne");
  const properties = new XmlElement("m:naryPr").append(
    firstValue === SUPPRESSED_NARY_OPERATOR
      ? null
      : new XmlElement("m:chr").setAttribute("m:val", operatorValue),
    new XmlElement("m:limLoc").setAttribute("m:val", limitLocation),
    // `Nary#hide_tags` is `return nar unless field.nil?` — an explicit nil test,
    // NOT Ruby-falsy: a `false` slot keeps its hide tag off. An absent field
    // reads as `nil` in Ruby, so `undefined` counts alongside `null` here.
    isNil(node.parameterTwo) ? new XmlElement("m:subHide").setAttribute("m:val", "1") : null,
    isNil(node.parameterThree) ? new XmlElement("m:supHide").setAttribute("m:val", "1") : null,
    controlProperties(),
  );
  return new XmlElement("m:nary").append(
    properties,
    ommlSlot(node.parameterTwo, "sub", context, node.kind, "nary.parameterTwo"),
    ommlSlot(node.parameterThree, "sup", context, node.kind, "nary.parameterThree"),
    ommlSlot(node.parameterFour, "e", context, node.kind, "nary.parameterFour"),
  );
}

/**
 * The `m:limLoc` value, `Nary#chr_value` (nary.rb:155-166):
 * `(self.options[:type] || "subSup").to_s`. The options read is unguarded, so a
 * slot that is not a hash raises — nil with `NoMethodError`, a String or Array
 * with `TypeError`, `false` with `NoMethodError` (all measured on the oracle at
 * `00c52783`). `type` itself is `||`-defaulted, so nil and `false` give
 * `"subSup"` (measured), and anything else is stringified: `"undOvr"` is the
 * one value the gem's own parsers build, `5` gave `"5"` and `:abc` gave
 * `"abc"`. Only what this port can spell exactly is stringified — a string, an
 * integer, `true`; a Float, a list or a node has a Ruby `to_s` this file will
 * not guess.
 *
 * Every other key is never read here: `mask` is a MathML-only option, and
 * `{mask: 13}` gives the same `m:naryPr` as `{}` (measured).
 */
function limitLocationValue(node: NodeOf<"nary">): string {
  const options: unknown = node.options;
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new RenderError(
      `nary.options: is ${describeSlot(options)}, not a hash — the gem raises reading options[:type]`,
      FORMAT,
      node.kind,
    );
  }
  const type = (options as Readonly<Record<string, unknown>>).type;
  if (type === null || type === undefined || type === false) return "subSup";
  if (typeof type === "string") return type;
  if (type === true) return "true";
  if (typeof type === "number" && Number.isInteger(type)) return String(type);
  throw new RenderError(
    `nary.options.type: holds ${describeSlot(type)}, whose Ruby to_s is not reproduced here`,
    FORMAT,
    node.kind,
  );
}
