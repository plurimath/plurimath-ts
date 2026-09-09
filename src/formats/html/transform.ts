/** biome-ignore-all lint/style/useNamingConvention: pattern keys are Parslet
 * tree keys — Ruby's snake_case is the schema, exactly as in the generated
 * tables, and renaming one would stop its rule from ever matching. */
/**
 * The HTML transform — ported rule for rule from the gem
 * (`lib/plurimath/html/transform.rb`, plurimath 0.11.6 at `00c52783`).
 *
 * `latex/transform.ts` and `unicodemath/transform.ts` are the templates in
 * every respect: one `rule(...)` per Ruby `rule(...)`, in the same source
 * order, each carrying the Ruby line it came from; drafts stand in for Ruby
 * nodes until `finalize`; the memoised `htmlTransform()` accessor sits beside
 * an unmemoised `buildHtmlTransform()` that hands the coverage suite a zeroed
 * set of firing counters.
 *
 * ## The slice is the WHOLE transform, and that is a measurement
 *
 * `html/transform.rb` registers 75 rules; `include BaseNumberPrefix::Transform`
 * at `:6` adds three more, for 78 — counted off the oracle
 * (`Plurimath::Html::Transform.rules.length`), not off a grep. All 78 are
 * ported. UnicodeMath's port had to slice at 78 of its 519 because no corpus
 * input reached the rest; here the checkable corpus reaches everything.
 * Measured with every registered block wrapped in a counter on the oracle, over
 * the 164 inputs `scripts/generate-html-model-fixtures.rb` emits:
 *
 *   - the 95 distinct HTML strings the pinned corpus round-trips through
 *     `to_html` fire **39**;
 *   - the generator's `RULE_COVERAGE` inputs take that to **78**.
 *
 * So there is nothing to defer and nothing stubbed. A node whose key set no
 * rule matches survives the transform as a plain hash, and `finalize` throws on
 * it unless the GEM leaves the same signature unmatched.
 *
 * ## Order is behaviour — and here it shadows nothing
 *
 * `Parslet::Transform.rule` **unshifts** (`parslet-2.0.0/lib/parslet/transform.rb:128`),
 * so a later definition wins a tie, and the three mixin rules — registered
 * FIRST, at `:6` — are tried LAST. Whether that costs anything was measured
 * rather than assumed: every one of the 78 patterns was reduced to its
 * signature (each key with the matcher kind bound to it) and **no two are
 * equal**. Parslet demands an exact key-set match
 * (`parslet/pattern.rb:97`, `exp.size == tree.size`) and `simple`/`sequence`
 * are disjoint on shape, so the signature is a complete discriminator: no rule
 * in this file is dead, and the eighteen key sets carried by two or more rules
 * are live siblings distinguished by shape.
 *
 * ## No `Parslet::Slice` can reach here
 *
 * `Html::Parser#parse` (`html/parser.rb:17-18`) runs the tree through
 * `JSON.parse(nodes.to_json, symbolize_names: true)` before the transform. That
 * round trip turns every slice into a plain String — measured: `x<sub>1</sub>`
 * gives `{sub_sup: {text: "x"@0}, ...}` from Parslet and `{sub_sup: {text:
 * "x"}}` after it. So the leaf vocabulary here is String, and `rubyToS` refuses
 * anything else rather than carrying a Slice branch that cannot run. `parser.ts`
 * performs the same flattening.
 *
 * ## Mutation is behaviour, so nodes are drafts until the entry point returns
 *
 * `TransformUtility.sub_sup_value` (`html/transform_utility.rb:24-27`) ASSIGNS
 * `parameter_one`/`parameter_two` on a node the transform already built,
 * whenever `Utility.sub_sup_method?` says the base is one of the four
 * sub/sup-capable classes. Four ported rule families reach it. Core nodes are
 * publicly immutable (ARCHITECTURE.md §5), so the transform works on
 * `HtmlDraft` objects and `finalize` converts the finished tree into real
 * `core` nodes in one pass at the end. Five rules also mutate a bound ARRAY
 * (`:63`, `:68`, `:81`, `:97` and the `Array#insert`/`<<` they use); those are
 * transcribed as in-place operations for the same reason.
 *
 * ## Two model behaviours that are provably absent here
 *
 * - **`ModelHelper.validate_left_right`** forces `left_right_wrapper` back to
 *   true on a formula field whose first value is a `Math::Function::Left`. No
 *   `Left` can enter an HTML tree: `left` is not among the 30 names
 *   `get_class` can receive (`HTML_TRANSFORM_GET_CLASS`), and
 *   `Utility.symbols_class` returns `Math::Symbols::*`, never a
 *   `Math::Function::*`. The same fact is why `newFormula` below has no `Left`
 *   branch where `latex/transform.ts` has one.
 * - **`Core#class_name` overrides.** Only `Ul` overrides it in the whole gem
 *   (`function/ul.rb:56`, returning `"underline"`), and no rule here can build
 *   a `Ul`, so `className` implements the base rule (`core.rb:28`) and refuses
 *   the `ul` kind rather than guessing.
 */

import type { FormulaNode, MathNode, NodeKind, NodeOptions } from "../../core/index";
import { NODE_SPECS } from "../../core/normalize";
import { sequence, simple, Transform, type TransformValue } from "../../pegkit";
import { HTML_SYMBOL_CLASS_INPUT } from "./generated/transform-tables";
import { isWholeHtmlEntity, stringToHtmlEntity } from "./preprocess";
import {
  HTML_CLASS_REGISTRY,
  HTML_NODE_CONSTRUCTORS,
  HTML_SUB_SUP_CLASS_OF,
  HTML_SUB_SUP_METHOD_CLASS_NAMES,
  type HtmlClassEntry,
} from "./registry";

/* =========================================================================
 * 1. Ruby-semantics helpers
 * ---------------------------------------------------------------------- */

/** Ruby `Array#compact`: a NEW array without nils. */
function compact(values: readonly unknown[]): unknown[] {
  return values.filter((value) => value !== null && value !== undefined);
}

