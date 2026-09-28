/**
 * The XML reader (ARCHITECTURE.md §3, `xml/`): the tree the gem's MathML and
 * OMML input paths hand to their models, reproduced from the same bytes.
 *
 * ## Which reader this is
 *
 * Measured, not read off the Gemfile: under the pinned oracle's lockfile,
 * `Plurimath::Math.parse(text, :mathml)` and `(text, :omml)` both call
 * `Moxml::Adapter::Ox.parse` and then `Ox.parse` once, and nothing else
 * (a TracePoint over Ox, Nokogiri, REXML and Oga load/parse calls), with
 * `Lutaml::Model::Config.xml_adapter` = `Lutaml::Xml::Adapter::OxAdapter`.
 * So the stack is Ox 2.14.28 under moxml 0.1.26 and lutaml-model 0.8.19, and
 * what the models walk is Lutaml's wrapper of Moxml's view of Ox's tree. This
 * module reproduces all four layers, in order:
 *
 * 1. **Moxml's entity marking.** Before Ox sees the string, every
 *    `&name;` whose name matches `[a-zA-Z_][\w.:-]*` and is not one of `amp
 *    lt gt quot apos` becomes `U+FFFC U+FEFF name;` — everywhere in the
 *    document, comments and CDATA included.
 * 2. **Ox's parse** (`Ox.parse`, generic mode, the options plurimath sets),
 *    ported step for step over UTF-8 bytes, because its quirks are
 *    byte-level: numeric references write raw bytes and a `&#0;` truncates
 *    the string at that point; an unterminated `&` looks ahead exactly 31
 *    bytes for a `;`; whitespace-only text survives only before the first
 *    child element; a second top-level element replaces the first unless a
 *    comment, PI or DOCTYPE came first; and so on.
 * 3. **Moxml's view**: the root is the first element of the document, element
 *    and attribute prefixes are resolved against `xmlns` declarations on the
 *    element and its ancestors, and the entity markers are restored to
 *    `&name;` in text and attribute values — but not in comments, CDATA,
 *    processing instructions or namespace URIs, which keep the markers.
 * 4. **Lutaml's wrapper**: empty text and CDATA nodes are dropped, an
 *    unresolved prefix is dropped from a name, and an attribute is dropped
 *    when its local name starts with `xmlns` or it restates one of its own
 *    element's namespace declarations.
 *
 * Every rule is pinned by `test/xml/reader-fixtures.json`, which
 * `scripts/generate-xml-reader-fixtures.rb` measures on the oracle.
 *
 * ## What stays above this layer
 *
 * The MathML input path does three things to the raw string or the tree that
 * are not the reader's: the ` xmlns=` test before the first `>`, the namespace
 * injection into `<math`, and `<mo>` trimming (`<mi>` keeps its whitespace).
 * They belong to the MathML layer, which will call this reader.
 *
 * ## Refusals
 *
 * Everything the gem's reader raises on — Ox parse errors, the invalid UTF-8
 * that a numeric reference can produce, a document with no root element — is
 * one {@link XmlReadError} here, because `Plurimath::Math.parse` turns every
 * one of them into the same `ParseError`. Nesting deeper than Ox's limit of
 * 1000 levels below the root is refused as Ox refuses it; between roughly 700
 * and 1000 levels the gem itself dies of Ruby stack exhaustion, which is not
 * reproduced.
 *
 * ## Known divergences
 *
 * - An XML declaration naming an ASCII-compatible encoding other than UTF-8
 *   changes how Ruby labels the strings. Two consequences are reproduced:
 *   text and attribute values still read as UTF-8, and a numeric reference
 *   above U+007F writes a single raw byte in text (above U+00FF it is
 *   refused), so it survives only where the bytes happen to form valid UTF-8
 *   (`&#195;&#169;` is `é`); in an attribute value it is refused. Not
 *   reproduced: the gem re-reads element names, comments, processing
 *   instructions, CDATA and namespace URIs through the declared encoding, so non-ASCII there comes out
 *   transcoded, as `?`, or as a refusal, depending on the encoding. This
 *   reader keeps UTF-8 there (the fixture test pins every such row to the
 *   gem's own `encoding="UTF-8"` answer for the same body).
 * - `locale`, `external`, `filesystem` and `internal` resolve through the Ruby
 *   process's environment; they are read as UTF-8, which is what they are in
 *   the oracle's environment (under `LC_ALL=C` the gem would differ).
 * - Invalid UTF-8 can reach a namespace URI (`xmlns:m="&#xD800;"`) in the gem;
 *   a JavaScript string cannot hold it, so those bytes decode to U+FFFD.
 * - A JavaScript string with a lone surrogate has no UTF-8 form and no Ruby
 *   counterpart; it is refused.
 *
 * Imports nothing internal, per §3's module map.
 */

