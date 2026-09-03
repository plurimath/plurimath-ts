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

### Deep-tree parity window below the gem's stack ceiling

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

The same applies on the **parse** path, and it is the side where the gem fails
first: 300 nested parens raise `SystemStackError: stack level too deep` from
`Plurimath::Math.parse` on the pinned oracle, where the port raises its typed
`ParseError` / `PARSE_ERROR` ("Input exhausted the parser stack"). Both reject
the input; only the error's shape differs, because a host-language stack crash
is not portable behaviour. That is the decision recorded here, and it is what
the adversarial-inputs gate pins.

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

`MEASURED_UNARY_NAMES` in all four `src/render/unary-function/*.ts` adds two
names to its generated census projection the same way: `Tr`, which the
transform constructs without `get_class`, and `Hom`, which the transform
never constructs at all. `Hom` was admitted 2026-08-21 on this measurement
(probe-unary-carrier-defaults.rb on the pinned oracle, in the PR record): of
the 48 classes the census aliases onto `Math::Function::UnaryFunction`, 34
are reachable through `get_class`, `Tr` is transform-built, and of the
remaining 13 — Hom, Longdiv, Mbox, Merror, Mglyph, Ms, Msgroup, Msline,
None, Phantom, Scarries, Scarry, Substack — `Hom` is the only one whose
`to_asciimath`, `to_latex`, `to_unicodemath` AND
`to_mathml_without_math_tag` are all owned by the carrier, so the port's
existing default arms already emit its bytes
(`"hom(x)"`, `"\hom{x}"`, `"hom⁡x"`, `<mrow><mo>hom</mo><mi>x</mi></mrow>`;
nil parameter: `"hom"`, `"\hom{}"`, `"hom⁡"`, `<mo>hom</mo>`). It matters
because the gem's LaTeX parser DOES build it — `Math.parse("\hom{x}",
:latex)` returns a `Hom` — so the name arrives the moment P3 lands a LaTeX
input format.

One name is measured and deliberately still refused: `Scarries` inherits
`to_unicodemath` from the carrier (`"scarries⁡x"`) while overriding the other
three. Admitting it in one format alone would leave a name that renders in
UnicodeMath and raises everywhere else, which is a worse trap than the gap.
**Trigger for revisiting: a generator that owns these sets per format, or the
first consumer that needs `Scarries`.**

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

### Table rejects non-Array row carriers at render

**Trigger: a supported consumer needs to pass a `Table` value other than the
exported `NodeSequence`, or that public type is widened with explicit semantics
for repeatable and one-shot iterables.**

Ruby's `Table#initialize` stores its value unchanged, and the renderers call
`map` on it. On the clean pinned oracle at `00c52783`, an Array, `Set`, and
`Enumerator` containing the same table row render byte-identically in the five
formats probed here—AsciiMath, LaTeX, MathML, UnicodeMath, and HTML—including
on a repeated render. `TableNode` also stores a
non-Array carrier unchanged so construction does not run caller code, but the
port rejects it at render with a typed `RenderError`. The exported
`NodeSequence` admits arrays only, so typed callers cannot request this; only a
cast, untyped JavaScript, or malformed structural data reaches it.

Admitting arbitrary JavaScript iterables would create a wider contract with no
one-to-one Ruby mapping. A JavaScript `Set` is repeatable but has no `map`, while
a generator is one-shot even though the probed Ruby `Enumerator` renders
repeatably. The port keeps the refusal loud until that API and repeated-render
behaviour are chosen deliberately. The constructor and refusal are pinned in
`test/core/nodes.spec.ts`; the measured Ruby HTML output is recorded beside
those pins.

### Symbol refuses an opaque object during construction

**Trigger: `SymbolNode` can store an opaque value without coercing or invoking
caller code, then refuse its unreproducible spelling at render as a typed
`RenderError`.**

