/** biome-ignore-all lint/style/useNamingConvention: pattern keys are Parslet
 * tree keys — Ruby's snake_case is the schema, exactly as in the generated
 * tables, and renaming one would stop its rule from ever matching. */
/**
 * The AsciiMath transform, ported rule for rule from the gem
 * (`lib/plurimath/asciimath/transform.rb`, plurimath 0.11.6 at `00c52783`),
 * plus the three rules `BaseNumberPrefix::Transform` mixes in ahead of them.
 *
 * The port is deliberately structural, exactly like the grammar's: every
 * `rule(...)` in `transform.rb` is one `t.rule(...)` here, in the same source
 * order, and each carries the Ruby line it came from. Order is behaviour —
 * `Parslet::Transform.rule` unshifts, so matching tries rules in REVERSE
 * definition order and a later definition wins a tie (`src/pegkit/transform.ts`).
 * The two `unitsml` rules (`transform.rb:33`, `:875`) are dropped, not ported:
 * the grammar's `unitsml` alternative is commented out (UnitsML is deferred,
 * ARCHITECTURE.md §5), so no tree can carry their key sets, and pattern
 * matching is by exact key-set equality — removing them cannot affect any
 * other rule.
 *
 * ## Mutation is behaviour, so nodes are drafts until the entry point returns
 *
 * The gem's actions mutate what earlier actions built: `numerator.value.shift`
 * (`transform.rb:96`) pulls an element out of a *finished* formula,
 * `power_value.insert(0, ...)` (`:503`) returns a bound array that still
 * aliases the elements a new node captured, and `Formula.new(array)` stores
 * the caller's array by reference, so a later `shift` reaches inside the node.
 * Core nodes are publicly immutable (§5), so the transform works on
 * `AsciimathDraft` objects — one mutable class, not a parallel node hierarchy
 * (the rejected `FracDraft`-per-class design; DECISIONS.md) — and `finalize`
 * converts the finished tree into real `core` nodes in one pass at the end.
 * Draft arrays are held by reference exactly as Ruby holds them, which is what
 * makes the aliasing above come out right, including the measured oddity where
 * `power_value.insert(0, power_base_object)` leaves the same element both
 * inside the new node and beside it.
 *
 * ## What a draft must imitate about a Ruby node
 *
 * - **Constructor side effects.** Each Ruby `initialize` assigns a specific
 *   ivar set (measured per class; `./registry` documents the families), and
 *   Unary/Binary/Ternary/Linebreak constructors run
 *   `ModelHelper.validate_left_right`, which flips `left_right_wrapper` back
 *   to true on any *formula field* whose first value is a `Left` — undoing
 *   what `Formula#initialize` just decided. Both are replayed here.
 * - **`is_a?` dispatch.** Rules branch on `Slice`, `Formula`, `Table`,
 *   `Comma`, `Text`, `Fenced`, `Left`; drafts answer through `kind` plus the
 *   carried class identity.
 * - **Being a transform LEAF.** Parslet's `SimpleBind` accepts anything whose
 *   class is not exactly Hash or Array, so a node is bindable where a hash is
 *   not; a class instance (never a plain object) reproduces that under
 *   pegkit's `isPlainHash`.
 * - **`to_s` emptiness.** `expr.to_s.strip.empty?` guards many appends. No
 *   Math class overrides `to_s` (checked: no `def to_s` under
 *   `lib/plurimath/math`), so a node is never "empty"; only nil, an empty
 *   Slice and a blank string are. That is exactly pegkit's `strippedEmpty`.
 *
 * ## File layout (the review seams)
 *
 *   1. Ruby-semantics helpers (`flatten`/`compact`/`slice_when`/`strip`)
 *   2. The draft model and its constructor-faithful builders
 *   3. The `Utility` helpers the rules call — the AsciiMath-specific four
 *      (`td_values`, `td_value`, `frac_values`, `asciimath_symbol_object`,
 *      which shadow the generic `Utility` in Ruby) and the generic ones
 *      (`filter_values`, `unfenced_value`, `symbol_value`, `get_class`)
 *   4. ONE `Transform` instance, rules registered in gem order, in sections:
 *      pass-through/leaf; frac/comma/table-cell; base/power/power-base;
 *      unary/binary/ternary/fonts; tables/fences/left-right/color/mod
 *   5. Finalization into immutable `core` nodes, and the `Parser#parse`
 *      wrapping the format entry point calls
 */

import {
  AbsNode,
  BarNode,
  BaseNode,
  BinaryFunctionNode,
  CeilNode,
  ColorNode,
  DdotNode,
  DotNode,
  FencedNode,
  FloorNode,
  FontStyleNode,
  FormulaNode,
  FracNode,
  HatNode,
  IntNode,
  LinebreakNode,
  type MathNode,
  type NodeKind,
  type NodeOptions,
  type NodeParameter,
  type NodeSequence,
  NormNode,
  NumberNode,
  ObraceNode,
  OintNode,
  OversetNode,
  ProdNode,
  SqrtNode,
  SumNode,
  SymbolNode,
  TableNode,
  TernaryFunctionNode,
  TextNode,
  TildeNode,
  UbraceNode,
  UlNode,
  UnaryFunctionNode,
  UndersetNode,
  VecNode,
} from "../../core/index";
import {
  ASCIIMATH_INPUT_COLLISIONS,
  ASCIIMATH_PAREN_INPUTS,
  ASCIIMATH_SYMBOL_INPUT,
} from "../../generated/asciimath/input";
import {
  Slice,
  sequence,
  simple,
  strippedEmpty,
  subtree,
  Transform,
  type TransformValue,
} from "../../pegkit/index";
import {
  ASCIIMATH_CLASS_REGISTRY,
  ASCIIMATH_FONT_STYLES,
  ASCIIMATH_UNARY_CLASS_SET,
  type AsciimathClassEntry,
} from "./registry";

/* =========================================================================
 * 1. Ruby-semantics helpers
 * ---------------------------------------------------------------------- */

/**
 * Ruby `Array#compact`: a NEW array without nils. The engine never puts
 * `undefined` in a tree, but a JS caller's array could; Ruby has no such
 * value, so it folds into nil here as everywhere else in this port.
 */
function compact(values: readonly unknown[]): unknown[] {
  return values.filter((value) => value !== null && value !== undefined);
}

/**
 * Ruby `Array#flatten`: RECURSIVE, unlike JavaScript's one-level `flat()` —
 * `Utility.filter_values` and a dozen actions depend on the difference. Only
 * arrays are flattened; hashes and nodes inside stay intact.
 */
function flattenDeep(values: readonly unknown[]): unknown[] {
  return values.flatMap((value) => (Array.isArray(value) ? flattenDeep(value) : [value]));
}

/**
 * `.flatten` on a subtree binding that may not be an array
 * (`transform.rb:361`). Ruby's dispatch: `Array#flatten` recurses;
 * `Hash#flatten` yields the one-level `[key, value, key, value, ...]` pairs
 * (symbol keys arrive here as the strings they serialize to); anything else
 * raises `NoMethodError`, which the gem's public boundary converts to a
 * `ParseError` — so an unexpected leaf throws here too rather than being
 * quietly wrapped.
 */
function rubyFlatten(value: unknown): unknown[] {
  if (Array.isArray(value)) return flattenDeep(value);
  if (isPlainObject(value)) return Object.entries(value).flat();
  throw new TypeError(
    `asciimath transform: .flatten on a ${typeof value} (Ruby raises NoMethodError here)`,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as object).constructor === Object
  );
}

/**
 * Ruby `Enumerable#slice_when { |element, _next| split?(element) }`: chunks
 * split BETWEEN an element the block accepts and its successor, so a chunk
 * ends at each separator and the last element never opens an empty chunk.
 */
