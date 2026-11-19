#!/usr/bin/env ruby
# frozen_string_literal: true
# Re-measure historical investigation inputs without modifying their recordings.
require "optparse"
require_relative "generate-unitsml-data"
require_relative "render-fixture-provenance"

options = { out: "test/formats/unicodemath", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH") { |v| options[:oracle] = v }
  o.on("--out PATH") { |v| options[:out] = v }
  o.on("--allow-dirty") { options[:allow_dirty] = true }
end.parse!
abort "--oracle required" unless options[:oracle]
oracle = File.realpath(options[:oracle])
NativeCompletionReference.load_oracle!(oracle)
root = File.expand_path("..", __dir__)
output = File.join(File.expand_path(options[:out]), "current-profiles.json")
generator = "scripts/generate-unicodemath-current-profiles.rb"
sidecar, provenance = RenderFixtureProvenance.prepare(
  oracle: oracle, payload_path: output, generator_path: generator,
  allow_dirty: options[:allow_dirty], corpus: false,
)
formats = { "asciimath" => :to_asciimath, "latex" => :to_latex, "mathml" => :to_mathml,
            "html" => :to_html, "omml" => :to_omml, "unicodemath" => :to_unicodemath }
inputs = {}
groups = %w[reachability scope-gap xml-origin].to_h do |group|
  path = "test/formats/unicodemath/#{group}-fixtures.json"
  bytes = File.binread(File.join(root, path))
  inputs[path] = Digest::SHA256.hexdigest(bytes)
  cases = JSON.parse(bytes).fetch("cases")
  raise "empty historical inputs" if cases.empty?
  warn "measuring #{group}: #{cases.length} inputs"
  rows = cases.map do |historical|
    input = historical.fetch("input")
    row = { "input" => input }
    begin
      formula = Plurimath::Math.parse(input, :unicode)
      row["model"] = CorpusGenerator.serialize_node(formula, input)
    rescue Plurimath::Math::ParseError => e
      row["raises"] = e.class.name
      next row
    end
    (group == "scope-gap" ? formats : {}).each do |name, method|
      begin
        # Render a fresh parse: writers can mutate their input tree.
        row[name] = Plurimath::Math.parse(input, :unicode).public_send(method)
      rescue StandardError => e
        row["#{name}Error"] = e.class.name
      end
    end
    row
  end
  [group, rows]
end
provenance["generator"]["inputs"].merge!(inputs)
provenance["generator"]["inputs"]["scripts/generate-unitsml-data.rb"] =
  Digest::SHA256.file(File.join(root, "scripts/generate-unitsml-data.rb")).hexdigest
payload = { "schema" => "plurimath-unicodemath-current-profiles/1",
            "oracle" => NativeCompletionReference::PIN,
            "lockSha256" => NativeCompletionReference::LOCK_SHA,
            "historicalInputs" => inputs, "groups" => groups }
bytes = JSON.pretty_generate(payload) + "\n"
FileUtils.mkdir_p(File.dirname(output))
File.binwrite(output, bytes)
RenderFixtureProvenance.write_manifest(sidecar_path: sidecar, payload_path: output,
  payload_schema: payload.fetch("schema"), payload_bytes: bytes, provenance: provenance)
puts groups.transform_values(&:length).to_json
