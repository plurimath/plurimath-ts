/** biome-ignore-all lint/style/useNamingConvention: pattern keys are Parslet
 * tree keys — Ruby's snake_case is the schema, exactly as in the generated
 * tables, and renaming one would stop its rule from ever matching. */
/**
 * The UnicodeMath transform, FIRST SLICE — ported rule for rule from the gem
 * (`lib/plurimath/unicode_math/transform.rb`, plurimath 0.11.6 at `00c52783`).
 *
 * `latex/transform.ts` is the template in every respect: one `t.rule(...)` per
 * Ruby `rule(...)`, in the same source order, each carrying the Ruby line it
 * came from; drafts stand in for Ruby nodes until `finalize`; the memoised
 * `unicodemathTransform()` accessor sits beside an unmemoised
 * `buildUnicodemathTransform()` that hands the coverage suite a zeroed set of
 * firing counters.
 *
 * ## Where the slice boundary is, and why
 *
 * `unicode_math/transform.rb` registers 516 rules — 519 counting the three the
 * `BaseNumberPrefix::Transform` mixin adds — and porting them in one unit is
 * not reviewable. The boundary is drawn by what the repository can *check*
 * today: the pinned corpus carries no UnicodeMath INPUT cases, but it carries
 * 103 distinct `expected.unicodemath` strings — UnicodeMath the gem itself
 * emitted — and feeding those back through `Plurimath::Math.parse(text,
 * :unicode)` is a round trip whose every answer is the oracle's.
 *
 * Measured on the oracle, with every registered block wrapped in a counter:
 * the gem parses 97 of those 103 and refuses 6, and the 97 fire **86** distinct
 * rules. This slice ports **78** of them: the 86 minus the eight-rule
 * table/matrix family (`transform.rb:8`, `:9`, `:14`, `:32`, `:1569`, `:1574`,
 * `:1584`, `:1649`), which serves exactly two of the 103 inputs and needs
 * `get_table_class`, `Td`/`Tr` construction and per-subclass table paren
 * defaults that no other rule here touches.
 *
 * ## A second increment: MULTISCRIPT, reached by hand-picked inputs
 *
 * Outside the eight-rule table family, no other unported rule fires on the
 * 103-string corpus — that method is exhausted — so a second family was
 * chosen by what it BUILDS rather than what the corpus reaches, and given
 * inputs of its own in `scripts/generate-unicodemath-model-fixtures.rb`,
 * each checked against the oracle before being written down.
 *
 * MULTISCRIPT is every rule building `Math::Function::Multiscript`, measured
 * (not the eight a prior pass estimated) at **thirteen**: twelve constructors
 * spanning `transform.rb:1992` to `:3978`, plus the `:57` unwrap
 * (`{pre_script: simple(:script)} -> script`, the same shape as `:55`/`:56`)
 * every one of them routes through — the grammar wraps every prescript
 * expression in a `pre_script` key that only `:57` removes, confirmed by the
 * oracle firing it once per Multiscript input. All twelve reuse the existing
 * `PowerBase`/ternary-alias machinery, and four of them (`:2958`, `:3662`,
 * `:3853`, `:3978`) additionally call `unfenced_value`; the
 * one addition is `:2971`'s reverse lookup into `Constants::SUB_DIGITS`,
 * built from the generated `UNICODEMATH_SUB_DIGITS` array this file already
 * had no reason to import.
 *
 * A DECORATION family (`transform.rb:1286`-`:1491`, building `Obrace`/
 * `Ubrace`, `Overset`, `Menclose`, `Underset`) was measured alongside it and
 * set aside, unstarted: all eight of its rules read one of
 * `Constants::UNDER_HORIZONTAL_BRACKETS` (four of them), `OVERLAYS_NOTATIONS`
 * (three) or `BELOWS_NOTATIONS` (one), and none of the three is in any
 * generated table this
 * repository carries — confirmed both by `grep -rl` across `src/` (nothing)
 * and by `scripts/generate-unicodemath-parser-data.rb`'s own
 * `UNCONSUMED_CONSTANTS` list, which already names all three as read only by
 * transform rules the port defers. Porting it now would mean hand-transcribing
 * gem constant data — one table alone carries over fifty entries — rather
 * than reusing a generated one, which is the premise MULTISCRIPT was portable
 * on and this family is not.
 *
 * ## A third increment: FRACTION, cut to the shape `:1609` already carries
 *
 * FRACTION is every `rule(` block that calls `Utility.fractions`
 * (`unicode_math/utility.rb:86-104`) — measured on the oracle by wrapping every
 * registered block, not read off a line-range survey, which had put this
 * family at 44 rules across `transform.rb:284`-`:3074`. That range mostly
 * covers `atom`/`atoms` (`:486` and some nineteen more sites through the whole
 * file, e.g. `:658`-`:697`) and `recursive_numerator`/`recursive_denominator`,
 * the generic multi-character-run combinator every bare symbol sequence in the
 * grammar goes through (`entity = atoms | number`, `common_rules.rb:11`) —
 * real, but neither specific to fractions nor called through
 * `Utility.fractions`. The measured count is **seventeen**: sixteen build
 * `Math::Function::Frac` and one (`:2209`, `\choose`) wraps that `Frac` in a
 * `Fenced`.
 *
 * One of the seventeen, `:1609` — `numerator: simple, denominator: simple`, no
 * options — was already in the 78 corpus-derived rules: it is what the
 * corpus's own fraction-shaped `expected.unicodemath` strings reach, complete
 * with `Utility.fractions`'s mutating `recursion_fraction` branch for
 * continued fractions like `(a)/(b)/(c)`. This increment ports its six
 * OPTION-carrying siblings, every one still a `simple`/`simple` shape (`mini_
 * numerator`/`mini_denominator` for `:1614`, `numerator`/`denominator` plus
 * one more key for the rest) — `:1614` (mini, `{displaystyle: false}`),
 * `:2197` (`\atop`,
 * `{linethickness: "0"}`), `:2209` (`\choose`, the `Fenced` wrap),
 * `:2347` (`\sdiv`/bevelled), `:2353` (`\ldiv`), and `:2377` (`\ndiv`,
 * `{displaystyle: false}` — its SEQUENCE-denominator twin `:2371`, deferred,
 * passes `{no_display_style: false}` instead for the same input shape; the gem
 * is inconsistent between the two and both are transcribed as measured, not
 * reconciled) — plus two small prerequisites `:1614`'s mini shape needs:
 * `:165`/`:170`, the standalone `{sup_digits:}`/`{sub_digits:}` unwraps to
 * `Math::Number`, reusing the `SUB_DIGITS` reverse lookup `:2971` already
 * built and adding its `SUP_DIGITS` twin from a generated array this file
 * already imports the sibling of.
 *
 * The other ten call sites — `:1619`, `:1624`, `:1629`, `:1634`, `:1639`,
 * `:1644` (the `numerator`/`mini_numerator` × `denominator`/`mini_denominator`
 * shapes where at least one side is a SEQUENCE), `:2203` (`\atop` with a
 * sequence numerator), and `:2359`/`:2365`/`:2371` (bevelled/ldiv/
 * no_display_style with a sequence denominator) — all need the `atoms`
 * combinator above, which is cross-cutting rather than fraction-specific and
 * is deferred whole, same reasoning as DECORATION: porting a slice of it here
 * would mean starting a second large family rather than finishing this one.
 *
 * Everything outside those 99 is genuinely ABSENT rather than stubbed. A node
 * whose key set no ported rule matches survives the transform as a plain hash
 * and `finalize` throws on it, naming the keys — the loud failure the deferred
 * families are supposed to produce.
 *
 * ## Order is behaviour, and one rule is dead because of it
 *
 * `Parslet::Transform.rule` **unshifts** (`parslet-2.0.0/lib/parslet/transform.rb:128`
 * and `:160`), so a later definition wins a tie. Measured over all 519
 * registered patterns, exactly ONE signature appears twice —
 * `{exp: sequence, factor: simple}` at `transform.rb:846` and `:871` — and the
 * later `:871` wins, which the coverage probe confirms (`:871` fires, `:846`
 * never). `:871` is ported; `:846` is dead and is not.
 *
 * ## Mutation is behaviour, so nodes are drafts until the entry point returns
 *
 * Four ported rules assign into a node the transform already built, between
 * them seven writes: `:1019` and `:1116` each set `parameter_one` or
 * `parameter_two` on one of two branches, `:1173` sets
 * `sub_sup.parameter_one.parameter_one`, and `:1861` sets
 * `parameter_three` or `parameter_four`. `Utility.fractions` adds a fifth
 * mutation site outside the rules, rewriting a `Frac`'s `parameter_one` in
 * place (`unicode_math/utility.rb:88`).
 * Core nodes are publicly immutable (ARCHITECTURE.md §5), so the transform
 * works on `UnicodemathDraft` objects and `finalize` converts the finished tree
 * into real `core` nodes in one pass at the end.
 *
 * ## Two model behaviours that are provably absent here
 *
 * - **`ModelHelper.validate_left_right`** (`model_helper.rb:17-23`) forces
 *   `left_right_wrapper` back to true on a formula field whose first value is a
 *   `Math::Function::Left`. No `Left` can enter a UnicodeMath tree:
 *   `grep -c "Function::Left" unicode_math/transform.rb unicode_math/utility.rb`
 *   is 0 in both, and `left` is not among the names `get_class` can receive
 *   (`UNICODEMATH_TRANSFORM_GET_CLASS`). The same fact is why `newFormula`
 *   below has no `Left` branch where `latex/transform.ts` has one.
 * - **`Core#class_name`** (`core.rb:28`) is the class basename downcased. Only
 *   one class in the gem overrides it — `Ul` returns `"underline"`
 *   (`function/ul.rb:56`), the sole extra hit of
 *   `grep -rn "def class_name" lib/plurimath/math/` — and no rule here can
 *   build a `Ul`, so `className` below implements the base rule and refuses the
 *   `ul` kind rather than guessing.
 */

