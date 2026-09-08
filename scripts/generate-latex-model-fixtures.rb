#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's LaTeX PARSE results — preprocessed text plus serialized
# model — for every input the port's transform is expected to reproduce.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-latex-model-fixtures.rb --oracle /path/to/plurimath
#
# The shared corpus is AsciiMath-in / many-formats-out: every case's `input` is
# AsciiMath, so nothing in it exercises a LaTeX PARSER. What it does carry is
# `expected.latex` — the gem's own LaTeX rendering of each case — and those are
# by construction LaTeX strings the gem can produce. Feeding each back through
# `Plurimath::Math.parse(text, :latex)` gives a round trip the port must match,
# over inputs nobody wrote by hand.
#
# That covers the vocabulary the corpus reaches and no more, so a second list
# (RULE_COVERAGE below) drives the transform rules the corpus never touches —
# environments, `\left...\right` pairings, fonts, roots, `\substack`, `\rule`,
# the `binom` special case, the `mod` family, and the shadowed-rule input.
# Which rules each list actually reaches is not asserted HERE: the port counts
# its own rule firings and `test/formats/latex/transform-coverage.spec.ts`
# fails if any ported rule is never exercised.
#
# Rows record what the gem did, including refusing:
#   - `preprocessed`: `Latex::Parser.new(input).text`, the string Parslet sees.
#   - `model`: the serialized `Plurimath::Math.parse(input, :latex)` result,
#     through `CorpusGenerator.serialize_node` — the same serializer that wrote
#     the pinned corpus's `model:` blocks, so `normalize` on the TypeScript side
#     compares against exactly the same shape.
#   - `raises`: the error class, when the gem refuses. `Plurimath::Math.parse`
#     funnels every StandardError into `ParseError`, so anything else escaping
#     here is a defect in this generator rather than a documented refusal.
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-latex-model-fixtures.rb"

