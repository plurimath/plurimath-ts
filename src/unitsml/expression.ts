import type { Tree } from "./parser-atoms";

/** Drafts remain private and mutable until inverse/square-root powers are set. */
export class Expression {
  constructor(
    readonly kind:
      | "unit"
      | "dimension"
      | "prefix"
      | "number"
      | "extender"
      | "formula"
      | "fenced"
      | "sqrt"
      | "untransformed",
    readonly text = "",
    readonly values: Expression[] = [],
    public exponent: Expression | null = null,
    readonly prefix: Expression | null = null,
  ) {}
  get value(): Expression {
    const first = this.values[0];
    if (first === undefined) throw new Error(`UnitsML ${this.kind} has no value`);
    return first;
  }
}

const leaf = (kind: Expression["kind"], value: unknown) => new Expression(kind, String(value));
const formula = (...values: Expression[]) => new Expression("formula", "", values);
const fence = (value: Expression) =>
  value.kind === "fenced" ? value : new Expression("fenced", "()", [value]);

/** Unitsml::Transform's exact-key, bottom-up rules; later Ruby rules win. */
export function transformExpression(tree: Tree): Expression {
  const transformed = transform(tree);
  // Parslet keeps unmatched hashes. The dependency accepts these at parse time
  // and only fails when a renderer later calls a method on the surviving hash.
  if (!(transformed instanceof Expression)) return new Expression("untransformed");
  return transformed;
}

function transform(tree: unknown): unknown {
  if (Array.isArray(tree)) return tree.map(transform);
  if (tree === null || typeof tree !== "object") return tree;
  const fields = Object.fromEntries(
    Object.entries(tree).map(([key, value]) => [key, transform(value)]),
  );
  if (
    Object.values(fields).some(
      (value) =>
        Array.isArray(value) ||
        (value !== null && typeof value === "object" && !(value instanceof Expression)),
    )
  )
    return fields;
  const keys = Object.keys(fields).sort().join(",");
  const child = (key: string): Expression => {
    const value = fields[key];
    if (!(value instanceof Expression))
      throw new Error(`UnitsML ${key} did not transform to an expression`);
    return value;
  };
  const atomic = (kind: "unit" | "dimension"): Expression =>
    new Expression(
      kind,
      String(fields[kind]),
      [],
      fields.power_numerator === undefined ? null : child("power_numerator"),
      fields.prefix === undefined ? null : leaf("prefix", fields.prefix),
    );
  switch (keys) {
    case "unit":
      return leaf("unit", fields.unit);
    case "dimension":
      return leaf("dimension", fields.dimension);
    case "prefix":
      return leaf("prefix", fields.prefix);
    case "integer":
      return leaf("number", fields.integer);
    case "sqrt":
      return new Expression("sqrt", "", [child("sqrt")]);
    case "int_exp":
      return fields.int_exp;
    case "implicit_extended":
      return fields.implicit_extended;
    case "int_exp,sequence":
      return formula(child("int_exp"), child("sequence"));
    case "first_int_exp_set,second_set":
      return formula(fence(child("first_int_exp_set")), child("second_set"));
    case "first_int_exp_set,second_int_exp_set":
      return formula(fence(child("first_int_exp_set")), fence(child("second_int_exp_set")));
    case "first_set,second_set":
      return formula(child("first_set"), child("second_set"));
    case "first_set,second_int_exp_set":
      return formula(child("first_set"), fence(child("second_int_exp_set")));
    case "prefix,unit":
    case "power_numerator,unit":
    case "power_numerator,prefix,unit":
      return atomic("unit");
    case "dimension,power_numerator":
      return atomic("dimension");
    case "extender,first_set,second_set":
      return formula(child("first_set"), leaf("extender", fields.extender), child("second_set"));
    case "extender,implicit_extended,sequence":
      return formula(
        child("implicit_extended"),
        leaf("extender", fields.extender),
        child("sequence"),
      );
    case "extender,int_exp,sequence":
      return formula(child("int_exp"), leaf("extender", fields.extender), child("sequence"));
    case "extender,sequence,unit":
    case "extender,power_numerator,sequence,unit":
    case "extender,prefix,sequence,unit":
    case "extender,power_numerator,prefix,sequence,unit":
      return formula(atomic("unit"), leaf("extender", fields.extender), child("sequence"));
    case "dimension,extender,sequence":
    case "dimension,extender,power_numerator,sequence":
      return formula(atomic("dimension"), leaf("extender", fields.extender), child("sequence"));
    case "close_paren,int_exp,open_paren":
      return new Expression("fenced", `${fields.open_paren}${fields.close_paren}`, [
        child("int_exp"),
      ]);
    case "close_paren,integer,open_paren":
      return new Expression("fenced", `${fields.open_paren}${fields.close_paren}`, [
        leaf("number", fields.integer),
      ]);
    default:
      return fields;
  }
}

/** Unitsml::Parser#update_units_exponents, including its asymmetric dimensions. */
export function updateExponents(
  values: readonly Expression[],
  initialInverse = false,
  sqrt = false,
): void {
  let inverse = initialInverse;
  for (let object of values) {
    if (object.kind === "sqrt") {
      object = object.value;
      if (object.kind === "unit") object.exponent = leaf("number", "0.5");
      else updateExponents([object], inverse, true);
    }
    switch (object.kind) {
      case "unit":
        if (sqrt) {
          object.exponent = leaf("number", "0.5");
          break;
        }
        if (inverse) {
          if (object.exponent === null) object.exponent = leaf("number", "-1");
          else negate(object.exponent);
        }
        break;
      case "dimension":
        if (sqrt) object.exponent = leaf("number", "0.5");
        break;
      case "extender":
        if (object.text === "/" || object.text === "//") inverse = !inverse;
        break;
      case "formula":
        updateExponents(object.values, inverse);
        break;
      case "fenced":
        updateExponents(object.values, inverse, sqrt);
        break;
      default:
        break;
    }
  }
}

function negate(exponent: Expression): void {
  if (exponent.kind === "fenced") {
    negate(exponent.value);
    return;
  }
  // Number#update_negative_sign replaces its string; drafts are unpublished.
  Object.assign(exponent, {
    text: exponent.text.startsWith("-") ? exponent.text.slice(1) : `-${exponent.text}`,
  });
}
