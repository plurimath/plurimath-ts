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

### LaTeX renderer: the same edges, probed on the gem's latex path

**Trigger: any of these surfacing in a real consumer report, or a review
deciding differently.**

The latex mirror of the three-edges entry above, with the per-path answers
its own probes gave (probe-latex-degenerate.rb on the pinned oracle,
2026-08-10) — none reachable from AsciiMath input, each pinned in
`test/formats/latex/renderer.spec.ts`:

- **`toLatex` returns `""` where the gem returns `nil`** (a bare
  `FontStyle`/`Mpadded`, a base symbol with no value) — same boundary
  mapping as `toAsciimath`, internally propagated so composite behaviour
  matches (`Nary` falls back to `"\int"` on it).
- **A class name outside the measured set raises `RenderError`** — the
  unary/binary/ternary carriers' generated reachable sets, plus the
  hand-listed table (10), fontStyle (8 command + 6 value-alone) and formula
  (`Mstyle`) sets, enumeration-probed complete (probe-latex-name-guards.rb).
- **Degenerate value slots are admitted per SITE, not per format.**
  `Number`/`Symbol` value slots render booleans and the non-finite floats
  (the gem's TextRenderer/interpolation spells them byte-identically) and
  refuse finite numbers, hashes and nodes — the same admission set as
  asciimath, but established by latex probes. `Fenced`'s paren slots and
  `Color`'s top-level symbol branch refuse ALL non-strings instead: the
  gem's `latex_paren` sends `include?` and the color strip sends `gsub` to
  the raw value (NoMethodError there), while the same symbol NESTED in a
  formula renders through the join's `to_s` — probed both ways.
  `Left`/`Right` refuse nothing: every degenerate shape is a Ruby hash-miss
  dot, unlike the asciimath interpolation path.

### Renderer deep-tree parity window below the gem's stack ceiling

**Trigger: a consumer report with a real tree that deep, or an iterative-walk
redesign of the validate/render recursion.**

The gem's recursive `to_asciimath` survives nested-sqrt chains to roughly
4,656 frames on default stacks before SystemStackError (measured on the
pinned oracle, 2026-08-10: depths 2,000/3,000/4,000 render
12,001/18,001/24,001 chars); its `to_latex` to roughly 4,500
(probe-latex-depth.rb, same day: 4,500 renders 31,501 chars, 4,550 raises).
The port's recursive walks exhaust the JavaScript call stack earlier and
environment-dependently — measured full-render ceilings between ~1,000 and
~2,500 across vitest and plain-node runs (the PR #10 review measured
~1,562–1,660) — so in the window between the two ceilings a valid tree the
gem still renders raises the too-deep `RenderError` here. Beyond the gem's
own ceiling both sides raise. Each format's too-deep message states its own
window rather than claiming the gem fails at the same depth, and the
branding is pinned across depths 1,400–4,200 in
`test/formats/asciimath/renderer.spec.ts` and
`test/formats/latex/renderer.spec.ts`: genuine stack exhaustion takes the
too-deep rejection whichever side hits its ceiling first, never the generic
mid-walk wrap.

### The carrier name-guard sets are partly hand-listed

**Trigger: the next generator extension touching table or font-style data,
or any gem bump.**

`MEASURED_TABLE_NAMES` in `src/render/table/asciimath.ts` and
`src/render/table/latex.ts` hand-list the ten Table subclass basenames
because no generated slice carries them — the AsciiMath transform builds
only bare tables, so the census never emits a table-subclass list. The same
applies to `MEASURED_FORMULA_NAMES` (`Mstyle`, both formats) and, on the
latex side only, the six value-alone FontStyle names in
`MEASURED_FONT_STYLE_NAMES` (the asciimath twin derives all fourteen from
its transform registry, which the latex format may not import — §3's
generated-data closure). Every set was enumeration-probed complete against
the gem (2026-08-07 asciimath, 2026-08-10 latex,
probe-latex-name-guards.rb), and every entry is held by an existing
behavioural pin, so a dropped or drifted name turns a test red. Still: it is
gem-derived data typed by hand, so it carries this exception entry until the
generator owns it.

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

### Both renderers: admitted primitives diverge in composite positions

**Trigger: the cross-format follow-up on raw-value-vs-string admission —
decide narrow-the-admission versus permanent divergence before 1.0.**

The direct-slot admission of reproducible primitives (booleans, non-finite
floats) is byte-exact where probed — but a composite that truthiness-tests
or string-operates on the *raw* Ruby value diverges when the port hands it
the already-stringified render. Probed both formats (2026-08-10):

- Table open paren forced `false`, LaTeX: gem `\left .` (falsy `|| "."`
  fallback observes raw `false`) — port `\left false`.
- Nary first slot forced `false`: gem `\int 2` / `int 2` (LaTeX/AsciiMath;
  the fallback observes raw `false`) — port `false 2` in both.

Owned jointly by the AsciiMath and LaTeX renderers (the merged #10 carries
the same class); the admission itself stays, because in direct interpolation
slots it is byte-exact and pinned. The follow-up chooses: refuse admitted
primitives in composite-feeding positions, or record these as permanent
divergences case by case.

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

### The locale table is hand-typed — generated

**Done, 2026-08-10** (trigger: before P1-completion). The 96 locale →
decimal-marker entries and the default marker now come from
`src/formatting/generated/locale-decimals.ts`, emitted by
`scripts/generate-formatting-data.rb` with the usual provenance discipline
(`generated/provenance.ts`, deterministic, dirty-checkout refusal).
`src/formatting/locales.ts` derives its table from it; the module's shape did
not change, only where its data comes from.

Measured off the runtime, not transcribed: the generator reads
`Formatter::SupportedLocales::LOCALES` through the loaded gem and verifies
every entry before emission — `decimal_for` under both key spellings, plus a
live `Math.parse` that must read `1<marker>5` as one Number under the entry's
own marker and must not under each of the other markers. Cross-checked against
the hand-typed table entry by entry: zero mismatches, consistent with the
2026-08-04 verification (all 96, plus 14 edge inputs). Placement (here vs a
shared data repo) is a separate, already-deferred question for Ronald — that
half stays open; this entry was only about generation.

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

### LaTeX: six renderer-local measured tables — generated

**Done, 2026-08-06.** `src/formats/latex/renderer.ts` no longer hand-holds
its six small measured tables; the same `scripts/generate-corpus.rb` run that
emits the rest of the data now measures and emits them into
`src/generated/latex/render-tables.ts`:

- `LEFT_RIGHT_PARENS` — the gem constant inverted through Ruby (`Hash#invert`
  keeps the last key for the duplicated `&#x2016;`, asserted rather than
  assumed), every row re-verified through a `Left` and a `Right` render, plus
  a miss and a nil proving the `.` fallback;
- `PLAIN_WRAPPED_UNARY_NAMES` — `validate_function_formula` read off a live
  instance of each reachable unary class and re-verified through an `Overset`
  render, because the set is not derivable from `UNARY_CLASSES` (ker, liminf,
  limsup and sup differ); `Left`/`Right` answer false too, asserted at
  generation and left to their own renderer dispatch;
- `FONT_STYLE_COMMANDS`, `MATRIX_ENVIRONMENTS`, `ALIGNMENT_LETTERS` — render
  probes per row: the FontStyle wrapper read back off every subclass, a
  `Table::Matrix` render per `to_matrices` paren (the NoMethodError miss
  verified), a `Table::Array` render per alignment (the `.` fallback
  verified);
- `COLOR_ASCIIMATH_SYMBOLS` — `to_asciimath` measured for exactly the ids the
  renderer names (`Plus`, `Eqno`), each verified through a full `Color`
  render.

All sixty-eight entries stay pinned by literal probe-backed tests
(`test/generated/latex-render-tables.spec.ts` and the behavioural pins in
`test/formats/latex/renderer.spec.ts`), independent of the generated data
they check; a gem bump now re-measures the tables on regeneration.

### LaTeX: Fenced refuses node-valued paren slots

**Trigger: a gem release that fixes the interpolation, or a corpus case that
needs the construct.**

Known divergence. The gem's `Fenced#to_latex` interpolates a formula, mrow,
or table sitting in a paren slot through `#inspect` — an object memory
address, nondeterministic run to run. The port raises `RenderError` instead
of reproducing address bytes; only gem-accepted deterministic input renders.
A HASH in the slot is the one non-string that survives the gem's
`latex_paren` (`Hash#include?` answers) and interpolates `"{a: 1}"` — bytes
`String()` cannot match — so it takes the same refusal
(probe-latex-degenerate.rb, 2026-08-10). Same policy as the color rule and
the AsciiMath Left/Right refusal.

### LaTeX: Color renders only the measured AsciiMath fragment

**Trigger: corpus or sweep growth that exercises a new color operand.**

`Color`'s first slot renders through the gem's `to_asciimath`. The port
carries only the measured fragment (base symbols, numbers, quoted text,
formula joins, `Plus`, `Eqno`) and raises `RenderError` for other symbol ids
the gem would render — a loud gap, not a silent wrong byte. (The generated
color-asciimath slice landed 2026-08-06 carrying exactly this fragment; the
gap itself remains until the corpus exercises more operands.)

### LaTeX: no symbol-exception context axis is threaded

**Trigger: a regeneration that introduces LaTeX symbol variants must wire an
axis mechanism first — the pin will fail and point here.**

`LATEX_SYMBOL_EXCEPTIONS` is empty today, so `toLatex` threads no context
axis; `renderer.spec.ts` pins the emptiness so a future regeneration cannot
silently need one.

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
