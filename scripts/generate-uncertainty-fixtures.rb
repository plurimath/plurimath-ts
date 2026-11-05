#!/usr/bin/env ruby
# frozen_string_literal: true

# Generate the AsciiMath uncertainty fixtures (plurimath#493) from their
# ordered input seed: for each input, the normalized model of
# Plurimath::Math.parse(input, :asciimath) and its six renderings, or the
# parse failure. Run against a plurimath checkout that has
# Math::Function::Uncertainty (0.11.13 and later):
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile \
#     bundle exec ruby scripts/generate-uncertainty-fixtures.rb --oracle /path/to/plurimath
#
# then format the payload as the repository formats JSON:
#
#   pnpm exec biome format --write test/formats/uncertainty/uncertainty-fixtures.json
#
# The payload records the oracle commit, the Ruby it ran on, and whether the
# bundle was frozen, so a payload generated outside CI says so.

require "digest"
require "fileutils"
require "json"
require "open3"
require "optparse"

ROOT = File.expand_path("..", __dir__)
SEED_RELATIVE_PATH = "scripts/seeds/uncertainty-inputs.json"
GENERATOR_RELATIVE_PATH = "scripts/generate-uncertainty-fixtures.rb"
FORMATS = %w[asciimath latex mathml omml unicodemath html].freeze

options = { oracle: nil, out: "test/formats/uncertainty/uncertainty-fixtures.json" }
OptionParser.new do |parser|
  parser.on("--oracle PATH", "plurimath checkout") { |path| options[:oracle] = path }
  parser.on("--out PATH", "payload path") { |path| options[:out] = path }
end.parse!
abort "--oracle is required" unless options[:oracle]

oracle = File.realpath(options[:oracle])
lib = File.join(oracle, "lib")
abort "not a plurimath checkout: #{lib}" unless File.file?(File.join(lib, "plurimath.rb"))

$LOAD_PATH.unshift(lib)
require "plurimath"
require_relative "generate-corpus"

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
abort "loaded #{loaded.inspect}, expected #{lib}/plurimath.rb" unless loaded == File.join(lib, "plurimath.rb")
abort "this oracle has no Math::Function::Uncertainty" unless
  defined?(Plurimath::Math::Function::Uncertainty)

commit, status = Open3.capture2("git", "-C", oracle, "rev-parse", "HEAD")
abort "could not read the oracle commit" unless status.success?
dirty, status = Open3.capture2("git", "-C", oracle, "status", "--porcelain", "--untracked-files=no")
abort "could not read the oracle status" unless status.success?

seed_path = File.join(ROOT, SEED_RELATIVE_PATH)
inputs = JSON.parse(File.read(seed_path))
abort "seed must be a nonempty array of unique strings" unless
  inputs.is_a?(Array) && !inputs.empty? && inputs.all?(String) && inputs.uniq.length == inputs.length

sha = ->(path) { Digest::SHA256.file(path).hexdigest }

cases = inputs.map do |input|
  begin
    formula = Plurimath::Math.parse(input, :asciimath)
  rescue Plurimath::Math::ParseError => error
    next { "input" => input, "error" => "parse", "errorClass" => error.class.name }
  end

  row = { "input" => input, "model" => CorpusGenerator.serialize_node(formula, "formula"), "render" => {} }
  FORMATS.each do |format|
    row["render"][format] = formula.public_send("to_#{format}")
  rescue StandardError => error
    row["render"][format] = { "error" => error.class.name }
  end
  row
end

payload = {
  "description" => "AsciiMath uncertainty forms (plurimath#493): input -> " \
                   "Plurimath::Math.parse(input, :asciimath), its normalized model and " \
                   "to_asciimath/to_latex/to_mathml/to_omml/to_unicodemath/to_html, or the refusal.",
  "oracle" => {
    "gem" => "plurimath",
    "version" => Plurimath::VERSION,
    "commit" => commit.strip,
    "clean" => dirty.strip.empty?,
  },
  "ruby" => { "engine" => RUBY_ENGINE, "version" => RUBY_VERSION, "platform" => RUBY_PLATFORM },
  "bundleFrozen" => ENV["BUNDLE_FROZEN"] == "true",
  "count" => cases.length,
  "cases" => cases,
  "inputs" => {
    "seed" => { "path" => SEED_RELATIVE_PATH, "sha256" => sha.call(seed_path) },
    "generator" => { "path" => GENERATOR_RELATIVE_PATH,
                     "sha256" => sha.call(File.join(ROOT, GENERATOR_RELATIVE_PATH)) },
  },
}

path = File.expand_path(options[:out], ROOT)
FileUtils.mkdir_p(File.dirname(path))
File.write(path, "#{JSON.pretty_generate(payload)}\n")
puts "wrote #{path}: #{cases.length} cases"