/** A parsed element, as the gem's models see it. */
export interface XmlReadElement {
  readonly kind: "element";
  /**
   * The qualified name: `prefix:local` when the prefix resolved to a
   * declaration, the local name alone when it did not. `null` only for the
   * empty tag name `<></>`, which Moxml cannot name.
   */
  readonly name: string | null;
  /** The resolved prefix, `""` included; `null` when none resolved. */
  readonly prefix: string | null;
  /** The namespace URI the name resolved to, or `null`. */
  readonly namespace: string | null;
  /** Non-namespace attributes, in document order, names as the models see them. */
  readonly attributes: readonly (readonly [name: string, value: string])[];
  /** This element's own `xmlns` / `xmlns:p` declarations, values as Ox stored them. */
  readonly xmlns: readonly (readonly [name: string, value: string])[];
  readonly children: readonly XmlReadNode[];
}

export interface XmlReadText {
  readonly kind: "text";
  readonly text: string;
}

export interface XmlReadCdata {
  readonly kind: "cdata";
  readonly text: string;
}

export interface XmlReadComment {
  readonly kind: "comment";
  readonly text: string;
}

export interface XmlReadInstruction {
  readonly kind: "pi";
  readonly target: string;
  readonly text: string;
}

export type XmlReadNode =
  | XmlReadElement
  | XmlReadText
  | XmlReadCdata
  | XmlReadComment
  | XmlReadInstruction;

/** The gem's reader refused the input; `Plurimath::Math.parse` raises `ParseError`. */
export class XmlReadError extends Error {
  override readonly name = "XmlReadError";
}

/** Reads `input` into the root element the gem's models would receive. */
export function readXml(input: string): XmlReadElement {
  if (hasLoneSurrogate(input)) {
    throw new XmlReadError("input contains a lone surrogate and has no UTF-8 form");
  }
  const parser = new OxParser(ENCODER.encode(markEntities(input)));
  const result = parser.parse();
  if (result === null) throw new XmlReadError("empty document");
  if (parser.encoding === "incompatible") {
    throw new XmlReadError("the declared encoding is not ASCII-compatible");
  }
  const root = result.kind === "document" ? result.nodes.find(isOxElement) : result;
  if (root === undefined) throw new XmlReadError("document has no root element");
  return wrapElement(root, []);
}

// --- layer 1: Moxml's entity marking ---------------------------------------

const ENTITY_NAME = "[a-zA-Z_][\\w.:-]*";
const STANDARD_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);
const ENTITY_MARKER = "￼﻿";

function markEntities(input: string): string {
  if (!input.includes("&")) return input;
  return input.replace(new RegExp(`&(${ENTITY_NAME});`, "g"), (match, name: string) =>
    STANDARD_ENTITIES.has(name) ? match : `${ENTITY_MARKER}${name};`,
  );
}

function restoreEntities(text: string): string {
  return text
    .replace(new RegExp(`${ENTITY_MARKER}(${ENTITY_NAME});`, "g"), "&$1;")
    .replace(new RegExp(`&#xFFFC;&#xFEFF;(${ENTITY_NAME});`, "g"), "&$1;");
}

function hasLoneSurrogate(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    const unit = input.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        continue;
      }
      return true;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

// --- layer 2: Ox's parse ------------------------------------------------------

const ENCODER = new TextEncoder();

/** Ox's generic-mode tree. Strings stay bytes until the wrapper reads them. */
interface OxElement {
  readonly kind: "element";
  readonly name: Uint8Array;
  /** A Ruby Hash: a repeated name keeps its first position and takes the last value. */
  readonly attributes: Map<string, { readonly name: Uint8Array; readonly value: Uint8Array }>;
  readonly nodes: OxNode[];
}

type OxNode =
  | OxElement
  | { readonly kind: "text"; readonly value: Uint8Array }
  | { readonly kind: "cdata"; readonly value: Uint8Array }
  | { readonly kind: "comment"; readonly value: Uint8Array }
  | { readonly kind: "doctype" }
  | { readonly kind: "pi"; readonly target: Uint8Array; readonly content: Uint8Array | null };

interface OxDocument {
  readonly kind: "document";
  readonly nodes: OxNode[];
}

function isOxElement(node: OxNode): node is OxElement {
  return node.kind === "element";
}

/** How Ox's `rb_enc` stands after any XML declaration (see `classifyEncoding`). */
type DeclaredEncoding = "utf8" | "foreign" | "incompatible";

/**
 * Ruby's names for UTF-8 (`Encoding::UTF_8.names`), case-insensitively as
 * `rb_enc_find` matches them. `locale`, `external`, `filesystem` and
 * `internal` depend on the Ruby process's environment; in the oracle's they
 * all behave as UTF-8 (`internal` because it finds no encoding, and Ox then
 * falls back to UTF-8), and are taken as such here.
 */
const UTF8_ENCODING_NAMES = new Set([
  "utf-8",
  "cp65001",
  "locale",
  "external",
  "filesystem",
  "internal",
]);

