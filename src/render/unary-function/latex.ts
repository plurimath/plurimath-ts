/**
 * Mirrors `function/unary_function.rb` — `UnaryFunction#to_latex` (:61) and
 * `#latex_value` (:221) — plus the name arms for the gem classes the census
 * folds into this carrier with their *own* `to_latex` overrides: `left.rb`
 * (:30), `right.rb` (:30), `glb.rb` (:11), `lcm.rb` (:25), `mbox.rb` (:15),
 * `tr.rb` (:33). Every other name in `MEASURED_UNARY_NAMES` below renders the
 * carrier default.
 *
 * Measured pins worth naming, because source-reading gets them wrong:
 * `Glb` and `Lcm` render with no backslash (`glb{x}`, `lcm{x}`); every other
 * unary name gets `\\#{class_name}{…}` with arrays joined by " ".
 * `Left`/`Right` map their stored paren through
 * `Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert` with `.` on a miss — a
 * node in the slot is a hash-lookup miss (`.`), never an inspect leak, so
 * unlike the asciimath side there is nothing to refuse.
 */

import type { MathNode, NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  interpolatedValue,
  isNode,
  isPipeSymbol,
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/latex/render-shared";
import {
  LATEX_LEFT_RIGHT_PARENS,
  LATEX_UNARY_CARRIER_NAMES,
} from "../../generated/latex/render-tables";

/**
 * `Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert`, generated row by row
 * through `Left`/`Right` renders on the oracle. This is the complete
 * inverted constant — `&#x2016;` maps to `\|` because Ruby's `Hash#invert`
 * keeps the LAST key for a duplicated value — so any string missing here is
 * a genuine gem-side miss, which renders `.`.
 */
const LEFT_RIGHT_PARENS: ReadonlyMap<string, string> = LATEX_LEFT_RIGHT_PARENS;

/**
 * The class names this carrier has measured behaviour for. Three sources,
 * and only the first is generated:
 *
 *   - the AsciiMath-reachable set — every `get_class` basename from the
 *     generated reachability census with this carrier (the latex-owned
 *     projection, `LATEX_UNARY_CARRIER_NAMES`);
 *   - `Tr`, which the transform constructs directly without `get_class`
 *     (`newTr` in `../../formats/asciimath/transform.ts`);
 *   - `Hom`, which the transform never constructs at all, but whose
 *     `to_latex` is the carrier's own, so `renderUnaryDefault` below
 *     already emits the gem's bytes.
 *
 * `Hom` is measured, not read off the class list: on the pinned oracle
 * `Hom.instance_method(:to_latex).owner` is `UnaryFunction`, and of the 48
 * classes the census aliases onto this carrier it is the only one both
 * outside the reachable set and carrier-default here. It takes the
 * backslash, unlike `Glb`/`Lcm` above: `Hom.new(Symbol("x"))` renders
 * `"\\hom{x}"` and `Hom.new(nil)` renders `"\\hom{}"`.
 *
 * A name outside the set raises rather than rendering the carrier default,
 * because the gem class it denotes may override `to_latex`
 * (`unreachableName` in `../../formats/latex/render-shared.ts`).
 *
 * The last two entries are gem-derived data typed by hand — the exception
 * `TODO.plan/deferred.md` records under "The carrier name-guard sets are
 * partly hand-listed"; both are held by behavioural pins in
 * `test/formats/latex/renderer.spec.ts`.
 */
const MEASURED_UNARY_NAMES: ReadonlySet<string> = new Set([
  ...LATEX_UNARY_CARRIER_NAMES,
  "Tr",
  "Hom",
]);

/**
 * The codepoints `String#inspect` writes as a NAMED escape rather than as
 * `\uXXXX`, measured in the sweep `inspectString` below describes.
 */
const INSPECT_NAMED_ESCAPES: ReadonlyMap<number, string> = new Map([
  [0x07, "\\a"],
  [0x08, "\\b"],
  [0x09, "\\t"],
  [0x0a, "\\n"],
  [0x0b, "\\v"],
  [0x0c, "\\f"],
  [0x0d, "\\r"],
  [0x1b, "\\e"],
  [0x22, '\\"'],
  [0x5c, "\\\\"],
]);

/**
 * `Array#inspect` — what `"#{array}"` actually produces — for the element
 * shapes measured on the pinned oracle `00c52783`, and `null` for anything
 * else, which the caller turns into the shared judge's refusal.
 *
 * Reproducing this is not optional here: `Mbox#to_latex` interpolates its slot
 * raw, so a list in the slot reaches Ruby's `inspect` and is rendered rather
 * than refused. Measured, `Mbox.new([nil]).to_latex` is `"\\mbox{[nil]}"`,
 * `[[]]` is `"\\mbox{[[]]}"` and `["x"]` is `"\\mbox{[\"x\"]}"`. Only the
 * ELEMENTS decide: an empty list is not a special case, and a non-empty one is
 * not automatically unreproducible.
 *
 * What is admitted, and why nothing else is:
 *
 *   - `nil`, `true`, `false` — `"nil"`, `"true"`, `"false"`, measured;
 *   - nested arrays, recursively, joined by `", "` (measured: `[nil, nil]` is
 *     `"[nil, nil]"`, comma AND space);
 *   - strings, through `inspectString` below;
 *   - **not** numbers. `[5]` and `[5.0]` inspect as `[5]` and `[5.0]`, which
 *     JavaScript cannot tell apart — the same ambiguity `interpolatedValue`
 *     refuses at top level, and refusing it is what keeps the two consistent;
 *   - **not** nodes or hashes. A node inspects to a heap address, which is
 *     nondeterministic; a non-empty hash has inspect rules of its own that no
 *     probe here has measured.
 */
function rubyInspect(value: unknown): string | null {
  if (value === null || value === undefined) return "nil";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return inspectString(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const part = rubyInspect(item);
      if (part === null) return null;
      parts.push(part);
    }
    return `[${parts.join(", ")}]`;
  }
  return null;
}

