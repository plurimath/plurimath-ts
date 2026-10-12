/** biome-ignore-all lint/style/useNamingConvention: draft fields are the Ruby
 * ivar names (`parameter_one`), which `NODE_SPECS` maps to the core model's
 * fields; renaming them would break that lookup. */
/**
 * `Plurimath::Omml::Translator` (lib/plurimath/omml/translator.rb), with the
 * `Omml::FormulaTransformation` module it includes and `Omml::Utility`
 * (lib/plurimath/omml/formula_transformation.rb, utility.rb).
 *
 * It builds the gem's objects as `Draft`s (`./draft.ts`) and finishes them
 * into the core model. Everything the gem resolves at runtime through Ruby
 * (symbol classes, `get_class`, class facts, `FONT_STYLES`, `SUPPORTED_FONTS`)
 * comes from `./generated/input-tables.ts`.
 *
 * The gem dispatches on the omml gem's model classes; this dispatches on the
 * element the class maps (`CTR` is `m:r`, `CTRPR` is `m:rPr`, `CTRPr` is
 * `w:rPr`, `CTOMathArg` is any argument element such as `m:e` or `m:sub`).
 *
 * Gem bugs are ported as they behave, and logged in TODO.plan: a Ruby
 * `NoMethodError` or `NameError` here is an `OmmlTranslateError`.
 */

import type { FormulaNode } from "../../core/index";
import {
  ATTRIBUTE_SETTERS,
  binary,
  binaryClass,
  className,
  contextualAccentFromToken,
  type Draft,
  deleteAt,
  FORMULA,
  FUNCTION,
  familyOf,
  formulaValue,
  functionFromToken,
  is,
  isFormula,
  isObj,
  newFormula,
  newLinebreak,
  newNary,
  newNumber,
  newSymbol,
  newSymbolOfClass,
  newTable,
  newTd,
  newText,
  newTr,
  OmmlTranslateError,
  rubyStrip,
  stringToHtmlEntity,
  ternary,
  toNode,
  truthy,
  unary,
} from "./draft";
import {
  OMML_FONT_STYLES,
  OMML_POWER_BASE_NAMES,
  OMML_SCRIPT_CLASSES,
  OMML_SUB_SUP_CLASSES,
  OMML_SUPPORTED_FONTS,
  OMML_SYMBOL_CLASS_INPUT,
} from "./generated/input-tables";
import type { OmmlNode } from "./omml-input";

const FONT_STYLE = "Math::Function::FontStyle";

/** A `Utility::FONT_STYLES` class, as a run's properties return it (a Ruby class). */
class FontClass {
  constructor(readonly cls: string) {}
}

type Value = Draft | null;
type RunValue = Draft | FontClass;

function noMethod(method: string): never {
  throw new OmmlTranslateError(`OMML input reaches a gem error (${method})`);
}

const SUB_SUP_CLASSES: ReadonlySet<string> = new Set(OMML_SUB_SUP_CLASSES);
const POWER_BASE_NAMES: ReadonlySet<string> = new Set(OMML_POWER_BASE_NAMES);
const SCRIPT_CLASSES: ReadonlyMap<string, string | null> = new Map(OMML_SCRIPT_CLASSES);

/* =========================================================================
 * 1. The element tree
 * ---------------------------------------------------------------------- */

/** The elements of `EG_OMathMathElements`: what an argument or `oMath` holds. */
const MATH_ELEMENTS: ReadonlySet<string> = new Set(
  [
    "acc",
    "bar",
    "box",
    "borderBox",
    "d",
    "eqArr",
    "f",
    "func",
    "groupChr",
    "limLow",
    "limUpp",
    "m",
    "nary",
    "phant",
    "rad",
    "sPre",
    "sSub",
    "sSubSup",
    "sSup",
    "r",
  ].map((name) => `m:${name}`),
);

/** A named child's first occurrence (the gem's accessor reads the first). */
function child(node: OmmlNode | null | undefined, kind: string): OmmlNode | null {
  return node?.children.find((item) => item.kind === kind) ?? null;
}

function childrenOf(node: OmmlNode, kind: string): OmmlNode[] {
  return node.children.filter((item) => item.kind === kind);
}

/** `first_omml_child(prop)&.val`: the property's `m:val`, null when absent. */
function val(node: OmmlNode | null): string | null {
  return node?.attributes.get("m:val") ?? null;
}

