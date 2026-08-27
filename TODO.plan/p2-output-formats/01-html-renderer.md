# TODO 1 — Add the HTML renderer

## Why
HTML is the smallest of the renderers P2 still owes, and the port's node model already
covers everything AsciiMath can produce, so it needs no new node kinds — only a
`html.ts` per existing kind. That makes it the cheapest place to find out whether the
add-a-format process that landed UnicodeMath generalises, before tackling OMML's larger
surface.

## Scope

### Measured surface

Against the port's 38 render kinds, on the pinned oracle (00c52783):

- **15 define their own `to_html`**: `base`, `binary-function`, `ceil`, `ddot`,
  `fenced`, `font-style`, `formula`, `linebreak`, `number`, `prod`, `sum`, `table`,
  `ternary-function`, `text`, `unary-function`.
- **20 inherit a carrier default**: thirteen from `UnaryFunction`, four from
  `BinaryFunction` (`color`, `frac`, `overset`, `underset`), two from `TernaryFunction`
  (`int`, `oint`), and `mpadded` from `UnaryFunction`.
- **`symbol`** defines its own; **`mrow`** inherits `Formula`'s.

For scale, excluding `symbol` from each count: UnicodeMath needed 34 own overrides,
OMML needs 35 implementations, and HTML needs 15 own overrides.

The carrier defaults, measured rather than read (`options: {}`, a single `Symbol("x")`
per slot):

| carrier | output |
|---|---|
| `UnaryFunction` (via `Abs`) | `<i>abs</i><i>x</i>` |
| `BinaryFunction` (via `Frac`) | `<i>x</i><i>x</i>` |
| `TernaryFunction` (via `Int`) | `<i>x</i><i>x</i><i>x</i>` |
| `Mrow` | `x` |
| `Symbol` | `x` |

Note the asymmetry: a bare `Symbol` renders `x`, but the unary carrier wraps its slot as
`<i>x</i>`. The `<i>` comes from the carrier, not the symbol — so it cannot be assumed
from the symbol's own output.

### The trap this item must not fall into

**`Nary` has no `to_html` at all.** It is not inherited from `Core` either: the method
does not exist anywhere in its ancestry, and `Nary#to_html` raises `NoMethodError`
(measured). The port must reproduce that refusal. A renderer that emits HTML for an
`nary` node would be *more correct than the gem*, which PORTING-STANDARDS.md's first rule
makes a defect, not an improvement.

## Done when

- [ ] `toHtml` matches the gem byte-for-byte across the pinned corpus, for every case the
      corpus reaches.
- [ ] The 15 own-override kinds are each measured against the oracle, not derived from a
      sibling format.
- [ ] The three carrier defaults are pinned by a behavioural test each, so a later change
      to one carrier cannot silently alter twenty kinds.
- [ ] `nary` raises rather than rendering, and a test pins the refusal.
- [ ] The corpus declares an `html` target and every case carries an expectation for it —
      the reader asserts a nonzero case count for it, equal to the group's own count.
- [ ] The cross-format invariant gates cover HTML: `runtime-boundary`,
      `unsupported-fallback` and `adversarial-inputs`, plus the class-B differential
      runner on both halves. All four currently cover four formats; HTML makes five.
- [ ] `/html` is a published subpath with package-isolation assertions, and its expected
      exports and forbidden layers are listed in `scripts/gate-package.mjs` — the runner
      enumerates subpaths from `package.json#exports`, but a subpath absent from those
      tables silently skips both assertions.
