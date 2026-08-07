/**
 * Mirrors `number.rb` — `Number#to_latex` (:36): `Formatter::Numbers::
 * TextRenderer` with no formatter configured (the P4-scope option,
 * ARCHITECTURE.md §3 "formatting") renders the raw value, nil → `""` —
 * which is how the whole pinned corpus was generated.
 */

import { interpolatedValue, type NodeOf } from "./shared";

export function renderNumber(node: NodeOf<"number">): string {
  return interpolatedValue(node.value, node.kind, "number.value");
}
