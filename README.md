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

Early development. The AsciiMath vertical has landed — corpus, model, grammar
and transform — along with four renderers, exported as the `./asciimath`,
`./latex`, `./mathml` and `./unicodemath` subpaths. The package is still `private`, and nothing
is published to npm under this name yet.

Correctness is gated rather than asserted: a registry of quality gates activates
in milestones. The current one is recorded as `currentMilestone` in
[`gates.json`](gates.json), and is P1-completion.

- [`TODO.plan/`](TODO.plan/) — every phase from here to 1.0, what each
  contains, and which decisions are still open.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the code is structured and what
  proves it correct.

## Development

Requires Node `^22.18.0 || >=24.11.0` to build — the range tsdown itself
declares, so it is not a simple lower bound and Node 23 does not satisfy it. The
published package will support Node 20 and later, which is what CI's runtime
matrix covers.

```sh
pnpm install
pnpm check       # every class-A gate active at the current milestone
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome
pnpm build       # tsdown -> dist (ESM + CJS + type declarations)
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
