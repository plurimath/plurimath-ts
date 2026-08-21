/**
 * Mirrors `function/binary_function.rb` — which defines **no** `to_unicodemath`,
 * and neither does `Math::Core`. Unlike the latex carrier, nothing here falls
 * through to a carrier default: every one of the seven reachable classes
 * supplies its own override, so the `default:` arm is pure refusal (the port's
 * equivalent of the gem's `NoMethodError` on a bare `BinaryFunction`).
 *
 * The arms are `power.rb:64` (predicate `accented?` at :112), `log.rb:100`
 * (with its own `sup_value` :134 and `sub_value` :144), `lim.rb:65`,
 * `root.rb:49`, `mod.rb:70`, `td.rb:52` and `stackrel.rb:52`, over
 * `Core#unicodemath_parens` (`core.rb:408`) and `Core#prime_unicode?` (:415).
 *
 * Measured pins worth naming, because source-reading gets each of them wrong:
 *
 *   - `Power` **raises** on a nil exponent. `accented?(nil)` is false, and the
 *     next line is a bare `parameter_two.mini_sized?` — measured,
 *     `Power(x, nil).to_unicodemath` => `NoMethodError: undefined method
 *     'mini_sized?' for nil`. Its first two branches read `parameter_one`
 *     unguarded too.
 *   - `Stackrel` does NOT go through `unicodemath_parens`, so a `Fenced`
 *     child is wrapped a second time — measured, `Stackrel(fenced, y)` =>
 *     `"(y)┴((y))"` where `Lim(fenced, y)` gives `"lim_(y)^(y)"`.
 *   - `Td` has no `|` short-circuit on this path (`to_latex` does) — measured,
 *     `Td([Symbol("|"), x])` => `"|x"`, and it joins with **no** separator
 *     where latex joins with `" "`.
 *   - `Log`'s `sub_value`/`sup_value` bodies are byte-identical to `Int`'s
 *     (`function/int.rb:141`/:151) and `Prod`'s, which is what the shared
 *     `naryandSubValue`/`naryandSupValue` already are.
 *   - `hide_function_name` is read by `to_mathml` and `to_omml` but not here —
 *     measured, `Log(x, y)` with `hide_function_name = true` still renders
 *     `"log_(x)^(y)"`, and `Lim` likewise.
 */

import { RenderError } from "../../core/index";
import {
  FORMAT,
  isNode,
  isPower,
  miniSized,
  missingRenderer,
  type NodeOf,
  naryandSubValue,
  naryandSupValue,
  present,
  primeUnicode,
  type RenderContext,
  renderChild,
  renderOptionalChild,
  unicodemathParens,
  unreachableName,
} from "../../formats/unicodemath/render-shared";
import { UNICODEMATH_BINARY_CARRIER_NAMES } from "../../generated/unicodemath/render-tables";

/**
 * The class names this carrier has measured behaviour for — every `get_class`
 * basename from the generated reachability census with this carrier (the
 * unicodemath-owned projection, `UNICODEMATH_BINARY_CARRIER_NAMES` =
 * `Lim`, `Log`, `Root`, `Stackrel`), plus the classes the transform constructs
 * directly without `get_class` (`newPower`, `newMod`, `newTd` in
 * `../../formats/asciimath/transform.ts`), which no census row can carry.
 *
 * All seven have an arm below, so membership is not dispatch here — it only
 * separates the two ways the `default:` arm can be reached: a regenerated
 * census that grew a name this file has no arm for, and a name the transform
 * never builds at all.
 */
const REACHABLE_BINARY_NAMES: ReadonlySet<string> = new Set([
  ...UNICODEMATH_BINARY_CARRIER_NAMES,
  "Power",
  "Mod",
  "Td",
]);

