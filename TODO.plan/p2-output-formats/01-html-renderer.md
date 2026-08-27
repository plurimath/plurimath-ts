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

- **16 define their own `to_html`**: `base`, `binary-function`, `ceil`, `ddot`,
  `fenced`, `font-style`, `formula`, `linebreak`, `number`, `prod`, `sum`, `table`,
  `ternary-function`, `text`, `unary-function`, and `symbol`.
- **21 inherit a carrier default**: fourteen from `UnaryFunction`, four from
  `BinaryFunction` (`color`, `frac`, `overset`, `underset`), two from `TernaryFunction`
  (`int`, `oint`), and `mrow` from `Formula`.
- **1 is missing `to_html`**: `nary`.

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

### Coverage after phase two, part B

The dispatch table is now total over all 38 kinds: all 21 inherited kinds, all 16
own-implementing kinds, and the measured `nary` refusal. The former partial-slice guard
is gone; its compile-time replacement is a mapped table with one entry per `NodeKind`,
while the runtime unknown-kind guard remains for untyped JavaScript callers.

Part B measured the final nine own implementations with `options: {}` and one plain
`Symbol("x")` per occupied slot, plus each kind's own structural cases:

| kind | measured occupied output | structural result |
|---|---|---|
| `base` | `<i>x</i><sub>x</sub>` | each nil slot disappears; an array in either slot raises |
| `ceil` | `<i>&#x2308;</i><i>x</i><i>&#x2309;</i>` | nil omits only the child wrapper; an array raises |
| `ddot` | `<i>x</i><i>..</i>` | nil omits the child wrapper; an array raises |
| `fenced` | `<i>x</i>x<i>x</i>` | body members join without separators; named parens needing generated data refuse |
| `font-style` | `x` | all 14 measured aliases return the child alone; nil returns nil |
| `linebreak` | `<br/>x` | `linebreakstyle: "after"` gives `x<br/>`; nil gives `<br/>` |
| `prod` | `<i>&prod;</i><sub>x</sub><sup>x</sup>` | the third/body slot is ignored, including an array |
| `sum` | `<i>&sum;</i><sub>x</sub><sup>x</sup>` | the third/body slot is ignored, including an array |
| `table` | `<table><tr><td>x</td></tr></table>` | all 10 aliases share the tree; nil value raises, empty value gives `<table></table>` |

`Table` reaches the measured `Tr#to_html` and `Td#to_html` overrides represented by the
existing `unaryFunction` and `binaryFunction` kinds. They emit `<tr>…</tr>` and
`<td>…</td>` respectively, joining children without separators.

One `fenced` subpath stays deliberately unavailable without omitting the kind: named
`Paren::*` nodes with no stored value require generated symbol data, and formula/mrow/
table nodes in paren slots interpolate object-address-bearing Ruby `#inspect` bytes.
Both refuse explicitly; the decision is recorded in `TODO.plan/deferred.md`.

### Phase two, part A measurements

The part-A probe called `to_html(options: {})` with one plain `Symbol("x")` per occupied
slot, then replaced each slot position with `nil` and `[]` in turn. All 17 requested
kinds inherited from the expected carrier; none defined its own method or reached
generated HTML symbol data.

| kind | carrier | occupied slots | nil slot | empty slot |
|---|---|---|---|---|
| `bar` | unary | `<i>¯</i><i>x</i>` | `<i>¯</i>` | `<i>¯</i><i></i>` |
| `color` | binary | `<i>x</i><i>x</i>` | `<i>x</i>` in either position | raises in either position |
| `dot` | unary | `<i>dot</i><i>x</i>` | `<i>dot</i>` | `<i>dot</i><i></i>` |
| `floor` | unary | `<i>floor</i><i>x</i>` | `<i>floor</i>` | `<i>floor</i><i></i>` |
| `hat` | unary | `<i>^</i><i>x</i>` | `<i>^</i>` | `<i>^</i><i></i>` |
| `mpadded` | unary | `<i>mpadded</i><i>x</i>` | `<i>mpadded</i>` | `<i>mpadded</i><i></i>` |
| `norm` | unary | `<i>norm</i><i>x</i>` | `<i>norm</i>` | `<i>norm</i><i></i>` |
| `obrace` | unary | `<i>&#x23de;</i><i>x</i>` | `<i>&#x23de;</i>` | `<i>&#x23de;</i><i></i>` |
| `oint` | ternary | `<i>x</i><i>x</i><i>x</i>` | two `<i>x</i>` wrappers in any position | raises in any position |
| `overleftrightarrow` | unary | `<i>&#x20e1;</i><i>x</i>` | `<i>&#x20e1;</i>` | `<i>&#x20e1;</i><i></i>` |
| `overset` | binary | `<i>x</i><i>x</i>` | `<i>x</i>` in either position | raises in either position |
| `sqrt` | unary | `<i>sqrt</i><i>x</i>` | `<i>sqrt</i>` | `<i>sqrt</i><i></i>` |
| `tilde` | unary | `<i>~</i><i>x</i>` | `<i>~</i>` | `<i>~</i><i></i>` |
| `ubrace` | unary | `<i>&#x23df;</i><i>x</i>` | `<i>&#x23df;</i>` | `<i>&#x23df;</i><i></i>` |
| `ul` | unary | `<i>underline</i><i>x</i>` | `<i>underline</i>` | `<i>underline</i><i></i>` |
| `underset` | binary | `<i>x</i><i>x</i>` | `<i>x</i>` in either position | raises in either position |
| `vec` | unary | `<i>&#x2192;</i><i>x</i>` | `<i>&#x2192;</i>` | `<i>&#x2192;</i><i></i>` |

The measured surprise is that eight unary labels are not the lowercase class name:
`bar` uses `¯`, `hat` uses `^`, `obrace`, `overleftrightarrow`, and `ubrace` use literal
HTML entities, `tilde` uses `~`, `ul` uses `underline`, and `vec` uses `&#x2192;`.
These bytes are reproduced directly rather than normalized.

### The trap this item must not fall into

**`Nary` has no `to_html` at all.** It is not inherited from `Core` either: the method
does not exist anywhere in its ancestry, and `Nary#to_html` raises `NoMethodError`
(measured). The port must reproduce that refusal. A renderer that emits HTML for an
`nary` node would be *more correct than the gem*, which PORTING-STANDARDS.md's first rule
makes a defect, not an improvement.

## Done when

- [ ] `toHtml` matches the gem byte-for-byte across the pinned corpus, for every case the
      corpus reaches.
- [x] The 15 own-override kinds are each measured against the oracle, not derived from a
      sibling format.
- [x] The three carrier defaults are pinned by a behavioural test each, so a later change
      to one carrier cannot silently alter twenty kinds.
- [x] `nary` raises rather than rendering, and a test pins the refusal.
- [ ] The corpus declares an `html` target and every case carries an expectation for it —
      the reader asserts a nonzero case count for it, equal to the group's own count.
- [ ] The cross-format invariant gates cover HTML: `runtime-boundary`,
      `unsupported-fallback` and `adversarial-inputs`, plus the class-B differential
      runner on both halves. All four currently cover four formats; HTML makes five.
- [ ] `/html` is a published subpath with package-isolation assertions, and its expected
      exports and forbidden layers are listed in `scripts/gate-package.mjs` — the runner
      enumerates subpaths from `package.json#exports`, but a subpath absent from those
      tables silently skips both assertions.
