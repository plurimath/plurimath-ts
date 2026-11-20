/** Shared umath-ts typed stage with one lazy runtime per decimal marker. */
import bindings from "@plurimath/umath-ts/artifacts/umath.bindings.ts.json" with { type: "json" };
import artifact from "@plurimath/umath-ts/artifacts/umath.json" with { type: "json" };
import { type Decimal, Parser } from "@plurimath/umath-ts/browser";
import {
  CallDepthLimitExceeded,
  PargRuntime,
  RecursionLimitExceeded,
  ShapeDepthLimitExceeded,
} from "parsanol";

// umath-ts 787840c uses the same adapter in its Node initializer: Parsanol
// 1.5.8 has this native method but not the public wrapper (parsanol-ts#80).
function nativeResource(value: unknown): Error | null {
  if (value === null || typeof value !== "object") return null;
  const wire = value as Record<string, unknown>;
  if (typeof wire.depth !== "number" || typeof wire.max_depth !== "number") return null;
  const message = typeof wire.message === "string" ? wire.message : undefined;
  if (wire.category === "recursion_limit")
    return new RecursionLimitExceeded(wire.depth, wire.max_depth, message);
  if (wire.category === "call_depth_limit")
    return new CallDepthLimitExceeded(wire.depth, wire.max_depth, message);
  if (wire.category === "shape_depth_limit")
    return new ShapeDepthLimitExceeded(wire.depth, wire.max_depth, message);
  return null;
}
type Report = ReturnType<NonNullable<Runtime["parseShapeWithReporter"]>>;
/** Preserve the stage's explicit policy/reporter and typed engine resources. */
export class UnicodemathRuntime extends PargRuntime {
  parseShapeWithReporter(input: string, compatibility: string, reporter: string): Report {
    const engine = this.artifact as {
      parseShapeWithReporter?: (
        entry: string,
        input: string,
        compatibility: string,
        reporter: string,
      ) => string;
    };
    if (typeof engine.parseShapeWithReporter !== "function")
      throw new TypeError("Parsanol engine lacks the explicit failure reporter");
    try {
      const result = JSON.parse(
        engine.parseShapeWithReporter(this.entry, input, compatibility, reporter),
      ) as Report;
      if (!result.ok) {
        const resource = nativeResource(result.error);
        if (resource) throw resource;
      }
      return result;
    } catch (error) {
      throw nativeResource(error) ?? error;
    }
  }
}

// The pinned stage's grammars/umath.wrappers.json.
const WRAPPERS: Readonly<Record<string, string>> = Object.freeze({
  empty: "empty",
  list: "list",
  literal: "text",
  // biome-ignore lint/style/useNamingConvention: pinned stage capture name.
  literal_2: "text",
  present: "nil",
  spelling: "text",
});
const ENTRIES: Readonly<Record<Decimal, string>> = { ".": "dot", ",": "comma", "٫": "arabic" };
type Runtime =
  ConstructorParameters<typeof Parser>[0] extends ReadonlyMap<Decimal, infer R> ? R : never;
let artifactText: string | undefined;
const runtimes = new Map<Decimal, Runtime>();
const lazyRuntimes = {
  get(decimal: Decimal): Runtime | undefined {
    const entry = ENTRIES[decimal];
    if (entry === undefined) return undefined;
    let runtime = runtimes.get(decimal);
    if (runtime === undefined) {
      // The checked stage artifact is compact JSON with a final newline.
      artifactText ??= `${JSON.stringify(artifact)}\n`;
      runtime = new UnicodemathRuntime(artifactText, entry);
      runtimes.set(decimal, runtime);
    }
    return runtime;
  },
} as unknown as ReadonlyMap<Decimal, Runtime>;
let parser: Parser | undefined;
export function unicodemathStage(): Parser {
  parser ??= new Parser(lazyRuntimes, JSON.stringify(bindings), WRAPPERS);
  return parser;
}
