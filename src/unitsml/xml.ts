/** biome-ignore-all lint/style/useNamingConvention: raw Unitsdb keys are the pinned database schema. */
import { RenderError } from "../core/index";
import { unitsmlMathml } from "./conversion";
import { type TokenRecord, UNITSML_DATA } from "./data";
import type { Expression } from "./expression";
import {
  type EffectiveUnitsmlOptions,
  multiplierSymbol,
  type UnitsmlRenderOptions,
  unitsmlOptions,
} from "./options";
import { type ParsedUnitsml, parseUnitExpression } from "./parser";

interface Identifier {
  readonly type: string;
  readonly id: string;
}
interface Name {
  readonly lang: string;
  readonly value: string;
}
interface Reference {
  readonly id: string;
}
interface RawUnit {
  readonly identifiers: readonly Identifier[];
  readonly names: readonly Name[];
  readonly symbols: readonly { readonly id: string; readonly html: string }[];
  readonly unit_system_reference: readonly Reference[];
  readonly quantity_references: readonly Reference[];
  readonly si_derived_bases?: readonly {
    readonly unit_reference: Reference;
    readonly prefix_reference?: Reference;
    readonly power?: number;
  }[];
}
interface RawDimension {
  readonly identifiers: readonly Identifier[];
  readonly [key: string]: unknown;
}
interface RawQuantity {
  readonly identifiers: readonly Identifier[];
  readonly names: readonly Name[];
  readonly dimension_reference?: Reference;
}
interface RawPrefix {
  readonly identifiers: readonly Identifier[];
  readonly base: number;
  readonly power: number;
  readonly symbols: readonly { readonly ascii: string }[];
}
interface DimensionTerm {
  readonly name: string;
  readonly unit: string;
  readonly exponent: number;
  readonly symbol: string;
  /** A Ruby Unitsml::Number's default to_s cannot equal a stable DB vector. */
  readonly numberObject?: boolean;
  readonly floatCarrier?: boolean;
}

function fail(message: string): never {
  throw new RenderError(message, "unitsml", "unitsml");
}
function database<T>(file: string, key: string): readonly T[] {
  const value = UNITSML_DATA.database[file];
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray((value as Record<string, unknown>)[key])
  )
    return fail(`UnitsML database ${file} has no ${key} array`);
  return (value as Record<string, unknown>)[key] as readonly T[];
}
const units = () => database<RawUnit>("units.yaml", "units");
const dimensions = () => database<RawDimension>("dimensions.yaml", "dimensions");
const quantities = () => database<RawQuantity>("quantities.yaml", "quantities");
const prefixes = () => database<RawPrefix>("prefixes.yaml", "prefixes");
const nist = (value: { readonly identifiers: readonly Identifier[] }): string | undefined =>
  value.identifiers.find((entry) => entry.type === "nist")?.id;
const english = (value: { readonly names: readonly Name[] }): string | undefined =>
  value.names.find((entry) => entry.lang === "en")?.value;
const findUnit = (symbol: string) =>
  units().find((unit) => unit.symbols.some((entry) => entry.id === symbol));
const findQuantity = (id: string | undefined) =>
  quantities().find((quantity) => quantity.identifiers.some((entry) => entry.id === id));
const dimensionIdOf = (unit: RawUnit | undefined) =>
  findQuantity(unit?.quantity_references[0]?.id)?.dimension_reference?.id;
const numeric = (expression: Expression | null): number =>
  expression === null
    ? 1
    : expression.kind === "fenced"
      ? numeric(expression.value)
      : Number.parseFloat(expression.text);
const rawPower = (expression: Expression): string =>
  expression.kind === "fenced" ? rawPower(expression.value) : expression.text;
const snake = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
const human = (value: string): string =>
  value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
const xmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function tag(
  name: string,
  attributes: Readonly<Record<string, string | number | undefined>>,
  content?: string,
): string {
  const attrs = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${xmlEscape(String(value))}"`)
    .join("");
  return content === undefined || content === ""
    ? `<${name}${attrs}/>`
    : `<${name}${attrs}>${content}</${name}>`;
}
function namespaceAttributes(record: TokenRecord, rootName: string): Record<string, string> {
  const root = record.xml?.match(new RegExp(`<([\\w:]*${rootName})\\b([^>]*)>`));
  if (root === null || root === undefined)
    return fail(`UnitsML ${rootName} namespace template is missing`);
  const result: Record<string, string> = {};
  for (const match of (root[2] as string).matchAll(/(xmlns(?::\w+)?)="([^"]*)"/g))
    result[match[1] as string] = match[2] as string;
  return result;
}
function collect(values: readonly Expression[], kind: "unit" | "dimension"): Expression[] {
  return values.flatMap((value) => {
    if (value.kind === kind) return [value];
    if (value.kind === "formula" || value.kind === "fenced") return collect(value.values, kind);
    if (value.kind === "sqrt")
      return value.value.kind === kind
        ? [value.value]
        : kind === "dimension" && value.value.kind === "fenced"
          ? collect(value.value.values, kind)
          : [];
    return [];
  });
}

/** Unitsml::Formula#to_xml metadata, generated token XML is the byte template. */
export function unitsmlXml(text: string, options?: UnitsmlRenderOptions | null): string {
  const parsed = parseUnitExpression(text);
  try {
    const effective = unitsmlOptions(options, parsed.extras);
    const allDims = collect(parsed.values, "dimension");
    if (allDims.length > 0) return explicitDimensions(allDims);
    if (parsed.original.endsWith("-")) return prefixXml(parsed, effective);
    return unitXml(parsed, effective);
  } catch (error) {
    if (error instanceof RenderError) throw error;
    return fail(error instanceof Error ? error.message : "UnitsML metadata rendering failed");
  }
}

function explicitDimensions(values: readonly Expression[]): string {
  const rules = UNITSML_DATA.utility?.dim2d;
  if (rules === undefined) return fail("UnitsML dimension rule data is absent");
  const sorted = [...values].sort(
    (left, right) => (rules[left.text]?.order ?? 0) - (rules[right.text]?.order ?? 0),
  );
  const first = UNITSML_DATA.dimensions[sorted[0]?.text ?? ""];
  if (first === undefined) return fail("UnitsML dimension XML template is missing");
  const id = `D_${sorted.map((dimension) => `${dimension.text.split("_").at(-1)}${dimension.exponent === null ? "" : rawPower(dimension.exponent)}`).join("")}`;
  const fields = new Map<string, string>();
  for (const dimension of sorted) {
    const rule = rules[dimension.text];
    if (rule === undefined) return fail(`UnitsML dimension rule ${dimension.text} is missing`);
    fields.set(
      rule.dimension,
      tag(rule.dimension, {
        symbol: rule.symbol,
        powerNumerator: dimension.exponent === null ? "1" : rawPower(dimension.exponent),
      }),
    );
  }
  return tag(
    "Dimension",
    { ...namespaceAttributes(first, "Dimension"), "xml:id": id },
    [...fields.values()].join(""),
  );
}

function prefixXml(parsed: ParsedUnitsml, _options: EffectiveUnitsmlOptions): string {
  const name = parsed.normalized.split("-")[0] ?? "";
  const record = UNITSML_DATA.prefixes[name];
  if (record?.xmlError !== undefined)
    return fail(`${record.xmlError.class}: ${record.xmlError.message}`);
  if (record?.xml === undefined) return fail(`UnitsML prefix XML template is missing for ${name}`);
  const prefix = record.xml.match(/<(?:\w+:)?Prefix\b[^>]*>[\s\S]*?<\/(?:\w+:)?Prefix>/)?.[0];
  if (prefix === undefined) return fail(`UnitsML prefix XML is missing for ${name}`);
  const unit = findUnit(name);
  return prefix + dimensionXml(dimensionIdOf(unit)) + quantityXml(unit, parsed.extras.quantity);
}

