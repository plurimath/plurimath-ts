#!/usr/bin/env ruby
# frozen_string_literal: true

# Fifty ordinary, hand-typed UnicodeMath snippets — the way a person composing
# UnicodeMath by hand would write them, NOT gem output and NOT drawn from the
# pinned corpus's round trip, and NOT the `RULE_COVERAGE`/`SLICE_BOUNDARY`
# inputs `generate-unicodemath-model-fixtures.rb` traces by rule. This is the
# same methodology `scripts/battery-html-fixtures.rb` uses for the HTML
# registration gate, and the one `src/compat/index.ts` has named — until now
# only in prose — as the gate for registering `unicode` in the `PARSERS` map:
# a hand-written battery measured against the oracle, kept separate from the
# corpus-derived and rule-coverage fixtures under `test/formats/unicodemath/`.
#
#   cd ../plurimath-oracle && mise x ruby@4.0.1 -- bundle exec ruby \
#     ../wt-um-battery-2/scripts/battery-unicodemath-fixtures.rb \
#     --oracle . --out ../wt-um-battery-2/test/compat
#
# Rows record what the gem did, including refusing, via the same two-rescue
# discipline `battery-html-fixtures.rb` uses: a case that fails to PARSE and a
# case that fails during MODEL SERIALIZATION (never happens here, since
# serialization only walks what parse already built) are never folded into
# one outcome.
#
# Named WITHOUT the `generate-` prefix deliberately, for the same reason
# `battery-html-fixtures.rb` is: `test/gates/payload-validation.spec.ts`
# enumerates every `scripts/generate-*.rb` file and requires it to be either
# provenance-managed or on its explicit known-gap allowlist. This script's
# output is neither — it is not a `test/formats/` managed renderer fixture,
# it is a one-off hand-typed battery under `test/compat/` — so it sits outside
# that gate's naming convention instead of being added to a list meant for a
# different kind of gap.

require "digest"
require "fileutils"
require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/battery-unicodemath-fixtures.rb"

# The battery itself. Organised by what each group is testing, spread across
# the rule families the 140-rule slice carries — relation/operator, prime,
# multiscript, fraction, table, nary — a person's UnicodeMath, not the gem's.
CASES = {
  "relation" => [
    "a=b",
    "a≤b",
    "a≥b",
    "a≈b",
    "a≡b",
    "a→b",
    "x∈A",
    "a±b",
    "±b",
  ],
  "operator" => [
    "2·3",
    "a·b·c",
    "x÷y",
  ],
  "prime" => [
    "x'",
    "x''",
    "f'(x)",
  ],
  "multiscript" => [
    "^3 X",
    "_2 X",
    "X^3_5",
    "X_2^3",
    "(_2)X",
    "_2^3 X_5^6",
  ],
  "fraction" => [
    "a/b",
    "1/2",
    "x \\atop y",
    "x \\choose y",
    "(a+b)/(c+d)",
  ],
  "table" => [
    "■(a&b@c&d)",
    "■(a)",
    "█(a@b)",
    "Ⓢ(a&b@c&d)",
  ],
  "nary" => [
    "∫f",
    "∫_a^b f",
    "∑_i x",
    "∏_i x",
    "∫∫f",
  ],
  "arithmetic" => [
    "1+2",
    "1-2",
    "(1+2)×3",
    "x=y+1",
  ],
  "brackets" => [
    "(x)",
    "[x]",
    "{x}",
  ],
  "greek" => [
    "α+β",
    "π",
  ],
  "whitespace" => [
    " x",
    "x ",
    "x + y",
  ],
  "edge" => [
    "",
    "1",
    "x_1",
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
      "id" => "unicodemath-battery-#{Digest::SHA256.hexdigest(input)[0, 12]}",
      "group" => group,
      "input" => input,
    }
    begin
      row["model"] = Serializer.serialize_node(Plurimath::Math.parse(input, :unicode), "model")
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

# `oracleCommit` alone binds the HEAD a run claims, not the tree it actually
# read: an uncommitted edit in the oracle checkout leaves HEAD untouched, so a
# dirty checkout at the pinned commit is otherwise indistinguishable from a
# clean one. Refuse rather than record a run that could be silently wrong.
oracle_git_status = `git -C #{oracle} status --porcelain`
oracle_clean = oracle_git_status.strip.empty?
unless oracle_clean
  abort "REFUSING: oracle checkout at #{oracle} is dirty:\n#{oracle_git_status}"
end

# `casesSha256` binds the recorded rows themselves, not just their count and
# the commit/generator that produced them: a hand-edited case (same id, group
# and input, a tampered `model` or `raises`) would otherwise pass every other
# provenance check. Hashing the exact JSON this run computed for `cases` means
# the spec can recompute the same digest from the bytes it actually reads.
cases_sha256 = Digest::SHA256.hexdigest(JSON.generate(rows))

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit. Hand-typed inputs, " \
    "oracle #{Plurimath::VERSION rescue 'unknown'}, NOT corpus-derived, NOT rule-coverage-derived.",
  "schema" => "plurimath-compat/unicodemath-battery/1",
  "oracleCommit" => `git -C #{oracle} rev-parse HEAD`.strip,
  "oracleClean" => oracle_clean,
  "generatorSha256" => Digest::SHA256.file(__FILE__).hexdigest,
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "casesSha256" => cases_sha256,
  "cases" => rows,
}

dir = File.expand_path(options[:out])
FileUtils.mkdir_p(dir)
out = File.join(dir, "unicodemath-battery-fixtures.json")
File.binwrite(out, "#{JSON.pretty_generate(payload)}\n")
puts "unicodemath battery fixtures: #{rows.length} cases, #{parsed} parsed, #{raised} raised -> #{out}"
