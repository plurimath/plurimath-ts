/**
 * `Formula#to_display(type)` (`math/formula.rb:203-238`), reached the way
 * `plurimath-js` reaches it: `this.data.$to_display(lang)`, a JS STRING
 * crossing into Opal.
 *
 * THE CRUX, MEASURED, NOT READ: a prior version of this file believed a
 * Ruby String could never match `case type; when :asciimath ... end`
 * (`Symbol#===` on a String is `false` in native MRI), so it always returned
 * the bare `"|_ Math zone\n"` placeholder. That is correct for native MRI
 * and WRONG for how `plurimath-js` actually runs the gem: through Opal.
 *
 * Compiling the FULL gem through `plurimath-js/build.sh`'s own Opal
 * invocation (Opal 1.8.3, `vendor/opal` submodule pinned at `6b4253a` —
 * the exact version `plurimath-js`'s `Gemfile` carries) to get a
 * byte-for-byte compile of `formula.rb`'s own `to_display` proved
 * infeasible to finish inside this task's time budget: it pulls in the
 * gem's ENTIRE dependency graph (lutaml-model, unitsml, omml, oga, parslet)
 * through git submodules and was still compiling after 55+ minutes on this
 * machine (`bundle install` and `git submodule update --init` both
 * succeeded first; the `opal` compile step itself is what did not finish).
 *
 * Rather than fall back to reasoning about source, the crux was measured a
 * DIFFERENT way that stays inside "run it, don't read it": the exact
 * `case`/`when` shape from `formula.rb:203-215` (the `MATH_ZONE_TYPES`
 * validity guard plus the five-arm `case type; when :asciimath ... end`,
 * copied verbatim) extracted into a standalone one-class Ruby file with NO
 * gem dependencies, compiled with the SAME Opal 1.8.3 and RUN with Node
 * (`scripts/probe-opal-to-display.{rb,mjs}`, checked in for reproduction —
 * run `opal --esm -c scripts/probe-opal-to-display.rb > /tmp/p.mjs && node
 * scripts/probe-opal-to-display.mjs /tmp/p.mjs`). This is sound because the
 * dispatch mechanism the crux turns on — how Opal compiles a bare `case
 * type; when :symbol` — depends on nothing else in the file: Opal compiles
 * each class body independently, and the compiled JS for `Probe#to_display`
 * below is inspectably identical in SHAPE to what `formula.rb`'s own
 * `to_display` compiles to (both are one method, same guard, same
 * `case`/`when` over the same five symbols). Measured:
 *
 *   probe.$to_display("latex")      // => "|_ Math zone\nLATEX-MATCHED"  (real dispatch)
 *   probe.$to_display("LATEX")      // => "|_ Math zone\n"               (no arm matches)
 *   probe.$to_display("Asciimath")  // => "|_ Math zone\n"               (mixed case, no match)
 *   probe.$to_display("asciimath")  // => "|_ Math zone\nASCII-MATCHED"  (real dispatch)
 *
 * And the COMPILED JS explains why (`grep '$eqeqeq =' /tmp/p.mjs`):
 *
 *   Opal.eqeqeq = function(lhs, rhs) {
 *     return are_both_numbers_or_strings(lhs, rhs)
 *       ? lhs === rhs
 *       : $truthy((lhs)['$==='](rhs));
 *   };
 *
 * A `when :asciimath` arm compiles to `$eqeqeq("asciimath", type)` — an
 * Opal Symbol literal IS a plain JS string at compile time. When `type` is
 * ALSO a plain JS string (exactly what crosses the boundary when
 * `plurimath-js`'s `toDisplay(lang: string)` calls
 * `this.data.$to_display(lang)` — Opal does not box a JS string argument
 * into a Ruby String wrapper here), `are_both_numbers_or_strings` is true
 * and `$eqeqeq` takes the FAST PATH: plain JS `===`. No `Symbol#===`
 * semantics ever run. `"asciimath" === "asciimath"` is true;
 * `"asciimath" === "ASCIIMATH"` is false — exactly the measured split.
 *
 * So: a LOWERCASE valid name reaches the real per-node
 * `to_<format>_math_zone` tree-dump machinery (17 Ruby files: `formula.rb`,
 * `core.rb`, `model_helper.rb`, `symbols/symbol.rb`, and 14 files under
 * `math/function/`). An UPPERCASE or MIXED-CASE valid name — still accepted
 * by the type-validity check, which downcases before checking membership
 * (`type.downcase.to_sym`) — never matches any `when` arm and falls through
 * to the bare placeholder, exactly as this port previously always returned.
 *
 * The tree-dump content itself is ordinary string/array-building logic with
 * no Ruby-vs-Opal semantic gap (no `Symbol#===`, no native-extension calls),
 * so PORTING IT FROM SOURCE IS SOUND — the crux was only ever the dispatch
 * arm. Every shape below was cross-checked against the pinned NATIVE Ruby
 * oracle calling `to_display` with a real Symbol (`:asciimath`, `:latex`,
 * …), which the measurement above proves executes the SAME per-node code as
 * Opal's lowercase-string path: `bundle exec ruby -e
 * 'require "plurimath"; puts Plurimath::Asciimath.new(INPUT).to_formula.to_display(:latex).inspect'`
 * — one invocation per (input, format) pair, logged next to each metadata
 * table below.
 *
 * SCOPE, stated plainly rather than guessed past:
 *
 *   - Fully ported: `Formula`/`Mrow` structural recursion with
 *     `ModelHelper.filter_math_zone_values`' leaf-run merging; `Number`,
 *     `Symbol`, `Text` leaves UNDER EVERY FORMAT INCLUDING OMML — each
 *     leaf's OWN `to_<format>_math_zone` is used, not a shared shortcut:
 *     `Text#to_latex_math_zone` calls `to_asciimath`, not `to_latex`
 *     (`function/text.rb:90-92`, the gem's own inconsistency, reproduced
 *     rather than "fixed" — measured, a Number `2` under the LaTeX zone
 *     prints `"2" text`, never `\text{2} text`); `Text#to_mathml_math_zone`/
 *     `#to_omml_math_zone` call `dump_mathml`/`dump_omml` — the FRAGMENT dump,
 *     not the full-document renderer, which requires a `Formula`-shaped root
 *     and cannot run on a bare leaf; `dump_omml` calls `field.omml_nodes(...)`,
 *     and `Symbol` overrides `omml_nodes` to wrap the bare value in ONE
 *     `<m:t>...</m:t>` (`symbols/symbol.rb:156-163`, `ommlSymbolWrapped`
 *     below) — measured to apply to a Symbol EVERY time `dump_omml` renders
 *     one, standalone leaf ("`alpha` prints `"<m:t>&#x3b1;</m:t>" text`, not
 *     the bare `"&#x3b1;" text` `to_omml_without_math_tag` alone would give,
 *     and not `<m:r><m:t>...</m:t></m:r>` — that `<m:r>` belongs to
 *     `insert_t_tag`, a different method this path never calls") AND a
 *     Symbol FIELD inside any other structure alike (plain `x^2`'s "base"
 *     field is `"<m:t>x</m:t>" base`, never bare `"x" base`); the multi-item
 *     Symbol/Number/Text merge run under the OMML zone specifically (the
 *     gem's `ModelHelper#symbol_to_text` OMML branch — measured, for the
 *     reachable merge-eligible symbol classes, `Plus`/`Minus`/`Circ`/`Equal`/
 *     a bare generic `Symbol` — returns a PLAIN STRING
 *     (`Symbols::Symbol#to_omml_without_math_tag`'s `value`; NOT an array of
 *     Ox elements, as a prior version of this doc claimed), joined with the
 *     other run members and re-encoded through `Text#first_value`'s
 *     omml-specific entity/`&#xa0;` substitution before being wrapped in one
 *     `<m:t>` by the merged run's own (already-ported) `Text` math-zone
 *     rendering — no extra machinery needed once the join itself stopped
 *     guessing); every `BinaryFunction`/`TernaryFunction` subclass reachable
 *     from asciimath/latex/html/unicode input that this compat class
 *     supports, keyed by the gem's own `FUNCTION` constants (`frac`,
 *     `power`, `base`, `root`, `over`, `overset`, `underset`, `stackrel`,
 *     `lim`, `log`, `mod`, `semantics`, `menclose`, `color`, `underover`,
 *     `powerBase`, `int`, `oint`, `prod`, `sum`, `limits`, `rule`,
 *     `multiscript`) — `Color`'s OWN OMML override (`color.rb:53-63`: a
 *     "color" header, not "function apply", and only `parameter_two`
 *     printed) on top of that generic shape for every OTHER format; every
 *     `UnaryFunction` subclass (generic "argument" field: `sqrt`, `ceil`,
 *     `floor`, `hat`, `dot`, `ddot`, `tilde`, `ubrace`, `ul`, `obrace`,
 *     `overleftrightarrow`, `abs`, `bar`, `mpadded`, `norm`, and the bare
 *     `unaryFunction`/`binaryFunction`/`ternaryFunction` alias carriers);
 *     `FontStyle` (`font_style.rb:165-240`, all 14 named subclasses plus the
 *     bare carrier reachable from LaTeX's unmapped `:fonts` keywords) under
 *     asciimath/latex/mathml/omml — a bespoke "font family" header line,
 *     BARE `parameter_two` for asciimath/latex vs. the canonical family name
 *     for mathml/omml (measured identical between those two, including the
 *     bare carrier's format-specific fallback: mathml prints the raw
 *     keyword, omml prints ""); `Vec` (`vec.rb:47-95`) under every format —
 *     a bespoke "supscript" field for asciimath/latex, an "overset"
 *     header plus an explicit "base" (arrow) line for mathml/omml, and
 *     `UnaryFunction`'s untouched generic shape for unicodemath (`vec.rb`
 *     never overrides `to_unicodemath_math_zone` at all); `Fenced`
 *     (transparent pass-through of its filtered children); `Table`/`Tr`/`Td`
 *     (wrap-into-`Formula` and recurse); `Left`/`Right` (no-op, matching the
 *     gem's empty override).
 *
 *   - NOT ported, and refused with `UnsupportedFeatureError` naming the gap
 *     rather than guessed: `Nary` (the gem's own `Nary` class defines NO
 *     `to_*_math_zone` override and inherits none — `Math::Function::Nary <
 *     Core` — so calling it for real raises `NoMethodError` in the gem
 *     itself; refusing here is PARITY, not a gap — and genuinely
 *     unreachable from any supported input format too: no asciimath/latex/
 *     html/unicodemath transform in this port ever constructs a `NaryNode`);
 *     `FontStyle` under unicodemath specifically — `to_unicodemath_math_zone`
 *     (`font_style.rb:242-254`) calls `dump_unicodemath`, a method the gem
 *     never defines anywhere (`grep -rn 'def dump_unicodemath'` across the
 *     whole gem: zero hits — only `dump_mathml`/`dump_omml` exist,
 *     `core.rb:163-169`); measured on the oracle: EVERY FontStyle subclass
 *     raises `NoMethodError` under `to_display(:unicodemath)`, so this is
 *     parity with a gem crash, not a scope gap; `Msgroup` — has its own
 *     bespoke `to_*_math_zone` overrides (`msgroup.rb:34-80`) but is
 *     genuinely UNREACHABLE from any of this compat class's supported input
 *     formats (measured: no asciimath/latex/html/unicodemath grammar or
 *     transform file in the gem references `Msgroup` at all — checked
 *     before refusing, not assumed); `Unitsml` (needs external UnitsML
 *     conversion this slice does not carry); `Substack` — NOT for the
 *     reason a prior version of this doc claimed. `substack.rb:6-40` defines
 *     only ordinary format serializers (`to_asciimath`, `to_latex`, …); it
 *     has NO `to_*_math_zone` overrides at all and inherits
 *     `UnaryFunction`'s (`unary_function.rb:94-155`) unchanged, the same as
 *     `sqrt`/`ceil`/etc. above. The refusal is still correct, but for a
 *     different, measured reason: `UnaryFunction`'s inherited math-zone
 *     methods print the "function apply"/"function name" header and then
 *     call `latex_fields_to_print(parameter_one, ...)` (and the
 *     asciimath/mathml/omml/unicodemath equivalents), which call
 *     `parameter_one.to_latex(...)` DIRECTLY — but `Substack#parameter_one`
 *     is an ARRAY of rows (`to_latex`'s own body maps over
 *     `parameter_one&.compact&.map { |param| param.to_latex(...) }`), and
 *     `Array` has no `to_latex` method. Calling `to_display` on a real
 *     `Substack` raises `NoMethodError: undefined method 'to_latex' for an
 *     instance of Array` in the gem itself (measured on the pinned oracle,
 *     every format) — BEFORE `UnaryFunction`'s own math-zone body is even
 *     reached, at the header line that renders `parameter_one` as a field.
 *     Refusing here is PARITY with that crash, not a gap this slice chose to
 *     skip; a bare `string` entry in a node sequence (measured: the gem
 *     parses `"left(right)"` to `[Left, "", Right]`; calling `.class_name`
 *     on that bare string is `NoMethodError` in the gem too, so this is
 *     refused as unreachable rather than silently skipped).
 */

