/**
 * The AsciiMath class registry — `Utility.get_class`, `Utility::FONT_STYLES`
 * and `Utility::UNARY_CLASSES` as explicit immutable tables (TODO.plan p1/05).
 *
 * Ruby resolves a captured name at runtime with
 * `Object.const_get("Plurimath::Math::Function::#{capitalize(text)}")`
 * (`utility.rb:139`), which reaches whatever constant exists — including the
 * alias constants `Overbrace = Obrace`, `Underbrace = Ubrace` and
 * `Underline = Ul`. A port cannot const_get, and ARCHITECTURE.md §3 rule 7
 * bans the POC's late-bound mutable registry, so every reachable name is an
 * explicit entry here, built from direct `core` imports at module scope.
 * Importing this module has no observable effect: the tables are module-local
 * constants.
 *
 * Completeness is asserted, not assumed: `test/formats/asciimath/registry.spec.ts`
 * checks these tables against the generated reachability census in
 * `src/generated/asciimath/transform-registry.ts` — every name the gem's
 * transform can pass to `get_class`, with the class it resolves to. A name
 * missing here is a parity gap and fails that suite; at runtime a miss throws
 * (see `getClass` in `./transform`) rather than constructing something
 * plausible.
 *
 * Entries carry three things the transform needs:
 *   - the `core` constructor the name finalizes into (the map §3 rule 7 asks
 *     for), plus `kind`/`name` — the carrier identity for aliased classes;
 *   - `family`: which Ruby `initialize` shape the class has, measured from the
 *     gem source (which ivars get assigned, and whether a Slice argument is
 *     converted) — the draft builders in `./transform` dispatch on it.
 */

import {
  AbsNode,
  BarNode,
  BinaryFunctionNode,
  CeilNode,
  DdotNode,
  DotNode,
  FloorNode,
  FontStyleNode,
  FracNode,
  HatNode,
  IntNode,
  type MathNode,
  NormNode,
  ObraceNode,
  OintNode,
  OversetNode,
  ProdNode,
  SqrtNode,
  SumNode,
  TextNode,
  TildeNode,
  UbraceNode,
  UlNode,
  UnaryFunctionNode,
  UndersetNode,
  VecNode,
} from "../../core/index";

/**
 * Which Ruby `initialize` runs when the transform calls `.new` on a resolved
 * class. Read from the gem source class by class, not assumed from the
 * hierarchy — Ruby is not uniform here (`Underset` stores an empty options
 * hash where `Overset` skips it; `Bar` assigns `@attributes` where `Abs`
 * assigns nothing but `@parameter_one`).
 *
 * - `unary`: `UnaryFunction#initialize` — assigns `parameter_one` only,
 *   converting a `Slice` argument to its text (`unary_function.rb:10`).
 *   Also `Abs`, `Ceil`, `Floor`, `Norm`, `Sqrt`, which add no initialize of
 *   their own, so their extra declared fields stay unassigned.
 * - `unaryAttributes`: the unary subclasses that add
 *   `@attributes = attributes` with a `{}` default (`bar.rb:9-12` and its
 *   eight siblings).
 * - `text`: `Text#initialize` — `parameter_one` defaults to `""` (the one
 *   non-nil default in the model) and `@lang` is always assigned (`text.rb:9`).
 * - `binary`: `BinaryFunction#initialize` — assigns `parameter_one` and
 *   `parameter_two`, no Slice conversion. Also `Frac`, `Overset` (options
 *   stored only when non-empty, and the transform never passes any).
 * - `binaryAssignedOptions`: `Underset#initialize` — `@options = options
 *   unless options.nil?`, so the `{}` default IS stored (`underset.rb:21`).
 * - `ternary`: `TernaryFunction#initialize` — three parameters. Also `Sum`,
 *   `Int`, `Prod`, `Oint` (options stored only when non-empty).
 */
export type AsciimathConstructorFamily =
  | "unary"
  | "unaryAttributes"
  | "text"
  | "binary"
  | "binaryAssignedOptions"
  | "ternary";

/** The `core` constructors a registry entry may name. */
export type AsciimathNodeConstructor = new (
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous init shapes; the entry's kind/name select the real one.
  init: any,
) => MathNode;

