/** biome-ignore-all lint/style/useNamingConvention: table keys are the gem's Ruby
 * symbols (`:coverage_interval`, `:coverage_factor`), kept as written. */
/**
 * `Plurimath::Mathml::UncertaintyMarker`
 * (`lib/plurimath/mathml/uncertainty_marker.rb`, plurimath#493): reads the
 * measurement-uncertainty marker shared by the MathML, OMML and UnicodeMath
 * readers — the MathML `intent` of an mrow, the text of the hidden OMML
 * phantom, and the UnicodeMath `ⓘ("...")` string.
 *
 *   standard-uncertainty(1.230,0.004)
 *   standard-uncertainty:concise(1.230,0.004)
 *   expanded-uncertainty(10.0,0.3,2[,0.95][,$unit])
 *   coverage-interval[:shortest|:probabilistically-symmetric](y,lo,hi,p[,$unit])
 *
 * A string that starts with one of the three concept names is a marker. A
 * marker that does not have exactly this shape raises `InvalidUncertaintyError`;
 * it is never read as ordinary content.
 *
 * This module returns the node's fields as text; each reader wraps the numbers
 * in its own `Math::Number` draft, adds the unit it reads from its markup, and
 * validates the finished node with `uncertaintyProblem`, as the gem's
 * constructor does.
 */

import type { UncertaintyCategory, UncertaintyIntervalKind, UncertaintyNotation } from "./nodes";
import { InvalidUncertaintyError } from "./uncertainty";

/** `UNIT_REFERENCE`. */
const UNIT_REFERENCE = "$unit";

/** `Uncertainty::MARKER_NAMES`, in the gem's order. */
const MARKER_NAMES: readonly (readonly [UncertaintyCategory, string])[] = [
  ["standard", "standard-uncertainty"],
  ["expanded", "expanded-uncertainty"],
  ["coverage_interval", "coverage-interval"],
];

/** `MARKER_NAMES.key(name)`. */
const CATEGORY_BY_NAME: ReadonlyMap<string, UncertaintyCategory> = new Map(
  MARKER_NAMES.map(([category, name]) => [name, category]),
);

/** `Uncertainty::INTERVAL_KIND_NAMES`. */
const INTERVAL_KIND_NAMES: ReadonlyMap<string, UncertaintyIntervalKind> = new Map([
  ["shortest", "shortest"],
  ["probabilistically-symmetric", "probabilistically_symmetric"],
]);

type NumberField = "magnitude" | "coverage_factor" | "coverage_probability" | "lower" | "upper";

/** `ARGUMENT_FIELDS`: the fields after the value, by category. */
const ARGUMENT_FIELDS: {
  readonly [K in UncertaintyCategory]: readonly (readonly NumberField[])[];
} = {
  standard: [["magnitude"]],
  expanded: [
    ["magnitude", "coverage_factor"],
    ["magnitude", "coverage_factor", "coverage_probability"],
  ],
  coverage_interval: [["lower", "upper", "coverage_probability"]],
};

/*
 * Ruby's `\s` and `\w` are ASCII-only on a UTF-8 string, which JavaScript's are
 * not: `\s` is ` \t\n\v\f\r` and `\w` is `[A-Za-z0-9_]`.
 */
const S = "[ \\t\\n\\v\\f\\r]";
const NAMES = MARKER_NAMES.map(([, name]) => name).join("|");

/** `name_pattern`. */
const NAME_PATTERN = new RegExp(`^${S}*(?:${NAMES})(?![A-Za-z0-9_-])`);

/**
 * `marker_match`. Whitespace follows the MathML 4 intent grammar (section
 * 5.1): it may come before a property's ':' and between the head (with its
 * property) and '(', and around each argument, but not between ':' and the
 * property name.
 */
const MARKER_PATTERN = new RegExp(
  `^${S}*(?<name>${NAMES})(?:${S}*:(?<property>[^():, \\t\\n\\v\\f\\r]+))?${S}*\\((?<arguments>[^()]*)\\)${S}*$`,
);

/** What Ruby's `String#strip` removes: ASCII whitespace and NUL. */
const STRIPPED = /^[\t\n\v\f\r \0]+|[\t\n\v\f\r \0]+$/g;

/** The fields a marker describes, each number as the text written. */
export interface UncertaintyMarkerFields {
  readonly category: UncertaintyCategory;
  readonly value: string;
  readonly numbers: { readonly [K in NumberField]: string | null };
  readonly intervalKind: UncertaintyIntervalKind | null;
  /** `@notation`: the gem keeps it for a standard uncertainty only. */
  readonly notation: UncertaintyNotation | null;
  /** The marker's last argument is `$unit`: the reader must supply the unit. */
  readonly unit: boolean;
}

/** `marker?`: the text uses one of the three concept names, well formed or not. */
export function isUncertaintyMarker(text: unknown): text is string {
  return typeof text === "string" && NAME_PATTERN.test(text);
}