/* =========================================================================
 * 2. `Utility` and `Omml::Utility`
 * ---------------------------------------------------------------------- */

/** `Utility.symbols_class(string, lang: :omml)`. */
function symbolsClass(text: string): Draft {
  const id = OMML_SYMBOL_CLASS_INPUT.get(rubyStrip(text));
  return id === undefined ? newSymbol(text) : newSymbolOfClass(id);
}

/** `Omml::Utility.resolve_symbol_token`. */
function resolveSymbolToken(value: string): Draft {
  return functionFromToken(value) ?? symbolsClass(stringToHtmlEntity(value));
}

const DIGIT = /\p{Nd}/u;
const LATIN = /[a-zA-Z]/;

/**
 * `text_token`'s `gsub` chain, in its order. Each step runs over the previous
 * step's output, so an entity written literally in the text is decoded as well
 * (`&#x3c;` in the input becomes `<`, and `&#x26;#x3e;` becomes `>`). That is
 * the gem's behaviour, pinned by the `runs` probes in `model-fixtures.json`.
 */
const TEXT_TOKEN_UNESCAPES: readonly (readonly [string, string])[] = [
  ["&#x26;", "&"],
  ["&#x3c;", "<"],
  ["&#x27;", "'"],
  ["&#xa0;", "\u00a0"],
  ["&#x3e;", ">"],
  ["&#xa;", "\n"],
];

/** `Omml::Utility.text_token`. */
function textToken(text: string): Draft {
  const characters = [...text];
  if (characters.filter((character) => DIGIT.test(character)).length === characters.length) {
    return newNumber(text);
  }
  if (LATIN.test(text)) return newText(text);
  let encoded = stringToHtmlEntity(text);
  for (const [entity, character] of TEXT_TOKEN_UNESCAPES) {
    encoded = encoded.replaceAll(entity, character);
  }
  return symbolsClass(encoded);
}

/** `Utility.filter_values(array)`. */
function filterValues(value: unknown): unknown {
  let list: unknown[];
  if (isFormula(value)) list = formulaValue(value as Draft);
  else if (Array.isArray(value)) list = value.flat(Infinity).filter((item) => item != null);
  else return value;
  if (list.length > 1) return newFormula(list);
  return list[0] ?? null;
}

/** `Utility.symbol_object(value, lang: :omml)`. */
function symbolObject(value: string): Draft {
  const mapped =
    value === "ℒ"
      ? "{:"
      : value === "ℛ"
        ? ":}"
        : value === "ᑕ"
          ? "&#x2329;"
          : value === "ᑐ"
            ? "&#x232a;"
            : value;
  return symbolsClass(mapped);
}

const isUnary = (o: unknown): o is Draft => isObj(o) && familyOf(o) === "unary";
const isTernary = (o: unknown): o is Draft => isObj(o) && familyOf(o) === "ternary";

/** `populate_function_classes`: the unary, binary and ternary passes. */
function populateFunctionClasses(row: unknown[]): unknown[] {
  const list = row.filter((item) => item != null);
  // unary_function_classes (no String reaches it from OMML).
  if (list.some(isUnary)) {
    for (let index = 0; index < list.length; index++) {
      const object = list[index];
      if (!isUnary(object) || is(object, "Text")) continue;
      if (truthy(object.f.parameter_one) || list[index + 1] == null) continue;
      if (index !== 0) continue;
      object.f.parameter_one = deleteAt(list, index + 1);
    }
  }
  // binary_function_classes
  for (let index = 0; index < list.length; index++) {
    const object = list[index];
    if (!is(object, "Mod")) continue;
    const mod = object as Draft;
    if (index !== 0) mod.f.parameter_one = deleteAt(list, index - 1);
    mod.f.parameter_two = deleteAt(list, index);
  }
  // ternary_function_classes
  if (list.some(isTernary) && list.length > 1) {
    for (let index = 0; index < list.length; index++) {
      const object = list[index];
      if (!isTernary(object)) continue;
      if (is(object, "Fenced") || is(object, "Multiscript")) continue;
      if (!(truthy(object.f.parameter_one) || truthy(object.f.parameter_two))) continue;
      if (truthy(object.f.parameter_three)) continue;
      object.f.parameter_three = filterValues(deleteAt(list, index + 1));
    }
  }
  return list;
}

