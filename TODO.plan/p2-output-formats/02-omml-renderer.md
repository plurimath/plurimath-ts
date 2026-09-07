# TODO 2 — Add the OMML renderer

## Why
OMML is the larger output format still owed by P2. Its renderer is not missing in the
oracle: the entry point on model nodes is `to_omml_without_math_tag`, while the single
public `to_omml` method belongs to `Formula`. Measuring the public method alone would
therefore make the implementation look nearly empty when it is not.

The measured corpus does not support the P2 README's earlier prediction that OMML would
require an XML-layer extension. The README now records the measured boundary
(`TODO.plan/p2-output-formats/README.md:67-70`): every XML feature OMML emitted in the
sweep below is already expressible by `src/xml/`. Do not schedule an XML-layer change up
front; require a failing oracle probe that names a missing capability first.

## Scope

### Measurement commands

The oracle was clean and detached at `00c52783877b38f6b8e6e109f1803f96bb34fc62`:

```sh
git status --short --branch && git rev-parse HEAD
# ## HEAD (no branch)
# 00c52783877b38f6b8e6e109f1803f96bb34fc62
# exit 0
```

Ruby was selected before probing with
`/home/apple/.codex/skills/ruby-version-manager/detect.sh`; it reported Ruby `4.0.1`,
`mise x --`, and `VERSION_AVAILABLE=true` (exit `0`). The probes are local-only evidence
files under `.codex-context/tasks/omml-scope/`; they write nothing to the oracle.

The labels used below mean these exact commands, each run from the clean pinned oracle:

```sh
# [surface]
BUNDLE_GEMFILE=/home/apple/ruby_gems/plurimath-oracle/Gemfile \
  mise x -- bundle exec ruby \
  /home/apple/ruby_gems/wt-omml-scope/.codex-context/tasks/omml-scope/surface_probe.rb
# exit 0

# [output]
BUNDLE_GEMFILE=/home/apple/ruby_gems/plurimath-oracle/Gemfile \
  mise x -- bundle exec ruby \
  /home/apple/ruby_gems/wt-omml-scope/.codex-context/tasks/omml-scope/output_probe.rb
# exit 0

# [symbols]
BUNDLE_GEMFILE=/home/apple/ruby_gems/plurimath-oracle/Gemfile \
  mise x -- bundle exec ruby \
  /home/apple/ruby_gems/wt-omml-scope/.codex-context/tasks/omml-scope/symbol_probe.rb
# exit 0

# [xml-sweep]
BUNDLE_GEMFILE=/home/apple/ruby_gems/plurimath-oracle/Gemfile \
  mise x -- bundle exec ruby \
  /home/apple/ruby_gems/wt-omml-scope/.codex-context/tasks/omml-scope/xml_feature_probe.rb \
  /home/apple/ruby_gems/plurimath-ts/submodules/plurimath-testsuite/corpus/asciimath
# exit 0

# [slices]
mise x -- ruby \
  /home/apple/ruby_gems/wt-omml-scope/.codex-context/tasks/omml-scope/slice_check.rb \
  /home/apple/ruby_gems/wt-omml-scope
# exit 0
```

The worktree submodule was uninitialised, so `[xml-sweep]` read the same gitlink from the
primary checkout without writing there. Both the worktree gitlink and the primary
submodule resolved to `d2f1bea40c66c7018ede37faea0be51b307bf3af`, measured with
`git submodule status` and `git rev-parse HEAD` (both exit `0`).

### Measured surface

Against the port's `38` render-kind directories, on the pinned oracle (`[surface]`):

- **`36` roots own `to_omml_without_math_tag`**: `abs`, `bar`, `base`,
  `binary-function`, `ceil`, `color`, `ddot`, `dot`, `fenced`, `floor`,
  `font-style`, `formula`, `frac`, `hat`, `int`, `linebreak`, `mpadded`, `nary`,
  `norm`, `number`, `obrace`, `oint`, `overleftrightarrow`, `overset`, `prod`,
  `sqrt`, `sum`, `symbol`, `table`, `text`, `tilde`, `ubrace`, `ul`,
  `unary-function`, `underset`, and `vec`.
