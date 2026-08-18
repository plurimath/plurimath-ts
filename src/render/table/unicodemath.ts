/**
 * Mirrors `function/table.rb` — `Table#to_unicodemath` (:104) with its two
 * helpers `unicodemath_table_class?` (:406) and `unicodemath_class_name`
 * (:415) — plus the name arms for the six subclasses that override
 * `to_unicodemath`: `table/bmatrix.rb` (:43), `cases.rb` (:15),
 * `eqarray.rb` (:15), `matrix.rb` (:41), `pmatrix.rb` (:19) and
 * `vmatrix.rb` (:19). `Align`, `Array`, `Multline` and `Split` define none and
 * inherit `Table#to_unicodemath`, where `unicodemath_table_class?` answers
 * false on its very first line (`class_name == "table"`) — so those four
 * always take the `■` branch. That is why ten subclasses need only six arms.
 *
 * **The `&` between a row's cells is not this file's.** `Tr#to_unicodemath`
 * (`tr.rb:65`) joins its tds with `"&"` and `Td#to_unicodemath` (`td.rb:52`)
 * joins its own cells with nothing; this file joins ROWS, on `"@"`, and
 * nothing else. A table whose rows come back as the literal `"tr⁡"` is the
 * unary carrier missing its `Tr` arm, not a bug here.
 *
 * Measured pins worth naming, because source-reading gets every one of them
 * wrong. Each line below is a real render against the pinned oracle
 * (plurimath 0.11.6, 00c52783, 2026-08-18), never a reading:
 *
 *   - `unicodemath_table_class?`'s second disjunct,
 *     `Utility::PARENTHESIS[unicodemath_field_value(open_paren)] ==
 *     close_paren`, is ALWAYS `nil == close_paren`. `Utility::PARENTHESIS`
 *     (`utility.rb:99`) is keyed by SYMBOLS while `unicodemath_field_value`
 *     returns a String, so the lookup can never hit: `PARENTHESIS["["]` is
 *     nil where `PARENTHESIS[:"["]` is `"]"`. The predicate therefore reduces
 *     to "a bare `Table` whose open paren is not nil" — `Table(rows, Lsquare,
 *     nil)` renders `"&#x24e2;(a&b@c&d)"`, exactly as with a close paren.
 *   - The mirror shape CRASHES: `Table(rows, nil, Rsquare)` raises
 *     `NoMethodError: undefined method 'class_name' for nil`, because that
 *     same disjunct evaluates `unicodemath_field_value(nil)` before comparing.
 *   - `:422` is `Hash#key`, not `Hash#invert` — FIRST matching key, not last,
 *     and the difference is observable: `PARENTHESIS_MATRICES` holds three
 *     nil values, `key(nil)` is `:eqarray` while `invert[nil]` is `:cases`.
 *     It is reachable, so the generator emits that answer as
 *     `UNICODEMATH_NIL_PAREN_MATRIX` (see `NIL_PAREN_MATRIX_NAME`).
 *   - The bare `Table` writes the class name as ENTITY text
 *     (`"&#x24e2;(a&b@c&d)"`) while the six subclass overrides write the
 *     decoded character (`"ⓢ(a&b@c&d)"`). Both reach the reader decoded,
 *     because `Formula#to_unicodemath` decodes at the boundary; the
 *     difference shows only on a table rendered outside a formula, and this
 *     file reproduces it.
 *   - `:422` calls `open_paren.to_unicodemath` with NO `options:` keyword,
 *     which most classes REQUIRE — `Table(rows, Function::Norm, Rsquare)`
 *     raises `ArgumentError: missing keyword: :options` where
 *     `Table(rows, Text("q"), Rsquare)` renders `"(a)"`. See
 *     `answersWithoutOptions`.
 *   - `Vmatrix#capital_vmatrix?` tests `class_name == "norm"`, which is true
 *     for `Math::Function::Norm` as well as `Symbols::Paren::Norm`:
 *     `Vmatrix(rows, open: Function::Norm)` renders `"⒩(a)"`.
 *   - The six overriding subclasses map `value` WITHOUT Ruby's `&.`, so a nil
 *     value list or a nil row raises there and renders `""` on the inherited
 *     path: `Pmatrix` with `value = nil` raises `NoMethodError`, while
 *     `Align` with the same value renders `"[■()]"`.
 */

