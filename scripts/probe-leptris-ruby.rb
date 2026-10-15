# frozen_string_literal: true

# Opt-in runner-only verification against pinned Ruby and Moxml sources.
require "digest"
require "json"
require "fileutils"

ruby_specs = ARGV.delete("--ruby-specs")
baseline = if (index = ARGV.index("--html-baseline"))
             ARGV.delete_at(index)
             File.realpath(ARGV.delete_at(index) || abort("--html-baseline requires a source path"))
           end
abort "unknown arguments: #{ARGV.inspect}" unless ARGV.empty?
abort "choose only one suite mode" if ruby_specs && baseline
source = File.realpath(ENV.fetch("LEPTRIS_RUBY_SOURCE"))
effective_source = baseline || source
# bundle exec has already activated the exact same dependency set. Override only
# the Ruby source for the red proof; the new specs still come from the fixed tree.
$LOAD_PATH.unshift(File.join(effective_source, "lib"))
require "leptris"

def assert(condition, message)
  raise message unless condition
end

library = File.realpath(ENV.fetch("LEPTRIS_LIB_PATH"))
libraries = Leptris::XML::FFI.ffi_libraries.map(&:name)
assert(libraries.any? { |name| File.file?(name) && File.realpath(name) == library },
       "expected shared library not loaded: #{libraries.inspect}")
assert($LOADED_FEATURES.include?(File.join(effective_source, "lib/leptris.rb")),
       "expected Ruby source was not loaded")
mode = ENV.fetch("LEPTRIS_EXPECT_NATIVE")
assert(%w[native ffi].include?(mode), "LEPTRIS_EXPECT_NATIVE must be native or ffi")
assert(Leptris::VERSION == "1.9.365.0", "unexpected Ruby binding version")
assert(Leptris::XML::Document.respond_to?(:create), "programmatic document API missing")
assert_mode = lambda do
  if mode == "native"
    assert(ENV["LEPTRIS_NO_NATIVE"] != "1", "native mode disabled by environment")
    assert(defined?(Leptris::XML::NATIVE_FAST) && Leptris::XML::NATIVE_FAST,
           "native acceleration did not activate; fallback is not coverage")
    minor = RUBY_VERSION[/\A\d+\.\d+/].tr(".", "_")
    native_path = File.realpath(File.join(effective_source, "lib/leptris/xml/native_#{minor}.so"))
    assert($LOADED_FEATURES.any? { |name| File.file?(name) && File.realpath(name) == native_path },
           "expected native extension was not loaded")
    # Fail directly if this exact engine cannot satisfy the acceleration API.
    Leptris::XML::NativeNode.resolve!(library)
    puts JSON.generate(native_extension: native_path, native_engine: library)
  else
    assert(ENV.fetch("LEPTRIS_NO_NATIVE") == "1", "FFI-only mode required")
    assert(!defined?(Leptris::XML::NATIVE_FAST), "native acceleration unexpectedly active")
    assert($LOADED_FEATURES.none? { |name| name.include?("leptris_native") ||
      name.end_with?("/native_layer.rb") || name.match?(%r{/native_\d+_\d+\.so\z}) },
      "native acceleration unexpectedly loaded")
  end
end
assert_mode.call
puts JSON.generate(mode: mode, suite: baseline ? "html-baseline" : ruby_specs ? "ruby" : "moxml",
                   ruby: RUBY_DESCRIPTION, binding: Leptris::VERSION, ruby_source: effective_source,
                   engine: Leptris::XML::FFI.leptris_version,
                   library: library, sha256: Digest::SHA256.file(library).hexdigest,
                   ffi_libraries: libraries)

unless ruby_specs || baseline
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
  puts "Ruby #{mode}: 40 document loads, 200 inherited namespace XPath/serialization/reparse checks passed"

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
if baseline || ruby_specs
  suite_root = source
  files = if baseline
            ["spec/xml/serialization_spec.rb"]
          else
            %w[spec/xml/serialization_spec.rb spec/xml/html_spec.rb spec/xml/html_facade_spec.rb] +
              (mode == "native" ? ["spec/xml/native_layer_spec.rb"] : [])
          end
else
  suite_root = File.realpath(ENV.fetch("MOXML_SOURCE"))
  files = ["spec/moxml/adapter/leptris_spec.rb"]
end
$LOAD_PATH.unshift(File.join(suite_root, "spec"))
evidence = ENV.fetch("LEPTRIS_RUBY_EVIDENCE")
FileUtils.mkdir_p(evidence)
report = File.join(evidence, "rspec.json")
options = ["--require", "spec_helper", "--format", "progress",
           "--format", "json", "--out", report, "--seed", "29787"]
options += ["--example", "Document#to_xml on HTML documents"] if baseline
result = Dir.chdir(suite_root) { RSpec::Core::Runner.run(options + files) }
summary = JSON.parse(File.read(report))
examples = summary.fetch("examples")
failed = examples.select { |example| example["status"] == "failed" }
puts JSON.generate(rspec: summary.fetch("summary"), failed: failed,
                   pending: examples.select { |example| example["status"] == "pending" })
assert_mode.call
assert(summary.fetch("summary").fetch("example_count").positive?, "RSpec ran zero examples")
if baseline
  assert(mode == "ffi", "baseline must use the FFI surface")
  assert(result != 0 && summary.fetch("summary").fetch("failure_count").positive?,
         "baseline did not demonstrate the HTML-to-XML defect")
  assert(summary.fetch("summary").fetch("errors_outside_of_examples_count").zero?, "baseline had a load/setup error")
  assert(summary.fetch("summary").fetch("pending_count").zero?, "baseline skipped new HTML assertions")
  assert(failed.size == summary.fetch("summary").fetch("failure_count"), "baseline failure report is incomplete")
  assert(failed.all? { |example| example.fetch("full_description").start_with?("Document#to_xml on HTML documents ") &&
    example.fetch("exception").fetch("class") == "RSpec::Expectations::ExpectationNotMetError" },
    "baseline failed outside the new HTML serialization assertions")
  puts "Red proof passed: unchanged Ruby source fails the new HTML-to-XML assertions"
else
  assert(examples.any? { |example| example["status"] == "passed" }, "RSpec passed zero examples")
end
puts JSON.generate(gems: Gem.loaded_specs.transform_values(&:version).transform_values(&:to_s))
exit(baseline ? 0 : result)
