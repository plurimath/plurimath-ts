/**
 * Mirrors `function/overset.rb` — `Overset#to_unicodemath` (:61).
 *
 * Four child-interrogating branches, in this order:
 *
 *   1. `parameter_one` is an accent → the wrapped body, then `parameter_one`'s
 *      FIELD VALUE (not its render — see `matchedFieldValue`);
 *   2. `parameter_two` is an accent → `parameter_one`'s field value, then
 *      `parameter_two`'s render. The two slots are read in OPPOSITE roles from
 *      branch 1, and this port had both halves reading `parameter_two`:
 *      measured, `Overset(Symbol("x"), Acute)` is `"x́"` in the gem and was
 *      `"́́"` here — the accent twice and the base dropped;
 *   3. horizontal brackets → body then wrapped script;
 *   4. `parameter_two` is an Obrace/Ubrace → script with `^`.
 *
 * `Underset` looks like a mirror of this and is not: its branch order is
 * different, and its accent test reads `DIACRITIC_BELOWS` where this reads
 * `DIACRITIC_OVERLAYS`. Writing one from the other is how they end up wrong.
 *
 * Returns **nil** when both parameters are absent.
 */

import { RenderError } from "../../core/index";
import {
  className,
  describeSlot,
  FORMAT,
  fieldGlyph,
  htmlEntityToUnicode,
  isNode,
  type NodeOf,
  present,
  type RenderContext,
  renderOptionalChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_DIACRITIC_OVERLAYS,
  UNICODEMATH_HORIZONTAL_BRACKETS,
} from "../../generated/unicodemath/render-tables";

/** One of the gem's entity-valued constants, indexed the two ways it is read. */
interface EntityTable {
  /** The entries verbatim — what a generic symbol's raw `value` is compared against. */
  readonly raw: ReadonlySet<string>;
  /**
   * Decoded glyph -> the entry it decodes from.
   *
   * A `Map` can only carry one entry per glyph, which is sound here and
   * measured: across `DIACRITIC_OVERLAYS + ACCENT_SYMBOLS.values` (44 entries,
   * 41 distinct) no two DISTINCT entity strings decode to the same character,
   * and the same holds for `DIACRITIC_BELOWS + ACCENT_SYMBOLS.values` (73/69)
   * and for `HORIZONTAL_BRACKETS` (8/8). The duplicates are repeats of one
   * string (`widehat` and `hat` are both `"&#x302;"`), so the surviving entry
   * is the same string either way.
   */
  readonly byGlyph: ReadonlyMap<string, string>;
}

function entityTable(entities: Iterable<string>): EntityTable {
  const raw = new Set(entities);
  return {
    raw,
    byGlyph: new Map([...raw].map((entity) => [htmlEntityToUnicode(entity), entity] as const)),
  };
}

/**
 * `Overset#match_unicode?` (`overset.rb:129`) — OVERLAYS, not BELOWS.
 *
 * The gem asks `DIACRITIC_OVERLAYS.include?` then `ACCENT_SYMBOLS.has_value?`;
 * both are membership in entity text, so one set answers both. Which of the two
 * hit cannot reach the output: the branch emits the field value itself, never
 * the table entry it matched.
 */
const ACCENTS = entityTable([
  ...UNICODEMATH_DIACRITIC_OVERLAYS,
  ...UNICODEMATH_ACCENT_SYMBOLS.values(),
]);

/** `HORIZONTAL_BRACKETS.value?(...)` (`overset.rb:123`). */
const HORIZONTAL_BRACKETS = entityTable(UNICODEMATH_HORIZONTAL_BRACKETS.values());

