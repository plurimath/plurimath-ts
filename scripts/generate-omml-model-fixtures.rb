#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's OMML parse for every pinned corpus OMML input and a small
# set of coverage probes: `Plurimath::Math.parse(text, :omml)` serialized like
# every other model fixture, or the refusal.
#
# `Omml::Parser#parse` is `::Omml.parse` then `Translator#omml_to_plurimath`
# (lib/plurimath/omml/parser.rb), so a refusal records which half raised:
# `raisedIn: "omml"` (the XML read and the omml gem's mapping) or
# `raisedIn: "translate"`, with the class the translator raised (`Math.parse`
# rewraps every error as ParseError, which would hide it).
#
# Only the model is a parity target. The port reads OMML with its own element
# layer (src/formats/omml/omml-input.ts), not the omml gem's lutaml mapping, so
# the gem's intermediate tree is not recorded.
#
# Usage:
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-omml-model-fixtures.rb --oracle /path/to/plurimath

require "digest"
require "json"
require "optparse"
require "yaml"

GENERATOR_RELATIVE_PATH = "scripts/generate-omml-model-fixtures.rb"

# The OMML namespaces, for the probes below.
OMML_NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' \
          'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

def omath(body)
  "<m:oMath #{OMML_NS}>#{body}</m:oMath>"
end

def r(text, props = "")
  "<m:r>#{props}<m:t>#{text}</m:t></m:r>"
end

def e(body, tag = "e")
  "<m:#{tag}>#{body}</m:#{tag}>"
end

