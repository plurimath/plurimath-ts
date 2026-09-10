#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's HTML PARSE results — normalised text plus serialized
# model — for every input the port's transform is expected to reproduce.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-html-model-fixtures.rb --oracle /path/to/plurimath
#
# The shared corpus is AsciiMath-in / many-formats-out and carries no HTML
# target at all, so unlike LaTeX's fixtures there is no `expected.html` to feed
# back. What there is instead is the ROUND TRIP the gem's own
# `spec/plurimath/html/to_html_round_trip_spec.rb` performs: parse each corpus
# case in its own input format, render it with `to_html`, strip the whitespace,
# and hand the result back to `Plurimath::Math.parse(..., :html)`. A case that
# the parser refuses and one the RENDERER refuses are counted apart, through
# separate rescues. Those are by
# construction HTML strings the gem can produce, over inputs nobody wrote by
# hand.
#
# That covers the vocabulary the corpus reaches and no more, so a second list
# (RULE_COVERAGE below) drives the transform rules the round trip never
# touches. Its size is a measurement rather than a taste: with every registered
# block wrapped in a counter on the oracle, the 95 round-trip strings fire 39
# of the 78 registered rules, and RULE_COVERAGE takes that to 78 — every rule
# `Plurimath::Html::Transform` registers, including the three the
# `BaseNumberPrefix::Transform` mixin adds. Which rules each list reaches is
# not asserted HERE: the port counts its own rule firings and
# `test/formats/html/transform-coverage.spec.ts` fails if any ported rule is
# never exercised.
#
# Rows record what the gem did, including refusing:
#   - `normalized`: `Html::Parser#normalized_text`, the string Parslet sees.
#     It can RAISE before there is a string at all — `&#55296;` decodes to a
#     lone surrogate and the gem answers `RangeError` — and that row records
#     `raisedIn: "normalize"`.
#   - `model`: the serialized `Plurimath::Math.parse(input, :html)` result,
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

require "digest"
require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-html-model-fixtures.rb"

