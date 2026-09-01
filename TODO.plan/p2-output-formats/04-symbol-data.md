# TODO 3 — Generate HTML and OMML symbol data

## Why

HTML and OMML need one format-owned value for each named symbol before their
renderers can cover the pinned corpus. This is measured data from the Ruby gem,
not renderer logic, so it must be generated: the gem is the oracle, and a
hand-written or normalized replacement would violate the port's first rule
(`PORTING-STANDARDS.md:8-14`).

The current HTML renderer already refuses missing named-symbol data at the two
sites that need it: ordinary symbol rendering (`src/render/symbol/html.ts:4-15`)
and named fence rendering (`src/render/fenced/html.ts:38-62`). OMML has the same
payload prerequisite, but its XML wrapper belongs to shared symbol helpers in
the oracle rather than to each generated class
(`/home/apple/ruby_gems/plurimath-oracle/lib/plurimath/math/symbols/symbol.rb:82-104,156-165`).

## Scope

### Measurement commands

The worktree is based on the requested pinned commit, and the oracle was clean
and detached at `00c52783877b38f6b8e6e109f1803f96bb34fc62`:

```sh
git rev-parse HEAD && git branch --show-current
# 4f3579ebe80e31d24690b89a5758a443fa0e02ad
# docs/symbol-data-scope
# exit 0

git status --short --branch && git rev-parse HEAD
# ## HEAD (no branch)
# 00c52783877b38f6b8e6e109f1803f96bb34fc62
# exit 0
```

Ruby was selected before probing with
`/home/apple/.codex/skills/ruby-version-manager/detect.sh`. In both the
worktree and oracle it reported Ruby `4.0.1`, `mise x --`, and
`VERSION_AVAILABLE=true` (exit `0`).

The probes are local-only evidence under
`.codex-context/tasks/symbol-data-scope/`; none is TypeScript and none is
committed. The labels below mean these exact commands:

```sh
# [definitions], from the clean oracle; each pipeline used `bash -o pipefail`
rg -o '^\s*def to_html\b' lib | wc -l
# 1492
# exit 0

rg -o '^\s*def to_omml_without_math_tag\b' lib | wc -l
# 1559
# exit 0

rg -o '^\s*def to_html\b' lib/plurimath/math/symbols | wc -l
# 1461
# exit 0

rg -o '^\s*def to_omml_without_math_tag\b' lib/plurimath/math/symbols | wc -l
# 1460
# exit 0

# [symbols], run from the clean oracle
BUNDLE_GEMFILE=/home/apple/ruby_gems/plurimath-oracle/Gemfile \
  mise x -- bundle exec ruby \
  /home/apple/ruby_gems/wt-symbol-data/.codex-context/tasks/symbol-data-scope/symbol_surface_probe.rb
# exit 0

# [generated-tables], run from this worktree
node_modules/.bin/esbuild \
  .codex-context/tasks/symbol-data-scope/generated_table_probe.mjs \
  --bundle --platform=node --format=esm \
  --outfile=/tmp/symbol-data-generated-table-probe.mjs
# exit 0
node /tmp/symbol-data-generated-table-probe.mjs
# exit 0

# [html-corpus], run from this worktree
node_modules/.bin/esbuild \
  .codex-context/tasks/symbol-data-scope/html_corpus_probe.mjs \
  --bundle --platform=node --format=esm \
  --outfile=/tmp/symbol-data-html-corpus-probe.mjs
# exit 0
node /tmp/symbol-data-html-corpus-probe.mjs
# exit 0
```

`[symbols]` recursively loaded the oracle's model classes, instantiated every
symbol class, and called the live render methods. It did not parse source
method bodies or invoke a generator. `[generated-tables]` read the four
committed P1 maps. `[html-corpus]` rebuilt all reachable pinned models with the
existing corpus reader, called the current HTML renderer, and separately
walked each model for blockers that the first thrown error could mask.

### Measured surface

The source-definition counts supplied with this task are reproducible, but
they overstate the data size: generated subclasses each repeat the method.
Runtime enumeration found `1,461` symbol classes including the dynamic
`Math::Symbols::Symbol` root. Its `1,460` descendants contain one abstract
carrier, `Paren`; the remaining `1,459` classes are the static rows
(`[symbols]`, exit `0`).

Every one of those `1,459` rows returned a non-nil payload for all six measured
formats. The P1 columns below come independently from the committed maps
(`[generated-tables]`, exit `0`); the HTML and OMML columns come from live
oracle calls (`[symbols]`, exit `0`):

| format | static rows | distinct payloads | rows duplicating an earlier payload | payload shape |
|---|---:|---:|---:|---|
| AsciiMath | 1,459 | 1,447 | 12 | string |
| LaTeX | 1,459 | 1,425 | 34 | string |
| MathML | 1,459 | 1,421 | 38 | `{ tag, text }` descriptor |
| UnicodeMath | 1,459 | 1,406 | 53 | string |
| HTML | 1,459 | 1,413 | 46 | string |
| OMML | 1,459 | 1,415 | 44 | string |

