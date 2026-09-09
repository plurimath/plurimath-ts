# Open decisions

Deliberately unsettled, each with an owner and the point by which it must be
answered. `ARCHITECTURE.md` §11 is the authoritative list; this page adds the
context needed to decide. The table below is what is still open. Two compat
questions — the `data` property and the declaration target — were settled on
2026-09-04 and are kept below, marked SETTLED, so the reasoning that settled
them is not lost.

Nothing here blocks the active phase.

| Decision | Owner | Needed by |
|---|---|---|
| UnitsML approach, and its 1.0 consequence | maintainer + upstream | before 1.0 |
| npm package name and release line | maintainer | before first publish |
| Bundle budgets | maintainer | during P1, from real numbers |
| Symbol data as shared data | maintainer + gem | after P1 |
| MathML/OMML input strategy | maintainer | P4 planning |

## UnitsML, and what it means for 1.0

Deferred because the upstream JavaScript package is unusable
([cross-cutting](cross-cutting.md)). The coupling to worry about: `plurimath-js`
supports UnitsML today, so at package takeover either parity exists or the
break is documented and the "drop-in replacement" claim is dropped.

Options when it returns: fix upstream and bridge behind the leaf-service
boundary; port UnitsML natively; or keep deferring.

## npm package name and release line

The Opal package owns `@plurimath/plurimath`. Design position: publish `0.x`
early under a distinct name, explicitly experimental, and take the name over at
1.0 when the compat class is complete and `/core` locks.

## Compat `data` property