import { type MathNode, RenderError } from "../../core/index";
import {
  className,
  FORMAT,
  htmlEntityToUnicode,
  isNode,
  type NodeOf,
  type RenderContext,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_MATRIXS,
  UNICODEMATH_NIL_PAREN_MATRIX,
  UNICODEMATH_PARENTHESIS_MATRICES,
} from "../../generated/unicodemath/render-tables";

/**
 * The class names this carrier has measured behaviour for — every `Table`
 * subclass in the gem, the same ten `./latex.ts` guards, but split differently
 * here because a different six of them override `to_unicodemath`. A defined
 * name outside the set raises before dispatch: rendering the bare-`Table`
 * default for an unmeasured class would diverge silently, and six of these ten
 * really do render something else entirely.
 *
 * The corpus cannot hold this set honest the way it does on the latex side:
 * every table case in the pinned corpus is a BARE `Math::Function::Table`, so
 * none of the ten names is exercised there. All ten were pinned instead by a
 * shape-for-shape diff against the gem (352 table shapes across these names,
 * nine paren pairings and three value shapes, 2026-08-18), and they need a
 * behavioural spec of their own to stay pinned.
 */
const MEASURED_TABLE_NAMES: ReadonlySet<string> = new Set([
  "Align",
  "Array",
  "Bmatrix",
  "Cases",
  "Eqarray",
  "Matrix",
  "Multline",
  "Pmatrix",
  "Split",
  "Vmatrix",
]);

/**
 * The six subclasses whose own `to_unicodemath` maps `value` as `value.map { |v|
 * v.to_unicodemath }` — no `&.` on the list and none on the element, so a nil
 * either side is a `NoMethodError`.
 *
 * The bare `Table` (and therefore `Align`, `Array`, `Multline` and `Split`,
 * which inherit it) writes `value&.map { |v| v&.to_unicodemath }&.join("@")`
 * instead, and renders `""` for both. Measured on all ten: `Pmatrix`,
 * `Bmatrix`, `Cases`, `Eqarray`, `Matrix` and `Vmatrix` raise
 * `NoMethodError: undefined method 'map' for nil` on a nil value and
 * `undefined method 'to_unicodemath' for nil` on a nil row; `Align`, `Array`,
 * `Multline`, `Split` and the bare carrier render `"[■()]"` / `"■()"`.
 */
const STRICT_ROW_TABLE_NAMES: ReadonlySet<string> = new Set([
  "Bmatrix",
  "Cases",
  "Eqarray",
  "Matrix",
  "Pmatrix",
  "Vmatrix",
]);

/**
 * `UnicodeMath::Constants::MATRIXS` (`constants.rb:947`), decoded once.
 *
 * The gem reaches this table two ways and only one of them is a lookup.
 * `matrices_functions` (`table.rb:426`) reads it for the bare `Table`'s class
 * name and that render keeps the raw entity; the six subclass overrides
 * instead write the character literally in their own source. Every literal
 * they write is the same code point as the matching `MATRIXS` entry — checked
 * glyph by glyph against the measured renders in this file's header — so this
 * file derives all eight marks from the one generated table rather than
 * repeating glyphs the generator already owns, and only the bare-`Table` path
 * hands back the undecoded entity.
 */
const MATRIX_MARKS: ReadonlyMap<string, string> = new Map(
  [...UNICODEMATH_MATRIXS].map(([name, entity]) => [name, htmlEntityToUnicode(entity)] as const),
);

