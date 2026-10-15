/**
 * Real-binding downstream gate, intended for GHA after building Leptris WASM.
 * Usage: node scripts/probe-leptris.mjs /absolute/path/to/leptris/js/index.js
 * Uses the existing esbuild dev dependency; no package or lockfile changes.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const bindingPath = process.argv[2];
assert.ok(bindingPath, "Pass the built Leptris JavaScript module entry path");
const binding = await import(pathToFileURL(resolve(bindingPath)).href);
for (const name of ["init", "loadSync", "treeSync", "closeSync"]) {
  assert.equal(typeof binding[name], "function", `Leptris must export ${name}`);
}
await binding.init();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await mkdtemp(join(tmpdir(), "plurimath-leptris-probe-"));
try {
  const result = await build({
    stdin: {
      contents: `
        export * from './src/experimental/leptris.ts';
        export { normalize, ParseError } from './src/core/index.ts';
        export { parseMathml, toMathml } from './src/formats/mathml/index.ts';
        export { parseOmml, toOmml } from './src/formats/omml/index.ts';
      `,
      resolveDir: root,
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    write: false,
  });
  const entry = join(scratch, "consumer.mjs");
  await writeFile(entry, result.outputFiles[0].contents);
  const consumer = await import(pathToFileURL(entry).href);
  const open = new Set();
  let loaded = 0;
  let closed = 0;
  const tracked = {
    loadSync(input) {
      const id = binding.loadSync(input);
      assert.ok(!open.has(id), "Leptris returned an already-open handle");
      open.add(id);
      loaded++;
      return id;
    },
    treeSync: (id) => binding.treeSync(id),
    closeSync(id) {
      binding.closeSync(id);
      assert.ok(open.delete(id), "adapter closed an unknown handle");
      closed++;
    },
  };
  const experimental = consumer.createLeptrisParsers(tracked);
  const counts = {};
  for (const format of ["mathml", "omml"]) {
    const fixture = JSON.parse(
      await readFile(join(root, `test/formats/${format}/model-fixtures.json`), "utf8"),
    );
    const rows = fixture.cases.filter((row) => row.group === `corpus-${format}`);
    assert.ok(rows.length > 0, `${format} corpus must be nonempty`);
    const parseName = format === "mathml" ? "parseMathml" : "parseOmml";
    let accepted = 0;
    let refused = 0;
    for (const row of rows) {
      let native;
      try {
        native = consumer[parseName](row.input);
      } catch (error) {
        assert.ok(error instanceof consumer.ParseError, row.id);
        assert.throws(() => experimental[parseName](row.input), consumer.ParseError, row.id);
        refused++;
        continue;
      }
      const actual = experimental[parseName](row.input);
      assert.deepEqual(consumer.normalize(actual), consumer.normalize(native), row.id);
      for (const render of [consumer.toMathml, consumer.toOmml]) {
        assert.equal(render(actual), render(native), `${row.id}: ${render.name}`);
      }
      accepted++;
    }
    assert.equal(accepted + refused, rows.length);
    counts[format] = { total: rows.length, accepted, refused, excluded: 0 };
  }

  const math = "http://www.w3.org/1998/Math/MathML";
  const omml = "http://schemas.openxmlformats.org/officeDocument/2006/math";
  const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const probes = [
    [
      "parseMathml",
      `<q:math xmlns:q="${math}"><q:mfrac><q:mi>x</q:mi><q:mn>2</q:mn></q:mfrac></q:math>`,
    ],
    [
      "parseMathml",
      `<math xmlns="${math}" xmlns:x="urn:foreign"><mi>x</mi><x:mi>ignored</x:mi><mrow xmlns=""><mn>2</mn></mrow></math>`,
    ],
    ["parseMathml", "<math><mi>a<![CDATA[b]]><!--split-->c</mi><mo>&lt;</mo><mn>&#50;</mn></math>"],
    ["parseMathml", "<math><mi>&alpha;</mi><mo>&amp;</mo><mtext>&nbsp;</mtext></math>"],
    [
      "parseOmml",
      `<q:oMath xmlns:q="${omml}" xmlns:v="${word}"><q:r><v:rPr><v:b/></v:rPr><q:t>x</q:t></q:r></q:oMath>`,
    ],
    [
      "parseOmml",
      `<m:oMath xmlns:m="${omml}"><m:r><m:rPr><m:sty xmlns:m="urn:foreign" m:val="b"/></m:rPr><m:t>a<![CDATA[b]]><!--split-->c</m:t></m:r></m:oMath>`,
    ],
  ];
  for (const [name, input] of probes) {
    const expected = consumer[name](input);
    const actual = experimental[name](input);
    assert.deepEqual(consumer.normalize(actual), consumer.normalize(expected), input);
    assert.equal(consumer.toMathml(actual), consumer.toMathml(expected), input);
    assert.equal(consumer.toOmml(actual), consumer.toOmml(expected), input);
  }

  const read = consumer.createLeptrisXmlReader(tracked);
  const tree = read(`<q:math xmlns:q="${math}" custom="v"><q:mi>x</q:mi></q:math>`);
  assert.deepEqual(tree.xmlns, [["xmlns:q", math]]);
  assert.deepEqual(tree.attributes, [["custom", "v"]]);
  assert.equal(tree.children[0].namespace, math);
  assert.equal(tree.children[0].prefix, "q");
  for (const input of ["<math><mi></math>", "<math>", "", "<other/>"]) {
    assert.throws(() => experimental.parseMathml(input), consumer.ParseError, input);
    assert.equal(open.size, 0, "handles must close after input refusal");
  }
  const failedSnapshot = consumer.createLeptrisXmlReader({
    ...tracked,
    treeSync() {
      throw new Error("snapshot failure");
    },
  });
  assert.throws(() => failedSnapshot("<math/>"), /snapshot failure/);
  assert.equal(open.size, 0, "handles must close after snapshot failure");
  assert.equal(loaded, closed);
  console.log(JSON.stringify({ corpus: counts, extraProbes: probes.length, loaded, closed }));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
