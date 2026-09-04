import { SYMBOL_CANONICAL_VALUES } from "../../core/generated/symbol-canonical";
import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import { assertReproducibleRubyHashOrder, rubyNumberToS } from "../../core/ruby-semantics";
import {
  decodeEntities,
  describeSlot,
  FORMAT,
  isOptionHash,
  type NodeOf,
  ommlFormulaSlot,
  type RenderContext,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * The kinds `symbol_or_paren` can read a delimiter off. `unaryFunction` is
 * here for exactly one name — `Ms`, the only `UnaryFunction` subclass the gem
 * gives a `#value` (ms.rb:29-31). `delimiterCarrier` enforces that.
 */
type DelimiterKind = "symbol" | "number" | "text" | "formula" | "mrow" | "table" | "unaryFunction";

/**
 * What `symbol_or_paren` hands back: never a node, always a Ruby value that
 * the attribute write will stringify.
 */
type DelimiterValue = string | readonly unknown[] | Readonly<Record<string, unknown>>;

export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): XmlElement {
  assertConstructorValidation(node);
  // `open_paren` runs to completion — read, decode, write — before
  // `close_paren` starts, so a refusal on the open delimiter must win.
  const open = delimiterAttribute(node.parameterOne, "fenced.parameterOne");
  const close = delimiterAttribute(node.parameterThree, "fenced.parameterThree");
  const properties = new XmlElement("m:dPr").append(
    open === null ? null : new XmlElement("m:begChr").setAttribute("m:val", open),
    new XmlElement("m:sepChr").setAttribute("m:val", ""),
    close === null ? null : new XmlElement("m:endChr").setAttribute("m:val", close),
  );
  return new XmlElement("m:d").append(
    properties,
    ommlFormulaSlot(node.parameterTwo, "e", context, node.kind, "fenced.parameterTwo"),
  );
}

/**
 * `Fenced#initialize` calls `ModelHelper.validate_left_right` over its three
 * slots (`ternary_function.rb:16`), and that helper sends `first` to the
 * `value` of any slot holding a `Math::Formula` (`model_helper.rb:18-22`).
 * So a Formula or Mrow slot whose value is neither a list nor a hash raises
 * before a single tag is built — measured on the oracle at `00c52783`:
 * `NoMethodError: undefined method 'first'` for an instance of String, for an
 * instance of Integer, for true, and for nil. `Table` is not a
 * `Math::Formula`, so it is exempt, and a Table holding `"raw"` renders
 * `m:val="raw"`.
 *
 * This port's constructors do not validate (ARCHITECTURE.md §5), so the
 * refusal lands here, at the first renderer that can observe it. It covers
 * this one constructor; `validate_left_right` runs in every function
 * constructor in the gem, and the rest stays unmodelled
 * (TODO.plan/deferred.md).
 */
function assertConstructorValidation(node: NodeOf<"fenced">): void {
  const slots = [
    [node.parameterOne, "fenced.parameterOne"],
    [node.parameterTwo, "fenced.parameterTwo"],
    [node.parameterThree, "fenced.parameterThree"],
  ] as const;
  for (const [slot, at] of slots) {
    if (!hasNodeKind(slot)) continue;
    const carrier = slot as MathNode;
    if (carrier.kind !== "formula" && carrier.kind !== "mrow") continue;
    const held: unknown = carrier.value;
    if (Array.isArray(held) || isOptionHash(held)) continue;
    throw new RenderError(
      `${at}: a "${carrier.kind}" node holds ${describeSlot(held)}, and the gem's Fenced ` +
        "constructor sends `first` to it before rendering — it raises NoMethodError there",
      FORMAT,
      "fenced",
    );
  }
}

/**
 * `open_paren`/`close_paren`: read the delimiter, then write it as `m:val`.
 * Returns nil where the gem returns `dpr` untouched, so the caller drops the
 * tag.
 *
 * The value is entity-decoded TWICE, and both stages are load-bearing.
 * `Utility.html_entity_to_unicode` runs once on what the reader returned
 * (`fenced.rb:225`), and the XML wrapper runs it again on every attribute it
 * writes (`ox_engine/element.rb:104-110`; the Oga wrapper's `encode_entities`
 * does the same). Measured on the oracle at `00c52783`, a `Symbol` delimiter
 * valued `"&amp;#x28;"` emits `m:val="("` and one valued `"&amp;copy;"` emits
 * `m:val="©"`; a single decode leaves `&#x28;` and `&copy;` standing.
 */
function delimiterAttribute(value: unknown, at: string): string | null {
  const node = delimiterCarrier(value, at);
  if (node === null) return null;
  const raw = parenValue(node, at);
  if (raw === null) return null;
  // `html_entity_to_unicode` short-circuits on `include?`, so a collection
  // reaches `HTML_ENTITIES.decode` — which stringifies its argument — only
  // when the collection itself holds "&". Measured: a `Formula` valued
  // `["&", "&amp;#x28;"]` decodes twice and emits `["&", "("]`, while
  // `["x", "&amp;#x28;"]` decodes once and emits `["x", "&#x28;"]`.
  const stringified = rubyIncludesAmpersand(raw)
    ? decodeEntities(rubyToString(raw, node.kind, at), "fenced", at)
    : rubyToString(raw, node.kind, at);
  return decodeEntities(stringified, "fenced", at);
}

