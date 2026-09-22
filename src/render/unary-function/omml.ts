import type { NodeOptions, NodeParameter } from "../../core/index";
import { RenderError, TableNode, TextNode } from "../../core/index";
import {
  controlProperties,
  describeSlot,
  FORMAT,
  type NodeOf,
  type OmmlRendered,
  plainRun,
  present,
  type RenderContext,
  renderChild,
  renderUnaryValue,
  requireElement,
  requireNodeList,
  textElement,
  wordRunProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";
import { renderTable } from "../table/omml";
import { renderText } from "../text/omml";

/**
 * The `UnaryFunction` aliases whose `to_omml_without_math_tag` IS the base
 * method — `Sin` and its 14 siblings add nothing to it, so the only thing that
 * varies between them is `class_name`.
 *
 * Measured on the pinned oracle `00c52783` over all 48 classes the census
 * records as aliasing `Math::Function::UnaryFunction`, reading
 * `instance_method(:to_omml_without_math_tag).owner` for each (exit 0):
 * exactly these 15 answer `Plurimath::Math::Function::UnaryFunction`. The
 * other 33 — `Cancel`, `Deg`, `Ms`, `Phantom` and the rest — each OWN the
 * method and take a shape of their own, so a blanket "every unary alias is the
 * base" would have invented markup for 33 classes. Those keep refusing until
 * measured one at a time; the overriders this file has measured are listed
 * after the set below.
 *
 * `class_name` (`core.rb:28-30`, `self.class.name.split("::").last.downcase`)
 * was read in the same probe: for all 15 it is the ASCII lowercase of the
 * basename, and no name here holds a character where Ruby's `String#downcase`
 * and JavaScript's `toLowerCase` differ. `UnaryFunction` itself is in the set
 * because it is the class the method belongs to, and its own `class_name` is
 * `"unaryfunction"` — measured live, not assumed from the pattern.
 *
 * Deliberately NOT the same set as `MEASURED_UNARY_NAMES` in the four P1
 * renderers, and it should not be expected to match: those are the names the
 * AsciiMath transform can REACH, and each format name-arms its own overriders
 * separately. This one is the names whose OMML method is inherited, which is a
 * question about the gem rather than about the parser, and is answered per
 * format — the mathml override set is not the omml override set.
 *
 * The overriders this file carries beyond the base set are `Left`, `Right`,
 * `Tr`, and the twenty named at their arms in `renderUnaryFunction` — `Ln`, `Det`,
 * `Gcd`, `Max`, `Hom`, `Exp`, `Lcm`, `Min`, `Dim`, `Glb`, `Lub`, `Lg`, `Ker`, `Deg`,
 * `Liminf` and `Limsup` (a name run then the value), `Cancel` (the value
 * alone), `Phantom`, `Substack` and `Mbox` — plus `Longdiv`, `Scarries` and
 * `Msgroup` (`omml_value` alone, like `Cancel`, no strict-list requirement),
 * `Merror` and `Msline` (always empty), `Sup` (a `sup` run unless hidden, then
 * the value — no empty-slot guard), `Mglyph` (one run, alt text or a numeric
 * entity) and `Ms` (one bare `m:t`, no `m:r` around it).
 */
const OMML_BASE_UNARY_CLASSES: ReadonlySet<string> = new Set([
  "Arccos",
  "Arcsin",
  "Arctan",
  "Cos",
  "Cosh",
  "Cot",
  "Coth",
  "Csc",
  "Csch",
  "Sec",
  "Sech",
  "Sin",
  "Sinh",
  "Tan",
  "Tanh",
  "UnaryFunction",
]);

export function renderUnaryFunction(
  node: NodeOf<"unaryFunction">,
  context: RenderContext,
): OmmlRendered {
  switch (node.name) {
    case "Tr":
      return renderTr(node, context);
    case "Left":
    case "Right":
      return renderLeftRight(node);
    case "Ln":
    case "Det":
    case "Gcd":
    case "Max":
    case "Hom":
    case "Exp":
    case "Lcm":
    case "Min":
    case "Dim":
    case "Glb":
    case "Lub":
    case "Lg":
    case "Ker":
    case "Deg":
    case "Liminf":
    case "Limsup":
      return renderNamedRun(node, context);
    case "Cancel":
      // `cancel.rb:17`: `omml_value` alone — no name run, so an absent slot leaves nothing.
      return renderUnaryValue(node.parameterOne, context, node.kind, "cancel.parameterOne");
    case "Phantom":
      return renderPhantom(node, context);
    case "Substack":
      // `substack.rb:32`: `Table.new(parameter_one).to_omml_without_math_tag`.
      // The slot is handed to a FRESH `Table` and rendered as one, so the table
      // renderer owns every judgement about the rows.
      if (
        node.parameterOne !== null &&
        node.parameterOne !== undefined &&
        !Array.isArray(node.parameterOne)
      ) {
        throw new RenderError(
          `substack.parameterOne: is ${describeSlot(node.parameterOne)}, not a list of rows — ` +
            "the gem's Table raises NoMethodError on it",
          FORMAT,
          node.kind,
        );
      }
      return renderTable(new TableNode({ value: node.parameterOne }), context);
    case "Mbox":
      // `mbox.rb:24`: `Text.new(parameter_one).to_omml_without_math_tag`, the
      // bare `m:t` — no run around it, which is the formula boundary's job for
      // a `Text` and not for this class.
      return renderText(mboxText(node.parameterOne));
    case "Longdiv":
    case "Scarries":
    case "Msgroup":
      // `longdiv.rb:22-24`, `scarries.rb:22-24`, `msgroup.rb:26-28`:
      // `omml_value(display_style, options:)` alone — no wrapper element, no
      // `hide_function_name` read, and (unlike the ascii/latex/mathml twins)
      // no strict-list requirement: `omml_value` itself compacts a list or
      // wraps one scalar, so a nil slot renders as nothing at all rather than
      // raising.
      return renderUnaryValue(
        node.parameterOne,
        context,
        node.kind,
        `${node.name.toLowerCase()}.parameterOne`,
      );
    case "Merror":
    case "Msline":
      // `merror.rb:11`, `msline.rb:11`: `def to_omml_without_math_tag(_, **); end`
      // — always nil, whatever the slot holds.
      return [];
    case "Sup":
      return renderSup(node, context);
    case "Mglyph":
      return renderMglyph(node.parameterOne, node.kind);
    case "Ms":
      // `ms.rb:16-18`: one bare `m:t` run, no `m:r` around it — the slot
      // interpolated raw, like the ascii/latex twins.
      return [textElement(`“${msValue(node.parameterOne, node.kind)}”`)];
    default:
      if (OMML_BASE_UNARY_CLASSES.has(node.name)) {
        return renderUnaryCarrier(node, context, node.name.toLowerCase());
      }
      throw new RenderError(
        `UnaryFunction alias "${node.name}" has not been measured for OMML in this slice`,
        FORMAT,
        node.kind,
      );
  }
}

/**
 * The fresh `Text` that `mbox.rb` builds out of the slot.
 *
 * `Text#to_omml_without_math_tag` reads its slot through
 * `HTMLEntities#decode`, which answers `""` for nil (`text.rb:144-150`), so
 * here an absent slot and the empty string are the same text: measured on the
 * pinned oracle `00c52783`, `Mbox.new(nil)` and `Mbox.new("")` both give
 * `<m:t></m:t>`. Every other shape reaches `renderText` as it is.
 */
function mboxText(parameterOne: NodeParameter | undefined): NodeOf<"text"> {
  return new TextNode({ parameterOne: parameterOne ?? "" });
}

/**
 * The shape `Ln`, `Det`, `Gcd`, `Max` and `Hom` share (`ln.rb:15`,
 * `det.rb:11`, `gcd.rb:20`, `max.rb:15`, `hom.rb:7`):
 *
 * ```ruby
 * array << r_element("ln", rpr_tag: false) unless hide_function_name
 * array += Array(omml_value(display_style, options: options))
 * ```
 *
 * A run holding the name, with no `m:rPr`, followed by the argument's own
 * nodes — no `m:func` wrapper, which is the base method's shape, and no
 * empty-slot special case: a nil slot leaves the run alone.
 */
function renderNamedRun(node: NodeOf<"unaryFunction">, context: RenderContext): OmmlRendered {
  const lowered = node.name.toLowerCase();
  const value = renderUnaryValue(node.parameterOne, context, node.kind, `${lowered}.parameterOne`);
  return present(node.hideFunctionName) ? value : [plainRun(lowered), ...value];
}

/**
 * `Phantom#to_omml_without_math_tag` (phantom.rb:26): `m:phant` holding a
 * `m:phantPr` with `<m:show m:val="off"/>`, then an `m:e` over `omml_value`.
 */
function renderPhantom(node: NodeOf<"unaryFunction">, context: RenderContext): XmlElement {
  const properties = new XmlElement("m:phantPr").append(
    new XmlElement("m:show").setAttribute("m:val", "off"),
  );
  const content = new XmlElement("m:e").append(
    renderUnaryValue(node.parameterOne, context, node.kind, "phantom.parameterOne"),
  );
  return new XmlElement("m:phant").append(properties, content);
}

/**
 * `UnaryFunction#to_omml_without_math_tag` (unary_function.rb:76-88), the one
 * method the 15 base aliases share:
 *
 * ```ruby
 * return r_element(class_name, rpr_tag: false) unless parameter_one
 *
 * if @hide_function_name
 *   value = omml_value(display_style, options: options)   # the argument alone
 * else
 *   func = XmlHelper.ox_element("func", namespace: "m")
 *   value = XmlHelper.update_nodes(func, function_values(display_style, options: options))
 * end
 * ```
 *
 * The empty-slot guard comes FIRST, before the hide branch, and it is
 * Ruby-falsy rather than a nil check. Measured on the oracle at `00c52783`:
 * `Sin.new(nil)` and `Sin.new(false)` both render `<m:r><m:t>sin</m:t></m:r>`
 * — the label alone, with no `m:rPr` — and setting `hide_function_name` on
 * either changes nothing, because that branch is never reached. `Sin.new([])`
 * does NOT take it: an empty Array is truthy in Ruby, so it renders the whole
 * `m:func` tree around an empty `<m:e/>`.
 *
 * With the slot filled, the flag false or unset gives the
 * `m:func`/`m:funcPr`/`m:fName` tree, and true gives the inserted argument on
 * its own — `Sin.new(x)` hidden is `<m:r><m:t>x</m:t></m:r>` (measured). Both
 * arms go through `omml_value`, which compacts a LIST and wraps one scalar, so
 * `Sin.new([x, y])` fills one `m:e` with two runs and `Sin.new([x, nil])`
 * drops the nil (both measured).
 */
function renderUnaryCarrier(
  node: NodeOf<"unaryFunction">,
  context: RenderContext,
  className: string,
): OmmlRendered {
  if (!present(node.parameterOne)) return plainRun(className);

  const value = renderUnaryValue(
    node.parameterOne,
    context,
    node.kind,
    "unaryFunction.parameterOne",
  );
  if (present(node.hideFunctionName)) return value;

  const funcPr = new XmlElement("m:funcPr").append(controlProperties());
  const functionName = new XmlElement("m:fName").append(
    new XmlElement("m:r").append(wordRunProperties(false), textElement(className)),
  );
  return new XmlElement("m:func").append(funcPr, functionName, new XmlElement("m:e").append(value));
}

/**
 * `Left#to_omml_without_math_tag` (left.rb:19-26), which `Right` repeats
 * verbatim (right.rb:19-26):
 *
 * ```ruby
 * mr = XmlHelper.ox_element("m:r")
 * if parameter_one
 *   mt = XmlHelper.ox_element("m:t")
 *   mr << (mt << parameter_one)
 * end
 * [mr]
 * ```
 *
 * Three things measured on the pinned oracle `00c52783`, each of which the
 * sibling arms of these two classes would have suggested otherwise:
 *
 *   - the slot holds a bare STRING here, not a node. `Left.new("(")` renders
 *     `<m:r><m:t>(</m:t></m:r>`, while `Left.new(Symbol.new("x"))`,
 *     `Left.new([])`, `Left.new(0)` and `Left.new(true)` all raise
 *     `NoMethodError: undefined method 'xml_nodes'` — the engine sends that to
 *     whatever is appended, and only a String or an element answers it;
 *   - `left_paren`/`right_paren`, the `\{` → `{` rewrite `to_mathml`,
 *     `to_latex` and all four math-zone arms use, is NOT called here.
 *     Measured: `Left.new("\\{")` renders `\{`, not `{`;
 *   - `hide_function_name` is never read, so a hidden `Left` still renders its
 *     delimiter (measured).
 *
 * The `if parameter_one` guard is Ruby-falsy: `nil` and `false` both give the
 * bare `<m:r/>` with no `m:t` at all, and the empty string does not — it is
 * truthy in Ruby, and gives `<m:r><m:t></m:t></m:r>`.
 */
function renderLeftRight(node: NodeOf<"unaryFunction">): OmmlRendered {
  const run = new XmlElement("m:r");
  if (!present(node.parameterOne)) return run;

  const value: unknown = node.parameterOne;
  if (typeof value !== "string") {
    throw new RenderError(
      `${node.name.toLowerCase()}.parameterOne: is ${describeSlot(value)}, and the gem appends it straight to <m:t> — ` +
        "only a string answers the engine's xml_nodes there, so anything else raises NoMethodError",
      FORMAT,
      node.kind,
    );
  }
  return run.append(textElement(value));
}

/**
 * `Tr#to_omml_without_math_tag` (tr.rb:47-60) renders every cell, then wraps
 * the result in `m:mr` unless the row holds exactly one cell:
 *
 * ```ruby
 * if parameter_one.count.eql?(1)
 *   omml_content
 * else
 *   mr = XmlHelper.ox_element("mr", namespace: "m")
 *   XmlHelper.update_nodes(mr, omml_content)
 *   [mr]
 * ```
 *
 * Measured on the oracle at `00c52783`: a one-cell row answers with the bare
 * `<m:e>` list, a two- or three-cell row with `<m:mr>`, and an EMPTY row with
 * `<m:mr/>` — zero is not one, so it takes the wrapper branch too. `m:m`
 * flattens whatever a row answers, which is how the gem mixes row widths in
 * one matrix.
 */
function renderTr(node: NodeOf<"unaryFunction">, context: RenderContext): OmmlRendered {
  const cells = requireNodeList(node.parameterOne, node.kind, "tr.parameterOne");
  const rendered = cells.map((cell, index) =>
    requireElement(
      renderChild(cell, context, `tr.parameterOne[${index}]`),
      node.kind,
      `tr.parameterOne[${index}]`,
      "m:e",
    ),
  );
  if (cells.length === 1) return rendered;
  return new XmlElement("m:mr").append(...rendered);
}

/**
 * `Sup#to_omml_without_math_tag` (`function/sup.rb:20-24`): a `sup` run
 * pushed unless hidden, THEN the value — no empty-slot guard the way the
 * carrier's `renderUnaryCarrier` has, so an absent slot still gets the name
 * run (measured: `Sup.new(nil).to_omml` is the bare `sup` run) and hiding it
 * on an absent slot renders nothing at all.
 */
function renderSup(node: NodeOf<"unaryFunction">, context: RenderContext): OmmlRendered {
  const nameRun = present(node.hideFunctionName) ? [] : [plainRun("sup")];
  return [...nameRun, ...renderUnaryValue(node.parameterOne, context, node.kind, "sup.parameterOne")];
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

/** `parameter_one[:index].to_i` — only nil (Ruby's `to_i` default 0) and an integer are measured. */
function mglyphIndex(value: unknown, kind: string): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new RenderError(
    `mglyph.parameterOne.index: is ${describeSlot(value)} — only an integer or nil is measured`,
    FORMAT,
    kind,
  );
}

/** `Mglyph#ignoring_index` (`mglyph.rb:66-70`). */
function mglyphIgnoringIndex(index: number): boolean {
  return index === 0 || (index < 32 && ![9, 10, 13].includes(index)) || [65534, 65535].includes(index);
}

/** `parameter_one[:alt].to_s` — nil answers `""`, a string is itself. */
function mglyphAltToS(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * `Mglyph#to_omml_without_math_tag` (`mglyph.rb:17-22`): one run holding
 * either the alt text (`ignoring_index`) or a `&#xHH;` numeric entity built
 * from the index — `glyph_user_index` is plain uppercase hex with no leading
 * zero, measured (`index: 65` → `&#x41;`, `index: 9` → `&#x9;`).
 */
function renderMglyph(value: NodeParameter | undefined, kind: string): OmmlRendered {
  const record = mglyphRecord(value, kind);
  const index = mglyphIndex(record.index, kind);
  const text = mglyphIgnoringIndex(index)
    ? mglyphAltToS(record.alt)
    : `&#x${index.toString(16).toUpperCase()};`;
  return [plainRun(text)];
}

/** `ms.rb:13-15`/`ms.rb:16-18`: the slot interpolated raw; only nil and a string are measured. */
function msValue(value: NodeParameter | undefined, kind: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  throw new RenderError(
    `ms.parameterOne: is ${describeSlot(value)} — only a string or nil is measured; interpolating ` +
      "anything else risks a non-reproducible #inspect",
    FORMAT,
    kind,
  );
}
