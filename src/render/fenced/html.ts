import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import { RUBY_ABSTRACT_CLASSES } from "../../core/nodes";
import {
  classBasename,
  describeSlot,
  FORMAT,
  missingSymbolDataError,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/html/render-shared";
import { HTML_FENCED_PAREN_PAYLOADS } from "../../generated/html/symbols";

/** `Fenced#to_html`: italic parens around a no-separator body join. */
export function renderFenced(node: NodeOf<"fenced">, context: RenderContext): string {
  const first = present(node.parameterOne)
    ? `<i>${s(renderHtmlParen(node.parameterOne, "fenced.parameterOne"))}</i>`
    : "";
  const third = present(node.parameterThree)
    ? `<i>${s(renderHtmlParen(node.parameterThree, "fenced.parameterThree"))}</i>`
    : "";

  const body = node.parameterTwo;
  let second = "";
  if (present(body)) {
    if (!Array.isArray(body)) {
      throw new RenderError(
        `fenced.parameterTwo: is ${describeSlot(body)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    second = body
      .map((item, index) => s(renderChild(item, context, `fenced.parameterTwo[${index}]`)))
      .join("");
  }
  return `${first}${second}${third}`;
}

/**
 * `Paren::` — the id prefix of every `Math::Symbols::Paren` subclass.
 *
 * `symbol_or_paren` guards its paren arm with
 * `field.is_a?(Math::Symbols::Paren)` (`function/fenced.rb:325`). Symbol ids
 * are Ruby class keys and each subclass is nested inside that carrier, so the
 * guard reads here as a prefix test. Derived from core's abstract-class
 * census, the same list `../symbol/html.ts` reads for the ids the symbol
 * table omits, so a renamed carrier moves both together.
 */
const PAREN_ID_PREFIXES: readonly string[] = RUBY_ABSTRACT_CLASSES.filter((rubyClass) =>
  rubyClass.startsWith("Math::Symbols::"),
).map((rubyClass) => `${classBasename(rubyClass)}::`);

/**
 * `symbol_or_paren(field, lang: :html)` (`function/fenced.rb:324-336`):
 * ordinary Symbol/Number nodes expose their raw value — `field&.value`, the
 * unless-branch — so anything that is not a `Math::Symbols::Paren` never
 * reaches a render method at all.
 *
 * A `Paren` subclass takes the other branch, and `:html` shares it with
 * `:mathml`: `field.to_mathml_without_math_tag(intent, options:).nodes.first`,
 * with `intent` left at the method's own `false` default because `to_html`
 * (`fenced.rb:54-69`) passes none. That payload is NOT `Paren#to_html`, and
 * the difference is not cosmetic. Measured on the pinned oracle (00c52783),
 * over all 24 `Paren` subclasses, exit 0: the two disagree on 13 of them,
 * because each class hand-writes its mathml as either
 * `ox_element(tag) << encoded` (the entity DECODED) or `<< paren_value` (the
 * entity RAW), with no rule relating the two — `Paren::Lbbrack#to_html` is
 * `"&#x27e6;"` where its mathml text is `"⟦"`, while `Paren::CloseParen`
 * answers `"&#x3017;"` to both. End to end, the gem renders
 * `Fenced(Lbbrack, [x], Rbbrack).to_html` as `<i>⟦</i>x<i>⟧</i>`.
 *
 * So this slot is not served from `HTML_SYMBOLS`: that table carries
 * `Paren#to_html`, the wrong payload for 13 ids, and substituting it would be
 * a silent divergence on exactly the kind of input the port refuses to guess
 * at. `src/generated/mathml/symbols.ts` holds the right string but is out of
 * reach — `scripts/gate-package.mjs` forbids `generated/mathml/` in `./html`'s
 * bundle, rightly, since 1,459 mathml descriptors have no business in an HTML
 * consumer's download. The generator therefore emits an HTML-owned column,
 * `HTML_FENCED_PAREN_PAYLOADS`, measured over every `Paren` subclass and
 * verified through one live `Fenced#to_html` render per id.
 *
 * The abstract `Paren` carrier is deliberately absent from that column and
 * falls through to the value path below. Measured on the same oracle, exit 0:
 * it inherits `Symbol`'s methods, so `Paren.new("zz")` puts `"zz"` in the slot
 * and `Paren.new` puts Ruby-nil there — its mathml payload, its `to_html` and
 * its stored value are always the same one. An id under `Paren::` that the
 * column does not carry is a new upstream subclass, and throws rather than
 * borrowing that fallback.
 */
function renderHtmlParen(value: unknown, at: string): string | null {
  if (!hasNodeKind(value)) {
    throw new RenderError(
      `${at}: cannot read a value from ${describeSlot(value)} — the gem raises NoMethodError here`,
      FORMAT,
      "fenced",
    );
  }
  const node = value as MathNode;

  switch (node.kind) {
    case "symbol": {
      const payload = HTML_FENCED_PAREN_PAYLOADS.get(node.id);
      if (payload !== undefined) return payload;
      // The factory records the error as this walk's own throw, so the
      // boundary can tell it from an input's imitation
      // (`../../formats/html/render-shared.ts`).
      if (PAREN_ID_PREFIXES.some((prefix) => node.id.startsWith(prefix))) {
        throw missingSymbolDataError(node.id);
      }
      return renderScalarParenValue(node.value, node.kind, at);
    }
    case "number":
      return renderScalarParenValue(node.value, node.kind, at);
    case "formula":
    case "mrow":
    case "table":
      return renderCompositeParenValue(node.value, node.kind, at);
    default:
      throw new RenderError(
        `${at}: a "${node.kind}" node has no value reader — the gem raises NoMethodError here`,
        FORMAT,
        "fenced",
      );
  }
}

/** Constructor-normalized Symbol/Number values are strings or nil, never containers. */
function renderScalarParenValue(
  value: unknown,
  kind: "symbol" | "number",
  at: string,
): string | null {
  if (value === null || value === undefined || typeof value === "string") return value ?? null;
  throw new RenderError(
    `${at}: a "${kind}" node holds ${describeSlot(value)} that bypasses constructor normalization`,
    FORMAT,
    "fenced",
  );
}

/**
 * Ruby interpolates a composite's raw list value. Empty and nil-only lists have
 * stable `#inspect` bytes; any actual node contributes its object address.
 */
function renderCompositeParenValue(
  value: unknown,
  kind: "formula" | "mrow" | "table",
  at: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.every((item) => item === null)) {
    return `[${value.map(() => "nil").join(", ")}]`;
  }
  throw new RenderError(
    `${at}: holds a "${kind}" node whose value contains node objects with nondeterministic Ruby #inspect addresses`,
    FORMAT,
    "fenced",
  );
}
