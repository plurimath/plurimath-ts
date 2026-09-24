import {
  OversetNode,
  RenderError,
  SymbolNode,
  TernaryFunctionNode,
  UndersetNode,
} from "../../core/index";
import {
  FORMAT,
  insertChild,
  type NodeOf,
  type OmmlRendered,
  ommlSlot,
  plainRun,
  present,
  type RenderContext,
  requireNodeList,
  requireString,
  structuralProperties,
  styledRun,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * The `BinaryFunction` aliases whose `to_omml_without_math_tag` IS the base
 * method (binary_function.rb:66-79) — one `m:r` holding both slots' inserted
 * runs, with no label of any kind.
 *
 * Measured on the pinned oracle `00c52783` over all 14 classes the census
 * records as aliasing `Math::Function::BinaryFunction`, reading
 * `instance_method(:to_omml_without_math_tag).owner` for each (exit 0):
 * exactly `Arg`, `Intent` and `Mlabeledtr` answer
 * `Plurimath::Math::Function::BinaryFunction`; the other 11 own the method.
 * Rendered live, all three give the same nested
 * `<m:r><m:r><m:t>a</m:t></m:r><m:r><m:t>b</m:t></m:r></m:r>` the bare carrier
 * does — that nesting is the gem's, not a transcription slip — and all three
 * give `<m:r/>` with both slots nil.
 *
 * `class_name` never reaches the output on this path, so unlike the unary base
 * set these names carry no label and need no downcasing.
 *
 * The set below has FOUR members, not three: the sweep measured the 14 census
 * ALIASES, and `BinaryFunction` is the carrier they alias rather than one of
 * them. It renders through this path for the obvious reason — the base method
 * is its own — so it belongs in the set while sitting outside the measurement
 * that produced the other three.
 */
const OMML_BASE_BINARY_CLASSES: ReadonlySet<string> = new Set([
  "Arg",
  "BinaryFunction",
  "Intent",
  "Mlabeledtr",
]);

export function renderBinaryFunction(
  node: NodeOf<"binaryFunction">,
  context: RenderContext,
): OmmlRendered {
  switch (node.name) {
    case "Inf":
      return renderUnderover(node, context, "inf");
    case "Lim":
      return renderUnderover(node, context, "lim");
    case "Menclose":
      return renderMenclose(node, context);
    case "Over":
      // `over.rb:34`: `m:f` with the same `m:fPr` `Frac` writes without options.
      return new XmlElement("m:f").append(
        structuralProperties("f"),
        ommlSlot(node.parameterOne, "num", context, node.kind, "over.parameterOne"),
        ommlSlot(node.parameterTwo, "den", context, node.kind, "over.parameterTwo"),
      );
    case "Stackrel":
      // `stackrel.rb:35`: `m:limUpp` with the SECOND slot as the base and the
      // first as the limit — the reverse of `Overset`.
      return new XmlElement("m:limUpp").append(
        structuralProperties("limUpp"),
        ommlSlot(node.parameterTwo, "e", context, node.kind, "stackrel.parameterTwo"),
        ommlSlot(node.parameterOne, "lim", context, node.kind, "stackrel.parameterOne"),
      );
    case "Log":
      return renderLog(node, context);
    case "Mod":
      return renderMod(node, context);
    case "Power":
      return new XmlElement("m:sSup").append(
        structuralProperties("sSup"),
        ommlSlot(node.parameterOne, "e", context, node.kind, "power.parameterOne"),
        ommlSlot(node.parameterTwo, "sup", context, node.kind, "power.parameterTwo"),
      );
    case "Root":
      return renderRoot(node, context);
    case "Td":
      return renderTd(node, context);
    default:
      if (OMML_BASE_BINARY_CLASSES.has(node.name)) return renderBinaryCarrier(node, context);
      throw new RenderError(
        `BinaryFunction alias "${node.name}" has not been measured for OMML in this slice`,
        FORMAT,
        node.kind,
      );
  }
}

/**
 * `BinaryFunction#to_omml_without_math_tag`: both slots inserted into one
 * `m:r`, each behind its OWN `if` rather than one guard over the pair, so a
 * filled second slot still renders when the first is nil. Measured on the
 * oracle at `00c52783`: both slots nil gives the bare `<m:r/>`, where reading
 * the slots unconditionally refused a tree the gem renders.
 */
function renderBinaryCarrier(node: NodeOf<"binaryFunction">, context: RenderContext): XmlElement {
  const run = new XmlElement("m:r");
  if (present(node.parameterOne)) {
    run.append(insertChild(node.parameterOne, context, "binaryFunction.parameterOne"));
  }
  if (present(node.parameterTwo)) {
    run.append(insertChild(node.parameterTwo, context, "binaryFunction.parameterTwo"));
  }
  return run;
}

/**
 * `Mod#to_omml_without_math_tag` (mod.rb:64-70):
 *
 * ```ruby
 * values = []
 * first_value(display_style, values, options: options)
 * values << r_element("mod") unless hide_function_name
 * second_value(display_style, values, options: options)
 * values
 * ```
 *
 * A flat list of up to three runs, NOT a wrapper element — `a mod b` renders
 * as three siblings directly inside `m:oMath`. The label is `r_element("mod")`
 * with its default `rpr_tag: true`, so it carries
 * `<m:rPr><m:sty m:val="p"/></m:rPr>` where the two operands do not, and it is
 * the literal `"mod"` rather than `class_name`.
 *
 * Each guard is separate and Ruby-falsy, all measured on the oracle at
 * `00c52783`: `Mod(nil, b)` and `Mod(false, false)` drop the operands they
 * lack and keep the label, `Mod(nil, nil)` renders the label alone, and a
 * hidden `Mod(a, b)` renders the two operands with nothing between them.
 * `first_value` sends `insert_t_tag` to the slot itself, so a LIST raises
 * (`Mod([a, b], c)` → `NoMethodError` for an instance of Array, measured) —
 * unlike the unary carrier, which compacts a list.
 */
function renderMod(node: NodeOf<"binaryFunction">, context: RenderContext): OmmlRendered {
  const values: OmmlRendered[] = [];
  if (present(node.parameterOne)) {
    values.push(insertChild(node.parameterOne, context, "mod.parameterOne"));
  }
  if (!present(node.hideFunctionName)) values.push(styledRun("mod"));
  if (present(node.parameterTwo)) {
    values.push(insertChild(node.parameterTwo, context, "mod.parameterTwo"));
  }
  return values;
}

/**
 * `BinaryFunction#underover` (binary_function.rb:174-196), which `Lim` and
 * `Inf` are: `Lim#to_omml_without_math_tag` (lim.rb:66-68) and `Inf`'s
 * (inf.rb:43) are each one delegating line.
 *
 * ```ruby
 * return r_element(class_name, rpr_tag: false) unless any_value_exist?
 *
 * first_value = Symbols::Symbol.new(class_name)
 * if !display_style
 *   power_base = PowerBase.new(first_value, parameter_one, parameter_two)
 *   return power_base.to_omml_without_math_tag(display_style, options: options)
 * end
 *
 * overset = Overset.new(first_value, parameter_two)
 * return Array(overset.to_omml_without_math_tag(...)) unless parameter_one
 * underset = Underset.new(overset, parameter_one)
 * ```
 *
 * The structure is built out of OTHER nodes and those are rendered, so this
 * constructs them rather than emitting `m:limLow`/`m:limUpp` directly — the
 * same shape `TernaryFunction#underover` takes in
 * `../ternary-function/omml.ts`, and the reason a change to `Overset` or
 * `Underset` moves both.
 *
 * Its base is a BARE `Symbols::Symbol` carrying `class_name` as its value, not
 * a named symbol class, so it renders through the value arm of the symbol
 * table and needs nothing generated. Measured on the oracle at `00c52783`:
 *
 *   - display style on, both slots: `m:limLow` wrapping an `m:limUpp` whose
 *     `m:e` is `<m:r><m:t>lim</m:t></m:r>`;
 *   - display style on, subscript only: the same tree, with the inner
 *     `m:limUpp`'s `m:lim` holding the zero-width-space placeholder;
 *   - display style on, superscript only: `m:limUpp` alone — the `unless
 *     parameter_one` arm, Ruby-falsy, so a `false` subscript takes it too;
 *   - display style OFF: `m:sSubSup` over the same bare `lim` run, which is
 *     `PowerBase` reached through the `!display_style` arm;
 *   - neither slot: `<m:r><m:t>lim</m:t></m:r>`, the label alone with no
 *     `m:rPr`. `any_value_exist?` is `parameter_one || parameter_two`, so
 *     `Lim(false, false)` takes that arm as `Lim(nil, nil)` does.
 *
 * `hide_function_name` is never read here: a hidden `Lim(a, b)` is
 * byte-identical to a plain one (measured).
 */
function renderUnderover(
  node: NodeOf<"binaryFunction">,
  context: RenderContext,
  className: string,
): OmmlRendered {
  if (!present(node.parameterOne) && !present(node.parameterTwo)) return plainRun(className);

  const base = new SymbolNode({ value: className });
  if (!context.displaystyle) {
    return context.render(
      new TernaryFunctionNode({
        name: "PowerBase",
        parameterOne: base,
        parameterTwo: node.parameterOne,
        parameterThree: node.parameterTwo,
      }),
    );
  }

  const overset = new OversetNode({ parameterOne: base, parameterTwo: node.parameterTwo });
  if (!present(node.parameterOne)) return context.render(overset);
  return context.render(
    new UndersetNode({ parameterOne: overset, parameterTwo: node.parameterOne }),
  );
}

/**
 * `Log#to_omml_without_math_tag` (log.rb:63-80) with its `e_parameter` and
 * `rpr_tag` helpers (log.rb:120-131):
 *
 * ```ruby
 * return r_element("log", rpr_tag: false) unless any_value_exist?
 * # m:sSubSup / m:sSubSupPr(ctrl) / e_parameter / m:sub / m:sup
 * ```
 *
 * `Log` carries `Lim`'s two slots and takes a completely different shape for
 * them: a script tree that does NOT consult `display_style` at all. Measured
 * on the oracle at `00c52783`, `Log(a, b)` renders the same `m:sSubSup` with
 * display style on and off, where `Lim` switches between `m:limLow` and
 * `m:sSubSup` on that axis.
 *
 * The label is the literal `"log"` in both places — the empty-slot answer and
 * the `m:e` run — never `class_name`. `e_parameter` returns the bare `m:e`
 * when `hide_function_name` is set, so a hidden `Log(a, b)` renders `<m:e/>`
 * and keeps its scripts (measured); with the flag clear the `m:e` holds
 * `r_element("log")`'s `m:sty` run. `any_value_exist?` is Ruby-truthy, so
 * `Log(false, false)` answers the label alone exactly as `Log(nil, nil)` does.
 */
function renderLog(node: NodeOf<"binaryFunction">, context: RenderContext): OmmlRendered {
  if (!present(node.parameterOne) && !present(node.parameterTwo)) return plainRun("log");

  const name = new XmlElement("m:e");
  if (!present(node.hideFunctionName)) name.append(styledRun("log"));
  return new XmlElement("m:sSubSup").append(
    structuralProperties("sSubSup"),
    name,
    ommlSlot(node.parameterOne, "sub", context, node.kind, "log.parameterOne"),
    ommlSlot(node.parameterTwo, "sup", context, node.kind, "log.parameterTwo"),
  );
}

/**
 * `Root#to_omml_without_math_tag` (root.rb:31-48).
 *
 * `m:radPr` holds ONLY `<m:degHide m:val="off"/>` — no `m:ctrlPr` — which is
 * why this builds the properties element by hand instead of reaching for
 * `structuralProperties`. Measured on the oracle at `00c52783` over filled,
 * nil and `false` slots, with `hide_function_name` set and with display style
 * off: the tree never varies beyond its two slots, and `Root` has no
 * empty-slot early return at all, so `Root(nil, nil)` renders the full `m:rad`
 * around two zero-width-space placeholders.
 *
 * The slots are `omml_parameter`, so a LIST fills its tag with every element
 * (`Root([a, b], c)` puts two runs in `m:deg`, measured) — and note the order:
 * `parameter_one` is the DEGREE and `parameter_two` the radicand, the reverse
 * of the order `\sqrt[a]{b}` reads in.
 */
function renderRoot(node: NodeOf<"binaryFunction">, context: RenderContext): XmlElement {
  const properties = new XmlElement("m:radPr").append(
    new XmlElement("m:degHide").setAttribute("m:val", "off"),
  );
  return new XmlElement("m:rad").append(
    properties,
    ommlSlot(node.parameterOne, "deg", context, node.kind, "root.parameterOne"),
    ommlSlot(node.parameterTwo, "e", context, node.kind, "root.parameterTwo"),
  );
}

/**
 * `Menclose#to_omml_without_math_tag` (menclose.rb:48) with its `borderboxpr`,
 * `four_sided_notations` and `strikes_notations` helpers (:74, :83, :93):
 *
 * `m:borderBox` over `[borderboxpr, omml_parameter(parameter_two, "e")]`.
 * `borderboxpr` is nil — no properties element at all — only when the
 * enclosure type is EXACTLY `box`, `circle` or `roundedbox`. Otherwise the
 * `m:borderBoxPr` lists a `hide*` flag for each of `top`/`bottom`/`left`/
 * `right` the type does NOT mention (skipped entirely when the type contains
 * `box`, `circle` or `roundedbox` as a substring), then a `strike*` flag for
 * each of the four strike names it DOES contain. All the tests are `String#include?`,
 * so they are substring tests, not word tests.
 *
 * The type is read with `include?` and no guard, so anything but a string
 * there — nil included — is a `NoMethodError` in the gem, measured on the
 * oracle at `00c52783` for a `Symbol`, `Formula` and nil; a `RenderError` here.
 */
function renderMenclose(node: NodeOf<"binaryFunction">, context: RenderContext): XmlElement {
  const notation = requireString(node.parameterOne, node.kind, "menclose.parameterOne");
  const borderBox = new XmlElement("m:borderBox");
  if (!MENCLOSE_PLAIN_BOXES.includes(notation)) {
    const properties = new XmlElement("m:borderBoxPr");
    if (!MENCLOSE_PLAIN_BOXES.some((box) => notation.includes(box))) {
      for (const [side, flag] of MENCLOSE_SIDES) {
        if (!notation.includes(side)) properties.append(onFlag(flag));
      }
    }
    for (const [strike, flag] of MENCLOSE_STRIKES) {
      if (notation.includes(strike)) properties.append(onFlag(flag));
    }
    borderBox.append(properties);
  }
  return borderBox.append(
    ommlSlot(node.parameterTwo, "e", context, node.kind, "menclose.parameterTwo"),
  );
}

const MENCLOSE_PLAIN_BOXES: readonly string[] = ["box", "circle", "roundedbox"];

/** `Menclose::FOUR_SIDED_NOTATIONS` (menclose.rb:12), in the gem's order. */
const MENCLOSE_SIDES: readonly (readonly [string, string])[] = [
  ["top", "hideTop"],
  ["bottom", "hideBot"],
  ["left", "hideLeft"],
  ["right", "hideRight"],
];

/** `Menclose::STRIKES_NOTATIONS` (menclose.rb:18), in the gem's order. */
const MENCLOSE_STRIKES: readonly (readonly [string, string])[] = [
  ["horizontalstrike", "strikeH"],
  ["verticalstrike", "strikeV"],
  ["updiagonalstrike", "strikeBLTR"],
  ["downdiagonalstrike", "strikeTLBR"],
];

function onFlag(name: string): XmlElement {
  return new XmlElement(`m:${name}`).setAttribute("m:val", "on");
}

/**
 * `Td#to_omml_without_math_tag` (td.rb:43-50): `return [me] if parameter_one
 * && parameter_one.empty?` answers the bare `<m:e/>` for an empty cell before
 * `omml_content` (and its `Utility.symbol_value(parameter_one.first, "|")`
 * MathML/LaTeX guard, which this method never reaches) run at all. Measured
 * on the oracle at `00c52783`: an empty `Td` in a `Table` renders `<m:e/>`.
 */
function renderTd(node: NodeOf<"binaryFunction">, context: RenderContext): XmlElement {
  const values = requireNodeList(node.parameterOne, node.kind, "td.parameterOne");
  const cell = new XmlElement("m:e");
  if (values.length === 0) return cell;
  values.forEach((value, index) => {
    cell.append(insertChild(value, context, `td.parameterOne[${index}]`));
  });
  return cell;
}