/**
 * `PARENTHESIS_MATRICES.key(nil)` (`table.rb:422`).
 *
 * The gem's `PARENTHESIS_MATRICES` has eight rows and three of them hold nil
 * (`eqarray`, `matrix`, `cases`). `UNICODEMATH_PARENTHESIS_MATRICES` drops
 * those three, because an empty string would collide with a real render. The
 * generator used to justify that by claiming the lookup takes "a rendered
 * paren string, which is never nil". That reasoning was wrong, and the
 * counterexample renders: a generic `Symbols::Symbol.new(nil)`
 * has `to_unicodemath` nil, and `Table(rows, open: Symbol(nil), close: …)`
 * renders `"&#x2588;(a)"` — `MATRIXS[:eqarray]`, the FIRST nil-valued key,
 * which is what `Hash#key` returns. (`Hash#invert` would have answered
 * `:cases`; the two differ, which is why the direction matters.)
 *
 * The generator now emits that answer as `UNICODEMATH_NIL_PAREN_MATRIX`,
 * reading it with Ruby's own `Hash#key` so first-match-wins is never
 * reproduced by hand here, and its comment has been corrected. This file held
 * the row locally until then.
 */
const NIL_PAREN_MATRIX_NAME = UNICODEMATH_NIL_PAREN_MATRIX;

/**
 * The node kinds whose gem class declares `to_unicodemath`'s `options:`
 * keyword OPTIONAL, and so survives the keyword-less call at `table.rb:422`.
 *
 * Measured by reflection over every `Plurimath::Math` class that responds to
 * `to_unicodemath` (`instance_method(:to_unicodemath).parameters`, pinned
 * oracle 2026-08-18): exactly the 1461 `Symbols::*` classes, `Formula`,
 * `Formula::Mrow`, `Formula::Mstyle`, `Function::Text`, and the eight
 * carrier-folded classes named in the two sets below. Everything else takes
 * `[[:keyreq, :options]]` and raises `ArgumentError: missing keyword:
 * :options`. Pinned behaviourally on both sides of the line: `Text` as an open
 * paren renders `"(a)"`, `Frac` and `Function::Norm` both raise the
 * ArgumentError, `Left` renders `"&#x24a8;(a)"` and `Mrow` renders `"(a)"`.
 *
 * `Formula::Mstyle` is folded onto `formula` and `Formula::Mrow` onto `mrow`
 * by the census, which is why two kinds cover the three classes.
 */
const NO_OPTIONS_KINDS: ReadonlySet<string> = new Set(["formula", "mrow", "symbol", "text"]);

/** The `UnaryFunction`-folded classes from that same measurement. */
const NO_OPTIONS_UNARY_NAMES: ReadonlySet<string> = new Set([
  "Left",
  "Merror",
  "Mglyph",
  "Msline",
  "None",
  "Right",
  "Scarry",
]);

/** `Math::Function::Rule`, the one `TernaryFunction`-folded class in that set. */
const NO_OPTIONS_TERNARY_NAME = "Rule";

/** `Math::Symbols::Paren::Lcurly` — `Bmatrix#capital_bmatrix?` (`bmatrix.rb:56`). */
const LCURLY_ID = "Paren::Lcurly";

/** `Math::Symbols::Paren::Vert` — the `all?` pattern at `table.rb:417`. */
const VERT_ID = "Paren::Vert";

