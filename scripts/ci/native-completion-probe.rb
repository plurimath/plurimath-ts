# frozen_string_literal: true
require_relative "../generate-unitsml-data"

options = { phase: "all" }
OptionParser.new do |p|
  p.on("--phase PHASE", %w[small tables all]) { |v| options[:phase] = v }
  p.on("--oracle PATH") { |v| options[:oracle] = v }
  p.on("--out PATH") { |v| options[:out] = v }
end.parse!
abort "--oracle and --out required" unless options.keys.sort == %i[oracle out phase]
oracle = File.realpath(options[:oracle])
out = File.expand_path(options[:out])
FileUtils.mkdir_p(out)
report = { "verified" => false, "oracle" => NativeCompletionReference::PIN,
  "lockSha256" => NativeCompletionReference::LOCK_SHA, "stages" => [] }
save = -> { File.write(File.join(out, "report.json"), JSON.pretty_generate(report) + "\n") }
if options[:phase] == "tables"
  report = JSON.parse(File.read(File.join(out, "report.json")))
  abort "missing completed small probe" unless report.fetch("stages").any? { |s| s["name"] == "small-probe" && s["exit"] == 0 } && report["oracle"] == NativeCompletionReference::PIN && report["lockSha256"] == NativeCompletionReference::LOCK_SHA && !report.key?("error")
else
  save.call
