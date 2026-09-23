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
 *     and cannot run on a bare leaf; `Symbol#to_omml_math_zone` goes through
 *     `Symbol#omml_nodes`/`#t_tag` (`symbols/symbol.rb:156-163`), which wraps
 *     the bare per-symbol value in ONE `<m:t>...</m:t>` — measured, a
 *     standalone `alpha` prints `"<m:t>&#x3b1;</m:t>" text`, not the bare
 *     `"&#x3b1;" text` `to_omml_without_math_tag` alone would give, and not
 *     `<m:r><m:t>...</m:t></m:r>` (that `<m:r>` belongs to `insert_t_tag`, a
 *     different method this path never calls); every `BinaryFunction`/
 *     `TernaryFunction` subclass reachable from asciimath/latex/html/unicode
 *     input that this
 *     compat class supports, keyed by the gem's own `FUNCTION` constants
 *     (`frac`, `power`, `base`, `root`, `over`, `overset`, `underset`,
 *     `stackrel`, `lim`, `log`, `mod`, `semantics`, `menclose`, `color`,
 *     `underover`, `powerBase`, `int`, `oint`, `prod`, `sum`, `limits`,
 *     `rule`, `multiscript`); every `UnaryFunction` subclass (generic
 *     "argument" field: `sqrt`, `ceil`, `floor`, `hat`, `dot`, `ddot`,
 *     `tilde`, `ubrace`, `ul`, `obrace`, `overleftrightarrow`, `abs`, `bar`,
 *     `mpadded`, `norm`, and the bare `unaryFunction`/`binaryFunction`/
 *     `ternaryFunction` alias carriers); `Fenced` (transparent pass-through
 *     of its filtered children); `Table`/`Tr`/`Td` (wrap-into-`Formula` and
 *     recurse); `Left`/`Right` (no-op, matching the gem's empty override).
 *
 *   - NOT ported, and refused with `UnsupportedFeatureError` naming the gap
 *     rather than guessed: `Nary` (the gem's own `Nary` class defines NO
 *     `to_*_math_zone` override and inherits none — `Math::Function::Nary <
 *     Core` — so calling it for real raises `NoMethodError` in the gem
 *     itself; refusing here is PARITY, not a gap); `FontStyle`/`Vec`/`Color`
 *     under OMML specifically (each overrides the generic
 *     `BinaryFunction`/`UnaryFunction` shape with a bespoke, format-specific
 *     header this slice does not carry); `Msgroup`/`Unitsml` (each has its
 *     own bespoke `to_*_math_zone`, unmeasured here); `Substack` — NOT for
 *     the reason a prior version of this doc claimed. `substack.rb:6-40`
 *     defines only ordinary format serializers (`to_asciimath`, `to_latex`,
 *     …); it has NO `to_*_math_zone` overrides at all and inherits
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
 *     skip; a raw `Symbol`/`Number`/`Text` sibling RUN (more than one
 *     merge-eligible leaf folded together) under the OMML zone specifically
 *     (the gem's `ModelHelper#symbol_to_text` OMML branch — measured, for
 *     the reachable merge-eligible symbol classes, `Plus`/`Minus`/`Circ`/
 *     `Equal`/a bare generic `Symbol` — actually returns a PLAIN STRING
 *     (`Symbols::Symbol#to_omml_without_math_tag`'s `value`, not an `Ox`
 *     element array as a prior version of this doc claimed), joined with the
 *     other run members and re-encoded through `Text#first_value`'s
 *     omml-specific entity/`&#xa0;` substitution before being wrapped in one
 *     `<m:t>`; reproducing that substitution faithfully was out of scope for
 *     this pass and is left as a named follow-up rather than guessed at
 *     here); every OTHER OMML shape — the root line, standalone Number/
 *     Symbol/Text leaves (see above), and recursion through
 *     `Formula`/`Fenced`/the function families above — IS ported and
 *     measured); a bare `string` entry in a node sequence (measured: the gem
 *     parses `"left(right)"` to `[Left, "", Right]`; calling `.class_name`
 *     on that bare string is `NoMethodError` in the gem too, so this is
 *     refused as unreachable rather than silently skipped).
 */

import {
  type MathNode,
  type NodeSequence,
  RenderError,
  TextNode,
  UnsupportedFeatureError,
} from "../core/index";
import { rubyClassName } from "../core/normalize";
import { toAsciimath } from "../formats/asciimath/index";
import { toLatex } from "../formats/latex/index";
import { toMathml } from "../formats/mathml/index";
import { SPACING_CONTEXT } from "../formats/mathml/render";
import type { MathmlRendered } from "../formats/mathml/render-shared";
import { createRenderContext as createOmmlContext } from "../formats/omml/render";
import { serializeRendered } from "../formats/omml/render-shared";
import { toOmml } from "../formats/omml/renderer";
import { toUnicodemath } from "../formats/unicodemath/index";
import { dumpNodes, type XmlElement } from "../xml/index";

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

