/**
 * `Parslet::Transform` semantics: one bottom-up pass over the parse tree.
 * On each hash node — after its values have been transformed — the first
 * matching rule replaces the node.
 *
 * Two details of Parslet that the grammars depend on, both verified against
 * parslet 2.0.0:
 *   - rules are tried in REVERSE definition order (`rule` uses `unshift`), so
 *     a later definition wins over an earlier overlapping one;
 *   - a pattern matches only when its key set is exactly the node's key set.
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
      for (const key of rule.keys) {
        const matcher = rule.pattern[key] as Matcher;
        const value = node[key];
        if (!matches(matcher, value)) continue outer;
        bindings[matcher.name] = value;
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