- **`mrow` is the one inherited root**: its owner is `Math::Formula`.
- **`ternary-function` is the one missing root**: neither it nor an ancestor defines
  the method.

The same runtime-reflection probe reproduced the comparison counts supplied with this
task: HTML is `16` own / `21` inherited / `1` missing, and UnicodeMath is `35` own /
`1` inherited / `2` missing (`[surface]`). The source-definition census also reproduced
the supplied totals:

```sh
set -o pipefail
rg -o '^\s*def to_omml_without_math_tag\b' lib | wc -l  # 1559
rg -o '^\s*def to_omml_math_zone\b' lib | wc -l         # 17
rg -o '^\s*def to_omml\b' lib | wc -l                   # 1
# exit 0
```

The carrier/default probe used `options: {}` and one generic `Symbol("x")` per slot.
The strings below are the exact serialized fragment bytes, JSON-escaped so every newline
is visible (`[surface]`):

| carrier | exact serialized fragment or refusal |
|---|---|
| `Formula` | `"<m:r>\n  <m:t>x</m:t>\n</m:r>\n"` |
| `Mrow` | `"<m:r>\n  <m:t>x</m:t>\n</m:r>\n"` |
| `Symbol` | raw method result `"x"`; public-content fragment `"<m:r>\n  <m:t>x</m:t>\n</m:r>\n"` |
| `BinaryFunction` | `"<m:r>\n  <m:r>\n    <m:t>x</m:t>\n  </m:r>\n  <m:r>\n    <m:t>x</m:t>\n  </m:r>\n</m:r>\n"` |
| `TernaryFunction` | `NoMethodError: undefined method 'to_omml_without_math_tag' for an instance of Plurimath::Math::Function::TernaryFunction` |

The unary carrier is larger and includes Word control properties; its exact fragment is:

```json
"<m:func>\n  <m:funcPr>\n    <m:ctrlPr>\n      <w:rPr>\n        <w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/>\n        <w:i/>\n      </w:rPr>\n    </m:ctrlPr>\n  </m:funcPr>\n  <m:fName>\n    <m:r>\n      <w:rPr>\n        <w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/>\n      </w:rPr>\n      <m:t>unaryfunction</m:t>\n    </m:r>\n  </m:fName>\n  <m:e>\n    <m:r>\n      <m:t>x</m:t>\n    </m:r>\n  </m:e>\n</m:func>\n"
```

### Measured output shape

The public output is an `m:oMathPara` wrapper, then `m:oMath`, then the fragment. A
single generic `x` produced these exact bytes (`[output]`):

```xml
<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
  <m:oMath>
    <m:r>
      <m:t>x</m:t>
    </m:r>
  </m:oMath>
</m:oMathPara>
```

Representative structural fragments, serialized by the oracle's own `dump_ox_nodes`,
are recorded exactly below as JSON strings (`[output]`):

