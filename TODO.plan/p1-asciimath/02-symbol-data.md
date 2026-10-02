# TODO 2 — Generate per-format symbol data

## Why
Symbol definitions are 69% of the Ruby gem (64k lines across 1,461 classes) and
are almost entirely data: measured, exactly 7 carry conditional behaviour.
They are generated, never hand-ported (ARCHITECTURE.md D5).

The data is split **per format** so a renderer bundles only its own slice; a
single merged blob would put every format's output strings into every bundle
and quietly break the isolation guarantee (§3).

## Scope
- `scripts/generate-corpus.rb` — this repository's own generator, not the
  shared one. It emits TypeScript, so the testsuite cannot host it: TypeScript
  is useless to the Ruby gem or a future Python port. Generators that write
  shared data live in the testsuite; this one does not
  ([cross-cutting](../cross-cutting.md)). From the gem it emits:
  - `src/generated/asciimath/input.ts` — input string → symbol id, plus the
    ordered literal list the grammar dispatches on (longest-first).
  - `src/generated/<format>/symbols.ts` — symbol id → **static representation
    descriptor** for that format only.
- Emit TypeScript, not JSON: `.ts` keeps the data type-checked and lets the
  build treat it like any other module.
- Symbol ids are the Ruby class keys (`Sigma`, `Paren::Lround`). Treat them as
  schema values: a rename upstream requires an alias entry, never a silent
  change (§7).
- Emit the **context-axis probe results**: render every symbol across the
  committed axis manifest (`intent` on/off, table vs non-table, the `rspace`
  option, target format) inside the committed host templates, and record only
  the symbols whose output differs. That difference set drives the exception
  matrix (§5).

## Not in scope
Function classes are **not** generated: 71 of 102 carry conditional logic, so
sharing them as data would need a template language plus an interpreter per
implementation. They are hand-ported (§10).

## Done when

- [ ] Every symbol the pinned corpus touches resolves through generated data.
  (open: generated tables from #3 (AsciiMath, LaTeX, MathML) and #63 (HTML, OMML); each `src/render/symbol/<format>.ts` reads its `src/generated/<format>/symbols.ts` table and raises `MissingSymbolDataError` on a miss, and no corpus case raises it: the AsciiMath, LaTeX and MathML render-parity specs render all 236 reachable cases (`06-renderers.md`), and the HTML and OMML parity targets list no case the port refuses to render (the empty set at `test/formats/html/parity-target.ts:57` and `test/formats/omml/parity-target.ts:81`, emptied by #73 and #72); but the HTML and OMML parity targets cover only the corpus's AsciiMath-input cases, and its LaTeX-input cases are not swept for either format (`p2-output-formats/01-html-renderer.md:117`, `p2-output-formats/02-omml-renderer.md:274`); checked 2026-10-02)
- [x] The probe output names the context-dependent symbols, and the list matches
  what the gem actually does rather than a hand-written guess.
  (done: `test/generated/symbol-context.spec.ts:118`, the matrix is exactly the probe's difference set; checked 2026-09-24)
- [x] A symbol id missing from a renderer slice raises `MissingSymbolDataError`.
  (done: `test/formats/mathml/renderer.spec.ts:682`, `test/formats/html/renderer.spec.ts:890`; checked 2026-09-24)
