/**
 * The measured Ox serialization contract: builders + oracle bytes.
 *
 * Every expected byte string lives in `./ox-contract.expected.json`, printed
 * by the oracle itself (plurimath 0.11.6 at `00c52783877b38f6b8e6e109f1803`
 * `96bb34fc62`, Ox 2.14.28, Ruby 4.0.1) — never retyped by hand. Each fixture
 * here rebuilds the same tree through `src/xml` and names, in `probe`, the
 * Ruby that produced its JSON entry. Probes ran as
 *
 * ```ruby
 * # cd <oracle checkout> && bundle exec ruby <probe>
 * $LOAD_PATH.unshift File.expand_path("lib", Dir.pwd)
 * require "plurimath"   # sets Ox.default_options = { encoding: "UTF-8" }
 * ```
 *
 * with two dump spellings, matching the two exported functions:
 *
 * - `dump` group:      `Ox.dump(tree, indent: …)` on raw `Ox::Element`s.
 * - `dumpNodes` group: `Plurimath::Math::Number.new("1").send(:dump_nodes,
 *   tree, indent: …)` on engine-wrapper elements — `Math::Core#dump_nodes`,
 *   the `Ox.dump` + `REPLACABLES` pipeline `to_mathml` returns. The three
 *   `math…-tree` entries were additionally byte-checked against real
 *   `Plurimath::Math.parse(...).to_mathml` output before the JSON was
 *   emitted (the generator aborts on mismatch).
 *
 * The suite fails loudly on drift in either direction: a fixture without a
 * JSON entry, a JSON entry without a fixture, or counts that do not match the
 * pinned totals below.
 */

import type { DumpOptions, XmlAppendable } from "../../src/xml/index";
import { XmlElement } from "../../src/xml/index";
import expected from "./ox-contract.expected.json";

export interface OxContractFixture {
  /** Key into the JSON group. */
  readonly name: string;
  /** The Ruby expression whose printed bytes are the JSON entry. */
  readonly probe: string;
  /** Options for the dump call; absent means "call with no options at all". */
  readonly options?: DumpOptions;
  readonly build: () => XmlElement;
}

/** Suite-failing totals: a truncated fixture list or JSON must not pass. */
export const DUMP_FIXTURE_COUNT = 35;
export const DUMP_NODES_FIXTURE_COUNT = 14;

export const EXPECTED_PROVENANCE = expected._provenance;

const EXPECTED_GROUPS: Record<"dump" | "dumpNodes", Record<string, string>> = {
  dump: expected.dump,
  dumpNodes: expected.dumpNodes,
};

/** The oracle bytes for one fixture; throws rather than comparing nothing. */
export function expectedBytes(group: "dump" | "dumpNodes", name: string): string {
  const bytes = EXPECTED_GROUPS[group][name];
  if (bytes === undefined) {
    throw new Error(`ox-contract.expected.json has no "${group}" entry named "${name}"`);
  }
  return bytes;
}

/** Every name the JSON carries for a group, for both-directions coverage. */
export function expectedNames(group: "dump" | "dumpNodes"): readonly string[] {
  return Object.keys(EXPECTED_GROUPS[group]);
}

/** `(0..127).map { |cp| cp.chr(Encoding::UTF_8) }.join` */
function asciiSweep(): string {
  let out = "";
  for (let code = 0; code <= 0x7f; code += 1) {
    out += String.fromCharCode(code);
  }
  return out;
}

/**
 * `[0xA0, 0xE9, 0x3B1, 0x2211, 0x2028, 0x2029, 0xFFFD, 0x1F600, 0x80, 0x9F,
 *   0xD7FF, 0xE000, 0x10FFFF].map { |cp| cp.chr(Encoding::UTF_8) }.join` —
 * NBSP, é, α, ∑, the LINE/PARAGRAPH SEPARATORs JS regex `m` mistakes for line
 * starts, U+FFFD, an astral surrogate pair, C1 controls, and the BMP/plane
 * boundaries. All emitted raw by Ox in both positions.
 */
