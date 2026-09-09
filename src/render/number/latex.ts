/**
 * Mirrors `number.rb` — `Number#to_latex` (:36): `Formatter::Numbers::
 * TextRenderer` with no formatter configured (the P4-scope option,
 * ARCHITECTURE.md §3 "formatting") renders the raw value, nil → `""` —
 * which is how the whole pinned corpus was generated.
 *
 * "Renders the raw value" is `result.to_s` (`text_renderer.rb:25`, the arm
 * every non-`FormattedNumber` result takes), and for an Array that `to_s` IS
 * `inspect` — so a LIST in this slot renders rather than raising. Measured on
 * the pinned oracle `00c52783`, `Number.new([]).to_latex(options: {})` is
 * `"[]"` and `[nil, [true, "a"]]` is `'[nil, [true, "a"]]'`.
 *
 * That admission belongs here and not in `interpolatedValue`, which serves
 * this file, `../symbol/latex.ts` and `../color/latex.ts`: a list means a
 * different thing at each of those, and the shared judge carries a note
 * saying so. Measured, `Color([], Symbol("x"))` and `Color([Symbol("a")], …)`
 * raise `NoMethodError` in the gem where `Color(Number([]), …)` renders —
 * the slot has to hold a NODE whose `to_asciimath` answers the inspect.
 */

import { rubyArrayInspectOrThrow } from "../../core/ruby-semantics";
import { FORMAT, interpolatedValue, type NodeOf } from "../../formats/latex/render-shared";

export function renderNumber(node: NodeOf<"number">): string {
  // The declared slot type is `string | null`; a list arrives only from a
  // caller that has already violated it, which is the same door every other
  // degenerate shape here comes through.
  const value: unknown = node.value;
  if (Array.isArray(value)) {
    return rubyArrayInspectOrThrow(value, FORMAT, node.kind, "number.value");
  }
  return interpolatedValue(value, node.kind, "number.value");
}
