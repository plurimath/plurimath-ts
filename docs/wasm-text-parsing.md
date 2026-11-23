# Opt-in WASM text parsing

The package already vendors the Rust `plurimath-facade` WASM build. Its
source revision, binary hash, glue, dependency notices and `Cargo.lock` are
pinned in [`assets/facade/manifest.json`](../assets/facade/manifest.json).
The loader verifies the binary hash before compiling it.

Initialize explicitly with the exported WASM asset's bytes, a fetch response
or a URL:

```ts
import { initFacadeWasm } from "@plurimath/plurimath-ts/facade/wasm";

const kernel = await initFacadeWasm(wasmBytes);
const ascii = kernel.parse("a/b", "asciimath");
const latex = kernel.parse("\\frac{1}{2}", "latex");
const unicode = kernel.parse("(a)", "unicode");
console.log(ascii.toLatex(), latex.toAsciimath(), unicode.toUnicodemath());
```

Node callers can read
`@plurimath/plurimath-ts/facade/plurimath_facade.wasm` with their file API;
browser callers can serve that asset and pass its URL. Importing the WASM
entry does not initialize it. The root `parse` function and `Plurimath`
constructor keep using the TypeScript path. The native `Formula` returned by
the kernel owns its model and uses native writers; it is a different type
from the root API's `FormulaNode`.

The binary exports memory and `plurimath_facade_abi_version`,
`plurimath_facade_alloc`, `plurimath_facade_json`, `plurimath_facade_free`
and `plurimath_facade_dealloc`. The existing JS loader supplies its pinned
wasm-bindgen imports and handles allocation cleanup; no separate wasm-pack
package or new Rust parse export is needed for this path.

[`text-parse-parity.spec.ts`](../test/facade/text-parse-parity.spec.ts)
compares six pinned shared-suite inputs through both paths against the shared
AsciiMath, LaTeX and UnicodeMath writer bytes. It also checks three shared
refusals, recovery after a refusal and allocation cleanup. The packed package
CI repeats those comparisons in Node ESM and CJS. This is a focused parse-path
demonstration, not full format parity. Native refusals retain their stage
error codes and Ruby `sourceClass`; the TS path uses `PARSE_ERROR`.

Run the focused check with:

```sh
pnpm exec vitest run test/facade/text-parse-parity.spec.ts
```

Regenerate the fixture from the clean pinned submodule with
`python3 scripts/export-text-parse-parity.py` (PyYAML required), or add
`--check` to verify it without writing. Inputs and expected outputs come from
the immutable shared payloads; their hashes and revision are recorded in the
fixture and checked against the submodule in the test.