The two excluded classes need no static row. The generic `Symbol` root returned
nil without a value and returned `"x"` when constructed with `"x"` in both
HTML and OMML. The abstract `Paren` carrier returned nil in both formats
(`[symbols]`, exit `0`). Named subclasses such as `Paren::Lround` remain among
the `1,459` static rows.

### Generated slice shape

**HTML needs one string per symbol id.** All `1,459` static classes returned a
String, with no changes under `options[:table]`, `options[:rspace]`, or a
constructor value override (`0` varying rows on each probe). The format does
not need a descriptor or template: its base method returns the raw value
(`/home/apple/ruby_gems/plurimath-oracle/lib/plurimath/math/symbols/symbol.rb:63-65`),
and the named subclasses supply the static replacement (`[symbols]`, exit `0`).

The generated file should therefore be
`src/generated/html/symbols.ts`, a
`ReadonlyMap<string, string>` with `1,459` rows. The existing emitter already
uses that string shape for every format except MathML
(`scripts/generate-corpus.rb:3602-3647`). An HTML exception file should still
be emitted through the common path; the measured direct axes currently yield
an empty exception set, rather than permission to bypass the probe.

**OMML also needs one string per symbol id, not one XML template per class.**
All `1,459` static classes returned a String, with `0` changes under table,
`rspace`, constructor-value, and display-style probes (`[symbols]`, exit `0`).
For each of the five OMML helpers — `insert_t_tag`, `omml_nodes`, `t_tag`,
`font_style_t_tag`, and `nary_attr_value` — all `1,459` instances reported
`Math::Symbols::Symbol` as the method owner (`[symbols]`, exit `0`). The shared
helpers build the `m:r`/`m:t` structure and read the subclass's static
`to_omml_without_math_tag` string
(`/home/apple/ruby_gems/plurimath-oracle/lib/plurimath/math/symbols/symbol.rb:82-104,156-165`).

The generated file should therefore be
`src/generated/omml/symbols.ts`, also a
`ReadonlyMap<string, string>` with `1,459` rows, plus the common empty-or-
measured exception file. The OMML renderer owns one shared wrapper; generated
classes do not each own an XML template.

### One generator, two physical slices

Extend `scripts/generate-corpus.rb`; do not create an HTML generator and an
OMML generator. The existing generator already owns class discovery, symbol
ids, context probes, coverage checks, per-format emission, and
`src/generated/` provenance (`scripts/generate-corpus.rb:85-135,4469-4590`).
Its loop emits a separate directory for every entry in `SYMBOL_FORMATS`, so
adding two format arms still produces two isolated physical slices rather than
one merged bundle (`scripts/generate-corpus.rb:4581-4589`). This matches the P1
rule that format data is split to keep unrelated payloads out of each renderer
(`TODO.plan/p1-asciimath/02-symbol-data.md:5-17`).

The extension must add live HTML and OMML representation arms, live host-render
arms, and the applicable context axes. OMML's display-style argument must be
probed even though the present result has `0` variants; a missing axis cannot
discover future drift. The shared generator must continue to fail on empty
class discovery and missing corpus symbols (`scripts/generate-corpus.rb:4537-4558`).

### Two-step provenance cost

Changing `scripts/generate-corpus.rb` invalidates more than the new HTML and
OMML files. `src/generated/provenance.ts` records that file's SHA-256
(`src/generated/provenance.ts:14-34`). The core generator also hashes
`generate-corpus.rb` because it reuses its class discovery and helpers
(`scripts/generate-core-data.rb:61-67`), and the formatting generator hashes
the same dependency transitively (`scripts/generate-formatting-data.rb:58-69`).
Their committed provenance currently records that digest too
(`src/core/generated/provenance.ts:44-55` and
`src/formatting/generated/provenance.ts:41-56`).

The implementation therefore needs two commits, in this order:

1. Commit the generator source and its tests with no generated output. This
   makes the generator checkout clean and gives provenance a real source
   commit. That intermediate commit is expected to fail the active
   `payload-validation` gate because the committed provenance still names the
   old generator digest; the gate hashes the live generator and compares it to
   all three recorded provenance modules (`test/gates/payload-validation.spec.ts:45-80`).
2. From that clean commit and the clean pinned oracle, run the repository's
   three provenance-linked generators, review every diff, and commit the
   generated outputs as a second commit. The first commit then remains an
   ancestor of the generated-data commit, as `PORTING-STANDARDS.md:89-92`
   requires. Do not amend the first commit after generation: that would orphan
   the recorded source commit. This corrects the word “amend” on line 90,
   which conflicts with the same paragraph's ancestor requirement. The clean
   source and oracle inputs also satisfy `ARCHITECTURE.md:950-978`.

