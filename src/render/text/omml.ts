import { RenderError } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import {
  FORMAT,
  type NodeOf,
  type RenderContext,
  requireString,
  textElement,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

const UNICODE_TOKEN = /unicode\[:\w+\]/;

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

function encodeOmmlText(value: string): string {
  const decoded = htmlEntityToUnicode(value.replaceAll(" ", "&#xa0;"));
  let encoded = "";
  // Code points, not UTF-16 units: Ruby's `gsub` matches whole characters, so
  // an astral character encodes to one reference built from its own codepoint.
  for (const character of decoded) {
    const codepoint = character.codePointAt(0) as number;
    encoded += hexEncoded(codepoint) ? `&#x${codepoint.toString(16)};` : character;
  }
  return encoded;
}

/** `Text#to_omml_without_math_tag`: direct `m:t`, with generated lookup deferred. */
export function renderText(node: NodeOf<"text">): XmlElement {
  const value = requireString(node.parameterOne, node.kind, "text.parameterOne");
  if (UNICODE_TOKEN.test(value)) {
    throw new RenderError(
      "text.parameterOne: unicode[:name] substitution needs generated OMML data, deferred to the symbol-data follow-up",
      FORMAT,
      node.kind,
    );
  }
  return textElement(encodeOmmlText(value));
}

/** Default-language Text insertion adds `m:rPr/m:sty`; `lang: omml` is unmeasured. */
export function renderTextInserted(node: NodeOf<"text">, _context: RenderContext): XmlElement {
  if (node.lang !== null && node.lang !== undefined) {
    throw new RenderError(
      `Text lang "${node.lang}" has not been measured for OMML insertion in this slice`,
      FORMAT,
      node.kind,
    );
  }
  const properties = new XmlElement("m:rPr").append(
    new XmlElement("m:sty").setAttribute("m:val", "p"),
  );
  return new XmlElement("m:r").append(properties, renderText(node));
}
