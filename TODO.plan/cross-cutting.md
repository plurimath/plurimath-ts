# Cross-cutting work

Work that does not belong to a single phase, because it spans the project or
depends on decisions outside this repository.

## Shared conformance testsuite

The corpus is the contract between implementations: Ruby, TypeScript, and any
future Python or Rust port check against the same cases. Staged deliberately:

1. **Built locally, in shared shape** — from P1 the corpus lives in its own
   directory with a JSON Schema, provenance manifests, and a version stamp, and
   this package consumes it exactly as it would a released dependency.
2. **Extracted to its own repository** once that pipeline is proven end to end.
   Designing the schema from experience rather than imagination is the whole
   point of the ordering; extraction then costs a `git init`, not a rewrite.

Format: YAML sources compiled to JSON artifacts. YAML for humans — comments,
readable diffs, one file per case group. JSON for machines — parsed by every
language's standard library, deterministic, checksummed.

## UnitsML

Deferred pending a decision with the maintainer (`ARCHITECTURE.md` §5).

The grammar rule stays **commented out**, so `"unitsml(...)"` falls through to
plain quoted text and is processed as text. Nothing pretends to support it, and
the divergence from Ruby — which renders the units — is announced through the
`onUnsupported` diagnostic rather than left silent.

Why it is deferred rather than bridged, verified 2026-07-29:

- `@unitsml/unitsml@0.6.7` publishes only `LICENSE`, `README.md` and
  `package.json`; the `dist/` its entry points reference is absent, so
  importing it fails.
- Its README marks `Unitsml.parse()` runtime support incomplete.
- Even once shipped, the gem's `to_plurimath` builds a Ruby/Opal formula by
  re-parsing generated MathML — it would not return this project's model, so a
  bridge also needs a MathML→native adapter.

This is a bug in the organisation's own `unitsml/unitsml-js` repository and
worth reporting regardless of which option wins.

## Symbol data as shared data

Higher leverage than the corpus: 69% of the gem is symbol definitions, and
measurement shows only about 7 of 1,461 classes carry any behaviour. Making
that data authoritative would let the gem generate its own symbol classes from
it, deleting tens of thousands of hand-maintained lines on the Ruby side too.

Deliberately **not** bundled with the testsuite extraction: it is a bigger ask
because it changes the gem, and it is a separate conversation once the corpus
has proven the pipeline.

Function classes are explicitly out of scope for sharing: 57 of 102 carry
conditional logic, so expressing them as data would require a template language
plus an interpreter in every implementation — more work than porting, and a
ceiling on what any implementation could express.

## Direction of truth

Today the gem is the oracle and everything shared is generated *from* it. If
the shared data later becomes authoritative, that inverts — and the inversion
must not happen while this port is still proving parity, or it would be
measuring itself against data that no longer matches the shipping gem.
