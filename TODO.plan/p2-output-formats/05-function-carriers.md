# P2.5 — The OMML function carriers

## Why

After the generated symbol table was wired in (`04-symbol-data.md`), `13` of the
`92` gem-renderable cases in `test/formats/omml/parity-fixtures.json` still
refused. None of them was symbol data. All `13` were carrier work:

| refusal | cases |
|---|---:|
| `UnaryFunction` alias not measured | 6 |
| `BinaryFunction` alias not measured | 6 |
| single-column `m:eqArr` table branch deferred | 1 |

`left-right-round`, `left-right-square`, `left-right-around-frac`,
`unary-sin-bare`, `unary-sin-fenced`, `unary-cos-product`, `mod-simple`,
`mod-numeric`, `mod-in-expression`, `nary-lim`, `nary-log-base`, `root-cube`,
`matrix-column`.

A per-case implementation would have answered each alias in isolation and
learned nothing about the other 56. The family question — *which aliases have
an OMML method of their own?* — is one probe, and answering it first is what
turns "add `Sin`" into "add the 15 classes `Sin` is one of".

## Measurement

On the pinned oracle `00c52783`, over every class `corpus/census.yaml` records
as aliasing `Math::Function::UnaryFunction` (48) or
`Math::Function::BinaryFunction` (14), reading
`instance_method(:to_omml_without_math_tag).owner` for each (exit `0`):

| carrier | inherit the base method | own one |
|---|---:|---:|
| `UnaryFunction` | 15 | 33 |
| `BinaryFunction` | 3 | 11 |

The 15: `Arccos`, `Arcsin`, `Arctan`, `Cos`, `Cosh`, `Cot`, `Coth`, `Csc`,
`Csch`, `Sec`, `Sech`, `Sin`, `Sinh`, `Tan`, `Tanh`. Their `class_name` was read
in the same probe and is the ASCII lowercase of the basename for all 15, so one
code path with a label argument covers them.

The 3: `Arg`, `Intent`, `Mlabeledtr`. Rendered live, each gives the same nested
`<m:r><m:r>…</m:r><m:r>…</m:r></m:r>` the bare carrier does.

Six overriders were then measured one at a time, over filled, `nil`, `false`,
list and empty-list slots, with `hide_function_name` set and clear, and with
display style on and off: `Left`, `Right`, `Mod`, `Lim`, `Log`, `Root`. Four
findings a reader would otherwise have assumed wrong:

- **`Left`/`Right` hold a bare String**, not a node, and append it straight to
  `m:t`. `Left.new(Symbol.new("x"))`, `Left.new([])`, `Left.new(0)` and
  `Left.new(true)` all raise `NoMethodError: undefined method 'xml_nodes'`.
- **`left_paren` is not on the OMML path.** The `\{` → `{` rewrite that
  `to_mathml`, `to_latex` and all four math-zone arms apply is absent from
  `to_omml_without_math_tag`: `Left.new("\\{")` renders `\{`.
- **The unary carrier's empty-slot guard precedes its `hide_function_name`
  branch.** `Sin.new(nil)` renders `<m:r><m:t>sin</m:t></m:r>` whether the flag
  is set or not; `Sin.new([])` is truthy in Ruby and renders the whole `m:func`
  tree around an empty `<m:e/>`.
- **`Log` and `Lim` split on display style differently** despite sharing two
  slots. `Log` never reads it — the same `m:sSubSup` either way. `Lim` is
  `BinaryFunction#underover`, which builds `Overset`/`Underset` under display
  style and delegates to `PowerBase` without it.

`Table#single_td_table` was measured over one-cell `Tr` rows, `Td` rows, a
two-value cell and a row-less table. Its `m:eqArrPr` is unconditional, so
`Table.new([])` renders an `m:eqArr` carrying only its properties.

## Corpus effect

Re-measured by running every gem-renderable case through the port and
byte-comparing, not projected:

| | before | after |
|---|---:|---:|
| gem-renderable cases | 92 | 92 |
| rendered, matching the gem | 78 | 91 |
| rendered, pinned divergence | 1 | 1 |
| refused with a typed `RenderError` | 13 | 0 |
| threw untyped | 0 | 0 |

`PORT_REFUSES` is empty and `RENDERED_BASELINE` moved `79` → `92`. The one
divergence in both columns is `text-unitsml-valid`, the pre-existing UnitsML
entry in `KNOWN_DIVERGENCES`.

The degenerate-slot sweep was re-measured the same way: `5` of its `14` refusals
are gone — `sin[0]` against `nil`, `false`, `[]` and a bare node, and
`table[0]=empty-array` — and all five reproduce the gem's bytes. The remaining
`9` are `Td`'s `Array()` coercion and `requireString`, neither of which is
carrier work.

## Not in scope

- The 33 unary and 11 binary aliases that own an OMML method and are not among
  the six measured here. Each keeps its `RenderError`, whose stated reason is
  true: the slice has not measured it. Nothing in the pinned corpus reaches
  them.
- `renderTd`'s empty-cell branch, and `Td#initialize`'s `Array()` coercion —
  both named in `DEGENERATE_REFUSES`, both about `Td`, not about the aliases.
- No generator, generated-file, corpus, gate-registry or testsuite change.

## Done when

- [x] Which aliases inherit the base OMML method is measured over the whole
      census projection, not decided per case.
- [x] Every alias the slice renders has its branch pinned in
      `test/formats/omml/renderer.spec.ts` against bytes captured from the
      pinned oracle, including the Ruby-falsy and `hide_function_name` arms.
- [x] `PORT_REFUSES`, `RENDERED_BASELINE` and `DEGENERATE_REFUSES` are written
      from a measured run, never hand-edited to fit.
- [x] Every remaining refusal states a reason that is true of the gem.
- [x] `pnpm check` and `pnpm boundaries` pass.
