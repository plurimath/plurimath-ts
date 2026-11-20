/** Shared latexmath-ts typed stage with one lazy runtime per decimal marker. */
import bindings from "@plurimath/latexmath-ts/artifacts/latex.bindings.ts.json" with {
  type: "json",
};
import artifact from "@plurimath/latexmath-ts/artifacts/latex.json" with { type: "json" };
import { type Decimal, Parser } from "@plurimath/latexmath-ts/browser";
import { PargRuntime } from "parsanol";

// The pinned stage's grammars/latex.wrappers.json.
const WRAPPERS: Readonly<Record<string, string>> = Object.freeze({
  absent: "nil",
  items: "items",
  literal: "text",
  spelling: "text_list",
  // biome-ignore lint/style/useNamingConvention: pinned stage capture name.
  text_list: "text_list",
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
      runtime = new PargRuntime(artifactText, entry) as unknown as Runtime;
      runtimes.set(decimal, runtime);
    }
    return runtime;
  },
} as unknown as ReadonlyMap<Decimal, Runtime>;
let parser: Parser | undefined;
export function latexStage(): Parser {
  parser ??= new Parser(lazyRuntimes, JSON.stringify(bindings), WRAPPERS);
  return parser;
}
