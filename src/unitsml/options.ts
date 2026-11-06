import { RenderError } from "../core/index";

export interface UnitsmlRenderOptions {
  /** Symbol.for("space") / Symbol.for("nospace") carry Ruby's Symbol values. */
  readonly multiplier?: string | symbol | null | undefined;
  readonly explicitParenthesis?: boolean | null | undefined;
  readonly xml?: boolean | null | undefined;
  readonly name?: string | symbol | boolean | null | undefined;
  readonly symbol?: string | boolean | null | undefined;
  readonly quantity?: string | boolean | null | undefined;
}

export interface EffectiveUnitsmlOptions extends UnitsmlRenderOptions {
  readonly explicitParenthesis: boolean;
  readonly multiplier: string | symbol | null;
}

/** Ruby truthiness: empty strings are present, false and nil are absent. */
export function unitsmlOptions(
  options: UnitsmlRenderOptions | null | undefined,
  extras: Readonly<Record<string, string>>,
): EffectiveUnitsmlOptions {
  if (
    options !== null &&
    options !== undefined &&
    (typeof options !== "object" || Array.isArray(options))
  ) {
    throw new RenderError(
      "UnitsML options must be an object, null or undefined",
      "unitsml",
      "unitsml",
    );
  }
  // Formula#update_options: a render name is embedded in <UnitName>, so only
  // nil, a String or a Symbol is accepted, on every render path.
  const name: unknown = options?.name;
  if (name !== undefined && name !== null && typeof name !== "string" && typeof name !== "symbol")
    throw new RenderError(
      `Unitsml::Errors::InvalidUnitEntryError: [unitsml] Invalid name: ${String(name)} — expected a String or Symbol.`,
      "unitsml",
      "unitsml",
    );
  // Compose.validate_multiplier!: nil, a String, :space or :nospace.
  const multiplier: unknown = options?.multiplier;
  if (
    multiplier !== undefined &&
    multiplier !== null &&
    typeof multiplier !== "string" &&
    !(typeof multiplier === "symbol" && multiplierSymbol(multiplier) !== undefined)
  )
    throw new RenderError(
      `Unitsml::Errors::InvalidUnitEntryError: [unitsml] Invalid multiplier: ${rubyInspect(multiplier)} — expected a String, :space, or :nospace.`,
      "unitsml",
      "unitsml",
    );
  return {
    ...options,
    explicitParenthesis:
      options !== null &&
      options !== undefined &&
      Object.hasOwn(options, "explicitParenthesis") &&
      options.explicitParenthesis !== undefined
        ? options.explicitParenthesis !== null && options.explicitParenthesis !== false
        : true,
    multiplier: (multiplier as string | symbol | null | undefined) ?? extras.multiplier ?? null,
  };
}

/** `value.inspect` for the values a JavaScript caller can pass where Ruby expects a multiplier. */
function rubyInspect(value: unknown): string {
  if (typeof value === "symbol") return `:${value.description ?? ""}`;
  return String(value);
}

export function multiplierSymbol(value: string | symbol | null): "space" | "nospace" | undefined {
  if (typeof value !== "symbol") return undefined;
  return value.description === "space" || value.description === "nospace"
    ? value.description
    : undefined;
}
