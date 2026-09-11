import {
  hasNodeKind,
  type MathNode,
  MissingSymbolDataError,
  type NodeKind,
  type NodeParameter,
  RenderError,
} from "../../core/index";
import { htmlEntityToUnicode, RUBY_ABSTRACT_CLASSES } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import {
  OMML_DEFAULT_SYMBOL_TAG_NAME,
  OMML_SYMBOL_TAG_NAMES,
  OMML_SYMBOLS,
} from "../../generated/omml/symbols";
import { dumpNodes, XmlElement } from "../../xml/index";

export const FORMAT = "omml";

export type OmmlRendered = XmlElement | string | null | readonly OmmlRendered[];

export interface RenderContext {
  readonly displaystyle: boolean;
  readonly insert: (node: MathNode) => OmmlRendered;
  readonly render: (node: MathNode) => OmmlRendered;
  readonly withDisplaystyle: (displaystyle: boolean) => RenderContext;
}

export type NodeOf<K extends NodeKind> = Extract<MathNode, { readonly kind: K }>;

export type RenderFn<K extends NodeKind> = (
  node: NodeOf<K>,
  context: RenderContext,
) => OmmlRendered;

/**
 * Ruby truthiness for the gem's bare `unless field` slot guards: only `nil`
 * and `false` are falsy, so `0` and `""` stay truthy. `undefined` spells the
 * same `nil` as `null` does on this side of the port.
 *
 * `Core#omml_parameter` guards with `return empty_tag(tag) unless field`, so
 * a `false` slot takes the placeholder path exactly as `nil` does — measured
 * on the oracle at `00c52783`, `Frac.new(false, Symbol.new("x"), {})` renders
 * `<m:num><m:r><m:t>&#8203;</m:t></m:r></m:num>` rather than raising.
 */
export function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

