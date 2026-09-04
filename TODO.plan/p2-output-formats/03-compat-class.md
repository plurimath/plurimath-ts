# TODO 3 — Freeze the `plurimath-js` compat class

## Why

P2 needs a `plurimath-js` compatibility target before the first experimental release.
Two candidates were measured: the declarations published in
`@plurimath/plurimath@0.2.2` and the declarations generated from source head `ce297e2`.
They differ in method count, the `toMathml` signature, and one constructor-format
spelling.

**Both choices are SETTLED as of 2026-09-04: source head `ce297e2`, and
`readonly data: FormulaNode`.** See "Settled" below. The runtime contract is also wider
than one happy-path call per method
(`TODO.plan/p2-output-formats/README.md:35-49`).

This item compares the wrapper at `/home/apple/ruby_gems/plurimath-js` commit
`ce297e291703ed47f6e569c9216fc7ef454cd6ce` with the published
`@plurimath/plurimath@0.2.2` declarations (the wrapper's own
`package.json:2-12` at that commit names and versions the published package). The wrapper's Plurimath submodule is
the gitlink `68564b20de4ade7c7ea60e6c3d62352489931df0`; the current Ruby output oracle is the
separate clean checkout at `00c52783877b38f6b8e6e109f1803f96bb34fc62`.

## Settled

**Declaration target: source head `ce297e2`.** This package has published nothing, so
it carries no compatibility debt to any consumer and no reason to inherit a defect it
is not bound by. `mahtml` exists only in a TypeScript declaration, so it is
compile-time only; freezing the fixture against it would make a typo permanent in
exchange for nothing. Consequences for the fixture: seven methods including
`toUnicodemath()`, `toMathml(intent?: boolean)`, and `unicode` in the `Format` union.

`mahtml` is logged for upstream repair in `~/ruby_gems/plurimath/PORT-FINDINGS.md:96-98`,
under that file's "carried over from earlier porting work, NOT re-verified today"
section, which records it against the plurimath-js repository rather than the gem
(verified by reading the file, 2026-09-04). Upstream work is deliberately not started yet.

**`data`: expose `readonly data: FormulaNode`.** Reasoning under "The `data` property"
below.

## Scope

### Measurement commands

The TypeScript worktree was originally created from `origin/main` at
`4f3579ebe80e31d24690b89a5758a443fa0e02ad`; that transcript is history, not the current
state. The branch has since merged `origin/main` at `a1d4ce9`, which changed several
port-availability figures, so every one of them below was re-measured on 2026-09-04
against this branch HEAD:

```sh
git status --short --branch && git rev-parse HEAD
# ## docs/compat-class-scope...origin/docs/compat-class-scope
# (plus one ` M` line per file this documentation pass edited — see below)
# abc068ae59cb7b0e108144aaf8f949dbe5e1d8bf
# exit 0
```

The only modified paths during that re-measurement were this pass's own edits to
`ARCHITECTURE.md` and files under `TODO.plan/`; no source, test, script, or package file
was touched, so no figure below could have been changed by the pass that recorded it.
`origin/main` has itself advanced past `a1d4ce9` since the merge, so it is not this
branch's ancestor; the figures below are about `abc068a`, not about whatever
`origin/main` currently points at.

The JavaScript checkout is at the requested commit, but it is not clean: tracked build
and vendor files are modified or deleted, and local files are present. In particular,
the generated `dist` files are absent. The relevant tracked TypeScript inputs themselves
match `HEAD`:

```sh
git status --short --branch && git rev-parse HEAD
# ## feat/latest-plurimath-support...origin/feat/latest-plurimath-support
# M .github/workflows/pages.yml; M .gitignore; M Gemfile; M build.sh;
# D dist/.gitkeep; D vendor/...; plus local untracked files
# ce297e291703ed47f6e569c9216fc7ef454cd6ce
# exit 0

git diff --exit-code HEAD -- src/index.ts src/plurimath-opal.d.ts \
  tsconfig.json package.json
# no output
# exit 0

git ls-tree -r --name-only HEAD dist
# dist/.gitkeep
# exit 0
```