| AsciiMath input | oracle root class | exact fragment bytes |
|---|---|---|
| `x_1` | `Math::Function::Base` | `"<m:sSub>\n  <m:sSubPr>\n    <m:ctrlPr>\n      <w:rPr>\n        <w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/>\n        <w:i/>\n      </w:rPr>\n    </m:ctrlPr>\n  </m:sSubPr>\n  <m:e>\n    <m:r>\n      <m:t>x</m:t>\n    </m:r>\n  </m:e>\n  <m:sub>\n    <m:r>\n      <m:t>1</m:t>\n    </m:r>\n  </m:sub>\n</m:sSub>\n"` |
| `x^2` | `Math::Function::Power` | `"<m:sSup>\n  <m:sSupPr>\n    <m:ctrlPr>\n      <w:rPr>\n        <w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/>\n        <w:i/>\n      </w:rPr>\n    </m:ctrlPr>\n  </m:sSupPr>\n  <m:e>\n    <m:r>\n      <m:t>x</m:t>\n    </m:r>\n  </m:e>\n  <m:sup>\n    <m:r>\n      <m:t>2</m:t>\n    </m:r>\n  </m:sup>\n</m:sSup>\n"` |
| `x_1^2` | `Math::Function::PowerBase` | `"<m:sSubSup>\n  <m:sSubSupPr>\n    <m:ctrlPr>\n      <w:rPr>\n        <w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/>\n        <w:i/>\n      </w:rPr>\n    </m:ctrlPr>\n  </m:sSubSupPr>\n  <m:e>\n    <m:r>\n      <m:t>x</m:t>\n    </m:r>\n  </m:e>\n  <m:sub>\n    <m:r>\n      <m:t>1</m:t>\n    </m:r>\n  </m:sub>\n  <m:sup>\n    <m:r>\n      <m:t>2</m:t>\n    </m:r>\n  </m:sup>\n</m:sSubSup>\n"` |
| `(a)/(b)` | `Math::Function::Frac` | `"<m:f>\n  <m:fPr>\n    <m:ctrlPr>\n      <w:rPr>\n        <w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/>\n        <w:i/>\n      </w:rPr>\n    </m:ctrlPr>\n  </m:fPr>\n  <m:num>\n    <m:r>\n      <m:t>a</m:t>\n    </m:r>\n  </m:num>\n  <m:den>\n    <m:r>\n      <m:t>b</m:t>\n    </m:r>\n  </m:den>\n</m:f>\n"` |
| `sqrt(x)` | `Math::Function::Sqrt` | `"<m:rad>\n  <m:radPr>\n    <m:degHide m:val=\"on\"/>\n    <m:ctrlPr>\n      <w:rPr>\n        <w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/>\n        <w:i/>\n      </w:rPr>\n    </m:ctrlPr>\n  </m:radPr>\n  <m:deg/>\n  <m:e>\n    <m:r>\n      <m:t>x</m:t>\n    </m:r>\n  </m:e>\n</m:rad>\n"` |
| `sum_(i=1)^n i` | `Math::Function::Sum` | `"<m:nary>\n  <m:naryPr>\n    <m:chr m:val=\"∑\"/>\n    <m:limLoc m:val=\"undOvr\"/>\n    <m:subHide m:val=\"0\"/>\n    <m:supHide m:val=\"0\"/>\n  </m:naryPr>\n  <m:sub>\n    <m:r>\n      <m:t>i</m:t>\n    </m:r>\n    <m:r>\n      <m:t>=</m:t>\n    </m:r>\n    <m:r>\n      <m:t>1</m:t>\n    </m:r>\n  </m:sub>\n  <m:sup>\n    <m:r>\n      <m:t>n</m:t>\n    </m:r>\n  </m:sup>\n  <m:e>\n    <m:r>\n      <m:t>i</m:t>\n    </m:r>\n  </m:e>\n</m:nary>\n"` |
| `[[a,b],[c,d]]` | `Math::Function::Table` | `"<m:d>\n  <m:dPr>\n    <m:begChr m:val=\"[\"/>\n    <m:endChr m:val=\"]\"/>\n    <m:sepChr m:val=\"\"/>\n    <m:grow/>\n  </m:dPr>\n  <m:e>\n    <m:m>\n      <m:mPr>\n        <m:mcs>\n          <m:mc>\n            <m:mcPr>\n              <m:count m:val=\"2\"/>\n              <m:mcJc m:val=\"center\"/>\n            </m:mcPr>\n          </m:mc>\n        </m:mcs>\n        <m:ctrlPr>\n          <w:rPr>\n            <w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/>\n            <w:i/>\n          </w:rPr>\n        </m:ctrlPr>\n      </m:mPr>\n      <m:mr>\n        <m:e>\n          <m:r>\n            <m:t>a</m:t>\n          </m:r>\n        </m:e>\n        <m:e>\n          <m:r>\n            <m:t>b</m:t>\n          </m:r>\n        </m:e>\n      </m:mr>\n      <m:mr>\n        <m:e>\n          <m:r>\n            <m:t>c</m:t>\n          </m:r>\n        </m:e>\n        <m:e>\n          <m:r>\n            <m:t>d</m:t>\n          </m:r>\n        </m:e>\n      </m:mr>\n    </m:m>\n  </m:e>\n</m:d>\n"` |

### XML-layer fit: measured gap list