export interface AsciimathClassEntry {
  /** The `core` constructor this name finalizes into. */
  readonly ctor: AsciimathNodeConstructor;
  /** The constructor's node kind, for the transform's finalizer. */
  readonly kind:
    | "abs"
    | "bar"
    | "binaryFunction"
    | "ceil"
    | "ddot"
    | "dot"
    | "floor"
    | "frac"
    | "hat"
    | "int"
    | "norm"
    | "obrace"
    | "oint"
    | "overset"
    | "prod"
    | "sqrt"
    | "sum"
    | "text"
    | "tilde"
    | "ubrace"
    | "ul"
    | "unaryFunction"
    | "underset"
    | "vec";
  /** Ruby class basename for the alias carriers; absent on implemented kinds. */
  readonly name?: string;
  readonly family: AsciimathConstructorFamily;
}

const unary = (name: string): AsciimathClassEntry => ({
  ctor: UnaryFunctionNode,
  kind: "unaryFunction",
  name,
  family: "unary",
});

const binary = (name: string): AsciimathClassEntry => ({
  ctor: BinaryFunctionNode,
  kind: "binaryFunction",
  name,
  family: "binary",
});

/**
 * Every name `Utility.get_class` can receive from the AsciiMath transform,
 * in the generated census's (sorted) order. Keys are the names as captured —
 * `get_class` capitalizes on the way to a constant, this map does not need to.
 */
export const ASCIIMATH_CLASS_REGISTRY: ReadonlyMap<string, AsciimathClassEntry> = new Map<
  string,
  AsciimathClassEntry
>([
  ["abs", { ctor: AbsNode, kind: "abs", family: "unary" }],
  ["arccos", unary("Arccos")],
  ["arcsin", unary("Arcsin")],
  ["arctan", unary("Arctan")],
  ["bar", { ctor: BarNode, kind: "bar", family: "unaryAttributes" }],
  ["cancel", unary("Cancel")],
  ["ceil", { ctor: CeilNode, kind: "ceil", family: "unary" }],
  ["cos", unary("Cos")],
  ["cosh", unary("Cosh")],
  ["cot", unary("Cot")],
  ["coth", unary("Coth")],
  ["csc", unary("Csc")],
  ["csch", unary("Csch")],
  ["ddot", { ctor: DdotNode, kind: "ddot", family: "unaryAttributes" }],
  ["deg", unary("Deg")],
  ["det", unary("Det")],
  ["dim", unary("Dim")],
  ["dot", { ctor: DotNode, kind: "dot", family: "unaryAttributes" }],
  ["exp", unary("Exp")],
  ["floor", { ctor: FloorNode, kind: "floor", family: "unary" }],
  ["frac", { ctor: FracNode, kind: "frac", family: "binary" }],
  ["gcd", unary("Gcd")],
  ["glb", unary("Glb")],
  ["hat", { ctor: HatNode, kind: "hat", family: "unaryAttributes" }],
  ["int", { ctor: IntNode, kind: "int", family: "ternary" }],
  ["ker", unary("Ker")],
  ["lcm", unary("Lcm")],
  ["left", unary("Left")],
  ["lg", unary("Lg")],
  ["lim", binary("Lim")],
  ["liminf", unary("Liminf")],
  ["limsup", unary("Limsup")],
  ["ln", unary("Ln")],
  ["log", binary("Log")],
  ["lub", unary("Lub")],
  ["max", unary("Max")],
  ["min", unary("Min")],
  ["norm", { ctor: NormNode, kind: "norm", family: "unary" }],
  ["obrace", { ctor: ObraceNode, kind: "obrace", family: "unaryAttributes" }],
  ["oint", { ctor: OintNode, kind: "oint", family: "ternary" }],
  ["overbrace", { ctor: ObraceNode, kind: "obrace", family: "unaryAttributes" }],
  ["overset", { ctor: OversetNode, kind: "overset", family: "binary" }],
  ["prod", { ctor: ProdNode, kind: "prod", family: "ternary" }],
  ["right", unary("Right")],
  ["root", binary("Root")],
  ["sec", unary("Sec")],
  ["sech", unary("Sech")],
  ["sin", unary("Sin")],
  ["sinh", unary("Sinh")],
  ["sqrt", { ctor: SqrtNode, kind: "sqrt", family: "unary" }],
  ["stackrel", binary("Stackrel")],
  ["sum", { ctor: SumNode, kind: "sum", family: "ternary" }],
  ["sup", unary("Sup")],
  ["tan", unary("Tan")],
  ["tanh", unary("Tanh")],
  ["text", { ctor: TextNode, kind: "text", family: "text" }],
  ["tilde", { ctor: TildeNode, kind: "tilde", family: "unaryAttributes" }],
  ["ubrace", { ctor: UbraceNode, kind: "ubrace", family: "unaryAttributes" }],
  ["ul", { ctor: UlNode, kind: "ul", family: "unaryAttributes" }],
  ["underbrace", { ctor: UbraceNode, kind: "ubrace", family: "unaryAttributes" }],
  ["underline", { ctor: UlNode, kind: "ul", family: "unaryAttributes" }],
  ["underset", { ctor: UndersetNode, kind: "underset", family: "binaryAssignedOptions" }],
  ["vec", { ctor: VecNode, kind: "vec", family: "unaryAttributes" }],
]);

