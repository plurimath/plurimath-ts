#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's answers for calls that pass OPTIONS to `to_mathml` and
# `to_omml` — `split_on_linebreak:` on both, `display_style:` on `to_omml` — so
# the port's B3 slice is checked against the gem rather than against itself.
# It also carries the `unary-function` group: default calls on the unary-function
# kinds the LaTeX, HTML and UnicodeMath parsers reach, in ALL SIX formats (see
# `UNARY_FUNCTION_*` below).
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-render-options-fixtures.rb --oracle /path/to/plurimath
#
# One run writes `test/formats/<format>/render-options-fixtures.json` for every
# format in `FORMATS`: mathml and omml carry the option groups below and the
# `ternary-function` group; the other four carry only the `unary-function` and
# `ternary-function` groups. It also writes
# `test/formats/binary-function/render-kinds-fixtures.json` (the
# `binary-function-kinds` group, described below). All are prepared before
# any is written: `RenderFixtureProvenance.prepare` refuses a checkout that
# is dirty outside the one payload it is about to write, and the outputs
# would otherwise make each other dirty. (The canonical parity/degenerate pair
# gets its exemption from `MANAGED_PAYLOAD_BASENAMES`, an edit to a file every
# existing manifest hashes.)
#
# B4 adds the `intent` groups to the MATHML payload only (`intent_rows` below):
# `to_mathml(intent: true)` has no OMML counterpart. Their inputs are the gem's
# own `intent_encoding_spec.rb` examples, the `ⓘ` examples of
# `unicode_math_parse_values.rb` (as models: the port's UnicodeMath grammar does
# not parse `ⓘ`), and measured probes — one per intent-bearing class at least.
#
# These are PORT-LOCAL fixtures, like `parity-fixtures.json`: the shared corpus
# has no case kind that records a call with options. Each row records the
# input, the call's options, and the gem's exact bytes:
#
#   - `input.model`     a `CorpusGenerator.serialize_node` model, for the
#                       hand-built formulas of the gem's own line-break specs
#                       (`spec/plurimath/fixtures/formula_modules/line_break_values.rb`,
#                       the 90 `LineBreak_NNN` constants both
#                       `spec/plurimath/{mathml,omml}/line_breaks_spec.rb` render);
#   - `input.text`      with `input.format`, an input the gem parses: the
#                       `.to_omml` contexts of `spec/plurimath/asciimath_spec.rb`
#                       (read from the file, not retyped), plus LaTeX `\\` and
#                       HTML `<br/>` sources for the two syntaxes that PRODUCE a
#                       `Linebreak` (AsciiMath's `\` does not);
#   - `options`         the keywords in the port's spelling (`splitOnLinebreak`,
#                       `displayStyle`, `unaryFunctionSpacing`, `intent`), each mapped to
#                       the gem's snake_case keyword below; JSON `null` is
#                       Ruby's `nil`, which is NOT the same as leaving the key
#                       out;
#   - `split`           `Formula#new_line_support` — the formulas the gem hands
#                       its renderer, one serialized model per line — recorded
#                       whenever the gem parsed the input, so the port's walk is
#                       checked on its own, apart from any renderer;
#   - `expected`        the gem's bytes, or `raises`/`raisedIn` when it refused.
#
# The `underover` group carries `Underover` — a `TernaryFunction` subclass the
# AsciiMath transform's `get_class` census never reaches — in every format,
# hand-built (`underover_models`, `underover_rows`); omml also carries the
# `display_style: true`/`false` rows beside the omitted default, since
# `Underover#to_omml_without_math_tag` is the one method here that branches on
# it explicitly.
#
# The `binary-function-kinds` group is a different shape, because what it
# checks is different: not options but KINDS. `Over`, `Menclose`, `Mlabeledtr`,
# `Stackrel` and `Inf` are `BinaryFunction` subclasses that the AsciiMath
# transform never builds, so no shared-corpus case reaches them, while the gem
# renders them in every format. Each row records one input — `input.format` +
# `input.text` where the port has a parser for it, or a `input.model` (a
# `CorpusGenerator.serialize_node` model) for a hand-built formula or a MathML
# source, which the port cannot parse — and, per target format, the gem's exact
# bytes (`results.<format>.expected`), the refusal (`results.<format>.raises`),
# or `results.<format>.unreproducible` where the gem's output holds a heap
# address (a node interpolated through `Object#to_s`), which no fixture can hold
# and the port must refuse.
# A row may name `formats` to restrict which targets it records, and carries
# `options` (only `displayStyle`, only for `omml`).
# The same files also carry rows that pass NO options, for kinds only the LaTeX,
# HTML and UnicodeMath parsers (or a hand-built tree) reach — each under its own
# `group`, asserted by `test/formats/table-frac-nary-parity.spec.ts`:
# `table-frac-nary-survey`, `table-frac-nary-spec` and `table-frac-nary-probe`
# (OMML: Table and its subclasses, Frac and Nary options), and `nary-mask`
# (MathML: `options[:mask]` on Nary).
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-render-options-fixtures.rb"

SCHEMA = "plurimath-corpus/render-options/1"
FORMATS = %w[asciimath html latex mathml omml unicodemath].freeze
# The formats whose payload holds an option group: the line-break rows, which
# `rows_for` builds for exactly these.
LINE_BREAK_FORMATS = %w[mathml omml].freeze
# The formats whose payload holds no option group (the B3 options do not touch
# their renderers). Derived, so the two lists cannot drift apart.
UNARY_ONLY_FORMATS = (FORMATS - LINE_BREAK_FORMATS).freeze
# Of the option formats, the one that also records the `display_style:` rows
# (MathML's payload stops after the line-break rows and the N-ary mask rows).
DISPLAY_STYLE_FORMATS = %w[omml].freeze
PAYLOAD_BASENAME = "render-options-fixtures.json"

# The gem's parse type for each input format this file records; UnicodeMath is
# `:unicode` there and `unicodemath` everywhere in the port.
GEM_PARSE_TYPES = {
  "asciimath" => :asciimath,
  "html" => :html,
  "latex" => :latex,
  "unicodemath" => :unicode,
}.freeze

KEYWORDS = {
  "displayStyle" => :display_style,
  "splitOnLinebreak" => :split_on_linebreak,
  "unaryFunctionSpacing" => :unary_function_spacing,
  "intent" => :intent,
}.freeze

# LaTeX and HTML sources whose gem parse contains a `Function::Linebreak`.
# Measured on the pinned oracle before being listed: `a \\ b` and `a<br/>b`
# each give `[a, Linebreak, b]`, while AsciiMath's `\` does not.
TEXT_LINEBREAK_SOURCES = [
  ["latex", "a \\\\ b"],
  ["latex", "x + y \\\\ z"],
  ["latex", "a \\\\ b \\\\ c"],
  ["latex", "\\frac{a \\\\ b}{c}"],
  ["latex", "\\sqrt{a \\\\ b}"],
  ["latex", "\\left( a \\\\ b \\right)"],
  ["latex", "\\sum_{i=1}^{n} a \\\\ b"],
  ["latex", "\\lim_{x \\to 0} f(x) \\\\ y"],
  ["html", "a<br/>b"],
  ["html", "x + y<br/>z"],
  ["html", "a<br/>b<br/>c"],
].freeze

# Inputs the display style changes the OMML of (the gem's limit-style
# `lim`/`underset`/`overset` branches), which the gem's own spec never varies
# beyond `lim_2^d`. Chosen by measurement, not from a spec; the group name says so.
DISPLAY_STYLE_PROBES = [
  "lim_(x->0) f(x)",
  "underset(a)(b)",
  "overset(a)(b)",
  "x^2",
].freeze

# Every value `boolean_display_style` (`display_style.to_s == "true"`) is worth
# distinguishing on: the two booleans, the two strings, and `nil`, which Ruby
# spells `to_s == ""` and so is FALSE, not the default.
DISPLAY_STYLE_VALUES = [true, false, "true", "false", nil].freeze

# The `unary-function` group: `src/render/unary-function/*`'s kinds. Every input
# is rendered to every format, so a format that renders one where another refuses
# is pinned as the gem does it (the html `Left`/`Phantom` split among them).
#
# Text inputs the gem parses. The first block is the survey of refusals: inputs
# whose gem parse holds one of `Mbox Ln Det Gcd Max Cancel Hom Left Substack
# Phantom` and which the port refused when the LaTeX, HTML and UnicodeMath
# parsers landed. The `Left` list is long on purpose: measured on the pinned
# oracle at generation, the gem renders `\left(` in html and raises on the other
# 23 `\left` inputs. Survey inputs whose other kinds belong to other renderers
# (`Over`, `Rule`, `Matrix`, `Menclose`, `Ker`) are left out, so this group does
# not pin those kinds' refusals. The second block is read from the gem's own
# specs (file and line named per entry); the third is measured, not from a spec.
# The port's UnicodeMath parser refuses `⟡x` (measured: "no rule matched
# {unary_function=other}"), so `Phantom`'s UnicodeMath branches are reached
# through hand-built models instead of text.
UNARY_FUNCTION_TEXT_INPUTS = [
  ["latex", "\\mbox{hi}", "survey"],
  ["latex", "\\mbox{a b}", "survey"],
  ["latex", "\\mbox{ab}", "survey"],
  ["latex", "\\ln{x}", "survey"],
  ["latex", "\\det{A}", "survey"],
  ["latex", "\\gcd{( a , b )}", "survey"],
  ["latex", "\\max{A}", "survey"],
  ["latex", "\\cancel{x}", "survey"],
  ["latex", "\\substack{a\\\\b}", "survey"],
  ["latex", "\\phantom{x}", "survey"],
  ["html", "<i>ln</i><i>x</i>", "survey"],
  ["html", "<i>det</i><i>A</i>", "survey"],
  ["html", "<i>gcd</i><i><i>(</i>a&#x2c;b<i>)</i></i>", "survey"],
  ["unicodemath", "ln\u2061x", "survey"],
  ["unicodemath", "det\u2061A", "survey"],
  ["unicodemath", "max\u2061A", "survey"],
  ["unicodemath", "gcd\u2061(a , b)", "survey"],
  ["latex", "\\left(", "survey"],
  ["latex", "\\left ( a + b \\right )", "survey"],
  ["latex", "\\left ( a \\right )", "survey"],
  ["latex", "\\left \\{ a \\right \\}", "survey"],
  ["latex", "\\left ( \\frac{a}{b} \\right )", "survey"],
  ["latex", "\\left(\\right", "survey"],
  ["latex", "\\left(\\right)", "survey"],
  ["latex", "\\left(x\\right)^2", "survey"],
  ["latex", "\\left ( x \\right )", "survey"],
  ["latex", "\\left [ x \\right ]", "survey"],
  ["latex", "\\left | x \\right |", "survey"],
  ["latex", "\\left(x\\right", "survey"],
  ["latex", "\\left(x\\right)", "survey"],
  ["latex", "\\left(x\\right]", "survey"],
  ["latex", "\\left.x\\right.", "survey"],
  ["latex", "\\left\\{x\\right\\}", "survey"],
  ["latex", "\\left(x\\right)^{y}", "survey"],
  ["latex", "\\left(x\\right)^y", "survey"],
  ["latex", "\\left(x\\right)_{y}", "survey"],
  ["latex", "\\left(x\\right)^{y+z}", "survey"],
  ["latex", "\\left(x\\right)_{y+z}", "survey"],
  ["latex", "\\left(x+y\\right", "survey"],
  ["latex", "\\left(x+y\\right)", "survey"],
  ["latex", "\\left.x+y\\right.", "survey"],
  ["latex", "\\substack{1 \\\\ b \\\\ 100}", "spec/plurimath/latex_spec.rb:2862"],
  ["latex", "\\sum_{\\substack{1\\le i\\le n\\\\ i\\ne j}}", "spec/plurimath/latex_spec.rb:1620"],
  ["latex", "\\mbox{1cm}", "spec/plurimath/latex_spec.rb:2884"],
  ["latex", "\\phantom{1 + 2}", "spec/plurimath/latex_spec.rb:3197"],
  ["latex", " x  \\phantom{+} \\phantom{ y } +  z ", "spec/plurimath/mathml_spec.rb:780"],
  ["latex", "\\max{}_{x \\in \\[ a , b \\]} f ( x )", "spec/plurimath/latex_spec.rb:1556"],
  ["latex", "\\hom{x}", "measured on the oracle"],
  ["latex", "\\hom{(d)}", "measured on the oracle"],
  ["latex", "\\ln{x}\\det{y}\\gcd{z}\\max{w}\\hom{v}", "measured on the oracle"],
  ["latex", "\\cancel{x + y}", "measured on the oracle"],
  ["latex", "\\cancel{\\frac{a}{b}}", "measured on the oracle"],
  ["latex", "\\ln{}", "measured on the oracle"],
  ["latex", "\\substack{a \\\\ b & c}", "measured on the oracle"],
  # The aliases the HTML parser reads back (`HTML_UNARY_CLASSES`), as the
  # gem's own HTML output spells them.
  *%w[arcsin arccos arctan coth tanh sech csch sinh cosh csc exp sec tan cot lcm lg].map do |name|
    ["html", "<i>#{name}</i><i><i>(</i>qx<i>)</i></i>", "measured on the oracle"]
  end,
].freeze

