/**
 * Ruby: `Plurimath::Math::Evaluation::Iteration` (`iteration.rb`) — the
 * bounded `Sum`/`Prod` fold. Parses the `i=1` lower bound into an index name
 * and its start, evaluates the upper bound, checks both are Integers and the
 * step count is within the cap, then folds the body over the range with the
 * index temporarily bound (shadowing, then restoring, any outer binding of
 * the same name — `Evaluator#with_binding`).
 *
 * The cap is the gem's `Plurimath.configuration.evaluation_max_iterations`
 * (`configuration.rb`'s `DEFAULT_MAX_ITERATIONS`, `100_000`), which this port
 * takes per call instead of from global configuration (`index.ts`'s
 * `EvaluationOptions`); `null` disables it, as `nil` does in the gem.
 */

import type { MathNode, NodeParameter, NodeSequence } from "../core/nodes";
import { MathDomainError } from "./errors";
import { add, integer, multiply, type RubyNumeric } from "./numeric";
import { reservedConstant, type SymbolData, variableName } from "./operators";

/** The subset of `Evaluator` an iteration calls back into. */
export interface IterationEvaluator {
  evaluateNode(node: NodeParameter | undefined): RubyNumeric;
  evaluateNodes(nodes: NodeParameter | NodeSequence): RubyNumeric;
  unsupported(nodeOrMessage: MathNode | string): never;
  withBinding<T>(name: string, value: RubyNumeric, body: () => T): T;
  readonly maxIterations: number | null;
}

type Operation = "+" | "*";

function isSymbol(node: unknown): node is SymbolData {
  return typeof node === "object" && node !== null && (node as MathNode).kind === "symbol";
}

/** The characters Ruby's `String#strip` removes: NUL and ASCII whitespace. */
const RUBY_STRIP_CHARS = new Set(["\0", "\t", "\n", "\v", "\f", "\r", " "]);

/**
 * Ruby's `String#strip`: leading and trailing ASCII whitespace and NUL
 * (`"\0\t\n\v\f\r "`), and nothing else — unlike `String.prototype.trim`,
 * which also strips Unicode spaces such as U+00A0 that Ruby keeps.
 *
 * Index scans, not a `/[...]+$/` regex: a trailing-class regex retries a long
 * inner run of these characters from every start position, which is
 * quadratic in the run's length on a string that does not end in one.
 */
function rubyStrip(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && RUBY_STRIP_CHARS.has(value[start] as string)) start++;
  while (end > start && RUBY_STRIP_CHARS.has(value[end - 1] as string)) end--;
  return value.slice(start, end);
}

/**
 * Ruby: `Core#variable_name`, overridden by `Symbols::Symbol` (`operators.ts`'s
 * `variableName`) and by `Function::Text` (a plain, non-blank string
 * parameter, stripped). Every other node class answers `nil`.
 */
export function nodeVariableName(node: MathNode): string | null {
  if (node.kind === "symbol") return variableName(node);
  if (node.kind === "text") {
    if (typeof node.parameterOne !== "string") return null;
    const stripped = rubyStrip(node.parameterOne);
    return stripped === "" ? null : stripped;
  }
  return null;
}

function isMathNode(node: unknown): node is MathNode {
  return typeof node === "object" && node !== null && !Array.isArray(node) && "kind" in node;
}

/** Ruby: `lower.is_a?(Formula) ? lower.value : Array(lower)`. */
function lowerTokens(lower: NodeParameter): NodeSequence {
  if (lower === null) return [];
  if (Array.isArray(lower)) return lower as NodeSequence;
  if (isMathNode(lower)) {
    if (lower.kind === "formula") return lower.value ?? [];
    return [lower];
  }
  if (typeof lower === "string") return [lower];
  return [];
}

export class Iteration {
  constructor(
    private readonly evaluator: IterationEvaluator,
    private readonly lower: NodeParameter,
    private readonly upper: NodeParameter,
    private readonly body: NodeParameter,
  ) {}

  /** Ruby: `Iteration#accumulate(initial, operation)`. */
  accumulate(initial: bigint, operation: Operation): RubyNumeric {
    const [name, from] = this.indexDefinition();
    const to = this.evaluator.evaluateNode(this.upper);
    const [first, last] = this.validateBounds(from, to);
    let accumulator: RubyNumeric = integer(initial);
    for (let index = first; index <= last; index += 1n) {
      const value = this.evaluator.withBinding(name, integer(index), () =>
        this.evaluator.evaluateNode(this.body),
      );
      accumulator = operation === "+" ? add(accumulator, value) : multiply(accumulator, value);
    }
    return accumulator;
  }

  /** Ruby: `Iteration#index_definition` — `i=1` into `["i", 1]`. */
  private indexDefinition(): readonly [string, RubyNumeric] {
    const tokens = lowerTokens(this.lower);
    const index = tokens[0];
    if (isSymbol(index) && reservedConstant(index) !== null) {
      this.evaluator.unsupported("reserved constant as iteration index");
    }
    const name = isMathNode(index) ? nodeVariableName(index) : null;
    const equal = tokens[1];
    if (name === null || !(isSymbol(equal) && equal.id === "Equal")) {
      this.evaluator.unsupported("malformed iteration bounds");
    }
    return [name, this.evaluator.evaluateNodes(tokens.slice(2))];
  }

  /**
   * Ruby: `Iteration#validate_bounds` — both bounds must be Integers
   * (`MathDomainError` otherwise, a Float `1.0` included), and the step count
   * `to - from + 1` must not exceed the cap. An empty or reversed range has a
   * step count of zero or less and always passes.
   */
  private validateBounds(from: RubyNumeric, to: RubyNumeric): readonly [bigint, bigint] {
    if (from.kind !== "integer" || to.kind !== "integer") {
      throw new MathDomainError("iteration bounds must be integers");
    }
    const limit = this.evaluator.maxIterations;
    if (limit !== null && !(to.value - from.value + 1n <= limit)) {
      this.evaluator.unsupported(`iteration range larger than ${limit} steps`);
    }
    return [from.value, to.value];
  }
}
