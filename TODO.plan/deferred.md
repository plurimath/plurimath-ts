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

### AsciiMath renderer: three edges where the gem's behaviour cannot or must not be copied

**Trigger: any of these surfacing in a real consumer report, or the P1
adversarial review deciding differently.**

All three are corners of the AsciiMath renderer
(`src/formats/asciimath/renderer.ts` and the `src/render/*/asciimath.ts` kind
files), none reachable
from AsciiMath input (the corpus, round-trip and 1,642-case sweep layers all
pass byte-identical); each is pinned by a test in
`test/formats/asciimath/renderer.spec.ts`:

- **`Left`/`Right` holding a node or a finite number raise `RenderError`.**
  The gem interpolates the parameter into the output string, so a node yields
  `left#<Plurimath::Math::Symbols::Symbol:0x00007c...>` — an object address,
  different every run — and a finite number is ambiguous (the JS number 5 is
  Ruby's `5` and `5.0` at once, which render `"left5"` and `"left5.0"`,
  probed). A byte-parity port cannot reproduce either, so it refuses instead.
  (Strings, nil, booleans and the non-finite floats match the gem exactly —
  probe-sweep-truthiness.rb: `left-true` => `"lefttrue"`, `left-nan` =>
  `"leftNaN"`.)
- **`toAsciimath` returns `""` where the gem returns `nil`.** One render in
  the gem returns nil rather than a string: a `FontStyle` without an
  overriding subclass and with a nil value. Internally this port propagates
  that nil so composite behaviour matches (`Nary` falls back to `"int"` on
  it, interpolations drop it — both probed), but the public function's return
  type is `string`, so at the boundary nil becomes `""`.
- **A class name outside the measured set raises `RenderError`.**
  The census folds ~1,550 aliased gem classes into carrier kinds; this
  renderer measured what the AsciiMath transform can construct, plus the
  hand-buildable table and font-style subclasses (their full gem sets, 10
  and 14, enumeration-probed complete). A hand-built carrier naming any
  other class (`Mbox`, `Menclose`, `Phantom`, ...) raises rather than
  rendering the carrier default, because many of those classes override
  `to_asciimath` in the gem and a default render would diverge silently —
  parity gaps fail loudly (ARCHITECTURE.md §5). The measured set must widen
  when a format that constructs those classes lands (MathML/OMML input,
  P4+).

### The table-name guard set is hand-listed

**Trigger: the next generator extension touching table data, or any gem bump.**

`MEASURED_TABLE_NAMES` in `src/render/table/asciimath.ts` hand-lists the ten
Table subclass basenames because no generated slice carries them — the
AsciiMath transform builds only bare tables, so the census never emits a
table-subclass list. The set was enumeration-probed complete against the gem
(2026-08-07), and every entry is held by the existing renders-every-aliased-
table-subclass pin, so a dropped or drifted name turns a test red. Still: it
is gem-derived data typed by hand, so it carries this exception entry until
the generator owns it.

### Three AsciiMath render tables — generated

**Done, 2026-08-06.** The AsciiMath renderer (since split node-major into
`src/render/<kind>/asciimath.ts`, one directory per kind) no longer
transcribes the three small render tables it used to hand-type; the same
`scripts/generate-corpus.rb` run that emits the rest of the AsciiMath data now
measures and emits them into `src/generated/asciimath/render-tables.ts`:

- the eight `FontStyle` subclass → output keyword pairs (`Bold` → `mathbf`),
  measured by rendering a live instance of every subclass and reading the
  wrapper back — not derivable from the parse table, where `bb`, `mathbf` and
  `textbf` all parse to `Bold`;
- `Asciimath::Constants::TABLE_PARENTHESIS` (four close-paren fallbacks), read
  through the constant `Table#to_asciimath` reads, every mapping re-verified
  by a render that actually falls back through it;
- `Table::SIMPLE_TABLES` (three parentheless table names), each re-verified to
  route its table down the parentheless `{:...:}` path.

