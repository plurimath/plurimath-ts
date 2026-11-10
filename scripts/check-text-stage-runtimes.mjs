import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { toAsciimath } from "../dist/asciimath.js";
import { normalize } from "../dist/core.js";
import { toHtml } from "../dist/html.js";
import { parseLatex, toLatex } from "../dist/latex.js";
import { createLatexParser } from "../dist/latex-latexmath.js";
import { toMathml } from "../dist/mathml.js";
import { toOmml } from "../dist/omml.js";
import { parseUnicodemath, toUnicodemath } from "../dist/unicodemath.js";
import { createUnicodemathParser } from "../dist/unicodemath-umath.js";

const writers = {
  asciimath: toAsciimath,
  latex: toLatex,
  mathml: toMathml,
  omml: toOmml,
  unicode: toUnicodemath,
  html: toHtml,
};

const results = [];
for (const [format, modulePath, create, reference, inputs] of [
  [
    "latex",
    process.argv[2],
    createLatexParser,
    parseLatex,
    ["1", "x^2", "x+y", "\\frac{1}{2}", "\\alpha+1"],
  ],
  [
    "unicode",
    process.argv[3],
    createUnicodemathParser,
    parseUnicodemath,
    ["1", "x^2", "x+y", "α+1", "x#label"],
  ],
]) {
  if (!modulePath) throw new Error("Pass actual latexmath/umath installed stage entry paths");
  const stage = await import(pathToFileURL(modulePath).href);
  const parse = create(await stage.initialize());
  for (const input of inputs) {
    const actual = parse(input);
    const expected = reference(input);
    assert.deepEqual(normalize(actual), normalize(expected), `${format} AST ${input}`);
    for (const [writer, write] of Object.entries(writers))
      assert.deepEqual(write(actual), write(expected), `${format}/${writer} ${input}`);
    results.push({ format, input, writers: Object.keys(writers).length });
  }
}
console.log(
  JSON.stringify({
    passed: results.length,
    comparisons: results.length * Object.keys(writers).length,
    results,
  }),
);