/**
 * `Core#unicodemath_field_value(field)` (`core.rb:484`) tested for membership in
 * `table`, returning the matched entry — which IS the gem's field value, since
 * the gem's own test is string equality against exactly these entries.
 *
 * The field value is **not** the render. The gem's expression is
 * `field.class_name == "symbol" ? field.value : Utility.hexcode_in_input(field)`,
 * and `hexcode_in_input` returns the first `/&#x.+;/` entry of the class's
 * parse-INPUT table — raw entity text. Reading the render instead diverges twice
 * over, and both were live here:
 *
 *   - the branch EMITS this value, so the gem writes `"(x)&#x301;"` for
 *     `Overset(Acute, Symbol("x"))` where reading the render wrote `"(x)́"`.
 *     Identical after `Formula#to_unicodemath`'s entity decode, which this port
 *     runs in `formulaBoundary` — and different when an `Overset` is the render
 *     root, which `toUnicodemath` allows and the gem's own bare
 *     `Overset#to_unicodemath` measures;
 *   - for `Math::Symbols::Symbol` itself the value is `value` RAW, so
 *     `Symbol("&#x301;", slashed: true)` — whose render is `"\\&#x301;"` — is
 *     still an accent to the gem, and `Symbol("́")`, holding the decoded
 *     character, is NOT one. Measured: `"(x)&#x301;"` and `"(x)┴(́)"`.
 *
 * The `class_name == "symbol"` half is exact here: `className` is the gem's own
 * expression, and no census class shares a basename (measured across all 1,460
 * — no duplicates, and none named `Symbol`).
 *
 * The `hexcode_in_input` half is a PROXY — the port has no generated table of
 * parse-INPUT entities, so it decodes the render and looks that up. Measured
 * against the gem's own predicate over all 1,460 symbol classes: 2
 * disagreements for this table and for `DIACRITIC_BELOWS`, 0 for
 * `HORIZONTAL_BRACKETS`. Both are classes whose render is an ASCII shorthand
 * rather than the entity they parse from — `Hat` renders `"^"` against
 * `"&#x302;"`, `Tilde` renders `"~"` against `"&#x303;"` — so the gem accents
 * them and this does not: `Overset(Hat, Symbol("x"))` is `"(x)&#x302;"` there
 * and `"(x)┴(^)"` here. Closing it needs the generated table, not a hand-typed
 * pair (PORTING-STANDARDS.md, "Generated data discipline"); the six classes
 * whose render is not their field value decoded are `Dots`, `Hat`,
 * `Paren::Langle`, `Paren::Rangle`, `Slash` and `Tilde`.
 */
function matchedFieldValue(
  field: unknown,
  context: RenderContext,
  table: EntityTable,
): string | null {
  // `return false unless field.is_a?(Math::Symbols::Symbol)` — the guard both
  // `unicode_accent?` (:112) and `horizontal_brackets?` (:123) open with, and
  // the reason a `Formula` or a nil slot answers false instead of raising.
  if (!isNode(field) || field.kind !== "symbol") return null;

  if (className(field.id) === "symbol") {
    const value = field.value;
    return value !== null && table.raw.has(value) ? value : null;
  }

  const glyph = fieldGlyph(field, context);
  return glyph === null ? null : (table.byGlyph.get(glyph) ?? null);
}

/**
 * The same `unicodemath_field_value`, called with NO `is_a?` guard in front of
 * it — branch 2 tests `parameter_two` and then reads `parameter_one`, which may
 * be anything at all.
 *
 * So this raises where the gem raises, rather than answering for a slot the gem
 * refuses. Measured on the pinned oracle:
 *
 *   Overset(nil,        Acute) !! NoMethodError: undefined method 'class_name' for nil
 *   Overset(Formula(x), Acute) !! NoMethodError: undefined method 'input' for ...Formula
 *   Overset(Number(1),  Acute) !! NoMethodError: undefined method 'input' for ...Number
 *   Overset(Symbol("x"), Acute) => "x́"
 *
 * A symbol subclass here returns the DECODED glyph where the gem returns raw
 * entity text — the proxy `matchedFieldValue` documents, and this port's largest
 * remaining gap on this path. Measured over `Overset(<class>, Acute)` for all
 * 1,460 symbol classes:
 *
 *   bare `Overset` root       1,439 of 1,460 differ  ("&#x3c3;́" vs "σ́")
 *   wrapped in a `Formula`       15 of 1,460 differ
 *
 * `Formula#to_unicodemath`'s entity decode — which this port runs in
 * `formulaBoundary` — collapses the other 1,424, which is why the gem's own
 * public API sees so few. The 15 that survive it are 9 classes whose parse-INPUT
 * table holds no `/&#x.+;/` entry at all, so the gem interpolates nil as `""`
 * where this writes the render (`Bar`, `If`, `Ul`, and `Paren::Lcurly`,
 * `Lround`, `Lsquare`, `Rcurly`, `Rround`, `Rsquare` — the base `Paren` renders
 * nil on both sides and agrees), plus the 6 whose render is not their field
 * value decoded (`Dots`, `Hat`, `Paren::Langle`, `Paren::Rangle`, `Slash`,
 * `Tilde`). Both halves need the generated parse-INPUT table. Re-encoding the
 * render to an entity instead reproduces the gem's value for 1,444 of the 1,450
 * classes that have one — a guess with 16 measured holes, not the data
 * (PORTING-STANDARDS.md, "Generated data discipline").
 */
