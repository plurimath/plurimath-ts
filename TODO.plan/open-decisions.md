# Open decisions

Deliberately unsettled, each with an owner and the point by which it must be
answered. `ARCHITECTURE.md` §11 is the authoritative list; this page adds the
context needed to decide. The table below is what is still open. Two compat
questions — the `data` property and the declaration target — were settled on
2026-09-04 and are kept below, marked SETTLED, so the reasoning that settled
them is not lost.

Nothing here blocks the active phase.

| Decision | Owner | Needed by |
|---|---|---|
| UnitsML approach, and its 1.0 consequence | maintainer + upstream | before 1.0 |
| npm package name and release line | maintainer | before first publish |
| Bundle budgets | maintainer | during P1, from real numbers |
| Symbol data as shared data | maintainer + gem | after P1 |
| Root `parse(input, format, options)` function | maintainer | not yet set |

## UnitsML, and what it means for 1.0

Deferred because the upstream JavaScript package is unusable
([cross-cutting](cross-cutting.md)). The coupling to worry about: `plurimath-js`
supports UnitsML today, so at package takeover either parity exists or the
break is documented and the "drop-in replacement" claim is dropped.

Options when it returns: fix upstream and bridge behind the leaf-service
boundary; port UnitsML natively; or keep deferring.

Re-checked 2026-09-16, independently of the MathML/OMML re-check below:
`@unitsml/unitsml@0.6.7` (published by `unitsml/unitsml-js`, part of the
separate `unitsml` GitHub org — not `plurimath`) is still the latest version
and still ships only `LICENSE`, `package.json` and `README.md`; every
`package.json` entry field points at a `dist/` the tarball does not contain,
so `require()` fails with `MODULE_NOT_FOUND` and `import()` fails with
`ERR_MODULE_NOT_FOUND` — different codes, same missing `dist/` underneath
(re-verified 2026-09-17: `npm install @unitsml/unitsml`, then both calls in
Node). The repo's
own README says "Status: scaffolding." No GitHub issue in either
`unitsml/unitsml-js` or `unitsml/unitsml-ruby` tracks this defect — it is
unreported, not merely unfixed. Still open: keep deferring for now, informed
by the same evidence gathered for the MathML/OMML decision below.

## npm package name and release line

The Opal package owns `@plurimath/plurimath`. Design position: publish `0.x`
early under a distinct name, explicitly experimental, and take the name over at
1.0 when the compat class is complete and `/core` locks.

## Compat `data` property