/** Ruby `Array#flatten`: RECURSIVE, unlike JavaScript's one-level `flat()`. */
function flattenDeep(values: readonly unknown[]): unknown[] {
  return values.flatMap((value) => (Array.isArray(value) ? flattenDeep(value) : [value]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as object).constructor === Object
  );
}

/** The code units Ruby's `String#strip` removes: NUL plus ASCII whitespace. */
function rubyStrip(text: string): string {
  let start = 0;
  let end = text.length;
  const strippable = (code: number): boolean =>
    code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0;
  while (start < end && strippable(text.charCodeAt(start))) start += 1;
  while (end > start && strippable(text.charCodeAt(end - 1))) end -= 1;
  return start === 0 && end === text.length ? text : text.slice(start, end);
}

/**
 * `nil.to_s` / `String#to_s` over the leaf vocabulary the JSON round trip
 * leaves behind (see the header). Anything else is a defect in the caller
 * rather than a shape the gem's transform could see, so it throws.
 */
function rubyToS(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  throw new TypeError(
    `html transform: ${typeof value} leaf; html/parser.rb:18 leaves only strings`,
  );
}

/** Ruby's "argument omitted": `undefined` takes the default, `null` is nil. */
function orNil(value: unknown): unknown {
  return value === undefined ? null : value;
}

/** A transformed value as the array Parslet's `sequence` matcher bound. */
function asArray(value: TransformValue): unknown[] {
  return value as unknown[];
}

/* =========================================================================
 * 2. The draft model
 * ---------------------------------------------------------------------- */

/**
 * One mutable stand-in for a Ruby node under construction. `fields` holds the
 * ivars the class's `initialize` actually assigned — measured per class off the
 * runtime, never read from source — under their TypeScript names, and stays
 * mutable until `finalize`. `identity` is the Ruby basename an alias carrier
 * rides under (`Power`, `Paren::Lround`), matching the core carriers'
 * `name`/`id`.
 */
class HtmlDraft {
  constructor(
    readonly kind: NodeKind,
    readonly identity: string | undefined,
    readonly fields: Record<string, unknown>,
  ) {}
}

function isDraft(value: unknown): value is HtmlDraft {
  return value instanceof HtmlDraft;
}

/**
 * The Ruby class a draft stands for: the carrier's own class, or the alias
 * basename hung under the carrier's identity prefix.
 */
function draftRubyClass(draft: HtmlDraft): string {
  const spec = NODE_SPECS[draft.kind];
  if (draft.identity === undefined) return spec.rubyClass;
  const identity = spec.identity;
  if (identity === undefined) {
    throw new Error(`html transform: kind "${draft.kind}" has no identity slot`);
  }
  return `${identity.prefix}::${draft.identity}`;
}

/**
 * `Core#class_name` (`core.rb:28`): `self.class.name.split("::").last.downcase`.
 *
 * `Utility.sub_sup_method?` guards the call with
 * `sub_sup.methods.include?(:class_name)`, so a bare String never reaches this
 * — `subSupMethod` below keeps that guard rather than letting this throw.
 */
function className(draft: HtmlDraft): string {
  if (draft.kind === "ul") {
    throw new Error('html transform: Ul overrides class_name to "underline"');
  }
  const parts = draftRubyClass(draft).split("::");
  return (parts[parts.length - 1] as string).toLowerCase();
}

function isFormulaDraft(value: unknown): value is HtmlDraft {
  return isDraft(value) && value.kind === "formula";
}

/** A formula draft's live `value` array. */
function formulaValue(draft: HtmlDraft): unknown[] {
  return draft.fields.value as unknown[];
}

/**
 * `Math::Formula.new(value = [], left_right_wrapper = true)`
 * (`formula.rb:38-48`): a non-array is wrapped in a ONE-element array — this is
 * not `Kernel#Array`, so a Hash becomes `[hash]` rather than its pairs — the
 * array itself is stored by reference, and `displaystyle` is assigned true.
 * `input_string` stays unassigned; `Plurimath::Math.parse_formula` adds it at
 * the very end.
 *
 * The `left_right_wrapper = false if @value.first.is_a?(Function::Left)` line
 * is unreachable from HTML (see the header), so the flag is stored as given.
 */
function newFormula(value: unknown = []): HtmlDraft {
  const list = Array.isArray(value) ? value : [value];
  return new HtmlDraft("formula", undefined, {
    value: list,
    leftRightWrapper: true,
    displaystyle: true,
  });
}

/**
 * `Math::Number.new(value, base:)` (`number.rb:8-15`) — both mini flags are
 * assigned false and `base` is assigned, `nil` included.
 */
function newNumber(value: unknown, base: number | null = null): HtmlDraft {
  return new HtmlDraft("number", undefined, {
    value: orNil(value),
    miniSubSized: false,
    miniSupSized: false,
    base,
  });
}

/** A symbol class resolved from a table: `klass.new` — `@value` assigned nil. */
function newSymbolOfClass(id: string): HtmlDraft {
  return new HtmlDraft("symbol", id, { value: null });
}

/**
 * `Math::Symbols::Symbol.new(sym)` (`symbols/symbol.rb:16`): `@value =
 * sym.is_a?(Array) ? sym.join : sym&.to_s`. Only `@value` is assigned — the
 * other four ivars are guarded and stay unassigned.
 */
function newBareSymbol(value: unknown): HtmlDraft {
  return new HtmlDraft("symbol", "Symbol", { value: rubyToS(value) });
}

/** `UnaryFunction#initialize` (`unary_function.rb:9-14`). */
function unaryDraft(kind: NodeKind, identity: string | undefined, one: unknown): HtmlDraft {
  return new HtmlDraft(kind, identity, { parameterOne: orNil(one) });
}

/** `Vec#initialize(parameter_one = nil, attributes = {})` — measured. */
function unaryAttributesDraft(
  kind: NodeKind,
  identity: string | undefined,
  one: unknown,
): HtmlDraft {
  return new HtmlDraft(kind, identity, { parameterOne: orNil(one), attributes: {} });
}

