# TODO 3 — Freeze the `plurimath-js` compat class

## Why

P2 needs the published `plurimath-js` class surface before the first experimental
release. The class is small, but its runtime contract is not: construction has six
format branches, `toDisplay` reaches a separate diagnostic tree for five output formats,
and `toMathml` has the surface's only optional argument. A declaration match plus one
happy-path call per method would leave those branches unfrozen
(`TODO.plan/p2-output-formats/README.md:25-37`).

This item freezes the wrapper at `/home/apple/ruby_gems/plurimath-js` commit
`ce297e291703ed47f6e569c9216fc7ef454cd6ce`, package
`@plurimath/plurimath@0.2.2` (`package.json:2-12`). The wrapper's Plurimath submodule is
the gitlink `68564b20de4ade7c7ea60e6c3d62352489931df0`; the current Ruby output oracle is the
separate clean checkout at `00c52783877b38f6b8e6e109f1803f96bb34fc62`.

## Scope

### Measurement commands

The TypeScript worktree was created from the requested `origin/main` revision:

```sh
git status --short --branch && git rev-parse HEAD
# ## docs/compat-class-scope...origin/main
# 4f3579ebe80e31d24690b89a5758a443fa0e02ad
# exit 0
```

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

No source or artifact was restored inside that read-only checkout. The declaration below
was reproduced in local-only scratch from the clean `HEAD` versions of `src/index.ts`,
`src/plurimath-opal.d.ts`, and `tsconfig.json`, using the checkout's installed TypeScript
`5.7.2`. The build script identifies this `tsc` step as the declaration producer
(`build.sh` at `HEAD`:42-49).

```sh
/home/apple/ruby_gems/plurimath-js/node_modules/.bin/tsc \
  -p .codex-context/tasks/compat-scope/js-head/tmp/tsconfig.json
nl -ba .codex-context/tasks/compat-scope/js-head/dist/index.d.ts
# ...the declaration reproduced under "Exact ABI" below...
# exit 0

rg -c '^    to[A-Z].*\): string;$' \
  .codex-context/tasks/compat-scope/js-head/dist/index.d.ts
# 7
# exit 0
```

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

# [port-surface]
find src/render -mindepth 1 -maxdepth 1 -type d | wc -l
# 38
for fmt in asciimath latex mathml unicodemath html omml; do
  find src/render -mindepth 2 -maxdepth 2 -type f -name "$fmt.ts" | wc -l
done
# 38, 38, 38, 38, 38, 0 (loop order above)
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

### Measured surface

#### Exact ABI

The declaration generated from the clean tracked source is:

```ts
import "./plurimath-opal.js";
export default class Plurimath {
    data: Opal.Plurimath.Math.ParserResult;
    constructor(data: string, format: Opal.Plurimath.Math.Format);
    toAsciimath(): string;
    toLatex(): string;
    toMathml(intent?: boolean): string;
    toHtml(): string;
    toOmml(): string;
    toDisplay(lang: string): string;
    toUnicodemath(): string;
}
```

That is one constructor and **seven methods**, not an inherited count: the source defines
the class and every member directly (`src/index.ts:4-37`), the reproduced declaration
lists the seven return types, and the count command above returned `7` with exit `0`.
The exact callable surface is:

| member | parameters | return |
|---|---|---|
| `constructor` | required `data: string`; required `format: Opal.Plurimath.Math.Format` | instance |
| `toAsciimath` | none | `string` |
| `toLatex` | none | `string` |
| `toMathml` | optional `intent?: boolean`, default `false` | `string` |
| `toHtml` | none | `string` |
| `toOmml` | none | `string` |
| `toDisplay` | required `lang: string` | `string` |
| `toUnicodemath` | none | `string` |

Parameter names and optionality come from the wrapper source (`src/index.ts:7-35`);
return types and the optional marker come from the reproduced declaration above. No
other method has an optional argument.

#### Constructor formats and staged availability

The wrapper's declaration gives the six formats in this exact order
(`src/plurimath-opal.d.ts:8`):

1. `asciimath`
2. `latex`
3. `mathml`
4. `html`
5. `unicode`
6. `omml`

The spelling is `unicode`, not `unicodemath`. The wrapper passes both constructor
arguments directly to the Opal parser (`src/index.ts:7-9`). Its pinned Plurimath
submodule recognizes all six and also an internal `unitsml` parse type
(`vendor/plurimath/lib/plurimath/math.rb` at gitlink `68564b20`:13-21); `unitsml` is not
in the wrapper's `Format` union.

On the TypeScript port at `4f3579e`, only `parseAsciimath` exists
(`src/formats/asciimath/index.ts:10-19`); a search for exported `parseX` entry points found
that one parser and exited `0`. The required first compat implementation matrix is
therefore:

