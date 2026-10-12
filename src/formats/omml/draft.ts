/** biome-ignore-all lint/style/useNamingConvention: draft fields are the Ruby
 * ivar names (`left_right_wrapper`, `parameter_one`), which `NODE_SPECS` maps
 * to the core model's fields; renaming them would break that lookup. */
/**
 * The gem's model objects as the OMML input translator (`./translator.ts`)
 * builds and mutates them, and their finalization into the core model.
 *
 * The same construction as the MathML input translator's, kept as this
 * format's own copy: ARCHITECTURE.md §3 rule 4 keeps formats independent, so
 * neither imports the other. A `Draft` carries a class key
 * (`Math::Function::Frac`) and the ivars that class assigned, under their Ruby
 * names; `toNode` turns a finished draft into the immutable core model through
 * the census carrier the generator measured (`OMML_CARRIERS`).
 */

import type { MathNode, NodeKind } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import {
  OMML_CARRIERS,
  OMML_CLASSES,
  OMML_CONTEXTUAL_ACCENT_FUNCTIONS,
  OMML_FUNCTIONS,
  OMML_GET_CLASS,
  OMML_NAMED_FUNCTION_WORDS,
  OMML_SYMBOL_CLASS_NAMES,
  OMML_UNICODE_SYMBOLS,
  type OmmlDefault,
  type OmmlFunctionRow,
} from "./generated/input-tables";
import { OMML_NODE_CONSTRUCTORS } from "./registry";

/** The translator raised where the gem raises (a Ruby error in its code). */
export class OmmlTranslateError extends Error {
  override readonly name = "OmmlTranslateError";
}

export const FORMULA = "Math::Formula";
export const FUNCTION = "Math::Function::";
const SYMBOLS = "Math::Symbols::";
const NUMBER = "Math::Number";
const BARE_SYMBOL = "Math::Symbols::Symbol";

/** One Ruby object under construction: its class and its ivars. */
export class Draft {
  constructor(
    public cls: string,
    readonly f: Record<string, unknown>,
  ) {}
}

export function isObj(value: unknown): value is Draft {
  return value instanceof Draft;
}

export function truthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

const FUNCTIONS: ReadonlyMap<string, OmmlFunctionRow> = new Map(
  OMML_FUNCTIONS.map((row) => [row[0], row] as const),
);
const CLASSES: ReadonlySet<string> = new Set(OMML_CLASSES);
const NAMED_FUNCTION_WORDS: ReadonlySet<string> = new Set(OMML_NAMED_FUNCTION_WORDS);
const GET_CLASS: ReadonlyMap<
  string,
  readonly [string | null, readonly (readonly [string, OmmlDefault])[]]
> = new Map(OMML_GET_CLASS.map(([name, cls, defaults]) => [name, [cls, defaults]] as const));

export function familyOf(o: Draft): "unary" | "binary" | "ternary" | "none" {
  const row = FUNCTIONS.get(o.cls);
  return row === undefined ? "none" : row[1];
}

