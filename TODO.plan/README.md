# Plan

Porting the [Plurimath Ruby gem](https://github.com/plurimath/plurimath) to
TypeScript, phase by phase, until this package can replace the Opal-compiled
`plurimath-js`.

`ARCHITECTURE.md` is the contract — how the code is structured and what proves
it correct. This directory is the schedule: what gets built, in what order, and
why that order.

## Phases

| Phase | Delivers | Status |
|---|---|---|
| [P0 — Foundation](p0-foundation/) | Tooling, quality gates, pegkit parser core | ✅ done |
| [P1 — AsciiMath vertical](p1-asciimath/) | Corpus pin and reader, model, grammar, transform, four renderers | ▶ active |
| [P2 — Output formats](p2-output-formats/) | OMML and HTML renderers; compat class; first `0.x` | planned |
| [P3 — Input formats](p3-input-formats/) | LaTeX, UnicodeMath and HTML parsers | planned |
| [P4 — Parity modules](p4-parity-modules/) | The number-format modes nothing earlier reaches, evaluation, MathML/OMML input | planned |
| [P5 — 1.0](p5-release-1.0/) | Compat complete, `/core` locked, npm takeover | planned |

Reference pages, not tied to one phase:

- [Cross-cutting work](cross-cutting.md) — the shared conformance testsuite and
  who owns what in it, UnitsML, symbol data as shared data.
- [Open decisions](open-decisions.md) — what is deliberately unsettled, who
  decides, and by when.

## How this is organised

**Every phase is a directory** whose `README.md` answers the same four
questions in the same order: *what it delivers*, *why here*, *risks and notes*,
*exit criteria*. So a reader always knows where to look, whatever the phase.

**The active phase also has numbered work items**, one file each, following the
same shape as the rest of the organisation's `TODO.<topic>/` directories: a
`## Why` before the `## Scope`, and a `## Done when` checklist. Later phases
gain their items when they open.

That asymmetry is deliberate. Detailed scope for work three phases out would be
invention, and a plan that looks more certain than it is costs more than it
gives.

## Why this order

Each phase exists to make the next one safe:

1. **P0 first** so every later change is checked by gates that already work —
   layering, types, packaging, and a parser core proven against Parslet's own
   behaviour.
2. **P1 as one vertical slice** rather than a layer at a time. Building the
   model, a parser and renderers together proves the whole approach end to end;
   building all the models first would prove nothing until the last day.
3. **AsciiMath before other formats** because it is the smallest complete
   grammar (219 lines) and the format the gem's own test suite covers most
   heavily.
4. **Output formats before input formats** (P2 before P3), because every
   renderer shares one model, so they compound; each new parser is instead an
   independent grammar port.
5. **Parity modules last** (P4) — but only the part that is genuinely left.
   Number formatting cuts across everything, which cuts both ways: its contract
   and the behaviour a given renderer or parser actually exercises land *with*
   that renderer or parser, and P4 keeps the modes nothing earlier reaches.
   Evaluation and MathML/OMML input are last on their own merits: they need the
   whole model, and a settled dependency strategy.
6. **1.0 at the end** (P5), because a stability promise is only meaningful once
   there is nothing substantial left to change.

## Progress

A phase is done when its gates pass and its exit criteria are met
(`ARCHITECTURE.md` §9), including the class-C evidence: a review round with
findings resolved, and sign-off recorded.
`gates.json#currentMilestone` is the machine-readable answer to "where are we".
