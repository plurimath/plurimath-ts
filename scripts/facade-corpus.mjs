/** biome-ignore-all lint/style/useNamingConvention: fixture and native wire keys are snake_case. */
/**
 * The frozen facade corpus and its replay through the public `./facade/wasm`
 * API.
 *
 * `loadFacadeCorpus` (Node) reads test/fixtures/facade, checks every file
 * against test/fixtures/facade/provenance.json and the receipts inside the
 * fixtures, and expands the strict source corpus exactly as the plurimath-rs
 * WASM qualification does: 2928 original writer rows plus 870 current-source
 * text-model writer rows (3798) and 1349 parser jobs, whose 23 refusals carry
 * the measured Ruby source class. The single measured Ruby 0a1df68 correction
 * replaces one writer expectation only after the legacy row matches it byte
 * for byte, and it must apply. The 87 residual text shapes and the typed
 * source-value documents ship beside it.
 *
 * `replayFacade` runs in Node and, as source text, in a browser page: it uses
 * only the public API it is handed and the data, never a fixture file.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const canonicalJson = (value) =>
  JSON.stringify(value, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((key) => [key, x[key]]),
        )
      : x,
  );

export const FACADE_COUNTS = Object.freeze({
  writer: 3798,
  parser: 1349,
  originalWriter: 2928,
  textWriter: 870,
  parserRefusals: 23,
  text87: Object.freeze({ model: 67, unbuilt: 11, error: 9 }),
  sourceValues: 18,
});

export function loadFacadeCorpus(root) {
  const folder = join(root, "test/fixtures/facade");
  const provenance = JSON.parse(readFileSync(join(folder, "provenance.json"), "utf8"));
  const read = (name) => {
    const bytes = readFileSync(join(folder, name));
    if (sha256(bytes) !== provenance.files[name])
      throw new Error(`facade fixture ${name} differs from provenance.json`);
    return bytes;
  };
  const corpusReceipts = JSON.parse(read("corpus/provenance.json").toString("utf8"));
  const gz = (name) => {
    const packed = read(`corpus/${name}`);
    const receipt = corpusReceipts.files[name];
    if (sha256(packed) !== receipt.sha256) throw new Error(`${name}: compressed bytes changed`);
    const raw = gunzipSync(packed);
    if (sha256(raw) !== receipt.uncompressed_sha256)
      throw new Error(`${name}: producer bytes changed`);
    return JSON.parse(raw.toString("utf8"));
  };

  // The guarded source correction (Ruby 0a1df68).
  const profileBytes = read("source-profile-ruby0a1/cases.json");
  const profileReceipt = JSON.parse(read("source-profile-ruby0a1/source.json").toString("utf8"));
  if (sha256(profileBytes) !== profileReceipt.sha256)
    throw new Error("source-profile-ruby0a1 receipt mismatch");
  const profile = JSON.parse(profileBytes.toString("utf8"));
  if (profile.schema !== "plurimath.facade-source-profile/1")
    throw new Error("source-profile-ruby0a1 has an unexpected schema");
  if (sha256(read("corpus/writer-reference-2928.json.gz")) !== profile.legacy.writer_corpus_sha256)
    throw new Error("the correction profile names another legacy writer corpus");
  const corrections = new Map(
    profile.corrections.map((row) => [`${row.id}\u0000${row.format}`, row]),
  );
  if (corrections.size !== 1 || profile.corrections.length !== 1)
    throw new Error("exactly one guarded source correction is expected");

  const cases = [];
  const applied = new Set();
  const writer = gz("writer-reference-2928.json.gz").rows;
  if (writer.length !== FACADE_COUNTS.originalWriter) throw new Error("writer rows changed");
  for (const row of writer) {
    const c = row.case;
    const source = c.input;
    const construct =
      "model" in source
        ? { op: "model", model: source.model }
        : { op: "parse", format: source.format, input: source.text, options: c.parseOptions ?? {} };
    let expected = "expected" in c ? { output: c.expected } : { source_class: c.raises };
    const key = `${c.id}\u0000${row.output_format}`;
    const correction = corrections.get(key);
    if (correction) {
      if (sha256(Buffer.from(sortedPythonJson(c))) !== correction.legacy_case_sha256)
        throw new Error(`${key}: the legacy row differs from the corrected source row`);
      if (canonicalJson(c) !== canonicalJson(correction.legacy_case))
        throw new Error(`${key}: the legacy row differs from legacy_case`);
      if (typeof correction.expected_output !== "string")
        throw new Error(`${key}: the correction carries no output`);
      expected = { output: correction.expected_output };
      applied.add(key);
    }
    // The Ruby keyword spelling of the writer's formatter options is the
    // native `formatterOptions`; the TypeScript API takes native names only.
    const options = { ...(c.options ?? {}) };
    if ("formatter_options" in options) {
      if ("formatterOptions" in options) throw new Error(`${key}: both formatter spellings`);
      options.formatterOptions = options.formatter_options;
      delete options.formatter_options;
    }
    cases.push({
      id: c.id,
      kind: "writer",
      format: row.output_format,
      construct,
      options,
      expected,
    });
  }
  if (applied.size !== corrections.size) throw new Error("every source correction must apply");

  const text = gz("ruby-full-text-oracle.json.gz").rows;
  for (const row of text) {
    const model = row.parsed_model ?? row.model;
    for (const [format, value] of Object.entries(row.writers)) {
      let expected;
      if (typeof value === "string") expected = { output: value };
      else if ("output" in value) expected = { output: value.output };
      else {
        const klass = value.source_class ?? value.error?.class ?? value.error?.class_;
        if (typeof klass !== "string") throw new Error(`${row.id}/${format}: no source class`);
        expected = { source_class: klass };
      }
      cases.push({
        id: row.id,
        kind: "writer",
        format,
        construct: { op: "model", model },
        options: {},
        expected,
      });
    }
  }

  const negative = JSON.parse(
    read("parser-negative23/parser-negative23-public-ruby.json").toString("utf8"),
  );
  const negativeClass = new Map(negative.rows.map((row) => [row.id, row]));
  if (negativeClass.size !== FACADE_COUNTS.parserRefusals)
    throw new Error("parser refusal references changed");
  const jobs = gz("parser-jobs.json.gz").jobs;
  for (const job of jobs) {
    let options = job.options ?? {};
    if (options && typeof options === "object" && "parse_options" in options)
      options = options.parse_options ?? {};
    let expected;
    if ("model" in job) expected = { model: job.model };
    else {
      const reference = negativeClass.get(job.id);
      if (!reference) throw new Error(`${job.id}: refusal without a source reference`);
      if (reference.input.format !== job.format || reference.input.text !== job.input)
        throw new Error(`${job.id}: refusal reference input differs`);
      expected = { source_class: reference.parse_error.class };
    }
    cases.push({
      id: job.id,
      kind: "parser",
      format: job.format,
      request: { op: "parse", format: job.format, input: job.input, options },
      expected,
    });
  }
  const counts = { writer: 0, parser: 0 };
  for (const c of cases) counts[c.kind]++;
  if (counts.writer !== FACADE_COUNTS.writer || counts.parser !== FACADE_COUNTS.parser)
    throw new Error(`corpus counts ${JSON.stringify(counts)}`);

  const text87Bytes = read("text-closure-followup-87/residual-shapes.json");
  const text87Receipt = JSON.parse(read("text-closure-followup-87/source.json").toString("utf8"));
  if (sha256(text87Bytes) !== text87Receipt.sha256) throw new Error("text87 receipt mismatch");
  const text87 = JSON.parse(text87Bytes.toString("utf8")).rows;
  if (text87.length !== 87) throw new Error("text87 rows changed");

  const sourceValues = JSON.parse(read("source-values/typed-collisions.json").toString("utf8"));
  if (sourceValues.rows.length !== FACADE_COUNTS.sourceValues)
    throw new Error("source-value rows changed");

  return {
    counts,
    correction: [...applied][0].replace("\u0000", "/"),
    cases,
    text87,
    sourceValues: sourceValues.rows,
  };
}

/** Python `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`. */
function sortedPythonJson(value) {
  return canonicalJson(value);
}