function nonAsciiSampler(): string {
  const codepoints = [
    0xa0, 0xe9, 0x3b1, 0x2211, 0x2028, 0x2029, 0xfffd, 0x1f600, 0x80, 0x9f, 0xd7ff, 0xe000,
    0x10ffff,
  ];
  return codepoints.map((codepoint) => String.fromCodePoint(codepoint)).join("");
}

function el(name: string): XmlElement {
  return new XmlElement(name);
}

function textEl(name: string, text: string): XmlElement {
  return el(name).append(text);
}

/** The `math > mstyle > …` shell every `to_mathml` result has (formula.rb:96-105). */
function mathStyleTree(content: readonly XmlAppendable[]): XmlElement {
  const math = el("math").setAttributes({
    xmlns: "http://www.w3.org/1998/Math/MathML",
    display: "block",
  });
  const style = el("mstyle").setAttribute("displaystyle", "true");
  style.append(content);
  math.append(style);
  return math;
}

function nestedTree(): XmlElement {
  return mathStyleTree([textEl("mi", "x")]);
}

function deepTree(): XmlElement {
  const a = el("a");
  const b = el("b");
  b.append(textEl("c", "leaf"));
  a.append(b);
  return a;
}

const NESTED_PROBE =
  'math = Ox::Element.new("math"); math["xmlns"] = "http://www.w3.org/1998/Math/MathML"; ' +
  'math["display"] = "block"; style = Ox::Element.new("mstyle"); ' +
  'style["displaystyle"] = "true"; mi = Ox::Element.new("mi"); mi << "x"; ' +
  "style << mi; math << style";

const DEEP_PROBE =
  'a = Ox::Element.new("a"); b = Ox::Element.new("b"); c = Ox::Element.new("c"); ' +
  'c << "leaf"; b << c; a << b';

