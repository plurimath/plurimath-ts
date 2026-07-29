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
declaration fixture and one runtime test per method. Input formats it cannot
serve yet raise `UnsupportedFormatError`; it is only *complete* at 1.0.

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

- [ ] Corpus coverage for the UnicodeMath, OMML and HTML renderers.
- [ ] Compat ABI fixture and runtime tests passing.
- [ ] Isolation assertions extended to each new subpath.
- [ ] Packaging review done and the first `0.x` published.
- [ ] Review round with findings resolved, and sign-off recorded.
