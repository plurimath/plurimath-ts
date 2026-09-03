#!/usr/bin/env ruby
# frozen_string_literal: true

# Sweeps every LANDED renderer of one format against the DEGENERATE values its
# slots can hold -- nil, false, true, 0, "", [], a node -- and records what the
# gem does.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/probe-degenerate-slots.rb --oracle /path/to/plurimath \
#     --out test/formats/<format>/degenerate-fixtures.json --format html
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
# The kinds swept are NOT a hand list. They are derived from the render-kind
# INVENTORY -- src/render/<kind>/<format>.ts, the same tree `pnpm boundaries`
# gates -- and a landed renderer with no sweep entry ABORTS this generator. The
# hand list this replaced named 20 of the 38 landed HTML renderers, so
# `renderMpadded` could be replaced wholesale by `__BROKEN_MPADDED_HTML__` with
# both parity specs green at 319/319 (reviewer-proven, 2026-09-01).
#
# The fixture records the inventory it derived, the sweep entries, and each
# entry's slot shape, so the consuming spec can rebuild the expected
# entry x slot x value grid from an independent source rather than trusting a row
# count in the metadata, and can require its own builder table to cover exactly
# the same renderers. The swept VALUES are not recorded separately: every row
# names its own, and the grid comparison already proves the set.

require "json"
require "optparse"

REPO_ROOT = File.expand_path("..", __dir__)
GENERATOR_RELATIVE_PATH = "scripts/probe-degenerate-slots.rb"

