/** biome-ignore-all lint/style/useNamingConvention: pattern keys are Parslet
 * tree keys — Ruby's snake_case is the schema, exactly as in the generated
 * tables, and renaming one would stop its rule from ever matching. */
/**
 * The LaTeX transform, ported rule for rule from the gem
 * (`lib/plurimath/latex/transform.rb`, plurimath 0.11.6 at `00c52783`), plus
 * the three rules `BaseNumberPrefix::Transform` mixes in ahead of them.
 *
 * The port is structural, exactly like `asciimath/transform.ts`: every
 * `rule(...)` in `latex/transform.rb` is one `t.rule(...)` here, in the same
 * source order, each carrying the Ruby line it came from.
 *
 * ## Order is behaviour, and one rule is dead because of it
 *
 * `Parslet::Transform.rule` **unshifts** (`parslet-2.0.0/lib/parslet/transform.rb:128`
 * and `:160`), so `rules` is in REVERSE definition order and `apply` returns on
 * the first match — a later definition wins a tie. pegkit's `Transform` models
 * that, so transcribing in source order is correct.
 *
 * Exactly one signature is defined twice: `binary/subscript/supscript`, at
 * `transform.rb:747` and `:756`. Measured on the oracle rather than reasoned
 * about — `Transform.rules[16].source_location` is `transform.rb:758` and
 * `rules[17]` is `:749`, so **`:756` wins and `:747-754` is dead**. That is the
 * opposite of what a "first definition wins" reading gives, and it matters
 * because the live body carries a bug: its non-Slice branch builds
 * `PowerBase.new(binary, subscript, subscript)` (`:765-769`), passing the
 * subscript twice where the supscript was surely meant. Measured end to end:
 * `\frac{a}{b}_1^2` renders as `frac(a)(b)_(1)^(1)` in the gem — the supscript
 * is discarded. The dead rule is NOT ported (it can never match); the live one
 * is ported as written, bug included.
 *
 * ## Mutation is behaviour, so nodes are drafts until the entry point returns
 *
 * `Latex::Utility.organize_table` and its helpers mutate what the transform
 * already built: `filter_table_data` calls `delete_at` while iterating
 * (`latex/utility.rb:77-85`), `organize_options` `shift`s the caller's
 * column-align array and `insert`s the rest into the caller's data array
 * (`:48-54`), `organize_tds` assigns `td.parameter_two` on FINISHED `Td` nodes
 * (`:72`), and `table_separator` `insert`s one shared `Td` into every row
 * (`utility.rb:241-242`). Core nodes are publicly immutable (ARCHITECTURE.md
 * §5), so the transform works on `LatexDraft` objects and `finalize` converts
 * the finished tree into real `core` nodes in one pass at the end — the same
 * design `asciimath/transform.ts` uses and for the same reason.
 *
 * ## What a draft must imitate about a Ruby node
 *
 * - **Constructor side effects.** Each Ruby `initialize` assigns a specific
 *   ivar set (measured per class; `./registry` carries the families), and the
 *   Unary/Binary/Ternary/Nary/Linebreak constructors run
 *   `ModelHelper.validate_left_right`, which forces `left_right_wrapper` back
 *   to true on any formula field whose first value is a `Left`. Measured:
 *   every function class here validates, `Table` and `Formula` do not.
 * - **`is_a?(Parslet::Slice)` dispatch.** Six rules branch on it — a raw slice
 *   means "a token that still needs `get_class`", a built node means "use it".
 *   Slices stay `Slice` instances end to end so the discrimination survives.
 * - **Being a transform LEAF.** pegkit's `simple` accepts anything that is not
 *   a plain object or an array, so a draft binds where a hash does not, exactly
 *   as Parslet's `SimpleBind` accepts any non-Hash non-Array.
 */

import type { FormulaNode, MathNode, NodeKind, NodeOptions } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { Slice, sequence, simple, subtree, Transform, type TransformValue } from "../../pegkit";
import {
  LATEX_ALIGNMENT_LETTERS,
  LATEX_LEFT_RIGHT_PARENTHESIS,
  LATEX_LINEBREAK_VALUES,
  LATEX_MATRICES,
  LATEX_MATRICES_PARENTHESIS,
  LATEX_NAMED_SYMBOLS,
  LATEX_NARY_SYMBOL_IDS,
  LATEX_PAREN_SYMBOL_IDS,
  LATEX_SEPARATE_TABLE_SYMBOL_IDS,
  LATEX_SEPARATE_TABLE_VALUES,
  LATEX_SYMBOL_CLASS_INPUT,
} from "./generated/transform-tables";
import {
  LATEX_CLASS_REGISTRY,
  LATEX_FONT_STYLES,
  LATEX_NODE_CONSTRUCTORS,
  LATEX_TABLE_CLASS_REGISTRY,
  type LatexClassEntry,
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

/**
 * `Kernel#Array(value)`: nil becomes `[]`, an array is itself, anything without
 * `to_ary`/`to_a` is wrapped. Used at `transform.rb:248` and `:251` on
 * `subtree` bindings, which can be any of the three.
 */
function rubyArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) {
    // `Array(hash)` is `hash.to_a` — the [key, value] pairs. Reachable only if
    // a subtree binding kept an untransformed hash, which would already mean a
    // rule went missing; it is transcribed rather than guessed at.
    return Object.entries(value);
  }
  return [value];
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
  throw new TypeError(`latex transform: no deterministic to_s for ${typeof value}`);
}

/* =========================================================================
 * 2. The draft model
 * ---------------------------------------------------------------------- */

/**
 * One mutable stand-in for a Ruby node under construction. `fields` holds the
 * ivars the class's `initialize` actually assigned, under their TypeScript
 * names, and stays mutable — array fields by reference — until `finalize`.
 * `identity` is the Ruby basename an alias carrier rides under (`Power`,
 * `Table::Pmatrix` → `Pmatrix`, `Paren::Lcurly`), matching the core carriers'
 * `name`/`id`.
 */
class LatexDraft {
  constructor(
    readonly kind: NodeKind,
    readonly identity: string | undefined,
    readonly fields: Record<string, unknown>,
  ) {}
}

function isDraft(value: unknown): value is LatexDraft {
  return value instanceof LatexDraft;
}

function isFormulaDraft(value: unknown): value is LatexDraft {
  return isDraft(value) && value.kind === "formula";
}

function isSymbolDraft(value: unknown): value is LatexDraft {
  return isDraft(value) && value.kind === "symbol";
}

function isSymbolDraftOf(value: unknown, id: string): boolean {
  return isSymbolDraft(value) && value.identity === id;
}

function isLeftDraft(value: unknown): boolean {
  return isDraft(value) && value.kind === "unaryFunction" && value.identity === "Left";
}

/** `Math::Function::PowerBase`, the class `transform.rb:305` tests for. */
function isPowerBaseDraft(value: unknown): value is LatexDraft {
  return isDraft(value) && value.kind === "ternaryFunction" && value.identity === "PowerBase";
}

function isTdDraft(value: unknown): value is LatexDraft {
  return isDraft(value) && value.kind === "binaryFunction" && value.identity === "Td";
}

function isLinebreakDraft(value: unknown): boolean {
  return isDraft(value) && value.kind === "linebreak";
}

/** A formula draft's live `value` array. */
function formulaValue(draft: LatexDraft): unknown[] {
  return draft.fields.value as unknown[];
}

const NAMED = (role: string): string => {
  const id = LATEX_NAMED_SYMBOLS.get(role);
  if (id === undefined) throw new Error(`latex transform: no generated symbol id for "${role}"`);
  return id;
};
const HLINE_ID = NAMED("hline");
const MINUS_ID = NAMED("minus");
const VERT_ID = NAMED("vert");
const LCURLY_ID = NAMED("lcurly");
const RCURLY_ID = NAMED("rcurly");
const THREE_PER_EM_SPACE_ID = NAMED("threePerEmSpace");