# Inputs chosen to drive transform rules the round trip does not reach.
# Grouped by what they are for, and deliberately small: each one is here
# because a rule needs it, not to be a second corpus. Fourteen of them are
# `let(:string)` literals from the gem's own `spec/plurimath/html/parse_spec.rb`
# and `parser_spec.rb` — copied in rather than scraped, so this file stays the
# only thing that decides what is generated.
RULE_COVERAGE = {
  # `transform.rb:184`-`:393`, the 24-rule sub/sup cluster: every combination
  # of a sub value, a sup value and a trailing expression, in both the `simple`
  # and `sequence` shapes Parslet distinguishes.
  "scripts" => [
    "<i>a</i><sub>1</sub>",
    "<i>a</i><sub>1</sub>b",
    "<i>a</i><sub>1</sub>bc",
    "<i>a</i><sub>xy</sub>b",
    "<i>a</i><sub>xy</sub>bc",
    "<i>a</i><sup>2</sup>b",
    "<i>a</i><sup>ab</sup>bc",
    "<i>a</i><sub>1</sub><sup>2</sup>b",
    "<i>a</i><sub>1</sub><sup>2</sup>bc",
    "<i>a</i><sub>1</sub><sup>ab</sup>b",
    "<i>a</i><sub>1</sub><sup>ab</sup>bc",
    "<i>a</i><sub>xy</sub><sup>2</sup>bc",
    "<i>a</i><sub>xy</sub><sup>ab</sup>b",
    "<i>a</i><sub>xy</sub><sup>ab</sup>bc",
    # `sum_prod` bases, which take the MUTATING branch of
    # `TransformUtility.sub_sup_value` instead of building a Power/Base.
    "&sum;<sub>d</sub><sup>prod</sup>",
    "&sum;<sub>drop</sub><sup>prod</sup>",
    "<i>f</i><sup>-1</sup>(<i>x</i>)",
    # A base that transforms to an ARRAY. Every sub/sup rule binds `sub_sup`
    # with `simple(...)`, so none of the 24 matches and the hash survives the
    # transform — the gem's own behaviour, recorded here rather than fixed.
    "<i>ab</i><sub>1</sub>",
  ],
  # `transform.rb:30`-`:45` and `:73`-`:103`: Tr, Td and Table, in both value
  # shapes and with a trailing expression.
  "tables" => [
    "<table><tr><td>Something</td></tr></table>",
    "<table><tr><td>4</td></tr><tr><td>3</td></tr><tr><td>2</td></tr><tr><td>1</td></tr></table>",
    "<table><tr><td>a</td><td>b</td></tr></table>",
    "<td>a</td>bc",
    "<th>a</th>",
    "<tr><td>a</td></tr>bc",
  ],
  # `transform.rb:9`, `:47`, `:105`, `:115`, `:171`, `:457` and `:463`: the
  # unary and binary function rules, and `get_class` on both paths.
  "functions" => [
    "root(<i>sth</i>)",
    "<i>lim</i>(3e)(em)",
    "<i>lim</i>(3am)(rest)",
    "<i>2a</i><i>mod</i><i>em</i>",
    "<i>sin</i><i>b</i>d",
    "<i>sin</i><i>b</i>x+1",
    "abs(3)",
    "sqrt(4)",
    # `transform.rb:171` binds `first_value` with `simple(...)` only, so an
    # argument that transformed to an array matches nothing. Gem behaviour.
    "sqrt(a+b)",
    "&sum;",
    "&prod;",
    "log",
    "lim",
  ],
  # `transform.rb:36`, `:58`, `:161`, `:176`, `:395`-`:455` and `:472`-`:523`:
  # the parenthesis rules, whose bodies differ by shape and by what precedes
  # the opening paren.
  "parens" => [
    "<i>f</i>(<i>x</i>)",
    "<i>f</i>(<i>g</i>(<i>x</i>))",
    "f&sum;(<i>n</i>)(<i>2</i>)",
    "fib(<i>n</i>)",
    "(sqrt(2))",
    "ϑ(t)",
    "(x)",
    "(12)",
    "(1)y",
    "(x+y)",
    "abc[0]",
    "abc{0}",
  ],
  # The three rules `include BaseNumberPrefix::Transform` adds at
  # `transform.rb:6`. The long literals are there because the binary and
  # octal rules re-render their digits in DECIMAL through `String#to_i`,
  # which is arbitrary precision: measured, the gem answers
  # "1152921504606846975" for sixty binary ones, and a port going through a
  # JavaScript number would answer 1152921504606846976.
  "base-numbers" => [
    "0x1f",
    "0b101",
    "0o17",
    "0xff+1",
    "0b#{'1' * 60}",
    "0o#{'7' * 25}",
    "0x#{'f' * 20}",
  ],
  # `transform.rb:12`, `:15` and `:23`.
  "linebreak" => ["<br>", "<br>xy", "<br><br>", "<br>x+y"],
  # `transform.rb:13` and `:28`, reachable ONLY through a leading space:
  # `Html::Parse#space` (`html/parse.rb:8`) carries no `.as`, so Parslet drops
  # it and the sequence folds to a lone `{expression: ...}`.
  "space" => [" x", " x+y", " ", "x "],
  # The shapes NO rule matches, which the gem PARSES and returns as a raw hash
  # inside the formula -- only its subsequent RENDER fails. Twenty-one inputs
  # chosen off an oracle sweep to cover all 32 such signatures the sweep found;
  # the port has to return the same odd tree rather than refusing the parse.
  "unmatched" => [
    "1(b)",
    "&sum;x",
    "&sum;xy",
    "<i>ab</i>xy",
    "<i>ab</i><sup>2</sup>",
    "<i>ab</i><sub>1</sub><sup>2</sup>",
    "<i>ab</i><sub>ab</sub>",
    "<i>ab</i><sup>ab</sup>",
    "<i>ab</i>(b)",
    "0x1fx",
    "0x1fxy",
    "0x1f(b)",
    "0b101x",
    "0b101xy",
    "0b101(b)",
    "0o17x",
    "0o17xy",
    "0o17(b)",
    "<td>a</td>(b)",
    "<tr><td>a</td></tr>(b)",
    "<i>sqrt</i><i>a+b</i>",
  ],
  # `Html::Parser#normalized_text` on both branches and on the shapes that
  # surprise: an unknown name is MANGLED rather than left alone, `&AMP;`
  # matches the case-insensitive regexp but not the case-sensitive decode
  # table, `&a;` is too short to match at all, and a lone surrogate raises
  # before Parslet ever runs.
  "entities" => [
    "&#x3c0;",
    "&#960;",
    "&amp;",
    "&quot;",
    "&nosuchentity;",
    "&AMP;",
    "&a;",
    "&#55296;",
    "2&#x3c0;r",
  ],
}.freeze

