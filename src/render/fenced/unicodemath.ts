/**
 * Mirrors `function/fenced.rb` — `Fenced#to_unicodemath` (:104).
 *
 * The most options-dependent kind in the format. Four things are worth naming:
 *
 *   - a **mini-sized** fence takes a different path entirely
 *     (`mini_sized_unicode`, `:182`), joining its contents with no separator
 *     and no added parens;
 *   - a `Frac` child carrying `choose` is rendered by *this* node, not by the
 *     frac — which is why `Frac#to_unicodemath` may return nil for exactly
 *     that shape without anything breaking;
 *   - the open and close parens each have their own three-branch resolution
 *     reading the node's options (`:271`, `:284`);
 *   - `convert_paren_size` (`:301`) rounds a **logarithm**, and Ruby rounds
 *     half away from zero while JS `Math.round` rounds toward +infinity. The
 *     values are negative for any size below 1em, so the difference is
 *     reachable: `0.5em` gives -3.106 and an exact -1.5 would round to -2 in
 *     Ruby and -1 in JS.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { isNode, renderOptionalChild, rubyRound } from "../../formats/unicodemath/render-shared";

/** U+251C and U+2524 — the prefixed-paren markers. */
const OPEN_PREFIX = "├";
const CLOSE_PREFIX = "┤";

export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): string {
  if (isMiniSized(node)) return miniSizedUnicode(node, context);

  const contents = (asArray(node.parameterTwo) ?? []).map((param) =>
    isChooseFrac(param) ? chooseFrac(param, context) : renderOptionalChild(param, context),
  );
  const joined = contents.join(" ");

  // `return fenced_value if choose_frac?(parameter_two.first)` — a leading
  // choose-frac replaces the whole fence, parens included.
  const first = asArray(node.parameterTwo)?.[0];
  if (isChooseFrac(first)) return joined;

  const body = isVertParen(node) ? `(${joined})` : joined;
  return `${openParen(node, context)}${body}${closeParen(node, context)}`;
}

function asArray(slot: unknown): readonly unknown[] | undefined {
  return Array.isArray(slot) ? slot : undefined;
}

/** `Fenced#mini_sized?` (`:176`) — asks all three slots. */
function isMiniSized(node: NodeOf<"fenced">): boolean {
  const contents = asArray(node.parameterTwo);
  return miniOf(node.parameterOne) || miniOf(contents?.[0]) || miniOf(node.parameterThree);
}

function miniOf(field: unknown): boolean {
  if (!isNode(field)) return false;
  const flags = field as { readonly miniSubSized?: boolean; readonly miniSupSized?: boolean };
  return flags.miniSubSized === true || flags.miniSupSized === true;
}

/** `mini_sized_unicode` (`:182`) — joined with nothing, and no added parens. */
function miniSizedUnicode(node: NodeOf<"fenced">, context: RenderContext): string {
  const contents = (asArray(node.parameterTwo) ?? [])
    .map((param) => renderOptionalChild(param, context))
    .join("");
  return `${renderOptionalChild(node.parameterOne, context)}${contents}${renderOptionalChild(node.parameterThree, context)}`;
}

/** `choose_frac?` (`:297`) — a Frac whose own options carry `choose`. */
function isChooseFrac(param: unknown): boolean {
  if (!isNode(param) || param.kind !== "frac") return false;
  const options = (param as { readonly options?: Record<string, unknown> | null }).options;
  return options !== undefined && options !== null && "choose" in options;
}

/** `Frac#choose_frac` (`frac.rb:118`) — rendered here, not by the frac. */
function chooseFrac(param: unknown, context: RenderContext): string {
  if (!isNode(param)) return "";
  const frac = param as { readonly parameterOne?: unknown; readonly parameterTwo?: unknown };
  const one = wrap(frac.parameterOne, context);
  const two = wrap(frac.parameterTwo, context);
  // U+24B8 CIRCLED LATIN CAPITAL LETTER C.
  return `${one}⒞${two}`;
}

function wrap(field: unknown, context: RenderContext): string {
  if (!isNode(field)) return "";
  const rendered = context.render(field) ?? "";
  return field.kind === "fenced" ? rendered : `(${rendered})`;
}

/** `vert_paren?` (`:318`). */
function isVertParen(node: NodeOf<"fenced">): boolean {
  const open = node.parameterOne;
  if (!isNode(open)) return false;
  const value = (open as { readonly value?: string | null }).value;
  if (typeof value === "string") return value.includes("|");
  return open.kind === "symbol" && open.id.startsWith("Paren::Vert");
}

/** `unicode_open_paren` (`:271`). */
function openParen(node: NodeOf<"fenced">, context: RenderContext): string {
  const paren = renderOptionalChild(node.parameterOne, context);
  const options = node.options;
  if (options !== undefined && options !== null && "open_paren" in options) {
    const minsize = (options.open_paren as { minsize?: unknown } | undefined)?.minsize;
    return `${OPEN_PREFIX}${parenSize(minsize)}${paren}`;
  }
  if (options !== undefined && options !== null && "open_prefixed" in options) {
    return isOpenOrBegin(node) ? OPEN_PREFIX : `${OPEN_PREFIX}${paren}`;
  }
  return paren === "{:" ? OPEN_PREFIX : paren;
}

/** `unicode_close_paren` (`:284`). */
function closeParen(node: NodeOf<"fenced">, context: RenderContext): string {
  const paren = renderOptionalChild(node.parameterThree, context);
  const options = node.options;
  if (options !== undefined && options !== null && "close_paren" in options) {
    const minsize = (options.close_paren as { minsize?: unknown } | undefined)?.minsize;
    return `${CLOSE_PREFIX}${parenSize(minsize)}${paren}`;
  }
  if (options !== undefined && options !== null && "close_prefixed" in options) {
    return isCloseOrEnd(node) ? CLOSE_PREFIX : `${CLOSE_PREFIX}${paren}`;
  }
  return paren === ":}" ? CLOSE_PREFIX : paren;
}

/** `open_or_begin?` (`:306`) and `close_or_end?` (`:312`). */
function isOpenOrBegin(node: NodeOf<"fenced">): boolean {
  return valueHasAny(node.parameterOne, ["&#x251c;", "&#x3016;", "{:"]);
}

function isCloseOrEnd(node: NodeOf<"fenced">): boolean {
  return valueHasAny(node.parameterThree, ["&#x2524;", "&#x3017;", ":}"]);
}

function valueHasAny(field: unknown, needles: readonly string[]): boolean {
  if (!isNode(field)) return false;
  const value = (field as { readonly value?: string | null }).value;
  if (typeof value !== "string") return false;
  return needles.some((needle) => value.includes(needle));
}

/** `convert_paren_size` (`:301`). */
function parenSize(minsize: unknown): string {
  if (typeof minsize !== "string") return "";
  const size = Number.parseFloat(minsize.replace(/em$/, ""));
  if (!Number.isFinite(size) || size <= 0) return "";

  return String(rubyRound(Math.log(size) / Math.log(1.25)));
}
