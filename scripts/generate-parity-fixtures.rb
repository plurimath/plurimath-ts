#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits oracle expectations for the formats the shared corpus does not carry
# targets for (today: omml, html), so those renderers get the same executable
# parity coverage the four P1 formats already have.
#
#   ruby scripts/generate-parity-fixtures.rb --oracle <path> --format html
#
# `--format` is REQUIRED and generates exactly one format. This script used to
# loop over every name in FORMATS, so asking for html also rewrote
# test/formats/omml/parity-fixtures.json -- a fixture no spec on this branch
# reads, resurrected by every regeneration.
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit.
# This script loads it through $LOAD_PATH and refuses to run against an
# installed gem, because that silently answers from a different version --
# a trap that has cost this project real time (PORTING-STANDARDS.md).

require "digest"
require "json"
require "open3"
require "optparse"
require "yaml"

REPO_ROOT = File.expand_path("..", __dir__)
GENERATOR_RELATIVE_PATH = "scripts/generate-parity-fixtures.rb"

FORMATS = %w[omml html].freeze

options = {
  oracle: nil,
  out: "test/formats",
  corpus: "submodules/plurimath-testsuite/corpus/asciimath",
  format: nil,
}
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output root (default test/formats)") { |v| options[:out] = v }
  o.on("--corpus PATH", "corpus dir") { |v| options[:corpus] = v }
  o.on("--format NAME", "exactly one of #{FORMATS.join('|')}") { |v| options[:format] = v }
end.parse!

abort "--oracle is required" unless options[:oracle]
abort "--format is required, one of #{FORMATS.join(', ')}" unless options[:format]
unless FORMATS.include?(options[:format])
  abort "unknown --format #{options[:format].inspect}; known formats are #{FORMATS.join(', ')}"
end
format = options[:format]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
abort "not a plurimath checkout: #{lib}" unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))

$LOAD_PATH.unshift(lib)
require "plurimath"
require "plurimath/version"

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
unless loaded&.start_with?(lib)
  abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
        "An installed gem answers from a different version."
end

# The ONE exception the oracle is documented to raise across this surface.
# `Plurimath::Math.parse` funnels every StandardError into ParseError
# (lib/plurimath/math.rb), and `Formula#wrap_render_error` does the same for
# every `to_<format>` (lib/plurimath/math/formula.rb). So a ParseError is the
# gem saying "I refuse this input"; anything else is a defect in this generator
# or in the oracle. A blanket `rescue StandardError` here used to launder those
# into ordinary "raises" rows, which the spec then ignored entirely -- a
# generator typo would have read as 104 well-understood cases.
ORACLE_REFUSAL = Plurimath::Math::ParseError

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

def oracle_commit(oracle)
  dirty = git!(oracle, "status", "--porcelain").strip
  abort "REFUSING: oracle checkout is dirty. Expectations must come from a clean tree." unless dirty.empty?

  sha = git!(oracle, "rev-parse", "HEAD").strip
  abort "REFUSING: `git rev-parse HEAD` named no commit in #{oracle}" unless /\A[0-9a-f]{40}\z/.match?(sha)

  sha
end

cases = []
Dir.glob(File.join(options[:corpus], "**", "*.yaml")).sort.each do |path|
  next if File.basename(path) == "provenance.yaml"

  doc = YAML.safe_load_file(path, permitted_classes: [], aliases: true)
  next unless doc.is_a?(Hash) && doc["cases"]

  doc["cases"].each do |c|
    next unless c.is_a?(Hash) && c["input"].is_a?(String)

    cases << { group: doc["group"], id: c["id"], input: c["input"] }
  end
end
abort "REFUSING: zero corpus cases found under #{options[:corpus]}" if cases.empty?

duplicates = cases.map { |c| c[:id] }.tally.select { |_, count| count > 1 }.keys
abort "REFUSING: duplicate case ids in the corpus: #{duplicates.join(', ')}" unless duplicates.empty?

commit = oracle_commit(oracle)

rows = cases.map do |c|
  row = { "group" => c[:group], "id" => c[:id], "input" => c[:input] }
  formula = nil
  begin
    formula = Plurimath::Math.parse(c[:input], :asciimath)
  rescue ORACLE_REFUSAL => e
    row["raises"] = e.class.name
    row["raisedIn"] = "parse"
  end

  unless formula.nil?
    begin
      row["expected"] = formula.public_send("to_#{format}")
    rescue ORACLE_REFUSAL => e
      row["raises"] = e.class.name
      row["raisedIn"] = "render"
    end
  end
  row
end

rendered = rows.count { |r| r.key?("expected") }
raised = rows.count { |r| r.key?("raises") }
abort "REFUSING: #{format} produced zero rendered cases" if rendered.zero?
abort "REFUSING: #{format} produced zero raising cases" if raised.zero?
unless rendered + raised == rows.length
  abort "REFUSING: #{rows.length} rows but #{rendered} rendered + #{raised} raised; a row is both or neither"
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  # Provenance, in the shape test/gates/payload-validation.spec.ts reads: the
  # script that wrote this file and the sha256 of that script. Without it the
  # fixture and the generator could be edited together and no gate would notice
  # -- the same hole that gate was written for after `generate-corpus.rb` was
  # edited twice without its consumers being regenerated.
  "generator" => {
    "script" => GENERATOR_RELATIVE_PATH,
    "sha256" => Digest::SHA256.file(File.join(REPO_ROOT, GENERATOR_RELATIVE_PATH)).hexdigest,
  },
  "oracle" => { "commit" => commit, "version" => (defined?(Plurimath::VERSION) ? Plurimath::VERSION : "unknown") },
  "format" => format,
  "caseCount" => rows.length,
  "renderedCount" => rendered,
  "raisedCount" => raised,
  "cases" => rows,
}
dir = File.join(options[:out], format)
Dir.mkdir(dir) unless File.directory?(dir)
out = File.join(dir, "parity-fixtures.json")
File.write(out, "#{JSON.pretty_generate(payload)}\n")
puts "#{format}: #{rows.length} cases, #{rendered} rendered, #{raised} raised -> #{out}"