Ruby's `Symbols::Symbol#initialize` applies `sym&.to_s`. For an arbitrary object
that produces a process-specific heap-address string, so the corresponding HTML
bytes cannot be regenerated. The port's `symbolValue` instead raises `TypeError`
while constructing `SymbolNode`, which is safer than inventing bytes but breaches
the supported hand-built-tree contract: invalid values should be stored and
refused at render. The `symbol[0]=node` sweep row records both the unstable oracle
output and this construction-time refusal until the value model can represent
the raw input without executing it.

### Number refuses opaque object bytes at HTML render

**Trigger: the value model gains a deterministic Ruby-object spelling, or a
supported consumer needs object-valued `NumberNode` input.**

Ruby's `Number#initialize` stores an arbitrary object unchanged and its HTML
renderer interpolates that object, producing a process-specific heap address.
The port stores the value without invoking caller code, then raises a typed
`RenderError` instead of inventing bytes. The `number[0]=node` degenerate-sweep
row records the unstable oracle result and pins this deliberate refusal.

### Legacy generated fixtures lack reproducible sidecars

**Trigger: before the pinned oracle moves, or before any of these fixture bytes
or their consuming assertions change.**

The AsciiMath, LaTeX, and MathML `render-sweep.json` files are one-off oracle
captures without checked-in generators or adjacent provenance manifests. The
Ox contract has a generator, `scripts/generate-xml-fixtures.rb`, but only
partial provenance embedded in `test/xml/ox-contract.expected.json`. They
predate the section 7 sidecar contract. `test/gates/payload-validation.spec.ts`
names the three format fixtures and the XML generator as explicit legacy gaps,
so another untracked generated artifact cannot silently join them. Replacing
these captures with deterministic generators and full sidecars closes the gap.

### HTML: Fenced refuses generated and nondeterministic paren paths

**Trigger: the HTML symbol-data slice is generated, or a corpus case needs one of
these constructs.**

The gem's `Fenced#to_html` takes two incompatible paren paths. A `Paren` instance is
rendered through `to_mathml_without_math_tag(...).nodes.first`; named `Paren::*` nodes
therefore need the generated symbol mapping that the scoped HTML slice does not carry.
The port raises `RenderError` for that path rather than inventing a delimiter.

Any non-`Paren` node contributes its raw `value`. Empty and nil-only formula, mrow, and
table values have deterministic Ruby `#inspect` bytes (`[]`, `[nil]`; a nil table value
contributes an empty string), so the port renders those measured cases. Once such a list
contains a node, Ruby `#inspect` includes that object's memory address; the port refuses
those nondeterministic bytes, matching the policy already recorded for LaTeX's
node-valued paren slots. Constructor-normalized Symbol/Paren and Number string or nil
values still render byte-for-byte; forged container values refuse at the runtime boundary.

### LaTeX: Color renders only the measured AsciiMath fragment

**Trigger: corpus or sweep growth that exercises a new color operand.**

`Color`'s first slot renders through the gem's `to_asciimath`. The port
carries only the measured fragment (base symbols, numbers, quoted text,
formula joins, `Plus`, `Eqno`) and raises `RenderError` for other symbol ids
the gem would render — a loud gap, not a silent wrong byte. (The generated
color-asciimath slice landed 2026-08-06 carrying exactly this fragment; the
gap itself remains until the corpus exercises more operands.)

**The trigger fired, 2026-08-21.** Every gem-declared AsciiMath symbol token
swept through `color(<token>)(y)` — 3,217 of them, the measured size of
`Utility.symbols_hash(:asciimath)` on the pinned oracle (00c52783). 3,216
parse to a top-level `Color`; only `-:` does not, and neither does the gem
(both sides answer `c o l o r ( - \rangle ( y )`). Of those 3,216, `toLatex`
raises for 3,209 and `toMathml` for 4.

