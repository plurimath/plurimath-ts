/**
 * Mirrors `function/unary_function.rb` — `UnaryFunction#to_html` (:65-74) —
 * plus a name arm for each gem class the census folds into this carrier that
 * has its OWN `to_html` override.
 *
 * The carrier renders `"<i>#{invert_unicode_symbols}</i>#{first_value}"`, where
 * `first_value` is the parameter inside one `<i>` — a list rendering each
 * member and joining with no separator INSIDE that single wrapper, and an
 * absent parameter contributing nothing at all.
 *
 * The label is `Core#invert_unicode_symbols` (`core.rb:229-231`), which is
 * `Mathml::Constants::UNICODE_SYMBOLS.invert[class_name] || class_name` — NOT
 * simply the class basename downcased. The two agree for most names but not
 * all, and the disagreement is invisible until it is measured: of the names
 * reachable through this carrier, `Sup` alone resolves through the table, to
 * `&#x2283;` rather than `sup`. So each admitted name carries its MEASURED
 * label as a literal here rather than deriving one from the class name, which
 * is also how the dedicated kinds that share this helper pass theirs
 * (`bar` → `¯`, `vec` → `&#x2192;`, `ul` → `underline`, whose class_name is
 * `underline` and not `ul`).
 *
 * Measured pins, from a sweep of every carrier subclass on the pinned oracle
 * (a `Number` leaf rendering `1`):
 *
 *   - `Sin`: `<i>sin</i><i>1</i>`, and `<i>sin</i>` with the slot absent;
 *   - `Cos`: `<i>cos</i><i>1</i>`, and `<i>cos</i>` with the slot absent.
 *
 * Only names a fixture or a test measures are admitted, so every arm here is
 * held to the gem's own bytes by a test. `Left` owns its `to_html`
 * (`"<i>#{parameter_one}</i>"`, `left.rb:26`) and interpolates the slot RAW,
 * so it takes the shared interpolation judge: a string, nil, a boolean or a
 * non-finite number reproduces Ruby's bytes, and a node — Ruby's default
 * `Object#to_s`, a heap address — is refused. `Right#to_html` and
 * `Phantom#to_html` take NO keyword arguments while `Formula#to_html` passes
 * `options:`, so the gem raises ArgumentError on every call; `Phantom` refuses
 * with that reason, and `Right` stays unadmitted. The remaining
 * trigonometric and `log`-family names take the same carrier shape as `Sin`
 * and `Cos`, but no case exercises them; an unmeasured name raises.
 */
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  interpolatedValue,
  type NodeOf,
  type RenderContext,
  renderChild,
  renderUnarySlot,
  s,
} from "../../formats/html/render-shared";

/**
 * Admitted alias -> its measured `invert_unicode_symbols` label.
 *
 * A closed list rather than a rule: see the module note on `Sup`, where that
 * label and the downcased class name are not the same string. Every name here
 * was measured on the pinned oracle `00c52783` (the `unary-function-model-alias-*`
 * and html `unary-function-text-*` rows): the label is the downcased class name,
 * and none of these classes overrides `to_html`, so they all take
 * `UnaryFunction#to_html` unchanged. For the names added
 * with the LaTeX, HTML and UnicodeMath parsers — `Ln`, `Det`, `Gcd`, `Max`,
 * `Cancel`, `Hom`, `Substack` — none is a value of
 * `Mathml::Constants::UNICODE_SYMBOLS` (measured on the pinned oracle
 * `00c52783`: `UNICODE_SYMBOLS.invert[name]` is nil for each), so the label is
 * the class name, and none of them overrides `to_html`.
 */
const MEASURED_LABELS: ReadonlyMap<string, string> = new Map(
  [
    "Sin",
    "Cos",
    "Arcsin",
    "Arccos",
    "Arctan",
    "Coth",
    "Tanh",
    "Sech",
    "Csch",
    "Sinh",
    "Cosh",
    "Csc",
    "Exp",
    "Sec",
    "Tan",
    "Cot",
    "Lcm",
    "Min",
    "Dim",
    "Glb",
    "Lub",
    "Lg",
    "Ker",
    "Deg",
    "Liminf",
    "Limsup",
    "Ln",
    "Det",
    "Gcd",
    "Max",
    "Cancel",
    "Hom",
    "Substack",
    "Longdiv",
    "Merror",
    "Msline",
    "Scarries",
  ]
    .map((name): readonly [string, string] => [name, name.toLowerCase()])
    .concat([
      // `Sup` resolves through `Mathml::Constants::UNICODE_SYMBOLS.invert`
      // rather than its downcased class name (measured: `&#x2283;`, not `sup`).
      ["Sup", "&#x2283;"],
    ]),
);