/**
 * Replay the corpus, the 87 text shapes, the typed source values and the API
 * contract through one initialized kernel. Self-contained: it is also
 * serialized into a browser page.
 */
export async function replayFacade(api, kernel, data, options = {}) {
  const stable = (value) =>
    JSON.stringify(value, (_, x) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((key) => [key, x[key]]),
          )
        : x,
    );
  const refusal = (fn) => {
    try {
      fn();
    } catch (error) {
      if (error instanceof api.FacadeError) return error;
      throw error;
    }
    return undefined;
  };
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const started = Date.now();
  let publicCalls = 0;
  const parse = (text, format, parseOptions) => {
    publicCalls++;
    return kernel.parse(text, format, parseOptions);
  };
  const fromModel = (model) => {
    publicCalls++;
    return kernel.fromModel(model);
  };
  const write = (formula, format, writeOptions) => {
    publicCalls++;
    return formula.write(format, writeOptions);
  };

  // 1. The strict corpus.
  const mismatches = [];
  const counts = { writer: { cases: 0, exact: 0 }, parser: { cases: 0, exact: 0 } };
  const executed = [];
  for (const c of data.cases) {
    if (executed.length >= limit) break;
    let exact = false;
    let actual;
    try {
      if (c.kind === "writer") {
        const before = stable(c.options);
        let output;
        const error = refusal(() => {
          const formula =
            c.construct.op === "model"
              ? fromModel(c.construct.model)
              : parse(c.construct.input, c.construct.format, c.construct.options);
          output = write(formula, c.format, c.options);
        });
        actual = error
          ? { code: error.code, source_class: error.sourceClass, message: error.message }
          : { output };
        exact =
          "output" in c.expected
            ? !error && output === c.expected.output
            : !!error && error.sourceClass === c.expected.source_class;
        if (stable(c.options) !== before) {
          exact = false;
          actual = { optionsMutated: true };
        }
      } else {
        let model;
        const error = refusal(() => {
          model = parse(c.request.input, c.request.format, c.request.options).model;
        });
        actual = error
          ? { code: error.code, source_class: error.sourceClass, message: error.message }
          : { model };
        exact =
          "model" in c.expected
            ? !error && stable(model) === stable(c.expected.model)
            : !!error &&
              error.code === "PARSE_ERROR" &&
              error.sourceClass === c.expected.source_class;
      }
    } catch (error) {
      actual = { harness: String(error) };
    }
    executed.push(`${c.kind}:${c.format}:${c.id}`);
    counts[c.kind].cases++;
    if (exact) counts[c.kind].exact++;
    else mismatches.push({ id: c.id, kind: c.kind, format: c.format, actual });
    if (executed.length % 50 === 0) {
      options.progress?.(executed.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // 2. The 87 residual LaTeX/UnicodeMath text shapes (Ruby 0a1df68 Math.parse outcomes).
  const text87 = { model: 0, unbuilt: 0, error: 0, mismatches: [] };
  for (const row of data.text87) {
    let model;
    const error = refusal(() => {
      model = parse(row.input.text, row.input.format).model;
    });
    text87[row.outcome]++;
    const ok =
      row.outcome === "model"
        ? !error && stable(model) === stable(row.parsed_model)
        : !!error && (row.outcome !== "error" || error.sourceClass === row.parse_error.class);
    if (!ok)
      text87.mismatches.push({
        input: row.input,
        outcome: row.outcome,
        actual: error ? { code: error.code, source_class: error.sourceClass } : { model },
      });
  }

  // 3. Typed Ruby source-value documents through every writer.
  const sourceValues = { rows: 0, writers: 0, mismatches: [] };
  for (const row of data.sourceValues) {
    sourceValues.rows++;
    publicCalls++;
    const formula = kernel.fromSourceModel(row.document);
    if (
      !(formula instanceof api.SourceFormula) ||
      stable(formula.sourceModel) !== stable(row.document)
    )
      sourceValues.mismatches.push({ id: row.id, document: true });
    for (const [format, expected] of Object.entries(row.writers)) {
      sourceValues.writers++;
      let output;
      const error = refusal(() => {
        output = write(formula, format);
      });
      const ok =
        "output" in expected
          ? !error && output === expected.output
          : !!error && error.sourceClass === expected.error.class;
      if (!ok) sourceValues.mismatches.push({ id: row.id, format });
    }
  }

  // 4. The API and wire contract.
  const checks = [];
  const check = (name, fn) => {
    try {
      const detail = fn();
      checks.push({ name, ok: detail === true, ...(detail === true ? {} : { detail }) });
    } catch (error) {
      checks.push({ name, ok: false, detail: String(error) });
    }
  };
  const delta = (fn) => {
    const before = kernel.accounting();
    fn();
    const after = kernel.accounting();
    return Object.fromEntries(Object.keys(after).map((key) => [key, after[key] - before[key]]));
  };
  check("a refusal envelope maps to FacadeError with the native error object", () => {
    const request = {
      op: "parse",
      format: "asciimath",
      input: "x",
      options: { unknown_option: true },
    };
    const wire = JSON.parse(kernel.requestJson(JSON.stringify(request)));
    if (wire.abi_version !== 1 || wire.ok !== false) return { wire };
    const error = refusal(() => kernel.request(request));
    return (
      (error instanceof api.FacadeError &&
        error.code === wire.error.code &&
        stable(error.details) === stable(wire.error)) || { wire, error: String(error) }
    );
  });
  check("the raw wire returns the native success envelope unchanged", () => {
    const wire = JSON.parse(
      kernel.requestJson('{"op":"parse","format":"asciimath","input":"x+y","options":{}}'),
    );
    return (
      (wire.abi_version === 1 && wire.ok === true && wire.model?.class === "Math::Formula") || {
        wire,
      }
    );
  });
  check("malformed JSON is a native refusal, and the kernel keeps serving", () => {
    const wire = JSON.parse(kernel.requestJson("{not json"));
    return (
      (wire.abi_version === 1 &&
        wire.ok === false &&
        typeof wire.error?.code === "string" &&
        kernel.parse("1", "asciimath").toLatex() === "1") || { wire }
    );
  });
  check("a request above 16 MiB gets no allocation and the native oversize refusal", () => {
    let wire;
    const counts = delta(() => {
      wire = JSON.parse(kernel.requestJson(" ".repeat(16 * 1024 * 1024 + 1)));
    });
    return (
      (wire.ok === false &&
        wire.error?.code === "invalid_input" &&
        counts.allocations === 0 &&
        counts.inputFrees === 0 &&
        counts.calls === 1 &&
        counts.resultFrees === 1) || { wire, counts }
    );
  });
  check("a request of exactly 16 MiB is allocated and released", () => {
    const counts = delta(() => {
      kernel.requestJson(" ".repeat(16 * 1024 * 1024));
    });
    return (
      (counts.allocations === 1 && counts.inputFrees === 1 && counts.resultFrees === 1) || counts
    );
  });
  check("every call allocates and releases exactly once, also on refusal", () => {
    const counts = delta(() => {
      refusal(() => kernel.parse("x", "asciimath", { unknown_option: true }));
      kernel.parse("x", "asciimath").toMathml();
    });
    return (
      (counts.calls === 3 &&
        counts.allocations === 3 &&
        counts.resultFrees === 3 &&
        counts.inputFrees === 3) ||
      counts
    );
  });
  check("requests and models are owned copies", () => {
    const model = { class: "Math::Number", fields: { value: "2" } };
    const before = stable(model);
    const formula = kernel.fromModel(model);
    model.fields.value = "3";
    const copy = formula.model;
    copy.fields.value = "4";
    const options = { formatterOptions: null };
    formula.toLatex(options);
    return (
      (before === stable({ class: "Math::Number", fields: { value: "2" } }) &&
        formula.toLatex() === "2" &&
        formula.model.fields.value === "2" &&
        stable(options) === stable({ formatterOptions: null })) || { latex: formula.toLatex() }
    );
  });
  check("native formatter refusals keep their codes and the formula stays usable", () => {
    const formula = kernel.fromModel({ class: "Math::Number", fields: { value: "1234" } });
    const seen = [];
    for (const [settings, code] of [
      [{ precision: 1.5 }, "unported_capability"],
      [{ options: { groupDigits: [] } }, "unported_capability"],
      [{ profile: "imagined" }, "invalid_request"],
      [{ options: { groupDigits: 2 ** 63 } }, "resource_limit"],
    ]) {
      const error = refusal(() => formula.toAsciimath({ formatterOptions: settings }));
      seen.push(error?.code);
      if (error?.code !== code || formula.toAsciimath() !== "1234") return { seen };
    }
    return true;
  });
  check("a refused source document is released and the kernel keeps serving", () => {
    const document = JSON.parse(JSON.stringify(data.sourceValues[0].document));
    document.root = ["unknown-tag"];
    let error;
    const counts = delta(() => {
      error = refusal(() => kernel.fromSourceModel(document));
    });
    return (
      (error instanceof api.FacadeError &&
        counts.calls === 1 &&
        counts.resultFrees === 1 &&
        counts.inputFrees === 1 &&
        kernel.parse("1", "asciimath").toLatex() === "1") || { counts }
    );
  });
  check("every writer shortcut is the named writer", () => {
    const formula = kernel.parse("x^2", "asciimath");
    return (
      (formula.toAsciimath() === formula.write("asciimath") &&
        formula.toLatex() === formula.write("latex") &&
        formula.toMathml() === formula.write("mathml") &&
        formula.toOmml() === formula.write("omml") &&
        formula.toUnicodemath() === formula.write("unicodemath") &&
        formula.toHtml() === formula.write("html")) ||
      false
    );
  });
  check("non-string raw input is refused before the native call", () => {
    const counts = delta(() => {
      try {
        kernel.requestJson(42);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    });
    return counts.calls === 0 || counts;
  });

  const accounting = kernel.accounting();
  return {
    asset: kernel.asset,
    counts,
    exact: counts.writer.exact + counts.parser.exact,
    executed,
    mismatches,
    text87,
    sourceValues,
    checks,
    publicCalls,
    accounting,
    balanced:
      accounting.calls === accounting.resultFrees &&
      accounting.allocations === accounting.inputFrees,
    seconds: (Date.now() - started) / 1000,
  };
}