import {
  type MathNode,
  type NodeSequence,
  RenderError,
  type SymbolNode,
  TextNode,
  UnsupportedFeatureError,
} from "../core/index";
import { rubyClassName } from "../core/normalize";
import { toAsciimath } from "../formats/asciimath/index";
import { LATEX_LEFT_RIGHT_PARENTHESIS } from "../formats/latex/generated/transform-tables";
import { toLatex } from "../formats/latex/index";
import { toMathml } from "../formats/mathml/index";
import { SPACING_CONTEXT } from "../formats/mathml/render";
import type { MathmlRendered } from "../formats/mathml/render-shared";
import { createRenderContext as createOmmlContext } from "../formats/omml/render";
import { serializeRendered } from "../formats/omml/render-shared";
import { toOmml } from "../formats/omml/renderer";
import { toUnicodemath } from "../formats/unicodemath/index";
import {
  MATHML_FONT_STYLE_CARRIER_VARIANTS,
  MATHML_FONT_STYLE_VARIANTS,
} from "../generated/mathml/render-tables";
import { renderSymbol as renderSymbolOmml } from "../render/symbol/omml";
import { dumpNodes, XmlElement } from "../xml/index";

export type DisplayFormat = "asciimath" | "latex" | "mathml" | "omml" | "unicodemath";

