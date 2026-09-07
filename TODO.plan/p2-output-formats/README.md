# P2 — Complete the output side

**Status: active alongside P1 closeout.** Every renderer the gem has, so a formula parsed from
AsciiMath can be emitted in any supported format. Ends with the first published
release.

## Work items

| # | Item | Delivers |
|---|---|---|
| 1 | [HTML renderer](01-html-renderer.md) | measured vertical slice, then full HTML parity |
| 2 | [OMML renderer](02-omml-renderer.md) | the second XML tree format, scoped against the pinned oracle |
| 3 | [Compat class](03-compat-class.md) | the frozen `plurimath-js` surface, targeted at the plurimath-js source head |
| 4 | [Symbol data](04-symbol-data.md) | the generated HTML and OMML symbol slices both renderers refuse without |

## What it delivers

The UnicodeMath renderer was originally scoped here. It landed early, during
P1 but outside P1's numbered items, so this phase no longer carries it.

**OMML renderer.** Office Math markup: a second XML tree format, structurally
quite different from MathML (`m:` namespace, `sSub`/`sSup`/`nary`/`f`
elements, control properties). Exercises the XML layer harder than MathML does.

**HTML renderer.** The smaller of the two; mostly `<i>`, `<sub>`, `<sup>`
and table markup.

**Compat class.** The frozen `plurimath-js` surface — constructor plus seven
methods — becomes buildable once several renderers exist. Its declaration
target is settled: source head `ce297e2`, not the published
`@plurimath/plurimath@0.2.2` declarations, which carry six methods, a
`toMathml` that takes no argument, and `mahtml` where source head says
`unicode`. This package has published nothing, so it has no compatibility debt
and no reason to inherit that typo (`03-compat-class.md`; `open-decisions.md`).
A declaration fixture freezes that surface. One runtime test per method is
**not** enough to hold it:

- the constructor takes six formats — `asciimath`, `latex`, `mathml`, `html`,
  `unicode`, `omml`. On the plan as it stands, only AsciiMath input exists at
  P2, so one constructs and five raise `UnsupportedFormatError`. Which is which
  is part of the staged contract, so it is asserted per format rather than
  assumed;
- `toDisplay(lang)` dispatches on its argument. The gem's `MATH_ZONE_TYPES`
  has five entries — omml, latex, mathml, asciimath, unicodemath — plus an
  invalid-type error path, so it needs six assertions, not one. Direct native
  Ruby string calls validate and then fall through to `"|_ Math zone\n"`; the
  fixture strategy records that quirk separately from Opal-wrapper expectations;
- `toMathml(intent?)` carries the compat surface's only optional argument, so
  omitted, explicit false, and true are all tested.

It is only *complete* at 1.0.

**First release.** An explicitly experimental `0.x` under a distinct name,
carrying no stability promise, published to gather real feedback.

## Why here

Renderers share one model, so each new one is mostly a visitor over structures
that already exist — they compound. Parsers do not: each is an independent
grammar port with its own corpus.

Completing the output side first also means the first release can convert *from*
AsciiMath *to* everything, which is the most useful early capability.

## Risks and notes

- OMML's structure diverges most from the model; across the measured reachable
  corpus surface, the existing XML layer represents every emitted shape unchanged,
  while unmeasured hand-built or malformed states still require an oracle-backed
  probe before any extension.
- UnicodeMath's context rules (mini-sized scripts, accents, primes) were the
  risk this phase expected to carry; it landed in P1 instead, and those rules
  are pinned by the UnicodeMath parity suite.
- The compat class must not drift from the settled declaration target, source
  head `ce297e2`. Published artifacts and source head are separate evidence and
  must not be substituted for each other (`03-compat-class.md`).

## Exit criteria

- [ ] Every group in the pinned corpus declares the `omml` and `html` targets
      (`unicodemath` landed with P1), and every case carries an expectation for
      each. The
      reader asserts a nonzero case count per target, and that it equals the
      group's own case count — so a single token case cannot satisfy this.
- [ ] Compat declaration fixture passing, plus: the constructor asserted for
      all six source-head formats (constructs, or raises
      `UnsupportedFormatError`); `toDisplay` across its five recognized values,
      the invalid-type path, and a separate record of the native-Ruby string
      quirk; `toMathml` omitted, explicit false, and true; every other method at
      least once.
- [ ] Isolation assertions extended to each new subpath.
- [ ] Packaging review done and the first `0.x` published.
- [ ] Review round with findings resolved, and sign-off recorded.
