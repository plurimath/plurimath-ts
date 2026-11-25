/** Shared umath-ts typed stage with one lazy runtime per decimal marker. */
import bindings from "@plurimath/umath-ts/artifacts/umath.bindings.ts.json" with { type: "json" };
import artifact from "@plurimath/umath-ts/artifacts/umath.json" with { type: "json" };
import { type Decimal, Parser } from "@plurimath/umath-ts/browser";
import { BoundedRuntime } from "../../pegkit/bounded-runtime";

/** Preserve the stage's explicit policy/reporter through the shared runtime. */
export class UnicodemathRuntime extends BoundedRuntime {}

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