const FEATURE = "toDisplay tree dump";

/** The gem's `class_name` (`core.rb:28-30`): the Ruby class basename, downcased. */
function classNameOf(node: MathNode): string {
  const full = rubyClassName(node);
  return full.slice(full.lastIndexOf(":") + 1).toLowerCase();
}

/** `ModelHelper::TEXT_CLASSES` plus `math_display_text_objects`'s extra names, unioned. */
const MERGE_CLASS_NAMES = new Set(["symbol", "number", "text", "plus", "minus", "circ", "equal"]);

/** Dedicated `UnaryFunction`-shaped kinds (each measured `class Foo < UnaryFunction`). */
const UNARY_CLASS_NAMES = new Set([
  "sqrt",
  "ceil",
  "floor",
  "hat",
  "dot",
  "ddot",
  "tilde",
  "ubrace",
  "ul",
  "obrace",
  "overleftrightarrow",
  "abs",
  "bar",
  "mpadded",
  "norm",
]);

function isSymbolKind(node: MathNode): node is SymbolNode {
  return node.kind === "symbol";
}

/** `Core#gsub_spacing`: replaces every "|_" run, not just the first. */
function gsubSpacing(spacing: string, last: boolean): string {
  return spacing.replaceAll("|_", last ? "  " : "| ");
}

/**
 * `field&.value` for a leaf being folded into a merge run: `Symbol`s render
 * through the format (mirroring `ModelHelper#symbol_to_text`'s asciimath/
 * latex/unicodemath/mathml branches — the OMML branch is the one documented
 * gap above), everything else (`Number`, `Text`) reads its raw string value.
 */
function mergeLeafText(node: MathNode, format: DisplayFormat): string {
  if (isSymbolKind(node)) {
    switch (format) {
      case "asciimath":
        return toAsciimath(node);
      case "latex":
        return toLatex(node);
      case "unicodemath":
        return toUnicodemath(node);
      case "mathml":
        return mathmlNodeText(node);
      case "omml":
        // `ModelHelper#symbol_to_text`'s OMML branch is
        // `symbol.to_omml_without_math_tag(true, options:)` — measured on the
        // oracle (`x+y=2` under `to_display(:omml)`) to return the bare
        // per-symbol VALUE STRING, the same `Symbols::Symbol#to_omml_without_
        // math_tag` (`symbols/symbol.rb:67-72`) every OTHER OMML path already
        // renders through, NOT an array of Ox elements — a prior version of
        // this file guessed the array shape and was wrong. `renderSymbolOmml`
        // is that same function; `Array#join`'s nil-to-"" coercion is
        // reproduced explicitly since a bare `null` return (the gem's
        // hard-coded `"&#x2062;"` invisible-times carve-out) would otherwise
        // print the literal string "null".
        return renderSymbolOmml(node) ?? "";
    }
  }
  const value = (node as unknown as Record<string, unknown>).value;
  if (typeof value === "string") return value;
  const parameterOne = (node as unknown as Record<string, unknown>).parameterOne;
  if (typeof parameterOne === "string") return parameterOne;
  throw new RenderError(
    `${classNameOf(node)}: no string value/parameterOne to fold into a text run`,
    format,
    node.kind,
  );
}

/** `symbol.to_mathml_without_math_tag(intent, options:).nodes.first` — the bare text inside the rendered element. */
function mathmlNodeText(node: MathNode): string {
  const rendered = SPACING_CONTEXT.render(node);
  return firstMathmlText(rendered);
}

function firstMathmlText(rendered: MathmlRendered): string {
  if (rendered === null) return "";
  if (typeof rendered === "string") return rendered;
  if (Array.isArray(rendered)) return rendered.length > 0 ? firstMathmlText(rendered[0]) : "";
  const element = rendered as XmlElement;
  const first = element.children[0];
  return typeof first === "string" ? first : "";
}

/** `Core#dump_mathml`/the root's own newline-collapsing gsub — one line, no indentation. */
function collapseXml(xml: string): string {
  return xml.replace(/\n\s*/g, "");
}

function dumpMathmlFragment(node: MathNode): string {
  return collapseXml(flattenMathml(SPACING_CONTEXT.render(node)));
}

function flattenMathml(rendered: MathmlRendered): string {
  if (rendered === null) return "";
  if (typeof rendered === "string") return rendered;
  if (Array.isArray(rendered)) return rendered.map(flattenMathml).join("");
  return dumpNodes(rendered as XmlElement);
}

function dumpOmmlFragment(node: MathNode, displayStyle: boolean): string {
  const context = createOmmlContext(displayStyle);
  return collapseXml(serializeRendered(context.render(node)));
}

/**
 * `Core#dump_omml(field, ...)` calls `field.omml_nodes(display_style,
 * options:)`, and `Core`'s own default IS `to_omml_without_math_tag`
 * (`core.rb:181-183`) — but `Symbols::Symbol` OVERRIDES `omml_nodes` to
 * `Array(t_tag(options:))` (`symbols/symbol.rb:156-163`), wrapping the bare
 * value in ONE `<m:t>...</m:t>`, a DIFFERENT method from
 * `to_omml_without_math_tag` that `dumpOmmlFragment` (this file's own
 * `render(node)` call) reproduces bare. This applies every time `dump_omml`
 * is called with a bare Symbol as ITS OWN argument — a standalone Symbol
 * leaf under the OMML zone, AND a Symbol FIELD inside any other structure
 * (`fields_to_print`'s `dump_omml(field, ...)` alike) — measured both ways
 * on the oracle: a standalone `alpha` prints `"<m:t>&#x3b1;</m:t>" text`,
 * and plain `x^2`'s "base" field prints `"<m:t>x</m:t>" base`, never the
 * bare `"x" base` `dumpOmmlFragment` alone would give a Symbol.
 */
function ommlSymbolWrapped(node: MathNode, displayStyle: boolean): string {
  const inner = dumpOmmlFragment(node, displayStyle);
  if (!isSymbolKind(node)) return inner;
  // `t_tag(options:)` builds a REAL `<m:t>` element and hands it to Ox, so
  // the bare literal here goes through the same escape-then-undo pipeline
  // `dumpNodes` gives every other OMML fragment (`serializer.ts`'s
  // `REPLACABLES`) — not a raw template-string wrap, which left an
  // unescaped literal `<`/`>`/`&` (measured: id `Less`'s stored literal is
  // the bare character `<`, unlike `Minus`'s already-entity-form
  // `&#x2212;`) sitting inside markup instead of being XML-escaped.
  const element = new XmlElement("m:t").append(inner);
  return dumpNodes(element, { indent: -1 });
}

