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

**Trigger: the next generator extension touching table data, or any gem
bump.**

**`MEASURED_TABLE_NAMES` is resolved (2026-09-14):** the trigger fired with
the `MATHML_TABLE_PARENS` generator extension, and both
`src/render/table/asciimath.ts` and `src/render/table/latex.ts` now import
`ASCIIMATH_TABLE_NAMES` / `LATEX_TABLE_NAMES` from their generated
`render-tables.ts` slices instead of hand-listing the ten Table subclass
basenames. `scripts/generate-corpus.rb` measures the census directly off
the class hierarchy (`all_descendants` on `Table`, the same primitive
`MATHML_TABLE_NAME_FAMILIES` already used), since the AsciiMath transform
still builds only bare tables and no `get_class` census row carries a
table-subclass list. The generated set is byte-identical to the
hand-typed one it replaced.

**`MEASURED_FORMULA_NAMES` (all three formats) and, on the latex side, the
full `MEASURED_FONT_STYLE_NAMES` set are also resolved:**
`asciimath_formula_subclass_names`/`latex_formula_subclass_names`/
`mathml_formula_subclass_names` and `latex_font_style_names` in
`scripts/generate-corpus.rb` now measure them off `corpus/census.yaml`'s
aliased `Formula` children and the live `FontStyle` class hierarchy, each
re-verified by a format-specific render, and emit `ASCIIMATH_FORMULA_NAMES`,
`LATEX_FORMULA_NAMES`, `MATHML_FORMULA_NAMES` and `LATEX_FONT_STYLE_NAMES`.

Every one of these three sets was enumeration-probed complete against the
gem (2026-08-07 asciimath, 2026-08-10 latex, probe-latex-name-guards.rb)
before the generator took it over, and every entry is held by an existing
behavioural pin, so a dropped or drifted name still turns a test red. With
all three resolved, nothing gem-derived in this area remains hand-typed —
this exception entry now only documents how each set came to be measured.

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

The HTML slice hand-lists the same way, and for the same reason — no
`src/generated/html/` slice carries a reachable-name set, and §3's
generated-data closure forbids an HTML kind file reading the mathml one. The
name arms in `src/render/{binary,ternary,unary}-function/html.ts` admit only
the ten aliases some corpus case constructs — `Power`, `Mod`, `Lim`, `Log`,
`Root`, `Td` (binary), `PowerBase` (ternary), `Sin`, `Cos`, `Tr` (unary) — so
every admitted arm is held to the gem's bytes by `render-parity.spec.ts`, and
`power`/`powerBase` additionally by the full `degenerate-slots` slot matrix.
`MEASURED_LABELS` in the unary file is one of TWO hand-typed gem-derived tables there:
`Core#invert_unicode_symbols` is `UNICODE_SYMBOLS.invert[class_name] ||
class_name`, so the label is NOT reliably the downcased class name — of the
names reachable through that carrier, `Sup` resolves to `&#x2283;` — and the
port cannot compute it without the mathml table it may not import. Names that
render on the gem but no case constructs (`Stackrel`, `Underover`, `Limits`,
`Multiscript`) stay refused rather than admitted untested. Two never become
admissible as written: `Menclose#to_html` interpolates `parameter_one` raw
into a `notation=` attribute (a heap address, not reproducible), and
`Rule#to_html` takes no `options:` keyword at all, so the gem itself raises
`ArgumentError` — surfacing as `ParseError` — when a `Rule` is rendered
inside a tree.

The second is `INSPECT_NAMED_ESCAPES` in the same file: the ten codepoints
whose `String#inspect` form Ruby writes as a NAMED escape rather than
`\uXXXX` — `\a \b \t \n \v \f \r \e \" \\` for `0x07 0x08 0x09 0x0a
0x0b 0x0c 0x0d 0x1b 0x22 0x5c`. Every entry was measured against the pinned
oracle and all ten agree; seven codepoints deliberately absent from it were
checked too and each falls through to the numeric branch, as the gem does. So
this is a governance exception, not a correctness one: the data is right, and
what it lacks is a generator that would keep it right.

Recording it rather than generating it now is a size judgement. The migration
has a precedent in this very file — the three AsciiMath render tables below —
and a clear shape: a codepoint sweep in `generate-corpus.rb` beside
`latex_left_right_parens`, emitted through `ts_tuple_map` into
`src/generated/latex/render-tables.ts`, asserting on the way that the
named-escape set is EXACTLY those ten so completeness is enforced rather than
claimed in prose. That is its own change, not a rider on a corpus pin.

**Trigger for revisiting: a generator that owns these sets per format, the
first consumer that needs `Scarries`, or any third hand-typed table appearing
in that file — two is an exception, three is a habit.**

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