function isSymbolKind(node: MathNode): boolean {
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
        throw new UnsupportedFeatureError(
          FEATURE,
          "a Symbol folded into a text run under the OMML zone: the gem's " +
            "ModelHelper#symbol_to_text OMML branch returns an array of Ox " +
            "elements that Ruby's Array#join flattens through Ox::Element#to_s, " +
            "a shape this port refuses to guess rather than fabricate",
        );
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
    quoted: (node, displayStyle) => `"${dumpOmmlFragment(node, displayStyle)}"`,
  },
};

/**
 * `Core::TEXT_CLASSES`-gated recursion guard: `ModelHelper.validate_math_zone`.
 *
 * Classifies by node KIND only (never renders): a `Formula`/`Mrow` recurses
 * when at least one child survives `filter_math_zone_values` as itself
 * (i.e. is not folded into a merge run), matching the gem's own
 * `find { |value| !(value.is_a?(Text) || value.is_a?(Symbol)) }` — checked
 * against the UNMERGED classification directly, so this never renders a
 * field (and so never throws on the OMML symbol-merge gap) just to answer
 * "should I recurse".
 */
function validateMathZone(node: MathNode): boolean {
  if (node.kind === "formula" || node.kind === "mrow") {
    for (const item of sequenceOf(node)) {
      if (typeof item === "string") continue; // folds into nothing surviving; never itself "structure"
      if (!MERGE_CLASS_NAMES.has(classNameOf(item))) return true;
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

/** Kinds whose Ruby ancestor is `Math::Function::Table` and wraps `value` into a synthetic `Formula`. */
const TABLE_LIKE_LABEL: Record<string, string> = {
  table: "table",
};

/** `Left`/`Right`: both override every `to_*_math_zone` with a no-op. */
const NO_OP_CLASS_NAMES = new Set(["left", "right"]);

/**
 * Each refused for its OWN measured reason (module doc above has the full
 * account): `nary` genuinely has no `to_*_math_zone` at all (parity, not a
 * gap); `substack` inherits `UnaryFunction`'s but crashes on it in the gem
 * itself (`parameter_one` is an Array, not a single node — NOT because it
 * has bespoke math-zone methods); `msgroup`/`unitsml` each have real bespoke
 * `to_*_math_zone` overrides, unmeasured here; `fontstyle`/`vec` override the
 * generic Unary/BinaryFunction OMML header.
 */
const UNSUPPORTED_CLASS_NAMES = new Set([
  "nary",
  "substack",
  "msgroup",
  "unitsml",
  "fontstyle",
  "vec",
]);

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
    // OMML NEEDS AN EXTRA WRAP: `dump_omml` here calls the gem's
    // `Symbol#omml_nodes`/`#t_tag` (`symbols/symbol.rb:156-163`), which always
    // wraps the bare per-symbol value in ONE `<m:t>...</m:t>` — a DIFFERENT
    // path from `to_omml_without_math_tag` (the bare value alone, used when a
    // symbol is a FIELD inside a larger structure and its parent supplies the
    // wrapper). `dumpOmmlFragment` reproduces the bare path, so the `<m:t>`
    // has to be added here. Measured on the oracle: a standalone Symbol
    // (`alpha`) under the OMML zone prints `"<m:t>&#x3b1;</m:t>" text` — NOT
    // `"&#x3b1;" text` (missing the tag) and NOT `<m:r><m:t>...</m:t></m:r>`
    // (that `<m:r>` wrapper belongs to `insert_t_tag`, a different method
    // this path never calls).
    const rendered =
      options.format === "mathml"
        ? dumpMathmlFragment(node)
        : options.format === "omml"
          ? `<m:t>${dumpOmmlFragment(node, options.displayStyle)}</m:t>`
          : ops.render(node, options.displayStyle);
    return `${spacing}"${rendered}" text\n`;
  }

  if (NO_OP_CLASS_NAMES.has(name)) return "";

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

  if (name in TABLE_LIKE_LABEL || name === "tr" || name === "td") {
    const literal = name in TABLE_LIKE_LABEL ? TABLE_LIKE_LABEL[name] : name;
    const wrapped = fieldNode(node, name === "table" ? "value" : "parameterOne");
    const innerSequence: NodeSequence = Array.isArray(wrapped) ? (wrapped as NodeSequence) : [];
    const newSpacing = gsubSpacing(spacing, last);
    const header = `${spacing}"${literal}" function apply\n`;
    const body = mathZoneOfFormulaLike(innerSequence, newSpacing, last, indent, options);
    return header + body;
  }

  if (UNSUPPORTED_CLASS_NAMES.has(name) || (name === "color" && options.format === "omml")) {
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
