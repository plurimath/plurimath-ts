#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's answers for calls that pass OPTIONS to `to_mathml` and
# `to_omml` — `split_on_linebreak:` on both, `display_style:` on `to_omml` — so
# the port's B3 slice is checked against the gem rather than against itself.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-render-options-fixtures.rb --oracle /path/to/plurimath
#
# One run writes BOTH `test/formats/mathml/render-options-fixtures.json` and
# `test/formats/omml/render-options-fixtures.json`. Both are prepared before
# either is written: `RenderFixtureProvenance.prepare` refuses a checkout that
# is dirty outside the one payload it is about to write, and the two outputs
# would otherwise make each other dirty. (The canonical parity/degenerate pair
# gets its exemption from `MANAGED_PAYLOAD_BASENAMES`, an edit to a file every
# existing manifest hashes.)
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
#                       `displayStyle`, `unaryFunctionSpacing`), each mapped to
#                       the gem's snake_case keyword below; JSON `null` is
#                       Ruby's `nil`, which is NOT the same as leaving the key
#                       out;
#   - `split`           `Formula#new_line_support` — the formulas the gem hands
#                       its renderer, one serialized model per line — recorded
#                       whenever the gem parsed the input, so the port's walk is
#                       checked on its own, apart from any renderer;
#   - `expected`        the gem's bytes, or `raises`/`raisedIn` when it refused.
#
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
FORMATS = %w[mathml omml].freeze
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

def kwargs(options_hash)
  options_hash.to_h { |key, value| [KEYWORDS.fetch(key), value] }
end

def render(formula, format, options_hash)
  formula.public_send("to_#{format}", **kwargs(options_hash))
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

  # The gem's own line-break fixtures, rendered exactly as its specs do
  # (`split_on_linebreak: true`; MathML also `unary_function_spacing: false`),
  # then again with `display_style: false` to show the two options compose.
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

  if format == "mathml"
    nary_mask_rows(add)
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
  table_frac_nary_rows(add, oracle)
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

outputs.each do |format, target|
  rows = rows_for(format, oracle)
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
