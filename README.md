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

Early development. Nothing is published to npm under this name yet, and the
package is still `private`; the name it will publish under is an open decision
([open-decisions.md](TODO.plan/open-decisions.md#npm-package-name-and-release-line)).

Measured against the built package (`pnpm build`, then `dist/`):

- Parsers exist for AsciiMath, LaTeX, HTML and UnicodeMath. There is no MathML
  or OMML parser.
- Renderers exist for all six output formats: AsciiMath, LaTeX, MathML, HTML,
  UnicodeMath and OMML.
- Seven package subpaths are built: `./core`, `./asciimath`, `./latex`,
  `./mathml`, `./html`, `./omml` and `./unicodemath`, plus the root entry and a
  `plurimath` executable.
- `./html` renders all 89 pinned corpus cases the gem renders, 88 of them
  byte-identical (the 89th, `text-unitsml-valid`, differs by decision; see
  `test/formats/html/parity-target.ts`). The corpus is not the whole language:
  a construct it does not cover can still raise `RenderError`, for example
  `cancel(x)` in `./html` and `./omml`.
- The UnicodeMath parser covers part of the gem's grammar. Input outside what it
  supports raises `ParseError` rather than returning a wrong model (see
  [Not yet supported](#not-yet-supported)).

Correctness is gated rather than asserted: a registry of quality gates activates
in milestones. The current one is recorded as `currentMilestone` in
[`gates.json`](gates.json), and is P2.

- [`TODO.plan/`](TODO.plan/) — every phase from here to 1.0, what each
  contains, and which decisions are still open.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the code is structured and what
  proves it correct.

## Usage

The package is not published, so the specifiers below are the ones
`package.json` declares (`@plurimath/plurimath-ts`); they resolve from a local
build (`pnpm build`), not from npm. The snippets in this section were run
against `dist/` (the CLI file example assumes a `formula.txt` you create), and both the ESM (`import`) and CommonJS (`require`) entries
are built.

### Input and output formats

| Format | Read (parse) | Write (render) | Subpath |
|---|---|---|---|
| AsciiMath | `parseAsciimath` | `toAsciimath` | `./asciimath` |
| LaTeX | `parseLatex` | `toLatex` | `./latex` |
| HTML | `parseHtml` | `toHtml` | `./html` |
| UnicodeMath | `parseUnicodemath` (partial grammar) | `toUnicodemath` | `./unicodemath` |
| MathML | not available | `toMathml` | `./mathml` |
| OMML | not available | `toOmml` | `./omml` |

Each parser returns a `FormulaNode` (from `./core`); each renderer takes one.
There is no root-level `parse(input, format)` function: `ARCHITECTURE.md` §4
describes one, but the root entry does not export it (see
[open-decisions.md](TODO.plan/open-decisions.md#root-parse-function)).

### Per-format subpaths

```js
import { parseAsciimath } from "@plurimath/plurimath-ts/asciimath";
import { toLatex } from "@plurimath/plurimath-ts/latex";

toLatex(parseAsciimath("x^2 + frac(1)(2)")); // x^{2} + \frac{1}{2}
```

Converting the other way, `parseLatex("\\frac{1}{2}")` rendered with
`toAsciimath` gives `frac(1)(2)`. Subpaths are built so that importing one
does not pull in the other formats' renderers (`pnpm gate:package` inspects the
built artifacts for this); only the root entry is batteries-included.

### The compat class

The root entry also default-exports `Plurimath`, shaped after the
`plurimath-js` class: construct it from a string and a format, then call a
`to*` method.

```js
import Plurimath from "@plurimath/plurimath-ts";

const p = new Plurimath("x^2", "asciimath");
p.toLatex();       // x^{2}
p.toHtml();        // <i>x</i><sup>2</sup>
p.toUnicodemath(); // x^(2)
```

The constructor names six formats (`FORMATS`): `asciimath`, `latex`, `mathml`,
`html`, `unicode` and `omml`. Note `unicode`, not `unicodemath`. Four
construct (`asciimath`, `latex`, `html`, `unicode`); `mathml` and `omml` throw
`UnsupportedFormatError`, as does any unknown name, including `unicodemath`.
Methods: `toAsciimath`, `toLatex`, `toMathml`, `toHtml`, `toOmml`,
`toUnicodemath` all work; `toDisplay` and `toMathml(true)` throw
`UnsupportedFeatureError`.

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

The CLI does not strip a trailing newline from its input. `echo` therefore adds
one: measured, `echo 'x^2' | plurimath convert --from unicodemath --to latex`
fails with `ParseError`, and the same through `--from html` renders the newline
as `&#xa;` in the output. Use `printf` without `\n` for those two formats.

### Errors

All errors extend `PlurimathError` and carry a stable `code`; branch on `code`
rather than on `instanceof` where a caller may load two copies of the package.
Exported from `./core`:

```js
import { ParseError, UnsupportedFeatureError, UnsupportedFormatError } from "@plurimath/plurimath-ts/core";
```

| Class | `code` | Seen when |
|---|---|---|
| `ParseError` | `PARSE_ERROR` | input does not parse, e.g. `parseLatex("\\frac{1")` |
| `UnsupportedFormatError` | `UNSUPPORTED_FORMAT` | `new Plurimath("<math/>", "mathml")` |
| `UnsupportedFeatureError` | `UNSUPPORTED_FEATURE` | `toDisplay(...)`, `toMathml(true)` |
| `RenderError` | `RENDER_ERROR` | a node the renderer refuses, e.g. `toOmml(parseAsciimath("cancel(x)"))` |

`ParseError` and `RenderError` are different failures: the first means the
input was not read, the second means it was read and this renderer will not
write it. `ParseOptionError` (`PARSE_OPTION_ERROR`) and
`MissingSymbolDataError` (`MISSING_SYMBOL_DATA`) also exist in `./core`.

### Not yet supported

- Reading MathML or OMML (no parser; the compat constructor and the CLI refuse
  them).
- `Plurimath#toDisplay` and `toMathml(true)`.
- A root `parse()` function.
- UnicodeMath input beyond the grammar slice ported so far: unmatched rules
  raise `ParseError`.
- UnitsML: `unitsml(kg)` is treated as ordinary text, by decision.
- Constructs the renderers have not measured (for example `cancel(x)` in
  `./html` and `./omml`) raise `RenderError`.

## Development

Building needs Node `^22.18.0 || >=24.11.0` (the range tsdown declares; Node 23
does not satisfy it). [`mise.toml`](mise.toml) pins Node 24. The published
package will support Node 20 and later at runtime, which is what CI's runtime
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
