# P4 — The remaining parity modules

**Status: planned.** What is left of the gem once every format is ported: the
number-formatter modes nothing earlier exercises, expression evaluation, and
MathML/OMML *input*.

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
default, and the pinned corpus is generated with `configuration: {}`, so every
number in it renders as its raw value.

Locale data sits behind its own subpath, so a consumer who never formats
localized numbers does not download the tables; the isolation gate proves it.

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

- [ ] Formatting: cases for each mode this phase adds — locale grouping,
      significant digits, precision, scientific, engineering, base notation —
      with a nonzero count asserted per mode, so a mode with no case fails
      rather than passing quietly.
- [ ] Evaluation: cases pairing a formula and bindings with the gem's result,
      count asserted nonzero, including one that hits the iteration cap — with
      the cap lowered for the test, not by running 100,000 iterations.
- [ ] MathML/OMML input, if it is built here: parse-direction cases for both,
      each with a nonzero count.
- [ ] Isolation assertions proving locale data stays out of unrelated subpaths.
- [ ] MathML/OMML input strategy decided and recorded before implementation.
- [ ] Review round with findings resolved, and sign-off recorded.