All fifteen entries stay pinned by literal probe-backed tests
(`test/generated/render-tables.spec.ts` and the behavioural pins in
`test/formats/asciimath/renderer.spec.ts`), independent of the generated data
they check; a gem bump now re-measures the tables on regeneration. The
locale-table entry below stands on its own schedule — its fix is a separate
`generate-formatting-data.rb`.

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

### MathML renderer: four `to_mathml` options deferred by name

**Trigger: `intent` — the P2 compat class (its only optional argument);
`formatter` — P4 number formatting; `unitsml` — the UnitsML decision
(ARCHITECTURE.md §5); `split_on_linebreak` — the first consumer request, or
P2's OMML renderer, whose `to_omml` shares `new_line_support`.**

`toMathml` implements `display_style` and `unary_function_spacing` (both
byte-matched against oracle probes in
`test/formats/mathml/renderer.spec.ts`). The other four `Formula#to_mathml`
keywords are refused BY NAME: passing `formatter`, `intent`, `unitsml` or
`splitOnLinebreak` with any value but `undefined` — `intent: false` and
`unitsml: {}` (the gem's inert defaults) included — raises a `RenderError`
naming the option and this file. Silence was the alternative and is the one
wrong answer: the corpus was generated with defaults, so a renderer that
ignored `intent: true` would pass every pin and still be wrong for the first
caller. The refusal extends to the tree side of unitsml: a hand-built node
smuggling a `unitsml` ATTRIBUTE through an attributes/options hash is refused
by the same name, which is what makes the gem's `unitsml_post_processing`
(space insertion, marker stripping — formula.rb:450-473) a proven no-op on
every tree this renderer emits.

### MathML renderer: `options[:mask]` supports only the inert decoding

**Trigger: UnicodeMath input (P3), whose parser is what constructs masked
`Int`/`Nary` nodes.**

The gem decodes `options[:mask]` into limit options and rewrites the script
tag (`Core#get_mask_options`/`masked_tag`, core.rb:502-570; probed: `mask: 1`
renames `msubsup` to `munderover`). The port reproduces the gem's read gates
exactly — `Int` checks the KEY (`{mask: nil}` renders, probed byte-identical
to no mask), `Nary` checks truthiness, a nil `Nary` options hash crashes —
and refuses any mask whose decoding is not `limits_default`-only, with a
named `RenderError`. No parse this port supports can construct a live mask.

### MathML renderer: `Color`'s attribute is the gem's one cross-format call

**Trigger: a consumer report with a color argument beyond the measured
shapes, or the P2 renderer round deciding a shared cross-format helper.**

`Color#mathml_options` builds `mathcolor`/`mathbackground` from
`parameter_one.to_asciimath` (color.rb:79-88) — the mathml path calling the
asciimath renderer, which §3's independent format slices deliberately cannot
do. The port reproduces the measured first-slot shapes from the mathml
slice's own generated literal table (`MATHML_COLOR_SYMBOL_LITERALS`):
formulas/mrows of symbols, id symbols (`color(#ff0000)`'s `Eqno` included),
numbers and texts — every shape the corpus, the 1,642-input sweep and the
probes reach. Any other first-slot kind (a `Frac` renders
`mathcolor="frac(x)(y)"` in the gem, probed) raises a named `RenderError`
instead of approximating a full asciimath render this format does not own.

### MathML renderer: degenerate attribute/options slots refuse where Ruby's `to_s` diverges

**Trigger: the same standing degenerate-input ruling as the asciimath
renderer's entry above — a real consumer report reopens it.**

Same policy, this format's slots (all pinned in
`test/formats/mathml/renderer.spec.ts`, each probed): attribute VALUES render
through Ruby's `to_s` + entity decode (nil → `accent=""`, booleans, the
non-finite floats), and a finite number, hash or node value refuses; a
non-empty LIST in an `attributes` slot — which the gem pair-explodes into
`a="" b=""` (probed bar-array-attrs) — refuses rather than imitates; `Left`/
`Right` holding a non-string raises (the gem's `<<` crashes — booleans
included, where their asciimath render interpolates `lefttrue`). And
`toMathml` returns bytes for `formula`/`mrow` input only: `to_mathml` is
defined on `Formula` alone in the gem, every other class answering
NoMethodError.