export function renderUnaryFunction(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  if (node.name === "Tr") return renderTr(node.parameterOne, context);
  if (node.name === "Left") return renderLeft(node);
  if (node.name === "Mbox") return renderMbox(node);
  if (node.name === "Ms") return renderMs(node);
  if (node.name === "Phantom") {
    throw new RenderError(
      "Phantom#to_html takes no keyword arguments and Formula#to_html passes options:, " +
        "so the gem raises ArgumentError for every Phantom",
      FORMAT,
      node.kind,
    );
  }

  const label = MEASURED_LABELS.get(node.name);
  if (label === undefined) {
    throw new RenderError(
      `UnaryFunction alias "${node.name}" has not been measured for HTML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  return renderUnaryDefault(label, node.parameterOne, context, "unaryFunction.parameterOne");
}

/** `Left#to_html` (`left.rb:26`): `"<i>#{parameter_one}</i>"`, the slot interpolated raw. */
function renderLeft(node: NodeOf<"unaryFunction">): string {
  return `<i>${interpolatedValue(node.parameterOne, node.kind, "left.parameterOne")}</i>`;
}

/**
 * `Mbox#to_html` (`mbox.rb:20`) answers `parameter_one` ITSELF, not a
 * rendering of it. Measured on the pinned oracle `00c52783`, through a
 * `Formula`: `Mbox.new("hi")` gives `hi`, `"unicode[:alpha]"` and `"a<b&c"`
 * come back verbatim, nil and `""` give nothing (`Mbox.new(nil).to_html` is
 * bare `nil`, but `Formula#to_html` joins its rendered children and Ruby's
 * `Array#join`/string interpolation of `nil` is the empty string — measured:
 * `Formula.new([Mbox.new(nil)]).to_html` is `""`), `false` gives `false`, and
 * a node gives its `#inspect` address. A string or nil is admitted — the
 * slots whose bytes are the same in every parent; the rest are refused.
 */
function renderMbox(node: NodeOf<"unaryFunction">): string {
  const slot = node.parameterOne;
  if (typeof slot === "string") return slot;
  if (slot === null || slot === undefined) return "";
  throw new RenderError(
    `mbox.parameterOne: holds ${describeSlot(slot)} — the gem returns the slot unrendered, ` +
      "and only a string or nil is a value every parent can take",
    FORMAT,
    node.kind,
  );
}

/**
 * `Ms` has no `to_html` of its own, so it takes `UnaryFunction#to_html`
 * unchanged (`unary_function.rb:65-74`) — but `parameter_one` here is a bare
 * STRING, not a node, so the branch that calls `parameter_one.to_html(options:)`
 * raises `NoMethodError` for anything truthy (measured: `Ms.new("so")` and
 * `Ms.new("")` both raise). Only the FALSY slot survives, giving the label
 * alone: `Ms.new(nil).to_html` is `<i>ms</i>`.
 */
function renderMs(node: NodeOf<"unaryFunction">): string {
  if (node.parameterOne === null || node.parameterOne === undefined) return "<i>ms</i>";
  throw new RenderError(
    `ms.parameterOne: is ${describeSlot(node.parameterOne)} — the carrier default calls to_html on ` +
      "it directly, which raises for a plain string",
    FORMAT,
    node.kind,
  );
}

/** `Tr#to_html`: table cells joined with no separator inside one row tag. */
function renderTr(value: unknown, context: RenderContext): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `Tr.parameterOne: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      "unaryFunction",
    );
  }
  const inner = value
    .map((item, index) => s(renderChild(item, context, `Tr.parameterOne[${index}]`)))
    .join("");
  return `<tr>${inner}</tr>`;
}

/** `UnaryFunction#to_html`: italicized measured label followed by one slot wrapper. */
export function renderUnaryDefault(
  measuredLabel: string,
  parameterOne: unknown,
  context: RenderContext,
  at: string,
): string {
  return `<i>${measuredLabel}</i>${renderUnarySlot(parameterOne, context, at)}`;
}