/** One per-format adapter: root rendering, field rendering, and the two XML-only fragment dumps. */
interface FormatOps {
  /** `field&.to_<format>(options:)` (or, for mathml/omml, the full document at the ROOT only). */
  render(node: MathNode, displayStyle: boolean): string;
  /** The quoted value for a field line — `"#{...}"`, or the XML fragment collapsed to one line. */
  quoted(node: MathNode, displayStyle: boolean): string;
}

const FORMAT_OPS: Record<DisplayFormat, FormatOps> = {
  asciimath: {
    render: (node) => toAsciimath(node),
    quoted: (node) => `"${toAsciimath(node)}"`,
  },
  latex: {
    render: (node) => toLatex(node),
    quoted: (node) => `"${toLatex(node)}"`,
  },
  unicodemath: {
    render: (node) => toUnicodemath(node),
    quoted: (node) => `"${toUnicodemath(node)}"`,
  },
  mathml: {
    render: (node) => collapseXml(toMathml(node)),
    quoted: (node) => `"${dumpMathmlFragment(node)}"`,
  },
  omml: {
    render: (node, displayStyle) => collapseXml(toOmml(node, { displayStyle })),
    quoted: (node, displayStyle) => `"${ommlSymbolWrapped(node, displayStyle)}"`,
  },
};

/**
 * `Core::TEXT_CLASSES`-gated recursion guard: `ModelHelper.validate_math_zone`.
 *
 * Classifies without rendering, using the node kind plus `MERGE_CLASS_NAMES`
 * membership (via `classNameOf`): a `Formula`/`Mrow` recurses
 * when at least one child survives `filter_math_zone_values` as itself
 * (i.e. is not folded into a merge run), matching the gem's own
 * `find { |value| !(value.is_a?(Text) || value.is_a?(Symbol)) }` — checked
 * against the UNMERGED classification directly, so this never renders a
 * field (and so never throws on the OMML symbol-merge gap) just to answer
 * "should I recurse". `is_a?(Symbol)` is a Ruby class-hierarchy check, true
 * for every named Symbol subclass (`Rightarrow`, `Elementof`, …) even though
 * `filter_math_zone_values`'s OWN merge test is narrower — literal
 * `class_name` equality against `MERGE_CLASS_NAMES` — and does NOT fold
 * those subclasses into a run. `isSymbolKind` (node kind, not `classNameOf`)
 * is the survives-check's other half for exactly that reason: measured on
 * `lim_(x->0) ...`'s "x \to 0" subscript, whose `Rightarrow` symbol must
 * count as surviving-but-Symbol (no recursion) even though it never merges
 * with the `x`/`0` Text run.
 */
function validateMathZone(node: MathNode): boolean {
  if (node.kind === "formula" || node.kind === "mrow") {
    for (const item of sequenceOf(node)) {
      if (typeof item === "string") continue; // folds into nothing surviving; never itself "structure"
      if (!MERGE_CLASS_NAMES.has(classNameOf(item)) && !isSymbolKind(item)) return true;
    }
    return false;
  }
  return !(MERGE_CLASS_NAMES.has(classNameOf(node)) || isSymbolKind(node));
}

function sequenceOf(node: MathNode): NodeSequence {
  const value = (node as unknown as { readonly value?: NodeSequence | null }).value;
  return value ?? [];
}

/** `ModelHelper.filter_math_zone_values`: fold consecutive merge-eligible leaves into one synthetic `Text`. */
function filterAndMerge(sequence: NodeSequence, format: DisplayFormat): readonly MathNode[] {
  const result: MathNode[] = [];
  let run: string[] = [];
  const flushRun = () => {
    if (run.length > 0) {
      result.push(new TextNode({ parameterOne: run.join(" "), lang: format }));
      run = [];
    }
  };
  for (const item of sequence) {
    if (typeof item === "string") {
      throw new UnsupportedFeatureError(
        FEATURE,
        "a bare string in a node sequence (measured: the gem folds " +
          '"left(right)" to [Left, "", Right]) — calling .class_name on a ' +
          "bare string is NoMethodError in the gem too, so this is unreachable " +
          "the same way there, not silently skipped here",
      );
    }
    const name = classNameOf(item);
    if (MERGE_CLASS_NAMES.has(name)) {
      run.push(mergeLeafText(item, format));
      continue;
    }
    flushRun();
    result.push(item);
  }
  flushRun();
  return result;
}

/** `Formula#new_space`. */
function newSpace(spacing: string, indent: boolean, sequence: NodeSequence): string {
  const hasLeft = sequence.some((v) => typeof v !== "string" && classNameOf(v) === "left");
  const hasRight = sequence.some((v) => typeof v !== "string" && classNameOf(v) === "right");
  if (hasLeft && hasRight) return spacing;
  const wrapable = !spacing.endsWith("|_ "); // `left_right_wrapper` defaults true on every reachable node
  return indent && wrapable ? `${spacing}|_ ` : spacing;
}

/** BinaryFunction-shaped node kinds: two named fields plus a header label. */
interface BinaryMeta {
  readonly label: string;
  readonly first: string;
  readonly second: string;
}

/** `FUNCTION` constants across `frac.rb`, `power.rb`, `base.rb`, … — measured via native-Ruby symbol dispatch. */
const BINARY_META: Record<string, BinaryMeta> = {
  frac: { label: "fraction", first: "numerator", second: "denominator" },
  power: { label: "superscript", first: "base", second: "script" },
  base: { label: "subscript", first: "base", second: "script" },
  root: { label: "root", first: "radicand", second: "index" },
  over: { label: "over", first: "numerator", second: "denominator" },
  overset: { label: "overset", first: "base", second: "supscript" },
  underset: { label: "underscript", first: "underscript value", second: "base expression" },
  stackrel: { label: "stackrel", first: "above", second: "below" },
  lim: { label: "limit", first: "limit subscript", second: "limit supscript" },
  log: { label: "function apply", first: "subscript", second: "supscript" },
  mod: { label: "mod", first: "base", second: "argument" },
  semantics: { label: "semantics", first: "first argument", second: "second argument" },
  menclose: { label: "enclosure", first: "enclosure type", second: "expression" },
  color: { label: "color", first: "mathcolor", second: "text" },
};

interface TernaryMeta {
  readonly label: string;
  readonly first: string;
  readonly second: string;
  readonly third: string | undefined;
}