export function renderTable(node: NodeOf<"table">, context: RenderContext): string {
  const name = node.name;
  if (name !== undefined && !MEASURED_TABLE_NAMES.has(name)) throw unreachableName(node.kind, name);

  // Every one of the seven `to_unicodemath` bodies builds the joined rows
  // FIRST and decides the wrapper afterwards, so a value list that crashes
  // crashes before any paren is read. Same order here.
  const rows = tableValues(node, context, name);

  switch (name) {
    // `Pmatrix#to_unicodemath` (`pmatrix.rb:19`) and `Cases#to_unicodemath`
    // (`cases.rb:15`) ignore their parens entirely — measured with `nil`,
    // `Lcurly`/`Rcurly`, `Norm`, `Vert` and bare strings in both slots, all
    // `"⒨(…)"` / `"Ⓒ(…)"`.
    case "Pmatrix":
      return `${mark("pmatrix")}(${rows})`;
    case "Cases":
      return `${mark("cases")}(${rows})`;
    // `Bmatrix#matrix_symbol` (`bmatrix.rb:52`): `open_paren.is_a?(Lcurly)`.
    // `is_a?` answers rather than raising, so a bare string open paren is
    // false, not a crash — measured `"ⓢ(a)"`.
    case "Bmatrix":
      return `${mark(isSymbolId(node.openParen, LCURLY_ID) ? "Bmatrix" : "bmatrix")}(${rows})`;
    // `Vmatrix#matrix_symbol` (`vmatrix.rb:34`): `open_paren&.class_name ==
    // "norm"`, which a `Math::Function::Norm` satisfies too.
    case "Vmatrix":
      return `${mark(isNormClassName(node.openParen, node.kind) ? "Vmatrix" : "vmatrix")}(${rows})`;
    // `Eqarray#to_unicodemath` (`eqarray.rb:15`) and `Matrix#to_unicodemath`
    // (`matrix.rb:41`) are the generic shape with a different mark.
    case "Eqarray":
      return wrapInParens(node, mark("eqarray"), rows, context);
    case "Matrix":
      return wrapInParens(node, mark("matrix"), rows, context);
    default:
      break;
  }

  // `Table#to_unicodemath` (`table.rb:108`) — the bare carrier, and the four
  // subclasses (`Align`, `Array`, `Multline`, `Split`) that inherit it. The
  // branch turns on `unicodemath_table_class?` ALONE: a nil class name does
  // not fall back to the `■` form, it interpolates as the empty string, which
  // is how `Table(rows, Norm, Norm)` renders `"(a&b@c&d)"` with no mark at all.
  if (isMatrixClass(node)) return `${matrixClassName(node, context) ?? ""}(${rows})`;

  return wrapInParens(node, mark("matrix"), rows, context);
}

/**
 * `unicodemath_table_class?` (`table.rb:406`).
 *
 * Reads as four conditions and behaves as three, because the middle disjunct
 * can never find its key (see the header): a bare `Table` qualifies whenever
 * its open paren is non-nil, does not qualify when both parens are nil, and
 * CRASHES when only the close paren is present.
 */
function isMatrixClass(node: NodeOf<"table">): boolean {
  // `return false unless class_name == "table"` — a named subclass never
  // qualifies, which is exactly why `Align`, `Array`, `Multline` and `Split`
  // take the `■` branch despite inheriting this method.
  if (node.name !== undefined) return false;

  const open = node.openParen;
  const close = node.closeParen;
  // `return false if open_paren.nil? && close_paren.nil?`
  if (isNil(open) && isNil(close)) return false;
  // `(!open_paren.nil? && !close_paren.nil?)` — and Ruby's `||` short-circuits,
  // so the crashing disjunct below is not reached when both are present.
  if (!isNil(open) && !isNil(close)) return true;

  // Exactly one paren is nil here, and the second disjunct evaluates
  // `unicodemath_field_value(open_paren)` before it compares. That call is
  // `field.class_name == "symbol" ? field.value : Utility.hexcode_in_input(field)`
  // (`core.rb:484`), and `hexcode_in_input` sends `input` — so it answers for a
  // symbol and raises `NoMethodError` for nil, for a bare string, and for every
  // non-symbol node (measured: nil, `"["`, `Formula`, `Number`, `Frac`).
  unicodemathFieldValue(open, node.kind);
  // The lookup itself is always nil (Symbol keys, String subscript), so the
  // comparison is `nil == close_paren` — and `open_paren` survived the line
  // above, so `close_paren` is the nil one. True.
  //
  // The third disjunct, `[open_paren, close_paren].all?(Paren::Vert)`, is
  // therefore unreachable from here: a Vert/Vert table has both parens present
  // and was answered by the second `if`. It is alive as a *pattern* — Ruby's
  // `all?(Class)` is `===`, i.e. `is_a?` — just never load-bearing.
  return true;
}

