# plurimath-ts Architecture

Native TypeScript implementation of [Plurimath](https://github.com/plurimath/plurimath):
a math-notation model with parsers and renderers for AsciiMath, LaTeX, MathML,
OMML, UnicodeMath, and HTML. It replaces the Opal-compiled `plurimath-js`.

This document records the agreed design. Change it before changing the code it
describes.

Revision: v14 (2026-08-07) — the render layout goes node-major, per the
maintainer's decision: one directory per node kind under `src/render`, one
file per format inside (`render/sqrt/asciimath.ts` — the gem's
`function/sqrt.rb` locality), with the dispatch table and format-scoped
helpers on the format side (`src/formats/<F>/render.ts`,
`render-shared.ts`); §3 gains rule 8 (the render-file closure), the
matching-format generated-data closure, and the gate's kind-inventory check.
v13 (2026-08-07) records the maintainer's renderer-layout
decision in §5, "How this maps to the gem": render code lives in one file per
node kind, joined by a dispatch table typed total over `NodeKind`. v12
(2026-07-29) applies Codex design review rounds 1–8
(verdicts: approve-with-changes, rework ×4, then approve-with-changes ×3).
Every finding is verified against the gem, the POC, or the published packages
before adoption; round 8 confirmed P0 is unblocked. v4 fixed three self-contradictions (P0's gate checklist
was unsatisfiable, P0 stubs contradicted §4, the UnitsML dependency graph was
impossible) and replaced a useless symbol-census criterion — "overrides a
render method" matches 1,460 of 1,461 classes. v5 made gate activation
executable, resolved the publish/lock contradiction (experimental `0.x` →
lock at `1.0`/package takeover), pinned the build-tool facts precisely, and
dropped two over-engineered ideas (nominal node branding, per-node draft
classes). v6 gave the gate registry a real lifecycle (ordered milestones,
per-class runners, explicit failure semantics). v7 records the maintainer's
decision to **defer UnitsML entirely** pending discussion with Ronald, after
verification showed the upstream JS package publishes no `dist/` (§5). v8
(round 6: approve-with-changes) made the gate registry schema canonical,
removed human gates from the executable runner, stopped P0 asserting a default
export it deliberately does not build, and made the model census classify
deferred classes so UnitsML cannot re-enter the union through the back door.
v9 records the maintainer's call on how deferral should look in the code:
the grammar rule is commented out rather than active-and-throwing, so
`"unitsml(...)"` degrades to text — behaviour verified against the POC and
carrying a mandatory user-facing notice, plus an `onUnsupported` diagnostic
hook so the divergence is announced rather than silent (§5). v11 (round 7:
approve-with-changes) removed the residual gate-registry contradictions,
made package isolation one entry-enumerating gate, put class-C evidence in
the phase checklists, and stopped the isolation gate demanding a default
export before compat exists.

Corrections recorded rather than hidden: an earlier claim that "tsup cannot
emit declarations" was **too strong** — tsup emits declarations on TypeScript
5.9 (the POC did) and fails only on TypeScript 7, which is what this project
starts on. Verified while revising: `Math::Function::Unitsml` converts at
**render** time via `@unitsml.to_plurimath(options)`, so UnitsML cannot be
resolved during parsing.

## 1. Contract

The Ruby gem is the source of truth. plurimath-ts proves correctness against a
**conformance corpus generated from the gem**: parse tree, normalized model,
and each rendered output must match Ruby for every case. A proof-of-concept
(2026-07-23) validated tree + rendering parity end to end for AsciiMath: 69
cases, 276/276 assertions.

The corpus has graduated to a shared, language-neutral repository which future
implementations (Python, Rust) consume. **Staged deliberately (decided
2026-07-29; steps 1 and 2 are done):**

1. **Corpus first, locally** — done. P1 generated the corpus already in shared
   shape — own directory, JSON Schema, manifest, version stamp — and
   plurimath-ts consumed it through the same interface a released package would
   use, so the schema was designed from experience rather than guessed.
2. **Then extract** — done. The shared repository is `plurimath-testsuite`;
   this package consumes it as a git submodule pinned to a reviewed commit
   (`submodules/plurimath-testsuite`), not as a published package. The census
   and the exclusion list stayed here: they classify the gem's classes against
   *this port's* roadmap rather than describing the gem.
3. **Symbol data joins later, separately** — still open (§11). It is the
   higher-leverage move (69% of the gem) but a bigger ask, since making it
   authoritative means the Ruby gem generating its symbol classes from it. Until
   then symbol data is generated straight into this repo, as today.

Format for the shared artifacts: **YAML payloads** (comments, reviewable diffs,
one file per case group), validated in the shared repository against committed
JSON Schemas and checksummed per payload in its `corpus/provenance.yaml`.
**Consumers parse that YAML directly; nothing is compiled to JSON today**, so a
reader is each implementation's own small cost — here `test/core/corpus-yaml.ts`,
written by hand because this package declares no YAML dependency.

## 2. Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Single npm package, layered modules — no monorepo | One consumer per layer today; extraction stays cheap if import rules hold; org has no monorepos |
| D2 | Per-format entry points; renderers are modules, not methods on nodes | Bundlers cannot tree-shake methods off a class; browser users must not pay for formats they never call |
| D3 | Two API surfaces: modern per-format functions + a frozen `Plurimath` compat class | One-line migration from `plurimath-js`; new features land only on the modern API |
| D4 | Parser core is "pegkit", an in-repo typed Parslet work-alike | Codex-reviewed (2026-07-23): lock with conditions. Preserves the 1:1 grammar/transform map to Ruby that makes byte parity provable |
| D5 | Symbols are generated data, split per format, as static descriptors | 69% of the Ruby gem is symbol classes; each format bundles only its own slice; context-dependent behavior stays in renderer code (§5) |
| D6 | The corpus is the **primary executable oracle**, supplemented by negative, adversarial, and differential checks | The POC proved positive parity; the supplements close what it did not cover |
| D7 | Tooling makes "clean" objective (§8) | Style debates end at the linter |

## 3. Module map

```
src/
  pegkit/            Parslet-semantics PEG engine + transform engine.
                     Imports: nothing internal.
  core/              Formula + node model, format-blind. No render logic,
                     no parse logic. Imports: nothing internal.
    generated/       Core's own data, part of the layer (rule 1): the entity
                     table and the canonical symbol values Ruby's `==` reads.
                     Never edited by hand.
  formats/
    asciimath/       parse (grammar + transform) → FormulaNode; render entry
                     (renderer.ts → toAsciimath), the render dispatch table +
                     context wiring (render.ts) and the format-scoped render
                     helpers (render-shared.ts). Imports: pegkit, core, its
                     own data slice, its own kind files under src/render.
    latex/           Renderer landed: index.ts, renderer.ts (toLatex), render.ts,
                     render-shared.ts — the same shape as asciimath/ minus the
                     parse half. Only the LaTeX *parser* is a later phase (§9 P3+).
    unicodemath/     Same: renderer landed (toUnicodemath), parser a later phase.
    mathml/          toMathml(MathNode) → string. Imports: core, xml, its slice.
    html/            Does not exist yet (later phase).
    omml/            Does not exist yet (later phase; output format).
    ...              Every format module is independent of every other.
  render/            Renderer code, node-major (§5, "How this maps to the
                     gem"): one directory per node kind, one file per format
                     inside — render/sqrt/asciimath.ts is everything about
                     sqrt in AsciiMath, where a gem reader expects
                     function/sqrt.rb. A kind file render/<kind>/<F>.ts
                     belongs to format F's module graph alone (rule 8).
  xml/               XML element tree + Ox-compatible serializer.
                     Imports: nothing internal.
  formatting/        Format-neutral number + locale policy. Two halves, and
                     only one is a renderer concern. (a) Locale -> decimal
                     marker, which is a PARSE-time input: the gem builds the
                     AsciiMath `number` rule from
                     `Plurimath.configuration.decimal` (`asciimath/parse.rb`,
                     defined at :204, read at :18 and :86), so a comma-decimal
                     locale changes how commas parse, not only how numbers
                     render. A grammar takes the marker as a parameter from
                     here instead of hardcoding ".". (b) Number normalization
                     (the Ruby `Formatter::Numbers` cross-cut: every renderer
                     formats numbers) — exposes normalized result types, each
                     renderer keeping a private adapter that turns them into
                     its own output. (a) exists; (b) plus the wider locale
                     surface are P4 (§9). Imports: nothing internal.
  evaluation/        evaluate(formula, bindings, options). Imports: core.
  unitsml/           DEFERRED (decided 2026-07-29, §5) — not built until the
                     approach is settled with the maintainer. When it lands it
                     is a leaf service: conversion (unit text → FormulaNode) and
                     the standalone `unitsml` input parser as separate entry
                     points, so a renderer never pulls the parser.
  compat/            The frozen `Plurimath` class. Imports: everything.
                     Only the root entry re-exports it.
  generated/
    asciimath/       Input tables for the asciimath parser (own file).
    mathml/          Output descriptors for the mathml renderer (own file).
    ...              One physical file set per format. Never one merged blob,
                     never edited by hand.
scripts/             Ruby extraction — four generators covering the repository-owned
                     generated outputs,
                     each recording its own provenance: the census, the
                     exclusion list and the per-format symbol data
                     (generate-corpus.rb, which does NOT write the shared
                     conformance cases — the plurimath-testsuite submodule owns
                     those and its own copy of that generator writes them);
                     core's own data (generate-core-data.rb); formatting's
                     locale table (generate-formatting-data.rb); and the Ox
                     contract fixtures (generate-xml-fixtures.rb). Alongside
                     them, the gate runners: check.mjs, gate-boundaries.mjs,
                     gate-package.mjs, gate-oracle.rb, differential-port.mjs.
test/                Corpus conformance, pegkit conformance, unit tests,
                     package-isolation tests.
```

**Dependency rules** (machine-enforced, §8):

1. `pegkit`, `core`, and `xml` import nothing from **other `src/` layers**.
   Generated data a layer owns, under that layer's own directory, is part of
   the layer — `core/generated/` is core, and reading it is not a cross-layer
   import. The rule exists to keep layer 1 free of upward dependencies, not to
   deny a layer its own data. Layer 1 still may not import `src/generated/`,
   which is format-owned.
2. **Leaf services** import only `core` and their own data, and are the sole
   modules a format may import besides the layer-1 modules. Today that is
   `formatting`; `unitsml` joins this tier if and when it is built (§5).
3. A format module imports only layer-1 modules, leaf services, its own
   data — `generated/<F>` and no other format's slice — and its own render
   kind files: under `src/render`, format `F` may import only
   `<kind>/<F>.ts`.
4. No format imports another format — including through `src/render` and
   `src/generated`: a kind file `render/<kind>/<G>.ts` and a data slice
   `generated/<G>` are reachable only from `src/formats/<G>`.
5. Only `compat` and the root entry import across formats.
6. `evaluation` imports `core` only. No format or leaf service imports it;
   the root entry re-exports it (rule 5) so `parse(...).evaluate` style usage
   is available from the batteries-included entry.
7. No module-level side effects: importing any module must have **no
   externally observable effect** (no I/O, no global mutation, no registry
   writes). Module-local constant initialization is fine; `"sideEffects":
   false` declares this to bundlers. The isolation gate imports each entry
   and checks its exports; for the subpaths that declare forbidden patterns it
   also walks the bundled graph, so it catches an import that drags in another
   layer. The root declares none, and nothing observes I/O, global mutation or
   registry writes, so this rule is held by review, not proven by a gate.
8. Render code is node-major and format-closed. A kind file
   `render/<kind>/<F>.ts` imports only `core`, `xml` (the tree builder the
   MathML kind files emit through — `.dependency-cruiser.cjs` permits it
   alongside `core`), `generated/<F>`,
   `src/formats/<F>/render-shared.ts`, and sibling kind files of its own
   format (`<other-kind>/<F>.ts` — Ruby's base-class inheritance imports,
   e.g. `norm/asciimath.ts` importing `unary-function/asciimath.ts`); it
   never imports the dispatch table — recursion stays `ctx.render`.
   `render-shared.ts` is a leaf: it imports neither `render.ts` nor
   `renderer.ts` nor any kind file. Nothing else under `src/` imports
   `src/render` (root and compat entries excepted) — among format roots,
   only `F` reaches `F` files. The boundaries gate additionally checks the
   kind inventory: the expected kind set derives from each format's
   dispatch-table keys, and `src/render` must hold exactly one `<F>.ts` per
   kind for every format with a dispatch table — a missing file, a stray
   file, or an empty scan fails the gate.

Rules 2–3 exist because leaf services genuinely cross-cut renderers, verified
in the gem: every numeric render routes through `Formatter::Numbers`, and
`Math::Function::Unitsml` converts **at render time** with render options
(`@unitsml.to_plurimath(options[:unitsml])`) — neither can be resolved at
parse time. Being leaves (no format imports), they add weight without coupling
formats to each other. Their tables sit behind their own subpaths, and the
isolation gate measures exactly what a renderer subpath pulls in; bundle
budgets (§11) act on those numbers.

Rule 7 bans the POC's mutable registry and late-bound class references. Nodes
that need construction by name (the transform's `get_class`) receive an
explicit immutable registry object that each parser module builds from its own
imports of core constructors.

**Artifact isolation is a CI gate, not a promise.** Source-level rules and
`sideEffects` hints do not prove what ships: a single build entry, a shared
chunk, or a merged data file can drag every format into one subpath (the POC
does exactly this — one tsup entry, one JSON blob). Therefore:

- The build defines a **physical entry per subpath** (root, core, each format).
- A package test bundles each published subpath in isolation and asserts its
  transitive artifact graph — e.g. `/asciimath` contains no LaTeX or MathML
  render data; `/mathml` contains no parser.
- The root entry is documented as intentionally full-sized; only subpath
  imports carry the slim-bundle guarantee.

With render code node-major, the slim-bundle guarantee is per-**file**
module-graph disjointness — format `F`'s graph contains, under `src/render`,
only `<kind>/<F>.ts` files — enforced by the boundary gate (rule 8), not by
directory ownership. Landed (2026-08-17, #26): the format subpaths
`/asciimath`, `/latex` and `/mathml` are build entries, and the isolation gate
asserts per-subpath artifact isolation for render code — matching each
subpath's forbidden set against the modules its sourcemaps name, so the check
inspects what shipped rather than what was imported. `/unicodemath` joined
them (2026-08-21, #33) on the same terms: a text format like `/latex`, so its
forbidden set carries the XML layer and the grammar alongside the other three
formats, and the boundary gate's inventory now reads 38 kinds x 4 formats.

## 4. Public API

`package.json` `exports` map:

```
@plurimath/plurimath-ts             → root: everything the package publishes
                                      (today core; convenience + compat when they land)
@plurimath/plurimath-ts/core        → FormulaNode, node types, errors
@plurimath/plurimath-ts/asciimath   → parseAsciimath, toAsciimath
@plurimath/plurimath-ts/latex       → toLatex (parser when ported)
@plurimath/plurimath-ts/mathml      → toMathml (parser when ported)
@plurimath/plurimath-ts/unicodemath → toUnicodemath (parser when ported)
@plurimath/plurimath-ts/formatting  → (NOT YET PUBLISHED — see below)
@plurimath/plurimath-ts/evaluation  → (FUTURE — not published; evaluation lands in P4+, §9)
@plurimath/plurimath-ts/unitsml     → (FUTURE — not published; UnitsML is deferred, §5)
...one subpath per format
```

A format subpath exports every function that format owns — parsing *and*
rendering when both exist. Subpaths appear only when their implementation
lands; an unimplemented format has no subpath (not a throwing stub). The
package name above is the one `package.json` carries today; the name this
finally publishes under is still open (§11), and the package stays `private`
until it is settled.

`/formatting` follows that rule rather than being an exception to it. The
module exists — `src/formatting/` resolves a decimal marker from a locale,
because the AsciiMath `number` rule reads one at parse time — but that is a
fraction of what the subpath will eventually mean, since number normalization
(the `Formatter::Numbers` cross-cut) lands in P4. Publishing now would fix an
API surface around a tenth of the feature. The grammar imports it internally;
consumers get it when it is whole.

**Two node types, and which one a signature takes** (decided 2026-08-03; §5
has the model view). `/core` exports both:

```ts
type ConstructedMathNode = FracNode | NumberNode | ...;  // instances, carry equals()
type MathNode            = /* the same union minus `equals` */;  // the data shape
```

`MathNode` is what every public signature takes — renderers, `normalize`,
and the module function `equals(a, b)` — because §5's dispatch
is structural: an object with a known `kind` and a valid shape is a node
whatever produced it, so a caller may hand over a plain object built by JSON,
a test fixture, or another library. `ConstructedMathNode` is what a
constructor returns and the only type on which `node.equals(other)` — the
method §4 promises — is reachable.

One type cannot be both, and the attempt was a real regression: giving the
classes an `equals` method made every plain object stop being a `MathNode`
(`Property 'equals' is missing … but required in type 'NumberNode'`) while the
whole suite stayed green, because nothing tested assignability. The split
follows Ruby, where the node's `==` belongs to the instance and a same-shape
Hash does not get it (verified: `hash.method(:==).owner` is `Hash`, and
`hash.value` raises `NoMethodError`), rather than inventing a TypeScript
convention.

Modern surface (per-format modules) — **every** renderer takes an options
object (§5 convention), even where it is currently empty, so adding an option
is never a breaking signature change:

```ts
function parseAsciimath(input: string, options?: AsciimathParseOptions | null): FormulaNode;
//   AsciimathParseOptions includes onUnsupported (see "Unsupported-construct
//   diagnostics" in §5) — the hook for constructs the port has not built yet.
function toAsciimath(node: MathNode, options?: AsciimathOptions | null): string;
function toMathml(node: MathNode, options?: MathmlOptions | null): string;
function toLatex(node: MathNode, options?: LatexOptions | null): string;
function toUnicodemath(node: MathNode, options?: UnicodemathOptions | null): string;
```

Root convenience:

```ts
function parse(input: string, format: InputFormat, options?: ParseOptions): FormulaNode;
export { toMathml, toLatex, ... };            // re-exports
export default class Plurimath { ... }        // compat, below
```

The root `parse` forwards `options` to the selected format's parser, so root
consumers can supply `onUnsupported` (§5) exactly like direct subpath users —
without it the promise that "every parser accepts the callback" would be false
at the entry most people use. `ParseOptions` is the union of the format parse
option types, discriminated by `format`. The **compat constructor keeps the
default warning behaviour permanently**: its ABI is frozen and cannot gain an
options argument.

**Compat surface — method-exact with the `plurimath-js` ABI** (verified
against its source, `src/index.ts` + `src/plurimath-opal.d.ts`):

```ts
type CompatFormat = "asciimath" | "latex" | "mathml" | "html" | "unicode" | "omml";
                                            // NOTE: "unicode", not "unicodemath"
export default class Plurimath {
  constructor(data: string, format: CompatFormat);
  toAsciimath(): string;
  toLatex(): string;
  toMathml(intent?: boolean): string;         // default false
  toHtml(): string;
  toOmml(): string;
  toDisplay(lang: string): string;
  toUnicodemath(): string;
}
```

The published `plurimath-js` also exposes a public, **writable** `data`
property holding an Opal `ParserResult`. That object cannot be reproduced —
it is Opal-runtime-specific — so the compat class is **method-exact, not
object-exact**: the constructor and seven methods above match; `data` is an
open decision (§11) between a name-compatible `readonly data: FormulaNode` and a
documented break. The document does not claim a fully exact ABI.

The freeze will be enforced by a checked-in declaration fixture (type-level
test) plus one runtime test per method; no api-extractor needed. Neither the
compat class nor that fixture exists yet. The ~80-line budget
is guidance; exact compatibility overrides it.

**The compat class is not built in P0.** It has nothing to wrap until an input
format exists, and `data` (§11) is unsettled. It lands with the first release
that claims compatibility value, and its fixture freezes then — building and
freezing a default export around an empty library first would be pure
ceremony.

**Availability constraint.** The compat constructor accepts six input formats,
but input formats land across phases (§9). The compat class is therefore only
*complete* once every input format works; before that point, an unimplemented
format throws `UnsupportedFormatError`. Publishing under the `plurimath-js`
package name — where users expect all six — is gated on completeness (§11).

Rejected: a third "wrapped Formula with render methods" hybrid on the root
entry — one more API shape than users need (D3, over-implementation guard).

## 5. Core model and renderers

**Nodes.** Classes with a `readonly kind` discriminant (`"formula"`,
`"number"`, `"symbol"`, `"frac"`, ...). They hold structure only: parameters,
values, equality. No `toX` methods, no render or parse imports.

**The union is closed, and there are two of it** (decided 2026-08-03; §4 has
the API view). `ConstructedMathNode` is the discriminated union of the node
*classes* — instances, which carry `equals()`. `MathNode` is the same union as
**data**, derived from it by dropping that one member, and it is the type
every structural surface takes: renderers, `normalize` and the
module function `equals(a, b)`. A plain object with a known `kind` and a valid
shape is a `MathNode` and needs no constructor, which is what the runtime
boundary below already promised; a union of classes cannot say that, because
it rejects the object for want of `equals`. Both are closed: no `kind: string`
escape hatch, no generic base-node type, no runtime-registered node kinds —
`assertNever` exhaustiveness is a design guard only while they stay closed.
Structural kinds (frac, power, table) are distinct from symbol/operation
**ids** carried as data on symbol nodes.

Deriving `MathNode` from `ConstructedMathNode` rather than declaring the two
side by side is deliberate: a field added to a class cannot drift out of the
data shape, and a kind added to one union is a kind in the other. The
compile-time fixture is `test/core/node-types.spec.ts`, which asserts both
directions — a plain object *is* assignable, `new FracNode().equals(x)`
typechecks, and a wrong shape still fails — because no runtime test can see
either promise break.

**Union membership is census-driven, and locks late.** Widening an exported
exhaustive union after publication breaks consumers, and later input formats
introduce kinds AsciiMath never produces (verified in the gem's MathML
translator: `Ms`, `Menclose`, `Mpadded`, `Multiscript`, `Semantics`, ...).
Two safeguards, not one:

- A **generated model schema** — not merely a list of kind names — is emitted
  from the gem: for every node class, its concrete/abstract status, aliases,
  field names and shapes, equality fields, and the **constructor defaults**
  (below). (Ruby constructor *signatures* stay excluded — TS constructors take
  one options object by design, so parameter order and keyword-versus-
  positional have no consumer. The count of required positionals is recorded
  only as provenance for the default probe: it is what the probe passed.)
  Every discovered class is classified **implemented / aliased / explicitly
  deferred**; the deferred set is audited and named (today:
  `Math::Function::Unitsml`), so a deferred class cannot silently enter the
  union, and a newly appearing unclassified class fails generation. The union
  and the equality projection are declared from the implemented set.
- `/core` stays **explicitly experimental through the `0.x` line**, where
  breaking changes are expected and announced in release notes, and locks at
  the **package-takeover milestone** (§9) — which is also `1.0`. Early `0.x`
  releases under a distinct name are encouraged (§11): they gather real
  feedback precisely because they carry no stability promise.

After the lock, a new upstream node kind is a **semver-major** change —
stated here so the policy exists before it is needed. Renderers may reject a kind
they do not support with `RenderError`, but may not omit its `case`.

**Runtime boundary.** Compile-time closure does not bind JavaScript callers,
forged objects, or subclasses. Node classes are **not extension points**:
subclassing is unsupported. The dispatcher's `default` branch throws
`RenderError` at runtime (its `assertNever` is the compile-time half of the
same guard), and a malformed known kind throws `RenderError` rather than a
raw `TypeError`. Dispatch is **structural**, not nominal: any object with a
known `kind` and valid shape renders, whatever produced it — nominal branding
would buy little and would break across the ESM/CJS boundary the error `code`
contract already routes around. A class-A gate covers both directions: a plain
object with a known `kind` and valid shape **renders successfully** (the
positive half of the structural contract), while an unknown `kind` and a
structurally invalid known kind each raise `RenderError`.

**Model contract — two distinct projections.** They are not the same
equivalence and the doc keeps them separate:

- *Normalized model* — the full structural serialization compared against
  Ruby's serialized Formula in the corpus (catches any tree difference).
- *Equality projection* — what `equals()` compares, mirroring Ruby's `==`
  per class. Verified: `Formula#==` compares only `value` and
  `left_right_wrapper`; `Text#==` ignores `lang`; other classes include
  options selectively. The projection is generated per kind from the gem, not
  assumed.

The `/core` API (constructors, field shapes) is declared **unstable until the
publish/lock milestone** (§9).

**Mutability (decided 2026-07-28).** Formula and nodes are publicly
**immutable**: compile-time `readonly`, no setters, no runtime freeze.
`readonly` is a compile-time guarantee only — it does not stop mutation
through an alias or from JavaScript; the enforced promise is that *the
library* never mutates a tree after `parse` returns. Loosening to editable
later is a non-breaking change, reserved for a real tweak-a-formula
consumer (tracked in §10 YAGNI as builder helpers).

**Draft/finalize boundary.** Ruby's transforms mutate nodes after creating
them (verified in the UnicodeMath transform). The port keeps that freedom
*inside* construction: transforms assemble nodes through **transform-local
builders** (plain mutable locals or generated mutable type aliases — not a
hand-written parallel `FracDraft` class per node, which would double the
model), and `parse` finalizes them into immutable nodes. No mutable
intermediate is exported from a parser module.

Copy guarantee, stated honestly: constructors **shallow-copy** array and
options arguments, so a caller's later `push`/key assignment cannot reach into
a finished node. Nested objects the caller placed inside are not deep-cloned —
mutating those is out of contract and unsupported. (Nodes themselves are
immutable, so a tree of nodes has no mutable interior.)

**This copying is a deliberate divergence from the gem (decided 2026-08-03),
and the only one in the node model.** Ruby copies nothing:
`Formula.new(array).value.equal?(array)` is `true`, and mutating `array`
afterwards changes the node. Ruby can afford that because its nodes carry
`attr_accessor` and were never immutable.

Stated precisely, because the looser version is wrong: `readonly` does not
*require* this. It is compile-time only and shallow, so it would happily
coexist with an aliased array. What we are doing is **choosing a stronger
guarantee than `readonly` gives** — that a finished node cannot change at all,
including through a reference the caller kept — and copying is what makes that
true. The alternative was to keep `readonly` as decoration, which is worse than
either honest position.

The divergence is invisible to every output — parse and render are
identical either way, and the corpus passes with or without it — so it costs no
parity. It is recorded here rather than left implicit because a port accretes
divergences one reasonable decision at a time, and an unnamed one is the kind
that is discovered rather than chosen.

A constructed node is recognised by carrying `equals` as a method, not by
`instanceof`: a node from a second copy of the package, or another realm, is
still a node, and spreading it into a plain object would strip its prototype.
Shape cannot decide it either — `kind` is a legitimate `mglyph` attribute.

**Equality (decided 2026-07-28).** Nodes expose structural `equals()`
mirroring Ruby's `==` per kind, using the generated equality projection above
(bookkeeping excluded exactly where Ruby excludes it). It is tested against
Ruby-derived equal/unequal pairs — *not* against the normalized-model
comparison, which is a different, stricter equivalence. Canonical
serialization stays internal; it is not the public equality.

Mirroring the gem includes mirroring where it **fails** (2026-08-03).
`Symbols::Symbol#==` decodes both values through `HTMLEntities`, whose
`codepoint.chr(Encoding::UTF_8)` raises `RangeError` above U+10FFFF and on a
surrogate, and the gem lets that out of `==`: `Symbol.new("&#xD800;") ==
Symbol.new("&#xD800;")` raises rather than answering. So does this. The
earlier position — "an equality predicate must not throw", answering `true`
instead — was a nicety the contract does not allow; the gem is the oracle, and
being more sensible than it is a divergence. It is JavaScript's own
`RangeError`, **not** a `PlurimathError`: the package codes name package
operations, and this is the language failing to build a string. Half of it
comes free (`String.fromCodePoint` raises above U+10FFFF); the surrogate half
is thrown explicitly, because JavaScript will happily hand back a lone
surrogate where Ruby has no such string.

**Errors (decided 2026-07-28).** A `PlurimathError` base with subclasses
`ParseError { input, format, index }`, `UnsupportedFormatError { format }`,
`MissingSymbolDataError { symbolId, format }`, `RenderError { format, kind }` —
each carrying a stable string `code` (`"PARSE_ERROR"`, ...). The `code` is
the guaranteed discriminator (immune to the ESM/CJS dual-package hazard);
`instanceof` is supported but not the contract. Message text is never API.
`ParseError.index` is a **UTF-16 code-unit offset** into the input string
(JavaScript's native string index), documented as such because pegkit
positions are not byte offsets.

**Construction (decided 2026-07-28).** Node constructors are public: any node
class can be instantiated directly, because building formulas
programmatically is a supported use. They do not *validate* — an invalid
hand-built tree fails at render with `RenderError`, never a raw `TypeError`.
This is an intentional divergence from Ruby, whose constructors coerce and
run side effects (`Parslet::Slice` to string, `validate_left_right`); the TS
constructors defensively copy (see draft/finalize above) and materialize
defaults (below), and do nothing else. Construction-time validation stays
YAGNI. Constructor signatures are experimental through `0.x` and become
stable API at the `1.0` model lock (§9).

**Constructor defaults (decided 2026-07-30).** A TS constructor assigns
exactly the fields Ruby's `initialize` assigns, with Ruby's values.
`new NumberNode({ value: "2" })` carries `base: null`, `miniSubSized: false`
and `miniSupSized: false`, because `Math::Number.new("2")` assigns all four
instance variables — a node that omitted them would serialize three fields
short of the corpus. A field the Ruby constructor never touches stays
`undefined`: `hide_function_name` on every function, `input_string` on a
formula (the parser sets it afterwards), everything but `value` on a symbol.
The types carry the distinction — an always-assigned field has no
`| undefined` in its declaration.

The default set is **measured, not read**: the generator instantiates each
class and inspects `instance_variables`. Source-reading would get it wrong,
because assignment is routinely conditional and inconsistent between
siblings (`Underset` stores an empty options hash; `Overset`, same signature,
skips it). It lands in the census under each class's `defaults` key, split
into `assigned` and `unassigned`, and the suite checks every implemented
class against it.

**Aliased classes carry their own defaults, and the carrier materializes
them** (decided 2026-08-03). 21 of the 1,552 aliased classes override
`initialize`: eight `FontStyle::*` put their family name in `parameter_two`
(`Bold` → `"bold"`, `Normal` → `"rm"`), ten `Table::*` bring a bracket pair,
`Td` and `Tr` start `parameter_one` at `[]`, and `Mglyph` starts it at `{}`.
The port folds all of them into one carrier node, so the carrier looks the
alias up by its full identity — `(kind, name)`, never `name` alone, since
alias names are not unique across carriers — and assigns what Ruby would have.
Four rules:

- materialize **only** where the caller omitted the field, so an explicit
  `null`, `false`, `[]` or `{}` survives;
- allocate **fresh** arrays, objects and nested nodes per construction
  (`Matrix`'s parens are nodes, `Td`/`Tr` need their own `[]`), because a
  shared table would leak state between nodes;
- an **unknown name keeps the carrier's own defaults** — construction stays
  permissive and never throws;
- the values are the census's measured `defaults.assigned`, transcribed.

Measurement matters more here than anywhere else: `Table::Matrix#initialize`
reads `open_paren = "("`, a **string**, and `Table#initialize` then runs it
through `Utility.symbols_class`, so what the object actually holds is a
`Paren::Lround` node. A port written from the source would have stored `"("`.

Nothing is claimed about parsed trees here. The AsciiMath transform exists —
`src/formats/asciimath/transform.ts`, applied by
`src/formats/asciimath/parser.ts` — so what it does with a value is settled by
its own tests (`test/formats/asciimath/transform.spec.ts`) and by the corpus
model-parity gate, not by this section, which describes construction only.

**Renderer options (decided 2026-07-28).** One convention for every renderer:
options are typed exactly, so unknown keys are rejected on fresh object
literals (TypeScript's excess-property check; a variable widened elsewhere can
still slip through — the runtime therefore ignores unknown keys rather than
throwing). Every default is documented on the option; rendering never mutates
the options object (§5 execution contract).

**Renderers.** Each renderer is one module with one public entry function and
one recursive dispatcher:

```ts
function renderNode(node: MathNode, ctx: RenderContext): XmlElement /* or string */ {
  switch (node.kind) {
    case "frac":   return renderFrac(node, ctx);     // renderer-private helper
    case "table":  return renderTable(node, ctx);
    ...
    default: assertNever(node);
  }
}
```

The `switch` is the contract, not the layout: a renderer may equally realize
it as a dispatch table typed total over the kind union — a missing entry is
then a compile error, exactly as `assertNever` is. The AsciiMath renderer
does ("How this maps to the gem", below).

Execution contract (pinned):

- `renderNode` is the **sole** recursive dispatcher; cases delegate to
  renderer-private helpers (`renderFenced`, `renderTable`, ...). Deep-structure
  behavior from Ruby (fence pairing, table paren logic, unary spacing) lives in
  those helpers — never on nodes, never shared across formats.
- `RenderContext` is **immutable**; child rendering derives a new context
  (table position, unary spacing, MathML intent, display style, ...).
- Rendering never mutates the Formula or the caller's options object.
- Return type is `string` for every format; MathML and OMML build an XML tree
  internally and serialize it, rather than returning the tree.
- Core may export only format-blind structural predicates. No generic visitor
  framework, no double dispatch.

**How this maps to the gem (decided 2026-08-07; the AsciiMath renderer's
layout, and the template for every later text renderer).** The node classes
are the gem's design kept: instances with the same fields, the same measured
constructor defaults, the same equality projection. The one structural
deviation is where render code lives. The gem puts a `to_asciimath` method on
every class; the port puts the render code node-major under `src/render`:
one directory per node kind, one file per format inside
(`src/render/<kind>/<format>.ts`) — everything about one construct in one
directory, the gem's `function/sqrt.rb` locality. The reason is D2's: a JS
bundler can drop an unused import, but it can never drop a method off a
class — code on nodes ships with the nodes, every format to every consumer,
which is exactly the plurimath-js defect this port exists to remove.

| Ruby gem | This port |
|---|---|
| one file per class — `function/sqrt.rb` | one directory per kind — `render/sqrt/`, one file per format inside (`render/sqrt/asciimath.ts`) |
| the implicit method table (every class answering `to_asciimath`) | the explicit dispatch table in the format's `render.ts` (`src/formats/asciimath/render.ts`), typed total over `NodeKind` — a missing entry is a compile error |
| `child.to_asciimath(options:)` | `ctx.render(child)` — recursion through the context, which looks the child's kind up in the table |

The per-kind directories mirror the gem's one-file-per-class layout
deliberately: a gem reader finds `render/sqrt/` where they expect `sqrt.rb`,
and each format file's header comment inside names the gem file it mirrors.
Carrier kinds standing
in for many aliased gem classes (`unaryFunction`, `binaryFunction`,
`ternaryFunction`, `table`, `fontStyle`) keep their class-name dispatch
inside their own kind file — per-kind means per `NodeKind`. Idioms shared
across kinds (`interpolatedValue`, the strip helpers, the context axes) live
in the format's `render-shared.ts` (`src/formats/asciimath/render-shared.ts`,
a leaf under rule 8); a helper Ruby defines on a base class lives in that
carrier's kind file and is imported by the inheritors' files exactly where
Ruby inherits (`norm/asciimath.ts` importing `renderUnaryDefault` from
`unary-function/asciimath.ts` is `Norm`'s `super`).

**Symbols.** Symbol nodes carry a stable id (Ruby class key: `"Sigma"`,
`"Paren::Lround"`). Parser data maps input text → id. Each renderer slice maps
id → a **static representation descriptor** — not final output. Context-
dependent rendering (verified in the gem: `Comma` inside tables; five symbol
classes whose MathML attributes depend on `intent` — `Dd`, `Ii`, `Jj`,
`UpcaseDd`, `Intercal`; runtime `rspace` options) is renderer policy applied
over the descriptor via `RenderContext`.

The exception matrix is **generated by behavioral probing, never hand-picked
and never by "does it override a render method"** — 1,460 of 1,461 symbol
classes override one, so that criterion selects everything and means nothing.
Instead the extraction script renders every symbol across a **declared, finite
axis manifest** and records only the symbols whose output actually *differs*
on some axis; that difference set is the exception matrix. The manifest is
committed and currently holds the axes found in the gem: `intent` on/off,
table vs non-table context, the `rspace` instance option, and target format.
The **host templates are committed alongside it** (bare symbol; inside a
fenced group; as a table cell; as an operand of a binary function), so probing
renders each symbol in representative surroundings, not only in isolation, and
neighbour-dependent behaviour is exercised.

Honest limit: probing cannot discover an axis it does not exercise. The
primary safety net is regeneration review — a changed RESULT for an
axis/value pair the manifest already lists changes generated output, and the
diff is reviewed like code. `src/generated/context-axes.ts` enumerates each
axis's values and the generator probes only those, so a new axis *and* a new
value on an existing axis are both invisible to regeneration. A source scanner that
fails regeneration on an unmanifested context key is a **possible later
addition**, deliberately not built until a real miss justifies it. A symbol id
missing from a renderer slice throws — parity gaps fail loudly.

**UnitsML node state (design, for when UnitsML lands).** `UnitsmlNode` stores
the **raw unit text only**;
conversion happens at render time via the `unitsml` service, which is where
Ruby does it and where the render options apply. Projections are explicit,
matching Ruby (`Unitsml#==` compares raw text exactly):

```text
normalized model : { kind: "unitsml", text: rawText }
equals()         : exact raw-text comparison
excluded         : any parsed object or memoization cache
```

Re-parse cost per render is accepted; an internal cache keyed by text is a
contained, non-API-visible fallback if measurement demands it.

**UnitsML — deferred (decided 2026-07-29).** UnitsML is **out of scope until
the approach is agreed with the maintainer**. Nothing pretends to support it:
there is no `unitsml` module, no dependency, no node kind, and the AsciiMath
grammar's `unitsml(...)` alternative is **present but commented out**, with a
pointer to this section. Commented-out rather than deleted so the exact shape
of the future rule — and where it belongs in `quoted_text`'s ordered choice —
stays visible.

> **Notice (must appear in user-facing docs, not only here): while UnitsML is
> unsupported, `"unitsml(...)"` input is processed as ordinary text.** Parsing
> such input emits a deduplicated warning by default; consumers can capture,
> reroute, or silence it via the `onUnsupported` option (below).

That is the natural consequence of disabling the rule, verified against the
POC: input falls through to the plain quoted-text alternative, so
`"unitsml(kg)"` yields `Text("unitsml(kg)")` and renders as `"unitsml(kg)"`
(AsciiMath), `\text{unitsml(kg)}` (LaTeX), `<mtext>unitsml(kg)</mtext>`
(MathML).

**Unsupported-construct diagnostics (decided 2026-07-29).** Silence is the
wrong default for a deliberate divergence, so parsers report it through one
option. `core` owns the format-blind diagnostic type; every parser accepts the
callback:

```ts
interface UnsupportedDiagnostic {
  readonly feature: "unitsml";   // union of currently deferred features
  readonly text: string;         // the construct exactly as written
  readonly index: number;        // UTF-16 offset into the ORIGINAL input
  readonly message: string;      // the default human-readable explanation
}
type OnUnsupported = (diagnostic: UnsupportedDiagnostic) => void;
```

- **Default** (no callback): one `console.warn` per unique
  `feature + text`, naming the construct, the fallback behaviour, and the docs
  link. Deduplicated so a document with 500 unit expressions warns once, not
  500 times.
- **Supplying a callback replaces the default entirely** — that is also how it
  is silenced (`onUnsupported: () => {}`), routed to a logger, collected for a
  UI, or escalated by throwing. No second flag, no global switch: a global
  `configure()` would be module-level mutable state (rule 7) and would
  duplicate across the ESM and CJS copies, the same hazard the error `code`
  contract avoids.
- Detection is an explicit check for the `unitsml(` prefix inside quoted text.
  That check *declares non-support*; it is not partial support.
- The dedup cache is **call-time, module-local, advisory** state — it is never
  touched at import time (rule 7 holds), and a duplicate warning across an
  ESM/CJS boundary is harmless.
- **Offsets are mapped back through preprocessing.** AsciiMath preprocessing
  rewrites digraphs to single characters (`{:` → `ℒ`, `:)` → `ᑐ`, …), so a raw
  parser offset indexes the *preprocessed* string, not the caller's input —
  verified: `"{:x:} + \"unitsml(kg)\""` shifts by 2. Preprocessing therefore
  emits an offset map, and every reported index — `UnsupportedDiagnostic.index`
  **and `ParseError.index`** — is translated through it. Tests cover an input
  whose construct sits after a length-changing token.

Accepted consequence, stated plainly: for this input the port **diverges from
Ruby**, which renders the units (`rm(kg)` / `\mathrm{kg}`). The divergence is
deliberate and documented rather than hidden behind a thrown error that would
kill an otherwise renderable document; the parse tree for that input likewise
differs from Ruby's (`{text: ...}` instead of `{unitsml: ...}`).

The shared corpus does carry one case, `text-unitsml-valid`, withheld by
`corpus/exclusions.yaml` rather than absent. The **deferred-feature
classifier** is local to `scripts/generate-corpus.rb`; the testsuite generator
and the differential runner do not share it. The divergence cuts both ways:
Ruby **rejects** malformed UnitsML during construction
(`::Unitsml.parse` raises inside the node constructor) where the port accepts
the same quoted string as text, and Ruby **renders** valid UnitsML where the
port emits literal text. The classifier therefore matches on the **input
text** (the `unitsml(` construct), not on a parsed class: for rejection cases
Ruby never produces a formula, so post-parse class detection could not see
them. What it flags is listed in an exclusion manifest shipped beside the
corpus, so the gap is visible rather than implied by absence. The testsuite
generator still emits the case (`text-unitsml-valid`), and the differential
runner omits UnitsML from its own atom set rather than through this
classifier — the exclusion is not one mechanism shared by three generators.

Why it is deferred rather than bridged, verified 2026-07-29:

1. `@unitsml/unitsml@0.6.7` publishes **only** `LICENSE`, `README.md`, and
   `package.json` — the `dist/` its `main`, `module`, `types`, and `exports`
   point at is absent from the tarball, so importing it fails.
2. Upstream's README marks `Unitsml.parse()` runtime support incomplete.
3. Even once shipped, Ruby's `to_plurimath` builds a **Ruby/Opal** formula by
   re-parsing generated MathML; it would not return this project's native
   model, so a bridge needs a MathML→native adapter and MathML *input* is a
   later phase (§11).

When the approach is settled, the design above (leaf service, raw-text node,
render-time conversion, separate parser entry point) is what gets built.

## 6. pegkit

Ported from the POC, where its architecture passed adversarial review
(Codex, 2026-07-23: "lock with conditions"). It replicates Parslet 2.0.0
semantics verified against the vendored gem source: sequence flattening,
slice/hash/array result trees, packrat memoization, whole-code-point `match`
consumption, reverse-definition-order transform rules, exact-key-set patterns.

**The cache, stated precisely, because two of its properties look like bugs.**
The key is (atom, position) and deliberately **excludes `consumeAll`**, matching
Parslet, where the leftover-input check runs *after* the cache and on the cached
value. One consequence, measured: a grammar that shares one atom object between
two branches parses differently from the same grammar written out twice —
`(a >> str("q")) | a` fails on `"a"` where `a` alone succeeds. Adding the flag to
the key would fix that, and would make pegkit *more consistent than the oracle*,
which §1 defines as a defect. In Parslet, the uncached set is `Dynamic` plus
the wrappers it gives their own `#apply` and never memoizes — `Named`,
`Capture`, `Ignored`, `Scope`. pegkit mirrors that for the atoms it has: its
uncached set is `AsAtom` (the `Named` equivalent), `CaptureAtom`, `ScopeAtom`
and `dynamic`; it implements no `Ignored` or `Entity` atom.

Lock conditions, owed in Phase 0:

1. A pegkit conformance suite asserting Parslet-observed behavior directly
   (empty-repeat shape, maybe-miss shape, duplicate-key merge, hash+array
   hoisting, capture/scope interaction) — not only end-to-end corpus parity.
2. The remaining grammar surface: `any`, `present?` (positive lookahead), and
   capture `scope` — required by the LaTeX/UnicodeMath/HTML grammars.
3. Stack safety: deep nesting fails as a clean `ParseFailed` (POC behavior,
   kept under test).

Scope promise: pegkit implements the Parslet subset plurimath's grammars use,
not all of Parslet. Divergences outside that subset are documented, not fixed.

## 7. Verification

Gates fall into three classes. Every gate is **registered from day one** and
blocks pull requests **from the milestone that activates it**; before that it
is reported as inactive/non-blocking, never skipped or absent (activation
matrix below). `scripts/check.mjs` runs every *activated* class-A gate.

**A. Automated TS gates (CI-blocking, no Ruby, all in `scripts/check.mjs`)**

- **Corpus conformance**: parse tree, normalized model, and every landed
  renderer match the committed Ruby-generated expectations exactly.
- **Negative parity**: inputs the gem rejects must be rejected here — a
  non-empty rejection corpus (the POC had none).
- **pegkit conformance suite** (§6.1).
- **Package isolation** (§3): assertions on the **built `dist` artifact** —
  ESM import, CJS loading with named-export parity, emitted declarations, and
  every export condition — not merely a source-level bundle. Only the
  are-the-types-wrong check runs against a real `npm pack`. (The root's
  default export is asserted only once the compat class exists, §4.)
- **Adversarial inputs**: deep nesting, unmatched fences, long token runs —
  clean failures, bounded time.
- **Layer boundaries, types, lint** (§8).

**B. Oracle gates (require a Ruby checkout; run on regeneration and on a
schedule, not per-PR)**

- **Corpus/data regeneration** from a clean gem checkout, reviewed as a diff.
- **Differential runner**: a deterministic, seeded, bounded input generator
  compared live against the gem. Scheduled fuzzing infrastructure stays YAGNI
  until this saturates.

**C. Human gates (release checklist, not automation)**

- **Peer review**: non-trivial design and each format lock get a Codex
  adversarial pass.
- Phase exit sign-off (§9).

**Activation matrix**

The matrix is **executable, not prose**. A tracked `gates.json` records every
**executable** gate (classes A and B only): its class, the **ordered
milestone** that activates it, and its runner command. Class-C evidence is
human and recurring, so it lives in the phase-exit checklist (§9), never in
the runner registry. Milestones are an explicit ordered list —
`P0` → `P1-baseline` → `P1-completion` → `P2` → … — and the repo's current
milestone is a single tracked field in the same file.

Lifecycle rules:

- **Runners are per class.** `scripts/check.mjs` runs activated **class-A** gates
  only (no Ruby, no humans). Class B runs via `scripts/gate-oracle.rb` (needs a gem
  checkout) on regeneration and on a schedule; class C is checklist evidence
  recorded in the phase sign-off.
- **Advancing the milestone is a reviewed change**, owned by the maintainer:
  the PR that advances it must also contain the runners for every gate that
  newly activates. The registry itself is stable — gates are registered up
  front and change activation state, rather than appearing over time.
- **Failure semantics are explicit.** A gate whose milestone has arrived but
  whose runner is missing or unrunnable **fails** the run. Every gate is
  registered from day one; one not yet activated is reported as
  **inactive/non-blocking**, never silently absent.

| Gate | Class | Activates at |
|---|---|---|
| Types, lint, layer boundaries | A | `P0` |
| pegkit conformance + stack safety | A | `P0` (pegkit is internal — tested directly, not via a public subpath) |
| Package isolation + browser-bundler smoke | A | `P0` — a single gate whose runner **enumerates the currently published entries** from the `exports` map, so new formats need no new row in this table — though each still needs its expected exports and forbidden layers listed in the runner |
| Packaging correctness (`publint` on `dist`, `attw` on a real pack) | A | `P0` |
| Generated-payload schema + manifest-hash validation | A | `P1-baseline` (first generated data) |
| Runtime boundary (unknown/malformed nodes) | A | `P1-baseline` (with the first renderer) |
| Unsupported-construct fallback + diagnostics | A | `P1-baseline` — `Text` fallback in all four renderings; warning dedup; callback replace/silence/throw; exact original-input index (incl. after a length-changing preprocessing token); presence of the user-facing notice |
| Corpus conformance (tree, model, renderers) | A | `P1-baseline` |
| Negative/rejection corpus | A | `P1-completion` |
| Symbol context-exception matrix | A | `P1-completion` |
| Adversarial inputs | A | `P1-completion` |
| Clean-oracle regeneration — two registered gates: this repo's own data, and the pinned testsuite corpus | B | `P1-baseline` |
| Differential runner | B | `P1-completion` |
| Peer review, phase sign-off | C | every phase — **checklist, not registry** (§9) |

Export-shape note for the isolation gate: every entry is asserted through its
**named** exports and CJS loading. The root's `require(...).default`
assertion activates only when the compat class lands — it is deliberately
absent at `P0` (§4), so asserting it there would fail by construction.

Raw Parslet parse-tree parity is a **plurimath-ts implementation gate** (it
proves pegkit reproduces Parslet), not a normative requirement for the shared
testsuite — a future Python/Rust port need not reproduce Parslet's tree shape,
only the model and rendered outputs.

**Oracle provenance.** Generation **rejects a dirty checkout of either the gem
or this repo's generator** (`--allow-dirty` exists for local experiments only;
its output is marked non-committable and CI rejects it). Provenance lives in a
**sidecar manifest** per generated file — not inside the payload — so hashes
have an unambiguous scope. The manifest records everything that can change an
output byte:

- corpus/data schema version; generator commit; stable case ids;
- gem commit and version, plus the **`Gemfile.lock` hash** (not just parslet)
  and the Ruby engine + version;
- the gem's **XML engine**: canonical payloads are generated with **Ox**
  (the TS serializer is Ox-compatible by design); Oga is used only as a
  secondary parity check, never as the canonical source — recording which
  engine ran is not enough, since the suite deliberately exercises both;
- any non-default `Plurimath.configuration` (decimal separator, locale,
  number formatter) in force;
- external dependencies, recorded by **source kind** (a released gem has no
  commit to record):
  - checked-out oracle/generator → commit + clean/dirty state;
  - released gem → name, version, source, platform, and its `Gemfile.lock`
    checksum;
  - Git-pinned gem → resolved immutable revision + checkout state;
  - path-pinned gem → **rejected** for canonical generation;
- the SHA-256 of the canonical payload (the payload never hashes itself).

CI validates every payload against its schema and manifest hash. Regeneration policy: regenerate only from clean
checkouts and review the diff like code. Symbol ids (`"Paren::Lround"`) are
internal schema values — a rename in Ruby requires an alias entry in the data
schema, never a silent id change.

## 8. Tooling: "clean" made objective

| Concern | Tool | Notes |
|---|---|---|
| Types | `tsc --strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` | Type-checking is a CI gate; `any` requires a comment |
| Lint + format | Biome | One fast tool over ESLint+Prettier: less config to maintain (D7 applied to tooling itself) |
| Layer boundaries | dependency-cruiser + render kind inventory | Encodes §3's eight rules; the inventory check derives the kind set from each format's dispatch table; CI gate |
| Artifact isolation | package test over the built **`dist`** (ESM + CJS + types + export conditions) | §3; builder-independent assertions |
| Tests | Vitest | Proven in POC |
| Build | **tsdown `0.22.14`**, pinned exactly → ESM + CJS + d.mts/d.cts, one entry per subpath | See build-tool note below |
| Packaging correctness | `publint` on `dist`, `@arethetypeswrong/cli` on a real `npm pack` | CI gate; both green on the verification fixture |
| Package manager | pnpm, pinned via `packageManager` | |
| Runtimes | `mise.toml` committed (org precedent: the gem commits one); `engines.node >= 20` | |
| Corpus regen | `scripts/` + documented one-liner | Requires a local gem checkout; class-A CI never needs Ruby (generated files are committed); class-B gates do (§7) |

Conventions: kebab-case filenames; named exports only — the root default
export (compat class) is the single exception, required for plurimath-js
parity; each layer's public surface is its own `index.ts` (one non-index
re-export remains, `core/equality.ts` re-exporting from `./nodes`); comments
explain constraints, not
narration.

**Build-tool note (bake-off, 2026-07-29).** A 4-entry fixture mirroring §3 was
built with both candidates. Precisely stated: **tsup's declaration pipeline
fails on TypeScript 7** — `npx tsup` with `dts: true` aborts with
`TypeError: Cannot read properties of undefined (reading
'useCaseSensitiveFileNames')` from its bundled `rollup-plugin-dts` (which pins
TS 5.7), emitting no declarations. It *does* work on TypeScript 5.9 (the POC
shipped declarations that way); the failure is specific to the current TS
major, which this project starts on. tsup is also unmaintained upstream and
its own README points to tsdown. tsdown `0.22.14` built the same fixture to
ESM + CJS + `.d.mts` + `.d.cts`, kept per-format isolation (the asciimath
entry contained no mathml data and vice versa), preserved `instanceof`
identity across subpaths, and passed `publint` ("All good!") and
`@arethetypeswrong/cli` (green for node10, node16-CJS, node16-ESM, bundler on
every subpath).

Consequences pinned here so they are not rediscovered later:

- tsdown 0.22.14 declares `engines.node: "^22.18.0 || >=24.11.0"` — note it
  is **not** a simple lower bound: Node 23 is excluded. That constrains the
  build environment only, and is separate from the published package's
  `engines.node >= 20` runtime support. CI pins both explicitly.
- tsdown defaults to the **Node platform**, but D2 targets browser bundlers:
  the ESM output pins an explicit browser-safe platform/target, and a
  browser-bundler smoke test is part of the isolation gate.
- `tsc`-only is a **documented contingency, not a second maintained build**.
  It was verified to work (ESM + CJS + types, isolation structural). If ever
  activated it must pass the same package-isolation gate; until then it is not
  configured or run.

**Convention guardrails beyond tooling.** `scripts/check.mjs` — one tracked,
committed entry point running every *activated* class-A gate locally (§7
registry; class-B gates run from `scripts/gate-oracle.rb`) — is the enforceable
guardrail and a P0 exit item. Assistant skills (*ts-conventions*,
*corpus-regen*, *port-a-format*) are developer aids kept **outside the
repository**, in the maintainer's own skills library; they are never
committed here and never gate a release.

## 9. Phases — with explicit exit checklists

Every phase exit additionally requires its **class-C evidence**: a Codex
adversarial review round with findings resolved, and maintainer sign-off
recorded. This is the checklist half of §7 — it is deliberately not in the
executable registry.

**P0 — Foundation.** Exit when: scaffold matches §3; dependency-cruiser +
Biome + tsc gates green; pegkit ported with its conformance suite,
`any`/`present?`/`scope`, and stack-safety tests (pegkit stays **internal** —
no public subpath); the build emitted the two entries that genuinely
existed at P0, root and `/core`, with no format stubs published or tested;
the format subpaths joined them once their renderers landed — only AsciiMath
has a parser today —
`/asciimath`, `/latex` and `/mathml` on 2026-08-17 (#26), `/unicodemath` on
2026-08-21 (#33) — each a physical entry the isolation gate checks; the `gates.json` registry and
`scripts/check.mjs` run every P0-activated gate.

**P1 — AsciiMath vertical.**
*Baseline exit:* the **census classification** (implemented / aliased /
deferred) exists — corpus exclusion depends on it, even though the full model
schema completes at P1-completion; POC corpus fully passing under the new
architecture — parse tree, **normalized model**, and every landed renderer
(asciimath/mathml/latex, joined by unicodemath); **minimal
number normalization** in `formatting` (every numeric render already routes
through it in the gem — locales and configurable formatters come later);
generator emits per-format data slices with the §7 sidecar manifests from
clean checkouts; runtime-boundary gate active.
*Completion exit:* widened positive corpus (fonts, color, left/right, mod);
non-empty rejection corpus passing; **generated model schema** and
**behavioral symbol-context probes** driving the union and exception matrix;
equality projection generated and tested; package-isolation assertions for the
real asciimath/mathml/latex/unicodemath subpaths. (UnitsML is explicitly **not** in P1 —
its grammar rule stays commented out and such input is processed as text, §5.)

**P2 — Complete AsciiMath surface.** Exit when: the omml and html renderers
land with corpus coverage (the unicodemath renderer landed early, during
P1-baseline, and its render-parity spec is already inside the
corpus-conformance gate); packaging review (npm surface) done;
first release under a distinct name if the publishing decision (§11) says so.
The `/core` lock does **not** happen here.

**P3+ — One input format per phase.** LaTeX → UnicodeMath → HTML, each locked
by its own corpus, negative cases, isolation assertions, and a review round.

**P4+ — Remaining parity modules.** `formatting` completion (locales,
configurable formatters), `evaluation`, and MathML/OMML *input* parsing, each
a phase with its own corpus slice, isolation assertions, and review round.

**Releases.** Experimental **`0.x` releases start as soon as there is
something useful** (P2 onward), under a distinct name, explicitly carrying no
stability promise — `/core` is documented as experimental and breaking
changes are announced in release notes.

**`1.0` / takeover milestone.** When every input format exists: the compat
class satisfies its method-exact ABI (§4), the `/core` model schema locks and
becomes semver-stable (§5), the plurimath-js package name is taken over, and
the Opal package is deprecated. These happen together by design — stability is
promised exactly when the package starts claiming to be a drop-in replacement.

**Open release blocker — UnitsML at takeover.** The published `plurimath-js`
supports UnitsML through its compat constructor and ships tests for it
(`spec/unitsml.spec.js`). Deferring UnitsML (§5) therefore conflicts with an
unqualified drop-in claim. Before takeover, one of these must be chosen and
recorded (§11): **either** UnitsML parity is required for `1.0`, **or** the
takeover deliberately drops UnitsML, in which case the "drop-in replacement"
language goes and the break is documented in the release notes. This does not
affect P0–P2.

**Data repo migration — done, and not the way this line predicted.**
`plurimath-testsuite` exists. This repo pins it as a **git submodule** at a
reviewed commit (`submodules/plurimath-testsuite`), not as a released data
package. And `scripts/` did **not** move: the testsuite owns its own
`scripts/generate-corpus.rb` for the shared cases, while this repo keeps
`scripts/generate-corpus.rb` for what is not shared — the census, the exclusion
list, and the TypeScript symbol data (TODO.plan/cross-cutting.md).

## 10. Scope and restraint

**In scope — full Plurimath parity, phased.** The target is the complete gem
feature set, each with a home in the module map (§3) and a phase (§9): number
formatting (`formatting/` — minimal normalization in P1, locales and
configurable formatters in P4+); the `evaluate` module (`evaluation/`);
UnitsML (**deferred pending a maintainer decision**, §5 — the upstream JS
package is currently unusable); MathML/OMML *input* parsing (behind the mml/omml-ts strategy decision, §11).
"Later" here means a planned phase, not a rejection.

**YAGNI — not built until a real consumer demands it.** Architecture and
infrastructure that adds surface without adding parity: monorepo/package
splitting; plugin or extension system; async/lazy chunk loading; runtime
format or node registration; generic visitor/base-renderer framework or
double dispatch; a DSL for symbol-render exceptions (plain renderer helpers
until they measurably sprawl); changesets/release automation; api-extractor;
TypeDoc site; Ruby mutation-API parity on the modern core; public Formula
JSON deserialization; scheduled fuzzing infrastructure (until the
deterministic differential runner saturates); CDN bundle builds beyond
standard ESM/CJS.

Moving an item between these lists requires editing this document first.

## 11. Open items

Decisions needed before their phase:

- **Modern-API semantics:** fully decided (§5) — mutability, equality,
  errors, construction, renderer options.
- **Compat `data` property (before P2):** the published plurimath-js exposes a
  public `data` field holding its Opal parse result. Reproduce an equivalent
  surface (exposing our `FormulaNode`), or document its absence as a deliberate
  break and stop calling the ABI exact. Recommendation: expose
  `readonly data: FormulaNode` — same property name, our model behind it.
- **UnitsML approach and its `1.0` consequence** — Suleman to discuss with
  Ronald. Note the coupling: `plurimath-js` ships UnitsML support today, so
  either UnitsML lands before package takeover or the takeover documents a
  deliberate break (§9). Deferred out of P1
  (§5) because `@unitsml/unitsml` ships no `dist/`. Options when it returns:
  fix upstream and bridge; native TS port; or keep deferring. Note this is a
  bug in the org's own `unitsml/unitsml-js` repo, worth reporting regardless
  of which option wins.

- **MathML/OMML input strategy (P4+):** the same question, same
  shape — Ruby delegates to the `mml`/`omml` gems and the org ships
  Opal-compiled `@plurimath/mml`. Note the UnitsML case set no "wrap the Opal
  release" precedent — that option was *deferred*, not adopted, once the
  upstream package proved unusable. Evaluate `@plurimath/mml` on its own
  evidence (does it publish working artifacts, and does it yield a native
  model?) when P4 planning starts.
- ~~Build tool~~ — decided 2026-07-29 by bake-off: **tsdown** (§8), with
  bundler-free `tsc` as the verified fallback.
- **Bundle budgets (P1):** set measurable size ceilings per subpath once the
  first real numbers exist.
- **Publishing strategy** — Ronald. The npm name (the Opal package owns
  `@plurimath/plurimath`) and the release line. Design position: publish
  early and often as explicitly experimental **`0.x` under a distinct name**
  — no stability promise, real feedback — and take over the plurimath-js name
  at **`1.0`**, which is the same milestone as compat completeness and the
  `/core` lock (§5, §9).
- **Shared data — the corpus half is settled, the symbol half is not.** Ask (a),
  the **corpus**, is **done**: the shared repository exists, it is named
  `plurimath-testsuite`, and this package consumes it as a submodule pinned to a
  reviewed commit (§1). Ask (b), the **symbol data**, is still open — Ronald. It
  is higher leverage but implies the Ruby gem eventually generating its symbol
  classes from it, so it needs gem work and the maintainer's agreement, not just
  a repository; two sub-questions travel with it — whether symbol data shares
  `plurimath-testsuite` or gets its own repository, and who governs symbol ids
  once two implementations depend on them. Function classes are explicitly *not*
  shareable: 71 of 102 carry an `if`, `unless`, `case` or ternary node inside a
    `to_*` method — measured by Ripper over the 102 files directly under
    `lib/plurimath/math/function/` on the pinned oracle — unchanged if
    short-circuit `&&`/`||` count, since every such file already has a
    conditional. So sharing them would
  require a template DSL plus an interpreter per language — rejected as
  over-engineering.
- **Repo/directory handover:** this design dir becomes the `plurimath-ts`
  working tree; the POC directory is renamed and retired as a reference
  quarry.
