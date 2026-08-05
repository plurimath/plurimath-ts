/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * The asciimath context-axis exception matrix.
 *
 * Only the symbols whose asciimath output actually differs on some axis of
 * the committed manifest (`../context-axes.ts`) appear here — the set is
 * measured by rendering every symbol across every axis, never hand-picked
 * (§5). Everything absent renders from `./symbols.ts` unconditionally.
 */

/**
 * The axis values a variant applies under; only the axes that
 * actually matter are listed.
 */
export interface AsciimathSymbolVariant {
  readonly when: Readonly<Record<string, boolean>>;
  readonly value: string;
}

export interface AsciimathSymbolException {
  readonly id: string;
  readonly axes: readonly string[];
  readonly variants: readonly AsciimathSymbolVariant[];
}

export const ASCIIMATH_SYMBOL_EXCEPTIONS: readonly AsciimathSymbolException[] = [
  {
    id: "Comma",
    axes: ["table"],
    variants: [
      { when: { table: false }, value: "," },
      { when: { table: true }, value: '","' },
    ],
  },
];
