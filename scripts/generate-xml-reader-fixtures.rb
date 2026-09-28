#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's XML READ results — the element tree the gem's XML stack
# hands to its MathML and OMML models, or the fact that it refused — for every
# input in the battery below.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-xml-reader-fixtures.rb --oracle /path/to/plurimath
#
# What "the gem's XML stack" is was measured, not read: with the pinned
# Gemfile.lock, `Plurimath::Math.parse(text, :mathml)` and `(text, :omml)` both
# reach `Moxml::Adapter::Ox.parse` and then `Ox.parse` exactly once (a
# TracePoint over Ox/Nokogiri/REXML/Oga load and parse calls sees nothing else),
# and `Lutaml::Model::Config.xml_adapter` is `Lutaml::Xml::Adapter::OxAdapter`.
# `Mml.parse` and `Omml.parse` both end in `from_xml`, which calls
# `OxAdapter.parse(xml)` and walks the wrapped root it returns. That wrapped
# root is what this script records, so every layer between the raw string and
# the models is included: Moxml's entity marking and restoring, Ox's parse,
# Moxml's root choice, and Lutaml's wrapper, which drops empty text and CDATA.
#
# Each row is one input and one outcome:
#   - `root`: the wrapped tree (see `dump` below for its shape).
#   - `raises`: the exception class. `Plurimath::Math.parse` funnels every
#     StandardError into `ParseError`, so every class here is a refusal; the
#     class is recorded to show which layer refused, not as a contract.
#
# The MathML-specific steps outside the reader are NOT applied here: the raw
# ` xmlns=` test before the first `>`, the namespace injection into `<math`,
# and `<mo>` trimming all happen in `Mml`, above this layer.
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "digest"
require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-xml-reader-fixtures.rb"

