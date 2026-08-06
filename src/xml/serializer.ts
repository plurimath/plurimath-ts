/**
 * The Ox-compatible serializer (ARCHITECTURE.md §3, `xml/`).
 *
 * Byte-for-byte reproduction of what the gem's output path produces through
 * Ox, measured — never read off the C source — against the pinned oracle
 * (plurimath 0.11.6 at `00c52783`, Ox 2.14.28, `Ox.default_options` as
 * plurimath configures them in `lib/plurimath/xml_engine/ox_engine.rb:4`).
 * Every rule below names the probe shape that established it; the committed
 * fixtures in `test/xml/` carry the oracle-printed bytes.
 *
 * Two entry points, matching the two layers in the gem:
 *
 * - {@link dump} is `::Ox.dump(element, indent:)` — the raw Ox contract.
 * - {@link dumpNodes} is `Plurimath::Math::Core#dump_nodes` (core.rb:214-223)
 *   — `Ox.dump` **plus** the gem's `REPLACABLES` string rewrite, which is what
 *   `to_mathml` and `to_omml` actually return (`dump_nodes(math, indent: 2)`,
 *   formula.rb:106, 175).
 *
 * ## The measured Ox layout contract (`Ox.dump(element, indent: i)`)
 *
 * For `i >= 0`, every element open tag — the root included — is preceded by
 * `"\n" + " ".repeat(i * depth)`; text-node children are written inline with
 * no added whitespace; the close tag is written immediately after a final
 * text child and on a fresh indented line otherwise; one `"\n"` ends the
 * output. For any `i < 0` there are no newlines and no indentation at all.
 * `indent: nil` is Ox falling back to its default options, whose `indent`
 * stays 2 after plurimath's `Ox.default_options = { encoding: "UTF-8" }`
 * (measured: the nil, omitted and `2` dumps are identical). Probes:
 *
 * ```ruby
 * Ox.dump(math_mstyle_mi_tree, indent: 2)
 * # => "\n<math xmlns=\"...\" display=\"block\">\n  <mstyle displaystyle=\"true\">\n    <mi>x</mi>\n  </mstyle>\n</math>\n"
 * Ox.dump(mixed, indent: 2)   # mtext["before ", <mi>y</mi>, " after"]
 * # => "\n<mtext>before \n  <mi>y</mi> after</mtext>\n"
 * Ox.dump(deep, indent: -1)   # => "<a><b><c>leaf</c></b></a>"
 * ```
 *
 * An element with no children self-closes (`<mprescripts/>`); an empty-string
 * text child keeps the long form (`<t></t>`). Attributes are emitted in
 * insertion order as ` name="value"`, always double-quoted, `/>` directly
 * after the last attribute.
 *
 * ## The measured escaping contract
 *
 * Established by dumping every ASCII character 0x00-0x7F plus a non-ASCII
 * sampler in both positions (single-string sweeps, oracle-printed):
 *
 * - both positions: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`; C0 controls
 *   except `\t` `\n` `\r` → `&#x00NN;` (lowercase hex, zero-padded to four
 *   digits); `\t` `\n` `\r` literal.
 * - attribute values additionally: `"` → `&quot;`.
 * - everything else is emitted verbatim: `'`, DEL 0x7F, and all non-ASCII
 *   (U+00A0, U+2028/9, surrogate-pair astral characters, U+E000, U+10FFFF
 *   all measured as raw UTF-8).
 *
 * ## Known divergence: lone surrogates (TODO.plan/deferred.md)
 *
 * A Ruby string can be forced to carry invalid UTF-8 (a lone-surrogate byte
 * sequence such as `ED A0 80`), and Ox passes those bytes through raw. A
 * JavaScript string holds the lone surrogate as a UTF-16 code unit, and any
 * UTF-8 encoding of the output replaces it with U+FFFD (`EF BF BD`). Such
 * strings are not valid Unicode, nothing in the gem's parse pipeline
 * produces one, and the maintainer's standing input-contract ruling applies:
 * degenerate Unicode input is outside the supported contract and the caller
 * bears the consequences. Recorded, not papered over.
 */

import type { XmlElement } from "./element";

/**
 * `Ox.default_options[:indent]` in the oracle process — still 2 after
 * plurimath's own `Ox.default_options = { encoding: "UTF-8" }`, because that
 * assignment merges rather than replaces (measured: the option dump reads
 * `encoding: "UTF-8", … indent: 2 …`).
 */
const OX_DEFAULT_INDENT = 2;

export interface DumpOptions {
  /**
   * Ox's `indent`. Omitted or `null` (the gem's `indent: nil` path) falls
   * back to the effective default, 2. Measured values: -2 and -1 (compact,
   * no newlines), 0, 1, 2, 4 — spacing is linearly `indent * depth`.
   * Integers only; nothing in the gem passes anything else.
   */
  readonly indent?: number | null | undefined;
}

