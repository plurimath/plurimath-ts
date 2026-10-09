/** biome-ignore-all lint/style/useNamingConvention: draft fields are the Ruby
 * ivar names (`left_right_wrapper`, `parameter_one`), which `NODE_SPECS` maps
 * to the core model's fields; renaming them would break that lookup. */
/**
 * `Plurimath::Mathml::Translator` (lib/plurimath/mathml/translator.rb), with
 * the `Mathml::FormulaTransformation` module it includes and the pieces of the
 * gem's model it drives: `Formula::Mrow#organize_value`, the class
 * constructors, setters and predicates.
 *
 * The gem builds and then mutates Ruby objects; this module does the same on
 * `Draft` drafts, which carry a class key (`Math::Function::Frac`) and the ivars
 * that class assigned, under their Ruby names. `toNode` turns a finished draft
 * into the immutable core model through the census carrier the generator
 * measured (`MATHML_CARRIERS`).
 *
 * Everything the gem resolves at runtime through Ruby (symbol classes,
 * `get_class`, class facts) comes from `./generated/transform-tables.ts`.
 *
 * Gem bugs are ported as they behave, and logged in TODO.plan: a Ruby
 * `NoMethodError` or `ArgumentError` here is a `MathmlTranslateError`.
 */

import type { FormulaNode, MathNode, NodeKind } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import {
  MATHML_CARRIERS,
  MATHML_CLASSES,
  MATHML_CONTEXTUAL_ACCENT_FUNCTIONS,
  MATHML_FONT_STYLES,
  MATHML_FUNCTIONS,
  MATHML_GET_CLASS,
  MATHML_NAMED_FUNCTION_WORDS,
  MATHML_NARY_SYMBOL_IDS,
  MATHML_PAREN_SYMBOLS,
  MATHML_SYMBOL_CLASS_INPUT,
  MATHML_SYMBOL_CLASS_NAMES,
  MATHML_UNARY_CLASSES,
  MATHML_UNICODE_SYMBOLS,
  type MathmlDefault,
  type MathmlFunctionRow,
} from "./generated/transform-tables";
import type { MmlChild, MmlNode } from "./mml";
import { MATHML_NODE_CONSTRUCTORS } from "./registry";

/** The translator raised where the gem raises (a Ruby error in its code). */
export class MathmlTranslateError extends Error {
  override readonly name = "MathmlTranslateError";
}

/* =========================================================================
 * 1. Drafts and Ruby helpers
 * ---------------------------------------------------------------------- */

const FUNCTION = "Math::Function::";
const SYMBOLS = "Math::Symbols::";
const FORMULA = "Math::Formula";
const MROW = "Math::Formula::Mrow";
const MSTYLE = "Math::Formula::Mstyle";
const NUMBER = "Math::Number";
const BARE_SYMBOL = "Math::Symbols::Symbol";

/** One Ruby object under construction: its class and its ivars. */
export class Draft {
  constructor(
    public cls: string,
    readonly f: Record<string, unknown>,
  ) {}
}

type DraftValue = Draft | null;

function isObj(value: unknown): value is Draft {
  return value instanceof Draft;
}

/** Calling a method on nil: Ruby's NoMethodError. */
function noMethod(method: string, receiver: unknown): never {
  throw new MathmlTranslateError(
    `undefined method '${method}' for ${receiver === null || receiver === undefined ? "nil" : typeof receiver}`,
  );
}

function recv(value: unknown, method: string): Draft {
  if (!isObj(value)) noMethod(method, value);
  return value;
}

function truthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

const FUNCTIONS: ReadonlyMap<string, MathmlFunctionRow> = new Map(
  MATHML_FUNCTIONS.map((row) => [row[0], row] as const),
);
const NARY_SYMBOLS: ReadonlySet<string> = new Set(MATHML_NARY_SYMBOL_IDS);
const UNARY_CLASSES: ReadonlySet<string> = new Set(MATHML_UNARY_CLASSES);
const CLASSES: ReadonlySet<string> = new Set(MATHML_CLASSES);
const NAMED_FUNCTION_WORDS: ReadonlySet<string> = new Set(MATHML_NAMED_FUNCTION_WORDS);
const GET_CLASS: ReadonlyMap<
  string,
  readonly [string | null, readonly (readonly [string, MathmlDefault])[]]
> = new Map(MATHML_GET_CLASS.map(([name, cls, defaults]) => [name, [cls, defaults]] as const));

function isSymbol(o: Draft): boolean {
  return o.cls.startsWith(SYMBOLS);
}

function symbolId(o: Draft): string {
  return o.cls.slice(SYMBOLS.length);
}

function isFormula(o: unknown): boolean {
  return isObj(o) && (o.cls === FORMULA || o.cls === MROW || o.cls === MSTYLE);
}

function familyOf(o: Draft): "unary" | "binary" | "ternary" | "none" {
  const row = FUNCTIONS.get(o.cls);
  return row === undefined ? "none" : row[1];
}