The seven `toLatex` does render (`+`, `#`, `&#x2b;`, `&#x23;`, `"P{plus}"`,
`"P{eqno}"`, `"P{octothorpe}"`) are byte-identical to the gem, so the
fragment is narrow, not wrong — and narrow is all the committed inputs ask
for: the shared corpus has two color cases (`color(red)(x)`,
`color(blue)(x) + y`) and the 1,642-input sweep three (`color(red)(x)`,
`color(blue)(y+1)`, `color(#ff0000)(z)`), whose first slots between them
need only letter symbols, a number and `Eqno`. Everything past that the gem
renders and this port refuses: `color(alpha)(y)` is `{\color{alpha} y}` from
the gem and a `RenderError` here, and an every-40th sample of the 3,217 came
back from the gem as a `{\color{...} y}` render, 81 out of 81.

Sized, now that the trigger has fired. 3,205 of the 3,209 refusals are one
missing symbol literal each, over 1,393 distinct ids, against the 2 entries
(`Plus`, `Eqno`) `LATEX_COLOR_ASCIIMATH_SYMBOLS` carries — and all 1,393 are
already carried mathml-side by `MATHML_COLOR_SYMBOL_LITERALS`, whose 1,459
entries are identical to `ASCIIMATH_SYMBOLS` key for key and value for
value. So closing the bulk is the re-emission `generate-corpus.rb` already
performs for the mathml slice, not new parity measurement. The remaining 4
(`ZZ`, `:`, `:.`, `:'` — `fontStyle` and `fenced` nodes) are exactly the
four `toMathml` refuses as well, and stay refused for the reason the mathml
entry gives: their operand's render is a composite's full asciimath, which
§3 keeps out of this format.

The decision is unchanged — still DEFERRED. What changed is that it is a
sized decision, and the trigger this entry names has now fired once.

### LaTeX: no symbol-exception context axis is threaded

**Trigger: a regeneration that introduces LaTeX symbol variants must wire an
axis mechanism first — the pin will fail and point here.**

`LATEX_SYMBOL_EXCEPTIONS` is empty today, so `toLatex` threads no context
axis; `renderer.spec.ts` pins the emptiness so a future regeneration cannot
silently need one.

### Any non-UTF-8 Ruby string diverges from Ox byte output

**Trigger: only if a consumer ever feeds the serializer invalid Unicode and
files it as a bug — then decide byte-oriented output vs a loud reject.**

Known divergence (PR #9 review, 2026-08-06; class widened by the `src/xml`
module review, 2026-08-12). Ox emits whatever bytes a Ruby string carries,
valid UTF-8 or not, and `src/xml` holds text as JavaScript strings — which
cannot represent those bytes at all, so any UTF-8 encoding boundary replaces
them with U+FFFD (`EF BF BD`).

The entry used to name only lone surrogates. Measured on the oracle, the class
is every Ruby string carrying non-UTF-8 bytes:

| input | Ox emits |
|---|---|
| lone surrogate `ED A0 80` | `3C 74 3E` **`ED A0 80`** `3C 2F 74 3E` |
| bare invalid byte `FF` | `3C 74 3E` **`FF`** `3C 2F 74 3E` |
| `BINARY` latin-1 `é` (`E9`) | `3C 74 3E` **`E9`** `3C 2F 74 3E` |

A `BINARY`-encoded string is not exotic — it is what `File.binread` returns —
so the third row is the one most likely to reach a consumer.
No gem code path produces such a string — constructing one requires
deliberate `force_encoding` — and the maintainer's parser-side ruling on
degenerate Unicode input (the caller bears the consequences) extends here.
Documented in `src/xml/serializer.ts`.

### A NUL inside an element or attribute *name* diverges, unreachably

**Trigger: a consumer constructing element names from untrusted input — which
no current code path does, since every name in `src/render/` is a literal.**

