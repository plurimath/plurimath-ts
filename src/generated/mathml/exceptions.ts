/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * The mathml context-axis exception matrix.
 *
 * Only the symbols whose mathml output actually differs on some axis of
 * the committed manifest (`../context-axes.ts`) appear here — the set is
 * measured by rendering every symbol across every axis, never hand-picked
 * (§5). Everything absent renders from `./symbols.ts` unconditionally.
 */

/**
 * The axis values a variant applies under; only the axes that
 * actually matter are listed.
 */
export interface MathmlSymbolVariant {
  readonly when: Readonly<Record<string, boolean>>;
  readonly tag: string;
  readonly text: string;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface MathmlSymbolException {
  readonly id: string;
  readonly axes: readonly string[];
  readonly variants: readonly MathmlSymbolVariant[];
}

export const MATHML_SYMBOL_EXCEPTIONS: readonly MathmlSymbolException[] = [
  {
    id: "Dd",
    axes: ["intent"],
    variants: [
      { when: { intent: false }, tag: "mi", text: "&#x2146;", attributes: {} },
      { when: { intent: true }, tag: "mi", text: "&#x2146;", attributes: { intent: "ⅆ" } },
    ],
  },
  {
    id: "Ii",
    axes: ["intent"],
    variants: [
      { when: { intent: false }, tag: "mi", text: "&#x2148;", attributes: {} },
      { when: { intent: true }, tag: "mi", text: "&#x2148;", attributes: { intent: "ⅈ" } },
    ],
  },
  {
    id: "Intercal",
    axes: ["intent"],
    variants: [
      { when: { intent: false }, tag: "mi", text: "&#x22ba;", attributes: {} },
      { when: { intent: true }, tag: "mi", text: "&#x22ba;", attributes: { intent: "transpose" } },
    ],
  },
  {
    id: "Jj",
    axes: ["intent"],
    variants: [
      { when: { intent: false }, tag: "mi", text: "&#x2149;", attributes: {} },
      { when: { intent: true }, tag: "mi", text: "&#x2149;", attributes: { intent: "ⅉ" } },
    ],
  },
  {
    id: "UpcaseDd",
    axes: ["intent"],
    variants: [
      { when: { intent: false }, tag: "mi", text: "&#x2145;", attributes: {} },
      { when: { intent: true }, tag: "mi", text: "&#x2145;", attributes: { intent: "ⅅ" } },
    ],
  },
];