const TERNARY_META: Record<string, TernaryMeta> = {
  underover: { label: "UnderOver", first: "base", second: "Under", third: "Over" },
  powerbase: { label: "subsup", first: "base", second: "subscript", third: "supscript" },
  int: { label: "integral", first: "lower limit", second: "upper limit", third: "integrand" },
  oint: { label: "contour integral", first: "subscript", second: "supscript", third: undefined },
  prod: { label: "prod", first: "subscript", second: "supscript", third: undefined },
  sum: { label: "summation", first: "subscript", second: "supscript", third: "term" },
  limits: { label: "function apply", first: "base", second: "subscript", third: "supscript" },
  rule: {
    label: "rule",
    first: "first argument",
    second: "second argument",
    third: "third argument",
  },
  multiscript: { label: "multiscript", first: "base", second: "subscript", third: "supscript" },
};

/**
 * `Left#left_paren`/`Right#right_paren`: the stored delimiter, with the one
 * escaped-brace special case each substitutes its own bracket for
 * (`parameter_one == "\\{"` → `"{"`, `"\\}"` → `"}"`). Every one of the five
 * `to_*_math_zone` overrides on `Left`/`Right` calls this (or the raw
 * `parameter_one` — unicodemath's own carve-out below), never a no-op: a
 * prior version of this file treated both classes as no-ops here, dropping
 * `\left|x-y\right|`'s two delimiter lines entirely (measured against the
 * oracle, all five `toDisplay` formats).
 */
function leftRightParen(node: MathNode, isLeft: boolean): string {
  const raw = fieldNode(node, "parameterOne");
  const value = typeof raw === "string" ? raw : null;
  if (value === null) return "";
  if (isLeft) return value === "\\{" ? "{" : value;
  return value === "\\}" ? "}" : value;
}

/**
 * `UnaryFunction#latex_paren`: `Latex::Constants::LEFT_RIGHT_PARENTHESIS
 * .invert[parameter_one] || "."` — a HARD-CODED reverse lookup back through
 * the same LaTeX table `leftRightObjects` used to resolve the delimiter
 * forward (`transform.ts`), used ONLY by `to_asciimath_math_zone`/
 * `to_latex_math_zone` on `Left`/`Right` (inherited from `UnaryFunction`,
 * not the `left_paren`/`right_paren` override above, which mathml/omml use
 * instead). Two values collide on `"&#x2016;"` (`\Vert` and `\|`); `invert`
 * keeps the LAST key for a repeated value in Ruby Hash insertion order, so
 * this does the same left-to-right overwrite, and `\|` (listed after
 * `\Vert`) wins — measured against the oracle on `\left\|x\right\|`.
 */
const INVERTED_LATEX_LEFT_RIGHT_PARENTHESIS: ReadonlyMap<string, string> = (() => {
  const inverted = new Map<string, string>();
  for (const [key, value] of LATEX_LEFT_RIGHT_PARENTHESIS) inverted.set(value, key);
  return inverted;
})();

/** `UnaryFunction#latex_paren`'s own default when the resolved value has no reverse entry. */
function latexParenMathZone(node: MathNode): string {
  const raw = fieldNode(node, "parameterOne");
  const value = typeof raw === "string" ? raw : null;
  if (value === null) return ".";
  return INVERTED_LATEX_LEFT_RIGHT_PARENTHESIS.get(value) ?? ".";
}

/**
 * Each refused for its OWN measured reason (module doc above has the full
 * account): `nary` genuinely has no `to_*_math_zone` at all (parity, not a
 * gap); `substack` inherits `UnaryFunction`'s but crashes on it in the gem
 * itself (`parameter_one` is an Array, not a single node — NOT because it
 * has bespoke math-zone methods); `msgroup` has real bespoke `to_*_math_zone`
 * overrides but no reachable TS node kind constructs one from any supported
 * input (measured: no asciimath/latex/html/unicodemath grammar file
 * references `Msgroup` at all) — refused as unreachable, not unported;
 * `unitsml` needs external UnitsML conversion this slice does not carry.
 * `fontStyle` and `vec` are handled by their own dedicated functions below,
 * not this generic refusal list.
 */
const UNSUPPORTED_CLASS_NAMES = new Set(["nary", "substack", "msgroup", "unitsml"]);

function fieldNode(
  node: MathNode,
  field: "parameterOne" | "parameterTwo" | "parameterThree" | "value",
): unknown {
  return (node as unknown as Record<string, unknown>)[field];
}

function asNodeOrNull(value: unknown): MathNode | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value) && "kind" in (value as object)) {
    return value as MathNode;
  }
  throw new RenderError(
    "a function field held something other than a single node or nil — the gem raises " +
      "NoMethodError on this shape too",
    "toDisplay",
    "unknown",
  );
}

/**
 * `Core#ascii_fields_to_print`/`latex_fields_to_print`/… — print one labeled
 * field line, then recurse into it if `validate_math_zone` says the field
 * has structure of its own.
 */
function fieldsToPrint(
  field: unknown,
  ctx: {
    spacing: string;
    fieldName: string | undefined;
    additionalSpace: string;
    options: PrintOptions;
  },
  out: string[],
): void {
  const node = asNodeOrNull(field);
  if (node === null) return;
  const suffix = ctx.fieldName ? ` ${ctx.fieldName}` : "";
  const quoted = FORMAT_OPS[ctx.options.format].quoted(node, ctx.options.displayStyle);
  out.push(`${ctx.spacing}|_ ${quoted}${suffix}\n`);
  if (!validateMathZone(node)) return;
  const functionSpacing = `${ctx.spacing}${ctx.additionalSpace}`;
  out.push(
    mathZoneOf(
      node,
      functionSpacing,
      true,
      node.kind !== "formula" && node.kind !== "mrow",
      ctx.options,
    ),
  );
}

interface PrintOptions {
  readonly format: DisplayFormat;
  readonly displayStyle: boolean;
}

