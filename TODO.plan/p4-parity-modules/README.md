# P4 — The remaining parity modules

**Status: started ahead of plan** (`gates.json#currentMilestone` is `P2`).
What is left of the gem once every format is ported: the
number-formatter modes nothing earlier exercises, expression evaluation, and
MathML/OMML *input*. On `main`: number formatting (#126, #133, #143, #146), and
evaluation's arithmetic and function slices (#152, #155), every function now
ported; some refuse near a rounding band (see `TODO.plan/deferred.md`).
MathML/OMML input is deferred (settled 2026-09-16, #122;
[open decisions](../open-decisions.md)). Four of the six exit criteria below are checked.

Numbered work items are added to this directory when the phase opens.

## What it delivers

**What number formatting is left.** Less than this phase used to claim. The
formatter contract, the per-renderer adapter seam and the no-formatter
passthrough land in P1 with the renderers that route through them; each
parser's `locale` behaviour lands with that parser (AsciiMath in P1; LaTeX,
UnicodeMath and HTML in P3), because the decimal marker is read by the
*grammar* — each of those `parse.rb` files builds it from
`Plurimath.configuration.decimal`. Scheduling all of it here would have put it
after every renderer that depends on it and after every parser whose `locale`
option depends on it.

What genuinely remains is the `NumberFormatter` behaviour no earlier phase
exercises: full locale tables (grouping separators and their digit groups),
significant digits and precision, scientific and engineering notation, base
notation, and the configurable formatter object itself. It is invisible until
then by construction — `Plurimath.configuration.number_formatter` is nil by
default, and the pinned corpus's parse cases are generated with
`configuration: {}`, so every number in them renders as its raw value; only
its `calls/1` cases (66 `number_formatter` calls at `4a8ba64`) pass a
formatter.

Locale data is held to the subpaths that read it, and the isolation gate
proves it: the decimal-marker table ships with the four subpaths that parse
(each grammar reads the marker), and the grouping table, which nothing imports
yet, ships with none of them.

**Evaluation.** `src/evaluation/` — numeric evaluation of a formula against
variable bindings, including bounded iteration for sums and products with a
configurable cap. Self-contained by design: it imports `core` and nothing else,
and nothing imports it except the root entry, so it cannot leak into a renderer
bundle.

**MathML and OMML input.** The gem does not implement these itself — it
delegates to the `mml` and `omml` gems, both built on `lutaml-model`. So this
is a **strategy decision before it is an implementation**
([open decisions](../open-decisions.md)): port natively, wrap an existing
JavaScript release, or defer further.

## Why here

Evaluation needs the whole node model. MathML/OMML input needs the model *and*
a settled dependency strategy. Formatting is here only for what is left over:
because it touches every renderer and four of the parsers, the parts they use
land with them, and only the unused modes wait for a phase of their own.

## Risks and notes

- **Dependency evidence, not assumption.** The UnitsML experience is the
  caution: the organisation's JavaScript release of that gem publishes no
  `dist/` at all, so an apparently ready dependency was unusable. Evaluate
  `@plurimath/mml` on its own evidence — does it ship working artifacts, and
  would it yield this project's native model or an Opal one?
- **Locale data volume.** Keeping it out of unrelated bundles is an isolation
  assertion, not a hope.
- **No unit data is produced here.** UnitsML is deferred (§5): there is no
  `unitsml` module, no subpath and no tables, so this phase has nothing of that
  kind to isolate. The criterion that once asked for it was checking something
  that cannot exist.

## Exit criteria

- [x] Formatting: cases for each mode this phase adds — locale grouping,
      significant digits, precision, scientific, engineering, base notation —
      with a nonzero count asserted per mode, so a mode with no case fails
      rather than passing quietly.
      (done: `test/formatting/number-formatter-numeric-pipeline.spec.ts:158` over the pinned `calls/1` cases; checked 2026-09-24)
- [x] Evaluation: cases pairing a formula and bindings with the gem's result,
      count asserted nonzero, including one that hits the iteration cap — with
      the cap lowered for the test, not by running 100,000 iterations.
      (done: `test/evaluation/evaluate.spec.ts`, "has a case that hits a lowered iteration cap, and one within it", requires a row under a numeric cap below `DEFAULT_MAX_ITERATIONS` that raises the gem's "larger than N steps" at that cap, and a row under the same cap that evaluates — today `sum-custom-cap-over` and `sum-custom-cap-within`, cap 5; deleting either row fails it; checked 2026-10-05)
- [ ] MathML/OMML input, if it is built here: parse-direction cases for both,
      each with a nonzero count.
      (open: deferred, #122. The pinned corpus, `plurimath-testsuite` at `4a8ba64`, now holds the cases this would run — 299 under `corpus/mathml/` and 199 under `corpus/omml/` ([feature roadmap](../feature-roadmap.md)) — but `test/core/corpus-pin.spec.ts` lists them as pending a reader; checked 2026-10-05)
- [x] Isolation assertions proving locale data stays out of unrelated subpaths.
      (done: `scripts/gate-package.mjs`, run by `pnpm check`, forbids the grouping table `locale-groups.ts` in every subpath (nothing imports it yet) and the decimal table `locale-decimals.ts` in `/core`, `/mathml` and `/omml`, which have no parser; it requires the decimal table in the four parser subpaths, and ties each pattern to exactly one file in `src/formatting/generated/`, so a drifted pattern fails rather than passing vacuously; checked 2026-10-05)
- [x] MathML/OMML input strategy decided and recorded before implementation.
  (done: `open-decisions.md`, SETTLED 2026-09-16, #122; checked 2026-09-24)
- [ ] Review round with findings resolved, and sign-off recorded.
