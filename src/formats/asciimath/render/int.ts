/**
 * Mirrors `function/int.rb` — `Int#to_asciimath` (:28): subsup prefixes, a
 * ` #{third}` append, then Ruby `String#strip`, whose whitespace set is
 * `[\0\t\n\v\f\r ]` — the no-break space stays. The gem repeats this body
 * verbatim in `oint.rb`, `sum.rb` and `prod.rb`; so does this port, one file
 * per class (`./oint.ts`, `./sum.ts`, `./prod.ts`).
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  rubyStrip,
  s,
  wrapped,
} from "./shared";

export function renderInt(node: NodeOf<"int">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `_${wrapped(node.parameterOne, context, "int.parameterOne")}`
    : "";
  const two = present(node.parameterTwo)
    ? `^${wrapped(node.parameterTwo, context, "int.parameterTwo")}`
    : "";
  const three =
    node.parameterThree === null || node.parameterThree === undefined
      ? ""
      : s(renderChild(node.parameterThree, context, "int.parameterThree"));
  return rubyStrip(`int${one}${two} ${three}`);
}
