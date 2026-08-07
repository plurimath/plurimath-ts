/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * Every class name the AsciiMath transform can reach, resolved through
 * the gem — the completeness oracle for `src/formats/asciimath/registry.ts`
 * (TODO.plan p1/05): the registry is complete exactly when it serves every
 * entry here, asserted by `test/generated/transform-registry.spec.ts`
 * rather than by hand.
 *
 * The reachable set is measured, never inferred: every `get_class`
 * argument in `asciimath/transform.rb` and `asciimath/utility.rb`
 * (a captured identifier is enumerated through its grammar token range),
 * plus the two Utility tables the actions read. Resolution goes through
 * the gem because it is not mechanical capitalization: `overbrace`,
 * `underbrace` and `underline` resolve through constant aliases to
 * classes named differently (`Obrace`, `Ubrace`, `Ul`). Each `get_class`
 * entry also carries its resolved class's measured constructor family.
 */

/**
 * How the census disposes of a resolved class. A deferred class
 * never reaches this file — it is excluded at generation time.
 */
export type AsciimathTransformDisposition = "implemented" | "aliased";

/**
 * Which Ruby `initialize` shape a resolved class has, measured off the
 * runtime: the generator instantiates each class and reads the
 * assigned ivars back, fingerprints the zero-argument shape, then
 * re-verifies parameter wiring, Slice-to-text conversion and
 * empty-options behaviour with sentinel arguments (source reading
 * lies: constructors guard, coerce and inherit). The registry
 * (`src/formats/asciimath/registry.ts`) documents what each family
 * means operationally; the transform dispatches its builders on it.
 */
export type AsciimathTransformConstructorFamily =
  | "unary"
  | "unaryAttributes"
  | "text"
  | "binary"
  | "binaryAssignedOptions"
  | "ternary";

/**
 * One reachable name: the class the gem resolves it to, and the
 * implemented class the port constructs for it. For an aliased class
 * the carrier is its census alias target and the class name rides in
 * the carrier's identity slot; an implemented class carries itself.
 * `family` is the resolved class's measured constructor family —
 * present on every `get_class` entry, absent from the font-style
 * table, whose fifty keywords all construct through the one FontStyle
 * carrier. `sources` names the measurements that reached the entry: a
 * grammar capture tag (`unary_class`, `binary_class`,
 * `ternary_class`), a `literal` argument, or a Utility table.
 */
export interface AsciimathTransformClassEntry {
  readonly name: string;
  readonly rubyClass: string;
  readonly disposition: AsciimathTransformDisposition;
  readonly carrier: string;
  readonly family?: AsciimathTransformConstructorFamily;
  readonly sources: readonly string[];
}

/**
 * 63 names `Utility.get_class` can receive, sorted by name.
 * A name missing from the port's registry is a parity gap: the
 * transform throws rather than constructing something plausible.
 */
