import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/html/render-shared";

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
 * `symbol_or_paren(field, lang: :html)` (`function/fenced.rb:324-334`):
 * ordinary Symbol/Number nodes expose their raw value — `field&.value`, the
 * unless-branch — so anything that is not a `Math::Symbols::Paren` never
 * reaches a render method at all.
 *
 * A `Paren` subclass takes the other branch, and `:html` shares it with
 * `:mathml`: `field.to_mathml_without_math_tag(intent, options:).nodes.first`.
 * That payload is NOT `Paren#to_html`, and the difference is not cosmetic.
 * Measured on the pinned oracle (00c52783), over all 24 `Paren` subclasses,
 * exit 0: the two disagree on 13 of them, because each class hand-writes its
 * mathml as either `ox_element(tag) << encoded` (the entity DECODED) or
 * `<< paren_value` (the entity RAW), with no rule relating the two —
 * `Paren::Lbbrack#to_html` is `"&#x27e6;"` where its mathml text is `"⟦"`,
 * while `Paren::CloseParen` answers `"&#x3017;"` to both. End to end, the gem
 * renders `Fenced(Lbbrack, [x], Rbbrack).to_html` as `<i>⟦</i>x<i>⟧</i>`.
 *
 * So this slot cannot be served from `src/generated/html/symbols.ts`: that
 * table carries `Paren#to_html`, which is the wrong payload for 13 ids, and
 * substituting it would be a silent divergence on exactly the kind of input
 * the port refuses to guess at. The right payload lives in
 * `src/generated/mathml/symbols.ts`, which the HTML subpath may not import —
 * `scripts/gate-package.mjs` forbids `generated/mathml/` in `./html`'s
 * bundle, and rightly, since a table of 1,459 mathml descriptors has no
 * business in an HTML consumer's download.
 *
 * The named-paren slot therefore stays refused until the generator emits an
 * HTML-owned column for it. This is a scope correction:
 * `TODO.plan/p2-output-formats/04-symbol-data.md` records the named-fence
 * cases as unblocked by "the same map's `Paren::*` rows", and the measurement
 * above shows those rows are the wrong data.
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
    case "symbol":
      if (node.id.startsWith("Paren::")) {
        throw new RenderError(
          `${at}: named paren "${node.id}" needs generated HTML symbol data for the ` +
            "fenced paren slot, which is the gem's MathML payload " +
            "(Paren#to_mathml_without_math_tag(...).nodes.first, fenced.rb:324-334) " +
            "and not Paren#to_html — measured, they differ on 13 of the 24 Paren " +
            "classes, and the mathml table this slice would need is forbidden in " +
            "the ./html bundle",
          FORMAT,
          "fenced",
        );
      }
      return renderScalarParenValue(node.value, node.kind, at);
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