/**
 * Ruby's ASCII-incompatible encoding names (`!Encoding#ascii_compatible?`,
 * aliases included). Declaring one makes every later string operation in the
 * gem raise `Encoding::CompatibilityError`. The fixture test checks this list
 * against the oracle's own encoding table.
 */
export const ASCII_INCOMPATIBLE_ENCODING_NAMES: ReadonlySet<string> = new Set(
  [
    "CP50220",
    "CP50221",
    "CP65000",
    "IBM037",
    "ISO-2022-JP",
    "ISO-2022-JP-2",
    "ISO-2022-JP-KDDI",
    "ISO2022-JP",
    "ISO2022-JP2",
    "UCS-2BE",
    "UCS-4BE",
    "UCS-4LE",
    "UTF-16",
    "UTF-16BE",
    "UTF-16LE",
    "UTF-32",
    "UTF-32BE",
    "UTF-32LE",
    "UTF-7",
    "ebcdic-cp-us",
  ].map((name) => name.toLowerCase()),
);

function classifyEncoding(name: string): DeclaredEncoding {
  const key = name.toLowerCase();
  if (UTF8_ENCODING_NAMES.has(key)) return "utf8";
  if (ASCII_INCOMPATIBLE_ENCODING_NAMES.has(key)) return "incompatible";
  // Any other name — known to Ruby or not, `""` and `" UTF-8"` included — was
  // measured to behave the same way: not UTF-8.
  return "foreign";
}

const MAX_ELEMENT_DEPTH = 1000;
const MAX_PROLOG = 32767;
const U64 = (1n << 64n) - 1n;

const LT = 0x3c;
const GT = 0x3e;
const AMP = 0x26;
const SEMI = 0x3b;
const HASH = 0x23;
const SLASH = 0x2f;
const QUESTION = 0x3f;
const BANG = 0x21;
const DASH = 0x2d;
const EQUALS = 0x3d;
const DQUOTE = 0x22;
const SQUOTE = 0x27;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;

function isWhite(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0c || c === 0x0a || c === 0x0d;
}

/** Thrown by Ox's `set_error`; every one is a refusal. */
class OxError extends Error {}

/**
 * `ox_parse` with the generic-mode callbacks, over a NUL-terminated byte
 * buffer that it writes NULs into exactly where the C code does — some later
 * reads depend on them.
 */
class OxParser {
  private readonly buf: Uint8Array;
  /** `pi->end`: the length of the input, not counting the terminator. */
  private readonly end: number;
  /** The start of the string after any BOM (`pi->str`). */
  private readonly str: number;
  private s: number;
  private obj: OxElement | OxDocument | null = null;
  private readonly stack: (OxNode[] | null)[] = [];
  encoding: DeclaredEncoding = "utf8";

  constructor(bytes: Uint8Array) {
    this.buf = new Uint8Array(bytes.length + 1);
    this.buf.set(bytes);
    // `defuse_bom`: a UTF-8 BOM is skipped, any other leading 0xEF refused.
    let start = 0;
    if (this.at(0) === 0xef) {
      if (this.at(1) !== 0xbb || this.at(2) !== 0xbf) throw new XmlReadError("invalid BOM");
      start = 3;
    }
    this.str = start;
    this.s = start;
    // Ox is handed the Ruby string's length, and scanning also stops at a NUL.
    this.end = bytes.length;
  }

  private at(i: number): number {
    return this.buf[i] ?? 0;
  }

  parse(): OxElement | OxDocument | null {
    try {
      this.parseDocument();
    } catch (error) {
      if (error instanceof OxError) throw new XmlReadError(error.message);
      throw error;
    }
    return this.obj;
  }

  private fail(message: string): never {
    throw new OxError(message);
  }

  private parseDocument(): void {
    for (;;) {
      this.nextNonWhite();
      if (this.at(this.s) === 0) break;
      if (this.at(this.s) !== LT) this.fail("invalid format, expected <");
      this.s++;
      switch (this.at(this.s)) {
        case QUESTION:
          this.s++;
          this.readInstruction();
          break;
        case BANG:
          this.s++;
          if (this.at(this.s) === 0) {
            this.fail("invalid format, DOCTYPE or comment not terminated");
          } else if (this.at(this.s) === DASH) {
            this.s++;
            if (this.at(this.s) !== DASH) this.fail("invalid format, bad comment format");
            this.s++;
            this.readComment();
          } else if (this.startsWith(this.s, "DOCTYPE")) {
            this.s += 7;
            this.readDoctype();
          } else {
            this.fail("invalid format, DOCTYPE or comment expected");
          }
          break;
        case 0:
          this.fail("invalid format, document not terminated");
          break;
        default:
          this.readElement(0);
          break;
      }
    }
  }

  private startsWith(at: number, ascii: string): boolean {
    for (let i = 0; i < ascii.length; i++) {
      if (this.at(at + i) !== ascii.charCodeAt(i)) return false;
    }
    return true;
  }

  private nextNonWhite(): void {
    while (isWhite(this.at(this.s))) this.s++;
  }

