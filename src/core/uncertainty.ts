/** biome-ignore-all lint/style/useNamingConvention: table keys are the gem's Ruby
 * symbols (`:coverage_interval`, `:probabilistically_symmetric`), kept as written. */
/**
 * The format-blind half of `Math::Function::Uncertainty`
 * (`lib/plurimath/math/function/uncertainty.rb`, plurimath#493): the gem's
 * constructor validation, the intent marker every markup writer carries, and
 * the small text helpers the six writers share. The writers themselves live
 * in `src/render/uncertainty/<format>.ts`.
 *
 * The node records the reported numbers exactly as written; nothing here
 * calculates, rounds or converts them. Decimal comparison is done on the
 * digit strings, as the gem does, never through `Number`.
 */

import type {
  MathNode,
  UncertaintyCategory,
  UncertaintyIntervalKind,
  UncertaintyNotation,
} from "./nodes";

/** The uncertainty node as data (`MathNode`'s member), as every renderer receives it. */
export type UncertaintyData = Extract<MathNode, { readonly kind: "uncertainty" }>;

/** `Uncertainty::CATEGORIES`. */
export const UNCERTAINTY_CATEGORIES: readonly UncertaintyCategory[] = [
  "standard",
  "expanded",
  "coverage_interval",
];
/** `Uncertainty::NOTATIONS`. */
export const UNCERTAINTY_NOTATIONS: readonly UncertaintyNotation[] = ["absolute", "concise"];
/** `Uncertainty::INTERVAL_KINDS`. */
export const UNCERTAINTY_INTERVAL_KINDS: readonly UncertaintyIntervalKind[] = [
  "shortest",
  "probabilistically_symmetric",
];

/** `Uncertainty::MARKER_NAMES`. */
const MARKER_NAMES: { readonly [K in UncertaintyCategory]: string } = {
  standard: "standard-uncertainty",
  expanded: "expanded-uncertainty",
  coverage_interval: "coverage-interval",
};

/** `Uncertainty::ASCIIMATH_NAMES`. */
export const UNCERTAINTY_ASCIIMATH_NAMES: { readonly [K in UncertaintyCategory]: string } = {
  standard: "ustd",
  expanded: "uexp",
  coverage_interval: "ucov",
};

/** `Uncertainty::INTERVAL_KIND_NAMES`. */
const INTERVAL_KIND_NAMES: { readonly [K in UncertaintyIntervalKind]: string } = {
  shortest: "shortest",
  probabilistically_symmetric: "probabilistically-symmetric",
};

/** `Uncertainty::ASCIIMATH_INTERVAL_KIND_NAMES`: AsciiMath reads `-` as minus. */
export const UNCERTAINTY_ASCIIMATH_INTERVAL_KIND_NAMES: {
  readonly [K in UncertaintyIntervalKind]: string;
} = {
  shortest: "shortest",
  probabilistically_symmetric: "symmetric",
};

/** `Uncertainty::PLUS_MINUS`, the entity the gem writes, not the character. */
export const UNCERTAINTY_PLUS_MINUS = "&#xb1;";

const SIGNED_DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;
const UNSIGNED_DECIMAL = /^[0-9]+(\.[0-9]+)?$/;

/** `text(number)`: the number's text as written, or `undefined` for nil. */
export function uncertaintyText(number: MathNode | null | undefined): string | undefined {
  if (number === null || number === undefined) return undefined;
  const value = (number as { readonly value?: unknown }).value;
  return typeof value === "string" ? value : undefined;
}

function text(number: MathNode | null | undefined): string {
  return uncertaintyText(number) ?? "";
}

/** `Uncertainty#concise_digits`: the magnitude's digits without the point or leading zeros. */
export function uncertaintyConciseDigits(node: UncertaintyData): string {
  const digits = text(node.magnitude).replaceAll(".", "").replace(/^0+/, "");
  return digits === "" ? "0" : digits;
}

/** `standard_parenthesised`: what the standard form writes inside its parentheses. */
export function uncertaintyStandardParenthesised(node: UncertaintyData): string {
  return node.notation === "concise" ? uncertaintyConciseDigits(node) : text(node.magnitude);
}

/** `marker_arguments`. */
function markerArguments(node: UncertaintyData): string[] {
  let args: (string | undefined)[];
  switch (node.category) {
    case "standard":
      args = [uncertaintyText(node.value), uncertaintyText(node.magnitude)];
      break;
    case "expanded":
      args = [
        uncertaintyText(node.value),
        uncertaintyText(node.magnitude),
        uncertaintyText(node.coverageFactor),
        uncertaintyText(node.coverageProbability),
      ];
      break;
    default:
      args = [
        uncertaintyText(node.value),
        uncertaintyText(node.lower),
        uncertaintyText(node.upper),
        uncertaintyText(node.coverageProbability),
      ];
  }
  if (node.unit !== null) args.push("$unit");
  return args.filter((arg): arg is string => arg !== undefined);
}

