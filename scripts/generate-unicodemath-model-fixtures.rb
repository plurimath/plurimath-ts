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
# Unlike the LaTeX fixtures there was no hand-picked COVERAGE list, for as long
# as the corpus alone could define the slice: the rules the 103
# `expected.unicodemath` strings fire, measured on the oracle, were the rules
# the port carried. That method is now EXHAUSTED outside the deferred
# table/matrix family — no other unported rule fires on the corpus — so
# RULE_COVERAGE below drives rule families chosen by what they BUILD instead,
# same shape as the LaTeX generator's own list: grouped by family, each input
# checked against the oracle before being written down.
#
# There is a third, small BOUNDARY list, which is the opposite thing again.
# Each of its inputs fires a rule the slice does NOT carry, so the port must
# refuse it; the row records what the gem answered instead, which is what
# makes "the port refuses" a measured claim rather than a restatement of the
# port's own code. When a rule family lands, its rows move from refusal to
# parity.
#
# Rows record what the gem did, including refusing:
#   - `preprocessed`: `UnicodeMath::Parser.new(input).text`, the string Parslet
#     sees. The port implements that pass now (`formats/unicodemath/preprocess.ts`),
#     so the parity suite no longer feeds this field to the grammar: it drives
#     every row from the raw `input` and asserts the port re-derives this value.
#     The field stays because that assertion needs the oracle's own answer to
#     compare against.
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

