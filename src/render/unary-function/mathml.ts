/**
 * Mirrors `function/unary_function.rb` — `UnaryFunction#to_mathml_without_math_tag`
 * (:30) and `#mathml_value` (:209, hoisted to
 * `../../formats/mathml/render-shared.ts`) — plus the name arms for the gem
 * classes the census folds into this carrier with their *own* mathml
 * overrides: `cancel.rb`, `left.rb`, `right.rb`, `function/sup.rb`, `mbox.rb`,
 * `tr.rb`. Every other name in `MEASURED_UNARY_NAMES` below renders the
 * carrier default.
 *
 * Measured pins (probe-mathml-kinds on the pinned oracle):
 *
 *   - a `UNARY_CLASSES` member renders `<mi>name</mi>` and — with
 *     `unary_function_spacing` on, the default — the whole element wraps in
 *     `<mrow><mo rspace="thickmathspace"/>…</mrow>` (probe sin-x); a
 *     non-member renders a bare `<mo>` with no wrap, which of the admitted
 *     names only `Hom` takes (`Cancel`, the one reachable non-member, has
 *     its own `menclose` arm and never reaches the default);
 *   - `hide_function_name` drops the name element but keeps the spacing
 *     wrap: `sin-hide-nil` renders `<mrow><mo rspace="thickmathspace"/></mrow>`,
 *     and with spacing off the render is Ruby nil;
 *   - a list parameter compacts nil entries before rendering (sin-list-nil).
 */

import type { NodeOptions, NodeParameter } from "../../core/index";
import { RenderError, TextNode } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  functionIntent,
  type MathmlRendered,
  mathmlValue,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  requireStringForAppend,
  unreachableName,
} from "../../formats/mathml/render-shared";
import {
  MATHML_PAREN_ROLE_IDS,
  MATHML_REACHABLE_CARRIER_NAMES,
  MATHML_UNARY_MI_NAMES,
} from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";
import { renderText } from "../text/mathml";

/** `Utility::UNARY_CLASSES` — the names rendered as a spacing-wrapped `<mi>`. */
const UNARY_MI: ReadonlySet<string> = new Set(MATHML_UNARY_MI_NAMES);

/**
 * The fresh `Text` that `mbox.rb` builds out of the slot.
 *
 * The `?? null` is the whole point. `Text.new(parameter_one)` passes the slot
 * POSITIONALLY, so a nil slot stays nil — but `Text#initialize` defaults an
 * OMITTED argument to `""` where `UnaryFunction#initialize` defaults to nil
 * (measured on the pinned oracle `00c52783`: `Text.new.parameter_one` is `""`,
 * `Mbox.new.parameter_one` is nil), and `TextNode` faithfully reproduces that
 * `""` for an `undefined` init. §5's structural dispatch admits a plain object
 * with `parameterOne` absent, which reaches here as `undefined`; without the
 * narrowing it would render `Text.new("")` where the gem renders
 * `Text.new(nil)` — `<mtext></mtext>` against `<mtext/>`. An explicit `""` and
 * an explicit `false` both pass through untouched.
 */
function mboxText(parameterOne: NodeParameter | undefined): NodeOf<"text"> {
  return new TextNode({ parameterOne: parameterOne ?? null });
}

