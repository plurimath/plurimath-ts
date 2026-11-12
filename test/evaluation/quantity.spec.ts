/**
 * `evaluateQuantity` (R-C1) against the real UnitsML TS quantity runtime.
 * The runtime is an optional peer: it is loaded by name at test time and the
 * suite is skipped, visibly, when no `unitsml` candidate is installed.
 * Expected values are the F40 `unitsml-quantities.json` vectors
 * (conv-km-to-m, conv-kva-to-kw, kva-product, conv-degc-to-k,
 * conv-k-to-degc, difference-degc and the typed refusals).
 */
import { describe, expect, it } from "vitest";
import { ParseError, UnsupportedFeatureError } from "../../src/core/errors";
import {
  evaluate,
  evaluateQuantity,
  MissingVariableError,
  type UnitsmlQuantity,
  type UnitsmlQuantityRuntime,
} from "../../src/evaluation/index";
import { parseAsciimath } from "../../src/formats/asciimath/index";

interface Quantity extends UnitsmlQuantity<Quantity> {
  readonly normText: string;
  dimensionId(): string | undefined;
  dimensionVector(): Map<string, number> | undefined;
}
type ErrorClass = abstract new (...args: never[]) => Error;
interface Runtime extends UnitsmlQuantityRuntime<Quantity> {
  // biome-ignore lint/style/useNamingConvention: unitsml error class export.
  readonly DimensionMismatchError: ErrorClass;
  // biome-ignore lint/style/useNamingConvention: unitsml error class export.
  readonly ScaleOperationError: ErrorClass;
  // biome-ignore lint/style/useNamingConvention: unitsml error class export.
  readonly IndeterminateResultError: ErrorClass;
  // biome-ignore lint/style/useNamingConvention: unitsml error class export.
  readonly ConversionError: ErrorClass;
  // biome-ignore lint/style/useNamingConvention: unitsml error class export.
  readonly ParseError: ErrorClass;
}

const runtimeEntry = process.env.PLURIMATH_UNITSML_TEST_ENTRY;
const runtimeSpecifier = runtimeEntry ?? "unitsml";
const runtime = (await import(/* @vite-ignore */ runtimeSpecifier).catch((error) => {
  if (runtimeEntry) throw error;
  return null;
})) as Runtime | null;

function run(input: string, target?: string): Promise<Quantity> {
  return evaluateQuantity(parseAsciimath(input), runtime ? { runtime, target } : (null as never));
}

function shape(q: Quantity) {
  return {
    value: q.value.toString(),
    unit: q.normText,
    dimensionId: q.dimensionId(),
    dimensionVector: [...(q.dimensionVector() ?? [])],
    scale: q.scale,
  };
}

const POWER = [
  ["Length", 2],
  ["Mass", 1],
  ["Time", -3],
];

