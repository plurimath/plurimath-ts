# P2 — Complete the output side

**Status: active.** Every renderer the gem has, so a formula parsed from
AsciiMath can be emitted in any supported format. Ends with the first published
release.

## Work items

| # | Item | Delivers |
|---|---|---|
| 1 | [HTML renderer](01-html-renderer.md) | measured vertical slice, then full HTML parity |
| 2 | [OMML renderer](02-omml-renderer.md) | the second XML tree format, scoped against the pinned oracle |
| 3 | [Compat class](03-compat-class.md) | the frozen `plurimath-js` surface, targeted at the plurimath-js source head |
| 4 | [Symbol data](04-symbol-data.md) | the generated HTML and OMML symbol slices both renderers refuse without |
| 5 | [Function carriers](05-function-carriers.md) | the OMML `UnaryFunction`/`BinaryFunction` aliases and the `m:eqArr` table branch |

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
  `unicode`, `omml`. Measured against `dist/` (2026-09-21), four construct
  (`asciimath`, `latex`, `html`, `unicode`) and two raise
  `UnsupportedFormatError` (`mathml`, `omml`). Which is which
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
      (open: at pin `cf3c5eb` every group declares both targets, and
      `test/gates/corpus-discovery.spec.ts` asserts the per-target counts for the 40
      case groups and 7 `calls/1` groups this port's reader parses; the 26 MathML- and
      OMML-input case groups wait on their readers; checked 2026-10-06)
- [ ] Compat declaration fixture passing, plus: the constructor asserted for
      all six source-head formats (constructs, or raises
      `UnsupportedFormatError`); `toDisplay` across its five recognized values,
      the invalid-type path, and a separate record of the native-Ruby string
      quirk; `toMathml` omitted, explicit false, and true; every other method at
      least once.
      (open: everything else is asserted, and `toMathml`/`toOmml` compare the gem's
      bytes since the 2026-10-12 review round; the `toDisplay` invalid-type path for
      `html` and `unicode` is a pinned divergence awaiting a maintainer decision, see
      `03-compat-class.md`; checked 2026-10-12)
- [x] Isolation assertions extended to each new subpath. (`./html`, `./omml`
      and `./unicodemath` each have export and forbidden-graph rows in
      `scripts/gate-package.mjs`; `pnpm gate:package` exits 0. Checked 2026-09-21.)
- [ ] Packaging review done and the first `0.x` published.
- [ ] Review round with findings resolved, and sign-off recorded.
      (review round done; sign-off pending (user/maintainer). Record below.)

## Review round 2026-10-12

One adversarial review (a Claude review agent; Codex unavailable until
2026-10-18) of `main` 26e3a196 against this README's exit criteria,
`ARCHITECTURE.md` and `PORTING-STANDARDS.md`, with the oracle at `00c52783`.
Clean: 36 AsciiMath and LaTeX inputs through `toOmml`, `toHtml` and compat
`toDisplay("latex")` match the gem byte for byte (the 36th, `\left( x \right)`
to HTML, is refused by both); the CLI's 24 `display_style` × `split_on_linebreak`
combinations match `cli.rb`; `pnpm boundaries` reports no violations.

| # | Finding | Evidence | Disposition |
|---|---|---|---|
| 1 | `src/compat/index.ts:65` said the HTML battery parses 50/50 | fixture: 49 parsed, 1 raised | fixed: 49/49 plus one shared refusal |
| 2 | `test/compat/html-battery.spec.ts:4,14` said `html` is withheld from `PARSERS` and that no UnicodeMath battery exists | `src/compat/index.ts:87` registers `html`; `unicodemath-battery.spec.ts` exists | fixed: header rewritten |
| 3 | `src/formats/omml/render-shared.ts` exported three functions nothing imports | grep: 0 importers each | fixed: `requireEmptyOptions` (no caller at all) deleted; `symbolValueOrGenerated` and `renderLimit` have callers in the same file (:332, :492), so they lose only `export` |
| 4 | `OMML_SYMBOL_EXCEPTIONS` and `HTML_SYMBOL_EXCEPTIONS` are read by nothing, with no emptiness guard, so a regenerated exception would be silently ignored | grep: 0 readers; LaTeX has a guard | fixed: guard rows in `test/generated/symbol-context.spec.ts` |
| 5 | compat `toMathml`/`toOmml` tests checked substrings only | `test/compat/plurimath-class.spec.ts:200-210` before this change | fixed: compared against the gem's `to_mathml`/`to_omml` bytes for `frac(1)(2)` |
| 6 | `03-compat-class.md` cited `:933`, `:937` for `toMathml(false/true)` | those lines are `toDisplay` tests | fixed |
| 7 | `03-compat-class.md` cited stale `gate-package.mjs` lines for default export, publint, attw | grep -n | fixed |
| 8 | `02-omml-renderer.md` cited `gate-package.mjs:150`, `:204` for `./omml` | rows are at :154, :227 | fixed |
| 9 | `src/cli/convert.ts:10` said OMML input does not parse | `parseOmml` exists since #184; it is only unregistered | fixed: reworded |
| 10 | compat exit box gave no pointer to its open part | README | fixed: open note added |

No follow-ups beyond the items already open above.