Both measured class declarations expose a writable `data` holding an Opal
`ParserResult` — runtime-specific and not reproducible (published
[`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts);
source head `ce297e2`, `src/index.ts:4-9`). Either expose a name-compatible
`readonly data: FormulaNode`, or document its absence.

**SETTLED 2026-09-04: expose `readonly data: FormulaNode`.** Same property name,
this port's model behind it. A consumer that READS `.data` gets something
meaningful; one that WRITES it breaks under either choice, so exposing it strictly
dominates. This is what `ARCHITECTURE.md` §11 already recommended.

The declaration fixture records this separately from the declaration-target
choice, because the two are independent.

## Compat declaration target

The published `@plurimath/plurimath@0.2.2` declarations and source head
`ce297e2` differ in three measured ways: published `0.2.2` has six methods,
`toMathml()` takes no argument, and its `Format` union contains `mahtml`; source
head has seven methods by adding `toUnicodemath()`, declares
`toMathml(intent?: boolean)`, and uses `unicode` (published
[`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts)
and [`dist/plurimath-opal.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/plurimath-opal.d.ts);
source head `src/index.ts:4-38` and `src/plurimath-opal.d.ts:8`; the maintainer's
independent `curl` fetched both published files with exit `0`).

**SETTLED 2026-09-04: source head.** The maintainer's reasoning, which is the
whole argument: this package has published nothing, so it carries no
compatibility debt to any consumer, and there is no reason to inherit a defect
it is not bound by. `mahtml` appears only in a TypeScript declaration, so it is
compile-time only; freezing the fixture against it would make a typo permanent
in exchange for nothing.

The `mahtml` spelling is logged as an upstream item in
`~/ruby_gems/plurimath/PORT-FINDINGS.md:96-98` — verified by reading that file on
2026-09-04 — to be fixed there rather than mirrored here. Upstream work is
deliberately not started yet.

## Bundle budgets

Deferred on purpose: ceilings set before the first real measurement would be
invented. Once P1 produces `/asciimath`, `/mathml`, `/latex` and `/unicodemath`, the isolation
gate reports chunk and source-module counts, not bytes, so a size budget
would need a new measurement rather than a threshold on what it already prints.

## Symbol data as shared data

The corpus half of this question is **settled**: the shared repository exists,
it is named `plurimath-testsuite`, and this package consumes it as a submodule
([cross-cutting](cross-cutting.md)).

What is still open is the bigger half. Making symbol data authoritative means
the Ruby gem generating its symbol classes from it, so it needs the
maintainer's agreement and gem work, not just a repository. Two sub-questions
travel with it: whether symbol data shares `plurimath-testsuite` or gets its
own repository, and who governs symbol ids once two implementations depend on
them.

Nothing blocks the port meanwhile: symbol data is generated straight into this
repository as TypeScript.

## MathML/OMML input strategy

The gem delegates to the `mml` and `omml` gems, and the organisation ships an
Opal-compiled `@plurimath/mml`. Same shape as the UnitsML question, and the
same caution: evaluate on evidence — does it publish working artifacts, and
does it yield a native model or an Opal one?

Both halves are now answered, measured 2026-09-09 against the gem at
`00c52783` (`mml` 2.4.1, the version its `Gemfile.lock` resolves).

- **Working artifacts: no.** `@plurimath/mml@0.1.0` — its only version,
  published 2026-07-08 — ships exactly three files: `LICENSE`, `package.json`
  and `README.md`. Its `files` field lists `dist`, and every entry point
  (`main`, `module`, `browser`, `types`, `exports`) points inside a `dist/`
  the tarball does not contain, so importing it fails. This is the
  `@unitsml/unitsml@0.6.7` defect exactly, in the same organisation
  ([cross-cutting](cross-cutting.md)), and worth reporting for the same reason.
- **Native model: no.** The package describes itself as "Opal-compiled with
  optional shared runtime from `@lutaml/opal-runtime`" — the runtime this port
  exists to replace.

**OMML has no package at all.** `@plurimath/omml` returns HTTP 404 from the npm
registry — the organisation publishes `@plurimath/mml`, `@plurimath/plurimath`
and `@lutaml/opal-runtime`, and nothing for OMML. So for OMML the bridging
option does not exist to be evaluated; a native port is the only path. The gem
side is smaller than MathML's: the `omml` gem its `Gemfile.lock` resolves is
0.2.5, 6,516 lines over 275 files, and PLURIMATH's own `lib/plurimath/omml/`
translating layer is 722 lines (`translator.rb` 274,
`formula_transformation.rb` 319, `utility.rb` 109, `parser.rb` 20) against
MathML's 1,353. (0.2.1 is also installed on this machine, at 6,797 lines over
270 files; a measurement that globs the gems directory and takes the first
match reports those instead, which is how an earlier draft of this line got
them.)

Bridging to the published package is therefore closed on evidence for MathML
and unavailable for OMML, leaving a native port or continued deferral for both.

**SETTLED 2026-09-16: continued deferral, not a native port, for now.** The
maintainer's reasoning: a native port is a real undertaking (an XML reader
layer this port does not have, plus the translator) with no clear timeline,
while the bridging option is closed on the evidence above, not on preference.
Rather than leave the compat constructor's refusal generic, PR #120 (open, not
yet merged) has `new Plurimath(text, "mathml")` and `new Plurimath(text,
"omml")` throw an informative error naming the actual blocker (no XML reader)
without hard-coding the specific broken-package names into the user-facing
message, since those are implementation detail that will go stale the moment
either dependency ships a working build (`src/compat/index.ts`, PR #120). As
of this writing `main`'s constructor still throws the generic
`UnsupportedFormatError`; PR #120 supplies the informative one. Revisit once a
working way to
read MathML/OMML XML exists — either upstream ships a working build, or this
port builds a native reader.

### What already exists here, and what does not

Both formats are already OUTPUT ports and neither is an INPUT port.
`src/formats/mathml/` and `src/formats/omml/` each contain only `renderer.ts`,
`render-shared.ts` and `render.ts` — no parser, no transform, no grammar. The
render side is oracle-locked too: `test/formats/omml/` and
`test/formats/html/` carry generated parity and degenerate fixtures with
provenance manifests.

The corpus is the reverse of what input work needs. Every one of its 111 cases
carries `expected.asciimath`, `expected.latex`, `expected.mathml` and
`expected.unicodemath` — and **no case carries `expected.omml` at all**. So
MathML input has 111 free oracle cases waiting (all of which re-parse), and
OMML input has none: every case would have to be generated by running the gem's
OMML parser, the way the render fixtures are generated today.

### What a native port would involve

MathML input has a different shape from every format ported so far. There is no
Parslet grammar and no `mathml/transform.rb`; `mathml/parser.rb` is 29 lines
that call `Mml.parse` (XML text to an `Mml::V4::*` model) and then
`Mathml::Translator#mml_to_plurimath`, a recursive walk over 44
`when Mml::V4::…` branches. **pegkit has no part in it.**

- The `mml` gem is 11,605 lines over 320 files, but the translator consumes a
  thin slice: `each_mixed_content`, `value`, and a couple of dozen attribute
  readers out of the ~120 those 44 classes define. The exact pair of numbers
  depends on what counts as an "attribute reader" —
  `instance_methods(false) - Object.instance_methods`, minus writers, gives 126
  defined and 29 named in the translating layer; the stricter
  `mappings_for(:xml).attributes`, which excludes content and child-element
  mappings, gives 120 and 28. Either way it is a small, fixed surface.
  The model adds no semantics over the XML, measured exhaustively rather than
  sampled: instantiating every `Mml::V4` class bare and reading all of their
  attribute readers returns a non-nil, non-empty value **zero** times. The
  class count depends on the filter and the zero does not: `Mml::V4.constants`
  yields 198 Class-valued constants, of which `MathWithNamespace` is a literal
  alias of `Math` and `Namespace` is not an element model at all, so the
  element count is 196; the zero holds at 198, 197 and 196, and under both the
  loose and strict definitions of "attribute reader" above. So no schema
  default leaks through anywhere in the ELEMENT model — an absent attribute is
  `nil`, including ones with obvious MathML defaults like `mfrac`'s
  `linethickness`, `mo`'s `form`/`stretchy`, and `mtable`'s `columnalign`.

  "Element model" is doing work in that sentence. `Mml::V4::Namespace` — the
  constant that is dropped to reach 196 — DOES carry a default:
  `Namespace.new.uri` is `"http://www.w3.org/1998/Math/MathML"`. Neither
  methodology above can see it, because `Namespace.instance_methods(false)` is
  empty (the reader is inherited from `Lutaml::Xml::Namespace`) and it does not
  respond to `mappings_for`. It is not an element and no `when Mml::V4::…`
  branch dispatches on it, so it does not weaken the claim — but a port that
  enumerates readers the way this measurement does will not find it either, and
  the namespace URI is something a reader has to supply from somewhere. Values are not coerced either: `display="block"` and
  `displaystyle="true"` arrive as `String`, and `value` is an `Array` of
  `String`. A reader plus an element-name map reproduces what the translator
  consumes, so lutaml-model's machinery would not need porting.

  One trap for a port working from the gem's own documentation: `mml`'s
  `README.adoc` lists `fence` and `separator` together as legacy `<mo>`
  attributes, but only `fence` is a live V4 reader — `separator` is not defined
  at all, so calling it raises `NoMethodError` rather than returning `nil`. Port
  what the classes expose, not what the README lists.
- The translating logic itself is `translator.rb` (607 lines),
  `formula_transformation.rb` (457) and `constants.rb` (289) — 1,353 lines.
- **A contract gap either way:** `src/xml` is write-only. It exports
  `XmlElement`, `dump`, `dumpNodes`, two serializer errors and three types —
  and no reader of any kind — and `ARCHITECTURE.md` §3
  describes the layer as "XML element tree + Ox-compatible serializer". MathML
  input needs an XML *reader* in layer 1, which the module map does not
  describe, so §3 changes before any of this code lands.

Oracle available today: 111 corpus cases carry an `expected.mathml`, and all
111 re-parse through `Math.parse(text, :mathml)` on the gem. They exercise 19
distinct element classes of the 44 the translator dispatches on, so the corpus
alone would lock under half the surface; the rest needs cases written for it.
The 25 it does not reach are the ones to write for: `Mfenced`, `Mmultiscripts`,
`Mprescripts`, `Menclose`, `Mspace`, `Mpadded`, `Mphantom`, `Ms`, `Merror`,
`Semantics`, `Annotation`, `AnnotationXml`, `Mglyph`, `Mlabeledtr`, `Mlongdiv`,
`Maligngroup`, `Malignmark`, `Mstack`, `Msgroup`, `Msrow`, `Msline`,
`Mscarries`, `Mscarry`, `Mfraction` and `None`.

One caveat for anyone re-running that count: `expected.mathml` is USUALLY a
string but is a `{output: ...}` map in `asciimath/partial-render.yaml`. A probe
that assumes the string shape hands a `Hash` to `Math.parse` and records a
`ParseError` that belongs to the probe, not to the gem — which is what an
earlier draft of this section reported as "110 of 111".

Behaviour a port would have to reproduce, measured identically under both the
Ox and Oga adapters — so there is a single answer, not an adapter-dependent one:

- Named character entities are **not** decoded. `<mi>&alpha;</mi>` survives as
  the literal text `&alpha;` and renders back as `<mi>&#x26;alpha;</mi>`, where
  the same symbol reached through AsciiMath `alpha` gives `<mi>&#x3b1;</mi>`.
  Numeric references (`&#x3B1;`) and the predefined XML entities (`&amp;`) are
  decoded normally. A reader written for this port must therefore leave named
  entities alone.
- Unknown elements are dropped silently:
  `<math><bogus>x</bogus><mi>y</mi></math>` parses to `y`.
- Content MathML (`<apply>`, `<ci>`, `<cn>`) raises `ParseError`: the
  translator's `else` branch (`translator.rb:64-65`) has no content-element
  case, although `mml` models those elements.

## Command-line interface

`ARCHITECTURE.md` §10 previously listed a CLI neither in scope nor under
YAGNI. `lib/plurimath/cli.rb` is a Thor `convert` command with input/output
format, `--split-on-linebreak`, display style, `--math-rendering`
(`to_display`), and an XML engine choice; the port has nothing yet.

**SETTLED 2026-09-16: in scope**, direction is an idiomatic Node CLI rather
than flag-for-flag parity with the gem's Thor command. Nothing blocks it but
effort — everything it would call already exists once the render options in
[feature-roadmap.md](feature-roadmap.md) land, so it has no reason to go
first. This decision was recorded in a local session note
(`plan-2026-09-16.md`) the same day as the MathML/OMML and coverage-invariant
decisions below, but — unlike those — never made it into this file; this
entry corrects that gap.

## Number-formatter API shape (`formatter:` option)

`feature-roadmap.md`'s number-formatting entry names this as a design
question blocking B2's first slice: does the per-call `formatter:` option
arrive as a class instance (mirroring the gem's `Formatter::Standard <
NumberFormatter`) or a plain options object?

**SETTLED: plain options object.** The gem's `Formatter::Standard` sets its
config once at construction and never mutates it (`number_formatter.rb:6-16`,
re-verified against the pinned oracle `plurimath` @ `00c52783`, v0.11.6 — not
the unpinned v0.11.3 clone an earlier check used by mistake), so nothing
about statelessness forces the class shape here. Weighed against that: the
port has no existing precedent for a subclassable option — every renderer
option today is a plain object gated by `assertKnownOptions`
(`src/core/render-options.ts`), and the one existing pluggable-behavior
option, `onUnsupported`, is a function field on a plain object, not a class a
consumer subclasses. `ARCHITECTURE.md` §5 also states node classes "are not
extension points: subclassing is unsupported" — a stated bias against adding
a new subclassable class here. `plurimath-testsuite`'s `calls/1` schema
already records formatter args as a flat plain object
(`{locale, options: {...}, precision, string_format}`), agnostic to either
choice, so it does not push either way.

**Conceded tradeoff:** a class instance would 1:1-mirror the gem's own
`NumberFormatter` subclassing extension point, giving a cleaner story for a
consumer wanting fully custom formatting logic beyond field values. B2's
first slice only needs to replicate `Formatter::Standard`'s behavior, and
deeper pluggability can be added later as a function field (matching
`onUnsupported`) if a real consumer asks — not strong enough to override the
object shape now.

This decision, like the CLI one above, was recorded in a local session note
(`plan-2026-09-16.md`, which described it differently — "plain functions, a
thin class binds them" — a framing about the *gem's* internals verified for
B1's oracle generation, not the port's own option shape) but never landed
here; this entry settles the port-specific question directly.

## What the UnicodeMath transform's coverage invariant should require

`test/formats/unicodemath/transform-coverage.spec.ts` asserts that every ported
rule fires at least once, and the first slice's rule set was chosen as "the
rules the pinned corpus fires on the oracle" — 86 of them, of which 78 are
ported once the eight-rule table and matrix family is set aside.

`transform.rb:1791` (`{expr: simple, frac: simple}`) was left out of that slice
on the strength of it: no corpus input fires it. But the slice-boundary review
observed that the coverage loop already drives the `slice-boundary` fixture
rows too, and those are measured against the oracle exactly as the corpus rows
are. So the invariant the code actually enforces is the wider "every ported rule
is exercised by a MEASURED fixture", and under that wording `:1791` could be
ported with `x a/b c` moving from the refusal list into the parity list.

The narrow reading has one thing going for it that is worth stating before it is
given up: while the boundary list is hand-picked, "the rules the corpus fires"
is a set nobody chose, so the slice cannot quietly grow to whatever the porter
found interesting. The wider reading trades that for the ability to close a
family the corpus happens not to reach.

**SETTLED 2026-09-16: the wide reading.** Every rule that counts, under either
reading, is verified against the same oracle — the actual correctness bar this
project uses everywhere. That narrows the narrow reading's protection, but does
not remove it: the coverage invariant counts a firing per rule, not per branch
(`test/formats/unicodemath/transform-coverage.spec.ts`'s own header states
this and a measured mutation proves it — flipping `transform.rb:1097`'s
`&#x221b;`/`\cbrt` arm from `Number("3")` to `Number("5")` leaves the suite
green, because no corpus input reaches that arm). So a hand-picked fixture
chosen to hit only a rule's easy branch would earn that rule full coverage
credit while its other branches stay unexercised by anyone — a real gap, not a
hypothetical one, and it applies whether the fixture comes from the corpus or
is hand-picked. What the wide reading actually gives up, weighed against that:
corpus-derived coverage is not immune to this gap either, since the corpus is
just as capable of reaching only a rule's easy branch, so hand-picking a
fixture does not make the gap worse than it already is under the narrow
reading — it only removes the guarantee that the set of covered rules was not
chosen by the porter. Its cost was concrete and immediate: the narrow reading
permanently blocks a correctly-ported, oracle-verified rule from ever counting
as covered, for no correctness reason, whenever the shared corpus happens not
to exercise it. `transform.rb:1791` can move from the refusal list to the
parity list under this reading. Whoever writes the next slice: a hand-picked
fixture still needs the same oracle-measured provenance as everything else in
this repo — the wide reading accepts hand-picked fixtures as counting toward
coverage, it does not relax how they are measured, and it does not close the
per-branch gap above; a future slice that wants per-branch assurance needs a
different invariant, not a different reading of this one.

## Root `parse()` function

`ARCHITECTURE.md` §4 describes a root `parse(input, format, options)` that
forwards to a format's parser. `src/index.ts` does not export one (it exports
`Plurimath`, `FORMATS`, `Format` and `/core`), so today a caller reaches a
parser only through a per-format subpath or the compat class. Whether to build
it, and with what options shape, is undecided; the docs describe it as
documented-but-unbuilt until then.

## Evaluation error family (B6, first slice)

`feature-roadmap.md`'s evaluation entry names eight error classes under the
gem's `Errors::Evaluation::*` (`Error` plus `DivisionByZeroError`,
`MathDomainError`, `NonFiniteResultError`, `UnsupportedExpressionError`,
`MissingVariableError`, `InvalidBindingError`, `InvalidBindingKeyError`). The
question for the port: one `EvaluationError` type carrying a reason code, or
eight classes mirroring the gem one to one.