The second step has a wider mechanical diff: `generate-corpus.rb` owns
`corpus/` and `src/generated/`; `generate-core-data.rb` owns
`src/core/generated/`; and `generate-formatting-data.rb` owns
`src/formatting/generated/`. The `oracle-repo-regeneration` runner executes
all three in clean temporary directories and compares all four committed roots
(`scripts/gate-oracle.rb:55-68,103-157`). It normalizes only the generating
repository commit; generator SHA, oracle revision, and payload bytes remain
strict (`scripts/gate-oracle.rb:718-769`).

After the generated-data commit, rerun `node scripts/check.mjs` (all `12`
currently active class-A gates) and the class-B
`scripts/gate-oracle.rb repo --check --gem /home/apple/ruby_gems/plurimath-oracle`.
The testsuite regeneration gate is not part of this change because this
repository's generator does not write the shared testsuite corpus
(`scripts/gate-oracle.rb:72-81`).

### What the HTML data unblocks

`[html-corpus]` re-measured `90` reachable pinned cases: `35` rendered and
`55` threw (exit `0`). The first-error split was:

| current first refusal | cases | owned by this data work |
|---|---:|---|
| named symbol payload | 29 | yes — HTML symbol map |
| named fence payload | 8 | yes — the same map's `Paren::*` rows |
| BinaryFunction alias | 13 | no — function rendering |
| UnaryFunction alias | 4 | no — function rendering |
| TernaryFunction alias | 1 | no — function rendering |

The data removes the current first refusal from `37` cases, but `37` is not the
honest “now renders” count. A complete model-tree walk found a masked
`BinaryFunction::Power` blocker in `mixed-sum-of-cubes` (currently one of the
`29`) and `mixed-function-definition` (currently one of the `8`). Therefore:

- `28` of the `29` named-symbol cases have no other currently known blocker;
- `7` of the `8` named-fence cases have no other currently known blocker;
- the data makes `35` cases newly eligible to render and reclassifies `2` more
  as function-alias work;
- after the data lands, the measured known remainder is `20` cases: `15`
  BinaryFunction-alias cases (the current `13` plus the masked `2`), `4`
  UnaryFunction-alias cases, and `1` TernaryFunction-alias case
  (`[html-corpus]`, exit `0`).

This is a structural blocker measurement, not an execution with future data:
implementation was forbidden. The post-data corpus run must re-measure the
actual rendered/throw counts rather than asserting that the structural
projection came true.

OMML's corpus-unblock count is unmeasured here. The pinned `4f3579e` base has
no OMML renderer, and this task explicitly excludes the open OMML worktrees.
The measured claim is narrower: the `1,459`-row static OMML map supplies every
named symbol payload used by the shared symbol wrapper. A future run on the
landed OMML stack must count the cases it changes.

### Recommended slice order

1. **Generator contract and source commit.** Extend the existing generator's
   format arms, context/host probes, emitters, and probe-shape tests for HTML
   and OMML. Commit this clean source state first.
2. **Clean regeneration and generated-data commit.** Emit both physical symbol
   slices and refresh every provenance-linked root named above. Run
   `oracle-repo-regeneration` and the full class-A gate runner only after this
   second commit exists.
3. **HTML data consumption.** Replace only the named-symbol and named-paren
   refusals with lookups from `src/generated/html/`; re-measure the `90` cases.
   Keep the measured function aliases out of this slice.
4. **OMML data consumption.** After the OMML renderer stack lands, route its
   symbol kind through `src/generated/omml/` and keep XML construction in the
   shared wrapper. Re-measure the OMML corpus rather than borrowing HTML's
   count.
5. **HTML function aliases as a separate work item.** Measure the `15` binary,
   `4` unary, and `1` ternary corpus cases against the oracle, then implement
   those carrier paths independently of symbol data.

## Not in scope

- No generator, generated-file, renderer, gate-registry, or corpus change.
- No function-alias implementation; those paths are not symbol data.
- No change to the shared testsuite or its pin.
- No inspection or modification of the open HTML/OMML/compat/package PR
  worktrees.

## Done when

- [ ] One existing generator emits separate HTML and OMML symbol maps with
      `1,459` static rows each from the pinned oracle; HTML has `1,413` and OMML
      `1,415` distinct payloads under the measured baseline.
- [ ] The dynamic `Symbol` root stays value-driven, the abstract `Paren`
      carrier stays absent, and named `Paren::*` subclasses are present.
- [ ] HTML consumes strings directly; OMML consumes strings through one shared
      wrapper, with no generated per-class XML templates.
- [ ] The generator source commit precedes a separate generated-data commit,
      and all affected provenance files record clean, committable inputs.
- [ ] The post-data HTML corpus run reports its actual rendered/throw split;
      the function-alias remainder is tracked separately rather than credited
      to symbol data.
- [ ] `node scripts/check.mjs` exits `0` with all `12` active class-A gates, and
      `scripts/gate-oracle.rb repo --check --gem
      /home/apple/ruby_gems/plurimath-oracle` exits `0` from the clean final
      implementation tree.
