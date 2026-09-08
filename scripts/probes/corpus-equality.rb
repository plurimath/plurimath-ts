# frozen_string_literal: true

# Corpus equality probe — the Ruby half of
# `test/core/equality.spec.ts`'s "the corpus equality matrix, as the gem
# reports it".
#
# Asks the GEM, over every reachable case in the pinned corpus, which ordered
# pairs satisfy `Formula#==`. The spec's `RubyEqualPairs` is this probe's
# output pasted in: the port must then find exactly that set. Nothing here
# consults the port, which is the point — a fixture measured from the port
# would leave the suite comparing the port to itself.
#
# Run it against the pinned oracle, which must be a CLEAN checkout of the
# commit `corpus/provenance.yaml` records:
#
#   BUNDLE_GEMFILE=<oracle>/Gemfile bundle exec ruby \
#     scripts/probes/corpus-equality.rb --oracle <oracle>
#
# It loads the oracle through $LOAD_PATH and refuses to answer from an
# installed gem, which would silently be a different version
# (PORTING-STANDARDS.md).

require "optparse"
require "yaml"
require_relative "../generate-corpus"

options = { oracle: nil }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
end.parse!
abort "--oracle is required" unless options[:oracle]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))
  abort "not a plurimath checkout: #{lib}"
end

$LOAD_PATH.unshift(lib)
require "plurimath"

unless Gem.loaded_specs.key?("plurimath")
  abort "REFUSING: the plurimath gem is not activated. Re-run with " \
        "BUNDLE_GEMFILE=#{oracle}/Gemfile bundle exec ruby #{__FILE__} ..."
end
loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
unless loaded&.start_with?(lib)
  abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
        "An installed gem answers from a different version."
end
warn "oracle: #{loaded}"

# The same selection `readCorpusCases` makes on the TypeScript side: every
# pinned CASE, minus the ids `corpus/exclusions.yaml` withholds for using a
# deferred construct. Both sides must run over the same list or the pair sets
# cannot be compared at all, so every count is printed below.
#
# `read_pin_cases` returns the rejection payloads' rows too — those carry an
# `error:` and no `model:`, and feeding them to a parser would abort this probe
# on the first `a/`. The discriminator is the one the TypeScript reader uses:
# a case has a `model`, a rejection does not.
records = CorpusGenerator.read_pin_cases
abort "REFUSING: zero pinned rows found" if records.empty?

rejections, all_cases = records.partition { |row| !row.key?("model") }
malformed = rejections.reject { |row| row.key?("error") }
unless malformed.empty?
  abort "REFUSING: #{malformed.length} row(s) have neither a model nor an error: " \
        "#{malformed.map { |row| row.fetch('id') }.join(', ')}"
end
abort "REFUSING: no pinned row carries a model" if all_cases.empty?

exclusions_path = File.join(CorpusGenerator::REPO_ROOT, "corpus", "exclusions.yaml")
withheld = (YAML.safe_load(File.read(exclusions_path), aliases: false)["excluded"] || [])
           .map { |entry| entry.fetch("id") }
cases = all_cases.reject { |kase| withheld.include?(kase.fetch("id")) }
abort "REFUSING: every pinned case is withheld" if cases.empty?

duplicates = cases.map { |c| c.fetch("id") }.tally.select { |_, count| count > 1 }.keys
abort "REFUSING: duplicate case ids: #{duplicates.join(', ')}" unless duplicates.empty?

# Each case is parsed in the notation it is WRITTEN in. The corpus carries two,
# and handing one parser the other's source would compare formulas the gem
# never produced for these inputs.
formulas = cases.map do |kase|
  id = kase.fetch("id")
  format = kase.fetch("input_format").to_sym
  [id, Plurimath::Math.parse(kase.fetch("input"), format)]
rescue StandardError => e
  abort "REFUSING: #{id} (#{format}) did not parse: #{e.class}: #{e.message}"
end

reflexive = formulas.count do |id, formula|
  kase = cases.find { |c| c.fetch("id") == id }
  formula == Plurimath::Math.parse(kase.fetch("input"), kase.fetch("input_format").to_sym)
end

pairs = []
asymmetric = []
formulas.each_with_index do |(left_id, left), i|
  formulas[(i + 1)..].each do |right_id, right|
    forward = (left == right)
    backward = (right == left)
    asymmetric << "#{left_id}|#{right_id}" unless forward == backward
    pairs << "#{left_id}|#{right_id}" if forward
  end
end

puts "rows in pin:     #{records.length}"
puts "rejections:      #{rejections.length}"
puts "cases pinned:    #{all_cases.length}"
puts "cases withheld:  #{all_cases.length - cases.length}"
puts "cases compared:  #{cases.length}"
puts "reflexive:       #{reflexive}"
puts "comparisons:     #{cases.length * (cases.length - 1) / 2}"
puts "asymmetric:      #{asymmetric.length}#{asymmetric.empty? ? '' : " -> #{asymmetric.join(', ')}"}"
puts "equal pairs:     #{pairs.length}"
puts
pairs.sort.each { |pair| puts "  \"#{pair}\"," }