/**
 * `String#inspect`, from an exhaustive sweep of U+0000..U+02FF on the pinned
 * oracle `00c52783` — every codepoint in that range whose inspect body is not
 * the character itself, and there are 67 of them.
 *
 * Ruby and JavaScript agree on none of this by default, which is why it is a
 * table and not `JSON.stringify`:
 *
 *   - `"` and `\` take a backslash;
 *   - `#` takes one ONLY before `{`, `$` or `@` — `"a#x"` inspects as `"a#x"`,
 *     `'a#{b}'` as `"a\#{b}"`;
 *   - U+0007..U+000D and U+001B have named forms (`\a \b \t \n \v \f \r \e`);
 *   - every other codepoint below U+0020, plus U+007F..U+009F, is `\uXXXX`
 *     with FOUR digits and UPPERCASE hex — `\u001A`, not `\u001a`;
 *   - U+00A0..U+02FF pass through verbatim (é is `"é"`, not an escape).
 *
 * Above U+02FF the answer is `null`, refusing rather than guessing. That
 * ceiling is this sweep's, not a fact about Ruby: measured, `"π"` inspects as
 * `"π"` and would render fine, while U+10FFFF inspects as `"\u{10FFFF}"` — a
 * BRACED form this table does not carry. Ruby's rule up there is about which
 * codepoints it considers printable, and pinning that needs its own sweep.
 */
function inspectString(value: string): string | null {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] as string;
    const codepoint = character.codePointAt(0) as number;
    if (codepoint > 0x2ff) return null;
    const named = INSPECT_NAMED_ESCAPES.get(codepoint);
    if (named !== undefined) {
      out += named;
      continue;
    }
    if (codepoint < 0x20 || (codepoint >= 0x7f && codepoint <= 0x9f)) {
      out += `\\u${codepoint.toString(16).toUpperCase().padStart(4, "0")}`;
      continue;
    }
    // `#` is escaped only where Ruby would have read an interpolation.
    if (character === "#" && ["{", "$", "@"].includes(value[index + 1] ?? "")) {
      out += "\\#";
      continue;
    }
    out += character;
  }
  return `"${out}"`;
}