/**
 * `::Ox.dump(element.xml_nodes, indent: …)` — the raw Ox bytes, leading
 * newline and all. `to_mathml` does not return this directly; it returns
 * {@link dumpNodes}. Dumping a bare string (Ox object mode, `<s>…</s>`) is
 * not modelled: the renderers always dump a root element.
 */
export function dump(root: XmlElement, options: DumpOptions = {}): string {
  const indent = options.indent ?? OX_DEFAULT_INDENT;
  const parts: string[] = [];
  writeElement(root, 0, indent, parts);
  if (indent >= 0) parts.push("\n");
  return parts.join("");
}

/**
 * `Plurimath::Math::Core#dump_nodes` (core.rb:214-223): `Ox.dump`, then the
 * `REPLACABLES` rewrites — the serialization `to_mathml`/`to_omml` return.
 *
 * The rewrite is deliberately textual, not semantic, and both halves are
 * measured through this exact pipeline (oracle `00c52783`):
 *
 * - `gsub(/&amp;/, "&")` — a GLOBAL undo of Ox's ampersand escaping, applied
 *   to the dumped string. Text `"a&b<c>d"` therefore serializes as
 *   `a&b&lt;c&gt;d` — raw `&`, escaped `<`/`>` — and literal text `"&amp;"`
 *   (five characters) round-trips to `&amp;` because the gsub consumes
 *   left-to-right without rescanning (`&amp;amp;` → `&amp;`).
 * - `gsub(/^\n/, "")` — drops the newline that opens every indented Ox dump,
 *   and any blank line after it. Ruby's `^` matches only at start-of-string
 *   or after `\n`: a `\n` following `\r` or U+2028 survives (measured:
 *   `dump_nodes` on text `"a\r\n\nb"` → `<mtext>a\r\nb</mtext>\n`, on
 *   `"a\u2028\nb"` → unchanged text).
 */
export function dumpNodes(root: XmlElement, options: DumpOptions = {}): string {
  return replacableValues(dump(root, options));
}

/** `REPLACABLES[/&amp;/] = "&"` — plain alternatives, no lookaround needed. */
const AMP_ENTITY = /&amp;/g;

/**
 * `REPLACABLES[/^\n/] = ""`, with Ruby's `^` semantics spelled out: JS `m`
 * would be wrong twice over (it also treats `\r`, U+2028 and U+2029 as line
 * starts), so the lookbehind names the two positions Ruby matches —
 * start-of-string and after-`\n` — exactly.
 */
const LINE_START_NEWLINE = /(?<=^|\n)\n/g;

/** `Math::Core#replacable_values` — the gem's spelling, applied in its order. */
function replacableValues(xml: string): string {
  return xml.replace(AMP_ENTITY, "&").replace(LINE_START_NEWLINE, "");
}

function writeElement(element: XmlElement, depth: number, indent: number, parts: string[]): void {
  if (indent >= 0) {
    parts.push(`\n${" ".repeat(indent * depth)}`);
  }
  parts.push(`<${element.name}`);
  for (const [name, value] of element.attributes) {
    parts.push(` ${name}="${escapeValue(value, true)}"`);
  }
  const children = element.children;
  if (children.length === 0) {
    parts.push("/>");
    return;
  }
  parts.push(">");
  for (const child of children) {
    if (typeof child === "string") {
      parts.push(escapeValue(child, false));
    } else {
      writeElement(child, depth + 1, indent, parts);
    }
  }
  const last = children[children.length - 1];
  if (typeof last !== "string" && indent >= 0) {
    parts.push(`\n${" ".repeat(indent * depth)}`);
  }
  parts.push(`</${element.name}>`);
}

/**
 * One escaper for both positions; `escapeQuote` is the only difference Ox has
 * between them (measured: `'` is escaped in neither).
 *
 * A code-unit scan rather than a regex: every character Ox touches is a
 * single BMP unit below 0x80, so surrogate pairs pass through untouched and
 * UTF-16 offsets cannot split them (PORTING-STANDARDS.md, code-point trap —
 * inapplicable here by construction, which the scan makes visible).
 */
function escapeValue(value: string, escapeQuote: boolean): string {
  let out = "";
  let plainFrom = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    let replacement: string | undefined;
    if (code === 0x26) {
      replacement = "&amp;";
    } else if (code === 0x3c) {
      replacement = "&lt;";
    } else if (code === 0x3e) {
      replacement = "&gt;";
    } else if (code === 0x22 && escapeQuote) {
      replacement = "&quot;";
    } else if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      // Ox writes C0 controls as numeric references, lowercase, zero-padded
      // to four hex digits: NUL → `&#x0000;`, VT → `&#x000b;` (measured over
      // the full 0x00-0x1F range; \t \n \r are the three literal exceptions).
      replacement = `&#x${code.toString(16).padStart(4, "0")};`;
    }
    if (replacement !== undefined) {
      out += value.slice(plainFrom, i) + replacement;
      plainFrom = i + 1;
    }
  }
  if (plainFrom === 0) return value;
  return out + value.slice(plainFrom);
}