/** The recursive dispatcher — `field.to_<format>_math_zone(...)` for every reachable node kind. */
function mathZoneOf(
  node: MathNode,
  spacing: string,
  last: boolean,
  indent: boolean,
  options: PrintOptions,
): string {
  const name = classNameOf(node);
  const ops = FORMAT_OPS[options.format];

  if (node.kind === "formula" || node.kind === "mrow") {
    const sequence = sequenceOf(node);
    const children = filterAndMerge(sequence, options.format);
    const parts: string[] = [];
    children.forEach((child, index) => {
      const childSpacing = newSpace(spacing, indent, sequence);
      const isLast = index === children.length - 1;
      parts.push(mathZoneOf(child, childSpacing, isLast, indent, options));
    });
    return parts.join("");
  }

  if (name === "text") {
    // `Text#to_<format>_math_zone` (`function/text.rb:86-105`), measured per
    // format rather than assumed uniform:
    //
    //   - asciimath/unicodemath call their OWN normal renderer
    //     (`to_asciimath`/`to_unicodemath`), which already embeds its own
    //     quotes for asciimath (`Text#to_asciimath` returns `"\"...\""`).
    //   - LATEX IS THE ODD ONE OUT: `to_latex_math_zone` calls `to_asciimath`,
    //     NOT `to_latex` (`text.rb:90-92`) — measured: a Number `2` under the
    //     LaTeX zone prints `"2" text`, never `\text{2} text`; a Table cell
    //     `"a"` under LaTeX prints `"a" text` the same way. Checked against
    //     every OTHER format's own `to_<format>_math_zone` on the same
    //     oracle: none of asciimath/mathml/omml/unicodemath substitutes a
    //     different renderer the way latex does — latex is the only format
    //     whose math-zone text differs from its own normal text rendering.
    //   - mathml/omml call `dump_mathml`/`dump_omml` — the FRAGMENT dump
    //     (`<mtext>...</mtext>` / `<m:t>...</m:t>`), not the full-document
    //     renderer (`to_mathml`/`to_omml`), which requires a `Formula`-shaped
    //     root and raises on a bare leaf. This is the same fragment dump the
    //     `Symbol` branch below already uses.
    if (options.format === "mathml") {
      return `${spacing}"${dumpMathmlFragment(node)}" text\n`;
    }
    if (options.format === "omml") {
      return `${spacing}"${dumpOmmlFragment(node, options.displayStyle)}" text\n`;
    }
    if (options.format === "latex") {
      return `${spacing}${toAsciimath(node)} text\n`;
    }
    return `${spacing}${ops.render(node, options.displayStyle)} text\n`;
  }

  if (isSymbolKind(node)) {
    // `Symbol#to_<format>_math_zone`: always explicitly quoted, every format.
    // mathml/omml use the FRAGMENT dump, same as the `Text` branch above.
    // OMML goes through `ommlSymbolWrapped` — the SAME `<m:t>` wrap
    // `dump_omml`'s `Symbol#omml_nodes` override applies to every bare
    // Symbol it is handed, standalone leaf or field alike (see that
    // function's own doc). Measured on the oracle: a standalone Symbol
    // (`alpha`) under the OMML zone prints `"<m:t>&#x3b1;</m:t>" text` — NOT
    // `"&#x3b1;" text` (missing the tag) and NOT `<m:r><m:t>...</m:t></m:r>`
    // (that `<m:r>` wrapper belongs to `insert_t_tag`, a different method
    // this path never calls).
    const rendered =
      options.format === "mathml"
        ? dumpMathmlFragment(node)
        : options.format === "omml"
          ? ommlSymbolWrapped(node, options.displayStyle)
          : ops.render(node, options.displayStyle);
    return `${spacing}"${rendered}" text\n`;
  }

  if (name === "left" || name === "right") {
    const isLeft = name === "left";
    const label = isLeft ? "left" : "right";
    let quoted: string;
    if (options.format === "unicodemath") {
      // `to_unicodemath_math_zone` is the one format that skips both
      // `left_paren`/`right_paren` AND `latex_paren`, printing the raw
      // `parameter_one` untransformed.
      const raw = fieldNode(node, "parameterOne");
      quoted = typeof raw === "string" ? raw : "";
    } else if (options.format === "mathml") {
      quoted = dumpNodes(new XmlElement("mo").append(leftRightParen(node, isLeft)), {
        indent: -1,
      });
    } else if (options.format === "omml") {
      quoted = dumpNodes(new XmlElement("m:t").append(leftRightParen(node, isLeft)), {
        indent: -1,
      });
    } else {
      // asciimath/latex both go through `UnaryFunction#latex_paren`'s
      // reverse lookup, NOT `Left#left_paren`/`Right#right_paren` — see
      // `latexParenMathZone`'s own doc for why the two diverge (measured:
      // `\left\lfloor x\right\rfloor` prints `"\lfloor" left`, not the
      // resolved `"&#x230a;"` `left_paren` would give).
      quoted = latexParenMathZone(node);
    }
    return `${spacing}"${quoted}" ${label}\n`;
  }

  if (name === "fenced") {
    const sequence = [
      ...(Array.isArray(fieldNode(node, "parameterTwo"))
        ? (fieldNode(node, "parameterTwo") as NodeSequence)
        : []),
    ];
    const children = filterAndMerge(sequence, options.format);
    if (options.format === "omml") {
      return children.map((child) => mathZoneOf(child, spacing, last, !indent, options)).join("");
    }
    const parts: string[] = [];
    children.forEach((child, index) => {
      const isLast = index === children.length - 1 && last;
      parts.push(mathZoneOf(child, spacing, isLast, indent, options));
    });
    return parts.join("");
  }

  if (node.kind === "table" || name === "tr" || name === "td") {
    // `Table#to_*_math_zone` (`table.rb:115-155`) is defined ONCE on the base
    // class and never overridden by any subclass (`Matrix`, `Pmatrix`,
    // `Bmatrix`, `Vmatrix`, …, measured: no `math_zone` method anywhere
    // under `math/function/table/`), so the header is the literal string
    // `"table"` regardless of which subclass built the node — gated on
    // `node.kind`, not `classNameOf`, for the same reason `FontStyle` below
    // is: a named subclass classifies as its OWN lowercase name (`matrix`),
    // never as `"table"`.
    const literal = node.kind === "table" ? "table" : name;
    const wrapped = fieldNode(node, node.kind === "table" ? "value" : "parameterOne");
    const innerSequence: NodeSequence = Array.isArray(wrapped) ? (wrapped as NodeSequence) : [];
    const newSpacing = gsubSpacing(spacing, last);
    const header = `${spacing}"${literal}" function apply\n`;
    const body = mathZoneOfFormulaLike(innerSequence, newSpacing, last, indent, options);
    return header + body;
  }

  // `FontStyle` (`font_style.rb:165-254`): a bespoke "font family" header,
  // gated on `node.kind` rather than `classNameOf` because a NAMED subclass
  // (`bb x` -> `Bold`) classifies as its OWN lowercase name ("bold"), while
  // only the bare carrier classifies as "fontstyle" — both shapes are the
  // same math-zone method family, so both go through one dispatcher.
  if (node.kind === "fontStyle") {
    return renderFontStyle(node, spacing, last, options);
  }

  // `Vec` (`vec.rb:47-95`): bespoke `supscript` field, and mathml/omml swap
  // the "function apply"/"function name" header for an "overset" header plus
  // an explicit "base" (arrow) line before the recursive field.
  if (name === "vec") {
    return renderVec(node, spacing, last, options);
  }

  // `Color`'s own OMML override (`color.rb:53-63`): a "color" header (not
  // "function apply") and only `parameter_two` ("text") printed — every
  // OTHER format keeps `Color`'s generic `BINARY_META` entry below.
  if (name === "color" && options.format === "omml") {
    return renderColorOmml(node, spacing, last, options);
  }

  if (UNSUPPORTED_CLASS_NAMES.has(name)) {
    throw new UnsupportedFeatureError(
      FEATURE,
      `"${name}" under ${options.format} has no ported to_${options.format}_math_zone in this ` +
        "slice — see the module doc for why each of these is scoped out",
    );
  }

  const binaryMeta = BINARY_META[name];
  if (binaryMeta !== undefined) {
    return renderBinary(node, binaryMeta, spacing, last, options);
  }

  const ternaryMeta = TERNARY_META[name];
  if (ternaryMeta !== undefined) {
    return renderTernary(node, ternaryMeta, spacing, last, options);
  }

  // UnaryFunction-shaped: a fixed "function apply" / "function name" header
  // plus one "argument" field (`unary_function.rb:94-155`) — gated
  // explicitly (kind `unaryFunction`, or a dedicated kind measured
  // `< UnaryFunction`) rather than treated as the fallback, so an alias this
  // slice has not mapped throws instead of getting the wrong header shape.
  if (node.kind === "unaryFunction" || UNARY_CLASS_NAMES.has(name)) {
    return renderUnary(node, name, spacing, last, options);
  }

  throw new UnsupportedFeatureError(
    FEATURE,
    `"${name}" (node kind "${node.kind}") has no ported to_${options.format}_math_zone mapping ` +
      "in this slice",
  );
}