import type { FormulaNode, MathNode, NodeKind, NodeOptions } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_HEXCODE_IN_INPUT,
  UNICODEMATH_HORIZONTAL_BRACKETS,
  UNICODEMATH_UNARY_ARG_FUNCTIONS,
  UNICODEMATH_UNDEF_UNARY_FUNCTIONS,
} from "../../generated/unicodemath/render-tables";
import { Slice, sequence, simple, subtree, Transform, type TransformValue } from "../../pegkit";
import {
  UNICODEMATH_BINARY_SYMBOLS,
  UNICODEMATH_BINARY_SYMBOLS_KEYS,
  UNICODEMATH_NARY_SYMBOLS,
  UNICODEMATH_NARY_SYMBOLS_KEYS,
  UNICODEMATH_SUB_DIGITS,
  UNICODEMATH_SUP_DIGITS,
} from "./generated/parser-tables";
import {
  UNICODEMATH_BINARY_FUNCTIONS,
  UNICODEMATH_IS_A_CLASSES,
  UNICODEMATH_MENCLOSE_FUNCTIONS,
  UNICODEMATH_NARY_CLASSES,
  UNICODEMATH_PRIMES_CONSTANTS,
  UNICODEMATH_SYMBOL_CLASS_INPUT,
} from "./generated/transform-tables";
import {
  namedSymbolId,
  UNICODEMATH_CLASS_REGISTRY,
  UNICODEMATH_FONT_STYLES,
  UNICODEMATH_NODE_CONSTRUCTORS,
  type UnicodemathClassEntry,
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

/** Ruby `nil.to_s` / `Slice#to_s` / `String#to_s`. */
function rubyToS(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Slice) return value.text;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new TypeError(`unicodemath transform: no deterministic to_s for ${typeof value}`);
}

/**
 * `Slice#== other` is `str == other` (`parslet-2.0.0/lib/parslet/slice.rb:43`),
 * and Ruby's `String#==` delegates to the other side when it responds to
 * `to_str` — so a slice and a string with the same text compare equal in BOTH
 * directions. Three ported rules depend on it: `[opener, closer].include?("|")`
 * (`:2436`, `:2619`), `["abs", "&#x249c;"].any?(function)` (`:1209`, whose
 * `any?(pattern)` runs `function === "abs"`), and `unary == "mod"` (`:1547`).
 */
function textEquals(value: unknown, text: string): boolean {
  return (typeof value === "string" || value instanceof Slice) && rubyToS(value) === text;
}

/** Ruby truthiness: only nil and false are falsy. */
function rubyTruthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** `Hash#key(value)`: the FIRST key mapping to `value`, or nil. */
function invertFirstWins(map: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const inverted = new Map<string, string>();
  for (const [key, value] of map) if (!inverted.has(value)) inverted.set(value, key);
  return inverted;
}

/**
 * A `Constants` hash reassembled from the two arrays the parser tables carry
 * for it. `.keys` and `.values` are emitted from the SAME Ruby hash in one
 * pass, so index `i` pairs them; the lengths are asserted here rather than
 * assumed, because a regeneration that changed only one of the two would
 * otherwise silently shift every pair.
 */
function zipConstants(
  keys: readonly string[],
  values: readonly string[],
  label: string,
): ReadonlyMap<string, string> {
  if (keys.length !== values.length) {
    throw new Error(
      `unicodemath transform: ${label} has ${keys.length} keys and ${values.length} values`,
    );
  }
  const map = new Map<string, string>();
  for (let index = 0; index < keys.length; index++) {
    map.set(keys[index] as string, values[index] as string);
  }
  return map;
}

const BINARY_SYMBOLS = zipConstants(
  UNICODEMATH_BINARY_SYMBOLS_KEYS,
  UNICODEMATH_BINARY_SYMBOLS,
  "BINARY_SYMBOLS",
);
const NARY_SYMBOLS = zipConstants(
  UNICODEMATH_NARY_SYMBOLS_KEYS,
  UNICODEMATH_NARY_SYMBOLS,
  "NARY_SYMBOLS",
);
const NARY_CLASSES_INVERTED = invertFirstWins(UNICODEMATH_NARY_CLASSES);
const UNARY_ARG_FUNCTIONS_INVERTED = invertFirstWins(UNICODEMATH_UNARY_ARG_FUNCTIONS);
const HORIZONTAL_BRACKETS_INVERTED = invertFirstWins(UNICODEMATH_HORIZONTAL_BRACKETS);
const PRIMES_INVERTED = invertFirstWins(UNICODEMATH_PRIMES_CONSTANTS);
const BINARY_FUNCTION_NAMES: ReadonlySet<string> = new Set(UNICODEMATH_BINARY_FUNCTIONS);
const UNDEF_UNARY_FUNCTIONS: ReadonlySet<string> = new Set(UNICODEMATH_UNDEF_UNARY_FUNCTIONS);
const LROUND_ID = namedSymbolId("lround");
const RROUND_ID = namedSymbolId("rround");

/**
 * `Constants::SUB_DIGITS.key(entity)`, inverted from the ONE generated array:
 * `Constants::SUB_DIGITS` has no separate keys table because its keys are
 * `"0".."9"` in order, and `UNICODEMATH_SUB_DIGITS[i]` is measured to be the
 * entity for digit `i` (`generated/parser-tables.ts`'s own comment: emitted
 * from `Constants::SUB_DIGITS.values`, and Ruby hashes preserve insertion
 * order). `Hash#key` on a miss is nil, so `:2971` needs a not-found case too.
 */
const SUB_DIGITS_INVERTED = new Map<string, string>(
  UNICODEMATH_SUB_DIGITS.map((entity, index) => [entity, String(index)]),
);

/** `Constants::SUP_DIGITS.key(entity)`, inverted the same way, for `:165`. */
const SUP_DIGITS_INVERTED = new Map<string, string>(
  UNICODEMATH_SUP_DIGITS.map((entity, index) => [entity, String(index)]),
);

function isAFamily(rubyClass: string): ReadonlySet<string> {
  const family = UNICODEMATH_IS_A_CLASSES.get(rubyClass);
  if (family === undefined) {
    throw new Error(`unicodemath transform: no measured is_a? family for "${rubyClass}"`);
  }
  return new Set(family);
}

const IS_FORMULA = isAFamily("Math::Formula");
const IS_BINARY_FUNCTION = isAFamily("Math::Function::BinaryFunction");
const IS_NARY = isAFamily("Math::Function::Nary");
const IS_OVERSET = isAFamily("Math::Function::Overset");
const IS_POWER = isAFamily("Math::Function::Power");
const IS_TERNARY_FUNCTION = isAFamily("Math::Function::TernaryFunction");
const IS_UNARY_FUNCTION = isAFamily("Math::Function::UnaryFunction");
const IS_UNDERSET = isAFamily("Math::Function::Underset");

/* =========================================================================
 * 2. The draft model
 * ---------------------------------------------------------------------- */

/**
 * One mutable stand-in for a Ruby node under construction. `fields` holds the
 * ivars the class's `initialize` actually assigned — measured per class, never
 * read off the source — under their TypeScript names, and stays mutable until
 * `finalize`. `identity` is the Ruby basename an alias carrier rides under
 * (`Power`, `Paren::Lround`), matching the core carriers' `name`/`id`.
 */
class UnicodemathDraft {
  constructor(
    readonly kind: NodeKind,
    readonly identity: string | undefined,
    readonly fields: Record<string, unknown>,
  ) {}
}

function isDraft(value: unknown): value is UnicodemathDraft {
  return value instanceof UnicodemathDraft;
}

/**
 * The Ruby class a draft stands for: the carrier's own class, or the alias
 * basename hung under the carrier's identity prefix. This is what the `is_a?`
 * families are keyed by.
 */
function draftRubyClass(draft: UnicodemathDraft): string {
  const spec = NODE_SPECS[draft.kind];
  if (draft.identity === undefined) return spec.rubyClass;
  const identity = spec.identity;
  if (identity === undefined) {
    throw new Error(`unicodemath transform: kind "${draft.kind}" has no identity slot`);
  }
  return `${identity.prefix}::${draft.identity}`;
}

/** Ruby `value.is_a?(Klass)` over one of the measured descendant families. */
function isA(value: unknown, family: ReadonlySet<string>): value is UnicodemathDraft {
  return isDraft(value) && family.has(draftRubyClass(value));
}

/**
 * `Core#class_name` (`core.rb:28`): `self.class.name.split("::").last.downcase`.
 *
 * Refuses anything that is not a draft, where Ruby raises `NoMethodError` —
 * `transform.rb:1019` and `:1116` call it on a binding that could still be a
 * slice — and refuses the `ul` kind, the one class in the gem that overrides
 * the method (`function/ul.rb:56`, returning `"underline"`) and one this slice
 * can never build.
 */
