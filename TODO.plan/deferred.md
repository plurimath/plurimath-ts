# Deferred

Work consciously postponed, so nothing is lost to memory. Three kinds:

- **Known divergences** — where we differ from the gem today, on purpose.
- **Upstream issues** — defects found *in* the Ruby gem, to report there.
- **Parked ideas** — worth doing, but not before 1.0.

Deferred *decisions* live in [open-decisions.md](open-decisions.md). The
difference: a decision is a question we have not answered; an entry here is an
answer we have given, whose work is scheduled later.

Every entry names the trigger that brings it back. "Later" without a trigger is
how things get missed.

## Known divergences

None open.

### Symbol equality parity — landed

**Done, in TODO 3.** `equals` implements Ruby's `comparable_value`, so the
three cases the gem calls equal — `Plus(nil)` vs `Plus("+")`, `Pi("&pi;")` vs
`Pi("π")`, `Pi(nil)` vs `Pi("&#x3c0;")` — are equal here too. The
known-divergence block in `test/core/equality.spec.ts` was **deleted**, as
planned, and replaced with the gem's real answers.

Two generated tables under `src/core/generated/`, both emitted by
`scripts/generate-core-data.rb`:

- `html-entities.ts` — `HTMLEntities::MAPPINGS["xhtml1"]`, the 253 entities the
  gem's default flavour decodes. Not a JavaScript entity library: `he` and
  `entities` implement the larger HTML5 set and decode `&half;`/`&sung;`,
  which the gem leaves as written.
- `symbol-canonical.ts` — symbol id → `default_value_for_comparison`
  (`to_unicodemath`) for 1,459 classes; `Symbol` and `Paren` have no fallback
  and are listed separately. Read at **comparison** time; materializing it in
  the constructor would make `normalize` emit a value where the gem emits nil.

Verified by running both sides: 30 hand-picked pairs and a sweep of 11,653
comparisons over all 1,461 symbol classes agree with the gem. The last
divergence — an entity the gem's decoder cannot encode, which `equals` used to
answer instead of raising — was closed on 2026-08-03: it now raises the same
`RangeError` the gem does (ARCHITECTURE.md §5, "Equality").

`ARCHITECTURE.md` §3 rule 1 was clarified to unblock this: layer 1 imports
nothing from *other* layers, and generated data a layer owns under its own
directory is part of that layer. No module gained a dependency; the previous
wording banned core from reading its own data, which was never the intent.

## Upstream issues

Defects in the Ruby gem, found while building the port. Both reproduce on a
clean checkout. Neither is worked around here — the corpus records the gem's
real behaviour, including its bugs.

### `intent: true` raises on a single `UpcaseDd`

```ruby
Plurimath::Math::Formula.new([Plurimath::Math::Symbols::UpcaseDd.new])
  .to_mathml(intent: true)   # => ParseError
```

`intent: false` works. Root cause: `formula.rb:649` dereferences a second node
that is not there, raising `NoMethodError`, which surfaces as `ParseError`.

### MathML input silently drops named entities

`<mi>&pi;</mi>` parses to a generic `Symbol`, not `Pi`.

`mathml/utility.rb:26,48` call `string_to_html_entity` *without* decoding first,
so `&pi;` becomes `&#x26;pi;` and misses the lookup. The symbol table has the
key — `Utility.symbols_class("&times;", lang: :mathml)` returns `Symbols::Times`
— the path mangles the string before it gets there. Reproduces identically under
both Ox and Oga. Same omission in `omml/utility.rb:30,96` and
`html/transform_utility.rb:53-57`. LaTeX and HTML input are unaffected.

## Parked ideas

### Entity handling in the P3 input parsers

Not an idea so much as a note that must survive to Phase 3. The gem normalises
named entities to hex on **input**, by composing two functions:

```ruby
string_to_html_entity(html_entity_to_unicode("&pi;"))   # => "&#x3c0;"
```

Four sites do this: `latex/parser.rb:27`, `html/parser.rb:29,31`,
`math/function/text.rb:117,147`, `mathml/utility.rb:13`. The LaTeX and HTML
parsers must mirror it or entity input diverges. AsciiMath does no entity
handling at all, which is why P1 is unaffected.

Hex is the gem's canonical form: across all 1,461 symbol classes there are 8,718
hex entities, 0 decimal, and 27 named — the named ones confined to six classes
(`Times`, `Cdot`, `Greater`, `Gt`, `Less`, `Lt`) as hand-added aliases.

### The locale table is hand-typed

**Trigger: before P1-completion, or the first gem bump — whichever comes
first.**

`src/formatting/locales.ts` holds the gem's 96 locale → decimal-marker entries,
transcribed by hand and verified against the gem once (all 96, plus 14 edge
inputs, 2026-08-04). Nothing re-checks it on a gem update — the same drift
argument that got 20 grammar constants generated applies with more force to 96
entries. The fix is a small `generate-formatting-data.rb` with the usual
provenance discipline; the module's shape does not change, only where its data
comes from. Placement (here vs a shared data repo) is a separate,
already-deferred question for Ronald — this entry is only about generation.

### Standalone entity package

If the 253-entry table proves useful outside this repository, it could ship as
its own package. Post-1.0 at the earliest, and only on evidence of a second
consumer — `src/core/generated/html-entities.ts` is 6,009 bytes (2,363
gzipped), which is not enough to justify a package boundary on its own.
