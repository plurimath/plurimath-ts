# Regenerates test/xml/ox-contract.expected.json — every expected string is
# printed by the oracle's own Ox in this process; nothing is retyped.
#
# Run from the pinned oracle checkout, emitting to stdout:
#
#   cd ../plurimath-oracle && mise x ruby@4.0.1 -- bundle exec ruby \
#     ../plurimath-ts/scripts/generate-xml-fixtures.rb \
#     > ../plurimath-ts/test/xml/ox-contract.expected.json
#
# The mise activation matters: an unactivated shell selects system Ruby and
# bundler exits with GemNotFound (review-proven).
#
# The tree recipes mirror test/xml/ox-contract.ts one-for-one; the three
# MathML tree entries are byte-checked against Plurimath::Math.parse(...)
# .to_mathml before emission and the script aborts on any mismatch, so the
# committed fixtures cannot drift from what the gem really renders.
# Provenance (oracle commit, Ox/Ruby versions) is embedded in the output.
$LOAD_PATH.unshift File.expand_path("lib", Dir.pwd)
require "plurimath"
require "json"

ASCII = (0..127).map { |cp| cp.chr(Encoding::UTF_8) }.join
SAMPLER = [0xA0, 0xE9, 0x3B1, 0x2211, 0x2028, 0x2029, 0xFFFD, 0x1F600, 0x80,
           0x9F, 0xD7FF, 0xE000, 0x10FFFF].map { |cp| cp.chr(Encoding::UTF_8) }.join

def el(name)
  Ox::Element.new(name)
end

def text_el(name, text)
  e = el(name)
  e << text
  e
end

def nested_tree
  math = el("math")
  math["xmlns"] = "http://www.w3.org/1998/Math/MathML"
  math["display"] = "block"
  style = el("mstyle")
  style["displaystyle"] = "true"
  style << text_el("mi", "x")
  math << style
  math
end

def deep_tree
  a = el("a")
  b = el("b")
  b << text_el("c", "leaf")
  a << b
  a
end

dump = {}
dump["nested-indent-2"] = Ox.dump(nested_tree, indent: 2)
dump["nested-indent-nil"] = Ox.dump(nested_tree, indent: nil)
dump["nested-indent-omitted"] = Ox.dump(nested_tree)
dump["nested-indent-0"] = Ox.dump(nested_tree, indent: 0)
dump["nested-indent-neg-1"] = Ox.dump(nested_tree, indent: -1)
dump["deep-indent-1"] = Ox.dump(deep_tree, indent: 1)
dump["deep-indent-2"] = Ox.dump(deep_tree, indent: 2)
dump["deep-indent-4"] = Ox.dump(deep_tree, indent: 4)
dump["deep-indent-neg-2"] = Ox.dump(deep_tree, indent: -2)

mspace = el("mspace")
mspace["linebreak"] = "newline"
dump["empty-with-attr"] = Ox.dump(mspace, indent: 2)
dump["empty-no-attr"] = Ox.dump(el("mprescripts"), indent: 2)
dump["text-only"] = Ox.dump(text_el("mo", "+"), indent: 2)

order = el("e")
order["zeta"] = "1"
order["alpha"] = "2"
order["mid"] = "3"
dump["attr-order"] = Ox.dump(order, indent: 2)

reassign = el("e")
reassign["a"] = "1"
reassign["b"] = "2"
reassign["a"] = "3"
dump["attr-reassign"] = Ox.dump(reassign, indent: 2)

readd = el("e")
readd["a"] = "1"
readd["b"] = "2"
readd.attributes.delete("a")
readd["a"] = "3"
dump["attr-delete-readd"] = Ox.dump(readd, indent: 2)

removed = el("mo")
removed["a"] = "1"
removed["b"] = "2"
removed.attributes.delete("a")
removed.attributes.delete("zz")
dump["attr-remove"] = Ox.dump(removed, indent: 2)

