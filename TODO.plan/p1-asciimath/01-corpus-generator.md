# TODO 1 — Pin the shared corpus, and generate the census here

## Why
The Ruby gem is the source of truth (ARCHITECTURE.md §1). Every claim this port
makes about correctness is settled by comparing against cases the gem itself
produced, so this comes before any implementation — there is nothing to check
against until it exists.

Those cases now live in `plurimath-testsuite`, which owns the case schema, the
cases, `corpus/provenance.yaml`, and the generator that writes them from the
gem. What is owed **here** is the other half: the pin that says which cases we
check against, and the TypeScript reader that loads them. Each implementation
writes its own reader; the Ruby gem writes a Ruby one
([cross-cutting](../cross-cutting.md)).

This item also produces the **node census**, which the model layer (TODO 3) is
declared from, and the **exclusions list** naming cases withheld because of a
deferred feature (§5). Both stay here: they classify classes against this
port's roadmap rather than describing the gem, which is why the shared
repository dropped them.

## Scope
- Add `plurimath-testsuite` as a **git submodule**, pinned to a reviewed
  commit, recorded in `.gitmodules`. Moving the pin changes what the suite
  asserts, so it is reviewed like a code change.
- A TypeScript **reader** for the pinned corpus:
  - loads every case group under the submodule's `corpus/<input_format>/`;
  - reads `corpus/provenance.yaml` and checks each payload's `sha256` and
    `bytes` before trusting it;
  - fails on an absent or uninitialized submodule, zero payloads, zero cases, a
    missing group, or a missing target key (TODO 7 turns this into a gate);
  - refuses a pin whose provenance says `committable: false`, or whose
    `xml_engine` is not Ox — those cases were not generated the canonical way
    (§7), and a pin is easy to move without noticing either.
- Keep `scripts/generate-corpus.rb` for the outputs that stay here — the
  census, the exclusions list, and the TypeScript symbol data (TODO 2) — and
  **delete its corpus-case half**, which the testsuite's copy now owns.
  Two generators for one payload is how the two drift apart.
- Delete the pre-split copy of the cases under `corpus/asciimath/`. It is what
  `test/core/model-builder.ts` and `test/core/corpus-yaml.spec.ts` read today,
  so nothing may still resolve there once the submodule lands.
- Emit `corpus/census.yaml`: every `Math::Core` descendant classified
  `implemented` / `aliased` / `deferred`, with `Math::Function::Unitsml` in the
  deferred set, and each class's measured constructor defaults. An unclassified
  new class fails generation.
- Emit `corpus/exclusions.yaml`: inputs withheld because they match a deferred
  construct — matched on the **input text**, since the gem never produces a
  formula for the invalid ones.
- Generation still refuses a dirty checkout of either the gem or this
  repository; `--allow-dirty` marks its output non-committable (§7).

## Shape of a case
Defined by the testsuite's `schema/cases.json`, not here. Reproduced for
orientation — every key below is required, so a reader that ignores
`preprocessed`, `parse_tree` or `model` is leaving evidence on the table:

```yaml
- id: frac-simple
  input: a/b
  input_format: asciimath
  preprocessed: a/b
  expected:
    asciimath: frac(a)(b)
    latex: \frac{a}{b}
    mathml: |
      <math ...>
  parse_tree:
    expr: ...
  model:
    class: Math::Formula
    fields: ...
```

## Done when

- [x] `.gitmodules` records `plurimath-testsuite`, and a fresh clone plus
  `git submodule update --init` gives the reader cases to load.
  (done: `.gitmodules:1-3`; `git submodule update --init` in a fresh worktree, then `test/core/corpus-pin.spec.ts:246` passes; checked 2026-09-24)
- [x] The reader loads every AsciiMath group in the pin and reports a nonzero
  case count; a test feeds it an empty directory and asserts it **fails**.
  (done: `test/core/corpus-pin.spec.ts:246` loads every payload, `:260` pins 237 cases, `:368` fails on an empty directory; checked 2026-09-24)
- [x] Every payload the reader discovers is checked against
  `corpus/provenance.yaml`, and a corrupted byte in any payload fails the run.
  (done: `test/core/corpus-pin.spec.ts:246`, and `:394` fails on a changed byte; checked 2026-09-24)
- [x] `corpus/census.yaml` and `corpus/exclusions.yaml` regenerate
  byte-identically on a second run from a clean checkout.
  (done: `scripts/gate-oracle.rb repo --check` regenerates both from a clean gem checkout and diffs them against the committed files; it exits 0 on `main` be45593 against `plurimath-oracle` at `00c52783`; checked 2026-10-02)
- [x] Nothing under `corpus/asciimath/` remains here, and no test path resolves
  there.
  (done: `ls corpus` lists only the census and exclusions files; `test/core/corpus-yaml.spec.ts:117`; checked 2026-09-24)
- [x] A pin marked `committable: false`, or generated with a non-Ox engine,
  fails the reader — proven against a scratch copy of the provenance file, not
  argued from the code.
  (done: `test/core/corpus-pin.spec.ts:417` and `:429`, each on a scratch copy of the provenance file; checked 2026-09-24)