function unitXml(parsed: ParsedUnitsml, options: EffectiveUnitsmlOptions): string {
  const all = collect(parsed.values, "unit");
  const first =
    UNITSML_DATA.units[all[0]?.text ?? ""] ??
    UNITSML_DATA.special?.[all[0]?.text ?? ""] ??
    Object.values(UNITSML_DATA.units).find((entry) => entry.xml !== undefined);
  if (first === undefined) return fail("UnitsML XML root template is absent");
  const normalized = all
    .map(
      (unit) =>
        `${unit.prefix?.text ?? ""}${unit.text}${unit.exponent === null || rawPower(unit.exponent) === "1" ? "" : `^${rawPower(unit.exponent)}`}`,
    )
    .join("*");
  const whole = findUnit(normalized);
  const id = `U_${whole === undefined ? normalized.replace(/[()*^]/g, (char) => (char === "*" ? "." : "")) : (nist(whole) ?? normalized).replaceAll("'", "_")}`;
  const terms = decomposedDimensions(all);
  const dimId = terms === null ? undefined : dimensionId(terms);
  const body =
    unitSystems(all) +
    tag(
      "UnitName",
      { "xml:lang": "en" },
      xmlEscape(
        parsed.extras.name ?? (whole === undefined ? undefined : english(whole)) ?? normalized,
      ),
    ) +
    tag("UnitSymbol", { type: "HTML" }, unitHtml(parsed.values, options)) +
    tag("UnitSymbol", { type: "MathMl" }, unitsmlMathml(parsed.original, options)) +
    rootUnits(all);
  const unit = tag(
    "Unit",
    {
      ...namespaceAttributes(first, "Unit"),
      dimensionURL: terms === null ? undefined : `#${dimId ?? ""}`,
      "xml:id": id,
    },
    body,
  );
  const usedPrefixes = [
    ...new Set(all.flatMap((value) => (value.prefix === null ? [] : [value.prefix.text]))),
  ];
  const prefix = usedPrefixes
    .map((name) => {
      const xml = UNITSML_DATA.prefixes[name]?.xml;
      const match = xml?.match(/<(?:\w+:)?Prefix\b[^>]*>[\s\S]*?<\/(?:\w+:)?Prefix>/);
      if (match === undefined || match === null)
        return fail(`UnitsML prefix XML template is missing for ${name}`);
      return match[0];
    })
    .join("\n");
  const originalDimension = dimensionXml(dimensionIdOf(whole));
  const derivedDimension = terms === null || terms.length === 0 ? "" : dimensionXml(dimId, terms);
  const dims = [...new Set([originalDimension, derivedDimension])].join("");
  return `${unit}${prefix}${dims}${quantityXml(whole, parsed.extras.quantity)}`
    .replaceAll("−", "&#x2212;")
    .replaceAll("⋅", "&#x22c5;");
}

function unitSystems(all: readonly Expression[]): string {
  const systems = all.map((expression) => {
    const unit = findUnit(expression.text);
    if (unit === undefined) return fail(`UnitsML unit metadata is missing for ${expression.text}`);
    return snake(unit.unit_system_reference[0]?.id ?? "");
  });
  const si = (system: string) =>
    system === "si_base" || system === "si_derived_special" || system === "si_derived_non_special";
  let result = systems.some((system) => !si(system))
    ? tag("UnitSystem", { name: "not_SI", type: "not_SI", "xml:lang": "en" })
    : "";
  if (systems.some(si))
    result += tag("UnitSystem", {
      name: "SI",
      type:
        all.length === 1 &&
        (systems[0] === "si_base" || (all[0]?.text === "g" && all[0]?.prefix?.text === "k"))
          ? "SI_base"
          : "SI_derived",
      "xml:lang": "en",
    });
  return result;
}
function rootUnits(all: readonly Expression[]): string {
  if (all.length === 1 && all[0]?.prefix === null) return "";
  return tag(
    "RootUnits",
    {},
    all
      .map((expression) => {
        const unit = findUnit(expression.text);
        if (unit === undefined) return fail(`UnitsML root unit ${expression.text} is absent`);
        return tag("EnumeratedRootUnit", {
          unit: english(unit),
          prefix: expression.prefix?.text,
          powerNumerator: expression.exponent === null ? undefined : rawPower(expression.exponent),
        });
      })
      .join(""),
  );
}