function sliceWhen(values: readonly unknown[], splitAfter: (value: unknown) => boolean) {
  const chunks: unknown[][] = [];
  let current: unknown[] = [];
  for (let index = 0; index < values.length; index++) {
    current.push(values[index]);
    if (index < values.length - 1 && splitAfter(values[index])) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Ruby `String#strip`, which `Utility.symbols_class` applies before its table
 * lookup. Ruby strips ASCII whitespace plus NUL — NOT the Unicode set
 * JavaScript's `trim()` uses, and the difference is reachable: a no-break
 * space is a symbol character here (`grammar.ts` RUBY_SPACE), so `trim()`
 * would strip it and look up the wrong key.
 */
function rubyStrip(text: string): string {
  return text.replace(/^[\0\t\n\v\f\r ]+/, "").replace(/[\0\t\n\v\f\r ]+$/, "");
}

/** Ruby `nil.to_s`/`Slice#to_s`/`String#to_s` for the values `join` walks. */
function rubyToS(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Slice) return value.text;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new TypeError(`asciimath transform: no deterministic to_s for ${typeof value}`);
}

/**
 * Ruby `Array#to_s` (= `inspect`) for the one call site that stringifies an
 * array: `asciimath_symbol_object(color)` on the RGB sequence rule
 * (`transform.rb:1047-1050`). Slices inspect as `"text"@offset` and strings
 * as their quoted form — both deterministic. A NODE in the array would
 * inspect with its object address, which not even the gem can reproduce
 * across runs; if an input ever reaches that, this throws so the divergence
 * is measured rather than invented.
 */
function rubyArrayToS(values: readonly unknown[]): string {
  const parts = values.map((value) => {
    if (value === null || value === undefined) return "nil";
    if (value instanceof Slice) return `${JSON.stringify(value.text)}@${value.offset}`;
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return rubyArrayToS(value);
    throw new TypeError(
      "asciimath transform: Array#to_s over a node is address-dependent in Ruby; " +
        "this input needs measuring against the gem before it can be ported",
    );
  });
  return `[${parts.join(", ")}]`;
}

/* =========================================================================
 * 2. The draft model
 * ---------------------------------------------------------------------- */

/**
 * One mutable stand-in for any Ruby node under construction. `fields` holds
 * the ivars the class's `initialize` actually assigned, under their
 * TypeScript names, and stays mutable — array fields by reference — until
 * `finalize`. `identity` is the Ruby basename an alias carrier rides under
 * (`Power`, `Comma`, `Paren::Lround`), matching the core carriers' `name`/`id`.
 */
export class AsciimathDraft {
  constructor(
    readonly kind: NodeKind,
    readonly identity: string | undefined,
    readonly fields: Record<string, unknown>,
  ) {}
}

function isDraft(value: unknown): value is AsciimathDraft {
  return value instanceof AsciimathDraft;
}

/** `is_a?(Math::Formula)` — the transform never builds a Formula subclass. */
function isFormulaDraft(value: unknown): value is AsciimathDraft {
  return isDraft(value) && value.kind === "formula";
}

/** `is_a?(Math::Symbols::Symbol)` — true of every symbol class, parens included. */
function isSymbolDraft(value: unknown): value is AsciimathDraft {
  return isDraft(value) && value.kind === "symbol";
}

/** `is_a?` against one concrete symbol class (`Comma`, `Paren::Vert`, ...). */
function isSymbolDraftOf(value: unknown, id: string): boolean {
  return isSymbolDraft(value) && value.identity === id;
}

function isTableDraft(value: unknown): boolean {
  return isDraft(value) && value.kind === "table";
}

function isTextDraft(value: unknown): value is AsciimathDraft {
  return isDraft(value) && value.kind === "text";
}

function isFencedDraft(value: unknown): value is AsciimathDraft {
  return isDraft(value) && value.kind === "fenced";
}

function isLinebreakDraft(value: unknown): boolean {
  return isDraft(value) && value.kind === "linebreak";
}

function isLeftDraft(value: unknown): boolean {
  return isDraft(value) && value.kind === "unaryFunction" && value.identity === "Left";
}

/** A formula draft's live `value` array — the mutable list rules shift/pop. */
function formulaValue(draft: AsciimathDraft): unknown[] {
  return draft.fields.value as unknown[];
}

/**
 * `ModelHelper.validate_left_right` (`model_helper.rb:17-23`), run by the
 * Unary/Binary/Ternary/Linebreak constructors over their parameter fields: a
 * formula FIELD whose first value is a `Left` gets `left_right_wrapper`
 * forced back to true — undoing the false that `Formula#initialize` set.
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
 * (`formula.rb:39-49`): a non-array is wrapped, the array itself is stored by
 * reference, the wrapper flag turns false when the first value is a `Left`,
 * and `displaystyle` is assigned true. `@input_string` and `@display` stay
 * unassigned — the entry point adds `input_string` at the very end, as
 * `Plurimath::Math.parse` does.
 */
function newFormula(value: unknown = [], leftRightWrapper = true): AsciimathDraft {
  const list = Array.isArray(value) ? value : [value];
  const wrapper = isLeftDraft(list[0]) ? false : leftRightWrapper;
  return new AsciimathDraft("formula", undefined, {
    value: list,
    leftRightWrapper: wrapper,
    displaystyle: true,
  });
}

/** `Math::Number.new(value, base:)` — Slice value to text, mini flags false. */
function newNumber(value: unknown, base: number | null = null): AsciimathDraft {
  return new AsciimathDraft("number", undefined, {
    value: sliceToText(orNil(value)),
    miniSubSized: false,
    miniSupSized: false,
    base,
  });
}

/** A symbol class resolved from a table: `klass.new` — `@value` assigned nil. */
function newSymbolOfClass(id: string): AsciimathDraft {
  return new AsciimathDraft("symbol", id, { value: null });
}

/** `Math::Symbols::Symbol.new(string)` — the base class keeps the text. */
function newBareSymbol(text: string): AsciimathDraft {
  return new AsciimathDraft("symbol", "Symbol", { value: text });
}

function unaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  parameterOne: unknown,
  withAttributes: boolean,
): AsciimathDraft {
  const one = sliceToText(orNil(parameterOne));
  validateLeftRight([one]);
  const fields: Record<string, unknown> = { parameterOne: one };
  if (withAttributes) fields.attributes = {};
  return new AsciimathDraft(kind, identity, fields);
}

function binaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  parameterOne: unknown,
  parameterTwo: unknown,
  assignsOptions = false,
): AsciimathDraft {
  const one = orNil(parameterOne);
  const two = orNil(parameterTwo);
  validateLeftRight([one, two]);
  const fields: Record<string, unknown> = { parameterOne: one, parameterTwo: two };
  if (assignsOptions) fields.options = {};
  return new AsciimathDraft(kind, identity, fields);
}

function ternaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  parameterOne: unknown,
  parameterTwo: unknown,
  parameterThree: unknown,
): AsciimathDraft {
  const one = orNil(parameterOne);
  const two = orNil(parameterTwo);
  const three = orNil(parameterThree);
  validateLeftRight([one, two, three]);
  return new AsciimathDraft(kind, identity, {
    parameterOne: one,
    parameterTwo: two,
    parameterThree: three,
  });
}

/** `Text.new(parameter_one = "", lang: nil)` — `@lang` is always assigned. */
function newText(parameterOne?: unknown): AsciimathDraft {
  const one = parameterOne === undefined ? "" : sliceToText(parameterOne);
  validateLeftRight([one]);
  return new AsciimathDraft("text", undefined, { parameterOne: one, lang: null });
}

/**
 * `Td.new(parameter_one, parameter_two)` (`td.rb:7-10`): `delete_if` strips
 * literal `"&"` cells from the CALLER's array in place (a node never equals a
 * string, so only a raw slice or string can match), then `Array(...)` folds
 * nil to `[]`.
 */
