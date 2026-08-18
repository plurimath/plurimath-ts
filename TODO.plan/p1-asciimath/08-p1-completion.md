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

  **Scoped 2026-08-18; the gate is green but only half of what it claims.**
  `test/generated/symbol-context.spec.ts` (11 tests, already in `selects`)
  checks the *generated matrix's* internal consistency — every named symbol is
  one a slice can look up, every axis is one the manifest declares, every entry
  records a real difference. Its own header says the renderers "add their
  behavioural half here when they land". All three have landed; the half is
  still owed.

  What the behavioural half can and cannot cover, measured rather than assumed:

  - **`intent` — unreachable by design.** Five of the six MathML exceptions
    (`Dd`, `Ii`, `Intercal`, `Jj`, `UpcaseDd`) vary only on this axis, and
    `toMathml` *refuses the option by name*: "the intent attribute pipeline
    (intentify, intent post-processing) is unmeasured"
    (`src/formats/mathml/renderer.ts`, `DEFERRED_OPTIONS`). So the gate cannot
    become fully behavioural until that deferral lifts. The spec should assert
    the refusal is real and name these exceptions as deferred, rather than
    quietly covering only the rest.
  - **`table` — reachable, and the port already threads it.**
    `src/render/symbol/asciimath.ts` consults `ASCIIMATH_SYMBOL_EXCEPTIONS`,
    and `src/render/binary-function/asciimath.ts` merges `table: true` for a
    formula cell. Measured against the oracle at `00c52783`:
    `Symbols::Comma.new.to_asciimath(options: { table: true })` → `'","'`;
    with `{ table: false }` or `{}` → `','`.
  - **The test must build the node, not parse for it.** `","` in AsciiMath
    source parses as quoted *Text*, not a `Comma` symbol, in the gem and the
    port alike — both render `[[a "," b],[c,d]]` identically. A test written
    through the parser would pass while exercising the text path and proving
    nothing about the exception.
- **Adversarial inputs**: deep nesting, unmatched fences, long token runs. The
  bar is a **clean outcome** in bounded time — a parse or a typed error, never
  a crash, a hang or a stack overflow. `ARCHITECTURE.md` §7 says "clean
  failures", but unmatched fences parse rather than fail (measured above), so
  asserting a failure there would pin the wrong behaviour.

  **Landed** — `test/adversarial/adversarial-inputs.spec.ts`, wired to the
  gate's `selects`. Measuring the gem first settled what the bar could be,
  because on these inputs it mostly has no behaviour to match (oracle at
  `00c52783`, 2026-08-17):

  | input | gem | this port |
  |---|---|---|
  | 300-deep `(…)` nesting | `SystemStackError` | `ParseError`, ~10ms |
  | 500 space-separated tokens | parses, **64.5 s** | parses, ~200ms |
  | 1000 space-separated tokens | `SystemStackError` | `ParseError` |

  So the gate is a **port-side** bar, not a parity one: a `SystemStackError` is
  the absence of defined behaviour rather than behaviour to reproduce, and
  §PORTING-STANDARDS' "do not be more correct than the gem" governs results,
  not crashes. Two things fell out of writing it that are worth keeping:

  - **the depth cap is not what refuses these inputs.** The first version of
    this note claimed `MAX_DEPTH = 20_000` fires before V8's stack; measuring
    which guard actually produced each rejection showed the opposite. Every
    adversarial shape probed — nested parens, nested `sqrt`, complete nested
    `frac`, unmatched opens, long token runs — is refused by the `RangeError`
    fallback in `Atom#parse`, because this grammar costs many frames per token
    and the engine stack runs out while `ctx.depth` is still far below the
    bound. `MAX_DEPTH` has not been observed to fire for any AsciiMath input.
    The two guards now carry distinct messages so a test can say which did the
    work; relying on *catching* a `RangeError` is a robustness question in its
    own right and is recorded in `deferred.md`. Parse time is linear in input
    length (5,000 closing parens 1.96 s; 40,000 15.1 s);
  - **whitespace-only input parses and then fails to render**, because the
    formula holds a bare string. The gem behaves the same way: `Math.parse`
    returns a `Formula`, and `Formula#to_asciimath` raises
    `Plurimath::Math::ParseError` whose `cause` is `NoMethodError` on a
    `Parslet::Slice`. So a typed `RenderError` is the porting-correct outcome —
    but the failure is at render time for input that parsed, which the spec
    pins separately rather than burying in the table.
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
