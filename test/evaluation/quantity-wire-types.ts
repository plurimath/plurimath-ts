import type {
  QuantityBindingValue,
  QuantityNumericValue,
  QuantityRequest,
} from "../../src/evaluation/wasm";

const values: readonly QuantityBindingValue[] = [
  "2.5",
  { decimal: "2.5" },
  { rational: ["5", "2"] },
  { binary64: "4004000000000000" },
];
void values;

// @ts-expect-error A JS number does not declare a source numeric class.
const numberBinding: QuantityBindingValue = 2.5;
void numberBinding;
// @ts-expect-error Numeric tags are mutually exclusive.
const mixedBinding: QuantityBindingValue = { decimal: "2.5", binary64: "4004000000000000" };
void mixedBinding;
// @ts-expect-error Rational components remain strings.
const numericRational: QuantityBindingValue = { rational: [5, 2] };
void numericRational;

const request: QuantityRequest = {
  schema: "plurimath.evaluate.quantity/1",
  ast: { type: "variable", name: "x" },
  bindings: { x: { value: { decimal: "2.5" }, unit: "m" } },
};
void request;

function numericText(value: QuantityNumericValue): string {
  switch (value.kind) {
    case "rational":
      return `${value.numerator}/${value.denominator}`;
    case "decimal":
      return value.value;
    case "float":
      return value.bits;
  }
}
void numericText;
