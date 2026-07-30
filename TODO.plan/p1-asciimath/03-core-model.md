# TODO 3 — Build the core model from the generated census

## Why
Everything downstream — parsers produce it, renderers consume it, the corpus
compares it — depends on the node model, so it lands before either side.

It is declared from the census (TODO 1) rather than from whatever AsciiMath
happens to need, because widening an exported exhaustive union after
publication breaks consumers. Kinds no landed format produces yet are included
now; renderers may reject them with `RenderError`, but may not omit their case
(ARCHITECTURE.md §5).

## Scope
- `src/core/nodes.ts` — one class per concrete node kind from the census, each
  with a `readonly kind` discriminant and the union `MathNode`.
  - Structure only: parameters, values, `equals()`. No `toX` methods, no
    imports from `formats/`, `xml/`, or `pegkit/`.
  - Publicly immutable: `readonly` fields, no setters. Constructors are public
    and permissive (no validation), and shallow-copy array and options
    arguments (§5).
- `src/core/equality.ts` — the generated **equality projection**, mirroring
  Ruby's `==` per kind. Verified examples: `Formula#==` compares only `value`
  and `left_right_wrapper`; `Text#==` ignores `lang`. This is a *different,
  looser* equivalence than the normalized-model comparison the corpus uses —
  keep them apart.
- `src/core/normalize.ts` — the normalized-model serialization the corpus
  compares against Ruby's.
- Abstract bases from the census are recorded but are not union members.

## Done when

- [ ] `MathNode` covers every concrete kind in the census.
- [ ] `equals()` agrees with the gem on Ruby-derived equal and unequal pairs.
- [ ] A round trip through `normalize` matches the gem's serialization for the seed
  corpus.
- [ ] `pnpm boundaries` still reports `core` importing nothing internal.
