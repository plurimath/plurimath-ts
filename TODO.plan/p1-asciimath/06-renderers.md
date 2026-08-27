# TODO 6 — Add the MathML, LaTeX and AsciiMath renderers

## Why
Three renderers make the first vertical slice provable end to end: AsciiMath in,
and out again (round-trip), plus the two formats that exercise the most
structure. MathML additionally validates the XML layer against Ox's exact
output. UnicodeMath is not part of this item: it was scoped to P2 and landed
separately during P1, so the phase has four renderers while this item has
three.

Renderers are modules, not methods on nodes (D2): a page converting AsciiMath
to MathML must not download LaTeX or OMML code.

## Scope
- `src/xml/element.ts` — element tree plus an **Ox-compatible serializer**:
  two-space indent, self-closing empty elements, single-line elements whose
  children are all text, and the gem's `REPLACABLES` post-processing.
- One module per renderer, each with a single recursive dispatcher:
  ```ts
  function renderNode(node: MathNode, ctx: RenderContext): XmlElement | string {
    switch (node.kind) {
      case "frac": return renderFrac(node, ctx);
      ...
      default: throw new RenderError(...);   // assertNever is the compile half
    }
  }
  ```
  - Cases delegate to renderer-private helpers; deep-structure behaviour from
    the gem (fence pairing, table parens, unary spacing) lives there, never on
    nodes, never shared across formats.
  - `RenderContext` is immutable; child rendering derives a new one.
  - Every entry function takes an options object, even where it is empty today.
- `src/formatting/` — the formatter contract, plus the numeric behaviour these
  three renderers actually reach. Measured in the gem: each of `Math::Number`'s
  six render methods goes through `Formatter::Numbers` (`number.rb` — the
  UnicodeMath one has a single earlier exit, for mini-sized digits), and with no
  formatter configured `format_value_with_options` returns the raw value
  unchanged. The pinned corpus was generated with
  `configuration: {}` — recorded in the testsuite's `corpus/provenance.yaml` —
  so it exercises exactly that path: integers and decimals, verbatim, wrapped
  as `<mn>` for MathML.
  - P1 owns: the contract and the per-renderer adapter seam; the no-formatter
    passthrough; and the locale-derived decimal marker the grammar reads
    (TODO 4). A `Number` carrying `base` still renders as its raw value while
    no formatter is configured — the gem returns `value` untouched in that
    case — so base *notation* is not P1 work; what is P1 work is that the
    field survives the model and the passthrough unchanged.
  - P4 keeps only what P1 never exercises: locale tables beyond the decimal
    marker, significant digits and precision, scientific and engineering
    notation, and configurable formatters (§9).

## Two verification matrices — fixtures, not abstractions

Both are committed tables of input → the gem's exact output. Neither adds a
type, an interface, or a layer.

**MathML options.** `Formula#to_mathml` takes six keyword options
(`formula.rb`): `intent`, `formatter`, `unitsml`, `split_on_linebreak`,
`display_style`, `unary_function_spacing`. Two of the six landed with this
item: `MathmlOptions` implements `displayStyle` and `unaryFunctionSpacing`, and
the other four are refused by name through `DEFERRED_OPTIONS`. `intent` is the
compat class's **only optional argument** (§4), so P2's compat class inherits
whatever P1 does or does not do here. The fixture records, per option: the
gem's output with it on and off for at least one input, and whether this port
implements it or defers it to a named phase. What it prevents: a renderer that
passes the whole corpus, because the corpus was generated with defaults, and is
wrong the first time a caller passes `intent: true`.

**XML byte fidelity.** "Ox-compatible serializer" currently names four things:
indentation, empty elements, text-only children, and `REPLACABLES`. Byte
equality needs more than that, so the fixture pins one small document per
property:

- attribute order — the gem builds `<math>` with `xmlns` then `display`, and
  the serializer must not reorder or sort;
- namespace prefixes — MathML's default `xmlns` now; OMML's `m:` prefix when
  P2 arrives, which is why the property is named here rather than after;
- self-closing form — `<mo rspace="thickmathspace"/>`, which the corpus
  already contains;
- escaping — text and attribute values are separate paths, so separate cases;
- entity form — the gem post-processes its dumped XML through
  `Math::Core::REPLACABLES` (`&amp;` → `&`, plus a leading newline stripped),
  and the corpus carries references such as `&#x2192;` unescaped;
- whitespace in mixed content — where a newline and indent appear, and where
  they must not.

What it prevents: output that is structurally right and byte-wrong. The corpus
does catch that, but as one failing document with no name for the cause; this
turns it into a named property with a one-line diff.

## Done when

- [x] `toAsciimath`, `toLatex` and `toMathml` match the gem byte-for-byte
  across the **reachable** pinned corpus.
- [x] The runtime-boundary tests pass: a valid structural object renders, while an
  unknown kind and a malformed known kind each raise `RenderError`.
- [x] The package-isolation gate shows `/asciimath` carrying no MathML or LaTeX
  data, and `/mathml` carrying no parser.
- [x] The MathML option matrix lists all six options, each marked implemented
  here or deferred to a named phase, and every implemented one matches the gem
  byte-for-byte on the fixture's inputs.
- [ ] The byte-fidelity fixture covers the six properties above, and each one
  is shown failing on its own — break one property in the serializer, watch
  exactly that assertion fail, restore. A fixture never seen failing proves
  nothing.
- [x] Every numeric form in the pinned corpus renders byte-identically in all
  three formats with no formatter configured.