| order | `format` | required P2 behavior from the measured parser surface |
|---:|---|---|
| 1 | `asciimath` | construct a `FormulaNode` |
| 2 | `latex` | throw `UnsupportedFormatError("latex")` |
| 3 | `mathml` | throw `UnsupportedFormatError("mathml")` |
| 4 | `html` | throw `UnsupportedFormatError("html")` |
| 5 | `unicode` | throw `UnsupportedFormatError("unicode")` |
| 6 | `omml` | throw `UnsupportedFormatError("omml")` |

This table is a staged requirement, not a claim that the absent compat class already
throws. At `4f3579e` there is no constructor to execute.

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
and the current gem both define the dispatch list, in order, as `omml`, `latex`,
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

The port has no `toDisplay`, `math_zone`, or `Math zone` implementation: `rg` searched
the existing `src/` and `test/` directories, found no matches, and exited `1`. At
`4f3579e`, the dependency boundary is therefore:

| `lang` | raw renderer files on main | full `toDisplay` branch now |
|---|---:|---|
| `asciimath` | 38 of 38 kinds | not present; can be built only with its measured diagnostic tree |
| `latex` | 38 of 38 kinds | not present; can be built only with its measured diagnostic tree |
| `mathml` | 38 of 38 kinds | not present; can be built only with its measured diagnostic tree |
| `unicodemath` | 38 of 38 kinds | not present; can be built only with its measured diagnostic tree |
| `omml` | 0 of 38 kinds | must refuse on this branch |

The kind denominator and per-format file counts come from `[port-surface]` (exit `0`).
The independent OMML review branches were not read or changed.

HTML is not a `toDisplay` branch. `toHtml()` can reach a total 38-kind dispatch table on
main, including the measured `nary` refusal (`TODO.plan/p2-output-formats/01-html-renderer.md:42-47,105-111`),
but HTML is not release-complete: its corpus target, cross-format gates, and package
subpath remain unchecked (`01-html-renderer.md:113-130`).

#### `toMathml(intent?)`

The wrapper defaults `intent` to `false` and always passes it to the underlying method
(`src/index.ts:19-21`). For AsciiMath `sum_x^y z`, `[gem-probe]` measured default and
explicit `false` as byte-identical:

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
default (`spec/to-mathml-intent.spec.js:3-19`).

The port cannot yet satisfy both settings. Its current `MathmlOptions` omits `intent`,
and the renderer rejects any defined `intent`, including `false`, by name
(`src/formats/mathml/renderer.ts:38-69,78-104`; `TODO.plan/deferred.md:240-255`). A compat
wrapper can preserve omitted/false output by not forwarding a false option, but
`toMathml(true)` must refuse until the intent pipeline lands. Runtime tests must cover
omitted, explicit `false`, and `true`; otherwise the default-value equivalence is not
frozen.

#### The unresolved `data` property

The published source declares public writable
`data: Opal.Plurimath.Math.ParserResult` and assigns the parser result in the constructor
(`src/index.ts:4-9`); the reproduced declaration retains that property. The object is an
Opal runtime value, so this port cannot reproduce its type or behavior
(`TODO.plan/open-decisions.md:34-40`; `ARCHITECTURE.md:367-372`).

Do not decide this in implementation. The maintainer's two recorded options are:

1. expose name-compatible `readonly data: FormulaNode`; or
2. omit `data` and document that the compat surface is method-exact, not object-exact.

The declaration fixture must include the chosen result. Until the maintainer chooses,
the fixture can freeze the constructor and seven methods but cannot honestly freeze the
complete public instance shape.

### Declaration fixture strategy

Freeze the ABI from the built package, not only from `src/`. The package gate already
builds `dist`, loads ESM and CJS, compares exact named exports, and packs the package for
publint/attw (`scripts/gate-package.mjs:91-132,194-207`). Reuse that artifact-side gate:

1. Check in one canonical compat declaration fixture under `test/fixtures/compat/` after
   the `data` decision. It contains the default class's property, constructor, and seven
   method declarations in the exact order and spelling above.
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
5. Keep runtime behavior separate from the declaration fixture: six constructor rows;
   five valid `toDisplay` rows plus the invalid row; omitted/false/true `toMathml`; and
   one call for each of the other five methods. Assert the structured port error fields
   for staged refusals.

An assignability-only TypeScript test is insufficient: structural typing can accept
extra members, and parameter names do not participate in assignability. The artifact
declaration comparison is what freezes names, optionality, return types, member count,
and the eventual `data` choice together.

### What still blocks the first `0.x`

Beyond writing the class itself, the measured blockers are:

- **Choose `data`.** The decision is due before P2 and remains open
  (`TODO.plan/open-decisions.md:9-15,34-40`).
