#!/usr/bin/env ruby
# frozen_string_literal: true

# Sweeps every declared node kind against the DEGENERATE values its slots can
# hold -- nil, false, 0, "", [] -- and records what the gem does.
#
#   ruby scripts/probe-degenerate-slots.rb --oracle <clean pinned checkout> \
#        --out test/formats/<format>/degenerate-fixtures.json --format html
#
# Why this exists: every parity defect found in the OMML review lived in a
# degenerate or optional slot the conformance corpus never constructs, and
# ARCHITECTURE.md section 5 states hand-built trees are a SUPPORTED use. Five of
# eight shared one root cause -- Ruby-falsy is {nil,false}, JavaScript-falsy also
# swallows 0 and "". A sweep finds those; example-based fixtures do not.
#
# Each row records the gem's OUTPUT BYTES, not just whether it rendered. The
# first version recorded `renders: true` plus the OMML element names scanned out
# of the XML -- which for html was always the empty list, so every successful
# render compared equal to every other. Replacing every rendered result with the
# literal "__BROKEN_HTML__" left the whole suite green.
#
# The fixture also records the kinds it swept and their arities, so the consuming
# spec can require its own builder table to cover exactly these kinds and can
# rebuild the expected kind x slot x value grid rather than trusting a row count
# in the metadata. The swept VALUES are not recorded separately: every row names
# its own, and the grid comparison already proves the set.

require "json"
require "open3"
require "optparse"

options = { oracle: nil, out: nil, format: nil }
OptionParser.new do |o|
  o.on("--oracle PATH") { |v| options[:oracle] = v }
  o.on("--out PATH")    { |v| options[:out] = v }
  o.on("--format NAME") { |v| options[:format] = v }
end.parse!
abort "--oracle, --out and --format are required" unless options[:oracle] && options[:out] && options[:format]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
abort "not a plurimath checkout: #{lib}" unless File.exist?(File.join(lib, "plurimath.rb"))
$LOAD_PATH.unshift(lib)
require "plurimath"
loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
abort "REFUSING: loaded #{loaded.inspect}, not #{lib}" unless loaded&.start_with?(lib)

# Run git in the oracle checkout, aborting on a non-zero exit. Backticks report
# no status: a missing git, or a path that is not a repository, yielded "" and
# read as a clean tree with an empty SHA.
def git!(repo, *args)
  out, status = Open3.capture2("git", "-C", repo, *args)
  unless status.success?
    abort "REFUSING: `git #{args.join(' ')}` failed in #{repo} (exit #{status.exitstatus.inspect})"
  end

  out
end

abort "REFUSING: oracle checkout is dirty" unless git!(oracle, "status", "--porcelain").strip.empty?
commit = git!(oracle, "rev-parse", "HEAD").strip
abort "REFUSING: `git rev-parse HEAD` named no commit in #{oracle}" unless /\A[0-9a-f]{40}\z/.match?(commit)

S = Plurimath::Math::Symbols::Symbol
FN = Plurimath::Math::Function

# The ONE exception the oracle is documented to raise here: `Formula#to_<fmt>`
# funnels every StandardError through `wrap_render_error` into ParseError
# (lib/plurimath/math/formula.rb). Anything else -- a constructor that refuses
# its arguments, a typo in this script -- is NOT the gem refusing an input, and
# must stop the run instead of being recorded as an ordinary "gem raises" row.
ORACLE_REFUSAL = Plurimath::Math::ParseError

# The degenerate values. `false`, `0` and `""` are the ones that separate
# Ruby-falsy from JavaScript-falsy; nil and [] separate present from absent.
DEGENERATE = {
  "nil" => nil, "false" => false, "true" => true,
  "zero" => 0, "empty-string" => "", "empty-array" => [],
  "node" => :NODE,
}.freeze

# kind => [ruby class, arity of positional node slots, takes options/attributes]
KINDS = {
  "frac"        => [FN::Frac, 2, nil],
  "base"        => [FN::Base, 2, nil],
  "power"       => [FN::Power, 2, nil],
  "nary"        => [FN::Nary, 4, nil],
  "obrace"      => [FN::Obrace, 1, :attributes],
  "ubrace"      => [FN::Ubrace, 1, :attributes],
  "bar"         => [FN::Bar, 1, :attributes],
  "hat"         => [FN::Hat, 1, :attributes],
  "dot"         => [FN::Dot, 1, :attributes],
  "ddot"        => [FN::Ddot, 1, :attributes],
  "tilde"       => [FN::Tilde, 1, :attributes],
  "vec"         => [FN::Vec, 1, :attributes],
  "ul"          => [FN::Ul, 1, :attributes],
  "abs"         => [FN::Abs, 1, nil],
  "ceil"        => [FN::Ceil, 1, nil],
  "floor"       => [FN::Floor, 1, nil],
  "norm"        => [FN::Norm, 1, nil],
  "sqrt"        => [FN::Sqrt, 1, nil],
  "overset"     => [FN::Overset, 2, :options],
  "underset"    => [FN::Underset, 2, :options],
}.freeze

def materialise(token) = token == :NODE ? S.new("a") : token

rows = []
KINDS.each do |kind, (klass, arity, bag)|
  (0...arity).each do |slot|
    DEGENERATE.each do |label, token|
      args = Array.new(arity) { S.new("a") }
      args[slot] = materialise(token)
      args << {} if bag
      row = { "kind" => kind, "slot" => slot, "value" => label }
      begin
        node = klass.new(*args)
        row["output"] = Plurimath::Math::Formula.new([node]).public_send("to_#{options[:format]}")
        row["renders"] = true
      rescue ORACLE_REFUSAL => e
        row["renders"] = false
        row["error"] = e.class.name
      end
      rows << row
    end
  end
end
abort "REFUSING: zero rows probed" if rows.empty?

expected_rows = KINDS.sum { |_, (_, arity, _)| arity } * DEGENERATE.length
unless rows.length == expected_rows
  abort "REFUSING: swept #{rows.length} rows, the KINDS x DEGENERATE matrix has #{expected_rows}"
end

payload = {
  "$comment" => "GENERATED by scripts/probe-degenerate-slots.rb. Do not edit.",
  "oracle" => { "commit" => commit },
  "format" => options[:format],
  "kinds" => KINDS.to_h { |kind, (_, arity, _)| [kind, arity] },
  "rowCount" => rows.length,
  "rendersCount" => rows.count { |r| r["renders"] },
  "rows" => rows,
}
File.write(options[:out], "#{JSON.pretty_generate(payload)}\n")
puts "#{rows.length} rows (#{payload['rendersCount']} render) -> #{options[:out]}"