function decomposedDimensions(all: readonly Expression[]): readonly DimensionTerm[] | null {
  const rules = UNITSML_DATA.utility?.u2d;
  if (rules === undefined) return fail("UnitsML unit-to-dimension rule data is absent");
  const expanded: {
    unit: string;
    exponent: number;
    prefix: string | null;
    numberObject: boolean;
    floatCarrier: boolean;
  }[] = [];
  for (const expression of all) {
    const unit = findUnit(expression.text);
    if (unit === undefined) return null;
    if (expression.text === "g" || snake(unit.unit_system_reference[0]?.id ?? "") === "si_base")
      expanded.push({
        unit: expression.text,
        exponent: numeric(expression.exponent),
        prefix: expression.prefix?.text ?? null,
        numberObject: expression.exponent !== null,
        floatCarrier: false,
      });
    else if (unit.si_derived_bases === undefined || unit.si_derived_bases.length === 0) return null;
    else
      for (const base of unit.si_derived_bases) {
        const root = units().find((candidate) =>
          candidate.identifiers.some((entry) => entry.id === base.unit_reference.id),
        );
        if (root?.symbols[0] === undefined) return null;
        const prefix =
          base.prefix_reference === undefined
            ? (expression.prefix?.text ?? null)
            : combinePrefixes(base.prefix_reference.id, expression.prefix?.text ?? null);
        if (prefix === "unknown") return null;
        expanded.push({
          unit: root.symbols[0].id,
          exponent: (base.power ?? 1) * numeric(expression.exponent),
          prefix,
          numberObject: false,
          floatCarrier: expression.exponent !== null,
        });
      }
  }
  expanded.sort((left, right) => (left.unit < right.unit ? -1 : left.unit > right.unit ? 1 : 0));
  const gathered = new Map<
    string,
    { exponent: number; prefix: string | null; numberObject: boolean; floatCarrier: boolean }
  >();
  for (const entry of expanded) {
    const old = gathered.get(entry.unit);
    const prefix = old === undefined ? entry.prefix : combinePrefixes(old.prefix, entry.prefix);
    if (prefix === "unknown") return null;
    gathered.set(entry.unit, {
      exponent: entry.exponent + (old?.exponent ?? 0),
      prefix,
      numberObject: old !== undefined || entry.numberObject,
      floatCarrier: entry.floatCarrier,
    });
  }
  return [...gathered]
    .map(([unit, value]) => {
      const rule = rules[unit];
      if (rule === undefined) return fail(`UnitsML dimension for base unit ${unit} is absent`);
      return {
        name: rule.dimension,
        unit,
        exponent: value.exponent,
        symbol: rule.symbol,
        numberObject: value.numberObject,
        floatCarrier: value.floatCarrier,
      };
    })
    .sort((left, right) => (rules[left.unit]?.order ?? 0) - (rules[right.unit]?.order ?? 0));
}
function combinePrefixes(first: string | null, second: string | null): string | null {
  if (first === null) return second;
  if (second === null) return first;
  const find = (name: string) =>
    prefixes().find(
      (prefix) =>
        prefix.identifiers.some((entry) => entry.id === name) ||
        prefix.symbols.some((entry) => entry.ascii === name),
    );
  const left = find(first);
  const right = find(second);
  if (left === undefined || right === undefined || left.base !== right.base) return "unknown";
  return (
    prefixes().find(
      (prefix) => prefix.base === left.base && prefix.power === left.power + right.power,
    )?.symbols[0]?.ascii ?? "unknown"
  );
}
function dimensionId(terms: readonly DimensionTerm[]): string | undefined {
  if (terms.length === 0) return undefined;
  const vector = UNITSML_DATA.utility?.dimsVector;
  if (vector === undefined) return fail("UnitsML dimension vector ordering is absent");
  const spelling = vector
    .map((name) => {
      const term = terms.filter((candidate) => candidate.name === name).at(-1);
      if (term === undefined) return "";
      return term.floatCarrier && Number.isInteger(term.exponent)
        ? `${term.exponent}.0`
        : String(term.exponent);
    })
    .join(":");
  // dim_id joins the exponent objects themselves. Number has Object#to_s,
  // whose transient address cannot equal any generated database vector.
  const found = terms.some((term) => term.numberObject)
    ? undefined
    : UNITSML_DATA.dimensionVectors?.find((dimension) => dimension.vector === spelling);
  return found === undefined
    ? `D_${terms.map((term) => `${term.symbol}${(term.numberObject ? Math.trunc(term.exponent) : term.exponent) === 1 ? "" : displayFloat(term.exponent)}`).join("")}`
    : found.id;
}
function displayFloat(value: number): string {
  return String((Math.sign(value) * Math.round(Math.abs(value) * 10)) / 10);
}
function dimensionXml(id: string | undefined, terms?: readonly DimensionTerm[]): string {
  if (id === undefined) return "";
  const data =
    terms ??
    (() => {
      const dimension = dimensions().find((entry) => nist(entry) === id);
      return dimension === undefined
        ? []
        : Object.entries(dimension).flatMap(([key, value]) => {
            if (
              value === null ||
              typeof value !== "object" ||
              !("power" in value) ||
              !("symbol" in value)
            )
              return [];
            return [
              {
                name: human(key),
                unit: "",
                exponent: Number(value.power),
                symbol: String(value.symbol),
              },
            ];
          });
    })();
  const template = Object.values(UNITSML_DATA.dimensions).find(
    (record) => record.xml !== undefined,
  );
  if (template === undefined) return fail("UnitsML Dimension XML namespace template is absent");
  const order = Object.values(UNITSML_DATA.utility?.u2d ?? {});
  const ordered = [...new Map(data.map((term) => [term.name, term])).values()].sort(
    (left, right) =>
      (order.find((item) => item.dimension === left.name)?.order ?? 0) -
      (order.find((item) => item.dimension === right.name)?.order ?? 0),
  );
  return tag(
    "Dimension",
    { ...namespaceAttributes(template, "Dimension"), "xml:id": id },
    ordered
      .map((term) =>
        tag(term.name, { symbol: term.symbol, powerNumerator: displayFloat(term.exponent) }),
      )
      .join(""),
  );
}
function quantityXml(unit: RawUnit | undefined, override: string | undefined): string {
  if (
    !(
      (unit !== undefined && unit.quantity_references.length === 1) ||
      findQuantity(override) !== undefined
    )
  )
    return "";
  const id = override ?? unit?.quantity_references[0]?.id;
  const quantity = findQuantity(id);
  if (quantity === undefined || id === undefined) return "";
  const template = Object.values(UNITSML_DATA.units).find(
    (record) => record.xml?.includes("<Quantity") === true,
  );
  if (template === undefined) return fail("UnitsML Quantity XML namespace template is absent");
  return tag(
    "Quantity",
    {
      ...namespaceAttributes(template, "Quantity"),
      "xml:id": id,
      quantityType: "base",
      dimensionURL: `#${dimensionIdOf(unit) ?? ""}`,
    },
    quantity.names
      .filter((name) => name.lang === "en")
      .map((name) => tag("QuantityName", { "xml:lang": "en" }, xmlEscape(name.value)))
      .join(""),
  );
}