# Inputs chosen to drive transform rules the corpus's `expected.unicodemath`
# strings do not reach, grouped by the family they cover. Each one is here
# because a rule needs it, not to be a second corpus — same intent as the
# LaTeX generator's `RULE_COVERAGE`.
#
# "multiscript": every rule building `Math::Function::Multiscript`
# (`transform.rb:1992`-`:3978`), one input per rule, each traced on the oracle
# with every registered block wrapped in a counter (rule numbers are the
# lines `rule(` calls OPEN on, not the block's `source_location`, which Ruby
# reports at the line carrying the block opener -- measured offsets on the
# pinned gem run to six, so there is no fixed distance to subtract):
#
#   "^3 X"          rule 1992 {pre_supscript, base}
#   "_2 X"          rule 2001 {pre_subscript, base}
#   "^3 X_5"        rule 2938 {pre_supscript, base, sub}
#   "_2^3 X"        rule 2948 {pre_supscript, pre_subscript, base}
#   "_2 X_5"        rule 2958 {pre_subscript, base, sub}
#   "_2 X₅"         rule 2971 {pre_subscript, base, sub_digits} — the trailing
#                   digit is U+2085 (SUBSCRIPT FIVE), not "_5"
#   "_2^3 X_5"      rule 3662 {pre_subscript, pre_supscript, base, sub}
#   "(_2)X"         rule 3687 {open_paren, pre_subscript, close_paren, base}
#   "(_2)X_5"       rule 3768 {open_paren, pre_subscript, close_paren, base,
#                   sub}
#   "_2^3 X_5^6"    rule 3853 {pre_subscript, pre_supscript, base, sub, sup}
#   "(_2^3)X"       rule 3952 {open_paren, pre_subscript, pre_supscript,
#                   close_paren, base}
#   "(_2^3)X_5^6"   rule 3978 {open_paren, pre_subscript, pre_supscript,
#                   close_paren, base, sub, sup}
#
# Every one of the twelve also fires `:57`, the `pre_script` unwrap every
# Multiscript construction routes through, so it needs no input of its own.
# "fraction": every rule the port carries that calls `Utility.fractions`
# (`unicode_math/utility.rb:86-104`) — the FRACTION family's real membership,
# measured the same way as MULTISCRIPT above: every registered block wrapped
# in a counter, one input per rule, traced on the oracle. The call sites
# number SEVENTEEN, not the 44 a prior line-range survey estimated — that
# count conflated this family with the `atom`/`atoms` and
# `recursive_numerator`/`recursive_denominator` combinators (`transform.rb:486`
# and some twenty siblings spanning the whole file, e.g. `:658`-`:697`), which
# build the multi-character ARRAY a `numerator: sequence(...)` or
# `denominator: sequence(...)` binding needs but do not themselves call
# `Utility.fractions` and are not specific to fractions at all — `entity =
# atoms | number` (`common_rules.rb:11`) is the generic multi-character-run
# production every bare symbol sequence in the grammar goes through.
#
# Of the seventeen, `transform.rb:1609` — plain `numerator: simple, denominator:
# simple`, no options — was already ported in the first slice: it is exactly
# what the corpus's own fraction-shaped `expected.unicodemath` strings reach,
# with `Utility.fractions`'s mutating `recursion_fraction` branch (continued
# fractions, `(a)/(b)/(c)`) already wired to it. The six below are its
# OPTION-carrying siblings — mini, `atop`, `choose`, `bevelled`, `ldiv`,
# `no_display_style` — every one restricted to the same `simple`/`simple` shape
# `:1609` already carries, so none of them needs the `atoms` combinator either:
#
#   "³/₂"          rule 1614 {mini_numerator, mini_denominator} -> Frac with
#                  {displaystyle: false}; sup/sub-sized `Number`s, not `Symbol`s
#   "x \atop y"    rule 2197 {numerator, atop, denominator} -> Frac with
#                  {linethickness: "0"}
#   "x \choose y"  rule 2209 {numerator, choose, denominator} -> Fenced(Lround,
#                  [Frac with {linethickness: "0", choose: true}], Rround)
#   "x\sdiv y"     rule 2347 {numerator, bevelled, denominator} -> Frac with
#                  {bevelled: true}
#   "x\ldiv y"     rule 2353 {numerator, ldiv, denominator} -> Frac with
#                  {ldiv: true}
#   "x\ndiv y"     rule 2377 {numerator, no_display_style, denominator} -> Frac
#                  with {displaystyle: false} — NOT {no_display_style: false},
#                  which is what `transform.rb:2371`'s SEQUENCE-denominator twin
#                  passes instead; the gem is inconsistent between the two and
#                  both are transcribed as measured.
#
# The other ten call sites — `:1619`, `:1624`, `:1629`, `:1634`, `:1639`,
# `:1644`, `:2203`, `:2359`, `:2365`, `:2371` — all need a `sequence` numerator
# or denominator and are deferred with the `atoms` combinator they depend on,
# not carried by any input here.
RULE_COVERAGE = {
  "multiscript" => [
    "^3 X",
    "_2 X",
    "^3 X_5",
    "_2^3 X",
    "_2 X_5",
    "_2 X₅",
    "_2^3 X_5",
    "(_2)X",
    "(_2)X_5",
    "_2^3 X_5^6",
    "(_2^3)X",
    "(_2^3)X_5^6",
  ],
  "fraction" => [
    "³/₂",
    "x \\atop y",
    "x \\choose y",
    "x\\sdiv y",
    "x\\ldiv y",
    "x\\ndiv y",
  ],
}.freeze

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
rule_coverage_texts = RULE_COVERAGE.values.flatten
RULE_COVERAGE.each do |group, texts|
  texts.each { |text| sources << [group, text] }
end
SLICE_BOUNDARY.each { |text| sources << ["slice-boundary", text] }

coverage_corpus_overlap = rule_coverage_texts & corpus_unicodemath
unless coverage_corpus_overlap.empty?
  abort "REFUSING: #{coverage_corpus_overlap.inspect} is both a corpus case and a coverage case"
end
coverage_boundary_overlap = rule_coverage_texts & SLICE_BOUNDARY
unless coverage_boundary_overlap.empty?
  abort "REFUSING: #{coverage_boundary_overlap.inspect} is both a coverage case and a boundary case"
end
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
     "(#{corpus_unicodemath.length} from the corpus, #{rule_coverage_texts.length} coverage, " \
     "#{SLICE_BOUNDARY.length} boundary), #{parsed} parsed, #{raised} raised"
puts "  -> #{out}"
puts "  -> #{sidecar}"