export function renderBinaryFunction(
  node: NodeOf<"binaryFunction">,
  context: RenderContext,
): string {
  const name = node.name;
  switch (name) {
    case "Power":
      return renderPower(node, context);
    case "Log": {
      // `log.rb:100`. Both slots are guarded at the call site with a bare
      // `if parameter_one` / `if parameter_two`, so an absent slot contributes
      // nothing at all — measured, `Log(nil, nil)` => `"log"`, `Log(nil, y)`
      // => `"log^(y)"`. The literal is `"log"`, not `class_name`.
      const sub = present(node.parameterOne) ? naryandSubValue(node.parameterOne, context) : "";
      const sup = present(node.parameterTwo) ? naryandSupValue(node.parameterTwo, context) : "";
      return `log${sub}${sup}`;
    }
    case "Lim": {
      // `lim.rb:65` — plain `_`/`^` in front of `unicodemath_parens`, with no
      // mini-sized, `Base` or `Power` branch of its own. A child that renders
      // nil still gets the parens: measured, `Lim(mini_sup_sized, x)` =>
      // `"lim_()^(x)"`.
      const sub = present(node.parameterOne)
        ? `_${unicodemathParens(node.parameterOne, context) ?? ""}`
        : "";
      const sup = present(node.parameterTwo)
        ? `^${unicodemathParens(node.parameterTwo, context) ?? ""}`
        : "";
      return `lim${sub}${sup}`;
    }
    case "Root": {
      // `root.rb:49` — U+221A and the `&` separator are unconditional, so an
      // absent slot leaves a hole rather than removing the shape: measured,
      // `Root(nil, nil)` => `"√(&)"`, `Root(nil, y)` => `"√(&y)"`.
      const one = present(node.parameterOne)
        ? (renderChild(node.parameterOne, context, "root.parameterOne") ?? "")
        : "";
      const two = present(node.parameterTwo)
        ? (renderChild(node.parameterTwo, context, "root.parameterTwo") ?? "")
        : "";
      return `√(${one}&${two})`;
    }
    case "Mod":
      // `mod.rb:70` — `&.` on both slots and **no spaces** around the literal
      // (`to_latex` writes `" \\mod "`). Measured, `Mod(x, y)` => `"xmody"`
      // and `Mod(nil, nil)` => `"mod"`.
      return `${renderOptionalChild(node.parameterOne, context)}mod${renderOptionalChild(
        node.parameterTwo,
        context,
      )}`;
    case "Stackrel":
      // `stackrel.rb:52` — parameter TWO comes first, both sides are wrapped in
      // literal round parens rather than `unicodemath_parens`, and the parens
      // survive an absent or nil-rendering slot. Measured: `Stackrel(x, y)` =>
      // `"(y)┴(x)"`, `Stackrel(nil, nil)` => `"()┴()"`. U+2534 BOX DRAWINGS
      // LIGHT UP AND HORIZONTAL.
      return `(${renderOptionalChild(node.parameterTwo, context)})┴(${renderOptionalChild(
        node.parameterOne,
        context,
      )})`;
    case "Td":
      return renderTd(node, context);
    default:
      // Nothing reaches here through the census as it stands: all seven
      // reachable names have an arm. A name the census knows but this file
      // does not means the census grew; anything else was never reachable.
      throw REACHABLE_BINARY_NAMES.has(name)
        ? missingRenderer(name, "binaryFunction")
        : unreachableName(node.kind, name);
  }
}

/**
 * `Power#to_unicodemath` (`power.rb:64`) — three branches, and the first two
 * are the ones that raise.
 */
function renderPower(node: NodeOf<"binaryFunction">, context: RenderContext): string {
  const one = node.parameterOne;
  const two = node.parameterTwo;

  if (isAccented(two)) {
    // `"#{parameter_one.to_unicodemath}#{parameter_two.to_unicodemath.gsub(/\s+/, '')}"`
    // — `parameter_one` is read unguarded, so a nil base raises: measured,
    // `Power(nil, Power(prime, y)).to_unicodemath` => `NoMethodError:
    // undefined method 'to_unicodemath' for nil`. `renderChild` is that raise.
    const base = renderChild(one, context, "power.parameterOne") ?? "";
    const script = renderChild(two, context, "power.parameterTwo") ?? "";
    return `${base}${stripRubyWhitespace(script)}`;
  }

  // `parameter_two.mini_sized?` — no `&.`, so this is where a nil exponent
  // dies. Measured: `Power(x, nil).to_unicodemath` => `NoMethodError:
  // undefined method 'mini_sized?' for nil`. Emitting `x^()` here instead
  // would invent output the gem never produces.
  if (!present(two)) {
    throw new RenderError(
      "power.parameterTwo: absent — `parameter_two.mini_sized?` (power.rb:69) is " +
        "unguarded, and the gem raises NoMethodError: undefined method " +
        "'mini_sized?' for nil",
      FORMAT,
      node.kind,
    );
  }

  if (miniSized(isNode(two) ? two : undefined)) {
    // Base and exponent concatenated bare — the mini glyph already reads as a
    // superscript. `mini_sup` can miss the table and render nil, which
    // interpolates as empty: measured, `Power(x, Symbol("2", mini_sup_sized))`
    // => `"x"`, the exponent vanishing entirely.
    return `${renderChild(one, context, "power.parameterOne") ?? ""}${renderOptionalChild(two, context)}`;
  }

  // The else branch alone guards the base (`... if parameter_one`), so here a
  // nil base is empty rather than fatal: measured, `Power(nil, y)` => `"^(y)"`.
  const base = present(one) ? (renderChild(one, context, "power.parameterOne") ?? "") : "";
  // `parameter_two.is_a?(self.class)` — a nested `Power` is emitted without
  // parens: measured, `Power(x, Power(y, x))` => `"x^y^(x)"`, against
  // `Power(x, Base(y, x))` => `"x^(y_(x))"`, so `Base` is NOT special here the
  // way it is in `Log#sub_value`.
  const script = isPower(two)
    ? `^${renderOptionalChild(two, context)}`
    : `^${unicodemathParens(two, context) ?? ""}`;
  return `${base}${script}`;
}