/** `Core#class_name`: the downcased basename, unless the class overrides it. */
function className(o: Draft): string {
  const row = FUNCTIONS.get(o.cls);
  if (row?.[2] !== undefined && row[2] !== null) return row[2];
  if (isSymbol(o)) {
    const override = MATHML_SYMBOL_CLASS_NAMES.get(symbolId(o));
    if (override !== undefined) return override;
  }
  const parts = o.cls.split("::");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

const isUnary = (o: Draft) => familyOf(o) === "unary";
const isBinaryFunction = (o: Draft) => familyOf(o) === "binary";
const isTernaryFunction = (o: Draft) => familyOf(o) === "ternary";
const isNarySymbol = (o: Draft) => isSymbol(o) && NARY_SYMBOLS.has(symbolId(o));
const isParen = (o: Draft) => isSymbol(o) && MATHML_PAREN_SYMBOLS.has(symbolId(o));
const isMstyle = (o: Draft) => o.cls === MSTYLE;
const isMrow = (o: Draft) => o.cls === MROW;
const is = (o: unknown, name: string): boolean => isObj(o) && o.cls === FUNCTION + name;

/** `is_nary_function?` per the measured rule; raises on a nil parameter. */
function isNaryFunction(o: Draft): boolean {
  const row = FUNCTIONS.get(o.cls);
  const rule = row?.[3] ?? "never";
  if (rule === "never") return false;
  if (rule === "always") return true;
  const parameter = o.f[rule === "parameterOne" ? "parameter_one" : "parameter_two"];
  const target = recv(parameter, "is_nary_function?");
  return isNaryFunction(target) || isNarySymbol(target);
}

function anyValueExist(o: Draft): boolean {
  const family = familyOf(o);
  if (family === "ternary") {
    return truthy(o.f.parameter_one) || truthy(o.f.parameter_two) || truthy(o.f.parameter_three);
  }
  if (family === "binary") return truthy(o.f.parameter_one) || truthy(o.f.parameter_two);
  return noMethod("any_value_exist?", o.cls);
}

function allValuesExist(o: Draft): boolean {
  const family = familyOf(o);
  if (family === "ternary") {
    return o.f.parameter_one != null && o.f.parameter_two != null && o.f.parameter_three != null;
  }
  if (family === "binary") return truthy(o.f.parameter_one) && truthy(o.f.parameter_two);
  return noMethod("all_values_exist?", o.cls);
}

function respondsToNewNary(o: Draft): boolean {
  const row = FUNCTIONS.get(o.cls);
  return row?.[4] !== undefined && row[4] !== null;
}

/** `new_nary_function(fourth)` per the measured slot mapping. */
function newNaryFunction(o: Draft, fourth: unknown): Draft {
  const rule = FUNCTIONS.get(o.cls)?.[4];
  if (rule === undefined || rule === null) return noMethod("new_nary_function", o.cls);
  const [slots, type] = rule;
  const pick = (slot: string | null | undefined): unknown =>
    slot === null || slot === undefined ? null : o.f[`parameter_${slot}`];
  return newNary(
    pick(slots[0]),
    pick(slots[1]),
    pick(slots[2]),
    fourth,
    type === null ? {} : { type },
  );
}

/** `ModelHelper.validate_left_right` over a constructor's fields. */
function validateLeftRight(fields: readonly unknown[]): void {
  for (const field of fields) {
    if (isFormula(field) && is(formulaValue(field as Draft)[0], "Left")) {
      (field as Draft).f.left_right_wrapper = true;
    }
  }
}

function formulaValue(o: Draft): unknown[] {
  return o.f.value as unknown[];
}

/* =========================================================================
 * 2. Constructors
 * ---------------------------------------------------------------------- */

function newFormula(value: unknown = [], cls = FORMULA, displayStyle: unknown = true): Draft {
  const list = Array.isArray(value) ? value : [value];
  const fields: Record<string, unknown> = {
    value: list,
    left_right_wrapper: !is(list[0], "Left"),
    displaystyle: String(displayStyle) === "true",
  };
  if (cls === MROW) fields.is_mrow = true;
  return new Draft(cls, fields);
}

function unary(name: string, one: unknown = null): Draft {
  validateLeftRight([one]);
  return new Draft(FUNCTION + name, { parameter_one: one });
}

function binary(name: string, one: unknown = null, two: unknown = null): Draft {
  validateLeftRight([one, two]);
  return new Draft(FUNCTION + name, { parameter_one: one, parameter_two: two });
}

function ternary(
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

function withOptionsUnlessEmpty(o: Draft, options: Record<string, unknown>): Draft {
  if (Object.keys(options).length > 0) o.f.options = options;
  return o;
}

function newNary(
  one: unknown,
  two: unknown,
  three: unknown,
  four: unknown,
  options: Record<string, unknown> = {},
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

function newText(one: unknown = ""): Draft {
  validateLeftRight([one]);
  return new Draft(`${FUNCTION}Text`, { parameter_one: one, lang: null });
}

function newNumber(value: unknown): Draft {
  return new Draft(NUMBER, { value, mini_sub_sized: false, mini_sup_sized: false, base: null });
}

/** `Symbols::Symbol.new(sym, options: {})`. */
function newSymbol(sym: unknown, options: Record<string, unknown> = {}): Draft {
  const value = Array.isArray(sym) ? sym.join("") : sym === null ? null : String(sym);
  const o = new Draft(BARE_SYMBOL, { value });
  if (Object.keys(options).length > 0) o.f.options = options;
  return o;
}

/** A symbol class's `.new`: only `@value`, nil. */
function newSymbolOfClass(id: string): Draft {
  return new Draft(SYMBOLS + id, { value: null });
}

/** `Td.new(p1, p2)`: drops literal "&" cells in place, then `Array(p1)`. */
function newTd(one: unknown = null, two: unknown = null): Draft {
  if (Array.isArray(one)) {
    for (let index = one.length - 1; index >= 0; index--)
      if (one[index] === "&") one.splice(index, 1);
  }
  return binary("Td", one === null ? [] : Array.isArray(one) ? one : [one], two);
}

/** `Tr.new(p1 = [])`: an all-"@" row becomes empty cells. */
function newTr(one: unknown[]): Draft {
  if (!one.some((cell) => cell !== "@")) for (let i = 0; i < one.length; i++) one[i] = newTd([]);
  return unary("Tr", one);
}

function newTable(value: unknown): Draft {
  return new Draft(`${FUNCTION}Table`, { value, open_paren: null, close_paren: null, options: {} });
}

function newFenced(
  one: unknown,
  two: unknown,
  three: unknown,
  options: Record<string, unknown>,
): Draft {
  const o = ternary("Fenced", one, two, three);
  o.f.options = options;
  return o;
}

function withAttributes(
  name: string,
  one: unknown,
  attributes: Record<string, unknown> = {},
): Draft {
  const o = unary(name, one);
  o.f.attributes = attributes;
  return o;
}

function newLinebreak(one: unknown, attributes: Record<string, unknown>): Draft {
  const o = new Draft(`${FUNCTION}Linebreak`, { parameter_one: one, attributes });
  validateLeftRight([one]);
  return o;
}

function defaultValue(value: MathmlDefault): unknown {
  if (value === "[]") return [];
  if (value === "{}") return {};
  return value;
}

/** `Utility.get_class(name).new`. */
function getClassNew(name: string): Draft {
  const entry = GET_CLASS.get(name);
  if (entry === undefined)
    throw new Error(`mathml translator: get_class name ${name} not measured`);
  const [cls, defaults] = entry;
  if (cls === null)
    throw new MathmlTranslateError(`uninitialized constant Math::Function::${name}`);
  return new Draft(
    cls,
    Object.fromEntries(defaults.map(([field, value]) => [field, defaultValue(value)])),
  );
}

/** The classes that `attr_accessor :attributes` (`respond_to?(:attributes=)`). */
const ATTRIBUTE_SETTERS: ReadonlySet<string> = new Set(
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
 * 3. Entities, symbols and tokens (`Mathml::Utility`)
 * ---------------------------------------------------------------------- */

const ENCODE_BASIC = /[<>'"&]/g;
const ENCODE_EXTENDED = /[^ -~]/gu;

function hexEntity(character: string): string {
  return `&#x${(character.codePointAt(0) ?? 0).toString(16)};`;
}

/** `Utility.string_to_html_entity`: htmlentities' `:hexadecimal` encode. */
function stringToHtmlEntity(text: string): string {
  return text.replace(ENCODE_BASIC, hexEntity).replace(ENCODE_EXTENDED, hexEntity);
}

/** Ruby `String#strip`. */
function rubyStrip(text: string): string {
  return text.replace(/^[\t\n\v\f\r \0]+|[\t\n\v\f\r \0]+$/g, "");
}

/** `Utility.symbols_class(string, lang: :mathml)`. */
function symbolsClass(text: string): Draft {
  const id = MATHML_SYMBOL_CLASS_INPUT.get(rubyStrip(text));
  return id === undefined ? newSymbol(text) : newSymbolOfClass(id);
}

/** `FunctionTokenResolver#function_from_token`. */
function functionFromToken(value: string): Draft | null {
  const word = rubyStrip(value);
  const unicode = stringToHtmlEntity(value);
  const mapped = MATHML_UNICODE_SYMBOLS.get(rubyStrip(unicode));
  const symbol = mapped === undefined ? undefined : rubyStrip(mapped);
  let name: string | undefined;
  if (symbol !== undefined && CLASSES.has(symbol)) name = symbol;
  else if (CLASSES.has(word) && NAMED_FUNCTION_WORDS.has(word)) name = word;
  return name === undefined ? null : getClassNew(name);
}

/** `Mathml::Utility.resolve_token`. */
function resolveToken(value: string): Draft {
  return functionFromToken(value) ?? symbolsClass(stringToHtmlEntity(value));
}

/** `contextual_accent_from_token`. */
function contextualAccentFromToken(value: unknown): Draft | null {
  if (value === null || value === undefined) return null;
  const entity = stringToHtmlEntity(htmlEntityToUnicode(String(value)));
  const name = MATHML_CONTEXTUAL_ACCENT_FUNCTIONS.get(rubyStrip(entity));
  return name === undefined ? null : getClassNew(name);
}

/** `Text#value=`: re-encode, then substitute every `UNICODE_SYMBOLS` code. */
function setTextValue(text: Draft, value: unknown): void {
  const raw = Array.isArray(value) ? value.join("") : value;
  // Measured: `Text#value = nil` stores "" (htmlentities decodes nil as "").
  let string = stringToHtmlEntity(
    htmlEntityToUnicode(raw === null || raw === undefined ? "" : String(raw)),
  );
  for (const [code, name] of MATHML_UNICODE_SYMBOLS) {
    string = (string as string).replaceAll(code.toLowerCase(), `unicode[:${name}]`);
  }
  text.f.parameter_one = string;
}

/* =========================================================================
 * 4. FormulaTransformation
 * ---------------------------------------------------------------------- */

function isText(child: MmlChild): child is string {
  return typeof child === "string";
}

/** `ordered_children`: text that Ruby's `strip` empties (ASCII whitespace and NUL) is dropped. */
function orderedChildren(node: MmlNode): MmlChild[] {
  return node.children.filter((child) => !(isText(child) && rubyStrip(child) === ""));
}

function contentChildren(node: MmlNode): MmlChild[] {
  return orderedChildren(node).filter(
    (child) => isText(child) || (child.kind !== "Malignmark" && child.kind !== "Maligngroup"),
  );
}

function textValue(value: string | readonly string[] | undefined): string | null {
  if (value === undefined) return null;
  return typeof value === "string" ? value : value.join("");
}

function booleanToDisplaystyle(value: unknown): boolean {
  if (value === "false" || value === false) return false;
  return true;
}

function truthyMathmlBool(value: unknown): boolean {
  return value === true || value === "true";
}

function filterChild(value: DraftValue): DraftValue {
  if (value === null) return null;
  if (!isFormula(value)) return value;
  const list = formulaValue(value);
  if (list.length === 0) return value;
  return list.length === 1 ? (list[0] as DraftValue) : value;
}

function wrapChildren(children: readonly DraftValue[]): DraftValue {
  if (children.length === 0) return null;
  if (children.length === 1) return children[0] ?? null;
  return newFormula([...children]);
}

function narySymbolOf(value: unknown): boolean {
  return isNarySymbol(recv(value, "is_nary_symbol?"));
}

function naryCheck(children: Draft[]): Draft[] {
  if (children.length !== 2) return children;
  const [first, second] = children as [Draft, Draft];
  if (
    is(first, "PowerBase") &&
    isObj(first.f.parameter_one) &&
    isNarySymbol(first.f.parameter_one)
  ) {
    return [newNary(first.f.parameter_one, first.f.parameter_two, first.f.parameter_three, second)];
  }
  if (is(first, "Overset") && isObj(first.f.parameter_two) && isNarySymbol(first.f.parameter_two)) {
    return [
      newNary(first.f.parameter_two, null, first.f.parameter_one, second, { type: "undOvr" }),
    ];
  }
  if (is(first, "Power") && isObj(first.f.parameter_one) && isNarySymbol(first.f.parameter_one)) {
    return [
      newNary(first.f.parameter_one, null, first.f.parameter_two, second, { type: "subSup" }),
    ];
  }
  return children;
}

function preserveSeparateNaryBody(first: unknown, second: unknown): boolean {
  if (!isObj(first) || !isNaryFunction(first)) return false;
  const normalized = filterChild((second ?? null) as DraftValue);
  return is(normalized, "Base") || is(normalized, "PowerBase");
}

/** Ruby `Array#delete_at`: removes and returns, nil past the end. */
function deleteAt(values: unknown[], index: number): unknown {
  if (index >= values.length) return null;
  return values.splice(index, 1)[0] ?? null;
}

function valueIsTernaryOrNary(values: readonly unknown[]): boolean {
  if (values.some((value) => typeof value === "string")) return false;
  if (values.length < 2) return false;
  const first = recv(values[0], "is_ternary_function?");
  return (
    isTernaryFunction(first) &&
    first.f.parameter_three == null &&
    (first.f.parameter_one != null || first.f.parameter_two != null)
  );
}

function fillTernaryThirdValues(values: unknown): void {
  if (!Array.isArray(values) || values.length <= 1) return;
  const first = values[0];
  if (preserveSeparateNaryBody(first, values[1])) return;
  if (is(first, "Nary")) {
    if (!truthy(first.f.parameter_four)) first.f.parameter_four = deleteAt(values, 1);
  } else if (isObj(first) && isNaryFunction(first) && !allValuesExist(first)) {
    if (respondsToNewNary(first) && !anyValueExist(first)) {
      values[0] = newNaryFunction(first, deleteAt(values, 1));
    } else if (anyValueExist(first)) {
      first.f.parameter_three = deleteAt(values, 1);
    }
  } else if (valueIsTernaryOrNary(values)) {
    (first as Draft).f.parameter_three = deleteAt(values, 1);
  }
}

function unwrapSingle(value: unknown[] | null): DraftValue {
  if (value === null || value.length === 0) return null;
  return value.length === 1 ? ((value[0] ?? null) as DraftValue) : newFormula(value);
}

function preserveExplicitNaryBody(values: unknown[]): void {
  if (values.length === 0) return;
  if (!is(values[0], "Nary")) return;
  const first = values[0] as Draft;
  const options = first.f.options as Record<string, unknown> | null;
  if (options?.type !== "undOvr") return;
  const body = filterChild((first.f.parameter_four ?? null) as DraftValue);
  if (!(is(body, "Base") || is(body, "PowerBase"))) return;
  const replacement =
    first.f.parameter_three == null
      ? withOptionsUnderset(first.f.parameter_two, first.f.parameter_one, {})
      : ternary("Underover", first.f.parameter_one, first.f.parameter_two, first.f.parameter_three);
  values[0] = replacement;
  values.splice(1, 0, body);
}

/** `Underset.new(p1, p2, options = {})`: `@options` unless nil. */
function withOptionsUnderset(
  one: unknown,
  two: unknown,
  options: Record<string, unknown> | null,
): Draft {
  const o = binary("Underset", one, two);
  if (options !== null) o.f.options = options;
  return o;
}

function convertMultiscriptChild(child: MmlChild | undefined): Draft {
  if (child !== undefined && !isText(child)) {
    if (child.kind === "None") return unary("None");
    if (child.value !== undefined && textValue(child.value) === "") return unary("None");
  }
  return (child === undefined ? null : translate(child)) ?? unary("None");
}

function convertMultiscriptChildren(children: readonly MmlChild[]): Draft[] {
  return children.map((child) => convertMultiscriptChild(child));
}

function splitScriptPairs(
  children: readonly Draft[],
  compact: boolean,
): [DraftValue[], DraftValue[]] {
  const subs: DraftValue[] = [];
  const sups: DraftValue[] = [];
  for (let i = 0; i < children.length; i += 2) {
    subs.push(children[i] ?? null);
    sups.push(i + 1 < children.length ? (children[i + 1] ?? null) : null);
  }
  if (!compact) return [subs, sups];
  return [subs.filter((v) => v !== null), sups.filter((v) => v !== null)];
}

function attachPostscripts(base: DraftValue, subs: DraftValue[], sups: DraftValue[]): DraftValue {
  const normalized = filterChild(base);
  if (!subs.some(truthy) && !sups.some(truthy)) return normalized;
  return ternary("PowerBase", normalized, unwrapSingle(subs), unwrapSingle(sups));
}

/**
 * `build_annotation_entries`: `annotation.respond_to?(:value) ? annotation.value
 * : annotation.to_s`. An `annotation-xml` has no `value`, so the gem records
 * `Object#to_s` — `#<Mml::V4::AnnotationXml:0x...>`, an address that changes
 * every run. The port records the same text without the address (TODO.plan/
 * deferred.md, "MathML input records annotation-xml as an object address").
 */
export const ANNOTATION_XML_TO_S = "#<Mml::V4::AnnotationXml>";

function buildAnnotationEntries(
  entries: readonly MmlNode[],
  tag: string,
): Record<string, unknown>[] {
  return entries.map((annotation) => ({
    [tag]: [
      newSymbol(
        annotation.kind === "AnnotationXml" ? ANNOTATION_XML_TO_S : (annotation.value ?? null),
      ),
    ],
  }));
}

function openingParen(o: Draft): boolean {
  if (o.cls === BARE_SYMBOL && o.f.value === "(") return true;
  if (className(o) === "lround") return true;
  return isParen(o) && MATHML_PAREN_SYMBOLS.get(symbolId(o)) === true;
}

/** `obj.class < Math::Function::UnaryFunction`: strict subclasses only. */
function canCombineWithParen(o: Draft): boolean {
  return familyOf(o) === "unary" && o.cls !== `${FUNCTION}UnaryFunction`;
}

function combineFunctionWithParens(values: Draft[]): Draft[] {
  if (values.length < 2) return values;
  const result: Draft[] = [];
  let i = 0;
  while (i < values.length) {
    const current = values[i] as Draft;
    if (i + 1 < values.length && canCombineWithParen(current)) {
      const next = values[i + 1] as Draft;
      if (openingParen(next)) {
        const paren = isParen(next) ? next : newSymbolOfClass("Paren::Lround");
        result.push(constructSame(current, paren));
        i += 2;
        continue;
      }
    }
    result.push(current);
    i += 1;
  }
  return result;
}

/** `current.class.new(paren)` for a UnaryFunction subclass. */
function constructSame(current: Draft, one: unknown): Draft {
  const name = current.cls.slice(FUNCTION.length);
  if (ATTRIBUTE_SETTERS.has(current.cls)) return withAttributes(name, one);
  if (name === "Text") return newText(one);
  return unary(name, one);
}

function applyFontStyle(element: MmlNode, result: Draft): Draft {
  const variant = element.attributes.get("mathvariant");
  if (variant === undefined || variant === "") return result;
  const font = MATHML_FONT_STYLES.get(String(variant));
  if (font === undefined) return result;
  return binaryClass(font, result, variant);
}

function binaryClass(cls: string, one: unknown, two: unknown): Draft {
  validateLeftRight([one, two]);
  return new Draft(cls, { parameter_one: one, parameter_two: two });
}

/** `FormulaTransformation#filter_values`, with `self` the receiver formula (or null). */
function filterValues(
  self: Draft | null,
  value: unknown,
  arrayToInstance = false,
  replacingOrder = true,
): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return arrayToInstance ? null : value;

  if (self !== null && value.length === 1 && isMstyle(recv(value[0], "is_mstyle?"))) {
    self.f.displaystyle = (value[0] as Draft).f.displaystyle;
  }

  if (value.length === 1 && value.every(isFormula)) {
    const inner = formulaValue(value[0] as Draft);
    return arrayToInstance ? filterValues(self, inner, true) : inner;
  }
  if (value.some((element) => isObj(element) && isMrow(element))) {
    value.forEach((element, index) => {
      if (!(isObj(element) && isMrow(element))) return;
      value[index] = filterValues(self, [element], true, replacingOrder);
    });
    return value;
  }
  if (valueIsTernaryOrNary(value)) {
    (value[0] as Draft).f.parameter_three = deleteAt(value, 1);
    return filterValues(self, value, arrayToInstance, replacingOrder);
  }
  if (value.length === 2) {
    const first = recv(value[0], "parameter_one");
    if (is(first, "PowerBase") && narySymbolOf(first.f.parameter_one)) {
      return [
        newNary(first.f.parameter_one, first.f.parameter_two, first.f.parameter_three, value[1]),
      ];
    }
    if (is(first, "Overset") && narySymbolOf(first.f.parameter_two)) {
      return [
        newNary(first.f.parameter_two, null, first.f.parameter_one, value[1], { type: "undOvr" }),
      ];
    }
    if (is(first, "Power") && narySymbolOf(first.f.parameter_one)) {
      return [
        newNary(first.f.parameter_one, null, first.f.parameter_two, value[1], { type: "subSup" }),
      ];
    }
  }
  if (arrayToInstance && replacingOrder) return value.length > 1 ? newFormula(value) : value[0];
  return value;
}

/* =========================================================================
 * 5. `Formula::Mrow#organize_value`
 * ---------------------------------------------------------------------- */

function organizeValue(mrow: Draft): void {
  const iterated = formulaValue(mrow);
  if (iterated.some((element) => typeof element === "string")) return;
  if (mrow.f.is_mrow !== true) return;
  const current = () => formulaValue(mrow);

  for (let index = 0; index < iterated.length; index++) {
    const element = recv(iterated[index], "class_name");
    updateCurrentElement(element, current());
    const value = current();
    const next = value[index + 1];
    if (is(next, "Mod")) {
      updateModFunction(mrow, value, index);
    } else if (unaryFunctionUpdatable(value, element, index)) {
      unaryFunctionUpdate(mrow, value, index);
    } else if (
      isParen(recv(value[0], "paren?")) &&
      isParen(recv(value[value.length - 1], "paren?"))
    ) {
      organizeFencing(mrow, value);
    } else if (is(element, "Underset") && naryFunctionOrSymbol(element.f.parameter_two)) {
      value[index] = newNaryElement(mrow, element, value);
    } else if (is(element, "Underover") && naryFunctionOrSymbol(element.f.parameter_one)) {
      replaceWithNaryFunction(mrow, element, value, index);
    } else if (
      isTernaryFunction(element) &&
      anyValueExist(element) &&
      element.f.parameter_three == null
    ) {
      element.f.parameter_three = deleteAt(value, index + 1);
    }
  }
}

function naryFunctionOrSymbol(value: unknown): boolean {
  const target = recv(value, "is_nary_function?");
  return isNaryFunction(target) || isNarySymbol(target);
}

function updateCurrentElement(element: Draft, value: unknown[]): void {
  const first = recv(value[0], "class_name");
  const last = recv(value[value.length - 1], "class_name");
  if (
    className(first) === "symbol" &&
    first.f.value == null &&
    className(last) === "symbol" &&
    last.f.value == null
  ) {
    value[0] = newSymbolOfClass("Paren::OpenParen");
    value[value.length - 1] = newSymbolOfClass("Paren::CloseParen");
  } else if (className(element) === "symbol" && element.f.value == null) {
    element.f.value = "";
  }
}

function unaryFunctionUpdatable(value: unknown[], element: Draft, index: number): boolean {
  return (
    value.length > 1 &&
    isUnary(element) &&
    truthy(value[index + 1]) &&
    UNARY_CLASSES.has(className(element))
  );
}

function updateModFunction(mrow: Draft, value: unknown[], index: number): void {
  const mod = value[index + 1] as Draft;
  mod.f.parameter_one = filterValues(mrow, deleteAt(value, index), true);
  mod.f.parameter_two = filterValues(mrow, deleteAt(value, index + 1), true);
}

function unaryFunctionUpdate(mrow: Draft, value: unknown[], index: number): void {
  const element = deleteAt(value, index) as Draft;
  element.f.parameter_one = filterValues(mrow, deleteAt(value, index), true);
  value.splice(index, 0, element);
}

function organizeFencing(mrow: Draft, value: unknown[]): void {
  if (is(value[1], "Table") && value.length === 3) {
    const table = value[1] as Draft;
    table.f.open_paren = value.shift();
    table.f.close_paren = value.pop();
  } else {
    const open = value.shift() ?? null;
    const close = value.length === 0 ? null : (value.pop() ?? null);
    mrow.f.value = [newFenced(open, value, close, {})];
  }
}

function newNaryElement(mrow: Draft, element: Draft, value: unknown[]): Draft {
  value.shift();
  const rest = value.splice(0, value.length);
  return newNary(
    element.f.parameter_two,
    element.f.parameter_one,
    null,
    filterValues(mrow, rest, true),
    { type: "undOvr" },
  );
}

function replaceWithNaryFunction(
  mrow: Draft,
  element: Draft,
  value: unknown[],
  index: number,
): void {
  const fourth = deleteAt(value, index + 1);
  // `organize_value(fourth_value)` passes an argument to a zero-arity method:
  // ArgumentError whenever the fourth value is an Mrow (gem bug, ported).
  if (isMrow(recv(fourth, "is_mrow?"))) {
    throw new MathmlTranslateError("wrong number of arguments (given 1, expected 0)");
  }
  value[index] = newNary(
    element.f.parameter_one,
    element.f.parameter_two,
    element.f.parameter_three,
    filterValues(mrow, fourth, true),
    { type: "undOvr" },
  );
}

/* =========================================================================
 * 6. The translator
 * ---------------------------------------------------------------------- */

function attr(node: MmlNode, name: string): string | number | null {
  return node.attributes.get(name) ?? null;
}

function children(node: MmlNode, pick = orderedChildren): Draft[] {
  return pick(node)
    .map(translate)
    .filter((value): value is Draft => value !== null);
}

function at(list: readonly MmlChild[], index: number): DraftValue {
  const child = list[index];
  return child === undefined ? null : translate(child);
}

/** `mml_to_plurimath`. */
export function translate(node: MmlChild): DraftValue {
  if (isText(node)) return textNode(node);
  switch (node.kind) {
    case "Math":
      return mathToFormula(node);
    case "Mrow":
      return mrowToMrow(node);
    case "Mover":
      return moverToOverset(node);
    case "Munder":
      return munderToUnderset(node);
    case "Munderover":
      return munderoverToUnderover(node);
    case "Msup":
      return msupToPower(node);
    case "Msub":
      return msubToBase(node);
    case "Msubsup":
      return msubsupToPowerbase(node);
    case "Mfrac":
    case "Mfraction":
      return mfracToFrac(node);
    case "Msqrt":
      return unary("Sqrt", wrapChildren(children(node, contentChildren)));
    case "Mroot": {
      const list = contentChildren(node);
      return binary("Root", filterChild(at(list, 1)), filterChild(at(list, 0)));
    }
    case "Mi":
      return miToSymbol(node);
    case "Mo":
      return moToSymbol(node);
    case "Mn":
      return newNumber(textValue(node.value) ?? "");
    case "Mtext": {
      const text = newText();
      setTextValue(text, textValue(node.value));
      return text;
    }
    case "Mstyle":
      return mstyleToMstyle(node);
    case "Mtable":
      return mtableToTable(node);
    case "Mtr":
      return newTr(orderedChildren(node).map((cell) => translate(cell)));
    case "Mtd":
      return newTd(children(node));
    case "Mfenced":
      return mfencedToFenced(node);
    case "Mphantom":
      return unary("Phantom", normalizePhantomChild(wrapChildren(children(node))));
    case "Menclose": {
      const content = children(node);
      const one = content.length === 1 ? (content[0] as Draft) : newFormula(content);
      return binary("Menclose", attr(node, "notation"), one);
    }
    case "Merror":
      return unary("Merror", wrapChildren(children(node)));
    case "Mlongdiv":
      return unary("Longdiv", children(node));
    case "Mstack":
      return unary("Stackrel", wrapChildren(children(node)));
    case "Msrow": {
      const content = children(node);
      return content.length === 0 ? null : newFormula(content);
    }
    case "Msgroup":
      return unary(
        "Msgroup",
        orderedChildren(node)
          .map((child) => (isText(child) ? newText(child) : translate(child)))
          .filter((value): value is Draft => value !== null),
      );
    case "Msline":
      return unary("Msline", wrapChildren(children(node)));
    case "Mpadded":
      return mpaddedToMpadded(node);
    case "Mglyph":
      return unary("Mglyph", {
        src: attr(node, "src"),
        alt: attr(node, "alt"),
        index: attr(node, "index"),
      });
    case "Mmultiscripts":
      return mmultiscriptsToMultiscript(node);
    case "Mlabeledtr": {
      const id = attr(node, "id");
      return binary("Mlabeledtr", children(node), id === null ? null : newText(id));
    }
    case "Semantics":
      return semanticsToSemantics(node);
    case "None":
      return null;
    case "Ms":
      return msToMs(node);
    case "Mscarries":
      return unary("Scarries", wrapChildren(children(node)));
    case "Mscarry":
    case "Annotation":
    case "AnnotationXml":
    case "Malignmark":
    case "Maligngroup":
    case "Mprescripts":
      return null;
    case "Mspace": {
      const linebreak = attr(node, "linebreak");
      if (linebreak !== null && linebreak !== "") return newLinebreak(null, { linebreak });
      return null;
    }
    default:
      throw new MathmlTranslateError(`Unknown mml node type: Mml::V4::${node.kind}`);
  }
}

function textNode(text: string): DraftValue {
  // Ruby's `[[:space:]]` on a UTF-8 string is Unicode White_Space (U+0085 in,
  // U+FEFF out), which JavaScript's `\s` is not.
  if (/^\p{White_Space}*$/u.test(text)) return null;
  return resolveToken(text);
}

function mathToFormula(node: MmlNode): Draft {
  let values: Draft[] = naryCheck(children(node));
  let displayStyle: unknown = booleanToDisplaystyle(attr(node, "display"));
  const first = values[0];
  if (values.length === 1 && first !== undefined && isMstyle(first)) {
    values = formulaValue(first) as Draft[];
    displayStyle = first.f.displaystyle;
  }
  return newFormula(values, FORMULA, displayStyle);
}

function mrowToMrow(node: MmlNode): DraftValue {
  const values = children(node);
  if (values.length === 0) return null;
  const combined = naryCheck(combineFunctionWithParens(values));
  const mrow = newFormula(combined, MROW);
  organizeValue(mrow);
  preserveExplicitNaryBody(formulaValue(mrow));
  fillTernaryThirdValues(formulaValue(mrow));
  const list = formulaValue(mrow);
  if (list.length === 1) return (list[0] ?? null) as DraftValue;
  const intent = attr(node, "intent");
  if (intent !== null && intent !== "") return binary("Intent", mrow, newText(intent));
  return newFormula(list);
}

function moverToOverset(node: MmlNode): Draft {
  const list = contentChildren(node);
  const base = filterChild(at(list, 0));
  let over = filterChild(at(list, 1));
  if (over !== null && over.cls === BARE_SYMBOL)
    over = contextualAccentFromToken(over.f.value) ?? over;
  const options: Record<string, unknown> = {};
  if (truthyMathmlBool(attr(node, "accent"))) options.accent = true;
  const name = over === null ? null : className(over);
  switch (name) {
    case "obrace":
    case "ubrace":
    case "bar":
      (over as Draft).f.parameter_one = base;
      return over as Draft;
    case "hat":
    case "ddot":
    case "vec":
    case "tilde":
      (over as Draft).f.parameter_one = base;
      if (ATTRIBUTE_SETTERS.has((over as Draft).cls)) (over as Draft).f.attributes = options;
      return over as Draft;
    case "period":
    case "dot": {
      const element =
        isSymbol(over as Draft) && symbolId(over as Draft) === "Period"
          ? withAttributes("Dot", null)
          : (over as Draft);
      element.f.parameter_one = base;
      if (ATTRIBUTE_SETTERS.has(element.cls)) element.f.attributes = options;
      return element;
    }
    case "ul":
    case "underline":
      return withAttributes("Bar", base, options);
    default: {
      const o = binary("Overset", over, base);
      if (Object.keys(options).length > 0) o.f.options = options;
      return o;
    }
  }
}

function munderToUnderset(node: MmlNode): Draft {
  const list = contentChildren(node);
  const base = at(list, 0);
  const under = at(list, 1);
  const options: Record<string, unknown> = {};
  if (truthyMathmlBool(attr(node, "accentunder"))) options.accentunder = true;
  if (base !== null && (is(base, "Vec") || (isTernaryFunction(base) && !anyValueExist(base)))) {
    base.f.parameter_one = under;
    if (ATTRIBUTE_SETTERS.has(base.cls)) base.f.attributes = options;
    return base;
  }
  if (base !== null && isBinaryFunction(base) && !anyValueExist(base)) {
    base.f.parameter_one = under;
    return base;
  }
  const name = under === null ? null : className(under);
  switch (name) {
    case "obrace":
    case "ubrace":
    case "ul":
    case "underline":
      (under as Draft).f.parameter_one = base;
      return under as Draft;
    case "bar":
      return withAttributes("Ul", base, options);
    default:
      return withOptionsUnderset(under, base, options);
  }
}

function munderoverToUnderover(node: MmlNode): Draft {
  const list = contentChildren(node);
  const base = filterChild(at(list, 0));
  const under = filterChild(at(list, 1));
  const over = filterChild(at(list, 2));
  if (base !== null && isTernaryFunction(base) && !anyValueExist(base)) {
    base.f.parameter_one = under;
    base.f.parameter_two = over;
    return base;
  }
  if (base !== null && isNarySymbol(base))
    return newNary(base, under, over, null, { type: "undOvr" });
  return ternary("Underover", base, under, over);
}

function msupToPower(node: MmlNode): Draft {
  const list = contentChildren(node);
  const base = filterChild(at(list, 0));
  const sup = filterChild(at(list, 1));
  if (base !== null && isBinaryFunction(base) && !anyValueExist(base)) {
    base.f.parameter_one = sup;
    return base;
  }
  return binary("Power", base, sup);
}

function msubToBase(node: MmlNode): Draft {
  const list = contentChildren(node);
  const base = filterChild(at(list, 0));
  const sub = filterChild(at(list, 1));
  if (base !== null && isBinaryFunction(base) && !anyValueExist(base)) {
    base.f.parameter_one = sub;
    return base;
  }
  return binary("Base", base, sub);
}

function msubsupToPowerbase(node: MmlNode): Draft {
  const list = contentChildren(node);
  const base = filterChild(at(list, 0));
  const sub = filterChild(at(list, 1));
  const sup = filterChild(at(list, 2));
  if (base !== null && isTernaryFunction(base) && !anyValueExist(base)) {
    base.f.parameter_one = sub;
    base.f.parameter_two = sup;
    return base;
  }
  if (base !== null && isBinaryFunction(base) && !anyValueExist(base)) {
    base.f.parameter_one = sub;
    base.f.parameter_two = sup;
    return base;
  }
  return ternary("PowerBase", base, sub, sup);
}

function miToSymbol(node: MmlNode): DraftValue {
  const value = textValue(node.value);
  if (value === null || value === "") return null;
  return applyFontStyle(node, resolveToken(value));
}

function moToSymbol(node: MmlNode): Draft {
  const value = textValue(node.value);
  if (attr(node, "linebreak") === "newline") {
    const attributes: Record<string, unknown> = {};
    const style = attr(node, "linebreakstyle");
    if (style !== null) attributes.linebreakstyle = style;
    const symbol = value === null || value === "" ? newSymbol(null) : resolveToken(value);
    return newLinebreak(symbol, attributes);
  }
  const rspace = attr(node, "rspace");
  if (value === null || value === "") {
    const result = newSymbol(null);
    if (rspace !== null) result.f.options = { rspace };
    return result;
  }
  const result = resolveToken(value);
  if (result.cls === BARE_SYMBOL && rspace !== null) result.f.options = { rspace };
  return applyFontStyle(node, result);
}

function mfracToFrac(node: MmlNode): Draft {
  const list = contentChildren(node);
  const o = binary("Frac", at(list, 0), at(list, 1));
  const options: Record<string, unknown> = {};
  const thickness = attr(node, "linethickness");
  const bevelled = attr(node, "bevelled");
  if (thickness !== null) options.linethickness = thickness;
  if (bevelled !== null) options.bevelled = bevelled;
  return withOptionsUnlessEmpty(o, options);
}

function normalizePhantomChild(child: DraftValue): DraftValue {
  if (child === null) return child;
  const hasValue =
    child.cls === BARE_SYMBOL ||
    isSymbol(child) ||
    child.cls === NUMBER ||
    isFormula(child) ||
    child.cls === `${FUNCTION}Text` ||
    child.cls === `${FUNCTION}Ms` ||
    child.cls === `${FUNCTION}Table`;
  if (!hasValue) return child;
  if (child.cls === BARE_SYMBOL) return child;
  const value =
    child.cls === `${FUNCTION}Text` || child.cls === `${FUNCTION}Ms`
      ? child.f.parameter_one
      : child.f.value;
  if (typeof value !== "string") return child;
  if (!/^\p{White_Space}|\p{White_Space}$/u.test(value)) {
    return child;
  }
  if (child.cls === `${FUNCTION}Text`) setTextValue(child, null);
  else if (child.cls === `${FUNCTION}Ms`) child.f.parameter_one = null;
  else child.f.value = null;
  return child;
}

function mstyleToMstyle(node: MmlNode): DraftValue {
  const content = children(node);
  let contentObj = wrapChildren(content);
  const color = attr(node, "mathcolor");
  const variant = attr(node, "mathvariant");
  const hasColor = color !== null && color !== "";
  const hasVariant = variant !== null && variant !== "";
  if (hasColor) {
    contentObj = withOptionsUnlessEmpty(binary("Color", newText(color), contentObj), {});
  }
  if (hasVariant) {
    const font = MATHML_FONT_STYLES.get(String(variant));
    if (font !== undefined) return binaryClass(font, contentObj, variant);
  }
  if (hasColor) return contentObj;
  fillTernaryThirdValues(content);
  return newFormula(content, MSTYLE, booleanToDisplaystyle(attr(node, "displaystyle")));
}

function mfencedToFenced(node: MmlNode): Draft {
  const content = children(node).map((child) => filterChild(child));
  const open = attr(node, "open");
  const close = attr(node, "close");
  const openValue = open ?? (close === null ? "(" : null);
  const closeValue = close ?? (open === null ? ")" : null);
  const separators = attr(node, "separators");
  return newFenced(
    openValue === null || openValue === ""
      ? openValue === ""
        ? resolveToken("")
        : null
      : resolveToken(String(openValue)),
    content,
    closeValue === null || closeValue === ""
      ? closeValue === ""
        ? resolveToken("")
        : null
      : resolveToken(String(closeValue)),
    separators === null ? {} : { separators },
  );
}

function mtableToTable(node: MmlNode): Draft {
  const rows = children(node);
  const table = newTable(rows);
  const frame = attr(node, "frame");
  const rowlines = attr(node, "rowlines");
  const columnlines = attr(node, "columnlines");
  if (frame !== null) setTableOption(table, "frame", frame);
  if (rowlines !== null) setTableOption(table, "rowlines", rowlines);
  if (columnlines !== null) setTableColumnlines(table, String(columnlines));
  return table;
}

function setTableOption(table: Draft, option: string, value: unknown): void {
  if (value === null || value === "") return;
  const options = (table.f.options ?? {}) as Record<string, unknown>;
  options[option] = value;
  table.f.options = options;
}

/** `Table#columnlines=`, with `Utility.table_separator`. */
function setTableColumnlines(table: Draft, value: string): void {
  if (value === "") return;
  const separators = value.split(/[\t\n\v\f\r ]+/).filter((part) => part !== "");
  if (separators.every((part) => part.includes("none"))) return;
  const separator = newTd([newSymbolOfClass("Paren::Vert")]);
  separators.forEach((sep, index) => {
    if (sep !== "solid") return;
    for (const row of table.f.value as unknown[]) {
      const cells = recv(row, "parameter_one").f.parameter_one;
      if (!Array.isArray(cells)) noMethod("insert", cells);
      rubyInsert(cells, index + 1, separator);
      const nil = cells.indexOf(null);
      if (nil >= 0) cells[nil] = newTd([]);
    }
  });
  setTableOption(table, "columnlines", value);
}

/** Ruby `Array#insert`: past the end pads with nil. */
function rubyInsert(values: unknown[], index: number, item: unknown): void {
  while (values.length < index) values.push(null);
  values.splice(index, 0, item);
}

function mpaddedToMpadded(node: MmlNode): Draft {
  const options: Record<string, unknown> = {};
  for (const name of ["height", "depth", "width"]) {
    const value = attr(node, name);
    if (value !== null) options[name] = value;
  }
  const o = unary("Mpadded", wrapChildren(children(node)));
  return withOptionsUnlessEmpty(o, options);
}

function mmultiscriptsToMultiscript(node: MmlNode): Draft {
  const list = orderedChildren(node);
  if (list.length === 0) return ternary("Multiscript");
  const base = convertMultiscriptChild(list[0]);
  const elementOrder = node.children.filter((child): child is MmlNode => !isText(child));
  const preIndex = elementOrder.findIndex((child) => child.kind === "Mprescripts");
  if (preIndex >= 0) {
    const postCount = preIndex - 1;
    const pre = list
      .slice(postCount + 1)
      .filter((child) => isText(child) || child.kind !== "Mprescripts");
    const post = convertMultiscriptChildren(list.slice(1, postCount + 1));
    const [postSubs, postSups] = splitScriptPairs(post, false);
    const [preSubs, preSups] = splitScriptPairs(convertMultiscriptChildren(pre), true);
    return ternary("Multiscript", attachPostscripts(base, postSubs, postSups), preSubs, preSups);
  }
  const [subs, sups] = splitScriptPairs(convertMultiscriptChildren(list.slice(1)), true);
  return ternary("Multiscript", attachPostscripts(base, subs, sups));
}

function semanticsToSemantics(node: MmlNode): Draft {
  const content = filterChild(wrapChildren(children(node)));
  const nodes = node.children.filter((child): child is MmlNode => !isText(child));
  const annotations = [
    ...buildAnnotationEntries(
      nodes.filter((child) => child.kind === "Annotation"),
      "annotation",
    ),
    ...buildAnnotationEntries(
      nodes.filter((child) => child.kind === "AnnotationXml"),
      "annotation-xml",
    ),
  ];
  return binary("Semantics", content, annotations.length === 0 ? null : annotations);
}

function extractMsText(node: MmlChild): string | null {
  if (isText(node)) return node === "" ? null : node;
  if (["Mi", "Mn", "Mo", "Ms", "Mtext"].includes(node.kind)) return textValue(node.value) ?? "";
  if (node.children.length > 0 || node.value === undefined) {
    return orderedChildren(node)
      .map(extractMsText)
      .filter((text): text is string => text !== null)
      .join(" ");
  }
  return textValue(node.value);
}

function msToMs(node: MmlNode): Draft {
  const text = orderedChildren(node)
    .map(extractMsText)
    .filter((part): part is string => part !== null)
    .join(" ");
  return unary("Ms", text === "" ? null : text);
}

/* =========================================================================
 * 7. Finalization
 * ---------------------------------------------------------------------- */

const CARRIERS: ReadonlyMap<string, readonly [string, string]> = new Map(
  MATHML_CARRIERS.map(([cls, carrier, disposition]) => [cls, [carrier, disposition]] as const),
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
  if (entry === undefined) throw new Error(`mathml translator: no carrier for ${cls}`);
  const [carrier, disposition] = entry;
  if (disposition === "deferred") throw new MathmlTranslateError(`${cls} is deferred`);
  const kind = KIND_BY_CARRIER.get(carrier);
  if (kind === undefined) throw new Error(`mathml translator: carrier ${carrier} has no node kind`);
  if (carrier === cls) return { kind };
  const identity = NODE_SPECS[kind].identity;
  if (identity === undefined) throw new Error(`mathml translator: ${carrier} has no identity slot`);
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

function toNode(o: Draft): MathNode {
  const { kind, identity } = carrierOf(o.cls);
  const spec = NODE_SPECS[kind];
  const names = new Map(spec.fields);
  const init: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(o.f)) {
    const tsField = names.get(field);
    if (tsField === undefined) throw new Error(`mathml translator: ${o.cls} has no field ${field}`);
    init[tsField] = finalizeValue(value);
  }
  if (identity !== undefined && spec.identity !== undefined) init[spec.identity.field] = identity;
  return new MATHML_NODE_CONSTRUCTORS[kind](init);
}

/** `Translator#mml_to_plurimath(Mml.parse(text))` and `formula.input_string = text`. */
export function translateMml(root: MmlNode, inputString: string): FormulaNode {
  const formula = translate(root);
  if (formula === null || formula.cls !== FORMULA) {
    throw new Error("mathml translator: the root did not translate to a Formula");
  }
  formula.f.input_string = inputString;
  return toNode(formula) as FormulaNode;
}
