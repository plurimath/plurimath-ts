# P0 — Foundation

**Status: done.** Scaffolding, quality gates, and the parser core. No format
work: this phase exists so that everything after it is checked by machinery
that already works.

## What it delivers

**Tooling.** TypeScript 7 (strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), Biome, Vitest, pnpm, and tsdown building one
physical entry per published subpath with `platform: "neutral"` so browser
bundlers are first-class.

**Gate registry.** `gates.json` records every executable gate, its class, and
the milestone that activates it; `scripts/check.mjs` runs the active ones. A
gate that should be active but cannot run **fails**; one that is not yet active
reports as inactive. Nothing is ever silently skipped.

**Layer boundaries.** `.dependency-cruiser.cjs` encodes the seven dependency
rules from `ARCHITECTURE.md` §3, wrapped by `scripts/gate-boundaries.mjs`.

**Packaging.** `scripts/gate-package.mjs` builds, packs, and inspects the real
artifacts: each subpath loads under ESM and CJS with matching named exports,
its bundle graph contains only what it is allowed to, and `publint` plus
`@arethetypeswrong/cli` pass on the tarball.

**pegkit.** The Parslet work-alike, with all three lock conditions met: a
conformance suite asserting Parslet 2.0.0's observed behaviour, the primitives
later grammars need (`any`, `present?`, capture `scope`), and stack safety.
Plus `SourceMap`, so a reported offset indexes the caller's input rather than
the preprocessed form.

**Model layer.** The error hierarchy with stable `code` discriminators, and the
`onUnsupported` diagnostics channel with deduplication.

## Why here

Gates before code. Every later phase changes behaviour that something must
check, and a check written after the fact tends to be shaped around the code it
is meant to judge.

## Risks and notes

Three defects surfaced while building, all caught by the gates before delivery:

- `Atom.then()` made every atom look *thenable*, so `await someAtom` would have
  called it with a resolve function. Renamed to `andThen()`.
- `depcruise src` cruised **zero** modules and reported success — a gate that
  checked nothing. It now takes an explicit glob, and the wrapper fails on a
  zero-module run so this cannot recur.
- The `exports` map claimed `.mjs` while tsdown correctly emits `.js` for ESM
  under `"type": "module"`. The packaging gate caught it.

The last two are the argument for building gates before code rather than after.

## Exit criteria

- [x] `pnpm check` green at milestone `P0`: types, lint, boundaries, unit
      tests, package isolation.
- [x] 37 tests passing; 9 modules boundary-checked.
- [x] Build produces ESM, CJS and declarations for the root and `/core`
      entries.
