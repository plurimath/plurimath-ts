import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { splitOnLinebreak } from "../../core/linebreak";
import { assertKnownOptions } from "../../core/render-options";
import { type FormatterOptions, resolveNumberFormat } from "../../formatting/index";
import { isStackOverflow } from "../../pegkit/index";
import { dumpNodes, XmlElement } from "../../xml/index";
import { createRenderContext, ROOT_CONTEXT } from "./render";
import { FORMAT, isOwnMissingSymbolDataError, serializeRendered } from "./render-shared";

/**
 * `Formula#to_omml`'s options (formula.rb:157 on the pinned oracle), typed
 * exactly (§5). The three implemented keywords; `unitsml:` is deliberately
 * NOT here — passing it (any value but `undefined`) is a named `RenderError`
 * at runtime (`DEFERRED_OPTIONS`), and a key `to_omml` has no keyword for at
 * all is refused as unknown at the entry.
 */
export interface OmmlOptions {
  /**
   * The gem's `display_style:` keyword. Default: the formula's own
   * `displaystyle` field. Ruby's coercion is `to_s == "true"`
   * (`boolean_display_style`, formula.rb:415), so an explicit `null` — Ruby
   * `nil` — is `false`, NOT the default; `MathmlOptions.displayStyle` reads
   * the same way. Only the renderings that branch on the display style differ
   * (limit-style `lim`/`underset`/`overset`), which is why most inputs are
   * byte-identical either way.
   */
  readonly displayStyle?: boolean | string | null | undefined;
  /**
   * The gem's `split_on_linebreak:` keyword, default false. Ruby truthiness:
   * `null` is off. When on, the formula is cut at each `Linebreak` into one
   * `m:oMath` per line, separated by a Word break run, inside the one
   * `m:oMathPara` (`src/core/linebreak.ts` holds the shared walk).
   */
  readonly splitOnLinebreak?: boolean | null | undefined;
  /**
   * `Formatter::Standard`'s symbols, numeric pipeline, notation, base and
   * string format, resolved by `resolveNumberFormat`
   * (`../../formatting/number-format.ts`) — the other renderers' own field.
   * A number inside the formula renders its formatted text; see
   * `../../render/number/omml.ts` for the two paths the gem takes.
   */
  readonly formatter?: FormatterOptions | null;
}

/**
 * The keys `OmmlOptions` declares, as runtime data; total over the interface,
 * for the reason `IMPLEMENTED_OPTIONS` in the MathML renderer is.
 */
const IMPLEMENTED_OPTIONS: { readonly [K in keyof Required<OmmlOptions>]: null } = {
  displayStyle: null,
  splitOnLinebreak: null,
  formatter: null,
};

/** Public `Formula#to_omml` keywords whose rendering paths are not implemented. */
const DEFERRED_OPTIONS: readonly (readonly [string, string])[] = [
  ["unitsml", "UnitsML is deferred wholesale (ARCHITECTURE.md section 5)"],
];

/**
 * `to_omml_without_math_tag` takes the display style as a positional argument
 * and has no line splitting (that is the formula's), so on the per-node entry
 * these two keywords are recognised and refused by name, as they were before
 * `toOmml` implemented them.
 */
const NODE_ENTRY_REFUSED: readonly (readonly [string, string])[] = [
  [
    "displayStyle",
    "the per-node entry takes no display-style keyword; the gem passes it positionally",
  ],
  [
    "splitOnLinebreak",
    "line splitting belongs to the formula-level toOmml; the per-node entry has none",
  ],
  ...DEFERRED_OPTIONS,
];

/**
 * The option keys both entries accept. A keyword the gem really has but a
 * given entry does not implement is recognised here and refused by name where
 * the reason is known (below), while a key the gem does not have at all is
 * refused as unknown by `assertKnownOptions` (core/render-options.ts). Same
 * split as MathML.
 */
const ACCEPTED_OPTIONS: readonly string[] = [
  ...Object.keys(IMPLEMENTED_OPTIONS),
  ...DEFERRED_OPTIONS.map(([name]) => name),
];

/**
 * The per-node entry's options: `formatter:` only (`to_omml_without_math_tag`
 * reads it from its `options:` hash, as `to_omml` does); the rest are refused
 * by name (`NODE_ENTRY_REFUSED`).
 */
