/**
 * `Formula#intent_post_processing` and its helpers (`formula.rb:491-810`, the
 * ~320 lines the gem runs over a formula's rendered children under
 * `to_mathml(intent: true)`), plus the same partial-derivative pass
 * `Fenced#mathml_value` repeats over its body (`fenced.rb:407-436`).
 *
 * The input is the ARRAY of rendered children (`mathml_content`'s `nodes`),
 * edited in place: the gem deletes some of them, wraps others, and inserts a
 * new `<mrow intent=...>` at the front, and the caller keeps using the same
 * array. Ruby's raises (`nil.name` on a formula that is only `UpcaseDd`, `"x".nodes`
 * on a text child) are `RenderError`s here, at the same read sites — see
 * `./intent-encoding.ts` for the convention. Every one of the gem's quirks is
 * kept and named where it is:
 *
 *   - `partial_derivative_intent`'s `mn` arm reads an UNDEFINED local (`node`),
 *     and `sup_intent_content`'s `mi` arm reads an undefined `first_node`:
 *     `NameError`, so those inputs raise;
 *   - `wrap_in_mrow` (this file's, not the encoder's) runs on a COPY of the
 *     list, so its result is thrown away — only its raises and its non-termination
 *     survive, and the latter is refused here rather than reproduced;
 *   - `validate_upcase_dd_derivatives?` reads `nodes[1].name` before checking a
 *     second node exists, so a formula that is just `Symbols::UpcaseDd` raises
 *     (TODO.plan/deferred.md, the known gem defect this port reproduces).
 */

import { RenderError } from "../../core/index";
import { type XmlChild, XmlElement } from "../../xml/index";
import {
  attrOf,
  concatText,
  el,
  encode,
  firstText,
  gemCrash,
  nameOf,
  nodesOf,
  setDecoded,
  tailFromOne,
  validPrime,
} from "./intent-encoding";

const FORMAT = "mathml";

/** `Formula::DERIVATIVE_CONSTS` (formula.rb:15). */
const DERIVATIVE_CONSTS: readonly string[] = ["&#x1d451;", "&#x2145;", "&#x2146;", "d"];

/** The list of rendered children, as `to_mathml_without_math_tag` answers them. */
type Rendered = unknown[];

function isDerivativeConst(value: unknown): boolean {
  return typeof value === "string" && DERIVATIVE_CONSTS.includes(value);
}

/** `update_nodes(ox_element("mrow"), nodes)`: the flat snapshot of the children, nil skipped. */
function snapshotOf(nodes: Rendered): XmlElement {
  return new XmlElement("mrow").append(nodes as never);
}

/**
 * `mrow.locate(path)` for the two paths this file uses. Ox's `*` step is
 * "any descendant", and a leading `*` also lets the start element itself be
 * checked, so `*​/mfrac/@attr` is any `mfrac` below `root` carrying `attr`
 * and `*​/@arg` is any element at or below the start carrying `arg`
 * (ox/element.rb:168-184, `alocate`).
 */
function hasDescendant(root: XmlElement, name: string, attribute: string): boolean {
  for (const child of root.children) {
    if (typeof child === "string") continue;
    if (child.name === name && child.attributes.has(attribute)) return true;
    if (hasDescendant(child, name, attribute)) return true;
  }
  return false;
}

function argValues(root: XmlElement, out: string[] = []): string[] {
  const value = root.attributes.get("arg");
  if (value !== undefined) out.push(value);
  for (const child of root.children) if (typeof child !== "string") argValues(child, out);
  return out;
}

/** `intent_post_processing` (formula.rb:106-113). */
export function intentPostProcessing(nodes: Rendered): void {
  const snapshot = snapshotOf(nodes);
  if (validateUpcaseDdDerivatives(nodes)) upcaseDdDerivative(nodes);
  if (validateSubsupDdDerivatives(nodes)) subsupDdDerivative(nodes);
  if (validPartialDerivative(nodes)) partialDerivative(nodes);
  if (hasDescendant(snapshot, "mfrac", "arg")) updatePartialDerivativeNodes(nodes);
}