/** A synthetic `Formula`'s own `to_<format>_math_zone`, for `Table`/`Tr`/`Td`'s wrap-and-recurse. */
function mathZoneOfFormulaLike(
  sequence: NodeSequence,
  spacing: string,
  _last: boolean,
  indent: boolean,
  options: PrintOptions,
): string {
  const children = filterAndMerge(sequence, options.format);
  const parts: string[] = [];
  children.forEach((child, index) => {
    const childSpacing = newSpace(spacing, indent, sequence);
    const isLast = index === children.length - 1;
    parts.push(mathZoneOf(child, childSpacing, isLast, indent, options));
  });
  return parts.join("");
}

function renderBinary(
  node: MathNode,
  meta: BinaryMeta,
  spacing: string,
  last: boolean,
  options: PrintOptions,
): string {
  const newSpacing = gsubSpacing(spacing, last);
  const ops = FORMAT_OPS[options.format];
  const headerValue =
    options.format === "mathml"
      ? dumpMathmlFragment(node)
      : options.format === "omml"
        ? dumpOmmlFragment(node, options.displayStyle)
        : ops.render(node, options.displayStyle);
  const out: string[] = [`${spacing}"${headerValue}" ${meta.label}\n`];
  const secondAdditional =
    options.format === "mathml" || options.format === "omml" ? "  |_ " : "   |_ ";
  fieldsToPrint(
    fieldNode(node, "parameterOne"),
    { spacing: newSpacing, fieldName: meta.first, additionalSpace: "|  |_ ", options },
    out,
  );
  fieldsToPrint(
    fieldNode(node, "parameterTwo"),
    { spacing: newSpacing, fieldName: meta.second, additionalSpace: secondAdditional, options },
    out,
  );
  return out.join("");
}

function renderTernary(
  node: MathNode,
  meta: TernaryMeta,
  spacing: string,
  last: boolean,
  options: PrintOptions,
): string {
  const newSpacing = gsubSpacing(spacing, last);
  const ops = FORMAT_OPS[options.format];
  const headerValue =
    options.format === "mathml"
      ? dumpMathmlFragment(node)
      : options.format === "omml"
        ? dumpOmmlFragment(node, options.displayStyle)
        : ops.render(node, options.displayStyle);
  const out: string[] = [`${spacing}"${headerValue}" ${meta.label}\n`];
  fieldsToPrint(
    fieldNode(node, "parameterOne"),
    { spacing: newSpacing, fieldName: meta.first, additionalSpace: "|  |_ ", options },
    out,
  );
  fieldsToPrint(
    fieldNode(node, "parameterTwo"),
    { spacing: newSpacing, fieldName: meta.second, additionalSpace: "  |_ ", options },
    out,
  );
  fieldsToPrint(
    fieldNode(node, "parameterThree"),
    { spacing: newSpacing, fieldName: meta.third, additionalSpace: "   |_ ", options },
    out,
  );
  return out.join("");
}

function renderUnary(
  node: MathNode,
  className: string,
  spacing: string,
  last: boolean,
  options: PrintOptions,
): string {
  const newSpacing = gsubSpacing(spacing, last);
  const ops = FORMAT_OPS[options.format];
  const headerValue =
    options.format === "mathml"
      ? dumpMathmlFragment(node)
      : options.format === "omml"
        ? dumpOmmlFragment(node, options.displayStyle)
        : ops.render(node, options.displayStyle);
  const out: string[] = [
    `${spacing}"${headerValue}" function apply\n`,
    `${newSpacing}|_ "${className}" function name\n`,
  ];
  fieldsToPrint(
    fieldNode(node, "parameterOne"),
    { spacing: newSpacing, fieldName: "argument", additionalSpace: "   |_ ", options },
    out,
  );
  return out.join("");
}

/**
 * `FontStyle#font_family` (`font_style.rb:216-240`) — the mathml/omml
 * branch only; asciimath/latex print `parameter_two` bare (handled directly
 * by the caller). Measured identical between mathml and omml for every one
 * of the 14 named subclasses (`MATHML_FONT_STYLE_VARIANTS`, keyed by the
 * gem's own canonical family name, e.g. `Bold` -> `"bold"` — NOT the alias
 * tag that constructed it: `bb x`, `bold x`, and `\mathbf{x}` all print
 * "bold" font family under mathml/omml, but "bb"/"bold"/"mathbf"
 * respectively under asciimath/latex).
 *
 * The bare carrier (`node.name` unset — reachable from LaTeX's
 * `\mathbold`/`\mathsfit`/`\mathsfbf`/`\mathsfbfit`/`\mathds`/
 * `\displaystyle`, grammar-legal `:fonts` keywords `Utility::FONT_STYLES`
 * does not map) diverges BY FORMAT, measured on `\mathbold{x}`: mathml falls
 * back to the raw keyword itself ("mathbold" font family, via
 * `MATHML_FONT_STYLE_CARRIER_VARIANTS`' own keyword-or-passthrough
 * fallback); omml's `supported_fonts` never falls back to the keyword at
 * all — `font_classes(parameter_to_class)` is empty for an unresolved
 * carrier, so `Omml::SUPPORTED_FONTS.values.find` returns nil and Ruby
 * string interpolation prints "" (measured: the same input -> "" font
 * family under omml — a THIRD shape, not mathml's).
 */
function fontStyleFamily(node: MathNode, omml: boolean): string {
  const name = (node as unknown as { readonly name?: string }).name;
  if (name !== undefined) {
    const mapped = MATHML_FONT_STYLE_VARIANTS.get(name);
    if (mapped !== undefined) return mapped;
  }
  if (omml) return "";
  const keyword = fieldNode(node, "parameterTwo");
  if (typeof keyword !== "string") return "";
  return MATHML_FONT_STYLE_CARRIER_VARIANTS.get(keyword) ?? keyword;
}

