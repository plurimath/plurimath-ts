# plurimath-ts

Native TypeScript implementation of [Plurimath](https://github.com/plurimath/plurimath):
a common data model for mathematical representation languages, with parsers and
renderers for AsciiMath, LaTeX, MathML, OMML, UnicodeMath, and HTML.

It replaces the Opal-compiled [`plurimath-js`](https://github.com/plurimath/plurimath-js)
over time. The Ruby gem remains the source of truth: correctness is proven
against a conformance corpus generated from it, so behaviour cannot drift
silently.

> **Status: early development.** The foundation — parser engine, model layer,
> and quality gates — is in place. No input or output format has landed yet, so
> there is nothing to install from npm.

## Design

[`ARCHITECTURE.md`](ARCHITECTURE.md) records the design and the reasoning
behind it: module layering, the two API surfaces, how symbol data is generated,
how conformance is proven, and what is deliberately not built.

The short version:

- **Ruby is the oracle.** Every case in the corpus is generated from the gem;
  the parse tree, the model, and each rendered output must match it.
- **Formats are independent modules.** Renderers are functions, not methods on
  nodes, so a page that converts AsciiMath to MathML never downloads the LaTeX
  or OMML code. Enforced by a gate that inspects the packed artifacts.
- **Symbols are data.** 69% of the Ruby gem is symbol definitions; those are
  generated, not hand-ported.

## Planned API

Two surfaces, one implementation. Per-format functions, for bundle-conscious
consumers:

```ts
import { parseAsciimath } from "@plurimath/plurimath-ts/asciimath";
import { toMathml } from "@plurimath/plurimath-ts/mathml";

toMathml(parseAsciimath("sum_(i=1)^n i^3"));
```

And a `plurimath-js`-compatible class, so existing code migrates by changing
one import:

```ts
import Plurimath from "@plurimath/plurimath-ts";

new Plurimath('ubrace(1+2+3+4)_("4 terms")', "asciimath").toLatex();
```

## Development

Requires Node 22.18+ (or 24+) to build; the published package supports Node 20+.

```sh
pnpm install
pnpm check       # every quality gate active at the current milestone
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome
pnpm build       # tsdown -> dist (ESM + CJS + types)
```

`pnpm check` reads [`gates.json`](gates.json), which records every quality gate
and the milestone at which it starts blocking. Gates are registered from the
start and report as inactive until then, so nothing is ever silently skipped.

## Copyright and license

Copyright Ribose. BSD 2-clause license.