function unitHtml(values: readonly Expression[], options: EffectiveUnitsmlOptions): string {
  return values
    .map((value) => {
      switch (value.kind) {
        case "formula":
          return unitHtml(value.values, options);
        case "sqrt":
          return unitHtml(value.values, options);
        case "fenced":
          return options.explicitParenthesis
            ? `(${unitHtml(value.values, options)})`
            : unitHtml(value.values, options);
        case "number":
          return value.text.replace("-", "&#x2212;");
        case "extender":
          return multiplierSymbol(options.multiplier) === "space"
            ? "&#xa0;"
            : multiplierSymbol(options.multiplier) === "nospace"
              ? "&#x2062;"
              : typeof options.multiplier === "symbol"
                ? fail("UnitsML cannot encode this multiplier Symbol as HTML")
                : (options.multiplier ?? "⋅");
        case "unit": {
          const unit = findUnit(value.text);
          if (unit === undefined) return fail(`UnitsML unit HTML ${value.text} is absent`);
          const symbol = unit.symbols.find((entry) => entry.id === value.text)?.html;
          if (symbol === undefined) return fail(`UnitsML HTML symbol ${value.text} is absent`);
          const prefix = value.prefix === null ? "" : prefixHtml(value.prefix.text);
          return `${prefix}${symbol}${value.exponent === null ? "" : `<sup>${unitHtml([value.exponent], options)}</sup>`}`;
        }
        case "prefix":
          return prefixHtml(value.text);
        case "dimension":
        case "untransformed":
          return fail("UnitsML expression has no unit HTML representation");
      }
      return fail("UnitsML expression has an unknown HTML representation");
    })
    .join("");
}
function prefixHtml(name: string): string {
  const record = UNITSML_DATA.prefixes[name];
  const html = record?.xml?.match(
    /<PrefixSymbol\b[^>]*type="HTML"[^>]*>([\s\S]*?)<\/PrefixSymbol>/,
  )?.[1];
  if (html === undefined) return fail(`UnitsML prefix HTML template ${name} is absent`);
  return html;
}