/** `BinaryFunction#initialize` (`binary_function.rb:9-13`). */
function binaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  one: unknown,
  two: unknown,
): HtmlDraft {
  return new HtmlDraft(kind, identity, { parameterOne: orNil(one), parameterTwo: orNil(two) });
}

/** `TernaryFunction#initialize` (`ternary_function.rb:10-17`). */
function ternaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  one: unknown,
  two: unknown,
  three: unknown,
): HtmlDraft {
  return new HtmlDraft(kind, identity, {
    parameterOne: orNil(one),
    parameterTwo: orNil(two),
    parameterThree: orNil(three),
  });
}

/** `Text.new(parameter_one = "", lang: nil)` — `@lang` is always assigned. */
function newText(one: unknown): HtmlDraft {
  return new HtmlDraft("text", undefined, { parameterOne: orNil(one), lang: null });
}

/**
 * `Td.new(parameter_one, parameter_two)` (`td.rb:7-10`): `delete_if` strips
 * literal `"&"` cells from the CALLER's array in place, then `Array(...)` folds
 * nil to `[]`. A node never equals a string in Ruby, so only a raw string can
 * match. Transcribed rather than dropped: the strip is what `Td.new` does, and
 * whether an HTML cell can be a raw `"&"` is the grammar's business, not this
 * constructor's.
 */
function newTd(one: unknown): HtmlDraft {
  let cells = orNil(one);
  if (cells !== null) {
    if (!Array.isArray(cells)) {
      throw new TypeError(
        "html transform: Td.new with a non-array (Ruby raises NoMethodError on delete_if)",
      );
    }
    for (let index = cells.length - 1; index >= 0; index--) {
      if (cells[index] === "&") cells.splice(index, 1);
    }
  }
  cells = cells === null ? [] : cells;
  return binaryDraft("binaryFunction", "Td", cells, null);
}

/**
 * `Tr.new(parameter_one = [])` (`tr.rb:7-14`): a row that is ALL literal `"@"`
 * cells is rewritten to empty `Td`s in place. An EMPTY row trivially satisfies
 * `all?("@")`, where `map!` then does nothing.
 */
function newTr(one: unknown): HtmlDraft {
  if (Array.isArray(one) && one.every((cell) => cell === "@")) {
    for (let index = 0; index < one.length; index++) one[index] = newTd([]);
  }
  return unaryDraft("unaryFunction", "Tr", one);
}

/**
 * `Table.new(value, open_paren = nil, close_paren = nil, options = {})`
 * (`table.rb:22-30`). The HTML transform passes only the first argument
 * (`transform.rb:40`, `:44`), so both parens take their `nil` default and run
 * through `Utility.symbols_class(nil, lang: :unicodemath)`, which returns a
 * non-string argument unchanged. `@options` is always assigned.
 */
function newTable(value: unknown): HtmlDraft {
  return new HtmlDraft("table", undefined, {
    value: orNil(value),
    openParen: null,
    closeParen: null,
    options: {} as NodeOptions,
  });
}

/** `Linebreak.new` (`linebreak.rb:9-13`) — both defaults assigned. */
function newLinebreak(): HtmlDraft {
  return new HtmlDraft("linebreak", undefined, { parameterOne: null, attributes: {} });
}

const newPower = (a: unknown, b: unknown) => binaryDraft("binaryFunction", "Power", a, b);
const newBase = (a: unknown, b: unknown) => binaryDraft("base", undefined, a, b);
const newPowerBase = (a: unknown, b: unknown, c: unknown) =>
  ternaryDraft("ternaryFunction", "PowerBase", a, b, c);

/* =========================================================================
 * 3. The `Utility` helpers the rules call
 * ---------------------------------------------------------------------- */

/**
 * `Utility.symbols_class(string, lang: :html)` (`utility.rb:212-218`).
 *
 * Three behaviours a port must not tidy up. A non-string is returned
 * UNCHANGED, before the lookup — which is how `Table.new`'s nil parens survive.
 * The lookup `strip`s. And a miss falls back to a bare
 * `Math::Symbols::Symbol` carrying the text rather than failing.
 *
 * The `table:` keyword is not ported: it is `false` at every HTML call site,
 * and its body (`latex_table_curly_paren`) is guarded by `lang == :latex`.
 */
function symbolsClass(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const id = HTML_SYMBOL_CLASS_INPUT.get(rubyStrip(value));
  return id === undefined ? newBareSymbol(value) : newSymbolOfClass(id);
}

/**
 * `TransformUtility.normalize_symbol` (`html/transform_utility.rb:53-58`): a
 * text that is ALREADY a whole entity is passed through, anything else is
 * entity-encoded.
 *
 * The second branch is not a no-op for ordinary symbols — `<` becomes
 * `&#x3c;` — and it is not idempotent for a text carrying two entities:
 * measured on the oracle, `"&#xa0;&#xa0;"` normalises to
 * `"&#x26;#xa0;&#x26;#xa0;"`, because the anchored regexp does not match a
 * pair and the encoder then rewrites both `&`s.
 * `HTML_SYMBOL_NORMALIZATION_PROBES` records those measurements.
 */
function normalizeSymbol(symbol: unknown): string {
  const text = rubyToS(symbol);
  return isWholeHtmlEntity(text) ? text : stringToHtmlEntity(text);
}

/** `TransformUtility.symbol` (`html/transform_utility.rb:10-12`). */
function transformSymbol(symbol: unknown): unknown {
  return symbolsClass(normalizeSymbol(symbol));
}

/**
 * `Utility.filter_values(array)` (`utility.rb:192-200`), whose return SHAPE —
 * formula, lone element, nil — decides what the caller builds. A `Formula`
 * input contributes its LIVE value array.
 */
function filterValues(value: unknown): unknown {
  if (!Array.isArray(value) && !isFormulaDraft(value)) return value;
  const array = isFormulaDraft(value) ? formulaValue(value) : compact(flattenDeep(value));
  if (array.length > 1) return newFormula(array);
  return array.length === 0 ? null : array[0];
}

