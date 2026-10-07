#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's answers for the `plurimath convert` options the port's CLI
# exposes (`src/cli/args.ts`), so `test/cli/flag-output.spec.ts` checks the
# port's CLI output against the gem's bytes rather than against itself.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-cli-fixtures.rb --oracle /path/to/plurimath
#
# Writes `test/formats/cli/cli-fixtures.json` and its sidecar manifest.
#
# Two kinds of row, named by `via`:
#
#   - `cli`  runs the gem's own Thor command, `Plurimath::Cli.start`, with the
#            gem's flags (`-f`, `-t`, `-i`, `--display-style`,
#            `--split-on-linebreak`, `--math-rendering`) and records what it
#            printed to stdout. The port's flags of the same long names are
#            checked against these bytes.
#   - `api`  calls `Formula#to_mathml(display_style: "true", intent: true)`.
#            The gem's CLI has no intent flag; the port's `--intent` is
#            checked against the call the gem's CLI would make with that
#            keyword added (its `display_style` default is the string "true",
#            `lib/plurimath/cli.rb`).
#
# `options` records the port's spelling: `displayStyle` (a boolean, passed to
# the gem as the string "true"/"false", the only values the port accepts),
# `splitOnLinebreak`, `mathRendering` and `intent` (each `true`, passed to the
# gem as the string "true"; absent means the flag is not given).
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit,
# loaded through $LOAD_PATH, exactly as `generate-parity-fixtures.rb` does.

require "json"
require "optparse"
require "stringio"

GENERATOR_RELATIVE_PATH = "scripts/generate-cli-fixtures.rb"

options = { oracle: nil, out: "test/formats/cli", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/cli)") { |v| options[:out] = v }
  o.on("--allow-dirty", "emit non-committable output from dirty checkouts") do
    options[:allow_dirty] = true
  end
end.parse!

abort "--oracle is required" unless options[:oracle]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
abort "not a plurimath checkout: #{lib}" unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))

$LOAD_PATH.unshift(lib)
require "plurimath"
require "plurimath/version"
require "plurimath/cli"
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

dir = File.expand_path(options[:out])
out = File.join(dir, "cli-fixtures.json")
sidecar, provenance = RenderFixtureProvenance.prepare(
  oracle: oracle,
  payload_path: out,
  generator_path: GENERATOR_RELATIVE_PATH,
  allow_dirty: options[:allow_dirty],
  corpus: false,
)

# [id, input format, input text, output format, options]
CLI_ROWS = [
  ["mathml-default", "asciimath", "sum_(i=1)^n i", "mathml", {}],
  ["mathml-display-true", "asciimath", "sum_(i=1)^n i", "mathml", { "displayStyle" => true }],
  ["mathml-display-false", "asciimath", "sum_(i=1)^n i", "mathml", { "displayStyle" => false }],
  ["omml-default", "asciimath", "lim_(x->0) x", "omml", {}],
  ["omml-display-true", "asciimath", "lim_(x->0) x", "omml", { "displayStyle" => true }],
  ["omml-display-false", "asciimath", "lim_(x->0) x", "omml", { "displayStyle" => false }],
  ["omml-underset-display-false", "latex", "\\underset{x}{y}", "omml", { "displayStyle" => false }],
  ["mathml-linebreak-unsplit", "latex", "a \\\\ b", "mathml", {}],
  ["mathml-split", "latex", "a \\\\ b", "mathml", { "splitOnLinebreak" => true }],
  ["mathml-split-display-false", "latex", "a \\\\ b", "mathml",
   { "splitOnLinebreak" => true, "displayStyle" => false }],
  ["omml-linebreak-unsplit", "latex", "a \\\\ b", "omml", {}],
  ["omml-split", "latex", "a \\\\ b", "omml", { "splitOnLinebreak" => true }],
  ["omml-split-html", "html", "a<br/>b", "omml", { "splitOnLinebreak" => true }],
  # The gem ignores display style and split for the text formats.
  ["latex-ignores-render-options", "latex", "a \\\\ b", "latex",
   { "splitOnLinebreak" => true, "displayStyle" => false }],
  ["display-asciimath", "asciimath", "x^2", "asciimath", { "mathRendering" => true }],
  ["display-latex", "asciimath", "frac(1)(2)", "latex", { "mathRendering" => true }],
  ["display-unicodemath", "unicodemath", "x^2", "unicodemath", { "mathRendering" => true }],
  ["display-mathml", "asciimath", "x^2", "mathml", { "mathRendering" => true }],
  ["display-omml", "asciimath", "x^2", "omml", { "mathRendering" => true }],
  # `--math-rendering` returns before the display style is read.
  ["display-mathml-ignores-display-style", "asciimath", "x^2", "mathml",
   { "mathRendering" => true, "displayStyle" => false }],
].freeze

# [id, input format, input text, display style or nil]
API_INTENT_ROWS = [
  ["intent-sum", "asciimath", "sum_(i=1)^n i^3", nil],
  ["intent-prod-display-false", "asciimath", "prod_(i=1)^n i^3", false],
  ["intent-lim", "latex", "\\lim_{i=1}^n", nil],
].freeze

GEM_INPUT_FORMAT = { "asciimath" => "asciimath", "latex" => "latex", "html" => "html",
                     "unicodemath" => "unicode" }.freeze

def gem_argv(input_format, text, to, options)
  argv = ["convert", "-f", GEM_INPUT_FORMAT.fetch(input_format), "-t", to, "-i", text]
  argv.push("--display-style", options["displayStyle"].to_s) if options.key?("displayStyle")
  argv.push("--split-on-linebreak", "true") if options["splitOnLinebreak"]
  argv.push("--math-rendering", "true") if options["mathRendering"]
  argv
end

def capture_stdout
  original = $stdout
  $stdout = StringIO.new
  yield
  $stdout.string
ensure
  $stdout = original
end

rows = CLI_ROWS.map do |id, input_format, text, to, opts|
  argv = gem_argv(input_format, text, to, opts)
  printed = capture_stdout { Plurimath::Cli.start(argv) }
  abort "REFUSING: #{id}: the gem printed nothing for #{argv.inspect}" if printed.empty?
  { "group" => "cli", "id" => id, "via" => "cli",
    "input" => { "format" => input_format, "text" => text },
    "to" => to, "options" => opts, "gemArgv" => argv, "expected" => printed }
end

rows += API_INTENT_ROWS.map do |id, input_format, text, display_style|
  formula = Plurimath::Math.parse(text, GEM_INPUT_FORMAT.fetch(input_format).to_sym)
  style = display_style.nil? ? "true" : display_style.to_s
  opts = { "intent" => true }
  opts["displayStyle"] = display_style unless display_style.nil?
  # `puts`, as the gem's CLI prints every result.
  printed = capture_stdout { puts formula.to_mathml(display_style: style, intent: true) }
  { "group" => "intent", "id" => id, "via" => "api",
    "input" => { "format" => input_format, "text" => text },
    "to" => "mathml", "options" => opts, "expected" => printed }
end

ids = rows.map { |r| r["id"] }
abort "REFUSING: duplicate ids" unless ids.uniq.length == ids.length

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-corpus/cli/1",
  "format" => "cli",
  "caseCount" => rows.length,
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
puts "cli: #{rows.length} cases -> #{out}, #{sidecar}"
