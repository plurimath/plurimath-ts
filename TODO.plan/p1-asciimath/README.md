# P1 — AsciiMath vertical

**Status: active.** The first end-to-end slice: AsciiMath in, model, and three
renderers out, all proven against cases generated from the Ruby gem.

## What it delivers

A working library for the most common conversion path, and — more importantly —
proof that the whole approach holds: the shared corpus consumed from its own
repository, generated symbol data, a census-driven model, a grammar and
transform ported rule-for-rule, and renderers as modules rather than methods.

## Work items

Work in order; each depends on the ones before it.

| # | Item | Produces |
|---|------|----------|
| 1 | [Corpus intake and census](01-corpus-generator.md) | testsuite submodule pin, TypeScript reader, census, exclusions |
| 2 | [Symbol data](02-symbol-data.md) | per-format symbol slices, context-axis probes |
| 3 | [Core model](03-core-model.md) | node classes, equality projection, normalization |
| 4 | [AsciiMath grammar](04-asciimath-grammar.md) | preprocessing + parse tree matching Parslet |
| 5 | [AsciiMath transform](05-asciimath-transform.md) | parse tree → model |
| 6 | [Renderers](06-renderers.md) | `toAsciimath`, `toLatex`, `toMathml` |
| 7 | [Activate gates](07-activate-gates.md) | milestone `P1-baseline`, nine class-A gates green |
| 8 | [Complete P1](08-p1-completion.md) | milestone `P1-completion`, the last three class-A gates and both class-B runners |

Items 1–2 need a local checkout of the
[Ruby gem](https://github.com/plurimath/plurimath), because they regenerate
data from it. Items 3–8 need this repository plus an **initialized
`plurimath-testsuite` submodule**: the conformance cases are not committed
here, so a missing submodule means no cases to check against — which is why
item 7's discovery gate fails rather than passes when it finds none.

## Why here

One vertical slice rather than a layer at a time. Building the model, a parser
and renderers together proves the approach end to end; building every model
first would prove nothing until the last day.

AsciiMath goes first because it is the smallest complete grammar in the gem
(219 lines) and the format its own test suite covers most heavily.

## Risks and notes

- **The transform is the bulk.** `transform.rb` is 149 pattern rules (plus 3
  from the number-prefix mixin) and the largest single piece of AsciiMath
  logic; expect item 5 to dominate. The corpus fires only 45 of the 152, so
  item 5 carries its own differential sweep.
- **Rule order is behaviour.** Parslet uses ordered choice and reverse-order
  transform matching, so moving an alternative changes what parses. Only the
  first is pinned: the pegkit conformance suite has one ordered-choice test and
  no transform test at all — the reverse-order and exact-key-set rules are
  stated in a comment at the top of `src/pegkit/transform.ts` and nothing
  fails if they break. Item 5 lands those tests with the transform.
- **A suite that passes proves less than it looks.** The pegkit conformance
  suite existed, and review still found two failure-position bugs in the
  component it covered (`tokenChoice` not recording its failure position,
  `SourceMap` clamping a past-end offset into the middle of a token). It tests
  what parses, not where errors point. So every grammar rule added here needs a
  failure-position test beside its success-tree test.
- **Deliberately not here:** UnitsML (deferred — its grammar rule stays
  commented out and such input is processed as text); the other renderers (P2)
  and input formats (P3); evaluation, MathML/OMML input, and the number-format
  modes nothing here exercises (P4). AsciiMath's own `locale` option *is* here:
  the gem builds its decimal marker from the configured locale inside the
  grammar, so it cannot wait for P4.

## Exit criteria

P1 has **two** milestones, and the phase is not done at the first one
(`ARCHITECTURE.md` §9). `P1-baseline` leaves `negative-parity`,
`symbol-context-matrix`, `adversarial-inputs` and `differential-runner`
registered but inactive; declaring P1 finished there would ship a grammar that
has never been shown to reject anything.

**P1-baseline** (item 7):

- [ ] Parse tree, normalized model, and all three renderings match the gem for
      every case in the pinned submodule corpus.
- [ ] Corpus discovery fails loudly on an absent or empty submodule, on zero
      payloads, on zero cases, and on a missing group or target key.
- [ ] Generated symbol data, census and exclusions produced from a clean
      checkout, with provenance recorded.
- [ ] `pnpm check` reports nine active class-A gates, all passing.

**P1-completion** (item 8):

- [ ] Widened positive corpus: fonts, colour, left/right, `mod`.
- [ ] Rejection corpus non-empty and passing, with its case count asserted, and
      every malformed-input class item 8 lists resolved against the gem rather
      than assumed.
- [ ] Generated model schema and behavioural symbol-context probes driving the
      union and the exception matrix.
- [ ] Package-isolation assertions for the real `/asciimath`, `/mathml` and
      `/latex` subpaths.
- [ ] `pnpm check` reports twelve active class-A gates, all passing, and both
      class-B runners are clean.

Both milestones additionally need the class-C evidence: a review round with
findings resolved, and sign-off recorded.

## Scope discipline

`ARCHITECTURE.md` is the contract. If an item here needs something the document
does not describe, change the document first — that is what keeps the plan and
the code from drifting apart.
