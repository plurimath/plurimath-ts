# TODO 7 — Activate the P1-baseline gates

## Why
A milestone is only reached when its gates prove it. Advancing
`gates.json#currentMilestone` and adding the runners happen in the same change,
so a gate can never be "active but unrunnable" (ARCHITECTURE.md §7).

## Scope
- Add the test suites the registry already names:
  - `corpus-conformance` — parse tree, normalized model, and each landed
    renderer against the generated expectations, over the corpus **discovered
    in the submodule** (below).
  - `runtime-boundary` — valid structural object renders; unknown kind and
    malformed known kind raise `RenderError`.
  - `unsupported-fallback` — `"unitsml(...)"` becomes `Text`, renders in all
    four formats, warns once per unique construct, and reports an offset into
    the *original* input; `onUnsupported` replaces, silences, and can escalate.
  - `payload-validation` — generated payloads match their schema and the
    recorded hashes.
- **Corpus discovery fails unless all of this holds.** No gate today requires
  the corpus to exist at all, and this repository has already shipped a gate
  that reported success while inspecting zero modules (`depcruise src` cruised
  nothing and passed). Discovery is the same shape of hazard, so it asserts
  presence, not absence of error:
  - the submodule path recorded in `.gitmodules` exists **and is initialized** —
    an uninitialized submodule is an empty directory, which otherwise reads as
    "no cases, nothing failed";
  - at least one payload file loads, and at least one case loads from it —
    both counts asserted nonzero, not merely iterated over;
  - every expected AsciiMath group is present: `fences`, `frac`, `matrices`,
    `mixed`, `nary`, `numbers`, `operators`, `powers`, `quoted-text`, `roots`,
    `symbols`, `unary-functions`, `whitespace`. The list is committed here, so
    a pin that silently loses a group fails rather than shrinking the run;
  - every group declares the target keys P1 renders — `asciimath`, `latex`,
    `mathml` — and every case carries an expectation for each;
  - **every discovered payload is validated**, against the case schema and
    against its `sha256` and `bytes` in `corpus/provenance.yaml`. Validating
    only the payloads a test happens to read leaves the rest unchecked;
  - nothing resolves to the pre-split copy at `corpus/asciimath/` in this
    repository. TODO 1 deletes it; this rule is what stops it coming back and
    quietly becoming the thing the suite checks against.
- `scripts/gate-oracle.rb` — the class-B entry point (needs a gem checkout). Two
  separate checks, because they have different owners and different failure
  meanings:
  - `repo --check` over **this repository's** generated data — census,
    exclusions, symbol slices, core data — must produce an empty diff;
  - a **testsuite** check: regenerate the pinned corpus in the submodule from
    the same clean gem checkout and diff it. A difference there is a testsuite
    change, reported as such, and fixed by moving the pin rather than by
    editing anything here.
- Extend the package-isolation gate's forbidden-import table as the
  `/asciimath`, `/mathml`, and `/latex` subpaths appear.
- Set `currentMilestone` to `P1-baseline` in the same commit.

## Done when

- [x] `pnpm check` reports nine active class-A gates, all passing.
- [x] `scripts/gate-oracle.rb repo --check` is clean against a clean gem checkout,
  and the testsuite regeneration check is reported separately from it.
  Both exit 0 against `plurimath-oracle` at the pinned `00c52783`.
- [x] Each discovery failure is demonstrated, not asserted: a deinitialized
  submodule, an empty corpus directory, a group removed from a scratch copy, a
  case missing a target key, and a corrupted payload byte each fail the run.
  Five red-green proofs, one per rule.
  Four were already in `test/core/corpus-pin.spec.ts`. The fifth — a group
  removed from *both* the payload directory and the provenance, which leaves a
  pin the reader has no objection to — is proven in "a pin that quietly loses a
  group": it loads clean at 12 payloads and 64 cases, and the same
  `assertExpectedGroups` that the shipped pin passes throws when applied to it.
  The assertion is run against both pins in that test, because showing only
  that two group lists differ would not show that anything rejects the damaged
  one.

  One rule in the list above was **not** in fact covered when this item was
  first written up: that every group declares `asciimath`, `latex` and
  `mathml`. The reader enforces only that each case carries whatever its own
  payload declared, and the three `render-parity.spec.ts` suites iterate
  `readCorpusCases()`, which drops excluded cases — so a group whose cases were
  all withheld could stop declaring a target with every suite still green.
  `test/gates/corpus-discovery.spec.ts` now asserts the required set directly,
  and proves the assertion rejects a payload that declares two of the three.
- [x] `currentMilestone` is `P1-baseline`, and every gate that activates with
  it has a runner in the same change. P1 is **not** finished here — see
  [item 8](08-p1-completion.md).
- [ ] The milestone-exit checklist is satisfied: gates green, plus the class-C
  evidence — a review round with findings resolved, and sign-off recorded.