function className(value: unknown): string {
  if (!isDraft(value)) {
    throw new TypeError(
      `unicodemath transform: class_name on a ${typeof value} (Ruby raises NoMethodError)`,
    );
  }
  if (value.kind === "ul") {
    throw new Error('unicodemath transform: Ul overrides class_name to "underline"');
  }
  const parts = draftRubyClass(value).split("::");
  return (parts[parts.length - 1] as string).toLowerCase();
}

/** `Core#value` — only `Formula`, `Number` and `Symbol` answer it. */
function draftValue(value: unknown): unknown {
  if (isDraft(value) && (value.kind === "formula" || value.kind === "number" || isSymbol(value))) {
    return value.fields.value ?? null;
  }
  throw new TypeError("unicodemath transform: #value on a node that has none (NoMethodError)");
}

function isSymbol(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && value.kind === "symbol";
}

function isFenced(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && value.kind === "fenced";
}

function isFormulaDraft(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && value.kind === "formula";
}

/** A formula draft's live `value` array. */
function formulaValue(draft: UnicodemathDraft): unknown[] {
  return draft.fields.value as unknown[];
}

/** Ruby's "argument omitted": `undefined` takes the default, `null` is nil. */
function orNil(value: unknown): unknown {
  return value === undefined ? null : value;
}

/** A `UnaryFunction` constructor converts a Slice argument to its text. */
function sliceToText(value: unknown): unknown {
  return value instanceof Slice ? value.text : value;
}

/**
 * `Math::Formula.new(value = [], left_right_wrapper = true)`
 * (`formula.rb:38-48`): a non-array is wrapped, the array itself is stored by
 * reference, and `displaystyle` is assigned true. `input_string` stays
 * unassigned — `Plurimath::Math.parse_formula` adds it at the very end.
 *
 * The `left_right_wrapper = false if @value.first.is_a?(Function::Left)` line
 * is unreachable from UnicodeMath (see the header), so `leftRightWrapper` is
 * stored as given.
 */
function newFormula(value: unknown = [], leftRightWrapper: unknown = true): UnicodemathDraft {
  const list = Array.isArray(value) ? value : [value];
  return new UnicodemathDraft("formula", undefined, {
    value: list,
    leftRightWrapper,
    displaystyle: true,
  });
}

/** `Math::Number.new(value)` — Slice value to text, mini flags false, base nil. */
function newNumber(value: unknown): UnicodemathDraft {
  return new UnicodemathDraft("number", undefined, {
    value: sliceToText(orNil(value)),
    miniSubSized: false,
    miniSupSized: false,
    base: null,
  });
}

/** A symbol class resolved from a table: `klass.new` — `@value` assigned nil. */
function newSymbolOfClass(id: string): UnicodemathDraft {
  return new UnicodemathDraft("symbol", id, { value: null });
}

/**
 * `Math::Symbols::Symbol.new(sym)` (`symbols/symbol.rb:16`): `@value =
 * sym.is_a?(Array) ? sym.join : sym&.to_s`. Only `@value` is assigned — the
 * other four ivars are guarded and stay unassigned.
 */
function newBareSymbol(value: unknown): UnicodemathDraft {
  const text = Array.isArray(value) ? value.map(rubyToS).join("") : rubyToS(value);
  return new UnicodemathDraft("symbol", "Symbol", { value: text });
}

function unaryDraft(kind: NodeKind, identity: string | undefined, one: unknown): UnicodemathDraft {
  return new UnicodemathDraft(kind, identity, { parameterOne: sliceToText(orNil(one)) });
}

function binaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  one: unknown,
  two: unknown,
  options?: NodeOptions,
): UnicodemathDraft {
  const fields: Record<string, unknown> = { parameterOne: orNil(one), parameterTwo: orNil(two) };
  if (options !== undefined) fields.options = options;
  return new UnicodemathDraft(kind, identity, fields);
}

function ternaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  one: unknown,
  two: unknown,
  three: unknown,
): UnicodemathDraft {
  return new UnicodemathDraft(kind, identity, {
    parameterOne: orNil(one),
    parameterTwo: orNil(two),
    parameterThree: orNil(three),
  });
}

/** `Text.new(parameter_one = "")` — `@lang` is always assigned, always nil here. */
function newText(one: unknown): UnicodemathDraft {
  return new UnicodemathDraft("text", undefined, {
    parameterOne: one === undefined ? "" : sliceToText(one),
    lang: null,
  });
}

/**
 * `Underset.new(p1, p2, options = {})` — the ONE option-carrying constructor
 * that assigns `@options` even when the caller passes nothing (measured: a
 * zero-argument `Underset` has `@options == {}`, while `Overset`, `Frac`,
 * `Base` and `Color` leave theirs unassigned).
 */
function newUnderset(one: unknown, two: unknown, options: NodeOptions = {}): UnicodemathDraft {
  return binaryDraft("underset", undefined, one, two, options);
}

/** `Fenced.new(p1, p2, p3, options = {})` — `@options` always assigned. */
function newFenced(one: unknown, two: unknown, three: unknown): UnicodemathDraft {
  const draft = ternaryDraft("fenced", undefined, one, two, three);
  draft.fields.options = {};
  return draft;
}

/** `Nary.new(p1, p2, p3, p4, options = {})` — `@options` always assigned. */
function newNary(one: unknown, two: unknown, three: unknown, four: unknown): UnicodemathDraft {
  return new UnicodemathDraft("nary", undefined, {
    parameterOne: orNil(one),
    parameterTwo: orNil(two),
    parameterThree: orNil(three),
    parameterFour: orNil(four),
    options: {},
  });
}

/* =========================================================================
 * 3. The Utility helpers the rules call
 * ---------------------------------------------------------------------- */

/**
 * `Utility.symbols_class(string, lang: :unicodemath)` (`utility.rb:212-218`):
 * a non-string argument comes back unchanged; otherwise the STRIPPED text is
 * looked up and the class instantiated with no arguments, and a miss falls back
 * to a bare `Symbol` carrying the original text.
 */
function symbolsClass(value: unknown): unknown {
  if (!(typeof value === "string" || value instanceof Slice)) return value;
  const id = UNICODEMATH_SYMBOL_CLASS_INPUT.get(rubyStrip(rubyToS(value)));
  return id === undefined ? newBareSymbol(value) : newSymbolOfClass(id);
}

/**
 * `Utility.filter_values(array, new_formula: true)` (`utility.rb:192-200`),
 * whose return SHAPE — formula, lone element, nil — decides what the caller
 * builds. A `Formula` input contributes its LIVE value array.
 */
function filterValues(value: unknown, newFormula = true): unknown {
  if (!Array.isArray(value) && !isFormulaDraft(value)) return value;
  const array = isFormulaDraft(value) ? formulaValue(value) : compact(flattenDeep(value));
  if (array.length > 1) return newFormula ? newFormulaOf(array) : array;
  return array.length === 0 ? null : array[0];
}

function newFormulaOf(value: unknown[]): UnicodemathDraft {
  return newFormula(value);
}

/**
 * `Utility.valid_paren?(object)` (`utility.rb:270-279`): round parens, neither
 * of them mini-sized, and an EMPTY options hash. The `options.keys.none?` test
 * for `open_paren`/`close_paren` is subsumed by the `options.empty?` test that
 * follows it in the same expression; both are transcribed because both are
 * there.
 */
function validParen(fenced: UnicodemathDraft): boolean {
  const one = fenced.fields.parameterOne;
  const three = fenced.fields.parameterThree;
  const options = fenced.fields.options;
  if (!(isSymbol(one) && one.identity === LROUND_ID)) return false;
  if (!(isSymbol(three) && three.identity === RROUND_ID)) return false;
  const keys = isPlainObject(options) ? Object.keys(options) : [];
  if (keys.some((key) => key === "open_paren" || key === "close_paren")) return false;
  if (rubyTruthy(one.fields.miniSupSized)) return false;
  if (rubyTruthy(three.fields.miniSubSized)) return false;
  return keys.length === 0;
}

/** `Utility.unfenced_value(object, paren_specific:)` (`utility.rb:255-268`). */
function unfencedValue(object: unknown, parenSpecific: boolean): unknown {
  if (isFenced(object)) {
    if (!parenSpecific || validParen(object)) return filterValues(object.fields.parameterTwo);
    return object;
  }
  if (Array.isArray(object)) return filterValues(object);
  return object;
}

/**
 * `Utility.get_class(text)` through the explicit registry (`./registry`).
 * A miss throws, which is where the gem raises `NameError`.
 */
function getClass(name: unknown): UnicodemathClassEntry {
  const key = rubyToS(name);
  const entry = UNICODEMATH_CLASS_REGISTRY.get(key);
  if (entry === undefined) {
    throw new Error(`unicodemath transform: no class registered for "${key}"`);
  }
  return entry;
}

/** `.new` on what `get_class` resolved, honouring that class's initialize. */
function buildClass(name: unknown, ...args: unknown[]): UnicodemathDraft {
  const entry = getClass(name);
  switch (entry.family) {
    case "unary":
      return unaryDraft(entry.kind, entry.name, args[0]);
    case "binary":
      return binaryDraft(entry.kind, entry.name, args[0], args[1]);
    case "ternary":
      return ternaryDraft(entry.kind, entry.name, args[0], args[1], args[2]);
    default:
      throw new Error(`unicodemath transform: "${rubyToS(name)}" has no constructible family`);
  }
}

