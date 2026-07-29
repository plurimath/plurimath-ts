# TODO 1 — Generate the conformance corpus and node census from the gem

## Why
The Ruby gem is the source of truth (ARCHITECTURE.md §1). Every claim this port
makes about correctness is settled by comparing against cases the gem itself
produced, so the generator comes before any implementation — there is nothing
to check against until it exists.

It also produces the **node census**, which the model layer (TODO 3) is
declared from, and the **deferred-feature classifier**, which keeps UnitsML
cases out of all three generators (§5).

## Scope
- `scripts/generate-corpus.rb` — runs against a local `plurimath` checkout.
  - Refuse to run when either the gem checkout **or this repository** is dirty;
    `--allow-dirty` exists for local experiments and marks its output
    non-committable (§7).
  - Require the Ox XML engine for canonical output; Oga is a parity check only.
- Emit `corpus/asciimath/*.yaml`, grouped by feature, one file per group.
  Each case: `id`, `input`, `input_format`, `expected` (per target format),
  and the serialized normalized model.
- Emit a **sidecar manifest** per payload: schema version, generator commit,
  gem commit and version, `Gemfile.lock` checksum, Ruby engine and version,
  XML engine, non-default configuration, and the SHA-256 of the canonical
  payload (§7).
- Emit `corpus/census.yaml`: every `Math::Core` descendant classified
  `implemented` / `aliased` / `deferred`, with `Math::Function::Unitsml` in the
  deferred set. An unclassified new class fails generation.
- Exclude any case whose input matches a deferred construct — matched on the
  **input text**, since the gem never produces a formula for the invalid ones.

## Shape of a case
```yaml
- id: frac-simple
  input: a/b
  input_format: asciimath
  expected:
    asciimath: frac(a)(b)
    latex: \frac{a}{b}
    mathml: |
      <math ...>
```

## Done when

- [ ] The generator runs from a clean checkout and produces corpus, census, and
  manifests.
- [ ] Re-running it produces a byte-identical result.
- [ ] The seed corpus covers what the proof-of-concept covered: numbers, symbols,
  operators, fences, `frac`, powers and subscripts, roots, unary functions,
  quoted text, `sum`/`int`/`prod`, `lim`/`log`, and matrices.
