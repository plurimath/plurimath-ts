#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's MathML parse in two layers, for every pinned corpus MathML
# input and a small set of coverage probes:
#
# - `mml`: what `Mml.parse(text, version: 4, namespace_exist:)` builds, as the
#   translator sees it. Each element is its `Mml::V4` class, the attributes the
#   translator reads (`READ_ATTRIBUTES`) when set, `value` for the classes that
#   have one, and its `each_mixed_content` children in document order, with
#   text children as `{ "text" => ... }`. A refusal here is `raisedIn: "mml"`.
# - `model`: `Plurimath::Math.parse(text, :mathml)` serialized like every other
#   model fixture. A refusal here is `raisedIn: "translate"`, with the class the
#   translator raised (`Math.parse` rewraps every error as ParseError, which
#   would hide it).
#
# `Mathml::Parser#parse` is exactly `Mml.parse` then `Translator#mml_to_plurimath`
# (lib/plurimath/mathml/parser.rb), so the two layers split one call in two.
#
# Usage:
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-mathml-model-fixtures.rb --oracle /path/to/plurimath

require "digest"
require "json"
require "optparse"
require "yaml"

GENERATOR_RELATIVE_PATH = "scripts/generate-mathml-model-fixtures.rb"

# Every `.name` the translator source (lib/plurimath/mathml/*.rb) calls that an
# `Mml::V4` class declares as an attribute, less the collections it walks
# through `each_mixed_content` anyway (`annotation_value`, `annotation_xml_value`,
# `mprescripts_value`) and `value`, which is recorded on its own.
READ_ATTRIBUTES = %w[
  accent accentunder alt bevelled close columnlines depth display displaystyle
  frame height id index intent length linebreak linebreakstyle linethickness
  mathcolor mathvariant name notation open rowlines rspace separators src width
].freeze

