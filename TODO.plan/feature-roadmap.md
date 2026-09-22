# Feature roadmap — what the gem does that this port does not

A reference page, not a phase. [README.md](README.md) is the schedule by phase;
this page is the inventory those phases draw from: every capability of the gem
that this port does not support, or supports only in part, what stands in the
way of each, and the order in which they should land.

Everything below was measured on 2026-09-14 unless an entry says otherwise,
against the pinned oracle (plurimath 0.11.6 at `00c52783`,
`lib/plurimath/version.rb`) and this repository at `fdc043a`. The shared corpus
pin is `plurimath-testsuite` at `281d700`. A figure taken from somewhere else
names where it came from.

## The short version

- **Two prerequisites decide most of the order.** An XML reader, which this
  port does not have, gates MathML input and OMML input, and — through MathML
  input — a UnitsML bridge. A shared case shape that carries a render option, a
  configuration or a call other than parse-then-render, which
  `plurimath-testsuite` does not have, is the shared-data route for number
  formatting, `intent`, line splitting, OMML display style, `toDisplay` and
  evaluation. None of those six has a single shared case today; without that
  shape each would need a port-local generator instead.
- **Recommended first:** the options-carrying case kind in the testsuite,
  alongside **MathML input** as the first feature port — the latter once the
  maintainer chooses a native port over further deferral, which is still open.
  The reasoning is under [Build order](#build-order).
- **Not blocked on anything but effort:** the rest of the UnicodeMath
  transform, and publishing the OMML renderer on a subpath.
- **Blocked on a person, not on code:** UnitsML (maintainer decision), native
  MathML/OMML input versus further deferral, and whether the gem's CLI and
  global configuration are in scope at all.

## How "P4" is used here

This repository's own phase numbering (`TODO.plan/README.md`) is: P0
foundation, P1 AsciiMath, P2 output formats, P3 input formats, **P4 parity
modules**, P5 1.0. P4 is three things, not one — the number-formatter modes
nothing earlier reaches, evaluation, and MathML/OMML input
([p4-parity-modules](p4-parity-modules/README.md)). "P4" below means that
whole phase; number formatting is named as number formatting.

The phase table in `README.md` is behind the code: it lists P1 as active and
P3 as planned, and `gates.json#currentMilestone` is still `P1-completion`,
while the LaTeX, HTML and UnicodeMath parsers have all landed (`#76`, `#88`,
`#83`). This page does not correct that table — that is a milestone decision —
but it describes the code as it is.

## Inventory

Each entry: what the gem does, what the port does, and what blocks it.

### Input formats

The gem accepts seven parse types (`Math::VALID_TYPES`, `math.rb:16-24`):
`asciimath`, `latex`, `html`, `unicode`, `mathml`, `omml` and `unitsml`.

| Format | Port parser | Compat constructor | State |
|---|---|---|---|
| AsciiMath | `parseAsciimath` | registered | complete |
| LaTeX | `parseLatex` | registered | complete — 117 rules registered (`test/formats/latex/transform-coverage.spec.ts:81`), the transform's header recording one gem rule as dead and unported |
| HTML | `parseHtml` | **not registered** | transform complete: 78 of 78 rules (`test/formats/html/transform-coverage.spec.ts:170`) |
| UnicodeMath | `parseUnicodemath` | **not registered, deliberately** | partial: 118 rules registered (`test/formats/unicodemath/transform-coverage.spec.ts:117`) of the gem's 519 |
| MathML | none | not registered | not started |
| OMML | none | not registered | not started |
| UnitsML | none | not in the compat union | deferred |

#### UnicodeMath input — partial

**Gem:** `unicode_math/transform.rb` registers 516 rules, 519 with the three
`BaseNumberPrefix::Transform` adds (header of `src/formats/unicodemath/transform.ts`).

**Port:** four increments have landed — the corpus-derived first slice (`#83`),
multiscript and fraction (`#93`), and the table family (`#99`). The
decoration family and the `atoms` combinator are recorded in that header as
set aside. The compat constructor withholds `unicode` on a measured gate:
parity on a 50-input hand-written battery, 38 of which pass today, with the
relation and operator families (`=`, `≤`, `≥`, `→`, `∈`, `≈`, `≡`, binary `±`)
and the prime named as what is missing (`src/compat/index.ts`, comment above
`PARSERS`).

**Blocks:** nothing but effort. One open decision shapes the next slice — what
the transform's coverage invariant requires ([open-decisions](open-decisions.md),
last section). The decoration family also needs three gem constants
generated before it can be ported rather than transcribed.

