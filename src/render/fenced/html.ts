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
      return renderScalarParenValue(node.value, node.kind, at);
    case "number":
      return renderScalarParenValue(node.value, node.kind, at);
    case "formula":
    case "mrow":
    case "table":
      return renderCompositeParenValue(node.value, node.kind, at);
    default:
      throw new RenderError(
        `${at}: a "${node.kind}" node has no value reader — the gem raises NoMethodError here`,
        FORMAT,
        "fenced",
      );
  }
}

/** Constructor-normalized Symbol/Number values are strings or nil, never containers. */
function renderScalarParenValue(
  value: unknown,
  kind: "symbol" | "number",
  at: string,
): string | null {
  if (value === null || value === undefined || typeof value === "string") return value ?? null;
  throw new RenderError(
    `${at}: a "${kind}" node holds ${describeSlot(value)} that bypasses constructor normalization`,
    FORMAT,
    "fenced",
  );
}

/**
 * Ruby interpolates a composite's raw list value. Empty and nil-only lists have
 * stable `#inspect` bytes; any actual node contributes its object address.
 */
function renderCompositeParenValue(
  value: unknown,
  kind: "formula" | "mrow" | "table",
  at: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.every((item) => item === null)) {
    return `[${value.map(() => "nil").join(", ")}]`;
  }
  throw new RenderError(
    `${at}: holds a "${kind}" node whose value contains node objects with nondeterministic Ruby #inspect addresses`,
    FORMAT,
    "fenced",
  );
}
