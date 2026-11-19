/** Annotation is a model mapping node with no standalone Ruby renderer. */
import { RenderError } from "../../core/index";
import { FORMAT } from "../../formats/html/render-shared";

export function renderAnnotation(): never {
  throw new RenderError("Annotation is a mapping node with no Ruby renderer", FORMAT, "annotation");
}
