#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's AsciiMath PARSE results — preprocessed text plus serialized
# model, or the refusal — for the grammar's two differential sweeps, carried
# through the transform, plus every AsciiMath input in the pinned corpus.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-asciimath-model-fixtures.rb --oracle /path/to/plurimath
#
# The corpus reaches well under half of the transform's rules
# (TODO.plan/p1-asciimath/05-asciimath-transform.md), so corpus model parity is
# necessary but not sufficient. The grammar was swept twice against the gem
# (`test/formats/asciimath/failure-parity.spec.ts`): every string of length 1-3
# over a structure-heavy alphabet, and a seeded batch of longer inputs over the
# same alphabet plus whole keywords. Those sweeps compared parse TREES. This
# fixture records the gem's MODEL for the same two input families, so the port's
# transform is compared on every input the gem accepts:
#
#   - `sweep-short`: every string of length 1..3 over SWEEP_ALPHABET, in
#     length-then-lexicographic order (16 + 256 + 4,096 = 4,368 inputs).
#   - `sweep-long`: LONG_COUNT distinct inputs of 4..26 characters, drawn from
#     SWEEP_ALPHABET and SWEEP_KEYWORDS by Ruby's Mersenne Twister under the
#     fixed LONG_SEED. The inputs are recorded in the payload, so the port never
#     re-derives them and needs no matching generator.
#   - `corpus-asciimath`: every distinct AsciiMath input in the pinned corpus,
#     which the corpus's own `model:` blocks already cover; it is here so the
#     payload is keyed to the corpus like every other format's model fixtures.
#
# Rows record what the gem did, including refusing:
#   - `preprocessed`: `Asciimath::Parser.new(input).text`, the string Parslet sees.
#   - `model`: the serialized `Plurimath::Math.parse(input, :asciimath)` result,
#     through `CorpusGenerator.serialize_node` — the serializer that wrote the
#     pinned corpus's `model:` blocks.
#   - `raises`: the error class, when the gem refuses. `Plurimath::Math.parse`
#     funnels every StandardError into `ParseError`.
#
# Inputs matching a deferred feature (`unitsml(`) are skipped: the port defers
# them by design and the corpus withholds them the same way.
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "digest"
require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-asciimath-model-fixtures.rb"

# The grammar sweep's alphabet (`failure-parity.spec.ts`), space included.
SWEEP_ALPHABET = ["{", "}", "(", ")", "[", "]", ":", "|", "/", "^", "_", ",", "\"", "x", "1", " "].freeze

# Whole keywords mixed into the long sweep, so it reaches the transform's
# function, font, accent, table, text and symbol rules rather than only the
# punctuation the alphabet spells.
SWEEP_KEYWORDS = %w[
  frac sqrt root text mbox color bb bbb cc tt fr sf mathbf mathbb mathcal
  hat bar vec dot ddot ul obrace ubrace overset underset stackrel cancel
  sum prod int oint lim log ln sin cos tan abs floor ceil norm mod
  left right alpha pi oo del grad -> <= != |-> :} {: (: :) |: :| ~ $ ? sub sup
].freeze

LONG_SEED = 20_261_012
LONG_COUNT = Integer(ENV.fetch("SWEEP_LONG_COUNT", "1500"))
LONG_MIN = 4
LONG_MAX = 26

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
        "#{oracle}/Gemfile and run #{__FILE__} with `bundle exec ruby`, under " \
        "any Ruby that has it bundled (mise, rbenv, asdf, rvm, or the system " \
        "Ruby all work)."
end

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
unless loaded&.start_with?(lib)
  abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
        "An installed gem answers from a different version."
end

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

corpus_inputs = []
CorpusGenerator.read_pin_cases.each do |kase|
  next unless kase["input_format"] == "asciimath"

  input = kase.fetch("input")
  corpus_inputs << input unless corpus_inputs.include?(input)
end
abort "REFUSING: no pinned corpus case is AsciiMath" if corpus_inputs.empty?

