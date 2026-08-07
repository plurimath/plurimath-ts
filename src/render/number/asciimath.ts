/**
 * Mirrors `number.rb` — `Number#to_asciimath` (:26): the value interpolated
 * raw, nil → `""`. With no number formatter configured (the P4-scope option,
 * ARCHITECTURE.md §3 "formatting") a number renders its raw value, which is
 * how the whole pinned corpus was generated.
 */

import { interpolatedValue, type NodeOf } from "../../formats/asciimath/render-shared";

export function renderNumber(node: NodeOf<"number">): string {
  return interpolatedValue(node.value, node.kind, "number.value");
}
