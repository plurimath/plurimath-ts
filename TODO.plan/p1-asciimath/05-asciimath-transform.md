# TODO 5 — Port the AsciiMath transform to pegkit

## Why
`lib/plurimath/asciimath/transform.rb` is **149 pattern rules** (measured:
`rg '^\s*rule\(' | wc -l`), plus 3 from the base-number-prefix mixin — the
single largest piece of AsciiMath logic. Ported rule-for-rule, in the same
order, for the same reason as the grammar.

**The corpus alone cannot test this item.** Instrumenting Parslet's rule
registry and running the corpus of the day — 70 inputs — through the gem fired
well under half of the 152 rules, leaving most of them unexercised. That was the
measurement which motivated this item; it has not been reproduced against the
current corpus, which has grown to 91 positive cases across 18 payloads, and the
exact fired-rule count is not carried here because re-deriving it needs an
instrumented oracle run that has no committed runner. So corpus parity is necessary
but not sufficient here, and the differential sweep below is an acceptance
criterion, not an extra.

Three Parslet behaviours the port must honour: rules match in **reverse
definition order** (on a tie, the later-defined rule wins), a pattern matches
only when its key set is **exactly** the node's key set, and **a rule's
replacement is never visited again**. All three were verified against parslet
2.0.0, implemented in `src/pegkit/transform.ts`, and covered by
`test/pegkit/transform.spec.ts`, which has a
describe block each for rule order, exact key-set matching, and a replacement
never being revisited. Pinning them was part of this item, because 149 rules in
one file is exactly where a silent order change hides.

Two traps, both measured against the gem rather than inferred:

- **Recorded parse trees are not a usable transform input.** Corpus
  serialization flattens `Parslet::Slice` into plain strings, and rules
  branch on `text.is_a?(Slice)` — feeding a recorded tree back produces a
  string where the gem produces `Math::Function::Text`. The only honest test
  path is end-to-end: preprocessed input → TS grammar → TS transform →
  normalize, compared against the recorded `model`.
- **Mutation is behaviour.** Rules do `numerator.value.shift`, `power.shift`,
  `expr.insert` — replacing these with immutable expressions changes later
  values inside the same action, and mutating finished nodes breaks §5's
  immutability contract. Actions therefore work on transform-local mutable
  drafts and finalize on return.

## Scope
- `src/formats/asciimath/transform.ts` — every rule from `transform.rb`, in the
  same order, including the shared base-prefix number rules.
- `src/formats/asciimath/registry.ts` — an **immutable** map from class name to
  node constructor, replacing Ruby's `Utility.get_class`. Built from explicit
  imports at module scope; no mutable registry, no late-bound references, so
  importing the module has no observable effect (§3, rule 7).
- Port the AsciiMath-specific helpers from `asciimath/utility.rb`
  (`td_values`, `td_value`, `frac_values`, `asciimath_symbol_object`) — note
  they shadow the generic `Utility` in Ruby, so the AsciiMath versions win.
- Transforms assemble nodes through transform-local builders and finalize into
  immutable nodes before `parse` returns; no mutable intermediate escapes the
  module (§5).
- Drop the `unitsml` rules: the grammar can no longer produce those shapes.

## Done when

- [ ] For every **reachable** pinned corpus case, end-to-end (preprocess → grammar →
  transform → normalize) matches the gem's recorded `model`. Never by feeding
  recorded trees to the transform — see above.
- [ ] **Differential model parity beyond the corpus**: the grammar's two
  sweeps (length 1–3 exhaustive, length 4–26 seeded) extended through the
  transform — gem model and port model compared for every input the gem
  accepts, zero mismatches. This is what reaches the rules the corpus does not.
- [ ] `registry.ts` completeness is checked, not assumed: every class name
  reachable from `transform.rb`'s actions resolves in the registry, asserted
  against a generated list rather than by hand.
- [ ] The pegkit conformance suite gains transform tests: a later rule beating
  an earlier overlapping one on a tie, a pattern rejected because the node
  carries one key more, and a replacement not being re-visited. Each must be
  seen failing before it counts.
- [ ] `pnpm boundaries` shows `formats/asciimath` importing only `pegkit`, `core`,
  and its own generated data.
