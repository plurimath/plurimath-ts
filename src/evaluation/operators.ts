/**
 * Operator and grouping predicates over a parsed symbol node.
 *
 * Ruby: `Core#plus_operator?`/`#minus_operator?`/`#multiply_operator?`/
 * `#divide_operator?`/`#power_operator?` default to `false` (`core.rb`), and
 * five `Symbols::Symbol` subclasses each override exactly one to `true` off
 * their own identity (`plus.rb`, `minus.rb`, `times.rb`, `cdot.rb`, `hat.rb`,
 * `slash.rb`, `div.rb`) — `Cdot` and `Times` both answer `multiply_operator?`,
 * `Slash` and `Div` both answer `divide_operator?`. The generic
 * `Symbols::Symbol` ALSO answers every one of these from its own `value`
 * (`symbol.rb`'s own five overrides), for parser paths that emit a basic
 * operator as a plain symbol rather than its semantic subclass — inert for
 * AsciiMath, whose grammar always emits the named subclass, but mirrored
 * here for the same reason the gem carries it: a hand-built node could still
 * be either shape.
 *
 * This port's node model does not carry the subclass as a TypeScript class
 * (ARCHITECTURE.md §5: nodes are data, not behaviour) — the Ruby class
 * basename travels in the symbol's `id` field instead (`core/nodes.ts`), so these
 * predicates read `id` where the gem reads `is_a?`.
 */

import type { MathNode } from "../core/nodes";

/** The `symbol`-kind slice of `MathNode` (ARCHITECTURE.md §5's data type, not the `SymbolNode` class). */
export type SymbolData = Extract<MathNode, { kind: "symbol" }>;

function isSymbol(node: MathNode | string): node is SymbolData {
  return typeof node !== "string" && node.kind === "symbol";
}

export function isPlusOperator(node: MathNode | string): boolean {
  return isSymbol(node) && (node.id === "Plus" || node.value === "+");
}

export function isMinusOperator(node: MathNode | string): boolean {
  return isSymbol(node) && (node.id === "Minus" || node.value === "-");
}

export function isMultiplyOperator(node: MathNode | string): boolean {
  return isSymbol(node) && (node.id === "Times" || node.id === "Cdot" || node.value === "*");
}

export function isDivideOperator(node: MathNode | string): boolean {
  return isSymbol(node) && (node.id === "Slash" || node.id === "Div" || node.value === "/");
}

export function isPowerOperator(node: MathNode | string): boolean {
  return isSymbol(node) && (node.id === "Hat" || node.value === "^");
}

export function isOperator(node: MathNode | string): boolean {
  return (
    isPlusOperator(node) ||
    isMinusOperator(node) ||
    isMultiplyOperator(node) ||
    isDivideOperator(node) ||
    isPowerOperator(node)
  );
}

/**
 * Ruby: `Core#reserved_constant`, overridden by exactly one in-scope class,
 * `Symbols::Pi` (`pi.rb`) — `::Math::PI`. Every other symbol class answers
 * `nil` (unchanged from `Core`), including every other in-scope operator
 * symbol, so this stays a single check rather than a table.
 */
export function reservedConstant(node: SymbolData): number | null {
  return node.id === "Pi" ? Math.PI : null;
}

/**
 * Ruby: `Symbols::Symbol#variable_name` — `nil` for a reserved constant, an
 * operator, or an empty/absent value; the symbol's own `value` otherwise.
 */
export function variableName(node: SymbolData): string | null {
  if (reservedConstant(node) !== null) return null;
  if (node.value === null || node.value === "") return null;
  if (isOperator(node)) return null;
  return node.value;
}

/**
 * Ruby: `Core#open?`/`#close?`, overridden to `true` by the `Symbols::Paren::*`
 * classes below — measured on the oracle by calling both predicates on every
 * `Plurimath::Math` class. The table is copied as measured, quirks included:
 * `Vert` answers both, and `Rbbrack`, `CloseParen` and `UpcaseRangle` answer
 * `open?` rather than `close?`. These reach the evaluator as loose tokens
 * whenever the grammar does not pair them into a `Fenced` node (measured:
 * AsciiMath `|2|` is `[Paren::Vert, Number(2), Paren::Vert]`).
 */
const OPEN_PARENS: ReadonlySet<string> = new Set([
  "Paren::CloseParen",
  "Paren::Langle",
  "Paren::Lbbrack",
  "Paren::Lbrace",
  "Paren::Lbrack",
  "Paren::Lceil",
  "Paren::Lcurly",
  "Paren::Lfloor",
  "Paren::Lround",
  "Paren::Lsquare",
  "Paren::Norm",
  "Paren::OpenParen",
  "Paren::Rbbrack",
  "Paren::UpcaseLangle",
  "Paren::UpcaseRangle",
  "Paren::Vert",
]);

const CLOSE_PARENS: ReadonlySet<string> = new Set([
  "Paren::Rangle",
  "Paren::Rbrace",
  "Paren::Rbrack",
  "Paren::Rceil",
  "Paren::Rcurly",
  "Paren::Rfloor",
  "Paren::Rround",
  "Paren::Rsquare",
  "Paren::Vert",
]);

/** Ruby: `ExpressionParser#open_paren?` (`node&.open?`). */
export function isOpenParen(node: MathNode | string | undefined | null): boolean {
  return node !== undefined && node !== null && isSymbol(node) && OPEN_PARENS.has(node.id);
}

/** Ruby: `ExpressionParser#close_paren?` (`node&.close?`). */
export function isCloseParen(node: MathNode | string | undefined | null): boolean {
  return node !== undefined && node !== null && isSymbol(node) && CLOSE_PARENS.has(node.id);
}

/**
 * Ruby: `ExpressionParser#operand_start?` — a token can start an operand if
 * it is present, not an operator, and not a close paren.
 */
export function isOperandStart(node: MathNode | string | undefined | null): boolean {
  if (node === undefined || node === null) return false;
  return !isOperator(node) && !isCloseParen(node);
}
