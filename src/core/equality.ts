/**
 * The module-level facade over the equality projection (ARCHITECTURE.md §5,
 * "two distinct projections").
 *
 * `equals(a, b)` mirrors Ruby's `==` **per class**, using the field list the
 * census records for that class — not the full field set. `Formula` has five
 * fields and compares two; `Text` ignores `lang`. This is a *looser*
 * equivalence than the normalized-model comparison in `./normalize`, and the
 * two must stay apart: conflating them was a real error in an earlier draft.
 *
 * The implementation is in `./nodes`, because §4 promises `node.equals(other)`
 * as a method too and a module that both owns the projection and is imported
 * by the node classes would be a cycle. Two spellings, one implementation:
 *
 * ```ts
 * equals(a, b)   // module function — tree-shakeable, takes `MathNode`
 * a.equals(b)    // method — takes a `ConstructedMathNode`, and is what §4 promises
 * ```
 *
 * The two node types are the difference (§4, §5): `MathNode` is the structural
 * data union, which a plain object satisfies, and `ConstructedMathNode` is the
 * class union that carries the method. So the module function is the one to
 * reach for on anything that did not come out of a node constructor — dispatch
 * here is structural, an object carrying a known `kind` compares fine, and it
 * has no `equals` method of its own to call.
 *
 * Either spelling **throws** where the gem throws: a numeric character
 * reference the gem's decoder cannot encode raises `RangeError` rather than
 * being compared as written (§5, "Equality").
 */

export { EQUALITY_FIELDS, nodeEquals as equals } from "./nodes";
