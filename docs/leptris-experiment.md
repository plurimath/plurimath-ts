# Optional Leptris input

The public `./mathml/leptris` and `./omml/leptris` package subpaths connect an
initialized Leptris binding to the existing element layers, translators and
formula trees. Regular format and root parsers keep the native reader. The
optional entries do not import a Leptris runtime or add a WASM dependency.

```ts
import * as leptris from "/path/to/built/leptris/index.js";
import { createMathmlParser } from "@plurimath/plurimath-ts/mathml/leptris";
import { createOmmlParser } from "@plurimath/plurimath-ts/omml/leptris";
import { toMathml } from "@plurimath/plurimath-ts/mathml";

await leptris.init();
const parseMathml = createMathmlParser(leptris);
const parseOmml = createOmmlParser(leptris);
const formula = parseMathml("<math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>");
console.log(toMathml(formula));
```

Both ESM and CommonJS entries export the named factory. Each entry also
exports the TypeScript types `LeptrisSyncBinding`, `LeptrisElement` and
`LeptrisNode`, so custom loaders can implement the structural contract.
The binding must supply `loadSync(input)`, `treeSync(id)` and `closeSync(id)`.
The adapter closes each loaded document even when snapshot retrieval or tree
conversion fails. It copies own namespace declarations and attributes in order;
element namespace resolution comes from Leptris's snapshot. Parser factories
hold their own binding, with no global backend setting.

Leptris's XML semantics apply to whitespace, malformed input and encodings.
The consumer reuses the native reader's Moxml named-entity marking before
parsing and restores references in text and ordinary attributes. CDATA,
comments, processing instructions and namespace values retain the markers,
as they do in the native reader. Unexpected unexpanded entity nodes are
refused; there is no native-reader fallback. Parse failures use `ParseError`.

After building the actual Leptris WASM and JavaScript binding, run:

```sh
node scripts/probe-leptris.mjs /absolute/path/to/leptris/js/index.js
pnpm build
node scripts/probe-leptris.mjs /absolute/path/to/leptris/js/index.js --built
node scripts/probe-leptris.mjs /absolute/path/to/leptris/js/index.js --built-cjs
```

The probe uses the existing esbuild dev dependency and loads
the supplied real binding. For every MathML and OMML corpus fixture it compares
normalized formula trees and outcomes from all six renderers, or compares parse
refusal. Unexpected renderer exceptions fail the probe; matching documented
Plurimath errors are reported separately from successful outputs. The built modes
exercise the emitted ESM and CommonJS optional entry points.
The OMML fixture `omml-d99118b62c4a` includes undeclared `&nbsp;` references
and is included in the parity comparison through consumer entity marking.
The final JSON reports total, accepted, refused and excluded rows, plus successful
output and refusal counts for each renderer.
Non-corpus fixture groups are outside this probe's scope.

Additional cases cover prefixed and mixed namespaces, namespace undeclaration
and shadowing, CDATA, comments, numeric and predefined entities, malformed XML,
and handle cleanup after snapshot failure. `test/experimental/leptris.spec.ts`
checks adapter lifecycle and translator wiring with injected snapshots; those
unit checks alone do not prove compatibility with the real WASM binding.

`pnpm gate:package` builds and imports both optional entries as ESM and CJS,
checks their runtime export surfaces and declaration resolution, and inspects
their artifacts. Each optional entry may contain its own format and generated
tables, core and XML modules; opposite formats, PEG parsers, locale data,
renderers, external runtime imports and bundled dependencies are forbidden.
The required-source policies ensure the reader and actual format translator
survive in each artifact.