export interface OmmlNodeOptions {
  readonly formatter?: FormatterOptions | null;
}

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
export function toOmmlWithoutMathTag(node: MathNode, options?: OmmlNodeOptions | null): string {
  // The options come first, as they do in Ruby: the keyword check there is
  // part of the call, so an unknown keyword raises before the method body
  // ever looks at the receiver.
  assertKnownOptions(options, ACCEPTED_OPTIONS, FORMAT);
  assertMathNodeShape(node, FORMAT);
  return atBoundary(() => {
    assertSupportedOptions(options, node.kind, NODE_ENTRY_REFUSED);
    const numberFormat = resolveNumberFormat(options?.formatter, FORMAT);
    const context = numberFormat === null ? ROOT_CONTEXT : createRenderContext(true, numberFormat);
    return serializeRendered(context.render(node));
  });
}

/** `Formula#to_omml`; only Formula and its Mrow subclass own this public wrapper. */
export function toOmml(node: MathNode, options?: OmmlOptions | null): string {
  assertKnownOptions(options, ACCEPTED_OPTIONS, FORMAT);
  assertMathNodeShape(node, FORMAT);
  return atBoundary(() => {
    assertSupportedOptions(options, node.kind, DEFERRED_OPTIONS);
    if (node.kind !== "formula" && node.kind !== "mrow") {
      throw new RenderError(
        `to_omml is defined on Formula and its subclasses only — received "${node.kind}"`,
        FORMAT,
        node.kind,
      );
    }

    const values: Record<string, unknown> =
      options === null || options === undefined ? {} : (options as Record<string, unknown>);
    // An explicit `undefined` is an absent key (the deferred keywords read the
    // same way below), where `null` is Ruby's `nil`.
    const displayValue =
      Object.hasOwn(values, "displayStyle") && values.displayStyle !== undefined
        ? values.displayStyle
        : node.displaystyle;
    // `boolean_display_style`: `display_style.to_s == "true"`.
    const context = createRenderContext(
      String(displayValue) === "true",
      resolveNumberFormat(options?.formatter, FORMAT),
    );
    // Ruby truthiness: only `nil` and `false` are off (`undefined` is absent).
    const splitValue = Object.hasOwn(values, "splitOnLinebreak")
      ? values.splitOnLinebreak
      : undefined;
    const split = splitValue !== undefined && splitValue !== null && splitValue !== false;

    const para = new XmlElement("m:oMathPara").setAttributes(OMML_NAMESPACES);
    const lines = split ? splitOnLinebreak(node) : [node];
    for (const [index, line] of lines.entries()) {
      para.append(new XmlElement("m:oMath").append(context.render(line)));
      // `omml_br_tag`: a Word break run between lines, never after the last.
      if (index < lines.length - 1) para.append(BreakRun());
    }
    return dumpNodes(para, { indent: 2 });
  });
}

/** `Formula#omml_br_tag`: `<m:r><br/></m:r>`, the bare `br` carrying no namespace. */
function BreakRun(): XmlElement {
  return new XmlElement("m:r").append(new XmlElement("br"));
}

function assertSupportedOptions(
  options: OmmlOptions | OmmlNodeOptions | null | undefined,
  kind: string,
  refused: readonly (readonly [string, string])[],
): void {
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
  for (const [name, detail] of refused) {
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
    // Only this walk's own surfaces pass through: `RenderError` (the §5
    // contract) and the symbol table's `MissingSymbolDataError` — the one
    // non-RenderError PlurimathError a kind file throws on purpose
    // (`symbolOmmlValue`, on an id the generated table does not carry), and a
    // public error code in its own right. That second pass-through checks
    // membership in the throw site's own instance set
    // (`isOwnMissingSymbolDataError`, render-shared.ts), never `instanceof`:
    // the class is constructible by the input too, and a hostile getter
    // throwing one mid-render is an input failure, not a symbol-table miss.
    if (error instanceof RenderError || isOwnMissingSymbolDataError(error)) throw error;
    // `isStackOverflow` (pegkit/atom.ts), not a bare `instanceof RangeError`:
    // the class alone also matches `UndecodableEntityError` (core/nodes.ts),
    // an ordinary entity-decode refusal that is a `RangeError` subclass but
    // has nothing to do with recursion. This format's kind files decode
    // through `decodeEntities` (render-shared.ts), which turns that error
    // into a `RenderError` first; the narrow check keeps any other
    // `RangeError` from being reported as stack exhaustion.
    if (isStackOverflow(error)) {
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