const NARY_SYMBOL_IDS: ReadonlySet<string> = new Set(LATEX_NARY_SYMBOL_IDS);
const PAREN_SYMBOL_IDS: ReadonlySet<string> = new Set(LATEX_PAREN_SYMBOL_IDS);
const SEPARATE_TABLE_IDS: ReadonlySet<string> = new Set(LATEX_SEPARATE_TABLE_SYMBOL_IDS);
const SEPARATE_TABLE_VALUES: ReadonlySet<string> = new Set(LATEX_SEPARATE_TABLE_VALUES);
const LINEBREAK_VALUES: ReadonlySet<string> = new Set(LATEX_LINEBREAK_VALUES);
const MATRICES: ReadonlyMap<string, string | null> = new Map(LATEX_MATRICES);

/**
 * `ModelHelper.validate_left_right` (`model_helper.rb:17-23`), run by every
 * function constructor over its assigned fields: a formula FIELD whose first
 * value is a `Left` gets `left_right_wrapper` forced back to true, undoing what
 * `Formula#initialize` just decided. Measured per class — `Table` and `Formula`
 * do NOT run it.
 */
function validateLeftRight(fields: readonly unknown[]): void {
  for (const field of fields) {
    if (isFormulaDraft(field) && isLeftDraft(formulaValue(field)[0])) {
      field.fields.leftRightWrapper = true;
    }
  }
}

/** Ruby's "argument omitted": `undefined` takes the default, `null` is nil. */
function orNil(value: unknown): unknown {
  return value === undefined ? null : value;
}

/** `UnaryFunction#initialize` converts a Slice argument to its text. */
function sliceToText(value: unknown): unknown {
  return value instanceof Slice ? value.text : value;
}

/**
 * `Math::Formula.new(value = [], left_right_wrapper = true)`
 * (`formula.rb:38-48`): a non-array is wrapped, the array itself is stored by
 * reference, the wrapper flag turns false when the first value is a `Left`, and
 * `displaystyle` is assigned true. `input_string` stays unassigned — the entry
 * point adds it at the very end, as `Plurimath::Math.parse` does.
 */
function newFormula(value: unknown = [], leftRightWrapper = true): LatexDraft {
  const list = Array.isArray(value) ? value : [value];
  const wrapper = isLeftDraft(list[0]) ? false : leftRightWrapper;
  return new LatexDraft("formula", undefined, {
    value: list,
    leftRightWrapper: wrapper,
    displaystyle: true,
  });
}

/** `Math::Number.new(value, base:)` — Slice value to text, mini flags false. */
function newNumber(value: unknown, base: number | null = null): LatexDraft {
  return new LatexDraft("number", undefined, {
    value: sliceToText(orNil(value)),
    miniSubSized: false,
    miniSupSized: false,
    base,
  });
}

/** A symbol class resolved from a table: `klass.new` — `@value` assigned nil. */
function newSymbolOfClass(id: string): LatexDraft {
  return new LatexDraft("symbol", id, { value: null });
}

/**
 * `Math::Symbols::Symbol.new(sym)` (`symbols/symbol.rb:12-17`): `@value =
 * sym.is_a?(Array) ? sym.join : sym&.to_s`. Only `@value` is assigned — the
 * other four ivars are guarded and stay unassigned.
 */
function newBareSymbol(value: unknown): LatexDraft {
  const text = Array.isArray(value) ? value.map(rubyToS).join("") : rubyToS(value);
  return new LatexDraft("symbol", "Symbol", { value: text });
}

function unaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  parameterOne: unknown,
  withAttributes: boolean,
): LatexDraft {
  const one = sliceToText(orNil(parameterOne));
  validateLeftRight([one]);
  const fields: Record<string, unknown> = { parameterOne: one };
  if (withAttributes) fields.attributes = {};
  return new LatexDraft(kind, identity, fields);
}

function binaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  parameterOne: unknown,
  parameterTwo: unknown,
  assignsOptions = false,
): LatexDraft {
  const one = orNil(parameterOne);
  const two = orNil(parameterTwo);
  validateLeftRight([one, two]);
  const fields: Record<string, unknown> = { parameterOne: one, parameterTwo: two };
  if (assignsOptions) fields.options = {};
  return new LatexDraft(kind, identity, fields);
}

function ternaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  parameterOne: unknown,
  parameterTwo: unknown,
  parameterThree: unknown,
): LatexDraft {
  const one = orNil(parameterOne);
  const two = orNil(parameterTwo);
  const three = orNil(parameterThree);
  validateLeftRight([one, two, three]);
  return new LatexDraft(kind, identity, {
    parameterOne: one,
    parameterTwo: two,
    parameterThree: three,
  });
}

/** `Text.new(parameter_one = "", lang: nil)` — `@lang` is always assigned. */
function newText(parameterOne?: unknown): LatexDraft {
  const one = parameterOne === undefined ? "" : sliceToText(parameterOne);
  validateLeftRight([one]);
  return new LatexDraft("text", undefined, { parameterOne: one, lang: null });
}

/**
 * `Td.new(parameter_one, parameter_two)` (`td.rb:7-10`): `delete_if` strips
 * literal `"&"` cells from the CALLER's array in place, then `Array(...)` folds
 * nil to `[]`. A node never equals a string in Ruby, so only a raw slice or
 * string can match.
 */
function newTd(parameterOne: unknown, parameterTwo: unknown = null): LatexDraft {
  let one = orNil(parameterOne);
  if (one !== null) {
    if (!Array.isArray(one)) {
      throw new TypeError(
        "latex transform: Td.new with a non-array (Ruby raises NoMethodError on delete_if)",
      );
    }
    for (let index = one.length - 1; index >= 0; index--) {
      const cell = one[index];
      if (cell === "&" || (cell instanceof Slice && cell.text === "&")) one.splice(index, 1);
    }
  }
  one = one === null ? [] : one;
  return binaryDraft("binaryFunction", "Td", one, parameterTwo);
}

/**
 * `Tr.new(parameter_one = [])` (`tr.rb:7-14`): a row that is ALL literal `"@"`
 * cells is rewritten to empty `Td`s in place. An EMPTY row trivially satisfies
 * `all?("@")`, where `map!` then does nothing.
 */
function newTr(parameterOne: unknown = []): LatexDraft {
  if (
    Array.isArray(parameterOne) &&
    parameterOne.every((cell) => cell === "@" || (cell instanceof Slice && cell.text === "@"))
  ) {
    for (let index = 0; index < parameterOne.length; index++) parameterOne[index] = newTd([]);
  }
  return unaryDraft("unaryFunction", "Tr", parameterOne, false);
}

/**
 * `Fenced.new(p1, p2, p3)` — a `TernaryFunction` subclass whose `@options` is
 * always assigned, `{}` included.
 */
function newFenced(one: unknown, two: unknown, three: unknown): LatexDraft {
  const draft = ternaryDraft("fenced", undefined, one, two, three);
  draft.fields.options = {};
  return draft;
}

/**
 * `Table.new(value, open_paren, close_paren, options = {})` (`table.rb:22-30`).
 *
 * The parens run through `Utility.symbols_class(..., lang: :unicodemath)`,
 * which returns a non-string argument unchanged — and the transform only ever
 * passes nodes or nil, so the coercion is pass-through. A string would need the
 * unicodemath table this format does not carry, so it throws instead.
 *
 * Every subclass declares its OWN paren defaults (`Table::Matrix.new(nil)` is
 * round-parenthesised), and every call site here passes all three positionally,
 * so those defaults never apply. Measured: `Table::Matrix.new(nil, nil, nil)`
 * keeps nil parens. `Table` itself does not run `validate_left_right`.
 */
