/**
 * Mirrors `function/font_style.rb` — `FontStyle#to_unicodemath` (:57) — and the
 * **one** subclass that overrides it, `Monospace` (`monospace.rb:37`). The
 * other thirteen inherit the carrier's body and differ only in the font prefix
 * `font_family(unicode: true)` resolves for them.
 *
 * ## How the gem picks the font
 *
 * `font_family` (:216) asks `font_classes` (:276) for the `Utility::FONT_STYLES`
 * keys whose value is **this object's Ruby class** — so for a named subclass
 * the node's own `parameter_two` is ignored entirely. Only when that comes back
 * empty (the bare `FontStyle` carrier, which no `FONT_STYLES` entry names) does
 * it fall back to `parameter_to_class` (:282), `FONT_STYLES[parameter_two.to_sym]`
 * instantiated, and resolve from the family string instead. `supported_fonts`
 * (:222) then takes the first `FONTS_CLASSES` entry among those keys and
 * prefixes a backslash; when nothing matches it falls through to nil, which the
 * gem interpolates as empty — an unrecognised family renders its child with no
 * prefix at all rather than failing.
 *
 * There is no Ruby class object to compare here, so the port carries the two
 * hops as tables: `UNICODEMATH_CLASS_OF_FAMILY` (the `FONT_STYLES` half) and
 * `UNICODEMATH_FONT_OF_CLASS` (the `FONTS_CLASSES` half). Both are GENERATED
 * from the gem's own constants (`scripts/generate-corpus.rb`,
 * `unicodemath_font_tables`); an earlier version of this file hand-listed all
 * 64 entries, which is precisely the drift the generator exists to prevent.
 *
 * The second hop is an ordered `find` in the gem, not a lookup, so it is only
 * a table if the class -> font relation is a function. The generator refuses
 * to emit unless it is one: every subclass must meet `FONTS_CLASSES` in
 * exactly one alias, and every font must be claimed by some subclass.
 * Measured at the pinned oracle that is 14 onto 14 with nothing left over — a
 * relation that stopped being a bijection would have made a table silently
 * pick a winner.
 *
 * A one-hop table would have been wrong: `UNICODEMATH_FONT_OF_CLASS` is keyed by class, and
 * the class is what decides whether the `Monospace` override fires. The bare
 * carrier holding the family `"monospace"` is a `FontStyle`, not a `Monospace`,
 * and measures `"\\mttx"` — not `"ￗ(x)"`.
 *
 * ## Measured
 *
 * Pinned oracle (plurimath 0.11.6, 00c52783), 2026-08-18. Subclasses, built as
 * `FontStyle::<Name>.new(Symbols::Symbol.new("x"))`, then again with a
 * deliberately conflicting `parameter_two` of `"mathfrak"` — identical output
 * both times, which is what proves `parameter_two` is ignored for a subclass:
 *
 *     Bold                 => "\\mbfx"        BoldFraktur   => "\\mbffrakx"
 *     BoldItalic           => "\\mbfitx"      BoldSansSerif => "\\mbfsansx"
 *     BoldScript           => "\\mbfscrx"     DoubleStruck  => "\\Bbbx"
 *     Fraktur              => "\\mfrakx"      Italic        => "\\mitx"
 *     Monospace            => "ￗ(x)"          Normal        => "\\mupx"
 *     SansSerif            => "\\msansx"      Script        => "\\mscrx"
 *     SansSerifBoldItalic  => "\\mbfitsansx"  SansSerifItalic => "\\mitsansx"
 *
 * The bare carrier over every `FONT_STYLES` key resolves through its family —
 * `"bold"`, `"mathbf"`, `"textbf"`, `"mbf"`, `"bb"` and `"bf"` all give
 * `"\\mbfx"`; `"monospace"`, `"mathtt"`, `"mtt"` and `"tt"` all give
 * `"\\mttx"`. And its edges:
 *
 *     FontStyle.new(x, "nosuchfont")  => "x"      (nil font, interpolated away)
 *     FontStyle.new(x, "")            => "x"
 *     FontStyle.new(x, nil)           => NoMethodError: undefined method 'to_sym' for nil
 *     FontStyle.new(x, 5 | [] | {} | node) => the same NoMethodError
 *     FontStyle.new(nil, "bold")      => "\\mbf"   (`&.` swallows the nil child)
 *     Bold.new(nil)                   => "\\mbf"
 *     Monospace.new(nil)              => NoMethodError: undefined method 'to_unicodemath' for nil
 *     Monospace.new("str")            => the same NoMethodError
 *     Monospace.new(Fenced(x))        => "ￗ(x)"   (a fence is its own wrapping)
 *
 * The class↔font relation was measured to be a **bijection** onto
 * `FONTS_CLASSES`: each of the 14 classes' key sets meets it in exactly one
 * element, every one of its 14 entries is claimed, and no class is left over.
 * That is what makes a class→font map the same function as the gem's ordered
 * `find`, rather than an approximation of it.
 */

