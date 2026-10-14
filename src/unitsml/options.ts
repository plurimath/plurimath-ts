import { RenderError } from "../core/index";

export interface UnitsmlRenderOptions {
  /** Symbol.for("space") / Symbol.for("nospace") carry Ruby's Symbol values. */
  readonly multiplier?: string | symbol | false | null | undefined;
  readonly explicitParenthesis?: boolean | null | undefined;
  readonly xml?: boolean | null | undefined;
  readonly name?: string | boolean | null | undefined;
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
  return {
    ...options,
    explicitParenthesis:
      options !== null &&
      options !== undefined &&
      Object.hasOwn(options, "explicitParenthesis") &&
      options.explicitParenthesis !== undefined
        ? options.explicitParenthesis !== null && options.explicitParenthesis !== false
        : true,
    multiplier:
      options?.multiplier === false
        ? (extras.multiplier ?? null)
        : (options?.multiplier ?? extras.multiplier ?? null),
  };
}

export function multiplierSymbol(value: string | symbol | null): "space" | "nospace" | undefined {
  if (typeof value !== "symbol") return undefined;
  return value.description === "space" || value.description === "nospace"
    ? value.description
    : undefined;
}
