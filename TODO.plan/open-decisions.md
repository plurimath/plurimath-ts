# Open decisions

Deliberately unsettled, each with an owner and the point by which it must be
answered. `ARCHITECTURE.md` §11 is the authoritative list; this page adds the
context needed to decide.

Nothing here blocks the active phase.

| Decision | Owner | Needed by |
|---|---|---|
| UnitsML approach, and its 1.0 consequence | maintainer + upstream | before 1.0 |
| npm package name and release line | maintainer | before first publish |
| Compat declaration target | maintainer | before P2 compat fixture |
| Compat `data` property | maintainer | before P2 |
| Bundle budgets | maintainer | during P1, from real numbers |
| Symbol data as shared data | maintainer + gem | after P1 |
| MathML/OMML input strategy | maintainer | P4 planning |

## UnitsML, and what it means for 1.0

Deferred because the upstream JavaScript package is unusable
([cross-cutting](cross-cutting.md)). The coupling to worry about: `plurimath-js`
supports UnitsML today, so at package takeover either parity exists or the
break is documented and the "drop-in replacement" claim is dropped.

Options when it returns: fix upstream and bridge behind the leaf-service
boundary; port UnitsML natively; or keep deferring.

## npm package name and release line

The Opal package owns `@plurimath/plurimath`. Design position: publish `0.x`
early under a distinct name, explicitly experimental, and take the name over at
1.0 when the compat class is complete and `/core` locks.

## Compat `data` property

Both measured class declarations expose a writable `data` holding an Opal
`ParserResult` — runtime-specific and not reproducible (published
[`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts);
source head `ce297e2`, `src/index.ts:4-9`). Either expose a name-compatible
`readonly data: FormulaNode`, or document its absence. The declaration fixture
must record this choice separately from the declaration-target choice; the
question is which breaks fewer consumers.

## Compat declaration target

The published `@plurimath/plurimath@0.2.2` declarations and source head
`ce297e2` differ in three measured ways: published `0.2.2` has six methods,
`toMathml()` takes no argument, and its `Format` union contains `mahtml`; source
head has seven methods by adding `toUnicodemath()`, declares
`toMathml(intent?: boolean)`, and uses `unicode` (published
[`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts)
and [`dist/plurimath-opal.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/plurimath-opal.d.ts);
source head `src/index.ts:4-37` and `src/plurimath-opal.d.ts:8`; the maintainer's
independent `curl` fetched both published files with exit `0`).

Choose whether the compat fixture freezes the artifact consumers install today,
including `mahtml`, or targets source head on the expectation that a later
publish carries those declarations. The `mahtml` spelling looks like an upstream
defect; the maintainer may prefer to fix and publish it upstream rather than
freeze it here. This document does not choose.

## Bundle budgets

Deferred on purpose: ceilings set before the first real measurement would be
invented. Once P1 produces `/asciimath`, `/mathml`, `/latex` and `/unicodemath`, the isolation
gate reports chunk and source-module counts, not bytes, so a size budget
would need a new measurement rather than a threshold on what it already prints.

## Symbol data as shared data

The corpus half of this question is **settled**: the shared repository exists,
it is named `plurimath-testsuite`, and this package consumes it as a submodule
([cross-cutting](cross-cutting.md)).

What is still open is the bigger half. Making symbol data authoritative means
the Ruby gem generating its symbol classes from it, so it needs the
maintainer's agreement and gem work, not just a repository. Two sub-questions
travel with it: whether symbol data shares `plurimath-testsuite` or gets its
own repository, and who governs symbol ids once two implementations depend on
them.

Nothing blocks the port meanwhile: symbol data is generated straight into this
repository as TypeScript.

## MathML/OMML input strategy

The gem delegates to the `mml` and `omml` gems, and the organisation ships an
Opal-compiled `@plurimath/mml`. Same shape as the UnitsML question, and the
same caution: evaluate on evidence — does it publish working artifacts, and
does it yield a native model or an Opal one?