`[xml-sweep]` rendered and Ox-parsed `90` reachable positive cases from `18` pinned
payloads with `0` render or parse errors. That measured set emitted `61` qualified
element names and `21` qualified attribute names; element prefixes were `m` and `w`,
and attribute prefixes were `m`, `w`, and `xmlns`. It contained `193` self-closing
elements across `58` documents, `17` empty-valued attributes, a trailing newline in all
`90` outputs, one stable root-attribute order, and no comments, CDATA, or processing
instructions. These are corpus-surface measurements, not a claim over every hand-built
invalid model.

Named gaps, compared against the current TypeScript XML layer:

- **Namespaced element names — no gap.** `XmlElement` stores and emits its name verbatim
  (`src/xml/element.ts:48-57`), and the pinned Ox contract already byte-tests
  `m:oMath` (`test/xml/ox-contract.ts:378-383`).
- **Namespaced attributes and namespace declarations — no gap.** Attribute names and
  values are strings stored in an insertion-ordered `Map`, including bulk writes
  (`src/xml/element.ts:52-53,80-99`); the serializer emits those names verbatim in map
  order (`src/xml/serializer.ts:210-218`). This covers both `m:val`/`w:ascii` and the
  measured root `xmlns:*` order.
- **Ordered nested children, arrays, and nil skips — no gap.** The child union already
  accepts elements and text, while `append` recursively flattens arrays, skips nil, and
  preserves document order (`src/xml/element.ts:30-39,113-140`).
- **Self-closing and empty-valued control properties — no gap.** Zero-child elements
  serialize with `/>`; attributes are retained even when their value is empty
  (`src/xml/serializer.ts:215-223`).
- **Exact Ox layout and final Plurimath rewrites — no gap.** The serializer owns the
  indentation, text placement, close tags, and escaping (`src/xml/serializer.ts:210-290`),
  while `dumpNodes` already applies the same final two rewrites used by both MathML and
  OMML (`src/xml/serializer.ts:164-200`).
- **Comments, CDATA, and processing instructions — no measured requirement.** The XML
  model deliberately does not represent them (`src/xml/element.ts:11-15`), and
  `[xml-sweep]` observed none.

Conclusion: this scope found no XML-layer extension required for OMML output. The work
is a larger renderer tree, not a new XML representation. If a later oracle probe finds a
missing XML shape, add the smallest failing XML contract fixture before extending
`src/xml/`.

### Generated symbol data versus structural rendering

`[symbols]` instantiated all `1,461` runtime symbol classes and called
`to_omml_without_math_tag` with both display-style values and with `options: { table:
true }`. All calls succeeded and none varied across those axes.

- **Generated OMML symbol data belongs to `symbol`.** Excluding the dynamic generic
  `Symbol` root, the oracle has `1,460` symbol classes. The abstract `Paren` carrier is
  the single nil row; the remaining `1,459` classes return static strings. Those rows
  contain `1,415` distinct strings and `11,391` raw value bytes before TypeScript syntax,
  identifiers, or provenance are added (`[symbols]`). Generate this table; do not
  hand-type it.
- **The symbol wrapper is shared structure.** Every one of the `1,461` classes inherits
  `insert_t_tag`, `omml_nodes`, `t_tag`, `font_style_t_tag`, and `nary_attr_value` from
  `Math::Symbols::Symbol` (`[symbols]`). The generator therefore owes static symbol
  values, not one XML template per symbol class.
- **Keep non-symbol kinds out of that table.** `[output]` shows representative structural
  renderers composing OMML elements around rendered children; `number` delegates to the
  existing format-neutral number formatter (`number.rb:48-50`). Together with the
  shared-helper measurement above, this supports the ownership split: put OMML's
  generated symbol values in an OMML-specific generated slice, and keep structural
  construction in per-kind renderers and shared helpers.

The `11,391` figure is only the sum of oracle string payload bytes. The generated
TypeScript file size is deliberately unmeasured; it depends on the generator's emitted
shape and provenance header, neither of which exists yet.

### The trap this item must not fall into

The bare `TernaryFunction` carrier reports `respond_to?` false and raises exactly:

```text
NoMethodError: undefined method 'to_omml_without_math_tag' for an instance of Plurimath::Math::Function::TernaryFunction
```

Its measured ancestry is `TernaryFunction -> Core -> Object ->
JSON::GeneratorMethods -> Kernel -> BasicObject`, with no inherited implementation
(`[surface]`). The port must reproduce that refusal for the bare carrier.

