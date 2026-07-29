# P1 — AsciiMath vertical

**Status: active.** The first end-to-end slice: AsciiMath in, model, and three
renderers out, all proven against cases generated from the Ruby gem.

## What it delivers

A working library for the most common conversion path, and — more importantly —
proof that the whole approach holds: generated corpus, generated symbol data,
census-driven model, a grammar and transform ported rule-for-rule, and
renderers as modules rather than methods.

## Work items

Work in order; each depends on the ones before it.

| # | Item | Produces |
|---|------|----------|
| 1 | [Corpus generator](01-corpus-generator.md) | `corpus/`, node census, provenance manifests |
| 2 | [Symbol data](02-symbol-data.md) | per-format symbol slices, context-axis probes |
| 3 | [Core model](03-core-model.md) | node classes, equality projection, normalization |
| 4 | [AsciiMath grammar](04-asciimath-grammar.md) | preprocessing + parse tree matching Parslet |
| 5 | [AsciiMath transform](05-asciimath-transform.md) | parse tree → model |
| 6 | [Renderers](06-renderers.md) | `toAsciimath`, `toLatex`, `toMathml` |
| 7 | [Activate gates](07-activate-gates.md) | milestone `P1-baseline`, nine gates green |

Items 1–2 need a local checkout of the
[Ruby gem](https://github.com/plurimath/plurimath); items 3–7 need only this
repository, because generated payloads are committed.

## Why here

One vertical slice rather than a layer at a time. Building the model, a parser
and renderers together proves the approach end to end; building every model
first would prove nothing until the last day.

AsciiMath goes first because it is the smallest complete grammar in the gem
(219 lines) and the format its own test suite covers most heavily.

## Risks and notes

- **The transform is the bulk.** `transform.rb` is ~95 pattern rules and the
  largest single piece of AsciiMath logic; expect item 5 to dominate.
- **Rule order is behaviour.** Parslet uses ordered choice and reverse-order
  transform matching, so moving an alternative changes what parses. Both are
  already pinned by the pegkit conformance suite.
- **Deliberately not here:** UnitsML (deferred — its grammar rule stays
  commented out and such input is processed as text); the other renderers (P2)
  and input formats (P3); locales, evaluation and MathML/OMML input (P4).

## Exit criteria

- [ ] Parse tree, normalized model, and all three renderings match the gem for
      every corpus case.
- [ ] Generated symbol data and census, produced from a clean checkout with
      provenance manifests.
- [ ] The P1-baseline gates active and green.
- [ ] Review round with findings resolved, and sign-off recorded.

## Scope discipline

`ARCHITECTURE.md` is the contract. If an item here needs something the document
does not describe, change the document first — that is what keeps the plan and
the code from drifting apart.
