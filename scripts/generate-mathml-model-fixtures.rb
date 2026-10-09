#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's MathML parse for every pinned corpus MathML input and a
# small set of coverage probes: `Plurimath::Math.parse(text, :mathml)`
# serialized like every other model fixture, or the refusal.
#
# `Mathml::Parser#parse` is `Mml.parse` then `Translator#mml_to_plurimath`
# (lib/plurimath/mathml/parser.rb), so a refusal records which half raised:
# `raisedIn: "mml"` (the XML read and mapping) or `raisedIn: "translate"`, with
# the class the translator raised (`Math.parse` rewraps every error as
# ParseError, which would hide it).
#
# Only the model is a parity target. The port reads MathML with its own element
# layer (src/formats/mathml/mml.ts), not the mml gem's lutaml mapping, so the
# gem's intermediate tree is not recorded.
#
# Usage:
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-mathml-model-fixtures.rb --oracle /path/to/plurimath

require "digest"
require "json"
require "optparse"
require "yaml"

GENERATOR_RELATIVE_PATH = "scripts/generate-mathml-model-fixtures.rb"

# The two classes the translator dispatches on that no pinned corpus input
# builds (measured: the corpus trees hold 42 of its 44 `when` classes).
COVERAGE = {
  # Outside `semantics` only: inside it, `build_annotation_entries` records an
  # `annotation-xml` through `Object#to_s`, an address that changes every run
  # (TODO.plan/deferred.md, "MathML input records annotation-xml as an object
  # address"), so no fixture can hold it.
  "annotation-xml" => [
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi>' \
    '<annotation-xml encoding="MathML-Content"><ci>x</ci></annotation-xml></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><annotation-xml><ci>y</ci>' \
    "</annotation-xml><mi>a</mi></mrow></math>",
  ],
  # `nary_check`, `fill_ternary_third_values` and `organize_value`'s n-ary arms:
  # an n-ary symbol (measured `is_nary_symbol?`: coproduct, big wedge, double
  # integral) under `msubsup`/`msup`/`mover`/`munder`/`munderover`, followed by
  # a body, at the `math` level and inside `mrow`. The corpus never builds one.
  "nary" => %w[&#x2210; &#x22c0; &#x222c;].flat_map do |op|
    [
      "<msubsup><mo>#{op}</mo><mi>a</mi><mi>b</mi></msubsup><mi>x</mi>",
      "<msup><mo>#{op}</mo><mi>b</mi></msup><mi>x</mi>",
      "<mover><mo>#{op}</mo><mi>b</mi></mover><mi>x</mi>",
      "<munder><mo>#{op}</mo><mi>a</mi></munder><mi>x</mi>",
      "<munderover><mo>#{op}</mo><mi>a</mi><mi>b</mi></munderover><mi>x</mi>",
      "<munderover><mo>#{op}</mo><mi>a</mi><mi>b</mi></munderover><msub><mi>x</mi><mi>i</mi></msub>",
      "<msubsup><mo>#{op}</mo><mi>a</mi><mi>b</mi></msubsup><mi>x</mi><mo>+</mo><mn>1</mn>",
    ].flat_map do |body|
      ['<math xmlns="http://www.w3.org/1998/Math/MathML">' + body + "</math>",
       '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>' + body + "</mrow></math>"]
    end
  end,
  # Text between elements is dropped when Ruby's `[[:space:]]` (Unicode
  # White_Space) covers it: U+0085 and U+3000 are, U+FEFF and U+200B are not.
  "whitespace" => %w[&#x85; &#xa0; &#x3000; &#xfeff; &#x200b; &#x2028;].map do |ref|
    "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mrow>#{ref}<mi>x</mi>#{ref}</mrow></math>"
  end,
  # `xmlns=""` on the root is no namespace. (On a child inside a MathML
  # document the gem drops the element; the port keeps it, see
  # MATHML_INPUT_DIFFERENCES, so that shape is not a parity row.)
  "namespaces" => [
    '<math xmlns=""><mi>x</mi></math>',
    '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>',
  ],
  # Refused by the translator, not the XML read: an accent token that resolves
  # to a symbol class, not a function, gets `parameter_one=` (NoMethodError).
  "translate-refusals" => %w[&#x20D7; &#x307; &#x308;].flat_map do |accent|
    %w[mo mi].map do |tag|
      "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mover><mi>x</mi><#{tag}>#{accent}</#{tag}></mover></math>"
    end
  end,
  "mglyph" => [
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mglyph src="a.png" alt="x"/></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mglyph src="a.png" alt="x" ' \
    'width="1em" height="2em"/></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi><mglyph src="a.png" alt="y"/></mi></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi>' \
    '<mglyph alt="z"/></mrow></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mglyph/></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mglyph index="3" ' \
    'fontfamily="f" alt="w"/></math>',
  ],
}.freeze

options = { oracle: nil, out: "test/formats/mathml", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/mathml)") { |v| options[:out] = v }
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
require "mml"
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

adapter = Lutaml::Model::Config.xml_adapter
unless adapter == Lutaml::Xml::Adapter::OxAdapter
  abort "REFUSING: Lutaml's XML adapter is #{adapter.inspect}, not OxAdapter."
end

# Every `Plurimath::Math.parse` failure is this class (math.rb rewraps the rest).
ORACLE_REFUSAL = Plurimath::Math::ParseError

module MathmlModelProbe
  module_function

  # `Mathml::Parser#namespace_exist?`, verbatim.
  def namespace_exist?(text)
    text.split(">").first.include?(" xmlns=")
  end

  def mml(text)
    Mml.parse(text, version: 4, namespace_exist: namespace_exist?(text))
  end

  # The pinned corpus's MathML cases. MathML is a pending reader format, so
  # `read_pin_cases` byte-verifies these payloads without returning their
  # cases; they are read here only after that check has passed.
  def corpus_inputs
    CorpusGenerator.read_pin_cases
    provenance_path = File.join(CorpusGenerator.pin_root, "corpus", "provenance.yaml")
    provenance = YAML.safe_load(File.read(provenance_path), aliases: false)
    paths = provenance.fetch("payloads").map { |entry| entry.fetch("path") }.sort
                      .select { |path| path.start_with?("mathml/") }
    inputs = paths.flat_map do |path|
      unless CorpusGenerator.pending_reader_payload?(path)
        abort "REFUSING: #{path} is no longer pending; read it through read_pin_cases"
      end

      file = File.join(CorpusGenerator.pin_root, "corpus", path)
      YAML.safe_load(File.read(file), aliases: false).fetch("cases").map { |c| c.fetch("input") }
    end
    abort "REFUSING: the pinned corpus has no MathML cases" if inputs.empty?

    inputs
  end

  def row(group, input)
    row = {
      "id" => "mathml-#{Digest::SHA256.hexdigest(input)[0, 12]}",
      "group" => group,
      "input" => input,
    }
    begin
      tree = mml(input)
    rescue StandardError => e
      return row.merge("raises" => e.class.name, "raisedIn" => "mml")
    end

    begin
      Plurimath::Mathml::Translator.new.mml_to_plurimath(tree)
    rescue StandardError => e
      translate_error = e.class.name
    end
    begin
      row["model"] = CorpusGenerator.serialize_node(Plurimath::Math.parse(input, :mathml), "model")
      if JSON.generate(row["model"]).match?(/#<[A-Z][\w:]*:0x\h+/)
        abort "REFUSING: #{row['id']}'s model holds a Ruby object address, which changes every run"
      end
    rescue ORACLE_REFUSAL
      abort "REFUSING: Math.parse refused #{row['id']} but the translator did not" unless translate_error
      return row.merge("raises" => translate_error, "raisedIn" => "translate")
    end
    abort "REFUSING: the translator raised on #{row['id']} but Math.parse did not" if translate_error

    row
  end
end

dir = File.expand_path(options[:out])
out = File.join(dir, "model-fixtures.json")
sidecar, provenance = RenderFixtureProvenance.prepare(
  oracle: oracle,
  payload_path: out,
  generator_path: GENERATOR_RELATIVE_PATH,
  allow_dirty: options[:allow_dirty],
  corpus: true,
)

sources = MathmlModelProbe.corpus_inputs.map { |input| ["corpus-mathml", input] }
corpus_count = sources.map(&:last).uniq.length
COVERAGE.each { |group, inputs| inputs.each { |input| sources << [group, input] } }

seen = {}
rows = sources.filter_map do |(group, input)|
  next if seen.key?(input)

  seen[input] = true
  MathmlModelProbe.row(group, input)
end

parsed = rows.count { |row| row.key?("model") }
raised = rows.count { |row| row.key?("raises") }
abort "REFUSING: zero rows parsed" if parsed.zero?
abort "REFUSING: #{rows.length} rows but #{parsed} parsed + #{raised} raised" unless parsed + raised == rows.length

COVERAGE.each_key do |group|
  next if rows.any? { |row| row["group"] == group && row.key?("model") }

  abort "REFUSING: no #{group} probe reached the translator"
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-corpus/mathml-model/1",
  "format" => "mathml",
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "corpusMathmlCount" => corpus_count,
  "cases" => rows,
}
FileUtils.mkdir_p(dir)
payload_bytes = "#{JSON.pretty_generate(payload, max_nesting: false)}\n"
File.binwrite(out, payload_bytes)
RenderFixtureProvenance.write_manifest(
  sidecar_path: sidecar,
  payload_path: out,
  payload_schema: payload.fetch("schema"),
  payload_bytes: payload_bytes,
  provenance: provenance,
)
puts "mathml model fixtures: #{rows.length} cases (#{corpus_count} from the corpus), " \
     "#{parsed} parsed, #{raised} raised " \
     "(#{rows.count { |r| r['raisedIn'] == 'mml' }} in mml, " \
     "#{rows.count { |r| r['raisedIn'] == 'translate' }} in translate)"
puts "  -> #{out}"
puts "  -> #{sidecar}"