  private nextWhite(): void {
    for (;;) {
      const c = this.at(this.s);
      if (c === 0 || isWhite(c)) return;
      this.s++;
    }
  }

  /** The NUL-terminated string starting at `at`. */
  private cstr(at: number): Uint8Array {
    let stop = at;
    while (this.at(stop) !== 0) stop++;
    return this.buf.slice(at, stop);
  }

  /** `strstr` from `from`, which stops at the first NUL. */
  private find(from: number, ascii: string): number {
    for (let i = from; this.at(i) !== 0; i++) {
      if (this.startsWith(i, ascii)) return i;
    }
    return -1;
  }

  private readNameToken(): number {
    this.nextNonWhite();
    const start = this.s;
    for (;;) {
      switch (this.at(this.s)) {
        case 0x20:
        case 0x09:
        case 0x0c:
        case QUESTION:
        case EQUALS:
        case SLASH:
        case GT:
        case 0x0a:
        case 0x0d:
          return start;
        case 0:
          this.fail("invalid format, document not terminated");
          break;
        default:
          this.s++;
      }
    }
  }

  /** Returns the value's start; the closing quote (or white) becomes a NUL. */
  private readQuotedValue(): number {
    const quote = this.at(this.s);
    if (quote === DQUOTE || quote === SQUOTE) {
      this.s++;
      const value = this.s;
      while (this.at(this.s) !== quote) {
        if (this.at(this.s) === 0) this.fail("invalid format, document not terminated");
        this.s++;
      }
      this.buf[this.s] = 0;
      this.s++;
      return value;
    }
    const value = this.s;
    this.nextWhite();
    if (this.at(this.s) === 0) this.fail("invalid format, document not terminated");
    this.buf[this.s] = 0;
    this.s++;
    return value;
  }

  private readInstruction(): void {
    const attrs: { name: number; value: number }[] = [];
    const target = this.readNameToken();
    let end = this.s;
    for (; ; this.s++) {
      const c = this.at(this.s);
      if (c === QUESTION && this.at(this.s + 1) === GT) {
        this.s++;
        break;
      }
      if (c === 0) this.fail("processing instruction not terminated");
    }
    const cend = this.s;
    const content = this.buf.slice(end, cend - 1);
    this.s = end;
    this.nextNonWhite();
    let c = this.at(this.s);
    this.buf[end] = 0;
    let attrsOk = true;
    if (c !== QUESTION) {
      while (c !== QUESTION) {
        if (this.at(this.s) === 0) {
          this.fail("invalid format, processing instruction not terminated");
        }
        this.nextNonWhite();
        const attrName = this.readNameToken();
        end = this.s;
        this.nextNonWhite();
        if (this.at(this.s) === 0) {
          this.fail("invalid format, processing instruction not terminated");
        }
        if (this.at(this.s++) !== EQUALS) {
          attrsOk = false;
          break;
        }
        this.buf[end] = 0;
        this.nextNonWhite();
        const attrValue = this.readQuotedValue();
        attrs.push({ name: attrName, value: attrValue });
        this.nextNonWhite();
        c = this.at(this.s);
      }
      if (this.at(this.s) === QUESTION) this.s++;
    } else {
      this.s++;
    }
    if (attrsOk) {
      if (this.at(this.s++) !== GT) {
        this.fail("invalid format, processing instruction not terminated");
      }
    } else {
      this.s = cend + 1;
    }
    this.instruct(
      this.cstr(target),
      attrs.map(({ name, value }) => ({ name: this.cstr(name), value: this.cstr(value) })),
      attrsOk ? null : cstrOf(content),
    );
  }

  private readDelimited(endChar: number): void {
    if (endChar === DQUOTE || endChar === SQUOTE) {
      for (let c = this.at(this.s++); c !== endChar; c = this.at(this.s++)) {
        if (c === 0) {
          this.s--;
          this.fail("invalid format, doctype not terminated");
        }
      }
      return;
    }
    for (;;) {
      const c = this.at(this.s++);
      if (c === endChar) return;
      if (MAX_PROLOG < this.s - this.str) {
        this.s--;
        this.fail("prolog (doctype) too long");
      }
      switch (c) {
        case 0:
          this.s--;
          this.fail("invalid format, doctype not terminated");
          break;
        case DQUOTE:
        case SQUOTE:
          this.readDelimited(c);
          break;
        case LBRACKET:
          this.readDelimited(RBRACKET);
          break;
        case LT:
          this.readDelimited(GT);
          break;
        default:
          break;
      }
    }
  }

  private readDoctype(): void {
    this.nextNonWhite();
    this.readDelimited(GT);
    this.s--;
    this.buf[this.s] = 0;
    this.s++;
    this.addNode({ kind: "doctype" });
  }

  private readComment(): void {
    this.nextNonWhite();
    const comment = this.s;
    const end = this.find(this.s, "-->");
    if (end < 0) this.fail("invalid format, comment not terminated");
    for (let s = end - 1; this.s < s; s--) {
      if (!isWhite(this.at(s))) {
        this.buf[s + 1] = 0;
        break;
      }
    }
    this.buf[end] = 0;
    this.s = end + 3;
    this.addNode({ kind: "comment", value: fixNewlines(this.cstr(comment)) });
  }

