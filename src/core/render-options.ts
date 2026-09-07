/**
 * The runtime half of the renderer-options contract (ARCHITECTURE.md §5): a
 * render entry point calls `assertKnownOptions` first, so an option key the
 * format does not accept is REFUSED by name rather than silently ignored.
 *
 * The gem refuses at the language level. Every public render method on
 * `Math::Formula` declares explicit keywords and no `**rest` — read at the
 * pinned oracle (plurimath 0.11.6, `00c52783`):
 * `to_asciimath(formatter:, unitsml:, options:)` (formula.rb:66),
 * `to_mathml(intent:, formatter:, unitsml:, split_on_linebreak:,
 * display_style:, unary_function_spacing:)` (:76),
 * `to_latex` (:141), `to_html` (:149), `to_omml(display_style:,
 * split_on_linebreak:, formatter:, unitsml:)` (:157),
 * `to_unicodemath` (:187) — so Ruby raises `ArgumentError: unknown keyword:
 * :nosuchoption` before any of those bodies runs.
 *
 * Typing each format's options exactly is only the COMPILE-time half of that
 * (§5's convention): TypeScript's excess-property check catches a fresh object
 * literal and nothing else. A variable widened elsewhere, a JavaScript caller,
 * or an `as any` walked straight through — every landed entry point accepted
 * `{nosuchoption: 1}` and rendered normally. This is the runtime half, and it
 * is the same shape as the tree's: one check at the entry, raising the §5
 * boundary error (`RenderError`), never a `TypeError` from somewhere inside.
 *
 * What an "accepted key" is, per format, is the format's own decision and is
 * passed in: the empty set for a renderer whose options type declares no keys,
 * and the declared keys for one that does. A key the format recognises but has
 * not implemented is NOT this check's business — it belongs in the accepted
 * set and gets its own named refusal at the point that knows why (MathML's
 * deferred keywords do exactly this).
 *
 * Where this deliberately stops short of Ruby: the port's own error code and
 * message, not `ArgumentError`'s wording, because `RenderError` is the §5
 * contract every render entry point already promises and message text is never
 * API (core/errors.ts). And the accepted sets are the PORT's, which for the
 * text renderers is empty where the gem's is not — the gem's `formatter:` and
 * `unitsml:` are unimplemented here (P4 and deferred respectively,
 * ARCHITECTURE.md §5), so accepting them silently would promise a behaviour
 * this port does not have.
 */

import { describeThrown, RenderError } from "./errors";

/** The `kind` an options rejection carries: no node was reached to name. */
const NO_KIND = "unknown";

/**
 * Verifies that `options` carries only keys `accepted` names, throwing a
 * `RenderError` naming the offending key(s) when it does not.
 *
 * `undefined` and `null` pass: the gem's keywords all have defaults, so
 * calling with no options at all is its normal path, and `null` is the
 * spelling §4's signatures give that (`options?: T | null`).
 *
 * Own enumerable STRING keys are what count, matching the two neighbouring
 * runtime checks and the gem's data model: `Object.keys`, so an inherited key
 * is invisible (as it is to `Object.hasOwn`, which every renderer reads its
 * options with), and a symbol-keyed entry is invisible too (no Ruby hash can
 * hold one — core/validate.ts takes the same stance for node slots).
 *
 * A present key with an `undefined` value is still a present key, as it is in
 * Ruby, where `to_asciimath(nosuchoption: nil)` raises the same ArgumentError
 * as any other value. The one accommodation — an accepted-but-unimplemented
 * key whose explicit `undefined` reads as absent — lives with the renderer
 * that owns that key, not here.
 *
 * `format` names the caller in the error (`"asciimath"`, `"mathml"`, ...),
 * exactly as `assertMathNodeShape` uses it.
 */
export function assertKnownOptions(
  options: unknown,
  accepted: readonly string[],
  format: string,
): void {
  if (options === undefined || options === null) return;

  // The gem's contract is a keyword hash. A primitive here would ToObject-
  // coerce through `Object.hasOwn` and behave as empty options — a surprise,
  // not a rendering — and an array is not a keyword hash either. (A string
  // would be worse than surprising through `Object.keys`, which reports its
  // indices: `"ab"` would be refused for the unknown options "0" and "1".)
  if (typeof options !== "object" || Array.isArray(options)) {
    throw new RenderError(
      `options: expected a plain options object, found ${
        Array.isArray(options) ? "an array" : `a ${typeof options}`
      }`,
      format,
      NO_KIND,
    );
  }

  // Reading the keys runs the caller's code when the caller handed over a
  // Proxy, and this check sits at the very front of the entry point, ahead of
  // the renderers' own wraps — so it wraps its own read. Same contract as
  // everywhere else at this boundary: RenderError or pass, never a raw throw.
  let keys: readonly string[];
  try {
    keys = Object.keys(options);
  } catch (error) {
    throw new RenderError(
      `options: reading the options object itself threw — ${describeThrown(error)}`,
      format,
      NO_KIND,
    );
  }

  const unknown = keys.filter((key) => !accepted.includes(key));
  if (unknown.length === 0) return;

  // Ruby names every offending keyword and switches to the plural form when
  // there is more than one (`unknown keywords: :a, :b`); this mirrors that,
  // and adds what the format WOULD have accepted, which Ruby's message does
  // not carry.
  const named = unknown.map((key) => JSON.stringify(key)).join(", ");
  throw new RenderError(
    `options: unknown option${unknown.length > 1 ? "s" : ""} ${named} — ` +
      (accepted.length === 0
        ? "this renderer accepts no options"
        : `this renderer accepts ${accepted.map((key) => JSON.stringify(key)).join(", ")}`),
    format,
    NO_KIND,
  );
}