export const ASCIIMATH_TRANSFORM_GET_CLASS: readonly AsciimathTransformClassEntry[] = [
  {
    name: "abs",
    rubyClass: "Math::Function::Abs",
    disposition: "implemented",
    carrier: "Math::Function::Abs",
    family: "unary",
    sources: ["unary_class"],
  },
  {
    name: "arccos",
    rubyClass: "Math::Function::Arccos",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "arcsin",
    rubyClass: "Math::Function::Arcsin",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "arctan",
    rubyClass: "Math::Function::Arctan",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "bar",
    rubyClass: "Math::Function::Bar",
    disposition: "implemented",
    carrier: "Math::Function::Bar",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "cancel",
    rubyClass: "Math::Function::Cancel",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class"],
  },
  {
    name: "ceil",
    rubyClass: "Math::Function::Ceil",
    disposition: "implemented",
    carrier: "Math::Function::Ceil",
    family: "unary",
    sources: ["unary_class"],
  },
  {
    name: "cos",
    rubyClass: "Math::Function::Cos",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "cosh",
    rubyClass: "Math::Function::Cosh",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "cot",
    rubyClass: "Math::Function::Cot",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "coth",
    rubyClass: "Math::Function::Coth",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "csc",
    rubyClass: "Math::Function::Csc",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "csch",
    rubyClass: "Math::Function::Csch",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "ddot",
    rubyClass: "Math::Function::Ddot",
    disposition: "implemented",
    carrier: "Math::Function::Ddot",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "deg",
    rubyClass: "Math::Function::Deg",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["utility_unary_classes"],
  },
  {
    name: "det",
    rubyClass: "Math::Function::Det",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "dim",
    rubyClass: "Math::Function::Dim",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "dot",
    rubyClass: "Math::Function::Dot",
    disposition: "implemented",
    carrier: "Math::Function::Dot",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "exp",
    rubyClass: "Math::Function::Exp",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "floor",
    rubyClass: "Math::Function::Floor",
    disposition: "implemented",
    carrier: "Math::Function::Floor",
    family: "unary",
    sources: ["unary_class"],
  },
  {
    name: "frac",
    rubyClass: "Math::Function::Frac",
    disposition: "implemented",
    carrier: "Math::Function::Frac",
    family: "binary",
    sources: ["binary_class"],
  },
  {
    name: "gcd",
    rubyClass: "Math::Function::Gcd",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "glb",
    rubyClass: "Math::Function::Glb",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "hat",
    rubyClass: "Math::Function::Hat",
    disposition: "implemented",
    carrier: "Math::Function::Hat",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "int",
    rubyClass: "Math::Function::Int",
    disposition: "implemented",
    carrier: "Math::Function::Int",
    family: "ternary",
    sources: ["ternary_class"],
  },
  {
    name: "ker",
    rubyClass: "Math::Function::Ker",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["utility_unary_classes"],
  },
  {
    name: "lcm",
    rubyClass: "Math::Function::Lcm",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "left",
    rubyClass: "Math::Function::Left",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["utility_unary_classes"],
  },
  {
    name: "lg",
    rubyClass: "Math::Function::Lg",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["utility_unary_classes"],
  },
  {
    name: "lim",
    rubyClass: "Math::Function::Lim",
    disposition: "aliased",
    carrier: "Math::Function::BinaryFunction",
    family: "binary",
    sources: ["binary_class"],
  },
  {
    name: "liminf",
    rubyClass: "Math::Function::Liminf",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["utility_unary_classes"],
  },
  {
    name: "limsup",
    rubyClass: "Math::Function::Limsup",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["utility_unary_classes"],
  },
  {
    name: "ln",
    rubyClass: "Math::Function::Ln",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "log",
    rubyClass: "Math::Function::Log",
    disposition: "aliased",
    carrier: "Math::Function::BinaryFunction",
    family: "binary",
    sources: ["binary_class"],
  },
  {
    name: "lub",
    rubyClass: "Math::Function::Lub",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "max",
    rubyClass: "Math::Function::Max",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "min",
    rubyClass: "Math::Function::Min",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "norm",
    rubyClass: "Math::Function::Norm",
    disposition: "implemented",
    carrier: "Math::Function::Norm",
    family: "unary",
    sources: ["unary_class"],
  },
  {
    name: "obrace",
    rubyClass: "Math::Function::Obrace",
    disposition: "implemented",
    carrier: "Math::Function::Obrace",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "oint",
    rubyClass: "Math::Function::Oint",
    disposition: "implemented",
    carrier: "Math::Function::Oint",
    family: "ternary",
    sources: ["ternary_class"],
  },
  {
    name: "overbrace",
    rubyClass: "Math::Function::Obrace",
    disposition: "implemented",
    carrier: "Math::Function::Obrace",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "overset",
    rubyClass: "Math::Function::Overset",
    disposition: "implemented",
    carrier: "Math::Function::Overset",
    family: "binary",
    sources: ["binary_class"],
  },
  {
    name: "prod",
    rubyClass: "Math::Function::Prod",
    disposition: "implemented",
    carrier: "Math::Function::Prod",
    family: "ternary",
    sources: ["ternary_class"],
  },
  {
    name: "right",
    rubyClass: "Math::Function::Right",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["utility_unary_classes"],
  },
  {
    name: "root",
    rubyClass: "Math::Function::Root",
    disposition: "aliased",
    carrier: "Math::Function::BinaryFunction",
    family: "binary",
    sources: ["binary_class"],
  },
  {
    name: "sec",
    rubyClass: "Math::Function::Sec",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "sech",
    rubyClass: "Math::Function::Sech",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "sin",
    rubyClass: "Math::Function::Sin",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "sinh",
    rubyClass: "Math::Function::Sinh",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "sqrt",
    rubyClass: "Math::Function::Sqrt",
    disposition: "implemented",
    carrier: "Math::Function::Sqrt",
    family: "unary",
    sources: ["unary_class"],
  },
  {
    name: "stackrel",
    rubyClass: "Math::Function::Stackrel",
    disposition: "aliased",
    carrier: "Math::Function::BinaryFunction",
    family: "binary",
    sources: ["binary_class"],
  },
  {
    name: "sum",
    rubyClass: "Math::Function::Sum",
    disposition: "implemented",
    carrier: "Math::Function::Sum",
    family: "ternary",
    sources: ["ternary_class"],
  },
  {
    name: "sup",
    rubyClass: "Math::Function::Sup",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["utility_unary_classes"],
  },
  {
    name: "tan",
    rubyClass: "Math::Function::Tan",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "tanh",
    rubyClass: "Math::Function::Tanh",
    disposition: "aliased",
    carrier: "Math::Function::UnaryFunction",
    family: "unary",
    sources: ["unary_class", "utility_unary_classes"],
  },
  {
    name: "text",
    rubyClass: "Math::Function::Text",
    disposition: "implemented",
    carrier: "Math::Function::Text",
    family: "text",
    sources: ["literal", "unary_class"],
  },
  {
    name: "tilde",
    rubyClass: "Math::Function::Tilde",
    disposition: "implemented",
    carrier: "Math::Function::Tilde",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "ubrace",
    rubyClass: "Math::Function::Ubrace",
    disposition: "implemented",
    carrier: "Math::Function::Ubrace",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "ul",
    rubyClass: "Math::Function::Ul",
    disposition: "implemented",
    carrier: "Math::Function::Ul",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "underbrace",
    rubyClass: "Math::Function::Ubrace",
    disposition: "implemented",
    carrier: "Math::Function::Ubrace",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "underline",
    rubyClass: "Math::Function::Ul",
    disposition: "implemented",
    carrier: "Math::Function::Ul",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
  {
    name: "underset",
    rubyClass: "Math::Function::Underset",
    disposition: "implemented",
    carrier: "Math::Function::Underset",
    family: "binaryAssignedOptions",
    sources: ["binary_class"],
  },
  {
    name: "vec",
    rubyClass: "Math::Function::Vec",
    disposition: "implemented",
    carrier: "Math::Function::Vec",
    family: "unaryAttributes",
    sources: ["unary_class"],
  },
];

/**
 * Every `Utility::FONT_STYLES` key, sorted, resolved to its
 * FontStyle class. The transform indexes the whole table with the
 * captured `fonts_class` text, so the port serves all of it; the
 * grammar's reachable keys are the `fonts`-kind literals in
 * `./input.ts`.
 */
export const ASCIIMATH_TRANSFORM_FONT_STYLES: readonly AsciimathTransformClassEntry[] = [
  {
    name: "Bbb",
    rubyClass: "Math::Function::FontStyle::DoubleStruck",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "bb",
    rubyClass: "Math::Function::FontStyle::Bold",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "bbb",
    rubyClass: "Math::Function::FontStyle::DoubleStruck",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "bf",
    rubyClass: "Math::Function::FontStyle::Bold",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "bold",
    rubyClass: "Math::Function::FontStyle::Bold",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "bold-fraktur",
    rubyClass: "Math::Function::FontStyle::BoldFraktur",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "bold-italic",
    rubyClass: "Math::Function::FontStyle::BoldItalic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "bold-sans-serif",
    rubyClass: "Math::Function::FontStyle::BoldSansSerif",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "bold-script",
    rubyClass: "Math::Function::FontStyle::BoldScript",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "cal",
    rubyClass: "Math::Function::FontStyle::Script",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "cc",
    rubyClass: "Math::Function::FontStyle::Script",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "double",
    rubyClass: "Math::Function::FontStyle::DoubleStruck",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "double-struck",
    rubyClass: "Math::Function::FontStyle::DoubleStruck",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "fr",
    rubyClass: "Math::Function::FontStyle::Fraktur",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "fraktur",
    rubyClass: "Math::Function::FontStyle::Fraktur",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "ii",
    rubyClass: "Math::Function::FontStyle::Italic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "italic",
    rubyClass: "Math::Function::FontStyle::Italic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mathbb",
    rubyClass: "Math::Function::FontStyle::DoubleStruck",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mathbf",
    rubyClass: "Math::Function::FontStyle::Bold",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mathcal",
    rubyClass: "Math::Function::FontStyle::Script",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mathfrak",
    rubyClass: "Math::Function::FontStyle::Fraktur",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mathit",
    rubyClass: "Math::Function::FontStyle::Italic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mathrm",
    rubyClass: "Math::Function::FontStyle::Normal",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mathsf",
    rubyClass: "Math::Function::FontStyle::SansSerif",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mathtt",
    rubyClass: "Math::Function::FontStyle::Monospace",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mbf",
    rubyClass: "Math::Function::FontStyle::Bold",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mbffrak",
    rubyClass: "Math::Function::FontStyle::BoldFraktur",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mbfit",
    rubyClass: "Math::Function::FontStyle::BoldItalic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mbfitsans",
    rubyClass: "Math::Function::FontStyle::SansSerifBoldItalic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mbfsans",
    rubyClass: "Math::Function::FontStyle::BoldSansSerif",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mbfscr",
    rubyClass: "Math::Function::FontStyle::BoldScript",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mfrak",
    rubyClass: "Math::Function::FontStyle::Fraktur",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mit",
    rubyClass: "Math::Function::FontStyle::Italic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mitsans",
    rubyClass: "Math::Function::FontStyle::SansSerifItalic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "monospace",
    rubyClass: "Math::Function::FontStyle::Monospace",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "msans",
    rubyClass: "Math::Function::FontStyle::SansSerif",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mscr",
    rubyClass: "Math::Function::FontStyle::Script",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mtt",
    rubyClass: "Math::Function::FontStyle::Monospace",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "mup",
    rubyClass: "Math::Function::FontStyle::Normal",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "normal",
    rubyClass: "Math::Function::FontStyle::Normal",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "rm",
    rubyClass: "Math::Function::FontStyle::Normal",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "sans-serif",
    rubyClass: "Math::Function::FontStyle::SansSerif",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "sans-serif-bold-italic",
    rubyClass: "Math::Function::FontStyle::SansSerifBoldItalic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "sans-serif-italic",
    rubyClass: "Math::Function::FontStyle::SansSerifItalic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "script",
    rubyClass: "Math::Function::FontStyle::Script",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "sf",
    rubyClass: "Math::Function::FontStyle::SansSerif",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "textbf",
    rubyClass: "Math::Function::FontStyle::Bold",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "textit",
    rubyClass: "Math::Function::FontStyle::Italic",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "textrm",
    rubyClass: "Math::Function::FontStyle::Normal",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
  {
    name: "tt",
    rubyClass: "Math::Function::FontStyle::Monospace",
    disposition: "aliased",
    carrier: "Math::Function::FontStyle",
    sources: ["font_styles"],
  },
];

/**
 * `Utility::UNARY_CLASSES`, in the gem's order. Membership only —
 * the transform asks `include?` to decide whether a unary argument
 * keeps its fence — so the order is not semantic.
 */
export const ASCIIMATH_TRANSFORM_UNARY_CLASSES: readonly string[] = [
  "arccos",
  "arcsin",
  "arctan",
  "liminf",
  "limsup",
  "right",
  "sech",
  "sinh",
  "tanh",
  "cosh",
  "coth",
  "csch",
  "left",
  "max",
  "min",
  "sec",
  "sin",
  "sup",
  "deg",
  "det",
  "dim",
  "exp",
  "gcd",
  "glb",
  "lub",
  "lcm",
  "ker",
  "tan",
  "cos",
  "cot",
  "csc",
  "ln",
  "lg",
];

/**
 * A reachable name withheld from the registry, and why.
 */
export interface AsciimathTransformExclusion {
  readonly name: string;
  readonly rubyClass: string;
  readonly reason: string;
}

/**
 * No reachable name resolves to a deferred class.
 */
export const ASCIIMATH_TRANSFORM_EXCLUDED: readonly AsciimathTransformExclusion[] = [];
