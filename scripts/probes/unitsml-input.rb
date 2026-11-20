# frozen_string_literal: true

# A focused current-reference profile. The older 0.11.20 corpus remains frozen.
require "digest"
require "fileutils"
require "json"
require "open3"
require "optparse"
require_relative "../generate-corpus"

module UnitsmlInputReference
  PIN = "b0a695cbc5ce31fe8d0d3934d0c93428bb6d200e"
  LOCK_SHA = "f96dc6cd975477125156e67e1e9254993dc0dd6dc4ce517dd60b42d711d2a906"
  INPUTS = ["kg", "m", "kV", "uA", "µm", "m^2", "s^-2", "kg*m*s^-2",
            "m^(1/2)", "sqrt(m)", "(kg*m)/s^2", "1", "2*kg", "unitsml(kg)",
            "unitsml(m^2)", "kg,quantity: mass", "m,name: length", " kg ",
            "m^x", "zzz", "", "unitsml(zzz)", "kg)", "unitsml(kg"].freeze
  FORMATS = %w[asciimath latex mathml omml unicodemath html].freeze
  SOURCES = %w[scripts/probes/unitsml-input.rb scripts/generate-corpus.rb scripts/oracle-model-fields.rb].freeze
  module_function

  def git(root, *args)
    out, err, status = Open3.capture3("git", "-C", root, *args)
    raise "git failed: #{err}" unless status.success?
    out.strip
  end

  def capture
    { "value" => yield }
  rescue StandardError => error
    { "error" => error.class.name }
  end

  def generate(oracle)
    raise "requires Ruby 4.0.1" unless RUBY_VERSION == "4.0.1"
    raise "wrong oracle revision" unless git(oracle, "rev-parse", "HEAD") == PIN
    raise "dirty oracle" unless git(oracle, "status", "--porcelain").empty?
    raise "wrong frozen lockfile" unless Digest::SHA256.file(File.join(oracle, "Gemfile.lock")).hexdigest == LOCK_SHA
    root = File.expand_path("../..", __dir__)
    raise "dirty generator source" unless git(root, "status", "--porcelain").empty?
    $LOAD_PATH.unshift(File.join(oracle, "lib"))
    require "plurimath"
    raise "wrong loaded oracle" unless File.realpath(Gem.loaded_specs.fetch("plurimath").full_gem_path) == File.realpath(oracle)
    Lutaml::Model::Config.xml_adapter_type = :ox
    rows = INPUTS.map do |input|
      row = { "input" => input }
      begin
        formula = Plurimath::Math.parse(input, :unitsml)
        row["model"] = CorpusGenerator.serialize_node(formula, "unitsml-input")
        row["outputs"] = FORMATS.to_h { |format| [format, capture { formula.public_send("to_#{format}") }] }
      rescue Plurimath::Math::ParseError => error
        row["error"] = error.class.name
      end
      row
    end
    raise "empty acceptance/refusal measurement" unless rows.any? { |r| r.key?("model") } && rows.any? { |r| r.key?("error") }
    payload = CorpusGenerator.dump_yaml({ "schema" => "plurimath-unitsml-input/1", "cases" => rows })
    provenance = {
      "oracle" => { "repository" => "https://github.com/plurimath/plurimath", "commit" => PIN, "dirty" => false, "lockSha256" => LOCK_SHA },
      "runtime" => { "ruby" => RUBY_VERSION, "engine" => RUBY_ENGINE, "xmlAdapter" => "ox" },
      "dependencies" => Gem.loaded_specs.sort.to_h { |name, spec| [name, spec.version.to_s] },
      "generator" => { "commit" => git(root, "rev-parse", "HEAD"), "dirty" => false,
                       "inputs" => SOURCES.to_h { |path| [path, Digest::SHA256.file(File.join(root, path)).hexdigest] } },
      "payloadSha256" => Digest::SHA256.hexdigest(payload),
    }
    [payload, CorpusGenerator.dump_yaml(provenance)]
  end

  def run
    options = {}
    OptionParser.new do |parser|
      parser.on("--oracle PATH") { |v| options[:oracle] = File.realpath(v) }
      parser.on("--out PATH") { |v| options[:out] = v }
      parser.on("--check") { options[:check] = true }
    end.parse!
    raise "--oracle and --out are required" unless options[:oracle] && options[:out]
    payload, provenance = generate(options.fetch(:oracle))
    path = options.fetch(:out)
    if options[:check]
      raise "UnitsML input bytes differ from Ruby" unless File.binread(path) == payload
    else
      FileUtils.mkdir_p(File.dirname(path))
      File.binwrite(path, payload)
      File.binwrite(path.sub(/\.yaml\z/, ".provenance.yaml"), provenance)
    end
    puts "UnitsML input reference: #{INPUTS.length} cases, #{FORMATS.length} writers; exit 0"
  end
end

UnitsmlInputReference.run if $PROGRAM_NAME == __FILE__