/**
 * `unicodemath_class_name` (`table.rb:415`), whose bare `return` on :420 is a
 * nil the caller interpolates as `""`.
 *
 * **Two of its five lines are dead in the gem and are ported as dead:**
 *
 *   - `:416` calls `is_a?` on `open_paren&.class_name`, which is a String and
 *     so never a `Paren::Norm`. Its `Vmatrix` mark is unreachable through this
 *     helper; the only way to `⒩` is `Vmatrix#matrix_symbol`.
 *   - `:419` compares `class_name` — always downcased — against the capitalised
 *     literal `"Bmatrix"`, which no class name can equal.
 *
 * Repairing either would change output the corpus has measured. They are left
 * unreachable, named here so the next reader does not "fix" them.
 */
function matrixClassName(node: NodeOf<"table">, context: RenderContext): string | null {
  // `:417` — `[open_paren, close_paren].all?(Math::Symbols::Paren::Vert)`.
  // Alive, and measured to agree with the fallthrough it pre-empts: a
  // Vert/Vert table reaches `&#x24b1;` either way, because `Vert` renders
  // `"|"` and `PARENTHESIS_MATRICES.key("|")` is `:vmatrix`. Kept because the
  // gem keeps it, not because it decides anything.
  if (isSymbolId(node.openParen, VERT_ID) && isSymbolId(node.closeParen, VERT_ID)) {
    return UNICODEMATH_MATRIXS.get("vmatrix") ?? null;
  }
  // `:420` — `return unless unicodemath_table_class?`. A no-op at this call
  // site, which asked the same question a moment ago; re-asked so the function
  // is correct standalone, as the gem's is.
  if (!isMatrixClass(node)) return null;

  const rendered = renderWithoutOptions(node.openParen, node.kind, context);
  const matrixName = parenthesisMatricesKey(rendered);
  if (matrixName === null) return null;

  // `matrices_functions` (`table.rb:425`) — `MATRIXS[matrix_name]`, and a name
  // the table does not carry is nil, which the caller interpolates as `""`.
  // Deliberately the raw ENTITY: this branch is the one the gem leaves
  // undecoded (see the header).
  return UNICODEMATH_MATRIXS.get(matrixName) ?? null;
}

/**
 * `UnicodeMath::Constants::PARENTHESIS_MATRICES.key(…)` (`table.rb:422`).
 *
 * Ruby's `Hash#key` is the FIRST key holding the value, and a JS `Map` iterates
 * in insertion order, which the generated table preserves from the gem's frozen
 * hash — so a plain forward scan reproduces it. `Hash#invert`, which keeps the
 * LAST key, would answer differently for the nil row (`:cases`, not
 * `:eqarray`); the generated table drops the nil rows, so that row is supplied
 * separately.
 */
function parenthesisMatricesKey(rendered: string | null): string | null {
  if (rendered === null) return NIL_PAREN_MATRIX_NAME;

  for (const [matrixName, paren] of UNICODEMATH_PARENTHESIS_MATRICES) {
    if (paren === rendered) return matrixName;
  }
  return null;
}

/**
 * `"#{open_paren&.to_unicodemath(options:)}#{mark}(#{rows})#{close_paren&.…}"`
 * — the shape shared by `Table#to_unicodemath`'s else branch (`:111`),
 * `Matrix` (`matrix.rb:45`) and `Eqarray` (`eqarray.rb:19`).
 */
function wrapInParens(
  node: NodeOf<"table">,
  matrixMark: string,
  rows: string,
  context: RenderContext,
): string {
  const open = renderOptionalParen(node.openParen, "table.openParen", node.kind, context);
  const close = renderOptionalParen(node.closeParen, "table.closeParen", node.kind, context);
  return `${open}${matrixMark}(${rows})${close}`;
}

