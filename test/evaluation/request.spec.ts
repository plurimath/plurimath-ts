import { describe, expect, it } from "vitest";
import { evaluateResult } from "../../src/evaluation/index";
import { evaluateRequest, formulaFromRequestAst } from "../../src/evaluation/request";
import { parseAsciimath } from "../../src/formats/asciimath/parser";
import { toAsciimath } from "../../src/formats/asciimath/renderer";
import { parseLatex } from "../../src/formats/latex/parser";
import { toLatex } from "../../src/formats/latex/renderer";
import { parseMathml } from "../../src/formats/mathml/parser";
import { toMathml } from "../../src/formats/mathml/renderer";
import { parseOmml } from "../../src/formats/omml/parser";
import { toOmml } from "../../src/formats/omml/renderer";
import fixture from "./request-numeric-v1.json";

describe("closed numeric JSON request profile", () => {
  it.each(fixture.cases)("$id: matches the independently checked Ruby wire", (row) => {
    const request = row.request_json ?? JSON.stringify(row.request);
    expect(evaluateRequest(request)).toBe(row.expected_wire);
  });

  it("retains the exact literal text in the ordinary document AST", () => {
    const formula = formulaFromRequestAst({ type: "number", text: "2.10" });
    expect(formula.value?.[0]).toMatchObject({ kind: "number", value: "2.10" });
  });

  it("produces identical bytes for reordered request keys", () => {
    const ast = {
      type: "binary",
      operator: "/",
      left: { type: "variable", name: "x" },
      right: { type: "number", text: "3" },
    };
    const schema = "plurimath.evaluate.numeric/1";
    expect(
      evaluateRequest(JSON.stringify({ schema, ast, bindings: { x: "0.30", unused: "1" } })),
    ).toBe(evaluateRequest(JSON.stringify({ bindings: { unused: "1", x: "0.30" }, ast, schema })));
  });

  it("does not coerce a non-string request", () => {
    expect(JSON.parse(evaluateRequest(null as never))).toMatchObject({
      ok: false,
      error: { code: "InvalidRequest" },
    });
  });

  it.each([
    ["asciimath", toAsciimath, parseAsciimath],
    ["latex", toLatex, parseLatex],
    ["mathml", toMathml, parseMathml],
    ["omml", toOmml, parseOmml],
  ] as const)("preserves explicit grouping through %s rendering", (_name, write, parse) => {
    for (const id of [
      "explicit-group",
      "division-left",
      "division-right",
      "power-left",
      "power-right",
      "unary",
    ]) {
      const row = fixture.cases.find((candidate) => candidate.id === id);
      if (!row?.request) throw new Error(`Missing formula case ${id}`);
      const formula = formulaFromRequestAst(row.request.ast);
      expect(evaluateResult(parse(write(formula)), {}, { mode: "strict" }).value, id).toEqual(
        evaluateResult(formula, {}, { mode: "strict" }).value,
      );
    }
  });
});
