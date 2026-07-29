# P5 — 1.0, stability and takeover

**Status: planned.** Everything that must be true before this package claims to
replace `plurimath-js`. These land together, by design: stability is promised
exactly when the package starts claiming to be a drop-in replacement.

## What it delivers

**A complete compat class.** Its constructor accepts six input formats, so it
is only honest once all six exist. Until then, unimplemented formats raise
`UnsupportedFormatError` and the package does not claim drop-in status.

**A locked `/core`.** The census-complete node union, constructor signatures,
the equality projection, and the error contract become semver-stable. Through
the `0.x` line they are explicitly experimental and breaking changes are
announced in release notes; after 1.0 a new upstream node kind is a **major**
release.

**The npm name transfer**, and deprecation of `plurimath-js`.

## Why here

Last, because a stability promise is only meaningful once there is nothing
substantial left to change. Locking the model earlier would either be a lie or
a constraint on phases that had not happened yet.

## Risks and notes

Three decisions must be settled before this milestone, not during it — all
tracked in [open decisions](../open-decisions.md):

- **UnitsML parity.** `plurimath-js` supports UnitsML today and ships tests for
  it (`spec/unitsml.spec.js` converts `"unitsml(kg)"` through AsciiMath, LaTeX
  and MathML). Either parity exists at takeover, or the break is documented and
  the "drop-in replacement" language goes.
- **The package name and release line.** The Opal package currently owns
  `@plurimath/plurimath`.
- **The compat `data` property.** The published class exposes a writable `data`
  holding an Opal `ParserResult`, which cannot be reproduced.

## Exit criteria

- [ ] Every phase complete.
- [ ] Compat ABI fixture and runtime tests passing against the published
      `plurimath-js` surface.
- [ ] `/core` schema locked and versioned.
- [ ] The three decisions above recorded rather than assumed.
- [ ] Final review round with findings resolved, and sign-off recorded.