/**
 * `value&.map { … }&.join("@")`, or `value.map { … }.join("@")` for the six
 * subclasses that wrote it without the safe navigation.
 *
 * A row whose own render is nil joins as `""` either way — Ruby's `join`
 * stringifies nil to the empty string — so `Table([NilRenderingRow], …)`
 * renders `"&#x24e2;()"`, measured.
 */
function tableValues(
  node: NodeOf<"table">,
  context: RenderContext,
  name: string | undefined,
): string {
  const strict = name !== undefined && STRICT_ROW_TABLE_NAMES.has(name);
  const value = node.value;

  if (isNil(value)) {
    if (!strict) return "";
    throw new RenderError(
      `table.value: nil, and ${name}#to_unicodemath calls value.map without Ruby's &. — ` +
        "the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  if (!Array.isArray(value)) {
    throw new RenderError(
      `table.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }

  return value
    .map((row) => {
      if (isNil(row)) {
        if (!strict) return "";
        throw new RenderError(
          `table.value: holds nil, and ${name}#to_unicodemath calls row.to_unicodemath ` +
            "without Ruby's &. — the gem raises NoMethodError here",
          FORMAT,
          node.kind,
        );
      }
      if (!isNode(row)) {
        throw new RenderError(
          `table.value: holds ${describeSlot(row)}, which cannot answer to_unicodemath — ` +
            "the gem raises NoMethodError here",
          FORMAT,
          node.kind,
        );
      }
      return context.render(row) ?? "";
    })
    .join("@");
}

/**
 * `open_paren.to_unicodemath` at `table.rb:422` — the ONE call on this path
 * that omits the `options:` keyword.
 *
 * Most gem classes declare it `keyreq`, so the omission is an
 * `ArgumentError` rather than a render. That is a crash, and a crash is a
 * `RenderError` here (ARCHITECTURE.md §5) — never the silent render a
 * `context.render` for every node would have produced.
 */
function renderWithoutOptions(field: unknown, kind: string, context: RenderContext): string | null {
  if (!isNode(field)) {
    throw new RenderError(
      `table.openParen: ${describeSlot(field)} does not answer to_unicodemath — ` +
        "the gem raises NoMethodError here",
      FORMAT,
      kind,
    );
  }
  if (!answersWithoutOptions(field)) {
    throw new RenderError(
      `table.openParen: a ${field.kind} node's to_unicodemath requires the options: keyword ` +
        "and table.rb:422 calls it without one — the gem raises ArgumentError here",
      FORMAT,
      kind,
    );
  }
  return context.render(field);
}

/** Whether this node's gem class declares `to_unicodemath(options:)` optional. */
function answersWithoutOptions(field: MathNode): boolean {
  if (NO_OPTIONS_KINDS.has(field.kind)) return true;

  const name = carrierName(field);
  if (field.kind === "unaryFunction") return name !== undefined && NO_OPTIONS_UNARY_NAMES.has(name);
  if (field.kind === "ternaryFunction") return name === NO_OPTIONS_TERNARY_NAME;
  return false;
}

/**
 * `unicodemath_field_value(open_paren)` (`core.rb:484`), for its CRASH alone.
 *
 * Its answer is never used — `Utility::PARENTHESIS` is keyed by Symbols and
 * the answer is a String, so the subscript is nil whatever comes back (both
 * halves measured: `unicodemath_field_value(Lsquare)` is nil, and a generic
 * `Symbols::Symbol` holding `"["` gives `"["`, which `PARENTHESIS["["]`
 * still misses). Only whether it raises matters, and it raises for everything
 * that is not a symbol.
 */
function unicodemathFieldValue(field: unknown, kind: string): void {
  // `Utility.hexcode_in_input` reads the class's parse-INPUT table, not the
  // render, so nothing is rendered here and no context is needed.
  if (isNode(field) && field.kind === "symbol") return;

  throw new RenderError(
    `table.openParen: ${describeSlot(field)} does not answer class_name/input, and ` +
      "unicodemath_table_class? sends unicodemath_field_value to it whenever the close " +
      "paren is absent — the gem raises NoMethodError here",
    FORMAT,
    kind,
  );
}

