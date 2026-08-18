/**
 * Mirrors `function/unary_function.rb` — `UnaryFunction#to_unicodemath` (:90) —
 * plus the name arms for the gem classes the census folds into this carrier
 * with their *own* `to_unicodemath` overrides: `cancel.rb` (:21), `left.rb`
 * (:34), `right.rb` (:34), `tr.rb` (:65). Every other reachable name renders
 * the carrier default.
 *
 * That set of four was **measured**, not read off the class list: for each of
 * the 35 reachable names, `Klass.instance_method(:to_unicodemath).owner` on the
 * pinned oracle answers `UnaryFunction` except for `Cancel`, `Left`, `Right`
 * and `Tr`. It is deliberately NOT the same set as `./latex.ts` carries —
 * `Glb` and `Lcm` override `to_latex` only, so they take the carrier default
 * here (`Glb.new(x).to_unicodemath` → `"glb⁡x"`, `Lcm` → `"lcm⁡x"`, measured).
 * Every other gem class with its own `to_unicodemath` (`abs`, `sqrt`, `text`,
 * `vec`, …) is a node kind of its own in this port and never reaches here.
 *
 * Measured pins worth naming, because source-reading gets them wrong:
 *
 *   - `Tr` joins on `"&"` and does **not** drop the `|` tds that its own
 *     `to_latex` rejects — `Tr.new([Symbol("|"), Td([Symbol("a")])])` renders
 *     `"|&a"`, and a td whose first cell is `|` renders too (`"|&b"`), where
 *     `./latex.ts` drops both.
 *   - `Left`/`Right` return `parameter_one` **raw**: no interpolation, and no
 *     `left_paren`/`right_paren` mapping — `Right.new("\\}")` renders `"\\}"`,
 *     where `to_latex` maps the same slot to `"}"`.
 *   - `Cancel` goes through `unicodemath_parens` (`core.rb:408`), so a
 *     `Fenced` child is not double-wrapped: `Cancel(Fenced("(", a, ")"))`
 *     renders `"╱(a)"`, exactly like `Cancel(Symbol("a"))`.
 */

import { RenderError } from "../../core/index";
import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  className,
  FORMAT,
  isNode,
  present,
  renderChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import { UNICODEMATH_UNARY_CARRIER_NAMES } from "../../generated/unicodemath/render-tables";

/** U+2061 FUNCTION APPLICATION — invisible, but a real character. */
const APPLY = "⁡";

/** U+2571 BOX DRAWINGS LIGHT DIAGONAL — `Cancel`'s strike (`cancel.rb:26`). */
const CANCEL_MARK = "╱";

/**
 * The class names this carrier has measured behaviour for — exactly the
 * AsciiMath-reachable set: every `get_class` basename from the generated
 * reachability census with this carrier (the unicodemath-owned projection,
 * `UNICODEMATH_UNARY_CARRIER_NAMES`), plus `Tr`, which the transform
 * constructs directly without `get_class` (`newTr` in
 * `../../formats/asciimath/transform.ts`) and which therefore no census row
 * can carry. A name outside the set raises rather than rendering the carrier
 * default, because the gem class it denotes may override `to_unicodemath` —
 * the very way `Tr` produced the literal `"tr⁡"` in a table's rows before this
 * file had arms.
 */
const REACHABLE_UNARY_NAMES: ReadonlySet<string> = new Set([
  ...UNICODEMATH_UNARY_CARRIER_NAMES,
  "Tr",
]);