  private readCdata(): void {
    const start = this.s;
    const end = this.find(this.s, "]]>");
    if (end < 0) this.fail("invalid format, CDATA not terminated");
    this.buf[end] = 0;
    this.s = end + 3;
    this.addNode({ kind: "cdata", value: fixNewlines(this.cstr(start)) });
  }

  private readElement(depth: number): void {
    if (MAX_ELEMENT_DEPTH < depth) this.fail("element nested too deeply, limit is 1000");
    const attrs: { name: number; value: Uint8Array }[] = [];
    const ename = this.readNameToken();
    let end = this.s;
    const elen = end - ename;
    this.nextNonWhite();
    let c = this.at(this.s);
    this.buf[end] = 0;
    const name = this.cstr(ename);
    if (c === SLASH) {
      this.s++;
      if (this.at(this.s) !== GT) this.fail("invalid format, element not closed");
      this.s++;
      this.addElement(name, attrs, false);
      this.endElement();
      return;
    }
    let done = false;
    let hasChildren = false;
    while (!done) {
      if (c === 0) {
        if (this.end <= this.s) break;
        this.nextNonWhite();
        c = this.at(this.s);
      }
      switch (c) {
        case 0:
          this.fail("invalid format, document not terminated");
          break;
        case SLASH:
          this.s++;
          if (this.at(this.s) !== GT) this.fail("invalid format, element not closed");
          this.s++;
          this.addElement(name, attrs, false);
          this.endElement();
          return;
        case GT:
          this.s++;
          hasChildren = true;
          done = true;
          this.addElement(name, attrs, true);
          break;
        default: {
          const attrName = this.readNameToken();
          end = this.s;
          this.nextNonWhite();
          if (this.at(this.s++) !== EQUALS) {
            this.s--;
            this.fail("invalid format, no attribute value");
          }
          this.buf[end] = 0;
          this.nextNonWhite();
          const valueAt = this.readQuotedValue();
          let value = this.cstr(valueAt);
          if (value.includes(AMP)) {
            const collapsed = this.collapseSpecial(valueAt);
            // Ox's EDOM return without an error: the element is silently
            // abandoned and its parent carries on from here.
            if (collapsed === null) return;
            value = collapsed;
          }
          attrs.push({ name: attrName, value });
          break;
        }
      }
      c = 0;
    }
    if (!hasChildren) return;

    let first = true;
    for (;;) {
      const start = this.s;
      this.nextNonWhite();
      c = this.at(this.s++);
      if (c === 0) {
        this.s--;
        this.fail("invalid format, document not terminated");
      }
      if (c === LT) {
        switch (this.at(this.s)) {
          case BANG:
            this.s++;
            if (this.at(this.s) === DASH && this.at(this.s + 1) === DASH) {
              this.s += 2;
              this.readComment();
            } else if (this.startsWith(this.s, "[CDATA[")) {
              this.s += 7;
              this.readCdata();
            } else {
              this.fail("invalid format, invalid comment or CDATA format");
            }
            break;
          case QUESTION:
            this.s++;
            this.readInstruction();
            break;
          case SLASH: {
            const slash = this.s;
            this.s++;
            const closeName = this.readNameToken();
            end = this.s;
            this.nextNonWhite();
            c = this.at(this.s);
            this.buf[end] = 0;
            if (!bytesEqual(this.cstr(closeName), this.cstr(ename))) {
              this.fail("invalid format, elements overlap");
            }
            if (c !== GT) this.fail("invalid format, element not closed");
            if (first && start !== slash - 1) {
              this.buf[slash - 1] = 0;
              if (this.at(start) !== 0) this.addNode({ kind: "text", value: this.cstr(start) });
            }
            this.s++;
            this.endElement();
            return;
          }
          case 0:
            this.fail("invalid format, document not terminated");
            break;
          default:
            first = false;
            this.readElement(depth + 1);
            break;
        }
      } else {
        // `char prev` is signed in C: a byte at or above 0x80 compares below ' '.
        const prev = this.at(start - 1);
        this.s = start;
        if (prev !== GT && ((prev >= 0x20 && prev < 0x80) || isWhite(prev))) this.s--;
        this.readText();
        if (
          this.at(this.s + 1) === SLASH &&
          this.matchesAt(this.s + 2, ename, elen) &&
          this.at(this.s + elen + 2) === GT
        ) {
          this.s += elen + 3;
          this.endElement();
          return;
        }
      }
    }
  }

  /** `strncmp(ename, pi->s + 2, elen) == 0`. */
  private matchesAt(at: number, ename: number, elen: number): boolean {
    for (let i = 0; i < elen; i++) {
      const a = this.at(ename + i);
      if (a !== this.at(at + i)) return false;
      if (a === 0) return true;
    }
    return true;
  }

