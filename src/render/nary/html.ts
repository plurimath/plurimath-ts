import { RenderError } from "../../core/index";
import { FORMAT, type NodeOf, type RenderContext } from "../../formats/html/render-shared";

/** The gem has no `to_html` anywhere in Nary's ancestry. */
export function renderNary(_node: NodeOf<"nary">, _context: RenderContext): never {
  throw new RenderError(
    "Nary has no HTML renderer in the pinned gem and refuses instead of emitting markup",
    FORMAT,
    "nary",
  );
}