/**
 * `Fenced#mathml_value`'s intent branch (fenced.rb:411-414): the same
 * reduce as `update_partial_derivative_nodes`, gated on an `mfrac` carrying an
 * `intent` (not an `arg`) anywhere below the body.
 */
export function fencedPartialDerivative(nodes: Rendered): void {
  if (hasDescendant(snapshotOf(nodes), "mfrac", "intent")) updatePartialDerivativeNodes(nodes);
}

// --- update_partial_derivative_nodes (:118-131) -----------------------------

function updatePartialDerivativeNodes(nodes: Rendered): void {
  if (nodes.length === 0) return;
  let first = nodes[0];
  for (let index = 1; index < nodes.length; index++) {
    const second = nodes[index];
    if (validPartialNode(first)) {
      const secondName = nameOf(second, "update_partial_derivative_nodes");
      if (secondName === "mfrac" || secondName === "mo") {
        const current = attrOf(first, "intent", "update_partial_derivative_nodes");
        if (current === undefined)
          throw gemCrash("update_partial_derivative_nodes", "nil has no gsub");
        setDecoded(
          first,
          "intent",
          current.split("$f").join(""),
          "update_partial_derivative_nodes",
        );
      } else {
        setDecoded(second, "arg", "f", "update_partial_derivative_nodes");
      }
    }
    first = second;
  }
}

function validPartialNode(node: unknown): boolean {
  if (nameOf(node, "valid_partial_node") !== "mfrac") return false;
  const intent = attrOf(node, "intent", "valid_partial_node");
  return (
    intent?.startsWith(":partial-derivative") === true &&
    !argValues(node as XmlElement).includes("f")
  );
}

// --- Partial derivative on a subscripted del (:133-274) ---------------------

function validPartialDerivative(nodes: Rendered): boolean {
  let valid = false;
  for (let index = 0; index + 1 < nodes.length; index++) {
    const first = nodes[index];
    if (nameOf(first, "valid_partial_derivative?") !== "msub") continue;
    const base = nodesOf(first, "valid_partial_derivative?")[0];
    if (nodesOf(base, "valid_partial_derivative?")[0] === "&#x2202;") valid = true;
  }
  return valid;
}

function partialDerivative(nodes: Rendered): void {
  // `nodes.each.with_index` re-reads the length each step, and `f_arg` shrinks
  // and regrows the list under it.
  for (let index = 0; index < nodes.length; index++) {
    const first = nodes[index];
    if (nameOf(first, "partial_derivative") !== "msub") continue;
    const base = nodesOf(first, "partial_derivative")[0];
    if (!nodesOf(base, "partial_derivative").includes("&#x2202;")) continue;
    setDecoded(first, "intent", partialDerivativeIntent(first as XmlElement), "partial_derivative");
    fArg(nodes, index + 1);
  }
}

/** Numeric digits, one per comma-joined char: `numeric_encoding` (:795-798). */
function numericEncoding(node: unknown, at: string): [number, string] {
  const text = nodesOf(node, at)[0];
  if (typeof text !== "string") throw gemCrash(at, "a non-String has no chars");
  const chars = [...text];
  return [chars.length, chars.join(",")];
}

/** `str.include?(",") ? str.split(",").length : str.length`, and the matching second argument. */
function arities(str: string): [number, string] {
  if (str.includes(",")) {
    // Ruby's `split(",")` drops trailing empty fields.
    const fields = str.split(",");
    while (fields.length > 0 && fields[fields.length - 1] === "") fields.pop();
    return [fields.length, str];
  }
  return [[...str].length, [...str].join(",")];
}

function collectLetters(children: readonly XmlChild[], at: string): string {
  let str = "";
  for (const node of children) {
    const name = nameOf(node, at);
    if (name === "mi") {
      str = concatText(str, encode(nodesOf(node, at)[0], at), at);
    } else if (name === "mn") {
      if (str === "") str += numericEncoding(node, at)[1];
      break;
    }
  }
  return str;
}

