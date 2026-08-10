/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * LaTeX render tables: the six measured tables `to_latex` reads that
 * no other generated slice supplies, plus the two carrier name lists
 * the latex dispatch reads, consumed by
 * `src/formats/latex/renderer.ts`.
 *
 * Every measured entry is read off the runtime — a live render per
 * row, never a source read (PORTING-STANDARDS.md), each re-verified
 * by the generator with a render that actually uses it. The sources
 * lie where the probes cannot: `Hash#invert` keeps the LAST key for
 * a duplicated value, and `validate_function_formula` is not
 * `Utility::UNARY_CLASSES` — ker, liminf, limsup and sup sit in that
 * parse-side list yet take the `{ \left ( … \right ) }` wrap.
 *
 * The two carrier name lists are not measured here: they are the
 * same `get_class` census rows the asciimath transform-registry
 * slice carries, projected to class basenames per carrier and
 * emitted latex-side, because per-format slices are self-contained
 * by design — the latex module graph never imports another format's
 * data (ARCHITECTURE.md §3, the generated-data closure).
 */

/**
 * `Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert`, exactly as
 * `UnaryFunction#latex_paren` reads it: the stored paren string ->
 * the command `Left`/`Right` emit, in the gem's invert order.
 * `&#x2016;` maps to `\|` because Ruby's `Hash#invert` keeps the
 * LAST key for a duplicated value (asserted at generation); a miss
 * renders `.` (verified).
 */
export const LATEX_LEFT_RIGHT_PARENS: ReadonlyMap<string, string> = new Map([
  ["&#x5c;", "\\backslash"],
  ["&#x2329;", "\\langle"],
  ["&#x232a;", "\\rangle"],
  ["&#x230a;", "\\lfloor"],
  ["&#x230b;", "\\rfloor"],
  ["&#x2308;", "\\lceil"],
  ["&#x2309;", "\\rceil"],
  ["&#x7b;", "\\lbrace"],
  ["&#x7d;", "\\rbrace"],
  ["&#x5b;", "\\lbrack"],
  ["&#x5d;", "\\rbrack"],
  ["&#x2016;", "\\|"],
  ["&#x7c;", "\\vert"],
  ["}", "\\}"],
  ["{", "\\{"],
  ["(", "("],
  [")", ")"],
  ["<", "<"],
  [">", ">"],
  ["/", "/"],
  ["|", "|"],
  ["[", "["],
  ["]", "]"],
]);

/**
 * The unary names whose class answers `validate_function_formula`
 * false, so `latex_wrapped` gives them plain braces — measured per
 * class through an `Overset` render, sorted. NOT
 * `Utility::UNARY_CLASSES`: ker, liminf, limsup and sup sit there
 * yet take the wrap. `Left` and `Right` also answer false
 * (asserted) but carry their own renderer dispatch, so they are
 * omitted here. Membership only — the renderer asks `has` — so
 * the order is not semantic.
 */
export const LATEX_PLAIN_WRAPPED_UNARY_NAMES: readonly string[] = [
  "Arccos",
  "Arcsin",
  "Arctan",
  "Cos",
  "Cosh",
  "Cot",
  "Coth",
  "Csc",
  "Csch",
  "Deg",
  "Det",
  "Dim",
  "Exp",
  "Gcd",
  "Glb",
  "Lcm",
  "Lg",
  "Ln",
  "Lub",
  "Max",
  "Min",
  "Sec",
  "Sech",
  "Sin",
  "Sinh",
  "Tan",
  "Tanh",
];

/**
 * FontStyle subclass basename -> the `\math..` command its
 * `to_latex` override wraps its value in, measured per class
 * (`Bold.new(x)` -> `\mathbf{x}`), sorted by basename. A subclass
 * absent here was measured rendering its value alone, exactly like
 * the bare carrier (Ruby-nil out on nil in).
 */
export const LATEX_FONT_STYLE_COMMANDS: ReadonlyMap<string, string> = new Map([
  ["Bold", "\\mathbf"],
  ["DoubleStruck", "\\mathbb"],
  ["Fraktur", "\\mathfrak"],
  ["Italic", "\\mathit"],
  ["Monospace", "\\mathtt"],
  ["Normal", "\\mathrm"],
  ["SansSerif", "\\mathsf"],
  ["Script", "\\mathcal"],
]);

/**
 * Symbol id -> the environment a named table's open paren selects
 * (`matrix_class`: `MATRICES.invert[open_paren.to_matrices]`),
 * measured through a `Table::Matrix` render per paren, sorted by
 * class name. Exactly the parens defining `to_matrices`; any other
 * open paren raises NoMethodError in the gem (verified) —
 * RenderError in the port.
 */
export const LATEX_MATRIX_ENVIRONMENTS: ReadonlyMap<string, string> = new Map([
  ["Paren::Lcurly", "Bmatrix"],
  ["Paren::Lround", "pmatrix"],
  ["Paren::Lsquare", "bmatrix"],
  ["Paren::Norm", "Vmatrix"],
  ["Paren::Vert", "vmatrix"],
]);

/**
 * `Utility::ALIGNMENT_LETTERS.invert`, as `array_args` and
 * `latex_columnalign` read it: a td's `columnalign` -> its column
 * letter, in the gem's invert order. An unlisted alignment
 * contributes nothing (verified: the whole-row fallback is `.`).
 */
export const LATEX_ALIGNMENT_LETTERS: ReadonlyMap<string, string> = new Map([
  ["center", "c"],
  ["right", "r"],
  ["left", "l"],
]);

/**
 * Symbol id -> the `to_asciimath` value `Color#to_latex`
 * interpolates for its first slot, for exactly the ids the
 * corpus+sweep put there — a deliberately minimal policy slice
 * (TODO.plan/deferred.md); the renderer raises a parity-gap
 * RenderError for any other id.
 */
export const LATEX_COLOR_ASCIIMATH_SYMBOLS: ReadonlyMap<string, string> = new Map([
  ["Plus", "+"],
  ["Eqno", '"P{eqno}"'],
]);

/**
 * The class basenames the AsciiMath transform reaches through
 * the `Math::Function::UnaryFunction` carrier — the same
 * `get_class` census rows the asciimath transform-registry
 * slice carries, projected and emitted latex-side so the latex
 * carrier dispatch imports no other format's slice. The
 * renderer adds `Tr` itself (constructed without `get_class`).
 * Membership only — deduplicated and sorted.
 */
export const LATEX_UNARY_CARRIER_NAMES: readonly string[] = [
  "Arccos",
  "Arcsin",
  "Arctan",
  "Cancel",
  "Cos",
  "Cosh",
  "Cot",
  "Coth",
  "Csc",
  "Csch",
  "Deg",
  "Det",
  "Dim",
  "Exp",
  "Gcd",
  "Glb",
  "Ker",
  "Lcm",
  "Left",
  "Lg",
  "Liminf",
  "Limsup",
  "Ln",
  "Lub",
  "Max",
  "Min",
  "Right",
  "Sec",
  "Sech",
  "Sin",
  "Sinh",
  "Sup",
  "Tan",
  "Tanh",
];

/**
 * The class basenames the AsciiMath transform reaches through
 * the `Math::Function::BinaryFunction` carrier — the same
 * `get_class` census rows the asciimath transform-registry
 * slice carries, projected and emitted latex-side. The renderer
 * adds `Power`, `Mod` and `Td` itself (constructed without
 * `get_class`). Membership only — deduplicated and sorted.
 */
export const LATEX_BINARY_CARRIER_NAMES: readonly string[] = ["Lim", "Log", "Root", "Stackrel"];