Found by the `src/xml` module review (2026-08-12) and recorded so the next
reviewer does not re-find it. Ox truncates a name at an embedded NUL; the port
emits the name whole. Names are written verbatim by `writeElement` in
`src/xml/serializer.ts` — the open tag, the attribute names beside it, and the
close tag — because Ox never validates or escapes them either.

Cited by symbol rather than line: the first version of this entry carried line
numbers taken from the review, which had run before the depth cap was added to
that file, and they pointed at an unrelated docstring by the time it was
written.

Unreachable today and left alone deliberately: fixing it would mean validating
names on a hot path to model a case nothing can produce. It belongs with the
non-UTF-8 entry above — both are degenerate-input divergences that the
maintainer's standing ruling already covers, and both are recorded rather than
papered over.

### RepeatAtom's leftover FAIL records no unconsumed index, and must keep not doing so

**Trigger: a real AsciiMath input whose reported failure index is measurably
wrong against the gem. Not the standalone-Parslet difference below, which has
already been tried and rejected.**

`MaybeAtom.tryParse` records `ctx.unconsumed` before returning FAIL for a
`consume_all` leftover (`src/pegkit/atom.ts:495`); `RepeatAtom.tryParse` hits
the identical condition and records nothing (`:527`). Copilot flagged both
sites on PR #5; only the maybe half was fixed, in `e5a9995`.

The asymmetry is real and so is the standalone divergence. Measured against
parslet 2.0.0:

| input | pegkit | parslet `offending_pos` |
|---|---|---|
| `(a >> b).repeat(1)` on `"abax"` | 3 | 2 |
| `(a >> b >> c).repeat(1)` on `"abcabx"` | 5 | 3 |

**The one-line symmetry fix was attempted on 2026-08-12 and reverted.**
Recording `cursor` into `ctx.unconsumed` moves those synthetic cases to 2 and 3
as expected — and breaks five previously-passing cases in
`test/formats/asciimath/failure-parity.spec.ts`, whose expectations are
measured gem behaviour. For `xℛy/` the recorded index is 1; the fix makes
pegkit report 3.

The oracle is the gem, not parslet in isolation. The gem's grammar nests this
repetition inside other combinators, and parslet's compound error position is
not simply "where the repetition stopped" — probing
`Plurimath::Asciimath::Parse` directly gives `offending_pos=0` for those same
inputs, matching neither number. Whatever maps that to the port's reported
index is the thing to understand before touching `:527` again.

So the port is currently correct against the oracle and wrong against
standalone parslet, and only the first of those is the contract. Anyone
re-reading Copilot's comment on #5 will find it persuasive; this entry exists
so they do not spend the afternoon rediscovering why it is not.

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

## The parser's depth bound never fires; a caught `RangeError` does the work

**Trigger to revisit:** any new grammar or input format (P3's LaTeX, UnicodeMath
and HTML parsers each add one), or a runtime change — a different engine, a
worker with a smaller stack, or a bundler that alters frame size.

`src/pegkit/atom.ts` has two guards against runaway recursion: `MAX_DEPTH =
20_000` counted in `Atom#apply`, and a `RangeError` catch in `Atom#parse` that
converts engine stack exhaustion into the same typed `ParseFailed`.

Measured 2026-08-17 while writing `test/adversarial/adversarial-inputs.spec.ts`:
of the adversarial shapes probed, **every one that is refused at all** is
refused by the `RangeError` path — several parse, and whitespace-only input
parses and then fails at render.
Nested parens, nested `sqrt`, complete nested `frac`, 5,000 unmatched opens,
5,000-token runs and a 20,000-character symbol all exhaust the stack while
`ctx.depth` is still far below 20,000, because this grammar costs many frames
per input token. `MAX_DEPTH` has never been observed to fire.

**Why that is worth revisiting rather than fixing now.** Catching a
`RangeError` and continuing is not something every engine guarantees is safe or
even possible; a deterministic depth bound that fires *first* is the design the
cap's own comment claims it has. But lowering the bound changes which inputs
are refused, which is a parity decision (the gem `SystemStackError`s at ~300
nesting, so the port is far more permissive today either way), and it wants its
own change with its own measurements rather than riding along with a test gate.