No source or artifact was restored inside that read-only checkout. The source-head
declaration below was reproduced in local-only scratch from the clean `HEAD` versions of
`src/index.ts`, `src/plurimath-opal.d.ts`, and `tsconfig.json`, using the checkout's
installed TypeScript `5.7.2`. The build script identifies this `tsc` step as the
declaration producer (`build.sh` at `HEAD`:42-49).

```sh
/home/apple/ruby_gems/plurimath-js/node_modules/.bin/tsc \
  -p .codex-context/tasks/compat-scope/js-head/tmp/tsconfig.json
nl -ba .codex-context/tasks/compat-scope/js-head/dist/index.d.ts
# ...the source-head declaration compared under "Measured declaration surfaces" below...
# exit 0

rg -c '^    to[A-Z].*\): string;$' \
  .codex-context/tasks/compat-scope/js-head/dist/index.d.ts
# 7
# exit 0
```

The maintainer independently fetched the two published declaration files with `curl`
(exit `0` for each):

- [`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts)
- [`dist/plurimath-opal.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/plurimath-opal.d.ts)

This round did not refetch them. The published columns below carry that maintainer-supplied
measurement; the source-head columns carry the clean local reproduction above.

Ruby was selected before the gem probe with
`/home/apple/.codex/skills/ruby-version-manager/detect.sh`; it reported Ruby `4.0.1`,
`mise x --`, and `VERSION_AVAILABLE=true` (exit `0`). The checkout was clean and detached
at `00c52783877b38f6b8e6e109f1803f96bb34fc62`:

```sh
git status --short --branch && git rev-parse HEAD
# ## HEAD (no branch)
# 00c52783877b38f6b8e6e109f1803f96bb34fc62
# exit 0
```

`[gem-probe]` below means this exact command. Its probe file is local-only in this
worktree and writes nothing to either oracle:

```sh
BUNDLE_GEMFILE=/home/apple/ruby_gems/plurimath-oracle/Gemfile \
  mise x -- bundle exec ruby \
  /home/apple/ruby_gems/wt-compat-scope/.codex-context/tasks/compat-scope/gem_probe.rb
# exit 0
```

The remaining labels mean these exact read-only measurements:

```sh
# [js-submodule]
git -C /home/apple/ruby_gems/plurimath-js ls-tree HEAD vendor/plurimath
# 160000 commit 68564b20de4ade7c7ea60e6c3d62352489931df0 vendor/plurimath
# exit 0

# Search both the wrapper tree and its pinned Plurimath object for the staged
# port error. Each grep returned no matches (git-grep exit 1) after its tree or
# commit was confirmed to exist (cat-file exit 0).
git -C /home/apple/ruby_gems/plurimath-js cat-file -e \
  ce297e291703ed47f6e569c9216fc7ef454cd6ce^{tree}
git -C /home/apple/ruby_gems/plurimath-js grep -n -i -E \
  'UnsupportedFormat|unsupported format' \
  ce297e291703ed47f6e569c9216fc7ef454cd6ce -- .
# cat-file exit 0; git-grep exit 1

git --git-dir=/home/apple/ruby_gems/plurimath-js/.git/modules/vendor/plurimath \
  --work-tree=/home/apple/ruby_gems/wt-compat-scope cat-file -e \
  68564b20de4ade7c7ea60e6c3d62352489931df0^{commit}
git --git-dir=/home/apple/ruby_gems/plurimath-js/.git/modules/vendor/plurimath \
  --work-tree=/home/apple/ruby_gems/wt-compat-scope grep -n -i -E \
  'UnsupportedFormat|unsupported format' \
  68564b20de4ade7c7ea60e6c3d62352489931df0 -- lib
# cat-file exit 0; git-grep exit 1

# [port-surface] — re-measured at HEAD abc068a
find src/render -mindepth 1 -maxdepth 1 -type d | wc -l
# 38
for fmt in asciimath latex mathml unicodemath html omml; do
  find src/render -mindepth 2 -maxdepth 2 -type f -name "$fmt.ts" | wc -l
done
# 38, 38, 38, 38, 38, 20 (loop order above)
# exit 0

# Cross-check of the OMML figure against tracked files rather than the working tree:
git ls-tree -r --name-only HEAD src/render | grep -c '^src/render/[^/]*/omml\.ts$'
# 20
# exit 0

# [display-census] — run against the pinned JS Plurimath submodule object
for fmt in asciimath latex mathml omml unicodemath; do
  git --git-dir=/home/apple/ruby_gems/plurimath-js/.git/modules/vendor/plurimath \
    --work-tree=/home/apple/ruby_gems/wt-compat-scope grep -n \
    "def to_${fmt}_math_zone" \
    68564b20de4ade7c7ea60e6c3d62352489931df0 -- lib | wc -l
done
# 16, 16, 16, 17, 16 (loop order above)
# exit 0

# [corpus-targets]
rg -l '^targets:$' \
  /home/apple/ruby_gems/plurimath-ts/submodules/plurimath-testsuite/corpus/asciimath/*.yaml \
  | wc -l
# 18
for target in asciimath latex mathml unicodemath html omml; do
  rg -l "^- $target$" \
    /home/apple/ruby_gems/plurimath-ts/submodules/plurimath-testsuite/corpus/asciimath/*.yaml \
    | wc -l
done
# 18, 18, 18, 18, 0, 0 (loop order above)
# exit 0

# [active-gates]
node -e 'const g=require("./gates.json"); const i=g.milestones.indexOf(g.currentMilestone); console.log(g.gates.filter(x=>x.class==="A"&&g.milestones.indexOf(x.activatesAt)<=i).length)'
# 12
# exit 0
```