/** `Uncertainty#marker`: the text MathML intent, the OMML phantom and UnicodeMath carry. */
export function uncertaintyMarker(node: UncertaintyData): string {
  let name = MARKER_NAMES[node.category];
  if (node.notation === "concise") name = `${name}:concise`;
  if (node.intervalKind !== null) name = `${name}:${INTERVAL_KIND_NAMES[node.intervalKind]}`;
  return `${name}(${markerArguments(node).join(",")})`;
}

/** `statements`: the `k` and `p` statements, in order, as `[name, text]`. */
export function uncertaintyStatements(node: UncertaintyData): [string, string][] {
  const list: [string, string][] = [];
  if (node.coverageFactor !== null) list.push(["k", text(node.coverageFactor)]);
  if (node.coverageProbability !== null) list.push(["p", text(node.coverageProbability)]);
  return list;
}

/* -------------------------------------------------------------------------
 * Validation: `Uncertainty#validate!` and its helpers, in the gem's order.
 * Returns the gem's `InvalidUncertainty` message, or null when valid.
 * ---------------------------------------------------------------------- */

class Invalid extends Error {}

/**
 * `Errors::InvalidUncertainty`, raised while a reader builds the node. A
 * parser turns it into its `ParseError`, as `Math.parse` reports it.
 */
export class InvalidUncertaintyError extends Error {
  constructor(readonly detail: string) {
    super(`[plurimath] Invalid uncertainty: ${detail}.`);
    this.name = "InvalidUncertaintyError";
  }
}

function invalid(message: string): never {
  throw new Invalid(message);
}

/**
 * The message `Errors::InvalidUncertainty.new(message)` would carry for this
 * node, or `null` when the gem's constructor accepts it.
 */
export function uncertaintyProblem(node: UncertaintyData): string | null {
  try {
    validate(node);
    return null;
  } catch (error) {
    if (error instanceof Invalid) return error.message;
    throw error;
  }
}

function inspectSymbol(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  return typeof value === "string" ? `:${value}` : String(value);
}

function validate(node: UncertaintyData): void {
  if (!UNCERTAINTY_CATEGORIES.includes(node.category)) {
    invalid(`unknown category ${inspectSymbol(node.category)}`);
  }
  validateNumber("value", node.value, true);
  for (const [field, number] of [
    ["magnitude", node.magnitude],
    ["coverage_factor", node.coverageFactor],
    ["coverage_probability", node.coverageProbability],
    ["lower", node.lower],
    ["upper", node.upper],
  ] as const) {
    if (number !== null) validateNumber(field, number, false);
  }
  validateUnit(node.unit);
  switch (node.category) {
    case "standard":
      validateStandard(node);
      break;
    case "expanded":
      validateExpanded(node);
      break;
    default:
      validateCoverageInterval(node);
  }
}

const FIELD_NAMES = {
  coverageFactor: "coverage_factor",
  coverageProbability: "coverage_probability",
  lower: "lower",
  upper: "upper",
  intervalKind: "interval_kind",
  magnitude: "magnitude",
} as const;

type CheckedField = keyof typeof FIELD_NAMES;

function forbid(node: UncertaintyData, ...fields: CheckedField[]): void {
  for (const field of fields) {
    if (node[field] === null) continue;
    invalid(`${FIELD_NAMES[field]} does not apply to a ${node.category} uncertainty`);
  }
}

function requireFields(node: UncertaintyData, ...fields: CheckedField[]): void {
  for (const field of fields) {
    if (node[field] !== null) continue;
    invalid(`${FIELD_NAMES[field]} is required for a ${node.category} uncertainty`);
  }
}

function validateStandard(node: UncertaintyData): void {
  forbid(node, "coverageFactor", "coverageProbability", "lower", "upper", "intervalKind");
  requireFields(node, "magnitude");
  if (node.notation === null || !UNCERTAINTY_NOTATIONS.includes(node.notation)) {
    invalid(`unknown notation ${inspectSymbol(node.notation)}`);
  }
  if (node.notation !== "concise") return;
  if (decimalPlaces(text(node.magnitude)) === decimalPlaces(text(node.value))) return;
  invalid(
    `magnitude ${text(node.magnitude)} cannot be written concisely after ` +
      `${text(node.value)}: it needs as many decimal places as the value`,
  );
}

