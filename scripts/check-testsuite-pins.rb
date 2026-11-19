# frozen_string_literal: true

# Validate the testsuite once, then check every pin against it, and check that
# a pin with a wrong commit, digest or generation is rejected.
#
# usage: ruby scripts/check-testsuite-pins.rb TESTSUITE PINS OUT
#
# validate-stages.rb takes one --pin per run and validates the whole testsuite
# on every run (about a minute at 9767c37), so 34 CLI runs no longer fit the
# job. This loads the same validator, runs it once as the CLI does with the
# first pin, then runs the validator's own pin check (Runner#check_pin) for each
# other pin. The tampered copies are kept in OUT.

require "fileutils"
require "stringio"
require "yaml"

testsuite, pins, out = ARGV
abort "usage: ruby #{$PROGRAM_NAME} TESTSUITE PINS OUT" unless out

load File.join(testsuite, "scripts", "validate-stages.rb")

committed = Dir.glob(File.join(pins, "*.yml")).sort
abort "no pins under #{pins}" if committed.empty?

FileUtils.mkdir_p(out)
tampered = committed.flat_map do |path|
  pin = YAML.safe_load_file(path)
  language = File.basename(path, ".yml")
  wrong = {
    "commit" => ["commit", "0" * 40],
    "digest" => ["snapshot_digest", "sha256:#{'0' * 64}"],
    "generation-99" => ["generation", 99],
  }
  wrong["generation-previous"] = ["generation", pin["generation"] - 1] if pin["generation"] > 1
  wrong.map do |name, (key, value)|
    copy = File.join(out, "#{language}-#{name}.yml")
    File.write(copy, YAML.dump(pin.merge(key => value)))
    copy
  end
end

runner = Testsuite::Stages::Runner.new(
  root: testsuite, schema_dir: File.join(testsuite, "schema"), pin: committed.first,
)
failed = runner.run != 0

# One pin through the validator's own check; returns [accepted, output].
check = lambda do |path|
  before = runner.instance_variable_get(:@failures)
  runner.instance_variable_set(:@pin, path)
  captured = StringIO.new
  stdout = $stdout
  $stdout = captured
  begin
    runner.send(:check_pin)
  ensure
    $stdout = stdout
  end
  [runner.instance_variable_get(:@failures) == before, captured.string]
end

committed.drop(1).each do |path|
  accepted, output = check.call(path)
  print output
  next if accepted

  puts "FAIL: the validator rejected #{path}"
  failed = true
end

tampered.each do |path|
  accepted, output = check.call(path)
  if accepted
    puts "FAIL: the validator accepted #{path}"
    failed = true
  elsif output.include?("FAIL  #{path}")
    print output
    puts "ok: #{File.basename(path, '.yml')} rejected"
  else
    # The failure must be the pin's, not some other file's.
    print output
    puts "FAIL: #{path} was not the reason the validator failed"
    failed = true
  end
end

puts "#{committed.length} pins valid, #{tampered.length} wrong pins rejected" unless failed
exit(failed ? 1 : 0)
