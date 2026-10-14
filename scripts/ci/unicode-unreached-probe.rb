# frozen_string_literal: true

# Diagnostic only: public parse witnesses for nine unproven Ruby rules,
# retaining the already-witnessed 2323 as a regression/trace control.
# TracePoint observes existing action blocks without replacing
# them, changing arity, or enabling rules that the reference does not carry.
require_relative "../generate-unitsml-data"
require "timeout"

options = { seconds: 120, candidates: File.expand_path("unicode-xml-origin-candidates.json", __dir__) }
OptionParser.new do |parser|
  parser.on("--oracle PATH") { |value| options[:oracle] = value }
  parser.on("--out PATH") { |value| options[:out] = value }
  parser.on("--seconds N", Integer) { |value| options[:seconds] = value }
  parser.on("--candidates PATH", "Additional JSON route witnesses (no expected outputs)") { |value| options[:candidates] = value }
end.parse!
abort "--oracle and --out required" unless options[:oracle] && options[:out]
abort "positive bounded --seconds required" unless options[:seconds].between?(1, 300)

oracle = File.realpath(options[:oracle])
out = File.expand_path(options[:out])
FileUtils.mkdir_p(out)
NativeCompletionReference.load_oracle!(oracle)
targets = %w[11 12 41 42 51 75 845 1003 3156 3189 3211 3222 3244 3266 3323 3334 3356 3378 3444 3466 3488 3618 3629 3698 3780 3816
  760 925 930 1841 2041 2323 2341 2777 2787 3074].freeze
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
registered_rule_ids = Plurimath::UnicodeMath::Transform.rules.map do |_pattern, action|
  file, line = action.source_location
  if File.realpath(file) == transform_path
    locations.fetch([file, line])
  elsif File.realpath(file) == File.join(oracle, "lib/plurimath/base_number_prefix.rb")
    "bnp:#{line}"
  else
    abort "unknown registered transform action source: #{file}:#{line}"
  end
end
abort "duplicate registered action ids" unless registered_rule_ids.uniq.length == registered_rule_ids.length
abort "observed action locations missing" unless (observed - registered).empty?

# These are hypotheses, never expected models or evidence of reachability.
# Cover the producer routes before the larger existing-fixture sweep so a
# bounded run cannot silently omit the nine-rule investigation.
routes = {
  "prior26/nary-postfix" => ["∫▒(a)₁ₐ", "∫_x▒(a)₁ₐ", "∫▒(a)ₐ₁", "∫▒(a)¹ᵃ", "∫▒(a)ᵃ¹", "∫▒(+)₁ₐ", "∫▒(½)₁ₐ", "∫▒(ab)₁ₐ", "∫▒(a_1)₁ₐ"],
  "scope-gap/raw-hash" => ["±±a", "̲a+a", "∫∫f g+x", "a·b·c+d", "±+a#eq", "a ± b#eq"],
  "scope-gap/integral-mask" => ["∫1_a", "∫1_a^b f"],
  "760/unary_subsup" => ["asin^2 x", "a sin^2 x", "a sin_a x", "a sin^a_b x", "a sin² x", "a sin₁ x", "a sin'² x", "a sin^2", "a sin_a", "sin^2 cos^3 x", "a sin_1", "a sin_1^2 b", "a sin′_1", "a sin′²", "a sinh_1^2 b"],
  "925-930/expression" => ["a b", "a b c", "1 2", 'a "b"', "a (b)", "a 𝛼", "a \\alpha", "a Ⓐ", "a |b|", "a sin x", "a + b c"],
  "1841-2777/intermediate_operator" => ["(a|+", "|a)+", "(a|+b", "|a)+b", "(a|b)+c", "(a|=b", "(a|≤b", "|a)×b", "(a|b)!+c", "(a|+b c", "(a| +b", "|a) +b", "(a| !+b", "(a| b+c", "(a| b c+d"],
  "2041/atom_binary_factor" => ["a+b", "a×b", "a≤b", "1/a+b", "a+b/c", "a×b/c", "(a+b)/c", "a/(b+c)", "a+b c", "1/a+b c", "a±b/c", "α±b/c", "a±(b)/c", "a!±b/c"],
  "2341/intermediate_expression" => ["(a|b c", "|a)b c", "(a|b c d", "(a|sin x", "(a|b)^c d", "|a)_b c", "(a|b! c", "(a|b c)", "(a|b+c d", "|a)b+c d", "(a| b c d", "|a) b c d", "(a| +b c", "|a) +b c"],
  "2787-3074/atom_operator_fraction" => ["a+²/₃", "a+²/₃ b c", "a×¹/₂", "a×¹/₂ b c", "a+1/2", "a+1/2 b c", "a+(b)/(c)", "a+(b)/(c) d e", "a≤²/₃", "a≤²/₃ b c", "a²+³/₄", "a²+³/₄ b", "α²+³/₄", "a+³/₄", "a+³/₄ b", "α+³/₄ b"],
}
routes.fetch("scope-gap/integral-mask").concat((0..31).flat_map do |mask|
  ["∫#{mask}_a", "∫#{mask}^b", "∫#{mask}_a^b f", "∫#{mask}▒f"]
end)
priority_cases = [{ "input" => "a", "group" => "trace-control" },
  { "input" => "1/2", "group" => "trace-control" },
  { "input" => "1/a≤∫", "group" => "2323/control" }]