export const DUMP_FIXTURES: readonly OxContractFixture[] = [
  {
    name: "nested-indent-2",
    probe: `${NESTED_PROBE}; Ox.dump(math, indent: 2)`,
    options: { indent: 2 },
    build: nestedTree,
  },
  {
    name: "nested-indent-nil",
    probe: `${NESTED_PROBE}; Ox.dump(math, indent: nil)`,
    options: { indent: null },
    build: nestedTree,
  },
  {
    name: "nested-indent-omitted",
    probe: `${NESTED_PROBE}; Ox.dump(math)`,
    build: nestedTree,
  },
  {
    name: "nested-indent-0",
    probe: `${NESTED_PROBE}; Ox.dump(math, indent: 0)`,
    options: { indent: 0 },
    build: nestedTree,
  },
  {
    name: "nested-indent-neg-1",
    probe: `${NESTED_PROBE}; Ox.dump(math, indent: -1)`,
    options: { indent: -1 },
    build: nestedTree,
  },
  {
    name: "deep-indent-1",
    probe: `${DEEP_PROBE}; Ox.dump(a, indent: 1)`,
    options: { indent: 1 },
    build: deepTree,
  },
  {
    name: "deep-indent-2",
    probe: `${DEEP_PROBE}; Ox.dump(a, indent: 2)`,
    options: { indent: 2 },
    build: deepTree,
  },
  {
    name: "deep-indent-4",
    probe: `${DEEP_PROBE}; Ox.dump(a, indent: 4)`,
    options: { indent: 4 },
    build: deepTree,
  },
  {
    name: "deep-indent-neg-2",
    probe: `${DEEP_PROBE}; Ox.dump(a, indent: -2)`,
    options: { indent: -2 },
    build: deepTree,
  },
  {
    name: "empty-with-attr",
    probe: 'e = Ox::Element.new("mspace"); e["linebreak"] = "newline"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("mspace").setAttribute("linebreak", "newline"),
  },
  {
    name: "empty-no-attr",
    probe: 'Ox.dump(Ox::Element.new("mprescripts"), indent: 2)',
    options: { indent: 2 },
    build: () => el("mprescripts"),
  },
  {
    name: "text-only",
    probe: 'e = Ox::Element.new("mo"); e << "+"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("mo", "+"),
  },
  {
    name: "attr-order",
    probe:
      'e = Ox::Element.new("e"); e["zeta"] = "1"; e["alpha"] = "2"; e["mid"] = "3"; ' +
      "Ox.dump(e, indent: 2)",
    options: { indent: 2 },
    build: () =>
      el("e").setAttribute("zeta", "1").setAttribute("alpha", "2").setAttribute("mid", "3"),
  },
  {
    name: "attr-reassign",
    probe:
      'e = Ox::Element.new("e"); e["a"] = "1"; e["b"] = "2"; e["a"] = "3"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("e").setAttribute("a", "1").setAttribute("b", "2").setAttribute("a", "3"),
  },
  {
    name: "attr-delete-readd",
    probe:
      'e = Ox::Element.new("e"); e["a"] = "1"; e["b"] = "2"; e.attributes.delete("a"); ' +
      'e["a"] = "3"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () =>
      el("e")
        .setAttribute("a", "1")
        .setAttribute("b", "2")
        .removeAttribute("a")
        .setAttribute("a", "3"),
  },
  {
    name: "attr-remove",
    probe:
      'e = Ox::Element.new("mo"); e["a"] = "1"; e["b"] = "2"; e.attributes.delete("a"); ' +
      'e.attributes.delete("zz"); Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () =>
      el("mo")
        .setAttribute("a", "1")
        .setAttribute("b", "2")
        .removeAttribute("a")
        .removeAttribute("zz"),
  },
  {
    name: "attr-empty-value",
    probe: 'e = Ox::Element.new("e"); e["k"] = ""; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("e").setAttribute("k", ""),
  },
  {
    name: "mixed-text-elem-text",
    probe:
      'e = Ox::Element.new("mtext"); e << "before "; mi = Ox::Element.new("mi"); mi << "y"; ' +
      'e << mi; e << " after"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("mtext").append("before ", textEl("mi", "y"), " after"),
  },
  {
    name: "mixed-elem-then-text",
    probe:
      'e = Ox::Element.new("p"); i = Ox::Element.new("i"); i << "x"; e << i; e << "tail"; ' +
      "Ox.dump(e, indent: 2)",
    options: { indent: 2 },
    build: () => el("p").append(textEl("i", "x"), "tail"),
  },
  {
    name: "mixed-text-then-elem",
    probe:
      'e = Ox::Element.new("p"); e << "head"; i = Ox::Element.new("i"); i << "x"; e << i; ' +
      "Ox.dump(e, indent: 2)",
    options: { indent: 2 },
    build: () => el("p").append("head", textEl("i", "x")),
  },
  {
    name: "mixed-elem-text-elem",
    probe:
      'e = Ox::Element.new("p"); e << Ox::Element.new("i"); e << "mid"; ' +
      'e << Ox::Element.new("b"); Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("p").append(el("i"), "mid", el("b")),
  },
  {
    name: "nested-mixed",
    probe:
      'outer = Ox::Element.new("outer"); inner = Ox::Element.new("inner"); inner << "head"; ' +
      'i = Ox::Element.new("i"); i << "x"; inner << i; outer << inner; Ox.dump(outer, indent: 2)',
    options: { indent: 2 },
    build: () => el("outer").append(el("inner").append("head", textEl("i", "x"))),
  },
  {
    name: "two-element-children",
    probe:
      'g = Ox::Element.new("g"); p = Ox::Element.new("p"); p << "t"; g << p; ' +
      'q = Ox::Element.new("q"); r = Ox::Element.new("r"); r << "u"; q << r; g << q; ' +
      "Ox.dump(g, indent: 2)",
    options: { indent: 2 },
    build: () => el("g").append(textEl("p", "t"), el("q").append(textEl("r", "u"))),
  },
  {
    name: "row-empty-child",
    probe:
      'row = Ox::Element.new("mrow"); row << Ox::Element.new("mspace"); ' +
      'mi = Ox::Element.new("mi"); mi << "z"; row << mi; Ox.dump(row, indent: 2)',
    options: { indent: 2 },
    build: () => el("mrow").append(el("mspace"), textEl("mi", "z")),
  },
  {
    name: "adjacent-text",
    probe: 'e = Ox::Element.new("t"); e << "one"; e << "two"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("t").append("one", "two"),
  },
  {
    name: "empty-string-text",
    probe: 'e = Ox::Element.new("t"); e << ""; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("t", ""),
  },
  {
    name: "whitespace-text",
    probe: 'e = Ox::Element.new("t"); e << "  "; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("t", "  "),
  },
  {
    name: "newline-text",
    probe: 'e = Ox::Element.new("t"); e << "\\n"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("t", "\n"),
  },
  {
    name: "crlf-text",
    probe: 'e = Ox::Element.new("t"); e << "a\\r\\nb"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("t", "a\r\nb"),
  },
  {
    name: "specials-text",
    probe: `e = Ox::Element.new("mtext"); e << 'a&b<c>d"e\\'f'; Ox.dump(e, indent: 2)`,
    options: { indent: 2 },
    build: () => textEl("mtext", "a&b<c>d\"e'f"),
  },
  {
    name: "ascii-text-sweep",
    probe:
      'ascii = (0..127).map { |cp| cp.chr(Encoding::UTF_8) }.join; e = Ox::Element.new("t"); ' +
      "e << ascii; Ox.dump(e, indent: 2)",
    options: { indent: 2 },
    build: () => textEl("t", asciiSweep()),
  },
  {
    name: "ascii-attr-sweep",
    probe:
      'ascii = (0..127).map { |cp| cp.chr(Encoding::UTF_8) }.join; e = Ox::Element.new("t"); ' +
      'e["k"] = ascii; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("t").setAttribute("k", asciiSweep()),
  },
  {
    name: "nonascii-text-sampler",
    probe:
      "sampler = [0xA0, 0xE9, 0x3B1, 0x2211, 0x2028, 0x2029, 0xFFFD, 0x1F600, 0x80, 0x9F, " +
      "0xD7FF, 0xE000, 0x10FFFF].map { |cp| cp.chr(Encoding::UTF_8) }.join; " +
      'e = Ox::Element.new("t"); e << sampler; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("t", nonAsciiSampler()),
  },
  {
    name: "nonascii-attr-sampler",
    probe:
      "sampler = [0xA0, 0xE9, 0x3B1, 0x2211, 0x2028, 0x2029, 0xFFFD, 0x1F600, 0x80, 0x9F, " +
      "0xD7FF, 0xE000, 0x10FFFF].map { |cp| cp.chr(Encoding::UTF_8) }.join; " +
      'e = Ox::Element.new("t"); e["k"] = sampler; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("t").setAttribute("k", nonAsciiSampler()),
  },
  {
    name: "namespaced",
    probe: 'e = Ox::Element.new("m:oMath"); e["m:val"] = "x"; Ox.dump(e, indent: 2)',
    options: { indent: 2 },
    build: () => el("m:oMath").setAttribute("m:val", "x"),
  },
];