function partialDerivativeIntent(first: XmlElement): string {
  const at = "partial_derivative_intent";
  const children = first.children;
  const last = children[children.length - 1];
  let firstArg: string | number = "";
  let secondArg = "";
  switch (nameOf(last, at)) {
    case "mi":
      firstArg = 1;
      secondArg = encode(nodesOf(last, at)[0], at) ?? "";
      break;
    case "mn":
      // `numeric_encoding(node)` — `node` is not defined in this method.
      throw gemCrash(at, "the mn arm reads an undefined local `node` (NameError)");
    case "mrow": {
      const str = collectLetters(nodesOf(last, at), at);
      [firstArg, secondArg] = arities(str);
      break;
    }
    case "msup": {
      const parts = nodesOf(last, at);
      let str = "";
      const head = nodesOf(parts[0], at);
      const headName = nameOf(parts[0], at);
      if (headName === "mrow") {
        str = collectLetters(head, at);
      } else if (headName === "mi") {
        throw gemCrash(at, "the mi arm reads an undefined local `node` (NameError)");
      }
      [firstArg, secondArg] = arities(str);
      const primeNode = parts[parts.length - 1];
      const prime = validPrime(primeNode, at) ? encode(nodesOf(primeNode, at)[0], at) : undefined;
      if (!/[0-9](?:\n|$)/.test(secondArg)) {
        if (prime === undefined)
          throw gemCrash(at, "insert(-1, nil) — no implicit conversion into String");
        secondArg += prime;
      }
      break;
    }
    default:
      return ":partial-derivative(,$f,)";
  }
  return `:partial-derivative(${firstArg},$f,${secondArg})`;
}

/** `f_arg` (:229-255): moves the argument nodes behind the derivative into one `arg="f"` node. */
function fArg(tagNodes: Rendered, startIndex: number): void {
  const index = startIndex;
  const collected: unknown[] = [];
  while (index <= tagNodes.length) {
    const node = tagNodes[index];
    if (node === undefined || node === null || node === false) break;
    const name = nameOf(node, "f_arg");
    if (name === "mrow") {
      collected.push(...tagNodes.splice(index, 1));
      break;
    }
    if (name === "mi") {
      collected.push(...tagNodes.splice(index, 1));
      continue;
    }
    if (name === "mn") {
      if (collected.length === 0) collected.push(...tagNodes.splice(index, 1));
      break;
    }
    break;
  }
  let replacement: XmlElement;
  if (collected.length === 1) {
    replacement = el(collected[0], "f_arg");
    setDecoded(replacement, "arg", "f", "f_arg");
  } else {
    replacement = new XmlElement("mrow").setAttribute("arg", "f").append(collected as never);
  }
  tagNodes.splice(index, 0, replacement);
}

// --- Derivative on a subscripted / superscripted d (:592-770) ---------------

function validateSubsupDdDerivatives(nodes: Rendered): boolean {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const name = nameOf(node, "validate_subsup_dd_derivatives?");
    if (name !== "msub" && name !== "msup" && name !== "msubsup") continue;
    const next = nodes[index + 1];
    if (next === undefined || next === null) continue;
    if (nameOf(next, "validate_subsup_dd_derivatives?") === "mo") continue;
    const base = nodesOf(node, "validate_subsup_dd_derivatives?")[0];
    if (isDerivativeConst(nodesOf(base, "validate_subsup_dd_derivatives?")[0])) return true;
  }
  return false;
}

function validateUpcaseDdDerivatives(nodes: Rendered): boolean {
  const head = nodes[0];
  if (head === undefined || head === null) return false;
  if (nodesOf(head, "validate_upcase_dd_derivatives?")[0] !== "&#x2145;") return false;
  // `nodes[1].name` with no second node: NoMethodError on nil — the gem's lone
  // `Symbols::UpcaseDd` failure (formula.rb:649).
  return nameOf(nodes[1], "validate_upcase_dd_derivatives? (formula.rb:649)") === "mi";
}