options = { oracle: nil, out: nil, format: nil, allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH") { |v| options[:oracle] = v }
  o.on("--out PATH")    { |v| options[:out] = v }
  o.on("--format NAME") { |v| options[:format] = v }
  o.on("--allow-dirty") { options[:allow_dirty] = true }
end.parse!
abort "--oracle, --out and --format are required" unless options[:oracle] && options[:out] && options[:format]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
abort "not a plurimath checkout: #{lib}" unless File.exist?(File.join(lib, "plurimath.rb"))
$LOAD_PATH.unshift(lib)
require "plurimath"
require_relative "render-fixture-provenance"

unless Gem.loaded_specs.key?("plurimath")
  abort "REFUSING: the plurimath gem is not activated. Re-run with " \
        "BUNDLE_GEMFILE=#{oracle}/Gemfile mise x -- bundle exec ruby #{__FILE__} ..."
end

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
abort "REFUSING: loaded #{loaded.inspect}, not #{lib}" unless loaded&.start_with?(lib)

out = File.expand_path(options[:out])

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

# What fills a slot that is NOT the one being swept. The slot's declared type is
# part of the fixture and the consuming spec pins it, so a builder that fills a
# sequence slot with a bare node fails in a test that names the slot rather than
# as an unexplained byte mismatch somewhere downstream.
FILLERS = {
  "node" => -> { S.new("a") },
  "sequence" => -> { [S.new("a")] },
  "string" => -> { "a" },
}.freeze

# One sweep entry per Ruby class swept.
#
#   render_kind -- the src/render/<kind>/<format>.ts this entry exercises. More
#                  than one entry may name the same kind: `binaryFunction` reaches
#                  HTML through 14 Ruby aliases and the slice has measured one of
#                  them, so `power` (refused) and `td` (rendered) are both swept.
#   klass       -- the concrete Ruby class. Never an abstract carrier: the gem
#                  dispatches on the alias, and so does the port.
#   slots       -- the positional constructor slots this entry sweeps, by filler
#                  type, in constructor order.
#   bag         -- a trailing options/attributes Hash the constructor takes, or
#                  nil to leave it defaulted.
#
# Entry ids are stable: they key `DEGENERATE_REFUSES` in the consuming spec.
SWEEP = {
  "frac"     => { render_kind: "frac", klass: FN::Frac, slots: %w[node node], bag: nil },
  "base"     => { render_kind: "base", klass: FN::Base, slots: %w[node node], bag: nil },
  "power"    => { render_kind: "binaryFunction", klass: FN::Power, slots: %w[node node], bag: nil },
  "td"       => { render_kind: "binaryFunction", klass: FN::Td, slots: %w[sequence node], bag: nil },
  "nary"     => { render_kind: "nary", klass: FN::Nary, slots: %w[node node node node], bag: nil },
  "obrace"   => { render_kind: "obrace", klass: FN::Obrace, slots: %w[node], bag: :attributes },
  "ubrace"   => { render_kind: "ubrace", klass: FN::Ubrace, slots: %w[node], bag: :attributes },
  "bar"      => { render_kind: "bar", klass: FN::Bar, slots: %w[node], bag: :attributes },
  "hat"      => { render_kind: "hat", klass: FN::Hat, slots: %w[node], bag: :attributes },
  "dot"      => { render_kind: "dot", klass: FN::Dot, slots: %w[node], bag: :attributes },
  "ddot"     => { render_kind: "ddot", klass: FN::Ddot, slots: %w[node], bag: :attributes },
  "tilde"    => { render_kind: "tilde", klass: FN::Tilde, slots: %w[node], bag: :attributes },
  "vec"      => { render_kind: "vec", klass: FN::Vec, slots: %w[node], bag: :attributes },
  "ul"       => { render_kind: "ul", klass: FN::Ul, slots: %w[node], bag: :attributes },
  "abs"      => { render_kind: "abs", klass: FN::Abs, slots: %w[node], bag: nil },
  "ceil"     => { render_kind: "ceil", klass: FN::Ceil, slots: %w[node], bag: nil },
  "floor"    => { render_kind: "floor", klass: FN::Floor, slots: %w[node], bag: nil },
  "norm"     => { render_kind: "norm", klass: FN::Norm, slots: %w[node], bag: nil },
  "sqrt"     => { render_kind: "sqrt", klass: FN::Sqrt, slots: %w[node], bag: nil },
  "overset"  => { render_kind: "overset", klass: FN::Overset, slots: %w[node node], bag: :options },
  "underset" => { render_kind: "underset", klass: FN::Underset, slots: %w[node node], bag: :options },
  "color"    => { render_kind: "color", klass: FN::Color, slots: %w[node node], bag: nil },
  "fenced"   => { render_kind: "fenced", klass: FN::Fenced, slots: %w[node node node], bag: nil },
  "fontStyle" => { render_kind: "fontStyle", klass: FN::FontStyle, slots: %w[node node], bag: nil },
  "formula"  => { render_kind: "formula", klass: Plurimath::Math::Formula, slots: %w[sequence], bag: nil },
  "int"      => { render_kind: "int", klass: FN::Int, slots: %w[node node node], bag: nil },
  "linebreak" => { render_kind: "linebreak", klass: FN::Linebreak, slots: %w[node], bag: :attributes },
  "mpadded"  => { render_kind: "mpadded", klass: FN::Mpadded, slots: %w[node], bag: nil },
  "mrow"     => { render_kind: "mrow", klass: Plurimath::Math::Formula::Mrow, slots: %w[sequence], bag: nil },
  "number"   => { render_kind: "number", klass: Plurimath::Math::Number, slots: %w[string], bag: nil },
  "oint"     => { render_kind: "oint", klass: FN::Oint, slots: %w[node node node], bag: nil },
  "overleftrightarrow" => {
    render_kind: "overleftrightarrow", klass: FN::Overleftrightarrow, slots: %w[node], bag: :attributes,
  },
  "prod"     => { render_kind: "prod", klass: FN::Prod, slots: %w[node node node], bag: nil },
  "sum"      => { render_kind: "sum", klass: FN::Sum, slots: %w[node node node], bag: nil },
  "symbol"   => { render_kind: "symbol", klass: S, slots: %w[string], bag: nil },
  "table"    => { render_kind: "table", klass: FN::Table, slots: %w[sequence node node], bag: :options },
  "sin"      => { render_kind: "unaryFunction", klass: FN::Sin, slots: %w[node], bag: nil },
  "tr"       => { render_kind: "unaryFunction", klass: FN::Tr, slots: %w[sequence], bag: nil },
  "powerBase" => {
    render_kind: "ternaryFunction", klass: FN::PowerBase, slots: %w[node node node], bag: nil,
  },
  "text"     => { render_kind: "text", klass: FN::Text, slots: %w[string], bag: nil },
}.freeze

# The only constructor failures the pinned oracle is expected to produce.
# Each pin names the missing method as well as the row, so an unrelated
# NoMethodError on one of these constructor paths still aborts generation.
EXPECTED_CONSTRUCTION_REFUSALS = {
  "td[0]=false" => "delete_if",
  "td[0]=true" => "delete_if",
  "td[0]=zero" => "delete_if",
  "td[0]=empty-string" => "delete_if",
  "td[0]=node" => "delete_if",
  "tr[0]=false" => "all?",
  "tr[0]=true" => "all?",
  "tr[0]=zero" => "all?",
  "tr[0]=empty-string" => "all?",
  "tr[0]=node" => "all?",
}.freeze

# `biome check` formats every committed .json in this repository, and it puts an
# array of scalars on ONE line whenever that line fits inside its configured
# 100-column width (biome.json). `JSON.pretty_generate` always expands. A
# fixture emitted the other way fails the `lint` gate, and hand-formatting it
# afterwards would then fail `gate-oracle.rb repo --check`, which compares the
# committed bytes against a fresh regeneration -- the two gates would contradict
# each other and one of them would have to be turned off. So the generator emits
# the format the repository checks. Arrays too long to fit are left expanded,
# which is what biome does with them.
BIOME_LINE_WIDTH = 100
SCALAR_ARRAY = /^([ ]*)("[^"]+": )?\[\n((?:[ ]*(?:"[^"]*"|-?\d+|true|false|null),?\n)+)[ ]*\]/

