#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's answer for every AsciiMath grammar RULE run as the parse
# root over a shared list of short inputs: whether Parslet accepts the whole
# input, and where a refusal points.
#
# The corpus and `test/formats/asciimath/failure-parity.spec.ts` check failure
# positions only through the root rule, `expression`, whose last alternatives
# always succeed, so most rules never decide a public `ParseError.index` on
# their own. This payload drives each of the grammar's rules directly
# (`Asciimath::Parse.new.<rule>.parse(input)`, Parslet's default
# `consume_all`), so a rule whose failure position drifts fails a test even
# when `expression` hides it.
#
# Each row records the rule, the input, and either `accepts: true` or the
# refusal: `index`, the deepest offset in Parslet's cause tree (the same walk
# `CorpusGenerator#failure_position` uses for the corpus `rejections`),
# `rootIndex`, the root cause's own offset, and `message`, the root cause's
# text. Only `index` is a parity target; `rootIndex` and `message` are recorded
# so a reviewer can see what Parslet itself reported.
#
# Usage:
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-asciimath-failure-positions.rb --oracle /path/to/plurimath

require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-asciimath-failure-positions.rb"

# Every `rule(:name)` in `asciimath/parse.rb`, plus the three number-prefix
# rules it includes from `base_number_prefix.rb`, in the port's spelling
# (`src/formats/asciimath/grammar.ts`, `rules`) mapped to the gem's.
RULES = {
  "td" => :td, "base" => :base, "power" => :power, "space" => :space,
  "comma" => :comma, "spaceOptional" => :space?, "number" => :number,
  "hexNumber" => :hex_number, "binaryNumber" => :binary_number,
  "octalNumber" => :octal_number, "controversialSymbols" => :controversial_symbols,
  "leftRightOpenParen" => :left_right_open_paren,
  "leftRightCloseParen" => :left_right_close_paren,
  "colorLeftParenthesis" => :color_left_parenthesis,
  "colorRightParenthesis" => :color_right_parenthesis,
  "ternaryClassesRules" => :ternary_classes_rules, "ternaryClasses" => :ternary_classes,
  "binaryClasses" => :binary_classes, "subSupClasses" => :sub_sup_classes,
  "openTable" => :open_table, "closeTable" => :close_table, "lparen" => :lparen,
  "rparen" => :rparen, "leftRight" => :left_right, "quotedText" => :quoted_text,
  "symbolTextOrInteger" => :symbol_text_or_integer, "powerBase" => :power_base,
  "powerBaseRules" => :power_base_rules, "table" => :table, "tr" => :tr,
  "colorValue" => :color_value, "sequence" => :sequence, "frac" => :frac,
  "mod" => :mod, "iteration" => :iteration, "expression" => :expression,
}.freeze

# Already-preprocessed text (the rules never see `{:`; they see `ℒ`). Each
# input is here because it makes at least one rule match a PREFIX and then
# stop, or fail outright, at a position other than 0; the generator refuses a
# rule that no input makes fail, below.
INPUTS = [
  "", " ", "  x", "a", "1", "1x", "x1", "a b", ",", ", ", ",x", ", x", ",  x", ",\tx",
  "(", ")", "(a", "a)", "(a)", "(a)b", "[", "]", "[a]", "[a]x",
  "[[a]]", "[[a]]x", "[[a]", "[[a],[b]]", "[[a],[b]", "{", "}", "ℒ", "ℛ", "ℒaℛ",
  "|a|", "|a|x", "norm[[a]]", "\"", "\"a\"", "\"a\"b", "text(a)", "text(a)b",
  "^", "^a", "_", "_a", "__|", "/", "a/b", "a/b c", "a/", "/b",
  "frac", "frac(a)(b)", "frac(a)(b)c", "sqrt", "sqrt(a)", "sqrt(a)b",
  "root(3)(x)", "root(3)(x)y", "color", "color(red)(x)", "color(red)",
  "red", "red)", "mod", "a mod b", "a mod", "sum", "sum_(i=1)^n",
  "sum_(i=1)^n x", "0x1F", "0x1Fg", "0x", "0b10", "0b102", "0o7", "0o78",
  "1.5", "1.5x", "1.", ".5", "left(a right)", "left(a right)x", "left(a right",
  "abc", "+", "`", "x^2", "x^2 y", "x_1^2", "oo", "lim_(x->0)", "obrace(a)",
  "overset(a)(b)", "overset(a)(b)c", "(:", "ᑕaᑐ",
].freeze

