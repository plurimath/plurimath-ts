# TODO 7 — Activate the P1-baseline gates

## Why
A milestone is only reached when its gates prove it. Advancing
`gates.json#currentMilestone` and adding the runners happen in the same change,
so a gate can never be "active but unrunnable" (ARCHITECTURE.md §7).

## Scope
- Add the test suites the registry already names:
  - `corpus-conformance` — parse tree, normalized model, and each landed
    renderer against the generated expectations.
  - `runtime-boundary` — valid structural object renders; unknown kind and
    malformed known kind raise `RenderError`.
  - `unsupported-fallback` — `"unitsml(...)"` becomes `Text`, renders in all
    three formats, warns once per unique construct, and reports an offset into
    the *original* input; `onUnsupported` replaces, silences, and can escalate.
  - `payload-validation` — generated payloads match their schema and the
    manifest hashes.
- `scripts/oracle` — the class-B entry point (needs a gem checkout):
  `regenerate --check` must produce an empty diff.
- Extend the package-isolation gate's forbidden-import table as the
  `/asciimath`, `/mathml`, and `/latex` subpaths appear.
- Set `currentMilestone` to `P1-baseline` in the same commit.

## Done when

- [ ] `pnpm check` reports nine active class-A gates, all passing.
- [ ] `scripts/oracle regenerate --check` is clean against a clean gem checkout.
- [ ] The phase-exit checklist is satisfied: gates green, plus the class-C
  evidence — a review round with findings resolved, and sign-off recorded.
