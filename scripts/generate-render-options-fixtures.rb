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
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-render-options-fixtures.rb"

SCHEMA = "plurimath-corpus/render-options/1"
FORMATS = %w[asciimath html latex mathml omml unicodemath].freeze
# The formats the line-break and display-style groups are recorded for.
LINE_BREAK_FORMATS = %w[mathml omml].freeze
# The formats whose payload holds no option group.
UNARY_ONLY_FORMATS = %w[asciimath latex html unicodemath].freeze
# `Math.parse` spells UnicodeMath `:unicode`; the other three are their own name.
PARSE_TYPES = { "unicodemath" => :unicode }.freeze
PAYLOAD_BASENAME = "render-options-fixtures.json"

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
        formula = parsed[key] ||= Plurimath::Math.parse(input.fetch("text"),
                                                         PARSE_TYPES.fetch(input.fetch("format"), input.fetch("format").to_sym))
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
    return rows
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
    unary_function_rows(add)
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