# Inputs chosen to drive transform rules the corpus's `expected.latex` strings
# do not reach. Grouped by what they are for, and deliberately small: each one
# is here because a rule needs it, not to be a second corpus.
RULE_COVERAGE = {
  "environments" => [
    "\\begin{matrix}a&b\\\\c&d\\end{matrix}",
    "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}",
    "\\begin{bmatrix}a\\end{bmatrix}",
    "\\begin{Bmatrix}a\\end{Bmatrix}",
    "\\begin{vmatrix}a\\end{vmatrix}",
    "\\begin{Vmatrix}a\\end{Vmatrix}",
    "\\begin{multline}a\\end{multline}",
    "\\begin{split}a\\\\b\\end{split}",
    "\\begin{align}a&=b\\\\c&=d\\end{align}",
    "\\begin{align*}a&=b\\end{align*}",
    "\\begin{array}{cc}a&b\\\\c&d\\end{array}",
    "\\begin{array}{c|c}a&b\\\\c&d\\end{array}",
    "\\begin{array}{lr}a&b\\end{array}",
    "\\begin{matrix}\\end{matrix}",
    "\\begin{matrix}a\\\\\\end{matrix}",
    "\\begin{matrix}\\hline a\\\\b\\end{matrix}",
    "\\begin{array}{c}\\hline a\\\\ \\hline b\\end{array}",
    "\\matrix{a}",
    "\\matrix{a&b}",
    "\\substack{a\\\\b}",
    "\\begin{matrix}-a&b\\end{matrix}",
    "\\begin{array}{c}a\\end{array}",
    "\\begin{align*}[c]a&b\\\\c&d\\end{align*}",
  ],
  "left-right" => [
    "\\left(x\\right)",
    "\\left(x\\right]",
    "\\left\\{x\\right\\}",
    "\\left(\\right)",
    "\\left(",
    "\\left(x",
    "\\left(a\\over b\\right)",
    "\\left.x\\right.",
    "\\left(x\\right)^2",
    "\\left(x\\right)_2",
    "\\left(x+y\\right)",
    "\\left(x+y\\right",
    "\\left(x\\right",
    "\\left(\\right",
    "\\left.x+y\\right.",
    "\\left(x\\right)^y",
    "\\left(x\\right)^{y}",
    "\\left(x\\right)_{y}",
    "\\left(x\\right)^{y+z}",
    "\\left(x\\right)_{y+z}",
  ],
  "scripts" => [
    "x_1^2",
    "x^2_1",
    "1_2^3",
    "\\frac{a}{b}_1^2",
    "\\frac{a}{b}_1",
    "\\sum_1^2 x",
    "\\int_0^1",
    "\\oint_0^1 x",
    "\\prod_1^2",
    "\\lim_{x}",
    "\\log_2 x",
    "\\inf_1",
    "\\sin_1",
    "\\sin^2",
    "\\sin_1^2",
    "\\overbrace{x}_1^2",
    "\\text{ab}_1",
    "\\text{ab}^2",
    "\\text{ab}_1^2",
    "\\mathbb{x}_1",
    "\\mathbb{x}^2",
    "\\mathbb{x}_1^2",
    "&#x3c0;_1",
    "&#x3c0;^2",
    "&#x3c0;_1^2",
    "\\alpha_1^2",
    "(x)_1",
    "(x)^2",
    "{x}_1",
    "{x}^2",
    "\\zero_1",
    "\\zero^2",
    "\\lim_x^y",
    "\\int\\limits_a^b",
    "1_2",
    "+_1",
    "+^1",
    "\\sqrt{x}^2",
    "\\sum_a",
    "\\sum_a b",
    "\\text{}_1",
    "\\text{}^1",
    "{a+b}^c",
    "{a\\over b}_1",
    "{a\\over b}^1",
  ],
  "functions" => [
    "\\sqrt{x}",
    "\\sqrt[3]{x}",
    "\\sqrt[]{x}",
    "\\sqrt[3+1]{x}",
    "\\frac{a}{b}",
    "\\binom{a}{b}",
    "\\stackrel{a}{b}",
    "\\overset{a}{b}",
    "\\underset{a}{b}",
    "a\\bmod b",
    "a\\pmod b",
    "a\\mod b",
    "\\overline{x}",
    "\\underbrace{x}",
    "\\bar{x}",
    "\\hat{x}",
    "\\vec{x}",
    "\\tilde{x}",
    "\\ddot{x}",
    "\\dot{x}",
    "\\cancel{x}",
    "\\phantom{x}",
    "\\color{red}{x}",
    "{\\color{red}x}",
    "\\rule{1}{2}",
    "\\mbox{ab}",
    "\\text{a b}",
    "\\limits",
    "\\sin\\limits_a^b",
    "\\color{red}ab",
    "\\text{}",
  ],
  "fonts" => [
    "\\mathbb{R}",
    "\\mathcal{R}",
    "\\mathfrak{R}",
    "\\mathbf{R}",
    "\\mathit{R}",
    "\\mathrm{R}",
    "\\mathsf{R}",
    "\\mathtt{R}",
    "\\displaystyle{x}",
    "\\mathds{R}",
    "\\mathsfit{R}",
  ],
  "leaves" => [
    "1",
    "1.5",
    "12.34",
    ".5",
    "5.",
    "0x1f",
    "0b101",
    "0o17",
    "x",
    "\\alpha",
    "\\pi",
    "&pi;",
    "&#960;",
    "&#x3c0;",
    "&#x;",
    "&amp;",
    "&quot;",
    "&nosuchentity;",
    "\\;",
    "\\ ",
    "a\\\\b",
    "a b",
    "#",
    "\\#",
    "a+b",
    "a-b",
    "\\zero",
    "\\one",
    "a\\over b",
    "{a\\over b}",
    "()",
    "(a)",
    "[a]",
    "\\operatorname{foo}",
    "\\sum x",
    "\\oint x",
    "\\bigwedge_a^b x",
    "\\sin",
    "zero",
    "zero_1",
    "zero^1",
  ],
}.freeze

options = { oracle: nil, out: "test/formats/latex", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/latex)") { |v| options[:out] = v }
  o.on("--allow-dirty", "emit non-committable output from dirty checkouts") do
    options[:allow_dirty] = true
  end