/**
 * `dumpNodes` group. Ruby preamble for every probe below:
 *
 * ```ruby
 * carrier = Plurimath::Math::Number.new("1")   # any Math::Core subclass
 * def w(name) = Plurimath::XmlEngine::OxEngine::Element.new(name)
 * ```
 *
 * `carrier.send(:dump_nodes, tree, indent: 2)` unless the probe says
 * otherwise. Attribute values below contain no decodable entities, so the
 * wrapper's `html_entity_to_unicode` pass stores them verbatim and the
 * builders here set the same final value.
 */
export const DUMP_NODES_FIXTURES: readonly OxContractFixture[] = [
  {
    name: "specials-text",
    probe: `e = w("mtext"); e << 'a&b<c>d"e\\'f'; carrier.send(:dump_nodes, e, indent: 2)`,
    options: { indent: 2 },
    build: () => textEl("mtext", "a&b<c>d\"e'f"),
  },
  {
    name: "indent-nil",
    probe: `e = w("mtext"); e << 'a&b<c>d"e\\'f'; carrier.send(:dump_nodes, e, indent: nil)`,
    options: { indent: null },
    build: () => textEl("mtext", "a&b<c>d\"e'f"),
  },
  {
    name: "literal-amp-entity",
    probe: 'e = w("mtext"); e << "&amp;"; carrier.send(:dump_nodes, e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("mtext", "&amp;"),
  },
  {
    name: "double-amp-text",
    probe: 'e = w("mtext"); e << "&&"; carrier.send(:dump_nodes, e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("mtext", "&&"),
  },
  {
    name: "attr-amp-quote",
    probe:
      'e = w("mo"); e.set_attr({ "intent" => %q{a&b"c} }); carrier.send(:dump_nodes, e, indent: 2)',
    options: { indent: 2 },
    build: () => el("mo").setAttribute("intent", 'a&b"c'),
  },
  {
    name: "double-newline-text",
    probe: 'e = w("mtext"); e << "line1\\n\\nline2"; carrier.send(:dump_nodes, e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("mtext", "line1\n\nline2"),
  },
  {
    name: "crlf-blank-text",
    probe: 'e = w("mtext"); e << "a\\r\\n\\nb"; carrier.send(:dump_nodes, e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("mtext", "a\r\n\nb"),
  },
  {
    name: "line-separator-text",
    probe: 'e = w("mtext"); e << "a\\u2028\\nb"; carrier.send(:dump_nodes, e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("mtext", "a\u2028\nb"),
  },
  {
    name: "entity-text-passthrough",
    probe: 'e = w("mo"); e << "&#x2211;"; carrier.send(:dump_nodes, e, indent: 2)',
    options: { indent: 2 },
    build: () => textEl("mo", "&#x2211;"),
  },
  {
    name: "ascii-sweep",
    probe:
      'ascii = (0..127).map { |cp| cp.chr(Encoding::UTF_8) }.join; e = w("mtext"); ' +
      "e << ascii; carrier.send(:dump_nodes, e, indent: 2)",
    options: { indent: 2 },
    build: () => textEl("mtext", asciiSweep()),
  },
  {
    name: "update-nodes-shape",
    probe:
      'root = Plurimath::XmlHelper.ox_element("mrow"); ' +
      'mi, mo, mn = … ;  # mi>"x", mo>"+", mn>"1" via XmlHelper.ox_element ' +
      'Plurimath::XmlHelper.update_nodes(root, [nil, [mi, [mo]], nil, mn, "tail", nil]); ' +
      "carrier.send(:dump_nodes, root, indent: 2)",
    options: { indent: 2 },
    build: () =>
      el("mrow").append(
        null,
        [textEl("mi", "x"), [textEl("mo", "+")]],
        null,
        textEl("mn", "1"),
        "tail",
        null,
      ),
  },
  {
    name: "math-tree",
    probe:
      'math_style_tree([w_text("mi", "x")]) via XmlHelper (formula.rb:96-105 shape); ' +
      "carrier.send(:dump_nodes, math, indent: 2) — byte-checked equal to " +
      'Plurimath::Math.parse("x", :asciimath).to_mathml by the JSON generator',
    options: { indent: 2 },
    build: () => mathStyleTree([textEl("mi", "x")]),
  },
  {
    name: "mathml-specials-tree",
    probe:
      'math_style_tree([w_text("mtext", "a&b<c")]); carrier.send(:dump_nodes, math, indent: 2) ' +
      "— byte-checked equal to Plurimath::Math.parse('\"a&b<c\"', :asciimath).to_mathml",
    options: { indent: 2 },
    build: () => mathStyleTree([textEl("mtext", "a&b<c")]),
  },
  {
    name: "mathml-sum-tree",
    probe:
      'math_style_tree([mrow[munderover[mo>"&#x2211;", mrow[mi>"i", mo>"=", mn>"1"], mi>"n"], ' +
      'mi>"i"]]); carrier.send(:dump_nodes, math, indent: 2) — byte-checked equal to ' +
      'Plurimath::Math.parse("sum_(i=1)^n i", :asciimath).to_mathml',
    options: { indent: 2 },
    build: () =>
      mathStyleTree([
        el("mrow").append(
          el("munderover").append(
            textEl("mo", "&#x2211;"),
            el("mrow").append(textEl("mi", "i"), textEl("mo", "="), textEl("mn", "1")),
            textEl("mi", "n"),
          ),
          textEl("mi", "i"),
        ),
      ]),
  },
];