import { RenderError } from "../../core/index";
import {
  FORMAT,
  isNode,
  missingRenderer,
  type NodeOf,
  type RenderContext,
  renderOptionalChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_CLASS_OF_FAMILY,
  UNICODEMATH_FONT_OF_CLASS,
  UNICODEMATH_FONTS_CLASSES,
} from "../../generated/unicodemath/render-tables";

/**
 * `font_family(unicode: true)` per subclass, without the backslash — the
 * `FONTS_CLASSES` half of the resolution, measured class by class.
 *
 * `Monospace`'s entry is measured (`font_family(unicode: true)` really does
 * answer `"\\mtt"` for it) but never reaches the output: its own
 * `to_unicodemath` never calls `font_family`.
 *
 * These 14 names are also the guard set. A defined name outside it has no
 * measured render here, so it refuses rather than rendering the child bare.
 */

/**
 * `Utility::FONT_STYLES`, in its own declaration order — the family half of the
 * resolution, and the only thing the bare carrier has to go on.
 *
 * Duplicates the non-exported `FONT_STYLE_ALIASES` in `src/core/nodes.ts`,
 * which core keeps for equality; neither is generated. Regenerating both from
 * the gem is the standing fix.
 */

/** `UnicodeMath::Constants::FONTS_CLASSES`, as the membership test it is used as. */
const SUPPORTED_FONTS: ReadonlySet<string> = new Set(UNICODEMATH_FONTS_CLASSES);

/** U+FFD7 HALFWIDTH HANGUL LETTER YU — UnicodeMath's monospace mark. */
const MONOSPACE_MARK = "ￗ";

export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): string {
  const name = node.name;
  if (name !== undefined && !UNICODEMATH_FONT_OF_CLASS.has(name))
    throw missingRenderer(name, "fontStyle");

  // `Monospace#to_unicodemath` (`monospace.rb:37`) — the one override, and the
  // one arm that wraps its child instead of prefixing it.
  if (name === "Monospace")
    return `${MONOSPACE_MARK}${monospaceParens(node.parameterOne, context)}`;

  return `${fontPrefix(node)}${renderOptionalChild(node.parameterOne, context)}`;
}

/**
 * `supported_fonts(fonts, unicode: true)` (`font_style.rb:222`).
 *
 * `FONTS_CLASSES.find { … }` returning nil falls through every remaining
 * branch and interpolates as empty, so an unresolved font is no prefix rather
 * than a failure.
 */
function fontPrefix(node: NodeOf<"fontStyle">): string {
  const font =
    node.name === undefined
      ? bareFont(node.parameterTwo)
      : UNICODEMATH_FONT_OF_CLASS.get(node.name);

  return font !== undefined && SUPPORTED_FONTS.has(font) ? `\\${font}` : "";
}

/**
 * `parameter_to_class` (`font_style.rb:282`) followed by `font_classes` on the
 * instance it builds — the bare carrier's path, and the only one where
 * `parameter_two` is consulted at all.
 */
function bareFont(family: unknown): string | undefined {
  if (typeof family !== "string") {
    // `FONT_STYLES.select { |font, _| font == parameter_two.to_sym }` —
    // measured to raise for nil, Integer, Array, Hash and a node alike.
    throw new RenderError(
      `fontStyle.parameterTwo: the bare carrier resolves its font through ` +
        `parameter_two.to_sym, and the gem raises NoMethodError for ` +
        `${family === null ? "null" : typeof family}`,
      FORMAT,
      "fontStyle",
    );
  }

  const fontClass = UNICODEMATH_CLASS_OF_FAMILY.get(family);

  return fontClass === undefined ? undefined : UNICODEMATH_FONT_OF_CLASS.get(fontClass);
}

/**
 * `unicodemath_parens(parameter_one, …)` as `Monospace` reaches it.
 *
 * `Core#unicodemath_parens` (`core.rb:408`) calls `field.to_unicodemath` on the
 * line *before* its `if field` guard, so a nil child raises rather than
 * yielding `()` — measured, and the reason this cannot just call the shared
 * helper, which answers `null` for a non-node.
 */
function monospaceParens(field: unknown, context: RenderContext): string {
  if (!isNode(field)) {
    throw new RenderError(
      `fontStyle.parameterOne: Monospace wraps its child unconditionally, and the gem ` +
        `raises NoMethodError for ${field === null ? "null" : typeof field}`,
      FORMAT,
      "fontStyle",
    );
  }

  return unicodemathParens(field, context) ?? "";
}