module XmlReaderProbe
  module_function

  # Hand-chosen inputs, grouped by the behaviour they probe.
  CASES = {
    "basic" => [
      "<a/>", "<a></a>", "<a>t</a>", "<a><b/></a>", "<a><b>x</b><c>y</c></a>",
      "<math><mi>x</mi><mo>+</mo><mn>1</mn></math>",
      "<a/ >", "<a  />", "<a></a >", "<a ></a>", "< a/>", "<a\n/>", "<a\t>x</a\t>",
      "<a.b-c_d/>", "<1a/>", "<\u03B1>x</\u03B1>", "<a:b:c/>", "<a/>\n", "\n <a/>",
    ],
    "mixed-content" => [
      "<a>x<b>y</b>z</a>", "<a>x <b/> y</a>", "<a><b/>tail</a>", "<a>head<b/></a>",
      "<a> <b/> </a>", "<a>\n  <b/>\n</a>", "<a> x</a>", "<a>x </a>", "<a><b/> x </a>",
      "<a><b/>\n x \n</a>", "<a>x<!--c-->y</a>", "<a>x<![CDATA[y]]>z</a>",
      "<a>x<?p d?>y</a>",
    ],
    "whitespace" => [
      "<a> </a>", "<a>  </a>", "<a>\n</a>", "<a>\t</a>", "<a>\r\n</a>", "<a> <!--c--> </a>",
      "<a><!--c-->  </a>", "<a><b/>  </a>", "<a>  <b/></a>", "<a><![CDATA[ ]]></a>",
      "<a> <![CDATA[x]]> </a>", "<a>\f</a>", "<a>\u00A0</a>", "<a>\u2003</a>",
      "<mi> x </mi>", "<mo> + </mo>", "<a> <b> </b> </a>",
    ],
    "attributes" => [
      "<a x=\"1\"/>", "<a x='1'/>", "<a x=\"'\"/>", "<a x='\"'/>", "<a x=\"1\" y='2'/>",
      "<a x=\"1\"y=\"2\"/>", "<a x = \"1\"/>", "<a x=\n\"1\"/>", "<a x=\"\"/>",
      "<a x=1/>", "<a x=1>t</a>", "<a x=ab c=\"d\"/>", "<a x=ab/ >", "<a x/>", "<a x>t</a>",
      "<a x=\"1\" x=\"2\"/>", "<r><a x=\"&#xZZ;\"/></r>", "<r><a x=\"&#xZZ;\">t</a></r>",
      "<r><a x=\"&#xZZ;\" y=\"1\"/>z</r>", "<r><a x=\"&1;\"/></r>", "<a x=\"\uFFFC\uFEFFalpha;\"/>", "<a x=\"1\" y=\"2\" x=\"3\"/>", "<a zeta=\"1\" alpha=\"2\"/>",
      "<a x=\"<>\"/>", "<a x=\"a\nb\"/>", "<a x=\"a\r\nb\"/>", "<a x=\"a\tb\"/>",
      "<a x=\"&amp;&lt;&gt;&quot;&apos;\"/>", "<a x=\"&AMP;\"/>", "<a x=\"&alpha;\"/>",
      "<a x=\"&#65;&#x42;&#X43;\"/>", "<a x=\"&#160;\"/>", "<a x=\"&#0;tail\"/>",
      "<a x=\"&#xD800;\"/>", "<a x=\"&#x110000;\"/>", "<a x=\"&#xZZ;\"/>", "<a x=\"&#;\"/>",
      "<a x=\"a&b\"/>", "<a x=\"a&b;\"/>", "<a x=\"a&;\"/>", "<a x=\"a& b;\"/>",
      "<a x=\"&1;\"/>", "<a x=\"&#65\"/>", "<a x=\"1\"><b/></a>", "<a x=\"1\"",
      "<a x=\"1/>", "<a x=\"1\" / >", "<a x=\"1\"/ >", "<a xmlnsfoo=\"1\" y=\"2\"/>",
      "<a m:x=\"1\"/>", "<a xmlns:m=\"u\" m:x=\"1\"/>", "<a x=\"\u00E9\"/>",
    ],
    "entities" => [
      "<a>&amp;&lt;&gt;&quot;&apos;</a>", "<a>&alpha;</a>", "<a>&nbsp;</a>", "<a>&AMP;</a>",
      "<a>&Amp;</a>", "<a>&#160;</a>", "<a>&#xA0;</a>", "<a>&#XA0;</a>", "<a>&#65;&#x42;</a>",
      "<a>&#x1F600;</a>", "<a>&#8;</a>", "<a>&#0;</a>", "<a>x&#0;y</a>", "<a>x&#0;</a><!--pad-->",
      "<a>&#xD800;</a>", "<a>&#xDFFF;</a>", "<a>&#xFFFE;</a>", "<a>&#x10FFFF;</a>",
      "<a>&#x110000;</a>", "<a>&#x7FFFFFFF;</a>", "<a>&#9999999999;</a>",
      "<a>&#99999999999999999999999;</a>", "<a>&#65</a>", "<a>&#65 </a>", "<a>&;</a>",
      "<a>&#;</a>", "<a>&#x;</a>", "<a>&#xZZ;</a>", "<a>&#1a;</a>", "<a>&1;</a>", "<a>&-a;</a>",
      "<a>a&b</a>", "<r><a>a&b</a>#{'<b/>' * 8}</r>", "<r><a>a & b</a>#{'<b/>' * 8}</r>",
      "<r><a>&#65</a>#{'<b/>' * 8}</r>", "<r><a>&#65 </a>#{'<b/>' * 8}</r>",
      "<a>&amp;#xFFFC;&amp;#xFEFF;x;</a>", "<a>&#x;&#65;</a>",
      "<a>& b</a>", "<a>&a.b:c-d_e;</a>", "<a>&\u03B1;</a>", "<a>&amp;alpha;</a>",
      "<a>&#38;alpha;</a>", "<a>&e;</a>", "<a>&#x26;</a>", "<a>&#60;b/&#62;</a>",
      "<a>\uFFFC\uFEFFalpha;</a>", "<a>&#xFFFC;&#xFEFF;alpha;</a>",
      "<a>&#{'x' * 40};</a>", "<a>&#{'x' * 29};</a>", "<a>&#{'x' * 30};</a>",
      "<a>&#{'x' * 31};</a>", "<a>&#x#{'0' * 30}41;</a>",
    ],
    "cdata" => [
      "<a><![CDATA[<x>&amp;]]></a>", "<a><![CDATA[]]></a>", "<a><![CDATA[a]]b]]></a>",
      "<a><![CDATA[x</a>", "<a><![cdata[x]]></a>", "<a><![CDATA[a\r\nb\rc]]></a>",
      "<a><![CDATA[ x ]]></a>", "<![CDATA[x]]><a/>", "<a><![CDATA[&alpha;]]></a>",
      "<a><![CDATA[\uFFFC\uFEFFalpha;]]></a>",
    ],
    "comments" => [
      "<a><!--c--></a>", "<a><!----></a>", "<a><!-- c --></a>", "<a><!--  x  --></a>",
      "<a><!-- a -- b --></a>", "<a><!-- x</a>", "<a><!-x--></a>", "<!--c--><a/>",
      "<a/><!--c-->", "<!--c--><a/><!--d-->", "<a><!--a\r\nb--></a>", "<a><!--\n--></a>",
      "<a><!---></a>-->", "<a><!--&alpha;--></a>", "<a><!--&amp;--></a>",
    ],
    "processing-instructions" => [
      "<a><?pi?></a>", "<a><?pi data?></a>", "<a><?pi  a b ?></a>",
      "<a><?pi x=\"1\"?></a>", "<a><?pi x=\"1\" y='2'?></a>", "<a><?pi x=1?></a>",
      "<?pi?><a/>", "<?xml-stylesheet href=\"s.css\"?><a/>", "<a/><?pi?>", "<a><?pi</a>",
      "<a><?pi x=\"1\" ?></a>", "<a><?pi &alpha;?></a>", "<a><?ox?></a>",
      "<a><?ox version=\"2.0\"?></a>", "<a><??></a>", "<a><?pi x=\"1\" junk?></a>",
      "<a><?pi\ndata?></a>",
    ],
    "declaration" => [
      "<?xml version=\"1.0\"?><a/>", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<a/>",
      "<?xml version='1.0' encoding='utf-8' standalone='yes'?><a/>", "<?xml?><a/>",
      " <?xml version=\"1.0\"?><a/>", "<a/><?xml version=\"1.0\"?>",
      "<!--c--><?xml version=\"1.0\"?><a/>", "<?xml version=\"1.0\"?><?xml version=\"1.0\"?><a/>",
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><a>\u00E9&#233;</a>",
      "<?xml version=\"1.0\" encoding=\"US-ASCII\"?><a>&#233;</a>",
      "<?xml version=\"1.0\" encoding=\"UTF-16\"?><a>&#233;</a>",
      "<?xml version=\"1.0\" encoding=\"bogus\"?><a>&#233;</a>",
      "<?xml version=\"2.0\"?><a/>", "<?XML version=\"1.0\"?><a/>",
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><a>&#195;&#169;</a>",
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><a>&#127;x\u00E9</a>",
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><a x=\"&#233;\"/>",
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><a>&#x3B1;</a>",
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><a><!--\u00E9--></a>",
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><\u00E9/>",
      "<?xml version=\"1.0\" encoding=\"UTF-16\"?><a/>",
      "<?xml version=\"1.0\" encoding=\"UTF-16\"?><a x=\"1\"/>",
      "<?xml encoding=\"ISO-8859-1\"?><a>&#233;</a>",
      "<?xml version=\"1.0\" ENCODING=\"ISO-8859-1\"?><a>&#233;</a>",
      "<?xml version=\"1.0\" encoding=ISO-8859-1?><a>&#233;</a>",
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\" encoding=\"UTF-8\"?><a>&#233;</a>",
      "<?xml version=\"1.0\" encoding=\"UTF-8\" encoding=\"ISO-8859-1\"?><a>&#233;</a>",
      "<?xml version=1.0?><a/>", "<?xml version=\"1.0\" junk?><a/>", "<?xml junk?><a>&#233;</a>",
      "<?xml version=\"1.0\"encoding=\"ISO-8859-1\"?><a>&#233;</a>",
      "<?xml-stylesheet encoding=\"ISO-8859-1\"?><a>&#233;</a>",
      "<?pi encoding=\"ISO-8859-1\"?><a>&#233;</a>", "<a><?xml encoding=\"ISO-8859-1\"?>&#233;</a>",
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?><a>&#233;</a>",
      "<?xml version=\"1.0\" encoding=\" UTF-8\"?><a>&#233;</a>",
      "<?xml version=\"1.0\" encoding=\"\"?><a>&#233;</a>",
    ],
    "doctype" => [
      "<!DOCTYPE math><math/>",
      "<!DOCTYPE math PUBLIC \"-//W3C//DTD MathML 2.0//EN\" \"http://www.w3.org/Math/DTD/mathml2/mathml2.dtd\"><math/>",
      "<!DOCTYPE a [<!ENTITY e \"x\">]><a>&e;</a>", "<!DOCTYPE a [<!ELEMENT a (#PCDATA)>]><a/>",
      "<!doctype a><a/>", "<!DOCTYPE a", "<a/><!DOCTYPE a>", "<!DOCTYPE a><!DOCTYPE b><a/>",
      "<!DOCTYPE a SYSTEM 'x>y'><a/>", "<!FOO><a/>", "<!", "<!-",
    ],
    "roots" => [
      "<a/><b/>", "<a>1</a><b>2</b>", "<a/>\n<b/>", "<a/><b/><c/>", "<!--c--><a/><b/>",
      "<?xml version=\"1.0\"?><a/><b/>", "<a/><!--c--><b/>", "<a/><?pi?><b/>",
      "<a/><!DOCTYPE a><b/>", "<a/><b/><!--c--><c/>", "<a/>text", "text<a/>", "<a/> text", "<a/>&amp;",
      "", " ", "\n", "<!--c-->", "<?xml version=\"1.0\"?>", "<!DOCTYPE a>", "abc", "<",
      "<>", "</a>", "<a/></a>", "<a></a></a>", "<a/>>",
    ],
    "malformed" => [
      "<a>", "<a><b></a>", "<a></b>", "<a><b></b>", "<a>x</b>", "<a><b>x</a>", "<a><b/></c>",
      "<a></A>", "<a>x", "<a x=\"1\">", "<a/", "<a/x>", "<a", "<a><", "<a></", "<a></a",
      "<a><b></c></a>", "<a><b><c></b></a>", "<a>x</a b>", "<a>x</a\n>", "<a>x</ab>",
      "<ab>x</a>", "<a>x</a >", "<a><b>x</b></a b>",
    ],
    "characters" => [
      "<a>></a>", "<a>]]></a>", "<a>a < b</a>", "<a>a <b</a>", "<a>\u0001\u0008\u000B\u001F</a>",
      "<a>x\u0000y</a>", "\u0000<a/>", "<a/>\u0000garbage", "<a>\u00E9\u03B1\u2211\u{1F600}</a>",
      "<a>\u2028\u2029</a>", "<a>\u007F\u0080\u009F</a>",
    ],
    "bom" => [
      "\uFEFF<a/>", "\uFEFF<?xml version=\"1.0\"?><a/>", "\uFEFF\uFEFF<a/>", "<a>\uFEFF</a>",
      "\uFEFF", " \uFEFF<a/>", "\uF000<a/>",
    ],
    "newlines" => [
      "<a>x\r\ny</a>", "<a>x\ry</a>", "<a>x\r\r\ny</a>", "<a>x\n\ry</a>", "<a>\r</a>",
      "<a>x\r</a>", "<a\r\nx=\"1\"\r\n/>", "<a>\r\n<b/>\r\n</a>", "<a>x&#13;y</a>",
      "<a>x&#13;&#10;y</a>", "<a x=\"&#13;\"/>",
    ],
    "namespaces" => [
      "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mi>x</mi></math>",
      "<m:math xmlns:m=\"http://www.w3.org/1998/Math/MathML\"><m:mi>x</m:mi></m:math>",
      "<m:a/>", "<m:a><m:b/></m:a>", "<a xmlns=\"u\"><b xmlns=\"v\"><c/></b></a>",
      "<a xmlns=\"u\"><b xmlns=\"\"/></a>", "<a xmlns:m=\"u\"><m:b xmlns:m=\"v\"/></a>",
      "<m:oMath xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\">" \
      "<m:r><m:t xml:space=\"preserve\"> x </m:t></m:r></m:oMath>",
      "<a xmlns=\"u\" xmlns:m=\"v\" m:x=\"1\" y=\"2\"/>", "<a xml:lang=\"en\"/>",
      "<a xmlns:m=\"u\"><b m:x=\"1\"/></a>", "<a xmlns:m=\"u\" x=\"1\" m:x=\"2\"/>",
      "<a m:x=\"1\" x=\"2\"/>", "<a x=\"1\" m:x=\"2\"/>", "<:a xmlns:=\"u\"/>",
      "<a:b:c xmlns:a=\"u\"/>", "<a xmlns:m=\"&#xD800;\"/>", "<a xmlns=\"&alpha;\"/>",
      "<a xmlns=\"&amp;&#65;\"><b/></a>", "<m:a xmlns:m=\"u\" xmlns:m=\"v\"/>",
      "<m:a xmlns:m=\"\"/>", "<a xmlns=\"u\" x=\"1\"/>",
      "<a xmlns:m=\"u\" m=\"u\"/>", "<a xmlns:m=\"u\" m=\"v\"/>", "<a xmlns:m=\"u\" p:m=\"u\"/>",
      "<a xmlns:m=\"&amp;\" m=\"&amp;\"/>", "<a xmlns:m=\"&alpha;\" m=\"&alpha;\"/>",
      "<b xmlns:m=\"u\"><a m=\"u\"/></b>", "<a p:xmlns=\"1\" q:xmlnsx=\"2\" y=\"3\"/>",
      "<a xmlns:=\"u\" p:=\"u\"/>", "<a p:=\"1\"/>", "<></>", "<:/>", "<::a/>", "<a::b xmlns:a=\"u\"/>",
      "<xmlns:a xmlns:xmlns=\"u\"/>", "<a xmlns=\"u\" xmlns=\"v\"/>", "<a xmlns:m=\"u\"><m:b><m:c/></m:b></a>", "<:a/>", "<a:/>", "<a xmlns:=\"u\"/>",
      "<math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><mi>x</mi></math>",
    ],
    # Ox refuses nesting deeper than 1000 below the root. Between roughly 700
    # and 1001 levels the gem's own Ruby recursion (Moxml's ancestor walk,
    # Lutaml's wrapper, the MathML translator) exhausts the VM stack first and
    # raises SystemStackError, which `Plurimath::Math.parse` does not rescue.
    # That band depends on the process's stack size, so it is not recorded:
    # only a depth every layer survives and one Ox itself refuses.
    "depth" => [
      ("<a>" * 500) + ("</a>" * 500), ("<a>" * 1002) + ("</a>" * 1002),
      ("<a>" * 1002) + "x" + ("</a>" * 1002),
    ],
    "long-text" => [
      "<a>#{'x' * 20_000}</a>", "<a>#{'&amp;' * 3000}</a>", "<a>#{'&#x1F600;' * 2000}</a>",
      "<a x=\"#{'y' * 20_000}\"/>", "<a><!--#{'c' * 20_000}--></a>",
    ],
  }.freeze

  # Seeded token soup: short strings built from XML-shaped pieces, so the
  # hand-chosen rows above are cross-checked by inputs nobody picked.
  FUZZ_SEED = 20_260_928
  FUZZ_COUNT = 2000
  FUZZ_TOKENS = [
    "<a>", "</a>", "<b>", "</b>", "<a/>", "<m:c>", "</m:c>", "<a x=\"1\">", "<a x='&lt;'>",
    "<b y=\"&alpha;\" y=\"2\">", " ", "  ", "\n", "\r\n", "\r", "\t", "x", "yz", "\u00E9", "\u{1F600}",
    "&amp;", "&lt;", "&alpha;", "&#65;", "&#x3B1;", "&#0;", "&#xD800;", "&#x110000;", "&", "&;",
    ";", "<!--c-->", "<!-- d -->", "<![CDATA[q]]>", "<![CDATA[]]>", "<?p d?>", "\"", "'", "=",
    ">", "<", "/", "]]>", "<!DOCTYPE a>", "<?xml version=\"1.0\"?>", "\uFEFF", "\u0000",
    "\uFFFC\uFEFFzeta;", "<a x=\"&#xZZ;\">", "<m:c xmlns:m=\"u\">", "<a p:x=\"1\" x=\"2\">",
    "<b xmlns=\"v\" y=\"&#0;z\">", "&#x3B1", "&#", "<?p x=\"1\"?>", "<?xml encoding=\"latin1\"?>",
    "&#233;", "<a/>", "</r>", "<r>", "<!---->", "<a x=1>",
  ].freeze

  def fuzz_inputs
    rng = Random.new(FUZZ_SEED)
    Array.new(FUZZ_COUNT) do |index|
      body = Array.new(rng.rand(1..8)) { FUZZ_TOKENS[rng.rand(FUZZ_TOKENS.length)] }.join
      # Two thirds are wrapped in a root so most rows reach the element reader.
      index % 3 == 2 ? body : "<r>#{body}</r>"
    end
  end

  # Every encoding name this Ruby knows, in an XML declaration. `locale`,
  # `external`, `filesystem` and `internal` are left out: what they resolve to
  # depends on the process's environment, not on the gem.
  ENVIRONMENT_ENCODING_NAMES = %w[locale external filesystem internal].freeze

  def encoding_names
    Encoding.name_list.sort - ENVIRONMENT_ENCODING_NAMES
  end

  def encoding_inputs
    encoding_names.flat_map do |name|
      ["<a>x</a>", "<a>&#233;</a>"].map do |body|
        "<?xml version=\"1.0\" encoding=\"#{name}\"?>#{body}"
      end
    end
  end

  # What Ruby's own encoding table says about those names; the port hardcodes
  # both lists and checks them against these.
  def encoding_table
    utf8 = encoding_names.select { |name| Encoding.find(name) == Encoding::UTF_8 }
    incompatible = encoding_names.reject { |name| Encoding.find(name).ascii_compatible? }
    { "utf8" => utf8, "asciiIncompatible" => incompatible }
  end

  def all_inputs
    rows = []
    seen = {}
    CASES.each do |group, inputs|
      inputs.each do |input|
        next if seen.key?(input)

        seen[input] = true
        rows << [group, input]
      end
    end
    encoding_inputs.each do |input|
      next if seen.key?(input)

      seen[input] = true
      rows << ["encoding-names", input]
    end
    fuzz_inputs.each do |input|
      next if seen.key?(input)

      seen[input] = true
      rows << ["fuzz", input]
    end
    rows
  end

  # One wrapped node. Elements carry their qualified name, the prefix and the
  # namespace URI Moxml resolves for them, the non-xmlns attributes in the
  # order Lutaml exposes them, and the raw xmlns declarations on that element
  # (Moxml hides those from `attributes`; namespace resolution needs them),
  # exactly as Ox stored them: nothing restores entity markers in them.
  def dump(node)
    case node.node_type
    when :element
      moxml = node.instance_variable_get(:@moxml_node)
      native = moxml.native
      out = { "element" => node.name }
      out["prefix"] = node.namespace_prefix if node.namespace_prefix
      uri = moxml.namespace&.uri
      out["namespace"] = string(uri) if uri
      out["attributes"] = node.attributes.map { |name, attr| [name, attr.value] }
      out["xmlns"] = (native.attributes || {}).filter_map do |name, value|
        name = name.to_s
        [name, string(value)] if name.start_with?("xmlns")
      end
      out["children"] = node.children.map { |child| dump(child) }
      out
    when :text then { "text" => node.text }
    when :cdata then { "cdata" => node.text }
    when :comment then { "comment" => node.text }
    when :processing_instruction then { "pi" => node.name, "text" => node.text }
    else raise "unexpected node type #{node.node_type.inspect}"
    end
  end

  # Ox decodes `&#...;` in attribute values into raw bytes, and only text and
  # ordinary attribute values later pass through a regex that rejects invalid
  # UTF-8. A namespace declaration is never matched against one, so an
  # invalid byte sequence can survive into it; JSON cannot carry that as a
  # string, so it is recorded as its bytes.
  def string(value)
    return value if value.valid_encoding?

    { "invalidUtf8" => value.b.unpack1("H*") }
  end

  def measure(input)
    document = Lutaml::Xml::Adapter::OxAdapter.parse(input.dup)
    { "root" => dump(document.root) }
  rescue StandardError => e
    { "raises" => e.class.name }
  end

  def rows
    all_inputs.map do |(group, input)|
      {
        "id" => "xml-#{Digest::SHA256.hexdigest(input)[0, 12]}",
        "group" => group,
        "input" => input,
      }.merge(measure(input))
    end
  end
