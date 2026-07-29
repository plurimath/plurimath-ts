# TODO 5 — Port the AsciiMath transform to pegkit

## Why
`lib/plurimath/asciimath/transform.rb` is ~95 pattern rules turning the parse
tree into model nodes, and it is the single largest piece of AsciiMath logic.
Ported rule-for-rule, in the same order, for the same reason as the grammar.

Two Parslet behaviours the port must honour, both verified against the gem and
already encoded in the pegkit conformance suite:
rules match in **reverse definition order**, and a pattern matches only when
its key set is **exactly** the node's key set.

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

- [ ] For every seed corpus case, the transformed model matches the gem's
  normalized serialization.
- [ ] `pnpm boundaries` shows `formats/asciimath` importing only `pegkit`, `core`,
  and its own generated data.
