# frozen_string_literal: true

# Diagnostic only: public parse witnesses for the ten still-unreached Ruby
# transform rules. TracePoint observes existing action blocks without replacing
# them, changing arity, or enabling rules that the reference does not carry.
require_relative "../generate-unitsml-data"
require "timeout"

options = { seconds: 120 }
OptionParser.new do |parser|
  parser.on("--oracle PATH") { |value| options[:oracle] = value }
  parser.on("--out PATH") { |value| options[:out] = value }
  parser.on("--seconds N", Integer) { |value| options[:seconds] = value }
end.parse!
abort "--oracle and --out required" unless options[:oracle] && options[:out]
abort "positive bounded --seconds required" unless options[:seconds].between?(1, 300)

oracle = File.realpath(options[:oracle])
out = File.expand_path(options[:out])
FileUtils.mkdir_p(out)
NativeCompletionReference.load_oracle!(oracle)
targets = %w[760 925 930 1841 2041 2323 2341 2777 2787 3074].freeze
controls = %w[18 1609].freeze
observed = targets + controls
transform_path = File.join(oracle, "lib/plurimath/unicode_math/transform.rb")
source_lines = File.readlines(transform_path)
rule_lines = source_lines.each_index.filter_map do |index|
  index + 1 if source_lines[index].match?(/\brule\(/)
end
locations = {}
Plurimath::UnicodeMath::Transform.rules.each do |_pattern, action|
  file, line = action.source_location
  next unless File.realpath(file) == transform_path
  id = rule_lines.reverse.find { |candidate| candidate <= line }.to_s
  locations[[file, line]] = id
end
registered = locations.values.uniq
abort "observed action locations missing" unless (observed - registered).empty?

# 2323's plausible escape from the earlier denominator branch: a relational
# symbol blocks factor + recursive_denominator, but can belong to operand,
# which then stops at a nary that must be parsed by recursive_denominator.
inputs = ["a", "1/2", "1/a≤∫", "1/a≤∫_c d", "1/a≤∑", "1/a≤∑_c d"]
%w[≤ ≥ ∈ ≈ →].product(%w[∫ ∑ ∫_c ∫_c^d]).each do |relation, nary|
  inputs.concat(["1/a#{relation}#{nary}", "1/a#{relation}#{nary} x", "1/a#{relation}#{nary} a b"])
end
%w[sin cos tan log lim].product(["^2", "_a", "^a_b", "²", "₁", "'²"]).each do |function, script|
  inputs.concat(["a#{function}#{script} x", "a #{function}#{script} x", "1/a#{function}#{script} x"])
end
%w[(a| |a) (a|b |a)b].product(%w[+ - = ≤ ×]).each do |fence, operator|
  inputs.concat(["#{fence}#{operator}", "#{fence}#{operator}b", "(#{fence}#{operator}b)"])
end
%w[+ - × ÷ ⊕ ≤].product(["²/₃", "a/b", "1/2", "(a)/(b)"]).each do |operator, fraction|
  inputs.concat(["a#{operator}#{fraction}", "a#{operator}#{fraction}b c", "(a#{operator}#{fraction})"])
end

fixture_path = File.expand_path("../../test/formats/unicodemath/model-fixtures.json", __dir__)
existing = JSON.parse(File.read(fixture_path)).fetch("cases")
cases = inputs.uniq.map { |input| { "input" => input, "group" => "targeted" } }
seen = cases.map { |entry| [entry.fetch("input"), entry["locale"]] }.to_h { |key| [key, true] }
existing.each do |entry|
  # Raw grammar diagnostics below use the default locale; do not present
  # locale-specific fixture inputs as observations under their recorded locale.
  next if entry["locale"]
  key = [entry.fetch("input"), entry["locale"]]
  next if seen[key]
  seen[key] = true
  cases << { "input" => entry.fetch("input"), "locale" => entry["locale"], "group" => "existing" }
end

counts = targets.to_h { |id| [id, 0] }
control_counts = controls.to_h { |id| [id, 0] }
rows = []
deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + options[:seconds]
cases.each do |entry|
  break if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
  row = entry.dup
  fired = Hash.new(0)
  trace = TracePoint.new(:b_call) do |event|
    id = locations[[event.path, event.lineno]]
    fired[id] += 1 if id && observed.include?(id)
  end
  begin
    Timeout.timeout(2) do
      formula = trace.enable do
        Plurimath::Math.parse(entry.fetch("input"), :unicode)
      end
      row["model"] = CorpusGenerator.serialize_node(formula, "unreached.model")
      parser = Plurimath::UnicodeMath::Parser.new(entry.fetch("input"))
      row["preprocessed"] = parser.text
      row["rawTreeStage"] = "preprocessed grammar before equation-label wrapping, default locale"
      begin
        row["tree"] = CorpusGenerator.serialize_value(
          Plurimath::UnicodeMath::Parse.new.parse(parser.text), "unreached.tree"
        )
      rescue StandardError, SystemStackError => error
        row["rawTreeError"] = { "class" => error.class.name, "message" => error.message }
      end
    end
  rescue StandardError, SystemStackError => error
    row["raises"] = error.class.name
    row["message"] = error.message
  ensure
    trace.disable
  end
  row["targetFirings"] = targets.to_h { |id| [id, fired[id]] }
  row["controlFirings"] = controls.to_h { |id| [id, fired[id]] }
  targets.each { |id| counts[id] += fired[id] }
  controls.each { |id| control_counts[id] += fired[id] }
  rows << row
end
abort "empty measurement" if rows.empty?
abort "trace positive control did not fire" unless controls.all? { |id| control_counts.fetch(id).positive? }

report = {
  "schema" => "plurimath-unicode-unreached-probe/1",
  "oracle" => NativeCompletionReference::PIN,
  "lockSha256" => NativeCompletionReference::LOCK_SHA,
  "source" => NativeCompletionReference.git(File.expand_path("../..", __dir__), "rev-parse", "HEAD"),
  "ruby" => RUBY_DESCRIPTION,
  "sourceInputs" => [__FILE__, File.expand_path("../generate-unitsml-data.rb", __dir__),
    File.expand_path("../generate-corpus.rb", __dir__), fixture_path].to_h do |path|
    [path.sub(File.expand_path("../..", __dir__) + "/", ""), Digest::SHA256.file(path).hexdigest]
  end,
  "registeredRuleCount" => Plurimath::UnicodeMath::Transform.rules.length,
  "targetActionLocations" => locations.filter_map { |(file, line), id| [id, line] if targets.include?(id) }.to_h,
  "candidateCount" => cases.length,
  "excludedLocaleCases" => existing.count { |entry| entry["locale"] },
  "attemptedCount" => rows.length,
  "unattemptedCount" => cases.length - rows.length,
  "targetFirings" => counts,
  "controlFirings" => control_counts,
  "witnesses" => targets.to_h do |id|
    [id, rows.filter_map { |row| row.fetch("input") if row.fetch("targetFirings").fetch(id).positive? }]
  end,
  "cases" => rows,
}
File.write(File.join(out, "unicode-unreached-probe.json"), JSON.pretty_generate(report) + "\n")
puts JSON.generate(report.reject { |key, _value| key == "cases" })
