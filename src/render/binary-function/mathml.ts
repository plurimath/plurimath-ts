/**
 * Mirrors `function/binary_function.rb` and the name arms for the gem
 * classes the census folds into this carrier, EVERY reachable one of which
 * has its own mathml override: `power.rb`, `mod.rb`, `td.rb`, `lim.rb`,
 * `log.rb`, `root.rb`, `stackrel.rb` — and, for the classes the AsciiMath
 * transform never builds, `over.rb`, `inf.rb`, `menclose.rb` and
 * `mlabeledtr.rb`, each of which also overrides. The carrier default
 * (`binary_function.rb`'s `<mrow>` around an `<mo>` operator) is therefore
 * dead for the measured set, and an unmeasured name raises — the same guard
 * the asciimath file holds.
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  classNameOf,
  describeSlot,
  FORMAT,
  hashOrNil,
  type MathmlRendered,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  setAttributesFromHash,
  setDecodedAttribute,
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
    case "Over": {
      // `over.rb:19`: `<mfrac>` — or `<mrow>` under `hide_function_name` —
      // over the two `&.` slots; unlike `Frac` it has no attributes.
      return new XmlElement(present(node.hideFunctionName) ? "mrow" : "mfrac").append(
        node.parameterOne === null || node.parameterOne === undefined
          ? null
          : renderChild(node.parameterOne, context, "over.parameterOne"),
        node.parameterTwo === null || node.parameterTwo === undefined
          ? null
          : renderChild(node.parameterTwo, context, "over.parameterTwo"),
      );
    }
    case "Menclose": {
      // `menclose.rb:29`: `<menclose notation=parameter_one>` around the
      // second slot when it is truthy. `notation` is `to_s` of the slot, so a
      // node there is a heap address (`attributeText` raises); a slot
      // rendering to a spliced array crashes the gem's `<<` and raises here.
      const menclose = new XmlElement("menclose");
      setDecodedAttribute(
        menclose,
        "notation",
        node.parameterOne,
        node.kind,
        "menclose.parameterOne",
      );
      if (present(node.parameterTwo)) {
        menclose.append(
          spliceFree(
            renderChild(node.parameterTwo, context, "menclose.parameterTwo"),
            node.kind,
            "menclose.parameterTwo",
          ),
        );
      }
      return menclose;
    }
    case "Mlabeledtr": {
      // `mlabeledtr.rb:7`: `<mtable>` around one `<mlabeledtr>` holding two
      // `<mtd>` cells, SECOND slot first. Both slots are read unguarded, so a
      // nil one raises (`renderChild`), as does a cell that renders to
      // something `<<` cannot take (`spliceFree`).
      const second = mlabeledtrCell(
        node.parameterTwo,
        node.kind,
        context,
        "mlabeledtr.parameterTwo",
      );
      const first = mlabeledtrCell(
        node.parameterOne,
        node.kind,
        context,
        "mlabeledtr.parameterOne",
      );
      return new XmlElement("mtable").append(new XmlElement("mlabeledtr").append(second, first));
    }
    case "Inf":
    case "Lim": {
      // `lim.rb:37`, `inf.rb:19`: `<mo>lim</mo>` (`<mo>inf</mo>`) bare without
      // values; else m{underover|under|over} by the slots' truthiness
      // (probes lim-*).
      const keyword = name.toLowerCase();
      const mo = new XmlElement("mo").append(keyword);
      if (!present(node.parameterOne) && !present(node.parameterTwo)) return mo;
      const tag =
        present(node.parameterOne) && present(node.parameterTwo)
          ? "munderover"
          : present(node.parameterOne)
            ? "munder"
            : "mover";
      return new XmlElement(tag).append(
        mo,
        node.parameterOne === null || node.parameterOne === undefined
          ? null
          : renderChild(node.parameterOne, context, `${keyword}.parameterOne`),
        node.parameterTwo === null || node.parameterTwo === undefined
          ? null
          : renderChild(node.parameterTwo, context, `${keyword}.parameterTwo`),
      );
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

/**
 * What the gem's `Element#<<` takes: a string or an element. An array
 * (`.xml_nodes` sent to it) or nil raises `NoMethodError` there, and a
 * `RenderError` here.
 */
function spliceFree(rendered: MathmlRendered, kind: string, at: string): XmlElement | string {
  if (typeof rendered === "string" || rendered instanceof XmlElement) return rendered;
  throw new RenderError(
    `${at}: rendered to ${rendered === null ? "nil" : "a spliced list"} — the gem's << ` +
      "sends .xml_nodes to it and raises",
    FORMAT,
    kind,
  );
}

/** `Mlabeledtr#labeledtr_td` (`mlabeledtr.rb:25`): `<mtd>` around one rendered slot. */
function mlabeledtrCell(
  value: NodeParameter | undefined,
  kind: string,
  context: RenderContext,
  at: string,
): XmlElement {
  return new XmlElement("mtd").append(spliceFree(renderChild(value, context, at), kind, at));
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