export function describeSlot(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/**
 * A slot value Ruby would hold as a Hash: a plain record, neither a list nor
 * a node. The prototype test is `validate.ts`'s — a `Date`, `Map` or other
 * class instance is not a hash, and no Ruby ivar can hold one.
 */
export function isOptionHash(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (hasNodeKind(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * `attributes && attributes[:accent]` — the guard SIX accent renderers open
 * their `to_omml_without_math_tag` with, each at its own line: `bar.rb:43`,
 * `dot.rb:38`, `hat.rb:51`, `tilde.rb:27`, `vec.rb:34` and
 * `overleftrightarrow.rb:34`.
 *
 * `ul` is the seventh accent renderer and is NOT one of them: `ul.rb:43` reads
 * `attributes[:accentunder]`, a different key. `src/render/ul/omml.ts:14`
 * reads `accentunder`, and fourteen oracle-generated `ul` rows in
 * `test/formats/omml/degenerate-fixtures.json` hold it to the gem's answers,
 * so the code is right; this note exists because the sentence here used to
 * lump `ul` in with the other six, which would have sent the next reader to
 * the wrong attribute. `ddot` reads attributes in neither renderer.
 *
 * `dot`, `vec` and `overleftrightarrow` carry a SECOND guard of the same shape
 * in `to_mathml_without_math_tag` (`dot.rb:22`, `vec.rb:18`,
 * `overleftrightarrow.rb:18`). Those are the MathML side and are not what this
 * module reads — a search that takes the first match in each file lands on
 * them, which is how the line numbers above were wrong before.
 *
 * Both halves were measured on the oracle at `00c52783`:
 *
 *   - the `&&` is Ruby-falsy, so `nil` and `false` mean "no attributes" and
 *     take the no-accent branch. `Bar.new(x, nil)` and `Bar.new(x, false)`
 *     render the same `m:bar` as `Bar.new(x, {})` — reading `.accent` off a
 *     missing JavaScript object would instead die as a `TypeError`;
 *   - anything else truthy is INDEXED, and a non-hash raises there rather
 *     than falling through to the no-accent branch. `Bar.new(x, 0)`,
 *     `Bar.new(x, "")`, `Bar.new(x, [])` and `Bar.new(x, :sym)` raise
 *     `TypeError: no implicit conversion of Symbol into Integer`;
 *     `Bar.new(x, true)` and `Bar.new(x, 1.5)` raise `NoMethodError:
 *     undefined method '[]'`. JavaScript reads `undefined` off all six and
 *     would silently emit an element the gem never reaches.
 *
 * The Ruby exception class differs by carrier, so the refusal names the read
 * that fails rather than one class.
 */
export function rubyMemberValue(
  carrier: unknown,
  member: string,
  kind: string,
  at: string,
): unknown {
  if (carrier === null || carrier === undefined || carrier === false) return undefined;
  if (isOptionHash(carrier)) return carrier[member];
  throw new RenderError(
    `${at}: cannot read :${member} from ${describeSlot(carrier)} — the gem indexes it there and raises`,
    FORMAT,
    kind,
  );
}

export function renderChild(value: unknown, context: RenderContext, at: string): OmmlRendered {
  if (hasNodeKind(value)) return context.render(value as MathNode);
  throw new RenderError(
    `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

export function insertChild(value: unknown, context: RenderContext, at: string): OmmlRendered {
  if (hasNodeKind(value)) return context.insert(value as MathNode);
  throw new RenderError(
    `${at}: cannot insert ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

export function requireNodeList(
  value: unknown,
  kind: string,
  at: string,
): readonly NodeParameter[] {
  if (Array.isArray(value)) return value;
  throw new RenderError(
    `${at}: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
    FORMAT,
    kind,
  );
}

export function requireString(value: unknown, kind: string, at: string): string {
  if (typeof value === "string") return value;
  throw new RenderError(
    `${at}: holds ${describeSlot(value)}, not a measured string value`,
    FORMAT,
    kind,
  );
}

export function requireEmptyOptions(value: unknown, kind: string, at: string): void {
  if (value === null || value === undefined) return;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  ) {
    return;
  }
  throw new RenderError(
    `${at}: only the measured empty options hash is implemented in this slice`,
    FORMAT,
    kind,
  );
}

/** The Ruby class basename — `Math::Symbols::Sigma` is `Sigma`. */
export function classBasename(rubyClass: string): string {
  return rubyClass.slice(rubyClass.lastIndexOf(":") + 1);
}

/**
 * Symbol ids rendered from their stored `value` rather than a class literal:
 * the `Symbol` base class itself, and the abstract `Paren` root — the two ids
 * the generated table deliberately omits. Both are derived from core's own
 * data (the symbol spec's carrier class and the abstract-class census), not
 * restated, exactly as the latex and html twins derive theirs.
 */
const VALUE_RENDERED_SYMBOL_IDS: ReadonlySet<string> = new Set(
  [NODE_SPECS.symbol.rubyClass, ...RUBY_ABSTRACT_CLASSES]
    .filter((rubyClass) => rubyClass.startsWith("Math::Symbols::"))
    .map(classBasename),
);

/**
 * The walk's own missing-symbol throw, distinguishable from an imitation.
 *
 * The renderer boundary re-throws the symbol table's `MissingSymbolDataError`
 * (a public error code in its own right) while wrapping every other mid-walk
 * throw into `RenderError` — but `instanceof` is a test the INPUT can pass
 * too: a hostile getter that answered validation's read can throw its own
 * `MissingSymbolDataError` mid-render and forge the pass-through, reporting
 * MISSING_SYMBOL_DATA for what is an input failure. So the genuine throw site
 * records its instances in this module-private `WeakSet`, and the boundary
 * passes through members only. One set per format, because each format's
 * boundary vouches only for its own throw sites — the rationale in full is in
 * `../latex/render-shared.ts`, whose set this mirrors.
 */
const OWN_MISSING_SYMBOL_ERRORS = new WeakSet<MissingSymbolDataError>();

/** The symbol table's one deliberate non-RenderError throw, recorded as our own. */
export function missingSymbolDataError(symbolId: string): MissingSymbolDataError {
  const error = new MissingSymbolDataError(symbolId, FORMAT);
  OWN_MISSING_SYMBOL_ERRORS.add(error);
  return error;
}

/** Membership in the factory's set — shape and prototype prove nothing here. */
export function isOwnMissingSymbolDataError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    OWN_MISSING_SYMBOL_ERRORS.has(error as MissingSymbolDataError)
  );
}

/**
 * `Symbols::Symbol#to_omml_without_math_tag` (`symbols/symbol.rb:67-72`): the
 * stored value for the base class and the abstract `Paren` carrier, and the
 * generated per-id literal for the 1,459 subclasses the census folds into this
 * kind (ARCHITECTURE.md §5, "Symbols").
 *
 * Measured on the pinned oracle `00c52783` over all 1,459 static symbol
 * classes, one live `to_omml_without_math_tag` call each (exit 0):
 *
 *   - none of them answers `nil`, so every id in the table carries a string
 *     and the base class's `nil` answer is reachable only through the two
 *     value-rendered ids above;
 *   - none of them answers the invisible-times entity `&#x2062;`, so the
 *     gem's one hard-coded `return if value == "&#x2062;"` guard
 *     (`symbols/symbol.rb:69`) can only ever fire on a stored value — which
 *     is why the guard lives in `../../render/symbol/omml.ts`, on the value
 *     side, and not here;
 *   - a constructor value override moves NONE of them: `Plus.new("ZZ")`,
 *     `Sum.new("ZZ")` and the other 1,457 each answer their static string, so
 *     this method never consults `node.value` for a named id;
 *   - the `display_style` argument moves none of them either, which is what
 *     the generated OMML exception matrix records by being empty
 *     (`src/generated/omml/exceptions.ts`) — so there is no context
 *     consultation here.
 */
export function symbolOmmlValue(node: NodeOf<"symbol">, errorKind: string, at?: string): string {
  // A plain object without an id is the base class, exactly as the
  // constructor's default makes it.
  const id = node.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
  if (VALUE_RENDERED_SYMBOL_IDS.has(id)) {
    return requireString(node.value, errorKind, at === undefined ? "symbol.value" : `${at}.value`);
  }
  const literal = OMML_SYMBOLS.get(id);
  // The factory records the error as this walk's own throw (a module-private
  // WeakSet), so the boundary can tell it from an input's imitation.
  if (literal === undefined) throw missingSymbolDataError(id);
  return literal;
}

/**
 * `Symbol#t_tag` (`symbols/symbol.rb:160-165`):
 * `value || to_omml_without_math_tag(nil, options:)` — an explicit value wins
 * over the subclass literal, which is the one place a named symbol's stored
 * value is read. `font_style_t_tag` is this method verbatim
 * (`symbols/symbol.rb:97-99`), and no symbol subclass overrides either.
 */
export function symbolValueOrGenerated(
  node: NodeOf<"symbol">,
  errorKind: string,
  at?: string,
): string {
  if (node.value !== null && node.value !== undefined) {
    return requireString(node.value, errorKind, at === undefined ? "symbol.value" : `${at}.value`);
  }
  return symbolOmmlValue(node, errorKind, at);
}

/**
 * `Symbol#nary_attr_value` (`symbols/symbol.rb:101-105`):
 *
 * ```ruby
 * value || Utility.html_entity_to_unicode(to_omml_without_math_tag(true, options: options))
 * ```
 *
 * The two arms are NOT the same string: only the fallback is decoded here, so
 * a named symbol's literal reaches `Nary#chr_value` already decoded once while
 * an explicit value reaches it as written. `chr_value` then decodes what it
 * gets a second time and the XML writer a third, so the fallback is decoded
 * three times overall and an explicit value twice
 * (`../../render/nary/omml.ts` carries that half).
 *
 * Every entry in the generated table is singly encoded — no literal spells an
 * ampersand as `&amp;` — so this decode currently lands on the same character
 * the second one would have produced anyway. Modelling it is what keeps that
 * an observation about the data rather than an assumption baked into the walk.
 */
export function naryAttrValue(node: NodeOf<"symbol">, errorKind: string, at: string): string {
  if (node.value !== null && node.value !== undefined) {
    return requireString(node.value, errorKind, `${at}.value`);
  }
  return decodeEntities(symbolOmmlValue(node, errorKind, at), errorKind, at);
}

/**
 * `Symbol#omml_tag_name` (`symbols/symbol.rb:93-95`) and the eight subclasses
 * that override it. `PowerBase#to_omml_without_math_tag` branches on this
 * value (`power_base.rb:39-43`); the generated table names the overrides and
 * the default, both measured over every symbol class.
 */
export function symbolOmmlTagName(node: NodeOf<"symbol">): string {
  const id = node.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
  return OMML_SYMBOL_TAG_NAMES.get(id) ?? OMML_DEFAULT_SYMBOL_TAG_NAME;
}

export function textElement(value: string): XmlElement {
  return new XmlElement("m:t").append(value);
}

export function plainRun(value: string): XmlElement {
  return new XmlElement("m:r").append(textElement(value));
}

export function styledRun(value: string): XmlElement {
  return new XmlElement("m:r").append(
    new XmlElement("m:rPr").append(new XmlElement("m:sty").setAttribute("m:val", "p")),
    textElement(value),
  );
}

export function wordRunProperties(italic: boolean): XmlElement {
  const fonts = new XmlElement("w:rFonts").setAttributes(
    new Map([
      ["w:ascii", "Cambria Math"],
      ["w:hAnsi", "Cambria Math"],
    ]),
  );
  return new XmlElement("w:rPr").append(fonts, italic ? new XmlElement("w:i") : null);
}

export function controlProperties(): XmlElement {
  return new XmlElement("m:ctrlPr").append(wordRunProperties(true));
}

export function structuralProperties(name: string): XmlElement {
  return new XmlElement(`m:${name}Pr`).append(controlProperties());
}

export function ommlSlot(
  value: unknown,
  tagName: string,
  context: RenderContext,
  kind: string,
  at: string,
): XmlElement {
  const tag = new XmlElement(`m:${tagName}`);
  // `Core#omml_parameter` reads `return empty_tag(tag) unless field` — Ruby-falsy,
  // so a `false` slot takes the placeholder path exactly as `nil` does.
  if (!present(value)) return tag.append(plainRun("&#8203;"));
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      tag.append(insertSlotItem(item, context, kind, `${at}[${index}]`));
    });
    return tag;
  }
  return tag.append(insertSlotItem(value, context, kind, at));
}

function insertSlotItem(
  value: unknown,
  context: RenderContext,
  kind: string,
  at: string,
): OmmlRendered {
  if (hasNodeKind(value)) return insertChild(value, context, at);
  throw new RenderError(
    `${at}: cannot insert ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    kind,
  );
}

type FixedNaryNode = NodeOf<"int"> | NodeOf<"oint"> | NodeOf<"prod"> | NodeOf<"sum">;
type LimitKind = "obrace" | "overset" | "ubrace" | "underset";

export function renderFixedNary(
  node: FixedNaryNode,
  context: RenderContext,
  operator: string,
  limitLocation: "subSup" | "undOvr",
  emptyEntity: string,
): XmlElement {
  if (!present(node.parameterOne) && !present(node.parameterTwo) && !present(node.parameterThree)) {
    return plainRun(emptyEntity);
  }

  const properties = new XmlElement("m:naryPr").append(
    // `hide_function_name ? "" : "∑"` in the gem: Ruby-falsy, so `0` and `""`
    // suppress the operator there and must suppress it here too.
    new XmlElement("m:chr").setAttribute("m:val", present(node.hideFunctionName) ? "" : operator),
    new XmlElement("m:limLoc").setAttribute("m:val", limitLocation),
    new XmlElement("m:subHide").setAttribute("m:val", present(node.parameterOne) ? "0" : "1"),
    new XmlElement("m:supHide").setAttribute("m:val", present(node.parameterTwo) ? "0" : "1"),
  );

  return new XmlElement("m:nary").append(
    properties,
    ommlSlot(node.parameterOne, "sub", context, node.kind, `${node.kind}.parameterOne`),
    ommlSlot(node.parameterTwo, "sup", context, node.kind, `${node.kind}.parameterTwo`),
    ommlSlot(node.parameterThree, "e", context, node.kind, `${node.kind}.parameterThree`),
  );
}

export function renderLimit(
  kind: LimitKind,
  position: "Low" | "Upp",
  base: unknown,
  limit: unknown,
  context: RenderContext,
): XmlElement {
  const name = `lim${position}`;
  return new XmlElement(`m:${name}`).append(
    new XmlElement(`m:${name}Pr`).append(controlProperties()),
    ommlSlot(base, "e", context, kind, `${kind}.parameterOne`),
    ommlSlot(limit, "lim", context, kind, `${kind}.parameterTwo`),
  );
}

export function renderOverUnder(
  kind: "overset" | "underset",
  position: "Low" | "Upp",
  base: unknown,
  limit: unknown,
  context: RenderContext,
): XmlElement {
  if (context.displaystyle) return renderLimit(kind, position, base, limit, context);

  const name = position === "Upp" ? "sSup" : "sSub";
  const scriptSlot = position === "Upp" ? "sup" : "sub";
  return new XmlElement(`m:${name}`).append(
    structuralProperties(name),
    ommlSlot(base, "e", context, kind, `${kind}.parameterOne`),
    ommlSlot(limit, scriptSlot, context, kind, `${kind}.parameterTwo`),
  );
}

/**
 * `Formula.new(Array(value))` followed by Formula insertion.
 *
 * `Kernel#Array` is not `[value]`. It returns `[]` for `nil`, an Array
 * unchanged, and for anything answering `to_ary`/`to_a` that conversion —
 * which for a Hash is its pairs. `NodeParameter` admits an options hash on
 * purpose (`src/core/nodes.ts`: `Mglyph#initialize(parameter_one = {})`), so
 * that branch is reachable, and it changes the output rather than the error:
 * measured on the oracle at `00c52783`, `Fenced.new(x, {}, x, {})` and
 * `Ceil.new({})` both render `<m:e/>` because `Array({})` is EMPTY, while
 * `Fenced.new(x, {"a" => "b"}, x, {})` raises `NoMethodError: undefined
 * method 'insert_t_tag' for an instance of Array` because
 * `Array({"a" => "b"})` is `[["a", "b"]]`, one pair. Nodes answer neither
 * conversion — `Array(Symbol.new("x"))`, `Array(Formula.new([x]))` and
 * `Array(Table.new([x]))` are all one-element — so they still wrap.
 */
export function ommlFormulaSlot(
  value: unknown,
  tagName: string,
  context: RenderContext,
  kind: string,
  at: string,
): XmlElement {
  const tag = new XmlElement(`m:${tagName}`);
  rubyArray(value).forEach((item, index) => {
    tag.append(insertSlotItem(item, context, kind, `${at}[${index}]`));
  });
  return tag;
}

/** `Kernel#Array`, over the shapes a `NodeParameter` slot can hold. */
function rubyArray(value: unknown): readonly unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (isOptionHash(value)) return Object.entries(value);
  return [value];
}

/** `UnaryFunction#omml_value`: compact a list, or wrap one scalar. */
export function renderUnaryValue(
  value: unknown,
  context: RenderContext,
  kind: string,
  at: string,
): OmmlRendered[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return [insertSlotItem(value, context, kind, at)];
  return value.flatMap((item, index) =>
    item === null || item === undefined
      ? []
      : [insertSlotItem(item, context, kind, `${at}[${index}]`)],
  );
}

export function renderAccent(
  kind: string,
  value: unknown,
  character: string,
  context: RenderContext,
  at: string,
): XmlElement {
  return new XmlElement("m:acc").append(
    new XmlElement("m:accPr").append(new XmlElement("m:chr").setAttribute("m:val", character)),
    ommlSlot(value, "e", context, kind, at),
  );
}

export function renderLiteralScript(
  kind: string,
  position: "Low" | "Upp",
  base: unknown,
  literal: string,
  context: RenderContext,
  followDisplaystyle: boolean,
): XmlElement {
  if (!followDisplaystyle || context.displaystyle) {
    const name = `lim${position}`;
    const baseContext = followDisplaystyle ? context : context.withDisplaystyle(true);
    return new XmlElement(`m:${name}`).append(
      structuralProperties(name),
      ommlSlot(base, "e", baseContext, kind, `${kind}.parameterOne`),
      new XmlElement("m:lim").append(plainRun(literal)),
    );
  }

  const name = position === "Upp" ? "sSup" : "sSub";
  const scriptSlot = position === "Upp" ? "sup" : "sub";
  return new XmlElement(`m:${name}`).append(
    structuralProperties(name),
    ommlSlot(base, "e", context, kind, `${kind}.parameterOne`),
    new XmlElement(`m:${scriptSlot}`).append(plainRun(literal)),
  );
}
export function requireElement(
  rendered: OmmlRendered,
  kind: string,
  at: string,
  name?: string,
): XmlElement {
  if (rendered instanceof XmlElement && (name === undefined || rendered.name === name)) {
    return rendered;
  }
  throw new RenderError(
    `${at}: did not render the measured ${name ?? "element"} shape`,
    FORMAT,
    kind,
  );
}

/** `Core#dump_ox_nodes`: flatten arrays and dump each element independently. */
export function serializeRendered(rendered: OmmlRendered): string {
  const parts: string[] = [];
  const visit = (value: OmmlRendered): void => {
    if (value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (typeof value === "string") {
      parts.push(value);
    } else {
      parts.push(dumpNodes(value as XmlElement));
    }
  };
  visit(rendered);
  return parts.join("");
}

/**
 * `Utility.html_entity_to_unicode`, with the one failure the gem shows on
 * this path given a message of its own. An entity naming a surrogate or a
 * code point past U+10FFFF makes the gem raise `RangeError: invalid
 * codepoint 0xD800 in UTF-8` / `RangeError: 1114112 out of char range` —
 * measured both with the entity written once (`&#xD800;`) and written twice
 * (`&amp;#xD800;`), because the second decode reaches what the first left.
 * Without this, that RangeError travels to the renderer boundary, which
 * reports every RangeError as a stack-depth refusal.
 *
 * `kind` is the kind being RENDERED, not the carrier's: `fenced` decodes its
 * delimiters and `nary` its operator through this same helper, and a failure
 * has to name the one it came from.
 */
export function decodeEntities(value: string, kind: string, at: string): string {
  try {
    return htmlEntityToUnicode(value);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new RenderError(
        `${at}: the entities here name a code point UTF-8 cannot hold — ` +
          `the gem raises RangeError here (${error.message})`,
        FORMAT,
        kind,
      );
    }
    throw error;
  }
}