def biome_json(payload)
  JSON.pretty_generate(payload).gsub(SCALAR_ARRAY) do
    indent, key, body = Regexp.last_match(1), Regexp.last_match(2), Regexp.last_match(3)
    items = body.lines.map { |line| line.strip.chomp(",") }
    collapsed = "#{indent}#{key}[#{items.join(', ')}]"
    collapsed.length <= BIOME_LINE_WIDTH ? collapsed : Regexp.last_match(0)
  end
end

# `font-style` (a src/render directory) names the dispatch key `fontStyle`.
def kind_from_directory(name) = name.gsub(/-([a-z])/) { Regexp.last_match(1).upcase }

# Every landed renderer of this format, read off the tree `pnpm boundaries`
# gates: src/render/<kind>/<format>.ts. This is the inventory the sweep must
# cover; a hand list is exactly what let 18 of 38 HTML renderers go unswept.
def render_inventory(repo_root, format)
  dir = File.join(repo_root, "src", "render")
  abort "REFUSING: #{dir} does not exist; there is no render inventory to sweep" unless File.directory?(dir)

  paths = Dir.children(dir).sort.filter_map do |entry|
    next unless File.directory?(File.join(dir, entry))
    next unless File.file?(File.join(dir, entry, "#{format}.ts"))

    File.join("src", "render", entry, "#{format}.ts")
  end
  abort "REFUSING: zero #{format} renderers found under #{dir}; a sweep of nothing is not a pass" if paths.empty?

  [paths.map { |path| kind_from_directory(File.basename(File.dirname(path))) }, paths]
end

inventory, inventory_paths = render_inventory(REPO_ROOT, options[:format])
swept_kinds = SWEEP.values.map { |entry| entry[:render_kind] }.uniq.sort

missing = inventory - swept_kinds
unless missing.empty?
  abort "REFUSING: #{missing.length} landed #{options[:format]} renderer(s) have no sweep entry: " \
        "#{missing.join(', ')}. Add one to SWEEP, or delete the renderer."
end

stray = swept_kinds - inventory
unless stray.empty?
  abort "REFUSING: SWEEP names #{stray.join(', ')}, which src/render has no #{options[:format]} renderer for."
end

sidecar, provenance = RenderFixtureProvenance.prepare(
  oracle: oracle,
  payload_path: out,
  generator_path: GENERATOR_RELATIVE_PATH,
  allow_dirty: options[:allow_dirty],
  corpus: false,
  inventory: {
    "glob" => "src/render/*/#{options[:format]}.ts",
    "paths" => inventory_paths,
  },
)

def materialise(token) = token == :NODE ? S.new("a") : token

# One cell of the matrix, probed once.
#
# THREE outcomes, not two. `Td#initialize` and `Tr#initialize` reach into the
# argument (`parameter_one&.delete_if`, `parameter_one&.all?`) before any
# renderer sees it, so a degenerate value can make the gem refuse to BUILD the
# tree -- a NoMethodError, outside `wrap_render_error` entirely. Recording that
# as an ordinary "the gem raises" row would claim the gem refused an input it
# was never given; recording it as a defect would abort a run over a documented
# gem behaviour. It is its own outcome, and the consuming spec reads it as
# "there is no tree here to compare, and the port must produce no bytes".
def probe_cell(id, entry, slot, label, token, format)
  args = entry[:slots].map { |type| FILLERS.fetch(type).call }
  args[slot] = materialise(token)
  args << {} if entry[:bag]
  at = "#{id}[#{slot}]=#{label}"

  node = begin
    entry[:klass].new(*args)
  rescue NoMethodError => e
    expected_name = EXPECTED_CONSTRUCTION_REFUSALS[at]
    unless expected_name && expected_name == e.name&.to_s
      raise "REFUSING: #{at} raised unexpected #{e.class}##{e.name}: #{e.message}"
    end
    return { "constructs" => false, "constructError" => e.class.name }
  end

  begin
    { "constructs" => true, "renders" => true,
      "output" => Plurimath::Math::Formula.new([node]).public_send("to_#{format}") }
  rescue ORACLE_REFUSAL => e
    { "constructs" => true, "renders" => false, "error" => e.class.name }
  end
