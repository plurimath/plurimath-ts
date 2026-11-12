# frozen_string_literal: true
# Export measured Ruby HTML captures and common models; no runtime parser code.
require 'json'
require 'digest'
require 'open3'
require 'plurimath'
require_relative 'generate-corpus'
root = File.expand_path('..', __dir__)
output = File.expand_path(ARGV.fetch(0))
inputs_path = 'test/fixtures/html-parg/inputs.json'
core_source = Plurimath::Html::Parse.instance_method(:matching_close_tag).source_location.first
core_root = File.expand_path('../../..', core_source)
head, status = Open3.capture2('git', '-C', core_root, 'rev-parse', 'HEAD')
raise 'source Git pin unavailable' unless status.success?
raise 'unqualified HTML source' unless head.strip == '0a1df68a5903d43da13b1e1ef85b6c0523feb1b4'
rows = JSON.parse(File.read(File.join(root, inputs_path))).fetch('cases')
cases = rows.map do |row|
  begin
    input = row.fetch('input')
    parser = Plurimath::Html::Parser.new(input)
    normalized = parser.send(:normalized_text)
    captures = parser.send(:normalized_nodes, Plurimath::Html::Parse.new.parse(normalized))
    captures = JSON.parse(JSON.generate(captures), symbolize_names: true)
    model = Plurimath::Html::Transform.new.apply(captures)
    model = Plurimath::Math::Formula.new(model) unless model.is_a?(Plurimath::Math::Formula)
    model.input_string = input
    row.merge(normalized: normalized, captures: captures,
              model: CorpusGenerator.serialize_value(model, '$'))
  rescue StandardError => error
    row.merge(error: { class: error.class.name, message: error.message })
  end
end
provenance = {
  generator: 'scripts/export-html-source-fixtures.rb',
  generator_sha256: Digest::SHA256.file(__FILE__).hexdigest,
  serializer: 'scripts/generate-corpus.rb',
  serializer_sha256: Digest::SHA256.file(File.join(__dir__, 'generate-corpus.rb')).hexdigest,
  inputs: inputs_path, inputs_sha256: Digest::SHA256.file(File.join(root, inputs_path)).hexdigest,
  grammar_source_sha256: Digest::SHA256.file(core_source).hexdigest,
  ruby: RUBY_VERSION,
  gems: Gem.loaded_specs.transform_values { |spec| spec.version.to_s }.sort.to_h
}
payload = {profile: 'source-normalized-html-captures-v1', source_commit: head.strip,
           provenance: provenance, cases: cases}
File.write(output, JSON.pretty_generate(payload) + "\n")
puts JSON.generate(cases: cases.size, models: cases.count { |row| row.key?(:model) },
                   refusals: cases.count { |row| row.key?(:error) })
