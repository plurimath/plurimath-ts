# Experimental Leptris input

`src/experimental/leptris.ts` connects an initialized Leptris binding to the
existing MathML and OMML element layers, translators and formula trees. It is
a source-level experiment, outside the package exports. Public parsers keep
the native reader, and no WASM dependency is added.

```ts
import * as leptris from "/path/to/built/leptris/index.js";
import { createLeptrisParsers } from "./src/experimental/leptris";
import { toMathml } from "./src/formats/mathml/index";

await leptris.init();
const parser = createLeptrisParsers(leptris);
const formula = parser.parseMathml("<math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>");
console.log(toMathml(formula));
```

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
```

The probe bundles source with the existing esbuild dev dependency and loads
the supplied real binding. For every MathML and OMML corpus fixture it compares
normalized formula trees and both XML output formats, or compares parse refusal.
The OMML fixture `omml-d99118b62c4a` includes undeclared `&nbsp;` references
and is included in the parity comparison through consumer entity marking.
The final JSON reports total, accepted, refused and excluded rows.
Non-corpus fixture groups are outside this probe's scope.

Additional cases cover prefixed and mixed namespaces, namespace undeclaration
and shadowing, CDATA, comments, numeric and predefined entities, malformed XML,
and handle cleanup after snapshot failure. `test/experimental/leptris.spec.ts`
checks adapter lifecycle and translator wiring with injected snapshots; those
unit checks alone do not prove compatibility with the real WASM binding.
