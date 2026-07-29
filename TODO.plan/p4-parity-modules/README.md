# P4 — The remaining parity modules

**Status: planned.** What is left of the gem once every format is ported:
number formatting with locales, expression evaluation, and MathML/OMML *input*.

Numbered work items are added to this directory when the phase opens.

## What it delivers

**Number formatting and locales.** `src/formatting/` exists from P1, but only
as minimal normalization. This phase completes it: locale-aware decimal and
grouping separators, significant-digit and precision handling, scientific and
engineering notation, and base notation (hex, binary, octal).

The gem routes **every** numeric render through `Formatter::Numbers` (~2k
lines), which is why the seam is created early even though the implementation
lands late — retrofitting it afterwards would touch every renderer. Locale data
sits behind its own subpath, so a consumer who never formats localized numbers
does not download the tables; the isolation gate proves it.

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

Each is genuinely cross-cutting, which makes it cheapest once the things it
cuts across exist. Formatting touches every renderer; evaluation needs the
whole node model; MathML/OMML input needs the model *and* a settled dependency
strategy.

## Risks and notes

- **Dependency evidence, not assumption.** The UnitsML experience is the
  caution: the organisation's JavaScript release of that gem publishes no
  `dist/` at all, so an apparently ready dependency was unusable. Evaluate
  `@plurimath/mml` on its own evidence — does it ship working artifacts, and
  would it yield this project's native model or an Opal one?
- **Locale data volume.** Keeping it out of unrelated bundles is an isolation
  assertion, not a hope.

## Exit criteria

- [ ] Corpus slices for each module.
- [ ] Isolation assertions proving locale and unit data stay out of unrelated
      subpaths.
- [ ] MathML/OMML input strategy decided and recorded before implementation.
- [ ] Review round with findings resolved, and sign-off recorded.
