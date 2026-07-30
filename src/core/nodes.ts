/**
 * The node model (ARCHITECTURE.md §5), declared from `corpus/census.yaml`.
 *
 * Structure only: fields, a `readonly kind` discriminant, and nothing else.
 * No render methods, no parse logic, no imports — `core` is layer 1 and
 * imports nothing internal (§3, rule 1). Equality lives in `./equality`, the
 * Ruby-shaped serialization in `./normalize`.
 *
 * **The union is closed and census-complete.** Every `implemented` census
 * entry has a class here, including kinds no landed format produces yet:
 * widening an exported exhaustive union after publication breaks consumers,
 * so membership locks once, at 1.0, not incrementally.
 *
 * **Aliased Ruby classes are represented as their alias target plus a name.**
 * The census classifies 1552 classes as `aliased` — they add no field and no
 * equality of their own. `Math::Symbols::Plus` is `SymbolNode { id: "Plus" }`;
 * `Math::Function::Sin` is `UnaryFunctionNode { name: "Sin" }`. That is why the
 * three Ruby-abstract family roots are concrete classes here: they are the
 * carriers for 67 aliased function classes. No abstract *base* is a
 * union member, which is what §5 rules out.
 *
 * **Publicly immutable** (decided 2026-07-28): `readonly` fields, no setters,
 * no runtime freeze — frozen → editable stays a non-breaking change later,
 * the reverse never is. `readonly` is compile-time only; the enforced promise
 * is that the library never mutates a tree after `parse` returns.
 *
 * **Constructors are public and permissive.** They do not validate: an
 * invalid hand-built tree fails at render with `RenderError`, never a raw
 * `TypeError`. They shallow-copy array and options arguments, so a caller's
 * later `push` or key assignment cannot reach into a finished node. Nested
 * objects the caller placed inside are not deep-cloned — mutating those is
 * out of contract.
 *
 * A field is `undefined` when Ruby never assigned the instance variable and
 * `null` when Ruby assigned `nil`. The distinction is load-bearing: Ruby
 * serializes assigned-`nil` and omits unassigned, so `./normalize` needs it.
 * `./equality` deliberately treats the two as the same, because an unset
 * Ruby ivar reads back as `nil` through its accessor.
 */

/** A node's options or attributes hash. Ruby symbol keys arrive as strings. */
export type NodeOptions = Readonly<Record<string, unknown>>;

/**
 * What a `parameter_*`, paren or base slot may hold. Deliberately wide: Ruby
 * puts a node, a list of nodes or a bare string in these slots depending on
 * the class (`Text` holds a string, `Td` holds a list).
 */
export type NodeParameter = MathNode | readonly MathNode[] | string | null;

/** Ruby's `value` on `Formula`, `Mrow` and `Table`: an ordered node list. */
export type NodeSequence = readonly MathNode[];

/**
 * Ruby classes the census marks abstract. Recorded, never union members —
 * three of them are also `implemented`, and those appear here as the
 * concrete alias carriers described in the module docs.
 */
export const RUBY_ABSTRACT_CLASSES = [
  "Math::Function::BinaryFunction",
  "Math::Function::TernaryFunction",
  "Math::Function::UnaryFunction",
  "Math::Symbols::Paren",
] as const;

/** Shallow-copies a list argument so a caller's later `push` cannot reach in. */
function copyParameter(value: NodeParameter | undefined): NodeParameter | undefined {
  return Array.isArray(value) ? [...value] : value;
}

function copySequence(value: NodeSequence | null | undefined): NodeSequence | null | undefined {
  return value == null ? value : [...value];
}

function copyOptions(value: NodeOptions | undefined): NodeOptions | undefined {
  return value === undefined ? undefined : { ...value };
}