/**
 * `FontStyle#to_<format>_math_zone` (`font_style.rb:165-254`): the generic
 * UnaryFunction "function apply" header, but with an extra "font family"
 * line before the "argument" field — measured on the oracle for all 8
 * default-constructor subclasses (`Bold`, `DoubleStruck`, `Fraktur`,
 * `Italic`, `Monospace`, `Normal`, `SansSerif`, `Script`) plus the bare
 * carrier (`\mathbold{x}`), every format.
 *
 * unicodemath is refused outright: `to_unicodemath_math_zone` (:242-254)
 * calls `dump_unicodemath(self, options:)`, and `dump_unicodemath` is not
 * defined ANYWHERE in the gem (`grep -rn 'def dump_unicodemath'` — zero
 * hits; only `dump_mathml`/`dump_omml` exist, `core.rb:163-169`). Measured
 * on the oracle: EVERY FontStyle subclass raises `NoMethodError` under
 * `to_display(:unicodemath)`, so refusing here is parity with a gem crash,
 * not a scope gap — the module doc's earlier claim that FontStyle overrides
 * "the generic Unary/BinaryFunction OMML header" undersold this: OMML is
 * fully portable; unicodemath is the one that cannot run at all.
 */
function renderFontStyle(
  node: MathNode,
  spacing: string,
  last: boolean,
  options: PrintOptions,
): string {
  if (options.format === "unicodemath") {
    throw new UnsupportedFeatureError(
      FEATURE,
      "a FontStyle under unicodemath: font_style.rb's own " +
        "to_unicodemath_math_zone calls dump_unicodemath, a method the gem " +
        "never defines anywhere — every FontStyle subclass raises " +
        "NoMethodError under to_display(:unicodemath) in the oracle too " +
        "(measured), so this is refused as parity with that crash, not a gap",
    );
  }
  const newSpacing = gsubSpacing(spacing, last);
  const ops = FORMAT_OPS[options.format];
  const headerValue =
    options.format === "mathml"
      ? dumpMathmlFragment(node)
      : options.format === "omml"
        ? dumpOmmlFragment(node, options.displayStyle)
        : ops.render(node, options.displayStyle);
  const family =
    options.format === "mathml" || options.format === "omml"
      ? fontStyleFamily(node, options.format === "omml")
      : String(fieldNode(node, "parameterTwo"));
  const out: string[] = [
    `${spacing}"${headerValue}" function apply\n`,
    `${newSpacing}|_ "${family}" font family\n`,
  ];
  fieldsToPrint(
    fieldNode(node, "parameterOne"),
    { spacing: newSpacing, fieldName: "argument", additionalSpace: "|  |_ ", options },
    out,
  );
  return out.join("");
}

/**
 * `Vec#to_<format>_math_zone` (`vec.rb:47-95`): asciimath/latex keep the
 * generic "function apply"/"function name" header but rename the field
 * "supscript" (not "argument"); mathml/omml replace the header with
 * "overset" and print an explicit "base" line (the arrow glyph, `<mo>`/
 * `<m:t>`) BEFORE the recursive "supscript" field — `vec.rb` never calls
 * `fields_to_print` for that base line, so it is written directly, not
 * recursed into. unicodemath overrides neither `to_unicodemath_math_zone`
 * nor `to_unicodemath`'s math-zone family at all — it inherits
 * `UnaryFunction`'s generic shape unchanged (field name "argument"),
 * measured on `vec(v)` under `to_display(:unicodemath)`.
 */
function renderVec(node: MathNode, spacing: string, last: boolean, options: PrintOptions): string {
  const newSpacing = gsubSpacing(spacing, last);
  const ops = FORMAT_OPS[options.format];
  if (options.format === "mathml" || options.format === "omml") {
    const headerValue =
      options.format === "mathml"
        ? dumpMathmlFragment(node)
        : dumpOmmlFragment(node, options.displayStyle);
    const baseLine =
      options.format === "mathml"
        ? `${newSpacing}|_ "<mo>&#x2192;</mo>" base\n`
        : `${newSpacing}|_ "<m:t>&#x2192;</m:t>" base\n`;
    const out: string[] = [`${spacing}"${headerValue}" overset\n`, baseLine];
    fieldsToPrint(
      fieldNode(node, "parameterOne"),
      { spacing: newSpacing, fieldName: "supscript", additionalSpace: "|  |_ ", options },
      out,
    );
    return out.join("");
  }
  // unicodemath never overrides `to_unicodemath_math_zone` at all — it
  // inherits `UnaryFunction`'s generic shape unchanged, additional_space
  // included ("   |_ ", not "|  |_ " — measured on `vec(x/y)`, where the
  // nested fraction's indentation only tells the two apart).
  const isUnicodemath = options.format === "unicodemath";
  const fieldName = isUnicodemath ? "argument" : "supscript";
  const additionalSpace = isUnicodemath ? "   |_ " : "|  |_ ";
  const out: string[] = [
    `${spacing}"${ops.render(node, options.displayStyle)}" function apply\n`,
    `${newSpacing}|_ "vec" function name\n`,
  ];
  fieldsToPrint(
    fieldNode(node, "parameterOne"),
    { spacing: newSpacing, fieldName, additionalSpace, options },
    out,
  );
  return out.join("");
}

/**
 * `Color#to_omml_math_zone` (`color.rb:53-63`): its OWN header label
 * ("color", not "function apply") and only `parameter_two` printed as
 * "text" — `parameter_one` (`mathcolor`) is never a field line here, unlike
 * `Color`'s generic `BINARY_META` entry every other format uses.
 */
function renderColorOmml(
  node: MathNode,
  spacing: string,
  last: boolean,
  options: PrintOptions,
): string {
  const newSpacing = gsubSpacing(spacing, last);
  const headerValue = dumpOmmlFragment(node, options.displayStyle);
  const out: string[] = [`${spacing}"${headerValue}" color\n`];
  fieldsToPrint(
    fieldNode(node, "parameterTwo"),
    { spacing: newSpacing, fieldName: "text", additionalSpace: "|  |_ ", options },
    out,
  );
  return out.join("");
}

/**
 * `Formula#to_display(type)`'s dispatch shape, replicated exactly: a
 * lowercase valid name reaches the tree dump (`buildTreeDump`); an
 * uppercase/mixed-case valid name is a "valid but no `case` arm matches"
 * placeholder; an invalid name throws before either.
 */
export function buildTreeDump(node: MathNode, format: DisplayFormat): string {
  const displayStyle =
    (node as unknown as { readonly displaystyle?: boolean }).displaystyle ?? true;
  const options: PrintOptions = { format, displayStyle };
  const ops = FORMAT_OPS[format];
  // The root line always renders the FULL top-level value (`to_<format>`,
  // with its `<math>`/`<m:oMathPara>` wrapper for mathml/omml) — `ops.render`,
  // never `ops.quoted`, which is the FRAGMENT shape field printing uses.
  const header = `  |_ "${ops.render(node, displayStyle)}"\n`;
  const body = mathZoneOf(node, "     ", false, true, options);
  return `|_ Math zone\n${header}${body}`;
}