end

# Every cell is probed TWICE and the two probes must agree.
#
# `Symbols::Symbol#initialize` stores `sym&.to_s`, and `Number` stores its
# argument as-is, so a node in either slot reaches `to_html` as Ruby's default
# `Object#to_s` -- `#<Plurimath::Math::Symbols::Symbol:0x00007f...>`, a heap
# address that changes on every run. A fixture carrying one is not
# regenerable, and `gate-oracle.rb repo --check` would fail on data nothing was
# wrong with. Those cells are recorded WITHOUT an output and flagged
# `stable: false`, and the flag is EARNED: it is set only where two probes of
# the same cell disagreed. A cell named unstable by the consuming spec that
# probes identically twice is therefore a spec failure, not a silent exclusion.
#
# Disagreement on the OUTCOME (constructs, renders) is never address noise, and
# aborts.
rows = []
SWEEP.each do |id, entry|
  entry[:slots].each_index do |slot|
    DEGENERATE.each do |label, token|
      first = probe_cell(id, entry, slot, label, token, options[:format])
      second = probe_cell(id, entry, slot, label, token, options[:format])
      at = "#{id}[#{slot}]=#{label}"

      %w[constructs renders constructError error].each do |key|
        next if first[key] == second[key]

        abort "REFUSING: #{at} probed twice and disagreed on #{key}: " \
              "#{first[key].inspect} then #{second[key].inspect}"
      end

      row = { "kind" => id, "slot" => slot, "value" => label }.merge(first)
      unless first["output"] == second["output"]
        row.delete("output")
        row["stable"] = false
      end
      rows << row
    end
  end
end
abort "REFUSING: zero rows probed" if rows.empty?

observed_construction_refusals = rows.filter_map do |row|
  next if row["constructs"]

  "#{row.fetch('kind')}[#{row.fetch('slot')}]=#{row.fetch('value')}"
end.sort
unless observed_construction_refusals == EXPECTED_CONSTRUCTION_REFUSALS.keys.sort
  abort "REFUSING: constructor-refusal inventory changed: expected " \
        "#{EXPECTED_CONSTRUCTION_REFUSALS.keys.sort.join(', ')}, observed " \
        "#{observed_construction_refusals.join(', ')}"
end

expected_rows = SWEEP.sum { |_, entry| entry[:slots].length } * DEGENERATE.length
unless rows.length == expected_rows
  abort "REFUSING: swept #{rows.length} rows, the SWEEP x DEGENERATE matrix has #{expected_rows}"
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-corpus/degenerate-slots/1",
  "format" => options[:format],
  "inventory" => inventory,
  "kinds" => SWEEP.to_h do |id, entry|
    [id, {
      "renderKind" => entry[:render_kind],
      "rubyClass" => entry[:klass].name,
      "slots" => entry[:slots],
    }]
  end,
  "rowCount" => rows.length,
  "constructsCount" => rows.count { |r| r["constructs"] },
  "rendersCount" => rows.count { |r| r["renders"] },
  "unstableCount" => rows.count { |r| r["stable"] == false },
  "rows" => rows,
}
FileUtils.mkdir_p(File.dirname(out))
payload_bytes = "#{biome_json(payload)}\n"
File.binwrite(out, payload_bytes)
RenderFixtureProvenance.write_manifest(
  sidecar_path: sidecar,
  payload_path: out,
  payload_schema: payload.fetch("schema"),
  payload_bytes: payload_bytes,
  provenance: provenance,
)
puts "#{rows.length} rows (#{payload['rendersCount']} render, " \
     "#{rows.length - payload['constructsCount']} unbuildable, " \
     "#{payload['unstableCount']} unstable) over #{inventory.length} " \
     "landed #{options[:format]} renderers -> #{out}, #{sidecar}"
