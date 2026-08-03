# TODO 5 — Port the AsciiMath transform to pegkit

## Why
`lib/plurimath/asciimath/transform.rb` is ~95 pattern rules turning the parse
tree into model nodes, and it is the single largest piece of AsciiMath logic.
Ported rule-for-rule, in the same order, for the same reason as the grammar.

Two Parslet behaviours the port must honour: rules match in **reverse
definition order**, and a pattern matches only when its key set is **exactly**
the node's key set. Both were verified against parslet 2.0.0 and are
implemented in `src/pegkit/transform.ts` — but **no test covers either**. The
pegkit conformance suite has no transform test at all; the two rules survive
only as a comment at the top of that file. Pinning them is part of this item,
because ~95 rules in one file is exactly where a silent order change hides.

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

- [ ] For every pinned corpus case, the transformed model matches the gem's
  normalized serialization.
- [ ] The pegkit conformance suite gains transform tests: a later rule beating
  an earlier overlapping one, and a pattern rejected because the node carries
  one key more than the pattern. Both must be seen failing before they count.
- [ ] `pnpm boundaries` shows `formats/asciimath` importing only `pegkit`, `core`,
  and its own generated data.
