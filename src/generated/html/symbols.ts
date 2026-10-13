/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * Symbol id -> the static html representation of that symbol.
 *
 * Symbol ids are the Ruby class keys (`Sigma`, `Paren::Lround`) and are
 * schema values: an upstream rename needs an alias entry, never a silent
 * change (§7). Context-dependent symbols carry their variants in
 * `./exceptions.ts`; a renderer applies those over this descriptor.
 */

import { SYMBOL_CANONICAL_VALUES } from "../../core/generated/symbol-canonical";

/**
 * The rule `HTML_SYMBOLS` is derived by: every code point above U+007F
 * written as a lowercase hexadecimal character reference.
 */
function encodeNonAscii(text: string): string {
  let out = "";
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    out += point > 0x7f ? `&#x${point.toString(16)};` : char;
  }
  return out;
}

/**
 * The 32 of 1459 symbols whose `to_html` is not their
 * canonical value with `encodeNonAscii` applied, mostly ASCII
 * punctuation the gem entity-encodes. Applied over the derived rows.
 */
export const HTML_SYMBOL_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["Atsign", "&#x40;"],
  ["Backslash", "&#x5c;"],
  ["Bar", "¯"],
  ["Comma", "&#x2c;"],
  ["Dots", "&#x2026;"],
  ["Eqno", "&#x23;"],
  ["Exclam", "&#x21;"],
  ["Greater", "&#x3e;"],
  ["Gt", "&#x3e;"],
  ["Less", "&#x3c;"],
  ["Lparen", "&#x28;"],
  ["Lt", "&#x3c;"],
  ["Mathcolon", "&#x3a;"],
  ["Mathdollar", "&#x24;"],
  ["Octothorpe", "&#x23;"],
  ["Paren::Langle", "&#x2329;"],
  ["Paren::Lbrace", "&#x7b;"],
  ["Paren::Lbrack", "&#x5b;"],
  ["Paren::Rangle", "&#x232a;"],
  ["Paren::Rbrace", "&#x7d;"],
  ["Paren::Rbrack", "&#x5d;"],
  ["Percent", "&#x25;"],
  ["Period", "&#x2e;"],
  ["Pi", "&#x3C0;"],
  ["Plus", "&#x2b;"],
  ["Question", "&#x3f;"],
  ["Rparen", "&#x29;"],
  ["Semicolon", "&#x3b;"],
  ["Sphat", "&#x5e;"],
  ["Sprime", "&#x27;"],
  ["Sptilde", "&#x7e;"],
  ["Ul", "_"],
]);

/**
 * sha256 over the measured table, one "id TAB value LF" line per
 * row, the lines sorted by their UTF-8 bytes, so a spec can prove the
 * derivation below reproduces what the generator measured.
 */
export const HTML_SYMBOLS_SHA256: string =
  "5c8c3f8b9387194766e1ce699e2b7753a9e84da4e0a424f48f8fb9a617a26996";

/**
 * 1459 symbols. An id missing here is a parity gap: the
 * renderer throws `MissingSymbolDataError` rather than emitting
 * something plausible.
 */
export const HTML_SYMBOLS: ReadonlyMap<string, string> = /* @__PURE__ */ (() => {
  const table = new Map<string, string>();
  for (const [id, value] of SYMBOL_CANONICAL_VALUES) table.set(id, encodeNonAscii(value));
  for (const [id, value] of HTML_SYMBOL_OVERRIDES) table.set(id, value);
  return table;
})();

/**
 * Symbol id -> the string `Fenced#to_html` puts in a paren slot, for
 * all 24 `Math::Symbols::Paren` subclasses of the 1459 symbols.
 * `symbol_or_paren` (`math/function/fenced.rb:324-336`) routes `:html`
 * down the `:mathml` arm, so the slot gets
 * `to_mathml_without_math_tag(false, options: {}).nodes.first` and NOT
 * `Paren#to_html`. The two disagree on 13 of these ids, because each
 * class writes its mathml as either `ox_element("mi") << encoded`
 * (the entity DECODED, `paren/lbbrack.rb:33-35`) or `<< paren_value`
 * (the entity RAW, `paren/langle.rb:33-35`), with no rule relating the
 * two — so this is measured, never derived from `HTML_SYMBOLS`.
 * Verified through one live `Fenced#to_html` render per id. An id
 * absent here is not a Paren subclass; a Paren subclass absent here is
 * the parity gap that throws.
 */
export const HTML_FENCED_PAREN_PAYLOADS: ReadonlyMap<string, string> = new Map([
  ["Paren::CloseParen", "&#x3017;"],
  ["Paren::Langle", "&#x2329;"],
  ["Paren::Lbbrack", "⟦"],
  ["Paren::Lbrace", "{"],
  ["Paren::Lbrack", "["],
  ["Paren::Lceil", "⌈"],
  ["Paren::Lcurly", "{"],
  ["Paren::Lfloor", "⌊"],
  ["Paren::Lround", "("],
  ["Paren::Lsquare", "["],
  ["Paren::Norm", "‖"],
  ["Paren::OpenParen", "&#x3016;"],
  ["Paren::Rangle", "&#x232a;"],
  ["Paren::Rbbrack", "⟧"],
  ["Paren::Rbrace", "}"],
  ["Paren::Rbrack", "]"],
  ["Paren::Rceil", "⌉"],
  ["Paren::Rcurly", "}"],
  ["Paren::Rfloor", "⌋"],
  ["Paren::Rround", ")"],
  ["Paren::Rsquare", "]"],
  ["Paren::UpcaseLangle", "⟪"],
  ["Paren::UpcaseRangle", "⟫"],
  ["Paren::Vert", "|"],
]);
