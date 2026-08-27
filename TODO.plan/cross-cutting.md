# Cross-cutting work

Work that does not belong to a single phase, because it spans the project or
depends on decisions outside this repository.

## Shared conformance testsuite

The corpus is the contract between implementations: Ruby, TypeScript, and any
future Python or Rust port check against the same cases. It already lives in
its own repository, `plurimath-testsuite`. This package consumes it as a **git
submodule** pinned to a reviewed commit — not as a local directory, and not as
a published package.

**Generators that write shared data live in the testsuite. Each consumer writes
its own reader.** One generator per owned directory, each recording its own
provenance.

| Owner | Owns |
|---|---|
| `plurimath-testsuite` | the case schemas, the cases, `corpus/provenance.yaml`, and `scripts/generate-corpus.rb` that writes them from the gem |
| plurimath-ts (here) | the submodule pin, the TypeScript reader, `corpus/census.yaml` and `corpus/exclusions.yaml`, and the generators that emit TypeScript |
| plurimath (Ruby) | its own reader over the same cases |

Census and exclusions are **not** shared. Both encode this port's roadmap
rather than the gem's behaviour — they classify classes as deferred and cite
`ARCHITECTURE.md`, which lives here — so they were removed from the shared
repository and stay here. The symbol-data generator stays here for a different
reason: it emits TypeScript, which no other implementation can consume.

Format: YAML sources, one file per case group, with JSON Schema validated in
the testsuite's own CI. YAML for humans — comments, readable diffs. Consumers
parse that YAML directly; nothing is compiled to JSON today, so a reader is
each implementation's own small cost.

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
measurement shows exactly 7 of 1,461 classes carry conditional behaviour. Making
that data authoritative would let the gem generate its own symbol classes from
it, deleting tens of thousands of hand-maintained lines on the Ruby side too.

Deliberately **not** part of the corpus move: it is a bigger ask, because it
changes the gem, and it is a separate conversation now that the corpus has its
own repository. Until it is settled, symbol data is generated straight into
this repository as TypeScript.

Function classes are explicitly out of scope for sharing: 71 of 102 carry
conditional logic, so expressing them as data would require a template language
plus an interpreter in every implementation — more work than porting, and a
ceiling on what any implementation could express.

## Direction of truth

Today the gem is the oracle and everything shared is generated *from* it. If
the shared data later becomes authoritative, that inverts — and the inversion
must not happen while this port is still proving parity, or it would be
measuring itself against data that no longer matches the shipping gem.