/** `Core#class_name`: the downcased basename, unless the class overrides it. */
export function className(o: Draft): string {
  const row = FUNCTIONS.get(o.cls);
  if (row?.[2] !== undefined && row[2] !== null) return row[2];
  if (o.cls.startsWith(SYMBOLS)) {
    const override = OMML_SYMBOL_CLASS_NAMES.get(o.cls.slice(SYMBOLS.length));
    if (override !== undefined) return override;
  }
  const parts = o.cls.split("::");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

export const is = (o: unknown, name: string): boolean => isObj(o) && o.cls === FUNCTION + name;

export function isFormula(o: unknown): o is Draft {
  return isObj(o) && o.cls === FORMULA;
}

export function formulaValue(o: Draft): unknown[] {
  return o.f.value as unknown[];
}

/** `ModelHelper.validate_left_right` over a constructor's fields. */
function validateLeftRight(fields: readonly unknown[]): void {
  for (const field of fields) {
    if (isFormula(field) && is(formulaValue(field)[0], "Left")) {
      field.f.left_right_wrapper = true;
    }
  }
}

/** Ruby `Array#delete_at`: removes and returns, nil past the end. */
export function deleteAt(values: unknown[], index: number): unknown {
  if (index >= values.length) return null;
  return values.splice(index, 1)[0] ?? null;
}

/* =========================================================================
 * Constructors
 * ---------------------------------------------------------------------- */

/** `Formula.new(value)`. */
export function newFormula(value: unknown[] = []): Draft {
  return new Draft(FORMULA, {
    value,
    left_right_wrapper: !is(value[0], "Left"),
    displaystyle: true,
  });
}

export function unary(name: string, one: unknown = null): Draft {
  validateLeftRight([one]);
  return new Draft(FUNCTION + name, { parameter_one: one });
}

export function binary(name: string, one: unknown = null, two: unknown = null): Draft {
  return binaryClass(FUNCTION + name, one, two);
}

export function binaryClass(cls: string, one: unknown, two: unknown): Draft {
  validateLeftRight([one, two]);
  return new Draft(cls, { parameter_one: one, parameter_two: two });
}

export function ternary(
  name: string,
  one: unknown = null,
  two: unknown = null,
  three: unknown = null,
): Draft {
  validateLeftRight([one, two, three]);
  return new Draft(FUNCTION + name, {
    parameter_one: one,
    parameter_two: two,
    parameter_three: three,
  });
}

export function newNary(
  one: unknown,
  two: unknown,
  three: unknown,
  four: unknown,
  options: Record<string, unknown>,
): Draft {
  const o = new Draft(`${FUNCTION}Nary`, {
    parameter_one: one,
    parameter_two: two,
    parameter_three: three,
    parameter_four: four,
    options,
  });
  validateLeftRight([one, two, three, four]);
  return o;
}

/** `Text.new(value, lang: :omml)`. */
export function newText(one: string): Draft {
  return new Draft(`${FUNCTION}Text`, { parameter_one: one, lang: "omml" });
}

export function newNumber(value: string): Draft {
  return new Draft(NUMBER, { value, mini_sub_sized: false, mini_sup_sized: false, base: null });
}

/** `Symbols::Symbol.new(sym)`. */
export function newSymbol(sym: string): Draft {
  return new Draft(BARE_SYMBOL, { value: sym });
}

/** A symbol class's `.new`: only `@value`, nil. */
export function newSymbolOfClass(id: string): Draft {
  return new Draft(SYMBOLS + id, { value: null });
}

/** `Td.new(cells)`: drops literal "&" cells in place. */
export function newTd(cells: unknown[]): Draft {
  for (let index = cells.length - 1; index >= 0; index--) {
    if (cells[index] === "&") cells.splice(index, 1);
  }
  return binary("Td", cells, null);
}

/** `Tr.new(cells)`: an all-"@" row becomes empty cells. */
export function newTr(cells: unknown[]): Draft {
  if (!cells.some((cell) => cell !== "@")) {
    for (let i = 0; i < cells.length; i++) cells[i] = newTd([]);
  }
  return unary("Tr", cells);
}

/** `Table.new(value)`. */
export function newTable(value: unknown[]): Draft {
  return new Draft(`${FUNCTION}Table`, { value, open_paren: null, close_paren: null, options: {} });
}

/** `Linebreak.new`. */
export function newLinebreak(): Draft {
  return new Draft(`${FUNCTION}Linebreak`, { parameter_one: null, attributes: {} });
}

function defaultValue(value: OmmlDefault): unknown {
  if (value === "[]") return [];
  if (value === "{}") return {};
  return value;
}

/** `Utility.get_class(name).new`. */
function getClassNew(name: string): Draft {
  const entry = GET_CLASS.get(name);
  if (entry === undefined) throw new Error(`omml translator: get_class name ${name} not measured`);
  const [cls, defaults] = entry;
  // The gem raises NameError: `get_class` finds no `Math::Function` class.
  if (cls === null) {
    throw new OmmlTranslateError(`OMML input names "${name}", which has no model class`);
  }
  return new Draft(
    cls,
    Object.fromEntries(defaults.map(([field, value]) => [field, defaultValue(value)])),
  );
}

/** The classes that `attr_accessor :attributes` (`respond_to?(:attributes=)`). */
export const ATTRIBUTE_SETTERS: ReadonlySet<string> = new Set(
  [
    "Obrace",
    "Ubrace",
    "Tilde",
    "Overleftrightarrow",
    "Ddot",
    "Ul",
    "Vec",
    "Hat",
    "Dot",
    "Bar",
    "Linebreak",
  ].map((name) => FUNCTION + name),
);

/* =========================================================================
 * Entities and tokens (`Utility`, `Mathml::FunctionTokenResolver`)
 * ---------------------------------------------------------------------- */

const ENCODE_BASIC = /[<>'"&]/g;
const ENCODE_EXTENDED = /[^ -~]/gu;

function hexEntity(character: string): string {
  return `&#x${(character.codePointAt(0) ?? 0).toString(16)};`;
}

/** `Utility.string_to_html_entity`: htmlentities' `:hexadecimal` encode. */
export function stringToHtmlEntity(text: string): string {
  return text.replace(ENCODE_BASIC, hexEntity).replace(ENCODE_EXTENDED, hexEntity);
}

/** Ruby `String#strip`. */
export function rubyStrip(text: string): string {
  return text.replace(/^[\t\n\v\f\r \0]+|[\t\n\v\f\r \0]+$/g, "");
}

/** `FunctionTokenResolver#function_from_token`. */
export function functionFromToken(value: string): Draft | null {
  const word = rubyStrip(value);
  const mapped = OMML_UNICODE_SYMBOLS.get(rubyStrip(stringToHtmlEntity(value)));
  const symbol = mapped === undefined ? undefined : rubyStrip(mapped);
  let name: string | undefined;
  if (symbol !== undefined && CLASSES.has(symbol)) name = symbol;
  else if (CLASSES.has(word) && NAMED_FUNCTION_WORDS.has(word)) name = word;
  return name === undefined ? null : getClassNew(name);
}

/** `FunctionTokenResolver#contextual_accent_from_token`. */
export function contextualAccentFromToken(value: string): Draft | null {
  const entity = stringToHtmlEntity(htmlEntityToUnicode(value));
  const name = OMML_CONTEXTUAL_ACCENT_FUNCTIONS.get(rubyStrip(entity));
  return name === undefined ? null : getClassNew(name);
}

/* =========================================================================
 * Finalization
 * ---------------------------------------------------------------------- */

const CARRIERS: ReadonlyMap<string, readonly [string, string]> = new Map(
  OMML_CARRIERS.map(([cls, carrier, disposition]) => [cls, [carrier, disposition]] as const),
);

const KIND_BY_CARRIER: ReadonlyMap<string, NodeKind> = new Map(
  (Object.keys(NODE_SPECS) as NodeKind[]).map((kind) => [
    `Math::${NODE_SPECS[kind].rubyClass.replace(/^Math::/, "")}`,
    kind,
  ]),
);

function carrierOf(cls: string): { kind: NodeKind; identity?: string } {
  if (cls.startsWith(SYMBOLS)) return { kind: "symbol", identity: cls.slice(SYMBOLS.length) };
  const entry = CARRIERS.get(cls);
  if (entry === undefined) throw new Error(`omml translator: no carrier for ${cls}`);
  const [carrier, disposition] = entry;
  if (disposition === "deferred") {
    throw new OmmlTranslateError(
      `OMML input builds a ${cls.split("::").pop()} node, which this port does not model`,
    );
  }
  const kind = KIND_BY_CARRIER.get(carrier);
  if (kind === undefined) throw new Error(`omml translator: carrier ${carrier} has no node kind`);
  if (carrier === cls) return { kind };
  const identity = NODE_SPECS[kind].identity;
  if (identity === undefined) throw new Error(`omml translator: ${carrier} has no identity slot`);
  return { kind, identity: cls.slice(identity.prefix.length + 2) };
}

function finalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(finalizeValue);
  if (isObj(value)) return toNode(value);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, finalizeValue(entry)]),
    );
  }
  return value;
}

/** A finished draft as the core model node its census carrier names. */
export function toNode(o: Draft): MathNode {
  const { kind, identity } = carrierOf(o.cls);
  const spec = NODE_SPECS[kind];
  const names = new Map(spec.fields);
  const init: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(o.f)) {
    const tsField = names.get(field);
    if (tsField === undefined) throw new Error(`omml translator: ${o.cls} has no field ${field}`);
    init[tsField] = finalizeValue(value);
  }
  if (identity !== undefined && spec.identity !== undefined) init[spec.identity.field] = identity;
  return new OMML_NODE_CONSTRUCTORS[kind](init);
}