options = { oracle: nil, out: "test/formats/html", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/html)") { |v| options[:out] = v }
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

# The gem's own HTML round trip, over the pinned corpus: every case parsed in
# its own input format, rendered with `to_html`, whitespace stripped — the two
# steps `to_html_round_trip_spec.rb` performs before handing the string back to
# `Html::Parser`.
#
# A case the gem cannot RENDER to HTML contributes nothing; that is a renderer
# gap, already pinned by `test/formats/html/parity-fixtures.json`, and feeding
# the exception here would put a non-string in the input list.
corpus_html = []
rendered = 0
refused_parse = 0
refused_render = 0
CorpusGenerator.read_pin_cases.each do |kase|
  format = kase["input_format"]
  next if format.nil?

  # TWO rescues, never one. A single rescue around parse-and-render records a
  # parse refusal as a render refusal, and this project has published that
  # wrong statement three times. Measured with them split: `a/` fails inside
  # `Math.parse`, before `to_html` is reached.
  begin
    parsed_case = Plurimath::Math.parse(kase["input"], format.to_sym)
  rescue StandardError
    refused_parse += 1
    next
  end
  begin
    html = parsed_case.to_html
  rescue StandardError
    refused_render += 1
    next
  end
  rendered += 1
  text = html.gsub(/\s/, "")
  corpus_html << text unless text.empty? || corpus_html.include?(text)
end
abort "REFUSING: no pinned corpus case rendered to HTML" if corpus_html.empty?

sources = []
corpus_html.each { |text| sources << ["corpus-html", text] }
RULE_COVERAGE.each do |group, texts|
  texts.each { |text| sources << [group, text] }
end

seen = {}
rows = sources.filter_map do |(group, input)|
  next if seen.key?(input)

  seen[input] = group
  # A stable row id the payload gate can key on. Derived from the input rather
  # than from its position, so adding a coverage input appends a row instead of
  # renumbering every row after it; unique because `seen` deduplicates inputs.
  row = {
    "id" => "html-#{Digest::SHA256.hexdigest(input)[0, 12]}",
    "group" => group,
    "input" => input,
  }

  begin
    row["normalized"] = Plurimath::Html::Parser.new(+input).send(:normalized_text)
  rescue StandardError => e
    row["raises"] = e.class.name
    row["raisedIn"] = "normalize"
  end

  begin
    row["model"] = CorpusGenerator.serialize_node(
      Plurimath::Math.parse(input, :html),
      "model",
    )
  rescue ORACLE_REFUSAL => e
    row["raises"] = e.class.name
    row["raisedIn"] ||= "parse"
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
  "schema" => "plurimath-corpus/html-model/1",
  # The gate keys a fixture to the directory it sits in; this one is HTML's.
  "format" => "html",
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "corpusHtmlCount" => corpus_html.length,
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
puts "html model fixtures: #{rows.length} cases " \
     "(#{corpus_html.length} distinct from #{rendered} rendered corpus cases; " \
     "#{refused_parse} the parser refused, #{refused_render} the renderer did), " \
     "#{parsed} parsed, #{raised} raised"
puts "  -> #{out}"
puts "  -> #{sidecar}"