/**
 * `Utility.get_class(text)` through the explicit registry (`./registry`).
 *
 * A miss throws where the gem raises `NameError`. Unlike LaTeX's registry
 * there is no name the gem itself cannot resolve, so this only fires on a text
 * the grammar cannot actually produce.
 */
function getClass(name: unknown): HtmlClassEntry {
  const entry = HTML_CLASS_REGISTRY.get(rubyToS(name));
  if (entry === undefined) {
    throw new Error(`html transform: no class for ${JSON.stringify(rubyToS(name))}`);
  }
  return entry;
}

/**
 * `Utility.get_class(name).new(...args)` — the constructor the generator
 * MEASURED for that class, so `Vec.new` gets its `attributes` default and
 * `Sum.new` its three parameters. Arguments the call site does not pass take
 * the Ruby default, which is `nil` for every family here.
 */
function buildClass(name: unknown, ...args: unknown[]): HtmlDraft {
  const entry = getClass(name);
  const [one, two, three] = args;
  switch (entry.family) {
    case "unary":
      return unaryDraft(entry.kind, entry.name, one);
    case "unaryAttributes":
      return unaryAttributesDraft(entry.kind, entry.name, one);
    case "binary":
      return binaryDraft(entry.kind, entry.name, one, two);
    case "ternary":
      return ternaryDraft(entry.kind, entry.name, one, two, three);
  }
}

/**
 * `Utility.sub_sup_method?(sub_sup)` (`html/utility.rb:10-14`).
 *
 * The Ruby guards on `sub_sup.methods.include?(:class_name)` and returns `nil`
 * — not `false` — when the guard fails, which is why a bare String base takes
 * the `Power`/`Base` branch rather than raising.
 */
function subSupMethod(value: unknown): boolean {
  if (!isDraft(value)) return false;
  return HTML_SUB_SUP_METHOD_CLASS_NAMES.has(className(value));
}

/** `TransformUtility.normalize_sub_sup_value` (`transform_utility.rb:47-51`). */
function normalizeSubSupValue(value: unknown): unknown {
  return Array.isArray(value) ? filterValues(value) : value;
}

/**
 * `TransformUtility.sub_sup_value` (`html/transform_utility.rb:20-45`).
 *
 * The four-class `sub_sup_method?` branch MUTATES the base and returns it, and
 * each assignment is guarded by the value's own truthiness — a `sub_value` that
 * normalised to nil leaves `parameter_one` alone rather than clearing it. The
 * three remaining branches build a node instead, and the last is reached with
 * BOTH values nil (`filter_values([])` is nil), which builds
 * `Base.new(sub_sup, nil)`.
 */
function subSupValue(subSup: unknown, subValue: unknown, supValue: unknown): unknown {
  const sub = normalizeSubSupValue(subValue);
  const sup = normalizeSubSupValue(supValue);
  if (subSupMethod(subSup)) {
    const draft = subSup as HtmlDraft;
    if (sub !== null && sub !== undefined && sub !== false) draft.fields.parameterOne = sub;
    if (sup !== null && sup !== undefined && sup !== false) draft.fields.parameterTwo = sup;
    return draft;
  }
  const hasSub = sub !== null && sub !== undefined && sub !== false;
  const hasSup = sup !== null && sup !== undefined && sup !== false;
  if (hasSub && hasSup) return newPowerBase(subSup, sub, sup);
  if (hasSup) return newPower(subSup, sup);
  return newBase(subSup, sub ?? null);
}

/** `TransformUtility.append_expression` (`transform_utility.rb:14-18`). */
function appendExpression(value: unknown, expression: unknown): unknown[] {
  return Array.isArray(expression) ? [value, ...expression] : [value, expression];
}

/* =========================================================================
 * 4. The rules, in html/transform.rb order — ONE Transform instance
 * ---------------------------------------------------------------------- */

/** How many rules this module registers, so a coverage spec can pin it. */
export interface HtmlTransformBuild {
  readonly transform: Transform;
  /** Rule id -> how many times its action has run, for the coverage spec. */
  readonly fired: Map<string, number>;
  readonly ruleIds: readonly string[];
}

/**
 * Builds the transform.
 *
 * Every rule is registered through a local `rule` wrapper that tags it with the
 * line its `rule(` opens on and counts its firings, which is what
 * `test/formats/html/transform-coverage.spec.ts` uses to prove the fixture set
 * exercises each ported rule.
 *
 * Ids are prefixed by the FILE, because three of the 78 come from the
 * `BaseNumberPrefix::Transform` mixin rather than from `html/transform.rb`.
 * They are registered first here as `include` registers them first there — and
 * since `rule` unshifts on both sides, first-registered is last-tried in both.
 */