### Measured declaration surfaces

Source head `ce297e2` is the selected target; the published `0.2.2` artifact is recorded
here as the rejected alternative, and as what npm consumers install today. The two
declarations compare as follows:

| surface part | published `@plurimath/plurimath@0.2.2` | source head `ce297e2` |
|---|---|---|
| class evidence | [`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts) | reproduced declaration command above (exit `0`); `src/index.ts:4-38` |
| shared class members | `data: Opal.Plurimath.Math.ParserResult`; `constructor(data: string, format: Opal.Plurimath.Math.Format)` | same (`src/index.ts:4-9`) |
| methods, in declaration order | `toAsciimath(): string`, `toLatex(): string`, `toMathml(): string`, `toHtml(): string`, `toOmml(): string`, `toDisplay(lang: string): string` | `toAsciimath(): string`, `toLatex(): string`, `toMathml(intent?: boolean): string`, `toHtml(): string`, `toOmml(): string`, `toDisplay(lang: string): string`, `toUnicodemath(): string` |
| method count | **6** | **7**; count command above returned `7` (exit `0`) |
| `toMathml` | no argument: `toMathml(): string` | optional argument: `toMathml(intent?: boolean): string`; source defaults it to `false` (`src/index.ts:19-21`) |
| constructor `Format` | `'asciimath' \| 'latex' \| 'mathml' \| 'html' \| 'mahtml' \| 'omml'` | `'asciimath' \| 'latex' \| 'mathml' \| 'html' \| 'unicode' \| 'omml'` (`src/plurimath-opal.d.ts:8`) |
| format evidence | [`dist/plurimath-opal.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/plurimath-opal.d.ts) | clean source-head fixture and generated declaration command above (exit `0`) |

These are three declaration differences: the added `toUnicodemath`, the added optional
`toMathml` argument, and `mahtml` changing to `unicode`. The port targets the source-head
column (`TODO.plan/open-decisions.md`). The published `mahtml` spelling is an upstream
defect, and fixing it upstream beat freezing that spelling here — which is the reasoning
that settled the choice.

#### Constructor formats and staged availability

