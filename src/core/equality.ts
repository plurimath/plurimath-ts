/**
 * The equality projection (ARCHITECTURE.md §5, "two distinct projections").
 *
 * `equals` mirrors Ruby's `==` **per class**, using the field list the census
 * records for that class — not the full field set. `Formula` has five fields
 * and compares two; `Text` ignores `lang`. This is a *looser* equivalence than
 * the normalized-model comparison in `./normalize`, and the two must stay
 * apart: conflating them was a real error in an earlier draft.
 *
 * It is a module function rather than a method on the node classes. A method
 * would put this projection table inside `./nodes`, or make `./nodes` import
 * this module — a cycle the boundaries gate rejects. Keeping it here is also
 * what §5 does for renderers, and for the same reason: a bundler cannot
 * tree-shake a method off a class.
 *
 * Two nodes that differ only in a field Ruby's `==` skips compare **equal**.
 */

import { isMathNode, type MathNode, type NodeKind, type NodeParameter } from "./nodes";

/**
 * Per kind, the TypeScript fields that class's Ruby `==` actually compares,
 * taken from `equality.fields` in `corpus/census.yaml`. The suite checks this
 * table against the census, so a drifting entry fails rather than silently
 * loosening equality.
 */
export const EQUALITY_FIELDS: { readonly [K in NodeKind]: readonly string[] } = {
  abs: ["parameterOne"],
  bar: ["parameterOne"],
  base: ["options", "parameterOne", "parameterTwo"],
  binaryFunction: ["parameterOne", "parameterTwo"],
  ceil: ["parameterOne"],
  color: ["parameterOne", "parameterTwo"],
  ddot: ["parameterOne"],
  dot: ["parameterOne"],
  fenced: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  floor: ["parameterOne"],
  fontStyle: ["parameterOne", "parameterTwo"],
  formula: ["leftRightWrapper", "value"],
  frac: ["options", "parameterOne", "parameterTwo"],
  hat: ["parameterOne"],
  int: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  linebreak: ["parameterOne"], // `linebreak?` is constant per class
  mpadded: ["options", "parameterOne"],
  mrow: ["leftRightWrapper", "value"],
  nary: ["options", "parameterFour", "parameterOne", "parameterThree", "parameterTwo"],
  norm: ["parameterOne"],
  number: ["base", "miniSubSized", "miniSupSized", "value"],
  obrace: ["parameterOne"],
  oint: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  overleftrightarrow: ["parameterOne"],
  overset: ["parameterOne", "parameterTwo"],
  prod: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  sqrt: ["parameterOne"],
  sum: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  symbol: ["miniSubSized", "miniSupSized", "options", "slashed", "value"],
  table: ["closeParen", "openParen", "options", "value"],
  ternaryFunction: ["parameterOne", "parameterThree", "parameterTwo"],
  text: ["parameterOne"],
  tilde: ["parameterOne"],
  ubrace: ["parameterOne"],
  ul: ["parameterOne"],
  unaryFunction: ["parameterOne"],
  underset: ["parameterOne", "parameterTwo"],
  vec: ["parameterOne"],
};

/**
 * `Utility::FONT_STYLES` — `FontStyle#==` folds a font-family alias to the
 * class it names before comparing, so `"bf"` and `"mathbf"` are the same
 * family. Kept as pairs rather than an object literal because the keys are
 * Ruby symbols, not identifiers.
 */
const FONT_STYLE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["double-struck", "DoubleStruck"],
  ["sans-serif-bold-italic", "SansSerifBoldItalic"],
  ["sans-serif-italic", "SansSerifItalic"],
  ["bold-sans-serif", "BoldSansSerif"],
  ["sans-serif", "SansSerif"],
  ["bold-fraktur", "BoldFraktur"],
  ["bold-italic", "BoldItalic"],
  ["bold-script", "BoldScript"],
  ["mbfitsans", "SansSerifBoldItalic"],
  ["monospace", "Monospace"],
  ["mathfrak", "Fraktur"],
  ["mitsans", "SansSerifItalic"],
  ["mbfsans", "BoldSansSerif"],
  ["mbffrak", "BoldFraktur"],
  ["mathcal", "Script"],
  ["fraktur", "Fraktur"],
  ["mbfscr", "BoldScript"],
  ["mathbb", "DoubleStruck"],
  ["double", "DoubleStruck"],
  ["mathtt", "Monospace"],
  ["mathsf", "SansSerif"],
  ["mathrm", "Normal"],
  ["textrm", "Normal"],
  ["italic", "Italic"],
  ["mathit", "Italic"],
  ["textit", "Italic"],
  ["mathbf", "Bold"],
  ["textbf", "Bold"],
  ["script", "Script"],
  ["normal", "Normal"],
  ["mbfit", "BoldItalic"],
  ["msans", "SansSerif"],
  ["mfrak", "Fraktur"],
  ["mscr", "Script"],
  ["bold", "Bold"],
  ["bbb", "DoubleStruck"],
  ["Bbb", "DoubleStruck"],
  ["mtt", "Monospace"],
  ["cal", "Script"],
  ["mit", "Italic"],
  ["mup", "Normal"],
  ["mbf", "Bold"],
  ["sf", "SansSerif"],
  ["tt", "Monospace"],
  ["fr", "Fraktur"],
  ["rm", "Normal"],
  ["cc", "Script"],
  ["ii", "Italic"],
  ["bb", "Bold"],
  ["bf", "Bold"],
]);

/** XML's five predefined entities. Named HTML entities are not decoded — see `decodeEntities`. */
const XML_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

const ENTITY_PATTERN = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g;

