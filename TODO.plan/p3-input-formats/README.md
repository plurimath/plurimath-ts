# P3 — The other input formats

**Status: planned.** LaTeX, UnicodeMath and HTML parsers. Each is locked by its
own corpus before the next begins.

Each format opens as its own directory here (`latex/`, `unicodemath/`,
`html/`) with numbered work items when it starts.

## What it delivers

Every input format the gem supports, so any source notation can be read into
the shared model. Measured in the gem's `lib/plurimath/`:

| Format | Grammar | Parser total | Notes |
|---|---|---|---|
| LaTeX | 281 lines | ~1.7k | Largest grammar; most familiar syntax |
| UnicodeMath | 297 lines | ~6.4k | Bulk is data tables, not logic |
| HTML | 219 lines | ~0.9k | Smallest surface |

## Why here

**LaTeX first** — the widest real-world demand, and its grammar exercises
pegkit hardest, so any remaining engine gaps surface while there is still
appetite to fix them. **UnicodeMath second**: comparable grammar size, but most
of its bulk is tables, which are generated rather than written. **HTML last**,
being the smallest and least used.

Each phase has the same shape as P1, which is the point of doing P1 as a full
vertical first:

1. Extend the corpus generator to the new input format.
2. Port the grammar rule-for-rule from the gem's `parse.rb`.
3. Port the transform rule-for-rule from its `transform.rb`.
4. Confirm the node census — the union already includes kinds no earlier format
   produced, so this is usually confirmation rather than addition.
5. Corpus, negative cases, isolation assertions, review round.

## Risks and notes

- **pegkit gaps.** The primitives these grammars need beyond AsciiMath's —
  `any`, `present?`, capture `scope` — are implemented and conformance-tested,
  but unexercised by a real grammar until here.
- **Shared model pressure.** A later format may want a node shape that
  contradicts an earlier assumption. The census-driven union is the guard, but
  a genuine conflict means changing `ARCHITECTURE.md` first.
- **UnicodeMath table volume.** Generation must handle it; hand-porting is not
  on the table.

## Exit criteria

Per format:

- [ ] Parse-tree, normalized-model and rendered-output parity across its corpus.
- [ ] Non-empty rejection corpus passing.
- [ ] Isolation assertions for its subpath.
- [ ] Review round with findings resolved, and sign-off recorded.
