import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/html/render-shared";

/** `Fenced#to_html`: italic parens around a no-separator body join. */
export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): string {
  const first = present(node.parameterOne)
    ? `<i>${s(renderHtmlParen(node.parameterOne, "fenced.parameterOne"))}</i>`
    : "";
  const third = present(node.parameterThree)
    ? `<i>${s(renderHtmlParen(node.parameterThree, "fenced.parameterThree"))}</i>`
    : "";

  const body = node.parameterTwo;
  let second = "";
  if (present(body)) {
    if (!Array.isArray(body)) {
      throw new RenderError(
        `fenced.parameterTwo: is ${describeSlot(body)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    second = body
      .map((item, index) => s(renderChild(item, context, `fenced.parameterTwo[${index}]`)))
      .join("");
  }
  return `${first}${second}${third}`;
}

/**
 * `symbol_or_paren(field, lang: :html)`: ordinary Symbol/Number nodes expose
 * their raw value. A Paren class instead renders through MathML, so named
 * parens need the generated symbol mapping this slice deliberately lacks.
 */
function renderHtmlParen(value: unknown, at: string): string | null {
  if (!hasNodeKind(value)) {
    throw new RenderError(
      `${at}: cannot read a value from ${describeSlot(value)} — the gem raises NoMethodError here`,
      FORMAT,
      "fenced",
    );
  }
  const node = value as MathNode;

  switch (node.kind) {
    case "symbol":
      if (node.id.startsWith("Paren::")) {
        throw new RenderError(
          `${at}: named paren "${node.id}" needs generated HTML symbol data`,
          FORMAT,
          "fenced",
        );
      }
      return node.value;
    case "number":
      return node.value;
    case "formula":
    case "mrow":
    case "table":
      throw new RenderError(
        `${at}: holds a "${node.kind}" node whose list value becomes nondeterministic Ruby #inspect bytes`,
        FORMAT,
        "fenced",
      );
    default:
      throw new RenderError(
        `${at}: a "${node.kind}" node has no value reader — the gem raises NoMethodError here`,
        FORMAT,
        "fenced",
      );
  }
}