**SETTLED 2026-09-23** (the user): mirror the gem — eight separate classes,
each a `PlurimathError` with its own `code` joining `PlurimathErrorCode`
(`src/core/errors.ts`), built exactly like every other error family (dual
ESM/CJS, `code` not `instanceof`). `src/evaluation/errors.ts` has the
implementation and the oracle-measured message text for each. The
maintainer's own preference is the opposite — one evaluation error type — and
is deferred rather than dropped: `TODO.plan/deferred.md`'s "Parked ideas" has
the entry, to be changed in both the gem and the port together once the
byte-identical structure is done.

## Evaluation return type (B6, first slice)

The gem's `Formula#evaluate` returns whatever Ruby's arithmetic produces: an
`Integer` (`2+3` is `5`), a `Float` (`6/3` is `2.0`), an arbitrary-precision
`Integer` (`2^100`), or a `Rational` (`2^(-1)` is `(1/2)`). JavaScript has one
`number` type. The question for the port: what `evaluate` returns, and what
happens where Ruby's answer has no exact JS `number`.

**SETTLED 2026-09-23** (the user): follow Plurimath's documented behaviour.
The gem README's "Evaluating formulas" section (`README.adoc:289-363` at the
pinned oracle `00c52783`) documents `evaluate` as computing "numeric results"
(examples `5.0` and `9`) and says "Division uses `Float` arithmetic"; it
documents no arbitrary-precision Integer or Rational result. So `evaluate`
returns a JS `number` for every documented case, and throws
`UnsupportedFeatureError` (a port limitation, not an evaluation error) where
Ruby's FINAL answer cannot be represented exactly: an Integer outside
`Number.isSafeInteger`, or a Rational. Ruby's Integer-versus-Float
distinction (`9` versus `5.0`) is not observable in JavaScript.

