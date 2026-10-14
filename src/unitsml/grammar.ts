/** Unitsml 0.6.8's Parse and IntermediateExpRules, in source choice order. */
import { type Atom, alt, any, match, rule, seq, str } from "./parser-atoms";

export interface UnitsmlGrammarTokens {
  /** Already in the exact reverse length-sort order used by arr_to_expression. */
  readonly units: readonly string[];
  readonly singlePrefixes: readonly string[];
  readonly doublePrefixes: readonly string[];
  readonly dimensions: readonly string[];
}

export function unitsmlGrammar(tokens: UnitsmlGrammarTokens): { readonly root: Atom } {
  const literals = (values: readonly string[], name: string): Atom => {
    if (values.length === 0) throw new Error(`UnitsML ${name} token census is empty`);
    return alt(...values.map((value) => str(value).as(name)));
  };
  const units = rule(() => literals(tokens.units, "unit"));
  const singlePrefixes = rule(() => literals(tokens.singlePrefixes, "prefix"));
  const doublePrefixes = rule(() => literals(tokens.doublePrefixes, "prefix"));
  const dimensions = rule(() => literals(tokens.dimensions, "dimension"));
  const sqrt = str("sqrt");
  const hyphen = str("-");
  const number = rule(() => seq(hyphen.maybe(), match("[0-9]").repeat(1)));
  const spaces = rule(() => match("[\\t\\n\\v\\f\\r ]").repeat(1));
  const spacesOptional = rule(() => spaces.maybe());
  const opening = str("(");
  const closing = str(")");
  const slashes = rule(() => alt(str("//"), str("/")));
  const extender = rule(() => alt(slashes, str("*")).as("extender"));
  const slashedNumber = rule(() => seq(number, seq(slashes, number).maybe()).as("integer"));
  const slashedNumberIntExp: Atom = rule(() =>
    alt(slashedNumber, seq(opening, slashedNumberNamedIntExp.as("int_exp"), closing)),
  );
  const slashedNumberNamedIntExp: Atom = rule(() =>
    alt(
      seq(opening.as("open_paren"), slashedNumberIntExp, closing.as("close_paren")),
      slashedNumberIntExp,
    ),
  );
  const power = rule(() => seq(str("^"), slashedNumberIntExp.as("power_numerator")));
  const unitAndPower = rule(() => seq(units, power.maybe()));
  const extendedPrefixedUnits: Atom = rule(() =>
    seq(extender, spacesOptional, prefixesUnitsIntExp.as("sequence")),
  );
  const sqrtSequence: Atom = rule(() =>
    seq(sqrt, opening, prefixesUnitsIntExp.as("sqrt"), closing),
  );
  const prefixesUnits: Atom = rule(() =>
    alt(
      seq(sqrtSequence, extendedPrefixedUnits.maybe()),
      seq(str("1").as("unit"), extendedPrefixedUnits.maybe()),
      seq(unitAndPower, extendedPrefixedUnits),
      seq(unitAndPower, alt(any().absent(), alt(extender, opening, closing, spaces).present())),
      seq(doublePrefixes, unitAndPower, extendedPrefixedUnits),
      seq(doublePrefixes, unitAndPower),
      seq(singlePrefixes, unitAndPower, extendedPrefixedUnits),
      seq(singlePrefixes, unitAndPower),
    ),
  );
  const intExpPrefixesUnits: Atom = rule(() =>
    seq(opening, spacesOptional, namedIntExpPrefixesUnits.as("int_exp"), spacesOptional, closing),
  );
  const implicitExtended: Atom = rule(() =>
    alt(
      seq(prefixesUnits.as("first_set"), spaces.as("extender"), prefixesUnits.as("second_set")),
      seq(
        intExpPrefixesUnits.as("first_int_exp_set"),
        spacesOptional,
        intExpPrefixesUnits.as("second_int_exp_set"),
      ),
      seq(
        prefixesUnits.as("first_set"),
        spacesOptional,
        intExpPrefixesUnits.as("second_int_exp_set"),
      ),
      seq(
        intExpPrefixesUnits.as("first_int_exp_set"),
        spacesOptional,
        prefixesUnits.as("second_set"),
      ),
    ),
  );
  const prefixesUnitsIntExp: Atom = rule(() =>
    alt(
      seq(
        implicitExtended.as("implicit_extended"),
        spacesOptional,
        prefixesUnitsIntExp.as("sequence").maybe(),
      ),
      seq(
        implicitExtended.as("implicit_extended"),
        spacesOptional,
        extender,
        spacesOptional,
        prefixesUnitsIntExp.as("sequence").maybe(),
      ),
      seq(
        intExpPrefixesUnits,
        spacesOptional,
        extender,
        spacesOptional,
        prefixesUnitsIntExp.as("sequence").maybe(),
      ),
      seq(
        prefixesUnits,
        spacesOptional,
        extender,
        spacesOptional,
        prefixesUnitsIntExp.as("sequence").maybe(),
      ),
      seq(intExpPrefixesUnits, prefixesUnitsIntExp.as("sequence").maybe()),
      seq(prefixesUnits, prefixesUnitsIntExp.as("sequence").maybe()),
    ),
  );
  const wrapperPrefixesUnitsValue: Atom = rule(() => alt(intExpPrefixesUnits, prefixesUnitsIntExp));
  const prefixesUnitsNamedIntExp: Atom = rule(() =>
    seq(
      opening.as("open_paren"),
      spacesOptional,
      wrapperPrefixesUnitsValue.as("int_exp"),
      spacesOptional,
      closing.as("close_paren"),
    ),
  );
  const namedIntExpPrefixesUnits: Atom = rule(() =>
    alt(
      seq(
        prefixesUnitsNamedIntExp.as("int_exp"),
        alt(prefixesUnitsIntExp, extendedPrefixedUnits).maybe(),
      ),
      prefixesUnitsIntExp,
    ),
  );
  const poweredDimensions = rule(() => seq(dimensions, power.maybe()));
  const sqrtDimensions: Atom = rule(() =>
    seq(sqrt, opening, dimensionRulesIntExp.as("sqrt"), closing),
  );
  const dimensionRules: Atom = rule(() =>
    seq(alt(sqrtDimensions, poweredDimensions), extendedDimensionRules.maybe()),
  );
  const dimensionRulesIntExp: Atom = rule(() =>
    alt(
      seq(
        dimensionRules.as("first_set"),
        spaces.as("extender"),
        dimensionRules.as("second_set"),
        dimensionRulesIntExp.maybe(),
      ),
      seq(
        dimensionRules.as("first_set"),
        spacesOptional,
        intExpDimensionRules.as("second_int_exp_set"),
        dimensionRulesIntExp.maybe(),
      ),
      seq(
        intExpDimensionRules.as("first_int_exp_set"),
        spacesOptional,
        dimensionRules.as("second_set"),
        dimensionRulesIntExp.maybe(),
      ),
      seq(
        intExpDimensionRules.as("first_int_exp_set"),
        spacesOptional,
        intExpDimensionRules.as("second_int_exp_set"),
        dimensionRulesIntExp.maybe(),
      ),
      intExpDimensionRules,
      dimensionRules,
    ),
  );
  const intExpDimensionRules: Atom = rule(() =>
    seq(opening, dimensionRulesNamedExp.as("int_exp"), closing, extendedDimensionRules.maybe()),
  );
  const extendedDimensionRules: Atom = rule(() =>
    seq(spacesOptional, extender, spacesOptional, dimensionRulesIntExp.as("sequence")),
  );
  const dimensionRulesNamedExp: Atom = rule(() =>
    alt(
      seq(
        seq(
          opening.as("open_paren"),
          dimensionRulesIntExp.as("int_exp"),
          closing.as("close_paren"),
        ).as("int_exp"),
        spacesOptional,
        alt(dimensionRulesIntExp, extendedDimensionRules).as("sequence").maybe(),
      ),
      dimensionRulesIntExp,
    ),
  );
  return {
    root: rule(() =>
      alt(
        prefixesUnitsIntExp,
        dimensionRulesIntExp,
        seq(singlePrefixes, hyphen),
        seq(doublePrefixes, hyphen),
      ),
    ),
  };
}