Both declarations give six formats in the same order except for item five: the published
artifact says `mahtml`, and source head says `unicode` (published
[`dist/plurimath-opal.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/plurimath-opal.d.ts);
source `src/plurimath-opal.d.ts:8`). Source head passes both constructor arguments directly
to the Opal parser (`src/index.ts:7-9`). Its pinned Plurimath
submodule recognizes all six and also an internal `unitsml` parse type
(`vendor/plurimath/lib/plurimath/math.rb` at gitlink `68564b20`:13-21); `unitsml` is not
in either measured wrapper `Format` union.

On the TypeScript port at `abc068a`, `parseAsciimath` is the only input parser.
`grep -rn "export function parse" src/formats/` returns three matches (exit `0`), all
three inside `src/formats/asciimath/`: `parseAsciimath` itself plus the internal
`parseAsciimathTree` and `parseAsciimathPreprocessed`. Only `parseAsciimath` is
re-exported from a subpath entry (`src/formats/asciimath/index.ts:16-19`), and it is the
only name the package gate expects from `./asciimath`'s parse side
(`scripts/gate-package.mjs:102`). No other `src/formats/<F>/` directory contains a
`parser.ts` at all. The required first compat implementation matrix is therefore:

| order | `format` | required P2 behavior from the measured parser surface |
|---:|---|---|
| 1 | `asciimath` | construct a `FormulaNode` |
| 2 | `latex` | throw `UnsupportedFormatError("latex")` |
| 3 | `mathml` | throw `UnsupportedFormatError("mathml")` |
| 4 | `html` | throw `UnsupportedFormatError("html")` |
| 5 | `unicode` | throw `UnsupportedFormatError("unicode")` |
| 6 | `omml` | throw `UnsupportedFormatError("omml")` |

Item five is `unicode` because the declaration target is source head; the published
`mahtml` spelling is not carried into this port. The table is a staged requirement,
not a claim that the absent compat class already throws. At `abc068a` there is no
constructor to execute.

`UnsupportedFormatError` is **not** a `plurimath-js` error. `[js-submodule]` confirmed
both source objects exist; the focused search returned no matches and exit `1` in the
wrapper tree and the pinned Plurimath object. The JavaScript oracle's underlying
invalid-format error is
`Plurimath::Math::InvalidTypeError < TypeError`; its parse form lists the valid Ruby
types (`vendor/plurimath/lib/plurimath/errors/invalid_type_error.rb` at gitlink
`68564b20`:5-15, and `vendor/plurimath/lib/plurimath/math.rb`:23-35).

The staged error already belongs to this port. It extends `PlurimathError`, exposes
`readonly code = "UNSUPPORTED_FORMAT"` and `readonly format: string`, and sets the name
from its class; message text is explicitly not API (`src/core/errors.ts:1-7,16-23,39-45`).
The five refusal assertions should pin `name`, `code`, and `format`, not invent a
`plurimath-js` provenance for that type.

#### `toDisplay(lang)` is a diagnostic renderer

The wrapper delegates `lang` unchanged (`src/index.ts:31-33`). The pinned JS submodule
and the current gem both define exactly five dispatch values, in order: `omml`, `latex`,
`mathml`, `asciimath`, and `unicodemath`
(`vendor/plurimath/lib/plurimath/math/formula.rb` at gitlink `68564b20`:14-16;
`/home/apple/ruby_gems/plurimath-oracle/lib/plurimath/math/formula.rb:14-16`).
`[gem-probe]` returned that same five-item list with exit `0`.

An unrecognized language takes the invalid-type path. `[gem-probe]` measured
`Plurimath::Math::InvalidTypeError < TypeError` with this message:

```text
Invalid type provided: not_a_format. Must be one of omml, latex, mathml, asciimath, unicodemath.
```

This path is distinct from the constructor's staged `UnsupportedFormatError`: an
unrecognized language is invalid; a recognized but not-yet-implemented output format is
unsupported.

Native Ruby has a string-specific quirk. Validation accepts a recognized string by
checking `type.downcase.to_sym`, but dispatch then compares the original `type` with symbol
cases (`/home/apple/ruby_gems/plurimath-oracle/lib/plurimath/math/formula.rb:197-232`). The
earlier direct Ruby measurement returned exactly `"|_ Math zone\n"` for recognized strings;
the return template is at `formula.rb:233-236`. This is real gem behavior the compat layer
will encounter; it must not be erased by tests that exercise only symbols or only the Opal
wrapper's tracked expectation (`spec/to-display.spec.js` at `ce297e2`:3-18).

`toDisplay` does more than call `toX`. Each branch emits the raw rendered string and a
format-specific "Math zone" tree (`vendor/plurimath/lib/plurimath/math/formula.rb` at
gitlink `68564b20`:188-227). The pinned JS submodule contains these source-definition
counts, measured with `git grep ... | wc -l` (exit `0`):

| branch | `to_*_math_zone` definitions |
|---|---:|
| `asciimath` | 16 |
| `latex` | 16 |
| `mathml` | 16 |
| `omml` | 17 |
| `unicodemath` | 16 |

The port has no `toDisplay`, `math_zone`, or `Math zone` implementation: `grep` searched
the existing `src/` and `test/` directories, found no matches, and exited `1`. At
`abc068a`, the dependency boundary is therefore:

| `lang` | raw renderer files at `abc068a` | full `toDisplay` branch now |
|---|---:|---|
| `asciimath` | 38 of 38 kinds | not present; can be built only with its measured diagnostic tree |
| `latex` | 38 of 38 kinds | not present; can be built only with its measured diagnostic tree |
| `mathml` | 38 of 38 kinds | not present; can be built only with its measured diagnostic tree |
| `unicodemath` | 38 of 38 kinds | not present; can be built only with its measured diagnostic tree |
| `omml` | 20 of 38 kinds | not present, and its raw renderer is itself partial; must refuse until both land |

The kind denominator and per-format file counts come from `[port-surface]` (exit `0`).
The independent OMML review branches were not read or changed.

HTML is not a `toDisplay` branch. `toHtml()` reaches a total 38-kind dispatch table at
`abc068a`, including the measured `nary` refusal
(`TODO.plan/p2-output-formats/01-html-renderer.md:42-47,105-111`), and it is already a
published subpath with package-isolation assertions and expected-export and
forbidden-layer rows in the package gate (`01-html-renderer.md:127-130`). What HTML still
lacks for release is on the corpus and gate side, not the packaging side: byte-for-byte
corpus parity, a corpus target carrying an expectation per case, and cross-format gate
coverage (`01-html-renderer.md:115,122,124-126`).

#### The two measured `toMathml` contracts — source head is the selected one

The published declaration accepts no argument
([`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts)). Source
head adds `intent?: boolean`, defaults it to `false`, and always passes it to the underlying
method (`src/index.ts:19-21`). Source head is the selected target, so the measurements
below are the ones the port must satisfy. For AsciiMath `sum_x^y z`, `[gem-probe]` measured
default and explicit `false` as byte-identical:

