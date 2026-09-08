/**
 * Mirrors `number.rb` — `Number#to_latex` (:36): `Formatter::Numbers::
 * TextRenderer` with no formatter configured (the P4-scope option,
 * ARCHITECTURE.md §3 "formatting") renders the raw value, nil → `""` —
 * which is how the whole pinned corpus was generated.
 */

import { interpolatedValue, type NodeOf } from "../../formats/latex/render-shared";

export function renderNumber(node: NodeOf<"number">): string {
  // `interpolatedValue` refuses a list where the gem renders one: measured on
  // the pinned oracle `00c52783`, `Number([]).to_latex(options: {})` is `"[]"`.
  // Recorded in TODO.plan/deferred.md under "three list slots the gem renders
  // and this port does not", which also says why widening `interpolatedValue`
  // would be the WRONG way to close it — this slot does not reach Ruby through
  // a bare `"#{}"` at all, but through `Formatter::Numbers::TextRenderer`.
  return interpolatedValue(node.value, node.kind, "number.value");
}