# Translator rules and branches no pinned corpus input reaches (measured: the
# corpus builds no CTPhant, and leaves the arms below untaken).
COVERAGE = {
  "elements" => [
    omath("<m:phant>#{e(r('x'))}</m:phant>"),
    omath("<m:box>#{e(r('x') + r('y'))}</m:box>"),
    omath("<m:sPre>#{e(r('a'), 'sub')}#{e(r('b'), 'sup')}#{e(r('x'))}</m:sPre>"),
    omath("<m:sPre>#{e('', 'sub')}#{e(r('x'))}</m:sPre>"),
    omath("<m:rad>#{e('', 'deg')}#{e(r('x'))}</m:rad>"),
    omath("<m:rad>#{e(r('3'), 'deg')}#{e(r('x'))}</m:rad>"),
    omath("<m:groupChr>#{e(r('x'))}</m:groupChr>"),
    omath("<m:groupChr><m:groupChrPr><m:pos m:val=\"top\"/></m:groupChrPr>#{e(r('x'))}</m:groupChr>"),
    omath("<m:bar>#{e(r('x'))}</m:bar>"),
    omath("<m:acc>#{e(r('x'))}</m:acc>"),
    omath("<m:acc><m:accPr><m:chr m:val=\"+\"/></m:accPr>#{e(r('x'))}</m:acc>"),
    omath("<m:acc><m:accPr><m:chr m:val=\"&#x303;\"/></m:accPr>#{e(r('x'))}</m:acc>"),
    omath(e(r('x'))),
    omath("<m:oMath>#{r('x')}</m:oMath>"),
    omath("<m:f>#{e("<m:oMath>#{r('a')}</m:oMath>", 'num')}#{e(r('b'), 'den')}</m:f>"),
    "<m:oMathPara #{OMML_NS}>#{r('a')}#{omath(r('b') + r('c'))}</m:oMathPara>",
    '<oMath xmlns="http://schemas.openxmlformats.org/officeDocument/2006/math"><r><t>a</t></r></oMath>',
  ],
  "scripts" => [
    omath("<m:sSubSup>#{e(r('lim', '<m:rPr><m:sty m:val="p"/></m:rPr>'))}#{e(r('n'), 'sub')}#{e(r('1'), 'sup')}</m:sSubSup>"),
    omath("<m:sSubSup>#{e(r('log', '<m:rPr><m:sty m:val="p"/></m:rPr>'))}#{e(r('2'), 'sub')}#{e(r('x'), 'sup')}</m:sSubSup>"),
    omath("<m:sSubSup>#{e(r('inf', '<m:rPr><m:sty m:val="p"/></m:rPr>'))}#{e(r('n'), 'sub')}#{e(r('1'), 'sup')}</m:sSubSup>"),
    omath("<m:sSubSup>#{e(r('x'))}#{e(r('n'), 'sub')}#{e(r('1'), 'sup')}</m:sSubSup>"),
    omath("<m:sSubSup>#{e('')}#{e(r('n'), 'sub')}#{e('', 'sup')}</m:sSubSup>"),
    omath("<m:sSub>#{e(r('a'))}#{e(r('b'))}#{e(r('c'), 'sub')}</m:sSub>"),
  ],
  "nary" => [
    omath("<m:nary>#{e(r('a'), 'sub')}#{e(r('b'), 'sup')}#{e(r('x'))}</m:nary>"),
    omath("<m:nary><m:naryPr><m:chr m:val=\"&#x220f;\"/><m:limLoc m:val=\"undOvr\"/></m:naryPr>#{e('', 'sub')}#{e('', 'sup')}#{e(r('x'))}</m:nary>"),
    omath("<m:nary><m:naryPr><m:chr m:val=\"&#x2210;\"/></m:naryPr>#{e(r('a'), 'sub')}#{e('', 'sup')}#{e(r('x'))}</m:nary>"),
    omath("<m:nary><m:naryPr><m:chr/></m:naryPr>#{e(r('x'))}</m:nary>"),
  ],
  "delimiters" => [
    omath("<m:d>#{e(r('x'))}</m:d>"),
    omath("<m:d><m:dPr><m:begChr/><m:endChr m:val=\"\"/><m:sepChr/></m:dPr>#{e(r('x'))}#{e(r('y'))}</m:d>"),
    omath("<m:d><m:dPr><m:begChr m:val=\"[\"/><m:endChr m:val=\"]\"/></m:dPr>#{e("<m:m><m:mr>#{e(r('1'))}#{e(r('2'))}</m:mr></m:m>")}</m:d>"),
    omath("<m:eqArr>#{e(r('a') + r('=') + r('b'))}#{e('')}</m:eqArr>"),
  ],
  "functions" => [
    omath("<m:func>#{e(r('sin', '<m:rPr><m:sty m:val="p"/></m:rPr>'), 'fName')}#{e(r('x'))}</m:func>"),
    omath("<m:func>#{e(r('mod'), 'fName')}#{e(r('x'))}</m:func>"),
    omath("<m:func>#{e(r('a') + r('mod') + r('b'), 'fName')}#{e(r('x'))}</m:func>"),
    omath("<m:func>#{e("<m:sSub>#{e(r('log'))}#{e(r('2'), 'sub')}</m:sSub>", 'fName')}#{e(r('x'))}</m:func>"),
    omath("<m:limUpp>#{e(r('x'))}#{e(r('&#x23de;'), 'lim')}</m:limUpp>"),
    omath("<m:limLow>#{e(r('x'))}#{e(r('&#x23df;'), 'lim')}</m:limLow>"),
    omath("<m:limLow>#{e(r('lim'))}#{e(r('n'), 'lim')}</m:limLow>"),
  ],
  "runs" => [
    omath(r('x', '<w:rPr><w:b/><w:i/></w:rPr>')),
    omath(r('x', '<w:rPr><w:b w:val="0"/><w:i w:val="on"/></w:rPr>')),
    omath(r('x', '<w:rPr><w:b w:val="off"/><w:i w:val="false"/></w:rPr>')),
    omath(r('x', '<m:rPr><m:scr m:val="script"/></m:rPr>')),
    omath(r('x', '<m:rPr><m:scr m:val="fraktur"/><m:sty m:val="b"/></m:rPr>')),
    omath(r('x', '<m:rPr><m:scr m:val="roman"/></m:rPr>')),
    # Both property kinds, math first. (Word's first is not a parity row: the gem
    # takes the two `rPr` by name, so it reads them in mapping order, not
    # document order; see OMML_INPUT_DIFFERENCES.)
    omath(r('x', '<m:rPr><m:sty m:val="i"/></m:rPr><w:rPr><w:b/></w:rPr>')),
    omath("<m:r><m:t>a</m:t><w:br/><m:t>b</m:t></m:r>"),
    omath("<m:r><m:t>a</m:t><w:t>b</w:t><w:tab/></m:r>"),
    omath(r('') + r('&#x200b;') + r('&amp;nbsp;')),
    omath(r('&#x663;&#x664;') + r('&lt;') + r('&#x2212;') + r(' a  b ') + r('  ')),
    # Text that spells an entity contains a Latin letter (the `x`), so
    # `text_token` keeps it as text and never reaches its un-escape chain.
    omath(r('&amp;#x3c;') + r('&amp;#x26;#x3e;')),
  ],
  # Refused by the translator, not the XML read: an accent that resolves to a
  # function class without `attributes=` (NoMethodError).
  "translate-refusals" => %w[sin max].map do |word|
    omath("<m:acc><m:accPr><m:chr m:val=\"#{word}\"/></m:accPr>#{e(r('x'))}</m:acc>")
  end,
}.freeze

options = { oracle: nil, out: "test/formats/omml", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/omml)") { |v| options[:out] = v }
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
require "omml"
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

module OmmlModelProbe
  module_function

  # The pinned corpus's OMML inputs, cases and rejections alike, in payload
  # order, through `read_pin_cases`, which byte-verifies every payload against
  # corpus/provenance.yaml.
  def corpus_inputs
    inputs = CorpusGenerator.read_pin_cases
                            .select { |kase| kase["input_format"] == "omml" }
                            .map { |kase| kase.fetch("input") }
    abort "REFUSING: the pinned corpus has no OMML cases" if inputs.empty?

    inputs
  end

  def row(group, input)
    row = {
      "id" => "omml-#{Digest::SHA256.hexdigest(input)[0, 12]}",
      "group" => group,
      "input" => input,
    }
    begin
      tree = Omml.parse(input)
    rescue StandardError => e
      return row.merge("raises" => e.class.name, "raisedIn" => "omml")
    end

    begin
      Plurimath::Omml::Translator.new.omml_to_plurimath(tree)
    rescue StandardError => e
      translate_error = e.class.name
    end
    begin
      row["model"] = CorpusGenerator.serialize_node(Plurimath::Math.parse(input, :omml), "model")
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

sources = OmmlModelProbe.corpus_inputs.map { |input| ["corpus-omml", input] }
corpus_count = sources.map(&:last).uniq.length
COVERAGE.each { |group, inputs| inputs.each { |input| sources << [group, input] } }

seen = {}
rows = sources.filter_map do |(group, input)|
  next if seen.key?(input)

  seen[input] = true
  OmmlModelProbe.row(group, input)
end

parsed = rows.count { |row| row.key?("model") }
raised = rows.count { |row| row.key?("raises") }
abort "REFUSING: zero rows parsed" if parsed.zero?
abort "REFUSING: #{rows.length} rows but #{parsed} parsed + #{raised} raised" unless parsed + raised == rows.length

# Every probe group must reach the translator: a refusal group by having the
# translator itself raise, every other group by producing a model.
COVERAGE.each_key do |group|
  in_group = rows.select { |row| row["group"] == group }
  reached = if group.end_with?("-refusals")
              in_group.any? && in_group.all? { |row| row["raisedIn"] == "translate" }
            else
              in_group.any? { |row| row.key?("model") }
            end
  abort "REFUSING: the #{group} probes did not reach the translator as intended" unless reached
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-corpus/omml-model/1",
  "format" => "omml",
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "corpusOmmlCount" => corpus_count,
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
puts "omml model fixtures: #{rows.length} cases (#{corpus_count} from the corpus), " \
     "#{parsed} parsed, #{raised} raised " \
     "(#{rows.count { |r| r['raisedIn'] == 'omml' }} in omml, " \
     "#{rows.count { |r| r['raisedIn'] == 'translate' }} in translate)"
puts "  -> #{out}"
puts "  -> #{sidecar}"
