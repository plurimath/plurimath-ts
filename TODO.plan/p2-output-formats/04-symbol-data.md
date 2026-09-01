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

The branch is based on the requested pinned commit, and the oracle was clean
and detached at `00c52783877b38f6b8e6e109f1803f96bb34fc62`. The first command
below was run before this document existed, so its recorded output names the
commit the measurement started from; this file's own commits sit on top of it,
and re-running the command today reports a later hash.

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

The oracle pins no Ruby version, so the probe runs on whatever `ruby -v`
resolves to, and that must be the interpreter its bundle was installed
against. Check it before probing; an older Ruby that still resolves first on
`PATH` does not announce itself, it fails inside `bundle exec` with
`Bundler::GemNotFound`:

```sh
ruby -v
# ruby 4.0.1 (2026-01-13 revision e04267a14b) +PRISM [x86_64-linux]
# exit 0
```

Where a version manager owns the interpreter, select it explicitly rather than
trusting `PATH`. Here `mise x -- ruby -v` reports the same `4.0.1` (exit `0`),
so the plain invocations below are the ones actually used.

This change commits the probes under `scripts/probes/`, so every figure below
can be re-derived from this revision plus the pinned oracle. None of them ships, none
runs in a gate, and none writes to `corpus/` or `src/generated/`. The labels
below mean these exact commands, with `<ts>` the plurimath-ts checkout and
`<oracle>` the pinned gem checkout:

```sh
# [definitions], from the clean oracle; each pipeline used `bash -o pipefail`.
# These use grep rather than ripgrep so they need nothing beyond coreutils.
# `lib/` holds no ignored or untracked files (`git status --short --ignored
# lib` is empty), so the `rg -o` form they replace scans the same files.
grep -rhoE '^[[:space:]]*def to_html\b' lib | wc -l
# 1492
# exit 0

grep -rhoE '^[[:space:]]*def to_omml_without_math_tag\b' lib | wc -l
# 1559
# exit 0

grep -rhoE '^[[:space:]]*def to_html\b' lib/plurimath/math/symbols | wc -l
# 1461
# exit 0

grep -rhoE '^[[:space:]]*def to_omml_without_math_tag\b' lib/plurimath/math/symbols | wc -l
# 1460
# exit 0

# [symbols], run from the clean oracle. Writes the counts and the canonical
# row order, so [generated-tables] can pin against it.
cd <oracle>
BUNDLE_GEMFILE=$PWD/Gemfile bundle exec ruby -Ilib \
  <ts>/scripts/probes/symbol-surface.rb > /tmp/symbol-surface.json
# exit 0

# [generated-tables], run from the plurimath-ts checkout
cd <ts>
out=$(mktemp -d)
node_modules/.bin/esbuild scripts/probes/generated-tables.mjs \
  --bundle --platform=node --format=esm --outfile="$out/probe.mjs"
# exit 0
node "$out/probe.mjs" --expect-ids /tmp/symbol-surface.json
# exit 0

# [html-corpus], run from the plurimath-ts checkout
cd <ts>
out=$(mktemp -d)
node_modules/.bin/esbuild scripts/probes/html-corpus.mjs \
  --bundle --platform=node --format=esm --outfile="$out/probe.mjs"
# exit 0
node "$out/probe.mjs"
# exit 0