Do not generalise the refusal to every node carried by the TypeScript
`ternary-function` kind. `x_1^2` parses to `Math::Function::PowerBase` and renders the
measured `m:sSubSup` fragment above (`[output]`), so named carrier dispatch and bare
carrier refusal must coexist.

### Recommended slice order

The existing HTML vertical-slice commit added `12` kind renderer files, measured with
`git show --name-only --format='' 09fec2f | rg '^src/render/.+/html\.ts$' | wc -l`
(exit `0`). `[slices]` checks the proposed OMML partition against the live
`src/render/` directories: `38` kinds accounted for, with no duplicates, missing names,
or unknown names.

1. **First vertical slice — `12` kinds:** `formula`, `mrow`, `symbol`, `number`, `text`,
   `unary-function`, `binary-function`, `ternary-function`, `base`, `frac`, `nary`, and
   `table`. This proves the public namespace wrapper, inherited formula behavior, the
   generated symbol seam, formatter integration, all abstract carriers including the
   required refusal, `sSub`/`sSup`/`sSubSup`, `f`, `nary`, and the matrix tree.
2. **Scripts and limits:** `sum`, `prod`, `int`, `oint`, `overset`, `underset`, `obrace`,
   and `ubrace`.
3. **Delimiters and accents:** `abs`, `ceil`, `floor`, `norm`, `fenced`, `bar`, `dot`,
   `ddot`, `hat`, `tilde`, `vec`, `ul`, and `overleftrightarrow`.
4. **Remaining wrappers:** `sqrt`, `color`, `font-style`, `mpadded`, and `linebreak`.

The order is a recommendation, not an oracle fact. The membership and counts are
machine-checked by `[slices]`; the sequencing judgment is based on the measured output
shapes above.

### Explicitly unmeasured

- Structural display-style differences and option axes beyond the representative output
  set were not swept. Symbol display style and `table: true` were swept by `[symbols]`.
- The current positive corpus does not enumerate every hand-built nil, array, invalid
  carrier name, or malformed option state. `[xml-sweep]` supports the XML-capability
  conclusion only over its stated reachable corpus surface.
- No generated OMML TypeScript payload, generator determinism run, package build, or
  renderer parity suite exists in this scope; their sizes and results are unmeasured.
- Oga output was not measured. All canonical bytes here use the pinned Ox engine, as
  required by `ARCHITECTURE.md:957-963`.
- Microsoft Word rendering was not visually checked. This item scopes byte parity with
  the oracle, not visual equivalence in Word.
- A first attempt to parse the sweep with `rexml/document` could not run because that gem
  is absent (`LoadError`, exit `1`). The successful `[xml-sweep]` used the oracle's pinned
  Ox dependency instead; no claim relies on the failed REXML command.

## Done when

- [ ] `toOmml` matches the gem byte-for-byte across every reachable case in the pinned
      corpus, and the oracle expectations are generated rather than hand-typed.
- [ ] All `36` own-root kinds are measured against the oracle, not inferred from MathML
      or a sibling OMML kind; `mrow` has a separate inherited-behavior assertion
      (`[surface]`).
- [ ] The `Formula`, `Mrow`, `Symbol`, `UnaryFunction`, and `BinaryFunction` defaults are
      pinned to the exact fragments above.
- [ ] A bare `ternary-function` raises, while the named `PowerBase` carrier renders its
      measured `sSubSup` tree.
- [ ] The OMML symbol slice is generated from the pinned oracle with provenance and an
      emptiness guard; regeneration is byte-identical across the repository's required
      perturbations.
- [ ] No XML-layer extension is added without a failing oracle-backed XML contract
      fixture naming the missing capability.
- [ ] The corpus declares an `omml` target and every reachable case carries an
      expectation for it; the reader asserts a nonzero target case count equal to each
      group's own case count.
- [ ] The cross-format invariant gates cover OMML, including the differential runner on
      both halves.
- [ ] `/omml` is a published subpath with package-isolation assertions, and its expected
      exports and forbidden layers are listed explicitly in the package gate.
- [ ] Review completes with no valid implementable findings left unresolved.
