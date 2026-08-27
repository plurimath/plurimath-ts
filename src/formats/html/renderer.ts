import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { ROOT_CONTEXT } from "./render";
import { FORMAT } from "./render-shared";

export type HtmlOptions = Record<string, never>;

/** Render one measured HTML node tree. */
export function toHtml(node: MathNode, _options?: HtmlOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  try {
    return ROOT_CONTEXT.render(node) ?? "";
  } catch (error) {
    if (error instanceof RenderError) throw error;
    if (error instanceof RangeError) {
      throw new RenderError(
        "node: the tree nests too deep for the HTML walk's call stack",
        FORMAT,
        "unknown",
      );
    }
    throw new RenderError(
      `HTML rendering failed mid-walk — ${describeThrown(error)}`,
      FORMAT,
      "unknown",
    );
  }
}