export function renderUnaryFunction(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  const name = node.name;
  switch (name) {
    case "Left":
    case "Right": {
      // `"\\left #{latex_paren}"` (`left.rb:30`): the stored paren through
      // the inverted constant, `.` on any miss — including a NODE in the
      // slot, which is a hash-lookup miss in Ruby (measured).
      const keyword = name === "Left" ? "\\left" : "\\right";
      const paren = node.parameterOne;
      const mapped = typeof paren === "string" ? (LEFT_RIGHT_PARENS.get(paren) ?? ".") : ".";
      return `${keyword} ${mapped}`;
    }
    case "Glb":
    case "Lcm":
      // `"glb{…}"`, `"lcm{…}"` — no backslash (`glb.rb:11`, `lcm.rb:25`).
      return `${name.toLowerCase()}{${s(latexValue(node.parameterOne, context, `${name.toLowerCase()}.parameterOne`))}}`;
    case "Mbox": {
      // `mbox.rb:15-17`: `"\\mbox{#{parameter_one}}"`. Raw interpolation, so
      // this is one of the two Mbox overrides that do NOT delegate to `Text` —
      // `Text#to_latex` writes `\text{…}`, and delegating would have emitted
      // the wrong command. (`to_html`, which hands back `parameter_one`
      // itself, is the other; the remaining four do delegate.) It is not
      // `latex_value` either: no child is rendered, so this takes the same
      // interpolation judge `Left`/`Right` take on the asciimath side.
      //
      // Measured on the pinned oracle `00c52783`: `Mbox.new("hi")` →
      // `"\\mbox{hi}"`, `Mbox.new("a b")` → `"\\mbox{a b}"`, `Mbox.new(nil)`
      // and `Mbox.new("")` → `"\\mbox{}"`, `Mbox.new(5)` → `"\\mbox{5}"`,
      // `Mbox.new(true)` → `"\\mbox{true}"` — an integer and a boolean write
      // their own bytes, NOT empty braces. A NODE interpolates Ruby's default
      // `Object#to_s`, a heap address
      // (`"\\mbox{#<Plurimath::Math::Symbols::Symbol:0x00007a71...>}"`), which
      // is not reproducible and which `interpolatedValue` refuses.
      const slot = node.parameterOne;
      // Lists are answered HERE rather than inside `interpolatedValue`, which
      // also serves `../number/latex.ts` and `../color/latex.ts`. Those slots
      // do NOT reach Ruby through a bare `"#{}"`: `Number#to_latex` goes
      // through `Formatter::Numbers::TextRenderer`, and Color's nested raw
      // symbol list goes through a join that answers `""` for `[]`. A list
      // means a different thing at each of the three, so widening the shared
      // judge would have been wrong at two of them.
      if (Array.isArray(slot)) {
        const inspected = rubyInspect(slot);
        // A list holding something Ruby renders unreproducibly falls through
        // to the shared judge, which refuses every array with the reason that
        // covers it.
        if (inspected !== null) return `\\mbox{${inspected}}`;
      }
      return `\\mbox{${interpolatedValue(slot, node.kind, "mbox.parameterOne")}}`;
    }
    case "Tr":
      return renderTr(node, context);
    default:
      if (!MEASURED_UNARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      return renderUnaryDefault(name.toLowerCase(), node.parameterOne, context);
  }
}

/**
 * `UnaryFunction#to_latex` (`unary_function.rb:61`):
 * `"\\#{class_name}{#{latex_value}}"`. Exported for the kind files of gem
 * classes that inherit it unchanged (`../sqrt/latex.ts`, `../abs/latex.ts`, ...).
 */
export function renderUnaryDefault(
  className: string,
  parameterOne: NodeParameter | undefined,
  context: RenderContext,
): string {
  return `\\${className}{${s(latexValue(parameterOne, context, `${className}.parameterOne`))}}`;
}

/**
 * `UnaryFunction#latex_value` (`unary_function.rb:221`): nil stays nil, a
 * list compacts and joins with " " (asciimath joins with "" — measured
 * difference), anything else renders directly. Exported for the inheriting
 * kind files (`../ceil/latex.ts`, `../mpadded/latex.ts`, `../linebreak/latex.ts`).
 */
export function latexValue(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => s(renderChild(item, context, at)))
      .join(" ");
  }
  return renderChild(value, context, at);
}

function renderTr(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  // `Tr#to_latex` (`tr.rb:33`): drop the `|` tds (either the td itself, or
  // its first cell), then join with " & ". The second reject check reads
  // `td.parameter_one.first`, so a td without a cell LIST crashes in the gem.
  const tds = node.parameterOne;
  if (!Array.isArray(tds)) {
    throw new RenderError(
      `tr.parameterOne: is ${describeSlot(tds)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  const kept: MathNode[] = [];
  for (const td of tds) {
    if (isPipeSymbol(td)) continue;
    const cells = isNode(td) ? (td as { readonly parameterOne?: unknown }).parameterOne : undefined;
    if (!Array.isArray(cells)) {
      throw new RenderError(
        `tr.parameterOne: a td holds ${describeSlot(cells)} instead of a cell list — ` +
          "the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    if (cells.length > 0 && isPipeSymbol(cells[0])) continue;
    kept.push(td as MathNode);
  }
  return kept.map((td) => s(renderChild(td, context, "tr.parameterOne"))).join(" & ");
}