#### HTML input — complete but not wired into compat

**Port:** `parseHtml` exists and is exported from `/html` (`#88`). `src/compat/index.ts`
registers only `asciimath` and `latex`, and its comment still says HTML
"arrive[s] later". No recorded reason for withholding it was found in
`TODO.plan/` or the compat file.

**Blocks:** a decision, not code. If the UnicodeMath standard applies — a
hand-written battery reaching parity before compat claims the format — that
battery has not been run for HTML. Until one or the other is recorded, the
comment is stale.

#### MathML input — not started

**Gem:** `mathml/parser.rb` calls `Mml.parse` (the `mml` gem, `~> 2.4.0` in
the gemspec) and walks the resulting `Mml::V4` model through
`Mathml::Translator`. There is no Parslet grammar, so pegkit has no part in it.

**Port:** nothing. `src/formats/mathml/` holds a renderer only. The gem also
exposes `Plurimath.mml_adapter` (`plurimath.rb:34-37`), which picks the XML
backend the `mml` gem parses with; the port has no equivalent, and nothing
records whether a single native reader makes it moot.

**Blocks:**

1. **No XML reader.** `src/xml/index.ts` exports `XmlElement`, `dump`,
   `dumpNodes`, `XmlDepthLimitError`, `XmlIndentError` and three types —
   write-side only. `ARCHITECTURE.md` §3 describes that layer as a tree plus
   serializer, so it changes before a reader lands. `deferred.md`'s XML-writer
   entry already records that the reader is a separate decision: evaluate
   existing parser libraries before building one.