/** `Core#extract_class_name_from_text` for the classes that override it. */
function extractClassNameFromText(o: Draft): string | null {
  if (o.cls === FORMULA) {
    const list = formulaValue(o);
    return list.length < 2 && is(list[0], "Text")
      ? ((list[0] as Draft).f.parameter_one as string)
      : null;
  }
  if (o.cls.startsWith(FONT_STYLE)) {
    const inner = o.f.parameter_one;
    if (is(inner, "Text")) return (inner as Draft).f.parameter_one as string;
    if (!isObj(inner)) return noMethod("class_name");
    return className(inner);
  }
  return "";
}

/** `Omml::Utility.valid_class`. */
function validClass(o: Draft): boolean {
  const text = extractClassNameFromText(o);
  const extractable = o.cls.startsWith(FONT_STYLE) && is(o.f.parameter_one, "Text");
  return (
    (extractable && text !== null && SUB_SUP_CLASSES.has(text)) ||
    (text !== null && POWER_BASE_NAMES.has(text))
  );
}

/* =========================================================================
 * 3. `FormulaTransformation`
 * ---------------------------------------------------------------------- */

function unwrapSingleChildFormula(value: Value): Value {
  if (value === null || !isFormula(value)) return value;
  const list = formulaValue(value);
  if (list.length === 0) return value;
  return list.length === 1 ? (list[0] as Value) : value;
}

function translatedChildren(node: OmmlNode, accepts: (kind: string) => boolean): Draft[] {
  return node.children
    .filter((item) => accepts(item.kind))
    .map((item) => unwrapSingleChildFormula(translateContent(item)))
    .filter((item): item is Draft => item !== null);
}

/** `omml_text_value`. */
function textValue(raw: string): Value {
  const value = raw.replaceAll("&nbsp;", "\u00a0");
  if (value === "") return newText("");
  if (value === "\u200b") return null;
  return functionFromToken(value) ?? textToken(value);
}

function argument(node: OmmlNode | null): Value {
  return node === null ? null : unwrapSingleChildFormula(translateArgument(node));
}

function argumentValues(node: OmmlNode): unknown[] {
  const value = argument(node);
  if (value !== null && isFormula(value)) return formulaValue(value);
  return value === null ? [] : [value];
}

/** `CTOMathArg`: `wrapped_omml_children`. */
function translateArgument(node: OmmlNode): Value {
  const children = translatedChildren(node, (kind) => MATH_ELEMENTS.has(kind) || kind === "m:t");
  if (children.length === 0) return null;
  if (children.length === 1) return children[0] ?? null;
  return newFormula(children);
}

/* =========================================================================
 * 4. The dispatch (`translate_omml_node`)
 * ---------------------------------------------------------------------- */

function translateContent(node: OmmlNode): Value {
  switch (node.kind) {
    case "m:oMath":
      return translateMath(node);
    case "m:t":
      return textValue(node.text ?? "");
    case "m:r":
      return run(node);
    case "m:f":
      return binary("Frac", argument(child(node, "m:num")), argument(child(node, "m:den")));
    case "m:sSup":
      return binary("Power", argument(child(node, "m:e")), argument(child(node, "m:sup")));
    case "m:sSub":
      return binary("Base", argument(child(node, "m:e")), argument(child(node, "m:sub")));
    case "m:sSubSup":
      return subSup(node);
    case "m:sPre":
      return prescript(node);
    case "m:rad":
      return radical(node);
    case "m:nary":
      return nary(node);
    case "m:d":
      return delimiter(node);
    case "m:eqArr":
      return newTable(
        childrenOf(node, "m:e").map((row) =>
          newTr([newTd(argumentValues(row).filter((item) => item != null))]),
        ),
      );
    case "m:func":
      return filterValues(
        populateFunctionClasses([argument(child(node, "m:fName")), argument(child(node, "m:e"))]),
      ) as Value;
    case "m:limUpp":
      return limit(node, "Overset");
    case "m:limLow":
      return limit(node, "Underset");
    case "m:acc":
      return accent(node);
    case "m:bar": {
      const bar = unary("Bar", argument(child(node, "m:e")));
      bar.f.attributes = { accent: false };
      return bar;
    }
    case "m:borderBox":
      return binary("Menclose", "longdiv", argument(child(node, "m:e")));
    case "m:m":
      return newTable(childrenOf(node, "m:mr").map(matrixRow));
    case "m:groupChr":
      return groupCharacter(node);
    case "m:phant":
    case "m:box":
      return argument(child(node, "m:e"));
    default:
      return null;
  }
}

