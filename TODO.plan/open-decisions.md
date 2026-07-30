# Open decisions

Deliberately unsettled, each with an owner and the point by which it must be
answered. `ARCHITECTURE.md` §11 is the authoritative list; this page adds the
context needed to decide.

Nothing here blocks the active phase.

| Decision | Owner | Needed by |
|---|---|---|
| UnitsML approach, and its 1.0 consequence | maintainer + upstream | before 1.0 |
| npm package name and release line | maintainer | before first publish |
| Compat `data` property | maintainer | before P2 |
| Bundle budgets | maintainer | during P1, from real numbers |
| Shared-repo extraction and naming | maintainer | after P1 |
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

The published class exposes a writable `data` holding an Opal `ParserResult` —
runtime-specific and not reproducible. Either expose a name-compatible
`readonly data: Formula`, or document its absence. The ABI is already described
as method-exact rather than object-exact, so either choice is honest; the
question is which breaks fewer consumers.

## Bundle budgets

Deferred on purpose: ceilings set before the first real measurement would be
invented. Once P1 produces `/asciimath`, `/mathml` and `/latex`, the isolation
gate reports actual sizes and the budgets can be set from evidence.

## Shared-repo extraction and naming

Corpus first, symbol data later ([cross-cutting](cross-cutting.md)). Naming
candidates follow the organisation's conventions: `plurimath-testsuite` matches
the existing `-testsuite` repositories and the maintainer's own phrasing;
`plurimath-spec` or `plurimath-data` would cover symbol data too if the two
ever share a repository.

## MathML/OMML input strategy

The gem delegates to the `mml` and `omml` gems, and the organisation ships an
Opal-compiled `@plurimath/mml`. Same shape as the UnitsML question, and the
same caution: evaluate on evidence — does it publish working artifacts, and
does it yield a native model or an Opal one?