function upcaseDdDerivative(nodes: Rendered): void {
  const at = "upcase_dd_derivative";
  const mrowNodes: unknown[] = [];
  let secondArg = "";
  let thirdArg = "";
  for (;;) {
    const node = nodes[1];
    const name = nameOf(node, at);
    if (name === "mi") {
      mrowNodes.push(...nodes.splice(1, 1));
      continue;
    }
    if (name === "mrow") {
      secondArg = mrowNodes.map((n) => encode(nodesOf(n, at)[0], at) ?? "").join("");
      const inner = nodesOf(node, at);
      // Ruby's `nodes[1..-2]`: nil for an empty list, else all but the first and last.
      if (inner.length === 0) throw gemCrash(at, "nil has no each");
      thirdArg = upcaseDdIntentName(inner.slice(1, Math.max(inner.length - 1, 1)));
      mrowNodes.push(...nodes.splice(1, 1));
    }
    break;
  }
  const intent = `:derivative(1,${secondArg},${thirdArg})`;
  const mrow = new XmlElement("mrow");
  setDecoded(mrow, "intent", intent, at);
  nodes.splice(0, 0, mrow.append(mrowNodes as never));
}

function upcaseDdIntentName(nodes: readonly XmlChild[]): string {
  const at = "upcase_dd_intent_name";
  // `str = node.nodes[0]` (the `mn` arm of a sub/sup) stores an ELEMENT, so `str`
  // is a String, nil, or an element, and every `+=` or the final `encode` on
  // the element raises.
  let str: string | undefined | XmlElement = "";
  const plus = (right: unknown): void => {
    if (str instanceof XmlElement) throw gemCrash(at, "an element has no +");
    if (str === undefined) throw gemCrash(at, "nil has no +");
    str = concatText(str, right, at);
  };
  for (const node of nodes) {
    const name = nameOf(node, at);
    if (name === "mi") {
      plus(nodesOf(node, at)[0]);
    } else if (name === "mn") {
      const text = nodesOf(node, at)[0];
      str = typeof text === "string" ? text : undefined;
    } else if (name === "msub" || name === "msup" || name === "msubsup") {
      const parts = nodesOf(node, at);
      const headName = nameOf(parts[0], at);
      if (headName !== "mi" && headName !== "mn") continue;
      if (headName === "mn") str = parts[0] as XmlElement;
      if (headName === "mi") plus(nodesOf(parts[0], at)[0]);
      const supIndex = name === "msubsup" ? 2 : 1;
      if (validPrime(parts[supIndex], at)) plus(nodesOf(parts[supIndex], at)[0]);
    } else {
      if (name === "mfrac") str = "";
      break;
    }
  }
  if (str instanceof XmlElement) throw gemCrash(at, "an element has no include?");
  return encode(str, at) ?? "";
}

function subsupDdDerivative(nodes: Rendered): void {
  const at = "subsup_dd_derivative";
  const lead = nodesOf(nodes[0], at)[0];
  if (!isDerivativeConst(nodesOf(lead, at)[0])) return;
  let iteration = 0;
  while (iteration < nodes.length) {
    const node = nodes[iteration];
    const parts = nodesOf(node, at);
    if (!(parts[0] instanceof XmlElement)) {
      iteration += 1;
      continue;
    }
    if (isDerivativeConst(parts[0].children[0])) {
      iteration += 1;
      const name = nameOf(node, at);
      const tail = nodes.slice(iteration);
      setDecoded(node, "intent", `:derivative${derivativeIntentName(parts[1], tail, name)}`, at);
      const nextNode = nodes[iteration];
      const nextName = nameOf(nextNode, at);
      if (nextName === "mi" || nextName === "mrow") {
        const after = nameOf(nodes[iteration + 1], at);
        if (after === "mi" || after === "mrow") {
          wrapInMrowCopy(nodes.slice(iteration));
        } else {
          setDecoded(nextNode, "arg", "f", at);
        }
      }
    }
    iteration += 1;
  }
}