function unicodemathFieldValue(field: unknown, context: RenderContext): string | null {
  if (!isNode(field)) {
    throw new RenderError(
      `overset.parameterOne: ${describeSlot(field)} has no class_name, and the ` +
        "parameter_two accent branch sends unicodemath_field_value to it — the gem " +
        "raises NoMethodError here",
      FORMAT,
      "overset",
    );
  }
  if (field.kind !== "symbol") {
    throw new RenderError(
      `overset.parameterOne: a ${field.kind} node does not answer input, and ` +
        "Utility.hexcode_in_input sends it — the gem raises NoMethodError here",
      FORMAT,
      "overset",
    );
  }

  if (className(field.id) === "symbol") return field.value;
  return fieldGlyph(field, context);
}

/** `unicode_classes_accent?` (`overset.rb:118`). */
/**
 * Byte-identical to its twin in `../underset/unicodemath.ts`, on purpose.
 *
 * The gem duplicates it too: `horizontal_brackets?` is defined separately and
 * identically on `overset.rb` and `underset.rb`, and this port is one file per
 * gem class (ARCHITECTURE.md §5). Hoisting the pair into `render-shared.ts`
 * would read as a tidy-up and would make the port's structure diverge from the
 * oracle it mirrors, so the duplication stays.
 */
function isBraceClass(field: unknown): boolean {
  return isNode(field) && (field.kind === "obrace" || field.kind === "ubrace");
}

export function renderOverset(node: NodeOf<"overset">, context: RenderContext): string | null {
  const one = node.parameterOne;
  const two = node.parameterTwo;

  // Evaluated before `unicodemath_parens(parameter_two)` because the gem
  // evaluates it first too — it is the `if` condition, and `unicode_accent?`
  // is what reaches the symbol table.
  const oneAccent = matchedFieldValue(one, context, ACCENTS);
  if (oneAccent !== null) {
    return `${unicodemathParens(two, context) ?? ""}${oneAccent}`;
  }
  if (matchedFieldValue(two, context, ACCENTS) !== null) {
    // `"#{unicodemath_field_value(parameter_one)}#{parameter_two.to_unicodemath}"`
    // — ONE then TWO, and left to right, so a `parameter_one` the gem refuses
    // raises before `parameter_two` is rendered.
    return `${unicodemathFieldValue(one, context) ?? ""}${renderOptionalChild(two, context)}`;
  }
  // `horizontal_brackets?` asks `parameter_one` regardless of its argument.
  if (matchedFieldValue(one, context, HORIZONTAL_BRACKETS) !== null) {
    return `${renderOptionalChild(one, context)}${unicodemathParens(two, context) ?? ""}`;
  }
  if (isBraceClass(two)) {
    return `${renderOptionalChild(two, context)}^${unicodemathParens(one, context) ?? ""}`;
  }

  // `if parameter_one || parameter_two` — Ruby truthiness, so `false` counts as
  // absent, and absent yields NIL rather than raising. Measured:
  // `Overset.new(nil, nil)` and `Overset.new(false, false)` both give nil.
  // Testing `=== undefined` missed the `null` the model builder produces.
  if (!present(one) && !present(two)) return null;

  // U+2534 BOX DRAWINGS LIGHT UP AND HORIZONTAL.
  return `${unicodemathParens(two, context) ?? ""}┴${unicodemathParens(one, context) ?? ""}`;
}
