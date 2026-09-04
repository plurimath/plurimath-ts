/**
 * The corpus YAML reader, against Psych.
 *
 * The reader's promise is that it throws rather than guesses: a silent misparse
 * would make the corpus agree with a broken model. The escape cases below were
 * run through `Psych.load` on Ruby 4.0.1 / Psych 5.4.0 first — every input in
 * "malformed escapes" raises `Psych::SyntaxError` there, and every input in
 * "escapes Psych accepts" loads to the value asserted here.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPinnedCorpus, PINNED_CORPUS_ROOT, REPO_ROOT } from "./corpus-pin";
import { parseYaml, type YamlValue } from "./corpus-yaml";

/** Wraps a fragment in the smallest document the reader will start on. */
function read(body: string): YamlValue {
  return parseYaml(`---\n${body}\n`);
}

function value(body: string): YamlValue {
  return (read(body) as { readonly a: YamlValue }).a;
}

/** Every `*.yaml` under `directory`, recursively, as absolute paths. */
function yamlFiles(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...yamlFiles(path));
    else if (entry.name.endsWith(".yaml")) found.push(path);
  }
  return found.sort();
}

describe("escapes Psych accepts", () => {
  it("reads the fixed-width hex escapes", () => {
    expect(value(String.raw`a: "\x41"`)).toBe("A");
    expect(value(String.raw`a: "\u03c0"`)).toBe(String.fromCodePoint(0x3c0));
    expect(value(String.raw`a: "\u03C0"`)).toBe(String.fromCodePoint(0x3c0));
    expect(value(String.raw`a: "\U0001F600"`)).toBe(String.fromCodePoint(0x1f600));
    expect(value(String.raw`a: "\x00"`)).toBe(String.fromCodePoint(0));
    expect(value(String.raw`a: "\U0010FFFF"`)).toBe(String.fromCodePoint(0x10ffff));
  });

  it("reads the single-character escapes, including the four YAML adds", () => {
    expect(value(String.raw`a: "x\ty\nz"`)).toBe("x\ty\nz");
    expect(value(String.raw`a: "he said \"hi\" \\ ok"`)).toBe('he said "hi" \\ ok');
    expect(value(String.raw`a: "x\Ny"`)).toBe(`x${String.fromCodePoint(0x85)}y`);
    expect(value(String.raw`a: "x\_y"`)).toBe(`x${String.fromCodePoint(0xa0)}y`);
    expect(value(String.raw`a: "x\Ly"`)).toBe(`x${String.fromCodePoint(0x2028)}y`);
    expect(value(String.raw`a: "x\Py"`)).toBe(`x${String.fromCodePoint(0x2029)}y`);
  });

  it("leaves a backslash alone inside a single-quoted scalar", () => {
    expect(value(String.raw`a: '\u12zz'`)).toBe(String.raw`\u12zz`);
  });
});

/**
 * `Number.parseInt` reads as far as it can and keeps the rest — `parseInt("12zz", 16)`
 * is 18 — so before this was validated, `"\u12zz"` became U+0012 while Psych
 * raised. Each case here is a shape `parseInt` would have accepted.
 */