/**
 * `open_paren&.class_name == "norm"` (`vmatrix.rb:39`).
 *
 * True for `Symbols::Paren::Norm` AND for `Math::Function::Norm` — the census
 * carries exactly those two `Norm` classes, and `class_name` is the downcased
 * basename, so both answer `"norm"`. Nil is false (Ruby's `&.`), and a bare
 * string raises, because `String` has no `class_name` (measured:
 * `Vmatrix(rows, open: "|")` raises `NoMethodError`).
 */
function isNormClassName(field: unknown, kind: string): boolean {
  if (isNil(field)) return false;
  if (!isNode(field)) {
    throw new RenderError(
      `table.openParen: ${describeSlot(field)} has no class_name, and ` +
        "Vmatrix#capital_vmatrix? sends it — the gem raises NoMethodError here",
      FORMAT,
      kind,
    );
  }
  if (field.kind === "norm") return true;
  if (field.kind === "symbol") return className(symbolId(field)) === "norm";
  return false;
}

/** `field.is_a?(Symbols::Paren::X)` — exact, since none of these has a subclass. */
function isSymbolId(field: unknown, id: string): boolean {
  return isNode(field) && field.kind === "symbol" && symbolId(field) === id;
}

function symbolId(field: MathNode): string {
  const id = (field as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : "";
}

function carrierName(field: MathNode): string | undefined {
  const name = (field as { readonly name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

/** A `MATRIXS` mark by name, decoded. */
function mark(matrixName: string): string {
  const glyph = MATRIX_MARKS.get(matrixName);
  if (glyph === undefined) {
    // Unreachable while the generated slice matches the gem's frozen
    // `MATRIXS`: this file names only its eight keys. Loud rather than a
    // silently empty marker if a regeneration ever drops one.
    throw new RenderError(
      `UNICODEMATH_MATRIXS carries no "${matrixName}" — the generated table no longer ` +
        "matches the gem's MATRIXS",
      FORMAT,
      "table",
    );
  }
  return glyph;
}

/**
 * `open_paren&.to_unicodemath(options: options)` on the `■`/`█` branch, where
 * the keyword IS passed and only nil is guarded.
 *
 * Ruby's `&.` guards nil ALONE — `false&.to_unicodemath` still sends the
 * message — so this is a nil test, not a truthiness test, and `present()`
 * would be the wrong helper here. A bare string raises (measured:
 * `Align(rows, open: "[")` raises `NoMethodError`).
 */
function renderOptionalParen(
  field: unknown,
  at: string,
  kind: string,
  context: RenderContext,
): string {
  if (isNil(field)) return "";
  if (!isNode(field)) {
    throw new RenderError(
      `${at}: ${describeSlot(field)} does not answer to_unicodemath — ` +
        "the gem raises NoMethodError here",
      FORMAT,
      kind,
    );
  }
  return context.render(field) ?? "";
}

/** Ruby's `nil?` and `&.`: nil ALONE, never `false`, which is not nil there. */
function isNil(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * A slot described for an error message. Local because the unicodemath
 * `render-shared` has no `describeSlot` — the latex one does — and this file
 * may not add it there.
 */
function describeSlot(value: unknown): string {
  if (isNil(value)) return "nil";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (Array.isArray(value)) return "a bare list";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/**
 * The unicodemath `render-shared` has no `unreachableName` either, so the
 * latex carrier's refusal is spelled out here.
 */
function unreachableName(kind: string, name: string): RenderError {
  return new RenderError(
    `No measured unicodemath rendering for ${kind} name "${name}" — six of the ten Table ` +
      "subclasses override to_unicodemath, so rendering the carrier default for an " +
      "unmeasured name would diverge silently.",
    FORMAT,
    kind,
  );
}