options = { oracle: nil, out: "test/formats/asciimath", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/asciimath)") { |v| options[:out] = v }
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
  abort "REFUSING: the plurimath gem is not activated. Set BUNDLE_GEMFILE=" \
        "#{oracle}/Gemfile and run #{__FILE__} with `bundle exec ruby`."
end

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
unless loaded&.start_with?(lib)
  abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
        "An installed gem answers from a different version."
end

module AsciimathFailurePositions
  module_function

  # `CorpusGenerator#failure_position` (generate-corpus.rb), the walk the
  # corpus rejections use: the furthest offset any leaf cause reached.
  #
  # Parslet shares cause nodes between branches, so the walk is memoized by
  # identity; the answer is the same, without revisiting a shared subtree.
  def deepest(cause, seen = {}.compare_by_identity)
    seen.fetch(cause) do
      children = cause.children || []
      seen[cause] = if children.empty?
                      cause.pos.charpos
                    else
                      children.map { |child| deepest(child, seen) }.max
                    end
    end
  end

  def row(port_name, gem_name, input)
    row = { "rule" => port_name, "gemRule" => gem_name.to_s, "input" => input }
    Plurimath::Asciimath::Parse.new.public_send(gem_name).parse(input)
    row.merge("accepts" => true)
  rescue Parslet::ParseFailed => e
    cause = e.parse_failure_cause
    row.merge("accepts" => false, "index" => deepest(cause),
              "rootIndex" => cause.pos.charpos, "message" => cause.to_s)
  end
end

gem_rules = Plurimath::Asciimath::Parse.instance_methods(false).map(&:to_s)
missing = RULES.values.map(&:to_s).reject { |name| Plurimath::Asciimath::Parse.method_defined?(name) }
abort "REFUSING: the gem has no rule #{missing.join(', ')}" unless missing.empty?
source = File.read(File.join(lib, "plurimath", "asciimath", "parse.rb"))
declared = source.scan(/rule\(:([a-z_?]+)\)/).flatten.uniq
unlisted = declared - RULES.values.map(&:to_s)
abort "REFUSING: parse.rb declares rules this generator does not list: #{unlisted.join(', ')}" unless unlisted.empty?
_ = gem_rules

dir = File.expand_path(options[:out])
out = File.join(dir, "failure-position-fixtures.json")
sidecar, provenance = RenderFixtureProvenance.prepare(
  oracle: oracle,
  payload_path: out,
  generator_path: GENERATOR_RELATIVE_PATH,
  allow_dirty: options[:allow_dirty],
  corpus: false,
)

rows = RULES.flat_map do |port_name, gem_name|
  started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  rule_rows = INPUTS.map { |input| AsciimathFailurePositions.row(port_name, gem_name, input) }
  elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
  warn format("  %-24s %6.1fs", port_name, elapsed) if ENV["FAILPOS_TIMING"]
  rule_rows
end

# A rule is "can fail" when at least one input makes it refuse. Every rule
# must, or this payload checks no failure position for it.
never_failed = RULES.keys.reject { |name| rows.any? { |r| r["rule"] == name && !r["accepts"] } }
abort "REFUSING: no input makes these rules fail: #{never_failed.join(', ')}" unless never_failed.empty?

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-ts/asciimath-failure-positions/1",
  "format" => "asciimath",
  "ruleCount" => RULES.length,
  "inputCount" => INPUTS.length,
  "caseCount" => rows.length,
  "rejectedCount" => rows.count { |r| !r["accepts"] },
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
puts "asciimath failure positions: #{rows.length} cases over #{RULES.length} rules, " \
     "#{payload['rejectedCount']} rejected"
puts "  -> #{out}"
puts "  -> #{sidecar}"