  private readText(): void {
    const out: number[] = [];
    for (;;) {
      const c = this.at(this.s++);
      if (c === LT) {
        this.s--;
        break;
      }
      if (c === 0) {
        this.s--;
        this.fail("invalid format, document not terminated");
      }
      if (c === AMP) this.readCodedChars(out);
      else out.push(c);
    }
    this.addNode({ kind: "text", value: fixNewlines(cstrOf(Uint8Array.from(out))) });
  }

  /** Entered just past a `&` in text; appends what Ox writes for it. */
  private readCodedChars(out: number[]): void {
    const window: number[] = [];
    let t = this.s;
    let terminated = false;
    for (let i = 0; i < 31; i++, t++) {
      const c = this.at(t);
      if (c === 0) this.fail("Not terminated coded char.");
      if (c === SEMI) {
        t++;
        terminated = true;
        break;
      }
      window.push(c);
    }
    if (!terminated) {
      out.push(AMP);
      return;
    }
    if (window[0] === HASH) {
      const u = parseCharRef(window, 1);
      if (u === null) {
        out.push(AMP);
        return;
      }
      if (u <= 0x7fn) out.push(Number(u));
      else if (this.encoding === "utf8") out.push(...ucsToUtf8(u));
      else if (u <= 0xffn) out.push(Number(u));
      else this.fail("Invalid encoding, need UTF-8 encoding to parse &#nnnn; character sequences.");
      this.s = t;
      return;
    }
    const code = STANDARD_ENTITY_CODES.get(String.fromCharCode(...window));
    if (code === undefined) {
      out.push(AMP);
      return;
    }
    out.push(code);
    this.s = t;
  }

  /**
   * Ox's `collapse_special` over an attribute value in place. Returns the new
   * value, or `null` for the EDOM return that sets no error.
   */
  private collapseSpecial(at: number): Uint8Array | null {
    const out: number[] = [];
    let s = at;
    while (this.at(s) !== 0) {
      if (this.at(s) !== AMP) {
        out.push(this.at(s++));
        continue;
      }
      s++;
      if (this.at(s) === HASH) {
        s++;
        const hex = this.at(s) === 0x78 || this.at(s) === 0x58;
        if (hex) s++;
        // `read_hex_uint64` / `read_10_uint64` stop at the first non-digit —
        // the value's own terminating NUL included — and that is Ox's EDOM.
        const digits: number[] = [];
        let e = s;
        while (this.at(e) !== SEMI) {
          if (!isDigit(this.at(e), hex)) return null;
          digits.push(this.at(e++));
        }
        const u = parseDigits(digits, hex);
        if (u === null) return null;
        if (u <= 0x7fn) out.push(Number(u));
        else if (this.encoding === "utf8") out.push(...ucsToUtf8(u));
        else
          this.fail("Invalid encoding, need UTF-8 encoding to parse &#nnnn; character sequences.");
        s = e + 1;
        continue;
      }
      const named = NAMED_IN_ATTRIBUTES.find(([text]) => this.startsWithCaseless(s, text));
      if (named !== undefined) {
        out.push(named[1]);
        s += named[0].length;
        continue;
      }
      // An entity Ox would look up in its HTML table. Moxml has already turned
      // every name that table holds into a marker, so none is ever found; the
      // only question is which error Ox reports, and both refuse.
      this.fail("Invalid format, invalid special character sequence");
    }
    // Written in place and read back as a C string: a `&#0;` ends the value.
    return cstrOf(Uint8Array.from(out));
  }

  private startsWithCaseless(at: number, ascii: string): boolean {
    for (let i = 0; i < ascii.length; i++) {
      let c = this.at(at + i);
      if (c >= 0x41 && c <= 0x5a) c += 0x20;
      if (c !== ascii.charCodeAt(i)) return false;
    }
    return true;
  }

  // --- generic-mode callbacks (gen_load.c) ---------------------------------

  private createDoc(): OxNode[] {
    const nodes: OxNode[] = [];
    this.stack.length = 0;
    this.stack.push(nodes);
    this.obj = { kind: "document", nodes };
    return nodes;
  }

  private addNode(node: OxNode): void {
    if (this.stack.length === 0) this.createDoc();
    this.stack[this.stack.length - 1]?.push(node);
  }

  private instruct(
    target: Uint8Array,
    attrs: readonly { readonly name: Uint8Array; readonly value: Uint8Array }[],
    content: Uint8Array | null,
  ): void {
    const name = latin(target);
    if (name === "xml") {
      if (this.stack.length !== 0)
        this.fail("Prolog must be the first element in an XML document.");
      for (const attr of attrs) {
        if (latin(attr.name) === "encoding") {
          this.encoding = classifyEncoding(DECODER.decode(attr.value));
        }
      }
      const nodes: OxNode[] = [];
      this.stack.push(nodes);
      this.obj = { kind: "document", nodes };
    } else if (name === "ox") {
      for (const attr of attrs) {
        if (latin(attr.name) === "version" && latin(attr.value) !== "1.0") {
          this.fail("Only Ox XML Object version 1.0 supported.");
        }
      }
    } else {
      this.addNode({ kind: "pi", target, content });
    }
  }

