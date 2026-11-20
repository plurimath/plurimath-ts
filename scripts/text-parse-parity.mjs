/**
 * A bounded differential check of the opt-in WASM parse path and the default
 * TS path. The data is extracted from the shared testsuite, never inferred
 * from either implementation. This function also runs inside packed consumers.
 */
export function replayTextParseParity(api, kernel, fixture) {
  const methods = {
    asciimath: "toAsciimath",
    latex: "toLatex",
    unicodemath: "toUnicodemath",
  };
  if (
    fixture.rows.length !== 6 ||
    fixture.refusals.length !== 3 ||
    new Set(fixture.rows.map((row) => row.id)).size !== 6 ||
    new Set(fixture.refusals.map((row) => row.format)).size !== 3
  )
    throw new Error("expected six distinct parse rows and three format refusals");
  const before = kernel.accounting();
  let comparisons = 0;
  for (const row of fixture.rows) {
    const native = kernel.parse(row.input, row.format);
    const current = new api.Plurimath(row.input, row.format);
    if (native.model.class !== "Math::Formula" || native.model.fields.input_string !== row.input)
      throw new Error(`${row.id}: WASM parse did not return the source formula`);
    for (const [target, method] of Object.entries(methods)) {
      const expected = row.expected[target];
      const wasm = native[method]();
      const ts = current[method]();
      if (typeof expected !== "string" || wasm !== expected || ts !== expected)
        throw new Error(`${row.id} -> ${target}: ${JSON.stringify({ expected, wasm, ts })}`);
      comparisons++;
    }
  }
  for (const row of fixture.refusals) {
    let nativeError;
    let currentError;
    try {
      kernel.parse(row.input, row.format);
    } catch (error) {
      nativeError = error;
    }
    try {
      new api.Plurimath(row.input, row.format);
    } catch (error) {
      currentError = error;
    }
    // The raw native ABI preserves stage codes (e.g. syntax_error), whereas
    // TS uses PARSE_ERROR. Compare the source exception, without relabeling it.
    if (
      nativeError?.name !== "FacadeError" ||
      nativeError.sourceClass !== "Plurimath::Math::ParseError" ||
      currentError?.code !== "PARSE_ERROR"
    )
      throw new Error(
        `${row.id}: native ${nativeError?.code}/${nativeError?.sourceClass}, TS ${currentError?.code}`,
      );
  }
  // A grammar refusal must not poison the instance for the next valid call.
  const first = fixture.rows[0];
  if (kernel.parse(first.input, first.format).toAsciimath() !== first.expected.asciimath)
    throw new Error("the WASM parser did not recover after a grammar refusal");
  const after = kernel.accounting();
  const calls = after.calls - before.calls;
  if (
    calls !== 29 ||
    after.allocations - before.allocations !== calls ||
    after.resultFrees - before.resultFrees !== calls ||
    after.inputFrees - before.inputFrees !== calls
  )
    throw new Error("WASM differential calls must release all input and result allocations");
  return { rows: fixture.rows.length, comparisons, refusals: fixture.refusals.length, calls };
}
