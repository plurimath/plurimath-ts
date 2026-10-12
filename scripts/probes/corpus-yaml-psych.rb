# frozen_string_literal: true

# Corpus YAML probe — the Ruby half of `test/core/corpus-yaml.spec.ts`'s
# "the OMML payloads, as Psych reads them".
#
# Loads every OMML payload of the pinned corpus with Psych and records a
# SHA-256 of each loaded document, plus Psych's answer for a handful of block
# scalar headers. The spec reads the same payloads with `parseYaml` and must
# reach the same digests and the same answers. Nothing here consults the port.
#
#   ruby scripts/probes/corpus-yaml-psych.rb > test/core/corpus-yaml-psych.json
#
# The payloads are read with `git show <pin-head>:<path>` after the submodule's
# head is required to equal the gitlink this repository has committed, as
# `corpus-equality.rb` does, so the digests are of the pinned bytes.
#
# The digest covers a canonical encoding both languages produce exactly
# (see `canonical` below and `canonicalYaml` in the spec): a JSON round trip
# would bring in two JSON encoders' escaping rules as a second thing to agree.

require "digest"
require "json"
require "open3"
require "yaml"

# Not `generate-corpus.rb`'s helpers: that file loads the gem, and this probe
# needs only Psych.
REPO_ROOT = File.expand_path("../..", __dir__)
pin_relative = "submodules/plurimath-testsuite"
pin_root = File.join(REPO_ROOT, pin_relative)

def git(directory, *args)
  output, status = Open3.capture2("git", "-C", directory, *args, binmode: true)
  abort "REFUSING: git #{args.join(' ')} failed in #{directory}" unless status.success?
  output.force_encoding(Encoding::UTF_8)
end

gitlink = git(REPO_ROOT, "ls-tree", "HEAD", pin_relative)
index_commit = gitlink.split(/\s+/)[2]
abort "REFUSING: #{pin_relative} is not a committed gitlink" unless gitlink.start_with?("160000 ")
pin_head = git(pin_root, "rev-parse", "HEAD").strip
unless pin_head == index_commit
  abort "REFUSING: #{pin_relative} is at #{pin_head}, but #{index_commit} is committed for it"
end

# Tags each value with its type and length, so no two documents share an
# encoding: n, t, f, i<digits>; s<byte length>:<UTF-8 bytes>, a<count>: items,
# m<count>: key/value pairs in document order. Floats are refused, not encoded:
# none occurs, and two float printers would be another thing to agree.
def canonical(value)
  case value
  when nil then "n"
  when true then "t"
  when false then "f"
  when Integer then "i#{value};"
  when String
    bytes = value.encode("UTF-8")
    "s#{bytes.bytesize}:#{bytes}"
  when Array then "a#{value.length}:" + value.map { |item| canonical(item) }.join
  when Hash
    "m#{value.length}:" + value.map { |key, item| canonical(key) + canonical(item) }.join
  else abort "REFUSING: no canonical encoding for #{value.class}"
  end
end

def load(text)
  YAML.safe_load(text, aliases: false)
end

files = git(pin_root, "ls-tree", "-r", "--name-only", pin_head, "corpus/omml")
                       .split("\n").select { |path| path.end_with?(".yaml") }.sort
abort "REFUSING: no OMML payloads in the pin" if files.empty?
digests = files.to_h do |path|
  document = load(git(pin_root, "show", "#{pin_head}:#{path}"))
  [path.delete_prefix("corpus/"), Digest::SHA256.hexdigest(canonical(document).b)]
end

# Each snippet is a one-key document; `value` is what Psych loads for `a`, or
# `error` is true when Psych raises.
SNIPPETS = [
  "a: |2\n\n    x\n",
  "a: |2\n  x\n    y\n",
  "a: |2-\n\n    x\n",
  "a: |-2\n    x\n",
  "a: |1\n  x\n",
  "a: |2\n\n\n    x\n\n",
  "- id: k\n  a: |2\n\n    <m>\n      <n/>\n    </m>\n  b: c\n",
  "a: |4\n  x\n",
  "a: x\u00a0\n",
  "a: \u00a0x\n",
].freeze

snippets = SNIPPETS.map do |yaml|
  { "yaml" => yaml, "value" => load(yaml) }
rescue Psych::SyntaxError
  { "yaml" => yaml, "error" => true }
end

puts JSON.pretty_generate(
  "generator" => "scripts/probes/corpus-yaml-psych.rb",
  "ruby" => RUBY_VERSION,
  "psych" => Psych::VERSION,
  "pin" => pin_head,
  "payloads" => digests,
  "snippets" => snippets,
)
