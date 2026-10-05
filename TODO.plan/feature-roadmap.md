# Feature roadmap — what the gem does that this port does not

A reference page, not a phase. [README.md](README.md) is the schedule by phase;
this page is the inventory those phases draw from: every capability of the gem
that this port does not support, or supports only in part, what stands in the
way of each, and the order in which they should land.

Everything below was first measured on 2026-09-14, against the pinned oracle
(plurimath 0.11.6 at `00c52783`, `lib/plurimath/version.rb`) and this
repository at `fdc043a`, whose shared corpus pin was `plurimath-testsuite` at
`281d700`. The port's status was re-checked on 2026-09-24 against `main` at
`70f9482`, whose corpus pin is `plurimath-testsuite` at `07bf5e3`
(`git ls-tree 70f9482 submodules/plurimath-testsuite`), and the evaluation entry
against `main` at `39f5dd4`, where #155 merged. The corpus figures were
re-measured on 2026-10-05 against `main` at `0e36296`, whose corpus pin is
`plurimath-testsuite` at `4a8ba64`. The oracle pin is unchanged, so
figures about the gem stand. A figure taken from somewhere else names where it
came from.

## The short version

- **Two prerequisites decide most of the order.** An XML reader, which this
  port does not have, gates MathML input and OMML input, and — through MathML
  input — a UnitsML bridge. A shared case shape that carries a render option,
  a configuration or a call other than parse-then-render is the shared-data
  route for number formatting, `intent`, line splitting, OMML display style,
  `toDisplay` and evaluation. `plurimath-testsuite` now has one, the
  `plurimath-corpus/calls/1` schema (testsuite #17), but its only call method
  at `4a8ba64` is `number_formatter`, in 66 cases
  (`grep -rhoE "method: [a-z_]+" corpus`). The other five have no shared
  case; each landed checked against oracle-measured expectations kept in this
  repository instead.
- **Recommended first** was the options-carrying case kind in the testsuite,
  alongside **MathML input** as the first feature port. The case kind landed
  as `calls/1`. MathML input did not start: the maintainer settled on
  continued deferral over a native port on 2026-09-16 (#122). The reasoning is
  under [Build order](#build-order).
- **UnicodeMath transform:** 483 of the gem's 519 rules registered; every
  one of the other 36 is dead in the gem (26) or fires on no input found (10),
  each listed with its evidence in the header of
  `src/formats/unicodemath/transform.ts`.
- **OMML renderer:** published on `./omml` since #112.
- **Blocked on a person, not on code:** UnitsML (maintainer decision).
  Native MathML/OMML input versus further deferral is settled as deferral
  (#122), and the CLI as in scope (#125); global configuration stays out of
  scope (below).

## How "P4" is used here

This repository's own phase numbering (`TODO.plan/README.md`) is: P0
foundation, P1 AsciiMath, P2 output formats, P3 input formats, **P4 parity
modules**, P5 1.0. P4 is three things, not one — the number-formatter modes
nothing earlier reaches, evaluation, and MathML/OMML input
([p4-parity-modules](p4-parity-modules/README.md)). "P4" below means that
whole phase; number formatting is named as number formatting.

The phase table in `README.md` and `gates.json#currentMilestone` agree: both
put the project in P2 (the milestone advanced in #121). Work from later phases
is on `main` ahead of that milestone: the LaTeX, HTML and UnicodeMath parsers
(P3; `#76`, `#88`, `#83`), and number formatting and evaluation (P4; `#126`,
`#152`, `#155`). This page does not move the milestone — that is a maintainer
decision — but it describes the code as it is.

## Inventory

Each entry: what the gem does, what the port does, and what blocks it.

### Input formats

The gem accepts seven parse types (`Math::VALID_TYPES`, `math.rb:16-24`):
`asciimath`, `latex`, `html`, `unicode`, `mathml`, `omml` and `unitsml`.

| Format | Port parser | Compat constructor | State |
|---|---|---|---|
| AsciiMath | `parseAsciimath` | registered | complete |
| LaTeX | `parseLatex` | registered | complete — 117 rules registered (`test/formats/latex/transform-coverage.spec.ts:81`), the transform's header recording one gem rule as dead and unported |
| HTML | `parseHtml` | registered (#119) | complete: 78 of 78 rules (`test/formats/html/transform-coverage.spec.ts:170`) |
| UnicodeMath | `parseUnicodemath` | registered (#119) | partial: 483 rules registered (`FINAL_COUNT`, `test/formats/unicodemath/transform-coverage.spec.ts:87`) of the gem's 519; the other 36 are 26 dead and 10 unreached |
| MathML | none | not registered | not started; deferred (#122) |
| OMML | none | not registered | not started; deferred (#122) |
| UnitsML | none | not in the compat union | deferred |

#### UnicodeMath input — partial

**Gem:** `unicode_math/transform.rb` registers 516 rules, 519 with the three
`BaseNumberPrefix::Transform` adds (header of `src/formats/unicodemath/transform.ts`).

**Port:** 483 of the 519 rules are registered (`FINAL_COUNT`,
`test/formats/unicodemath/transform-coverage.spec.ts:87`). They landed as the
corpus-derived first slice (`#83`), multiscript and fraction (`#93`), the
table family (`#99`), the relation and operator family (`#114`), the NARY
family minus the half behind `atoms` (`#116`), the decoration family (`#117`),
the `atoms` combinator's directly-verifiable unwraps (`#118`), and slices C
and D (`#131`), A, E, F, G1 and G2 (`#140`, 409 rules), H (`#141`, 422) and
I, J and K (`#144`, 473), and the last ten firing rules (483), which classified
the last 46 ids on the oracle: 10 fire and are registered, 26 are dead in the
gem, 10 are unreached. The compat constructor registers `unicode` (#119) on
a measured gate: a hand-written battery of 50 inputs, 49 parsed to an exact
match with the oracle and the 50th a refusal both sides share, with
`KNOWN_PORT_GAPS` empty (`src/compat/index.ts`, comment above `PARSERS`).

**Blocks:** nothing. No unregistered rule has a known firing input; a new
witness for one of the 10 unreached ids would reopen it. The
coverage-invariant question that shaped
the next slice is settled: the wide reading, 2026-09-16 (#122;
[open-decisions](open-decisions.md)).

#### HTML input — complete, and registered in compat

**Port:** `parseHtml` exists and is exported from `/html` (`#88`). The compat
constructor registers `html` (#119), on the same standard as UnicodeMath: a
hand-written, oracle-verified battery (#115) of 50 inputs, all 50 parsed to an
exact match (`test/compat/html-battery.spec.ts`; `src/compat/index.ts`,
comment above `PARSERS`).

**Blocks:** nothing.

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
2. **The strategy is answered on evidence, and settled.** Bridging to the
   organisation's JavaScript package is closed:
   `@plurimath/mml@0.1.0` publishes three files and none of the `dist/` its
   entry points name (`npm view`, re-run for this page: `dist.fileCount` 3),
   and it is Opal-compiled. The detailed measurements — the translator's 44
   dispatched element classes, the attribute surface it reads, entity and
   unknown-element behaviour — landed with PR #110, in
   [open-decisions.md](open-decisions.md#mathmlomml-input-strategy).
   This page cites it rather than repeating it. The `plurimath/mml-js`
   repository is that package's source, so it is the same option, not a
   second one. The choice evidence alone could not make — a native port or
   further deferral — is **settled 2026-09-16: continued deferral, not a
   native port, for now**
   ([open-decisions.md](open-decisions.md#mathmlomml-input-strategy), PR
   #122). PR #120, open, would make the compat constructor's refusal name the
   missing XML reader; on `main` it is still the generic
   `UnsupportedFormatError`. The build order below marks Chain A deferred to
   match.

**Oracle data already available:** the corpus at `4a8ba64` has MathML-input
cases of its own: `corpus/mathml/` holds 299 cases, 287 with a per-format
`expected` map and 12 whose parse is expected to raise. Its parse cases carry
714 `mathml:` expectations in all: 92 under `corpus/asciimath/`, 125 under
`corpus/latex/`, 20 under `corpus/unicode/`, 287 under `corpus/mathml/` and
190 under `corpus/omml/`. Each is a string, an `{output: …}` map, or, for 2
of them, an `{error: …}` map recording a render the gem refuses. Another 66
sit in the seven `calls/1` number-formatting files, which record
formatted-number output rather than parse cases. Counted by loading every `corpus/*/*.yaml` with Ruby's `YAML.safe_load_file` and tallying
`cases`, `error` and the `expected` keys per directory and per `schema`, so
the `calls/1` files under `corpus/asciimath/` are counted apart (`git grep -c
'^    mathml:'` agrees per file, but its `corpus/asciimath/` total, 158,
includes those 66). `test/core/corpus-pin.spec.ts` lists the `mathml/` and
`omml/` payloads as pending a reader, so no spec runs them yet. PR #110
measured 111 at the earlier corpus pin `5182660`, all of which re-parse through
`Math.parse(text, :mathml)`, and found they reach 19 of the translator's 44
element classes. The cases at `4a8ba64` have not been re-parsed for this
page.

#### OMML input — not started

**Gem:** `omml/parser.rb` delegates to the `omml` gem (`~> 0.2.5`) and a
translating layer under `lib/plurimath/omml/`.

**Port:** nothing.

**Blocks:** the same XML reader as MathML. There is no JavaScript package to
evaluate: `npm view @plurimath/omml` returns E404 (re-run for this page on
2026-09-14). The corpus at `4a8ba64` has OMML-input cases:
`corpus/omml/` holds 199 cases, 190 with a per-format `expected` map and 9
whose parse is expected to raise. Parse cases now carry 477 `omml:`
expectations, 2 of them `{error: …}` maps (287 under
`corpus/mathml/`, 190 under `corpus/omml/`), besides the 64 in six `calls/1`
number-formatting files (same measurement as the MathML figures above). The
port's own OMML render fixtures
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
and OMML. Every render option this section lists has landed.

#### OMML renderer — published on `./omml`

Landed in #112: `package.json#exports` lists `./omml`,
`src/formats/omml/index.ts` exports `toOmml`, and `ARCHITECTURE.md` §4's
subpath list names it (`ARCHITECTURE.md:310`). **Blocks:** nothing.

#### Number formatting (`formatter:`) — landed (B2)

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

**Port:** every renderer takes `formatter:` — all six targets — as a plain
options object mirroring `Formatter::Standard.new(locale:, string_format:,
options:, precision:)` (`src/formatting/number-format.ts`): locale symbols
(the locale is inert, as `Standard` makes it — [deferred](deferred.md)),
digit grouping and padding, precision and significant digits, the three
notations, base notation, and `string_format` templates
(`src/formatting/string-format.ts`). OMML draws both of the gem's number paths
(`src/render/number/omml.ts`). Checked against every pinned `calls/1` case
and against cases measured on the oracle (`test/formatting/`). There is no
global `configure()` (`ARCHITECTURE.md` §5, §3 rule 7), and the `/formatting`
subpath is deliberately unpublished (`ARCHITECTURE.md` §4).

**Blocks:** none. Two gem quirks are reproduced, not fixed — OMML's insert
path writes a semantic base as prefixed text, and `string_format` templates
match unanchored and are ignored silently when they do not parse
([deferred](deferred.md), "fix in both repos later").

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

#### `toDisplay` (`Formula#to_display`) — landed (B5)

**Gem:** a tree dump in one of five notations (`math/formula.rb:197-237`),
built from `to_<format>_math_zone` methods defined in 17 files under
`math/`.

**Port:** the compat `toDisplay` returns that tree dump (#139, extended to the
remaining kinds in #150; `src/compat/to-display.ts`). Measured on `70f9482`:
`new Plurimath("x^2", "asciimath").toDisplay("latex")` begins
`|_ Math zone\n  |_ "x^{2}"`. A few kinds are refused with
`UnsupportedFeatureError`, most as parity with a crash in the gem itself
(`Nary`, `FontStyle` under `unicodemath`, `Substack`), the rest as
unreachable or out of scope (`Msgroup`, `Unitsml`, a bare string in a
sequence); the module doc of `src/compat/to-display.ts` records each reason.

**Blocks:** nothing. It has no shared case; `calls/1` carries only
`number_formatter`.

#### Measured name sets — partial by design

The renderers refuse gem classes outside the set some input can construct, so
a parity gap fails loudly rather than rendering a default. [deferred.md](deferred.md)
records each: hand-listed name sets, the HTML function-name arms (the ten
corpus aliases plus the unary names added since), the four LaTeX `Color`
operands still refused (`ZZ`, `:`, `:.`, `:'`, of 3,216 swept first slots),
OMML `Fenced` paren shapes. `Scarries`, once on this list, is now admitted in
every format. These are not features to schedule on their own:
`deferred.md` records that the measured set widens when an input format that
constructs those classes lands, which is MathML and OMML input.

### Beyond conversion

#### Evaluation (`Formula#evaluate`) — landed through the function slice (B6)

**Gem:** `Formula#evaluate(bindings)` (`math/formula.rb:57`) runs
`Math::Evaluation::Evaluator` and `ExpressionParser` (425 lines with
`iteration.rb`, 438 with the `evaluation.rb` loader); `def evaluate` appears in 40 files under `math/`; eight error
classes under `errors/evaluation/`; a bounded iteration cap,
`Configuration::DEFAULT_MAX_ITERATIONS = 100_000`.

**Port:** `evaluate(formula, bindings, options)` in `src/evaluation/`,
importing `core` only and re-exported from the root entry alone
(`src/index.ts`), with the gem's eight evaluation error classes
(`src/evaluation/errors.ts`). Two slices have landed. The arithmetic slice
(#152): numbers, symbols, `+`, binary and unary `-`, unary `+`, `*`, `/`,
`^`, implicit multiplication and grouping parentheses. The function slice
(#155): `Abs`, `Ceil`, `Floor`, `Gcd`, `Lcm`, `Min`, `Max`, `Mod`, `Root`,
`Text` variable lookup, bounded `Sum`/`Prod`, and `Sin`, `Cos`, `Tan`, `Cot`,
`Sec`, `Csc`, `Arcsin`, `Arccos`, `Arctan`, `Exp`, `Ln` and `Sqrt`, correctly
rounded (`src/evaluation/libm.ts`). `Lg` and `Log` are ported digit-exact
with glibc 2.35, `Lg` refusing where the `log` it calls lies inside
`log`'s rounding band and the answer depends on its rounding (0.32% of the measured sample, `deferred.md`) (`libm-log10.ts`, from Sun's fdlibm; `libm-log2.ts`, from
Arm's optimized-routines). The iteration cap is a per-call option,
`EvaluationOptions`, defaulting to the gem's 100,000. Checked against
port-local fixtures generated from the oracle
(`test/formats/evaluation/evaluation-fixtures.json`,
`scripts/generate-evaluation-fixtures.rb`). `Sinh`, `Cosh`, `Tanh`, `Sech`,
`Csch` and `Coth` are glibc's own, from fdlibm on an `expm1` that gives
glibc's digits, and refused (`UnsupportedFeatureError`) only where they call
`exp` inside its rounding band (`src/evaluation/libm-hyperbolic.ts`;
`TODO.plan/deferred.md`, "Evaluation: the hyperbolic functions").

**Blocks:** nothing ported is missing; the hyperbolic refusals are those of
`exp`'s rounding band (`deferred.md`). There is no shared
case: `calls/1` carries only `number_formatter`. The `plurimath-js` compat
surface has no `evaluate`, so this does not affect the drop-in claim.

#### Command-line interface — in scope, not yet built

**Gem:** `lib/plurimath/cli.rb`, a Thor `convert` command with input and output
format, `--split-on-linebreak`, display style, `--math-rendering` (which is
`to_display`), and an XML engine choice.

**Port:** **SETTLED 2026-09-16: in scope**, and the direction is an
idiomatic Node CLI rather than flag-for-flag parity with the gem's Thor
command (`ARCHITECTURE.md` §10; recorded in #125). The first slice landed in
#127: `plurimath convert` with `--from` and `--to` only (`src/cli/args.ts`),
and #129 strips one trailing newline from its input (`src/cli/run.ts:43`).
**Blocks:** nothing but effort.

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

Status on `main`: Chain A has not started, and A2/A3 are deferred (#122). On
Chain B, B1 landed in the testsuite as `calls/1` (`number_formatter` only), B2
in #126, #133, #143 and #146, B3 in #132, B4 in #136, B5 in #139 and #150, and
B6 in #152 and #155, with every function now ported; some of them refuse
near a rounding band (see Evaluation, above).

```
Chain A — reading XML                Chain B — options the corpus cannot express
────────────────────────             ───────────────────────────────────────────
A1  XML reader (§3 changes)          B1  testsuite: options-carrying case kind
A2  MathML input + compat mathml     B2  number formatting (sliced, below)
A3  OMML input  + compat omml        B3  split_on_linebreak, OMML display_style
A4  UnitsML, once settled            B4  intent
                                     B5  toDisplay
                                     B6  evaluation

Not blocked: UnicodeMath transform completion
             (compat unicode and html: #119; /omml subpath: #112)
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

**Chain A is deferred (#122).** A2, MathML input, was written up here as the
recommended first feature port if the maintainer chose a native port; the
choice was deferral, to be revisited once a working way to read MathML/OMML
XML exists ([open-decisions](open-decisions.md#mathmlomml-input-strategy)).
The four reasons it was recommended still describe what A2 carries:

1. It is the largest remaining gap in the compat constructor, which names
   `mathml`.
2. Its oracle data already exists: at the current pin, `4a8ba64`,
   `corpus/mathml/` holds 299 MathML-input cases (287 with a per-format
   `expected` map, 12 whose parse is expected to raise).
3. It carries three things with it: its XML reader is OMML input's
   prerequisite, its model path is a UnitsML bridge's prerequisite, and it
   constructs classes that let the measured name sets widen.
4. Its investigation is done: PR #110 closes the bridge option on evidence
   and measures what a native port involves. The maintainer's choice between
   a native port and further deferral is made: deferral, for now (#122).

**Why not number formatting first,** though it touches every renderer: it
cannot start before B1, and once B1 lands its data is the largest of the
five and the only one also facing an open API design question (since
settled: a plain options object, [open-decisions](open-decisions.md)).

**Why not evaluation first,** though it is the most self-contained: it imports
only `core` and nothing depends on it, so it gains nothing from going early
and unblocks nothing; and the compat surface does not expose it.

### Chain A, in order

Deferred as a whole (#122); this is the order if the deferral is revisited.

- **A1 → A2.** The reader is a §3 change and a library evaluation
  (`deferred.md`, XML writer entry), then the translator port. The corpus's
  MathML strings lock the elements they reach; PR #110 lists the 25 of 44 the
  earlier pin did not reach, which need cases written for them.
- **A3 after A2**, because it reuses the reader. Its oracle cases exist now:
  `corpus/omml/` at `4a8ba64` holds 199 OMML-input cases (above).
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
  to B4, since it embeds their output. Landed (#139, #150).
- **B6, evaluation,** last on this chain, for the reasons above — though
  nothing prevents it running earlier if a consumer asks. Landed through the
  function slice (#152, #155).

### Alongside both chains

The UnicodeMath transform's remaining rules: 483 of 519 registered, and the
other 36 dead or unreached on the oracle, so nothing is queued here unless
one of the 10 unreached ids gains a witness. None waits on A or B. The
other items once listed here have landed: `unicode` and
`html` are registered in compat (#119), and `/omml` is published (#112).

## Open questions this page raises

| Question | Why it matters |
|---|---|
| ~~Is the options-carrying case kind a testsuite schema version, and who authors it?~~ | landed as the testsuite's `plurimath-corpus/calls/1` schema (`schema/calls.json`, testsuite #17) |
| ~~Does compat register `html` now, or after a hand-written battery like UnicodeMath's?~~ | registered after a 50-input battery (#115, #119) |
| ~~Is `/omml` published, and does §4's subpath list gain it?~~ | published, and listed in §4 (#112) |
| ~~Is a CLI in scope, or does it join §10's YAGNI list?~~ | settled 2026-09-16: in scope, idiomatic Node CLI over gem-flag parity (`ARCHITECTURE.md` §10) |
| ~~Does the formatter arrive as a class instance or a plain options object?~~ | settled: a plain options object (`open-decisions.md`, #125) |
| ~~Native MathML/OMML input, or further deferral?~~ | settled 2026-09-16: continued deferral (`open-decisions.md`); Chain A above is marked deferred to match |
| Does the port need an equivalent of `Plurimath.mml_adapter`? | the gem picks the `mml` XML backend globally (`plurimath.rb:34-37`); one native reader may make it moot |