/**
 * Ruby's `Utility.html_entity_to_unicode`, narrowed.
 *
 * Numeric references and the five XML named entities are decoded; other named
 * entities are left alone, where Ruby's `HTMLEntities` would decode them. The
 * full table is symbol data (TODO 2), not model structure, and every symbol
 * value the gem emits uses the numeric form.
 */
function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(
    ENTITY_PATTERN,
    (match: string, decimal?: string, hex?: string, named?: string): string => {
      const code =
        decimal !== undefined
          ? Number.parseInt(decimal, 10)
          : hex !== undefined
            ? Number.parseInt(hex, 16)
            : undefined;
      if (code !== undefined) {
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return (named !== undefined ? XML_ENTITIES.get(named) : undefined) ?? match;
    },
  );
}

/**
 * `Symbols::Symbol#==` compares `comparable_value`, which falls back to the
 * class's own rendering when `value` is nil. Two symbols of the same class
 * with nil values therefore share that fallback and are equal, which is what
 * this reproduces.
 *
 * Documented gap: when exactly one side is nil, Ruby compares the other value
 * against the class's unicodemath rendering and can still say equal. That
 * rendering is symbol data (TODO 2), which `core` may not import, so this
 * returns false. Parsers set `value` consistently per class, so it only bites
 * hand-built pairs.
 */
function symbolValuesEqual(left: string | null | undefined, right: string | null | undefined) {
  const a = left ?? null;
  const b = right ?? null;
  if (a === null || b === null) return a === b;
  return decodeEntities(a) === decodeEntities(b);
}

function comparableFontFamily(value: NodeParameter | undefined): unknown {
  if (typeof value !== "string") return value;
  const mapped = FONT_STYLE_ALIASES.get(value);
  // NUL-prefixed so a folded alias can never collide with a plain string.
  return mapped === undefined ? value : `\u0000FontStyle::${mapped}`;
}

/**
 * Ruby's `object.class == self.class`. For the alias carriers that is kind
 * *plus* the carried class name: `Sin` and `Cos` are both `unaryFunction`,
 * and Ruby says they differ.
 */
function sameRubyClass(node: MathNode, other: MathNode): boolean {
  return node.kind === other.kind && identityOf(node) === identityOf(other);
}

function identityOf(node: MathNode): string | undefined {
  const carrier = node as { readonly id?: unknown; readonly name?: unknown };
  if (typeof carrier.id === "string") return carrier.id;
  if (typeof carrier.name === "string") return carrier.name;
  return undefined;
}

/**
 * `undefined` and `null` compare equal here, unlike in `./normalize`. An
 * instance variable Ruby never assigned reads back as `nil` through its
 * accessor, so `==` cannot tell the two apart — but `false` is still not
 * `nil`, exactly as in Ruby.
 */
function valueEquals(left: unknown, right: unknown): boolean {
  const a = left === undefined ? null : left;
  const b = right === undefined ? null : right;
  if (a === null || b === null) return a === b;
  if (isMathNode(a) || isMathNode(b)) {
    return isMathNode(a) && isMathNode(b) && equals(a, b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const items = b as readonly unknown[];
    return (a as readonly unknown[]).every((item, index) => valueEquals(item, items[index]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    const first = a as Record<string, unknown>;
    const second = b as Record<string, unknown>;
    return keys.every((key) => Object.hasOwn(second, key) && valueEquals(first[key], second[key]));
  }
  return a === b;
}

function fieldsEqual(node: MathNode, other: MathNode, fields: readonly string[]): boolean {
  const a = node as unknown as Record<string, unknown>;
  const b = other as unknown as Record<string, unknown>;
  return fields.every((field) => valueEquals(a[field], b[field]));
}

/** `Symbols::Symbol#==` compares `value` through `comparable_value`, not directly. */
const SYMBOL_PLAIN_FIELDS = EQUALITY_FIELDS.symbol.filter((field) => field !== "value");

/**
 * Structural equality mirroring the gem's `==` for `node`'s class.
 *
 * Dispatch follows Ruby: the *receiver's* class decides which comparison runs.
 * Every rule here is symmetric, so argument order does not change the answer.
 */
export function equals(node: MathNode, other: unknown): boolean {
  if (!isMathNode(other)) return false;
  switch (node.kind) {
    // `Formula#==` checks `respond_to?(:value)` and `respond_to?(:left_right_wrapper)`
    // rather than the class, so a formula and an mrow with the same value are
    // equal — and `Mstyle`, which aliases Formula, compares the same way.
    case "formula":
    case "mrow":
      return (
        (other.kind === "formula" || other.kind === "mrow") &&
        fieldsEqual(node, other, EQUALITY_FIELDS[node.kind])
      );
    // `Number#==` is `is_a?(Number)`; nothing subclasses it.
    case "number":
      return other.kind === "number" && fieldsEqual(node, other, EQUALITY_FIELDS.number);
    case "symbol":
      return (
        other.kind === "symbol" &&
        node.id === other.id &&
        symbolValuesEqual(node.value, other.value) &&
        fieldsEqual(node, other, SYMBOL_PLAIN_FIELDS)
      );
    case "fontStyle":
      return (
        other.kind === "fontStyle" &&
        node.name === other.name &&
        valueEquals(node.parameterOne, other.parameterOne) &&
        valueEquals(
          comparableFontFamily(node.parameterTwo),
          comparableFontFamily(other.parameterTwo),
        )
      );
    default:
      return sameRubyClass(node, other) && fieldsEqual(node, other, EQUALITY_FIELDS[node.kind]);
  }
}