/** The carrier `symbol_or_paren` is handed, or nil for an absent slot. */
function delimiterCarrier(value: unknown, at: string): (MathNode & { kind: DelimiterKind }) | null {
  if (value === null || value === undefined) return null;
  if (!hasNodeKind(value)) {
    throw new RenderError(
      `${at}: cannot read a value from ${describeSlot(value)} — the gem raises NoMethodError here`,
      FORMAT,
      "fenced",
    );
  }
  const node = value as MathNode;
  switch (node.kind) {
    case "symbol":
    case "number":
    case "text":
    case "formula":
    case "mrow":
    case "table":
      return node as MathNode & { kind: DelimiterKind };
    case "unaryFunction": {
      // Measured over every class under `Plurimath::Math::Function` at
      // `00c52783`: exactly three define `#value` — `Ms`, `Table` and `Text`.
      // The last two are carriers of their own above, so `Ms` is the single
      // unary function `symbol_or_paren` can read, and every other one reaches
      // it with no reader.
      const name = (node as { readonly name?: unknown }).name;
      if (name === "Ms") return node as MathNode & { kind: DelimiterKind };
      throw new RenderError(
        `${at}: a "${node.kind}" node named ${JSON.stringify(name)} has no value reader — ` +
          "the gem raises NoMethodError here",
        FORMAT,
        "fenced",
      );
    }
    default:
      throw new RenderError(
        `${at}: a "${node.kind}" node has no value reader — the gem raises NoMethodError here`,
        FORMAT,
        "fenced",
      );
  }
}

function parenValue(node: MathNode & { kind: DelimiterKind }, at: string): DelimiterValue | null {
  if (node.kind === "symbol") {
    // `symbol_or_paren` branches on `is_a?(Math::Symbols::Paren)` — the CLASS
    // decides, and a carrier that names no class is the bare `Symbol`, which
    // is not a Paren. `validate.ts` admits a concrete carrier with its
    // identity slot omitted (the bare class IS a Ruby class), so `id` can be
    // absent at runtime even though the model declares it required.
    const id: unknown = node.id;
    if (typeof id === "string" && id.startsWith("Paren::")) {
      const canonical = SYMBOL_CANONICAL_VALUES.get(id);
      if (canonical !== undefined) return canonical;
      throw new RenderError(
        `${at}: named paren "${id}" is unknown to the oracle`,
        FORMAT,
        "fenced",
      );
    }
    return slotValue(node.value, node.kind, at);
  }
  // `Text#value` and `Ms#value` are both `parameter_one`; every other carrier
  // reads `value`.
  const held: unknown =
    node.kind === "text" || node.kind === "unaryFunction" ? node.parameterOne : node.value;
  return slotValue(held, node.kind, at);
}

/**
 * `field&.value`, unconverted. The gem sends `include?` to whatever comes
 * back, so a String, list or hash survives and everything else raises there.
 */
function slotValue(value: unknown, kind: DelimiterKind, at: string): DelimiterValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value) || typeof value === "object") return value as DelimiterValue;
  throw new RenderError(
    `${at}: a "${kind}" node holds ${describeSlot(value)}; the gem sends include? to it and raises NoMethodError here`,
    FORMAT,
    "fenced",
  );
}

/** `string&.include?("&")`: a substring on a String, a member on a list, a KEY on a hash. */
function rubyIncludesAmpersand(value: DelimiterValue): boolean {
  if (typeof value === "string") return value.includes("&");
  if (Array.isArray(value)) return value.some((item) => item === "&");
  return Object.hasOwn(value, "&");
}

/**
 * `#to_s`, which the attribute write applies: identity on a String, and
 * `#inspect` on a list or a hash.
 */
function rubyToString(value: DelimiterValue, kind: DelimiterKind, at: string): string {
  if (typeof value === "string") return value;
  return deterministicRubyInspect(value, kind, at);
}

function deterministicRubyInspect(value: unknown, kind: DelimiterKind, at: string): string {
  if (containsNodeObject(value)) {
    throw new RenderError(
      `${at}: holds a "${kind}" node whose value contains node objects with nondeterministic Ruby #inspect addresses`,
      FORMAT,
      "fenced",
    );
  }
  return rubyInspect(value, kind, at);
}

function containsNodeObject(value: unknown, seen = new Set<object>()): boolean {
  if (hasNodeKind(value)) return true;
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return children.some((child) => containsNodeObject(child, seen));
}