- **Build and pin the diagnostic display layer.** The port has none of the five
  `toDisplay` branches today; the JS source census above found 16/16/16/17/16
  format-specific definitions, so this is not a one-switch wrapper.
- **Land MathML intent.** `toMathml(true)` is the ABI's only optional branch and is still
  a named refusal (`TODO.plan/deferred.md:240-255`).
- **Finish OMML.** Main has `0` OMML renderer files across `38` kinds, and P2 requires
  corpus parity, cross-format gates, `/omml`, and package isolation
  (`TODO.plan/p2-output-formats/02-omml-renderer.md:270-293`).
- **Finish HTML's release surface.** Main has its total kind dispatch, but HTML still
  lacks corpus expectations, cross-format gate coverage, `/html`, and package isolation
  (`TODO.plan/p2-output-formats/01-html-renderer.md:113-130`).
- **Add both output targets to the corpus.** The worktree gitlink and the initialized
  read-only primary submodule both resolve to
  `d2f1bea40c66c7018ede37faea0be51b307bf3af`. Across the `18` positive payloads, a
  `[corpus-targets]` measured `asciimath=18`, `latex=18`, `mathml=18`,
  `unicodemath=18`, `html=0`, and `omml=0` (exit `0`).
- **Set the publish identity and release metadata.** The package remains
  `@plurimath/plurimath-ts`, version `0.0.0`, and `private: true`
  (`package.json:2-4`); the distinct npm name and release line are a maintainer decision
  before first publish (`TODO.plan/open-decisions.md:28-32`).
- **Complete packaging review and sign-off.** P2's exit criteria require package
  isolation for new subpaths, packaging review, publication, and a resolved review round
  (`TODO.plan/p2-output-formats/README.md:65-77`). The current package export map has no
  `/html` or `/omml` entry (`package.json:29-90`), and the package gate's expected-export
  and forbidden-layer tables have neither format (`scripts/gate-package.mjs:56-83`).

`[active-gates]` verified the supplied count: the registry marks `12` class-A gates active
at P1-completion (exit `0`). That is a registry measurement, not a green-gate claim; the
gates were not run in this scope. P2 still needs the new behavior to enter those gates
where the plan requires it. UnitsML, the `/core` lock, and the other five input parsers
are not P2 release blockers; the architecture defers takeover completeness to `1.0` and
explicitly says the UnitsML decision does not affect P0-P2
(`ARCHITECTURE.md:1088-1106`).

### Explicitly unmeasured

- The published `dist/index.cjs` and `dist/index.d.ts` could not be read or executed from
  the supplied JS checkout because `dist/` is absent. The declaration here is a fresh
  reproduction from clean tracked source, not a claim that the missing published file
  was inspected.
- The JavaScript runtime was not rebuilt. Therefore the six constructor cases and all
  five `toDisplay` cases were not re-executed; only the tracked AsciiMath display test is
  present (`spec/to-display.spec.js:3-16`). The thrown Opal error object's JavaScript
  property shape also remains unmeasured. Source, tracked tests, and the clean Ruby probe
  support only the narrower claims stated above.
- The in-review and in-flight OMML worktrees were not inspected, modified, or used as
  evidence. All port-availability statements are about `origin/main` at `4f3579e`.
- No package build, full test suite, full gate run, npm registry lookup, or package publish
  was performed for this documentation-only scope. Current remote availability and the
  eventual package name are unmeasured.

## Done when

- [ ] The maintainer chooses `readonly data: FormulaNode` or a documented absence, and
      the declaration fixture records that choice without changing the seven-method ABI.
- [ ] The built ESM and CJS declarations match the canonical fixture and the gate has
      non-vacuity and negative proofs for member, name, optionality, and return-type drift.
- [ ] All six constructor formats are asserted in declaration order: `asciimath`
      constructs; `latex`, `mathml`, `html`, `unicode`, and `omml` raise the port's
      structured `UnsupportedFormatError` until their parsers land.
- [ ] `toDisplay` matches the JS oracle for `omml`, `latex`, `mathml`, `asciimath`, and
      `unicodemath`, and the invalid language path matches the measured invalid-type
      behavior. A recognized unavailable branch raises `UnsupportedFormatError` instead
      of returning plausible partial output.
- [ ] `toMathml()` and `toMathml(false)` produce the measured no-intent bytes, while
      `toMathml(true)` produces the measured intent tree.
- [ ] `toAsciimath`, `toLatex`, `toHtml`, `toOmml`, and `toUnicodemath` each have a runtime
      assertion through a compat instance created from AsciiMath.
- [ ] HTML and OMML corpus targets are nonempty and complete per payload; their
      cross-format and package-isolation gates pass against built artifacts.
- [ ] The root package exports the default class under ESM and CJS, the real packed
      artifact passes publint and attw, and review leaves no valid implementable finding
      unresolved.
