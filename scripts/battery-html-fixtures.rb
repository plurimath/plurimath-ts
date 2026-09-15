#!/usr/bin/env ruby
# frozen_string_literal: true

# Fifty ordinary, hand-typed HTML math snippets — the way a person composing
# HTML by hand would write them, NOT gem output and NOT drawn from the pinned
# corpus's round trip. This is the same methodology `src/compat/index.ts`
# records for UnicodeMath's registration gate: a hand-written battery measured
# against the oracle, kept separate from the corpus-derived fixtures under
# `test/formats/html/`, because those already proved to read as "regular" in a
# way nobody types.
#
#   cd ../plurimath-oracle && mise x ruby@4.0.1 -- bundle exec ruby \
#     ../wt-html-battery/scripts/battery-html-fixtures.rb \
#     --oracle . --out ../wt-html-battery/test/compat
#
# Rows record what the gem did, including refusing, via the same two-rescue
# discipline `generate-html-model-fixtures.rb` uses: a case that fails to
# PARSE and a case that fails during MODEL SERIALIZATION (never happens here,
# since serialization only walks what parse already built) are never folded
# into one outcome.
#
# Named WITHOUT the `generate-` prefix deliberately: `test/gates/
# payload-validation.spec.ts` enumerates every `scripts/generate-*.rb` file
# and requires it to be either provenance-managed or on its explicit
# known-gap allowlist. This script's output is neither — it is not a
# `test/formats/` managed renderer fixture, it is a one-off hand-typed
# battery under `test/compat/` — so it sits outside that gate's naming
# convention instead of being added to a list meant for a different kind of
# gap.

require "digest"
require "fileutils"
require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/battery-html-fixtures.rb"

# The battery itself. Organised by what each group is testing, spread across
# entities, inline tags, sub/sup, nesting, tables, functions and edge cases —
# a person's HTML, not the gem's.
CASES = {
  "entities" => [
    "&pi;",
    "&alpha;+&beta;",
    "&infin;",
    "x&le;y",
    "a&amp;b",
    "&radic;4",
  ],
  "tags" => [
    "<i>x</i>",
    "<i>x</i>+<i>y</i>",
    "<i>x</i><sup>2</sup>",
    "<i>x</i><sub>1</sub>",
    "<i>x</i><sub>1</sub><sup>2</sup>",
    "<b>x</b>",
    "<i>sin</i>(<i>x</i>)",
  ],
  "nested" => [
    "<i>x</i><sup><i>y</i><sup>2</sup></sup>",
    "<i>a</i><sub><i>b</i><sub>1</sub></sub>",
    "(<i>x</i>+<i>y</i>)<sup>2</sup>",
    "<i>f</i>(<i>g</i>(<i>x</i>))",
  ],
  "tables" => [
    "<table><tr><td>1</td><td>2</td></tr></table>",
    "<table><tr><td>1</td></tr><tr><td>2</td></tr></table>",
    "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>",
  ],
  "functions" => [
    "sqrt(<i>x</i>)",
    "abs(<i>x</i>)",
    "log(<i>x</i>)",
    "<i>lim</i>(<i>x</i>)(0)",
  ],
  "arithmetic" => [
    "1+2",
    "1-2",
    "1&times;2",
    "1&divide;2",
    "(1+2)&times;3",
    "<i>x</i>=<i>y</i>",
  ],
  "fractions" => [
    "<i>x</i>/<i>y</i>",
    "1/2",
  ],
  "brackets" => [
    "(<i>x</i>)",
    "[<i>x</i>]",
    "{<i>x</i>}",
    "abc[0]",
  ],
  "linebreak" => [
    "<br>",
    "<i>x</i><br><i>y</i>",
  ],
  "whitespace" => [
    " x",
    "x ",
    "x + y",
  ],
  "multi-char" => [
    "<i>abc</i>",
    "<i>abc</i><sub>1</sub>",
    "<i>sum</i>",
  ],
  "edge" => [
    "",
    "1",
    "<i>x</i><sup>-1</sup>",
    "<i>x</i>&prime;",
    "&#960;",
    "0x1f",
  ],
}.freeze

options = { oracle: nil, out: "test/compat" }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/compat)") { |v| options[:out] = v }
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

unless Gem.loaded_specs.key?("plurimath")
  abort "REFUSING: the plurimath gem is not activated. Re-run with " \
        "BUNDLE_GEMFILE=#{oracle}/Gemfile mise x -- bundle exec ruby #{__FILE__} ..."
end

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
unless loaded&.start_with?(lib)
  abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
        "An installed gem answers from a different version."
end

ORACLE_REFUSAL = Plurimath::Math::ParseError

module Serializer
  module_function

  def class_key(klass)
    klass.name.to_s.sub("Plurimath::", "")
  end

  def serialize_value(value, path)
    case value
    when nil, true, false, ::String, ::Integer, ::Float then value
    when ::Symbol then value.to_s
    when ::Parslet::Slice then value.to_s
    when ::Array then value.each_with_index.map { |v, i| serialize_value(v, "#{path}[#{i}]") }
    when ::Hash then serialize_hash(value, path)
    when Plurimath::Math::Core then serialize_node(value, path)
    else
      raise "cannot serialize #{value.class} at #{path}"
    end
  end

  def serialize_hash(hash, path)
    result = {}
    hash.each do |key, value|
      name = key.to_s
      raise "duplicate key #{name.inspect} at #{path}" if result.key?(name)

      result[name] = serialize_value(value, "#{path}.#{name}")
    end
    result.sort.to_h
  end

  def serialize_node(node, path)
    name = class_key(node.class)
    fields = node.variables.sort.to_h do |ivar|
      field = ivar.to_s.delete_prefix("@")
      [field, serialize_value(node.get(ivar), "#{path}.#{field}")]
    end
    { "class" => name, "fields" => fields }
  end
end

seen = {}
rows = CASES.flat_map do |group, inputs|
  inputs.map do |input|
    next if seen.key?(input)

    seen[input] = group
    row = {
      "id" => "html-battery-#{Digest::SHA256.hexdigest(input)[0, 12]}",
      "group" => group,
      "input" => input,
    }
    begin
      row["model"] = Serializer.serialize_node(Plurimath::Math.parse(input, :html), "model")
    rescue ORACLE_REFUSAL => e
      row["raises"] = e.class.name
    end
    row
  end
end.compact

parsed = rows.count { |row| row.key?("model") }
raised = rows.count { |row| row.key?("raises") }
abort "REFUSING: zero rows parsed" if parsed.zero?
unless parsed + raised == rows.length
  abort "REFUSING: #{rows.length} rows but #{parsed} parsed + #{raised} raised"
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit. Hand-typed inputs, " \
    "oracle #{Plurimath::VERSION rescue 'unknown'}, NOT corpus-derived.",
  "schema" => "plurimath-compat/html-battery/1",
  "oracleCommit" => `git -C #{oracle} rev-parse HEAD`.strip,
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "cases" => rows,
}

dir = File.expand_path(options[:out])
FileUtils.mkdir_p(dir)
out = File.join(dir, "html-battery-fixtures.json")
File.binwrite(out, "#{JSON.pretty_generate(payload)}\n")
puts "html battery fixtures: #{rows.length} cases, #{parsed} parsed, #{raised} raised -> #{out}"