Both measured class declarations expose a writable `data` holding an Opal
`ParserResult` — runtime-specific and not reproducible (published
[`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts);
source head `ce297e2`, `src/index.ts:4-9`). Either expose a name-compatible
`readonly data: FormulaNode`, or document its absence.

**SETTLED 2026-09-04: expose `readonly data: FormulaNode`.** Same property name,
this port's model behind it. A consumer that READS `.data` gets something
meaningful; one that WRITES it breaks under either choice, so exposing it strictly
dominates. This is what `ARCHITECTURE.md` §11 already recommended.

The declaration fixture records this separately from the declaration-target
choice, because the two are independent.

## Compat declaration target

The published `@plurimath/plurimath@0.2.2` declarations and source head
`ce297e2` differ in three measured ways: published `0.2.2` has six methods,
`toMathml()` takes no argument, and its `Format` union contains `mahtml`; source
head has seven methods by adding `toUnicodemath()`, declares
`toMathml(intent?: boolean)`, and uses `unicode` (published
[`dist/index.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/index.d.ts)
and [`dist/plurimath-opal.d.ts`](https://unpkg.com/@plurimath/plurimath@0.2.2/dist/plurimath-opal.d.ts);
source head `src/index.ts:4-38` and `src/plurimath-opal.d.ts:8`; the maintainer's
independent `curl` fetched both published files with exit `0`).

**SETTLED 2026-09-04: source head.** The maintainer's reasoning, which is the
whole argument: this package has published nothing, so it carries no
compatibility debt to any consumer, and there is no reason to inherit a defect
it is not bound by. `mahtml` appears only in a TypeScript declaration, so it is
compile-time only; freezing the fixture against it would make a typo permanent
in exchange for nothing.

The `mahtml` spelling is logged as an upstream item in
`~/ruby_gems/plurimath/PORT-FINDINGS.md:96-98` — verified by reading that file on
2026-09-04 — to be fixed there rather than mirrored here. Upstream work is
deliberately not started yet.

## Bundle budgets

Deferred on purpose: ceilings set before the first real measurement would be
invented. Once P1 produces `/asciimath`, `/mathml`, `/latex` and `/unicodemath`, the isolation
gate reports chunk and source-module counts, not bytes, so a size budget
would need a new measurement rather than a threshold on what it already prints.

## Symbol data as shared data

The corpus half of this question is **settled**: the shared repository exists,
it is named `plurimath-testsuite`, and this package consumes it as a submodule
([cross-cutting](cross-cutting.md)).

What is still open is the bigger half. Making symbol data authoritative means
the Ruby gem generating its symbol classes from it, so it needs the
maintainer's agreement and gem work, not just a repository. Two sub-questions
travel with it: whether symbol data shares `plurimath-testsuite` or gets its
own repository, and who governs symbol ids once two implementations depend on
them.

Nothing blocks the port meanwhile: symbol data is generated straight into this
repository as TypeScript.

## MathML/OMML input strategy

The gem delegates to the `mml` and `omml` gems, and the organisation ships an
Opal-compiled `@plurimath/mml`. Same shape as the UnitsML question, and the
same caution: evaluate on evidence — does it publish working artifacts, and
does it yield a native model or an Opal one?

Both halves are now answered, measured 2026-09-09 against the gem at
`00c52783` (`mml` 2.4.1, the version its `Gemfile.lock` resolves).

- **Working artifacts: no.** `@plurimath/mml@0.1.0` — its only version,
  published 2026-07-08 — ships exactly three files: `LICENSE`, `package.json`
  and `README.md`. Its `files` field lists `dist`, and every entry point
  (`main`, `module`, `browser`, `types`, `exports`) points inside a `dist/`
  the tarball does not contain, so importing it fails. This is the
  `@unitsml/unitsml@0.6.7` defect exactly, in the same organisation
  ([cross-cutting](cross-cutting.md)), and worth reporting for the same reason.
- **Native model: no.** The package describes itself as "Opal-compiled with
  optional shared runtime from `@lutaml/opal-runtime`" — the runtime this port
  exists to replace.

Bridging to the published package is therefore closed on evidence, leaving a
native port or continued deferral.

### What a native port would involve

MathML input has a different shape from every format ported so far. There is no
Parslet grammar and no `mathml/transform.rb`; `mathml/parser.rb` is 29 lines
that call `Mml.parse` (XML text to an `Mml::V4::*` model) and then
`Mathml::Translator#mml_to_plurimath`, a recursive walk over 44
`when Mml::V4::…` branches. **pegkit has no part in it.**

- The `mml` gem is 11,605 lines over 320 files, but the translator consumes a
  thin slice: `each_mixed_content`, `value`, and about 26 attribute readers.
  The model adds no semantics over the XML — across 25 attributes on 6 element
  types, every attribute absent from the source read back `nil` rather than a
  schema default; `display="block"` and `displaystyle="true"` arrive as
  `String` rather than coerced booleans; `value` is an `Array` of `String`. A
  reader plus an element-name map reproduces what the translator consumes, so
  lutaml-model's machinery would not need porting.
- The translating logic itself is `translator.rb` (601 lines),
  `formula_transformation.rb` (460) and `constants.rb` (418) — 1,479 lines.
- **A contract gap either way:** `src/xml` is write-only. It exports
  `XmlElement`, `dump` and `dumpNodes` and no reader, and `ARCHITECTURE.md` §3
  describes the layer as "XML element tree + Ox-compatible serializer". MathML
  input needs an XML *reader* in layer 1, which the module map does not
  describe, so §3 changes before any of this code lands.

Oracle available today: of the 111 corpus cases carrying an `expected.mathml`,
110 re-parse through `Math.parse(text, :mathml)` on the gem (the remaining one
raises `ParseError`). They exercise 19 distinct element classes of the 44 the
translator dispatches on, so the corpus alone would lock under half the
surface; the rest needs cases written for it.

Behaviour a port would have to reproduce, measured identically under both the
Ox and Oga adapters — so there is a single answer, not an adapter-dependent one:

- Named character entities are **not** decoded. `<mi>&alpha;</mi>` survives as
  the literal text `&alpha;` and renders back as `<mi>&#x26;alpha;</mi>`, where
  the same symbol reached through AsciiMath `alpha` gives `<mi>&#x3b1;</mi>`.
  Numeric references (`&#x3B1;`) and the predefined XML entities (`&amp;`) are
  decoded normally. A reader written for this port must therefore leave named
  entities alone.
- Unknown elements are dropped silently:
  `<math><bogus>x</bogus><mi>y</mi></math>` parses to `y`.
- Content MathML (`<apply>`, `<ci>`, `<cn>`) raises `ParseError`: the
  translator's `else` branch (`translator.rb:64-65`) has no content-element
  case, although `mml` models those elements.