```xml
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mstyle displaystyle="true">
    <mrow>
      <munderover>
        <mo>&#x2211;</mo>
        <mi>x</mi>
        <mi>y</mi>
      </munderover>
      <mi>z</mi>
    </mrow>
  </mstyle>
</math>
```

With `true`, the same probe measured the intent-bearing structure:

```xml
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mstyle displaystyle="true">
    <mrow intent=":sum(x,y,$naryand)">
      <munderover>
        <mo>&#x2211;</mo>
        <mi>x</mi>
        <mi>y</mi>
      </munderover>
      <mrow arg="naryand">
        <mi>z</mi>
      </mrow>
    </mrow>
  </mstyle>
</math>
```

The tracked JS test independently pins the semantic split: omitted intent has no
` intent=`, while `true` adds the sum intent and argument metadata and differs from the
default (`spec/to-mathml-intent.spec.js:3-20`).

The port cannot yet satisfy the source-head argument. Its current `MathmlOptions` omits
`intent`, and the renderer rejects both `{ intent: false }` and `{ intent: true }` with a
named `RenderError` rather than ignoring either value
(`src/formats/mathml/renderer.ts:38-69,78-104`; `TODO.plan/deferred.md:240-255`). A compat
wrapper can preserve omitted/false output by not forwarding a false option, but
`toMathml(true)` must refuse until the intent pipeline lands. Runtime tests must therefore
cover all three calls the selected declaration admits: omitted, explicit `false`, and
`true`.

#### The `data` property — SETTLED

