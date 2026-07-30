/**
 * The error contract (ARCHITECTURE.md §5): `code` is the guaranteed
 * discriminator, message text is never API.
 */

import { describe, expect, it } from "vitest";
import {
  MissingSymbolDataError,
  ParseError,
  PlurimathError,
  RenderError,
  UnsupportedFormatError,
} from "../../src/core/index";

describe("error contract", () => {
  it("gives every error a stable code", () => {
    expect(new ParseError("m", "x^", "asciimath", 2).code).toBe("PARSE_ERROR");
    expect(new UnsupportedFormatError("omml").code).toBe("UNSUPPORTED_FORMAT");
    expect(new MissingSymbolDataError("Sigma", "mathml").code).toBe("MISSING_SYMBOL_DATA");
    expect(new RenderError("m", "mathml", "frac").code).toBe("RENDER_ERROR");
  });

  it("carries structured fields rather than expecting message parsing", () => {
    const error = new ParseError("failed", "x^", "asciimath", 2);
    expect(error.input).toBe("x^");
    expect(error.format).toBe("asciimath");
    expect(error.index).toBe(2);
  });

  it("keeps the Error contract intact", () => {
    const error = new UnsupportedFormatError("omml");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PlurimathError);
    expect(error.name).toBe("UnsupportedFormatError");
    expect(error.stack).toBeDefined();
  });

  it("lets a consumer discriminate on code alone, without instanceof", () => {
    const errors: PlurimathError[] = [
      new ParseError("m", "x", "asciimath", 0),
      new RenderError("m", "mathml", "frac"),
    ];
    expect(errors.map((error) => error.code)).toEqual(["PARSE_ERROR", "RENDER_ERROR"]);
  });
});