describe("malformed escapes are rejected, not guessed", () => {
  it("rejects a hex escape with a non-hex digit in it", () => {
    expect(() => read(String.raw`a: "\u12zz"`)).toThrow(/malformed escape \\u12zz/);
    expect(() => read(String.raw`a: "\x4g"`)).toThrow(/malformed escape \\x4g/);
    expect(() => read(String.raw`a: "\xZZ"`)).toThrow(/malformed escape \\xZZ/);
    expect(() => read(String.raw`a: "\U0001F60z"`)).toThrow(/malformed escape \\U0001F60z/);
  });

  it("rejects a hex escape cut short by the closing quote", () => {
    expect(() => read(String.raw`a: "\u12"`)).toThrow(/exactly 4 hex digits/);
    expect(() => read(String.raw`a: "\x"`)).toThrow(/exactly 2 hex digits/);
    expect(() => read(String.raw`a: "\U0001"`)).toThrow(/exactly 8 hex digits/);
  });

  it("rejects the signs and spaces parseInt would have tolerated", () => {
    expect(() => read(String.raw`a: "\u+123"`)).toThrow(/malformed escape/);
    expect(() => read(String.raw`a: "\u -12"`)).toThrow(/malformed escape/);
  });

  it("rejects a code above the last code point", () => {
    expect(() => read(String.raw`a: "\U00110000"`)).toThrow(/not a Unicode scalar value/);
    expect(() => read(String.raw`a: "\UFFFFFFFF"`)).toThrow(/not a Unicode scalar value/);
  });

  it("rejects half a surrogate pair", () => {
    expect(() => read(String.raw`a: "\uD83D"`)).toThrow(/not a Unicode scalar value/);
    expect(() => read(String.raw`a: "\uDE00"`)).toThrow(/not a Unicode scalar value/);
    expect(() => read(String.raw`a: "\U0000D83D"`)).toThrow(/not a Unicode scalar value/);
  });

  it("still rejects an escape it has never supported", () => {
    expect(() => read(String.raw`a: "\q"`)).toThrow(/unsupported escape \\q/);
  });

  it("names the offending escape and the scalar it came from", () => {
    expect(() => read(String.raw`a: "pi is \u03g0 here"`)).toThrow(
      /malformed escape \\u03g0 in "pi is \\u03g0 here": \\u takes exactly 4 hex digits/,
    );
  });
});

/**
 * The corpus is split across two roots now: the shared cases come from the
 * `plurimath-testsuite` submodule, and only the census and the exclusion list —
 * which encode this port's roadmap, not the gem's behaviour — stay here.
 */
describe("the corpus itself", () => {
  const local = yamlFiles(join(REPO_ROOT, "corpus"));
  const pinned = yamlFiles(join(PINNED_CORPUS_ROOT, "corpus"));

  it("keeps exactly the two payloads this repository still owns", () => {
    // Named rather than counted: a stray `corpus/asciimath/` copy coming back
    // is the failure this asserts against, and a count would not name it.
    expect(local.map((path) => relative(REPO_ROOT, path))).toStrictEqual([
      join("corpus", "census.manifest.yaml"),
      join("corpus", "census.yaml"),
      join("corpus", "exclusions.manifest.yaml"),
      join("corpus", "exclusions.yaml"),
    ]);
  });

  it("finds every document the pin ships", () => {
    const corpus = loadPinnedCorpus();
    const expected = [
      ...corpus.provenance.payloads.map((payload) => `corpus/${payload.path}`),
      "corpus/provenance.yaml",
    ].sort();
    const found = pinned.map((path) => relative(PINNED_CORPUS_ROOT, path).split("\\").join("/"));
    expect(found).toStrictEqual(expected);
    expect(found.length).toBe(21);
  });

  it("reads all of them to a mapping", () => {
    const files = [...local, ...pinned];
    expect(files.length).toBe(25);
    for (const file of files) {
      const document = parseYaml(readFileSync(file, "utf8"));
      expect(typeof document, file).toBe("object");
      expect(document, file).not.toBeNull();
      expect(Array.isArray(document), file).toBe(false);
    }
  });

  it("keeps decoding the escape the corpus actually uses", () => {
    // Every double-quoted scalar in the corpus is a LaTeX string, and the only
    // escape in them is `\\`. If strictness ever reached that path, this breaks.
    const path = join(PINNED_CORPUS_ROOT, "corpus", "asciimath", "frac.yaml");
    const document = parseYaml(readFileSync(path, "utf8")) as {
      readonly cases: readonly {
        readonly id: string;
        readonly expected: { readonly latex: string };
      }[];
    };
    const simple = document.cases.find((entry) => entry.id === "frac-simple");
    expect(simple?.expected.latex).toBe(String.raw`\frac{a}{b}`);
  });
});
