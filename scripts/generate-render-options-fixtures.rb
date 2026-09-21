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
# One run writes `test/formats/<format>/render-options-fixtures.json` for each
# of the six formats; the four other than mathml and omml hold only the
# `unary-function` group. All are prepared before any is written: `RenderFixtureProvenance.prepare` refuses a checkout that
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
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-render-options-fixtures.rb"

SCHEMA = "plurimath-corpus/render-options/1"
FORMATS = %w[asciimath latex mathml html omml unicodemath].freeze
# The formats whose payload holds the `unary-function` group and nothing else.
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

  # The `unary-function` group is the whole payload for the four formats whose
  # renderers the B3 options do not touch.
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
