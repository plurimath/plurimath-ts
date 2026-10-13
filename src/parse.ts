/** Root input dispatcher. Format tokens match the compat constructor. */
import type { Format } from "./compat/index";
import { describeThrown, requireKnownParseOptions } from "./core/errors";
import { type FormulaNode, InvalidTypeError, UnsupportedFormatError } from "./core/index";
import { type AsciimathParseOptions, parseAsciimath } from "./formats/asciimath/index";
import { type HtmlParseOptions, parseHtml } from "./formats/html/index";
import { type LatexParseOptions, parseLatex } from "./formats/latex/index";
import { parseMathml } from "./formats/mathml/index";
import { parseOmml } from "./formats/omml/index";
import { parseUnicodemath, type UnicodemathParseOptions } from "./formats/unicodemath/index";

/** XML parsers currently accept no parse options; an empty object is allowed. */
export type ParseOptions<F extends Format> = F extends "asciimath"
  ? AsciimathParseOptions
  : F extends "latex"
    ? LatexParseOptions
    : F extends "html"
      ? HtmlParseOptions
      : F extends "unicode"
        ? UnicodemathParseOptions
        : Record<string, never>;

const NO_XML_OPTIONS: ReadonlySet<string> = new Set();
// Same accepted-token order as Math.parse and the compat constructor; UnitsML
// is recognized at runtime but excluded from Format while its parser is deferred.
const PARSE_TYPES = ["omml", "html", "latex", "mathml", "unitsml", "unicode", "asciimath"];

/**
 * Reads a formula through its format's existing parser. Text formats forward
 * locale and diagnostic options unchanged. MathML and OMML reject option keys
 * before reading XML. Unknown formats raise InvalidTypeError; the recognized
 * but deferred UnitsML parser raises UnsupportedFormatError.
 */
export function parse<F extends Format>(
  input: string,
  format: F,
  options?: ParseOptions<NoInfer<F>> | null,
): FormulaNode;
export function parse(input: string, format: string, options?: object | null): FormulaNode {
  switch (format) {
    case "asciimath":
      return parseAsciimath(input, options as AsciimathParseOptions | null | undefined);
    case "latex":
      return parseLatex(input, options as LatexParseOptions | null | undefined);
    case "html":
      return parseHtml(input, options as HtmlParseOptions | null | undefined);
    case "unicode":
      return parseUnicodemath(input, options as UnicodemathParseOptions | null | undefined);
    case "mathml":
      requireKnownParseOptions(options, NO_XML_OPTIONS);
      return parseMathml(input);
    case "omml":
      requireKnownParseOptions(options, NO_XML_OPTIONS);
      return parseOmml(input);
    case "unitsml":
      throw new UnsupportedFormatError(format);
    default:
      throw new InvalidTypeError(
        typeof format === "string" ? format : describeThrown(format),
        PARSE_TYPES,
        `\`type\` must be one of: \`${PARSE_TYPES.join("`, `")}\``,
      );
  }
}
