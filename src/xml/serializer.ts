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
 * ## Known divergence: non-UTF-8 Ruby strings (TODO.plan/deferred.md)
 *
 * Ox emits whatever bytes a Ruby string carries, valid UTF-8 or not, and a
 * JavaScript string cannot represent those bytes at all — any UTF-8 encoding
 * of the output replaces them with U+FFFD (`EF BF BD`). Measured on the
 * oracle, this covers a lone surrogate (`ED A0 80`), a bare invalid byte
 * (`FF`), and a `BINARY`-encoded string such as latin-1 `é` (`E9`); each is
 * emitted raw there.
 *
 * This comment previously named lone surrogates alone, which understated it:
 * `BINARY` is what `File.binread` returns, so it is the likeliest of the three
 * to reach a consumer. Nothing in the gem's parse pipeline produces such a
 * string, and the maintainer's standing input-contract ruling applies —
 * degenerate input is outside the supported contract and the caller bears the
 * consequences. Recorded, not papered over.
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
   * Integers only; Ox rejects floats, NaN and infinities. TypeScript cannot
   * distinguish Ruby `2` from `2.0`, so the runtime contract here is the
   * narrowest one this API can express: any finite integer is accepted.
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
  const indent = normalizeIndent(options.indent);
  const parts: string[] = [];
  writeElement(root, 0, indent, parts);
  if (indent >= 0) parts.push("\n");
  return parts.join("");
}

/**
 * Ox's `MAX_DEPTH` (`ox-2.14.28/ext/ox/dump.c:17`), past which it raises
 * rather than emitting (`:582-583`,
 * `rb_raise(rb_eSysStackError, "maximum depth exceeded")`).
 *
 * It is a compiled-in constant, not stack exhaustion: the oracle's boundary
 * sits at the same place for indent 2 and indent -1, so it does not move with
 * output size. Where it sits depends on whether the deepest element has any
 * child nodes — see `writeElement`, which is where the check is applied. The port's own natural ceiling, by contrast, was
 * real stack exhaustion and differed by indent (4999 vs 6953), so leaving the
 * limit implicit would have made the port's failure point nondeterministic as
 * well as wrong.
 *
 * Between roughly 1001 and 4999 levels the port emitted documents the gem can
 * never produce. Being more capable than the oracle is a defect
 * (PORTING-STANDARDS.md), and because this boundary is an exact constant it
 * is modelled exactly rather than approximated.
 */
const OX_MAX_DEPTH = 1000;

/**
 * Thrown when a tree is nested deeper than Ox will serialize. Local to this
 * module by necessity — layer 1 imports nothing internal (ARCHITECTURE.md §3),
 * so `RenderError` is not reachable from here. The MathML renderer's mid-walk
 * catch converts anything that is not already a `RenderError` into one, so
 * this surfaces to callers as the documented `RenderError` without `xml`
 * having to know that type exists.
 */
export class XmlDepthLimitError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`maximum depth exceeded — Ox serializes at most ${limit} levels below the root`);
    this.name = "XmlDepthLimitError";
    this.limit = limit;
  }
}

/**
 * Thrown when `dump` receives an indent value this number-typed API cannot
 * serialize with Ox parity. Wrong runtime types remain outside scope here:
 * typed callers cannot supply them, and matching Ruby's `Fixnum`/`Float`
 * class split is impossible in JavaScript because `2` and `2.0` are the same
 * number value.
 */
export class XmlIndentError extends Error {
  readonly indent: number;

  constructor(indent: number) {
    super(`indent must be a finite integer; received ${String(indent)}`);
    this.name = "XmlIndentError";
    this.indent = indent;
  }
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

function normalizeIndent(indent: number | null | undefined): number {
  if (indent === null || indent === undefined) return OX_DEFAULT_INDENT;
  if (!Number.isFinite(indent) || !Number.isInteger(indent)) {
    throw new XmlIndentError(indent);
  }
  return indent;
}

function writeElement(element: XmlElement, depth: number, indent: number, parts: string[]): void {
  // `depth` is the element's own nesting level, root at 0.
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

  // The depth check belongs HERE, not at the top: Ox tests it inside
  // `dump_gen_nodes`, guarded by `if (0 < cnt)` (`dump.c:1104`), so an element
  // with no child nodes is emitted however deep it sits. Checking on entry made
  // this port one level stricter than the oracle whenever the deepest element
  // was childless. Measured on the pinned oracle, a chain of bare `<a/>`:
  //
  //                     root+1000   root+1001   root+1002
  //   childless deepest    ok          ok        SystemStackError
  //   text leaf innermost  ok       SystemStackError   SystemStackError
  //
  // The port refused root+1001 in BOTH rows. The existing capacity spec never
  // caught it because its chain builder puts a text leaf innermost, which is
  // the row where the two happened to agree.
  if (depth > OX_MAX_DEPTH) throw new XmlDepthLimitError(OX_MAX_DEPTH);

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
