import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { dumpNodes, XmlElement } from "../../xml/index";
import { createRenderContext, ROOT_CONTEXT } from "./render";
import { FORMAT, serializeRendered } from "./render-shared";

export type OmmlOptions = Record<string, never>;

/** Public `Formula#to_omml` keywords whose rendering paths are not measured yet. */
const DEFERRED_OPTIONS: readonly (readonly [string, string])[] = [
  [
    "displayStyle",
    "recursive display-style override is unmeasured across the complete OMML renderer",
  ],
  [
    "splitOnLinebreak",
    "line-broken OMML emits multiple m:oMath siblings separated by Word break runs; unmeasured",
  ],
  ["formatter", "number formatting is P4 scope; only the no-formatter path is measured"],
  ["unitsml", "UnitsML is deferred wholesale (ARCHITECTURE.md section 5)"],
];

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
export function toOmmlWithoutMathTag(node: MathNode, options?: OmmlOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  return atBoundary(() => {
    assertSupportedOptions(options, node.kind);
    return serializeRendered(ROOT_CONTEXT.render(node));
  });
}

/** `Formula#to_omml`; only Formula and its Mrow subclass own this public wrapper. */
export function toOmml(node: MathNode, options?: OmmlOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  return atBoundary(() => {
    assertSupportedOptions(options, node.kind);
    if (node.kind !== "formula" && node.kind !== "mrow") {
      throw new RenderError(
        `to_omml is defined on Formula and its subclasses only — received "${node.kind}"`,
        FORMAT,
        node.kind,
      );
    }

    const para = new XmlElement("m:oMathPara").setAttributes(OMML_NAMESPACES);
    const context = createRenderContext(node.displaystyle);
    const math = new XmlElement("m:oMath").append(context.render(node));
    para.append(math);
    return dumpNodes(para, { indent: 2 });
  });
}

function assertSupportedOptions(options: OmmlOptions | null | undefined, kind: string): void {
  if (
    options !== null &&
    options !== undefined &&
    (typeof options !== "object" || Array.isArray(options))
  ) {
    throw new RenderError(
      `options: expected a plain options object, found ${typeof options === "object" ? "an array" : `a ${typeof options}`}`,
      FORMAT,
      kind,
    );
  }

  if (options !== null && options !== undefined) {
    const prototype = Object.getPrototypeOf(options) as { constructor?: unknown } | null;
    const constructorDescriptor =
      prototype === null ? undefined : Object.getOwnPropertyDescriptor(prototype, "constructor");
    const prototypeConstructor = constructorDescriptor?.value;
    const isRealmObjectPrototype =
      prototype !== null &&
      Object.getPrototypeOf(prototype) === null &&
      typeof prototypeConstructor === "function" &&
      prototypeConstructor.name === "Object";
    if (prototype !== Object.prototype && prototype !== null && !isRealmObjectPrototype) {
      const name =
        typeof prototypeConstructor === "function" && prototypeConstructor.name.length > 0
          ? prototypeConstructor.name
          : "custom";
      throw new RenderError(
        `options: expected a plain options object, found a ${name} instance`,
        FORMAT,
        kind,
      );
    }
  }

  const values: Record<string, unknown> =
    options === null || options === undefined ? {} : (options as Record<string, unknown>);
  for (const [name, detail] of DEFERRED_OPTIONS) {
    if (Object.hasOwn(values, name) && values[name] !== undefined) {
      throw new RenderError(
        `The "${name}" feature of to_omml is deferred (TODO.plan/deferred.md): ${detail}`,
        FORMAT,
        kind,
      );
    }
  }
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