function newTable(
  identity: string | undefined,
  value: unknown,
  openParen: unknown,
  closeParen: unknown,
  options: NodeOptions,
): LatexDraft {
  for (const paren of [openParen, closeParen]) {
    if (typeof paren === "string" || paren instanceof Slice) {
      throw new TypeError(
        "latex transform: Table.new with a string paren would need the unicodemath table",
      );
    }
  }
  return new LatexDraft("table", identity, {
    value: orNil(value),
    openParen: orNil(openParen),
    closeParen: orNil(closeParen),
    options,
  });
}

/** `Linebreak.new` — both defaults assigned (`linebreak.rb:9-13`). */
function newLinebreak(): LatexDraft {
  const draft = new LatexDraft("linebreak", undefined, { parameterOne: null, attributes: {} });
  validateLeftRight([null]);
  return draft;
}

/** `Nary.new(p1, p2, p3, p4, options = {})` — `@options` always assigned. */
function newNary(one: unknown, two: unknown, three: unknown, four: unknown): LatexDraft {
  const fields = {
    parameterOne: orNil(one),
    parameterTwo: orNil(two),
    parameterThree: orNil(three),
    parameterFour: orNil(four),
    options: {},
  };
  validateLeftRight([
    fields.parameterOne,
    fields.parameterTwo,
    fields.parameterThree,
    fields.parameterFour,
  ]);
  return new LatexDraft("nary", undefined, fields);
}

const newBase = (a: unknown, b: unknown) => binaryDraft("base", undefined, a, b);
const newPower = (a: unknown, b: unknown) => binaryDraft("binaryFunction", "Power", a, b);
const newPowerBase = (a: unknown, b: unknown, c: unknown) =>
  ternaryDraft("ternaryFunction", "PowerBase", a, b, c);
const newOver = (a: unknown, b: unknown) => binaryDraft("binaryFunction", "Over", a, b);
const newRoot = (a: unknown, b: unknown) => binaryDraft("binaryFunction", "Root", a, b);
const newLimits = (a: unknown, b: unknown, c: unknown) =>
  ternaryDraft("ternaryFunction", "Limits", a, b, c);
const newRule = (a: unknown, b: unknown, c: unknown) =>
  ternaryDraft("ternaryFunction", "Rule", a, b, c);
const newSubstack = (a: unknown) => unaryDraft("unaryFunction", "Substack", a, false);
const newSqrt = (a: unknown) => unaryDraft("sqrt", undefined, a, false);
const newLeftFn = (a: unknown) => unaryDraft("unaryFunction", "Left", a, false);
const newRightFn = (a: unknown) => unaryDraft("unaryFunction", "Right", a, false);

/** `FontStyle::<name>.new(value, keyword)`, or the generic `FontStyle`. */
function newFontStyle(name: string | undefined, one: unknown, two: unknown): LatexDraft {
  return binaryDraft("fontStyle", name, one, two);
}

/* =========================================================================
 * 3. The `Utility` helpers the rules call
 * ---------------------------------------------------------------------- */

/**
 * `Utility.symbols_class(string, lang: :latex, table: false)`
 * (`lib/plurimath/utility.rb:212-218`).
 *
 * Three behaviours a port must not tidy up. A non-string (nil above all) is
 * returned UNCHANGED, before the table branch — every environment rule relies
 * on that, because five of the ten `MATRICES` values are nil. The lookup
 * `strip`s. And a miss falls back to a bare `Math::Symbols::Symbol` carrying
 * the text rather than failing.
 */
function symbolsClass(value: unknown, table = false): unknown {
  if (!(typeof value === "string" || value instanceof Slice)) return value;
  if (table) return latexTableCurlyParen(value);
  const id = LATEX_SYMBOL_CLASS_INPUT.get(rubyStrip(rubyToS(value)));
  return id === undefined ? newBareSymbol(value) : newSymbolOfClass(id);
}

/**
 * `Utility.latex_table_curly_paren` (`utility.rb:305-311`), the `table: true`
 * path every environment rule takes for its two delimiters.
 *
 * The `case` compares with `String#===`, so a `Parslet::Slice` never matches
 * `"{"` — but no call site passes one: the arguments are `MATRICES[env]` and
 * `MATRICES_PARENTHESIS[...]&.to_s`, both plain Strings or nil. A Slice would
 * fall through to `symbols_class`, and does here too.
 */