function validateExpanded(node: UncertaintyData): void {
  forbid(node, "lower", "upper", "intervalKind");
  requireFields(node, "magnitude", "coverageFactor");
  const factor = text(node.coverageFactor);
  if (!positive(factor)) invalid(`coverage factor ${factor} must be greater than 0`);
  validateCoverageProbability(node);
}

function validateCoverageInterval(node: UncertaintyData): void {
  forbid(node, "magnitude", "coverageFactor");
  requireFields(node, "lower", "upper", "coverageProbability");
  if (node.intervalKind !== null && !UNCERTAINTY_INTERVAL_KINDS.includes(node.intervalKind)) {
    invalid(`unknown interval kind ${inspectSymbol(node.intervalKind)}`);
  }
  validateCoverageProbability(node);
  if (compareDecimals(text(node.lower), text(node.upper)) < 0) return;
  invalid(`lower endpoint ${text(node.lower)} is not below upper endpoint ${text(node.upper)}`);
}

function validateCoverageProbability(node: UncertaintyData): void {
  if (node.coverageProbability === null) return;
  const probability = text(node.coverageProbability);
  if (positive(probability) && compareDecimals(probability, "1") < 0) return;
  invalid(`coverage probability ${probability} must lie strictly between 0 and 1`);
}

function validateNumber(field: string, number: MathNode | null, signed: boolean): void {
  const pattern = signed ? SIGNED_DECIMAL : UNSIGNED_DECIMAL;
  const kind = signed ? "decimal" : "unsigned decimal";
  const candidate = number as {
    readonly kind?: unknown;
    readonly value?: unknown;
    readonly base?: unknown;
    readonly miniSubSized?: unknown;
    readonly miniSupSized?: unknown;
  } | null;
  const valid =
    candidate !== null &&
    candidate.kind === "number" &&
    typeof candidate.value === "string" &&
    pattern.test(candidate.value) &&
    candidate.miniSubSized !== true &&
    candidate.miniSupSized !== true &&
    (candidate.base === null || candidate.base === undefined);
  if (valid) return;
  // The gem interpolates `number.inspect`; this port names the value instead.
  invalid(`${field} must be a Math::Number holding a plain ${kind}, got ${describe(number)}`);
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "object" && "kind" in value) {
    const node = value as { readonly kind: unknown; readonly value?: unknown };
    return node.kind === "number" ? `Number(${JSON.stringify(node.value)})` : String(node.kind);
  }
  return JSON.stringify(value) ?? String(value);
}

function validateUnit(unit: MathNode | null): void {
  if (unit === null || unit.kind === "unitsml") return;
  if (unit.kind !== "formula") {
    invalid(`unit must be a Math::Function::Unitsml, got ${describe(unit)}`);
  }
  if (emptyFormula(unit)) invalid("unit must not be empty");
  if (holdsUncertainty(unit)) invalid("unit must not contain an uncertainty");
}

function emptyFormula(formula: MathNode): boolean {
  const value = (formula as { readonly value?: unknown }).value;
  const parts = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return parts
    .filter((part) => part !== null && part !== undefined)
    .every(
      (part) =>
        typeof part === "object" &&
        (part as { kind?: unknown }).kind === "formula" &&
        emptyFormula(part as MathNode),
    );
}

function holdsUncertainty(node: unknown, seen = new Set<unknown>()): boolean {
  if (node === null || typeof node !== "object" || seen.has(node)) return false;
  seen.add(node);
  if (Array.isArray(node)) return node.some((item) => holdsUncertainty(item, seen));
  if ((node as { kind?: unknown }).kind === "uncertainty") return true;
  return Object.values(node).some((item) => holdsUncertainty(item, seen));
}

function decimalPlaces(string: string): number {
  const point = string.indexOf(".");
  return point === -1 ? 0 : string.length - point - 1;
}

function positive(string: string): boolean {
  return /[1-9]/.test(string);
}

/** `compare_decimals`: exact comparison of two unsigned plain decimals. */
export function compareUncertaintyDecimals(first: string, second: string): number {
  return compareDecimals(first, second);
}

function compareDecimals(first: string, second: string): number {
  const [firstWhole = "", firstFraction = ""] = first.split(".", 2);
  const [secondWhole = "", secondFraction = ""] = second.split(".", 2);
  const a = firstWhole.replace(/^0+/, "");
  const b = secondWhole.replace(/^0+/, "");
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  const width = Math.max(firstFraction.length, secondFraction.length);
  const left = a + firstFraction.padEnd(width, "0");
  const right = b + secondFraction.padEnd(width, "0");
  return left === right ? 0 : left < right ? -1 : 1;
}