end

if $PROGRAM_NAME == __FILE__
  options = { oracle: nil, out: "test/xml", allow_dirty: false }
  OptionParser.new do |o|
    o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
    o.on("--out PATH", "output directory (default test/xml)") { |v| options[:out] = v }
    o.on("--allow-dirty", "emit non-committable output from dirty checkouts") do
      options[:allow_dirty] = true
    end
  end.parse!

  abort "--oracle is required" unless options[:oracle]

  oracle = File.expand_path(options[:oracle])
  lib = File.join(oracle, "lib")
  unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))
    abort "not a plurimath checkout: #{lib}"
  end

  $LOAD_PATH.unshift(lib)
  require "plurimath"
  require "plurimath/version"
  require_relative "render-fixture-provenance"

  unless Gem.loaded_specs.key?("plurimath")
    abort "REFUSING: the plurimath gem is not activated. Set BUNDLE_GEMFILE=" \
          "#{oracle}/Gemfile and run #{__FILE__} with `bundle exec ruby`."
  end

  loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
  unless loaded&.start_with?(lib)
    abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
          "An installed gem answers from a different version."
  end

  # The reader this battery describes must be the one the models use.
  adapter = Lutaml::Model::Config.xml_adapter
  unless adapter == Lutaml::Xml::Adapter::OxAdapter
    abort "REFUSING: Lutaml's XML adapter is #{adapter.inspect}, not OxAdapter."
  end

  dir = File.expand_path(options[:out])
  out = File.join(dir, "reader-fixtures.json")
  sidecar, provenance = RenderFixtureProvenance.prepare(
    oracle: oracle,
    payload_path: out,
    generator_path: GENERATOR_RELATIVE_PATH,
    allow_dirty: options[:allow_dirty],
    corpus: false,
  )

  rows = XmlReaderProbe.rows
  read = rows.count { |row| row.key?("root") }
  raised = rows.count { |row| row.key?("raises") }
  abort "REFUSING: zero rows read" if read.zero?
  abort "REFUSING: #{rows.length} rows but #{read} read + #{raised} raised" unless read + raised == rows.length

  payload = {
    "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
    "schema" => "plurimath-corpus/xml-reader/1",
    "format" => "xml",
    "adapter" => {
      "lutaml" => Lutaml::Model::Config.xml_adapter.name,
      "ox" => Ox::VERSION,
      "moxml" => Moxml::VERSION,
      "lutamlModel" => Lutaml::Model::VERSION,
    },
    "fuzzSeed" => XmlReaderProbe::FUZZ_SEED,
    "encodingTable" => XmlReaderProbe.encoding_table,
    "caseCount" => rows.length,
    "readCount" => read,
    "raisedCount" => raised,
    "cases" => rows,
  }
  FileUtils.mkdir_p(dir)
  payload_bytes = "#{JSON.pretty_generate(payload, ascii_only: true, max_nesting: false)}\n"
  File.binwrite(out, payload_bytes)
  RenderFixtureProvenance.write_manifest(
    sidecar_path: sidecar,
    payload_path: out,
    payload_schema: payload.fetch("schema"),
    payload_bytes: payload_bytes,
    provenance: provenance,
  )
  puts "xml reader fixtures: #{rows.length} cases, #{read} read, #{raised} raised"
  puts "  -> #{out}"
  puts "  -> #{sidecar}"
end
