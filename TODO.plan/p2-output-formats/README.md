# P2 — Complete the output side

**Status: active alongside P1 closeout.** Every renderer the gem has, so a formula parsed from
AsciiMath can be emitted in any supported format. Ends with the first published
release.

## Work items

| # | Item | Delivers |
|---|---|---|
| 1 | [HTML renderer](01-html-renderer.md) | measured vertical slice, then full HTML parity |

## What it delivers

The UnicodeMath renderer was originally scoped here. It landed early, during
P1 but outside P1's numbered items, so this phase no longer carries it.

**OMML renderer.** Office Math markup: a second XML tree format, structurally
quite different from MathML (`m:` namespace, `sSub`/`sSup`/`nary`/`f`
elements, control properties). Exercises the XML layer harder than MathML does.

**HTML renderer.** The smaller of the two; mostly `<i>`, `<sub>`, `<sup>`
and table markup.

**Compat class.** Its declaration target is open: published
`@plurimath/plurimath@0.2.2` has six methods, while source head `ce297e2` has
seven. Their `toMathml` signatures and one constructor-format spelling also
differ (`03-compat-class.md`; `open-decisions.md`). After the maintainer chooses,
a declaration fixture freezes that surface. One runtime test per method is
**not** enough to hold it:

- both candidate constructors take six formats, but published `0.2.2` says
  `mahtml` where source head says `unicode`. On the plan as it stands, only
  AsciiMath input exists at P2, so one constructs and five raise
  `UnsupportedFormatError`. Which is which is part of the staged contract, so
  it is asserted per format rather than assumed;
- `toDisplay(lang)` dispatches on its argument. The gem's `MATH_ZONE_TYPES`
  has five entries — omml, latex, mathml, asciimath, unicodemath — plus an
  invalid-type error path, so it needs six assertions, not one. Direct native
  Ruby string calls validate and then fall through to `"|_ Math zone\n"`; the
  fixture strategy records that quirk separately from Opal-wrapper expectations;
- `toMathml` is tested with no argument if published `0.2.2` is selected; if
  source head is selected, omitted, false, and true are tested.

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
- The compat class must not drift from the maintainer-selected declaration
  target. Published artifacts and source head are separate evidence and must not
  be substituted for each other (`03-compat-class.md`).

## Exit criteria

- [ ] Every group in the pinned corpus declares the `omml` and `html` targets
      (`unicodemath` landed with P1), and every case carries an expectation for
      each. The
      reader asserts a nonzero case count per target, and that it equals the
      group's own case count — so a single token case cannot satisfy this.
- [ ] Selected compat declaration fixture passing, plus: the constructor
      asserted for all six selected formats (constructs, or raises
      `UnsupportedFormatError`); `toDisplay` across its five recognized values,
      the invalid-type path, and a separate record of the native-Ruby string
      quirk; the selected `toMathml` call matrix; every other selected method at
      least once.
- [ ] Isolation assertions extended to each new subpath.
- [ ] Packaging review done and the first `0.x` published.
- [ ] Review round with findings resolved, and sign-off recorded.
