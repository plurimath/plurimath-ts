/**
 * The pinned corpus's own LaTeX and UnicodeMath cases, through their own
 * parsers: parse tree, normalized model, and the four text and MathML renders.
 *
 * Every other corpus-driven layer either rebuilds from the recorded `model:`
 * (parser-independent) or parses with `parseAsciimath`, so the 125 cases
 * written in LaTeX and the 20 written in UnicodeMath had their `parse_tree`,
 * `model` and `expected.{asciimath,latex,mathml,unicodemath}` read by nothing
 * that ran `parseLatex` or `parseUnicodemath` on their `input`. OMML and HTML
 * already take that round trip in `./corpus-target-parity.ts`.
 *
 * The recorded tree is `Latex::Parse` / `UnicodeMath::Parse` on the gem's
 * preprocessed text, serialized with slices flattened to strings and symbols to
 * their names — the same flattening `plain` does here. The model and renders
 * come from `Plurimath::Math.parse(input, format)`. HTML has no positive cases
 * in the pin; its end-to-end parity is `./html/model-parity.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import { normalize } from "../../src/core/index";
import { toAsciimath } from "../../src/formats/asciimath/renderer";
import { parseLatex, parseLatexTree } from "../../src/formats/latex/parser";
import { toLatex } from "../../src/formats/latex/renderer";
import { toMathml } from "../../src/formats/mathml/renderer";
import { parseUnicodemath, parseUnicodemathTree } from "../../src/formats/unicodemath/parser";
import { toUnicodemath } from "../../src/formats/unicodemath/renderer";
import { type ParseValue, Slice } from "../../src/pegkit/index";
import { loadPinnedCorpus } from "../core/corpus-pin";
import { casesInInputFormat, readCorpusCases } from "../core/model-builder";

type PlainTree = string | null | PlainTree[] | { [key: string]: PlainTree };

/** The tree with slices flattened to their text, as `serialize_tree` emits it. */
function plain(value: ParseValue): PlainTree {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return value.map(plain);
  const result: Record<string, PlainTree> = {};
  for (const [key, nested] of Object.entries(value)) result[key] = plain(nested);
  return result;
}

const RENDERERS = {
  asciimath: toAsciimath,
  latex: toLatex,
  mathml: toMathml,
  unicodemath: toUnicodemath,
} as const;

const reachable = readCorpusCases();
const trees = new Map(
  loadPinnedCorpus().cases.map((entry) => [entry.id, entry.parseTree] as const),
);

const FORMATS = [
  { format: "latex", count: 125, tree: parseLatexTree, parse: parseLatex },
  { format: "unicode", count: 20, tree: parseUnicodemathTree, parse: parseUnicodemath },
] as const;

for (const { format, count, tree, parse } of FORMATS) {
  // `casesInInputFormat` throws on an empty match; the literal count catches a
  // pin that shrinks the group without emptying it.
  const cases = casesInInputFormat(reachable, format);

  describe(`the pinned ${format} cases, through their own parser`, () => {
    it(`has the ${count} cases written in ${format}`, () => {
      expect(cases.length).toBe(count);
      for (const entry of cases) expect(trees.has(entry.id), entry.id).toBe(true);
    });

    it.each(cases.map((entry) => [entry.id, entry] as const))(
      "%s: parses to the tree Parslet produced",
      (_id, entry) => {
        expect(plain(tree(entry.input))).toStrictEqual(trees.get(entry.id));
      },
    );

    it.each(cases.map((entry) => [entry.id, entry] as const))(
      "%s: the parsed model deep-equals the gem's",
      (_id, entry) => {
        expect(normalize(parse(entry.input))).toStrictEqual(entry.model);
      },
    );

    for (const [target, render] of Object.entries(RENDERERS)) {
      const rendered = cases.filter((entry) => entry.expected.has(target));
      it(`renders every case to ${target}`, () => {
        // No refusal is recorded for these targets in either group; were one
        // added, this fails and the refusal gets its own assertion.
        expect(rendered.length).toBe(count);
      });
      it.each(rendered.map((entry) => [entry.id, entry] as const))(
        `%s: reproduces the gem's ${target}`,
        (_id, entry) => {
          expect(render(parse(entry.input))).toBe(entry.expected.get(target));
        },
      );
    }
  });
}