/**
 * `Utility::FONT_STYLES[fonts.to_sym].new(value)` (`transform.rb:236`), with
 * the subclass's own default `parameter_two`. The gem has no nil guard here, so
 * a text with no entry raises `NoMethodError`; generation proves there is none,
 * and this throws where that would land.
 */
function newFontStyle(fonts: unknown, one: unknown): UnicodemathDraft {
  const keyword = rubyToS(fonts);
  const style = UNICODEMATH_FONT_STYLES.get(keyword);
  if (style === undefined) {
    throw new Error(`unicodemath transform: no FONT_STYLES entry for "${keyword}"`);
  }
  return binaryDraft("fontStyle", style.name, one, style.keyword);
}

/**
 * `Utility.symbol_prime?(obj)` (`unicode_math/utility.rb:186-189`):
 * `obj&.class&.const_defined?(:INPUT)` is true for exactly the symbol classes
 * (measured: `Math::Symbols::Symbol` defines `INPUT` and every subclass
 * inherits it; `Math::Number` and the function classes do not), and
 * `hexcode_in_input` is the generated per-class entity.
 */
function symbolPrime(value: unknown): boolean {
  if (!isSymbol(value) || value.identity === undefined) return false;
  const hexcode = UNICODEMATH_HEXCODE_IN_INPUT.get(value.identity);
  return hexcode !== undefined && PRIMES_INVERTED.has(hexcode);
}

/**
 * `Utility.base_is_prime?(base)` (`unicode_math/utility.rb:181-184`). The
 * second arm reads `.value` unguarded, so a `Power` whose exponent is a
 * function node raises `NoMethodError` in the gem; `draftValue` throws there.
 */
function baseIsPrime(base: UnicodemathDraft): boolean {
  const two = base.fields.parameterTwo;
  if (symbolPrime(two)) return true;
  return PRIMES_INVERTED.has(rubyToS(draftValue(two)));
}

/**
 * `UnicodeMath::Utility.fractions(numerator, denominator, options = nil)`
 * (`unicode_math/utility.rb:86-104`) and its `recursion_fraction` helper.
 *
 * The denominator is MUTATED when it is already a `Frac`: its `parameter_one`
 * is replaced by a new `Frac` built from the numerator, and the same (mutated)
 * denominator is returned. That is what makes `(a)/(b)/(c)` left-nest.
 */
function fractions(numerator: unknown, denominator: unknown, options?: NodeOptions): unknown {
  if (isFrac(denominator)) {
    if (isFrac(denominator.fields.parameterOne)) {
      recursionFraction(denominator, numerator, options);
    } else {
      denominator.fields.parameterOne = newFrac(
        unfencedValue(numerator, true),
        unfencedValue(denominator.fields.parameterOne, true),
        options,
      );
    }
    return denominator;
  }
  return newFrac(unfencedValue(numerator, true), unfencedValue(denominator, true), options);
}

function recursionFraction(
  frac: UnicodemathDraft,
  numerator: unknown,
  options: NodeOptions | undefined,
): unknown {
  const newNumerator = frac.fields.parameterOne;
  if (isFrac(newNumerator)) return recursionFraction(newNumerator, numerator, options);
  frac.fields.parameterOne = newFrac(
    unfencedValue(numerator, true),
    unfencedValue(frac.fields.parameterOne, true),
    options,
  );
  return frac;
}

function isFrac(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && value.kind === "frac";
}

/** `Frac.new(p1, p2, options = nil)` — `@options` assigned only when passed. */
function newFrac(one: unknown, two: unknown, options?: NodeOptions): UnicodemathDraft {
  return binaryDraft("frac", undefined, one, two, options);
}

/**
 * `UnicodeMath::Utility.updated_primes(prime)` (`unicode_math/utility.rb:78-84`)
 * — every `&#x...;` entity in the text, each through `symbols_class`, folded by
 * `filter_values`. `UNICODE_REGEX` is `%r{&#x[a-zA-Z0-9]+;}` (`utility.rb:6`).
 */
const UNICODE_REGEX = /&#x[a-zA-Z0-9]+;/g;

function updatedPrimes(prime: unknown): unknown {
  const matches = rubyToS(prime).match(UNICODE_REGEX) ?? [];
  return filterValues(matches.map((text) => symbolsClass(text)));
}

/**
 * `UnicodeMath::Utility.accent_value(accent, lang:)`
 * (`unicode_math/utility.rb:59-66`).
 */
function accentValue(accent: Record<string, unknown>): unknown {
  if (rubyTruthy(accent.accent_symbols)) {
    const text = rubyToS(accent.accent_symbols);
    return symbolsClass(UNICODEMATH_ACCENT_SYMBOLS.get(text) ?? accent.accent_symbols);
  }
  return rubyTruthy(accent.first_value)
    ? accent.first_value
    : updatedPrimes(accent.prime_accent_symbols);
}

/**
 * `UnicodeMath::Utility.transform_accents(accents, lang:)`
 * (`unicode_math/utility.rb:25-56`).
 *
 * `reduce` with no initial value: a one-element array returns that element
 * WITHOUT running the block, which is why a single accent hash can reach a
 * caller unchanged. The block's two arms differ only in whether the
 * accumulator is still a raw hash (the first fold) or an already-built node.
 */
function transformAccents(accents: readonly unknown[]): unknown {
  if (accents.length === 0) return null;
  let fn = accents[0];
  for (let index = 1; index < accents.length; index++) {
    const accent = accents[index];
    if (isPlainObject(fn)) {
      const carrier = fn;
      fn = rubyTruthy(carrier.prime_accent_symbols)
        ? newPower(
            unfencedValue(accentValue(carrier), true),
            accentValue(asAccentHash(accent, "accent")),
          )
        : newOverset(
            accentValue(asAccentHash(accent, "accent")),
            unfencedValue(accentValue(carrier), true),
            { accent: true },
          );
      continue;
    }
    const hash = asAccentHash(accent, "accent");
    fn = rubyTruthy(hash.prime_accent_symbols)
      ? newPower(unfencedValue(fn, true), accentValue(hash))
      : newOverset(accentValue(hash), unfencedValue(fn, true), { accent: true });
  }
  return fn;
}

function asAccentHash(value: unknown, where: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(
      `unicodemath transform: ${where} is not a hash (Ruby raises NoMethodError)`,
    );
  }
  return value;
}

/**
 * `UnicodeMath::Utility.unicode_accents(accents, lang:)`
 * (`unicode_math/utility.rb:9-22`).
 *
 * The middle branch MUTATES the caller's tree: it `pop`s the last element off
 * the first accent's `first_value` array, writes the popped element back as
 * that key's value, and prepends the rest of the array to the folded result.
 * Transcribed rather than tidied.
 */
function unicodeAccents(accents: unknown): unknown {
  if (isA(accents, IS_BINARY_FUNCTION)) return accents;
  if (!Array.isArray(accents)) {
    throw new TypeError(
      "unicodemath transform: accents is not an Array (Ruby raises NoMethodError)",
    );
  }
  const carriesArray = accents.some((accent) => {
    if (accent === null || accent === undefined) return false;
    return Array.isArray(asAccentHash(accent, "accents entry").first_value);
  });
  if (carriesArray) {
    const first = asAccentHash(accents[0], "accents[0]");
    const values = first.first_value as unknown[];
    const accentValueOf = values.pop();
    first.first_value = accentValueOf;
    return newFormula([...values, transformAccents(accents)]);
  }
  return transformAccents(accents);
}

/* --- the node builders the rules name directly ------------------------- */

/** `Math::Function::Power.new(p1, p2)` — an alias on `BinaryFunction`. */
function newPower(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Power", one, two);
}

/** `Math::Function::Base.new(p1, p2)` — `@options` unassigned at two args. */
function newBase(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("base", undefined, one, two);
}

/**
 * `Math::Function::PowerBase.new(p1, p2 = nil, p3 = nil)` — an alias on
 * `TernaryFunction`. The MULTISCRIPT rules are the first callers to omit `p2`
 * and/or `p3`; `orNil` inside `ternaryDraft` already turns the resulting
 * `undefined` into the same nil Ruby's default would leave.
 */
function newPowerBase(one: unknown, two?: unknown, three?: unknown): UnicodemathDraft {
  return ternaryDraft("ternaryFunction", "PowerBase", one, two, three);
}

/**
 * `Math::Function::Multiscript.new(p1, p2, p3)` — an alias on `TernaryFunction`.
 * `p2`/`p3` are the prescript sub/superscript ARRAYS (`[]` when absent, never
 * nil — every ported rule passes one), `p1` the `PowerBase` the real base and
 * any trailing (non-prescript) sub/sup build.
 */
function newMultiscript(one: unknown, two: unknown, three: unknown): UnicodemathDraft {
  return ternaryDraft("ternaryFunction", "Multiscript", one, two, three);
}

/** `Math::Function::Underover.new(p1, p2, p3)` — an alias on `TernaryFunction`. */
function newUnderover(one: unknown, two: unknown, three: unknown): UnicodemathDraft {
  return ternaryDraft("ternaryFunction", "Underover", one, two, three);
}

/** `Math::Function::Overset.new(p1, p2, options = nil)`. */
function newOverset(one: unknown, two: unknown, options?: NodeOptions): UnicodemathDraft {
  return binaryDraft("overset", undefined, one, two, options);
}

/** `Math::Function::Root.new(p1, p2)` — an alias on `BinaryFunction`. */
function newRoot(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Root", one, two);
}

