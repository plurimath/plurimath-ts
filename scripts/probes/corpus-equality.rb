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
# (PORTING-STANDARDS.md). It also refuses an oracle checkout that is not AT the
# revision the pin names, or that is dirty: an answer measured from either is
# not the answer `corpus/provenance.yaml` names, and the whole value of this
# fixture is that it came from the revision the rest of this repository's
# generated data came from.
#
# The expected revision is read from the SUBMODULE'S COMMITTED provenance,
# through `git show <pin-head>:corpus/provenance.yaml`, and the submodule's
# head is first required to equal the gitlink this repository has committed for
# it. Reading the working copy instead was not a check at all: editing one
# `oracle.commit:` line there, with no corpus payload touched and no flag
# passed, made this probe bless a different revision and exit 0.
#
# `--allow-dirty` is DELIBERATELY narrow, and is for probing an experimental
# oracle, never for producing a fixture. It downgrades exactly three refusals
# to warnings, all of them about the ORACLE checkout: that it is a git
# repository, that it is at the expected revision, and that it is clean. It
# does NOT reach the pin-integrity checks — a submodule whose head has moved
# off this repository's gitlink, or that is dirty, aborts whatever flags are
# passed, because those decide which question is being answered rather than how
# trustworthy the answer is.

require "optparse"
require "yaml"
require_relative "../generate-corpus"

options = { oracle: nil, allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--allow-dirty", "warn instead of refusing on the ORACLE's git state") do
    options[:allow_dirty] = true
  end
end.parse!
abort "--oracle is required" unless options[:oracle]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))
  abort "not a plurimath checkout: #{lib}"
end

def refuse(message, allow_dirty)
  abort "REFUSING: #{message}" unless allow_dirty
  warn "WARNING (--allow-dirty): #{message}"
end

# --- pin integrity: which question is being answered ------------------------
#
# Not subject to --allow-dirty. Everything below establishes that the corpus
# and the provenance being read are the ones this repository has COMMITTED,
# rather than whatever is sitting in the submodule's working tree.
pin_root = CorpusGenerator.pin_root
pin_relative = CorpusGenerator::PIN_RELATIVE_PATH
unless CorpusGenerator.git_repository?(pin_root)
  abort "REFUSING: #{pin_relative} is not an initialized git checkout"
end

gitlink = CorpusGenerator.git(CorpusGenerator::REPO_ROOT, "ls-tree", "HEAD", pin_relative)
index_commit = gitlink.split(/\s+/)[2]
if index_commit.nil? || !gitlink.start_with?("160000 ")
  abort "REFUSING: #{pin_relative} is not a committed submodule gitlink: #{gitlink.strip.inspect}"
end
pin_head = CorpusGenerator.git(pin_root, "rev-parse", "HEAD").strip
unless pin_head == index_commit
  abort "REFUSING: #{pin_relative} is checked out at #{pin_head}, but this repository " \
        "has committed #{index_commit} for it. The corpus in the working tree is not the " \
        "pinned corpus."
end
pin_dirty = CorpusGenerator.dirty_paths(pin_root)
unless pin_dirty.empty?
  abort "REFUSING: #{pin_relative} is dirty: #{pin_dirty.join(', ')}. Its committed bytes " \
        "are the pin; edited ones are not."
end

# The revision the pin names, read from the submodule's COMMITTED provenance
# rather than from its working copy, so a hand-edited `oracle.commit:` cannot
# steer this probe even in the window before the dirty check would catch it.
expected_commit = YAML.safe_load(
  CorpusGenerator.git(pin_root, "show", "#{pin_head}:corpus/provenance.yaml"),
  aliases: false,
).fetch("oracle").fetch("commit")

# --- oracle state: how trustworthy the answer is ----------------------------

unless CorpusGenerator.git_repository?(oracle)
  refuse("#{oracle} is not a git checkout; the oracle must be one (ARCHITECTURE.md §7)",
         options[:allow_dirty])
end
actual_commit = CorpusGenerator.git(oracle, "rev-parse", "HEAD").strip
unless actual_commit == expected_commit
  refuse("oracle is at #{actual_commit}, not the #{expected_commit} that " \
         "corpus/provenance.yaml records", options[:allow_dirty])
end
oracle_dirty = CorpusGenerator.dirty_paths(oracle)
unless oracle_dirty.empty?
  refuse("oracle checkout is dirty: #{oracle_dirty.join(', ')}", options[:allow_dirty])
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
warn "revision: #{actual_commit}#{actual_commit == expected_commit ? ' (pinned)' : ' (NOT PINNED)'}"

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