function derivativeIntentName(node: unknown, nextNodes: Rendered, type: string): string {
  if (type === "msub") {
    const [first, second] = subIntentContent(node);
    return `(${first ?? ""},$f,${second ?? ""})`;
  }
  if (type === "msup") {
    return `(${supIntentContent(node)},$f,${supSecondContent(nextNodes)})`;
  }
  return "";
}

function subIntentContent(node: unknown): [string | number | undefined, string | undefined] {
  const at = "sub_intent_content";
  const name = nameOf(node, at);
  if (name === "mi") return ["1", encode(nodesOf(node, at)[0], at)];
  if (name === "mn") return numericEncoding(node, at);
  if (attrOf(node, "intent", at) === "fenced") return ["1", undefined];
  if (name !== "mrow") return [undefined, undefined];
  const allMi = nodesOf(node, at).every((child) => nameOf(child, at) === "mi");
  return allMi ? [undefined, undefined] : ["1", undefined];
}

function supIntentContent(node: unknown): string {
  const at = "sup_intent_content";
  const name = nameOf(node, at);
  // `encode(first_node)` — an undefined local: NameError.
  if (name === "mi")
    throw gemCrash(at, "the mi arm reads an undefined local `first_node` (NameError)");
  if (name === "mn") return String(nodesOf(node, at)[0] ?? "");
  return name === "mrow" ? "$n" : "";
}

function supSecondContent(nextNodes: Rendered): string {
  const at = "sup_second_content";
  let fence: unknown;
  for (const node of nextNodes) {
    if (fence !== undefined) break;
    const name = nameOf(node, at);
    if (name === "mi" || name === "mn") continue;
    if (name === "mrow" && attrOf(node, "intent", at) === ":fenced") fence = node;
    break;
  }
  if (fence === undefined) return "";
  const inner = tailFromOne(nodesOf(fence, at)) ?? [];
  // `slice_before { mn }.to_a.last`: the group starting at the last `mn`, or everything.
  let start = 0;
  inner.forEach((child, index) => {
    if (nameOf(child, at) === "mn") start = index;
  });
  const group = inner.slice(start);
  if (group.length === 0) throw gemCrash(at, "nil has no each");
  let str = "";
  for (const node of group) {
    const name = nameOf(node, at);
    if (!["msub", "msup", "msubsup", "mi", "mn"].includes(name)) break;
    if (name === "msub" || name === "msup" || name === "msubsup") {
      const parts = nodesOf(node, at);
      str = concatText(str, encode(firstText(parts[0], at), at), at);
      const tail = parts[parts.length - 1];
      if (validPrime(tail, at)) str = concatText(str, encode(firstText(tail, at), at), at);
    } else {
      str = concatText(str, nodesOf(node, at)[0], at);
    }
  }
  return str;
}

/**
 * `wrap_in_mrow` (formula.rb:783-793), called on `nodes[iteration..]` — a COPY.
 * It shifts nodes off the copy and builds an `<mrow arg="f">` that nobody keeps,
 * so what survives is its failure modes: an exhausted list (`nil.name`), and a
 * list whose next node is neither `mi` nor `mrow` right after an `mi`, where the
 * gem's `loop` re-appends the same node for ever. The gem never returns from
 * that case (memory grows until the process is killed); this port refuses it.
 */
function wrapInMrowCopy(copy: Rendered): void {
  const at = "wrap_in_mrow";
  let node: unknown;
  for (;;) {
    const headName = nameOf(copy[0], at);
    if (headName === "mi" || headName === "mrow") {
      node = copy.shift();
    } else if (nameOf(node, at) === "mi") {
      throw new RenderError(
        "intent: wrap_in_mrow never terminates on this input (an mi followed by a node that is " +
          "neither mi nor mrow) — the gem loops for ever, so this port refuses it",
        FORMAT,
        "formula",
      );
    }
    const name = nameOf(node, at);
    if (name === "mi") continue;
    if (name === "mrow") break;
  }
}
