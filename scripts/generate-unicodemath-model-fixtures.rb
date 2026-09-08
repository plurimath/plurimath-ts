#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's UnicodeMath PARSE results — preprocessed text plus
# serialized model — for every input the port's transform is measured against.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-unicodemath-model-fixtures.rb --oracle /path/to/plurimath
#
# The shared corpus is AsciiMath-in / many-formats-out: every case's `input` is
# AsciiMath, so nothing in it exercises a UnicodeMath PARSER. What it does carry
# is `expected.unicodemath` — the gem's own UnicodeMath rendering of each case —
# and those are by construction strings the gem can produce. Feeding each back
# through `Plurimath::Math.parse(text, :unicode)` gives a round trip the port
# must match, over inputs nobody wrote by hand.
#
# Unlike the LaTeX fixtures there is no hand-picked COVERAGE list. The transform
# slice this pins is DEFINED by what the corpus inputs reach: the rules they
# fire, measured on the oracle, are the rules the port carries. A coverage list
# would grow the port past what the corpus can check.
#
# There is a second, small BOUNDARY list, which is the opposite thing. Each of
# its inputs fires a rule the slice does NOT carry, so the port must refuse it;
# the row records what the gem answered instead, which is what makes "the port
# refuses" a measured claim rather than a restatement of the port's own code.
# When a rule family lands, its rows move from refusal to parity.
#
# Rows record what the gem did, including refusing:
#   - `preprocessed`: `UnicodeMath::Parser.new(input).text`, the string Parslet
#     sees. The port does not implement that pass yet — it is the next slice —
#     so the parity suite feeds this field to the grammar directly.
#   - `model`: the serialized `Plurimath::Math.parse(input, :unicode)` result,
#     through `CorpusGenerator.serialize_node` — the same serializer that wrote
#     the pinned corpus's `model:` blocks.
#   - `raises`: the error class, when the gem refuses. `Plurimath::Math.parse`
#     funnels every StandardError into `ParseError`, so anything else escaping
#     here is a defect in this generator rather than a documented refusal.
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "digest"
require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-unicodemath-model-fixtures.rb"

# Inputs whose rules sit OUTSIDE the ported slice, each with the `transform.rb`
# rule the oracle fires for it and the shape that rule leaves behind. Measured
# with every registered block wrapped in a counter, not read off the source.
#
# Rule numbers are the lines the `rule(` calls OPEN on, recovered from the
# block's `source_location` — Ruby reports the line carrying `do`, which for a
# multi-line header is one line later. Two of these were first written as the
# block line; both are corrected here against a fresh trace.
#
#   "±"        rule 99   `{combined_symbols: simple}` alone -> `Symbols::Pm`.
#              The port has no rule for that node, and it arrives as the ROOT of
#              the tree, where `Kernel#Array` would fold it into pairs before
#              anything could refuse it.
#   "a^b c"    rule 765  `{expr: simple, sup_exp: simple}`.
#   "a≤b"      rule 745  `{factor: simple, operand: SEQUENCE}`. The port carries
#              `:735`, the `operand: simple` twin, and the trace shows `:735`
#              firing on the inner node and `:745` on the outer one — so it is
#              the matcher KIND, not the key set, that puts this input outside
#              the slice.
#   "x a/b c"  rule 1791 `{expr: simple, frac: simple}` — the same KEY SET the
#              corpus's `(a)/(+) b` leaves unmatched, but with both values
#              resolved. A key set is not a signature: the gem matches this one
#              and leaves that one alone.
SLICE_BOUNDARY = [
  "\u00b1",
  "a^b c",
  "a\u2264b",
  "x a/b c",
].freeze

options = { oracle: nil, out: "test/formats/unicodemath", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/unicodemath)") { |v| options[:out] = v }
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

# Every distinct `expected.unicodemath` in the pinned corpus, in first-seen
# order so the emitted file is stable and a new corpus case appends rather than
# reorders.
#
# A `cases/2` expectation is either a plain string or a mapping carrying exactly
# one of `output` (what the gem rendered) or `error` (why it refused). Only the
# rendered text is a UnicodeMath string; a refusal has none.
corpus_unicodemath = []
CorpusGenerator.read_pin_cases.each do |kase|
  raw = kase.dig("expected", "unicodemath")
  text = case raw
         when ::String then raw
         when ::Hash then raw["output"]
         end
  next if text.nil? || text.empty?

  corpus_unicodemath << text unless corpus_unicodemath.include?(text)
end
if corpus_unicodemath.empty?
  abort "REFUSING: no pinned corpus case carries expected.unicodemath"
end

sources = corpus_unicodemath.map { |text| ["corpus-unicodemath", text] }
SLICE_BOUNDARY.each { |text| sources << ["slice-boundary", text] }
overlap = SLICE_BOUNDARY & corpus_unicodemath
unless overlap.empty?
  abort "REFUSING: #{overlap.inspect} is both a corpus case and a boundary case"
end

seen = {}
rows = sources.filter_map do |(group, input)|
  next if seen.key?(input)

  seen[input] = true
  # A stable row id the payload gate can key on. Derived from the input rather
  # than from its position, so a new corpus case appends a row instead of
  # renumbering every row after it; unique because `seen` deduplicates inputs.
  row = {
    "id" => "unicodemath-#{Digest::SHA256.hexdigest(input)[0, 12]}",
    "group" => group,
    "input" => input,
  }

  begin
    row["preprocessed"] = Plurimath::UnicodeMath::Parser.new(input).text
  rescue StandardError => e
    row["raises"] = e.class.name
    row["raisedIn"] = "preprocess"
    next row
  end

  begin
    row["model"] = CorpusGenerator.serialize_node(
      Plurimath::Math.parse(input, :unicode),
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
  "schema" => "plurimath-corpus/unicodemath-model/1",
  # The gate keys a fixture to the directory it sits in; this one is UnicodeMath's.
  "format" => "unicodemath",
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "corpusUnicodemathCount" => corpus_unicodemath.length,
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
puts "unicodemath model fixtures: #{rows.length} cases " \
     "(#{corpus_unicodemath.length} from the corpus, #{SLICE_BOUNDARY.length} boundary), " \
     "#{parsed} parsed, #{raised} raised"
puts "  -> #{out}"
puts "  -> #{sidecar}"
