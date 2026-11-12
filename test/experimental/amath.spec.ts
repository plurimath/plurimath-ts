import { describe, expect, it, vi } from "vitest";
import { normalize, ParseError } from "../../src/core/index";
import { type AmathCapture, createAsciimathParser } from "../../src/formats/asciimath/amath";
import { parseAsciimath, parseAsciimathTree } from "../../src/formats/asciimath/parser";
import { Slice } from "../../src/pegkit/index";

/** Consumer-boundary fixture only; real stage artifact qualification is separate. */
function stageTree(value: unknown, input: string): AmathCapture {
  if (value instanceof Slice)
    return {
      text: value.text,
      offset: new TextEncoder().encode(input.slice(0, value.offset)).length,
    };
  if (value === null || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((child) => stageTree(child, input));
  return Object.fromEntries(
    Object.entries(value as object).map(([key, child]) => [key, stageTree(child, input)]),
  );
}

function fixtureBinding() {
  return {
    parseTree: vi.fn((input: string, { decimal }: { decimal: string }) => {
      const locale = decimal === "," ? "de" : decimal === "٫" ? "ar" : undefined;
      return stageTree(parseAsciimathTree(input, locale ? { locale } : undefined), input);
    }),
  };
}

describe("initialized amath consumer boundary", () => {
  it.each(["1", "frac(1)(2)", "sqrt(x)", "{:x:}", '"😀"'])(
    "maps shared captures into the existing core and retains caller input: %s",
    (input) => {
      const binding = fixtureBinding();
      const actual = createAsciimathParser(binding)(input);
      expect(normalize(actual)).toEqual(normalize(parseAsciimath(input)));
      expect(binding.parseTree).toHaveBeenCalledTimes(1);
    },
  );

  it("forwards a per-call comma decimal marker without global configuration", () => {
    const binding = fixtureBinding();
    const parser = createAsciimathParser(binding);
    expect(normalize(parser("1,5", { locale: "de" }))).toEqual(
      normalize(parseAsciimath("1,5", { locale: "de" })),
    );
    parser("1.5");
    expect(binding.parseTree.mock.calls.map((call) => call[1].decimal)).toEqual([",", "."]);
  });

  it("refuses invalid options before invoking the shared parser", () => {
    const binding = fixtureBinding();
    expect(() => createAsciimathParser(binding)("1", { locale: "not-a-locale" })).toThrow();
    expect(binding.parseTree).not.toHaveBeenCalled();
  });

  it("maps a UTF-8 byte position through preprocessing to original UTF-16 input", () => {
    const error = Object.assign(new Error("stage rejected"), { byteOffset: 4, charOffset: 2 });
    const parser = createAsciimathParser({
      parseTree: () => {
        throw error;
      },
    });
    try {
      parser("{:x?"); // stage input is ℒx?: 3 UTF-8 bytes for ℒ, then x.
      expect.unreachable("must reject");
    } catch (failure) {
      expect(failure).toBeInstanceOf(ParseError);
      expect((failure as ParseError).index).toBe(3);
      expect((failure as ParseError).input).toBe("{:x?");
    }
  });

  it("keeps an unknown stage position unknown rather than mapping it into trimmed text", () => {
    const error = Object.assign(new Error("nesting limit"), { byteOffset: null, charOffset: null });
    const parser = createAsciimathParser({
      parseTree: () => {
        throw error;
      },
    });
    expect(() => parser("  x")).toThrowError(expect.objectContaining({ index: 0 }));
  });

  it("preserves an artifact failure without silently selecting another parser", () => {
    const error = new Error("artifact checksum mismatch");
    const parser = createAsciimathParser({
      parseTree: () => {
        throw error;
      },
    });
    expect(() => parser("1")).toThrow(error);
  });

  it("rejects a capture whose byte offset disagrees with its input", () => {
    const parser = createAsciimathParser({
      parseTree: () => ({ number: { text: "2", offset: 0 } }),
    });
    expect(() => parser("1")).toThrow("does not match");
  });
});