Refined the same day (the user): intermediates are computed EXACTLY, as Ruby
computes them, and only the final result is checked. `src/evaluation/
numeric.ts` holds a Ruby Integer as a `bigint`, a Rational as an exact reduced
`bigint` pair and a Float as a `number`, and follows Ruby 4.0.1's arithmetic
for every kind pair — `2^100/2^99` is `2.0`, `2^(-1)*2.0` is `1.0`, and an
evaluation error raised later in the expression (`2^100+x`) still wins. The
conversions to Float reproduce Ruby's own: `Number(bigint)` for an Integer
(round to nearest, ties to even, as `big2dbl` does) and `bignum.c`'s
truncating `big_fdiv` for a Rational. Where Ruby raises `ArgumentError`, and
beyond the port's size limit for exact values, the port refuses on the spot
(`deferred.md`, "exact intermediates beyond the port's size limit").
`test/evaluation/evaluate.spec.ts` checks the kind of every fixture row
against the oracle. A binding holding a safe integer is read as a Ruby
Integer, any other number as a Float.

The same reasoning covers Float powers: Ruby's `**` calls the C library's
`pow`, which JavaScript's `**` does not reproduce, and glibc's `pow` itself is
not correctly rounded within 0.04 ULP of a midpoint (its documented 0.54 ULP
worst case). `src/evaluation/pow.ts` returns the correctly rounded result,
which is glibc's everywhere outside that band, and refuses inside it with
`UnsupportedFeatureError` — the documented bound kept on purpose (the user,
2026-09-23); `deferred.md` records it as a known divergence.
