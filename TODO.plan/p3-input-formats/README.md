# P3 — The other input formats

**Status: started ahead of plan** (`gates.json#currentMilestone` is `P2`).
LaTeX, UnicodeMath and HTML parsers. Each is locked by its own corpus before
the next begins. On `main`: the LaTeX (#76) and HTML (#88) parsers, and a
partial UnicodeMath parser registering 483 of the gem's 519 transform rules
(`FINAL_COUNT` in `test/formats/unicodemath/transform-coverage.spec.ts`). Four
of the five exit criteria below are checked.

Each format opens as its own directory here (`latex/`, `unicodemath/`,
`html/`) with numbered work items when it starts.

## What it delivers

Every input format the gem supports, so any source notation can be read into
the shared model. Measured in the gem's `lib/plurimath/`:

| Format | Grammar | Parser total | Notes |
|---|---|---|---|
| LaTeX | 281 lines | ~1.7k | Largest grammar; most familiar syntax |
| UnicodeMath | 297 lines | ~6.4k | Bulk is data tables, not logic |
| HTML | 219 lines | ~0.9k | Smallest surface |

## Why here

**LaTeX first** — the widest real-world demand, and its grammar exercises
pegkit hardest, so any remaining engine gaps surface while there is still
appetite to fix them. **UnicodeMath second**: comparable grammar size, but most
of its bulk is tables, which are generated rather than written. **HTML last**,
being the smallest and least used.

Each phase has the same shape as P1, which is the point of doing P1 as a full
vertical first:

1. Add the format's cases to `plurimath-testsuite` — its schema, its cases and
   its generator live there — then move this repository's submodule pin to
   the commit that carries them. The reader here gains the new input format;
   it does not gain a generator.
2. Port the grammar rule-for-rule from the gem's `parse.rb`.
3. Port the transform rule-for-rule from its `transform.rb`.
4. Confirm the node census — the union already includes kinds no earlier format
   produced, so this is usually confirmation rather than addition. The census
   stays here: it is port-specific, not shared data.
5. Corpus, negative cases, isolation assertions, review round.

## Risks and notes

- **pegkit gaps.** The primitives these grammars need beyond AsciiMath's —
  `any`, `present?`, capture `scope` — are implemented and conformance-tested,
  but unexercised by a real grammar until here. Measured against the oracle
  once the LaTeX grammar landed, that is true of `any` only: `latex/parse.rb`
  uses it twice, both inside `rule(:color)` at `:21-22`, and uses neither
  `present?` nor `scope` anywhere. All three are exercised by the end of P3.
  Re-measured across `lib/plurimath/` when the HTML grammar landed: `present?`
  appears under `unicode_math/` and once at `html/parse.rb:200`
  (`tag_name_boundary`), and Parslet's `scope` appears exactly once in the whole
  gem, at `html/parse.rb:180` (`wrapped_tag`) — so HTML, not LaTeX, is the
  grammar that exercises both `scope` and `capture`.
- **Shared model pressure.** A later format may want a node shape that
  contradicts an earlier assumption. The census-driven union is the guard, but
  a genuine conflict means changing `ARCHITECTURE.md` first.
- **UnicodeMath table volume.** Generation must handle it; hand-porting is not
  on the table.
- **Locale travels with the parser, not with P4.** The gem accepts a `locale`
  parse option for exactly four formats
  (`Math::LOCALIZED_PARSE_TYPES` — asciimath, html, latex, unicode), and it
  reaches the *grammar*: each of those `parse.rb` files builds its decimal
  marker from `Plurimath.configuration.decimal`, which the locale sets. So
  LaTeX, UnicodeMath and HTML each land their own locale behaviour here, the
  way AsciiMath does in P1. Only what none of them exercises is left for P4.
- **Entity input.** LaTeX and HTML normalise named entities to hex on input
  (see [deferred](../deferred.md)). That does *not* give them a malformed-entity
  rejection class. Probed against the oracle: `&nosuchentity;`, `&#xZZ;`, `&;`,
  `&pi` and a bare `&` are all accepted by both, and fall through as literal
  characters.

  What does reject is narrower — a *well-formed* hex entity naming a codepoint
  above `0x10FFFF`. `&#x110000;` raises `ParseError` under latex and under html,
  and is accepted under asciimath, so the class is real and genuinely specific
  to these two formats. It also carries a width boundary a naive port will miss:
  `&#x10FFFF;` round-trips lowercased, `&#x110000;` breaks the parse, and
  `&#xFFFFFFFF;` is never recognised as an entity at all and survives
  byte-identical, capitals intact.

  That three-way split is the behaviour of the `HTMLEntities` gem, reached
  through the Plurimath gem's `lib/plurimath/latex/parser.rb:27` — a path in the
  oracle, not in this repository — and not of Plurimath itself. So the port
  cannot read it out of Plurimath's source and must probe for it. Author this
  rejection group from a probe, not from this paragraph.

## Exit criteria

Per format:

- [x] Parse-tree, normalized-model and rendered-output parity across its corpus.
  (done: LaTeX and UnicodeMath through `test/formats/input-corpus-parity.spec.ts`, which runs `parseLatex`/`parseUnicodemath` on the input of every pinned case written in that notation (125 LaTeX, 20 UnicodeMath, counts asserted) and deep-equals the recorded `parse_tree`, the `model`, and `expected.{asciimath,latex,mathml,unicodemath}` byte for byte; `expected.{omml,html}` take the same round trip in `test/formats/corpus-target-parity.ts`. HTML has no positive cases in the pin, so its corpus is the gem's own `to_html` round trip of the pinned cases plus rule coverage in `test/formats/html/model-fixtures.json`, generated from the oracle at `00c52783` by `scripts/generate-html-model-fixtures.rb`: 272 rows carry the gem's `Html::Parse` tree (13 refused), 267 its model, and 259 its four renders (887 byte rows, 149 render refusals the port also refuses, as `RenderError` where the gem's renderer raises `Math::ParseError`), all checked by `test/formats/html/model-parity.spec.ts`. UnicodeMath is a partial parser: its whole pinned corpus passes and `DEFERRED_INPUTS` is empty, but 36 of the gem's 519 transform rules are unported, and those are outside this criterion and not ported here. The three `slice-boundary` rows of its model fixtures are a separate recorded edge, pinned in `test/formats/unicodemath/model-parity.spec.ts` (`inputs whose rules sit outside the slice`). The LaTeX matrix trees needed `test/core/corpus-yaml.ts` to decode quoted mapping keys, which it kept quoted; checked 2026-10-12)
- [x] Rejection corpus passing, with its case count asserted nonzero, and each
      malformed-input class resolved by probing that format the way P1's item 8
      resolved them for AsciiMath: a rejection case where the gem rejects, a
      positive case where it accepts, a recorded not-applicable where the class
      does not exist for that format. Entities apply here, unlike in P1.
  (done: the pinned rejection corpus passes in each `rejection-parity.spec.ts` with its count asserted, 14 LaTeX, 38 HTML and 52 UnicodeMath. P1's five classes are probed per format by each generator's `MALFORMED_COVERAGE` (`scripts/generate-{latex,html,unicodemath}-model-fixtures.rb`, oracle `00c52783`), so a refusal lands as a `raises` row the port must refuse and an acceptance as a model row that pins the leniency; every class exists in every format, so none is not-applicable. Measured, as `accepted/refused` rows: LaTeX fraction 0/5, power 3/1 (`x^`, `x_`, `^` accepted; `x^{` refused), fences 3/4, trailing 0/3, entities 6/1; HTML fraction 3/0 (`a/` and `/b` accepted), power 1/3, fences 0/4, trailing 0/2, entities 6/1; UnicodeMath refuses every candidate, fraction 0/4, power 0/4, fences 0/4, trailing 0/2, entities 0/8, including `&#x10FFFF;`, which LaTeX and HTML accept. The entity width split holds for LaTeX and HTML: `&#x110000;` refused, `&#x10FFFF;` and `&#xFFFFFFFF;` accepted. Pinned per class in the `malformed-input classes` block of each `model-parity.spec.ts`; checked 2026-10-12)
- [x] Locale behaviour matching the gem for that parser, or a recorded
      divergence if it is deliberately not implemented.
  (done: the `locale` group of `test/formats/latex/model-fixtures.json` and `test/formats/html/model-fixtures.json` (eight rows each: `1,5` under `de` and `fr`, `1,2,3` and `1.5` under `de`, `1.5`, `1,5` and `1٫5` under `en`, `1٫5` under `ar`) and of `test/formats/unicodemath/model-fixtures.json` (six rows: `1٫5` under `ar`, `en` and `de`, `1,5`, `1.5` and `1,2,3` under `de`), generated from the oracle at `00c52783` by each format's `scripts/generate-*-model-fixtures.rb`, deep-equal the port's models in each `model-parity.spec.ts`; passing no locale to the three grammars fails exactly the eleven non-`en` rows whose model differs from the default (five LaTeX, five HTML, one UnicodeMath); an unsupported locale (`xx`, `DE`, `de_CH`) raises `UnsupportedLocaleError` in all three, as the gem raises `UnsupportedLocale` (`DE` and `de_CH` in the `an unsupported locale spelling refuses` block of each format's rejection spec, HTML's in `parser.spec.ts`), and is checked before preprocessing as the gem checks it (`test/formats/latex/rejection-parity.spec.ts` and `test/formats/unicodemath/rejection-parity.spec.ts`, `&#55296;` and `#` under `xx`; HTML's twin is in `test/formats/html/parser.spec.ts`); unknown option keys raise `ParseOptionError` before the locale is checked, as the gem raises it (the `parse-options` group of each format's `render-options-fixtures.json`, checked by `test/formats/parse-option-parity.spec.ts`); checked 2026-10-08)
- [x] Isolation assertions for its subpath.
  (done: `scripts/gate-package.mjs:219`, `:223`, `:231` for `./html`, `./latex`, `./unicodemath`; `pnpm gate:package` exits 0; checked 2026-09-24, line references 2026-10-12)
- [ ] Review round with findings resolved, and sign-off recorded.
      (review round done; sign-off pending (user/maintainer). Record below.)

## Review round 2026-10-12

One adversarial review (a Claude review agent; Codex unavailable until
2026-10-18) of `main` 26e3a196 against this README's exit criteria,
`ARCHITECTURE.md` and `PORTING-STANDARDS.md`, with the oracle at `00c52783`.
Clean: 274 non-corpus inputs (about 155 LaTeX, 38 HTML, 81 UnicodeMath) parsed
and rendered to AsciiMath, LaTeX, UnicodeMath and MathML on both sides match
byte for byte, apart from two UnicodeMath inputs (`∫▒dx`, `├x┤`) that reach the
known unported transform rules and that the gem parses but cannot render;
`tsc --noUnusedLocals --noUnusedParameters` reports nothing; no layer-boundary
violations; every figure and gem line reference in the criteria above re-measured.

| # | Finding | Evidence | Disposition |
|---|---|---|---|
| 1 | The isolation criterion cited `scripts/gate-package.mjs:195`, `:199`, `:207` | those lines are the locale regex block; the rows are at :219, :223, :231 | fixed |
| 2 | The locale criterion claims `DE` and `de_CH` are refused, but only `xx` was tested | grep: no `de_CH` under `test/`; the gem raises `UnsupportedLocale` for both in all three formats | fixed: one test block per format |
| 3 | `src/formats/unicodemath/transform.ts:1-934` is a ~930-line header narrating each increment, with running counts superseded by `FINAL_COUNT` (483); `test/formats/unicodemath/transform-coverage.spec.ts:105` keeps a historical tally the same way | `ARCHITECTURE.md` asks comments to explain constraints, not narrate | follow-up: a rewrite of 900+ lines of comment is its own change; the header's own lines 17-22 already defer to `FINAL_COUNT` |
