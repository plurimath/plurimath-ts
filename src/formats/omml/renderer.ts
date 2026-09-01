import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { dumpNodes, XmlElement } from "../../xml/index";
import { ROOT_CONTEXT } from "./render";
import { FORMAT, serializeRendered } from "./render-shared";

export type OmmlOptions = Record<string, never>;

const OMML_NAMESPACES: readonly (readonly [string, string])[] = [
  ["xmlns:m", "http://schemas.openxmlformats.org/officeDocument/2006/math"],
  ["xmlns:mc", "http://schemas.openxmlformats.org/markup-compatibility/2006"],
  ["xmlns:mo", "http://schemas.microsoft.com/office/mac/office/2008/main"],
  ["xmlns:mv", "urn:schemas-microsoft-com:mac:vml"],
  ["xmlns:o", "urn:schemas-microsoft-com:office:office"],
  ["xmlns:r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"],
  ["xmlns:v", "urn:schemas-microsoft-com:vml"],
  ["xmlns:w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main"],
  ["xmlns:w10", "urn:schemas-microsoft-com:office:word"],
  ["xmlns:w14", "http://schemas.microsoft.com/office/word/2010/wordml"],
  ["xmlns:w15", "http://schemas.microsoft.com/office/word/2012/wordml"],
  ["xmlns:wne", "http://schemas.microsoft.com/office/word/2006/wordml"],
  ["xmlns:wp", "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"],
  ["xmlns:wp14", "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"],
  ["xmlns:wpc", "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"],
  ["xmlns:wpg", "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"],
  ["xmlns:wpi", "http://schemas.microsoft.com/office/word/2010/wordprocessingInk"],
  ["xmlns:wps", "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"],
];

/** The gem's per-node `to_omml_without_math_tag` entry point. */
export function toOmmlWithoutMathTag(node: MathNode, _options?: OmmlOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  return atBoundary(() => serializeRendered(ROOT_CONTEXT.render(node)));
}

/** `Formula#to_omml`; only Formula and its Mrow subclass own this public wrapper. */
export function toOmml(node: MathNode, _options?: OmmlOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  return atBoundary(() => {
    if (node.kind !== "formula" && node.kind !== "mrow") {
      throw new RenderError(
        `to_omml is defined on Formula and its subclasses only — received "${node.kind}"`,
        FORMAT,
        node.kind,
      );
    }

    const para = new XmlElement("m:oMathPara").setAttributes(OMML_NAMESPACES);
    const math = new XmlElement("m:oMath").append(ROOT_CONTEXT.render(node));
    para.append(math);
    return dumpNodes(para, { indent: 2 });
  });
}

function atBoundary<T>(render: () => T): T {
  try {
    return render();
  } catch (error) {
    if (error instanceof RenderError) throw error;
    if (error instanceof RangeError) {
      throw new RenderError(
        "node: the tree nests too deep for the OMML walk's call stack",
        FORMAT,
        "unknown",
      );
    }
    throw new RenderError(
      `OMML rendering failed mid-walk — ${describeThrown(error)}`,
      FORMAT,
      "unknown",
    );
  }
}
