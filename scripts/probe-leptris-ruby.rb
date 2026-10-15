# frozen_string_literal: true

# Opt-in runner-only verification. Uses the real Ruby FFI binding and Moxml
# adapter; this does not claim coverage of other Ruby downstream suites.
require "digest"
require "json"
require "leptris"

spec_only = ARGV.delete("--spec-only")
abort "unknown arguments: #{ARGV.inspect}" unless ARGV.empty?

def assert(condition, message)
  raise message unless condition
end

library = File.realpath(ENV.fetch("LEPTRIS_LIB_PATH"))
libraries = Leptris::XML::FFI.ffi_libraries.map(&:name)
assert(libraries.any? { |name| File.file?(name) && File.realpath(name) == library },
       "expected shared library not loaded: #{libraries.inspect}")
assert(ENV.fetch("LEPTRIS_NO_NATIVE") == "1", "FFI-only mode required")
assert(!defined?(Leptris::XML::NATIVE_FAST), "native acceleration unexpectedly active")
assert($LOADED_FEATURES.none? { |name| name.include?("leptris_native") || name.end_with?("/native_layer.rb") },
       "native acceleration unexpectedly loaded")
assert(Leptris::VERSION == "1.9.355.0", "unexpected Ruby binding version")
assert(Leptris::XML::Document.respond_to?(:create), "programmatic document API missing")
puts JSON.generate(mode: spec_only ? "spec-only" : "targeted-and-spec",
                   ruby: RUBY_DESCRIPTION, binding: Leptris::VERSION,
                   engine: Leptris::XML::FFI.leptris_version,
                   library: library, sha256: Digest::SHA256.file(library).hexdigest,
                   ffi_libraries: libraries)

unless spec_only
  40.times do |iteration|
    count = (iteration % 20) + 1
    xml = '<r xmlns="urn:r">' + ('<a>text</a>' * count) + '</r>'
    doc = Leptris::XML::Document.parse(xml)
    begin
      5.times do
        assert(doc.xpath("namespace-uri(/*/*)") == "urn:r", "FFI inherited namespace XPath failed")
        output = doc.to_xml
        assert(output.scan('xmlns="urn:r"').size == 1, "inherited declaration changed at iteration #{iteration}")
        reparsed = Leptris::XML::Document.parse(output)
        begin
          assert(reparsed.xpath("namespace-uri(/*/*)") == "urn:r", "FFI reparse lost namespace")
          assert(reparsed.xpath("count(/*/*)") == count.to_f, "FFI reparse lost children")
        ensure
          reparsed.free
        end
      end
    ensure
      doc.free
    end
  end
  puts "Ruby FFI: 40 document loads, 200 inherited namespace XPath/serialization/reparse checks passed"

  require "moxml"
  require "moxml/adapter/leptris"
  ctx = Moxml.new(:leptris)
  assert(ctx.config.adapter == Moxml::Adapter::Leptris, "Moxml adapter selection failed")
  40.times do |iteration|
    count = (iteration % 20) + 1
    doc = ctx.parse('<r xmlns="urn:r">' + ('<a>text</a>' * count) + '</r>')
    5.times do
      assert(doc.xpath("namespace-uri(/*/*)") == "urn:r", "Moxml inherited namespace XPath failed")
      output = doc.to_xml
      assert(output.scan('xmlns="urn:r"').size == 1, "Moxml inherited declaration changed")
      copy = ctx.parse(output)
      assert(copy.xpath("count(/*/*)") == count.to_f, "Moxml inherited namespace roundtrip lost children")
      assert(copy.root.children.select(&:element?).all? { |child| child.namespace_uri == "urn:r" },
             "Moxml inherited namespace roundtrip lost namespace")
    end
  end
  puts "Moxml: 40 document loads, 200 inherited namespace XPath/serialization/reparse checks passed"
  xml = '<root xmlns:p="urn:probe"><group><p:item p:kind="v">alpha</p:item></group></root>'
  20.times do
    doc = ctx.parse(xml)
    item = doc.at_xpath("//p:item", "p" => "urn:probe")
    assert(item.name == "item" && item.text == "alpha", "Moxml tree/text failed")
    assert(item["p:kind"] == "v" && item.namespace_uri == "urn:probe", "Moxml attribute/namespace failed")
    item["id"] = "changed"
    5.times do
      assert(doc.xpath("namespace-uri(//p:item)", "p" => "urn:probe") == "urn:probe", "Moxml namespace XPath failed")
      copy = ctx.parse(doc.to_xml)
      assert(copy.at_xpath("//p:item", "p" => "urn:probe")["id"] == "changed", "Moxml mutation roundtrip failed")
    end
  end
  puts "Moxml: 20 document loads, 100 namespace XPath/mutation/serialization checks passed"
end

require "rspec/core"
moxml = File.realpath(ENV.fetch("MOXML_SOURCE"))
report = File.join(ENV.fetch("LEPTRIS_RUBY_EVIDENCE"), "moxml-rspec.json")
result = Dir.chdir(moxml) do
  RSpec::Core::Runner.run(["--require", "spec_helper", "--format", "progress",
                         "--format", "json", "--out", report,
                         "--seed", "29787",
                         "spec/moxml/adapter/leptris_spec.rb"])
end
summary = JSON.parse(File.read(report))
puts JSON.generate(moxml_rspec: summary.fetch("summary"),
                   failed: summary.fetch("examples").select { |example| example["status"] == "failed" },
                   pending: summary.fetch("examples").select { |example| example["status"] == "pending" })
assert(summary.fetch("summary").fetch("example_count").positive?, "Moxml ran zero examples")
assert(summary.fetch("examples").any? { |example| example["status"] == "passed" }, "Moxml passed zero examples")
puts JSON.generate(gems: Gem.loaded_specs.transform_values(&:version).transform_values(&:to_s))
exit result