export function renderUnaryFunction(
  node: NodeOf<"unaryFunction">,
  context: RenderContext,
): string | null {
  const name = node.name;
  switch (name) {
    case "Cancel":
      return renderCancel(node, context);
    case "Left":
    case "Right":
      return renderLeftRight(node);
    case "Tr":
      return renderTr(node, context);
    default: {
      if (!REACHABLE_UNARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      // `UnaryFunction#to_unicodemath` (`unary_function.rb:90`):
      // `"#{class_name}⁡#{parameter_one&.to_unicodemath(options: options)}"`.
      const lowered = className(name);
      return `${lowered}${APPLY}${unaryValue(node, context, `${lowered}.parameterOne`)}`;
    }
  }
}

/**
 * The `parameter_one&.to_unicodemath(options: options)` half of the carrier
 * default.
 *
 * Two things this is deliberately not. It is not `renderOptionalChild`: a bare
 * string or a list in the slot is not nil, the gem calls `to_unicodemath` on
 * it, and it raises NoMethodError (measured — `Sin.new("x")` and
 * `Sin.new([Symbol("x")])` both raise `undefined method 'to_unicodemath'`), so
 * answering `""` there would invent output for a shape the gem refuses. And it
 * is not `present` — `&.` is a nil test, NOT Ruby truthiness: `false&.foo`
 * calls `foo` on `false` and raises. The two differ only on `false`, which
 * `NodeParameter` cannot hold, but the nil test is the one the gem wrote.
 */
function unaryValue(node: NodeOf<"unaryFunction">, context: RenderContext, at: string): string {
  const field = node.parameterOne;
  if (field === null || field === undefined) return "";
  if (!isNode(field)) throw slotCrash(at, field, node.kind);

  // Measured: `Sin.new(nil)` → `"sin⁡"`, `Sin.new(Symbol("x"))` → `"sin⁡x"`.
  return renderChild(field, context, at) ?? "";
}

/**
 * `Cancel#to_unicodemath` (`cancel.rb:21`): `first_value` is assigned only
 * `if parameter_one`, then `"╱#{first_value}"`.
 *
 * That `if` is Ruby truthiness, so the guard is `present` rather than a nil
 * test — the one site in this file where the gem wrote a truthiness test
 * rather than `&.`. An absent slot renders the mark alone (measured:
 * `Cancel.new(nil)` → `"╱"`). Anything truthy that is not a node dies inside
 * `unicodemath_parens` on `field.to_unicodemath` (measured: a bare string, a
 * list and a hash all raise NoMethodError) — the shared `unicodemathParens`
 * answers `null` to those, so they are refused here before it is called.
 */
function renderCancel(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  const field = node.parameterOne;
  if (!present(field)) return CANCEL_MARK;
  if (!isNode(field)) throw slotCrash("cancel.parameterOne", field, node.kind);

  // A `Fenced` child returns its own render unwrapped, so `╱(a)` either way
  // (measured, both shapes).
  return `${CANCEL_MARK}${unicodemathParens(field, context) ?? ""}`;
}

/**
 * `Left#to_unicodemath` and `Right#to_unicodemath` (`left.rb:34`,
 * `right.rb:34`), which are one line: `parameter_one`.
 *
 * The slot is **returned**, not interpolated — so nil returns nil, which this
 * port carries as `null` (measured: `Left.new(nil)` → `nil`), and a string
 * returns itself verbatim, including the backslash `to_latex` would have eaten
 * (`Right.new("\\}")` → `"\\}"`).
 *
 * A node in the slot is returned as the OBJECT, and the parent's join
 * stringifies it: measured, a `Formula` holding `Left.new(Symbol("a"))`
 * renders `"#<Plurimath::Math::Symbols::Symbol:0x00007799fae22320>"`, a live
 * heap address no port can reproduce. A list is the same story one level up.
 * Both are refused rather than guessed — the line `../../formats/asciimath/render-shared.ts`
 * draws at `interpolatedValue`, for the same reason.
 *
 * There is no guard in the gem at all here, so this is a nil test and not
 * `present`: `false` in the slot would come back as `false` and stringify to
 * `"false"`, not vanish. `NodeParameter` cannot hold it, so the two agree on
 * everything reachable.
 */
function renderLeftRight(node: NodeOf<"unaryFunction">): string | null {
  const paren = node.parameterOne;
  if (paren === null || paren === undefined) return null;
  if (typeof paren === "string") return paren;

  throw new RenderError(
    `${className(node.name)}.parameterOne: holds ${describeSlot(paren)} — the gem returns it ` +
      "unrendered and the parent stringifies it, which for a node is an #inspect address",
    FORMAT,
    node.kind,
  );
}

/**
 * `Tr#to_unicodemath` (`tr.rb:65`):
 * `parameter_one&.map { |p| p.to_unicodemath(options: options) }&.join("&")`.
 *
 * Note what is NOT here: `Tr#to_latex` rejects the `|` tds first, and this
 * method does not (measured — see the header). Note also that the gem's own
 * constructor refuses a non-array (`Tr.new(td)` raises NoMethodError on
 * `all?`), so the crash below is reachable only past the constructor, where
 * `map` raises the same error class (measured by assigning `parameter_one`
 * after construction).
 */
function renderTr(node: NodeOf<"unaryFunction">, context: RenderContext): string | null {
  const tds = node.parameterOne;
  // `&.`, so a nil test and not `present` (`false&.map` raises rather than
  // vanishing). Measured: `Tr.new(nil).to_unicodemath` is nil, not `""`,
  // while `Tr.new([])` is `""`.
  if (tds === null || tds === undefined) return null;
  if (!Array.isArray(tds)) throw slotCrash("tr.parameterOne", tds, node.kind);

  // `Array#join` writes a nil element as "" — measured: a row whose first td
  // renders nil gives `"&b"`, a leading empty field rather than a dropped one.
  return tds.map((td) => renderChild(td, context, "tr.parameterOne") ?? "").join("&");
}

/**
 * The port's stand-in for the gem's NoMethodError on a slot that cannot answer
 * `to_unicodemath`.
 *
 * Local because `../../formats/unicodemath/render-shared.ts` exports no
 * `describeSlot`/`unreachableName` pair — its `renderChild` reports a bare
 * `typeof`, which calls a list "object". Worth lifting there if a second
 * unicodemath kind file needs it.
 */
function slotCrash(at: string, value: unknown, kind: string): RenderError {
  return new RenderError(
    `${at}: is ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    kind,
  );
}

function describeSlot(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (Array.isArray(value)) return "a bare list";
  // Explicit, because the article fallback would say "a object".
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

function unreachableName(kind: string, name: string): RenderError {
  return new RenderError(
    `No measured unicodemath rendering for ${kind} name "${name}" — it is not ` +
      "reachable from the AsciiMath transform, and the gem class may override " +
      "to_unicodemath. Rendering a carrier default instead would diverge silently.",
    FORMAT,
    kind,
  );
}