2. **The strategy is answered on evidence, but the answer is not yet on
   `main`.** Bridging to the organisation's JavaScript package is closed:
   `@plurimath/mml@0.1.0` publishes three files and none of the `dist/` its
   entry points name (`npm view`, re-run for this page: `dist.fileCount` 3),
   and it is Opal-compiled. The detailed measurements — the translator's 44
   dispatched element classes, the attribute surface it reads, entity and
   unknown-element behaviour — are in PR #110, which is **open**, not merged.
   This page cites it rather than repeating it. The `plurimath/mml-js`
   repository is that package's source, so it is the same option, not a
   second one. The choice evidence alone could not make — a native port or
   further deferral — is **settled 2026-09-16: continued deferral, not a
   native port, for now**
   ([open-decisions.md](open-decisions.md#mathmlomml-input-strategy), PR
   #122, also open). This page's own build order below (Chain A, A2/A3) has
   not yet been revised to reflect that a native port is deferred rather than
   the recommended next step.

**Oracle data already available:** the corpus at `281d700` carries 217
`mathml:` expected-output blocks (92 under `corpus/asciimath/`, 125 under
`corpus/latex/`; counted by `grep`, not re-parsed). PR #110 measured 111 at an
earlier pin, all of which re-parse through `Math.parse(text, :mathml)`, and
found they reach 19 of the translator's 44 element classes. The 217 have not
been re-parsed for this page.

#### OMML input — not started

**Gem:** `omml/parser.rb` delegates to the `omml` gem (`~> 0.2.5`) and a
translating layer under `lib/plurimath/omml/`.

**Port:** nothing.

**Blocks:** the same XML reader as MathML. There is no JavaScript package to
evaluate: `npm view @plurimath/omml` returns E404 (re-run for this page). And
**no corpus case carries an OMML expectation** — the one `omml` string under
`corpus/` at `281d700` is the gem version in `corpus/provenance.yaml:40`. Cases
would have to be generated. The port's own OMML render fixtures
(`test/formats/omml/parity-fixtures.json`) are gem-emitted OMML, so they can
seed a round-trip slice the way the gem's own UnicodeMath output seeded that
transform's first slice.

#### UnitsML — deferred

**Gem:** both a parse type (`unitsml.rb`, which rejects a variable exponent at
construction) and a node, `Math::Function::Unitsml`, reached from AsciiMath's
`unitsml(...)` and converted at render time.

**Port:** deferred wholesale (`ARCHITECTURE.md` §5). `"unitsml(...)"` parses as
text and fires `onUnsupported`; `Math::Function::Unitsml` is the one class
`corpus/census.yaml` lists as deferred; every renderer refuses a `unitsml`
option by name.

**Blocks:**

1. A maintainer decision ([open-decisions](open-decisions.md), first entry),
   with a 1.0 consequence: `plurimath-js` supports UnitsML today.
2. `@unitsml/unitsml@0.6.7` still publishes three files and no `dist/`
   (`npm view`, re-run for this page).
3. **A bridge depends on MathML input; a native port need not.** The `unitsml`
   gem's `Formula#to_plurimath` (0.6.8, the version the oracle's lockfile
   resolves; `lib/unitsml/formula.rb:76-86`) builds its formula by re-parsing
   the MathML it generates — or its AsciiMath, when the text ends in `-`. A
   bridge therefore needs a MathML-to-model path first
   ([cross-cutting](cross-cutting.md), `ARCHITECTURE.md` §5). A native port
   could mirror that round trip or build the node model directly;
   `ARCHITECTURE.md` §5's design (raw-text node, render-time conversion) does
   not settle which.

### Output formats and render options

All six output formats render: AsciiMath, LaTeX, MathML, UnicodeMath, HTML
and OMML. What is missing is the options each gem render method takes beyond
the default, and one publishing gap.

#### OMML renderer — not published on a subpath

`package.json#exports` lists `./core`, `./asciimath`, `./html`, `./latex`,
`./mathml` and `./unicodemath`, and no `./omml`; `src/formats/omml/` has no
`index.ts`. `toOmml` is reachable only through the compat class. No recorded
reason was found. **Blocks:** nothing recorded; `ARCHITECTURE.md` §4's subpath
list also omits it, so the list changes with it.

#### Number formatting (`formatter:`) — only the no-formatter path

**Gem:** every `Formula#to_*` takes `formatter:` (`math/formula.rb:66-197`),
and `Plurimath.configuration.number_formatter` sets one globally.
`NumberFormatter` (`number_formatter.rb`, 142 lines) and `Formatter::Standard`
(`formatter/standard.rb`, 73 lines) front `Formatter::Numbers`, 19 files under
`formatter/numbers/`; with `formatter.rb`, `formatter/numbers.rb` and
`supported_locales.rb` the tree is 2,169 lines. What it covers, by file:

| Behaviour | Where in the gem |
|---|---|
| locale symbols (decimal, group, their overrides) | `symbol_resolver.rb`, `supported_locales.rb`, `standard.rb` `DEFAULT_OPTIONS` |
| digit grouping, integer and fraction side, padding | `integer.rb`, `fraction.rb`, `digit_sequence.rb`, `format_options.rb` |
| precision and significant digits | `precision_resolver.rb`, `significant.rb` |
| notation: `e`, `scientific`, `engineering` | `notation_renderer.rb:9` `SUPPORTED_NOTATIONS`, `formatted_notation.rb` |
| base notation, raising `UnsupportedBase` | `base_notation.rb:89`, `base.rb` |
| sign handling | `sign_renderer.rb` |
| per-format output of a formatted number | `text_renderer.rb`, `mathml_renderer.rb`, `omml_renderer.rb` |

**Port:** `src/formatting/` resolves a locale to a decimal marker, which the
grammars read at parse time. Every renderer refuses a `formatter` option — by
name in the MathML and OMML renderers (`src/formats/mathml/renderer.ts:79`,
`src/formats/omml/renderer.ts:28`), as an unknown key in the other four. The
`/formatting` subpath is deliberately unpublished (`ARCHITECTURE.md` §4).
Parsing base-prefixed literals (`0x`, `0b`, `0o`) is already ported in the
grammars; rendering them in base notation is not.

**Blocks:**

1. **No shared case exercises a formatter.** `plurimath-testsuite`'s
   `scripts/generate-corpus.rb` records configuration only as a diff from
   defaults, and its default for `number_formatter` is `nil` (`:451`); the
   schema has no case shape carrying one (`schema/rejections.json:58` notes
   that a later kind of case "gets a schema version instead"). There is nothing
   to port against until that exists.
2. **A design question.** The gem configures the formatter through
   module-level mutable state (`Plurimath.configure`, `plurimath.rb:39-56`).
   `ARCHITECTURE.md` §5 rejects a global `configure()` for this port (§3 rule
   7), so the formatter arrives as a per-call option, and its type — a class
   instance, or a plain options object — is undecided.

#### MathML `intent` — landed (B4)

**Gem:** `to_mathml(intent: true)` adds `intent` attributes through
`utility/intent_encoding.rb` (318 lines) and `Formula#intent_post_processing`
and its neighbours (`math/formula.rb:357-507`). `ARCHITECTURE.md` §5 already
lists `intent` as a symbol-context axis (`Dd`, `Ii`, `Jj`, ...).

**Port:** implemented in `toMathml` (`src/formats/mathml/intent-encoding.ts`,
`intent-post-processing.ts`, and per-kind writes across `src/render/*/mathml.ts`);
the compat `toMathml(true)` calls it rather than raising. Checked against the
oracle by port-local fixtures (`test/formats/mathml/render-options-fixtures.json`,
`intent*` groups), covering every intent-bearing gem class, the gem's own
`intent_encoding_spec.rb` examples, and the `ⓘ` UnicodeMath examples as models.

**Blocks:** no shared case. One known gem defect is reproduced, not fixed —
`intent: true` raises on a lone `UpcaseDd` ([deferred](deferred.md), upstream
issues).

#### Line splitting (`split_on_linebreak:`) — landed (B3)

**Gem:** `to_mathml` and `to_omml` both take it (`math/formula.rb:76-119`,
`:157-181`), splitting on `Linebreak` nodes through `new_line_support` and
`line_breaking` (`:325`); 44 files under `math/` reference one or the other
(`grep -rlE 'split_on_linebreak|line_breaking' math`), plus `cli.rb`.

**Port:** implemented in both renderers. The walk is one module,
`src/core/linebreak.ts` — layer 1, because two formats need it and neither may
import the other — a transliteration of the gem's mutating algorithm including
its oddities. MathML renders each line as its own `<math>` and concatenates;
OMML puts one `m:oMath` per line in the single `m:oMathPara`, separated by a
`<m:r><br/></m:r>` run. Checked against the oracle by port-local fixtures
(`test/formats/{mathml,omml}/render-options-fixtures.json`, generated by
`scripts/generate-render-options-fixtures.rb`), which record the gem's own
split as well as its bytes, over the 90 hand-built fixtures of the gem's line-break
specs. Rows whose OMML or MathML kind the port has not measured are pinned as
refusals in `test/formats/split-display-parity.spec.ts`; their split is still
checked.

**Blocks:** nothing. AsciiMath's `\` does not produce a `Linebreak`; LaTeX
`\\` and HTML `<br/>` do.

#### OMML `display_style:` — landed (B3)

**Gem:** `to_omml(display_style:)` (`math/formula.rb:157`), coerced by
`boolean_display_style` (`display_style.to_s == "true"`, `:415`).

**Port:** `OmmlOptions.displayStyle`, named and typed as `MathmlOptions`'
is. Measured on the oracle: `true` and `false` are byte-identical for most
inputs and differ where a renderer branches on the display style
(`lim_(x->0) f(x)`, `underset(a)(b)`, `overset(a)(b)`); `nil` is `false` —
NOT the default — for OMML as for MathML.

**Blocks:** nothing.

#### `toDisplay` (`Formula#to_display`) — not started

**Gem:** a tree dump in one of five notations (`math/formula.rb:197-237`),
built from `to_<format>_math_zone` methods defined in 17 files under
`math/`.

**Port:** the compat `toDisplay` raises `UnsupportedFeatureError`
(`src/compat/index.ts`).

**Blocks:** no shared case. All five renderers it composes already exist, so
nothing else stands in front of it.

#### Measured name sets — partial by design

The renderers refuse gem classes outside the set some input can construct, so
a parity gap fails loudly rather than rendering a default. [deferred.md](deferred.md)
records each: hand-listed name sets, the ten HTML aliases, `Scarries`, the
LaTeX `Color` operands (3,209 of 3,216 swept first slots refuse), OMML
`Fenced` paren shapes. These are not features to schedule on their own:
`deferred.md` records that the measured set widens when an input format that
constructs those classes lands, which is MathML and OMML input.

### Beyond conversion

#### Evaluation (`Formula#evaluate`) — not started

**Gem:** `Formula#evaluate(bindings)` (`math/formula.rb:57`) runs
`Math::Evaluation::Evaluator` and `ExpressionParser` (425 lines with
`iteration.rb`, 438 with the `evaluation.rb` loader); `def evaluate` appears in 40 files under `math/`; eight error
classes under `errors/evaluation/`; a bounded iteration cap,
`Configuration::DEFAULT_MAX_ITERATIONS = 100_000`.

**Port:** nothing. `ARCHITECTURE.md` §3 reserves `src/evaluation/`, importing
`core` only.

**Blocks:** no shared case — the generator records
`evaluation_max_iterations` only as provenance. The iteration cap is global
configuration in the gem and meets the same per-call design question as the
formatter. The `plurimath-js` compat surface has no `evaluate`, so this does
not affect the drop-in claim.

#### Command-line interface — in scope, not yet built

**Gem:** `lib/plurimath/cli.rb`, a Thor `convert` command with input and output
format, `--split-on-linebreak`, display style, `--math-rendering` (which is
`to_display`), and an XML engine choice.

**Port:** nothing yet. **SETTLED 2026-09-16: in scope**, and the direction is
an idiomatic Node CLI rather than flag-for-flag parity with the gem's Thor
command (`ARCHITECTURE.md` §10). **Blocks:** nothing but effort — everything
it calls would exist once the render options above do, so it has no reason
to go first.

#### Out of scope, recorded so it is not re-proposed

- **The Oga XML engine.** Canonical payloads are generated with Ox and the TS
  serializer is Ox-compatible; Oga is a parity check only (`ARCHITECTURE.md`
  §7).
- **Global `Plurimath.configure`.** Rejected in favour of per-call options
  (`ARCHITECTURE.md` §5).

## Signal from the maintainer's issue backlog

Read on 2026-09-14: 15 open issues across the organisation are assigned to the
maintainer. They are the gem's backlog, not this port's, and none is scheduled
here. What they signal:

- **MathML 4 compliance** (`plurimath#476`, `plurimath#477`): the gem's
  `<mstyle>` wrapper and a MathML 3 `rspace` value. If the gem changes either,
  every MathML byte fixture here moves with the next oracle bump, and the port
  follows the oracle rather than moving first (PORTING-STANDARDS.md).
- **Content MathML** (`plurimath#35`): the gem's translator raises on content
  elements today, per PR #110. A MathML reader port inherits whatever the gem
  does at the pin.
- **Semantic rendering** (`plurimath#114`, and ISO 80000-2 in `plurimath#129`,
  `plurimath#142`): points at `intent` and symbol rendering as live areas, so
  their bytes may change upstream.

## Build order

Two independent chains, sharing no prerequisite. They can run side by side.

```
Chain A — reading XML                Chain B — options the corpus cannot express
────────────────────────             ───────────────────────────────────────────
A1  XML reader (§3 changes)          B1  testsuite: options-carrying case kind
A2  MathML input + compat mathml     B2  number formatting (sliced, below)
A3  OMML input  + compat omml        B3  split_on_linebreak, OMML display_style
A4  UnitsML, once settled            B4  intent
                                     B5  toDisplay
                                     B6  evaluation

Not blocked: UnicodeMath transform completion → compat unicode;
             /omml subpath; the compat html decision.
```

### First: the options-carrying case kind, and MathML input

**B1 is the foundation that unblocks the most.** Six capabilities —
formatting, line splitting, OMML display style, `intent`, `toDisplay` and
evaluation — share one missing thing: a case recording a call the gem answered
with something other than default options. Without it, each would
invent a port-local generator, as the OMML and HTML render fixtures did.
Evaluation is the weakest case: it imports only `core`, so B1 is what lets it
be checked against shared cases, not what lets it be built. A shared kind belongs in the testsuite by this repository's
own rule — generators that write shared data live there
([cross-cutting](cross-cutting.md)) — and a Ruby reader can then check the gem
against the same cases. It is small, needs no port code, and is a schema
version rather than a change to existing cases. What it must carry: the input
and format, the call (render method, options, configuration, or bindings),
and the gem's answer or its error.

**A2, MathML input, is the recommended first feature port** if the maintainer
chooses a native port, for four reasons:

1. It is the largest remaining gap in the compat constructor, which names
   `mathml`.
2. Its oracle data already exists: 217 expected-MathML strings at the current
   pin.
3. It carries three things with it: its XML reader is OMML input's
   prerequisite, its model path is a UnitsML bridge's prerequisite, and it
   constructs classes that let the measured name sets widen.
4. Its investigation is done: PR #110 closes the bridge option on evidence
   and measures what a native port involves. What remains is the maintainer's
   choice between a native port and further deferral, then design (the §3
   reader).

**Why not number formatting first,** though it touches every renderer: it
cannot start before B1, and once B1 lands its data is the largest of the
five and the only one also facing an open API design question.

**Why not evaluation first,** though it is the most self-contained: it imports
only `core` and nothing depends on it, so it gains nothing from going early
and unblocks nothing; and the compat surface does not expose it.

### Chain A, in order

- **A1 → A2.** The reader is a §3 change and a library evaluation
  (`deferred.md`, XML writer entry), then the translator port. The corpus's
  MathML strings lock the elements they reach; PR #110 lists the 25 of 44 the
  earlier pin did not reach, which need cases written for them.
- **A3 after A2**, because it reuses the reader and has no oracle cases: they
  are generated first, seeded from gem-emitted OMML.
- **A4 only once the maintainer settles UnitsML.** A bridge needs A2 first; a
  native port needs it only if it mirrors the gem's MathML round trip.

### Chain B, in order

- **B2, number formatting, split so each slice has one reviewable surface.**
  Start with the per-call formatter contract and `Formatter::Standard`'s
  default symbols through the text renderer (AsciiMath, LaTeX, UnicodeMath,
  HTML); then the MathML and OMML number renderers; then precision and
  significant digits; then the three notations; then base notation. Base
  notation consumes the resolved options the first slice establishes
  (`base_notation.rb:30-42` reads `base`, `base_postfix` and `hex_capital`
  from them), so it follows that slice; the order among the other slices is a
  preference, not a dependency. The API-shape question
  (per-call options, and the formatter's type) is settled before the first
  slice.
- **B3, line splitting and OMML display style,** landed: two renderers only,
  and the `Linebreak` kind already rendered.
- **B4, `intent`,** landed: MathML only, but 318 lines of encoding plus the
  formula's own post-processing, and a known gem defect to reproduce.
- **B5, `toDisplay`,** after the renderers it composes stop changing under B2
  to B4, since it embeds their output.
- **B6, evaluation,** last on this chain, for the reasons above — though
  nothing prevents it running earlier if a consumer asks.

### Alongside both chains

The UnicodeMath transform's remaining families, ending with registering
`unicode` in compat once the 50-input battery reaches parity; publishing
`/omml`; and recording a decision for compat `html`. None waits on A or B.

## Open questions this page raises

| Question | Why it matters |
|---|---|
| Is the options-carrying case kind a testsuite schema version, and who authors it? | B1 is chain B's shared-data route |
| Does compat register `html` now, or after a hand-written battery like UnicodeMath's? | the compat comment is stale either way |
| Is `/omml` published, and does §4's subpath list gain it? | `toOmml` is compat-only today |
| ~~Is a CLI in scope, or does it join §10's YAGNI list?~~ | settled 2026-09-16: in scope, idiomatic Node CLI over gem-flag parity (`ARCHITECTURE.md` §10) |
| Does the formatter arrive as a class instance or a plain options object? | settles before B2's first slice |
| ~~Native MathML/OMML input, or further deferral?~~ | settled 2026-09-16: continued deferral (`open-decisions.md`); Chain A's A2/A3 ordering above still needs revising to match |
| Does the port need an equivalent of `Plurimath.mml_adapter`? | the gem picks the `mml` XML backend globally (`plurimath.rb:34-37`); one native reader may make it moot |
