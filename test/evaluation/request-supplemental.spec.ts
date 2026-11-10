import { expect, it } from "vitest";
import { evaluateRequest } from "../../src/evaluation/index";
import fixture from "./request-supplemental.json";

it.each(fixture.cases)("current Ruby accuracy contract: $id", (row) => {
  const request = typeof row.request === "string" ? row.request : JSON.stringify(row.request);
  expect(evaluateRequest(request)).toBe(row.expected_wire);
});