### MathML renderer: one `to_mathml` option deferred by name

**Trigger: `unitsml` — the UnitsML decision (ARCHITECTURE.md §5).**

`toMathml` implements `display_style`, `unary_function_spacing`, `formatter`
(B2's first slice), `split_on_linebreak` (B3, shared with `to_omml` through
`src/core/linebreak.ts`) and `intent` (B4, the P2 compat class's only optional
argument — `./intent-encoding.ts`, `./intent-post-processing.ts`), byte-matched
against oracle probes in `test/formats/mathml/renderer.spec.ts`,
`test/formats/mathml/intent-parity.spec.ts` and
`test/formats/split-display-parity.spec.ts`. The remaining `Formula#to_mathml`
keyword is refused BY NAME: passing `unitsml` with any value but `undefined` —
`unitsml: {}` (the gem's inert default) included — raises a `RenderError`
naming the option and this file. Silence was the alternative and is the one
wrong answer: the corpus was generated with defaults, so a renderer that
ignored `unitsml: {...}` would pass every pin and still be wrong for the first
caller. The refusal extends to the tree side of unitsml: a hand-built node
smuggling a `unitsml` ATTRIBUTE through an attributes/options hash is refused
by the same name, which is what makes the gem's `unitsml_post_processing`
(space insertion, marker stripping — formula.rb:450-473) a proven no-op on
every tree this renderer emits.

### OMML renderer: generated symbol data deferred from the first slice

**Resolved (2026-09-22), in two steps:**

The per-class symbol literals (`OMML_SYMBOLS`, `OMML_SYMBOL_TAG_NAMES`) landed
first (#63): named `Symbol` values, named Table parens (`Table#paren` reads
the paren's class literal, never its stored value), and a named Nary
operator's `chr` text all resolve through that table now, each pinned in
`test/formats/omml/renderer.spec.ts`'s "generated OMML symbol data" block. An
id the table does not carry still raises — not `RenderError` but the
walk's own `MissingSymbolDataError` — because that IS a parity gap: the
census found only 1,459 static classes, so anything else is one the port's
model does not know exists.

The one refusal that outlived that slice was `Text`'s `unicode[:name]`
substitution: `Text#symbol_value` (text.rb:126-129) inverts
`Mathml::Constants::UNICODE_SYMBOLS`/`SYMBOLS`, the SAME Ruby constant the
mathml render-tables slice already inverted for its own renderer, but
ARCHITECTURE.md §3 rule 4 forbids an omml kind file reading mathml's
generated slice. The dedicated follow-up taught `scripts/generate-corpus.rb`
to emit an independent OMML-owned copy (`OMML_UNICODE_INVERT`,
`OMML_SYMBOLS_INVERT` in `src/generated/omml/render-tables.ts`) — measured
against a live `to_omml` render rather than assumed from the mathml table,
using the repository's two-step generation protocol (source commit, then a
data commit regenerated from a clean pinned oracle checkout, with two
independent runs proving determinism). A name absent from BOTH tables is not
a parity gap either: `Text#symbol_value` falls through to `nil`, and the
surrounding `gsub` block substitutes the empty string for that (Ruby's
block-return-nil rule) rather than raising — measured directly on the pinned
oracle — so `src/render/text/omml.ts` renders it empty, and nothing in this
area still refuses.

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

### Integer-like keys in hash carriers are refused across renderers

**Trigger: the model gains an ordered hash input such as entry pairs or a
`Map`, together with shared key lookup and iteration helpers for every
renderer and normalized-model consumer.**

JavaScript plain objects do not preserve a Ruby hash's insertion position for
integer-like keys: those keys enumerate first in numeric order. By the time a
node constructor receives an object, the original chronology is already gone,
so changing only the internal copy cannot recover it. A shared emission guard
therefore refuses an order-sensitive hash containing an array-index key (`"0"`
through `"4294967294"`). This includes ordinary options/attributes hashes and
nested deterministic `#inspect` carriers such as OMML Fenced delimiters.

The refusal is hand-built-tree-only today. The only shipped input parser is
AsciiMath, whose transform creates option and attribute carriers from fixed
empty object literals; it never derives a carrier key from input. The shared
guard is nevertheless required because MathML emits arbitrary option and
attribute entries in order, OMML does the same for Mpadded and Fenced, and
UnicodeMath interpolates arbitrary hash values. Numeric-looking keys which are
not JavaScript array indices (`"01"`, `"-1"`, `"4294967295"`) remain accepted.

### OMML Fenced: Ruby's `#inspect` recursion markers are refused, not reproduced

**Trigger: a consumer reporting a self-referential delimiter, or the shape
check in `src/core/validate.ts` gaining a per-slot exemption for values whose
only consumer is a `#inspect`.**

`Fenced`'s OMML delimiters are the one place a renderer stringifies a raw Ruby
value through `#inspect`, and `#inspect` has an answer for a cycle rather than
looping: it prints a recursion marker. Measured on the oracle at `00c52783`, a
`Table` delimiter whose value is a self-referential list emits
`m:begChr m:val="[[...]]"`, one whose value is a list holding itself one level
down emits `[[[...]]]`, and a self-referential hash emits `{"self" => {...}}`.

This port refuses all of them, and not in the renderer: `assertMathNodeShape`
rejects any cyclic tree before a renderer is reached, because every other walk
in the port would run until the stack gave out. Narrowing that check to spare
the delimiter slots would mean threading "this slot is only ever inspected"
through the shape walk, for a shape no parser produces. The refusal is pinned
by `test/formats/omml/renderer.spec.ts`, "OMML fenced delimiter recursion
markers", so it cannot drift into some other behaviour unnoticed.

### OMML Fenced: a lone surrogate renders as the gem's byte escapes (resolved)

**Resolved (2026-09-22).** Ruby cannot BUILD the code point —
`0xD800.chr(Encoding::UTF_8)` raises `RangeError: invalid codepoint 0xD800 in
UTF-8` — but a String carries the bytes perfectly well. Measured on the
oracle at `00c52783`, `[0xD800].pack("U*")` gives a UTF-8 String whose
`valid_encoding?` is false, whose bytes are `ED A0 80`, and whose `#inspect`
prints `"\xED\xA0\x80"`: byte escapes, not `\uD800`. Swept over all 2,048
lone surrogates (0xD800..0xDFFF), not sampled: every one agrees with the
standard 3-byte UTF-8 encoding formula (byte1 = 0xE0|(cp>>12), byte2 =
0x80|((cp>>6)&0x3F), byte3 = 0x80|(cp&0x3F)) applied without the
surrogate-rejection check Ruby normally runs, zero disagreements. Three
interactions were also measured directly rather than assumed: two lone
surrogates adjacent (either side) stay ungrouped, matching this file's
"consecutive escapes never grouped" finding for `\u`-escapes; a lone
surrogate next to a C1 control or a noncharacter changes neither side's
spelling nor their order; and the resulting ASCII text (`\`, `x`, hex digits)
carries no `&`, so the double entity-decode pass in `delimiterAttribute` and
the XML attribute writer are both inert on it, confirmed by reading each
decoder's `&`-gated fast path rather than assuming.

So the gem renders this. A `Fenced` whose delimiter is a Formula valued
`["a\uD800b"]` emits, measured:

```xml
<m:begChr m:val="[&quot;a\xED\xA0\x80b&quot;]"/>
```

`inspectCodepoint` in `src/render/fenced/omml.ts` now reproduces this instead
of refusing it, pinned by `test/formats/omml/renderer.spec.ts`, "OMML fenced
delimiter Ruby #inspect escapes" (the `it.each` surrogate rows).

### `ModelHelper.validate_left_right` is modelled at one renderer, not in the model

**Trigger: a second renderer needing it, or the node constructors gaining any
gem-side validation at all.**

Every function constructor in the gem runs `ModelHelper.validate_left_right`
over its slots (`ternary_function.rb:16` and its siblings), and that helper
sends `first` to the `value` of any slot holding a `Math::Formula`. A Formula
or Mrow whose value is neither a list nor a hash therefore raises at
construction — measured on the oracle at `00c52783`, `NoMethodError: undefined
method 'first'` for an instance of String, for an instance of Integer, for
true, and for nil.

This port's constructors do not validate (ARCHITECTURE.md §5), so there is no
constructor to put the check in. `src/render/fenced/omml.ts` reproduces it for
`Fenced`'s three slots, because that is the renderer where the difference is
observable in bytes: without it, a `Formula` delimiter holding `"raw"` would
render `m:val="raw"` where the gem never gets as far as rendering. No other
carrier or renderer models it; a hand-built tree that would have raised in a
different gem constructor still renders here.

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

### UnicodeMath input returns a non-model tree instead of raising

```ruby
Plurimath::Math.parse("a ± b", :unicode).value
# => [[:factor, Symbol("a")],
#     [:expr, {combined_symbols: "&#xb1;"@2, expr: Symbol("b")}]]
```

No rule among `unicode_math/transform.rb`'s 519 has the signature
`{combined_symbols: simple, expr: simple}`, so that node survives the transform
as a Hash; the enclosing `{factor:, expr:}` node then cannot match either
(`simple` rejects a Hash); and `Kernel#Array` in `UnicodeMath::Parser#parse`
folds the outermost Hash into its `[key, value]` pairs rather than wrapping it.
The result is a `Formula` whose value holds Symbols, Arrays and a raw parse-tree
Hash — a tree no renderer can read — returned without raising.

`(a)/(+) b` reaches the same end through a different missing signature,
`{close_paren:, open_paren:, operator:}`. Both strings are the gem's OWN
`to_unicodemath` output for pinned corpus cases, so this is a round trip the gem
does not survive.

Not worked around: `src/formats/unicodemath/transform.ts` reproduces both trees
and `test/formats/unicodemath/model-fixtures.json` pins them. The nine
signatures the gem leaves unmatched over the pinned corpus — key AND value shape
per key, because Parslet binds on the matcher kind too — are listed as
`GEM_UNMATCHED_SIGNATURES` in that transform; anything else surviving it is
refused, because for this port that would mean a rule family the first slice has
not reached.

### `Formatter::Standard` ignores `locale:` for the decimal and group symbols

```ruby
Plurimath::Formatter::Standard.new(locale: "de").localized_number("1234567.891")
# => "1,234,567.891"   (German symbols would be "1.234.567,891")
Plurimath::NumberFormatter.new("de").localized_number("1234567.891")
# => "1.234.567,891"   (the base class does apply the locale)
```

`Standard#set_default_options` fills every `DEFAULT_OPTIONS` key, including
`decimal: "."` and `group: ","`, into the options hash before
`SymbolResolver#resolve` merges the locale's `SupportedLocales` entry underneath
it (`locale_symbols.merge(localizer_symbols_hash)`), so the locale never
supplies anything. `decimal` and `group` are the only two keys any of the 96
entries carries, so `locale:` is fully inert through `Standard`: measured on the
oracle (`00c52783`) for `"1234567.891234"` in asciimath, latex, html, mathml,
omml and unicodemath, `locale:` of `"en"`, `"de"`, `"fr"`, `"de-CH"`, `"ar"`,
`"xx"`, `nil`, `42`, `:de` and `"DE"` all answer `1,234,567.891'234`; an
unknown or non-string locale falls back to `:en` without raising
(`NumberFormatter#supported_locale`).

Evidence: pinned corpus cases `number-formatter-locale-de-standard-defaults`,
`number-formatter-locale-fr-standard-defaults` and
`number-formatter-locale-unsupported-falls-back` record the en symbols.
Reproduce with `BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x --
bundle exec ruby -e 'require "plurimath"; puts Plurimath::Formatter::Standard.new(locale: "de").localized_number("1234567.891")'`.

**The port reproduces this on purpose.** It stays byte-exact with the oracle
(decision 2026-09-21): `resolveNumberFormat` accepts `locale` and ignores it,
and `test/formatting/number-format-locales.spec.ts` plus the three corpus cases
in `number-formatter-numeric-pipeline.spec.ts` pin it. The fix is scheduled for
BOTH the Ruby gem and this port, after the byte-identical structure is
complete: make `Standard` layer the locale's symbols under explicit options,
then re-record the corpus and flip the port together. Not yet reported upstream.

### Typed-options refuse the gem's numeric-String/Symbol coercions

**Intentional, not a gap.** Three `formatter.options` fields the gem coerces
from a numeric String (or Symbol) are typed as numbers/strings in this port
and refuse a String/Symbol value instead of coercing it:

- `countOption` (`src/formatting/number-format.ts:206`) — the count options
  (`groupDigits`, `fractionGroupDigits`, `digitCount`, `paddingDigits`,
  `paddingGroupDigits`, `significant`) — the gem's `integer_option` accepts a
  numeric String/Symbol (`"3"`, `:"3"`) and coerces it; this port's fields are
  typed `number`, so a string is refused rather than coerced.
- `separatorOption` (`src/formatting/number-format.ts:275`) — the
  decimal/group/fraction-group markers — the gem stringifies any non-Boolean
  value (`to_s`/`inspect`) before use; this port's fields are typed `string`,
  so a non-string (other than the handled `undefined`/`null`) is refused
  rather than stringified.
- `baseOption` (`src/formatting/number-format.ts:328`) — the `base` option —
  the gem accepts a numeric String (`"16"`) and coerces it; this port's field
  is typed `number`, so a string is refused rather than coerced.

Each divergence is a typed-API boundary, the same shape as the locale
divergence above: the gem's dynamically-typed `options` Hash accepts whatever
Ruby can stringify, while this port's `FormatterSymbolOptions` fields are
typed TypeScript numbers/strings. None of the three is reachable through valid
typed TypeScript usage — only through a runtime cast or otherwise misusing the
type system (`as never`, `any`, a `.js` caller) would a numeric-String value
ever reach one of these functions. Not scheduled for a fix: there is no
Ruby-gem defect to mirror here, unlike the locale case above.

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
- `COLOR_ASCIIMATH_SYMBOLS` — widened to every static symbol class (1,459
  ids, matching `MATHML_COLOR_SYMBOL_LITERALS`), each verified through a
  full `Color` render; see "LaTeX: Color renders only the measured
  AsciiMath fragment" below for the closure.

All 1,525 entries across the six tables stay pinned by literal probe-backed
tests (`test/generated/latex-render-tables.spec.ts` and the behavioural pins in
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

### The degenerate-slot sweep detects a heap-address leak by re-probing, not by proof

**Trigger: a Ruby-side value model exists for the class of value `Symbol#initialize`
and `Number`'s HTML renderer expose here (an opaque object whose `to_s` is a
process-specific heap address), or `probe-degenerate-slots.rb` needs a stronger
guarantee than two same-process allocations disagreeing.**

`probe-degenerate-slots.rb` renders each degenerate cell twice and marks the row
`"stable": false` (dropping `output`) when the two renders disagree in bytes --
the mechanism that catches the `Symbol` and `Number` heap-address cases above,
and the ones this covers. Two allocations a few statements apart in one process
overwhelmingly will not share an address, but nothing proves they cannot: if a
future Ruby, GC setting, or object shape ever let two such allocations coincide,
a heap-address string would be committed to the fixture as `"stable": true`, and
the class-B regeneration gate would then fail non-deterministically across
machines rather than catching it at generation time. Measured today: exactly the
two rows expected to hit `Object#to_s` (`number[0]=node`, `symbol[0]=node`) are
marked unstable, and no others. Strengthening this into a real proof needs either
a value model that can represent "an opaque, non-reproducible Ruby object" without
executing `to_s` at all, or a probe that inspects the object rather than
re-rendering it -- deferred until one of those exists.

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

### HTML: Fenced refuses nondeterministic paren paths

**Trigger: a corpus case needs one of these constructs.**

The gem's `Fenced#to_html` takes two incompatible paren paths. A `Paren` instance is
rendered through `to_mathml_without_math_tag(...).nodes.first`.

**The generated half of this entry closed, 2026-09-07.**
`HTML_FENCED_PAREN_PAYLOADS` (`src/generated/html/symbols.ts`) carries that
value for all 24 `Paren` subclasses, measured on the pinned oracle and verified
through one live `Fenced#to_html` render per id, so named `Paren::*` nodes now
render. An id under `Paren::` the column does not carry is a new upstream
subclass: it raises `MissingSymbolDataError` rather than falling through to the
value path below.

Any non-`Paren` node contributes its raw `value`. Empty and nil-only formula, mrow, and
table values have deterministic Ruby `#inspect` bytes (`[]`, `[nil]`; a nil table value
contributes an empty string), so the port renders those measured cases. Once such a list
contains a node, Ruby `#inspect` includes that object's memory address; the port refuses
those nondeterministic bytes, matching the policy already recorded for LaTeX's
node-valued paren slots. Constructor-normalized Symbol/Paren and Number string or nil
values still render byte-for-byte; forged container values refuse at the runtime boundary.

### LaTeX renderer: `Color`'s attribute is the gem's one cross-format call

**Trigger: a consumer report with a color argument beyond the measured
shapes, or the P2 renderer round deciding a shared cross-format helper.**

`Color#to_latex` builds its brace argument from `parameter_one.to_asciimath`
(color.rb:41) — the latex path calling the asciimath renderer, which §3's
independent format slices deliberately cannot do. The port reproduces the
measured first-slot shapes from the latex slice's own generated literal
table (`LATEX_COLOR_ASCIIMATH_SYMBOLS`): formulas/mrows of symbols, every
static symbol id, numbers and texts. Any other first-slot node KIND (a
`fontStyle` or `fenced` node renders its own full asciimath in the gem)
raises a named `RenderError` instead of approximating a full asciimath
render this format does not own — the same policy, and the same measured
exception, MathML's `Color` entry above already carries.

This was previously a sized, still-open gap: a 2026-08-21 sweep of every
gem-declared AsciiMath symbol token through `color(<token>)(y)` — 3,217 of
them, the measured size of `Utility.symbols_hash(:asciimath)` on the pinned
oracle (00c52783) — found `toLatex` raising for 3,209 of the 3,216 that
parse to a top-level `Color` (only `-:` does not parse, on either side).
3,205 of those 3,209 were one missing symbol-id literal each, over 1,393
distinct ids, against the 2 entries (`Plus`, `Eqno`)
`LATEX_COLOR_ASCIIMATH_SYMBOLS` carried at the time — and all 1,393 turned
out already measured, byte-identical, by `MATHML_COLOR_SYMBOL_LITERALS`
(1,459 entries, key for key and value for value). Closing the bulk was the
re-emission `generate-corpus.rb` already performs for the mathml slice, not
new parity measurement — `latex_color_asciimath_symbols` now iterates
`static_symbol_classes` exactly as `mathml_color_symbol_literals` does,
2026-09-22. The remaining 4 (`ZZ`, `:`, `:.`, `:'` — tokens whose parsed
first slot is a `fontStyle` or `fenced` composite) are exactly the four
`toMathml` refuses too, and stay refused for the reason above: their
operand's render is a composite's full asciimath, which §3 keeps out of
this format.

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

The immediate risk was contained at the time this was written: both paths end
in a typed error, and the adversarial gate asserted `STACK_EXHAUSTED_MESSAGE`
for **every** row it pinned as rejected — true for `MAX_DEPTH`'s observed
behaviour then, but since superseded. **This is no longer what the gate
asserts** (see the 2026-09-23 update below): it now checks membership in the
current three-message set (`STACK_EXHAUSTED_MESSAGE`, `DEPTH_LIMIT_MESSAGE`,
or, for HTML, the JSON-nesting cap), driven off the case table so the
messages still cannot drift apart, and the messages stay distinct so a silent
swap cannot pass unnoticed.

**Update 2026-09-21: the trigger fired and the gate now covers LaTeX, HTML and
UnicodeMath.** `test/adversarial/adversarial-inputs.spec.ts` pins, per grammar,
parses at nesting 20 and refusals at 1,000 for nested braces/`\frac`/`\sqrt`/
parens/`\left(`/superscripts (LaTeX), `<mrow>`/`<sup>`/parens (HTML) and
parens/brackets/roots/fractions (UnicodeMath), plus unterminated and unmatched
closers, long runs, NUL and lone surrogates. On this measurement, every
1,000-deep refusal was the `RangeError` path (`STACK_EXHAUSTED_MESSAGE`); HTML
at exactly 100 levels was the JSON round trip's `nesting of 100 is too deep`,
which the gem raises too. Against the gem (measured on `00c52783`): LaTeX and
UnicodeMath parse at 20 and overflow the Ruby stack (`SystemStackError`) by
100; the port's ceiling is at or above the gem's at every depth measured on
both sides, so the port is never stricter than the gem at a measured depth
(LaTeX `\frac` is the near-tie: refused from 70 here, gem parses 60 and
overflows at 80). The claim that follows — that `MAX_DEPTH` never fires — did
not survive the next trigger below and has been corrected there.

**Update 2026-09-23: the "runtime change" trigger fired, and `MAX_DEPTH`
*does* fire — the 2026-09-21 claim was wrong as a universal statement, right
only for the one pool this repository happens to test under.** A review
running the same gate on Node 24 saw rows that were pinned to
`STACK_EXHAUSTED_MESSAGE` come back `DEPTH_LIMIT_MESSAGE` instead (e.g. "latex:
1,000 nested braces"). Reproduced directly this session, isolating the
variable: on the SAME build and the same three Node majors CI pins
(20/22/24 — installed and measured LOCALLY, via `mise`, at patches
20.20.2/22.23.2/24.18.0; CI's own matrix, `.github/workflows/ci.yml`, pins
only the majors and resolves whatever patch is current at each run, so these
exact patches are this measurement's, not a guarantee of what CI runs),
vitest's default `forks` pool (what this repository's CI actually runs,
unconfigured — no `pool` setting anywhere in this repo) never once produced a
`MAX_DEPTH` refusal, on any of the 94 adversarial-gate assertions;
`--pool=threads` flips several of them. The
mechanism, also measured directly: a trivial recursive function with no
grammar overhead reaches roughly 12,300–13,700 frames before `RangeError`
under `forks` on this machine (both Node 20 and 24), comfortably BELOW
`MAX_DEPTH` (20,000) — matching the 2026-08-17/2026-09-21 measurements exactly,
which is why nothing here was wrong on the pool this repo actually runs — but
roughly 49,700–55,200 frames inside a `worker_threads` worker (what a
`threads` pool test runs inside), comfortably ABOVE it. That is the opposite
of what this entry's own trigger note assumed ("a worker with a smaller
stack"): on this machine a `worker_threads` worker's usable JS stack measured
**larger** than a forked child's, not smaller, and that is what makes
`MAX_DEPTH` win the race for some 1,000-deep rows under `threads` where it
never did under `forks`. Under `--pool=threads`, "html: 1,000 nested parens"
goes a step further and reaches neither depth guard at all before the JSON
round trip's own nesting-100 cap catches the resulting tree in the post-parse
walk — a third legitimate typed refusal for the same row.

Both depth guards, and the JSON-nesting cap where HTML reaches it, are the
same clean, typed `ParseError`/`PARSE_ERROR` refusal — the property that is
actually invariant, and the property PORTING-STANDARDS' "refuse, don't crash
or hang" bar cares about. The gate's own tests were rewritten (2026-09-23) to
pin exactly that instead of a specific guard: `guardFor` in both "guard that
says which guard it was" describe blocks now asserts the error's class
(`instanceof ParseError`) and code (`cleanErrorCode`) before returning its
message, and the row-level assertions check membership in the set of known
clean-refusal messages rather than equality with one of them. **The
`instanceof ParseError` half of that was itself a gap a follow-up review
found and closed the same day**: the LaTeX/HTML/UnicodeMath block's `guardFor`
originally checked `cleanErrorCode(error) !== "PARSE_ERROR"` alone, which
(by design, for the dual ESM/CJS cross-copy case `cleanErrorCode`'s own
comment explains) accepts any `Error` carrying a `code: "PARSE_ERROR"`
property whether or not it is really a `ParseError` — so the claim in this
paragraph was not yet true when first written. It is true now. One test in
each block is still guard-specific: "does not refuse any pinned row through
MAX_DEPTH on vitest's forks pool" is `it.skipIf`'d on
`!isMainThread` (`node:worker_threads`) rather than merely commented as
pool-scoped, so it SKIPS with that reason under `--pool=threads`, where the
claim is known false, instead of failing there. `MAX_DEPTH`'s own mechanism —
that it fires exactly one past its threshold, found by binary search rather
than importing the private constant — is proven independently of any pool or
engine stack size in the new `test/pegkit/depth-limit.spec.ts`, by mutating
`ParseContext.depth` directly through the `dynamic()` atom rather than by
constructing enough real nested atoms to reach it.

One row was found to be more fragile still, and was deliberately left as
found rather than folded into this fix: the pre-existing (2026-08-17)
AsciiMath row `"tokens: 2,000 superscripts"` does not merely change GUARD
under `--pool=threads` — it stops refusing altogether (`outcomeOf` returns
`"parsed"`), because `threads`' larger stack budget on this machine is enough
to fully parse 2,000 `^y` levels without exhausting either guard. This is a
genuine environment-dependent OUTCOME flip, not just a message flip, on a row
outside the LaTeX/HTML/UnicodeMath rows this update's trigger was about; it is
recorded here rather than silently patched because closing it is a sizing
decision (how much deeper the row needs to be pinned to clear `threads`' much
larger budget too) that deserves its own measurement, not a rider on this
entry.

Still open: the deterministic bound itself remains undesigned (this entry's
original "why not fix now" reasoning is unchanged), and the exact
frames-per-real-stack-depth ratio is expected to keep moving with the engine,
the pool, and the host — the n=20/n=1,000 pins are placed to survive that
movement in OUTCOME, and, since 2026-09-23, the gate no longer asserts a
specific guard for the rows in between, only that a refusal is one of the
known clean shapes.

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

### OMML: two `to_omml` keywords refuse rather than render

**Trigger: `formatter` gains an OMML rendering path with B2's OMML number
slice, and UnitsML when [ARCHITECTURE.md](../ARCHITECTURE.md) §5 stops
deferring it wholesale.**

`Formula#to_omml` accepts `display_style`, `split_on_linebreak`, `formatter`
and `unitsml`. `display_style` and `split_on_linebreak` are implemented (B3);
the port names the other two and refuses them, rather than accepting the
keyword and quietly ignoring what it asks for — a silently dropped option
renders plausible OMML that is not what the caller asked for, which is the
failure this port refuses to have.

The per-node `toOmmlWithoutMathTag` keeps refusing `displayStyle` and
`splitOnLinebreak` by name too: the gem's `to_omml_without_math_tag` takes the
display style as a positional argument and has no line splitting, so neither
keyword belongs on it.

`src/formats/omml/renderer.ts` carries the reasons next to the refusal and
points here; this is the entry it points at.

### OMML: `fenced` refuses the paren shapes whose gem output is not reproducible

**Trigger: the paren value readers gain measured coverage for the shapes below,
or generated symbol data lands and supplies the named parens.**

`Fenced` reads its open and close parens through a value reader that mirrors
what the gem sends to each node kind. Seven shapes refuse instead of rendering,
each naming what the gem does with it:

- a named paren whose symbol id the pinned oracle does not carry
- a node kind with no value reader at all, where the gem raises `NoMethodError`
- a slot holding something the gem sends `include?` to and raises on
- a composite whose value is not the list the gem exposes
- a value containing node objects, whose Ruby `#inspect` embeds memory
  addresses and so cannot be reproduced deterministically
- a number whose Ruby `#inspect` spelling this port cannot yet reproduce
- anything else with no measured Ruby `#inspect` spelling

The first is the generated-symbol-data gap and lifts with it. The rest are
`#inspect` reproducibility, which is why they refuse rather than guess: the
gem's own output for them is either nondeterministic or unmeasured.

### LaTeX and UnicodeMath: three list slots the gem renders — CLOSED

**CLOSED.** The trigger below fired: the three slots now render, through
`rubyArrayInspectOrThrow` rather than by widening `interpolatedValue`, which is
the route this entry said was the wrong one. See `src/render/number/latex.ts`,
`src/render/number/unicodemath.ts` and `src/render/color/latex.ts`, and their
cases in `test/formats/latex/renderer.spec.ts` and
`test/formats/unicodemath/renderer.spec.ts`.

The measurements below are kept because they are the specification the fix was
built against, not because anything here is still outstanding.

~~Trigger: a case, probe or parser reaches a list in one of these three slots —
or `Mbox`'s list handling is generalised, at which point these are what the
generalisation has to answer for.~~

Found by review while `src/render/unary-function/latex.ts` was gaining the
`Mbox` list arm; measured on the pinned oracle `00c52783`, each with
`options: {}` supplied:

| call | gem | port |
|---|---|---|
| `Number([]).to_latex` | `"[]"` | refuses |
| `Number([]).to_unicodemath` | `"[]"` | renders nothing, silently |
| `Color(Number([]), Symbol("x")).to_latex` | `"{\color{[]} x}"` | refuses |

The UnicodeMath one is the worst of the three, because a silent empty answer is
the failure mode this port exists to avoid; the other two refuse loudly, which
is merely incomplete.

**Do not close these by widening `interpolatedValue`.** It is tempting —
`src/render/number/latex.ts:11` and `src/render/color/latex.ts:103` both call
it, and the `Mbox` arm calls it too — but the three slots do not reach Ruby the
same way. `Mbox#to_latex` interpolates its slot raw, so `"#{[]}"` is
`Array#inspect` and the answer is `"[]"`. `Number#to_latex` goes through
`Formatter::Numbers::TextRenderer`. And `Color`'s first slot is a NODE whose
`to_asciimath` is called, so a bare Ruby array there never inspects at all:
measured, `Color([], Symbol("x")).to_latex` and `Color([Symbol("a")], …)` both
raise `NoMethodError: undefined method 'to_asciimath'`, where the same `Color`
wrapping a `Number([])` renders. One helper cannot be right for all three,
which is why `Mbox`'s list handling sits at its own arm and this entry exists.

### UnicodeMath: `rubyInspect` spells strings with `JSON.stringify`

**Trigger: an option value, or any other slot reaching `rubyInterpolate`,
carries a string with a character the two spellings disagree on.**

`rubyInspect` (`src/formats/unicodemath/render-shared.ts`) renders a string
inside an inspected Array or Hash as `JSON.stringify(value)`. That is Ruby's
`String#inspect` only for the easy characters. Measured on the pinned oracle by
an exhaustive sweep of U+0000..U+02FF, the two disagree on:

Of the 768 codepoints swept, **725 are spelled identically** by the two and 43
are not — `\n`, `\t`, `\b`, `\f`, `\r`, `\"`, `\\` and U+0000..U+0006 and
U+0010..U+0019 all agree, the hex ones because their four digits hold no letter
for the case to differ on. The 43 that differ:

- U+0007, U+000B and U+001B — Ruby writes the named forms `\a`, `\v`, `\e`;
  JSON writes `\u0007`, `\u000b` and `\u001b`;
- U+000E, U+000F, U+001A and U+001C..U+001F — the seven C0 codepoints whose hex
  digits DO hold a letter, where Ruby uses UPPERCASE (`\u001A`) and JSON
  lowercase (`\u001a`);
- all 33 of U+007F..U+009F — Ruby escapes them, JSON leaves them bare.

Nothing in U+0020..U+007E differs and nothing above U+009F does. Separately,
and outside that count because it is a two-character rule rather than a
codepoint: `#` before `{`, `$` or `@`, which Ruby escapes and JSON does not.

`src/render/unary-function/latex.ts` carries the measured table for its own
`Mbox` arm and refuses above U+02FF rather than guessing. The two cannot share
it: section 3 rule 8 gives a kind file its own format's `render-shared` and no
other's, so a shared spelling would have to move into core, which is a layering
decision rather than a bug fix.

## Number formatting: an absurd exponent fails in both implementations, differently

`1e100000000000000000000` (an exponent past 64 bits) with `notation: "e"`. The
oracle raises `RangeError` ("bignum too big to convert into 'long'"); this port
raises `RangeError` ("Invalid string length"). Both refuse the input, so no
output can disagree; only the message differs. Found in a strict review of the
B2 notations branch. Not engineered around: no caller can act on the
difference, and an exact match would mean re-implementing the gem's
`Integer#to_i` overflow check for a value no formula holds.
