/**
 * `Utility::IntentEncoding` (`utility/intent_encoding.rb`, 318 lines) — the
 * attribute writers `to_mathml(intent: true)` runs over a rendered subtree.
 *
 * The gem edits the `Ox` tree AFTER it is built: it reads a rendered
 * element's children back (`tag.nodes[1]`, `node.nodes.first`), decides an
 * `intent` string from what is there, and writes it as an attribute (and, in
 * two places, an `arg` attribute onto a child). This module does the same to
 * `XmlElement`s, in the gem's own order, so every read-then-write sequence —
 * including the ones whose order is observable — is the gem's.
 *
 * Two conventions run through the file:
 *
 *   - Ruby raises `NoMethodError` / `TypeError` / `NameError` wherever the
 *     tree is not the shape a step reads (`nil.name`, `"text".nodes`, `nil +
 *     "x"`), and `Formula#wrap_render_error` (formula.rb:437) turns each into
 *     the `ParseError` a caller sees. The port raises `RenderError` at the same
 *     sites, through `el`/`nodesOf`/`nameOf`, never a silent default;
 *   - an attribute written through the engine wrapper's `[]=` is entity-decoded
 *     (`OxEngine::Element#update_attrs`, ox_engine/element.rb:104-110); one
 *     written through `tag.attributes["intent"] = ...` is not
 *     (`function_intent`, the only such site). `setDecoded` and `setRaw` are
 *     those two.
 *
 * Not imported by kind files directly: `render-shared.ts` re-exports what they
 * need (`.dependency-cruiser.cjs`, "render-kind-file-imports-allowed-set-only").
 */

import { RenderError } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { type XmlChild, XmlElement } from "../../xml/index";

const FORMAT = "mathml";

/** Ruby's `NoMethodError` (and its `TypeError`/`NameError` cousins) at one read site. */
export function gemCrash(at: string, why: string): RenderError {
  return new RenderError(`intent: ${at} — ${why}`, FORMAT, "formula");
}

/** The receiver of `.name` / `.nodes` / `[]=`: only an element answers them. */
export function el(value: unknown, at: string): XmlElement {
  if (value instanceof XmlElement) return value;
  const what =
    value === null || value === undefined
      ? "nil"
      : typeof value === "string"
        ? "a String"
        : Array.isArray(value)
          ? "an Array"
          : "a non-element";
  throw gemCrash(at, `${what} has no name/nodes/attributes`);
}

export function nameOf(value: unknown, at: string): string {
  return el(value, at).name;
}

export function nodesOf(value: unknown, at: string): readonly XmlChild[] {
  return el(value, at).children;
}

/** `attributes["k"]` through the wrapper's `[]`: nil when absent. */
export function attrOf(value: unknown, name: string, at: string): string | undefined {
  return el(value, at).attributes.get(name);
}

/** `node["k"] = v` — the wrapper's `[]=`, entity-decoded. */
export function setDecoded(value: unknown, name: string, text: string, at: string): void {
  el(value, at).setAttribute(name, htmlEntityToUnicode(text));
}

/** `tag.attributes["k"] = v` — straight into the Ox hash, no decode. */
function setRaw(value: unknown, name: string, text: string, at: string): void {
  el(value, at).setAttribute(name, text);
}

/**
 * `Utility.html_entity_to_unicode(x)`: nil passes through (its `string&.include?`
 * guard), a String decodes, anything else — an element — is not a string and
 * raises at the `include?` send.
 */
export function encode(value: unknown, at: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return htmlEntityToUnicode(value);
  throw gemCrash(at, "an element is not a String");
}

/** `x.nodes.first` where the read must be text: a String, or nil for an empty element. */
export function firstText(value: unknown, at: string): string | undefined {
  const first = nodesOf(value, at)[0];
  return typeof first === "string" ? first : undefined;
}

