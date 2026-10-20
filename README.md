# Plurimath TypeScript

## Purpose

Plurimath provides a common data model for mathematical representation
languages and allows conversion between them. This is its native TypeScript
implementation, replacing the Opal-compiled
[`plurimath-js`](https://github.com/plurimath/plurimath-js).

Target math representational languages:

- [MathML 3](https://www.w3.org/TR/MathML3/) (and [MathML 4](https://www.w3.org/TR/mathml4/))
- [AsciiMath](https://www.asciimath.org)
- [UnicodeMath](http://unicodemath.org) ([UnicodeMath v3.2](https://www.unicode.org/notes/tn28/UTN28-PlainTextMath-v3.2.pdf))
- LaTeX math
- Microsoft Office Math Markup Language (OMML, ["OfficeMath"](https://devblogs.microsoft.com/math-in-office/officemath/))
- HTML

The [Ruby gem](https://github.com/plurimath/plurimath) remains the source of
truth. Correctness is proven against a conformance corpus generated from it —
parse tree, model, and every rendered output must match — so the two cannot
drift apart silently.

## Status

The initial release is `plurimath-ts@0.1.0`, with native TypeScript parsers
and renderers for all six formats. This release exposes format subpaths within
one npm package. Separate language packages and remaining shared-fixture
organization are deferred.

The current source and package entries provide:

- Parsers exist for all six formats, exposed on their subpaths and through
  the root `parse` function and compat constructor.
- Renderers exist for all six output formats: AsciiMath, LaTeX, MathML, HTML,
  UnicodeMath and OMML.
- Nine package subpaths are built: `./core`, `./asciimath`, `./latex`,
  `./mathml`, `./html`, `./omml`, `./unicodemath`, `./mathml/leptris` and
  `./omml/leptris`, plus the root entry and a `plurimath` executable. The two
  Leptris entries require a caller-initialized binding, as described below.
- The HTML parity fixture covers 664 gem-renderable cases written in
  AsciiMath, LaTeX, UnicodeMath, MathML or OMML. All 664 now match, including
  the six MathML text cases that previously refused Unicode substitutions
  (see `test/formats/html/parity-target.ts`). Native UnitsML expansion replaces
  the former `text-unitsml-valid` plain-text divergence. The corpus is not the
  whole language:
  a construct it does not cover can still raise `RenderError`, for example
  `cancel(x)` in `./html` and `./omml`.
- UnicodeMath input uses the pinned gem's grammar and 484 reachable transform
  rules. The other 35 rules have source-based unreachability proofs (see
  [rule reachability](docs/unicodemath-rule-reachability.md)). The parser
  preserves raw trees that Ruby leaves unmatched; those models may refuse
  rendering in both implementations. Conformance is measured against the
  generated fixtures, rather than inferred from the rule count.

Correctness is gated rather than asserted: a registry of quality gates activates
in milestones. The current one is recorded as `currentMilestone` in
[`gates.json`](gates.json), and is P2.

- [`TODO.plan/`](TODO.plan/) — every phase from here to 1.0, what each
  contains, and which decisions are still open.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the code is structured and what
  proves it correct.

## Usage

Install the package with Node.js 22 or later:

```sh
npm install plurimath-ts
```

Both ESM (`import`) and CommonJS (`require`) entries are provided. The CLI file
example assumes a `formula.txt` you create.

### Input and output formats

| Format | Read (parse) | Write (render) | Subpath |
|---|---|---|---|
| AsciiMath | `parseAsciimath` | `toAsciimath` | `./asciimath` |
| LaTeX | `parseLatex` | `toLatex` | `./latex` |
| HTML | `parseHtml` | `toHtml` | `./html` |
| UnicodeMath | `parseUnicodemath` | `toUnicodemath` | `./unicodemath` |
| MathML | `parseMathml` | `toMathml` | `./mathml` |
| OMML | `parseOmml` | `toOmml` | `./omml` |

Each parser returns a `FormulaNode` (from `./core`); each renderer takes one.
The root also exports `parse(input, format, options?)`, returning a
`FormulaNode`. It uses the compat format tokens: `asciimath`, `latex`, `html`,
`unicode`, `mathml` and `omml` (`unicode`, not `unicodemath`). Text formats
accept their existing `locale` and `onUnsupported` options; MathML and OMML
accept absent, `null` or empty options and reject nonempty option keys with
`ParseOptionError`. The exported `ParseOptions<F>` type selects the options
for format `F`; the compat constructor keeps its existing two arguments.

```js
import { parse } from "plurimath-ts";
const formula = parse("1,5", "asciimath", { locale: "de" });
```

### Per-format subpaths

```js
import { parseAsciimath } from "plurimath-ts/asciimath";
import { toLatex } from "plurimath-ts/latex";

toLatex(parseAsciimath("x^2 + frac(1)(2)")); // x^{2} + \frac{1}{2}
```

Converting the other way, `parseLatex("\\frac{1}{2}")` rendered with
`toAsciimath` gives `frac(1)(2)`. Subpaths are built so that importing one
does not pull in the other formats' renderers (`pnpm gate:package` inspects the
built artifacts for this); only the root entry is batteries-included.

### Optional Leptris XML input

`./mathml/leptris` and `./omml/leptris` expose parser factories for an
already initialized Leptris binding. The regular package and format entries
use the native reader and do not require a Leptris installation. The optional
entries also leave loading and initialization of WASM to your application.

This requires the structured-tree binding API added in
[leptris-ts#9](https://github.com/leptris/leptris-ts/pull/9), backed by an
engine containing [leptris#1742](https://github.com/leptris/leptris/pull/1742).
Both changes are merged. Published `leptris@0.1.16` still lacks the required
WASM tree export; [leptris-ts#21](https://github.com/leptris/leptris-ts/pull/21)
tracks that build fix. With a binding containing the export fix:

```js
import * as leptris from "leptris";
import { createMathmlParser } from "plurimath-ts/mathml/leptris";
import { createOmmlParser } from "plurimath-ts/omml/leptris";
import { toMathml } from "plurimath-ts/mathml";

await leptris.init();
const parseMathml = createMathmlParser(leptris);
const parseOmml = createOmmlParser(leptris);
const formula = parseMathml("<math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>");
console.log(toMathml(formula));
```

Both factories return synchronous parsers with the usual `FormulaNode` result
and `ParseError` failures. Creating a parser does not initialize the binding
or load XML. Each parse closes its document after copying the tree, including
when snapshot retrieval fails. There is no native-reader fallback. Plurimath
keeps its named-entity compatibility in the adapter; other XML semantics come
from Leptris. See [the integration notes](docs/leptris-experiment.md) for the
binding contract and real-WASM verification command.

### The compat class

The root entry also default-exports `Plurimath`, shaped after the
`plurimath-js` class: construct it from a string and a format, then call a
`to*` method.

```js
import Plurimath from "plurimath-ts";

const p = new Plurimath("x^2", "asciimath");
p.toLatex();       // x^{2}
p.toHtml();        // <i>x</i><sup>2</sup>
p.toUnicodemath(); // x^(2)
```

The constructor names six formats (`FORMATS`): `asciimath`, `latex`, `mathml`,
`html`, `unicode` and `omml`. Note `unicode`, not `unicodemath`. All six
construct (`asciimath`, `latex`, `html`, `unicode`, `mathml`, `omml`);
any name the gem rejects, including `unicodemath`,
throws `InvalidTypeError`.
Methods: `toAsciimath`, `toLatex`, `toMathml`, `toHtml`, `toOmml`,
`toUnicodemath` all work. `toMathml(true)` renders the gem's `intent`
attributes (#136). `toDisplay(lang)` returns the gem's tree dump (#139, #150),
throws `InvalidTypeError` for a `lang` the gem rejects (`html`, `unicode`), and
throws `UnsupportedFeatureError` for the few node kinds it refuses
(`src/compat/to-display.ts`, module doc).

### Command line

`pnpm build` produces `dist/cli.mjs`, which `package.json#bin` exposes as
`plurimath`. Run it directly with `node dist/cli.mjs`, or as `plurimath` once
the package is linked or installed.

```sh
plurimath convert --from asciimath --to latex formula.txt
printf 'frac(1)(2)' | plurimath convert --from asciimath --to mathml
```

`--from` accepts `asciimath`, `latex`, `html`, `unicodemath`; `--to` accepts
those plus `mathml` and `omml`. Input comes from the file argument, or from
stdin when there is none. Exit codes: `0` success, `2` usage error (missing or
unknown option or format, unknown command), `1` for anything else (unreadable
file, `ParseError`, `RenderError`). Conversion errors print as
`plurimath: [CODE] message` on stderr; usage and file-read errors print
`plurimath: <message>` without a code. The only command is `convert`, and there is no `--version`.

Render options, named as in the gem's `plurimath convert` where it has them:

- `--display-style <true|false>` sets the display style of `mathml` and
  `omml` output. It defaults to `true`, as the gem's command does.
- `--split-on-linebreak` splits `mathml` and `omml` output at each line break.
- `--intent` adds intent attributes to `mathml` output (the gem's command has
  no such flag; this is `toMathml`'s `intent` option).
- `--math-rendering` prints the formula's display tree for the `--to` format
  (`toDisplay`) instead of converting; `html` has no display tree.

An option that does not apply to the `--to` format is ignored. The switches
take no value, unlike the gem's, where `--split-on-linebreak false` still
splits. There is no flag for the number formatter yet.

The CLI strips one trailing newline (`\n` or `\r\n`) from its input, so
`echo 'x^2' | plurimath convert --from unicodemath --to latex` prints `x^{2}`.
Only that final newline is removed; any other whitespace reaches the parser
unchanged.

### Errors

All errors extend `PlurimathError` and carry a stable `code`; branch on `code`
rather than on `instanceof` where a caller may load two copies of the package.
Exported from `./core`:

```js
import { ParseError, UnsupportedFeatureError, UnsupportedFormatError } from "plurimath-ts/core";
```

| Class | `code` | Seen when |
|---|---|---|
| `ParseError` | `PARSE_ERROR` | input does not parse, e.g. `parseLatex("\\frac{1")` |
| `UnsupportedFormatError` | `UNSUPPORTED_FORMAT` | a recognized operation without a native implementation |
| `InvalidTypeError` | `INVALID_TYPE` | `new Plurimath("x", "asciimath").toDisplay("html")` |
| `UnsupportedFeatureError` | `UNSUPPORTED_FEATURE` | `new Plurimath("mathbf(x)", "asciimath").toDisplay("unicodemath")` |
| `RenderError` | `RENDER_ERROR` | a node the renderer refuses, e.g. `toOmml(parseAsciimath("cancel(x)"))` |

`ParseError` and `RenderError` are different failures: the first means the
input was not read, the second means it was read and this renderer will not
write it. `ParseOptionError` (`PARSE_OPTION_ERROR`) and
`MissingSymbolDataError` (`MISSING_SYMBOL_DATA`) also exist in `./core`.

### Not yet supported

- MathML or OMML input in the CLI; its `--from` formats remain AsciiMath,
  LaTeX, HTML and UnicodeMath.
- `evaluate()` of `Sinh`, `Cosh`, `Sech` and `Csch` where the platform C
  library's `exp`, which they call for `|x| >= 22` (`cosh` from `ln2/2`), is
  inside its rounding band, such as `sinh(22)`: they raise
  `UnsupportedFeatureError` (`src/evaluation/libm-hyperbolic.ts`).
- `evaluate()` of `Lg` where the `log` that glibc's `log10` calls lies inside
  `log`'s rounding band and the answer depends on its rounding, such as
  `\lg(0.214)`: it raises `UnsupportedFeatureError`
  (`src/evaluation/libm.ts`).
- Standalone UnitsML input is not a public parse format. Use quoted inline
  AsciiMath, such as `parse('"unitsml(kg)"', "asciimath")`; all six renderers
  accept nested `unitsml` options.
- Constructs the renderers have not measured (for example `cancel(x)` in
  `./html` and `./omml`) raise `RenderError`.

## Development

Building needs Node `^22.18.0 || >=24.11.0` (the range tsdown declares; Node 23
does not satisfy it). [`mise.toml`](mise.toml) pins Node 24. The published
package will support Node 22 and later at runtime, which is what CI's runtime
matrix covers.

If nvm's Node 20 comes first on `PATH`, `pnpm build` fails with
`Failed to import module "unrun"` (measured with Node 20.20.2, exit 1). It is
a `PATH` problem, not a repository bug: put a Node 24 first on `PATH` and check
`node -v` before building. (`mise x -- pnpm build` did not fix it in the
measured setup, where `pnpm` itself was found through nvm.)

```sh
pnpm install
git submodule update --init   # the conformance corpus lives in a submodule
pnpm check       # every class-A gate active at the current milestone
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome
pnpm boundaries  # dependency-cruiser layering rules
pnpm build       # tsdown -> dist (ESM + CJS + type declarations + CLI)
pnpm gate:package  # checks the built package's published surface (run after build)
```

`pnpm check` reads [`gates.json`](gates.json), which records every quality gate
and the milestone at which it starts blocking. Gates are registered before the
project relies on them and report as inactive until then, so nothing is
silently skipped.

Class-B gates are the exception, and are not run by `pnpm check`. The
Ruby-and-Git unit gate runs in every pull request through
`pnpm test:oracle-unit`; it needs no oracle checkout or gem bundle. Oracle
integration gates need a clean Ruby gem checkout and its bundle; they run through
[`scripts/gate-oracle.rb`](scripts/gate-oracle.rb). Which gates are active
depends on the milestone, like every other gate.

## Copyright and license

Copyright Ribose. BSD 2-clause license.
