# TODO 6 — Add the MathML, LaTeX and AsciiMath renderers

## Why
Three renderers make the first vertical slice provable end to end: AsciiMath in,
and out again (round-trip), plus the two formats that exercise the most
structure. MathML additionally validates the XML layer against Ox's exact
output.

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
- `src/formatting/` — minimal number normalization only. Every numeric render
  in the gem routes through `Formatter::Numbers`, so the seam exists from the
  start; locales and configurable formatters come later (§9, P4+).

## Done when

- [ ] `toAsciimath`, `toLatex`, and `toMathml` match the gem byte-for-byte across
  the seed corpus.
- [ ] The runtime-boundary tests pass: a valid structural object renders, while an
  unknown kind and a malformed known kind each raise `RenderError`.
- [ ] The package-isolation gate shows `/asciimath` carrying no MathML or LaTeX
  data, and `/mathml` carrying no parser.
