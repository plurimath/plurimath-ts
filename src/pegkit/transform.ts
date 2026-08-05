/**
 * `Parslet::Transform` semantics: one bottom-up pass over the parse tree.
 * On each hash node — after its values have been transformed — the first
 * matching rule replaces the node.
 *
 * Four details of Parslet that the grammars depend on, all verified against
 * parslet 2.0.0 and pinned in `test/pegkit/transform.spec.ts`:
 *   - rules are tried in REVERSE definition order (`rule` uses `unshift`), so
 *     a later definition wins over an earlier overlapping one — including an
 *     exact tie on the same pattern;
 *   - a pattern matches only when its key set is exactly the node's key set;
 *   - a rule's replacement is never run back through the rules — it is only
 *     seen again as part of its parent's match;
 *   - a name bound twice in one pattern must have `==`-equal values (slices
 *     compare by TEXT, offsets ignored), the FIRST binding stays, bindings are
 *     made in pattern definition order, and a first binding that is Ruby-falsy
 *     (null/false) is silently overwritten instead of compared.
 */

import { Slice } from "./slice";

export type TransformValue = unknown;

type MatcherKind = "simple" | "sequence" | "subtree";

export interface Matcher {
  readonly kind: MatcherKind;
  readonly name: string;
}

/** Binds a leaf: anything that is not a hash or an array. */
export function simple(name: string): Matcher {
  return { kind: "simple", name };
}

/** Binds a flat array of leaves. */
export function sequence(name: string): Matcher {
  return { kind: "sequence", name };
}

/** Binds anything at all. */
export function subtree(name: string): Matcher {
  return { kind: "subtree", name };
}

export type Bindings = Record<string, TransformValue>;

interface TransformRule {
  readonly keys: readonly string[];
  readonly pattern: Record<string, Matcher>;
  readonly action: (bindings: Bindings) => TransformValue;
}

function isPlainHash(value: TransformValue): value is Record<string, TransformValue> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as object).constructor === Object
  );
}

function isLeaf(value: TransformValue): boolean {
  return !Array.isArray(value) && !isPlainHash(value);
}

function matches(matcher: Matcher, value: TransformValue): boolean {
  switch (matcher.kind) {
    case "simple":
      return isLeaf(value);
    case "sequence":
      return Array.isArray(value) && value.every(isLeaf);
    case "subtree":
      return true;
  }
}

/**
 * Ruby `==` over the transform-tree vocabulary, the equality Parslet applies
 * to a repeated binding (`bound_value == tree` in `element_match_binding`):
 * slices compare by TEXT — `Parslet::Slice#==` delegates to `str ==`, so the
 * offset is ignored and a slice equals a plain string with the same text —
 * arrays compare element-wise, plain hashes by key set and values. Anything
 * else (constructed nodes included) falls back to identity, which is Ruby's
 * `Object#==` for classes that do not override it.
 */
function treeEqual(a: TransformValue, b: TransformValue): boolean {
  if (a instanceof Slice || b instanceof Slice) {
    const left = a instanceof Slice ? a.text : a;
    const right = b instanceof Slice ? b.text : b;
    return left === right;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((element, index) => treeEqual(element, b[index]));
  }
  if (isPlainHash(a) && isPlainHash(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) => Object.hasOwn(b, key) && treeEqual(a[key], b[key]))
    );
  }
  // Ruby's `bound_value == tree` dispatches to whatever `==` the bound object
  // defines. Two separately built but structurally equal model nodes therefore
  // satisfy a repeated binding in Parslet (measured: `Number.new("2")` twice,
  // `equal?` false, binding matches). Asking the object for its own `equals`
  // is that dispatch — no import from `core`, which layer rule 1 forbids; the
  // object carries its equality with it, exactly as in Ruby.
  if (
    typeof a === "object" &&
    a !== null &&
    typeof (a as { equals?: unknown }).equals === "function"
  ) {
    return (a as { equals(other: unknown): boolean }).equals(b);
  }
  // `===`, not `Object.is`: Ruby says `NaN == NaN` is false and `-0.0 == 0.0`
  // is true, which is `===`'s behaviour and not `Object.is`'s. Everything else
  // without its own `equals` compares by identity, as Ruby's `Object#==` does.
  if (typeof a === "number" || typeof b === "number") return a === b;
  return Object.is(a, b);
}

/**
 * Ruby truthiness: only `nil` and `false` are falsy (unlike JavaScript).
 * `undefined` counts as `nil` here — the engine has no separate notion of it,
 * and `strippedEmpty` already folds the two together.
 */
function rubyTruthy(value: TransformValue): boolean {
  return value !== null && value !== undefined && value !== false;
}

export class Transform {
  private readonly rules: TransformRule[] = [];

  /** Mirrors `Parslet::Transform.rule`, which unshifts: last defined wins. */
  rule(pattern: Record<string, Matcher>, action: (bindings: Bindings) => TransformValue): void {
    this.rules.unshift({ pattern, keys: Object.keys(pattern).sort(), action });
  }

  apply(node: TransformValue): TransformValue {
    if (Array.isArray(node)) return node.map((element) => this.apply(element));
    if (isPlainHash(node)) {
      const transformed: Record<string, TransformValue> = {};
      for (const [key, value] of Object.entries(node)) transformed[key] = this.apply(value);
      return this.applyRules(transformed);
    }
    return node;
  }

  private applyRules(node: Record<string, TransformValue>): TransformValue {
    const nodeKeys = Object.keys(node).sort();
    outer: for (const rule of this.rules) {
      if (rule.keys.length !== nodeKeys.length) continue;
      for (let index = 0; index < nodeKeys.length; index++) {
        if (rule.keys[index] !== nodeKeys[index]) continue outer;
      }
      const bindings: Bindings = {};
      // Parslet iterates the PATTERN hash (`exp.each` in element_match_hash),
      // so a repeated name binds in pattern definition order — observable
      // through the falsy-rebind quirk below.
      for (const [key, matcher] of Object.entries(rule.pattern)) {
        const value = node[key];
        if (!matches(matcher, value)) continue outer;
        const previous = bindings[matcher.name];
        if (rubyTruthy(previous)) {
          // A name bound twice must hold `==`-equal values; on a mismatch the
          // whole rule fails and the next (earlier) rule gets its turn. The
          // first binding stays — Parslet returns without re-storing.
          if (!treeEqual(previous, value)) continue outer;
        } else {
          // Parslet's `bound_value = bindings[var_name]` guard: an unbound
          // name AND a name bound to a Ruby-falsy value both take the store
          // path, so a first null/false binding is overwritten, not compared.
          bindings[matcher.name] = value;
        }
      }
      return rule.action(bindings);
    }
    return node;
  }
}

/** Ruby's `value.to_s.strip.empty?` over transformed tree values. */
export function strippedEmpty(value: TransformValue): boolean {
  if (value === null || value === undefined) return true;
  if (value instanceof Slice) return value.text.trim() === "";
  if (typeof value === "string") return value.trim() === "";
  return false;
}