The immediate risk is contained: both paths end in a typed error, the
adversarial gate asserts `STACK_EXHAUSTED_MESSAGE` for **every** row it pins as
rejected (driven off the case table, so the two cannot drift apart), and the two
messages are distinct so a silent swap cannot pass unnoticed.

## AsciiMath rejection position: `right-unclosed`

The port's `ParseError.index` disagrees with the gem's recorded offset for one
rejection, measured 2026-08-19 against the pinned oracle (00c52783):

| input | gem | port |
|---|---|---|
| `left( x right` | 13 (end of input) | 8 (where `right` begins) |

Both are defensible readings of "where it failed" — Parslet reports the
furthest position it reached after consuming the whole input, the port reports
where the unsatisfiable construct began — but PORTING-STANDARDS.md makes the
gem's answer the specification, so this is a divergence, not a choice.

Every other recorded rejection agrees: six unshifted cases reproduce the gem's
offset exactly, and all four cases whose preprocessing changes length map back
to the correct ORIGINAL-input offset. The divergence is pinned by name in
`test/formats/asciimath/rejection-parity.spec.ts` (`KNOWN_POSITION_DIVERGENCE`)
so it cannot drift further unnoticed, and so that closing it is a visible
change to that constant rather than a silent one.

Deferred because closing it means changing where the grammar reports failure
for unclosed `left(` groups, which is parser surgery well beyond the gate that
found it.

**Trigger:** the first of — a second rejection case is measured whose position
also disagrees (making this a class rather than a single case), or any consumer
depends on `ParseError.index` for an unclosed-fence input, or the AsciiMath
grammar's failure reporting is touched for any other reason. Whichever comes
first reopens it; `KNOWN_POSITION_DIVERGENCE` in
`test/formats/asciimath/rejection-parity.spec.ts` is the one place to change.

## Ruby Float vs JavaScript number in option interpolation

`rubyInterpolate` (`src/formats/unicodemath/render-shared.ts`) reproduces Ruby
string interpolation for option values. It is exact for Integer, String and
boolean, and cannot be exact for Float, because JavaScript has ONE numeric type:

| Ruby | `to_s` | JS `String()` |
|---|---|---|
| `1.0` | `"1.0"` | `"1"` |
| `1e20` | `"1.0e+20"` | `"100000000000000000000"` |
| `-0.0` | `"-0.0"` | `"0"` |

`1` and `1.0` are the same JS value, so the port cannot choose between "1" and
"1.0" from the value alone. Closing this needs the corpus to carry the Ruby
type alongside the value.

Not reachable from any parser: the two interpolated options (`mask` on
Sum/Int/Oint, `size` on Base) arrive as strings. Only a hand-built tree holding
a Float reaches it.

Arrays and hashes ARE now reproduced — `to_s` on them is `inspect`, and the
pinned gem renders them (`⟡(["x", 2]&x)`, `⟡({a: 1}&x)`), so refusing them made
this port less capable than its own specification. Two decisions inside that
reproduction are assumptions rather than measurements, and are the rest of this
entry:

- **hash keys are assumed to be Symbols.** Every option hash in the gem's own
  constants uses them (`{mpadded: {…}, phantom: true}`), and a Symbol key
  prints `{a: 1}` where a String key prints `{"a" => 1}`. A JS object key
  carries no such distinction.
- **an integral number is treated as a Ruby Integer.** Exact for every Integer;
  wrong only for a Float that happens to be integral. A non-integral number is
  refused outright, since it is decidably a Float whose `to_s` cannot be
  derived.

**Trigger:** the first of — a corpus case records a numeric or hash option
value, or a parser is added that can produce one, or the model schema gains
Ruby type information for option values.