emptyval = el("e")
emptyval["k"] = ""
dump["attr-empty-value"] = Ox.dump(emptyval, indent: 2)

mixed = el("mtext")
mixed << "before "
mixed << text_el("mi", "y")
mixed << " after"
dump["mixed-text-elem-text"] = Ox.dump(mixed, indent: 2)

et = el("p")
et << text_el("i", "x")
et << "tail"
dump["mixed-elem-then-text"] = Ox.dump(et, indent: 2)

te = el("p")
te << "head"
te << text_el("i", "x")
dump["mixed-text-then-elem"] = Ox.dump(te, indent: 2)

ete = el("p")
ete << el("i")
ete << "mid"
ete << el("b")
dump["mixed-elem-text-elem"] = Ox.dump(ete, indent: 2)

outer = el("outer")
inner = el("inner")
inner << "head"
inner << text_el("i", "x")
outer << inner
dump["nested-mixed"] = Ox.dump(outer, indent: 2)

g = el("g")
g << text_el("p", "t")
q = el("q")
q << text_el("r", "u")
g << q
dump["two-element-children"] = Ox.dump(g, indent: 2)

row = el("mrow")
row << el("mspace")
row << text_el("mi", "z")
dump["row-empty-child"] = Ox.dump(row, indent: 2)

adj = el("t")
adj << "one"
adj << "two"
dump["adjacent-text"] = Ox.dump(adj, indent: 2)

dump["empty-string-text"] = Ox.dump(text_el("t", ""), indent: 2)
dump["whitespace-text"] = Ox.dump(text_el("t", "  "), indent: 2)
dump["newline-text"] = Ox.dump(text_el("t", "\n"), indent: 2)
dump["crlf-text"] = Ox.dump(text_el("t", "a\r\nb"), indent: 2)
dump["specials-text"] = Ox.dump(text_el("mtext", "a&b<c>d\"e'f"), indent: 2)
dump["ascii-text-sweep"] = Ox.dump(text_el("t", ASCII), indent: 2)

asciiattr = el("t")
asciiattr["k"] = ASCII
dump["ascii-attr-sweep"] = Ox.dump(asciiattr, indent: 2)

dump["nonascii-text-sampler"] = Ox.dump(text_el("t", SAMPLER), indent: 2)

samplerattr = el("t")
samplerattr["k"] = SAMPLER
dump["nonascii-attr-sampler"] = Ox.dump(samplerattr, indent: 2)

ns = el("m:oMath")
ns["m:val"] = "x"
dump["namespaced"] = Ox.dump(ns, indent: 2)

# --- dumpNodes: the gem's Math::Core#dump_nodes pipeline ---
CARRIER = Plurimath::Math::Number.new("1")

def wrapper(name)
  Plurimath::XmlEngine::OxEngine::Element.new(name)
end

def wrapper_text(name, text)
  e = wrapper(name)
  e << text
  e
end

def dump_nodes(node, indent: 2)
  CARRIER.send(:dump_nodes, node, indent: indent)
end

dn = {}
dn["specials-text"] = dump_nodes(wrapper_text("mtext", "a&b<c>d\"e'f"))
dn["indent-nil"] = dump_nodes(wrapper_text("mtext", "a&b<c>d\"e'f"), indent: nil)
dn["literal-amp-entity"] = dump_nodes(wrapper_text("mtext", "&amp;"))
dn["double-amp-text"] = dump_nodes(wrapper_text("mtext", "&&"))

ampattr = wrapper("mo")
ampattr.set_attr({ "intent" => "a&b\"c" })
dn["attr-amp-quote"] = dump_nodes(ampattr)

dn["double-newline-text"] = dump_nodes(wrapper_text("mtext", "line1\n\nline2"))
dn["crlf-blank-text"] = dump_nodes(wrapper_text("mtext", "a\r\n\nb"))
dn["line-separator-text"] = dump_nodes(wrapper_text("mtext", "a\u2028\nb"))
dn["entity-text-passthrough"] = dump_nodes(wrapper_text("mo", "&#x2211;"))
dn["ascii-sweep"] = dump_nodes(wrapper_text("mtext", ASCII))