/**
 * `Power#accented?` (`power.rb:112`) — three disjuncts, each asking
 * `prime_unicode?` of a **different** field.
 *
 * The `Math::Formula` disjunct reads `field.value.first`, so only the first
 * child counts: measured, `Power(x, Formula[prime, y])` => `"x′y"` (accented,
 * whitespace squeezed out) while `Power(x, Formula[y, prime])` => `"x^(y ′)"`.
 * `Formula::Mrow < Formula`, so an mrow answers here too — measured,
 * `Power(x, Mrow[prime, y])` => `"x′y"`.
 */
function isAccented(field: unknown): boolean {
  if (!isNode(field)) return false;

  if (field.kind === "symbol") return primeUnicode(field);

  if (field.kind === "formula" || field.kind === "mrow") {
    // `Formula.new(nil).value` is `[nil]`, not nil — measured — so `.first` is
    // nil rather than a raise, and `prime_unicode?(nil)` is false.
    const first = field.value?.[0];
    return isNode(first) ? primeUnicode(first) : false;
  }

  // `field.is_a?(Math::Function::Power) && prime_unicode?(field.parameter_one)`
  // — the kind test is what narrows to the carrier node; `isPower` is the name
  // half. Measured: `Power(x, Power(prime, y))` => `"x′^(y)"`.
  if (field.kind === "binaryFunction" && isPower(field)) {
    const inner = field.parameterOne;
    return isNode(inner) ? primeUnicode(inner) : false;
  }

  return false;
}

/**
 * `.gsub(/\s+/, "")` (`power.rb:67`), spelled out because `\s` is not the same
 * class in the two languages.
 *
 * Measured on the pinned oracle against node, on the same string
 * `a SP b TAB c CR d LF e FF f VT g U+00A0 h U+2009 i U+200B j`:
 *
 *   - Ruby `gsub(/\s+/, "")` drops SP TAB CR LF FF VT and **keeps** U+00A0,
 *     U+2009 and U+200B;
 *   - JavaScript `replace(/\s+/g, "")` additionally drops U+00A0 and U+2009;
 *   - JavaScript `replace(/[ \t\r\n\f\v]+/g, "")` reproduces Ruby byte for
 *     byte.
 *
 * Reachable, not theoretical: a symbol's render is already decoded by the time
 * it gets here, so a real NBSP can be in the string being squeezed.
 */
const RUBY_WHITESPACE = /[ \t\r\n\f\v]+/g;

function stripRubyWhitespace(value: string): string {
  return value.replace(RUBY_WHITESPACE, "");
}

/**
 * `Td#to_unicodemath` (`td.rb:52`) — `parameter_one&.map { |val| val&.… }&.join`.
 *
 * Joined with **nothing** (`to_latex` joins with `" "`), and with no `|`
 * short-circuit: measured, `Td([Symbol("|"), x])` => `"|x"` where
 * `to_latex` gives `""`. A cell rendering nil contributes nothing —
 * measured, `Td([Symbol("2", mini_sup_sized), x])` => `"x"`.
 */
function renderTd(node: NodeOf<"binaryFunction">, context: RenderContext): string {
  const cells = node.parameterOne;
  if (!Array.isArray(cells)) {
    // `Td#initialize` (`td.rb:7`) is `parameter_one&.delete_if { … }` then
    // `Array(parameter_one)`, so no gem `Td` has a non-list here: measured,
    // `Td.new(nil).parameter_one` => `[]` and `Td.new(symbol)` =>
    // `NoMethodError: undefined method 'delete_if'`.
    throw new RenderError(
      "td.parameterOne: is not a list — `Td#initialize` wraps its slot in " +
        "`Array(...)`, so no gem Td can reach the renderer with one",
      FORMAT,
      node.kind,
    );
  }
  return cells.map((cell) => renderOptionalChild(cell, context)).join("");
}