# The `ternary-function` group: every renderer's answer for the three
# `TernaryFunction` subclasses that only the LaTeX, HTML and UnicodeMath
# parsers (or a hand-built tree) can produce — `Multiscript`, `Limits`, `Rule`.
# # Each row is one input rendered to ONE target, so the same inputs appear once
# in each of the six per-format payloads, group `ternary-function`, `options`
# empty (the calls are plain `to_<format>`).
TERNARY_GROUP = "ternary-function"

# Text the gem parses itself; the row build aborts on any that does not parse.
# The UnicodeMath ones are the prescript forms that build a `Multiscript`;
# `\limits` and `\rule` are LaTeX.
TERNARY_TEXT_INPUTS = [
  ["latex", "\\int\\limits_a^b"],
  ["latex", "\\int\\limits_{0}^{\\pi}"], # spec/plurimath/latex/parser_spec.rb:246
  ["latex", "\\rule{1}{2}"],
  ["latex", "\\rule[-1mm]{5mm}{1cm}"], # spec/plurimath/latex_spec.rb:2844
  ["unicodemath", "^3 X"],
  ["unicodemath", "_2 X"],
  ["unicodemath", "^3 X_5"],
  ["unicodemath", "_2^3 X"],
  ["unicodemath", "_2 X_5"],
  ["unicodemath", "_2 X₅"],
  ["unicodemath", "_2^3 X_5"],
  ["unicodemath", "(_2)X"],
  ["unicodemath", "(_2)X_5"],
  ["unicodemath", "_2^3 X_5^6"],
  ["unicodemath", "(_2^3)X"],
  ["unicodemath", "(_2^3)X_5^6"],
  ["unicodemath", "_2 X_(5)"],
  ["unicodemath", "_2^3 X_(5)"],
  ["unicodemath", "_2^3 X_(5)^(6)"],
  ["unicodemath", "(_2^3)X_(5)^(6)"],
  ["unicodemath", "_(2)^(3) X_5"],
  ["unicodemath", "_(2)^(3) X_5^6"],
].freeze

# The gem's own hand-built formulas that hold one of the kinds:
# `line_break_values.rb` LineBreak_076 (Limits), _083 and _090 (Multiscript).
TERNARY_SPEC_CONSTANTS = %i[LineBreak_076 LineBreak_083 LineBreak_090].freeze

# Hand-built trees, one per branch of a kind's `to_<format>` the parsers cannot
# reach: nil slots, empty and unequal-length script lists, a base that is not a
# `PowerBase`, a script that is a node rather than a list, `Power`/`Base`
# scripts (the UnicodeMath `sup_value`/`sub_value` arms), a prime. Each lambda
# is called with the gem's `Plurimath::Math`.
TERNARY_BUILT_INPUTS = {
  "multiscript-all-nil" => ->(m) { m::Function::Multiscript.new(nil, nil, nil) },
  "multiscript-empty-lists" => lambda { |m|
    m::Function::Multiscript.new(m::Function::PowerBase.new(m::Symbols::Symbol.new("X")), [], [])
  },
  "multiscript-sub-only" => lambda { |m|
    m::Function::Multiscript.new(m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
                                 [m::Number.new("2")], [])
  },
  "multiscript-plain-base" => lambda { |m|
    m::Function::Multiscript.new(m::Symbols::Symbol.new("X"), [m::Number.new("2")], [m::Number.new("3")])
  },
  "multiscript-unequal-sub-longer" => lambda { |m|
    m::Function::Multiscript.new(m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
                                 [m::Number.new("1"), m::Number.new("2")], [m::Number.new("3")])
  },
  "multiscript-unequal-sup-longer" => lambda { |m|
    m::Function::Multiscript.new(m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
                                 [m::Number.new("1")], [m::Number.new("3"), m::Number.new("4")])
  },
  "multiscript-nil-sub" => lambda { |m|
    m::Function::Multiscript.new(m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
                                 nil, [m::Number.new("3")])
  },
  "multiscript-nil-sup" => lambda { |m|
    m::Function::Multiscript.new(m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
                                 [m::Number.new("1")], nil)
  },
  "multiscript-node-scripts" => lambda { |m|
    m::Function::Multiscript.new(m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
                                 m::Number.new("2"), m::Number.new("3"))
  },
  "multiscript-power-scripts" => lambda { |m|
    m::Function::Multiscript.new(
      m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
      [m::Function::Power.new(m::Number.new("1"), m::Number.new("2"))],
      [m::Function::Power.new(m::Number.new("3"), m::Number.new("4"))],
    )
  },
  "multiscript-base-scripts" => lambda { |m|
    m::Function::Multiscript.new(
      m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
      [m::Function::Base.new(m::Number.new("1"), m::Number.new("2"))],
      [m::Number.new("3")],
    )
  },
  "multiscript-prime-sup" => lambda { |m|
    m::Function::Multiscript.new(m::Function::PowerBase.new(m::Symbols::Symbol.new("X")),
                                 [m::Number.new("1")], [m::Symbols::Symbol.new("′")])
  },
  "limits-all-nil" => ->(m) { m::Function::Limits.new(nil, nil, nil) },
  "limits-sub-only" => lambda { |m|
    m::Function::Limits.new(m::Symbols::Symbol.new("x"), m::Number.new("2"), nil)
  },
  "limits-sup-only" => lambda { |m|
    m::Function::Limits.new(m::Symbols::Symbol.new("x"), nil, m::Number.new("3"))
  },
  "limits-base-and-power-scripts" => lambda { |m|
    m::Function::Limits.new(
      m::Symbols::Symbol.new("x"),
      m::Function::Base.new(m::Number.new("1"), m::Number.new("2")),
      m::Function::Power.new(m::Number.new("3"), m::Number.new("4")),
    )
  },
  "limits-prime-power-base" => lambda { |m|
    m::Function::Limits.new(
      m::Function::Power.new(m::Symbols::Symbol.new("x"), m::Symbols::Symbol.new("′")),
      m::Number.new("1"), m::Number.new("2")
    )
  },
  "rule-all-nil" => ->(m) { m::Function::Rule.new(nil, nil, nil) },
  "rule-first-only" => ->(m) { m::Function::Rule.new(m::Number.new("1"), nil, nil) },
  "rule-three-slots" => lambda { |m|
    m::Function::Rule.new(m::Symbols::Symbol.new("x"), m::Number.new("2"), m::Number.new("3"))
  },
}.freeze

BINARY_KIND_SCHEMA = "plurimath-corpus/render-binary-kinds/1"
BINARY_KIND_PAYLOAD = File.join("binary-function", "render-kinds-fixtures.json")
BINARY_KIND_FORMATS = %w[asciimath latex mathml html omml unicodemath].freeze
# Input syntaxes the port has a parser for. A row in any other syntax records
# the gem's parse as a model, since the port cannot build one from the text.
PORT_PARSED_FORMATS = %w[asciimath latex html unicodemath].freeze
# Inputs the renderers refused while the port had only the AsciiMath transform:
# each is a kind (Table and its ten subclasses, Frac with options, Nary with
# options) that only the LaTeX, HTML or UnicodeMath parser can build. Taken from
# a survey of what those three parsers produce, before any renderer change, and
# kept whether or not the port now renders them: the row is the gem's answer.
TABLE_FRAC_NARY_TEXT_SOURCES = [
  ["latex", "\\left (\\begin{matrix}a \\\\ b\\end{matrix}\\right )"],
  ["latex", "\\left [\\begin{matrix}a & b \\\\ c & d\\end{matrix}\\right ]"],
  ["latex", "\\begin{matrix}a & b\\end{matrix}"],
  ["latex", "\\begin{pmatrix}a \\\\ b\\end{pmatrix}"],
  ["latex", "\\begin{bmatrix}a\\end{bmatrix}"],
  ["latex", "\\begin{vmatrix}a & b \\\\ c & d\\end{vmatrix}"],
  ["latex", "\\begin{Bmatrix}a\\end{Bmatrix}"],
  ["latex", "\\begin{array}{cc}a & b\\end{array}"],
  ["latex", "\\begin{matrix}a&b\\\\c&d\\end{matrix}"],
  ["latex", "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}"],
  ["latex", "\\begin{vmatrix}a\\end{vmatrix}"],
  ["latex", "\\begin{Vmatrix}a\\end{Vmatrix}"],
  ["latex", "\\begin{multline}a\\end{multline}"],
  ["latex", "\\begin{split}a\\\\b\\end{split}"],
  ["latex", "\\begin{align}a&=b\\\\c&=d\\end{align}"],
  ["latex", "\\begin{align*}a&=b\\end{align*}"],
  ["latex", "\\begin{array}{cc}a&b\\\\c&d\\end{array}"],
  ["latex", "\\begin{array}{c|c}a&b\\\\c&d\\end{array}"],
  ["latex", "\\begin{array}{lr}a&b\\end{array}"],
  ["latex", "\\begin{matrix}a\\\\\\end{matrix}"],
  ["latex", "\\begin{matrix}\\hline a\\\\b\\end{matrix}"],
  ["latex", "\\begin{array}{c}\\hline a\\\\ \\hline b\\end{array}"],
  ["latex", "\\matrix{a}"],
  ["latex", "\\matrix{a&b}"],
  ["latex", "\\begin{matrix}-a&b\\end{matrix}"],
  ["latex", "\\begin{array}{c}a\\end{array}"],
  ["latex", "\\begin{align*}[c]a&b\\\\c&d\\end{align*}"],
  ["html", "<table><tr><td>a</td></tr><tr><td>b</td></tr></table>"],
  ["html", "<table><tr><td>a</td><td>b</td></tr></table>"],
  ["html", "<table><tr><td>a</td></tr></table>"],
  ["html", "<table><tr><td>Something</td></tr></table>"],
  ["html", "<table><tr><td>4</td></tr><tr><td>3</td></tr><tr><td>2</td></tr><tr><td>1</td></tr></table>"],
  ["unicodemath", "⒨(a@b)"],
  ["unicodemath", "ⓢ(a&b@c&d)"],
  ["unicodemath", "■(a&b)"],
  ["unicodemath", "ⓢ(a)"],
  ["unicodemath", "⒱(a&b@c&d)"],
  ["unicodemath", "Ⓢ(a)"],
  ["unicodemath", "³/₂"],
  ["unicodemath", "x \\atop y"],
  ["unicodemath", "x \\choose y"],
  ["unicodemath", "x\\sdiv y"],
  ["unicodemath", "x\\ldiv y"],
  ["unicodemath", "x\\ndiv y"],
  ["unicodemath", "■(a)"],
  ["unicodemath", "■3"],
  ["unicodemath", "■(3x)"],
  ["unicodemath", "■(a&b&c)"],
  ["unicodemath", "■((x)y&c)"],
  ["unicodemath", "■((x)y&c&d)"],
  ["unicodemath", "■(a@b@c)"],
  ["unicodemath", "■(a&b@c&d@e&f)"],
  ["unicodemath", "⒱(a@b)"],
  ["unicodemath", "⒩(a@b)"],
  ["unicodemath", "Ⓢ(a@b)"],
  ["unicodemath", "█(a@b)"],
  ["unicodemath", "■(a@b)"],
  ["unicodemath", "Ⓒ(a@b)"],
  ["unicodemath", "\\amalg13_d\\of d"],
  ["unicodemath", "\\amalg13^d\\of d"],
  ["unicodemath", "\\amalg13_d^d\\of d"],
  ["unicodemath", "■(a&b@c&d)"],
  ["unicodemath", "Ⓢ(a&b@c&d)"],
].freeze