/**
 * `Utility::FONT_STYLES` (`utility.rb:7-58`): font keyword → the
 * `FontStyle` subclass basename it resolves to. The transform indexes this
 * with the captured `fonts_class` text and constructs
 * `FontStyleNode({ name, ... })`; the constructor itself is one class for all
 * fifty keywords, which is why the value is a basename rather than a second
 * constructor map.
 */
export const ASCIIMATH_FONT_STYLES: ReadonlyMap<string, string> = new Map([
  ["double-struck", "DoubleStruck"],
  ["sans-serif-bold-italic", "SansSerifBoldItalic"],
  ["sans-serif-italic", "SansSerifItalic"],
  ["bold-sans-serif", "BoldSansSerif"],
  ["sans-serif", "SansSerif"],
  ["bold-fraktur", "BoldFraktur"],
  ["bold-italic", "BoldItalic"],
  ["bold-script", "BoldScript"],
  ["mbfitsans", "SansSerifBoldItalic"],
  ["monospace", "Monospace"],
  ["mathfrak", "Fraktur"],
  ["mitsans", "SansSerifItalic"],
  ["mbfsans", "BoldSansSerif"],
  ["mbffrak", "BoldFraktur"],
  ["mathcal", "Script"],
  ["fraktur", "Fraktur"],
  ["mbfscr", "BoldScript"],
  ["mathbb", "DoubleStruck"],
  ["double", "DoubleStruck"],
  ["mathtt", "Monospace"],
  ["mathsf", "SansSerif"],
  ["mathrm", "Normal"],
  ["textrm", "Normal"],
  ["italic", "Italic"],
  ["mathit", "Italic"],
  ["textit", "Italic"],
  ["mathbf", "Bold"],
  ["textbf", "Bold"],
  ["script", "Script"],
  ["normal", "Normal"],
  ["mbfit", "BoldItalic"],
  ["msans", "SansSerif"],
  ["mfrak", "Fraktur"],
  ["mscr", "Script"],
  ["bold", "Bold"],
  ["bbb", "DoubleStruck"],
  ["Bbb", "DoubleStruck"],
  ["mtt", "Monospace"],
  ["cal", "Script"],
  ["mit", "Italic"],
  ["mup", "Normal"],
  ["mbf", "Bold"],
  ["sf", "SansSerif"],
  ["tt", "Monospace"],
  ["fr", "Fraktur"],
  ["rm", "Normal"],
  ["cc", "Script"],
  ["ii", "Italic"],
  ["bb", "Bold"],
  ["bf", "Bold"],
]);

/** The constructor every font-style keyword resolves through. */
export const ASCIIMATH_FONT_STYLE_CONSTRUCTOR: AsciimathNodeConstructor = FontStyleNode;

/**
 * `Utility::UNARY_CLASSES` (`utility.rb:64-98`), in the gem's order. The
 * transform asks membership only — whether a unary argument keeps its fence —
 * so a Set serves it; the ordered list is what the completeness test compares.
 */
export const ASCIIMATH_UNARY_CLASS_NAMES: readonly string[] = [
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

export const ASCIIMATH_UNARY_CLASS_SET: ReadonlySet<string> = new Set(ASCIIMATH_UNARY_CLASS_NAMES);
