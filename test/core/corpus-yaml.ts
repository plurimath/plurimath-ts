/**
 * A YAML reader for the generated corpus, and nothing more.
 *
 * The package has no YAML dependency and `package.json` is not this task's to
 * change, so the suite reads `corpus/*.yaml` with this. It covers exactly the
 * subset Psych emits for those files — block mappings and sequences, plain,
 * single- and double-quoted scalars, literal block scalars, and empty flow
 * collections — and **throws on anything else** rather than guessing. A silent
 * misparse here would make the corpus agree with a broken model.
 */

export type YamlValue =
  | null
  | boolean
  | number
  | string
  | readonly YamlValue[]
  | { readonly [key: string]: YamlValue };

interface State {
  readonly lines: readonly string[];
  index: number;
}

/**
 * A key runs to the first `": "` or to a colon at end of line — a colon inside
 * a key is legal and the census uses it (`Math::Formula:`), so the match is
 * lazy rather than colon-free.
 */
const KEY_PATTERN = /^([^\s].*?):(?:[ \t]+(.*))?$/;

export function parseYaml(text: string): YamlValue {
  const lines = text.split("\n");
  const state: State = { lines, index: 0 };
  // Skip the header comments and the document start marker.
  while (state.index < lines.length) {
    const line = lines[state.index] ?? "";
    state.index += 1;
    if (line === "---") break;
  }
  skipBlank(state);
  if (state.index >= lines.length) return null;
  return parseValue(state, indentOf(lines[state.index] ?? ""));
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function skipBlank(state: State): void {
  while (state.index < state.lines.length && isBlank(state.lines[state.index] ?? "")) {
    state.index += 1;
  }
}

function parseValue(state: State, column: number): YamlValue {
  const rest = (state.lines[state.index] ?? "").slice(column);
  if (rest === "-" || rest.startsWith("- ")) return parseSequence(state, column);
  if (KEY_PATTERN.test(rest)) return parseMapping(state, column);
  state.index += 1;
  return parseScalar(rest);
}

function parseMapping(state: State, column: number): { readonly [key: string]: YamlValue } {
  const result: { [key: string]: YamlValue } = {};
  let first = true;
  while (state.index < state.lines.length) {
    skipBlank(state);
    if (state.index >= state.lines.length) break;
    const line = state.lines[state.index] ?? "";
    if (!first && indentOf(line) !== column) break;
    const rest = line.slice(column);
    if (!first && (rest === "-" || rest.startsWith("- "))) break;
    const match = KEY_PATTERN.exec(rest);
    if (match === null) throw new Error(`not a mapping entry at line ${state.index + 1}: ${line}`);
    const key = match[1] ?? "";
    const inline = match[2];
    if (key in result) throw new Error(`duplicate key "${key}" at line ${state.index + 1}`);
    state.index += 1;
    if (inline !== undefined && (inline === "|" || inline === "|-" || inline === "|+")) {
      result[key] = parseBlockScalar(state, column, inline);
    } else if (inline !== undefined && inline !== "") {
      result[key] = parseScalar(inline);
    } else {
      result[key] = parseNested(state, column);
    }
    first = false;
  }
  return result;
}

function parseSequence(state: State, column: number): readonly YamlValue[] {
  const items: YamlValue[] = [];
  let first = true;
  while (state.index < state.lines.length) {
    skipBlank(state);
    if (state.index >= state.lines.length) break;
    const line = state.lines[state.index] ?? "";
    if (!first && indentOf(line) !== column) break;
    const rest = line.slice(column);
    if (rest !== "-" && !rest.startsWith("- ")) {
      if (first) throw new Error(`not a sequence item at line ${state.index + 1}: ${line}`);
      break;
    }
    if (rest === "-") {
      state.index += 1;
      items.push(parseNested(state, column));
    } else {
      const after = rest.slice(1);
      const offset = after.length - after.trimStart().length;
      items.push(parseValue(state, column + 1 + offset));
    }
    first = false;
  }
  return items;
}

/** The value of a key (or dash) whose content sits on the following lines. */
function parseNested(state: State, column: number): YamlValue {
  const probe = { ...state };
  skipBlank(probe);
  if (probe.index >= state.lines.length) return null;
  const next = state.lines[probe.index] ?? "";
  const nextIndent = indentOf(next);
  const isSibling =
    nextIndent === column && (next.slice(column) === "-" || next.slice(column).startsWith("- "));
  if (nextIndent <= column && !isSibling) return null;
  state.index = probe.index;
  return parseValue(state, nextIndent);
}

function parseBlockScalar(state: State, column: number, header: string): string {
  const collected: string[] = [];
  let blockIndent = -1;
  while (state.index < state.lines.length) {
    const line = state.lines[state.index] ?? "";
    if (isBlank(line)) {
      collected.push("");
      state.index += 1;
      continue;
    }
    const lineIndent = indentOf(line);
    if (lineIndent <= column) break;
    if (blockIndent === -1) blockIndent = lineIndent;
    collected.push(line.slice(blockIndent));
    state.index += 1;
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();
  const body = collected.join("\n");
  return header === "|-" ? body : `${body}\n`;
}

function parseScalar(raw: string): YamlValue {
  const text = raw.trim();
  if (text === "" || text === "~" || text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "{}") return {};
  if (text === "[]") return [];
  if (text.startsWith('"')) return parseDoubleQuoted(text);
  if (text.startsWith("'")) return parseSingleQuoted(text);
  if (text.startsWith("{") || text.startsWith("[")) {
    throw new Error(`flow collections beyond {} and [] are not supported: ${text}`);
  }
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return Number.parseFloat(text);
  return text;
}

function parseSingleQuoted(text: string): string {
  if (!text.endsWith("'") || text.length < 2) throw new Error(`unterminated scalar: ${text}`);
  return text.slice(1, -1).replaceAll("''", "'");
}

const SIMPLE_ESCAPES: ReadonlyMap<string, string> = new Map([
  ["0", "\0"],
  ["a", "\u0007"],
  ["b", "\b"],
  ["t", "\t"],
  ["n", "\n"],
  ["v", "\v"],
  ["f", "\f"],
  ["r", "\r"],
  ["e", "\u001b"],
  ['"', '"'],
  ["\\", "\\"],
  ["/", "/"],
  [" ", " "],
  // The four remaining escapes Psych accepts, checked against Psych 5.4.0 on
  // Ruby 4.0.1. None appears in the corpus today, but `\_` (a non-breaking
  // space) is a plausible symbol value, and rejecting it would be a false
  // alarm. Written as code points, not escape sequences, because a scripted
  // edit has twice put a literal control byte into a source file here.
  ["N", String.fromCodePoint(0x85)],
  ["_", String.fromCodePoint(0xa0)],
  ["L", String.fromCodePoint(0x2028)],
  ["P", String.fromCodePoint(0x2029)],
]);

/**
 * The escapes that introduce a fixed-width hex code, and how many digits each
 * one needs. Psych demands exactly that many, all of them hex: `"\u12zz"`
 * raises `Psych::SyntaxError` ("did not find expected hexdecimal number")
 * rather than reading U+0012 and carrying on. `Number.parseInt` is the
 * opposite — it stops at the first character it cannot use and keeps what it
 * has — so the digits are validated before it ever sees them.
 */
const HEX_ESCAPE_WIDTHS: ReadonlyMap<string, number> = new Map([
  ["x", 2],
  ["u", 4],
  ["U", 8],
]);

/** Anchored both ends, so `parseInt`'s tolerance for signs and trailing junk cannot apply. */
const HEX_DIGITS = /^[0-9a-fA-F]+$/;

/**
 * A hex escape must name a Unicode *scalar* value. `\U00110000` is past the
 * end, and `\uD83D` is half a surrogate pair; Psych raises "found invalid
 * Unicode character escape code" for both, and so does this reader rather than
 * emitting a lone surrogate nothing else can read back.
 */
const MAX_CODE_POINT = 0x10ffff;
const FIRST_SURROGATE = 0xd800;
const LAST_SURROGATE = 0xdfff;

function isScalarValue(code: number): boolean {
  return code <= MAX_CODE_POINT && (code < FIRST_SURROGATE || code > LAST_SURROGATE);
}

function parseDoubleQuoted(text: string): string {
  if (!text.endsWith('"') || text.length < 2) throw new Error(`unterminated scalar: ${text}`);
  const inner = text.slice(1, -1);
  let result = "";
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index] ?? "";
    if (character !== "\\") {
      result += character;
      continue;
    }
    index += 1;
    const marker = inner[index] ?? "";
    const simple = SIMPLE_ESCAPES.get(marker);
    if (simple !== undefined) {
      result += simple;
      continue;
    }
    const width = HEX_ESCAPE_WIDTHS.get(marker);
    if (width === undefined) throw new Error(`unsupported escape \\${marker} in ${text}`);
    const digits = inner.slice(index + 1, index + 1 + width);
    if (digits.length !== width || !HEX_DIGITS.test(digits)) {
      throw new Error(
        `malformed escape \\${marker}${digits} in ${text}: ` +
          `\\${marker} takes exactly ${width} hex digits`,
      );
    }
    const code = Number.parseInt(digits, 16);
    if (!isScalarValue(code)) {
      throw new Error(`escape \\${marker}${digits} in ${text} is not a Unicode scalar value`);
    }
    result += String.fromCodePoint(code);
    index += width;
  }
  return result;
}