/** `Math::Function::Sqrt.new(p1)` — a `UnaryFunction`, so a Slice becomes text. */
function newSqrt(one: unknown): UnicodemathDraft {
  return unaryDraft("sqrt", undefined, one);
}

/** `Math::Function::Abs.new(p1)` — a `UnaryFunction`, so a Slice becomes text. */
function newAbs(one: unknown): UnicodemathDraft {
  return unaryDraft("abs", undefined, one);
}

/** `Math::Function::Color.new(p1, p2)`. */
function newColor(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("color", undefined, one, two);
}

/** `Math::Function::Menclose.new(p1, p2)` — an alias on `BinaryFunction`. */
function newMenclose(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Menclose", one, two);
}

/** `Math::Function::Mod.new(p1, p2)` — an alias on `BinaryFunction`. */
function newMod(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Mod", one, two);
}

/**
 * The n-ary name `transform.rb:1968` and `:2806` both compute before deciding
 * which constructor to use: the captured text when it is already a
 * `NARY_CLASSES` key, else the key its entity inverts to, else the
 * `NARY_SYMBOLS` entity for it, else the text itself.
 */
function naryFunctionName(naryClass: unknown): unknown {
  const text = rubyToS(naryClass);
  if (UNICODEMATH_NARY_CLASSES.has(text)) return naryClass;
  return NARY_CLASSES_INVERTED.get(text) ?? NARY_SYMBOLS.get(text) ?? naryClass;
}

/**
 * `digit = Constants::SUB_DIGITS.key(digits).to_s; Math::Number.new(digit,
 * mini_sub_sized: true)` — shared by `:170`'s standalone unwrap and `:2971`'s
 * compound `{pre_subscript:, base:, sub_digits:}` shape, both resolving a
 * trailing SUB_DIGITS unicode digit back to its plain-text key, mini-sized.
 */
function subDigitNumber(digits: unknown): UnicodemathDraft {
  const digit = SUB_DIGITS_INVERTED.get(rubyToS(digits)) ?? "";
  return new UnicodemathDraft("number", undefined, {
    value: digit,
    miniSubSized: true,
    miniSupSized: false,
    base: null,
  });
}

/** `:165`'s SUP_DIGITS twin of `subDigitNumber`, mini-sup-sized instead. */
function supDigitNumber(digits: unknown): UnicodemathDraft {
  const digit = SUP_DIGITS_INVERTED.get(rubyToS(digits)) ?? "";
  return new UnicodemathDraft("number", undefined, {
    value: digit,
    miniSubSized: false,
    miniSupSized: true,
    base: null,
  });
}

function asArray(value: TransformValue): unknown[] {
  return value as unknown[];
}

/* =========================================================================
 * 4. The rules, in unicode_math/transform.rb order — ONE Transform instance
 * ---------------------------------------------------------------------- */

/** How many rules this module registers, so a coverage spec can pin it. */
export interface UnicodemathTransformBuild {
  readonly transform: Transform;
  /** Rule id -> how many times its action has run, for the coverage spec. */
  readonly fired: Map<string, number>;
  readonly ruleIds: readonly string[];
}

/**
 * Builds the transform.
 *
 * Every rule is registered through a local `rule` wrapper that tags it with the
 * `transform.rb` line its `rule(` opens on and counts its firings. The counter
 * is what `test/formats/unicodemath/transform-coverage.spec.ts` uses to prove
 * the fixture set actually exercises each ported rule.
 *
 * The ids are the `rule(` lines, not the block's `source_location` — Ruby
 * reports the line carrying the block opener, which for a multi-line header is
 * some way further down: measured offsets on the pinned gem run to six, with
 * `:3978`'s block reporting 3984.
 */
