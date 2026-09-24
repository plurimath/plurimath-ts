import {
  decodeEntities,
  type NodeOf,
  type RenderContext,
  requireString,
  textElement,
} from "../../formats/omml/render-shared";
import { OMML_SYMBOLS_INVERT, OMML_UNICODE_INVERT } from "../../generated/omml/render-tables";
import { XmlElement } from "../../xml/index";

/** `Text::PARSER_REGEX` (`text.rb:7`): `unicode\[:(?<unicode>\w{1,})\]`. */
const UNICODE_TOKEN = /unicode\[:(\w+)\]/g;

/**
 * `Text#first_value("omml")` (text.rb:144-151) re-encodes through
 * `HTMLEntities.new.encode(..., :hexadecimal)`, whose default `xhtml1` flavour
 * makes two passes (htmlentities-4.4.2 `Encoder`):
 *
 * - `replace_basic` over `/[<>'"&]/`
 * - `replace_extended` over `/[^\u{20}-\u{7E}]/`
 *
 * both writing `"&#x#{codepoint.to_s(16)};"` — lowercase, NOT zero-padded. So
 * printable ASCII survives verbatim apart from those five characters, and
 * everything else — every C0 control, DEL, and all non-ASCII — becomes a hex
 * reference. Measured on the oracle at `00c52783`: U+0001 gives
 * `<m:t>&#x1;</m:t>`, U+001F `<m:t>&#x1f;</m:t>`, U+007F `<m:t>&#x7f;</m:t>`,
 * U+0080 `<m:t>&#x80;</m:t>`.
 *
 * The zero-padded four-digit spelling belongs to the OTHER escaping layer: Ox
 * writes an unescaped C0 control as `&#x000b;` (`src/xml/serializer.ts`), and
 * passes DEL through raw. Encoding here is what keeps those characters away
 * from that layer, so every codepoint left unencoded here changed the bytes.
 */
const BASIC_ENTITY_CODEPOINTS = new Set([0x22, 0x26, 0x27, 0x3c, 0x3e]);

function hexEncoded(codepoint: number): boolean {
  return codepoint < 0x20 || codepoint > 0x7e || BASIC_ENTITY_CODEPOINTS.has(codepoint);
}

function encodeOmmlText(value: string, kind: string): string {
  const decoded = decodeEntities(value.replaceAll(" ", "&#xa0;"), kind, "text.parameterOne");
  let encoded = "";
  // Code points, not UTF-16 units: Ruby's `gsub` matches whole characters, so
  // an astral character encodes to one reference built from its own codepoint.
  for (const character of decoded) {
    const codepoint = character.codePointAt(0) as number;
    encoded += hexEncoded(codepoint) ? `&#x${codepoint.toString(16)};` : character;
  }
  return encoded;
}

/**
 * `Text#to_omml_without_math_tag`: `parse_text("omml") || parameter_one`
 * (text.rb:39-43), where `parse_text` (text.rb:131-146) first runs
 * `first_value("omml")` through `encodeOmmlText` above, THEN substitutes every
 * `unicode[:name]` token in the ENCODED string through `Text#symbol_value`
 * (text.rb:126-129) — `Mathml::Constants::UNICODE_SYMBOLS.invert[name] ||
 * SYMBOLS.invert[name]`. Order matters only in principle: every character a
 * token is built from (`u n i c o d e [ : ] \w`) is printable ASCII outside
 * `BASIC_ENTITY_CODEPOINTS`, so `encodeOmmlText` never touches a token, and
 * running the substitution first would read the same bytes.
 *
 * A name absent from BOTH tables is not a parity gap: Ruby's `gsub` block
 * substitutes the empty string for a `nil` return (measured,
 * `Text.new("unicode[:nosuchname]")` renders `<m:t></m:t>` on the pinned
 * oracle) rather than raising, so a miss here renders empty exactly the same
 * way.
 */
export function renderText(node: NodeOf<"text">): XmlElement {
  // `text << (parse_text("omml") || parameter_one)` with a nil `parameter_one`
  // writes an EMPTY-content `m:t`, not a self-closed one. Measured on the
  // pinned oracle `00c52783`: `Text.new(nil)` writes `<m:t></m:t>` from
  // `to_omml_without_math_tag` directly and in a `Formula` alone, inside a
  // `Frac` and inside an `Mrow` — the same bytes as `Text.new("")`. `false`,
  // `true`, `0` and `[]` make the gem raise, and still refuse here.
  const raw = node.parameterOne;
  const value =
    raw === null || raw === undefined ? "" : requireString(raw, node.kind, "text.parameterOne");
  const encoded = encodeOmmlText(value, node.kind);
  const substituted = encoded.replace(
    UNICODE_TOKEN,
    (_token, name: string) => OMML_UNICODE_INVERT.get(name) ?? OMML_SYMBOLS_INVERT.get(name) ?? "",
  );
  return textElement(substituted);
}

/**
 * `Text#insert_t_tag` (text.rb:49-59): `m:rPr/m:sty` is added for every
 * `@lang` EXCEPT the string `"omml"` — `@lang&.to_s != "omml"` — so a `null`
 * lang (the common case) gets the style run same as any other non-`"omml"`
 * lang, and only `lang: "omml"` skips it. Measured on the oracle at
 * `00c52783`: `Text.new("hello", lang: :omml).insert_t_tag` yields
 * `<m:r><m:t>hello</m:t></m:r>` with no `m:rPr`, while `lang: nil` and
 * `lang: "somethingelse"` both add the `m:rPr/m:sty` wrapper.
 */
export function renderTextInserted(node: NodeOf<"text">, _context: RenderContext): XmlElement {
  if (node.lang === "omml") {
    return new XmlElement("m:r").append(renderText(node));
  }
  const properties = new XmlElement("m:rPr").append(
    new XmlElement("m:sty").setAttribute("m:val", "p"),
  );
  return new XmlElement("m:r").append(properties, renderText(node));
}
