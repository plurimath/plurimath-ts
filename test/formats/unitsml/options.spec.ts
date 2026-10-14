import { expect, it } from "vitest";
import { unitsmlOptions } from "../../../src/unitsml/options";

it("explicitParenthesis undefined follows the absent native option convention", () => {
  expect(unitsmlOptions({}, {}).explicitParenthesis).toBe(true);
  expect(unitsmlOptions({ explicitParenthesis: undefined }, {}).explicitParenthesis).toBe(true);
  expect(unitsmlOptions({ explicitParenthesis: null }, {}).explicitParenthesis).toBe(false);
  expect(unitsmlOptions({ explicitParenthesis: false }, {}).explicitParenthesis).toBe(false);
});