# The `Nary` operand and limits a mask probe fills the two script slots with, in
# the four ways `Nary#tag_name` distinguishes (both, lower only, upper only,
# neither), and the masks tried. Chosen to hit every branch of
# `Core#get_mask_options` (both `case` arms, all seven `% 32` values, a
# negative mask, and each coercion `to_i` performs) — see `nary_mask_rows`.
NARY_MASK_FILLINGS = [%w[d u], ["d", nil], [nil, "u"], [nil, nil]].freeze
NARY_MASK_VALUES = [0, 1, 2, 3, 4, 5, 8, 9, 12, 13, 16, 17, 20, 24, 28, 29, 32, -1, -3,
                    "13", "1abc", "x", 13.7, nil, false, true].freeze

options = { oracle: nil, out: "test/formats", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output root (default test/formats)") { |v| options[:out] = v }
  o.on("--allow-dirty", "emit non-committable output from dirty checkouts") do
    options[:allow_dirty] = true
  end
end.parse!

abort "--oracle is required" unless options[:oracle]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
abort "not a plurimath checkout: #{lib}" unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))

$LOAD_PATH.unshift(lib)
$LOAD_PATH.push(File.join(oracle, "spec"))
require "plurimath"
require "plurimath/version"
require_relative "render-fixture-provenance"

unless Gem.loaded_specs.key?("plurimath")
  abort "REFUSING: the plurimath gem is not activated. Set BUNDLE_GEMFILE=" \
        "#{oracle}/Gemfile and run #{__FILE__} with `bundle exec ruby`, under " \
        "any Ruby that has it bundled (mise, rbenv, asdf, rvm, or the system " \
        "Ruby all work)."
end

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
unless loaded&.start_with?(lib)
  abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
        "An installed gem answers from a different version."
end

require "plurimath/fixtures/formula_modules/line_break_values"
require "plurimath/fixtures/formula_modules/expected_values"

# The ONE exception the oracle is documented to raise across this surface:
# `Formula#wrap_render_error` funnels every StandardError from a `to_<format>`
# into ParseError. A blanket rescue would launder a defect here into an
# ordinary "raises" row.
ORACLE_REFUSAL = Plurimath::Math::ParseError

# The `.to_omml` contexts of asciimath_spec.rb, read from the file: each
# context's number and its `let(:string)` literal. The literal is evaluated
# because two of them are `do ... end` blocks holding a quoted string with
# escapes; the file is the pinned oracle's own.
def asciimath_spec_omml_inputs(oracle)
  path = File.join(oracle, "spec/plurimath/asciimath_spec.rb")
  lines = File.readlines(path)
  start = lines.index { |l| l.start_with?('  describe ".to_omml" do') }
  abort "REFUSING: no .to_omml describe in #{path}" unless start

  stop = ((start + 1)...lines.length).find { |i| lines[i].match?(/\A  describe /) } || lines.length
  found = []
  current = nil
  lines[start...stop].each_with_index do |line, offset|
    if (m = line.match(/\A\s*context "contains (.+?) example #(\d+)" do\s*\z/))
      current = { number: m[2], name: m[1] }
    elsif current && (m = line.match(/\A\s*let\(:string\)\s*(\{\s*(.+?)\s*\}|do)\s*\z/))
      literal = m[2] || lines[start + offset + 1].strip
      found << current.merge(text: eval(literal)) # rubocop:disable Security/Eval
      current = nil
    end
  end
  found
end

# The static examples of `spec/plurimath/math/formula/intent_encoding_spec.rb`,
# read from the file: each `context`'s `let(:lang)` and `let(:string)`. The
# spec's first `describe` renders unicodemath examples from a submodule
# (`submodules/unicodemath-tests`) this checkout does not carry, so it is not
# read; the second is the `.to_mathml(intent: true, unary_function_spacing:
# false)` describe of eight literal inputs, which is.
def intent_spec_inputs(oracle)
  path = File.join(oracle, "spec/plurimath/math/formula/intent_encoding_spec.rb")
  lines = File.readlines(path)
  start = lines.index { |l| l.start_with?('  describe ".to_mathml(intent: true, unary_function_spacing: false)"') }
  abort "REFUSING: no static describe in #{path}" unless start

  found = []
  lang = nil
  lines[start..].each do |line|
    if (m = line.match(/let\(:lang\) \{ :(\w+) \}/))
      lang = m[1]
    elsif lang && (m = line.match(/let\(:string\) \{ (".*") \}/))
      found << { lang: lang, text: eval(m[1]) } # rubocop:disable Security/Eval
      lang = nil
    end
  end
  abort "REFUSING: expected the spec's 8 static inputs, found #{found.length}" unless found.length == 8

  found
end

# The `ⓘ` (intent) examples of `unicode_math_parse_values.rb`: the parse trees
# carrying `intent: "&#x24d8;"`, and the UnicodeMath strings that produce them
# (`unicode_math_string_values.rb`, same EXAMPLE_n numbering). The file mentions
# "intent" 28 times (each `ⓘ` node carries `intent:` plus `intent_arguments:` or
# `intent_expr:`), which is 14 `ⓘ` nodes across 12 examples — counted below.
def unicode_intent_examples
  require "plurimath/fixtures/formula_modules/unicode_math_parse_values"
  require "plurimath/fixtures/formula_modules/unicode_math_string_values"
  mentions = 0
  nodes = 0
  examples = UnicodeMathParseValues.constants.sort_by { |c| c.to_s[/\d+/].to_i }.filter_map do |name|
    tree = UnicodeMathParseValues.const_get(name).inspect
    count = tree.scan(/intent(?::|=>)\s*"&#x24d8;"/).length
    next if count.zero?

    nodes += count
    mentions += tree.scan("intent").length
    { name: name.to_s, text: UnicodeMathStringValues.const_get(name) }
  end
  unless mentions == 28 && nodes == 14 && examples.length == 12
    abort "REFUSING: expected 28 intent mentions (14 nodes) in 12 examples, found " \
          "#{mentions} (#{nodes}) in #{examples.length}"
  end

  examples
end

