import {
  BinaryFunctionNode,
  FencedNode,
  FormulaNode,
  type MathNode,
  NumberNode,
  RenderError,
  SymbolNode,
} from "../core/index";
import { htmlEntityToUnicode } from "../core/nodes";
import { type TokenRecord, UNITSML_DATA } from "./data";
import type { Expression } from "./expression";
import { hydrateModel } from "./model";
import {
  type EffectiveUnitsmlOptions,
  multiplierSymbol,
  type UnitsmlRenderOptions,
  unitsmlOptions,
} from "./options";
import { type ParsedUnitsml, parseUnitExpression } from "./parser";

function failure(message: string): never {
  throw new RenderError(message, "unitsml", "unitsml");
}
function record(expression: Expression): TokenRecord {
  const family =
    expression.kind === "dimension"
      ? UNITSML_DATA.dimensions
      : expression.kind === "prefix"
        ? UNITSML_DATA.prefixes
        : UNITSML_DATA.units;
  const result = family[expression.text] ?? UNITSML_DATA.special?.[expression.text];
  if (result === undefined) return failure(`UnitsML token data is missing for ${expression.text}`);
  return result;
}
function output(value: TokenRecord, key: "mathml" | "ascii" | "xml"): string {
  const error = value[`${key}Error`];
  if (error !== undefined) return failure(`${error.class}: ${error.message}`);
  const result = value[key];
  if (result === undefined)
    return failure(`UnitsML ${key} reference data is absent for ${value.input}`);
  return result;
}
function body(mathml: string): string {
  const matched = mathml.match(/<math\b[^>]*>([\s\S]*)<\/math>\s*$/);
  if (matched === null) return failure("UnitsML MathML data has no math root");
  return (matched[1] as string).replace(/>\s+</g, "><").replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
}
function nodes(value: TokenRecord): readonly MathNode[] {
  if (value.modelError !== undefined)
    return failure(`${value.modelError.class}: ${value.modelError.message}`);
  if (value.model === undefined)
    return failure(`UnitsML native template is absent for ${value.input}`);
  const result = hydrateModel(value.model);
  return result.kind === "formula" ? (result.value as readonly MathNode[]) : [result];
}
function child(values: readonly MathNode[]): MathNode {
  return values.length === 1 ? (values[0] as MathNode) : new FormulaNode({ value: values });
}

function prefixed(expression: Expression): TokenRecord | undefined {
  return expression.prefix === null
    ? undefined
    : UNITSML_DATA.prefixedUnits[`${expression.prefix.text}\0${expression.text}`];
}

/** Produces the same native formula the gem obtains by reparsing unit MathML. */
export function expandUnitsml(text: string, options?: UnitsmlRenderOptions | null): FormulaNode {
  const parsed = parseUnitExpression(text);
  const effective = unitsmlOptions(options, parsed.extras);
  const value = parsed.values.flatMap((expression) => native(expression, effective));
  return new FormulaNode({
    value,
    inputString: parsed.original.endsWith("-")
      ? unitsmlAsciimath(text, options)
      : unitsmlMathmlParsed(parsed, effective),
  });
}

function native(expression: Expression, options: EffectiveUnitsmlOptions): readonly MathNode[] {
  switch (expression.kind) {
    case "untransformed":
      return failure("UnitsML reference transform left a hash without a rendering method");
    case "formula":
      return expression.values.flatMap((value) => native(value, options));
    case "sqrt":
      return native(expression.value, options);
    case "fenced": {
      const values = native(expression.value, options);
      if (!options.explicitParenthesis) return values;
      return [
        new FencedNode({
          parameterOne: new SymbolNode({ id: "Paren::Lround" }),
          parameterTwo: values,
          parameterThree: new SymbolNode({ id: "Paren::Rround" }),
          options: {},
        }),
      ];
    }
    case "number": {
      const value = new NumberNode({
        value: expression.text.startsWith("-") ? expression.text.slice(1) : expression.text,
      });
      return expression.text.startsWith("-") ? [new SymbolNode({ id: "Minus" }), value] : [value];
    }
    case "extender": {
      const multiplier = options.multiplier ?? "⋅";
      const sentinel = multiplierSymbol(multiplier);
      const token =
        sentinel !== undefined
          ? "⁢"
          : typeof multiplier === "string"
            ? multiplier
            : failure("UnitsML cannot encode this multiplier Symbol as MathML");
      const resolved = UNITSML_DATA.resolvedTokens?.[token];
      // The export covers every recognized symbol/function spelling; the
      // reference's remaining branch constructs a bare encoded Symbol.
      const symbol =
        token === ""
          ? new SymbolNode({ value: null })
          : resolved === undefined
            ? new SymbolNode({ value: encodeToken(token) })
            : hydrateModel(resolved);
      return [
        sentinel === "space" && symbol.kind === "symbol"
          ? { ...symbol, options: { ...symbol.options, rspace: "thickmathspace" } }
          : symbol,
      ];
    }
    case "prefix":
      return nodes(record(expression));
    case "unit":
    case "dimension": {
      let value = prefixed(expression);
      let base: readonly MathNode[];
      if (value !== undefined) base = nodes(value);
      else {
        value = record(expression);
        base = nodes(value);
        if (expression.prefix !== null) base = prefixModel(base, expression);
      }
      if (expression.exponent === null) return base;
      return [
        new BinaryFunctionNode({
          name: "Power",
          parameterOne: child(base),
          parameterTwo: child(native(expression.exponent, options)),
        }),
      ];
    }
  }
}