The measured class declarations expose public writable
`data: Opal.Plurimath.Math.ParserResult`; source head assigns the parser result in the
constructor (`src/index.ts:4-9`), and the published declaration is visible in
[`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts). The object is an
Opal runtime value, so this port cannot reproduce its type or behavior
(`TODO.plan/open-decisions.md:38-42`; `ARCHITECTURE.md:386-391`).

**Settled 2026-09-04: expose name-compatible `readonly data: FormulaNode`.** Same
property name, this port's model behind it. A consumer that READS `.data` gets something
meaningful; one that WRITES it breaks under either option, so exposing it strictly
dominates omitting it. `ARCHITECTURE.md` §11 already recommended this.

The rejected option was omitting `data` and documenting the surface as method-exact
rather than object-exact.

The declaration fixture records this result.

### Declaration fixture strategy

Freeze the source-head declaration target from the built package, not only from `src/`.
The package gate already builds `dist` (`scripts/gate-package.mjs:178-182`), loads ESM and
CJS and compares exact named exports against `EXPECTED_EXPORTS` (`:99-107`, `:190-219`),
and packs the package for publint and attw (`:293-301`). Reuse that artifact-side gate:

1. Check in one canonical compat declaration fixture set under `test/fixtures/compat/`.
   Both decisions it depends on are settled, so it contains `readonly data: FormulaNode`,
   the constructor, the seven source-head methods, and the `unicode` spelling in the
   `Format` union.
2. In `scripts/gate-package.mjs`, parse both `dist/index.d.ts` and `dist/index.d.cts` with
   the installed TypeScript compiler, resolve the default-exported class, print only its
   public property/constructor/method declaration to a canonical form, and compare that
   form byte-for-byte with the fixture. Parsing avoids false failures from tsdown's
   surrounding re-export layout; printing every class member catches additions as well
   as removals.
3. Fail if either declaration file, the default export, or the class-member set is empty.
   This follows the repository's existing anti-vacuity pattern: gate selections must
   resolve to declared files, and active empty selections fail
   (`test/gates/gate-selection.spec.ts:93-149`).
4. Add focused negative tests for a renamed parameter, changed optional marker, changed
   return type, added method/property, and missing CJS declaration. Each damaged fixture
   must make the check fail, so the gate proves the failure classes it claims to cover.
5. Keep runtime behavior separate from the declaration fixture: six constructor rows
   using the `unicode` spelling; five recognized `toDisplay` rows plus the invalid row,
   with the native-Ruby string quirk recorded separately from Opal-wrapper expectations;
   the `toMathml` call matrix of omitted, explicit `false`, and `true`; and one call for
   every other source-head method. Assert the structured port error fields for staged
   refusals.

An assignability-only TypeScript test is insufficient: structural typing can accept
extra members, and parameter names do not participate in assignability. The artifact
declaration comparison is what freezes names, optionality, return types, member count,
and the `readonly data: FormulaNode` member together.

### What still blocks the first `0.x`

Beyond writing the class itself, the measured blockers are:

- ~~**Choose `data`.**~~ Settled: `readonly data: FormulaNode`.
- ~~**Choose the declaration target.**~~ Settled: source head `ce297e2`, so seven
  methods, `toMathml(intent?: boolean)`, and `unicode` rather than `mahtml`.
- **Build and pin the diagnostic display layer.** The port has none of the five
  `toDisplay` branches today; the JS source census above found 16/16/16/17/16
  format-specific definitions, so this is not a one-switch wrapper.
- **Land MathML intent.** The selected declaration target carries the argument, so this
  is unconditional: `toMathml(true)` is still a named refusal
  (`TODO.plan/deferred.md:240-255`).
- **Finish OMML.** `abc068a` has `20` OMML renderer files across `38` kinds, and P2
  requires corpus parity, cross-format gates, `/omml`, and package isolation
  (`TODO.plan/p2-output-formats/02-omml-renderer.md:270-293`).
- **Finish HTML's release surface.** `abc068a` has HTML's total kind dispatch, and `/html`
  is already a published subpath with package-isolation assertions
  (`TODO.plan/p2-output-formats/01-html-renderer.md:127-130`). What HTML still lacks is
  byte-for-byte corpus parity, a corpus target carrying an expectation per case, and
  cross-format gate coverage (`01-html-renderer.md:115,122,124-126`).
- **Add both output targets to the corpus.** The worktree gitlink and the initialized
  read-only primary submodule both resolve to
  `d2f1bea40c66c7018ede37faea0be51b307bf3af`. Across the `18` positive payloads, a
  `[corpus-targets]` measured `asciimath=18`, `latex=18`, `mathml=18`,
  `unicodemath=18`, `html=0`, and `omml=0` (exit `0`).
- **Set the publish identity and release metadata.** The package remains
  `@plurimath/plurimath-ts`, version `0.0.0`, and `private: true`
  (`package.json:2-4`); the distinct npm name and release line are a maintainer decision
  before first publish (`TODO.plan/open-decisions.md:32-34`).
- **Complete packaging review and sign-off.** P2's exit criteria require package
  isolation for new subpaths, packaging review, publication, and a resolved review round
  (`TODO.plan/p2-output-formats/README.md:91-93`). `/html` has landed: the export map
  carries it (`package.json:60-69`), and it has rows in both the package gate's
  expected-export and forbidden-layer tables (`scripts/gate-package.mjs:103`, `:147`).
  `/omml` has none of that — no export-map entry (`package.json:29-101`) and no row in
  either table (`scripts/gate-package.mjs:99-107`, `:140-153`), and a subpath absent from
  those tables is silently skipped by both assertions.

`[active-gates]` verified the supplied count: the registry marks `12` class-A gates active
at P1-completion (exit `0`). That is a registry measurement, not a green-gate claim; the
gates were not run in this scope. P2 still needs the new behavior to enter those gates
where the plan requires it. UnitsML, the `/core` lock, and the other five input parsers
are not P2 release blockers; the architecture defers takeover completeness to `1.0`
(`ARCHITECTURE.md:1129-1133`) and explicitly says the UnitsML decision "does not affect
P0–P2" (`ARCHITECTURE.md:1135-1142`).

### Explicitly unmeasured

- The published JavaScript runtime was read but not executed. Both `dist/index.cjs` (the
  package's `main`) and `dist/index.js` at `@plurimath/plurimath@0.2.2` define the same
  six methods as the published declarations, and `grep -c unicodemath` returns `0` against
  each. So the published `.d.ts` is not merely stale over a richer runtime: the shipped
  artifact genuinely lacks `toUnicodemath`. Runtime *behaviour* was still not exercised,
  so byte equivalence remains unestablished.
- The JavaScript runtime was not rebuilt. Therefore the six constructor cases and all
  five `toDisplay` cases were not re-executed; only the tracked AsciiMath display test is
  present (`spec/to-display.spec.js:3-18`). The thrown Opal error object's JavaScript
  property shape also remains unmeasured. Source, tracked tests, and the clean Ruby probe
  support only the narrower claims stated above.
- The in-review and in-flight OMML worktrees were not inspected, modified, or used as
  evidence. All port-availability statements are about this branch's HEAD `abc068a`,
  which merged `origin/main` at `a1d4ce9`. `origin/main` has advanced since, so it is not
  this branch's ancestor and these figures are not claims about its current tip.
- No package build, full test suite, full gate run, registry metadata lookup, or package
  publish was performed for this documentation-only scope. The eventual package name
  remains unmeasured.

## Done when

- [x] The declaration target and the `data` result are chosen: source head `ce297e2`
      and `readonly data: FormulaNode` (2026-09-04).
- [ ] The fixture records both decisions exactly — seven methods,
      `toMathml(intent?: boolean)`, `unicode` rather than `mahtml`, and the `data`
      member.
- [ ] The built ESM and CJS declarations match the canonical fixture and the gate has
      non-vacuity and negative proofs for member, name, optionality, and return-type drift.
- [ ] All six constructor formats are asserted in the source-head declaration order:
      `asciimath` constructs; `latex`, `mathml`, `html`, `unicode`, and `omml` raise the
      port's structured `UnsupportedFormatError` until their parsers land.
- [ ] `toDisplay` matches the JS oracle for `omml`, `latex`, `mathml`, `asciimath`, and
      `unicodemath`, and the invalid language path matches the measured invalid-type
      behavior. The oracle fixtures also record the native-Ruby recognized-string result
      `"|_ Math zone\n"` and do not substitute that result for an Opal-wrapper measurement.
- [ ] `toMathml()`, `toMathml(false)`, and `toMathml(true)` produce the measured default,
      false, and intent-bearing results.
- [ ] `toAsciimath`, `toLatex`, `toHtml`, `toOmml`, and `toUnicodemath` each have a
      runtime assertion through a compat instance created from AsciiMath.
- [ ] HTML and OMML corpus targets are nonempty and complete per payload; their
      cross-format and package-isolation gates pass against built artifacts.
- [ ] The root package exports the default class under ESM and CJS, the real packed
      artifact passes publint and attw, and review leaves no valid implementable finding
      unresolved.