## Upstream issues

Defects in the Ruby gem, found while building the port. All reproduce on a
clean checkout. None is worked around here — the corpus records the gem's
real behaviour, including its bugs.

### `Matrix#to_mathml_without_math_tag` crashes on any fenced non-round matrix

```ruby
Plurimath::Math::Function::Table::Matrix.new(
  [Tr.new([Td.new([x])])], Paren::Lsquare.new, Paren::Rsquare.new
).to_mathml_without_math_tag(false, options: {})  # => NoMethodError
```

`table/matrix.rb:51` calls `validate_paren(paren)`, which is defined nowhere
in the gem — any matrix whose parens survive `table_tag_only?` (both present,
not lround/rround) dies. The port raises `RenderError` at the same shape
(probe matrix-square-parens).

### Half the Paren classes crash mtable fencing

`Table#mathml_parenthesis` (table.rb:211) reads `field.encoded` or
`field.paren_value`; on twelve Paren classes (`Lbbrack`, `Lbrace`, `Lbrack`,
`Lceil`, `Lfloor`, their five R-side twins, and `UpcaseLangle`/
`UpcaseRangle`) both readers are missing or PRIVATE — `lbbrack.rb` defines a
public `encoded`, then shadows it with a private one — so a table fenced
with one raises NoMethodError. Measured per class into
`MATHML_TABLE_PARENS` (`text: null` marks the crash set, probe
table-lbbrack); the port raises `RenderError` on the same ids.

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

### Overset's constructor family lacks a behavioral kill

**Trigger: the first corpus regeneration that adds cases — include
`overset` (and another options-carrying construct) then.**

The generated constructor families (Option B, 2026-08-06) are guarded by
literal pins, per-family counts, and an import-time throw. `underset` also
has an end-to-end kill: the `underset(a)(b)` oracle pin in
`test/formats/asciimath/transform.spec.ts` expects `options: {}` and dies if
its family flips to plain `binary`. `overset` is the one without one — the
shared corpus has no case reaching it, so its dropped-empty-options behavior
is never exercised end-to-end. Not a registry gap — a corpus-scope gap,
owned upstream where cases are generated. (The first draft of this note
claimed both kinds were uncovered; review disproved it for `underset`.)

### Lone surrogates diverge from Ox byte output

**Trigger: only if a consumer ever feeds the serializer invalid Unicode and
files it as a bug — then decide byte-oriented output vs a loud reject.**

Known divergence (PR #9 review, 2026-08-06). Ox, handed a Ruby string
force-encoded around a lone-surrogate byte sequence (`ED A0 80`), emits those
invalid bytes raw; `src/xml` holds text as JavaScript strings, so a lone
UTF-16 surrogate becomes U+FFFD (`EF BF BD`) at any UTF-8 encoding boundary.
No gem code path produces such a string — constructing one requires
deliberate `force_encoding` — and the maintainer's parser-side ruling on
degenerate Unicode input (the caller bears the consequences) extends here.
Documented in `src/xml/serializer.ts`.

### The XML writer is owed a thorough dedicated review

**Trigger: before the MathML renderer (PR-4) merges — it is that PR's
foundation — and again before 1.0.**

Maintainer decision at #9's merge (2026-08-07): the hand-rolled Ox-faithful
writer was accepted after the ecosystem survey (no native org XML layer
exists; the gem itself hand-rolls the same pattern for its Oga engine), but
the maintainer wants `src/xml/` thoroughly re-reviewed as a unit — design,
byte contract, and its fitness as the prospective shared module for future
sibling ports — beyond the PR-cycle reviews it has had. The reader-side
(XML parsing for MathML input) remains a separate open decision: evaluate
existing parser libraries before building anything.
