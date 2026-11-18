/**
 * The default AsciiMath stage: amath-ts's PARG artifact on the parsanol
 * runtime, the TypeScript counterpart of Ruby's `Amath.parse_model` path.
 *
 * Runtimes are built on first use, one per decimal marker, so a caller that
 * only parses `.`-decimal input never pays for the other two entries. The
 * construction is synchronous on Node, where parsanol loads its WASM eagerly;
 * a browser caller initializes its own binding and uses `createAsciimathParser`.
 */

import bindings from "@plurimath/amath-ts/artifacts/asciimath.bindings.ts.json" with {
  type: "json",
};
import artifact from "@plurimath/amath-ts/artifacts/asciimath.json" with { type: "json" };
import { type Decimal, Parser } from "@plurimath/amath-ts/browser";
import { PargRuntime } from "parsanol";
import type { AmathSyncBinding } from "./amath";

/** `Asciimath::Mapper::WRAPPERS`: RawTree wrapper keys and the capture each becomes. */
const WRAPPERS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ["empty", "empty"],
    ["empty_list", "empty_list"],
    ["list", "list"],
    ["literal", "text"],
    ["literal_2", "text"],
    ["spelling", "text"],
  ]),
);

const ENTRIES: Readonly<Record<Decimal, string>> = { ".": "dot", ",": "comma", "٫": "arabic" };

type Runtime =
  ConstructorParameters<typeof Parser>[0] extends ReadonlyMap<Decimal, infer R> ? R : never;

let artifactText: string | undefined;
const runtimes = new Map<Decimal, Runtime>();

/** The `ReadonlyMap` the stage reads; it only ever calls `get`. */
const lazyRuntimes = {
  get(decimal: Decimal): Runtime | undefined {
    const entry = ENTRIES[decimal];
    if (entry === undefined) return undefined;
    let runtime = runtimes.get(decimal);
    if (runtime === undefined) {
      // The artifact file is compact JSON plus a trailing newline, and its
      // digest covers those exact bytes; `stage.spec.ts` pins the round trip.
      artifactText ??= `${JSON.stringify(artifact)}\n`;
      runtime = new PargRuntime(artifactText, entry) as unknown as Runtime;
      runtimes.set(decimal, runtime);
    }
    return runtime;
  },
} as unknown as ReadonlyMap<Decimal, Runtime>;

let parser: Parser | undefined;

/** The shared, lazily built amath-ts parser. */
export function asciimathStage(): Parser {
  parser ??= new Parser(lazyRuntimes, JSON.stringify(bindings), WRAPPERS);
  return parser;
}

/** The default stage as the consumer's sync binding. */
export const asciimathStageBinding: AmathSyncBinding = {
  parseTree: (input, { decimal }) =>
    asciimathStage().parseTree(input, { decimal: decimal as Decimal }),
};