  private addElement(
    name: Uint8Array,
    attrs: readonly { readonly name: number; readonly value: Uint8Array }[],
    hasChildren: boolean,
  ): void {
    const attributes: OxElement["attributes"] = new Map();
    for (const attr of attrs) {
      const attrName = this.cstr(attr.name);
      attributes.set(latin(attrName), { name: attrName, value: attr.value });
    }
    const element: OxElement = { kind: "element", name, attributes, nodes: [] };
    if (this.stack.length === 0) this.obj = element;
    else this.stack[this.stack.length - 1]?.push(element);
    this.stack.push(hasChildren ? element.nodes : null);
  }

  private endElement(): void {
    if (this.stack.length !== 0) this.stack.pop();
  }
}

const STANDARD_ENTITY_CODES = new Map([
  ["amp", AMP],
  ["lt", LT],
  ["gt", GT],
  ["quot", DQUOTE],
  ["apos", SQUOTE],
]);

const NAMED_IN_ATTRIBUTES: readonly (readonly [string, number])[] = [
  ["lt;", LT],
  ["gt;", GT],
  ["amp;", AMP],
  ["quot;", DQUOTE],
  ["apos;", SQUOTE],
];

/** Ox's `read_hex_uint64` / `read_10_uint64` from `window[from]` to its end. */
function parseCharRef(window: readonly number[], from: number): bigint | null {
  const hex = window[from] === 0x78 || window[from] === 0x58;
  return parseDigits(window.slice(hex ? from + 1 : from), hex);
}

function isDigit(c: number, hex: boolean): boolean {
  if (c >= 0x30 && c <= 0x39) return true;
  return hex && ((c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46));
}

/** Unsigned 64-bit accumulation, wrapping as the C does; `null` on a non-digit. */
function parseDigits(digits: readonly number[], hex: boolean): bigint | null {
  let u = 0n;
  for (const c of digits) {
    let d: number;
    if (c >= 0x30 && c <= 0x39) d = c - 0x30;
    else if (hex && c >= 0x61 && c <= 0x66) d = c - 0x61 + 10;
    else if (hex && c >= 0x41 && c <= 0x46) d = c - 0x41 + 10;
    else return null;
    u = hex ? ((u << 4n) | BigInt(d)) & U64 : (u * 10n + BigInt(d)) & U64;
  }
  return u;
}

/** Ox's `ox_ucs_to_utf8_chars`, including its fallback for out-of-range values. */
function ucsToUtf8(u: bigint): number[] {
  const n = Number(u);
  if (u <= 0x7fn) return [n];
  if (u <= 0x7ffn) return [0xc0 | (n >> 6), 0x80 | (n & 0x3f)];
  if (u <= 0xd7ffn || (0xe000n <= u && u <= 0xffffn)) {
    return [0xe0 | (n >> 12), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
  }
  if (0x10000n <= u && u <= 0x10ffffn) {
    return [
      0xf0 | (n >> 18),
      0x80 | ((n >> 12) & 0x3f),
      0x80 | ((n >> 6) & 0x3f),
      0x80 | (n & 0x3f),
    ];
  }
  // "assume it is UTF-8 encoded directly": the value's bytes, big-endian,
  // leading zero bytes skipped.
  const bytes: number[] = [];
  let reading = false;
  for (let shift = 56n; shift >= 0n; shift -= 8n) {
    const c = Number((u >> shift) & 0xffn);
    if (reading || c !== 0) {
      bytes.push(c);
      reading = true;
    }
  }
  return bytes;
}

/** Ox's `fix_newlines` over a C string: CRLF and lone CR become LF. */
function fixNewlines(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i] ?? 0;
    if (c === 0x0d) {
      if (bytes[i + 1] === 0x0a) continue;
      out.push(0x0a);
    } else {
      out.push(c);
    }
  }
  return Uint8Array.from(out);
}

