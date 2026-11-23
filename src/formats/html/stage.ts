/** The Ruby-derived HTML artifacts on the same PARG runtime as AsciiMath. */

import arabic from "../../../assets/html/arabic.json" with { type: "json" };
import comma from "../../../assets/html/comma.json" with { type: "json" };
import dot from "../../../assets/html/dot.json" with { type: "json" };
import { BoundedRuntime } from "../../pegkit/bounded-runtime";
import type { HtmlPargRuntime } from "./parsanol";

const ARTIFACTS: Readonly<Record<string, unknown>> = { ".": dot, ",": comma, "٫": arabic };
const runtimes = new Map<string, HtmlPargRuntime>();

/** Build only the requested decimal entry, synchronously on the Node runtime. */
export function htmlRuntime(decimal: string): HtmlPargRuntime {
  let runtime = runtimes.get(decimal);
  if (runtime === undefined) {
    const artifact = ARTIFACTS[decimal];
    if (artifact === undefined)
      throw new TypeError(`No HTML artifact for decimal marker ${decimal}`);
    // The checked assets use two-space JSON and one final newline. Preserve
    // those bytes, including their provenance, rather than compiling a grammar.
    // HTML reaches its JSON nesting guard at 100 levels with this budget.
    // A larger budget lets deep HTML exhaust the native WASM stack first.
    runtime = new BoundedRuntime(`${JSON.stringify(artifact, null, 2)}\n`, "document", 1536);
    runtimes.set(decimal, runtime);
  }
  return runtime;
}