function latexTableCurlyParen(value: string | Slice): unknown {
  if (value === "{") return newSymbolOfClass(LCURLY_ID);
  if (value === "}") return newSymbolOfClass(RCURLY_ID);
  return symbolsClass(value);
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
 * A miss throws, which is where the gem raises `NameError`: `Pr` has no
 * `Math::Function::Pr`, so `\Pr_1` fails in the gem too (measured), and
 * `binom`/`bmod`/`pmod` are rewritten by their call sites before they get here.
 */
function getClass(name: unknown): LatexClassEntry {
  const key = rubyToS(name);
  const entry = LATEX_CLASS_REGISTRY.get(key);
  if (entry === undefined) {
    throw new Error(`latex transform: no class registered for "${key}"`);
  }
  return entry;
}

/** `.new` on what `get_class` resolved, honouring that class's initialize. */
function constructClass(entry: LatexClassEntry, ...args: unknown[]): LatexDraft {
  switch (entry.family) {
    case "unary":
      return unaryDraft(entry.kind, entry.name, args[0], false);
    case "unaryAttributes":
      return unaryDraft(entry.kind, entry.name, args[0], true);
    case "text":
      return args.length === 0 ? newText() : newText(args[0]);
    case "binary":
      return binaryDraft(entry.kind, entry.name, args[0], args[1]);
    case "binaryAssignedOptions":
      return binaryDraft(entry.kind, entry.name, args[0], args[1], true);
    case "ternary":
      return ternaryDraft(entry.kind, entry.name, args[0], args[1], args[2]);
    default:
      throw new Error(`latex transform: "${entry.name}" has no constructible family`);
  }
}

/** `Utility.get_class(name).new(...)` in one step. */
function buildClass(name: unknown, ...args: unknown[]): LatexDraft {
  return constructClass(getClass(name), ...args);
}

/**
 * `Utility.get_table_class(environment).new(...)` — the table registry, whose
 * `capitalize` fold means `vmatrix` and `Vmatrix` land on the same class.
 */
function buildTableClass(
  environment: unknown,
  value: unknown,
  openParen: unknown,
  closeParen: unknown,
  options: NodeOptions,
): LatexDraft {
  const key = rubyToS(environment);
  const entry = LATEX_TABLE_CLASS_REGISTRY.get(key);
  if (entry === undefined) {
    throw new Error(`latex transform: no table class registered for "${key}"`);
  }
  return newTable(entry.name, value, openParen, closeParen, options);
}

/**
 * `Latex::Utility.left_right_objects(paren, function)`
 * (`latex/utility.rb:97-104`).
 *
 * Escaped braces are special-cased to a plain brace by stripping EVERY
 * backslash; everything else is looked up in the 24-entry
 * `LEFT_RIGHT_PARENTHESIS` table and becomes an HTML entity string. A token the
 * table lacks yields nil, and the `Left`/`Right` then carries nil.
 */
function leftRightObjects(paren: unknown, fn: "left" | "right"): LatexDraft {
  const text = rubyToS(paren);
  const value = /\\\{|\\\}/.test(text)
    ? text.replaceAll("\\", "")
    : (LATEX_LEFT_RIGHT_PARENTHESIS.get(text) ?? null);
  return fn === "left" ? newLeftFn(value) : newRightFn(value);
}

/** `Utility.table_td(object)` (`latex/utility.rb:87-95`). */
function tableTd(object: unknown): unknown[] {
  return [isTdDraft(object) ? object : newTd(compact([object]))];
}

/* --- the table builders (latex/utility.rb:10-95) ------------------------ */

/** `data&.separate_table` — true for `&`, `\\` and the `Ampersand` class. */
function separatesTable(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (isLinebreakDraft(data)) return true;
  if (!isSymbolDraft(data)) return false;
  const value = data.fields.value;
  if (typeof value === "string" && SEPARATE_TABLE_VALUES.has(value)) return true;
  return data.identity !== undefined && SEPARATE_TABLE_IDS.has(data.identity);
}

/** `data.linebreak?` — `Linebreak` always, a bare symbol on its value. */
function isLinebreak(data: unknown): boolean {
  if (isLinebreakDraft(data)) return true;
  if (!isSymbolDraft(data)) return false;
  const value = data.fields.value;
  return typeof value === "string" && LINEBREAK_VALUES.has(value);
}

/**
 * `Latex::Utility.filter_table_data` (`latex/utility.rb:76-85`).
 *
 * `delete_at(ind + 1)` shortens the array DURING `each_with_index`, so the
 * consumed element is never visited on its own — Ruby re-reads the length each
 * step, which a plain index loop over the live array reproduces exactly.
 * `delete_at` past the end returns nil, and the pair then carries a nil.
 */
function filterTableData(tableData: unknown[]): unknown[] {
  for (let index = 0; index < tableData.length; index++) {
    if (isSymbolDraftOf(tableData[index], MINUS_ID)) {
      const removed = index + 1 < tableData.length ? tableData.splice(index + 1, 1)[0] : null;
      tableData[index] = newFormula([tableData[index], removed]);
    }
  }
  return tableData;
}

/**
 * `Latex::Utility.organize_options` (`latex/utility.rb:48-54`). The return value
 * is discarded at its only call site; the MUTATIONS are the point — the first
 * column-align entry is shifted off, and the rest are spliced onto the front of
 * the caller's data array.
 */
function organizeOptions(tableData: unknown[], columnAlign: unknown[] | null): void {
  if (columnAlign === null || columnAlign.length <= 1) return;
  columnAlign.shift();
  tableData.splice(0, 0, ...columnAlign);
}

/**
 * `Latex::Utility.organize_tds` (`latex/utility.rb:65-74`).
 *
 * Two Ruby idioms with no direct JavaScript equivalent. `column_align *
 * tr_array.length` is Array REPETITION, not multiplication — it tiles the
 * alignment spec across the row. And the assignment is to `td.parameter_two` on
 * an already-built `Td`, which is why these are drafts.
 */
function organizeTds(trArray: unknown[], columnAlign: unknown[] | null, options: boolean): void {
  if (columnAlign === null || columnAlign.length === 0) return;
  let align = columnAlign.filter((entry) => entry !== "|");
  if (options) {
    const tiled: unknown[] = [];
    for (let repeat = 0; repeat < trArray.length; repeat++) tiled.push(...align);
    align = tiled;
  }
  trArray.forEach((td, index) => {
    const letter = align[index];
    if (typeof letter !== "string") return;
    const columnalign = LATEX_ALIGNMENT_LETTERS.get(letter);
    if (columnalign === undefined) return;
    if (isDraft(td)) td.fields.parameterTwo = { columnalign };
  });
}

/** `hline_row?` (`latex/utility.rb:110-114`): tr -> first cell -> first content. */
function isHlineRow(row: unknown): boolean {
  if (!isDraft(row)) return false;
  const cells = row.fields.parameterOne;
  const firstCell = Array.isArray(cells) ? cells[0] : undefined;
  if (!isDraft(firstCell)) return false;
  const contents = firstCell.fields.parameterOne;
  const firstContent = Array.isArray(contents) ? contents[0] : undefined;
  return isSymbolDraftOf(firstContent, HLINE_ID);
}

/** `Latex::Utility.table_options` (`latex/utility.rb:56-63`). */
function tableOptions(rows: readonly unknown[]): NodeOptions {
  let rowline = "";
  for (const row of rows) rowline += isHlineRow(row) ? "solid " : "none ";
  return rowline.includes("solid") ? { rowline: rubyStrip(rowline) } : {};
}

/**
 * `Utility.table_separator(separator, value, symbol: "|")`
 * (`utility.rb:235-253`), called only with `symbol: "|"`.
 *
 * The SAME `Td` instance is inserted into every row — Ruby aliases it, and so
 * does this. The `index(nil)` assignment is wrapped in a bare `rescue`: with no
 * nil in the row, Ruby's `array[nil] = x` raises `TypeError` and the rescue
 * swallows it, so the whole thing is a no-op unless the row holds a nil.
 */
function tableSeparator(separator: readonly unknown[] | null, rows: readonly unknown[]): void {
  if (separator === null) return;
  const sepSymbol = newTd([newSymbolOfClass(VERT_ID)]);
  separator.forEach((entry, index) => {
    if (entry !== "|") return;
    for (const row of rows) {
      if (!isDraft(row)) continue;
      const cells = row.fields.parameterOne;
      if (!Array.isArray(cells)) continue;
      cells.splice(index, 0, sepSymbol);
      const nilAt = cells.findIndex((cell) => cell === null || cell === undefined);
      if (nilAt !== -1) cells[nilAt] = newTd([]);
    }
  });
}

/**
 * `Latex::Utility.organize_table` (`latex/utility.rb:10-46`) — where rows and
 * cells are cut.
 *
 * It mutates its inputs, and the transform hands it arrays it has just built,
 * so those mutations land on the tree. `string_columns` is computed AFTER
 * `organize_options` has shifted the column-align array, and each row gets its
 * own `.dup` of it because `organize_tds` rejects `"|"` entries in place.
 */
function organizeTable(
  array: unknown[],
  columnAlign: unknown[] | null = null,
  options = false,
): unknown[] {
  const table: unknown[] = [];
  let tableData: unknown[] = [];
  let tableRow: unknown[] = [];
  if (options) organizeOptions(array, columnAlign);
  const stringColumns = columnAlign === null ? null : columnAlign.map(columnText);

  for (const data of array) {
    if (separatesTable(data)) {
      tableRow.push(newTd(compact(filterTableData(tableData))));
      tableData = [];
      if (isLinebreak(data)) {
        organizeTds(
          flattenDeep(tableRow),
          stringColumns === null ? null : [...stringColumns],
          options,
        );
        table.push(newTr(tableRow));
        tableRow = [];
      }
      continue;
    }
    tableData.push(data);
  }

  // `latex/utility.rb:29-36`: a trailing linebreak has already flushed its row
  // and nothing follows it, so there is no final cell to add. An empty input
  // has flushed nothing and still yields its one placeholder cell.
  const flushedByTrailingLinebreak =
    tableData.length === 0 && tableRow.length === 0 && table.length > 0;
  if (!flushedByTrailingLinebreak) tableRow.push(newTd(compact(tableData)));
  if (tableRow.length > 0) {
    organizeTds(flattenDeep(tableRow), stringColumns === null ? null : [...stringColumns], options);
    table.push(newTr(tableRow));
  }
  if (columnAlign !== null && columnAlign.length > 0) tableSeparator(stringColumns, table);
  return table;
}

/**
 * `column.is_a?(Math::Symbols::Paren) ? "|" : column.value`
 * (`latex/utility.rb:15`).
 *
 * `.value` is called on whatever the column spec parsed to. A node without one
 * raises `NoMethodError` in the gem; that throws here too rather than
 * substituting a plausible letter.
 */
function columnText(column: unknown): unknown {
  if (
    isSymbolDraft(column) &&
    column.identity !== undefined &&
    PAREN_SYMBOL_IDS.has(column.identity)
  ) {
    return "|";
  }
  if (isDraft(column) && "value" in column.fields) return column.fields.value;
  throw new TypeError(
    "latex transform: a column-align entry has no `value` (Ruby raises NoMethodError here)",
  );
}

/* --- the environment rules' shared shape (transform.rb:853-994) --------- */

/**
 * The delimiter pair every environment rule builds, through the double
 * indirection `MATRICES[env] -> open_paren -> MATRICES_PARENTHESIS[open_paren]`.
 * Five `MATRICES` values are nil, and `symbols_class(nil, ...)` returns nil, so
 * those tables genuinely carry nil parens.
 */
function environmentParens(environment: unknown): { open: unknown; close: unknown } {
  const openParen = MATRICES.get(rubyToS(environment)) ?? null;
  const closeParen =
    openParen === null ? null : (LATEX_MATRICES_PARENTHESIS.get(openParen) ?? null);
  return { open: symbolsClass(openParen, true), close: symbolsClass(closeParen, true) };
}

/* =========================================================================
 * 4. The rules, in latex/transform.rb order — ONE Transform instance
 * ---------------------------------------------------------------------- */

function asArray(value: TransformValue): unknown[] {
  return value as unknown[];
}

/** How many rules this module registers, so a coverage spec can pin it. */
export interface LatexTransformBuild {
  readonly transform: Transform;
  /** Rule id -> how many times its action has run, for the coverage spec. */
  readonly fired: Map<string, number>;
  readonly ruleIds: readonly string[];
}

/**
 * Builds the transform.
 *
 * Every rule is registered through a local `rule` wrapper that tags it with the
 * Ruby line it came from and counts its firings. The counter is what
 * `test/formats/latex/transform-coverage.spec.ts` uses to prove the fixture set
 * actually exercises each ported rule — a rule no input reaches is a rule whose
 * port nothing has checked.
 */
export function buildLatexTransform(): LatexTransformBuild {
  const t = new Transform();
  const fired = new Map<string, number>();
  const ruleIds: string[] = [];

  const rule = (
    id: string,
    pattern: Parameters<Transform["rule"]>[0],
    action: Parameters<Transform["rule"]>[1],
  ): void => {
    if (fired.has(id)) throw new Error(`latex transform: duplicate rule id ${id}`);
    fired.set(id, 0);
    ruleIds.push(id);
    t.rule(pattern, (bindings) => {
      fired.set(id, (fired.get(id) as number) + 1);
      return action(bindings);
    });
  };

  // --- BaseNumberPrefix::Transform (base_number_prefix.rb:36-38) ----------
  // `include` runs first (`latex/transform.rb:6`), so these three are DEFINED
  // first and, matching in reverse definition order, tried LAST.
  //
  // BigInt, not parseInt: Ruby's `to_i(2)` is exact at any length, and a
  // 60-digit binary literal already exceeds a double's 53-bit mantissa.
  rule("bnp:36", { hex_number: simple("hex") }, (b) => newNumber(rubyToS(b.hex), 16));
  rule("bnp:37", { binary_number: simple("bin") }, (b) =>
    newNumber(BigInt(`0b${rubyToS(b.bin)}`).toString(), 2),
  );
  rule("bnp:38", { octal_number: simple("oct") }, (b) =>
    newNumber(BigInt(`0o${rubyToS(b.oct)}`).toString(), 8),
  );

  // --- pass-through and leaf rules (transform.rb:8-60) --------------------

  rule("8", { base: simple("base") }, (b) => b.base);
  rule("9", { over: simple("over") }, (b) => b.over);
  rule("10", { number: simple("num") }, (b) => newNumber(htmlEntityToUnicode(rubyToS(b.num))));
  rule("11", { power: simple("power") }, (b) => b.power);
  rule("12", { unary: simple("unary") }, (b) => buildClass(b.unary));
  rule("13", { space: simple("space") }, () => newText(" "));
  rule("14", { operant: simple("oper") }, (b) => symbolsClass(b.oper));
  rule("17", { symbol: simple("symbol") }, (b) => symbolsClass(b.symbol));
  rule("20", { lparen: simple("lparen") }, (b) => symbolsClass(b.lparen));
  rule("23", { rparen: simple("rparen") }, (b) => symbolsClass(b.rparen));
  rule("26", { limits: simple("limits") }, (b) => b.limits);
  // The one String tree key among 45 Symbol keys (`parse.rb:111`).
  rule("27", { "\\\\": simple("slash") }, () => newLinebreak());
  rule("28", { expression: simple("expr") }, (b) => b.expr);
  rule("29", { environment: simple("env") }, (b) => b.env);
  rule("30", { ternary: simple("ternary") }, (b) => buildClass(b.ternary));

  rule("32", { unary_functions: simple("unary") }, (b) => b.unary);
  rule("33", { ternary_class: simple("ternary") }, (b) => b.ternary);
  rule("34", { left_right: simple("left_right") }, (b) => b.left_right);
  rule("35", { under_over: simple("under_over") }, (b) => b.under_over);
  rule("36", { power_base: simple("power_base") }, (b) => b.power_base);
  rule("37", { table_data: simple("table_data") }, (b) => b.table_data);
  rule("38", { three_per_em_space: simple("space") }, () =>
    newSymbolOfClass(THREE_PER_EM_SPACE_ID),
  );

  rule("40", { intermediate_exp: simple("int_exp") }, (b) => b.int_exp);
  rule("42", { numeric_values: simple("value") }, (b) => symbolsClass(b.value));
  rule("46", { text: simple("text") }, (b) => newText(b.text));
  rule("50", { unicode_symbols: simple("unicode") }, (b) => symbolsClass(b.unicode));
  rule("54", { binary: simple("binary") }, (b) =>
    b.binary instanceof Slice ? buildClass(b.binary) : b.binary,
  );
  rule("58", { symbols: simple("sym") }, (b) => symbolsClass(b.sym));

  // An empty paren pair collapses to an empty ARRAY, not to a node.
  rule("62", { lparen: simple("lparen"), rparen: simple("rparen") }, () => []);

  rule("67", { left_right: simple("left_right"), subscript: simple("subscript") }, (b) =>
    newBase(b.left_right, b.subscript),
  );
  rule("75", { left_right: simple("left_right"), supscript: simple("supscript") }, (b) =>
    newPower(b.left_right, b.supscript),
  );

  // --- \left ... \right (transform.rb:83-187) -----------------------------

  rule(
    "83",
    {
      left: simple("left"),
      left_paren: simple("lparen"),
      expression: sequence("expr"),
      right: simple("right"),
      right_paren: simple("rparen"),
    },
    (b) =>
      newFormula([
        leftRightObjects(b.lparen, "left"),
        newFormula(asArray(b.expr)),
        leftRightObjects(b.rparen, "right"),
      ]),
  );

  rule(
    "97",
    {
      left: simple("left"),
      left_paren: simple("lparen"),
      expression: sequence("expr"),
      right: simple("right"),
    },
    (b) =>
      newFormula([
        leftRightObjects(b.lparen, "left"),
        newFormula(asArray(b.expr)),
        newRightFn(undefined),
      ]),
  );

  rule(
    "110",
    {
      left: simple("left"),
      left_paren: simple("lparen"),
      expression: simple("expr"),
      right: simple("right"),
    },
    (b) => newFormula([leftRightObjects(b.lparen, "left"), b.expr, newRightFn(undefined)]),
  );

  rule("123", { left: simple("left"), left_paren: simple("lparen"), right: simple("right") }, (b) =>
    newFormula([leftRightObjects(b.lparen, "left"), newRightFn(undefined)]),
  );

  rule(
    "134",
    {
      left: simple("left"),
      left_paren: simple("lparen"),
      right: simple("right"),
      right_paren: simple("rparen"),
    },
    (b) => newFormula([leftRightObjects(b.lparen, "left"), leftRightObjects(b.rparen, "right")]),
  );

  rule("146", { left: simple("left"), left_paren: simple("lparen") }, (b) =>
    leftRightObjects(b.lparen, "left"),
  );

  rule(
    "151",
    {
      left: simple("left"),
      left_paren: simple("lparen"),
      expression: simple("expr"),
      right: simple("right"),
      right_paren: simple("rparen"),
    },
    (b) =>
      newFormula([leftRightObjects(b.lparen, "left"), b.expr, leftRightObjects(b.rparen, "right")]),
  );

  rule("165", { left: simple("left"), expression: simple("expr"), right: simple("right") }, (b) =>
    newFormula([newLeftFn(undefined), b.expr, newRightFn(undefined)]),
  );

  rule("177", { left: simple("left"), expression: sequence("expr"), right: simple("right") }, (b) =>
    newFormula([newLeftFn(undefined), newFormula(asArray(b.expr)), newRightFn(undefined)]),
  );

  // --- sub/sup on leaves (transform.rb:189-301) ---------------------------

  rule("189", { power: simple("power"), number: simple("number") }, (b) =>
    newPower(b.power, newNumber(htmlEntityToUnicode(rubyToS(b.number)))),
  );
  rule("197", { power: simple("power"), symbols: simple("sym") }, (b) =>
    newPower(b.power, symbolsClass(b.sym)),
  );
  rule("205", { power: simple("power"), expression: simple("expr") }, (b) =>
    newPower(b.power, b.expr),
  );
  rule("213", { base: simple("base"), expression: simple("expr") }, (b) => newBase(b.base, b.expr));
  rule("221", { base: simple("base"), expression: sequence("expr") }, (b) =>
    newBase(b.base, filterValues(b.expr)),
  );
  rule("229", { power: simple("power"), expression: sequence("expr") }, (b) =>
    newPower(b.power, filterValues(b.expr)),
  );

  rule(
    "237",
    {
      left: simple("left"),
      left_paren: simple("lparen"),
      dividend: subtree("dividend"),
      divisor: subtree("divisor"),
      right: simple("right"),
      right_paren: simple("rparen"),
    },
    (b) =>
      newFormula([
        leftRightObjects(b.lparen, "left"),
        newOver(
          newFormula(flattenDeep(rubyArray(b.dividend))),
          newFormula(flattenDeep(rubyArray(b.divisor))),
        ),
        leftRightObjects(b.rparen, "right"),
      ]),
  );

  rule("259", { dividend: subtree("dividend"), divisor: subtree("divisor") }, (b) =>
    newOver(
      newFormula(flattenDeep(rubyArray(b.dividend))),
      newFormula(flattenDeep(rubyArray(b.divisor))),
    ),
  );

  rule("271", { over: simple("over"), subscript: simple("subscript") }, (b) =>
    newBase(b.over, b.subscript),
  );
  rule("279", { over: simple("over"), supscript: simple("supscript") }, (b) =>
    newPower(b.over, b.supscript),
  );
  rule("287", { operant: simple("operant"), subscript: simple("subscript") }, (b) =>
    newBase(symbolsClass(b.operant), b.subscript),
  );
  rule("295", { operant: simple("operant"), supscript: simple("supscript") }, (b) =>
    newPower(symbolsClass(b.operant), b.supscript),
  );

  // --- the two Nary rules (transform.rb:303-329) --------------------------
  //
  // The most non-obvious rules in the file: they inspect a node the transform
  // ALREADY BUILT, reach into its three parameters, ask the model layer
  // `is_nary_symbol?`, and if so reassemble the `PowerBase` into an `Nary` with
  // the following expression as its body.

  rule("303", { sequence: simple("sequence"), expression: simple("expr") }, (b) => {
    const node = b.sequence;
    if (isPowerBaseDraft(node) && isNarySymbol(node.fields.parameterOne)) {
      return newNary(
        node.fields.parameterOne,
        node.fields.parameterTwo,
        node.fields.parameterThree,
        b.expr,
      );
    }
    return compact([node, b.expr]);
  });

  rule("317", { sequence: simple("sequence"), expression: sequence("expr") }, (b) => {
    const node = b.sequence;
    if (isPowerBaseDraft(node) && isNarySymbol(node.fields.parameterOne)) {
      return newNary(
        node.fields.parameterOne,
        node.fields.parameterTwo,
        node.fields.parameterThree,
        filterValues(b.expr),
      );
    }
    // `[sequence] + expr` — NOT compacted, unlike `:313`.
    return [node, ...asArray(b.expr)];
  });

  // --- functions with scripts (transform.rb:331-413) ----------------------

  rule("331", { unary_functions: simple("unary"), subscript: simple("subscript") }, (b) =>
    newBase(unaryFunctionOf(b.unary), b.subscript),
  );
  rule("344", { binary_functions: simple("binary"), supscript: simple("supscript") }, (b) =>
    newPower(b.binary, b.supscript),
  );
  rule("352", { ternary_functions: simple("ternary"), subscript: simple("subscript") }, (b) =>
    buildClass(b.ternary, b.subscript),
  );
  rule("357", { unary_functions: simple("unary"), supscript: simple("supscript") }, (b) =>
    newPower(unaryFunctionOf(b.unary), b.supscript),
  );
  rule(
    "370",
    {
      ternary_functions: simple("ternary"),
      subscript: simple("subscript"),
      third_value: simple("third_value"),
    },
    (b) => buildClass(b.ternary, b.subscript, null, b.third_value),
  );
  rule(
    "380",
    {
      ternary_functions: simple("ternary"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) => buildClass(b.ternary, b.subscript, b.supscript),
  );
  rule(
    "389",
    {
      unary_functions: simple("unary"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) => newPowerBase(unaryFunctionOf(b.unary), b.subscript, b.supscript),
  );
  rule(
    "404",
    {
      ternary_functions: simple("ternary"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
      third_value: simple("third_value"),
    },
    (b) => buildClass(b.ternary, b.subscript, b.supscript, b.third_value),
  );

  rule("415", { fonts: simple("fonts"), intermediate_exp: simple("int_exp") }, (b) =>
    fontStyle(b.fonts, b.int_exp),
  );

  // --- more sub/sup on leaves (transform.rb:430-518) ----------------------

  rule("430", { number: simple("number"), subscript: simple("subscript") }, (b) =>
    newBase(newNumber(htmlEntityToUnicode(rubyToS(b.number))), b.subscript),
  );
  rule("438", { number: simple("number"), supscript: simple("supscript") }, (b) =>
    newPower(newNumber(htmlEntityToUnicode(rubyToS(b.number))), b.supscript),
  );
  rule(
    "446",
    {
      number: simple("number"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) =>
      newPowerBase(newNumber(htmlEntityToUnicode(rubyToS(b.number))), b.subscript, b.supscript),
  );
  rule("456", { symbols: simple("sym"), subscript: simple("subscript") }, (b) =>
    newBase(symbolsClass(b.sym), b.subscript),
  );
  rule("464", { numeric_values: simple("value"), subscript: simple("subscript") }, (b) =>
    newBase(symbolsClass(b.value), b.subscript),
  );
  rule("472", { symbols: simple("sym"), supscript: simple("supscript") }, (b) =>
    newPower(symbolsClass(b.sym), b.supscript),
  );
  rule("480", { intermediate_exp: simple("int_exp"), supscript: simple("supscript") }, (b) =>
    newPower(b.int_exp, b.supscript),
  );
  rule("488", { intermediate_exp: simple("int_exp"), subscript: simple("subscript") }, (b) =>
    newBase(b.int_exp, b.subscript),
  );
  rule("496", { unicode_symbols: simple("sym"), subscript: simple("subscript") }, (b) =>
    newBase(symbolsClass(b.sym), b.subscript),
  );
  rule("504", { unicode_symbols: simple("sym"), supscript: simple("supscript") }, (b) =>
    newPower(symbolsClass(b.sym), b.supscript),
  );
  rule("512", { numeric_values: simple("value"), supscript: simple("supscript") }, (b) =>
    newPower(symbolsClass(b.value), b.supscript),
  );

  // --- \text and \mbox (transform.rb:520-575) -----------------------------

  rule("520", { text: simple("text"), first_value: simple("first_value") }, (b) =>
    buildClass(b.text, b.first_value),
  );
  rule("525", { text: simple("text"), first_value: sequence("first_value") }, (b) =>
    buildClass(b.text, joinValues(b.first_value)),
  );
  rule(
    "530",
    {
      text: simple("text"),
      first_value: simple("first_value"),
      supscript: simple("supscript"),
    },
    (b) => newPower(buildClass(b.text, b.first_value), b.supscript),
  );
  rule(
    "539",
    {
      text: simple("text"),
      first_value: sequence("first_value"),
      supscript: simple("supscript"),
    },
    (b) => newPower(buildClass(b.text, joinValues(b.first_value)), b.supscript),
  );
  rule(
    "548",
    {
      text: simple("text"),
      first_value: sequence("first_value"),
      subscript: simple("subscript"),
    },
    (b) => newBase(buildClass(b.text, joinValues(b.first_value)), b.subscript),
  );
  rule(
    "557",
    {
      text: simple("text"),
      first_value: simple("first_value"),
      subscript: simple("subscript"),
    },
    (b) => newBase(buildClass(b.text, b.first_value), b.subscript),
  );
  rule(
    "566",
    {
      text: simple("text"),
      first_value: simple("first_value"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) => newPowerBase(buildClass(b.text, b.first_value), b.subscript, b.supscript),
  );

  // `overline` is the one name the transform rewrites before resolving it.
  rule("577", { unary: simple("unary"), first_value: simple("first_value") }, (b) =>
    buildClass(rubyToS(b.unary) === "overline" ? "bar" : b.unary, b.first_value),
  );

  rule("584", { sqrt: simple("sqrt"), intermediate_exp: simple("int_exp") }, (b) =>
    newSqrt(b.int_exp),
  );

  rule(
    "589",
    {
      fonts: simple("fonts"),
      intermediate_exp: simple("int_exp"),
      supscript: simple("supscript"),
    },
    (b) => newPower(fontStyle(b.fonts, b.int_exp), b.supscript),
  );
  rule(
    "609",
    {
      fonts: simple("fonts"),
      intermediate_exp: simple("int_exp"),
      subscript: simple("subscript"),
    },
    (b) => newBase(fontStyle(b.fonts, b.int_exp), b.subscript),
  );
  rule(
    "629",
    {
      fonts: simple("fonts"),
      intermediate_exp: simple("int_exp"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) => newPowerBase(fontStyle(b.fonts, b.int_exp), b.subscript, b.supscript),
  );

  // --- roots, limits, fences (transform.rb:651-745) -----------------------

  // A nil second value becomes an EMPTY `Math::Formula`, not nil.
  rule(
    "651",
    {
      root: simple("root"),
      first_value: simple("first_value"),
      second_value: simple("second_value"),
    },
    (b) => newRoot(b.first_value, b.second_value === null ? newFormula() : b.second_value),
  );
  rule(
    "661",
    {
      root: simple("root"),
      first_value: sequence("first_value"),
      second_value: simple("second_value"),
    },
    (b) => {
      const first = filterValues(b.first_value);
      return newRoot(first === null ? newFormula() : first, b.second_value);
    },
  );

  rule(
    "672",
    { first_value: simple("first_value"), base: simple("base"), power: simple("power") },
    (b) => newLimits(b.first_value, b.base, b.power),
  );

  // `lparen`/`rparen` DISCARDS its delimiters; `left_paren`/`right_paren`
  // below keeps them. Which one fires is decided in the grammar.
  rule(
    "682",
    { lparen: simple("lparen"), expression: sequence("expr"), rparen: simple("rparen") },
    (b) => newFormula(asArray(b.expr)),
  );
  rule(
    "688",
    {
      left_paren: simple("lparen"),
      expression: simple("expr"),
      right_paren: simple("rparen"),
    },
    (b) => newFenced(symbolsClass(b.lparen), [b.expr], symbolsClass(b.rparen)),
  );
  rule(
    "698",
    {
      left_paren: simple("lparen"),
      expression: sequence("expr"),
      right_paren: simple("rparen"),
    },
    (b) => newFenced(symbolsClass(b.lparen), b.expr, symbolsClass(b.rparen)),
  );

  rule("708", { expression: sequence("expr") }, (b) => newFormula(asArray(b.expr)));

  rule(
    "712",
    {
      rule: simple("rule"),
      first_value: simple("first_value"),
      second_value: simple("second_value"),
      third_value: simple("third_value"),
    },
    (b) => newRule(b.first_value, b.second_value, b.third_value),
  );

  rule("723", { expression: simple("expression"), subscript: simple("subscript") }, (b) =>
    newBase(b.expression, b.subscript),
  );
  rule("731", { expression: simple("expr"), supscript: simple("supscript") }, (b) =>
    newPower(b.expr, b.supscript),
  );
  rule("739", { expression: sequence("expr"), supscript: simple("supscript") }, (b) =>
    newPower(filterValues(b.expr), b.supscript),
  );

  // `transform.rb:747-754` is NOT ported: it has the same key set as `:756`
  // and `Transform.rule` unshifts, so `:756` is tried first and `:747` can
  // never match. Measured on the oracle — see this module's header.

  rule(
    "756",
    {
      binary: simple("binary"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) =>
      b.binary instanceof Slice
        ? buildClass(b.binary, b.subscript, b.supscript)
        : // `subscript` twice — the gem's own bug at `:765-769`, live because
          // this rule shadows `:747`. Measured: `\frac{a}{b}_1^2` renders as
          // `frac(a)(b)_(1)^(1)`, discarding the supscript.
          newPowerBase(b.binary, b.subscript, b.subscript),
  );

  rule("773", { binary: simple("binary"), subscript: simple("subscript") }, (b) =>
    b.binary instanceof Slice ? buildClass(b.binary, b.subscript) : newBase(b.binary, b.subscript),
  );

  rule(
    "785",
    {
      symbols: simple("sym"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) => newPowerBase(symbolsClass(b.sym), b.subscript, b.supscript),
  );
  rule(
    "795",
    {
      unicode_symbols: simple("sym"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) => newPowerBase(symbolsClass(b.sym), b.subscript, b.supscript),
  );

  // `binom` never reaches `get_class` — there is no `Math::Function::Binom`,
  // and this branch is why `\binom{a}{b}` does not raise.
  rule(
    "805",
    {
      binary: simple("binary"),
      first_value: simple("first_value"),
      second_value: simple("second_value"),
    },
    (b) => {
      if (rubyToS(b.binary) === "binom") {
        return newTable(
          undefined,
          [newTr(tableTd(b.first_value)), newTr(tableTd(b.second_value))],
          newSymbolOfClass(LCURLY_ID),
          newSymbolOfClass(RCURLY_ID),
          {},
        );
      }
      return buildClass(modName(b.binary), b.first_value, b.second_value);
    },
  );

  rule(
    "831",
    {
      binary: simple("binary"),
      first_value: simple("first_value"),
      second_value: sequence("second_value"),
    },
    (b) => buildClass(modName(b.binary), b.first_value, filterValues(b.second_value)),
  );

  rule(
    "842",
    {
      underover: simple("function"),
      first_value: simple("first"),
      subscript: simple("subscript"),
      supscript: simple("supscript"),
    },
    (b) => newPowerBase(buildClass(b.function, b.first), b.subscript, b.supscript),
  );

  // --- environments (transform.rb:853-994) --------------------------------

  rule(
    "853",
    {
      environment: simple("environment"),
      table_data: sequence("table_data"),
      ending: simple("ending"),
    },
    (b) => {
      const { open, close } = environmentParens(b.environment);
      return buildTableClass(b.environment, organizeTable(asArray(b.table_data)), open, close, {});
    },
  );

  rule(
    "867",
    {
      environment: simple("environment"),
      args: simple("args"),
      table_data: simple("table_data"),
      ending: simple("ending"),
    },
    (b) => {
      // `args ? [args] : []` — a Ruby truthiness test, where only nil and
      // false are falsy. `0` and `""` are truthy there and stay truthy here.
      const columnAlign = rubyTruthy(b.args) ? [b.args] : [];
      const { open, close } = environmentParens(b.environment);
      const table = organizeTable([b.table_data], columnAlign);
      return buildTableClass(b.environment, table, open, close, tableOptions(table));
    },
  );

  // The one environment rule that omits the options argument. `Table`'s
  // default is `{}` and `@options` is assigned unconditionally, so this is
  // identical to passing `{}` — measured, `Table::Matrix.new(nil, nil, nil)`
  // and `...new(nil, nil, nil, {})` leave the same ivars.
  rule(
    "887",
    {
      environment: simple("environment"),
      table_data: simple("table_data"),
      ending: simple("ending"),
    },
    (b) => {
      const { open, close } = environmentParens(b.environment);
      return buildTableClass(b.environment, organizeTable([b.table_data]), open, close, {});
    },
  );

  rule(
    "900",
    {
      environment: simple("environment"),
      args: sequence("args"),
      table_data: sequence("table_data"),
      ending: simple("ending"),
    },
    (b) => {
      const { open, close } = environmentParens(b.environment);
      const table = organizeTable(asArray(b.table_data), asArray(b.args));
      return buildTableClass(b.environment, table, open, close, tableOptions(table));
    },
  );

  rule(
    "916",
    {
      environment: simple("environment"),
      args: simple("args"),
      table_data: sequence("table_data"),
      ending: simple("ending"),
    },
    (b) => {
      const columnAlign = rubyTruthy(b.args) ? [b.args] : [];
      const { open, close } = environmentParens(b.environment);
      const table = organizeTable(asArray(b.table_data), columnAlign);
      return buildTableClass(b.environment, table, open, close, tableOptions(table));
    },
  );

  rule(
    "933",
    {
      environment: simple("environment"),
      asterisk: simple("asterisk"),
      options: simple("options"),
      table_data: sequence("table_data"),
      ending: simple("ending"),
    },
    (b) => {
      const columnAlign = rubyTruthy(b.options) ? [b.options] : [];
      const { open, close } = environmentParens(b.environment);
      const table = organizeTable(asArray(b.table_data), columnAlign, true);
      return buildTableClass(b.environment, table, open, close, { asterisk: true });
    },
  );

  rule(
    "955",
    {
      environment: simple("environment"),
      asterisk: simple("asterisk"),
      table_data: sequence("table_data"),
      ending: simple("ending"),
    },
    (b) => {
      const { open, close } = environmentParens(b.environment);
      return buildTableClass(b.environment, organizeTable(asArray(b.table_data)), open, close, {
        asterisk: true,
      });
    },
  );

  rule("970", { environment: simple("env"), expression: simple("expr") }, (b) => {
    const { open, close } = environmentParens(b.env);
    const table = organizeTable(b.expr === null ? [] : [b.expr]);
    return buildTableClass(b.env, table, open, close, {});
  });

  rule("983", { environment: simple("env"), expression: sequence("expr") }, (b) => {
    const { open, close } = environmentParens(b.env);
    return buildTableClass(b.env, organizeTable(compact(asArray(b.expr))), open, close, {});
  });

  rule("996", { substack: simple("substack"), expression: sequence("value") }, (b) =>
    newSubstack(organizeTable(asArray(b.value))),
  );

  return { transform: t, fired, ruleIds };
}

/**
 * The one transform `parseLatex` uses, built once.
 *
 * Registration is deterministic and takes no arguments — unlike the grammar,
 * which is built per decimal marker — so rebuilding registers the same 117
 * rules to no purpose. `asciimathTransform` memoizes for the same reason.
 *
 * `buildLatexTransform` stays exported and stays UNmemoized: it returns the
 * firing counters, and `transform-coverage.spec.ts` needs a fresh, zeroed set.
 * Sharing this instance with that suite would let one test's firings satisfy
 * another test's coverage assertion.
 */
let latexTransformInstance: Transform | undefined;

export function latexTransform(): Transform {
  if (latexTransformInstance === undefined) {
    latexTransformInstance = buildLatexTransform().transform;
  }
  return latexTransformInstance;
}

/** Ruby truthiness: only nil and false are falsy. */
function rubyTruthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/**
 * The `unary.is_a?(Parslet::Slice) ? get_class(unary).new : unary` branch that
 * `transform.rb:333`, `:359` and `:392` each spell out.
 */
function unaryFunctionOf(unary: unknown): unknown {
  return unary instanceof Slice ? buildClass(unary) : unary;
}

/**
 * `binary.to_s.include?("mod") ? "mod" : binary` (`transform.rb:823`, `:835`) —
 * `bmod`, `pmod` and `mod` all collapse to `Mod` by a SUBSTRING test, which is
 * also why `get_class("bmod")` never runs (it would raise `NameError`).
 */
function modName(binary: unknown): unknown {
  return rubyToS(binary).includes("mod") ? "mod" : binary;
}

/** `first_value.join` over a sequence binding (`transform.rb:527`). */
function joinValues(values: TransformValue): string {
  return asArray(values).map(rubyToS).join("");
}

/**
 * `Utility::FONT_STYLES[fonts.to_sym]` with the generic fallback the four font
 * rules share. The keyword string is passed as the SECOND argument in both
 * branches — a miss is not an error here, unlike `get_class`.
 */
function fontStyle(fonts: unknown, intExp: unknown): LatexDraft {
  const keyword = rubyToS(fonts);
  return newFontStyle(LATEX_FONT_STYLES.get(keyword), intExp, keyword);
}

/** `sequence.parameter_one.is_nary_symbol?` (`transform.rb:305`, `:319`). */
function isNarySymbol(value: unknown): boolean {
  return (
    isSymbolDraft(value) && value.identity !== undefined && NARY_SYMBOL_IDS.has(value.identity)
  );
}

/* =========================================================================
 * 5. Finalization, and the Parser#parse wrapping
 * ---------------------------------------------------------------------- */

/**
 * Finalizes one transformed value into what the immutable model can hold:
 * drafts become `core` nodes, slices become their text (the gem's serializer
 * does the same), arrays and leftover hashes are rebuilt around their finalized
 * contents.
 */
function finalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return value.map(finalizeValue);
  if (isDraft(value)) return finalizeDraft(value);
  if (isPlainObject(value)) {
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
function finalizeDraft(draft: LatexDraft, inputString?: string): MathNode {
  const init: Record<string, unknown> = {};
  // Field names are chosen to be the constructors' own init keys, and
  // `finalizeValue` is total over what a draft field can hold — nodes, arrays,
  // slices, option hashes, booleans, strings and nil — so there is nothing to
  // special-case per kind. What decides model parity is which fields a draft
  // HAS, and that is set by the builder that matched the Ruby `initialize`.
  for (const [key, value] of Object.entries(draft.fields)) init[key] = finalizeValue(value);
  if (draft.identity !== undefined) init[draft.kind === "symbol" ? "id" : "name"] = draft.identity;
  if (inputString !== undefined) init.inputString = inputString;
  // `Table#initialize` stores whatever it was given, including nil; `TableNode`
  // declares a sequence, and `assignedTableSequence` would take nil as "not
  // supplied". Only the `binom` and environment rules build a table and all of
  // them pass an array, so this is a guard rather than a path.
  if (draft.kind === "table" && init.value === null) init.value = [];
  const ctor = LATEX_NODE_CONSTRUCTORS[draft.kind];
  return new ctor(init);
}

/**
 * `Latex::Parser#parse` (`latex/parser.rb:15-21`) after the transform, plus the
 * `formula.input_string = text` that `Plurimath::Math.parse_formula` adds
 * (`math.rb:63-66`).
 *
 * Unlike AsciiMath's, this wraps UNCONDITIONALLY: `formula = [formula] unless
 * formula.is_a?(Array)` and then `Math::Formula.new(formula)`. A transform that
 * already produced a `Formula` is therefore nested inside another one, and a
 * `Left` at the head of the OUTER array is what clears `left_right_wrapper` —
 * never the inner formula's.
 */
export function finalizeLatexParse(transformed: unknown, inputString: string): FormulaNode {
  const value = Array.isArray(transformed) ? transformed : [transformed];
  return finalizeDraft(newFormula(value), inputString) as FormulaNode;
}