/** `invalid!`. The gem interpolates `text.inspect`; JSON quoting stands in for it. */
export function invalidUncertaintyMarker(text: string, detail: string): never {
  throw new InvalidUncertaintyError(`marker ${JSON.stringify(text)}: ${detail}`);
}

/** `parse`: the marker's fields, or `InvalidUncertaintyError`. */
export function parseUncertaintyMarker(text: string): UncertaintyMarkerFields {
  const match = MARKER_PATTERN.exec(text);
  const groups = match?.groups;
  if (groups === undefined) {
    return invalidUncertaintyMarker(text, "it is not of the form name[:property](arguments)");
  }
  const name = groups.name as string;
  const category = CATEGORY_BY_NAME.get(name) as UncertaintyCategory;
  // Ruby's `"".split(",", -1)` is `[]`, where JavaScript's is `[""]`.
  const written = groups.arguments as string;
  const args = written === "" ? [] : written.split(",").map((arg) => arg.replace(STRIPPED, ""));
  const unit = args[args.length - 1] === UNIT_REFERENCE;
  if (unit) args.pop();
  if (args.some((arg) => arg === "" || arg.startsWith("$"))) {
    invalidUncertaintyMarker(text, "arguments must be numbers, with $unit only as the last one");
  }
  const [value, ...rest] = args as [string, ...string[]];
  const fields = ARGUMENT_FIELDS[category].find((list) => list.length === rest.length);
  if (fields === undefined) invalidUncertaintyMarker(text, `wrong number of arguments for ${name}`);
  const numbers: Record<NumberField, string | null> = {
    magnitude: null,
    coverage_factor: null,
    coverage_probability: null,
    lower: null,
    upper: null,
  };
  fields.forEach((field, index) => {
    numbers[field] = rest[index] as string;
  });
  const { notation, intervalKind } = propertyOptions(category, groups.property, text);
  return { category, value, numbers, intervalKind, notation, unit };
}

/** `property_options`, with `Uncertainty.new`'s `notation: :absolute` default applied. */
function propertyOptions(
  category: UncertaintyCategory,
  property: string | undefined,
  text: string,
): { notation: UncertaintyNotation | null; intervalKind: UncertaintyIntervalKind | null } {
  switch (category) {
    case "standard":
      if (property === undefined) return { notation: "absolute", intervalKind: null };
      if (property === "concise") return { notation: "concise", intervalKind: null };
      break;
    case "expanded":
      if (property === undefined) return { notation: null, intervalKind: null };
      break;
    default: {
      if (property === undefined) return { notation: null, intervalKind: null };
      const kind = INTERVAL_KIND_NAMES.get(property);
      if (kind !== undefined) return { notation: null, intervalKind: kind };
    }
  }
  return invalidUncertaintyMarker(text, `unknown property :${property}`);
}

/**
 * `build`: the uncertainty node's fields (under the core model's names) for a
 * reader's draft, with `number` building that reader's `Math::Number` and
 * `unit` reading the unit content. `unit` is called only when the marker
 * refers to `$unit`, and returns null when the markup holds no unit content
 * (`build`'s `unit&.call`).
 */
export function uncertaintyMarkerFields<N, U>(
  text: string,
  number: (text: string) => N,
  unit: () => U | null,
): Record<string, N | U | string | null> {
  const fields = parseUncertaintyMarker(text);
  let unitValue: U | null = null;
  if (fields.unit) {
    unitValue = unit();
    if (unitValue === null) {
      invalidUncertaintyMarker(text, "it refers to $unit but no unit content was found");
    }
  }
  const numberOrNull = (value: string | null): N | null => (value === null ? null : number(value));
  return {
    value: number(fields.value),
    category: fields.category,
    magnitude: numberOrNull(fields.numbers.magnitude),
    coverageFactor: numberOrNull(fields.numbers.coverage_factor),
    coverageProbability: numberOrNull(fields.numbers.coverage_probability),
    lower: numberOrNull(fields.numbers.lower),
    upper: numberOrNull(fields.numbers.upper),
    intervalKind: fields.intervalKind,
    notation: fields.notation,
    unit: unitValue,
  };
}

/** The core model's field names the gem spells differently. */
const RUBY_FIELD_NAMES: ReadonlyMap<string, string> = new Map([
  ["coverageFactor", "coverage_factor"],
  ["coverageProbability", "coverage_probability"],
  ["intervalKind", "interval_kind"],
]);

/** `uncertaintyMarkerFields` under the gem's ivar names, for the XML readers' drafts. */
export function uncertaintyMarkerRubyFields<N, U>(
  text: string,
  number: (text: string) => N,
  unit: () => U | null,
): Record<string, N | U | string | null> {
  return Object.fromEntries(
    Object.entries(uncertaintyMarkerFields(text, number, unit)).map(([field, value]) => [
      RUBY_FIELD_NAMES.get(field) ?? field,
      value,
    ]),
  );
}