# Measured probes, one group per behaviour. Each was run on the pinned oracle
# before being listed; the group name says what it is there to show.
INTENT_PROBES = {
  "intent-nary" => [
    ["asciimath", "sum_(i=1)^n i"], ["asciimath", "prod_(i=1)^n i^3"], ["asciimath", "sum_i x"],
    ["asciimath", "sum^n x"], ["asciimath", "sum x"], ["asciimath", "prod_(i=1) x"],
    ["asciimath", "prod x"], ["asciimath", "int_a^b f"], ["asciimath", "int_a f"], ["asciimath", "int f"],
    ["asciimath", "int_0^1 x dx"], ["asciimath", "oint_C f"], ["asciimath", "oint f"],
    ["asciimath", "oint_a^b f"], ["latex", "\\iiiint_{i=1}^n 1"], ["latex", "\\iiint_{i=1}^n 1"],
    ["latex", "\\iint_{i=1}^n 1"], ["latex", "\\oint_{i=1}^n 1"], ["latex", "\\oiint_{i=1}^n 1"],
    ["latex", "\\oiiint_{i=1}^n 1"], ["latex", "\\coprod_{i=1}^n 1"], ["latex", "\\bigwedge_{i=1}^n 1"],
    ["latex", "\\varointclockwise_{i=1}^n 1"], ["latex", "\\ointctrclockwise_{i=1}^n 1"],
    ["latex", "\\oiint_a"], ["latex", "\\oiint^a x"],
  ],
  "intent-function" => [
    ["asciimath", "sin x"], ["asciimath", "cos(tan(1))"], ["asciimath", "sin"], ["asciimath", "sin(x)"],
    ["asciimath", "lim_(x->0) f(x)"], ["asciimath", "lim x"], ["asciimath", "lim_x"], ["asciimath", "log_2 x"],
    ["asciimath", "max x"], ["asciimath", "arg x"], ["latex", "\\inf_{i=1}^n"], ["latex", "\\inf x"],
    ["latex", "\\inf_i x"], ["latex", "\\lim_{i=1}^n"], ["latex", "\\log_{i=1}^n"],
  ],
  "intent-abs" => [
    ["asciimath", "abs(x)"], ["asciimath", "|x|"], ["asciimath", "abs(x + 1)"],
    ["asciimath", "abs(frac(1)(2))"], ["asciimath", "abs()"], ["asciimath", "abs(sin x)"],
  ],
  "intent-fenced" => [
    ["asciimath", "(a,b)"], ["asciimath", "(a,b]"], ["asciimath", "[a,b]"], ["asciimath", "[a,b)"],
    ["asciimath", "]a,b["], ["asciimath", "]a,b]"], ["asciimath", "(1,2]"], ["asciimath", "(a)"],
    ["asciimath", "{x}"], ["asciimath", "(-oo,3]"], ["asciimath", "[-oo,oo)"], ["asciimath", "(a,b,c]"],
    ["asciimath", "(a+b,c]"], ["asciimath", "[a,b["], ["asciimath", "(a,-oo]"],
    ["latex", "\\left(a,b\\right]"], ["latex", "\\left[ a,b \\right)"], ["latex", "\\left( a \\right)"],
    ["asciimath", "(n choose k)"], ["asciimath", "binom(n)(k)"],
  ],
  "intent-frac" => [
    ["asciimath", "frac(d f)(d x)"], ["asciimath", "frac(d^2 f)(d x^2)"], ["asciimath", "frac(d)(dx)"],
    ["asciimath", "frac(del f)(del x)"], ["asciimath", "frac(del^2 f)(del x^2)"],
    ["asciimath", "frac(del^2 f)(del x del y)"], ["asciimath", "frac(del)(del x)"], ["asciimath", "frac(1)(2)"],
    ["asciimath", "frac(dy)(dx)"], ["asciimath", "frac(d f g)(d x y)"], ["asciimath", "frac(del f)(del)"],
    ["asciimath", "(frac(del f)(del x) g)"], ["asciimath", "(frac(del f)(del x) frac(del g)(del y))"],
    ["latex", "\\frac{d}{dx} f"], ["latex", "\\frac{d^2 y}{dx^2}"],
    ["latex", "\\frac{\\partial f}{\\partial x}"], ["latex", "\\frac{\\partial^2 f}{\\partial x \\partial y}"],
  ],
  "intent-partial-derivative" => [
    ["asciimath", "del_x f"], ["asciimath", "del_(x y) f"], ["asciimath", "del_1 f"], ["asciimath", "del_(x^2) f"],
    ["asciimath", "del_x g h"], ["asciimath", "del_x f + g"], ["asciimath", "del_x f del_y g"],
    ["asciimath", "del_(12) f"], ["latex", "\\partial_x f"], ["latex", "\\partial_{xy} f"],
    ["latex", "\\partial_{x^2} f"], ["latex", "\\partial_x^2 f"],
    ["unicodemath", "∂_𝑥 𝑓"], ["unicodemath", "∂_(𝑥 𝑦) 𝑓"], ["unicodemath", "∂_(𝑥′) 𝑓"],
  ],
  "intent-derivative-subsup" => [
    ["asciimath", "d_x f"], ["asciimath", "d^2 y"], ["latex", "d_x f"], ["latex", "d^2 y"],
    ["unicodemath", "ⅆ_𝑥 𝑓"], ["unicodemath", "ⅆ^2 𝑓"], ["unicodemath", "ⅆ^𝑛 𝑓"], ["unicodemath", "ⅆ_2 𝑓"],
    ["unicodemath", "ⅆ^2 𝑓(𝑥)"], ["unicodemath", "ⅆ^2 𝑓 𝑥"], ["unicodemath", "ⅆ_𝑥 𝑓 𝑔"],
    ["unicodemath", "ⅆ_𝑥 𝑓 𝑔 ℎ"], ["unicodemath", "ⅆ_𝑥 + 𝑓"], ["unicodemath", "ⅆ^2 𝑓 ⅆ𝑥 ⅆ𝑦"],
  ],
  "intent-symbol" => [
    ["latex", "\\DifferentialD x"], ["latex", "\\ComplexI"], ["latex", "\\ComplexJ"], ["latex", "\\intercal"],
    ["latex", "x^\\intercal"], ["latex", "\\frac{\\DifferentialD y}{\\DifferentialD x}"],
    ["latex", "e^{\\ComplexI \\pi}"], ["unicodemath", "ⅆ𝑦/ⅆ𝑥"], ["unicodemath", "ⅅ𝑦"], ["unicodemath", "ⅅ𝑦(𝑥)"],
    ["unicodemath", "ⅅ𝑥𝑦"], ["unicodemath", "ⅅ"], ["unicodemath", "ⅈ"], ["unicodemath", "ⅉ"],
    ["unicodemath", "⊺"], ["unicodemath", "𝐴^⊺"],
  ],
  "intent-table" => [
    ["latex", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"],
    ["latex", "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}"],
    ["latex", "\\begin{Bmatrix} a & b \\\\ c & d \\end{Bmatrix}"],
    ["latex", "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}"],
    ["latex", "\\begin{Vmatrix} a & b \\\\ c & d \\end{Vmatrix}"],
    ["latex", "\\begin{matrix} a & b \\\\ c & d \\end{matrix}"],
    ["latex", "\\begin{array}{cc} a & b \\\\ c & d \\end{array}"],
    ["latex", "\\begin{array}{c|c} a & b \\\\ c & d \\end{array}"],
    ["latex", "\\begin{cases} x & y \\\\ z & w \\end{cases}"],
    ["latex", "\\begin{eqnarray} a & b \\\\ c & d \\end{eqnarray}"],
    ["latex", "\\begin{align} a & b \\\\ c & d \\end{align}"],
    ["latex", "\\begin{split} a & b \\\\ c & d \\end{split}"],
    ["asciimath", "[[a,b],[c,d]]"], ["asciimath", "((a,b),(c,d))"], ["asciimath", "{(a,b),(c,d)}"],
    ["asciimath", "f(x)={(x, x>0),(0, x<=0):}"],
  ],
}.freeze

# Every gem class that takes the `intent` argument, hand-built where no parse
# reaches the shape (the port's parsers are the only path a text row has): the
# 13 n-ary symbols through `Nary`, the five symbols with their own intent
# write, and wrapped nested formulas for `intent_attribute`.
def intent_models
  math = Plurimath::Math
  sym = ->(v) { math::Symbols::Symbol.new(v) }
  nary_ids = %w[Bigwedge Clockoint Cntclockoint Coprod Dint Duni Iiiint Iiint Iint Intclockwise Oiiint Oiint Oint]
  nary = nary_ids.map do |id|
    build = lambda do
      nary_node = math::Function::Nary.new(math::Symbols.const_get(id).new, sym.call("i"), sym.call("n"), sym.call("x"), {})
      math::Formula.new([nary_node])
    end
    ["intent-nary-symbol-#{id.downcase}", build]
  end
  own = %w[Dd UpcaseDd Ii Jj Intercal].flat_map do |id|
    klass = math::Symbols.const_get(id)
    [["intent-own-#{id.downcase}", -> { math::Formula.new([klass.new, sym.call("x")]) }],
     ["intent-own-#{id.downcase}-first", -> { math::Formula.new([sym.call("y"), klass.new]) }],
     ["intent-own-#{id.downcase}-lone", -> { math::Formula.new([klass.new]) }]]
  end
  wrapped = {
    "sin-power" => -> { math::Function::Power.new(math::Function::Sin.new(sym.call("x")), math::Number.new("2")) },
    "lim-power" => -> { math::Function::Power.new(math::Function::Lim.new(sym.call("x"), nil), math::Number.new("2")) },
    "symbol-power" => -> { math::Function::Power.new(sym.call("x"), math::Number.new("2")) },
    "sqrt-power" => -> { math::Function::Power.new(math::Function::Sqrt.new(sym.call("x")), math::Number.new("2")) },
    "powerbase-sin" => -> { math::Function::PowerBase.new(math::Function::Sin.new(sym.call("x")), math::Number.new("1"), math::Number.new("2")) },
    "base-sin" => -> { math::Function::Base.new(math::Function::Sin.new(sym.call("x")), math::Number.new("1")) },
    "arg-symbol" => -> { sym.call("arg") },
    "pr-symbol" => -> { sym.call("Pr") },
    "x-symbol" => -> { sym.call("x") },
  }.map do |name, node|
    ["intent-formula-#{name}", -> { math::Formula.new([math::Formula.new([node.call, sym.call("y")])]) }]
  end
  paren = ->(name) { math::Symbols::Paren.const_get(name).new }
  comma = -> { math::Symbols::Comma.new }
  fence = lambda do |open_name, close_name, body|
    lambda do
      math::Formula.new([math::Function::Fenced.new(open_name && paren.call(open_name), body.call, close_name && paren.call(close_name))])
    end
  end
  pair = -> { [sym.call("a"), comma.call, sym.call("b")] }
  fenced = {
    # `intent_value`'s interval names, one per open/close pair its tables know,
    # and the shapes they fall through on.
    "open-closed" => fence.call("Lround", "Rsquare", pair),
    "closed" => fence.call("Lsquare", "Rsquare", pair),
    "closed-open-round" => fence.call("Lsquare", "Rround", pair),
    "closed-open-square" => fence.call("Lsquare", "Lsquare", pair),
    "open" => fence.call("Rsquare", "Lsquare", pair),
    "open-closed-square" => fence.call("Rsquare", "Rsquare", pair),
    "round" => fence.call("Lround", "Rround", pair),
    "three-items" => fence.call("Lround", "Rsquare", -> { [sym.call("a"), sym.call("b"), sym.call("c")] }),
    "binomial" => fence.call("Lround", "Rround", -> { [math::Function::Frac.new(sym.call("n"), sym.call("k"), { choose: true })] }),
    "curly" => fence.call("Lcurly", "Rcurly", -> { [sym.call("x")] }),
    "no-parens" => fence.call(nil, nil, -> { [sym.call("x")] }),
  }.map { |name, build| ["intent-fenced-#{name}", build] }
  cell = ->(value) { math::Function::Td.new([sym.call(value)]) }
  row = ->(*values) { math::Function::Tr.new(values.map { |v| cell.call(v) }) }
  rows = -> { [row.call("a", "b"), row.call("c", "d")] }
  tables = {
    "cases" => -> { math::Function::Table::Cases.new(rows.call) },
    "cases-no-parens" => -> { math::Function::Table::Cases.new(rows.call, nil, nil) },
    "eqarray" => -> { math::Function::Table::Eqarray.new(rows.call) },
    "eqarray-parens" => -> { math::Function::Table::Eqarray.new(rows.call, "(", ")") },
    "pmatrix-no-parens" => -> { math::Function::Table::Pmatrix.new(rows.call, nil, nil) },
    "vmatrix" => -> { math::Function::Table::Vmatrix.new(rows.call) },
    "bmatrix-curly" => -> { math::Function::Table::Bmatrix.new(rows.call, "{", "}") },
    "array-no-options" => -> { math::Function::Table::Array.new(rows.call, nil, nil, nil) },
    "table-base" => -> { math::Function::Table.new(rows.call, "(", ")") },
  }.map { |name, build| ["intent-table-#{name}", -> { math::Formula.new([build.call]) }] }
  nary + own + wrapped + fenced + tables
end

# A model recorded BEFORE the render, as a deep copy. `serialize_node` hands back
# the nodes' own String objects, and the gem's intent pass appends to some of
# them in place (`IntentEncoding.power_arg`: `str.last << prime` on a String that
# is the rendered element's text AND the source symbol's value), so a model taken
# by reference would record the mutated tree, not the input.
def intent_model(formula)
  JSON.parse(JSON.generate(CorpusGenerator.serialize_node(formula, "model")))
end

def intent_rows(add, oracle)
  with = { "intent" => true }
  spec_options = { "intent" => true, "unaryFunctionSpacing" => false }
  # Every intent row renders a FRESHLY parsed formula: the render above can
  # mutate the tree it was given, so a shared parse would not be the input.
  # A refused parse answers nil, which `add` then records as a parse refusal.
  parse = lambda do |input_format, text|
    Plurimath::Math.parse(text, GEM_PARSE_TYPES.fetch(input_format, input_format).to_sym)
  rescue ORACLE_REFUSAL
    nil
  end

  intent_spec_inputs(oracle).each_with_index do |kase, index|
    add.call(format("intent-spec-%02d", index + 1), "intent-spec",
             "spec/plurimath/math/formula/intent_encoding_spec.rb (#{kase[:lang]} #{kase[:text]})",
             { "format" => kase[:lang], "text" => kase[:text] }, spec_options,
             parse.call(kase[:lang], kase[:text]))
  end

  # As models: the port's UnicodeMath grammar does not parse `ⓘ` (its transform
  # answers "no rule matched"), so the gem's parse is recorded and the port
  # renders it. `Function::Intent` and `Function::Arg` render without the
  # `intent` option at all, so each is also rendered with it left out.
  unicode_intent_examples.each do |example|
    model = intent_model(parse.call("unicodemath", example[:text]))
    source = "spec/plurimath/fixtures/formula_modules/unicode_math_parse_values.rb #{example[:name]} (#{example[:text]})"
    id = "intent-unicodemath-#{example[:name].delete_prefix('EXAMPLE_')}"
    add.call(id, "intent-unicodemath-spec", source, { "model" => model }, with,
             parse.call("unicodemath", example[:text]))
    add.call("#{id}-off", "intent-unicodemath-spec-off", source, { "model" => model }, {},
             parse.call("unicodemath", example[:text]))
  end

  INTENT_PROBES.each do |group, probes|
    probes.each_with_index do |(input_format, text), index|
      id = format("%s-%02d", group, index + 1)
      if input_format == "unicodemath"
        # As a model, like the `ⓘ` examples: the port's UnicodeMath grammar
        # stops short of these inputs, and this row is about the renderer.
        model = intent_model(parse.call(input_format, text))
        add.call(id, group, "measured on the oracle (unicodemath #{text})", { "model" => model }, with,
                 parse.call(input_format, text))
      else
        add.call(id, group, "measured on the oracle",
                 { "format" => input_format, "text" => text }, with, parse.call(input_format, text))
      end
    end
  end

  intent_models.each do |id, build|
    add.call(id, "intent-class", "hand-built on the oracle",
             { "model" => intent_model(build.call) }, with, build.call)
  end

  # `intent: false` and `nil`: byte-identical to leaving the keyword out, on
  # inputs where the true call differs. Each spelling, one input each.
  [["asciimath", "sum_(i=1)^n i"], ["asciimath", "frac(d f)(d x)"], ["asciimath", "(a,b]"],
   ["asciimath", "sin x"]].each_with_index do |(input_format, text), index|
    [["false", false], ["nil", nil]].each do |label, value|
      add.call(format("intent-%s-%02d", label, index + 1), "intent-off", "measured on the oracle",
               { "format" => input_format, "text" => text }, { "intent" => value },
               parse.call(input_format, text))
    end
    add.call(format("intent-omitted-%02d", index + 1), "intent-off", "measured on the oracle",
             { "format" => input_format, "text" => text }, {}, parse.call(input_format, text))
  end

  # With `splitOnLinebreak` the intent flag rides down to every line.
  text = "\\sum_{i=1}^n a_i \\\\ \\frac{d}{dx} f"
  add.call("intent-split-01", "intent-split", "measured on the oracle",
           { "format" => "latex", "text" => text }, { "intent" => true, "splitOnLinebreak" => true },
           parse.call("latex", text))
end

def kwargs(options_hash)
  options_hash.to_h { |key, value| [KEYWORDS.fetch(key), value] }
end

def render(formula, format, options_hash)
  formula.public_send("to_#{format}", **kwargs(options_hash))
end

# Hand-built models for the `unary-function` group, after the gem's own unit
# specs (`spec/plurimath/math/function/{ln,det,gcd,max,phantom,cancel,left}_spec.rb`,
# which build each class over a Symbol, a Number and a Formula holding a
# `Sum(Ampersand, Text("so"))`) plus the shapes the specs leave out: an empty
# slot, and `hide_function_name`, the flag each `to_omml_without_math_tag` reads.
# Each entry is `[id, source, node]`.
def unary_function_models
  m = Plurimath::Math
  f = m::Function
  symbol = ->(value) { m::Symbols::Symbol.new(value) }
  so_sum = lambda do
    m::Formula.new([f::Sum.new(m::Symbols::Ampersand.new, f::Text.new("so"))])
  end
  hidden = lambda do |node|
    node.hide_function_name = true
    node
  end
  cell = ->(value) { f::Td.new([symbol.call(value)]) }

  rows = []
  # The plain aliases (`UnaryFunction` subclasses that add no slot logic of
  # their own for this group), each over the same four shapes: a symbol, a
  # formula, an empty slot and a hidden name. Every one is rendered to every
  # format, so a format that admits an alias where another refuses is pinned as
  # the gem does it. `Sin`, `Cos`, `Lg`, `Ker`, `Deg`, `Liminf` and `Limsup`
  # ride along so a refusal hiding a renderable alias shows up.
  %w[Sin Cos Arccos Arcsin Arctan Coth Tanh Sech Csch Sinh Cosh Csc Exp Sec Tan Cot
     Lcm Min Dim Glb Lub Lg Ker Deg Liminf Limsup
     Longdiv Merror Scarries Msline Sup].each do |name|
    klass = f.const_get(name)
    lower = name.downcase
    src = "measured on the oracle"
    rows << ["alias-#{lower}-symbol", src, klass.new(symbol.call("x"))]
    rows << ["alias-#{lower}-formula", src, klass.new(so_sum.call)]
    rows << ["alias-#{lower}-nil", src, klass.new(nil)]
    rows << ["alias-#{lower}-hidden", src, hidden.call(klass.new(symbol.call("x")))]
  end

  # `Msgroup#parameter_one` must be a LIST (`.map` with no `&.`), unlike the
  # plain aliases above — so its four shapes wrap a symbol/formula in a list
  # instead of holding one directly, and the "empty" row is `[]`, not nil (a
  # bare nil raises in ASCII/LaTeX/MathML/UnicodeMath — measured on the
  # oracle — while OMML's `omml_value` tolerates it; both answers are pinned).
  rows << ["msgroup-symbol", "measured on the oracle", f::Msgroup.new([symbol.call("x")])]
  rows << ["msgroup-formula", "measured on the oracle", f::Msgroup.new([so_sum.call])]
  rows << ["msgroup-nil", "measured on the oracle", f::Msgroup.new(nil)]
  rows << ["msgroup-empty", "measured on the oracle", f::Msgroup.new([])]
  rows << ["msgroup-hidden", "measured on the oracle", hidden.call(f::Msgroup.new([symbol.call("x")]))]

  # `Mglyph#parameter_one` is an OPTIONS HASH (`{alt:, src:, index:}`), not a
  # node — `hide_function_name` never reads it, so there is no hidden shape.
  # `ignoring_index` (`mglyph.rb:66-70`) has three answers worth telling apart:
  # zero (ignored), a control code below 32 that is NOT one of 9/10/13 (kept,
  # so NOT ignored), and an ordinary non-zero index (not ignored) — `alt=x`
  # throughout so every OMML/ASCII/LaTeX/UnicodeMath byte traces to one value.
  rows << ["mglyph-index-0", "measured on the oracle", f::Mglyph.new({ alt: "x", index: 0 })]
  rows << ["mglyph-index-9", "measured on the oracle", f::Mglyph.new({ alt: "x", index: 9 })]
  rows << ["mglyph-index-65", "measured on the oracle", f::Mglyph.new({ alt: "x", index: 65 })]
  rows << ["mglyph-empty", "measured on the oracle", f::Mglyph.new({})]

  # `Ms#parameter_one` is a bare STRING (`value=` even joins an Array with a
  # space before storing it), read RAW — no child render at all — so its
  # shapes are string content, not a node tree.
  rows << ["ms-so", "measured on the oracle", f::Ms.new("so")]
  rows << ["ms-empty", "measured on the oracle", f::Ms.new("")]
  rows << ["ms-nil", "measured on the oracle", f::Ms.new(nil)]

  %w[Ln Det Gcd Max Hom Cancel Phantom].each do |name|
    klass = f.const_get(name)
    lower = name.downcase
    src = "spec/plurimath/math/function/#{lower}_spec.rb"
    src = "measured on the oracle" if name == "Hom"
    rows << ["#{lower}-symbol", src, klass.new(symbol.call("n"))]
    rows << ["#{lower}-number", src, klass.new(m::Number.new("70"))]
    rows << ["#{lower}-formula", src, klass.new(so_sum.call)]
    rows << ["#{lower}-nil", "measured on the oracle", klass.new(nil)]
    rows << ["#{lower}-list", "measured on the oracle", klass.new([symbol.call("x"), m::Number.new("1")])]
    rows << ["#{lower}-hidden", "measured on the oracle", hidden.call(klass.new(symbol.call("n")))]
  end

  left_src = "spec/plurimath/math/function/left_spec.rb"
  rows << ["left-paren", left_src, f::Left.new("(")]
  rows << ["left-brace", "measured on the oracle", f::Left.new("\\{")]
  rows << ["left-nil", "measured on the oracle", f::Left.new(nil)]

  rows << ["mbox-hi", "measured on the oracle", f::Mbox.new("hi")]
  rows << ["mbox-empty", "measured on the oracle", f::Mbox.new("")]
  rows << ["mbox-nil", "measured on the oracle", f::Mbox.new(nil)]
  rows << ["mbox-special", "measured on the oracle", f::Mbox.new("a<b&c")]
  rows << ["mbox-unicode-token", "measured on the oracle", f::Mbox.new("unicode[:alpha]")]

  # `Phantom`'s second `to_unicodemath` branch: the UnicodeMath parser builds a
  # Phantom around an Mpadded for `hphantom` and `vphantom`, so a model does.
  [["hphantom", { mpadded: { depth: "0", height: "0" }, phantom: true }],
   ["vphantom", { mpadded: { width: "0" }, phantom: true }],
   ["smash", { mpadded: { height: "0", depth: "0" }, phantom: false }],
   ["no-options", nil]].each do |label, opts|
    padded = opts.nil? ? f::Mpadded.new(symbol.call("x")) : f::Mpadded.new(symbol.call("x"), opts)
    rows << ["phantom-mpadded-#{label}", "measured on the oracle", f::Phantom.new(padded)]
  end

  rows << ["substack-two", "measured on the oracle",
           f::Substack.new([f::Tr.new([cell.call("a")]), f::Tr.new([cell.call("b")])])]
  rows << ["substack-wide", "measured on the oracle",
           f::Substack.new([f::Tr.new([cell.call("a"), cell.call("b")])])]
  rows << ["substack-nil", "measured on the oracle", f::Substack.new(nil)]
  rows << ["substack-empty", "measured on the oracle", f::Substack.new([])]
  rows << ["substack-nil-row", "measured on the oracle",
           f::Substack.new([f::Tr.new([cell.call("a")]), nil])]
  rows << ["substack-symbols", "measured on the oracle", f::Substack.new([symbol.call("a"), symbol.call("b")])]
  rows
end

# The `unary-function` group's rows, through the caller's `add` lambda: the
# parsed inputs first, then the hand-built models.
# `Underover` hand-built shapes for the `underover` group: a `TernaryFunction`
# subclass the AsciiMath transform's `get_class` census never reaches (it
# arrives only through the UnicodeMath parser's prescript machinery and the
# gem's own linebreak splitting, `core/linebreak.rb`), so it rides alongside
# `unary-function` rather than inside it. A plain base with both scripts, each
# script alone, all three nil, and a base whose `omml_tag_name` is `"undOvr"`
# (a bare `Sum` symbol) — the one shape that sends OMML's `false` arm through
# `underover` a SECOND time instead of the plain `m:sSubSup`.
def underover_models
  m = Plurimath::Math
  f = m::Function
  symbol = ->(value) { m::Symbols::Symbol.new(value) }
  [
    ["symbol-all", f::Underover.new(symbol.call("x"), symbol.call("a"), symbol.call("b"))],
    ["sub-only", f::Underover.new(symbol.call("x"), symbol.call("a"), nil)],
    ["sup-only", f::Underover.new(symbol.call("x"), nil, symbol.call("b"))],
    ["all-nil", f::Underover.new(nil, nil, nil)],
    ["undover-base", f::Underover.new(m::Symbols::Sum.new, symbol.call("a"), symbol.call("b"))],
  ]
end

# `omml_display_style` is set only for the omml payload: `Underover`'s own
# `to_omml_without_math_tag` branches explicitly on `display_style`, which no
# other format reads, so only omml carries the true/false rows beside the
# omitted default (measured: the omitted default and `true` agree; `false`
# differs).
def underover_rows(add, omml_display_style: false)
  underover_models.each do |label, node|
    formula = Plurimath::Math::Formula.new([node])
    input = { "model" => CorpusGenerator.serialize_node(formula, "model") }
    add.call("underover-model-#{label}", "underover", "measured on the oracle", input, {}, formula)
    next unless omml_display_style

    add.call("underover-model-#{label}-display-true", "underover", "measured on the oracle",
             input, { "displayStyle" => true }, formula)
    add.call("underover-model-#{label}-display-false", "underover", "measured on the oracle",
             input, { "displayStyle" => false }, formula)
  end
end

def unary_function_rows(add)
  UNARY_FUNCTION_TEXT_INPUTS.each_with_index do |(input_format, text, source), index|
    add.call(format("unary-function-text-%03d", index + 1), "unary-function", source,
             { "format" => input_format, "text" => text }, {})
  end
  unary_function_models.each do |id, source, node|
    formula = Plurimath::Math::Formula.new([node])
    add.call("unary-function-model-#{id}", "unary-function", source,
             { "model" => CorpusGenerator.serialize_node(formula, "model") }, {}, formula)
  end
end

# --- Table / Frac / Nary rows ------------------------------------------------

# Whether a formula holds a node of any of these kinds, anywhere below it.
def holds_table_frac_or_nary?(value)
  case value
  when ::Array then value.any? { |v| holds_table_frac_or_nary?(v) }
  when ::Hash then value.each_value.any? { |v| holds_table_frac_or_nary?(v) }
  when Plurimath::Math::Core
    return true if value.is_a?(Plurimath::Math::Function::Table) ||
                   value.is_a?(Plurimath::Math::Function::Nary) ||
                   value.is_a?(Plurimath::Math::Function::Frac)

    value.variables.any? { |ivar| holds_table_frac_or_nary?(value.get(ivar)) }
  else false
  end
end

# The constants `spec/plurimath/math/formula/omml_spec.rb` renders, read from the
# file (each `let(:exp) { ExpectedValues::EX_NNN }`), that hold a Table, Nary or
# Frac.
def omml_spec_table_frac_nary_values(oracle)
  path = File.join(oracle, "spec/plurimath/math/formula/omml_spec.rb")
  names = File.read(path).scan(/ExpectedValues::(\w+)/).flatten.uniq.sort
  abort "REFUSING: no ExpectedValues constants in #{path}" if names.empty?

  names.filter_map do |name|
    formula = ExpectedValues.const_get(name)
    [name, formula] if holds_table_frac_or_nary?(formula)
  end
end

# Hand-built Tables, Fracs and Nary the parsers cannot reach or never vary: every
# branch of `Table#to_omml_without_math_tag` (`single_table?`, the three
# `nil_option?` reads, `fenced_table` with either paren missing), `Frac#fpr_element`
# and `Nary#chr_value`, including the shapes where the gem raises. A non-hash
# options slot (a String, `false`) is left out: the port's node constructors copy
# the slot as a record, so no serialized model can spell it. Each entry is
# `[id, node]`; the node is wrapped in a Formula by the caller.
def table_frac_nary_probes
  fn = Plurimath::Math::Function
  sy = Plurimath::Math::Symbols
  sym = ->(value) { sy::Symbol.new(value) }
  tr = ->(*cells) { fn::Tr.new(cells.map { |v| fn::Td.new([sym.call(v)]) }) }
  table = lambda do |rows, open = nil, close = nil, opts = {}|
    fn::Table.new(rows, open, close, opts)
  end
  frac = ->(opts) { fn::Frac.new(sym.call("a"), sym.call("b"), opts) }
  nary = ->(opts) { fn::Nary.new(sy::Sum.new, sym.call("d"), sym.call("u"), sym.call("x"), opts) }
  [
    ["table-nil-options-single-column", table.call([tr.call("a")], nil, nil, nil)],
    ["table-nil-options-two-columns", table.call([tr.call("a", "b")], nil, nil, nil)],
    ["table-empty-options-single-column", table.call([tr.call("a")])],
    ["table-no-rows", table.call([])],
    ["table-no-rows-parens", table.call([], sy::Paren::Lround.new, sy::Paren::Rround.new)],
    ["table-open-paren-only", table.call([tr.call("a")], sy::Paren::Lround.new)],
    ["table-close-paren-only", table.call([tr.call("a")], nil, sy::Paren::Rround.new)],
    ["table-nil-valued-paren", table.call([tr.call("a")], sym.call(nil), sym.call(")"))],
    ["table-norm-parens", table.call([tr.call("a")], sy::Paren::Norm.new, sy::Paren::Norm.new)],
    ["table-frame-solid", table.call([tr.call("a")], nil, nil, { frame: "solid" })],
    ["table-frame-none", table.call([tr.call("a")], nil, nil, { frame: "none" })],
    ["table-columnlines-solid", table.call([tr.call("a")], nil, nil, { columnlines: "solid" })],
    ["table-rowlines-solid", table.call([tr.call("a")], nil, nil, { rowlines: "solid" })],
    ["table-rowlines-empty", table.call([tr.call("a")], nil, nil, { rowlines: "" })],
    ["table-unrelated-option", table.call([tr.call("a")], nil, nil, { columnalign: "left" })],
    ["table-ragged-rows", table.call([tr.call("a"), tr.call("b", "c")])],
    ["matrix-default-parens", fn::Table::Matrix.new([tr.call("a", "b")])],
    ["array-default-parens", fn::Table::Array.new([tr.call("a", "b")])],
    ["cases-default-parens", fn::Table::Cases.new([tr.call("a"), tr.call("b")])],
    ["vmatrix-no-parens", fn::Table::Vmatrix.new([tr.call("a")], nil, nil, {})],
    ["frac-no-options", fn::Frac.new(sym.call("a"), sym.call("b"))],
    ["frac-empty-options", frac.call({})],
    ["frac-no-bar", frac.call({ linethickness: "0" })],
    ["frac-skewed", frac.call({ bevelled: "true" })],
    ["frac-bevelled-false", frac.call({ bevelled: "false" })],
    ["frac-no-bar-and-skewed", frac.call({ linethickness: "0", bevelled: "true" })],
    ["frac-thickness-one", frac.call({ linethickness: "1" })],
    ["frac-thickness-integer-zero", frac.call({ linethickness: 0 })],
    ["frac-unrelated-option", frac.call({ ldiv: true })],
    ["frac-false-options", frac.call(false)],
    ["nary-empty-options", nary.call({})],
    ["nary-nil-options", nary.call(nil)],
    ["nary-undover", nary.call({ type: "undOvr" })],
    ["nary-type-nil", nary.call({ type: nil })],
    ["nary-type-false", nary.call({ type: false })],
    ["nary-type-integer", nary.call({ type: 5 })],
    ["nary-type-true", nary.call({ type: true })],
    ["nary-mask-ignored", nary.call({ mask: 13 })],
  ]
end

def table_frac_nary_rows(add, oracle)
  TABLE_FRAC_NARY_TEXT_SOURCES.each_with_index do |(input_format, text), index|
    add.call(format("tfn-%s-%02d", input_format, index + 1), "table-frac-nary-survey",
             "renderer survey of the LaTeX, HTML and UnicodeMath parsers, measured on the oracle",
             { "format" => input_format, "text" => text }, {})
  end
  omml_spec_table_frac_nary_values(oracle).each do |name, formula|
    add.call("tfn-spec-#{name.downcase}", "table-frac-nary-spec",
             "spec/plurimath/math/formula/omml_spec.rb ExpectedValues::#{name}",
             { "model" => CorpusGenerator.serialize_node(formula, "model") }, {}, formula)
  end
  table_frac_nary_probes.each do |id, node|
    formula = Plurimath::Math::Formula.new([node])
    add.call("tfn-probe-#{id}", "table-frac-nary-probe", "hand-built, measured on the oracle",
             { "model" => CorpusGenerator.serialize_node(formula, "model") }, {}, formula)
  end
end

# `Nary#to_mathml_without_math_tag` under `options[:mask]` (nary.rb:56,
# `Core#masked_tag`): the four fillings of the two script slots against every mask
# value that reaches a different branch, and a few again with `type: "undOvr"`.
def nary_mask_rows(add)
  fn = Plurimath::Math::Function
  sy = Plurimath::Math::Symbols
  build = lambda do |lower, upper, opts|
    nary = fn::Nary.new(sy::Sum.new, lower && sy::Symbol.new(lower), upper && sy::Symbol.new(upper),
                        sy::Symbol.new("x"), opts)
    Plurimath::Math::Formula.new([nary])
  end
  emit = lambda do |id, formula|
    add.call(id, "nary-mask", "measured on the oracle",
             { "model" => CorpusGenerator.serialize_node(formula, "model") }, {}, formula)
  end
  NARY_MASK_FILLINGS.each do |lower, upper|
    slots = "#{lower ? 'lower' : 'nolower'}-#{upper ? 'upper' : 'noupper'}"
    NARY_MASK_VALUES.each do |mask|
      label = mask.is_a?(::String) ? "str-#{mask}" : mask.inspect
      emit.call("nary-mask-#{slots}-#{label}", build.call(lower, upper, { mask: mask }))
    end
    [1, 2, 13, 17, 20, 29].each do |mask|
      emit.call("nary-mask-#{slots}-#{mask}-undover", build.call(lower, upper, { mask: mask, type: "undOvr" }))
    end
  end
  # `to_s` on a mask the gem coerces: absent key, and the nil options hash the gem cannot read.
  emit.call("nary-mask-key-absent", build.call("d", "u", {}))
  emit.call("nary-nil-options", build.call("d", "u", nil))
end

def rows_for(format, oracle)
  rows = []
  # The gem's parser is slow (seconds for a table), and several rows share an
  # input; render never mutates a parsed formula (the split path clones it).
  parsed = {}

  # `formula` is given for a hand-built input, whose row records its model;
  # otherwise the gem parses `input` itself.
  add = lambda do |id, group, source, input, opts, formula = nil|
    row = { "id" => id, "group" => group, "source" => source, "input" => input, "options" => opts }
    if formula.nil?
      begin
        key = [input.fetch("format"), input.fetch("text")]
        formula = parsed[key] ||= Plurimath::Math.parse(input.fetch("text"), GEM_PARSE_TYPES.fetch(input.fetch("format")))
      rescue ORACLE_REFUSAL => e
        row["raises"] = e.class.name
        row["raisedIn"] = "parse"
      end
    end
    unless formula.nil?
      # The split itself, one serialized model per line: what `new_line_support`
      # hands each renderer. Checked apart from the rendered bytes so the walk is
      # verified even for a kind the port's renderer does not yet render.
      # Not for a `displayStyle` variant: the split does not depend on it, and
      # the base row of the same input already carries it.
      if opts["splitOnLinebreak"] && !opts.key?("displayStyle")
        row["split"] = formula.new_line_support.map { |line| CorpusGenerator.serialize_node(line, "split") }
      end
      begin
        row["expected"] = render(formula, format, opts)
      rescue ORACLE_REFUSAL => e
        row["raises"] = e.class.name
        row["raisedIn"] = "render"
      end
    end
    rows << row
  end

  # The `unary-function` group is the whole option-free payload for the four
  # formats whose renderers the B3 options do not touch (the `ternary-function`
  # group is appended by the caller).
  if UNARY_ONLY_FORMATS.include?(format)
    unary_function_rows(add)
    underover_rows(add)
    return rows
  end

  # The gem's own line-break fixtures, rendered exactly as its specs do
  # (`split_on_linebreak: true`; MathML also `unary_function_spacing: false`),
  # then again with `display_style: false` to show the two options compose.
  raise "no row routing for format #{format}" unless LINE_BREAK_FORMATS.include?(format)

  constants = LineBreakValues.constants.sort
  raise "expected 90 LineBreak values, found #{constants.length}" unless constants.length == 90

  spec_options = format == "mathml" ? { "splitOnLinebreak" => true, "unaryFunctionSpacing" => false } : { "splitOnLinebreak" => true }
  constants.each do |name|
    number = name.to_s.delete_prefix("LineBreak_")
    formula = LineBreakValues.const_get(name)
    model = CorpusGenerator.serialize_node(formula, "model")
    input = { "model" => model }
    source = "spec/plurimath/#{format}/line_breaks_spec.rb LineBreak_#{number}"
    add.call("line-break-#{number}", "line-break-spec", source, input, spec_options, formula)
    add.call("line-break-#{number}-display-false", "line-break-spec-display-style", source,
             input, spec_options.merge("displayStyle" => false), formula)
  end

  # Inputs the gem parses itself, in the two syntaxes that yield a Linebreak.
  TEXT_LINEBREAK_SOURCES.each_with_index do |(input_format, text), index|
    id = format("%s-linebreak-%02d", input_format, index + 1)
    add.call(id, "parsed-linebreak", "measured on the oracle",
             { "format" => input_format, "text" => text }, spec_options)
  end
  # AsciiMath's `\` is not a Linebreak: splitting must leave one line.
  add.call("asciimath-backslash-no-break", "parsed-linebreak", "measured on the oracle",
           { "format" => "asciimath", "text" => "a \\ b" }, spec_options)

  unless DISPLAY_STYLE_FORMATS.include?(format)
    # MathML only: `to_mathml(intent: true)` has no OMML counterpart.
    intent_rows(add, oracle)
    unary_function_rows(add)
    nary_mask_rows(add)
    underover_rows(add)
    return rows
  end

  # `display_style:` — the asciimath spec's own `.to_omml` inputs, with the
  # option left out (the spec's default is `display_style: true`) and `false`.
  asciimath_spec_omml_inputs(oracle).each do |kase|
    # UnitsML is deferred wholesale (ARCHITECTURE.md section 5): the port's
    # parser degrades `unitsml(...)` to literal text, so a row for it would only
    # re-measure that known, recorded divergence.
    next if kase[:text].include?("unitsml(")

    input = { "format" => "asciimath", "text" => kase[:text] }
    source = "spec/plurimath/asciimath_spec.rb .to_omml #{kase[:name]} example ##{kase[:number]}"
    add.call("asciimath-spec-omml-#{kase[:number]}", "display-style-spec", source, input.dup, {})
    add.call("asciimath-spec-omml-#{kase[:number]}-display-false", "display-style-spec", source,
             input.dup, { "displayStyle" => false })
  end

  # Where the option is observable, and every spelling of it.
  DISPLAY_STYLE_PROBES.each_with_index do |text, index|
    DISPLAY_STYLE_VALUES.each do |value|
      label = value.nil? ? "nil" : value.inspect.delete('"')
      # `id` needs no escaping: a value label is one of nil, true, false.
      label = "str-#{label}" if value.is_a?(::String)
      add.call("display-probe-#{index + 1}-#{label}", "display-style-probe", "measured on the oracle",
               { "format" => "asciimath", "text" => text }, { "displayStyle" => value })
    end
  end

  # A split formula with the option off, once, on an input where it shows.
  add.call("display-probe-split-false", "display-style-probe", "measured on the oracle",
           { "format" => "latex", "text" => "\\lim_{x \\to 0} f(x) \\\\ \\underset{a}{b}" },
           { "splitOnLinebreak" => true, "displayStyle" => false })
  unary_function_rows(add)
  table_frac_nary_rows(add, oracle)
  underover_rows(add, omml_display_style: true)
  rows
end

# Rows of the `ternary-function` group for one target format. Each renders
# through the gem's public `to_<format>` with no options, so the bytes are what
# a caller gets; a refusal is the gem's ParseError, as everywhere in this file.
def ternary_rows_for(format)
  rows = []
  add = lambda do |id, source, input, formula|
    row = { "id" => id, "group" => TERNARY_GROUP, "source" => source, "input" => input, "options" => {} }
    begin
      row["expected"] = formula.public_send("to_#{format}")
    rescue ORACLE_REFUSAL => e
      row["raises"] = e.class.name
      row["raisedIn"] = "render"
    end
    rows << row
  end

  TERNARY_TEXT_INPUTS.each_with_index do |(input_format, text), index|
    formula = Plurimath::Math.parse(text, input_format == "unicodemath" ? :unicode : input_format.to_sym)
    add.call(Kernel.format("ternary-%s-text-%02d", input_format, index + 1), "measured on the oracle",
             { "format" => input_format, "text" => text }, formula)
  end
  TERNARY_SPEC_CONSTANTS.each do |name|
    formula = LineBreakValues.const_get(name)
    add.call("ternary-spec-#{name.to_s.downcase.tr('_', '-')}",
             "spec/plurimath/fixtures/formula_modules/line_break_values.rb #{name}",
             { "model" => CorpusGenerator.serialize_node(formula, "model") }, formula)
  end
  TERNARY_BUILT_INPUTS.each do |id, build|
    formula = Plurimath::Math::Formula.new([build.call(Plurimath::Math)])
    add.call("ternary-built-#{id}", "hand-built on the oracle",
             { "model" => CorpusGenerator.serialize_node(formula, "model") }, formula)
  end
  rows
end


# One input's text, read from a spec of the pinned oracle rather than retyped:
# the `let(:...)` that follows the `nth` context called `title` — a one-line
# `{ "..." }` literal or a heredoc — evaluated (the file is the oracle's own)
# and stripped of its trailing newline.
def spec_input(oracle, relative, title, nth = 0)
  path = File.join(oracle, "spec/plurimath", relative)
  lines = File.readlines(path)
  starts = lines.each_index.select { |i| lines[i].strip == %(context "#{title}" do) }
  start = starts[nth] or abort "REFUSING: no context #{title.inspect} (##{nth}) in #{path}"
  at = ((start + 1)..(start + 4)).find { |i| lines[i].match?(/\A\s*let\(:\w+\)/) }
  abort "REFUSING: no let after #{title.inspect} in #{path}" unless at

  if (m = lines[at].match(/\{\s*(.+?)\s*\}\s*\z/))
    eval(m[1]).strip # rubocop:disable Security/Eval
  else
    tag = lines[at + 1][/<<~(\w+)/, 1] or abort "REFUSING: no heredoc after #{title.inspect} in #{path}"
    stop = ((at + 2)..lines.length).find { |i| lines[i].match?(/\A\s*#{tag}\s*\z/) }
    eval(lines[(at + 1)..stop].join).strip # rubocop:disable Security/Eval
  end
end

# The rows of the `binary-function-kinds` group.
def binary_kind_rows(oracle)
  fn = Plurimath::Math::Function
  sy = Plurimath::Math::Symbols
  mt = Plurimath::Math
  sym = ->(v) { sy::Symbol.new(v) }
  num = ->(v) { mt::Number.new(v) }
  txt = ->(v) { fn::Text.new(v) }
  formula = ->(*v) { mt::Formula.new(v) }
  bf = lambda do |name, one, two, hide: false|
    node = fn.const_get(name).new(one, two)
    node.hide_function_name = true if hide
    node
  end
  fenced = ->(*v) { fn::Fenced.new(sy::Lparen.new, v, sy::Rparen.new) }
  a = sym.("a")
  b = sym.("b")
  ab_sum = formula.(sym.("a"), sy::Plus.new, sym.("b"))

  rows = []
  add = lambda do |id, group, source, input, options_hash = {}, only = nil, parsed = nil|
    formula_in = parsed
    if formula_in.nil?
      syntax = input.fetch("format")
      formula_in = Plurimath::Math.parse(input.fetch("text"), syntax == "unicodemath" ? :unicode : syntax.to_sym)
    end
    row = { "id" => id, "group" => group, "source" => source, "input" => input }
    # A MathML (or any other unparsed) source keeps its text for provenance and
    # gains the gem's parse, which is what the port renders.
    if input.key?("format") && !PORT_PARSED_FORMATS.include?(input["format"])
      row["input"] = input.merge("model" => CorpusGenerator.serialize_node(formula_in, "model"))
    end
    row["options"] = options_hash unless options_hash.empty?
    row["formats"] = only if only
    results = {}
    (only || BINARY_KIND_FORMATS).each do |format|
      call_options = format == "omml" && options_hash.key?("displayStyle") ? { display_style: options_hash["displayStyle"] } : {}
      begin
        bytes = formula_in.public_send("to_#{format}", **call_options)
        # A node where the gem prints `Object#to_s` is a heap address: the
        # bytes change from run to run, so no fixture can hold them. The row
        # says so instead, and the port must refuse it.
        results[format] =
          if bytes.to_s.match?(/#(<|&lt;)Plurimath::[^>]*0x[0-9a-f]+|@value=/)
            { "unreproducible" => "the gem prints a node's Object#to_s, which carries a heap address" }
          else
            { "expected" => bytes }
          end
      rescue ORACLE_REFUSAL => e
        results[format] = { "raises" => e.class.name, "raisedIn" => "render" }
      end
    end
    row["results"] = results
    rows << row
  end

  # Hand-built formulas: every branch of each kind's `to_<format>`.
  hand = lambda do |id, group, source, node, options_hash = {}, only = nil|
    top = mt::Formula.new([node])
    add.call(id, group, source, { "model" => CorpusGenerator.serialize_node(top, "model") },
             options_hash, only, top)
  end

  slots = {
    "ab" => [a, b], "a-nil" => [a, nil], "nil-b" => [nil, b], "nil-nil" => [nil, nil],
    "formula" => [ab_sum, formula.(sym.("c"))],
    "number" => [num.("1"), num.("2")],
    "fenced" => [fenced.(sym.("x")), fenced.(sym.("y"))],
  }

  # Over: both slots, each absent, formulas, fenced (unicodemath does not wrap a
  # fence again), the hidden-name variant `line_breaking` produces, and a slot
  # holding a bare string, where the gem raises.
  slots.each { |k, (x, y)| hand.call("over-#{k}", "over", "measured on the oracle", bf.("Over", x, y)) }
  hand.call("over-hidden", "over", "measured on the oracle", bf.("Over", a, b, hide: true))
  hand.call("over-hidden-nil", "over", "measured on the oracle", bf.("Over", nil, nil, hide: true))
  hand.call("over-string-slot", "over", "measured on the oracle", bf.("Over", "x", b))
  hand.call("over-nested", "over", "measured on the oracle",
            bf.("Over", bf.("Over", a, b), bf.("Over", sym.("c"), sym.("d"))))
  hand.call("over-in-stackrel", "over", "measured on the oracle",
            bf.("Stackrel", bf.("Over", a, b), bf.("Over", sym.("c"), sym.("d"))))

  # Stackrel: html and omml are the two formats the port refused; the rest are
  # here so the same inputs hold every format.
  slots.each { |k, (x, y)| hand.call("stackrel-#{k}", "stackrel", "measured on the oracle", bf.("Stackrel", x, y)) }
  hand.call("stackrel-spec-symbol-prod", "stackrel", "spec/plurimath/math/function/stackrel_spec.rb contains Symbol as value",
            bf.("Stackrel", sym.("n"),
                formula.(fn::Prod.new(sy::Ampersand.new, txt.("so")))))
  hand.call("stackrel-spec-number-symbol", "stackrel", "spec/plurimath/math/function/stackrel_spec.rb contains Number as value",
            bf.("Stackrel", num.("70"), sym.("n")))
  hand.call("stackrel-spec-sum-prod", "stackrel", "spec/plurimath/math/function/stackrel_spec.rb contains Formula as value",
            bf.("Stackrel", formula.(fn::Sum.new(sy::Ampersand.new, txt.("so"))),
                formula.(fn::Prod.new(sy::Ampersand.new, txt.("so")))))
  hand.call("stackrel-string-slot", "stackrel", "measured on the oracle", bf.("Stackrel", "x", b))

  # Mlabeledtr. The gem reads BOTH mathml slots unguarded, so an absent one
  # raises there; unicodemath prints the second slot's raw `value`.
  slots.each { |k, (x, y)| hand.call("mlabeledtr-#{k}", "mlabeledtr", "measured on the oracle", bf.("Mlabeledtr", x, y)) }
  hand.call("mlabeledtr-text-label", "mlabeledtr", "measured on the oracle", bf.("Mlabeledtr", a, txt.("b")))
  # A symbol with no value: OMML's symbol renderer is not this group's to
  # measure, so that one target is left out.
  hand.call("mlabeledtr-symbol-nil-value", "mlabeledtr", "measured on the oracle", bf.("Mlabeledtr", a, sym.(nil)),
            {}, %w[asciimath latex mathml html unicodemath])
  hand.call("mlabeledtr-named-symbol-label", "mlabeledtr", "measured on the oracle", bf.("Mlabeledtr", a, sy::Plus.new))
  hand.call("mlabeledtr-frac-label", "mlabeledtr", "measured on the oracle", bf.("Mlabeledtr", a, fn::Frac.new(a, b)))
  hand.call("mlabeledtr-entity-value", "mlabeledtr", "measured on the oracle", bf.("Mlabeledtr", a, sym.("&#x3b1;")))
  hand.call("mlabeledtr-string-slot", "mlabeledtr", "measured on the oracle", bf.("Mlabeledtr", "x", b))

  # Inf: the limit slots, the three unicodemath branches of each slot (mini
  # sized, prime, `Power`/`Base`, everything else), and display style off for
  # omml, where `underover` takes its `PowerBase` branch.
  slots.each { |k, (x, y)| hand.call("inf-#{k}", "inf", "measured on the oracle", bf.("Inf", x, y)) }
  hand.call("inf-mini-sub-sup", "inf", "measured on the oracle",
            bf.("Inf", sy::Symbol.new("2", mini_sub_sized: true), sy::Symbol.new("2", mini_sup_sized: true)))
  hand.call("inf-prime-sup", "inf", "measured on the oracle", bf.("Inf", a, sym.("&#x2032;")))
  hand.call("inf-power-sup", "inf", "measured on the oracle", bf.("Inf", a, fn::Power.new(a, num.("2"))))
  hand.call("inf-base-sub", "inf", "measured on the oracle", bf.("Inf", fn::Base.new(a, b), num.("2")))
  hand.call("inf-string-slot", "inf", "measured on the oracle", bf.("Inf", "x", b))
  %w[ab a-nil nil-b nil-nil].each do |k|
    x, y = slots.fetch(k)
    hand.call("inf-#{k}-display-false", "inf-display-style", "measured on the oracle", bf.("Inf", x, y),
              { "displayStyle" => false }, %w[omml])
  end

  # Menclose, one row per enclosure type a branch distinguishes. The type is a
  # string, or nil; a node there prints as a heap address in mathml and html,
  # which the row records as `unreproducible` rather than as bytes.
  body = num.("3")
  notations = {
    "box" => "box", "circle" => "circle", "roundedbox" => "roundedbox",
    "circle-box" => "circle box", "circle-top" => "circle top",
    "longdiv" => "longdiv", "bottom" => "bottom",
    "xcancel" => "updiagonalstrike downdiagonalstrike", "bcancel" => "updiagonalstrike",
    "cancel" => "downdiagonalstrike", "top" => "top", "top-bottom" => "top bottom",
    "all-sides" => "top bottom left right", "horizontalstrike" => "horizontalstrike",
    "vertical-updiagonal" => "verticalstrike updiagonalstrike",
    "top-radical" => "top radical", "actuarial" => "actuarial", "duplicate-top" => "top top",
    "padded" => "  top   left ", "empty" => "", "nul" => "top\0left",
  }
  notations.each do |k, notation|
    hand.call("menclose-#{k}", "menclose", "measured on the oracle", bf.("Menclose", notation, body))
  end
  hand.call("menclose-nil-type", "menclose", "measured on the oracle", bf.("Menclose", nil, body))
  hand.call("menclose-nil-nil", "menclose", "measured on the oracle", bf.("Menclose", nil, nil))
  %w[box top longdiv actuarial].each do |k|
    hand.call("menclose-#{k}-nil-body", "menclose", "measured on the oracle", bf.("Menclose", notations.fetch(k), nil))
  end
  hand.call("menclose-formula-body", "menclose", "measured on the oracle",
            bf.("Menclose", "circle", ab_sum))
  hand.call("menclose-top-formula-body", "menclose", "measured on the oracle",
            bf.("Menclose", "top", ab_sum))
  hand.call("menclose-symbol-type", "menclose", "measured on the oracle", bf.("Menclose", a, body))
  hand.call("menclose-formula-type", "menclose", "measured on the oracle", bf.("Menclose", ab_sum, body))
  hand.call("menclose-string-body", "menclose", "measured on the oracle", bf.("Menclose", "box", "x"))
  hand.call("menclose-nested", "menclose", "measured on the oracle",
            bf.("Menclose", "box", bf.("Menclose", "circle", a)))
  %w[box top-radical actuarial].each do |k|
    hand.call("menclose-#{k}-display-false", "menclose-display-style", "measured on the oracle",
              bf.("Menclose", notations.fetch(k), body), { "displayStyle" => false }, %w[omml])
  end

  # Inputs the gem parses itself, each in a syntax the port has a parser for.
  # From the gem's specs where the spec has one; the rest measured.
  text = lambda do |id, group, source, format, string, only = nil|
    add.call(id, group, source, { "format" => format, "text" => string }, {}, only)
  end
  from_spec = lambda do |id, group, relative, title, format, only = nil|
    text.call(id, group, "spec/plurimath/#{relative} #{title}", format, spec_input(oracle, relative, title), only)
  end
  from_spec.call("latex-over-simple", "over", "latex/parser_spec.rb", "contains simple use of over", "latex")
  from_spec.call("latex-over-base", "over", "latex/parser_spec.rb", "contains over with base value", "latex")
  from_spec.call("latex-over-power", "over", "latex/parser_spec.rb", "contains over with power value", "latex")
  from_spec.call("latex-over-nested", "over", "latex/parser_spec.rb", "contains latex equation #42", "latex")
  from_spec.call("latex-over-metanorma", "over", "latex/metanorma_examples_spec.rb", "contains example #9", "latex")
  from_spec.call("latex-inf-fn", "inf", "latex_spec.rb", "contains example #35", "latex")
  # These two hold `\lg`, a unary function whose html and omml renderers are
  # not this group's to measure, so those targets are left out.
  no_lg = %w[asciimath latex mathml unicodemath]
  from_spec.call("latex-inf-oint", "inf", "latex_spec.rb", "contains inf with power base values example #53", "latex", no_lg)
  from_spec.call("latex-inf-sub-sup", "inf", "latex_spec.rb", "contains simple inf example #05", "latex", no_lg)
  {
    "over" => [
      ["latex", "\\left(a\\over b\\right)"], ["latex", "a\\over b"], ["latex", "{a\\over b}_1"],
      ["latex", "{a\\over b}+c"], ["latex", "x = {a \\over b} + {c \\over d}"],
      ["latex", "\\frac{{a\\over b}}{c}"], ["latex", "\\sqrt{{a\\over b}}"]
    ],
    "inf" => [["latex", "\\inf_1"], ["latex", "\\inf"]],
    "stackrel" => [
      ["latex", "\\stackrel{x}{y}"], ["latex", "\\stackrel{a}{b}"], ["latex", "\\stackrel{a+b}{c}"],
      ["latex", "\\stackrel{\\frac{a}{b}}{c}"]
    ],
    "menclose" => [
      ["unicodemath", "3x⃝"], ["unicodemath", "a⃝"], ["unicodemath", "a⃞"], ["unicodemath", "╲(a)"],
      ["unicodemath", "▢(a)"], ["unicodemath", "╳(a)"], ["unicodemath", "⬭(a)"]
    ],
    "mlabeledtr" => [["unicodemath", "a#b"], ["unicodemath", "a b#c"]],
  }.each do |group, inputs|
    inputs.each_with_index do |(syntax, string), index|
      text.call(format("%s-%s-measured-%02d", group, syntax, index + 1), group,
                "measured on the oracle", syntax, string)
    end
  end

  # MathML sources of the gem's specs: the port has no MathML parser, so these
  # carry the gem's parse as a model. `Menclose` and `Mlabeledtr` come from
  # MathML in practice, which is why the specs use it.
  from_mathml = lambda do |id, group, relative, title, nth = 0|
    string = spec_input(oracle, relative, title, nth)
    add.call(id, group, "spec/plurimath/#{relative} #{title}", { "format" => "mathml", "text" => string })
  end
  from_mathml.call("mathml-menclose-box", "menclose", "mathml_spec.rb", "contains menclose tag Mathml")
  from_mathml.call("mathml-menclose-updiagonalstrike", "menclose", "mathml_spec.rb", "contains menclose tags in Mathml")
  from_mathml.call("mathml-menclose-circle-box", "menclose", "mathml/v3/section_3_spec.rb", "contains mathml v3 #3 example #41")
  from_mathml.call("mathml-menclose-no-notation", "menclose", "mathml/v3/section_3_spec.rb", "contains mathml v3 #3 example #42")
  from_mathml.call("mathml-menclose-actuarial", "menclose", "mathml/v3/section_3_spec.rb", "contains mathml v3 #3 example #43")
  from_mathml.call("mathml-mlabeledtr", "mlabeledtr", "mathml/v3/section_3_spec.rb", "contains mathml v3 #3 example #55")
  add.call("mathml-menclose-top-radical", "menclose",
           "spec/plurimath/unicode_math_spec.rb menclose mixing a known and an unrecognized notation",
           { "format" => "mathml", "text" => '<math><menclose notation="top radical"><mi>x</mi></menclose></math>' })

  rows
end

outputs = FORMATS.to_h do |format|
  dir = File.expand_path(File.join(options[:out], format))
  payload_path = File.join(dir, PAYLOAD_BASENAME)
  sidecar, provenance = RenderFixtureProvenance.prepare(
    oracle: oracle,
    payload_path: payload_path,
    generator_path: GENERATOR_RELATIVE_PATH,
    allow_dirty: options[:allow_dirty],
    corpus: false,
  )
  [format, { dir: dir, payload_path: payload_path, sidecar: sidecar, provenance: provenance }]
end

binary_payload_path = File.expand_path(File.join(options[:out], BINARY_KIND_PAYLOAD))
binary_sidecar, binary_provenance = RenderFixtureProvenance.prepare(
  oracle: oracle,
  payload_path: binary_payload_path,
  generator_path: GENERATOR_RELATIVE_PATH,
  allow_dirty: options[:allow_dirty],
  corpus: false,
)

outputs.each do |format, target|
  rows = rows_for(format, oracle) + ternary_rows_for(format)
  ids = rows.map { |r| r["id"] }
  duplicates = ids.tally.select { |_, n| n > 1 }.keys
  abort "REFUSING: duplicate ids in #{format}: #{duplicates.join(', ')}" unless duplicates.empty?

  rendered = rows.count { |r| r.key?("expected") }
  raised = rows.count { |r| r.key?("raises") }
  abort "REFUSING: #{format} produced zero rendered rows" if rendered.zero?
  unless rendered + raised == rows.length
    abort "REFUSING: #{rows.length} rows but #{rendered} rendered + #{raised} raised; a row is both or neither"
  end

  payload = {
    "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
    "schema" => SCHEMA,
    "format" => format,
    "caseCount" => rows.length,
    "renderedCount" => rendered,
    "raisedCount" => raised,
    "cases" => rows,
  }
  FileUtils.mkdir_p(target[:dir])
  payload_bytes = "#{JSON.pretty_generate(payload)}\n"
  File.binwrite(target[:payload_path], payload_bytes)
  RenderFixtureProvenance.write_manifest(
    sidecar_path: target[:sidecar],
    payload_path: target[:payload_path],
    payload_schema: SCHEMA,
    payload_bytes: payload_bytes,
    provenance: target[:provenance],
  )
  puts "#{format}: #{rows.length} rows, #{rendered} rendered, #{raised} raised -> " \
       "#{target[:payload_path]}, #{target[:sidecar]}"
end

# The `binary-function-kinds` payload.
binary_rows = binary_kind_rows(oracle)
binary_duplicates = binary_rows.map { |r| r["id"] }.tally.select { |_, n| n > 1 }.keys
abort "REFUSING: duplicate ids in binary-function-kinds: #{binary_duplicates.join(', ')}" unless binary_duplicates.empty?

binary_results = binary_rows.flat_map { |r| r["results"].values }
binary_rendered = binary_results.count { |r| r.key?("expected") }
binary_raised = binary_results.count { |r| r.key?("raises") }
binary_unreproducible = binary_results.count { |r| r.key?("unreproducible") }
abort "REFUSING: binary-function-kinds produced zero rendered results" if binary_rendered.zero?
abort "REFUSING: binary-function-kinds produced zero refusals" if binary_raised.zero?

binary_payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => BINARY_KIND_SCHEMA,
  "format" => File.basename(File.dirname(BINARY_KIND_PAYLOAD)),
  "caseCount" => binary_rows.length,
  "renderedCount" => binary_rendered,
  "raisedCount" => binary_raised,
  "unreproducibleCount" => binary_unreproducible,
  "cases" => binary_rows,
}
FileUtils.mkdir_p(File.dirname(binary_payload_path))
binary_bytes = "#{JSON.pretty_generate(binary_payload)}\n"
File.binwrite(binary_payload_path, binary_bytes)
RenderFixtureProvenance.write_manifest(
  sidecar_path: binary_sidecar,
  payload_path: binary_payload_path,
  payload_schema: BINARY_KIND_SCHEMA,
  payload_bytes: binary_bytes,
  provenance: binary_provenance,
)
puts "binary-function-kinds: #{binary_rows.length} rows, #{binary_rendered} rendered results, " \
     "#{binary_raised} refusals, #{binary_unreproducible} unreproducible -> #{binary_payload_path}, #{binary_sidecar}"