end.parse!

abort "--oracle is required" unless options[:oracle]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))
  abort "not a plurimath checkout: #{lib}"
end

$LOAD_PATH.unshift(lib)
require "plurimath"
require "plurimath/version"
require_relative "render-fixture-provenance"

unless Gem.loaded_specs.key?("plurimath")
  abort "REFUSING: the plurimath gem is not activated. Re-run with " \
        "BUNDLE_GEMFILE=#{oracle}/Gemfile mise x -- bundle exec ruby #{__FILE__} ..."
end

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
unless loaded&.start_with?(lib)
  abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
        "An installed gem answers from a different version."
end

# The ONE exception the oracle is documented to raise across this surface:
# `Plurimath::Math.parse` funnels every StandardError into ParseError
# (`math.rb:44-48`). Anything else is a defect here or in the oracle, and a
# blanket rescue would launder it into an ordinary "raises" row.
ORACLE_REFUSAL = Plurimath::Math::ParseError

dir = File.expand_path(options[:out])
out = File.join(dir, "model-fixtures.json")
sidecar, provenance = RenderFixtureProvenance.prepare(
  oracle: oracle,
  payload_path: out,
  generator_path: GENERATOR_RELATIVE_PATH,
  allow_dirty: options[:allow_dirty],
  corpus: true,
)

# Every distinct `expected.latex` in the pinned corpus, in first-seen order so
# the emitted file is stable and a new corpus case appends rather than reorders.
#
# A `cases/2` expectation is either a plain string or a mapping carrying
# exactly one of `output` (what the gem rendered) or `error` (why it refused).
# Only the rendered text is a LaTeX string; a refusal has none, and feeding the
# mapping itself to the parser is what a first pass here did — it reached the
# gem as a Hash and raised `NoMethodError` inside `pre_processing`.
corpus_latex = []
CorpusGenerator.read_pin_cases.each do |kase|
  raw = kase.dig("expected", "latex")
  text = case raw
         when ::String then raw
         when ::Hash then raw["output"]
         end
  next if text.nil? || text.empty?

  corpus_latex << text unless corpus_latex.include?(text)
end
abort "REFUSING: no pinned corpus case carries expected.latex" if corpus_latex.empty?

sources = []
corpus_latex.each { |text| sources << ["corpus-latex", text] }
RULE_COVERAGE.each do |group, texts|
  texts.each { |text| sources << [group, text] }
end

seen = {}
rows = sources.filter_map do |(group, input)|
  next if seen.key?(input)

  seen[input] = group
  row = { "group" => group, "input" => input }

  begin
    row["preprocessed"] = Plurimath::Latex::Parser.new(input).text
  rescue StandardError => e
    row["raises"] = e.class.name
    row["raisedIn"] = "preprocess"
    next row
  end

  begin
    row["model"] = CorpusGenerator.serialize_node(
      Plurimath::Math.parse(input, :latex),
      "model",
    )
  rescue ORACLE_REFUSAL => e
    row["raises"] = e.class.name
    row["raisedIn"] = "parse"
  end
  row
end

parsed = rows.count { |row| row.key?("model") }
raised = rows.count { |row| row.key?("raises") }
abort "REFUSING: zero rows parsed" if parsed.zero?
unless parsed + raised == rows.length
  abort "REFUSING: #{rows.length} rows but #{parsed} parsed + #{raised} raised"
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-corpus/latex-model/1",
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "corpusLatexCount" => corpus_latex.length,
  "cases" => rows,
}
FileUtils.mkdir_p(dir)
payload_bytes = "#{JSON.pretty_generate(payload)}\n"
File.binwrite(out, payload_bytes)
RenderFixtureProvenance.write_manifest(
  sidecar_path: sidecar,
  payload_path: out,
  payload_schema: payload.fetch("schema"),
  payload_bytes: payload_bytes,
  provenance: provenance,
)
puts "latex model fixtures: #{rows.length} cases " \
     "(#{corpus_latex.length} from the corpus), #{parsed} parsed, #{raised} raised"
puts "  -> #{out}"
puts "  -> #{sidecar}"