export function buildHtmlTransform(): HtmlTransformBuild {
  const t = new Transform();
  const fired = new Map<string, number>();
  const ruleIds: string[] = [];

  const rule = (
    id: string,
    pattern: Parameters<Transform["rule"]>[0],
    action: Parameters<Transform["rule"]>[1],
  ): void => {
    if (fired.has(id)) throw new Error(`html transform: duplicate rule id ${id}`);
    fired.set(id, 0);
    ruleIds.push(id);
    t.rule(pattern, (bindings) => {
      fired.set(id, (fired.get(id) as number) + 1);
      return action(bindings);
    });
  };

  // --- `include Plurimath::BaseNumberPrefix::Transform` (transform.rb:6) ---
  //
  // `to_i(2)`/`to_i(8)` then `to_s` re-render the digits in DECIMAL, so
  // `0b101` stores "5" and only `base` records the notation; the hex rule
  // keeps its digits as written. Reproduced, including the asymmetry.
  //
  // `BigInt`, not `parseInt`: `String#to_i` is arbitrary precision, and the
  // grammar's `match["01"].repeat(1)` puts no ceiling on the digit run, so a
  // 60-bit literal would come back rounded through a JavaScript number.
  rule("base_number_prefix:36", { hex_number: simple("hex") }, (b) =>
    newNumber(rubyToS(b.hex), 16),
  );
  rule("base_number_prefix:37", { binary_number: simple("bin") }, (b) =>
    newNumber(BigInt(`0b${rubyToS(b.bin)}`).toString(), 2),
  );
  rule("base_number_prefix:38", { octal_number: simple("oct") }, (b) =>
    newNumber(BigInt(`0o${rubyToS(b.oct)}`).toString(), 8),
  );

  // --- single-key rules (transform.rb:8-51) ------------------------------

  rule("transform:8", { text: simple("text") }, (b) => newText(b.text));
  rule("transform:9", { unary: simple("unary") }, (b) => buildClass(b.unary));
  rule("transform:10", { symbol: simple("symbol") }, (b) => transformSymbol(b.symbol));
  rule("transform:11", { number: simple("number") }, (b) => newNumber(b.number));
  rule("transform:12", { linebreak: simple("_linebreak") }, () => newLinebreak());
  rule("transform:13", { expression: simple("exp") }, (b) => b.exp);

  rule("transform:15", { linebreak: simple("_linebreak"), expression: simple("expr") }, (b) => [
    newLinebreak(),
    b.expr,
  ]);
  rule("transform:23", { linebreak: simple("_linebreak"), expression: sequence("expr") }, (b) => [
    newLinebreak(),
    ...asArray(b.expr),
  ]);

  rule("transform:28", { expression: sequence("exp") }, (b) => b.exp);
  rule("transform:29", { sequence: simple("sequence") }, (b) => b.sequence);
  rule("transform:30", { tr_value: simple("tr_value") }, (b) => newTr([b.tr_value]));
  rule("transform:31", { tr_value: sequence("tr_value") }, (b) => newTr(b.tr_value));
  rule("transform:32", { td_value: simple("td_value") }, (b) => newTd([b.td_value]));
  rule("transform:33", { sequence: sequence("sequence") }, (b) => b.sequence);
  rule("transform:34", { td_value: sequence("td_value") }, (b) => newTd(b.td_value));

  rule("transform:36", { parse_parenthesis: simple("parse_paren") }, (b) => b.parse_paren);
  rule("transform:37", { unary_function: simple("unary_function") }, (b) => b.unary_function);

  rule("transform:39", { table_value: simple("table_value") }, (b) => newTable([b.table_value]));
  rule("transform:43", { table_value: sequence("table_value") }, (b) => newTable(b.table_value));

  // `SUB_SUP_CLASSES[sum_prod.to_sym]` then `get_class(...)` — eight texts
  // onto four classes, so `&prod;`, `&#x220f;` and `∏` all build a `Prod`.
  rule("transform:47", { sum_prod: simple("sum_prod") }, (b) => {
    const className_ = HTML_SUB_SUP_CLASS_OF.get(rubyToS(b.sum_prod));
    if (className_ === undefined) {
      // `SUB_SUP_CLASSES[text]` is nil, and `get_class(nil)` capitalizes it to
      // `""` and asks for `Plurimath::Math::Function::` — measured on the
      // oracle: `NameError: wrong constant name Plurimath::Math::Function::`.
      // Unreachable from the grammar, whose `:sub_sup` rule is built from
      // these very keys, so this is the shape of the failure rather than a
      // branch a fixture covers.
      throw new Error(
        `html transform: no sub/sup class for ${JSON.stringify(rubyToS(b.sum_prod))}`,
      );
    }
    return buildClass(className_);
  });

  // --- two-key rules (transform.rb:53-182) -------------------------------

  rule("transform:53", { sequence: simple("sequence"), expression: simple("expr") }, (b) => [
    b.sequence,
    b.expr,
  ]);
  rule(
    "transform:58",
    { sequence: simple("sequence"), parse_parenthesis: simple("parse_paren") },
    (b) => [b.sequence, b.parse_paren],
  );
  // `expr.insert(0, sequence)` mutates the bound array and returns it.
  rule("transform:63", { sequence: simple("sequence"), expression: sequence("expr") }, (b) => {
    const expr = asArray(b.expr);
    expr.unshift(b.sequence);
    return expr;
  });
  // `sequence << expr` — the same, appending.
  rule("transform:68", { sequence: sequence("sequence"), expression: simple("expr") }, (b) => {
    const seq = asArray(b.sequence);
    seq.push(b.expr);
    return seq;
  });

  rule("transform:73", { tr_value: simple("tr_value"), expression: simple("expr") }, (b) => [
    newTr([b.tr_value]),
    b.expr,
  ]);
  rule("transform:81", { tr_value: simple("tr_value"), expression: sequence("expr") }, (b) => {
    const expr = asArray(b.expr);
    expr.unshift(newTr([b.tr_value]));
    return expr;
  });
  rule("transform:89", { td_value: simple("td_value"), expression: simple("expr") }, (b) => [
    newTd([b.td_value]),
    b.expr,
  ]);
  rule("transform:97", { td_value: simple("td_value"), expression: sequence("expr") }, (b) => {
    const expr = asArray(b.expr);
    expr.unshift(newTd([b.td_value]));
    return expr;
  });

  rule(
    "transform:105",
    { unary_function: simple("unary_function"), sequence: simple("sequence") },
    (b) => newFormula([b.unary_function, b.sequence]),
  );
  rule(
    "transform:115",
    { unary_function: simple("unary_function"), sequence: sequence("sequence") },
    (b) => newFormula([b.unary_function, ...asArray(b.sequence)]),
  );

  rule("transform:122", { text: simple("text"), expression: simple("expr") }, (b) => [
    newText(b.text),
    b.expr,
  ]);
  rule("transform:130", { text: simple("text"), expression: sequence("expr") }, (b) => [
    newText(b.text),
    ...asArray(b.expr),
  ]);
  rule("transform:135", { symbol: simple("symbol"), expression: simple("expr") }, (b) => [
    transformSymbol(b.symbol),
    b.expr,
  ]);
  rule("transform:143", { symbol: simple("symbol"), expression: sequence("expr") }, (b) => [
    transformSymbol(b.symbol),
    ...asArray(b.expr),
  ]);
  rule("transform:148", { number: simple("number"), expression: sequence("expr") }, (b) => [
    newNumber(b.number),
    ...asArray(b.expr),
  ]);
  rule("transform:153", { number: simple("number"), expression: simple("expr") }, (b) => [
    newNumber(b.number),
    b.expr,
  ]);

  rule("transform:161", { text: simple("text"), parse_parenthesis: simple("parse_paren") }, (b) =>
    newFormula([newText(b.text), b.parse_paren]),
  );
  rule("transform:171", { unary: simple("unary"), first_value: simple("first_value") }, (b) =>
    buildClass(b.unary, b.first_value),
  );
  rule(
    "transform:176",
    { symbol: simple("symbol"), parse_parenthesis: simple("parse_paren") },
    (b) => [transformSymbol(b.symbol), b.parse_paren],
  );

  // --- the sub/sup cluster (transform.rb:184-393) ------------------------
  //
  // Parslet emits a separate shape for every sub/sup value combination and
  // trailing expression form, so this is mechanical: build the sub/sup node,
  // then append the remaining expression in input order.

  rule("transform:184", { sub_sup: simple("sub_sup"), sub_value: simple("sub_value") }, (b) =>
    subSupValue(b.sub_sup, b.sub_value, undefined),
  );
  rule("transform:189", { sub_sup: simple("sub_sup"), sub_value: sequence("sub_value") }, (b) =>
    subSupValue(b.sub_sup, b.sub_value, undefined),
  );
  rule("transform:194", { sub_sup: simple("sub_sup"), sup_value: simple("sup_value") }, (b) =>
    subSupValue(b.sub_sup, undefined, b.sup_value),
  );
  rule("transform:199", { sub_sup: simple("sub_sup"), sup_value: sequence("sup_value") }, (b) =>
    subSupValue(b.sub_sup, undefined, b.sup_value),
  );
  rule(
    "transform:204",
    { sub_sup: simple("sub_sup"), sub_value: simple("sub_value"), sup_value: simple("sup_value") },
    (b) => subSupValue(b.sub_sup, b.sub_value, b.sup_value),
  );
  rule(
    "transform:211",
    {
      sub_sup: simple("sub_sup"),
      sub_value: simple("sub_value"),
      sup_value: sequence("sup_value"),
    },
    (b) => subSupValue(b.sub_sup, b.sub_value, b.sup_value),
  );
  rule(
    "transform:218",
    {
      sub_sup: simple("sub_sup"),
      sub_value: sequence("sub_value"),
      sup_value: simple("sup_value"),
    },
    (b) => subSupValue(b.sub_sup, b.sub_value, b.sup_value),
  );
  rule(
    "transform:225",
    {
      sub_sup: simple("sub_sup"),
      sub_value: sequence("sub_value"),
      sup_value: sequence("sup_value"),
    },
    (b) => subSupValue(b.sub_sup, b.sub_value, b.sup_value),
  );

  rule(
    "transform:235",
    {
      sub_sup: simple("sub_sup"),
      sup_value: sequence("sup_value"),
      expression: simple("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, undefined, b.sup_value), b.expression),
  );
  rule(
    "transform:244",
    {
      sub_sup: simple("sub_sup"),
      sub_value: simple("sub_value"),
      expression: simple("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, undefined), b.expression),
  );
  rule(
    "transform:253",
    {
      sub_sup: simple("sub_sup"),
      sub_value: simple("sub_value"),
      expression: sequence("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, undefined), b.expression),
  );
  rule(
    "transform:262",
    {
      sub_sup: simple("sub_sup"),
      sub_value: sequence("sub_value"),
      expression: simple("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, undefined), b.expression),
  );
  rule(
    "transform:271",
    {
      sub_sup: simple("sub_sup"),
      sub_value: sequence("sub_value"),
      expression: sequence("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, undefined), b.expression),
  );
  rule(
    "transform:280",
    {
      sub_sup: simple("sub_sup"),
      sup_value: simple("sup_value"),
      expression: simple("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, undefined, b.sup_value), b.expression),
  );
  rule(
    "transform:289",
    {
      sub_sup: simple("sub_sup"),
      sup_value: simple("sup_value"),
      expression: sequence("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, undefined, b.sup_value), b.expression),
  );
  rule(
    "transform:298",
    {
      sub_sup: simple("sub_sup"),
      sup_value: sequence("sup_value"),
      expression: sequence("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, undefined, b.sup_value), b.expression),
  );

  rule(
    "transform:307",
    {
      sub_sup: simple("sub_sup"),
      sub_value: simple("sub_value"),
      sup_value: simple("sup_value"),
      expression: simple("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, b.sup_value), b.expression),
  );
  rule(
    "transform:318",
    {
      sub_sup: simple("sub_sup"),
      sub_value: simple("sub_value"),
      sup_value: simple("sup_value"),
      expression: sequence("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, b.sup_value), b.expression),
  );
  rule(
    "transform:329",
    {
      sub_sup: simple("sub_sup"),
      sub_value: simple("sub_value"),
      sup_value: sequence("sup_value"),
      expression: simple("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, b.sup_value), b.expression),
  );
  rule(
    "transform:340",
    {
      sub_sup: simple("sub_sup"),
      sub_value: simple("sub_value"),
      sup_value: sequence("sup_value"),
      expression: sequence("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, b.sup_value), b.expression),
  );
  rule(
    "transform:351",
    {
      sub_sup: simple("sub_sup"),
      sub_value: sequence("sub_value"),
      sup_value: simple("sup_value"),
      expression: simple("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, b.sup_value), b.expression),
  );
  rule(
    "transform:362",
    {
      sub_sup: simple("sub_sup"),
      sub_value: sequence("sub_value"),
      sup_value: simple("sup_value"),
      expression: sequence("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, b.sup_value), b.expression),
  );
  rule(
    "transform:373",
    {
      sub_sup: simple("sub_sup"),
      sub_value: sequence("sub_value"),
      sup_value: sequence("sup_value"),
      expression: simple("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, b.sup_value), b.expression),
  );
  rule(
    "transform:384",
    {
      sub_sup: simple("sub_sup"),
      sub_value: sequence("sub_value"),
      sup_value: sequence("sup_value"),
      expression: sequence("expression"),
    },
    (b) => appendExpression(subSupValue(b.sub_sup, b.sub_value, b.sup_value), b.expression),
  );

  // --- the parenthesis and binary rules (transform.rb:395-523) -----------

  rule(
    "transform:395",
    { lparen: simple("lparen"), text: simple("text"), rparen: simple("rparen") },
    (b) => newFormula([symbolsClass(b.lparen), newText(b.text), symbolsClass(b.rparen)]),
  );
  rule(
    "transform:405",
    { lparen: simple("lparen"), sequence: simple("sequence"), rparen: simple("rparen") },
    (b) => newFormula([symbolsClass(b.lparen), b.sequence, symbolsClass(b.rparen)]),
  );
  rule(
    "transform:415",
    {
      lparen: simple("lparen"),
      sequence: simple("sequence"),
      parse_parenthesis: simple("parse_paren"),
      rparen: simple("rparen"),
    },
    (b) => newFormula([symbolsClass(b.lparen), b.sequence, b.parse_paren, symbolsClass(b.rparen)]),
  );
  // The only paren rule that folds its body: `Utility.filter_values` puts a
  // multi-element sequence into ONE nested `Formula`, so the outer formula has
  // three values here and `:415`'s has four.
  rule(
    "transform:427",
    { lparen: simple("lparen"), sequence: sequence("sequence"), rparen: simple("rparen") },
    (b) => newFormula([symbolsClass(b.lparen), filterValues(b.sequence), symbolsClass(b.rparen)]),
  );
  rule(
    "transform:437",
    { lparen: simple("lparen"), number: simple("number"), rparen: simple("rparen") },
    (b) => newFormula([symbolsClass(b.lparen), newNumber(b.number), symbolsClass(b.rparen)]),
  );
  rule(
    "transform:447",
    {
      lparen: simple("lparen"),
      unary_function: simple("unary_function"),
      rparen: simple("rparen"),
    },
    (b) => newFormula([symbolsClass(b.lparen), b.unary_function, symbolsClass(b.rparen)]),
  );

  rule(
    "transform:457",
    {
      binary: simple("binary"),
      first_value: simple("first_value"),
      second_value: simple("second_value"),
    },
    (b) => buildClass(b.binary, b.first_value, b.second_value),
  );
  rule(
    "transform:463",
    {
      first_value: sequence("first_value"),
      binary: simple("binary"),
      second_value: sequence("second_value"),
    },
    (b) => buildClass(b.binary, filterValues(b.first_value), filterValues(b.second_value)),
  );

  rule(
    "transform:472",
    {
      lparen: simple("lparen"),
      text: simple("text"),
      expression: sequence("expression"),
      rparen: simple("rparen"),
    },
    (b) =>
      newFormula([
        symbolsClass(b.lparen),
        newText(b.text),
        ...asArray(b.expression),
        symbolsClass(b.rparen),
      ]),
  );
  rule(
    "transform:486",
    {
      lparen: simple("lparen"),
      text: simple("text"),
      expression: simple("expression"),
      rparen: simple("rparen"),
    },
    (b) =>
      newFormula([symbolsClass(b.lparen), newText(b.text), b.expression, symbolsClass(b.rparen)]),
  );
  rule(
    "transform:498",
    {
      lparen: simple("lparen"),
      number: simple("number"),
      expression: simple("expression"),
      rparen: simple("rparen"),
    },
    (b) =>
      newFormula([
        symbolsClass(b.lparen),
        newNumber(b.number),
        b.expression,
        symbolsClass(b.rparen),
      ]),
  );
  rule(
    "transform:510",
    {
      lparen: simple("lparen"),
      number: simple("number"),
      expression: sequence("expression"),
      rparen: simple("rparen"),
    },
    (b) =>
      newFormula([
        symbolsClass(b.lparen),
        newNumber(b.number),
        ...asArray(b.expression),
        symbolsClass(b.rparen),
      ]),
  );

  return { transform: t, fired, ruleIds };
}

/**
 * The shared transform. Memoised because building it allocates 78 closures and
 * every parse would otherwise pay for that; `buildHtmlTransform` stays
 * exported and unmemoised so the coverage suite gets its own counters. Sharing
 * this instance with that suite would let one test's firings satisfy another
 * test's coverage assertion.
 */
let htmlTransformInstance: Transform | undefined;

export function htmlTransform(): Transform {
  if (htmlTransformInstance === undefined) {
    htmlTransformInstance = buildHtmlTransform().transform;
  }
  return htmlTransformInstance;
}

/* =========================================================================
 * 5. Finalization, and the Parser#parse wrapping
 * ---------------------------------------------------------------------- */

/**
 * What a value would bind as, in pegkit's own terms: `simple` binds anything
 * that is not an array and not a plain hash, `sequence` an array whose every
 * element is such a leaf, and `other` is what neither matcher accepts. Kept in
 * step with `pegkit/transform.ts`'s `isLeaf`/`matches` by mirroring them, and
 * exported so `transform-coverage.spec.ts` can check the mirror against the
 * engine itself rather than against a second copy of this reasoning.
 */
export function shapeOf(value: unknown): "simple" | "sequence" | "other" {
  if (Array.isArray(value)) {
    return value.every((item) => !Array.isArray(item) && !isPlainObject(item))
      ? "sequence"
      : "other";
  }
  return isPlainObject(value) ? "other" : "simple";
}

function signatureOf(hash: Record<string, unknown>): string {
  return Object.entries(hash)
    .map(([key, value]) => `${key}=${shapeOf(value)}`)
    .sort()
    .join(",");
}

/**
 * The node SIGNATURES the GEM's own transform leaves unmatched, so a hash that
 * survives to the model is the gem's behaviour rather than this port's gap.
 *
 * **A key set is not a signature.** Parslet binds on the matcher kind as well
 * as the key, so whether a rule matches depends on the SHAPE of each value.
 * Each entry below therefore records `key=shape` per key, with `shape`
 * computed exactly as pegkit's `simple` and `sequence` matchers decide.
 *
 * Measured, not reasoned about: every registered block was wrapped on the
 * oracle and every hash that reached `transform_elt` without matching a rule
 * was recorded with its value shapes, over the same inputs
 * `scripts/generate-html-model-fixtures.rb` emits. Every signature this list
 * carries came back from that trace.
 *
 * Fourteen came back, and three of them are GEM BUGS reproduced rather than
 * fixed:
 *
 *   - `first_value=sequence,unary=simple` — `transform.rb:171` binds
 *     `first_value` with `simple(...)` only, so `sqrt(a+b)`, whose argument
 *     transforms to an ARRAY, matches nothing. The hash survives, and the
 *     formula the gem returns carries a raw `{unary:, first_value:}` pair in
 *     place of a `Sqrt`.
 *   - `sub_sup=sequence,sub_value=simple` — every one of the 24 sub/sup rules
 *     binds `sub_sup` with `simple(...)`, so a base that transformed to an
 *     array (`<i>ab</i><sub>1</sub>`) matches none of them.
 *   - `binary=simple,first_value=sequence,second_value=simple,sequence=simple`
 *     — `transform.rb:457` wants all three `simple` and `:463` wants both
 *     values `sequence`, and neither carries the trailing `sequence` key that
 *     `<i>2a</i><i>mod</i><i>em</i>` produces here.
 *
 * The other eleven are the `=other` shells those three sit inside, plus the
 * hashes the gem leaves where a `td`/`tr`/`table` value or a parenthesised
 * body folded to a shape no rule binds.
 *
 * **This list is the measured fixture exceptions, not a decision procedure.** A
 * signature's absence does NOT mean the gem matches it: it means no fixture
 * input produced it, so nothing here knows. Anything absent is REFUSED, which
 * is conservative in both directions. Widening the list is a measurement,
 * never a guess.
 */
const GEM_UNMATCHED_SIGNATURES: ReadonlySet<string> = new Set([
  "binary=simple,first_value=sequence,second_value=simple,sequence=simple",
  "expression=other,sub_sup=simple,sub_value=sequence,sup_value=simple",
  "expression=other,symbol=simple",
  "expression=sequence,hex_number=simple",
  "expression=sequence,sequence=sequence",
  "expression=simple,lparen=simple,rparen=simple,sequence=simple",
  "expression=simple,tr_value=sequence",
  "first_value=sequence,unary=simple",
  "parse_parenthesis=other",
  "sequence=other",
  "sub_sup=other,sup_value=simple",
  "sub_sup=sequence,sub_value=simple",
  "table_value=other",
  "unary_function=other",
]);

/** Refuses a hash the gem would have matched. */
function assertGemLeavesUnmatched(hash: Record<string, unknown>): void {
  const signature = signatureOf(hash);
  if (!GEM_UNMATCHED_SIGNATURES.has(signature)) {
    throw new Error(
      `html transform: no rule matched {${signature}}; that shape is not in the ported set`,
    );
  }
}

/**
 * Finalizes one transformed value into what the immutable model can hold:
 * drafts become `core` nodes, arrays are rebuilt around their finalized
 * contents, and a hash the gem also leaves unmatched is kept as a hash — which
 * is what `normalize` does with it too.
 */
function finalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(finalizeValue);
  if (isDraft(value)) return finalizeDraft(value);
  if (isPlainObject(value)) {
    assertGemLeavesUnmatched(value);
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = finalizeValue(entry);
    return result;
  }
  return value;
}

/**
 * One draft into one immutable node, through the registry's constructor map.
 *
 * Fields are passed by the carrier's shape, so an unassigned ivar stays
 * `undefined` and is omitted by `normalize` — which is where model parity is
 * decided.
 */
function finalizeDraft(draft: HtmlDraft, inputString?: string): MathNode {
  const init: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft.fields)) {
    // `options` and `attributes` are Ruby OPTION hashes, not tree values: the
    // only ones this transform builds are `{}` (Table, Vec, Linebreak).
    // Routing them through `finalizeValue` would put them in the
    // unmatched-node branch, where `{}` is not a signature the gem leaves
    // behind and would be refused.
    init[key] = key === "options" || key === "attributes" ? value : finalizeValue(value);
  }
  if (draft.identity !== undefined) init[draft.kind === "symbol" ? "id" : "name"] = draft.identity;
  if (inputString !== undefined) init.inputString = inputString;
  const ctor = HTML_NODE_CONSTRUCTORS[draft.kind];
  return new ctor(init);
}

/**
 * `Html::Parser#parse` (`html/parser.rb:16-23`) after the transform, plus the
 * `formula.input_string = text` that `Plurimath::Math.parse_formula` adds
 * (`math.rb:62-66`):
 *
 * ```ruby
 * transformed_tree = Transform.new.apply(nodes)
 * return transformed_tree if transformed_tree.is_a?(Math::Formula)
 * Math::Formula.new(transformed_tree)
 * ```
 *
 * The wrap is CONDITIONAL — unlike LaTeX's, which wraps unconditionally, so an
 * HTML formula is one level shallower than a LaTeX one for the same shape. And
 * the wrap is `Math::Formula.new`, NOT `Kernel#Array`: a surviving hash becomes
 * `[hash]` rather than its `[key, value]` pairs, and a bare String root — which
 * `" "` produces, because `Html::Parse#space` carries no `.as` — becomes
 * `[" "]`. Both are measured: `Plurimath::Math.parse(" ", :html)` answers
 * `Formula([" "])`.
 *
 * The root hash is CHECKED before it is wrapped, so a node whose rule this port
 * does not carry fails here rather than reaching a caller as data.
 */
export function finalizeHtmlParse(transformed: unknown, inputString: string): FormulaNode {
  if (isFormulaDraft(transformed)) {
    return finalizeDraft(transformed, inputString) as FormulaNode;
  }
  if (isPlainObject(transformed)) assertGemLeavesUnmatched(transformed);
  return finalizeDraft(newFormula(transformed), inputString) as FormulaNode;
}