export function renderUnaryFunction(
  node: NodeOf<"unaryFunction">,
  context: RenderContext,
): MathmlRendered {
  const name = node.name;
  switch (name) {
    case "Cancel": {
      // `cancel.rb:7-15`: `<menclose notation="updiagonalstrike">`, the
      // parameter nil-safe (probe cancel-nil renders the empty element).
      const enclose = new XmlElement("menclose").setAttribute("notation", "updiagonalstrike");
      if (node.parameterOne !== null && node.parameterOne !== undefined) {
        enclose.append(renderChild(node.parameterOne, context, "cancel.parameterOne"));
      }
      return enclose;
    }
    case "Left":
    case "Right": {
      // `left.rb:11-15` / `right.rb:11-15`: a bare `<mo>`, the paren text
      // appended only for a truthy parameter; `"\\{"`/`"\\}"` normalize to
      // the brace (left_paren/right_paren, :66-70). Only a string can be
      // appended — `Left.new(5)` and `Left.new(true)` crash the gem.
      const mo = new XmlElement("mo");
      if (present(node.parameterOne)) {
        const raw = requireStringForAppend(
          node.parameterOne,
          node.kind,
          `${name.toLowerCase()}.parameterOne`,
        );
        const escaped = name === "Left" ? "\\{" : "\\}";
        const brace = name === "Left" ? "{" : "}";
        mo.append(raw === escaped ? brace : raw);
      }
      return mo;
    }
    case "Sup": {
      // `function/sup.rb:7-18`: `<mrow>` over the value, `<mo>sup</mo>` prepended
      // unless `hide_function_name`.
      const parts = mathmlValue(node.parameterOne, context, "sup.parameterOne");
      if (!present(node.hideFunctionName)) {
        parts.unshift(new XmlElement("mo").append("sup"));
      }
      return new XmlElement("mrow").append(parts);
    }
    case "Mbox":
      // `mbox.rb:11-14`:
      // `Text.new(parameter_one).to_mathml_without_math_tag(intent, options:)`.
      // The slot is handed to a FRESH `Text` and rendered as one, so `<mtext>`
      // is the element — not the carrier's `<mi>`/`<mo>` shape, and no spacing
      // wrap.
      //
      // Measured on the pinned oracle `00c52783`, `Mbox.new(v)` against
      // `Text.new(v)`: the same element content on every shape.
      // `"hi"` → `<mtext>hi</mtext>`, `"a b"` → `<mtext>a b</mtext>`,
      // `""` → `<mtext></mtext>` (a text child that is the empty string),
      // nil and `false` → the childless `<mtext/>`; a node, a list and an
      // integer each die in `Text`'s own `gsub`, which is the refusal
      // `renderText` already carries.
      //
      // `mboxText` and not `new TextNode({ parameterOne: node.parameterOne })`:
      // `Text#initialize` defaults its slot to `""` where `Mbox.new` leaves nil,
      // and `<mtext></mtext>` and `<mtext/>` are different bytes.
      return renderText(mboxText(node.parameterOne));
    case "Phantom":
      // `phantom.rb:19`: `<mphantom>` over `Array(mathml_value)` — no
      // `hide_function_name` and no `intentify`, unlike the carrier default.
      return new XmlElement("mphantom").append(
        mathmlValue(node.parameterOne, context, "phantom.parameterOne"),
      );
    case "Substack":
      // `substack.rb:25`: `<mtable>` over `mathml_value` — the rows go in
      // as they render, with no wrapper of their own.
      return new XmlElement("mtable").append(
        mathmlValue(node.parameterOne, context, "substack.parameterOne"),
      );
    case "Tr":
      return renderTr(node, context);
    case "Longdiv":
    case "Merror":
    case "Scarries": {
      // `longdiv.rb:14-17`, `merror.rb:12-14`, `scarries.rb:14-17`:
      // `XmlHelper.update_nodes(ox_element("m#{tag}"), mathml_value(intent, options:))`
      // — `mlongdiv`/`merror`/`mscarries`, no `hide_function_name` reads at all.
      const tag = name === "Longdiv" ? "mlongdiv" : name === "Merror" ? "merror" : "mscarries";
      return new XmlElement(tag).append(
        mathmlValue(node.parameterOne, context, `${name.toLowerCase()}.parameterOne`),
      );
    }
    case "Msline":
      // `msline.rb:11`: `ox_element("msline")` — always childless, whatever
      // the slot holds.
      return new XmlElement("msline");
    case "Msgroup":
      // `msgroup.rb:18-23`: `<msgroup>` over `parameter_one.map { |object|
      // object&.to_mathml_without_math_tag(intent, options:) }` — a STRICT
      // list (`nil.map` raises), each member read WITH `&.` (a nil entry
      // drops out silently, unlike the ascii/latex twins).
      return new XmlElement("msgroup").append(
        renderMsgroupChildren(node.parameterOne, context, node.kind),
      );
    case "Mglyph":
      // `mglyph.rb:17-19`: `ox_element("mglyph", attributes: parameter_one)` —
      // the whole options record becomes attributes, in insertion order.
      return renderMglyph(node.parameterOne, node.kind);
    case "Ms":
      // `ms.rb:8-10`: `XmlHelper.ox_element("ms") << parameter_one` — the raw
      // slot appended directly (no interpolation), so only a STRING answers;
      // nil and anything else raise (measured: `Ms.new(nil).to_mathml` and
      // `Ms.new([...]).to_mathml` both raise, unlike the ascii/latex/omml/
      // unicodemath twins, which stringify or interpolate the slot first).
      return renderMs(node.parameterOne, node.kind);
    default:
      if (!MEASURED_UNARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      return renderUnaryMathmlDefault(
        name.toLowerCase(),
        node.parameterOne,
        node.hideFunctionName,
        context,
      );
  }
}

/**
 * `Tr#to_mathml_without_math_tag` (`tr.rb:23-31`): `<mtr>` over the cells,
 * after `remove_hline` drops a leading `Hline` symbol from the FIRST cell's
 * value — off `cloned_objects`, so the input tree is never mutated (this
 * port renders from a copied cell list instead of cloning). `filter_map`
 * keeps a `Td`'s `""` render (a Ruby String is not nil), which is how a
 * `Vert`-only cell forces `<mtr></mtr>` (probe td-vert-only). A first cell
 * without a `parameter_one` list — or a non-list cell value — crashed the
 * gem (probe tr-non-td-first) and raises here.
 */
function renderTr(node: NodeOf<"unaryFunction">, context: RenderContext): XmlElement {
  const cells = node.parameterOne;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      `tr.parameterOne: is ${describeSlot(cells)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  const mtr = new XmlElement("mtr");
  cells.forEach((cell, index) => {
    if (cell === null || cell === undefined) return; // filter_map drops nil renders of `obj&.`
    let effective = cell;
    if (index === 0) {
      effective = withLeadingHlineRemoved(cell, node.kind);
    }
    const rendered = renderChild(effective, context, "tr.parameterOne");
    if (rendered !== null) mtr.append(rendered);
  });
  return mtr;
}

/**
 * `Tr#remove_hline` (`tr.rb:120-124`): `first_value.first.parameter_one`
 * must answer a list — the gem clones, then SHIFTS a leading Hline off it.
 * The measured Hline ids come from the generated role table.
 */
function withLeadingHlineRemoved(cell: NodeParameter, kind: string): NodeParameter {
  const cellValue = (cell as { readonly parameterOne?: unknown }).parameterOne;
  if (!Array.isArray(cellValue)) {
    throw new RenderError(
      `tr.parameterOne[0].parameterOne: is ${describeSlot(cellValue)}, not a list — ` +
        "remove_hline raises NoMethodError in the gem",
      FORMAT,
      kind,
    );
  }
  const head = cellValue[0] as { readonly kind?: unknown; readonly id?: unknown } | undefined;
  const isHline =
    typeof head === "object" &&
    head !== null &&
    (head as { readonly kind?: unknown }).kind === "symbol" &&
    HLINE_IDS.has(String((head as { readonly id?: unknown }).id));
  if (!isHline) return cell;
  return {
    ...(cell as Record<string, unknown>),
    parameterOne: cellValue.slice(1),
  } as unknown as NodeParameter;
}

const HLINE_IDS: ReadonlySet<string> = new Set(MATHML_PAREN_ROLE_IDS.hline);

/**
 * The class names this carrier has measured behaviour for. Three sources,
 * and only the first is generated:
 *
 *   - the same AsciiMath-reachable set the asciimath renderer guards (there
 *     via the transform registry, here via the mathml slice's re-emission of
 *     the same `get_class` census);
 *   - `Tr`, which the transform constructs directly
 *     (ARCHITECTURE.md §5, "parity gaps fail loudly");
 *   - `Hom`, which the transform never constructs at all, but whose
 *     `to_mathml_without_math_tag` is the carrier's own.
 *
 * `Hom` is measured, not read off the class list: on the pinned oracle
 * `Hom.instance_method(:to_mathml_without_math_tag).owner` is
 * `UnaryFunction`, and of the 48 classes the census aliases onto this
 * carrier it is the only one both outside the reachable set and
 * carrier-default here. It is also the FIRST name to reach the `<mo>` arm of
 * `renderUnaryMathmlDefault`: `Cancel` is the only reachable non-member of
 * `UNARY_CLASSES` and it never gets there, having its own `menclose` arm
 * above, so before `Hom` that arm was unexercised. Measured through a
 * `Formula`: `Hom(Symbol("x"))` gives `<mrow><mo>hom</mo><mi>x</mi></mrow>`
 * and `Hom(nil)` gives `<mo>hom</mo>` — no `rspace` wrap either way.
 *
 * A name outside the set raises rather than rendering the carrier default,
 * because the gem class it denotes may override
 * `to_mathml_without_math_tag`.
 *
 * The last two entries are gem-derived data typed by hand — the exception
 * `TODO.plan/deferred.md` records under "The carrier name-guard sets are
 * partly hand-listed"; both are held by behavioural pins in
 * `test/formats/mathml/renderer.spec.ts`.
 */
const MEASURED_UNARY_NAMES: ReadonlySet<string> = new Set([
  ...MATHML_REACHABLE_CARRIER_NAMES.unary,
  "Tr",
  "Hom",
]);

/**
 * `UnaryFunction#to_mathml_without_math_tag` (`unary_function.rb:30-58`):
 * the name element (`<mi>` for a `UNARY_CLASSES` member, `<mo>` otherwise)
 * unless hidden; with a parameter, an `<mrow>` over name + value; and — for
 * a member, when `options[:unary_function_spacing]` is truthy — the whole
 * element behind an empty `<mo rspace="thickmathspace"/>` in one more
 * `<mrow>`. Exported for the kind files of classes that inherit it
 * unchanged (none of this port's own kinds do today — every mathml
 * override is measured per class — but `Norm`'s asciimath `super`
 * precedent keeps the seam explicit).
 */
export function renderUnaryMathmlDefault(
  className: string,
  parameterOne: NodeParameter | undefined,
  hideFunctionName: unknown,
  context: RenderContext,
): MathmlRendered {
  const isMi = UNARY_MI.has(className);
  const parts: MathmlRendered[] = [];
  if (!present(hideFunctionName)) {
    parts.push(new XmlElement(isMi ? "mi" : "mo").append(className));
  }
  let unaryElement: MathmlRendered;
  if (present(parameterOne)) {
    parts.push(...mathmlValue(parameterOne, context, `${className}.parameterOne`));
    unaryElement = new XmlElement("mrow").append(parts);
    // `intentify(mrow, intent, func_name: :function, intent_name: ":function")`.
    if (context.intent) functionIntent(unaryElement, ":function");
  } else {
    // `new_arr.first` — Ruby nil when the name was hidden.
    unaryElement = parts.length > 0 ? (parts[0] as MathmlRendered) : null;
  }
  if (isMi && context.unaryFunctionSpacing) {
    return new XmlElement("mrow").append(
      new XmlElement("mo").setAttribute("rspace", "thickmathspace"),
      unaryElement,
    );
  }
  return unaryElement;
}

/**
 * `Msgroup#to_mathml_without_math_tag` (`msgroup.rb:18-23`): the slot MUST be
 * a list (`nil.map` raises), and each member is read WITH `&.` — a nil entry
 * answers nil and `update_nodes` drops it, unlike the ascii/latex twins which
 * raise on one.
 */
function renderMsgroupChildren(
  value: NodeParameter | undefined,
  context: RenderContext,
  kind: string,
): readonly (MathmlRendered | null)[] {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `msgroup.parameterOne: is ${describeSlot(value)}, not a list — the gem raises NoMethodError calling map`,
      FORMAT,
      kind,
    );
  }
  return value.map((item, index) =>
    item === null || item === undefined
      ? null
      : renderChild(item, context, `msgroup.parameterOne[${index}]`),
  );
}