# [dist-sizes], the built-artifact baseline the isolation done-conditions
# below compare against. Run from the plurimath-ts checkout. Needs no esbuild
# bundling of its own; it imports esbuild to weigh each subpath.
cd <ts>
pnpm build
# exit 0
node scripts/probes/dist-sizes.mjs
# exit 0
```

`[dist-sizes]` reports two numbers per subpath and module system. `entryBytes`
is the entry file alone, which is what `wc -c dist/latex.js` would say and is
not the consumer's cost: tsdown puts the core layer in a shared chunk, so
`dist/latex.js` names roughly a third of its own weight in a
`from "./core-<hash>.js"` line. `closureBytes` is the entry plus every chunk
it pulls, measured the way `scripts/gate-package.mjs` inspects the same
artifacts — re-bundle the built entry with esbuild and weigh the result. It is
the closure numbers that the budget below is written against. (Tree-shaking
means a closure can come in under its own entry file, as UnicodeMath's does.)

| subpath | ESM entry | ESM closure | CJS entry | CJS closure |
|---|---:|---:|---:|---:|
| `.` | 1,620 | 91,849 | 2,532 | 115,435 |
| `./core` | 1,620 | 91,849 | 2,532 | 115,434 |
| `./asciimath` | 471,791 | 476,368 | 472,403 | 501,661 |
| `./latex` | 121,524 | 149,563 | 122,028 | 194,952 |
| `./mathml` | 237,118 | 271,333 | 237,811 | 316,629 |
| `./unicodemath` | 208,705 | 202,367 | 209,200 | 247,245 |

Bytes, from `[dist-sizes]` (exit `0`) against the build of this revision. The
same run reports the unminified source tables that feed them:
`asciimath` `50,976`, `latex` `48,699`, `mathml` `73,906`, `unicodemath`
`35,933`.

`[generated-tables]` and `[html-corpus]` import TypeScript sources, which is
why each is bundled with the repository's own `esbuild` before it runs. The
bundle goes to a fresh `mktemp -d`, not a fixed `/tmp` name, so two runs
cannot read each other's output. `[dist-sizes]` needs no bundling: it imports
`esbuild` and weighs the already-built artifacts. No probe is reachable from
`src/`, so none enters a published bundle.

`[symbols]` (`scripts/probes/symbol-surface.rb`) recursively loaded the
oracle's model classes, instantiated every symbol class, and called the live
render methods. It did not parse source method bodies or invoke a generator.
It also echoes `ruby_version` and the oracle's `git rev-parse HEAD`, so a run
carries its own provenance. `[generated-tables]`
(`scripts/probes/generated-tables.mjs`) read the four committed P1 maps;
`--expect-ids` compares their key order against the `static_symbol_ids` list
`[symbols]` emitted, and the probe exits non-zero when an order differs.
`[html-corpus]` (`scripts/probes/html-corpus.mjs`) rebuilt all reachable
pinned models with the existing corpus reader, called the current HTML
renderer, and separately walked each model for blockers that the first thrown
error could mask. `[dist-sizes]` (`scripts/probes/dist-sizes.mjs`) weighed the
built artifacts; it reads `package.json#exports`, so a new subpath is
enumerated the moment it is published.

All four P1 maps key in one identical order of `1,459` symbol ids, and that
order is the oracle's own class order (`[generated-tables]`, exit `0`).

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

| format | static rows | distinct payloads | rows duplicating an earlier payload | most rows sharing one payload | payload shape |
|---|---:|---:|---:|---:|---|
| AsciiMath | 1,459 | 1,447 | 12 | 2 | string |
| LaTeX | 1,459 | 1,425 | 34 | 3 | string |
| MathML | 1,459 | 1,421 | 38 | 3 | `{ tag, text }` descriptor |
| UnicodeMath | 1,459 | 1,406 | 53 | 3 | string |
| HTML | 1,459 | 1,413 | 46 | 3 | string |
| OMML | 1,459 | 1,415 | 44 | 3 | string |

Those last two columns bound any deduplication scheme, so the decision is
stated as numbers rather than as a judgement. HTML repeats a
payload on `46` of its `1,459` rows and OMML on `44`; in neither format is any
one payload shared by more than `3` ids (`[symbols]`, exit `0`). Interning the
repeats would therefore replace at most `46` and `44` string literals with
indirections and could not collapse any group larger than three. The slices
stay one literal per id, matching what the four P1 formats already emit; a
future measurement that moves those columns is the reason to revisit it.

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

### Isolation is a byte measurement, not only a source rule

Two isolated directories under `src/generated/` are a source guarantee. What
ships is a separate question, and the scope above does not answer it. The
`package-isolation` gate inspects a subpath's built bundle for modules it must
not contain (`scripts/gate-package.mjs`); it asserts no size at all, and it has
never run against an HTML or OMML subpath because neither exists. Its own
`EXPECTED_EXPORTS` and `FORBIDDEN` tables are hand-listed, and a subpath absent
from them silently skips both assertions — so adding the formats to
`package.json#exports` without adding them there buys a green gate that proves
nothing.

The cost is not small and it does not tree-shake away. A `ReadonlyMap` of
`1,459` literals is atomic for a bundler: a renderer that reads one row pulls
in the whole table, and `"sideEffects": false` cannot drop rows it does not
use. The order of magnitude is already on disk. The four committed symbol
tables are `35,933` to `73,906` bytes of unminified source each, and the two
closest shipped analogues measure `149,563` bytes of ESM closure for `./latex`
(a string map, no XML layer) and `271,333` for `./mathml` (a descriptor map
plus the XML serializer) (`[dist-sizes]`, exit `0`).