function rubyInspect(value: unknown, kind: DelimiterKind, at: string): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return rubyInspectString(value, kind, at);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    const printed = rubyNumberToS(value);
    if (printed !== null) return printed;
    throw new RenderError(
      `${at}: a "${kind}" node contains the number ${String(value)}, whose Ruby #inspect spelling this port cannot reproduce`,
      FORMAT,
      "fenced",
    );
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => rubyInspect(item, kind, `${at}[${index}]`)).join(", ")}]`;
  }
  if (typeof value === "object") {
    assertReproducibleRubyHashOrder(value, FORMAT, "fenced", at);
    return `{${Object.entries(value as Record<string, unknown>)
      .map(
        ([key, item]) =>
          `${rubyInspectString(key, kind, `${at}.${key}`)} => ${rubyInspect(item, kind, `${at}.${key}`)}`,
      )
      .join(", ")}}`;
  }
  throw new RenderError(
    `${at}: a "${kind}" node contains ${describeSlot(value)}, which has no measured Ruby #inspect spelling`,
    FORMAT,
    "fenced",
  );
}

/**
 * Every code point Ruby's `String#inspect` escapes, and nothing else.
 *
 * Past the named escapes below, `rb_str_inspect` copies a character through
 * when `rb_enc_isprint` calls it printable and escapes it otherwise. That
 * predicate reads Onigmo's Unicode tables, so the escaped set is not "C0
 * controls and DEL": C1 controls, U+2028/U+2029, unassigned code points and
 * noncharacters all escape, while NBSP, ZWSP, U+FEFF, private use and emoji
 * do not.
 *
 * The set was measured rather than reasoned about. Every one of the
 * 1,112,064 non-surrogate code points went through `String#inspect` on the
 * oracle's Ruby 4.0.1, giving 740 escaped ranges, and this predicate
 * reproduced all of them with zero disagreements. That agreement is between
 * ONE Ruby and ONE Node — Ruby 4.0.1 reports `UNICODE_VERSION` 17.0.0 and
 * Node 24.18.0 reports `process.versions.unicode` 17.0 — and it is not a
 * property of the two languages. The gemspec allows `>= 3.2.0`
 * (plurimath.gemspec:14), so the gem disagrees with ITSELF across its own
 * supported range wherever those Rubies ship different tables; pinning this
 * predicate to one Unicode version would create a divergence rather than
 * remove one. The boundary cases pinned in the OMML renderer spec are what
 * catches either side moving.
 */
const RUBY_NONPRINTING = /[\p{Cc}\p{Cn}\p{Cs}\p{Zl}\p{Zp}]/u;

function rubyInspectString(value: string, kind: DelimiterKind, at: string): string {
  let inspected = '"';
  for (let index = 0; index < value.length; ) {
    const codepoint = value.codePointAt(index) as number;
    const character = String.fromCodePoint(codepoint);
    const next = value[index + character.length];
    switch (character) {
      case '"':
        inspected += '\\"';
        break;
      case "\\":
        inspected += "\\\\";
        break;
      case "\u0007":
        inspected += "\\a";
        break;
      case "\b":
        inspected += "\\b";
        break;
      case "\t":
        inspected += "\\t";
        break;
      case "\n":
        inspected += "\\n";
        break;
      case "\v":
        inspected += "\\v";
        break;
      case "\f":
        inspected += "\\f";
        break;
      case "\r":
        inspected += "\\r";
        break;
      case "\u001b":
        inspected += "\\e";
        break;
      case "#":
        inspected += next === "{" || next === "@" || next === "$" ? "\\#" : "#";
        break;
      default:
        inspected += inspectCodepoint(codepoint, character, kind, at);
    }
    index += character.length;
  }
  return `${inspected}"`;
}

/**
 * The escape spelling, also measured: `\uXXXX` up to U+FFFF and `\u{XXXXX}`
 * above it, hex in upper case, and consecutive escapes never grouped —
 * `"͸͹\u{10FFFE}\u{10FFFF}"`.
 */
function inspectCodepoint(
  codepoint: number,
  character: string,
  kind: DelimiterKind,
  at: string,
): string {
  if (codepoint >= 0xd800 && codepoint <= 0xdfff) {
    // A lone UTF-16 surrogate. Ruby cannot BUILD the code point —
    // `0xD800.chr(Encoding::UTF_8)` raises `RangeError: invalid codepoint
    // 0xD800 in UTF-8` — but a String can still carry the bytes: measured on
    // the oracle's Ruby 4.0.1, `[0xD800].pack("U*")` gives a UTF-8 String
    // whose `valid_encoding?` is false and whose `inspect` is
    // `"\xED\xA0\x80"`, byte escapes rather than `\uD800`.
    //
    // So this refusal is NOT what the gem would do with the same bytes, and
    // the message below overstates it. Deciding whether to match the gem's
    // byte escapes here is a code change, tracked separately; the comment is
    // corrected now so it stops teaching the wrong mechanism.
    throw new RenderError(
      `${at}: a "${kind}" node contains the lone surrogate U+${codepoint
        .toString(16)
        .toUpperCase()}, which a Ruby UTF-8 string cannot hold`,
      FORMAT,
      "fenced",
    );
  }
  if (!RUBY_NONPRINTING.test(character)) return character;
  const hex = codepoint.toString(16).toUpperCase();
  return codepoint > 0xffff ? `\\u{${hex}}` : `\\u${hex.padStart(4, "0")}`;
}