/** Ruby string interpolation of a possibly-nil value: nil is the empty string. */
function interp(value: string | number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** `str += x` needs a String on the right; nil raises `TypeError`. */
export function concatText(left: string, right: unknown, at: string): string {
  if (typeof right !== "string") throw gemCrash(at, "no implicit conversion into String");
  return left + right;
}

/** Ruby's `Array#[](1..)`: nil for an empty array, else everything after the first. */
export function tailFromOne<T>(items: readonly T[]): readonly T[] | null {
  return items.length === 0 ? null : items.slice(1);
}

/** Ruby's `/(?<![^\n])d(?![^\n])/`-style line anchors: `^` and `$` see only `\n`. */
const DERIVATIVE_TEXT = /(?:&#x214[65];)|(?<![^\n])d(?![^\n])/;

/** `Utility.primes_constants.values` (utility.rb:292): the five prime spellings. */
const PRIME_VALUES: ReadonlySet<string> = new Set([
  "&#x2057;",
  "&#x2034;",
  "&#x2033;",
  "&#x2032;",
  "&#x27;",
]);

/** `Utility.primes_constants.values.any?(node.nodes.first)`. */
export function validPrime(value: unknown, at: string): boolean {
  const first = nodesOf(value, at)[0];
  return typeof first === "string" && PRIME_VALUES.has(first);
}

/** `Utility.primes_constants.value?(x)`. */
function isPrimeValue(value: unknown): boolean {
  return typeof value === "string" && PRIME_VALUES.has(value);
}

/**
 * `IntentEncoding.node_value` (:11-19): the text of a leaf field, or — for
 * anything richer — `$name`, after tagging the field `arg="name"`.
 */
function nodeValue(node: unknown, fieldName: string): string | undefined {
  if (node === null || node === undefined) return undefined;
  const at = "node_value";
  const element = el(node, at);
  if (element.name === "mo" && element.children[0] === "&#x2b1a;") return undefined;
  if (validNodeValue(element)) return encode(element.children[0], at);
  if (allNumeric(element)) return allNumericText(element);
  setDecoded(element, "arg", fieldName, at);
  return `$${fieldName}`;
}

function validNodeValue(node: XmlElement): boolean {
  const name = node.name;
  return (
    name === "mi" ||
    name === "mo" ||
    name === "mn" ||
    (name === "mrow" && node.children.length === 0)
  );
}

function allNumeric(node: XmlElement): boolean {
  return (
    node.name === "mrow" && node.children.every((child) => nameOf(child, "all_numeric?") === "mn")
  );
}

function allNumericText(node: XmlElement): string {
  let text = "";
  for (const child of node.children)
    text = concatText(text, nodesOf(child, "all_numeric")[0], "all_numeric");
  return text;
}

/** `power_base_intent` (:64-70): `[base, power]` for a two-slot script, else nil. */
function powerBaseIntent(field: unknown): [string | undefined, string | undefined] | null {
  const name = nameOf(field, "power_base_intent");
  if (name !== "munderover" && name !== "msubsup") return null;
  const children = nodesOf(field, "power_base_intent");
  return [nodeValue(children[1], "l"), nodeValue(children[2], "h")];
}

/** `power_or_base_intent` (:72-80): the one-slot scripts. */
function powerOrBaseIntent(field: unknown): [string | undefined, string | undefined] | null {
  const children = nodesOf(field, "power_or_base_intent");
  const valueNode = children[1];
  const name = nameOf(field, "power_or_base_intent");
  const isSup = name === "msup" || name === "mover";
  const isSub = name === "msub" || name === "munder";
  if (!isSup && !isSub) return null;
  if (isSup) return [undefined, nodeValue(valueNode, "h")];
  return [nodeValue(valueNode, "l"), undefined];
}

/** `naryand_intent` (:22-42). */
export function naryandIntent(field: XmlElement, intentName: string): XmlElement {
  if (field.name === "mrow") return naryIntent(field, intentName);
  let pair = powerBaseIntent(field);
  if (!(pair !== null && pair[0] !== undefined && pair[1] !== undefined)) {
    pair = powerOrBaseIntent(field);
  }
  const [base, power] = pair ?? [undefined, undefined];
  setDecoded(field, "intent", `${intentName}(${interp(base)},${interp(power)})`, "naryand_intent");
  return field;
}

function naryIntent(field: XmlElement, intentName: string): XmlElement {
  const children = field.children;
  const subSup = children[0];
  let pair = powerBaseIntent(subSup);
  if (!(pair !== null && (pair[0] !== undefined || pair[1] !== undefined))) {
    pair = powerOrBaseIntent(subSup);
  }
  const [base, power] = pair ?? [undefined, undefined];
  const naryand = nodeValue(children[1], "naryand");
  setDecoded(
    field,
    "intent",
    `${intentName}(${interp(base)},${interp(power)},${interp(naryand)})`,
    "nary_intent",
  );
  return field;
}

/** `function_intent` (:83-86): the one raw (undecoded) write. */
export function functionIntent(tag: XmlElement, intentName: string): XmlElement {
  setRaw(tag, "intent", intentName, "function_intent");
  return tag;
}

function binomialFractionIntent(tag: XmlElement, intentName: string): XmlElement {
  const inner = nodesOf(tag, "binomial_fraction_intent")[1];
  const numerator = nodeValue(nodesOf(inner, "binomial_fraction_intent")[0], "t");
  const denominator = nodeValue(nodesOf(inner, "binomial_fraction_intent")[1], "b");
  setDecoded(
    tag,
    "intent",
    `${intentName}(${interp(numerator)},${interp(denominator)})`,
    "binomial",
  );
  return tag;
}

/** The gem's `Fenced#intent_names` (fenced.rb:189-198), keyed by the symbol `intent_value` answers (camelCased here). */
export const FENCED_INTENT_NAMES = {
  openClosedInterval: "open-closed-interval",
  closedOpenInterval: "closed-open-interval",
  binomialCoefficient: "binomial-coefficient",
  closedInterval: "closed-interval",
  openInterval: "open-interval",
  fenced: ":fenced",
} as const;

export type FencedIntentName = keyof typeof FENCED_INTENT_NAMES;

/** `interval_fence_intent` (:96-108); `intentName` is nil where `interval_intent` answered nil. */
export function intervalFenceIntent(
  tag: XmlElement,
  intentName: FencedIntentName | undefined,
): XmlElement {
  const intent = intentName === undefined ? undefined : FENCED_INTENT_NAMES[intentName];
  if (intentName === "fenced") return functionIntent(tag, intent as string);
  if (intentName === "binomialCoefficient") return binomialFractionIntent(tag, intent as string);
  const children = nodesOf(tag, "interval_fence_intent");
  const first = fenceNodeValue(children[1], "a");
  const second = fenceNodeValue(children[3], "b");
  setDecoded(tag, "intent", `${interp(intent)}(${interp(first)},${interp(second)})`, "interval");
  return tag;
}

function fenceNodeValue(tag: unknown, argName: string): string | undefined {
  const children = tag === null || tag === undefined ? undefined : nodesOf(tag, "fence_node_value");
  if (!inftyNodes(children)) return nodeValue(tag, argName);
  const list = children as readonly XmlChild[];
  const firstNode = encode(nodesOf(list[0], "fence_node_value")[0], "fence_node_value");
  const lastNode = encode(
    nodesOf(list[list.length - 1], "fence_node_value")[0],
    "fence_node_value",
  );
  const name = `${interp(firstNode)}${interp(lastNode)}`;
  setDecoded(tag, "arg", name, "fence_node_value");
  return name;
}

function inftyNodes(nodes: readonly XmlChild[] | undefined): boolean {
  if (nodes === undefined || nodes.length !== 2) return false;
  const first = nodesOf(nodes[0], "infty_nodes?")[0];
  const last = nodesOf(nodes[1], "infty_nodes?")[0];
  return (first === "&#x2212;" || first === "-" || first === "+") && last === "&#x221e;";
}

/** `frac_intent` (:111-121); `intent_names` is `Frac#intent_names`. */
export function fracIntent(tag: XmlElement): XmlElement {
  const children = tag.children;
  const num = children[0];
  const den = children[1];
  if (partialDerivativeFrac(num, den)) return partialDerivative(tag, ":partial-derivative");
  if (derivativeFrac(num, den)) return derivative(tag, ":derivative");
  return tag;
}

/** `abs_intent` (:124-127). */
export function absIntent(tag: XmlElement, intentName: string): XmlElement {
  const value = nodeValue(nodesOf(tag, "abs_intent")[1], "a");
  setDecoded(tag, "intent", `${intentName}(${interp(value)})`, "abs_intent");
  return tag;
}

// --- Frac partial derivative (:170-262) -------------------------------------

function partialDerivativeFrac(num: unknown, den: unknown): boolean {
  return validateFieldAndValue(num, null) && validateFieldAndValue(den, null);
}

function validateFieldAndValue(node: unknown, parent: XmlElement | null): boolean {
  switch (nameOf(node, "validate_field_and_value")) {
    case "mo":
      return nodesOf(node, "validate_field_and_value")[0] === "&#x2202;";
    case "mrow":
      return validateFieldAndValue(
        nodesOf(node, "validate_field_and_value")[0],
        node as XmlElement,
      );
    case "msup":
    case "msubsup":
      if (validateFieldAndValue(nodesOf(node, "validate_field_and_value")[0], parent)) {
        if (parent !== null) wrapInMrow(parent);
        return true;
      }
      return false;
    default:
      return false;
  }
}

/**
 * `IntentEncoding.wrap_in_mrow` (:236-247). It looks like it wraps the tail
 * in `<mrow arg="n">`, and it does not: it replaces the node's children with
 * `[first, *mrow.xml_nodes.nodes]`, and `mrow.xml_nodes.nodes` is the mrow's
 * CHILDREN, not the mrow — so the list comes out exactly as it went in
 * (measured: `frac(del^2 f)(del x^2)` carries no `arg="n"` element). What is
 * observable is only the raise on a childless node, which is kept.
 */
function wrapInMrow(node: XmlElement): void {
  const tail = tailFromOne(node.children);
  if (tail !== null && tail.length === 0) return;
  const first = node.children[0];
  if (!(first instanceof XmlElement)) {
    throw gemCrash("wrap_in_mrow", "the first child has no xml_nodes");
  }
  node.replaceChildren([first, ...(tail ?? [])]);
}

function findPowerBaseNodes(node: unknown): unknown {
  const name = nameOf(node, "find_power_base_nodes");
  if (name === "msup" || name === "msubsup") return nodesOf(node, "find_power_base_nodes")[1];
  for (const child of nodesOf(node, "find_power_base_nodes")) {
    const childName = nameOf(child, "find_power_base_nodes");
    if (childName === "msup" || childName === "msubsup")
      return nodesOf(child, "find_power_base_nodes")[1];
  }
  return undefined;
}

function partialArg(node: XmlElement): string {
  const found = findPowerBaseNodes(node.children[0]);
  if (found === undefined) return "1";
  switch (nameOf(found, "partial_arg")) {
    case "mo":
    case "mi":
    case "mn":
      return interp(encode(nodesOf(found, "partial_arg")[0], "partial_arg"));
    default:
      return "$n";
  }
}

function fArg(node: unknown): string {
  const nodes =
    node === null || node === undefined ? undefined : tailFromOne(nodesOf(node, "f_arg"));
  const allMi =
    nodes === null || nodes === undefined
      ? undefined
      : nodes.every((e) => nameOf(e, "f_arg") === "mi");
  if (allMi !== true) return insertFunctionArg(node as XmlElement, nodes);
  const first = (nodes as readonly XmlChild[])[0];
  return interp(first === undefined ? undefined : firstText(first, "f_arg"));
}

function insertFunctionArg(
  node: XmlElement,
  nodes: readonly XmlChild[] | null | undefined,
): string {
  if (nodes === null || nodes === undefined) throw gemCrash("insert_f_arg", "nil has no empty?");
  const name = nameOf(node, "insert_f_arg");
  if (nodes.length !== 0 && name !== "msup" && name !== "msubsup") {
    const first = node.children[0];
    if (!(first instanceof XmlElement))
      throw gemCrash("insert_f_arg", "the first child is not an element");
    const mrow = new XmlElement("mrow").setAttribute("arg", "$f").append(nodes);
    node.replaceChildren([first, mrow]);
  }
  return "$f";
}

function denArg(node: unknown, nodes: readonly XmlChild[] = []): string {
  let parts: (string | undefined)[] = [];
  switch (nameOf(node, "den_arg")) {
    case "mo": {
      const tail = tailFromOne(nodes);
      if (tail === null) throw gemCrash("extract_string", "nil has no each");
      parts = extractString(tail, parts);
      break;
    }
    case "msup":
      parts = powerArg(nodesOf(node, "den_arg"), parts);
      break;
    case "mrow": {
      const children = nodesOf(node, "den_arg");
      parts.push(denArg(children[0], children));
      break;
    }
  }
  return parts.map(interp).join(",");
}

/**
 * `power_arg` (:169-176). `str.last << nodes[1].nodes[0]` appends IN PLACE to
 * the last collected String — and when that String came straight out of
 * `html_entity_to_unicode` (which returns its argument untouched when there is
 * no `&` in it) it IS the text node of the rendered element, so the append is
 * visible in the output. The port reproduces that: the text child is rewritten.
 * (The gem's append also reaches the source node's own value, so a second
 * render of the same tree grows a second prime there; a port node is immutable
 * and does not.)
 */
function powerArg(
  nodes: readonly XmlChild[],
  parts: (string | undefined)[],
): (string | undefined)[] {
  const base = nodes[0];
  const owners: (XmlElement | null)[] = [];
  for (const child of nodesOf(base, "power_arg")) {
    const grand = nodesOf(child, "power_arg")[0];
    if (grand === "&#x2202;") continue;
    const text = encode(grand, "power_arg");
    parts.push(text);
    owners.push(typeof grand === "string" && text === grand ? (child as XmlElement) : null);
  }
  const prime = nodesOf(nodes[1], "power_arg")[0];
  if (isPrimeValue(prime)) {
    const last = parts[parts.length - 1];
    if (last === undefined) throw gemCrash("power_arg", "nil has no <<");
    const grown = last + (prime as string);
    parts[parts.length - 1] = grown;
    const owner = owners[owners.length - 1];
    if (owner !== null && owner !== undefined) {
      owner.replaceChildren([grown, ...owner.children.slice(1)]);
    }
  }
  return parts;
}

function extractString(
  nodes: readonly XmlChild[],
  parts: (string | undefined)[],
): (string | undefined)[] {
  for (const node of nodes) {
    switch (nameOf(node, "extract_string")) {
      case "mi":
        parts.push(encode(nodesOf(node, "extract_string")[0], "extract_string"));
        break;
      case "msup":
      case "msubsup": {
        const base = nodesOf(node, "extract_string")[0];
        parts.push(encode(nodesOf(base, "extract_string")[0], "extract_string"));
        break;
      }
    }
  }
  return parts;
}

function partialDerivative(node: XmlElement, intentName: string): XmlElement {
  // Interpolation order is the gem's, and `f_arg` mutates the tree.
  const first = partialArg(node);
  const second = fArg(node.children[0]);
  const third = denArg(node.children[1]);
  setDecoded(node, "intent", `${intentName}(${first},${second},${third})`, "partial_derivative");
  return node;
}

// --- Frac derivative (:264-300) ---------------------------------------------

function derivativeFrac(num: unknown, den: unknown): boolean {
  if (!num && !den) return false;
  return validDerivative(num) && validDerivative(den);
}

function validDerivative(node: unknown): boolean {
  const name = nameOf(node, "valid_derivative?");
  const children = nodesOf(node, "valid_derivative?");
  if (name === "mi" || name === "mo" || name === "mn") {
    if (typeof children[0] !== "string")
      throw gemCrash("valid_derivative?", "nil/element has no match?");
    return DERIVATIVE_TEXT.test(children[0]);
  }
  const first = children[0];
  const innerText = nodesOf(first, "valid_derivative?")[0];
  if (nameOf(first, "valid_derivative?") !== "mi") return false;
  if (typeof innerText !== "string")
    throw gemCrash("valid_derivative?", "nil/element has no match?");
  return DERIVATIVE_TEXT.test(innerText) && children.length >= 2;
}

function derivative(node: XmlElement, intentName: string): XmlElement {
  const num = node.children[0];
  const den = node.children[1];
  const first = numArg(num);
  const second = derivativeDenArg(den);
  setDecoded(node, "intent", `${intentName}(1,${first},${interp(second)})`, "derivative");
  return node;
}

function numArg(num: unknown): string {
  const children = nodesOf(num, "num_arg");
  if (children.length <= 1) return "$f";
  switch (nameOf(children[1], "num_arg")) {
    case "mi":
    case "mo":
    case "mn":
      return interp(firstText(children[1], "num_arg"));
    default:
      setDecoded(children[1], "arg", "f", "num_arg");
      return "$f";
  }
}

function derivativeDenArg(den: unknown): string | undefined {
  const children = nodesOf(den, "derivative_den_arg");
  if (children.length <= 1) return undefined;
  return firstText(children[1], "derivative_den_arg");
}