# The two classes the translator dispatches on that no pinned corpus input
# builds (measured: the corpus trees hold 42 of its 44 `when` classes).
COVERAGE = {
  "annotation-xml" => [
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mi>x</mi>' \
    '<annotation-xml encoding="MathML-Content"><ci>x</ci></annotation-xml></semantics></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>a</mi><mo>+</mo>' \
    '<mi>b</mi></mrow><annotation encoding="TeX">a+b</annotation>' \
    '<annotation-xml encoding="MathML-Content"><apply><plus/><ci>a</ci><ci>b</ci></apply>' \
    "</annotation-xml></semantics></math>",
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics>' \
    '<annotation-xml encoding="text/html"><b>x</b></annotation-xml></semantics></math>',
  ],
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
  # How `Mml.parse` builds its tree from the XML read, measured: the root's
  # name and namespace are ignored; a prefixed element survives only in the
  # MathML namespace; unmapped children are dropped; text survives in an
  # unordered class's value only; blank text is dropped outside token content;
  # CDATA is dropped; a non-collection value is a string, or an array when
  # other nodes sit beside the text; integer attributes go through lutaml's cast.
  "mml-semantics" => [
    "<math><mrow> <mi> a </mi> \n </mrow></math>",
    "<math><mfrac>txt<mi>a</mi>more<mi>b</mi></mfrac></math>",
    "<math><mrow><foo>x</foo><mi>a</mi></mrow></math>",
    "<math><mn>1<mi>z</mi>2</mn></math>",
    "<math><mi>a<!--c-->b<![CDATA[c]]>d<?p q?>e</mi></math>",
    "<math><mi>&amp;&lt;&#x3b1;&alpha;</mi></math>",
    "<m:math xmlns:m=\"http://www.w3.org/1998/Math/MathML\"><m:mi>a</m:mi></m:math>",
    "<foo><mi>a</mi></foo>",
    '<math xmlns="urn:other"><mi>a</mi></math>',
    "<math>top<mi>a</mi></math>",
    "<math><mi></mi><mi/><mo> </mo></math>",
    "<math><mspace>t<mi>a</mi></mspace></math>",
    "<math><maligngroup>t</maligngroup><mglyph>g</mglyph></math>",
    "<math><mrow>  x  <mi>a</mi>\u00a0<mi>b</mi>\t\n</mrow></math>",
    "<math><mi>\n</mi><mo>\u00a0</mo><mtext>  </mtext></math>",
    '<math><mi><mglyph alt="g"/></mi><mi>a<mglyph alt="g"/>b</mi></math>',
    '<math><mglyph index="3x"/><mglyph index="-2"/><mglyph index=" 4 "/><mglyph index=""/></math>',
    '<math><mglyph index="+3"/><mglyph index="0x10"/><mglyph index="1_000"/><mglyph index="1.5"/></math>',
    '<math><mglyph index="010"/><mglyph index="\u0663"/><mglyph index="1e2"/><mglyph index="08"/></math>',
    "<math><mmultiscripts><mi>a</mi><mprescripts/><mi>b</mi><mprescripts/><mi>c</mi></mmultiscripts></math>",
    '<math><mi mathvariant="a" mathvariant="b">x</mi></math>',
    '<math><mi xmlns="urn:x">a</mi><x:mi xmlns:x="urn:y">b</x:mi></math>',
    '<x:math xmlns:x="urn:y"><x:mi>b</x:mi><mi>c</mi></x:math>',
    '<math><annotation encoding="t">a<b>c</b>d</annotation></math>',
    "<math><semantics><mi>x</mi><annotation></annotation><annotation> </annotation>" \
    "<annotation>a<!--c-->b</annotation><annotation> <b/>q </annotation></semantics></math>",
    '<math><mi x:mathvariant="bold" xmlns:x="u">a</mi><mi mathvariant="">b</mi></math>',
    '<math><mi>a <mglyph alt="g"/> b</mi><mi> <mglyph alt="g"/> </mi></math>',
    "<math><mrow><![CDATA[x]]><mi>a</mi></mrow><mi><![CDATA[only]]></mi></math>",
    "<math><mtr><mtd><mi>a</mi></mtd></mtr><mtd>z</mtd></math>",
    "<math><mi> <foo/> </mi><mi> <!--c--> </mi><mi> <![CDATA[c]]> </mi><mi> <?p?> </mi></math>",
    "<math><mrow> </mrow><mrow> x </mrow><mrow> <!--c--> </mrow></math>",
    "<math> </math>",
    "<math><mi>a<foo/> </mi><mi> <mglyph/>b</mi><mi>\u00a0<mglyph/></mi></math>",
    "<math><mfrac> <mi>a</mi> x <mi>b</mi> </mfrac></math>",
    '<math><mi>a&#10;b</mi><mi>&#x20;</mi><ms lquote="x">s</ms><mtext>t<mglyph alt="g"/></mtext></math>',
    "<math><mi>a</mi></math><!--tail-->",
    "<!--head--><math><mi>a</mi></math>",
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

  # A JSON form for an attribute or value the translator reads. Mml holds
  # strings, arrays of strings, booleans and integers; anything else is a
  # surprise this generator refuses rather than records lossily.
  def plain(value, at)
    case value
    when ::String, ::Integer, true, false, nil then value
    when ::Array then value.map.with_index { |item, index| plain(item, "#{at}[#{index}]") }
    else raise "#{at}: unexpected #{value.class} in the Mml tree"
    end
  end

  def view(node, at = "mml")
    return { "text" => node } if node.is_a?(::String)

    name = node.class.name
    raise "#{at}: unexpected node #{name}" unless name&.start_with?("Mml::V4::")

    declared = node.class.attributes.keys.map(&:to_s)
    attributes = (READ_ATTRIBUTES & declared).sort.filter_map do |attr|
      value = node.public_send(attr)
      [attr, plain(value, "#{at}.#{attr}")] unless value.nil?
    end.to_h
    out = { "class" => name.delete_prefix("Mml::V4::"), "attributes" => attributes }
    out["value"] = plain(node.value, "#{at}.value") if declared.include?("value")
    children = []
    if node.respond_to?(:each_mixed_content)
      node.each_mixed_content { |child| children << view(child, "#{at}.children[#{children.length}]") }
    end
    out["children"] = children
    out
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
    row["mml"] = view(tree)

    begin
      Plurimath::Mathml::Translator.new.mml_to_plurimath(mml(input))
    rescue StandardError => e
      translate_error = e.class.name
    end
    begin
      row["model"] = CorpusGenerator.serialize_node(Plurimath::Math.parse(input, :mathml), "model")
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
  next if rows.any? { |row| row["group"] == group && row.key?("mml") }

  abort "REFUSING: no #{group} probe reached the translator"
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-corpus/mathml-model/1",
  "format" => "mathml",
  "readAttributes" => READ_ATTRIBUTES,
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
