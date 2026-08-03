# P2 — Complete the output side

**Status: planned.** Every renderer the gem has, so a formula parsed from
AsciiMath can be emitted in any supported format. Ends with the first published
release.

Numbered work items are added to this directory when the phase opens.

## What it delivers

**UnicodeMath renderer.** Unicode-heavy output with its own spacing and
mini-sized sub/superscript rules. The gem's `to_unicodemath` methods are the
reference; several node types carry UnicodeMath-specific branches (fraction
variants, n-ary masks, prime handling) that need their own corpus cases.

**OMML renderer.** Office Math markup: a second XML tree format, structurally
quite different from MathML (`m:` namespace, `sSub`/`sSup`/`nary`/`f`
elements, control properties). Exercises the XML layer harder than MathML does.

**HTML renderer.** The smallest of the three; mostly `<i>`, `<sub>`, `<sup>`
and table markup.

**Compat class.** The frozen `plurimath-js` surface — constructor plus seven
methods — becomes buildable once several renderers exist. Its ABI is fixed by a
declaration fixture. One runtime test per method is **not** enough to hold it:

- the constructor takes six formats. On the plan as it stands, only AsciiMath
  input exists at P2, so one constructs and five raise
  `UnsupportedFormatError`. Which is which is part of the staged contract, so
  it is asserted per format rather than assumed;
- `toDisplay(lang)` dispatches on its argument. The gem's `MATH_ZONE_TYPES`
  has five entries — omml, latex, mathml, asciimath, unicodemath — plus an
  invalid-type error path, so it needs six assertions, not one;
- `toMathml(intent?)` carries the compat surface's only optional argument, so
  both settings are tested.

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

- OMML's structure diverges most from the model; expect the XML layer to need
  extension rather than reuse.
- UnicodeMath's context rules (mini-sized scripts, accents, primes) are the
  likeliest source of subtle parity failures.
- The compat class must not drift from the published ABI: it is verified
  against `plurimath-js`'s own source, not from memory.

## Exit criteria

- [ ] Every group in the pinned corpus declares the `unicodemath`, `omml` and
      `html` targets, and every case carries an expectation for each. The
      reader asserts a nonzero case count per target, and that it equals the
      group's own case count — so a single token case cannot satisfy this.
- [ ] Compat ABI fixture passing, plus: the constructor asserted for all six
      formats (constructs, or raises `UnsupportedFormatError`); `toDisplay`
      across its five branches and the invalid-type path; `toMathml` with and
      without `intent`; the other five methods at least once each.
- [ ] Isolation assertions extended to each new subpath.
- [ ] Packaging review done and the first `0.x` published.
- [ ] Review round with findings resolved, and sign-off recorded.