export function buildUnicodemathTransform(): UnicodemathTransformBuild {
  const t = new Transform();
  const fired = new Map<string, number>();
  const ruleIds: string[] = [];

  const rule = (
    id: string,
    pattern: Parameters<Transform["rule"]>[0],
    action: Parameters<Transform["rule"]>[1],
  ): void => {
    if (fired.has(id)) throw new Error(`unicodemath transform: duplicate rule id ${id}`);
    fired.set(id, 0);
    ruleIds.push(id);
    t.rule(pattern, (bindings) => {
      fired.set(id, (fired.get(id) as number) + 1);
      return action(bindings);
    });
  };

  // --- pass-through and leaf rules (transform.rb:13-170) -----------------

  rule("13", { exp: simple("exp") }, (b) => b.exp);
  rule("18", { atom: simple("atom") }, (b) => b.atom);
  rule("20", { nary: simple("nary") }, (b) => b.nary);
  rule("21", { char: simple("char") }, (b) => b.char);
  rule("22", { expr: simple("expr") }, (b) => b.expr);
  rule("23", { frac: simple("frac") }, (b) => b.frac);
  rule("24", { root: simple("root") }, (b) => b.root);
  rule("25", { text: simple("text") }, (b) => newText(b.text));
  rule("27", { sub_exp: simple("exp") }, (b) => b.exp);
  rule("28", { sup_exp: simple("exp") }, (b) => b.exp);
  rule("29", { int_exp: simple("exp") }, (b) => b.exp);
  rule("33", { fonts: simple("fonts") }, (b) => b.fonts);
  rule("34", { digit: simple("digit") }, (b) => b.digit);
  rule("35", { color: simple("color") }, (b) => b.color);
  rule("39", { factor: simple("factor") }, (b) => b.factor);
  rule("44", { symbol: simple("symbol") }, (b) => symbolsClass(b.symbol));
  rule("45", { number: simple("number") }, (b) => newNumber(b.number));
  rule("50", { operand: simple("operand") }, (b) => b.operand);
  rule("52", { accents: subtree("accent") }, (b) => unicodeAccents(b.accent));
  rule("55", { sub_script: simple("script") }, (b) => b.script);
  rule("56", { sup_script: simple("script") }, (b) => b.script);
  // Every MULTISCRIPT rule below (`:1992` on) is reached through the grammar's
  // `pre_script` wrapper, so this unwrap fires once per one of them, exactly
  // like `:55`/`:56` do for `sub_exp`/`sup_exp`.
  rule("57", { pre_script: simple("script") }, (b) => b.script);
  rule("61", { close_paren: simple("paren") }, (b) => symbolsClass(b.paren));
  rule("62", { operator: simple("operator") }, (b) => symbolsClass(b.operator));
  rule("68", { monospace: simple("monospace") }, (b) => b.monospace);
  rule("71", { intermediate_exp: simple("expr") }, (b) => b.expr);
  rule("72", { decimal_number: simple("number") }, (b) => b.number);
  rule("74", { subsup_exp: simple("subsup_exp") }, (b) => b.subsup_exp);
  rule("76", { open_paren: simple("open_paren") }, (b) => symbolsClass(b.open_paren));
  rule("82", { unary_function: simple("function") }, (b) => b.function);
  rule("90", { unary_subsup: simple("unary_subsup") }, (b) => b.unary_subsup);
  rule("92", { alphanumeric: simple("alphanumeric") }, (b) => symbolsClass(b.alphanumeric));

  rule("126", { unary_functions: simple("unary") }, (b) =>
    UNDEF_UNARY_FUNCTIONS.has(rubyToS(b.unary)) ? symbolsClass(b.unary) : buildClass(b.unary),
  );

  rule("141", { ordinary_symbols: simple("ordinary") }, (b) => symbolsClass(b.ordinary));
  rule("145", { relational_symbols: simple("symbol") }, (b) => symbolsClass(b.symbol));
  rule("149", { unicode_symbols: simple("unicode_symbols") }, (b) =>
    symbolsClass(b.unicode_symbols),
  );

  // `FontStyle::Monospace.new(value)` names the class directly, so it takes
  // that subclass's own default `parameter_two` ("monospace", measured).
  rule("153", { monospace_value: simple("monospace_value") }, (b) =>
    newFontStyle("mtt", b.monospace_value),
  );

  // FRACTION's mini variant (`:1614`) needs its numerator and denominator
  // pre-resolved to a `simple` value, and the grammar leaves a single sup/sub
  // digit as `{sup_digits: Slice}`/`{sub_digits: Slice}` until one of these
  // fires. `subDigitNumber` arrives earlier in this same branch, with the
  // MULTISCRIPT family, where `:2971`'s compound shape needs it; nothing on
  // `main` has either helper. `supDigitNumber` is its sup-side twin, added
  // here. Both are a `Constants::SUP_DIGITS`/`SUB_DIGITS` reverse lookup over
  // tables the generated data already carries.
  rule("165", { sup_digits: simple("digits") }, (b) => supDigitNumber(b.digits));
  rule("170", { sub_digits: simple("digits") }, (b) => subDigitNumber(b.digits));

  // --- two-key rules (transform.rb:236-2001) -----------------------------

  rule("236", { font_class: simple("fonts"), symbol: simple("symbol") }, (b) =>
    newFontStyle(b.fonts, symbolsClass(b.symbol)),
  );

  rule("260", { binary_symbols: simple("symbols"), expr: simple("expr") }, (b) => {
    const symbol = BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols;
    return [symbolsClass(symbol), b.expr];
  });

  rule("391", { unary_subsup: simple("subsup"), expr: simple("expr") }, (b) => [b.subsup, b.expr]);
  rule("416", { fonts: simple("fonts"), expr: sequence("expr") }, (b) => [
    b.fonts,
    ...asArray(b.expr),
  ]);
  rule("421", { fonts: simple("fonts"), expr: simple("expr") }, (b) => [b.fonts, b.expr]);
  rule("446", { operator: simple("operator"), expr: simple("expr") }, (b) => [
    symbolsClass(b.operator),
    b.expr,
  ]);
  rule("461", { operator: simple("operator"), exp: simple("exp") }, (b) => [
    symbolsClass(b.operator),
    b.exp,
  ]);
  rule("471", { unicode_symbols: simple("unicode_symbols"), expr: simple("expr") }, (b) => [
    symbolsClass(b.unicode_symbols),
    b.expr,
  ]);
  rule("501", { operator: simple("operator"), expr: sequence("expr") }, (b) => [
    symbolsClass(b.operator),
    ...asArray(b.expr),
  ]);
  rule("506", { operator: simple("operator"), exp: sequence("exp") }, (b) => [
    symbolsClass(b.operator),
    ...asArray(b.exp),
  ]);
  rule("735", { factor: simple("factor"), operand: simple("operand") }, (b) => [
    b.factor,
    b.operand,
  ]);
  rule("740", { factor: simple("factor"), unary_subsup: simple("subsup") }, (b) => [
    b.factor,
    b.subsup,
  ]);
  rule("825", { sup_exp: simple("sup_exp"), expr: sequence("expr") }, (b) => [
    b.sup_exp,
    ...asArray(b.expr),
  ]);
  rule("835", { factor: simple("factor"), expr: simple("expr") }, (b) => [b.factor, b.expr]);
  rule("865", { factor: simple("factor"), expr: sequence("expr") }, (b) => [
    b.factor,
    ...asArray(b.expr),
  ]);
  // `:846` has this exact signature and is DEAD: `rule` unshifts, so this
  // later definition wins every tie. See the header.
  rule("870", { factor: simple("factor"), exp: sequence("exp") }, (b) => [
    b.factor,
    ...asArray(b.exp),
  ]);
  rule("875", { factor: simple("factor"), exp: simple("exp") }, (b) => [b.factor, b.exp]);

  rule("1019", { base: simple("base"), sub: simple("sub") }, (b) => {
    const base = b.base;
    const sub = b.sub;
    if (BINARY_FUNCTION_NAMES.has(className(base)) && !rubyTruthy(fieldOf(base, "parameterOne"))) {
      setField(
        base,
        "parameterOne",
        className(sub) === "underset" ? fieldOf(sub, "parameterOne") : unfencedValue(sub, true),
      );
      return base;
    }
    if (className(sub) === "underset") {
      setField(sub, "parameterTwo", base);
      return sub;
    }
    if (isA(base, IS_POWER) && baseIsPrime(base)) {
      return newPowerBase(fieldOf(base, "parameterOne"), sub, fieldOf(base, "parameterTwo"));
    }
    const undersetBracket =
      isA(base, IS_UNDERSET) &&
      HORIZONTAL_BRACKETS_INVERTED.has(rubyToS(draftValue(fieldOf(base, "parameterOne"))));
    const ubraceLiteral =
      className(base) === "ubrace" && !isA(fieldOf(base, "parameterOne"), IS_FORMULA);
    if (undersetBracket || ubraceLiteral) {
      return newUnderset(unfencedValue(sub, true), base);
    }
    return newBase(base, unfencedValue(sub, true));
  });

  rule("1097", { root_symbol: simple("root_symbol"), first_value: simple("first_value") }, (b) => {
    const value = unfencedValue(b.first_value, true);
    if (textEquals(b.root_symbol, "&#x221b;") || textEquals(b.root_symbol, "\\cbrt")) {
      return newRoot(newNumber("3"), value);
    }
    if (textEquals(b.root_symbol, "&#x221c;") || textEquals(b.root_symbol, "\\qdrt")) {
      return newRoot(newNumber("4"), value);
    }
    return newSqrt(value);
  });

  rule("1116", { base: simple("base"), sup: simple("sup") }, (b) => {
    const base = b.base;
    const sup = b.sup;
    if (className(sup) === "overset" && !rubyTruthy(fieldOf(sup, "parameterTwo"))) {
      setField(sup, "parameterTwo", unfencedValue(base, true));
      return sup;
    }
    if (BINARY_FUNCTION_NAMES.has(className(base)) && !rubyTruthy(fieldOf(base, "parameterOne"))) {
      setField(base, "parameterTwo", unfencedValue(sup, true));
      return base;
    }
    const oversetBracket =
      isA(base, IS_OVERSET) &&
      HORIZONTAL_BRACKETS_INVERTED.has(rubyToS(draftValue(fieldOf(base, "parameterOne"))));
    if (oversetBracket || className(base) === "obrace") {
      return newOverset(unfencedValue(sup, true), base);
    }
    return newPower(base, unfencedValue(sup, true));
  });

  rule("1173", { unary_sub_sup: simple("sub_sup"), first_value: simple("first_value") }, (b) => {
    const subSup = b.sub_sup;
    if (isA(subSup, IS_UNARY_FUNCTION)) {
      const inner = fieldOf(subSup, "parameterOne");
      setField(inner, "parameterOne", b.first_value);
      return subSup;
    }
    return newFormula([subSup, b.first_value]);
  });

  rule("1193", { color_value: simple("color"), first_value: simple("first_value") }, (b) =>
    newColor(newBareSymbol(b.color), b.first_value),
  );

  rule(
    "1209",
    { unary_arg_functions: simple("function"), first_value: simple("first_value") },
    (b) => {
      const value = unfencedValue(b.first_value, true);
      if (textEquals(b.function, "abs") || textEquals(b.function, "&#x249c;")) return newAbs(value);
      const text = rubyToS(b.function);
      const unary = UNARY_ARG_FUNCTIONS_INVERTED.get(text) ?? text;
      return newMenclose(UNICODEMATH_MENCLOSE_FUNCTIONS.get(unary) ?? null, value);
    },
  );

  rule(
    "1522",
    { first_value: simple("first_value"), second_value: sequence("second_value") },
    (b) => newRoot(b.first_value, unfencedValue(b.second_value, true)),
  );

  rule("1547", { unary_functions: simple("unary"), first_value: simple("first_value") }, (b) => {
    if (UNDEF_UNARY_FUNCTIONS.has(rubyToS(b.unary))) {
      return newFormula([symbolsClass(b.unary), b.first_value]);
    }
    if (textEquals(b.unary, "mod")) return newMod(null, b.first_value);
    return buildClass(b.unary, b.first_value);
  });

  rule("1609", { numerator: simple("numerator"), denominator: simple("denominator") }, (b) =>
    fractions(b.numerator, b.denominator),
  );

  // FRACTION, second increment (`transform.rb:1614`-`:2377`): `:1609` above is
  // the plain, option-free shape the corpus already reaches; these six are its
  // option-carrying siblings, each still `numerator: simple, denominator:
  // simple` so none needs the `atoms`/`recursive_numerator` combinator the
  // other ten `Utility.fractions` call sites depend on (deferred; see the
  // header).
  rule(
    "1614",
    { mini_numerator: simple("numerator"), mini_denominator: simple("denominator") },
    (b) => fractions(b.numerator, b.denominator, { displaystyle: false }),
  );

  rule("1806", { expr: simple("expr"), func_expr: simple("func_expr") }, (b) => [
    b.expr,
    b.func_expr,
  ]);
  rule("1811", { expr: simple("expr"), func_expr: sequence("func_expr") }, (b) => [
    b.expr,
    ...asArray(b.func_expr),
  ]);
  rule("1816", { frac: simple("frac"), expr: sequence("expr") }, (b) => [
    b.frac,
    ...asArray(b.expr),
  ]);
  rule("1826", { nary: simple("nary"), expr: sequence("expr") }, (b) => [
    b.nary,
    ...asArray(b.expr),
  ]);

  rule("1861", { nary_sub_sup: simple("subsup_exp"), naryand: simple("naryand") }, (b) => {
    const subsup = b.subsup_exp;
    if (isA(subsup, IS_TERNARY_FUNCTION)) {
      setField(subsup, "parameterThree", b.naryand);
      return subsup;
    }
    if (isA(subsup, IS_NARY)) {
      setField(subsup, "parameterFour", b.naryand);
      return subsup;
    }
    return newFormula([subsup, b.naryand]);
  });

  rule("1968", { nary_class: simple("nary_class"), naryand: simple("naryand") }, (b) => {
    const name = naryFunctionName(b.nary_class);
    if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
      const naryValue =
        className(b.naryand) === "underset"
          ? fieldOf(b.naryand, "parameterTwo")
          : unfencedValue(b.naryand, true);
      return buildClass(name, null, null, naryValue);
    }
    return newNary(symbolsClass(name), null, null, b.naryand);
  });

  // MULTISCRIPT (`transform.rb:1992`-`:3978`, thirteen rules counting `:57`
  // above): every prescript expression `Math::Function::Multiscript` — base
  // plus prescript sub/superscript arrays, and optionally a real trailing
  // sub/sup the grammar folds into the `PowerBase` `p1` carries. All twelve
  // constructors below share that shape; only `unfenced_value` and the
  // SUB_DIGITS table (`:2971`) are new, both already established.
  rule("1992", { pre_supscript: simple("pre_sup"), base: simple("base") }, (b) =>
    newMultiscript(newPowerBase(b.base), [], [b.pre_sup]),
  );
  rule("2001", { pre_subscript: simple("pre_sub"), base: simple("base") }, (b) =>
    newMultiscript(newPowerBase(b.base), [b.pre_sub], []),
  );

  // --- three- and four-key rules (transform.rb:2103-3477) ----------------

  rule("2103", { base: simple("base"), sup: simple("sup"), sub: simple("sub") }, (b) => {
    const underover = ["underset", "overset"];
    if (underover.includes(className(b.sub)) && underover.includes(className(b.sup))) {
      return newUnderover(b.base, fieldOf(b.sub, "parameterOne"), fieldOf(b.sup, "parameterOne"));
    }
    return newPowerBase(b.base, unfencedValue(b.sub, true), unfencedValue(b.sup, true));
  });

  // FRACTION continued — `atop` (`\atop`/`&#xa6;`) and `choose` (`\choose`/
  // `&#x249e;`) each add one key to the same `numerator: simple, denominator:
  // simple` shape; `:2203`, `atop`'s SEQUENCE-numerator twin, is deferred with
  // the rest. `choose` alone builds `Fenced`, not `Frac` directly: the gem
  // wraps the Frac in round parens it constructs with no lookup
  // (`Math::Symbols::Paren::Lround.new`/`Rround.new`), which `LROUND_ID`/
  // `RROUND_ID` (declared with the other named-symbol ids above) name here.
  rule(
    "2197",
    {
      numerator: simple("numerator"),
      atop: simple("atop"),
      denominator: simple("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { linethickness: "0" }),
  );

  rule(
    "2209",
    {
      numerator: simple("numerator"),
      choose: simple("choose"),
      denominator: simple("denominator"),
    },
    (b) =>
      newFenced(
        newSymbolOfClass(LROUND_ID),
        [fractions(b.numerator, b.denominator, { linethickness: "0", choose: true })],
        newSymbolOfClass(RROUND_ID),
      ),
  );

  rule(
    "2227",
    { whole: simple("whole"), decimal: simple("decimal"), fractional: simple("fractional") },
    (b) =>
      newNumber(
        htmlEntityToUnicode(
          `${rubyToS(draftValue(b.whole))}${rubyToS(b.decimal)}${rubyToS(draftValue(b.fractional))}`,
        ),
      ),
  );

  // FRACTION concluded — `bevelled` (`\sdiv`/`\sdivide`/`\sfrac`/`&#x2044;`),
  // `ldiv` (`\ldiv`/`&#x2215;`) and `no_display_style` (`\ndiv`/`\oslash`/
  // `&#x2298;`), each still `numerator: simple, denominator: simple`. The last
  // one's options are NOT `{no_display_style: false}` despite the key name:
  // `transform.rb:2377` passes `{displaystyle: false}`, and only its
  // SEQUENCE-denominator twin `:2371` (deferred) passes the differently-named
  // option — measured, not reconciled, because the gem itself is inconsistent
  // between the two.
  rule(
    "2347",
    {
      numerator: simple("numerator"),
      bevelled: simple("bevelled"),
      denominator: simple("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { bevelled: true }),
  );

  rule(
    "2353",
    { numerator: simple("numerator"), ldiv: simple("ldiv"), denominator: simple("denominator") },
    (b) => fractions(b.numerator, b.denominator, { ldiv: true }),
  );

  rule(
    "2377",
    {
      numerator: simple("numerator"),
      no_display_style: simple("no_display_style"),
      denominator: simple("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { displaystyle: false }),
  );

  // `Utility.unfenced_value(operand, ...)` on the first line is computed and
  // DISCARDED — a statement whose value nothing reads (`transform.rb:2438`).
  // It is transcribed because it can still raise; the `Fenced` below is built
  // from the untouched `operand` either way.
  rule(
    "2436",
    { opener: simple("opener"), operand: simple("operand"), closer: simple("closer") },
    (b) => {
      if (textEquals(b.opener, "|") || textEquals(b.closer, "|")) {
        unfencedValue(b.operand, true);
      }
      return newFenced(parenClass(b.opener), [b.operand], parenClass(b.closer));
    },
  );

  rule(
    "2475",
    { open_paren: simple("open_paren"), frac: simple("frac"), close_paren: simple("close_paren") },
    (b) => newFenced(parenClass(b.open_paren), [b.frac], parenClass(b.close_paren)),
  );

  rule(
    "2619",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      close_paren: simple("close_paren"),
    },
    (b) => {
      const bar = textEquals(b.open_paren, "|") || textEquals(b.close_paren, "|");
      const newFactor = bar ? unfencedValue(b.factor, true) : b.factor;
      return newFenced(parenClass(b.open_paren), [newFactor], parenClass(b.close_paren));
    },
  );

  rule(
    "2630",
    {
      open_paren: simple("open_paren"),
      sup_exp: simple("sup_exp"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.sup_exp], parenClass(b.close_paren)),
  );

  rule(
    "2806",
    { nary_class: simple("nary_class"), sub: simple("sub"), sup: simple("sup") },
    (b) => {
      const name = naryFunctionName(b.nary_class);
      if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
        const newSub =
          className(b.sub) === "underset"
            ? fieldOf(b.sub, "parameterOne")
            : unfencedValue(b.sub, true);
        const newSup =
          className(b.sup) === "overset"
            ? fieldOf(b.sup, "parameterOne")
            : unfencedValue(b.sup, true);
        return buildClass(name, newSub, newSup);
      }
      return newNary(
        symbolsClass(name),
        unfencedValue(b.sub, true),
        unfencedValue(b.sup, true),
        undefined,
      );
    },
  );

  // MULTISCRIPT continued — a real trailing sub or sup joins the prescript.
  rule(
    "2938",
    { pre_supscript: simple("pre_sup"), base: simple("base"), sub: simple("sub") },
    (b) => newMultiscript(newPowerBase(b.base, b.sub), [], [b.pre_sup]),
  );
  rule(
    "2948",
    { pre_supscript: simple("pre_sup"), pre_subscript: simple("pre_sub"), base: simple("base") },
    (b) => newMultiscript(newPowerBase(b.base), [b.pre_sub], [b.pre_sup]),
  );
  rule(
    "2958",
    { pre_subscript: simple("pre_sub"), base: simple("base"), sub: simple("sub") },
    (b) => newMultiscript(newPowerBase(b.base, unfencedValue(b.sub, true)), [b.pre_sub], []),
  );
  rule(
    "2971",
    { pre_subscript: simple("pre_sub"), base: simple("base"), sub_digits: simple("digits") },
    (b) => newMultiscript(newPowerBase(b.base, subDigitNumber(b.digits)), [b.pre_sub], []),
  );

  rule(
    "3233",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      exp: simple("exp"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.factor, b.exp], parenClass(b.close_paren)),
  );

  rule(
    "3433",
    {
      open_paren: simple("open_paren"),
      sup_exp: simple("sup_exp"),
      exp: sequence("exp"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        parenClass(b.open_paren),
        [b.sup_exp, ...asArray(b.exp)],
        parenClass(b.close_paren),
      ),
  );

  rule(
    "3477",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      exp: sequence("exp"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(parenClass(b.open_paren), [b.factor, ...asArray(b.exp)], parenClass(b.close_paren)),
  );

  // MULTISCRIPT concluded — both a prescript pair and a paren wrap it, in
  // every combination the grammar builds. `unfenced_value` reaches the
  // prescripts themselves only at `:3662`/`:3853`; `:3687`, `:3768`, `:3952`
  // and `:3978` bind `open_paren`/`close_paren` but never read them, exactly
  // as `:2436` reads `operand` past what its own guard already discarded —
  // transcribed rather than tidied.
  rule(
    "3662",
    {
      pre_subscript: simple("pre_sub"),
      pre_supscript: simple("pre_sup"),
      base: simple("base"),
      sub: simple("sub"),
    },
    (b) =>
      newMultiscript(
        newPowerBase(b.base, unfencedValue(b.sub, true)),
        [unfencedValue(b.pre_sub, true)],
        [unfencedValue(b.pre_sup, true)],
      ),
  );
  rule(
    "3687",
    {
      open_paren: simple("open_paren"),
      pre_subscript: simple("pre_sub"),
      close_paren: simple("close_paren"),
      base: simple("base"),
    },
    (b) => newMultiscript(newPowerBase(b.base), [b.pre_sub], []),
  );
  rule(
    "3768",
    {
      open_paren: simple("open_paren"),
      pre_subscript: simple("pre_sub"),
      close_paren: simple("close_paren"),
      base: simple("base"),
      sub: simple("sub"),
    },
    (b) => newMultiscript(newPowerBase(b.base, b.sub), [b.pre_sub], []),
  );
  rule(
    "3853",
    {
      pre_subscript: simple("pre_sub"),
      pre_supscript: simple("pre_sup"),
      base: simple("base"),
      sub: simple("sub"),
      sup: simple("sup"),
    },
    (b) =>
      newMultiscript(
        newPowerBase(b.base, unfencedValue(b.sub, true), unfencedValue(b.sup, true)),
        [unfencedValue(b.pre_sub, true)],
        [unfencedValue(b.pre_sup, true)],
      ),
  );
  rule(
    "3952",
    {
      open_paren: simple("open_paren"),
      pre_subscript: simple("pre_sub"),
      pre_supscript: simple("pre_sup"),
      close_paren: simple("close_paren"),
      base: simple("base"),
    },
    (b) => newMultiscript(newPowerBase(b.base), [b.pre_sub], [b.pre_sup]),
  );
  rule(
    "3978",
    {
      open_paren: simple("open_paren"),
      pre_subscript: simple("pre_sub"),
      pre_supscript: simple("pre_sup"),
      close_paren: simple("close_paren"),
      base: simple("base"),
      sub: simple("sub"),
      sup: simple("sup"),
    },
    (b) =>
      newMultiscript(
        newPowerBase(b.base, unfencedValue(b.sub, true), unfencedValue(b.sup, true)),
        [b.pre_sub],
        [b.pre_sup],
      ),
  );

  return { transform: t, fired, ruleIds };
}

/**
 * `paren.is_a?(Slice) ? Utility.symbols_class(paren, ...) : paren` — the guard
 * the seven `Fenced` rules each spell out. It tests `Slice` specifically, not
 * "string-like", so a plain String would pass through unconverted.
 */
function parenClass(paren: unknown): unknown {
  return paren instanceof Slice ? symbolsClass(paren) : paren;
}

/** `node.parameter_x` on a draft; Ruby raises `NoMethodError` on anything else. */
function fieldOf(node: unknown, field: string): unknown {
  if (!isDraft(node)) {
    throw new TypeError(
      `unicodemath transform: ${field} on a ${typeof node} (Ruby raises NoMethodError)`,
    );
  }
  return node.fields[field] ?? null;
}

/**
 * `node.parameter_x = value` — an attribute writer, which exists only where the
 * class declares one. A draft whose measured `initialize` never assigned the
 * ivar still accepts the write, exactly as Ruby's `attr_accessor` does.
 */
function setField(node: unknown, field: string, value: unknown): void {
  if (!isDraft(node)) {
    throw new TypeError(
      `unicodemath transform: ${field}= on a ${typeof node} (Ruby raises NoMethodError)`,
    );
  }
  node.fields[field] = value;
}

/**
 * The one transform the parity suite uses, built once.
 *
 * `buildUnicodemathTransform` stays exported and stays UNmemoized: it returns
 * the firing counters, and `transform-coverage.spec.ts` needs a fresh, zeroed
 * set. Sharing this instance with that suite would let one test's firings
 * satisfy another test's coverage assertion.
 */
let unicodemathTransformInstance: Transform | undefined;

export function unicodemathTransform(): Transform {
  if (unicodemathTransformInstance === undefined) {
    unicodemathTransformInstance = buildUnicodemathTransform().transform;
  }
  return unicodemathTransformInstance;
}

/* =========================================================================
 * 5. Finalization, and the Parser#parse wrapping
 * ---------------------------------------------------------------------- */

/**
 * The node SIGNATURES the GEM's own transform leaves unmatched, so a hash that
 * survives to the model is the gem's behaviour rather than this slice's gap.
 *
 * **A key set is not a signature.** Parslet binds on the matcher kind as well
 * as the key, so whether a rule matches depends on the SHAPE of each value:
 * `{frac:, expr:}` with both values resolved is matched by `transform.rb:1791`,
 * while the same key set with an unresolved hash under `frac` is matched by
 * nothing. An allowlist keyed only by `expr,frac` admitted both, and `x a/b c`
 * — which the gem answers `Formula([Symbol("x"), Frac(a, b), Symbol("c")])` —
 * came back from this port as folded pairs. Each entry below therefore records
 * `key=shape` per key, with `shape` computed exactly as pegkit's `simple` and
 * `sequence` matchers decide.
 *
 * Measured, not reasoned about: every registered block was wrapped on the
 * oracle and every hash that reached `transform_elt` without matching a rule
 * was recorded with its value shapes, over the same 103 corpus strings the
 * fixtures carry. Nine signatures came back, across FIVE inputs:
 *
 *   - `(a)/(+) b` — `close_paren=simple,open_paren=simple,operator=simple`,
 *     `intermediate_exp=other`, `factor=other`,
 *     `denominator=other,numerator=simple`, `expr=simple,frac=other`;
 *   - `a ± b` — `combined_symbols=simple,expr=simple`, `expr=other,factor=simple`;
 *   - the three accent inputs — `accent_symbols=simple`, `first_value=simple`,
 *     which `transform.rb:52` consumes as a `subtree` and never leaves behind.
 *
 * The first two inputs are a GEM BUG, reproduced here rather than fixed: no
 * rule in the 519 has the signature `{combined_symbols: simple, expr: simple}`
 * or `{close_paren:, open_paren:, operator:}`, so the hash survives the
 * transform, `Kernel#Array` in `UnicodeMath::Parser#parse` folds the OUTERMOST
 * one into its `[key, value]` pairs, and
 * `Plurimath::Math.parse("a ± b", :unicode)` returns a `Formula` whose value is
 * `[["factor", Symbol("a")], ["expr", {combined_symbols: "&#xb1;", expr:
 * Symbol("b")}]]` — a tree no renderer can read, returned without raising.
 *
 * **This list is the measured corpus exceptions, not a decision procedure.** A
 * signature's absence does NOT mean the gem matches it: it means no pinned
 * corpus input produced it, so nothing here knows. Anything absent is REFUSED,
 * which is conservative in both directions — it catches a node whose rule this
 * slice has not reached, and it also refuses a handful the gem itself leaves
 * unmatched. Measured example: `±+a` leaves
 * `{combined_symbols=simple, expr=sequence}` unmatched in the gem too, which
 * answers it with folded pairs; this port refuses it. Widening the list is a
 * measurement, never a guess — every entry below came from an oracle trace.
 */
const GEM_UNMATCHED_SIGNATURES: ReadonlySet<string> = new Set([
  "accent_symbols=simple",
  "close_paren=simple,open_paren=simple,operator=simple",
  "combined_symbols=simple,expr=simple",
  "denominator=other,numerator=simple",
  "expr=other,factor=simple",
  "expr=simple,frac=other",
  "factor=other",
  "first_value=simple",
  "intermediate_exp=other",
]);

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
 * Refuses a hash the gem would have matched. Both the value walk below and the
 * ROOT wrap in `finalizeUnicodemathParse` go through here — the root used to
 * skip it, because `Kernel#Array` folded the hash into pairs before anything
 * looked at it, so `±` came back as `Formula([["combined_symbols", "&#xb1;"]])`
 * where the gem answers `Formula([Pm])`.
 */
function assertGemLeavesUnmatched(hash: Record<string, unknown>): void {
  const signature = signatureOf(hash);
  if (!GEM_UNMATCHED_SIGNATURES.has(signature)) {
    throw new Error(
      `unicodemath transform: no rule matched {${signature}}; ` +
        "that rule family is not in this slice",
    );
  }
}

/**
 * Finalizes one transformed value into what the immutable model can hold:
 * drafts become `core` nodes, slices become their text (the gem's serializer
 * does the same), arrays are rebuilt around their finalized contents, and a
 * hash the gem also leaves unmatched is kept as a hash — which is what
 * `normalize` does with it too.
 */
function finalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Slice) return value.text;
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
function finalizeDraft(draft: UnicodemathDraft, inputString?: string): MathNode {
  const init: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft.fields)) {
    // `options` is a Ruby OPTION hash, not a tree value: every one this slice
    // builds is `{}` (Fenced, Nary, Underset's default) or a flat hash of
    // already-finalized primitives — `{accent: true}` (`unicode_math/
    // utility.rb:51`), and FRACTION's `displaystyle`/`linethickness`/
    // `bevelled`/`ldiv`/`choose`, singly or paired (`:1614`-`:2377`). Routing
    // it through `finalizeValue` would put it in the unmatched-node branch,
    // where none of these key sets is one the gem leaves behind, and it would
    // be refused.
    init[key] = key === "options" ? value : finalizeValue(value);
  }
  if (draft.identity !== undefined) init[draft.kind === "symbol" ? "id" : "name"] = draft.identity;
  if (inputString !== undefined) init.inputString = inputString;
  const ctor = UNICODEMATH_NODE_CONSTRUCTORS[draft.kind];
  return new ctor(init);
}

/**
 * `UnicodeMath::Parser#parse` (`unicode_math/parser.rb:24-32`) after the
 * transform, plus the `formula.input_string = text` that
 * `Plurimath::Math.parse_formula` adds (`math.rb:62-66`).
 *
 * The wrap is `Math::Formula.new(Array(transformed))`, and `Kernel#Array` is
 * NOT `[x] unless Array`: nil folds to `[]`, and a Hash folds to its
 * `[key, value]` pairs (`Hash#to_a`) rather than being wrapped whole. That arm
 * is live — two corpus inputs reach it (see `GEM_UNMATCHED_SIGNATURES`) — so it
 * is transcribed, symbol keys becoming the strings the gem's serializer emits
 * for them.
 *
 * The root hash is CHECKED before it is folded. Folding first would put the
 * pairs beyond `finalizeValue`'s reach, and the refusal this port owes for a
 * node whose rule it does not carry would never fire: `±` transforms to the
 * root `{combined_symbols: Slice}`, which `transform.rb:99` matches and this
 * slice does not.
 */
export function finalizeUnicodemathParse(transformed: unknown, inputString: string): FormulaNode {
  let value: unknown[];
  if (transformed === null || transformed === undefined) value = [];
  else if (Array.isArray(transformed)) value = transformed;
  else if (isPlainObject(transformed) && !isDraft(transformed)) {
    assertGemLeavesUnmatched(transformed);
    value = Object.entries(transformed).map(([key, entry]) => [key, entry]);
  } else value = [transformed];
  return finalizeDraft(newFormula(value), inputString) as FormulaNode;
}
