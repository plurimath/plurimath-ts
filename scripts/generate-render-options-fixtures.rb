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
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-render-options-fixtures.rb"

SCHEMA = "plurimath-corpus/render-options/1"
FORMATS = %w[mathml omml].freeze
PAYLOAD_BASENAME = "render-options-fixtures.json"

# The gem names its UnicodeMath parser `:unicode`; the rows say `unicodemath`, as
# the port and the corpus do.
GEM_PARSE_TYPES = { "unicodemath" => "unicode" }.freeze

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
        formula = parsed[key] ||= Plurimath::Math.parse(input.fetch("text"), GEM_PARSE_TYPES.fetch(key.first, key.first).to_sym)
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
    intent_rows(add, oracle)
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
