/**
 * Mirrors `function/unary_function.rb` — `UnaryFunction#to_asciimath` (:21)
 * and `#asciimath_value` (:196) — plus the name arms for the gem classes the
 * census folds into this carrier with their *own* `to_asciimath` overrides:
 * `left.rb`, `right.rb`, `lcm.rb`, `mbox.rb`, `tr.rb`. Every other name in
 * `MEASURED_UNARY_NAMES` below renders the carrier default.
 *
 * Measured pin worth naming, because source-reading gets it wrong:
 * `UnaryFunction#to_asciimath` drops the parentheses exactly when the class
 * name is in `Utility::UNARY_CLASSES` (`sin x` → `sinx`, but `cancel(x)`
 * keeps them — `cancel` is not in the table).
 */

import type { NodeParameter } from "../../core/index";
import { RenderError, TextNode } from "../../core/index";
import {
  classBasename,
  describeSlot,
  FORMAT,
  interpolatedValue,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/asciimath/render-shared";
import {
  ASCIIMATH_TRANSFORM_GET_CLASS,
  ASCIIMATH_TRANSFORM_UNARY_CLASSES,
} from "../../generated/asciimath/transform-registry";
import { renderText } from "../text/asciimath";

/** `Utility::UNARY_CLASSES` — the names rendered without parentheses. */
const UNARY_KEYWORDS: ReadonlySet<string> = new Set(ASCIIMATH_TRANSFORM_UNARY_CLASSES);

/**
 * The fresh `Text` that `mbox.rb` builds out of the slot.
 *
 * `Text.new(parameter_one)` passes the slot POSITIONALLY, so a nil slot stays
 * nil — but `Text#initialize` defaults an OMITTED argument to `""` where
 * `UnaryFunction#initialize` defaults to nil (measured on the pinned oracle
 * `00c52783`: `Text.new.parameter_one` is `""`, `Mbox.new.parameter_one` is
 * nil), and `TextNode` faithfully reproduces that `""` for an `undefined`
 * init. §5's structural dispatch admits a plain object with `parameterOne`
 * absent, which reaches here as `undefined`. An explicit `""` and an explicit
 * `false` both pass through untouched.
 */
function mboxText(parameterOne: NodeParameter | undefined): NodeOf<"text"> {
  return new TextNode({ parameterOne: parameterOne ?? null });
}

/**
 * The class names this carrier has measured behaviour for. Three sources,
 * and only the first is generated:
 *
 *   - the AsciiMath-reachable set — every `get_class` name from the
 *     generated reachability census with this carrier;
 *   - `Tr`, which the transform constructs directly without `get_class`
 *     (`newTr` in `../../formats/asciimath/transform.ts`);
 *   - `Hom`, which the transform never constructs at all — `"hom(x)"`
 *     parses to bare symbols — but whose `to_asciimath` is the carrier's
 *     own, so the default arm below already emits the gem's bytes.
 *
 * `Hom` is measured, not read off the class list: on the pinned oracle
 * `Hom.instance_method(:to_asciimath).owner` is `UnaryFunction`, and of the
 * 48 classes the census aliases onto this carrier it is the only one both
 * outside the reachable set and carrier-default here. `"hom"` is absent
 * from `UNARY_CLASSES`, so the parens stay: `Hom.new(Symbol("x"))` renders
 * `"hom(x)"` and `Hom.new(nil)` renders `"hom"`.
 *
 * A name outside the set raises rather than rendering the carrier default,
 * because the gem class it denotes may override `to_asciimath`
 * (`unreachableName` in `../../formats/asciimath/render-shared.ts`).
 *
 * The last two entries are gem-derived data typed by hand — the exception
 * `TODO.plan/deferred.md` records under "The carrier name-guard sets are
 * partly hand-listed"; both are held by behavioural pins in
 * `test/formats/asciimath/renderer.spec.ts`.
 */
const MEASURED_UNARY_NAMES: ReadonlySet<string> = new Set([
  ...ASCIIMATH_TRANSFORM_GET_CLASS.filter(
    (entry) => entry.carrier === "Math::Function::UnaryFunction",
  ).map((entry) => classBasename(entry.rubyClass)),
  "Tr",
  "Hom",
]);

export function renderUnaryFunction(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  const name = node.name;
  switch (name) {
    case "Left":
    case "Right": {
      // `"left#{parameter_one}"` — plain interpolation, no recursion
      // (`left.rb:7`, `right.rb:7`), so it takes the shared interpolation
      // judge: nil, strings, booleans and the non-finite floats reproduce
      // Ruby's bytes exactly (probes left-true => "lefttrue", left-nan =>
      // "leftNaN", probe-sweep-truthiness.rb); a node would interpolate a
      // nondeterministic #inspect address and a finite number is ambiguous
      // (probe left-float-5.0 => "left5.0" where JS 5.0 is 5), so those
      // raise instead (recorded in TODO.plan/deferred.md).
      const keyword = name.toLowerCase();
      return `${keyword}${interpolatedValue(node.parameterOne, node.kind, `${keyword}.parameterOne`)}`;
    }
    case "Lcm":
      // `"lcm #{asciimath_value}"` — a space, not parentheses (`lcm.rb:20`).
      return present(node.parameterOne)
        ? `lcm ${asciimathValue(node.parameterOne, context, "lcm.parameterOne")}`
        : "lcm";
    case "Mbox":
      // `mbox.rb:7-9`: `Text.new(parameter_one).to_asciimath(options: options)`.
      // The slot is handed to a FRESH `Text` and rendered as one — the carrier
      // default never runs, and the class is not in `UNARY_CLASSES` either, so
      // reading it as `mbox(hi)` would have been wrong twice over.
      //
      // Measured on the pinned oracle `00c52783`, `Mbox.new(v)` against
      // `Text.new(v)` for every shape a slot can hold: identical bytes on all
      // of them. `"hi"` → `"\"hi\""`, `"a b"` → `"\"a b\""`, `""` → `"\"\""`,
      // nil → `"\"\""`; a node, a list, an integer and a boolean each die in
      // `Text`'s own `gsub` (NoMethodError), which is the refusal `renderText`
      // already carries. `Text.new` takes the slot positionally with `lang:`
      // left nil, which is what an omitted `lang` builds here.
      //
      // `mboxText` narrows an ABSENT slot to nil before building that `Text`,
      // because `Text#initialize` defaults an omitted argument to `""` where
      // `Mbox.new` leaves nil. The two answer alike in THIS format — measured,
      // `Text.new(nil)` and `Text.new("")` both render `"\"\""` — so the
      // narrowing changes no byte here today. It is applied anyway: the same
      // slot renders differently under mathml (`<mtext/>` against
      // `<mtext></mtext>`) and unicodemath (nothing against two quote marks),
      // and three arms reading one gem line should not disagree about what the
      // gem line says.
      return renderText(mboxText(node.parameterOne));
    case "Tr": {
      // `"[#{tds.join(', ')}]"` — strict elements (`tr.rb:16-21`).
      const cells = node.parameterOne;
      if (!Array.isArray(cells)) {
        throw new RenderError(
          `tr.parameterOne: is ${describeSlot(cells)}, not a list — the gem raises NoMethodError here`,
          FORMAT,
          node.kind,
        );
      }
      return `[${cells.map((cell) => s(renderChild(cell, context, "tr.parameterOne"))).join(", ")}]`;
    }
    default:
      if (!MEASURED_UNARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      return renderUnaryDefault(name.toLowerCase(), node.parameterOne, context);
  }
}

/**
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`):
 * `#{class_name}#{value}`, where the value keeps its parens unless the name
 * is in `UNARY_CLASSES`, and a nil parameter contributes nothing at all.
 * Exported for the kind files of gem classes that inherit it unchanged
 * (`../sqrt/asciimath.ts`, `../abs/asciimath.ts`, ... — and `../norm/asciimath.ts`, whose `super` is this).
 */
export function renderUnaryDefault(
  className: string,
  parameterOne: NodeParameter | undefined,
  context: RenderContext,
): string {
  const at = `${className}.parameterOne`;
  if (UNARY_KEYWORDS.has(className))
    return `${className}${asciimathValue(parameterOne, context, at)}`;
  if (present(parameterOne)) return `${className}(${asciimathValue(parameterOne, context, at)})`;
  return className;
}

/**
 * `UnaryFunction#asciimath_value` (`unary_function.rb:196`): a falsy value →
 * `""`, a list compacts and joins with no separator, anything else renders
 * directly. Falsy by RUBY truthiness — the gem opens with `return "" unless
 * parameter_one`, so `false` answers `""` exactly like nil (probes
 * mpadded-false => `""`, sin-false => `"sin"`, probe-sweep-truthiness.rb on
 * the pinned oracle), while `false` INSIDE a list still crashes there
 * (`compact` keeps it; probe mpadded-list-false => NoMethodError) and raises
 * here. Exported for the inheriting kind files (`../mpadded/asciimath.ts`,
 * `../linebreak/asciimath.ts`).
 */
export function asciimathValue(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  if (!present(value)) return "";
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => s(renderChild(item, context, at)))
      .join("");
  }
  return s(renderChild(value, context, at));
}