function newTd(parameterOne: unknown, parameterTwo: unknown = null): AsciimathDraft {
  let one = orNil(parameterOne);
  if (one !== null) {
    if (!Array.isArray(one)) {
      throw new TypeError(
        "asciimath transform: Td.new with a non-array (Ruby raises NoMethodError on delete_if)",
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
 * `Tr.new(parameter_one = [])` (`tr.rb:7-14`): a row that is ALL literal
 * `"@"` cells is rewritten to empty `Td`s in place. `"@" === node` is false
 * for every node (nodes have no `to_str`), so only raw slices or strings can
 * trip it — and an EMPTY row trivially does, where `map!` then does nothing.
 */
function newTr(parameterOne: unknown = []): AsciimathDraft {
  if (
    Array.isArray(parameterOne) &&
    parameterOne.every((cell) => cell === "@" || (cell instanceof Slice && cell.text === "@"))
  ) {
    for (let index = 0; index < parameterOne.length; index++) parameterOne[index] = newTd([]);
  }
  return unaryDraft("unaryFunction", "Tr", parameterOne, false);
}

/** `Fenced.new(p1, p2, p3)` — `@options` is always assigned, `{}` included. */
function newFenced(
  parameterOne: unknown,
  parameterTwo: unknown,
  parameterThree: unknown,
): AsciimathDraft {
  const draft = ternaryDraft("fenced", undefined, parameterOne, parameterTwo, parameterThree);
  draft.fields.options = {};
  return draft;
}

/**
 * `Table.new(value, open_paren, close_paren)` (`table.rb:22-30`): the parens
 * run through `Utility.symbols_class(..., lang: :unicodemath)`, which returns
 * a non-string argument unchanged — and the transform only ever passes nodes
 * or nil, so the coercion is pass-through here. A string would need the
 * unicodemath symbol table this format does not carry; reaching it would be a
 * new measurement, so it throws instead of guessing.
 */
function newTable(value: unknown, openParen: unknown, closeParen: unknown): AsciimathDraft {
  for (const paren of [openParen, closeParen]) {
    if (typeof paren === "string" || paren instanceof Slice) {
      throw new TypeError(
        "asciimath transform: Table.new with a string paren would need the unicodemath table",
      );
    }
  }
  return new AsciimathDraft("table", undefined, {
    value: orNil(value),
    openParen: orNil(openParen),
    closeParen: orNil(closeParen),
    options: {},
  });
}

/** `Linebreak.new` — both defaults assigned (`linebreak.rb:9-13`). */
function newLinebreak(): AsciimathDraft {
  return new AsciimathDraft("linebreak", undefined, { parameterOne: null, attributes: {} });
}

/** `FontStyle::<name>.new(value, keyword)` — a BinaryFunction assign pair. */
function newFontStyle(name: string, parameterOne: unknown, parameterTwo: unknown): AsciimathDraft {
  return binaryDraft("fontStyle", name, parameterOne, parameterTwo);
}

const newFrac = (a: unknown, b: unknown) => binaryDraft("frac", undefined, a, b);
const newPower = (a: unknown, b: unknown) => binaryDraft("binaryFunction", "Power", a, b);
const newBaseFn = (a: unknown, b: unknown) => binaryDraft("base", undefined, a, b);
const newMod = (a: unknown, b: unknown) => binaryDraft("binaryFunction", "Mod", a, b);
const newPowerBase = (a: unknown, b: unknown, c: unknown) =>
  ternaryDraft("ternaryFunction", "PowerBase", a, b, c);
const newLeftFn = (a: unknown) => unaryDraft("unaryFunction", "Left", a, false);
const newRightFn = (a: unknown) => unaryDraft("unaryFunction", "Right", a, false);
const newNorm = (a: unknown) => unaryDraft("norm", undefined, a, false);
const newColor = (a: unknown, b: unknown) => binaryDraft("color", undefined, a, b);

/* =========================================================================
 * 3. The Utility helpers the rules call
 * ---------------------------------------------------------------------- */

/**
 * `Utility.symbols_hash(:asciimath)` — the SYMBOL classes only, parens
 * excluded — reconstructed from the generated merged table: drop the paren
 * contributions, then restore the three collision keys the paren side had
 * overridden. `asciimath_symbol_object` consults this table FIRST and exact
 * (no strip), which is why `"|"` builds `Paren::Vert` (parens only) while
 * `"+"` builds `Plus` (symbols side). Verified against the gem: 3,217 keys,
 * 62 paren keys, exactly 3 overlaps.
 */
const ASCIIMATH_SYMBOLS_ONLY: ReadonlyMap<string, string> = (() => {
  const map = new Map(ASCIIMATH_SYMBOL_INPUT);
  for (const input of ASCIIMATH_PAREN_INPUTS) map.delete(input);
  for (const [input, symbolId] of ASCIIMATH_INPUT_COLLISIONS) map.set(input, symbolId);
  return map;
})();

/** `value&.to_s` on what `asciimath_symbol_object` receives. */
function symbolLookupText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return rubyArrayToS(value);
  throw new TypeError(`asciimath transform: asciimath_symbol_object on a ${typeof value}`);
}

/**
 * `Asciimath::Utility.asciimath_symbol_object` (`asciimath/utility.rb:39-46`)
 * — one of the four AsciiMath-specific helpers that SHADOW the generic
 * `Utility` in Ruby. Symbol table first, exact key; then `symbol_object`'s
 * preprocessing-placeholder remap; then `symbols_class` over the merged
 * table with Ruby's `strip`; a miss keeps the text on the base class.
 */
function asciimathSymbolObject(value: unknown): AsciimathDraft | null {
  if (value === null || value === undefined) return null;
  const text = symbolLookupText(value);
  const symbolId = ASCIIMATH_SYMBOLS_ONLY.get(text);
  if (symbolId !== undefined) return newSymbolOfClass(symbolId);
  return symbolObject(text);
}

/** `Utility.symbol_object` (`utility.rb:281-290`): undo the preprocessor. */
function symbolObject(text: string): AsciimathDraft {
  let value = text;
  if (value === "ℒ") value = "{:";
  else if (value === "ℛ") value = ":}";
  else if (value === "ᑕ") value = "&#x2329;";
  else if (value === "ᑐ") value = "&#x232a;";
  return symbolsClass(value);
}

/** `Utility.symbols_class` (`utility.rb:212-218`) for the asciimath lang. */
function symbolsClass(text: string): AsciimathDraft {
  const id = ASCIIMATH_SYMBOL_INPUT.get(rubyStrip(text));
  return id !== undefined ? newSymbolOfClass(id) : newBareSymbol(text);
}

/**
 * `Utility.filter_values(array)` (`utility.rb:192-200`), whose return SHAPE —
 * formula, lone element, nil — drives which pattern matches next, so the
 * polymorphism is ported exactly. A Formula input contributes its LIVE value
 * array: `Formula.new(formula.value)` shares it, mutations and all.
 */
function filterValues(value: unknown): unknown {
  if (!Array.isArray(value) && !isFormulaDraft(value)) return value;
  const array = isFormulaDraft(value) ? formulaValue(value) : compact(flattenDeep(value));
  if (array.length > 1) return newFormula(array);
  return array.length === 0 ? null : array[0];
}

/** `Utility.unfenced_value(object)` (`utility.rb:255-268`), one-arg form. */
function unfencedValue(value: unknown): unknown {
  if (isFencedDraft(value)) return filterValues(value.fields.parameterTwo);
  if (Array.isArray(value)) return filterValues(value);
  return value;
}

/**
 * `Utility.symbol_value(object, value)` (`utility.rb:202-210`). Only the
 * class checks matching the separator fire; the generic arm compares the
 * node's own `value` string.
 */
function symbolValue(object: unknown, separator: string): boolean {
  if (separator === "," && isSymbolDraftOf(object, "Comma")) return true;
  if (separator === "-" && isSymbolDraftOf(object, "Minus")) return true;
  if (separator === "|" && isSymbolDraftOf(object, "Paren::Vert")) return true;
  if (isSymbolDraft(object) && object.fields.value === separator) return true;
  return separator === "\\\\" && isLinebreakDraft(object);
}

/**
 * `Asciimath::Utility.frac_values` (`asciimath/utility.rb:30-37`): does a
 * formula or list carry a comma? Anything else answers nil, folded to false.
 */
function fracValues(value: unknown): boolean {
  if (isFormulaDraft(value)) return formulaValue(value).some((item) => symbolValue(item, ","));
  if (Array.isArray(value)) return value.some((item) => symbolValue(item, ","));
  return false;
}

/**
 * `Asciimath::Utility.td_values(objects, slicer)`
 * (`asciimath/utility.rb:10-19`): split a cell list at each separator into
 * `Td`s, dropping the separators, with a trailing separator opening one empty
 * cell at the end.
 */
function tdValues(objects: readonly unknown[], slicer: string): AsciimathDraft[] {
  const tds = sliceWhen(objects, (object) => symbolValue(object, slicer)).map((chunk) =>
    newTd(compact(chunk.filter((cell) => !symbolValue(cell, slicer)))),
  );
  if (objects.length > 0 && symbolValue(objects[objects.length - 1], slicer)) {
    tds.push(newTd([]));
  }
  return tds;
}

/**
 * `Asciimath::Utility.td_value` (`asciimath/utility.rb:21-28`): an EMPTY
 * string or slice cell becomes `Text.new(nil)` — nil, not the constructor's
 * `""` default; anything else passes through.
 */
function tdValue(cell: unknown): unknown {
  const isStringLike = typeof cell === "string" || cell instanceof Slice;
  if (isStringLike && rubyToS(cell) === "") return newText(null);
  return cell;
}

/**
 * `Utility.get_class` through the explicit registry (`./registry`). Ruby
 * capitalizes into a const_get; here the registry is keyed by the captured
 * name itself, and a miss throws — the registry's completeness is asserted
 * against the generated reachability census, so a throw means a parity gap,
 * and constructing something plausible would hide it.
 */
function getClass(name: unknown): AsciimathClassEntry {
  const key = name instanceof Slice ? name.text : String(name);
  const entry = ASCIIMATH_CLASS_REGISTRY.get(key);
  if (entry === undefined) {
    throw new Error(`asciimath transform: no class registered for "${key}"`);
  }
  return entry;
}

/** `.new` on what `get_class` resolved, honouring that class's initialize. */
function constructClass(entry: AsciimathClassEntry, ...args: unknown[]): AsciimathDraft {
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
  }
}

/** `Utility::UNARY_CLASSES.include?(function)` — slices compare by text. */
function isUnaryClassName(name: unknown): boolean {
  const key = name instanceof Slice ? name.text : String(name);
  return ASCIIMATH_UNARY_CLASS_SET.has(key);
}

/** `Utility::FONT_STYLES[font_style.to_sym]` — a miss is a NoMethodError. */
function fontStyleName(name: unknown): string {
  const key = name instanceof Slice ? name.text : String(name);
  const style = ASCIIMATH_FONT_STYLES.get(key);
  if (style === undefined) {
    throw new Error(`asciimath transform: no font style registered for "${key}"`);
  }
  return style;
}

/* =========================================================================
 * 4. The rules, in transform.rb order — ONE Transform instance
 * ---------------------------------------------------------------------- */

/**
 * The bound-array casts the actions use. Sequence bindings arrive as the
 * transformed node's own arrays, so mutating one (Ruby's `shift`, `pop`,
 * `insert`) is visible wherever else the array is referenced — that aliasing
 * is load-bearing, see the module docs.
 */
function asArray(value: TransformValue): unknown[] {
  return value as unknown[];
}

function buildAsciimathTransform(): Transform {
  const t = new Transform();

  // --- BaseNumberPrefix::Transform (base_number_prefix.rb:36-38) ----------
  // `include` runs first (`transform.rb:6`), so these three are DEFINED first
  // and, matching in reverse definition order, tried last. Binary and octal
  // literals are decimalized at construction; hex keeps its digits.

  // BigInt, not parseInt: Ruby's `to_i(2)` is exact at any length, and a
  // 60-digit binary literal already exceeds a double's 53-bit mantissa.
  t.rule({ hex_number: simple("hex") }, (b) => newNumber(rubyToS(b.hex), 16));
  t.rule({ binary_number: simple("bin") }, (b) =>
    newNumber(BigInt(`0b${rubyToS(b.bin)}`).toString(), 2),
  );
  t.rule({ octal_number: simple("oct") }, (b) =>
    newNumber(BigInt(`0o${rubyToS(b.oct)}`).toString(), 8),
  );

  // --- pass-through and leaf rules (transform.rb:8-91) --------------------

  /** `transform.rb:8` */
  t.rule({ mod: simple("mod") }, (b) => b.mod);
  /** `transform.rb:9` */
  t.rule({ frac: simple("frac") }, (b) => b.frac);
  /** `transform.rb:10` */
  t.rule({ unary: simple("unary") }, (b) => b.unary);
  /** `transform.rb:11` */
  t.rule({ table: simple("table") }, (b) => b.table);
  /** `transform.rb:12` */
  t.rule({ comma: simple("comma") }, (b) => asciimathSymbolObject(b.comma));
  /** `transform.rb:13` */
  t.rule({ slash: simple("slash") }, () => newLinebreak());
  /** `transform.rb:14` */
  t.rule({ unary: sequence("unary") }, (b) => filterValues(b.unary));
  /** `transform.rb:15` */
  t.rule({ rparen: simple("rparen") }, (b) => asciimathSymbolObject(b.rparen));
  /** `transform.rb:16` */
  t.rule({ number: simple("number") }, (b) => newNumber(b.number));

  /** `transform.rb:18` */
  t.rule({ ternary: simple("ternary") }, (b) => b.ternary);
  /** `transform.rb:19` */
  t.rule({ sequence: simple("sequence") }, (b) => b.sequence);
  /** `transform.rb:20` */
  t.rule({ table_row: simple("table_row") }, (b) => b.table_row);
  /** `transform.rb:21` */
  t.rule({ sequence: sequence("sequence") }, (b) => b.sequence);
  /** `transform.rb:22` */
  t.rule({ power_base: simple("power_base") }, (b) => b.power_base);
  /** `transform.rb:23` */
  t.rule({ left_right: simple("left_right") }, (b) => b.left_right);
  /** `transform.rb:24` */
  t.rule({ table_left: simple("table_left") }, (b) => b.table_left);

  /** `transform.rb:26` */
  t.rule({ left_right: sequence("left_right") }, (b) => b.left_right);
  /** `transform.rb:27` */
  t.rule({ power_base: sequence("power_base") }, (b) => b.power_base);
  /** `transform.rb:28` */
  t.rule({ table_right: simple("table_right") }, (b) => b.table_right);
  /** `transform.rb:29` */
  t.rule({ intermediate_exp: simple("int_exp") }, (b) => b.int_exp);
  /** `transform.rb:30` */
  t.rule({ power_value: sequence("power_value") }, (b) => b.power_value);
  /** `transform.rb:31` */
  t.rule({ mod: simple("mod"), expr: simple("expr") }, (b) => [b.mod, b.expr]);

  // `transform.rb:33-35` (unitsml: simple) — DROPPED: the grammar's unitsml
  // alternative is commented out, so no tree carries this key set.

  /** `transform.rb:37-42` — the special-fonts literal keeps only its first
   * character; the family keyword is hardcoded `"mathbf"` even though the
   * class is DoubleStruck. Transcribed, not corrected. */
  t.rule({ bold_fonts: simple("font") }, (b) => {
    const first = [...rubyToS(b.font)][0];
    return newFontStyle("DoubleStruck", asciimathSymbolObject(first ?? null), "mathbf");
  });

  /** `transform.rb:44` */
  t.rule({ unary_class: simple("unary") }, (b) => constructClass(getClass(b.unary)));
  /** `transform.rb:48` */
  t.rule({ binary_class: simple("binary") }, (b) => constructClass(getClass(b.binary)));
  /** `transform.rb:52` */
  t.rule({ ternary_class: simple("ternary") }, (b) => constructClass(getClass(b.ternary)));

  /** `transform.rb:56` — Ruby's RECURSIVE flatten, and no compact. */
  t.rule({ comma_separated: subtree("comma_separated") }, (b) => rubyFlatten(b.comma_separated));

  /** `transform.rb:60` */
  t.rule({ symbol: simple("symbol") }, (b) => asciimathSymbolObject(b.symbol));

  /** `transform.rb:64-71` */
  t.rule({ expr: subtree("expr") }, (b) =>
    Array.isArray(b.expr) ? compact(flattenDeep(b.expr)) : b.expr,
  );

  /** `transform.rb:73-75` — the Slice test the corpus cannot record: a
   * recorded tree flattens slices to strings, which is why recorded trees are
   * not a usable transform input. */
  t.rule({ text: simple("text") }, (b) =>
    b.text instanceof Slice ? constructClass(getClass("text"), b.text) : b.text,
  );

  /** `transform.rb:77-79` */
  t.rule({ text: sequence("text") }, (b) =>
    constructClass(getClass("text"), asArray(b.text).map(rubyToS).join("")),
  );

  /** `transform.rb:81` */
  t.rule({ power_value: simple("power_value") }, (b) => b.power_value);
  /** `transform.rb:85` */
  t.rule({ base_value: simple("base_value") }, (b) => b.base_value);
  /** `transform.rb:89` */
  t.rule({ base_value: sequence("base_value") }, (b) => filterValues(b.base_value));

  // --- frac, comma and table-cell assembly (transform.rb:93-334) ----------

  /** `transform.rb:93-111` — the mutation showcase: `numerator.value.shift`
   * pulls the comma'd head out of the finished formula BEFORE unfencing it,
   * and a nil lands in `new_arr` when there was nothing to shift. */
  t.rule({ numerator: simple("numerator"), denominator: simple("denominator") }, (b) => {
    const newArr: unknown[] = [];
    let firstValue: unknown = null;
    if (fracValues(b.numerator)) {
      firstValue = formulaValue(b.numerator as AsciimathDraft).shift() ?? null;
    }
    newArr.push(firstValue);
    firstValue = unfencedValue(b.numerator);
    let secondValue: unknown = null;
    if (fracValues(b.denominator)) {
      secondValue = formulaValue(b.denominator as AsciimathDraft).pop() ?? null;
    }
    newArr.push(secondValue);
    secondValue = unfencedValue(b.denominator);
    const frac = newFrac(firstValue, secondValue);
    if (compact(newArr).length === 0) return frac;
    newArr.splice(1, 0, frac);
    return newFormula(compact(newArr));
  });

  /** `transform.rb:113-131` */
  t.rule({ numerator: simple("numerator"), denominator: sequence("denominator") }, (b) => {
    const denominator = asArray(b.denominator);
    const newArr: unknown[] = [];
    let firstValue: unknown = null;
    if (fracValues(b.numerator)) {
      firstValue = formulaValue(b.numerator as AsciimathDraft).shift() ?? null;
    }
    newArr.push(firstValue);
    firstValue = unfencedValue(b.numerator);
    let secondValue: unknown = null;
    if (fracValues(denominator)) secondValue = denominator.pop() ?? null;
    newArr.push(secondValue);
    secondValue = unfencedValue(denominator);
    const frac = newFrac(firstValue, secondValue);
    if (compact(newArr).length === 0) return frac;
    newArr.splice(1, 0, frac);
    return newFormula(compact(newArr));
  });

  /** `transform.rb:133-138` */
  t.rule({ sequence: simple("sequence"), left_right: simple("left_right") }, (b) => {
    const newArr: unknown[] = [b.sequence];
    if (!strippedEmpty(b.left_right)) newArr.push(b.left_right);
    return newArr;
  });

  /** `transform.rb:140-145` — an ARRAY emptiness test, not a to_s one. */
  t.rule({ sequence: simple("sequence"), left_right: sequence("left_right") }, (b) => {
    const leftRight = asArray(b.left_right);
    const newArr: unknown[] = [b.sequence];
    if (leftRight.length > 0) newArr.push(...leftRight);
    return newArr;
  });

  /** `transform.rb:147-150` */
  t.rule({ sequence: simple("sequence"), number: simple("number") }, (b) => [
    b.sequence,
    newNumber(rubyToS(b.number)),
  ]);

  /** `transform.rb:152-157` */
  t.rule({ table_row: simple("table_row"), expr: simple("expr") }, (b) => {
    const newArr: unknown[] = [b.table_row];
    if (!strippedEmpty(b.expr)) newArr.push(b.expr);
    return newArr;
  });

  /** `transform.rb:159-162` */
  t.rule({ table_row: simple("table_row"), expr: sequence("expr") }, (b) => {
    const flat = compact(flattenDeep(asArray(b.expr)));
    flat.unshift(b.table_row);
    return flat;
  });

  /** `transform.rb:164-169` */
  t.rule({ comma: simple("comma"), expr: simple("expr") }, (b) => {
    const newArr: unknown[] = [asciimathSymbolObject(b.comma)];
    if (!strippedEmpty(b.expr)) newArr.push(b.expr);
    return newArr;
  });

  /** `transform.rb:171-174` */
  t.rule({ comma: simple("comma"), expr: sequence("expr") }, (b) => {
    const flat = compact(flattenDeep(asArray(b.expr)));
    flat.unshift(asciimathSymbolObject(b.comma));
    return flat;
  });

  /** `transform.rb:176-179` */
  t.rule({ symbol: simple("symbol"), expr: sequence("expr") }, (b) => {
    const flat = compact(flattenDeep(asArray(b.expr)));
    flat.unshift(asciimathSymbolObject(b.symbol));
    return flat;
  });

  /** `transform.rb:181-187` */
  t.rule({ rparen: simple("rparen"), expr: simple("expr") }, (b) => [
    asciimathSymbolObject(b.rparen),
    b.expr,
  ]);

  /** `transform.rb:189-192` */
  t.rule({ rparen: simple("rparen"), expr: sequence("expr") }, (b) => {
    const flat = compact(flattenDeep(asArray(b.expr)));
    flat.unshift(asciimathSymbolObject(b.rparen));
    return flat;
  });

  /** `transform.rb:194-200` */
  t.rule({ rparen: simple("rparen"), power: simple("power") }, (b) =>
    newPower(asciimathSymbolObject(b.rparen), unfencedValue(b.power)),
  );

  /** `transform.rb:202-212` */
  t.rule({ rparen: simple("rparen"), power: simple("power"), expr: simple("expr") }, (b) => {
    const powerObject = newPower(asciimathSymbolObject(b.rparen), unfencedValue(b.power));
    const newArr: unknown[] = [powerObject];
    if (!strippedEmpty(b.expr)) newArr.push(b.expr);
    return newArr;
  });

  /** `transform.rb:214-224` — `+= expr` with no flatten and no compact. */
  t.rule({ rparen: simple("rparen"), power: simple("power"), expr: sequence("expr") }, (b) => {
    const powerObject = newPower(asciimathSymbolObject(b.rparen), unfencedValue(b.power));
    return [powerObject, ...asArray(b.expr)];
  });

  /** `transform.rb:226-232` */
  t.rule({ rparen: simple("rparen"), base: simple("base") }, (b) =>
    newBaseFn(asciimathSymbolObject(b.rparen), unfencedValue(b.base)),
  );

  /** `transform.rb:234-244` */
  t.rule({ rparen: simple("rparen"), base: simple("base"), expr: simple("expr") }, (b) => {
    const baseObject = newBaseFn(asciimathSymbolObject(b.rparen), unfencedValue(b.base));
    const newArr: unknown[] = [baseObject];
    if (!strippedEmpty(b.expr)) newArr.push(b.expr);
    return newArr;
  });

  /** `transform.rb:246-256` */
  t.rule({ rparen: simple("rparen"), power: simple("power"), comma: simple("comma") }, (b) => [
    newPower(asciimathSymbolObject(b.rparen), unfencedValue(b.power)),
    asciimathSymbolObject(b.comma),
  ]);

  /** `transform.rb:258-272` */
  t.rule(
    {
      rparen: simple("rparen"),
      power: simple("power"),
      comma: simple("comma"),
      expr: simple("expr"),
    },
    (b) => {
      const exponent = newPower(asciimathSymbolObject(b.rparen), unfencedValue(b.power));
      const newArr: unknown[] = [exponent, asciimathSymbolObject(b.comma)];
      if (!strippedEmpty(b.expr)) newArr.push(b.expr);
      return newArr;
    },
  );

  /** `transform.rb:274-288` — `+= expr`, unconditionally and unflattened. */
  t.rule(
    {
      rparen: simple("rparen"),
      power: simple("power"),
      comma: simple("comma"),
      expr: sequence("expr"),
    },
    (b) => {
      const exponent = newPower(asciimathSymbolObject(b.rparen), unfencedValue(b.power));
      return [exponent, asciimathSymbolObject(b.comma), ...asArray(b.expr)];
    },
  );

  /** `transform.rb:290-300` */
  t.rule({ rparen: simple("rparen"), base: simple("base"), comma: simple("comma") }, (b) => [
    newBaseFn(asciimathSymbolObject(b.rparen), unfencedValue(b.base)),
    asciimathSymbolObject(b.comma),
  ]);

  /** `transform.rb:302-308` */
  t.rule({ comma: simple("comma"), left_right: simple("left_right") }, (b) => [
    asciimathSymbolObject(b.comma),
    b.left_right,
  ]);

  /** `transform.rb:310-320` */
  t.rule({ td: simple("td") }, (b) => {
    const td = b.td;
    if (isFormulaDraft(td) && formulaValue(td).some(isTableDraft)) {
      return tdValues(formulaValue(td), ",");
    }
    return newTd([tdValue(td)]);
  });

  /** `transform.rb:322-324` */
  t.rule({ td: sequence("td") }, (b) => tdValues(asArray(b.td), ","));

  /** `transform.rb:326-329` */
  t.rule({ open_tr: simple("tr"), tds_list: simple("tds_list") }, (b) => newTr([b.tds_list]));

  /** `transform.rb:331-334` — the bound array itself becomes the row. */
  t.rule({ open_tr: simple("tr"), tds_list: sequence("tds_list") }, (b) =>
    newTr(asArray(b.tds_list)),
  );

  // --- fonts (transform.rb:336-357) ---------------------------------------

  /** `transform.rb:336-342` */
  t.rule({ fonts_class: simple("font_style"), fonts_value: simple("fonts_value") }, (b) =>
    newFontStyle(fontStyleName(b.font_style), unfencedValue(b.fonts_value), rubyToS(b.font_style)),
  );

  /** `transform.rb:344-357` */
  t.rule(
    {
      unary_class: simple("function"),
      fonts_class: simple("font_style"),
      fonts_value: simple("fonts_value"),
    },
    (b) => {
      const fontObject = newFontStyle(
        fontStyleName(b.font_style),
        unfencedValue(b.fonts_value),
        rubyToS(b.font_style),
      );
      const firstValue = isUnaryClassName(b.function) ? fontObject : unfencedValue(fontObject);
      return constructClass(getClass(b.function), firstValue);
    },
  );

  // --- base, power and power-base assembly (transform.rb:359-624) ---------

  /** `transform.rb:359-362` — subtree: an unmatched HASH takes Ruby's
   * `Hash#flatten` path, pairs and all. */
  t.rule({ power_base: simple("power_base"), expr: subtree("expr") }, (b) => {
    const flat = compact(rubyFlatten(b.expr));
    flat.unshift(b.power_base);
    return flat;
  });

  /** `transform.rb:364-369` */
  t.rule({ power_base: simple("power_base"), expr: simple("expr") }, (b) => {
    const newArr: unknown[] = [b.power_base];
    if (!strippedEmpty(b.expr)) newArr.push(b.expr);
    return newArr;
  });

  /** `transform.rb:371-381` */
  t.rule({ frac: simple("frac"), expr: subtree("expr") }, (b) => {
    if (Array.isArray(b.expr)) {
      const flat = compact(flattenDeep(b.expr));
      flat.unshift(b.frac);
      return flat;
    }
    const newArr: unknown[] = [b.frac];
    if (!strippedEmpty(b.expr)) newArr.push(b.expr);
    return newArr;
  });

  /** `transform.rb:383-386` */
  t.rule({ mod: simple("mod"), expr: sequence("expr") }, (b) => {
    const flat = compact(flattenDeep(asArray(b.expr)));
    flat.unshift(b.mod);
    return flat;
  });

  /** `transform.rb:388-393` */
  t.rule({ frac: simple("frac"), left_right: simple("left_right") }, (b) => {
    const newArr: unknown[] = [b.frac];
    if (!strippedEmpty(b.left_right)) newArr.push(b.left_right);
    return newArr;
  });

  /** `transform.rb:395-404` — when the sequence carries no comma, the shift
   * never runs and the Power's exponent is NIL while the whole sequence stays
   * beside it. Measured, not corrected. */
  t.rule({ power_base: simple("power_base"), power: sequence("power") }, (b) => {
    const power = asArray(b.power);
    let firstValue: unknown = null;
    if (fracValues(power)) firstValue = power.shift() ?? null;
    const powerObject = newPower(b.power_base, firstValue);
    if (power.length === 0) return powerObject;
    return [powerObject, ...power];
  });

  /** `transform.rb:406-411` */
  t.rule({ power_base: simple("power_base"), left_right: simple("left_right") }, (b) => {
    const newArr: unknown[] = [b.power_base];
    if (!strippedEmpty(b.left_right)) newArr.push(b.left_right);
    return newArr;
  });

  /** `transform.rb:413-419` */
  t.rule({ power_base: simple("power_base"), power: simple("power") }, (b) =>
    newPower(b.power_base, unfencedValue(b.power)),
  );

  /** `transform.rb:421-431` */
  t.rule(
    { power_base: simple("power_base"), power: simple("power"), expr: sequence("expr") },
    (b) => {
      const powerObject = newPower(b.power_base, unfencedValue(b.power));
      const flat = compact(flattenDeep(asArray(b.expr)));
      flat.unshift(powerObject);
      return newFormula(flat);
    },
  );

  /** `transform.rb:433-456` — the slice_before dance. A comma-led base value
   * makes the second `shift` return nil and Ruby call `nil.first`, which
   * raises; the throw here is that failure, not a new one. */
  t.rule({ power_base: simple("power_base"), base: simple("base") }, (b) => {
    const base = b.base;
    if (isFormulaDraft(base) && formulaValue(base).some((v) => isSymbolDraftOf(v, "Comma"))) {
      const sliced = sliceBefore(formulaValue(base), (v) => isSymbolDraftOf(v, "Comma"));
      const baseObject = newBaseFn(
        b.power_base,
        filterValues(unfencedValue(sliced.shift() ?? null)),
      );
      const second = sliced.shift();
      if (second === undefined) {
        throw new TypeError(
          "asciimath transform: slice_before yielded one chunk (Ruby raises on nil.first)",
        );
      }
      return compact([baseObject, second[0], filterValues(sliced)]);
    }
    return newBaseFn(b.power_base, unfencedValue(base));
  });

  /** `transform.rb:458-468` */
  t.rule(
    { power_base: simple("power_base"), base: simple("base"), expr: sequence("expr") },
    (b) => {
      const baseObject = newBaseFn(b.power_base, unfencedValue(b.base));
      const flat = compact(flattenDeep(asArray(b.expr)));
      flat.unshift(baseObject);
      return newFormula(flat);
    },
  );

  /** `transform.rb:470-481` */
  t.rule({ power_base: simple("power_base"), base: simple("base"), expr: simple("expr") }, (b) => {
    const baseObject = newBaseFn(b.power_base, unfencedValue(b.base));
    const formulaArray: unknown[] = [baseObject];
    if (!strippedEmpty(b.expr)) formulaArray.push(b.expr);
    return newFormula(formulaArray);
  });

  /** `transform.rb:483-491` */
  t.rule(
    {
      power_base: simple("power_base"),
      base_value: simple("base_value"),
      power_value: simple("power_value"),
    },
    (b) => newPowerBase(b.power_base, unfencedValue(b.base_value), unfencedValue(b.power_value)),
  );

  /** `transform.rb:493-504` — `power_value.insert(0, ...)` returns the bound
   * array, so with no comma the elements sit BOTH inside the new node's
   * third slot and beside it. Measured aliasing; port it, do not fix it. */
  t.rule(
    {
      power_base: simple("power_base"),
      base_value: simple("base_value"),
      power_value: sequence("power_value"),
    },
    (b) => {
      const powerValue = asArray(b.power_value);
      let firstValue: unknown = powerValue;
      if (fracValues(powerValue)) firstValue = powerValue.shift() ?? null;
      const powerBaseObject = newPowerBase(
        b.power_base,
        unfencedValue(b.base_value),
        filterValues(firstValue),
      );
      powerValue.unshift(powerBaseObject);
      return powerValue;
    },
  );

  /** `transform.rb:506-518` */
  t.rule(
    {
      power_base: simple("power_base"),
      base_value: simple("base_value"),
      power_value: simple("power_value"),
      expr: sequence("expr"),
    },
    (b) => {
      const powerBaseObject = newPowerBase(
        b.power_base,
        unfencedValue(b.base_value),
        unfencedValue(b.power_value),
      );
      const flat = compact(flattenDeep(asArray(b.expr)));
      flat.unshift(powerBaseObject);
      return newFormula(flat);
    },
  );

  /** `transform.rb:520-528` */
  t.rule(
    {
      rparen: simple("rparen"),
      base_value: simple("base_value"),
      power_value: simple("power_value"),
    },
    (b) =>
      newPowerBase(
        asciimathSymbolObject(b.rparen),
        unfencedValue(b.base_value),
        unfencedValue(b.power_value),
      ),
  );

  /** `transform.rb:530-542` */
  t.rule(
    {
      rparen: simple("rparen"),
      base_value: simple("base_value"),
      power_value: simple("power_value"),
      expr: simple("expr"),
    },
    (b) => {
      const powerBase = newPowerBase(
        asciimathSymbolObject(b.rparen),
        unfencedValue(b.base_value),
        unfencedValue(b.power_value),
      );
      const newArr: unknown[] = [powerBase];
      if (!strippedEmpty(b.expr)) newArr.push(b.expr);
      return newArr;
    },
  );

  /** `transform.rb:544-556` */
  t.rule(
    {
      rparen: simple("rparen"),
      base_value: sequence("base_value"),
      power_value: simple("power_value"),
      expr: simple("expr"),
    },
    (b) => {
      const powerBase = newPowerBase(
        asciimathSymbolObject(b.rparen),
        unfencedValue(asArray(b.base_value)),
        unfencedValue(b.power_value),
      );
      const newArr: unknown[] = [powerBase];
      if (!strippedEmpty(b.expr)) newArr.push(b.expr);
      return newArr;
    },
  );

  /** `transform.rb:558-568` */
  t.rule(
    {
      rparen: simple("rparen"),
      base_value: simple("base_value"),
      power_value: simple("power_value"),
      expr: sequence("expr"),
    },
    (b) => {
      const powerBase = newPowerBase(
        asciimathSymbolObject(b.rparen),
        unfencedValue(b.base_value),
        unfencedValue(b.power_value),
      );
      const flat = compact(flattenDeep(asArray(b.expr)));
      flat.unshift(powerBase);
      return flat;
    },
  );

  /** `transform.rb:570-580` */
  t.rule(
    {
      rparen: simple("rparen"),
      base_value: sequence("base_value"),
      power_value: simple("power_value"),
      expr: sequence("expr"),
    },
    (b) => {
      const powerBase = newPowerBase(
        asciimathSymbolObject(b.rparen),
        unfencedValue(asArray(b.base_value)),
        unfencedValue(b.power_value),
      );
      const flat = compact(flattenDeep(asArray(b.expr)));
      flat.unshift(powerBase);
      return flat;
    },
  );

  /** `transform.rb:582-596` — the guard reads `expr.to_s`, which for an
   * array is its inspect and never blank, so the append always runs. */
  t.rule(
    {
      rparen: simple("rparen"),
      base_value: sequence("base_value"),
      power_value: simple("power_value"),
      comma: simple("comma"),
      expr: sequence("expr"),
    },
    (b) => {
      const coma = asciimathSymbolObject(b.comma);
      const powerBase = newPowerBase(
        asciimathSymbolObject(b.rparen),
        unfencedValue(asArray(b.base_value)),
        unfencedValue(b.power_value),
      );
      const newArr: unknown[] = [powerBase, coma];
      if (!strippedEmpty(b.expr)) newArr.push(...compact(flattenDeep(asArray(b.expr))));
      return newArr;
    },
  );

  /** `transform.rb:598-612` */
  t.rule(
    {
      rparen: simple("rparen"),
      base_value: simple("base_value"),
      power_value: simple("power_value"),
      comma: simple("comma"),
      expr: sequence("expr"),
    },
    (b) => {
      const coma = asciimathSymbolObject(b.comma);
      const powerBase = newPowerBase(
        asciimathSymbolObject(b.rparen),
        unfencedValue(b.base_value),
        unfencedValue(b.power_value),
      );
      const newArr: unknown[] = [powerBase, coma];
      if (!strippedEmpty(b.expr)) newArr.push(...compact(flattenDeep(asArray(b.expr))));
      return newArr;
    },
  );

  /** `transform.rb:614-619` — appends INTO the bound array and returns it. */
  t.rule({ power_base: sequence("power_base"), expr: simple("expr") }, (b) => {
    const newArr = asArray(b.power_base);
    if (!strippedEmpty(b.expr)) newArr.push(b.expr);
    return newArr;
  });

  /** `transform.rb:621-624` */
  t.rule({ power_base: sequence("power_base"), expr: sequence("expr") }, (b) => [
    ...asArray(b.power_base),
    ...asArray(b.expr),
  ]);

  /** `transform.rb:626-636` */
  t.rule({ sequence: simple("sequence"), expr: subtree("expr") }, (b) => {
    if (Array.isArray(b.expr)) {
      const flat = compact(flattenDeep(b.expr));
      flat.unshift(b.sequence);
      return flat;
    }
    const newArray: unknown[] = [b.sequence];
    if (!strippedEmpty(b.expr)) newArray.push(b.expr);
    return newArray;
  });

  /** `transform.rb:638-643` */
  t.rule({ sequence: sequence("sequence"), expr: simple("expr") }, (b) => {
    const newArr = compact(flattenDeep(asArray(b.sequence)));
    if (!strippedEmpty(b.expr)) newArr.push(b.expr);
    return newArr;
  });

  /** `transform.rb:645-650` */
  t.rule({ sequence: sequence("sequence"), left_right: simple("left_right") }, (b) => {
    const newArr = compact(flattenDeep(asArray(b.sequence)));
    if (!strippedEmpty(b.left_right)) newArr.push(b.left_right);
    return newArr;
  });

  /** `transform.rb:652-655` */
  t.rule({ sequence: sequence("sequence"), expr: sequence("expr") }, (b) => [
    ...compact(flattenDeep(asArray(b.sequence))),
    ...compact(flattenDeep(asArray(b.expr))),
  ]);

  /** `transform.rb:657-663` */
  t.rule({ sequence: simple("sequence"), symbol: simple("symbol") }, (b) => [
    b.sequence,
    asciimathSymbolObject(b.symbol),
  ]);

  // --- unary, binary and ternary classes (transform.rb:665-888) -----------

  /** `transform.rb:665-670` */
  t.rule({ binary_class: simple("function"), base_value: simple("base") }, (b) =>
    constructClass(getClass(b.function), unfencedValue(b.base)),
  );

  /** `transform.rb:672-680` */
  t.rule({ d: simple("d"), x: simple("x") }, (b) =>
    newFormula([asciimathSymbolObject(b.d), asciimathSymbolObject(b.x)]),
  );

  /** `transform.rb:682-687` */
  t.rule({ binary_class: simple("function"), base: simple("base") }, (b) =>
    constructClass(getClass(b.function), unfencedValue(b.base)),
  );

  /** `transform.rb:689-695` */
  t.rule({ binary_class: simple("function"), power: simple("power") }, (b) =>
    constructClass(getClass(b.function), null, unfencedValue(b.power)),
  );

  /** `transform.rb:697-702` — no emptiness guard: expr rides along as-is. */
  t.rule({ sequence: simple("sequence"), symbol: simple("sym"), expr: simple("expr") }, (b) => [
    b.sequence,
    asciimathSymbolObject(b.sym),
    b.expr,
  ]);

  /** `transform.rb:704-711` */
  t.rule({ sequence: simple("sequence"), symbol: simple("sym"), expr: sequence("expr") }, (b) => {
    const symbol = asciimathSymbolObject(b.sym);
    const newArr: unknown[] = [b.sequence, symbol];
    if (!strippedEmpty(b.expr)) newArr.push(...compact(flattenDeep(asArray(b.expr))));
    return newArr;
  });

  /** `transform.rb:713-720` */
  t.rule(
    {
      binary_class: simple("function"),
      base_value: simple("base"),
      power_value: simple("power"),
    },
    (b) => constructClass(getClass(b.function), unfencedValue(b.base), unfencedValue(b.power)),
  );

  /** `transform.rb:722-729` */
  t.rule(
    {
      ternary_class: simple("function"),
      base_value: simple("base"),
      power_value: simple("power"),
    },
    (b) => constructClass(getClass(b.function), unfencedValue(b.base), unfencedValue(b.power)),
  );

  /** `transform.rb:731-736` */
  t.rule({ ternary_class: simple("function"), base: simple("base") }, (b) =>
    constructClass(getClass(b.function), unfencedValue(b.base)),
  );

  /** `transform.rb:738-747` — a Slice third value becomes NIL, never text.
   * Measured oddity; transcribed. */
  t.rule(
    { ternary_class: simple("function"), base: simple("base"), third_value: simple("third") },
    (b) => {
      const thirdValue = b.third instanceof Slice ? null : b.third;
      return constructClass(getClass(b.function), unfencedValue(b.base), null, thirdValue);
    },
  );

  /** `transform.rb:749-755` */
  t.rule({ ternary_class: simple("function"), power: simple("power") }, (b) =>
    constructClass(getClass(b.function), null, unfencedValue(b.power)),
  );

  /** `transform.rb:757-763` — expr rides along without an emptiness guard. */
  t.rule({ ternary_class: simple("function"), expr: simple("expr") }, (b) => [
    constructClass(getClass(b.function)),
    b.expr,
  ]);

  /** `transform.rb:765-768` — inserts into the bound array. */
  t.rule({ ternary_class: simple("function"), expr: sequence("expr") }, (b) => {
    const expr = asArray(b.expr);
    expr.unshift(constructClass(getClass(b.function)));
    return expr;
  });

  /** `transform.rb:770-773` */
  t.rule({ ternary: simple("ternary"), expr: simple("expr") }, (b) => [b.ternary, b.expr]);

  /** `transform.rb:775-784` */
  t.rule(
    { ternary_class: simple("function"), power: simple("power"), third_value: simple("third") },
    (b) => {
      const thirdValue = b.third instanceof Slice ? null : b.third;
      return constructClass(getClass(b.function), null, unfencedValue(b.power), thirdValue);
    },
  );

  /** `transform.rb:786-796` */
  t.rule(
    {
      ternary_class: simple("function"),
      base_value: simple("base"),
      power_value: simple("power"),
      third_value: simple("third"),
    },
    (b) => {
      const thirdValue = b.third instanceof Slice ? null : b.third;
      return constructClass(
        getClass(b.function),
        unfencedValue(b.base),
        unfencedValue(b.power),
        thirdValue,
      );
    },
  );

  /** `transform.rb:798-808` — the Slice test is vacuous on an array binding,
   * so the local assignment is a no-op the gem carries anyway. */
  t.rule(
    {
      ternary_class: simple("function"),
      base_value: simple("base"),
      power_value: simple("power"),
      third_value: sequence("third"),
    },
    (b) => {
      const thirdValue = b.third;
      return constructClass(
        getClass(b.function),
        unfencedValue(b.base),
        unfencedValue(b.power),
        filterValues(thirdValue),
      );
    },
  );

  /** `transform.rb:810-818` */
  t.rule({ unary_class: simple("function"), intermediate_exp: simple("int_exp") }, (b) => {
    const firstValue = isUnaryClassName(b.function) ? b.int_exp : unfencedValue(b.int_exp);
    return constructClass(getClass(b.function), firstValue);
  });

  /** `transform.rb:820-824` */
  t.rule({ unary_class: simple("function"), symbol: simple("symbol") }, (b) =>
    constructClass(getClass(b.function), asciimathSymbolObject(b.symbol)),
  );

  /** `transform.rb:826-830` */
  t.rule({ unary_class: simple("function"), number: simple("new_number") }, (b) =>
    constructClass(getClass(b.function), newNumber(b.new_number)),
  );

  /** `transform.rb:832-840` */
  t.rule({ unary_class: simple("function"), unary: simple("unary") }, (b) => {
    const firstValue = isUnaryClassName(b.function) ? b.unary : unfencedValue(b.unary);
    return constructClass(getClass(b.function), firstValue);
  });

  /** `transform.rb:842-848` */
  t.rule({ unary_class: simple("function"), binary_class: simple("binary_class") }, (b) => [
    constructClass(getClass(b.function)),
    constructClass(getClass(b.binary_class)),
  ]);

  /** `transform.rb:850-856` */
  t.rule({ unary_class: simple("function"), ternary_class: simple("ternary_class") }, (b) => [
    constructClass(getClass(b.function)),
    constructClass(getClass(b.ternary_class)),
  ]);

  /** `transform.rb:858-861` — inserts into the bound array and returns it. */
  t.rule({ ternary: simple("ternary"), expr: sequence("expr") }, (b) => {
    const expr = asArray(b.expr);
    expr.unshift(b.ternary);
    return expr;
  });

  /** `transform.rb:863-866` */
  t.rule({ ternary: simple("ternary"), left_right: simple("left_right") }, (b) => [
    b.ternary,
    b.left_right,
  ]);

  /** `transform.rb:868-873` */
  t.rule({ unary_class: simple("function"), text: simple("text") }, (b) =>
    constructClass(getClass(b.function), newText(b.text)),
  );

  // `transform.rb:875-880` (unary_class + unitsml) — DROPPED, see above.

  /** `transform.rb:882-888` */
  t.rule({ number: simple("number"), comma: simple("comma") }, (b) => [
    newNumber(b.number),
    asciimathSymbolObject(b.comma),
  ]);

  // --- tables, fences, left/right, color, mod (transform.rb:890-1167) -----

  /** `transform.rb:890-893` */
  t.rule({ table: simple("table"), expr: sequence("expr") }, (b) =>
    newFormula([b.table, ...compact(flattenDeep(asArray(b.expr)))]),
  );

  /** `transform.rb:895-898` */
  t.rule({ table: simple("table"), left_right: simple("left_right") }, (b) =>
    newFormula([b.table, b.left_right]),
  );

  /** `transform.rb:900-905` */
  t.rule({ table: simple("table"), expr: simple("expr") }, (b) => {
    const formulaArray: unknown[] = [b.table];
    if (!strippedEmpty(b.expr)) formulaArray.push(b.expr);
    return newFormula(formulaArray);
  });

  /** `transform.rb:907-910` — raw bindings, no unfencing. */
  t.rule({ table: simple("table"), base: simple("base") }, (b) => newBaseFn(b.table, b.base));

  /** `transform.rb:912-915` */
  t.rule({ table: simple("table"), power: simple("power") }, (b) => newPower(b.table, b.power));

  /** `transform.rb:917-921` — power lands in the BASE slot and base in the
   * POWER slot. Measured oddity; transcribed, not corrected. */
  t.rule(
    { table: simple("table"), power_value: simple("power"), base_value: simple("base") },
    (b) => newPowerBase(b.table, b.power, b.base),
  );

  /** `transform.rb:923-931` */
  t.rule({ table: simple("table"), power: simple("power"), expr: sequence("expr") }, (b) =>
    newFormula([newPower(b.table, b.power), ...compact(flattenDeep(asArray(b.expr)))]),
  );

  /** `transform.rb:933-942` — expr rides along without an emptiness guard. */
  t.rule({ table: simple("table"), power: simple("power"), expr: simple("expr") }, (b) =>
    newFormula([newPower(b.table, b.power), b.expr]),
  );

  /** `transform.rb:944-952` */
  t.rule({ table: simple("table"), base: simple("base"), expr: sequence("expr") }, (b) =>
    newFormula([newBaseFn(b.table, b.base), ...compact(flattenDeep(asArray(b.expr)))]),
  );

  /** `transform.rb:954-963` */
  t.rule({ table: simple("table"), base: simple("base"), expr: simple("expr") }, (b) =>
    newFormula([newBaseFn(b.table, b.base), b.expr]),
  );

  /** `transform.rb:965-975` */
  t.rule({ table: simple("table"), rparen: simple("rparen"), expr: sequence("expr") }, (b) => [
    newFenced(newSymbolOfClass("Paren::OpenParen"), [b.table], asciimathSymbolObject(b.rparen)),
    ...compact(flattenDeep(asArray(b.expr))),
  ]);

  /** `transform.rb:977-987` — `left_right_value` is bound as `left_right`;
   * the Left/Right wrappers keep the raw paren text. The formula's first
   * value is a Left, so `Formula#initialize` clears `left_right_wrapper`. */
  t.rule(
    { left: simple("left"), left_right_value: simple("left_right"), right: simple("right") },
    (b) => newFormula([newLeftFn(b.left), b.left_right, newRightFn(b.right)]),
  );

  /** `transform.rb:989-999` */
  t.rule(
    { left: simple("left"), left_right_value: sequence("left_right"), right: simple("right") },
    (b) => newFormula([newLeftFn(b.left), newFormula(asArray(b.left_right)), newRightFn(b.right)]),
  );

  /** `transform.rb:1001-1008` */
  t.rule({ dividend: simple("dividend"), mod: simple("mod"), divisor: simple("divisor") }, (b) =>
    newMod(b.dividend, b.divisor),
  );

  /** `transform.rb:1010-1023` — an empty Slice expr keeps parameter_two nil;
   * a nil expr (`maybe`) compacts away to an EMPTY list instead. */
  t.rule({ lparen: simple("lparen"), expr: simple("expr"), rparen: simple("rparen") }, (b) => {
    const expr = b.expr;
    let formValue: unknown[] | null;
    if (expr instanceof Slice) {
      formValue = expr.text === "" ? null : [expr];
    } else {
      formValue = [expr];
    }
    const fenced = formValue === null ? null : compact(flattenDeep(formValue));
    return newFenced(asciimathSymbolObject(b.lparen), fenced, asciimathSymbolObject(b.rparen));
  });

  /** `transform.rb:1025-1033` */
  t.rule({ lparen: simple("lparen"), expr: sequence("expr"), rparen: simple("rparen") }, (b) =>
    newFenced(
      asciimathSymbolObject(b.lparen),
      compact(flattenDeep(asArray(b.expr))),
      asciimathSymbolObject(b.rparen),
    ),
  );

  /** `transform.rb:1035-1039` */
  t.rule(
    { lparen: simple("lparen"), rgb_color: sequence("color"), rparen: simple("rparen") },
    (b) => newFormula(asArray(b.color)),
  );

  /** `transform.rb:1041-1045` */
  t.rule({ lparen: simple("lparen"), rgb_color: simple("color"), rparen: simple("rparen") }, (b) =>
    newFormula(b.color),
  );

  /** `transform.rb:1047-1050` — the RGB sequence rule IGNORES `color_value`
   * and stringifies the color array through `Array#to_s`. Measured oddity;
   * transcribed, and `rubyArrayToS` throws loudly on the one shape whose
   * Ruby answer is address-dependent. */
  t.rule({ color: sequence("color"), color_value: sequence("color_value") }, (b) =>
    asciimathSymbolObject(b.color),
  );

  /** `transform.rb:1052-1060` */
  t.rule({ color: simple("color"), color_value: simple("value"), expr: simple("expr") }, (b) => [
    newColor(b.color, unfencedValue(b.value)),
    b.expr,
  ]);

  /** `transform.rb:1062-1070` — inserts into the bound array. */
  t.rule({ color: simple("color"), color_value: simple("value"), expr: sequence("expr") }, (b) => {
    const expr = asArray(b.expr);
    expr.unshift(newColor(b.color, unfencedValue(b.value)));
    return expr;
  });

  /** `transform.rb:1072-1083` */
  t.rule({ color: simple("color"), color_value: simple("color_value") }, (b) => {
    const color = b.color;
    const firstValue = isTextDraft(color)
      ? asciimathSymbolObject(color.fields.parameterOne)
      : color;
    return newColor(firstValue, unfencedValue(b.color_value));
  });

  /** `transform.rb:1085-1095` */
  t.rule(
    {
      table_left: simple("table_left"),
      table_row: simple("table_row"),
      table_right: simple("table_right"),
    },
    (b) =>
      newTable(
        [b.table_row],
        asciimathSymbolObject(b.table_left),
        asciimathSymbolObject(b.table_right),
      ),
  );

  /** `transform.rb:1097-1107` — the same power/base slot swap as `:917`. */
  t.rule(
    {
      table: simple("table"),
      power_value: simple("power"),
      base_value: simple("base"),
      expr: simple("expr"),
    },
    (b) => newFormula([newPowerBase(b.table, b.power, b.base), b.expr]),
  );

  /** `transform.rb:1109-1118` */
  t.rule(
    {
      table: simple("table"),
      power_value: simple("power"),
      base_value: simple("base"),
      expr: sequence("expr"),
    },
    (b) =>
      newFormula([
        newPowerBase(b.table, b.power, b.base),
        ...compact(flattenDeep(asArray(b.expr))),
      ]),
  );

  /** `transform.rb:1120-1131` */
  t.rule(
    {
      table_left: simple("table_left"),
      table_row: simple("table_row"),
      expr: simple("expr"),
      table_right: simple("table_right"),
    },
    (b) => {
      const newArr: unknown[] = [b.table_row];
      if (!strippedEmpty(b.expr)) newArr.push(b.expr);
      return newTable(
        newArr,
        asciimathSymbolObject(b.table_left),
        asciimathSymbolObject(b.table_right),
      );
    },
  );

  /** `transform.rb:1133-1144` — expr rides into the table unconditionally. */
  t.rule(
    {
      norm: simple("function"),
      table_left: simple("table_left"),
      table_row: simple("table_row"),
      expr: simple("expr"),
      table_right: simple("table_right"),
    },
    (b) => {
      const table = newTable(
        [b.table_row, b.expr],
        asciimathSymbolObject(b.table_left),
        asciimathSymbolObject(b.table_right),
      );
      return newNorm(table);
    },
  );

  /** `transform.rb:1146-1155` */
  t.rule(
    {
      table_left: simple("table_left"),
      table_row: simple("table_row"),
      expr: sequence("expr"),
      table_right: simple("table_right"),
    },
    (b) => {
      const flat = compact(flattenDeep(asArray(b.expr)));
      flat.unshift(b.table_row);
      return newTable(
        flat,
        asciimathSymbolObject(b.table_left),
        asciimathSymbolObject(b.table_right),
      );
    },
  );

  /** `transform.rb:1157-1166` */
  t.rule(
    {
      left: simple("left"),
      table_row: simple("table_row"),
      expr: sequence("expr"),
      right: simple("right"),
    },
    (b) => {
      const flat = compact(flattenDeep(asArray(b.expr)));
      flat.unshift(b.table_row);
      return newTable(flat, asciimathSymbolObject(b.left), asciimathSymbolObject(b.right));
    },
  );

  return t;
}

/**
 * Ruby `Enumerable#slice_before`: chunks OPENING at each element the block
 * accepts. `[a, C, b]` becomes `[[a], [C, b]]`; a leading separator opens the
 * first chunk itself.
 */
function sliceBefore(values: readonly unknown[], opens: (value: unknown) => boolean): unknown[][] {
  const chunks: unknown[][] = [];
  let current: unknown[] = [];
  for (const value of values) {
    if (opens(value) && current.length > 0) {
      chunks.push(current);
      current = [];
    }
    current.push(value);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** ONE instance, built on first use — rule order is registration order. */
let transformInstance: Transform | undefined;

export function asciimathTransform(): Transform {
  if (transformInstance === undefined) transformInstance = buildAsciimathTransform();
  return transformInstance;
}

/* =========================================================================
 * 5. Finalization, and the Parser#parse wrapping
 * ---------------------------------------------------------------------- */

/**
 * Finalizes one transformed value into what the immutable model can hold:
 * drafts become `core` nodes, slices become their text (the gem's serializer
 * does the same: `Parslet::Slice then value.to_s`), arrays and leftover
 * hashes are rebuilt around their finalized contents.
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

function asParameter(value: unknown): NodeParameter {
  return finalizeValue(value) as NodeParameter;
}

function asSequenceValue(value: unknown): NodeSequence | null {
  const finalized = finalizeValue(value);
  return finalized as NodeSequence | null;
}

/**
 * One draft into one immutable node. Every branch passes exactly the fields
 * the Ruby constructor assigned — an unassigned ivar stays `undefined` and is
 * omitted by `normalize`, which is where model parity is decided.
 */
function finalizeDraft(draft: AsciimathDraft, inputString?: string): MathNode {
  const f = draft.fields;
  switch (draft.kind) {
    case "formula": {
      const init: {
        value: NodeSequence;
        leftRightWrapper: boolean;
        displaystyle: boolean;
        inputString?: string;
      } = {
        value: asSequenceValue(f.value) as NodeSequence,
        leftRightWrapper: f.leftRightWrapper as boolean,
        displaystyle: f.displaystyle as boolean,
      };
      if (inputString !== undefined) init.inputString = inputString;
      return new FormulaNode(init);
    }
    case "number":
      return new NumberNode({
        value: f.value as string | null,
        base: f.base as unknown as NodeParameter,
        miniSubSized: f.miniSubSized as boolean,
        miniSupSized: f.miniSupSized as boolean,
      });
    case "symbol":
      return new SymbolNode({ id: draft.identity, value: f.value as string | null });
    case "text":
      return new TextNode({
        parameterOne: asParameter(f.parameterOne),
        lang: f.lang as string | null,
      });
    case "unaryFunction":
      return new UnaryFunctionNode({
        name: draft.identity as string,
        parameterOne: asParameter(f.parameterOne),
      });
    case "binaryFunction":
      return new BinaryFunctionNode({
        name: draft.identity as string,
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
      });
    case "ternaryFunction":
      return new TernaryFunctionNode({
        name: draft.identity as string,
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
        parameterThree: asParameter(f.parameterThree),
      });
    case "fontStyle":
      return new FontStyleNode({
        name: draft.identity,
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
      });
    case "base":
      return new BaseNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
      });
    case "frac":
      return new FracNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
      });
    case "overset":
      return new OversetNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
      });
    case "underset":
      return new UndersetNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
        options: f.options as NodeOptions,
      });
    case "color":
      return new ColorNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
      });
    case "fenced":
      return new FencedNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
        parameterThree: asParameter(f.parameterThree),
        options: f.options as NodeOptions,
      });
    case "table":
      return new TableNode({
        value: asSequenceValue(f.value),
        openParen: asParameter(f.openParen),
        closeParen: asParameter(f.closeParen),
        options: f.options as NodeOptions,
      });
    case "linebreak":
      return new LinebreakNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "abs":
      return new AbsNode({ parameterOne: asParameter(f.parameterOne) });
    case "ceil":
      return new CeilNode({ parameterOne: asParameter(f.parameterOne) });
    case "floor":
      return new FloorNode({ parameterOne: asParameter(f.parameterOne) });
    case "norm":
      return new NormNode({ parameterOne: asParameter(f.parameterOne) });
    case "sqrt":
      return new SqrtNode({ parameterOne: asParameter(f.parameterOne) });
    case "int":
      return new IntNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
        parameterThree: asParameter(f.parameterThree),
      });
    case "oint":
      return new OintNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
        parameterThree: asParameter(f.parameterThree),
      });
    case "prod":
      return new ProdNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
        parameterThree: asParameter(f.parameterThree),
      });
    case "sum":
      return new SumNode({
        parameterOne: asParameter(f.parameterOne),
        parameterTwo: asParameter(f.parameterTwo),
        parameterThree: asParameter(f.parameterThree),
      });
    case "bar":
      return new BarNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "dot":
      return new DotNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "ddot":
      return new DdotNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "hat":
      return new HatNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "obrace":
      return new ObraceNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "ubrace":
      return new UbraceNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "ul":
      return new UlNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "vec":
      return new VecNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    case "tilde":
      return new TildeNode({
        parameterOne: asParameter(f.parameterOne),
        attributes: f.attributes as NodeOptions,
      });
    default:
      throw new Error(`asciimath transform: no finalizer for draft kind "${draft.kind}"`);
  }
}

/**
 * `Asciimath::Parser#parse` (`parser.rb:17-23`) after the transform, plus the
 * `formula.input_string = text` that `Plurimath::Math.parse_formula` adds
 * (`math.rb:63-66`): a transformed tree that already is a formula is kept,
 * anything else is wrapped — `Formula.new` boxes a non-array — and the final
 * formula carries the CALLER's input string, not the preprocessed text.
 */
export function finalizeAsciimathParse(transformed: unknown, inputString: string): FormulaNode {
  const formula = isFormulaDraft(transformed) ? transformed : newFormula(transformed);
  return finalizeDraft(formula, inputString) as FormulaNode;
}