describe.skipIf(runtime === null)("evaluateQuantity with the unitsml runtime", () => {
  const r = runtime as Runtime;

  it("normalizes an unlike-unit sum into the left unit, exactly", async () => {
    expect(shape(await run('1 "unitsml(km)" + 1 "unitsml(m)"'))).toEqual({
      value: "1001/1000",
      unit: "km",
      dimensionId: "NISTd1",
      dimensionVector: [["Length", 1]],
      scale: "ratio",
    });
    expect((await run('1 "unitsml(km)" + 1 "unitsml(m)"', "m")).value.toString()).toBe("1001");
    expect((await run('1.5 "unitsml(km)"', "m")).value.toString()).toBe("1500");
  });

  it("divides exactly, keeping the composed unit and dimension", async () => {
    expect(shape(await run('(1 "unitsml(m)")/(3 "unitsml(s)")'))).toEqual({
      value: "1/3",
      unit: "m/s",
      dimensionId: "NISTd11",
      dimensionVector: [
        ["Length", 1],
        ["Time", -1],
      ],
      scale: "ratio",
    });
    expect((await run("1/3")).value.toString()).toBe("1/3");
  });

  it("evaluates voltage times current to kV*A and converts it to kW explicitly", async () => {
    const product = await run('10 "unitsml(kV)" * 5 "unitsml(A)"');
    expect(shape(product)).toEqual({
      value: "50",
      unit: "kV*A",
      dimensionId: "NISTd16",
      dimensionVector: POWER,
      scale: "ratio",
    });
    expect(shape(await run('2 "unitsml(kV)" * 3 "unitsml(A)"', "kW"))).toEqual({
      value: "6",
      unit: "kW",
      dimensionId: "NISTd16",
      dimensionVector: POWER,
      scale: "ratio",
    });
    expect((await run('1 "unitsml(kV)" "unitsml(A)"', "W")).value.toString()).toBe("1000");
  });

  it("binds quantity variables and evaluates through them", async () => {
    const bindings = {
      u: new r.Quantity("230", await r.parse("V")),
      i: new r.Quantity("5", await r.parse("A")),
    };
    const q = await evaluateQuantity(parseAsciimath("u i"), { runtime: r, bindings, target: "kW" });
    expect(q.value.toString()).toBe("23/20");
    await expect(evaluateQuantity(parseAsciimath("u r"), { runtime: r, bindings })).rejects.toThrow(
      MissingVariableError,
    );
  });

  it("keeps absolute interval values and differences apart", async () => {
    expect(shape(await run('100 "unitsml(degC)"', "K"))).toMatchObject({
      value: "7463/20",
      unit: "K",
      scale: "ratio",
    });
    expect(shape(await run('0 "unitsml(K)"', "degC"))).toMatchObject({
      value: "-5463/20",
      unit: "degC",
      scale: "interval",
    });
    // A difference of absolute values is difference-typed and converts by
    // factor only (5 K, not 278.15 K); the TS runtime keeps the label.
    expect(shape(await run('20 "unitsml(degC)" - 15 "unitsml(degC)"', "K"))).toEqual({
      value: "5",
      unit: "K",
      dimensionId: "NISTd5",
      dimensionVector: [["ThermodynamicTemperature", 1]],
      scale: "difference",
    });
  });

  it("propagates the runtime's typed refusals", async () => {
    await expect(run('1 "unitsml(V)" + 1 "unitsml(s)"')).rejects.toThrow(r.DimensionMismatchError);
    await expect(run('"unitsml(m)"', "s")).rejects.toThrow(r.DimensionMismatchError);
    await expect(run('20 "unitsml(degC)" * 2')).rejects.toThrow(r.ScaleOperationError);
    await expect(run('(20 "unitsml(degC)") * (1 "unitsml(degC)")')).rejects.toThrow(
      r.ScaleOperationError,
    );
    await expect(run('(1 "unitsml(m)")/0')).rejects.toThrow(r.IndeterminateResultError);
    await expect(run('(1 "unitsml(m)")/(0 "unitsml(s)")')).rejects.toThrow(
      r.IndeterminateResultError,
    );
    await expect(run('"unitsml(degC^2)"', "K^2")).rejects.toThrow(r.ConversionError);
    // An unknown inline unit is already refused by the AsciiMath parse
    // boundary; an unknown conversion target is refused by the runtime.
    expect(() => parseAsciimath('"unitsml(notaunit_xyz)"')).toThrow(ParseError);
    await expect(run('"unitsml(m)"', "notaunit_xyz")).rejects.toThrow(r.ParseError);
  });

  it("refuses constructs it does not delegate", async () => {
    await expect(run("2^3")).rejects.toThrow(UnsupportedFeatureError);
    await expect(run("pi")).rejects.toThrow(UnsupportedFeatureError);
    await expect(run('sin("unitsml(m)")')).rejects.toThrow(UnsupportedFeatureError);
  });
});

describe("evaluateQuantity without a runtime", () => {
  it("is a TypeError, not a fallback to plain numbers", async () => {
    await expect(
      evaluateQuantity(parseAsciimath("1+2"), { runtime: undefined as never }),
    ).rejects.toThrow(TypeError);
  });
});

describe("evaluate is unchanged", () => {
  it("still answers plain numbers", () => {
    expect(evaluate(parseAsciimath("1+2*3"))).toBe(7);
    expect(evaluate(parseAsciimath("(2+3)/4"))).toBe(1.25);
    expect(evaluate(parseAsciimath("x y"), { x: 3, y: 4 })).toBe(12);
  });
});