The budget, per subpath, against the ESM closure:

- `./html` at or below `163,840` bytes (`160` KiB). LaTeX is the right
  analogue — a plain string map, `1,425` distinct payloads against HTML's
  `1,413` — and its measured `149,563` leaves that ceiling about `10` percent
  of headroom.
- `./omml` at or below `286,720` bytes (`280` KiB). MathML is the analogue
  that carries an XML layer, and its measured `271,333` sets the same margin.

Landing above a ceiling is not forbidden, but it is a decision rather than a
rounding error: the measured number goes into this file as an accepted cost
before the slice ships, never left unstated. No existing subpath may grow at
all, since neither new table belongs in any of them.

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
   commit. **This intermediate commit is deliberately non-green.** Two gates
   are expected to fail on it, and both must be listed, because a run that
   reports only one of them is a run that stopped early:

   - `payload-validation` (class A) fails because the committed provenance
     still names the old generator digest; the gate hashes the live generator
     and compares it to all three recorded provenance modules
     (`test/gates/payload-validation.spec.ts:45-80`).
   - `oracle-repo-regeneration` (class B) fails because the updated generator
     emits the two new HTML and OMML slices while the committed generated
     roots still hold only the old four. The runner executes
     `generate-corpus.rb` from a clean snapshot and diffs `corpus/` and
     `src/generated/` against what is committed, so the two unaccounted-for
     directories are a non-empty diff
     (`scripts/gate-oracle.rb:103-157`).

   Those two are the failures this commit's own mechanics guarantee. A third
   is avoidable and must be avoided: any generator test added here has to pass
   against a tree with no HTML or OMML slice in it, or `unit-tests` fails as
   well and the intermediate commit stops being diagnosable. Assert on the
   generator's probe shapes, not on files step 2 creates.

   Because this commit cannot pass its own gates, it must never be pushed or
   merged on its own. It exists only as the ancestor the generated-data commit
   records, and it reaches a remote only together with that commit.
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
   Keep the measured function aliases out of this slice. Because this is the
   commit where the table first reaches a published bundle, it is also where
   `package-isolation` is re-run and the `[dist-sizes]` measurement is
   repeated: the built cost is recorded here, not deferred.
4. **OMML data consumption.** After the OMML renderer stack lands, route its
   symbol kind through `src/generated/omml/` and keep XML construction in the
   shared wrapper. Re-measure the OMML corpus rather than borrowing HTML's
   count, and re-run the same isolation and size measurements for the OMML
   subpath.
5. **HTML function aliases as a separate work item.** Measure the `15` binary,
   `4` unary, and `1` ternary corpus cases against the oracle, then implement
   those carrier paths independently of symbol data.

## Not in scope

- No generator, generated-file, renderer, gate-registry, or corpus change.
  The probes committed under `scripts/probes/` are measurement tools: not
  registered in `gates.json`, not imported from `src/`, and they write
  nothing under `corpus/` or `src/generated/`.
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
- [ ] `package-isolation` runs again *after* the HTML renderer imports
      `src/generated/html/` and again after OMML imports `src/generated/omml/`
      — not only on the generated-data commit, where neither table is reachable
      from any subpath and the gate would prove nothing.
- [ ] Each new subpath appears in both `EXPECTED_EXPORTS` and `FORBIDDEN` in
      `scripts/gate-package.mjs`; a subpath missing from those tables skips
      both assertions silently. `./html` forbids `generated/omml/` and every
      P1 format's modules; `./omml` forbids `generated/html/` and the same P1
      set. Each list is proven to bite by a run that fails when the forbidden
      table is imported on purpose.
- [ ] `scripts/probes/dist-sizes.mjs` is re-run before and after each
      consumption commit, and the ESM and CJS closure bytes for every published
      subpath are recorded in this file beside the baseline table above. No
      existing subpath grows.
- [ ] `./html`'s ESM closure is at or below `163,840` bytes and `./omml`'s at
      or below `286,720`, or the measured overage is written into this file as
      an accepted cost with the numbers that justify it. An unrecorded overage
      blocks the slice.
- [ ] The figures above are re-derived from `scripts/probes/` against the
      pinned oracle before the generator work starts. Drift is a change in the
      oracle to be investigated, never a number to round in this file.
- [ ] `node scripts/check.mjs` exits `0` with all `12` active class-A gates, and
      `scripts/gate-oracle.rb repo --check --gem
      /home/apple/ruby_gems/plurimath-oracle` exits `0` from the clean final
      implementation tree.