function prefixModel(base: readonly MathNode[], expression: Expression): readonly MathNode[] {
  const xml = body(output(record(expression), "mathml"));
  const plain = xml.match(/^<(mi|mo|mn|mtext)\b[^>]*>([^<]*)<\/\1>$/);
  if (plain === null || expression.prefix === null)
    return failure(
      `UnitsML prefixing of composite token ${expression.text} has no measured template`,
    );
  const prefix = body(output(record(expression.prefix), "mathml")).replace(
    /^<mi\b[^>]*>|<\/mi>$/g,
    "",
  );
  const token = htmlEntityToUnicode(`${prefix}${plain[2]}`);
  const model = UNITSML_DATA.resolvedTokens?.[token];
  const replacement =
    model === undefined ? new SymbolNode({ value: encodeToken(token) }) : hydrateModel(model);
  return base.map((node) =>
    node.kind === "fontStyle" ? { ...node, parameterOne: replacement } : replacement,
  );
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
/** The dependency's HTMLEntities :hexadecimal encoder. */
function encodeToken(value: string): string {
  return value.replace(
    /[<>'"&]|[^ -~]/gu,
    (character) => `&#x${character.codePointAt(0)?.toString(16)};`,
  );
}
function mathml(expression: Expression, options: EffectiveUnitsmlOptions): string {
  switch (expression.kind) {
    case "untransformed":
      return failure("UnitsML reference transform left a hash without a rendering method");
    case "formula":
      return expression.values.map((value) => mathml(value, options)).join("");
    case "sqrt":
      return mathml(expression.value, options);
    case "fenced": {
      const value = mathml(expression.value, options);
      return options.explicitParenthesis ? `<mrow><mo>(</mo>${value}<mo>)</mo></mrow>` : value;
    }
    case "number":
      return expression.text.startsWith("-")
        ? `<mrow><mo>&#x2212;</mo><mn>${escapeText(expression.text.slice(1))}</mn></mrow>`
        : `<mn>${escapeText(expression.text)}</mn>`;
    case "extender": {
      const value = options.multiplier ?? "⋅";
      const sentinel = multiplierSymbol(value);
      const token =
        sentinel !== undefined
          ? "&#x2062;"
          : typeof value === "string"
            ? encodeToken(value)
            : failure("UnitsML cannot encode this multiplier Symbol as MathML");
      return `<mo${sentinel === "space" ? ' rspace="thickmathspace"' : ""}>${token}</mo>`;
    }
    case "prefix":
      return body(output(record(expression), "mathml"));
    case "unit":
    case "dimension": {
      const measured = prefixed(expression);
      let value = body(output(measured ?? record(expression), "mathml"));
      if (measured === undefined && expression.prefix !== null) {
        const prefix = body(output(record(expression.prefix), "mathml")).replace(
          /^<mi\b[^>]*>|<\/mi>$/g,
          "",
        );
        value = value.replace(/^(<\w+\b[^>]*>)/, `$1${prefix}`);
      }
      return expression.exponent === null
        ? value
        : `<msup>${expression.kind === "dimension" ? `<mrow>${value}</mrow>` : value}${mathml(expression.exponent, options)}</msup>`;
    }
  }
}
function unitsmlMathmlParsed(parsed: ParsedUnitsml, options: EffectiveUnitsmlOptions): string {
  // The root attributes and namespace are taken from an actual token export.
  const first = Object.values(UNITSML_DATA.units).find((value) => value.mathml !== undefined);
  if (first?.mathml === undefined) return failure("UnitsML MathML root template is missing");
  const root = first.mathml.match(/<math\b[^>]*>/)?.[0];
  if (root === undefined) return failure("UnitsML MathML root template has no opening tag");
  return `${root}${parsed.values.map((expression) => mathml(expression, options)).join("")}</math>`;
}
export function unitsmlMathml(text: string, options?: UnitsmlRenderOptions | null): string {
  const parsed = parseUnitExpression(text);
  return unitsmlMathmlParsed(parsed, unitsmlOptions(options, parsed.extras));
}
export function unitsmlAsciimath(text: string, options?: UnitsmlRenderOptions | null): string {
  const parsed = parseUnitExpression(text);
  const effective = unitsmlOptions(options, parsed.extras);
  const render = (expression: Expression): string => {
    switch (expression.kind) {
      case "untransformed":
        return failure("UnitsML reference transform left a hash without a rendering method");
      case "formula":
        return expression.values.map(render).join("");
      case "sqrt":
        return render(expression.value);
      case "fenced":
        return effective.explicitParenthesis
          ? `(${render(expression.value)})`
          : render(expression.value);
      case "number":
        return expression.text;
      case "extender":
        return multiplierSymbol(effective.multiplier) === "space"
          ? " "
          : multiplierSymbol(effective.multiplier) === "nospace"
            ? ""
            : typeof effective.multiplier === "symbol"
              ? (effective.multiplier.description ?? "")
              : (effective.multiplier ?? expression.text);
      case "prefix":
        return output(record(expression), "ascii");
      case "unit":
      case "dimension":
        return `${expression.prefix === null ? "" : render(expression.prefix)}${output(record(expression), "ascii")}${expression.exponent === null ? "" : `^${render(expression.exponent)}`}`;
    }
  };
  return parsed.values.map(render).join("");
}