/** `run_to_plurimath`. */
function run(node: OmmlNode): Value {
  const children: RunValue[] = [];
  for (const item of node.children) {
    let value: RunValue | null = null;
    if (item.kind === "w:br") value = newLinebreak();
    else if (item.kind === "m:t") value = unwrapSingleChildFormula(textValue(item.text ?? ""));
    else if (item.kind === "m:rPr") value = mathRunFont(item);
    else if (item.kind === "w:rPr") value = wordRunFont(item);
    if (value !== null) children.push(value);
  }
  if (children.length === 0) return null;
  const [first] = children;
  if (children.length > 1 && first instanceof FontClass) return styledRun(children);
  // OMML_INPUT_DIFFERENCES: a font class outside a styled run is dropped.
  const content = children.filter((item): item is Draft => !(item instanceof FontClass));
  return filterValues(content) as Value;
}

/** `styled_run_value`. */
function styledRun(children: RunValue[]): Draft {
  const fonts = children.filter((item): item is FontClass => item instanceof FontClass);
  const content = children.filter((item): item is Draft => !(item instanceof FontClass));
  const font = fonts[0] as FontClass;
  return binaryClass(font.cls, filterValues(content), fontStyleKey(font.cls));
}

/** `Utility::FONT_STYLES.key(font).to_s`: the first keyword naming the class. */
function fontStyleKey(cls: string): string {
  for (const [keyword, fontClass] of OMML_FONT_STYLES) if (fontClass === cls) return keyword;
  throw new Error(`omml translator: ${cls} is not a FONT_STYLES class`);
}

function fontClass(keyword: string | undefined): FontClass | null {
  const cls = keyword === undefined ? undefined : OMML_FONT_STYLES.get(keyword);
  return cls === undefined ? null : new FontClass(cls);
}

/** `enabled_omml_property?` on a WordprocessingML on/off property. */
function enabled(property: OmmlNode | null): boolean {
  if (property === null) return false;
  return !["0", "false", "off"].includes(property.attributes.get("w:val") ?? "");
}

/** `word_run_font` (`w:rPr`). */
function wordRunFont(node: OmmlNode): FontClass | null {
  const bold = enabled(child(node, "w:b"));
  const italic = enabled(child(node, "w:i"));
  if (bold && italic) return fontClass("bold-italic");
  if (bold) return fontClass("bold");
  if (italic) return fontClass("italic");
  return null;
}

/** `math_run_font` (`m:rPr`). */
function mathRunFont(node: OmmlNode): FontClass | null {
  const key = [val(child(node, "m:scr")), val(child(node, "m:sty"))]
    .filter((part): part is string => part !== null)
    .join("-");
  if (key === "") return null;
  return fontClass(OMML_SUPPORTED_FONTS.get(key));
}

function subSup(node: OmmlNode): Draft {
  const base = argument(child(node, "m:e"));
  const sub = (): Value => argument(child(node, "m:sub"));
  const sup = (): Value => argument(child(node, "m:sup"));
  if (base !== null && validClass(base)) {
    const name = extractClassNameFromText(base) as string;
    const cls = SCRIPT_CLASSES.get(name);
    if (cls === undefined) throw new Error(`omml translator: script class ${name} not measured`);
    if (cls === null)
      throw new OmmlTranslateError(`OMML input names "${name}", which has no class`);
    return binary(cls.slice(FUNCTION.length), sub(), sup());
  }
  return ternary("PowerBase", base, sub(), sup());
}

function prescript(node: OmmlNode): Draft {
  const sub = argument(child(node, "m:sub"));
  const sup = argument(child(node, "m:sup"));
  return ternary(
    "Multiscript",
    argument(child(node, "m:e")),
    sub === null ? [] : [sub],
    sup === null ? [] : [sup],
  );
}

function radical(node: OmmlNode): Draft {
  const degree = argument(child(node, "m:deg"));
  const radicand = argument(child(node, "m:e"));
  return degree === null ? unary("Sqrt", radicand) : binary("Root", degree, radicand);
}

