/**
 * `parseHtml`'s own contract — the three checks `Plurimath::Math.parse` and
 * `Html::Parser#parse` run outside the grammar entirely, none of which a
 * fixture-driven parity suite exercises because every fixture is a valid
 * `(text, options)` pair to begin with:
 *
 *   - The JSON round trip's structural nesting limit (`html/parser.rb:18`,
 *     `JSON.parse(nodes.to_json, ...)`), inherited from Ruby's JSON library
 *     defaulting `max_nesting` to 100.
 *   - Unknown parse option KEYS, rejected by `Math.parse` (`math.rb:33-34`)
 *     before any format-specific class is even constructed.
 *   - The ORDER option validation runs in relative to normalisation: the
 *     gem validates options in `Math.parse` before `parse_formula` ever
 *     touches the text, where this port used to validate the locale only
 *     once the grammar was already being built — after normalisation had a
 *     chance to raise its own, different error.
 *
 * Measured against the oracle (v0.11.6, `00c52783`, 2026-09-10).
 */

import { describe, expect, it } from "vitest";
import { ParseError, type ParseOptionError } from "../../../src/core/errors";
import type { HtmlParseOptions } from "../../../src/formats/html/parser";
import { parseHtml } from "../../../src/formats/html/parser";

describe("the JSON round trip's structural nesting limit", () => {
  // Measured on the oracle: `Plurimath::Html::Parser.new("x" * n).parse`
  // raises `JSON::NestingError: nesting of 100 is too deep` for n=101 and
  // succeeds for n=100. `Html::Parse#sequence`/`#expression` (html/parse.rb:
  // 104-124) nest one `expression` key per extra character, so a run of `n`
  // letters is a Parslet tree `n` levels deep — this is a STRUCTURAL limit
  // on the tree, not a limit on `n` itself, and `n` is only how this
  // particular grammar rule happens to reach that depth.
  it("parses a 100-character run of letters (at the limit)", () => {
    const node = parseHtml("x".repeat(100));
    expect(node).toBeDefined();
  });

  it("refuses a 101-character run of letters (one past the limit)", () => {
    let caught: unknown;
    try {
      parseHtml("x".repeat(101));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as ParseError).code).toBe("PARSE_ERROR");
  });
});

describe("unknown parse options", () => {
  // Measured: `Plurimath::Math.parse("x", :html, nosuchoption: true)` raises
  // `Plurimath::Math::ParseOptionError: unknown parse option: :nosuchoption;
  // supported parse options are :locale`, and `e.is_a?(Plurimath::Math::
  // ParseError)` is `false` — the raise happens in `Math.parse` itself,
  // before the `begin`/`rescue StandardError` block that turns everything
  // else into a `ParseError`.
  it("rejects a key `HtmlParseOptions` does not declare", () => {
    const bad = { nosuchoption: true } as unknown as HtmlParseOptions;
    let caught: unknown;
    try {
      parseHtml("x", bad);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ParseError);
    expect((caught as ParseOptionError).code).toBe("PARSE_OPTION_ERROR");
  });

  it("accepts every key the interface actually declares", () => {
    expect(() => parseHtml("x", { locale: "de" })).not.toThrow();
    expect(() => parseHtml("x", { onUnsupported: () => {} })).not.toThrow();
  });
});

describe("option validation runs ahead of normalisation", () => {
  // Measured: `Plurimath::Math.parse("&#55296;", :html, locale: "xx")`
  // raises `Plurimath::Errors::UnsupportedLocale`, not the `ParseError` that
  // `&#55296;` alone raises (a lone surrogate, `RangeError: invalid
  // codepoint 0xD800 in UTF-8`, from normalisation). The bad locale is
  // reported first because the gem validates options in `Math.parse` before
  // `parse_formula` ever runs `Html::Parser#normalized_text`.
  it("reports the unsupported locale, not the normalisation failure", () => {
    let caught: unknown;
    try {
      parseHtml("&#55296;", { locale: "xx" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: unknown }).code).toBe("UNSUPPORTED_LOCALE");
  });

  it("still reports the same unsupported-locale error for plain input", () => {
    let caught: unknown;
    try {
      parseHtml("x", { locale: "xx" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: unknown }).code).toBe("UNSUPPORTED_LOCALE");
  });
});