end
begin
  report["ruby"] = RUBY_DESCRIPTION
  report["source"] = NativeCompletionReference.git(File.expand_path("../..", __dir__), "rev-parse", "HEAD")
  report["generators"] = [__FILE__, File.expand_path("../generate-unitsml-data.rb", __dir__)].to_h do |path|
    [File.basename(path), Digest::SHA256.file(path).hexdigest]
  end
  save.call
  NativeCompletionReference.load_oracle!(oracle)
  report["versions"] = %w[plurimath unitsml unitsdb bundler].to_h { |name| [name, Gem.loaded_specs.fetch(name).version.to_s] }
  save.call
  unless options[:phase] == "tables"
  units = %w[kg m s k- da- m*s m/s m**2 m^2 m^-2 m^(1/2) sqrt(m) sqrt(m/s) 1 1/m (m/s)^2 zzz kzzz m+ s/]
  variants = [{}, { multiplier: :space }, { multiplier: :nospace }, { multiplier: "space" }, { multiplier: "nospace" }, { multiplier: "⋅" }, { multiplier: "×" }, { explicit_parenthesis: true },
    { explicit_parenthesis: false }, { xml: true }, { name: true }, { symbol: true }, { quantity: true }]
  unit_rows = units.map { |input| NativeCompletionReference.measured(input) }
  unit_rows.concat(%w[kg m*s m/s sqrt(m)].product(variants).map { |input, opts| NativeCompletionReference.measured(input, opts) })
  inline_options = [{}, { xml: true }, { explicit_parenthesis: false }, { multiplier: :space }]
  inline_rows = %w[kg m/s sqrt(m) k-].product(inline_options).map do |input, opts|
    actual = %Q("unitsml(#{input})")
    row = { "input" => input, "parseInput" => actual, "parseFormat" => "asciimath",
      "options" => opts, "optionsTypes" => opts.to_h { |key, value| [key.to_s, value.is_a?(Symbol) ? "symbol" : value.class.name.downcase] } }
    begin
      formula = Plurimath::Math.parse(actual, :asciimath)
      begin
        row["rawModel"] = CorpusGenerator.serialize_node(formula, "inline-unitsml")
      rescue StandardError => e
        row["rawModelError"] = { "class" => e.class.name, "message" => e.message }
      end
      row["renders"] = %w[asciimath latex mathml html omml unicodemath].to_h do |format|
        result = begin
          { "value" => formula.public_send("to_#{format}", unitsml: opts) }
        rescue StandardError => e
          { "raises" => e.class.name, "message" => e.message }
        end
        [format, result]
      end
      row["displayRenders"] = %w[asciimath latex mathml omml unicodemath].to_h do |format|
        result = begin
          { "value" => formula.to_display(format, unitsml: opts) }
        rescue StandardError => e
          { "raises" => e.class.name, "message" => e.message }
        end
        [format, result]
      end
    rescue StandardError => e
      row["raises"] = e.class.name
      row["message"] = e.message
    end
    row
  end
  File.write(File.join(out, "unitsml-probe.json"), JSON.pretty_generate({ "schema" => "plurimath-unitsml-probe/1", "cases" => unit_rows,
    "plurimathInlineCases" => inline_rows }) + "\n")
  ns = [0, 1, 22, 23, 24, 100, 1000, 3181, 3182, 9007199254740992, 9007199254740993, 999999999999999999999999999999999999]
  inputs = ns.flat_map { |n| ["├#{n}(a┤#{n})", "├#{n}(a b c┤#{n})"] }
  inputs.concat(["├23(a┤1)", "±+a", "∫∫f g", "x^−a²^b", "∛x", "∜x", "\\cbrt x", "\\qdrt x", "√(a&b c)", "⒭ab▒c", "̲a", "̰a"])
  rows = inputs.map do |input|
    row = { "input" => input }
    begin
      formula = Plurimath::Math.parse(input, :unicode)
      row["model"] = CorpusGenerator.serialize_node(formula, "unicode")
      %w[asciimath latex mathml html omml unicodemath].each do |format|
        begin
          row[format] = formula.public_send("to_#{format}")
        rescue StandardError => e
          row["#{format}Error"] = { "class" => e.class.name, "message" => e.message }
        end
      end
    rescue StandardError => e
      row["raises"] = e.class.name
      row["message"] = e.message
    end
    row
  end
  sizes = []
  n = 0
  loop do
    value = 1.25**n
    break unless value.finite?
    sizes << [n, value.to_s]
    n += 1
  end
  File.write(File.join(out, "unicode-probe.json"), JSON.pretty_generate({ "schema" => "plurimath-unicode-probe/1", "cases" => rows, "fenceSizes" => sizes, "parenMaskSizes" => sizes.map { |_, value| "#{value}em" }, "parenMaskOverflow" => "#{(1.25**n).to_s}em", "parenMaskCutoff" => n }) + "\n")
  raise "empty successful measurements" unless unit_rows.any? { |row| row.key?("model") } && rows.any? { |row| row.key?("model") }
  raw = { "input" => "kg", "routes" => {} }
  { "mathParse" => -> { Plurimath::Math.parse("kg", :unitsml) },
    "directConstructor" => -> { Plurimath::Unitsml.new("kg").to_formula } }.each do |route, build|
    record = {}
    begin
      node = build.call
      record["class"] = node.class.name
      record["variables"] = node.variables.map(&:to_s)
      record["respondsToInputStringSetter"] = node.respond_to?(:input_string=)
      begin
        record["serialized"] = CorpusGenerator.serialize_node(node, "unitsml-raw")
      rescue StandardError => e
        record["serializationError"] = { "class" => e.class.name, "message" => e.message }
      end
      record["fields"] = node.variables.to_h do |key|
        value = node.get(key)
        [key.to_s, { "class" => value.class.name, "inspect" => value.inspect }]
      end
      begin
        node.input_string = "kg"
      rescue StandardError => e
        record["inputStringSetterError"] = { "class" => e.class.name, "message" => e.message }
      end
    rescue StandardError => e
      record["raises"] = e.class.name
      record["message"] = e.message
    end
    raw["routes"][route] = record
  end
  File.write(File.join(out, "unitsml-raw-model.json"), JSON.pretty_generate(raw) + "\n")
  report["stages"] << { "name" => "small-probe", "exit" => 0, "unitCases" => unit_rows.length, "unicodeCases" => rows.length }
  report["ruby"] = RUBY_DESCRIPTION
  report["source"] = NativeCompletionReference.git(File.expand_path("../..", __dir__), "rev-parse", "HEAD")
  report["versions"] = %w[plurimath unitsml unitsdb bundler].to_h { |name| [name, Gem.loaded_specs.fetch(name).version.to_s] }
  save.call
  exit 0 if options[:phase] == "small"
  end
  NativeCompletionReference.export(oracle, out)
  report["stages"] << { "name" => "unitsml-tables", "exit" => 0 }
  report["payloads"] = Dir.glob(File.join(out, "**", "*.json")).reject { |path| path.end_with?("/report.json") }.sort.to_h { |path| [path.delete_prefix("#{out}/"), Digest::SHA256.file(path).hexdigest] }
  report["measured"] = true
  report["verified"] = false
  save.call
rescue StandardError => e
  report["error"] = { "class" => e.class.name, "message" => e.message }
  report["stages"] << { "name" => "failure", "exit" => 1 }
  save.call
  warn e.full_message
  exit 1
end