export interface AbsInit {
  readonly closeParen?: NodeParameter | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Abs`.
 */
export class AbsNode {
  readonly kind = "abs" as const;
  readonly closeParen: NodeParameter | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: AbsInit = {}) {
    this.closeParen = copyParameter(init.closeParen);
    this.hideFunctionName = init.hideFunctionName;
    this.openParen = copyParameter(init.openParen);
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface BarInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Bar`.
 */
export class BarNode {
  readonly kind = "bar" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: BarInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface BaseInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Base`.
 */
export class BaseNode {
  readonly kind = "base" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: BaseInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface BinaryFunctionInit {
  /** Ruby class basename under `Math::Function` (14 aliased classes share this shape). */
  readonly name: string;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::BinaryFunction` — the carrier for its 14 aliased subclasses.
 *
 * Abstract in Ruby, concrete here. Those 14 classes add no field and no
 * equality of their own, so the port represents each as this node plus the
 * Ruby class basename in `name`: `Power` (`x^2`) is
 * `new BinaryFunctionNode({ name: "Power", ... })`. No abstract *base* is a union
 * member, which is what ARCHITECTURE.md §5 rules out.
 */
export class BinaryFunctionNode {
  readonly kind = "binaryFunction" as const;
  readonly name: string;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: BinaryFunctionInit) {
    this.name = init.name;
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface CeilInit {
  readonly closeParen?: NodeParameter | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Ceil`.
 */
export class CeilNode {
  readonly kind = "ceil" as const;
  readonly closeParen: NodeParameter | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: CeilInit = {}) {
    this.closeParen = copyParameter(init.closeParen);
    this.hideFunctionName = init.hideFunctionName;
    this.openParen = copyParameter(init.openParen);
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface ColorInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Color`.
 */
export class ColorNode {
  readonly kind = "color" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: ColorInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface DdotInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Ddot`.
 */
export class DdotNode {
  readonly kind = "ddot" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: DdotInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface DotInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Dot`.
 */
export class DotNode {
  readonly kind = "dot" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: DotInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface FencedInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Fenced`.
 */
export class FencedNode {
  readonly kind = "fenced" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterThree: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: FencedInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterThree = copyParameter(init.parameterThree);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface FloorInit {
  readonly closeParen?: NodeParameter | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Floor`.
 */
export class FloorNode {
  readonly kind = "floor" as const;
  readonly closeParen: NodeParameter | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: FloorInit = {}) {
    this.closeParen = copyParameter(init.closeParen);
    this.hideFunctionName = init.hideFunctionName;
    this.openParen = copyParameter(init.openParen);
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface FontStyleInit {
  /** Ruby subclass basename under `Math::Function::FontStyle`; omitted for `Math::Function::FontStyle` itself. */
  readonly name?: string | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::FontStyle`.
 *
 * Also carries the 14 census classes that alias it; their basename
 * travels in `name`.
 */
export class FontStyleNode {
  readonly kind = "fontStyle" as const;
  readonly name: string | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: FontStyleInit = {}) {
    this.name = init.name;
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface FormulaInit {
  /** Ruby subclass basename under `Math::Formula`; omitted for `Math::Formula` itself. */
  readonly name?: string | undefined;
  readonly display?: string | null | undefined;
  readonly displaystyle?: boolean | undefined;
  readonly inputString?: string | null | undefined;
  readonly leftRightWrapper?: boolean | undefined;
  readonly value?: NodeSequence | null | undefined;
}

/**
 * `Math::Formula`.
 *
 * Also carries the 1 census classes that alias it; their basename
 * travels in `name`.
 */
export class FormulaNode {
  readonly kind = "formula" as const;
  readonly name: string | undefined;
  readonly display: string | null | undefined;
  readonly displaystyle: boolean | undefined;
  readonly inputString: string | null | undefined;
  readonly leftRightWrapper: boolean | undefined;
  readonly value: NodeSequence | null | undefined;

  constructor(init: FormulaInit = {}) {
    this.name = init.name;
    this.display = init.display;
    this.displaystyle = init.displaystyle;
    this.inputString = init.inputString;
    this.leftRightWrapper = init.leftRightWrapper;
    this.value = copySequence(init.value);
  }
}

export interface FracInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Frac`.
 */
export class FracNode {
  readonly kind = "frac" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: FracInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface HatInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Hat`.
 */
export class HatNode {
  readonly kind = "hat" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: HatInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface IntInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Int`.
 */
export class IntNode {
  readonly kind = "int" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterThree: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: IntInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterThree = copyParameter(init.parameterThree);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface LinebreakInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Linebreak`.
 */
export class LinebreakNode {
  readonly kind = "linebreak" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: LinebreakInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface MpaddedInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Mpadded`.
 */
export class MpaddedNode {
  readonly kind = "mpadded" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: MpaddedInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface MrowInit {
  readonly display?: string | null | undefined;
  readonly displaystyle?: boolean | undefined;
  readonly inputString?: string | null | undefined;
  readonly isMrow?: boolean | undefined;
  readonly leftRightWrapper?: boolean | undefined;
  readonly value?: NodeSequence | null | undefined;
}

/**
 * `Math::Formula::Mrow`.
 */
export class MrowNode {
  readonly kind = "mrow" as const;
  readonly display: string | null | undefined;
  readonly displaystyle: boolean | undefined;
  readonly inputString: string | null | undefined;
  readonly isMrow: boolean | undefined;
  readonly leftRightWrapper: boolean | undefined;
  readonly value: NodeSequence | null | undefined;

  constructor(init: MrowInit = {}) {
    this.display = init.display;
    this.displaystyle = init.displaystyle;
    this.inputString = init.inputString;
    this.isMrow = init.isMrow;
    this.leftRightWrapper = init.leftRightWrapper;
    this.value = copySequence(init.value);
  }
}

export interface NaryInit {
  readonly options?: NodeOptions | undefined;
  readonly parameterFour?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Nary`.
 */
export class NaryNode {
  readonly kind = "nary" as const;
  readonly options: NodeOptions | undefined;
  readonly parameterFour: NodeParameter | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterThree: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: NaryInit = {}) {
    this.options = copyOptions(init.options);
    this.parameterFour = copyParameter(init.parameterFour);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterThree = copyParameter(init.parameterThree);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface NormInit {
  readonly closeParen?: NodeParameter | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Norm`.
 */
export class NormNode {
  readonly kind = "norm" as const;
  readonly closeParen: NodeParameter | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: NormInit = {}) {
    this.closeParen = copyParameter(init.closeParen);
    this.hideFunctionName = init.hideFunctionName;
    this.openParen = copyParameter(init.openParen);
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface NumberInit {
  readonly base?: NodeParameter | undefined;
  readonly miniSubSized?: boolean | undefined;
  readonly miniSupSized?: boolean | undefined;
  readonly value?: string | null | undefined;
}

/**
 * `Math::Number`.
 */
export class NumberNode {
  readonly kind = "number" as const;
  readonly base: NodeParameter | undefined;
  readonly miniSubSized: boolean | undefined;
  readonly miniSupSized: boolean | undefined;
  readonly value: string | null | undefined;

  constructor(init: NumberInit = {}) {
    this.base = copyParameter(init.base);
    this.miniSubSized = init.miniSubSized;
    this.miniSupSized = init.miniSupSized;
    this.value = init.value;
  }
}

export interface ObraceInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Obrace`.
 */
export class ObraceNode {
  readonly kind = "obrace" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: ObraceInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface OintInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Oint`.
 */
export class OintNode {
  readonly kind = "oint" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterThree: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: OintInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterThree = copyParameter(init.parameterThree);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface OverleftrightarrowInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Overleftrightarrow`.
 */
export class OverleftrightarrowNode {
  readonly kind = "overleftrightarrow" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: OverleftrightarrowInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface OversetInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Overset`.
 */
export class OversetNode {
  readonly kind = "overset" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: OversetInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface ProdInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Prod`.
 */
export class ProdNode {
  readonly kind = "prod" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterThree: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: ProdInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterThree = copyParameter(init.parameterThree);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface SqrtInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Sqrt`.
 */
export class SqrtNode {
  readonly kind = "sqrt" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: SqrtInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface SumInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Sum`.
 */
export class SumNode {
  readonly kind = "sum" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterThree: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: SumInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterThree = copyParameter(init.parameterThree);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface SymbolInit {
  /** Ruby class key under `Math::Symbols` — `"Plus"`, `"Paren::Lround"`. Defaults to `"Symbol"`, the base class. */
  readonly id?: string | undefined;
  readonly miniSubSized?: boolean | undefined;
  readonly miniSupSized?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly slashed?: boolean | undefined;
  readonly value?: string | null | undefined;
}

/**
 * `Math::Symbols::Symbol`.
 *
 * Also carries the 1460 census classes that alias it; their basename
 * travels in `id`.
 */
export class SymbolNode {
  readonly kind = "symbol" as const;
  readonly id: string;
  readonly miniSubSized: boolean | undefined;
  readonly miniSupSized: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly slashed: boolean | undefined;
  readonly value: string | null | undefined;

  constructor(init: SymbolInit = {}) {
    this.id = init.id ?? "Symbol";
    this.miniSubSized = init.miniSubSized;
    this.miniSupSized = init.miniSupSized;
    this.options = copyOptions(init.options);
    this.slashed = init.slashed;
    this.value = init.value;
  }
}

export interface TableInit {
  /** Ruby subclass basename under `Math::Function::Table`; omitted for `Math::Function::Table` itself. */
  readonly name?: string | undefined;
  readonly closeParen?: NodeParameter | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly options?: NodeOptions | undefined;
  readonly value?: NodeSequence | null | undefined;
}

/**
 * `Math::Function::Table`.
 *
 * Also carries the 10 census classes that alias it; their basename
 * travels in `name`.
 */
export class TableNode {
  readonly kind = "table" as const;
  readonly name: string | undefined;
  readonly closeParen: NodeParameter | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly options: NodeOptions | undefined;
  readonly value: NodeSequence | null | undefined;

  constructor(init: TableInit = {}) {
    this.name = init.name;
    this.closeParen = copyParameter(init.closeParen);
    this.openParen = copyParameter(init.openParen);
    this.options = copyOptions(init.options);
    this.value = copySequence(init.value);
  }
}

export interface TernaryFunctionInit {
  /** Ruby class basename under `Math::Function` (5 aliased classes share this shape). */
  readonly name: string;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::TernaryFunction` — the carrier for its 5 aliased subclasses.
 *
 * Abstract in Ruby, concrete here. Those 5 classes add no field and no
 * equality of their own, so the port represents each as this node plus the
 * Ruby class basename in `name`: `PowerBase` (`x_1^2`) is
 * `new TernaryFunctionNode({ name: "PowerBase", ... })`. No abstract *base* is a union
 * member, which is what ARCHITECTURE.md §5 rules out.
 */
export class TernaryFunctionNode {
  readonly kind = "ternaryFunction" as const;
  readonly name: string;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterThree: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: TernaryFunctionInit) {
    this.name = init.name;
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterThree = copyParameter(init.parameterThree);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface TextInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly lang?: string | null | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Text`.
 */
export class TextNode {
  readonly kind = "text" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly lang: string | null | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: TextInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.lang = init.lang;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface TildeInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Tilde`.
 */
export class TildeNode {
  readonly kind = "tilde" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: TildeInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface UbraceInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Ubrace`.
 */
export class UbraceNode {
  readonly kind = "ubrace" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: UbraceInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface UlInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Ul`.
 */
export class UlNode {
  readonly kind = "ul" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: UlInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface UnaryFunctionInit {
  /** Ruby class basename under `Math::Function` (48 aliased classes share this shape). */
  readonly name: string;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::UnaryFunction` — the carrier for its 48 aliased subclasses.
 *
 * Abstract in Ruby, concrete here. Those 48 classes add no field and no
 * equality of their own, so the port represents each as this node plus the
 * Ruby class basename in `name`: `Sin` (`sin x`) is
 * `new UnaryFunctionNode({ name: "Sin", ... })`. No abstract *base* is a union
 * member, which is what ARCHITECTURE.md §5 rules out.
 */
export class UnaryFunctionNode {
  readonly kind = "unaryFunction" as const;
  readonly name: string;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: UnaryFunctionInit) {
    this.name = init.name;
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

export interface UndersetInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Underset`.
 */
export class UndersetNode {
  readonly kind = "underset" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter | undefined;
  readonly parameterTwo: NodeParameter | undefined;

  constructor(init: UndersetInit = {}) {
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = copyParameter(init.parameterOne);
    this.parameterTwo = copyParameter(init.parameterTwo);
  }
}

export interface VecInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Vec`.
 */
export class VecNode {
  readonly kind = "vec" as const;
  readonly attributes: NodeOptions | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter | undefined;

  constructor(init: VecInit = {}) {
    this.attributes = copyOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = copyParameter(init.parameterOne);
  }
}

/** The closed discriminated union of every concrete node kind. */
export type MathNode =
  | AbsNode
  | BarNode
  | BaseNode
  | BinaryFunctionNode
  | CeilNode
  | ColorNode
  | DdotNode
  | DotNode
  | FencedNode
  | FloorNode
  | FontStyleNode
  | FormulaNode
  | FracNode
  | HatNode
  | IntNode
  | LinebreakNode
  | MpaddedNode
  | MrowNode
  | NaryNode
  | NormNode
  | NumberNode
  | ObraceNode
  | OintNode
  | OverleftrightarrowNode
  | OversetNode
  | ProdNode
  | SqrtNode
  | SumNode
  | SymbolNode
  | TableNode
  | TernaryFunctionNode
  | TextNode
  | TildeNode
  | UbraceNode
  | UlNode
  | UnaryFunctionNode
  | UndersetNode
  | VecNode;

export type NodeKind = MathNode["kind"];

/** Every kind, in the union's order. Renderers may reject one, never omit it. */
export const NODE_KINDS = [
  "abs",
  "bar",
  "base",
  "binaryFunction",
  "ceil",
  "color",
  "ddot",
  "dot",
  "fenced",
  "floor",
  "fontStyle",
  "formula",
  "frac",
  "hat",
  "int",
  "linebreak",
  "mpadded",
  "mrow",
  "nary",
  "norm",
  "number",
  "obrace",
  "oint",
  "overleftrightarrow",
  "overset",
  "prod",
  "sqrt",
  "sum",
  "symbol",
  "table",
  "ternaryFunction",
  "text",
  "tilde",
  "ubrace",
  "ul",
  "unaryFunction",
  "underset",
  "vec",
] as const satisfies readonly NodeKind[];

const KIND_SET: ReadonlySet<string> = new Set(NODE_KINDS);

/**
 * Structural, not nominal: any object carrying a known `kind` is a node,
 * whatever produced it. Nominal branding would break across the ESM/CJS
 * boundary that the error `code` contract already routes around (§5).
 */
export function isMathNode(value: unknown): value is MathNode {
  return (
    typeof value === "object" &&
    value !== null &&
    KIND_SET.has((value as { readonly kind?: unknown }).kind as string)
  );
}
