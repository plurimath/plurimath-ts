/**
 * `Uncertainty#to_asciimath` (`function/uncertainty.rb`, plurimath#493):
 * `ustd(...)`, `uexp(...)` or `ucov(...)`, with a unit as a last
 * `"unitsml(...)"` argument when it can be written as UnitsML, or after the
 * call otherwise.
 */
import { type MathNode, RenderError } from "../../core/index";
import {
  UNCERTAINTY_ASCIIMATH_INTERVAL_KIND_NAMES,
  UNCERTAINTY_ASCIIMATH_NAMES,
  uncertaintyConciseDigits,
  uncertaintyProblem,
  uncertaintyText,
} from "../../core/uncertainty";
import {
  expandUnitsml,
  FORMAT,
  type NodeOf,
  type RenderContext,
} from "../../formats/asciimath/render-shared";

export function renderUncertainty(node: NodeOf<"uncertainty">, context: RenderContext): string {
  const problem = uncertaintyProblem(node);
  if (problem !== null) throw new RenderError(problem, FORMAT, node.kind);
  const value = uncertaintyText(node.value);
  let args: (string | undefined)[];
  switch (node.category) {
    case "standard":
      args =
        node.notation === "concise"
          ? [`${value ?? ""}(${uncertaintyConciseDigits(node)})`]
          : [value, uncertaintyText(node.magnitude)];
      break;
    case "expanded":
      args = [
        value,
        uncertaintyText(node.magnitude),
        uncertaintyText(node.coverageFactor),
        uncertaintyText(node.coverageProbability),
      ];
      break;
    default:
      args = [
        value,
        uncertaintyText(node.lower),
        uncertaintyText(node.upper),
        uncertaintyText(node.coverageProbability),
        node.intervalKind === null
          ? undefined
          : UNCERTAINTY_ASCIIMATH_INTERVAL_KIND_NAMES[node.intervalKind],
      ];
  }
  const unitsml = node.unit === null ? null : asciimathUnitsml(node.unit, context);
  if (unitsml !== null) args.push(`"unitsml(${unitsml})"`);
  const present = args.filter((arg): arg is string => arg !== undefined);
  const call = `${UNCERTAINTY_ASCIIMATH_NAMES[node.category]}(${present.join(", ")})`;
  if (node.unit === null || unitsml !== null) return call;
  // Not expressible in UnitsML: keep it visible after the call, the only
  // place the AsciiMath reader accepts it.
  return `${call} ${context.render(node.unit) ?? ""}`;
}

/**
 * `asciimath_unitsml`: the UnitsML text for the unit argument, or null when
 * the unit cannot be written as UnitsML. A unit read from markup is its
 * rendered Formula; it is written back as UnitsML only when it is a
 * `*`-separated product of upright unit symbols with optional integer
 * powers, and UnitsML renders that text back to the same product.
 */
function asciimathUnitsml(unit: MathNode, context: RenderContext): string | null {
  if (unit.kind === "unitsml") return unit.text;
  const candidate = unitText(unit);
  if (candidate === null) return null;
  try {
    return unitText(expandUnitsml(candidate, context.unitsml)) === candidate ? candidate : null;
  } catch {
    // What UnitsML raises for text it cannot read.
    return null;
  }
}

const UNIT_SYMBOL = /^[A-Za-z]+$/;

function unitText(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.kind === "formula") return unitProduct(node.value);
  if (node.kind === "binaryFunction" && node.name === "Power") return unitPower(node);
  return unitSymbol(node);
}

function unitProduct(parts: unknown): string | null {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length % 2 === 0) return null;
  const texts: string[] = [];
  for (const [index, part] of parts.entries()) {
    if (index % 2 === 1) {
      if (!(isNode(part) && part.kind === "symbol" && part.id === "Cdot")) return null;
      texts.push("*");
    } else {
      const text = unitText(part);
      if (text === null) return null;
      texts.push(text);
    }
  }
  return texts.join("");
}

function unitPower(node: Extract<MathNode, { readonly kind: "binaryFunction" }>): string | null {
  const base = unitSymbol(node.parameterOne);
  let exponent: unknown = node.parameterTwo;
  if (isNode(exponent) && exponent.kind === "formula") exponent = exponent.value;
  let list: unknown[];
  if (Array.isArray(exponent)) list = [...exponent];
  else list = exponent === null || exponent === undefined ? [] : [exponent];
  let sign = "";
  const first = list[0];
  if (list.length === 2 && isNode(first) && first.kind === "symbol" && first.id === "Minus") {
    sign = "-";
    list = list.slice(1);
  }
  const number = list[0];
  if (
    base === null ||
    list.length !== 1 ||
    !isNode(number) ||
    number.kind !== "number" ||
    typeof number.value !== "string" ||
    !/^[0-9]+$/.test(number.value)
  ) {
    return null;
  }
  return `${base}^${sign}${number.value}`;
}

function unitSymbol(value: unknown): string | null {
  let node = value;
  if (isNode(node) && node.kind === "fontStyle" && node.name === "Normal") node = node.parameterOne;
  let string: unknown = null;
  if (isNode(node)) {
    if (node.kind === "text") string = node.parameterOne;
    // `instance_of?(Math::Symbols::Symbol)`: the bare class, no subclass.
    else if (node.kind === "symbol" && (node.id === undefined || node.id === "Symbol")) {
      string = node.value;
    }
  }
  return typeof string === "string" && UNIT_SYMBOL.test(string) ? string : null;
}

function isNode(value: unknown): value is MathNode {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value;
}
