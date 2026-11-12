/** Check the actual initialized stage -> Formula -> writer boundary, without a fallback. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseAsciimath, toAsciimath } from "../dist/asciimath.js";
import { createAsciimathParser } from "../dist/asciimath-amath.js";
import { normalize } from "../dist/core.js";
import { toHtml } from "../dist/html.js";
import { toLatex } from "../dist/latex.js";
import { toMathml } from "../dist/mathml.js";
import { toOmml } from "../dist/omml.js";
import { toUnicodemath } from "../dist/unicodemath.js";

const stage = process.argv[2];
if (!stage) throw new Error("Pass an installed amath-ts entry file or package specifier");
const specifier =
  stage.startsWith(".") || stage.startsWith("/") ? pathToFileURL(resolve(stage)).href : stage;
const upstream = await import(specifier);
const binding = await upstream.initialize();
const parse = createAsciimathParser(binding);
const writers = {
  asciimath: toAsciimath,
  latex: toLatex,
  mathml: toMathml,
  omml: toOmml,
  unicode: toUnicodemath,
  html: toHtml,
};
const inputs = [
  { input: "1" },
  { input: "x^2" },
  { input: "frac(1)(2)" },
  { input: "sqrt(x)" },
  { input: "{:x:}" },
  { input: '"😀"' },
  { input: "1,5", options: { locale: "de" } },
  { input: "a/b/c" },
  { input: "sum_(i=1)^n i" },
  { input: "ustd(1.23, 0.04)" },
];
const results = [];
for (const { input, options } of inputs) {
  try {
    const actual = parse(input, options);
    const reference = parseAsciimath(input, options);
    assert.deepEqual(normalize(actual), normalize(reference));
    const checked = [];
    for (const [name, write] of Object.entries(writers)) {
      assert.equal(write(actual), write(reference), `${input}: ${name}`);
      checked.push(name);
    }
    results.push({ input, passed: true, writers: checked });
  } catch (error) {
    results.push({ input, passed: false, error: String(error) });
  }
}
console.log(
  JSON.stringify(
    {
      schema: "plurimath-amath-consumer/1",
      node: process.version,
      stage: specifier,
      expected: inputs.length,
      executed: results.length,
      skipped: 0,
      results,
    },
    null,
    2,
  ),
);
if (results.some((result) => !result.passed)) process.exitCode = 1;