shape_root = Plurimath::XmlHelper.ox_element("mrow")
shape_mi = Plurimath::XmlHelper.ox_element("mi")
shape_mi << "x"
shape_mo = Plurimath::XmlHelper.ox_element("mo")
shape_mo << "+"
shape_mn = Plurimath::XmlHelper.ox_element("mn")
shape_mn << "1"
Plurimath::XmlHelper.update_nodes(shape_root, [nil, [shape_mi, [shape_mo]], nil, shape_mn, "tail", nil])
dn["update-nodes-shape"] = dump_nodes(shape_root)

def math_style_tree(content_nodes)
  math = Plurimath::XmlHelper.ox_element("math")
  math.set_attr({ "xmlns" => "http://www.w3.org/1998/Math/MathML", "display" => "block" })
  style = Plurimath::XmlHelper.ox_element("mstyle")
  style.set_attr({ "displaystyle" => "true" })
  Plurimath::XmlHelper.update_nodes(style, content_nodes)
  Plurimath::XmlHelper.update_nodes(math, [style])
  math
end

dn["math-tree"] = dump_nodes(math_style_tree([wrapper_text("mi", "x")]))
dn["mathml-specials-tree"] = dump_nodes(math_style_tree([wrapper_text("mtext", "a&b<c")]))

sum_mrow = Plurimath::XmlHelper.ox_element("mrow")
munderover = Plurimath::XmlHelper.ox_element("munderover")
under_row = Plurimath::XmlHelper.ox_element("mrow")
Plurimath::XmlHelper.update_nodes(under_row, [
  wrapper_text("mi", "i"), wrapper_text("mo", "="), wrapper_text("mn", "1")
])
Plurimath::XmlHelper.update_nodes(munderover, [
  wrapper_text("mo", "&#x2211;"), under_row, wrapper_text("mi", "n")
])
Plurimath::XmlHelper.update_nodes(sum_mrow, [munderover, wrapper_text("mi", "i")])
dn["mathml-sum-tree"] = dump_nodes(math_style_tree([sum_mrow]))

# End-to-end cross-checks: the rebuilt trees must byte-match the real renderer.
{
  "math-tree" => Plurimath::Math.parse("x", :asciimath).to_mathml,
  "mathml-specials-tree" => Plurimath::Math.parse('"a&b<c"', :asciimath).to_mathml,
  "mathml-sum-tree" => Plurimath::Math.parse("sum_(i=1)^n i", :asciimath).to_mathml,
}.each do |name, rendered|
  unless dn[name] == rendered
    warn "MISMATCH #{name}:\n  rebuilt=#{dn[name].inspect}\n  to_mathml=#{rendered.inspect}"
    exit 1
  end
end

provenance = {
  "oracle" => "plurimath",
  "oracleVersion" => Plurimath::VERSION,
  "oracleCommit" => %x(git rev-parse HEAD).strip,
  "oxVersion" => Ox::VERSION,
  "rubyVersion" => RUBY_VERSION,
  "xmlEngine" => Plurimath.xml_engine.name,
  "note" =>
    "Oracle-printed bytes for test/xml. dump: Ox.dump(tree, indent:). " \
    "dumpNodes: Plurimath::Math::Core#dump_nodes (Ox.dump + REPLACABLES). " \
    "Each tree's build recipe is the probe shape recorded per fixture in " \
    "test/xml/ox-contract.ts; the three MathML tree entries are additionally " \
    "byte-checked against Plurimath::Math.parse(...).to_mathml before emission.",
}

out = { "_provenance" => provenance, "dump" => dump, "dumpNodes" => dn }
json = JSON.pretty_generate(out, ascii_only: true)
# JSON leaves DEL (0x7F) raw; escape it so the committed file has no control bytes.
json = json.gsub("\x7F", "\\u007f")
puts json