/** The slot as an options record — `Mglyph.new`'s default and the only shape measured. */
function mglyphRecord(value: NodeParameter | undefined, kind: string): NodeOptions {
  if (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !("kind" in value)
  ) {
    return value as NodeOptions;
  }
  throw new RenderError(
    `mglyph.parameterOne: is ${describeSlot(value)}, not an options record — the gem calls [] on it, ` +
      "which raises for anything else",
    FORMAT,
    kind,
  );
}

/**
 * `mglyph.rb:17-19`: `ox_element("mglyph", attributes: parameter_one)` — every
 * entry in the record becomes an XML attribute, in the record's own order.
 * Only a string, integer or boolean value is measured here — `Ox` stringifies
 * through Ruby's `to_s`, and reproducing that for an arbitrary type is out of
 * scope for the shapes this port's parsers and fixtures build.
 */
function renderMglyph(value: NodeParameter | undefined, kind: string): XmlElement {
  const element = new XmlElement("mglyph");
  for (const [key, raw] of Object.entries(mglyphRecord(value, kind))) {
    element.setAttribute(key, mglyphAttributeString(raw, key, kind));
  }
  return element;
}

function mglyphAttributeString(value: unknown, key: string, kind: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  throw new RenderError(
    `mglyph.parameterOne.${key}: is ${describeSlot(value)} — only a string, integer or boolean is ` +
      "measured as an ox_element attribute value",
    FORMAT,
    kind,
  );
}

/**
 * `ms.rb:8-10`: `ox_element("ms") << parameter_one` — appended directly, not
 * interpolated. `Ox`'s `<<` accepts a String (or an element); a nil slot and
 * an Array both raise `TypeError` in the gem (measured), which this reports
 * as the render boundary's `RenderError`.
 */
function renderMs(value: NodeParameter | undefined, kind: string): XmlElement {
  if (typeof value === "string") return new XmlElement("ms").append(value);
  throw new RenderError(
    `ms.parameterOne: is ${describeSlot(value)} — the gem appends it directly with <<, which raises ` +
      "for anything but a string",
    FORMAT,
    kind,
  );
}