short = (1..3).flat_map do |length|
  SWEEP_ALPHABET.repeated_permutation(length).map(&:join)
end

random = Random.new(LONG_SEED)
long = []
long_seen = {}
tokens = SWEEP_ALPHABET + SWEEP_KEYWORDS
while long.length < LONG_COUNT
  target = random.rand(LONG_MIN..LONG_MAX)
  text = +""
  while text.length < target
    token = tokens[random.rand(tokens.length)]
    token = SWEEP_ALPHABET[random.rand(SWEEP_ALPHABET.length)] if text.length + token.length > LONG_MAX
    text << token
  end
  next if long_seen.key?(text)

  long_seen[text] = true
  long << text
end

sources = []
corpus_inputs.each { |text| sources << ["corpus-asciimath", text] }
short.each { |text| sources << ["sweep-short", text] }
long.each { |text| sources << ["sweep-long", text] }

inputs = []
seen = {}
sources.each do |(group, input)|
  next if seen.key?(input)
  next if CorpusGenerator.deferred_feature_for(input)

  seen[input] = group
  inputs << [group, input]
end

def oracle_row(group, input)
  row = {
    "id" => "asciimath-#{Digest::SHA256.hexdigest(input)[0, 12]}",
    "group" => group,
    "input" => input,
  }
  row["preprocessed"] = Plurimath::Asciimath::Parser.new(input).text
  begin
    row["model"] = CorpusGenerator.serialize_node(Plurimath::Math.parse(input, :asciimath), "model")
  rescue ORACLE_REFUSAL => e
    row["raises"] = e.class.name
    row["raisedIn"] = "parse"
  end
  row
end

# Several thousand Parslet parses take most of an hour in one process, so the
# inputs are split into contiguous slices parsed by forked workers. Each worker
# hands its rows back through a pipe and the parent joins them in slice order,
# so the payload is byte-identical whatever SWEEP_WORKERS is.
workers = Integer(ENV.fetch("SWEEP_WORKERS", "6"))
slices = inputs.each_slice((inputs.length + workers - 1) / workers).to_a
children = slices.map do |slice|
  reader, writer = IO.pipe
  pid = fork do
    reader.close
    writer.binmode
    writer.write(JSON.generate(slice.map { |(group, input)| warn("row #{input.inspect}") if ENV["SWEEP_PROGRESS"]; oracle_row(group, input) }))
    writer.close
    exit!(0)
  end
  writer.close
  [pid, reader]
end
rows = children.flat_map do |(pid, reader)|
  data = reader.read
  reader.close
  Process.wait(pid)
  abort "REFUSING: a worker failed (#{$?.inspect})" unless $?.success?
  JSON.parse(data)
end

parsed = rows.count { |row| row.key?("model") }
raised = rows.count { |row| row.key?("raises") }
abort "REFUSING: zero rows parsed" if parsed.zero?
unless parsed + raised == rows.length
  abort "REFUSING: #{rows.length} rows but #{parsed} parsed + #{raised} raised"
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-corpus/asciimath-model/1",
  "format" => "asciimath",
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "corpusAsciimathCount" => rows.count { |row| row["group"] == "corpus-asciimath" },
  "cases" => rows,
}
FileUtils.mkdir_p(dir)
payload_bytes = "#{JSON.generate(payload)}\n"
File.binwrite(out, payload_bytes)
RenderFixtureProvenance.write_manifest(
  sidecar_path: sidecar,
  payload_path: out,
  payload_schema: payload.fetch("schema"),
  payload_bytes: payload_bytes,
  provenance: provenance,
)
puts "asciimath model fixtures: #{rows.length} cases, #{parsed} parsed, #{raised} raised"
rows.group_by { |row| row["group"] }.each do |group, list|
  puts "  #{group}: #{list.length} (#{list.count { |row| row.key?('model') }} parsed)"
end
puts "  -> #{out}"
puts "  -> #{sidecar}"
