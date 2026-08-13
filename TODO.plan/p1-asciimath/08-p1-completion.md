# TODO 8 — Complete P1: rejection cases, probes, and the remaining gates

## Why
`P1-baseline` (TODO 7) leaves four registered gates inactive: `negative-parity`,
`symbol-context-matrix` and `adversarial-inputs` (class A), and
`differential-runner` (class B). ARCHITECTURE.md §9 makes them P1's
**completion** exit, not a later phase's problem.

Without this item, P1 can be declared finished while the port has never been
shown to reject anything the gem rejects — and every parser added in P3 would
inherit that gap, since each of them needs the same negative cases.

## Scope

### Failure-path parity

This was parked in `deferred.md` until P5. It moves here because
`negative-parity` is a mandatory `P1-completion` gate, and because a grammar
that ships without it accepts input the gem refuses — a divergence nobody
measures until a document breaks.

**Status: the in-repo half landed with the grammar** (PR #4,
`test/formats/asciimath/failure-parity.spec.ts`): 156 candidates probed
against the gem, the 26 it rejects pinned with mapped positions, and the two
sweeps showing zero accept/reject disagreement. What remains here is the
**shared** half — the schema shape for a rejection case in the testsuite, the
cases themselves, and wiring the `negative-parity` gate to read them — plus
everything below that the local spec does not cover.

Ownership follows the usual split: the **testsuite** defines the failure cases
and the schema that holds them; **this repository** writes the reader and the
assertions. The shared case schema has no shape for a rejection today —
`expected`, `parse_tree` and `model` are all required and `additionalProperties`
is false — so the shape is agreed there before cases can land.

The rejection suite must carry, at minimum:

- **A nonzero case count, asserted as a count.** A rejection suite that runs
  zero cases passes silently; this repository has already shipped one gate that
  did exactly that.
- **The expected error category per case.** Note what the gem actually exposes:
  `Plurimath::Math.parse` rescues everything and re-raises
  `Math::ParseError.new(text, type)` with `cause: nil`, and that error carries
  only the text and the format. So the category at the public boundary is
  coarse — a parse failure, or one of the option errors (`InvalidTypeError`,
  `ParseOptionError`, `UnsupportedLocale`). Anything finer has to be captured
  inside the generator, before the gem throws the detail away.
- **The position, where one exists.** The gem's `ParseError` has none.
  Underneath it, `Parslet::ParseFailed#parse_failure_cause.pos` is a character
  offset — but into the **preprocessed** text, because
  `Asciimath::Parser#initialize` rewrites `{:` → `ℒ` and friends before
  `Parse.new.parse` runs. Cases therefore record the preprocessed form, which
  the schema already carries, and each implementation maps back through its own
  offset map. `ParseError.index` is public contract here (§5); this is the only
  way it is ever checked against the gem.
- **A resolved answer for each of these input classes:** malformed fences,
  incomplete power or fraction, trailing input, and malformed entities.
  "Resolved" means measured against the gem, because AsciiMath's grammar is far
  more lenient than it looks. Measured 2026-08-03 against the oracle with
  `Plurimath::Math.parse(input, :asciimath)`:

  | Class | Gem | Where the case goes |
  |---|---|---|
  | incomplete fraction — `a/`, `/b` | **raises** `Math::ParseError` | rejection corpus |
  | incomplete power — `x^` | accepts, renders `x ^` | positive corpus |
  | malformed fences — `(a`, `a)`, `{: x` | accepts, renders `(a)`, `a )`, `{:x)` | positive corpus |
  | trailing input — `a b )` | accepts | positive corpus |
  | malformed entities | not applicable | AsciiMath does no entity handling |

  So the rule is **probe, do not assume**: the generator sweeps a committed
  list of candidate malformed inputs, records which the gem rejects, and every
  candidate it accepts becomes a positive case that pins the leniency. A class
  with no rejection case is fine; a class nobody checked is not. Malformed
  entities bind the LaTeX and HTML parsers in P3, which do decode entities.

### The rest of completion

- **Widen the positive corpus**: fonts, colour, left/right, `mod` (§9). The
  cases are testsuite work; here it is a pin move plus whatever the new cases
  break.
- **Complete the model schema** the union is declared from: every implemented
  class covered, with concrete/abstract status, aliases, field shapes, equality
  fields and measured constructor defaults, and the union and equality
  projection checked against it class by class.
- **Symbol context exception matrix** from the behavioural probes (TODO 2),
  driving the `symbol-context-matrix` gate.
- **Adversarial inputs**: deep nesting, unmatched fences, long token runs. The
  bar is a **clean outcome** in bounded time — a parse or a typed error, never
  a crash, a hang or a stack overflow. `ARCHITECTURE.md` §7 says "clean
  failures", but unmatched fences parse rather than fail (measured above), so
  asserting a failure there would pin the wrong behaviour.
- **Differential runner** (class B): the seeded, deterministic, bounded input
  generator compared live against the gem.
- **Package-isolation assertions** for the real `/asciimath`, `/mathml` and
  `/latex` subpaths.
- Set `currentMilestone` to `P1-completion` in the same change as the runners
  for every gate that activates with it (§7).

## Done when

- [ ] The rejection corpus is non-empty, its case count is asserted, and the
  suite **fails** when pointed at an empty set — demonstrated, not assumed.
- [ ] Every rejection case asserts an error category, and asserts the mapped
  original-input index wherever the generator captured a position.
- [ ] Every candidate in the committed malformed-input list has a case — in the
  rejection corpus if the gem rejects it, in the positive corpus if the gem
  accepts it — and `a/` and `/b` are among the rejections.
- [ ] Malformed entities is recorded as not-applicable to AsciiMath, with the
  reason, rather than being absent.
- [ ] `pnpm check` reports twelve active class-A gates, all passing.
- [ ] `scripts/gate-oracle.rb differential` runs a bounded seeded batch against a clean
  gem checkout, and reports either zero divergences or a named list.
- [ ] `currentMilestone` is `P1-completion`, and no gate is active without a
  runner.
- [ ] The phase-exit checklist is satisfied: gates green, plus the class-C
  evidence — a review round with findings resolved, and sign-off recorded.
