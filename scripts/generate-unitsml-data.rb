# frozen_string_literal: true
# Targeted reference export; execute only under the pinned oracle bundle.
require "json"
require "yaml"
require "digest"
require "fileutils"
require "open3"
require "optparse"

module NativeCompletionReference
  PIN = "00c52783877b38f6b8e6e109f1803f96bb34fc62"
  LOCK_SHA = "03bdd3de3d9bcd911e87a7d37605f2e8ee5d003a511881779a82490425f18121"
  module_function

  def git(root, *args)
    out, err, status = Open3.capture3("git", *args, chdir: root)
    raise "git failed: #{err}" unless status.success?
    out.strip
  end

  def load_oracle!(oracle)
    raise "requires Ruby 4.0.1" unless RUBY_VERSION == "4.0.1"
    raise "wrong oracle pin" unless git(oracle, "rev-parse", "HEAD") == PIN
    raise "dirty oracle" unless git(oracle, "status", "--porcelain").empty?
    raise "wrong frozen lock" unless Digest::SHA256.file(File.join(oracle, "Gemfile.lock")).hexdigest == LOCK_SHA
    $LOAD_PATH.unshift(File.join(oracle, "lib"))
    require "plurimath"
    require "unitsml"
    require "unitsdb"
    require_relative "generate-corpus"
    raise "wrong loaded oracle" unless Gem.loaded_specs.fetch("plurimath").full_gem_path == File.realpath(oracle)
    raise "wrong dependency versions" unless Gem.loaded_specs.fetch("unitsml").version.to_s == "0.6.8" && Gem.loaded_specs.fetch("unitsdb").version.to_s == "2.2.4"
  end

  def measured(input, options = {})
    formula = Unitsml.parse(input)
    types = options.to_h { |key, value| [key.to_s, value.is_a?(Symbol) ? "symbol" : value.class.name.downcase] }
    record = { "input" => input, "options" => options, "optionsTypes" => types }
    { "mathml" => :to_mathml, "ascii" => :to_asciimath, "xml" => :to_xml }.each do |key, method|
      begin
        record[key] = formula.public_send(method, options)
      rescue StandardError => e
        record["#{key}Error"] = { "class" => e.class.name, "message" => e.message }
      end
    end
    begin
      record["model"] = CorpusGenerator.serialize_node(formula.to_plurimath(options), "unitsml")
    rescue StandardError => e
      record["modelError"] = { "class" => e.class.name, "message" => e.message }
    end
    record
  rescue StandardError => e
    { "input" => input, "options" => options, "optionsTypes" => options.to_h { |key, value| [key.to_s, value.is_a?(Symbol) ? "symbol" : value.class.name.downcase] }, "raises" => e.class.name, "message" => e.message }
  end

  def token_order(array)
    array.flatten.compact.sort_by(&:length).reverse
  end

  def export(oracle, out)
    load_oracle!(oracle)
    tokens = { "units" => token_order(Unitsml::Unitsdb.units.filtered),
      "singlePrefixes" => token_order(Unitsml::Unitsdb.prefixes_by_size(1)),
      "doublePrefixes" => token_order(Unitsml::Unitsdb.prefixes_by_size(2)),
      "dimensions" => token_order(Unitsml::Unitsdb.dimensions.parsables.keys) }
    raise "empty token family" if tokens.values.any?(&:empty?)
    data = { "schema" => "plurimath-unitsml-data/1", "tokens" => tokens }
    { "units" => tokens["units"], "prefixes" => tokens["singlePrefixes"] + tokens["doublePrefixes"],
      "dimensions" => tokens["dimensions"] }.each do |family, names|
      data[family] = names.uniq.to_h do |name|
        input = family == "prefixes" ? "#{name}-" : name
        [name, measured(input)]
      end
      puts "#{family}: #{data[family].length} measured tokens"
    end
    pairs = (tokens["singlePrefixes"] + tokens["doublePrefixes"]).uniq.product(%w[m s g kg A K mol cd])
    data["prefixedUnits"] = pairs.to_h { |prefix, unit| ["#{prefix}\u0000#{unit}", measured("#{prefix}#{unit}")] }
    data["special"] = %w[1 1/m m^-1 m^(-1/2) sqrt(m)/s].to_h { |input| [input, measured(input)] }
    data["utility"] = { "u2d" => Unitsml::Utility::U2D, "dim2d" => Unitsml::Utility::DIM2D,
      "dimsVector" => Unitsml::Utility::DIMS_VECTOR, "prefixSymbolMethods" => Unitsml::Utility::PREFIX_SYMBOL_METHODS }
    data["dimensionVectors"] = Unitsml::Unitsdb.dimensions.dimensions.map { |dim| { "id" => dim.id, "vector" => dim.set_vector } }
    data["namespace"] = { "uri" => Unitsml::Namespace.uri, "prefix" => Unitsml::Namespace.prefix_default }
    data["resolvedTokens"] = {}
    symbols = Unitsml::Unitsdb.units.units.flat_map { |unit| unit.symbols || [] }
    text_values = symbols.filter_map do |symbol|
      xml = symbol.mathml
      next unless xml
      Plurimath::Utility.html_entity_to_unicode(xml.gsub(/<[^>]*>/, ""))
    end
    # Resolve each visible prefix+unit token directly, avoiding full parser work.
    prefixes = Unitsml::Unitsdb.prefixes.prefixes.flat_map { |prefix| prefix.symbols || [] }.filter_map(&:unicode)
    resolver_keys = Plurimath::Utility.all_symbols_classes(:mathml).keys.map(&:to_s) +
      Plurimath::Mathml::Constants::UNICODE_SYMBOLS.keys.map(&:to_s) +
      Plurimath::Mathml::Constants::NAMED_FUNCTION_WORDS
    resolver_keys += resolver_keys.map { |text| Plurimath::Utility.html_entity_to_unicode(text) }
    (text_values + prefixes.product(text_values).map { |prefix, text| "#{prefix}#{text}" } +
      resolver_keys + ["−", "-", "·", "⋅", "⁢", "/", "*", "×", "+", " "]).uniq.each do |text|
      begin
        node = Plurimath::Mathml::Utility.resolve_token(text)
        data["resolvedTokens"][text] = CorpusGenerator.serialize_node(node, "resolved-token")
      rescue StandardError => e
        data["resolvedTokens"][text] = { "raises" => e.class.name, "message" => e.message }
      end
    end
    data["prefixedUnitsCoverage"] = { "complete" => false, "selectedUnits" => %w[m s g kg A K mol cd] }
    metadata = Dir.glob(File.join(Unitsdb.data_dir, "**", "*.{yaml,yml}")).sort.to_h do |path|
      [path.delete_prefix("#{Unitsdb.data_dir}/"), YAML.safe_load(File.read(path), permitted_classes: [Symbol], aliases: true)]
    end
    raise "empty Unitsdb metadata" if metadata.empty?
    data["database"] = metadata
    FileUtils.mkdir_p(File.join(out, "src/unitsml/generated"))
    File.write(File.join(out, "src/unitsml/generated/data.json"), JSON.pretty_generate(data) + "\n")
    data
  end
end

if $PROGRAM_NAME == __FILE__
  options = {}
  OptionParser.new do |p|
    p.on("--oracle PATH") { |v| options[:oracle] = v }
    p.on("--out PATH") { |v| options[:out] = v }
  end.parse!
  abort "--oracle and --out required" unless options.keys.sort == %i[oracle out]
  NativeCompletionReference.export(File.realpath(options[:oracle]), File.expand_path(options[:out]))
end
