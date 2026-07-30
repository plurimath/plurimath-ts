/**
 * Diagnostics for constructs the gem supports but this port has not built yet
 * (ARCHITECTURE.md §5).
 *
 * Such input is not an error — it is processed as text — but silence would
 * hide a deliberate divergence from Ruby, so parsers report it here. Supplying
 * a callback replaces the default warning entirely, which is also how it is
 * silenced, rerouted, or escalated. There is deliberately no global switch: a
 * mutable module-level config would break the no-import-side-effects rule and
 * would be duplicated across the ESM and CJS copies.
 */

/** Constructs currently deferred. Grows and shrinks with the port. */
export type DeferredFeature = "unitsml";

export interface UnsupportedDiagnostic {
  readonly feature: DeferredFeature;
  /** The construct exactly as written by the caller. */
  readonly text: string;
  /** UTF-16 code-unit offset into the ORIGINAL input. */
  readonly index: number;
  /** The default human-readable explanation. */
  readonly message: string;
}

export type OnUnsupported = (diagnostic: UnsupportedDiagnostic) => void;

/**
 * Deduplication is call-time, module-local, advisory state — never touched at
 * import time, so the no-side-effects rule holds. A duplicate warning across
 * an ESM/CJS boundary is harmless.
 */
const warned = new Set<string>();

export function reportUnsupported(
  diagnostic: UnsupportedDiagnostic,
  onUnsupported?: OnUnsupported,
): void {
  if (onUnsupported) {
    onUnsupported(diagnostic);
    return;
  }
  // NUL separates the parts so a feature name can never collide with text.
  const key = `${diagnostic.feature}\u0000${diagnostic.text}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(diagnostic.message);
}

/** Test-only: the dedup cache is process-wide, so suites must be able to reset it. */
export function resetUnsupportedWarnings(): void {
  warned.clear();
}