routes.each do |route, inputs|
  inputs.each { |input| priority_cases << { "input" => input, "group" => "nine-rule-route", "route" => route } }
end
if options[:candidates]
  candidate_payload = JSON.parse(File.read(options[:candidates]))
  if candidate_payload["schema"] == "plurimath-unicode-xml-origin-candidates/1"
    source_root = File.expand_path("../..", __dir__)
    abort "candidate corpus revision mismatch" unless candidate_payload.fetch("corpus") == NativeCompletionReference.git(source_root, "rev-parse", "HEAD:submodules/plurimath-testsuite")
    candidate_payload.fetch("sourceInputs").each do |relative, recorded|
      abort "invalid corpus input path" unless relative.match?(%r{\Acorpus/(mathml|omml)/[a-z0-9-]+\.yaml\z})
      path = File.join(source_root, "submodules/plurimath-testsuite", relative)
      abort "candidate corpus bytes mismatch: #{relative}" unless File.size(path) == recorded.fetch("bytes") && Digest::SHA256.file(path).hexdigest == recorded.fetch("sha256")
    end
  end
  additions = candidate_payload.fetch("cases")
  abort "empty additional candidates" if additions.empty?
  abort "additional candidates exceed bounded limit" if additions.length > 500
  additions.each do |entry|
    abort "candidate requires input and route strings" unless entry["input"].is_a?(String) && entry["route"].is_a?(String)
    abort "candidate input exceeds bounded length" if entry.fetch("input").length > 256
    priority_cases << { "input" => entry.fetch("input"), "route" => entry.fetch("route"), "group" => "additional-route", "sourceCaseIds" => entry["sourceCaseIds"] }
  end
end

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
cases = priority_cases + inputs.uniq.map { |input| { "input" => input, "group" => "targeted" } }
cases = cases.uniq { |entry| [entry.fetch("input"), entry["locale"]] }
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
    parser = Timeout.timeout(2) { Plurimath::UnicodeMath::Parser.new(entry.fetch("input")) }
    row["preprocessed"] = parser.text
  rescue StandardError, SystemStackError => error
    row["preprocessError"] = { "class" => error.class.name, "message" => error.message }
  end
  if row.key?("preprocessed")
    row["rawTreeStage"] = "preprocessed grammar before equation-label wrapping, default locale"
    begin
      row["tree"] = Timeout.timeout(2) do
        CorpusGenerator.serialize_value(Plurimath::UnicodeMath::Parse.new.parse(parser.text), "unreached.tree")
      end
    rescue StandardError, SystemStackError => error
      row["rawTreeError"] = { "class" => error.class.name, "message" => error.message }
    end
  end
  # A parse refusal must not suppress independent preprocessing/tree evidence.
  # Only the public parse is traced; raw-tree diagnostics cannot inflate firings.
  begin
    formula = Timeout.timeout(2) do
      trace.enable do
        Plurimath::Math.parse(entry.fetch("input"), :unicode)
      end
    end
    row["model"] = Timeout.timeout(2) { CorpusGenerator.serialize_node(formula, "unreached.model") }
  rescue StandardError, SystemStackError => error
    row["raises"] = error.class.name
    row["message"] = error.message
  ensure
    trace.disable
  end
  if entry.fetch("route", "").start_with?("scope-gap/") && row.key?("model")
    %w[asciimath latex mathml html omml unicodemath].each do |format|
      begin
        row[format] = Timeout.timeout(2) { formula.public_send("to_#{format}") }
      rescue StandardError, SystemStackError => error
        row["#{format}Error"] = { "class" => error.class.name, "message" => error.message }
      end
    end
  end
  row["targetFirings"] = targets.to_h { |id| [id, fired[id]] }
  row["controlFirings"] = controls.to_h { |id| [id, fired[id]] }
  targets.each { |id| counts[id] += fired[id] }
  controls.each { |id| control_counts[id] += fired[id] }
  rows << row