function nary(node: OmmlNode): Draft {
  const properties = child(node, "m:naryPr");
  const character = properties === null ? null : val(child(properties, "m:chr"));
  const symbol = character === null ? null : resolveSymbolToken(character);
  if (symbol !== null && familyOf(symbol) === "ternary") {
    symbol.f.parameter_one = argument(child(node, "m:sub"));
    symbol.f.parameter_two = argument(child(node, "m:sup"));
    symbol.f.parameter_three = argument(child(node, "m:e"));
    return symbol;
  }
  return newNary(
    symbolsClass(stringToHtmlEntity(character ?? "∫")),
    argument(child(node, "m:sub")),
    argument(child(node, "m:sup")),
    argument(child(node, "m:e")),
    { type: val(child(properties, "m:limLoc")) ?? "subSup" },
  );
}

function delimiterSymbol(value: string | null): Value {
  if (value === null || value === "") return null;
  return symbolObject(stringToHtmlEntity(value));
}

function delimiterBoundary(property: OmmlNode | null, fallback: string): Value {
  return property === null ? delimiterSymbol(fallback) : delimiterSymbol(val(property));
}

function delimiter(node: OmmlNode): Draft {
  const properties = child(node, "m:dPr");
  const open = delimiterBoundary(child(properties, "m:begChr"), "(");
  const close = delimiterBoundary(child(properties, "m:endChr"), ")");
  const children = childrenOf(node, "m:e")
    .flatMap((item) => argumentValues(item))
    .filter((item) => item != null);
  if (children.length === 1 && is(children[0], "Table")) {
    const table = children[0] as Draft;
    table.f.open_paren = open;
    table.f.close_paren = close;
    return table;
  }
  const fenced = ternary("Fenced", open, children, close);
  const separator = child(properties, "m:sepChr");
  fenced.f.options = separator === null ? null : { sepChr: val(separator) };
  return fenced;
}

function limit(node: OmmlNode, name: "Overset" | "Underset"): Draft {
  const base = argument(child(node, "m:e"));
  const lim = argument(child(node, "m:lim"));
  if (isUnary(lim) && !truthy(lim.f.parameter_one)) {
    lim.f.parameter_one = base;
    return lim;
  }
  return binary(name, base, lim);
}

function accent(node: OmmlNode): Draft {
  const character = val(child(child(node, "m:accPr"), "m:chr"));
  const mark =
    character === null
      ? unary("Hat")
      : (contextualAccentFromToken(character) ?? resolveSymbolToken(character));
  const body = argument(child(node, "m:e"));
  if (!isUnary(mark)) {
    const overset = binary("Overset", mark, body);
    overset.f.options = { accent: true };
    return overset;
  }
  if (!truthy(mark.f.parameter_one)) mark.f.parameter_one = body;
  if (!ATTRIBUTE_SETTERS.has(mark.cls)) noMethod("attributes=");
  mark.f.attributes = { accent: true };
  return mark;
}

function matrixRow(row: OmmlNode): Draft {
  return newTr(
    childrenOf(row, "m:e").map((cell) =>
      newTd(argumentValues(cell).filter((item) => item != null)),
    ),
  );
}

function groupCharacter(node: OmmlNode): Draft {
  const properties = child(node, "m:groupChrPr");
  const character = val(child(properties, "m:chr"));
  const value = argument(child(node, "m:e"));
  if (val(child(properties, "m:pos")) === "top") {
    return binary("Overset", newSymbol(character ?? ""), value);
  }
  return binary("Underset", newSymbol(character ?? "⏟"), value);
}

/* =========================================================================
 * 5. The root
 * ---------------------------------------------------------------------- */

const ROOT_CONTENT = (kind: string): boolean => MATH_ELEMENTS.has(kind);

/** `Translator#omml_to_plurimath(Omml.parse(text))` and `formula.input_string = text`. */
export { OmmlTranslateError };

export function translateOmml(root: OmmlNode, inputString: string): FormulaNode {
  let formula: Draft;
  if (root.kind === "m:oMathPara") {
    const children = translatedChildren(
      root,
      (kind) => kind === "m:oMath" || kind === "m:r",
    ).flatMap((item) => (isFormula(item) ? formulaValue(item) : [item]));
    formula = newFormula(children);
  } else {
    formula = newFormula(translatedChildren(root, ROOT_CONTENT));
  }
  formula.f.input_string = inputString;
  return toNode(formula) as FormulaNode;
}

// `m:oMath` inside `m:oMathPara` is `CTOMath`: `formula_from_omml_children`.
function translateMath(node: OmmlNode): Draft {
  return newFormula(translatedChildren(node, ROOT_CONTENT));
}
