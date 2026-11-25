# frozen_string_literal: true

# Focused public-API observations for the default LaTeX and UnicodeMath PARG consumer.
# BUNDLE_GEMFILE=<oracle>/Gemfile bundle exec ruby scripts/probes/text-default-stage.rb \
#   <oracle> <output.json>
require "digest"
require "json"
require "open3"

oracle = File.realpath(ARGV.fetch(0))
output = File.expand_path(ARGV.fetch(1))
expected_commit = "b0a695cbc5ce31fe8d0d3934d0c93428bb6d200e"
head, status = Open3.capture2("git", "-C", oracle, "rev-parse", "HEAD")
abort "Wrong text reference revision" unless status.success? && head.strip == expected_commit
dirty, status = Open3.capture2("git", "-C", oracle, "status", "--porcelain")
abort "Text reference must be clean" unless status.success? && dirty.empty?
$LOAD_PATH.unshift(File.join(oracle, "lib"))
require "plurimath"
require_relative "../generate-corpus"
loaded = $LOADED_FEATURES.find { |path| path.end_with?("/plurimath.rb") }
abort "Loaded a different reference" unless loaded&.start_with?("#{oracle}/lib/")
require "plurimath/setup/ox_engine"
Lutaml::Model::Config.xml_adapter_type = :ox
abort "Expected the Ox reference backend" unless Plurimath.xml_engine == Plurimath::XmlEngine::OxEngine

inputs = {
  "latex" => [
    ["symbol", "x"], ["dot-decimal", "1.5"], ["comma-decimal", "1,5", "de"],
    ["arabic-decimal", "1٫5", "ar"], ["fraction", '\frac{1}{2}'],
    ["root", '\sqrt{x}'], ["scripts", 'x_1^2'], ["greek", '\alpha+1'],
    ["raw-greek", "α+x"], ["text", '\text{a b}'], ["fence", '\left(x+y\right)'],
    ["matrix", '\begin{matrix}a&b\\\\c&d\end{matrix}'],
    ["entity", "x&#x2b;y"], ["empty", ""], ["space", " "], ["unclosed", '\frac{1}{'],
    ["bad-entity", "&#55296;"], ["supplementary", "😀x"],
  ],
  "unicode" => [
    ["symbol", "x"], ["dot-decimal", "1.5"], ["comma-decimal", "1,5", "de"],
    ["arabic-decimal", "1٫5", "ar"], ["fraction", "a/b"], ["root", "√x"],
    ["scripts", "x_1^2"], ["greek", "α+x"], ["escaped-greek", '\u03b1+x'],
    ["equation-label", "x#label"], ["text-hash", "✎(a#b)"],
    ["comment", "x⫷comment⫸+y"], ["matrix", "■(a&b@c&d)"],
    ["parentheses", "(x+y)"], ["empty", ""], ["space", " "],
    ["only-label", "#label"], ["unclosed", "√("], ["supplementary", "😀x"],
  ],
}

targets = { "asciimath" => :to_asciimath, "latex" => :to_latex,
            "mathml" => :to_mathml, "html" => :to_html,
            "unicode" => :to_unicodemath, "omml" => :to_omml }
rows = inputs.flat_map do |format, cases|
 cases.map do |id, input, locale|
  row = { "id" => "#{format}-#{id}", "format" => format, "input" => input }
  row["locale"] = locale if locale
  begin
    formula = Plurimath::Math.parse(input, format.to_sym, **(locale ? { locale: locale } : {}))
    row["model"] = CorpusGenerator.serialize_value(formula, "$")
    row["rendered"] = targets.to_h do |name, method|
      value = begin
        { "bytes" => formula.public_send(method) }
      rescue StandardError => error
        { "raises" => error.class.name }
      end
      [name, value]
    end
  rescue Plurimath::Math::ParseError => error
    row["raises"] = error.class.name
  end
  row
 end
end
payload = {
  "oracle" => { "commit" => expected_commit, "ruby" => RUBY_VERSION,
                "lockSha256" => Digest::SHA256.file(File.join(oracle, "Gemfile.lock")).hexdigest,
                "xmlEngine" => Plurimath.xml_engine.to_s,
                "gems" => Gem.loaded_specs.transform_values { |spec| spec.version.to_s }.sort.to_h },
  "generatorSha256" => Digest::SHA256.file(__FILE__).hexdigest,
  "serializerSha256" => Digest::SHA256.file(File.expand_path("../generate-corpus.rb", __dir__)).hexdigest,
  "cases" => rows,
}
File.write(output, JSON.pretty_generate(payload) + "\n")
puts JSON.generate(cases: rows.size, models: rows.count { |row| row.key?("model") },
                   refusals: rows.count { |row| row.key?("raises") })
