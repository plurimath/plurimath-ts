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
  - **Symbol comparison must match `comparable_value`.** `Symbols::Symbol#==`
    does not compare `value` directly; it compares `comparable_value`, which
    decodes HTML entities and falls back to the symbol's own rendering when
    `value` is nil. Three cases the gem calls equal and a naive string
    comparison does not — all verified against the gem by running it:

    | Comparison | Gem |
    |---|---|
    | `Plus(nil)` vs `Plus("+")` | equal |
    | `Pi("&pi;")` vs `Pi("π")` | equal |
    | `Pi(nil)` vs `Pi("&#x3c0;")` | equal |

    Two things are needed. **The entity table**: generate the gem's 253
    `xhtml1` entries rather than picking a table or taking a JavaScript
    library — `he` and `entities` implement the larger HTML5 set and decode
    `&half;`/`&sung;`, which the gem leaves untouched, so they trade our bug
    for its mirror image. Numeric entities already agree and always will.
    **The canonical fallback**: a generated `id → canonical value` map under
    `src/core/generated/`, read at *comparison* time.

    Do **not** materialize the canonical value in the constructor. Ruby's
    `Symbol.new` genuinely stores `nil`, so filling it in at build time breaks
    corpus parity. Ruby resolves lazily and so must we.

    `Symbol#==` also requires `object.class == self.class`, whose equivalent
    here is `id`: two symbols sharing a canonical character but differing in
    `id` stay unequal.
  - `node.equals(other)` must exist as a method, not only as a module function
    (ARCHITECTURE.md §4). A private base in `nodes.ts` with `equality.ts`
    keeping a facade satisfies both that and the import rules.
- `src/core/normalize.ts` — the normalized-model serialization the corpus
  compares against Ruby's.
- Abstract bases from the census are recorded but are not union members.

## Done when

- [x] `MathNode` covers every concrete kind in the census.
- [x] `equals()` agrees with the gem on Ruby-derived equal and unequal pairs,
  including the three `comparable_value` cases above. The known-divergence
  block in `test/core/equality.spec.ts` is deleted, not amended.
- [x] `node.equals(other)` works as a method on every node class.
- [x] Constructors materialize Ruby's assigned defaults, and `normalize` still
  distinguishes assigned-`nil` from never-assigned.
- [x] A round trip through `normalize` matches the gem's serialization for the seed
  corpus.
- [x] `pnpm boundaries` reports `core` importing nothing from another layer.
  `core/generated/` is core's own data and is expected (§3 rule 1).