/** `rb_str_new2`: the bytes up to the first NUL. */
function cstrOf(bytes: Uint8Array): Uint8Array {
  const nul = bytes.indexOf(0);
  return nul < 0 ? bytes : bytes.slice(0, nul);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- layers 3 and 4: Moxml's view, Lutaml's wrapper -------------------------

// `ignoreBOM`: a U+FEFF inside the document is content, never a signature.
// biome-ignore lint/style/useNamingConvention: the DOM option is spelled `ignoreBOM`.
const DECODER = new TextDecoder("utf-8", { ignoreBOM: true });
// biome-ignore lint/style/useNamingConvention: the DOM option is spelled `ignoreBOM`.
const STRICT_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** A byte string as a key: only compared, never shown. */
function latin(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return text;
}

/**
 * Text and attribute values go through Moxml's `restore_entities`, a regex
 * substitution, and Ruby refuses a regex over invalid UTF-8 (`ArgumentError`).
 */
function restoredValue(bytes: Uint8Array): string {
  let text: string;
  try {
    text = STRICT_DECODER.decode(bytes);
  } catch {
    throw new XmlReadError("invalid byte sequence in UTF-8");
  }
  return restoreEntities(text);
}

/** Ruby's `String#split(":")`: trailing empty fields removed. */
function rubySplitColon(text: string): string[] {
  const parts = text.split(":");
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** Ruby's `String#split(":", 2).last`. */
function afterFirstColon(text: string): string | null {
  if (text === "") return null;
  const colon = text.indexOf(":");
  return colon < 0 ? text : text.slice(colon + 1);
}

/** Moxml's `Namespace#prefix`: `nil` for `xmlns` itself, else minus `xmlns:`. */
function namespacePrefix(declared: string | null): string | null {
  if (declared === null || declared === "xmlns") return null;
  return declared.startsWith("xmlns:") ? declared.slice(6) : declared;
}

/** `node[attr_name]` over the element and then its ancestors. */
function lookupNamespace(
  prefix: string | null,
  element: OxElement,
  ancestors: readonly OxElement[],
): Uint8Array | null {
  const key = prefix === null ? "xmlns" : `xmlns:${prefix}`;
  const latinKey = latin(ENCODER.encode(key));
  for (const node of [element, ...ancestors]) {
    const found = node.attributes.get(latinKey);
    if (found !== undefined) return found.value;
  }
  return null;
}

function wrapElement(element: OxElement, ancestors: readonly OxElement[]): XmlReadElement {
  const rawName = DECODER.decode(element.name);
  const candidate = rawName.includes(":") ? (rubySplitColon(rawName)[0] ?? null) : null;
  const uriBytes = lookupNamespace(candidate, element, ancestors);
  const prefix = uriBytes === null ? null : namespacePrefix(candidate);
  const local = afterFirstColon(rawName);
  const name = local === null ? null : prefix === null ? local : `${prefix}:${local}`;

  // Own declarations, as Moxml's `namespace_definitions` lists them.
  const xmlns: (readonly [string, string])[] = [];
  const own = new Map<string | null, string>();
  for (const { name: attrName, value } of element.attributes.values()) {
    const key = DECODER.decode(attrName);
    if (key.startsWith("xmlns")) xmlns.push([key, DECODER.decode(value)]);
    if (key === "xmlns" || key.startsWith("xmlns:")) {
      // Lutaml's namespace table files an empty prefix (`xmlns:=`) under nil.
      own.set(namespacePrefix(key) || null, DECODER.decode(value));
    }
  }

  const children: XmlReadNode[] = [];
  const inner = [element, ...ancestors];
  for (const node of element.nodes) {
    switch (node.kind) {
      case "element":
        children.push(wrapElement(node, inner));
        break;
      case "text": {
        const text = restoredValue(node.value);
        if (text !== "") children.push({ kind: "text", text });
        break;
      }
      case "cdata": {
        const text = DECODER.decode(node.value);
        if (text !== "") children.push({ kind: "cdata", text });
        break;
      }
      case "comment":
        children.push({ kind: "comment", text: DECODER.decode(node.value) });
        break;
      case "pi":
        children.push({
          kind: "pi",
          target: DECODER.decode(node.target),
          text:
            node.content === null
              ? ""
              : DECODER.decode(node.content).replace(/^[ \t\r\n\f\v]+/, ""),
        });
        break;
      case "doctype":
        break;
    }
  }

  // Attributes last: Lutaml reads them after the children, so an invalid
  // value is refused in that order too (both refuse; the order is for fidelity).
  const attributes = new Map<string, string>();
  for (const { name: attrName, value } of element.attributes.values()) {
    const full = DECODER.decode(attrName);
    if (full.startsWith("xmlns")) continue;
    let attrPrefix: string | null = null;
    let attrLocal = full;
    if (full.includes(":")) {
      const colon = full.indexOf(":");
      attrPrefix = full.slice(0, colon);
      attrLocal = full.slice(colon + 1);
    }
    // Lutaml's `attr_is_namespace?` tests the local name before it reads the
    // value, so such an attribute is dropped without its value ever being
    // checked for valid UTF-8.
    if (attrLocal.startsWith("xmlns")) continue;
    const restored = restoredValue(value);
    if (own.size > 0 && own.has(attrLocal) && own.get(attrLocal) === restored) continue;
    const resolved =
      lookupNamespace(attrPrefix, element, ancestors) === null ? null : namespacePrefix(attrPrefix);
    const key = resolved === null || resolved === "" ? attrLocal : `${resolved}:${attrLocal}`;
    attributes.set(key, restored);
  }

  return {
    kind: "element",
    name,
    prefix,
    namespace: uriBytes === null ? null : DECODER.decode(uriBytes),
    attributes: [...attributes],
    xmlns,
    children,
  };
}