end
abort "empty measurement" if rows.empty?

input_paths = [__FILE__, File.expand_path("../generate-unitsml-data.rb", __dir__),
  File.expand_path("../generate-corpus.rb", __dir__), fixture_path]
input_paths << File.realpath(options[:candidates]) if options[:candidates]
parslet_spec = Gem.loaded_specs.fetch("parslet")
parslet_inputs = %w[lib/parslet/atoms/base.rb lib/parslet/atoms/alternative.rb
  lib/parslet/atoms/sequence.rb lib/parslet/atoms/named.rb
  lib/parslet/atoms/can_flatten.rb lib/parslet/atoms/repetition.rb
  lib/parslet/atoms/entity.rb lib/parslet/context.rb
  lib/parslet/atoms/context.rb lib/parslet/pattern/binding.rb
  lib/parslet/pattern.rb lib/parslet/transform.rb]
report = {
  "schema" => "plurimath-unicode-unreached-probe/2",
  "oracle" => NativeCompletionReference::PIN,
  "lockSha256" => NativeCompletionReference::LOCK_SHA,
  "source" => NativeCompletionReference.git(File.expand_path("../..", __dir__), "rev-parse", "HEAD"),
  "sourceDirty" => !NativeCompletionReference.git(File.expand_path("../..", __dir__), "status", "--porcelain").empty?,
  "ruby" => RUBY_DESCRIPTION,
  "parslet" => {
    "version" => parslet_spec.version.to_s,
    "engineInputs" => parslet_inputs.to_h do |relative|
      [relative, Digest::SHA256.file(File.join(parslet_spec.full_gem_path, relative)).hexdigest]
    end,
  },
  "sourceInputs" => input_paths.to_h do |path|
    [path.sub(File.expand_path("../..", __dir__) + "/", ""), Digest::SHA256.file(path).hexdigest]
  end,
  "oracleInputs" => (Dir.glob(File.join(oracle, "lib/plurimath/unicode_math/**/*.rb")) + [File.join(oracle, "lib/plurimath/base_number_prefix.rb")]).sort.to_h do |path|
    [path.sub(oracle + "/", ""), Digest::SHA256.file(path).hexdigest]
  end,
  "registeredRuleCount" => Plurimath::UnicodeMath::Transform.rules.length,
  "registeredRuleIds" => registered_rule_ids,
  "targetActionLocations" => locations.filter_map { |(file, line), id| [id, line] if targets.include?(id) }.to_h,
  "candidateCount" => cases.length,
  "excludedLocaleCases" => existing.count { |entry| entry["locale"] },
  "attemptedCount" => rows.length,
  "unattemptedCount" => cases.length - rows.length,
  "priorityCandidateCount" => priority_cases.map { |entry| entry.fetch("input") }.uniq.length,
  "unattemptedPriorityInputs" => priority_cases.map { |entry| entry.fetch("input") }.uniq - rows.map { |row| row.fetch("input") },
  "measurementScope" => "bounded public-input search; zero firings are not an unreachability proof",
  "routeCounts" => rows.group_by { |row| row["route"] || row.fetch("group") }.transform_values(&:length),
  "failureCounts" => %w[preprocessError rawTreeError raises].to_h do |key|
    [key, rows.count { |row| row.key?(key) }]
  end,
  "targetFirings" => counts,
  "controlFirings" => control_counts,
  "traceControlsPassed" => controls.all? { |id| control_counts.fetch(id).positive? } && counts.fetch("2323").positive?,
  "witnesses" => targets.to_h do |id|
    [id, rows.filter_map { |row| row.fetch("input") if row.fetch("targetFirings").fetch(id).positive? }]
  end,
  "cases" => rows,
}
File.write(File.join(out, "unicode-unreached-probe.json"), JSON.pretty_generate(report) + "\n")
puts JSON.generate(report.reject { |key, _value| key == "cases" })
abort "trace positive control did not fire; inspect diagnostic report" unless report.fetch("traceControlsPassed")
abort "priority witness search incomplete; inspect diagnostic report" unless report.fetch("unattemptedPriorityInputs").empty?
