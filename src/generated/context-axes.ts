/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * The context-axis probe: its manifest, and what it found.
 *
 * This module is documentation-as-data for the exception matrices in
 * `<format>/exceptions.ts`. No renderer imports it — importing it would
 * pull every format's findings into one bundle (§3).
 */

export interface ContextAxis {
  readonly name: string;
  readonly values: readonly string[];
  readonly formats: readonly string[];
  readonly mechanism: string;
}

/**
 * The committed axis manifest. Probing cannot discover an axis it
 * does not exercise, so this list is reviewed, not inferred (§5).
 */
export const CONTEXT_AXES: readonly ContextAxis[] = [
  {
    name: "intent",
    values: ["false", "true"],
    formats: ["mathml"],
    mechanism: "the `intent` argument Formula#to_mathml threads down",
  },
  {
    name: "table",
    values: ["false", "true"],
    formats: ["asciimath", "latex", "mathml", "unicodemath"],
    mechanism: "options[:table], which Td sets for a Formula cell",
  },
  {
    name: "rspace",
    values: ["none", "thickmathspace"],
    formats: ["asciimath", "latex", "mathml", "unicodemath"],
    mechanism: "the symbol node's own options[:rspace]",
  },
];

export interface HostTemplate {
  readonly name: string;
  readonly description: string;
}

/**
 * The surroundings every symbol is rendered in, so neighbour-dependent
 * behaviour is exercised and not only the isolated symbol.
 */
export const HOST_TEMPLATES: readonly HostTemplate[] = [
  { name: "bare", description: "the symbol alone in a formula" },
  { name: "fenced", description: "the symbol inside a fenced group" },
  { name: "table-cell", description: "the symbol as the only cell of a one-by-one table" },
  { name: "binary-operand", description: "the symbol as the numerator of a fraction" },
];

export interface ContextDependentSymbol {
  readonly id: string;
  readonly formats: readonly string[];
  readonly axes: readonly string[];
  readonly probes: readonly string[];
}

/**
 * The difference set: every symbol whose output changed on some axis.
 * `direct` probes the symbol's own render method, `hosted` probes it
 * inside each host template with the host's own output cancelled out.
 */
export const CONTEXT_DEPENDENT_SYMBOLS: readonly ContextDependentSymbol[] = [
  { id: "Comma", formats: ["asciimath"], axes: ["table"], probes: ["direct", "hosted"] },
  { id: "Dd", formats: ["mathml"], axes: ["intent"], probes: ["direct", "hosted"] },
  { id: "Ii", formats: ["mathml"], axes: ["intent"], probes: ["direct", "hosted"] },
  { id: "Intercal", formats: ["mathml"], axes: ["intent"], probes: ["direct", "hosted"] },
  { id: "Jj", formats: ["mathml"], axes: ["intent"], probes: ["direct", "hosted"] },
  { id: "UpcaseDd", formats: ["mathml"], axes: ["intent"], probes: ["direct", "hosted"] },
];

export interface DynamicSymbol {
  readonly id: string;
  readonly reason: string;
  readonly formats: readonly string[];
  readonly axes: readonly string[];
}

/**
 * Classes with no static descriptor, and the axes they answer to.
 * They are node shapes rather than ids, so they carry no slice entry.
 */
export const DYNAMIC_SYMBOLS: readonly DynamicSymbol[] = [
  {
    id: "Symbol",
    reason: "renders from the node's own `value`, so it has no static descriptor",
    formats: ["mathml"],
    axes: ["rspace"],
  },
];

export interface ValueDependentSymbol {
  readonly id: string;
  readonly formats: readonly string[];
}

/**
 * Symbols that read the node's own `value`. Parsed symbols never carry
 * one, so the static descriptor holds — a hand-built node may not.
 */
export const VALUE_DEPENDENT_SYMBOLS: readonly ValueDependentSymbol[] = [
  { id: "Comma", formats: ["mathml"] },
  { id: "Plus", formats: ["mathml"] },
];

export interface ProbeFailure {
  readonly id: string;
  readonly format: string;
  readonly template: string;
  readonly context: string;
  readonly error: string;
}

/**
 * Combinations the gem itself raises on. Recorded rather than swallowed:
 * each one is a divergence the port has to decide about.
 */
export const PROBE_FAILURES: readonly ProbeFailure[] = [
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "bare",
    context: "intent=true table=false rspace=none",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "bare",
    context: "intent=true table=false rspace=thickmathspace",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "bare",
    context: "intent=true table=true rspace=none",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "bare",
    context: "intent=true table=true rspace=thickmathspace",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "binary-operand",
    context: "intent=true table=false rspace=none",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "binary-operand",
    context: "intent=true table=false rspace=thickmathspace",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "binary-operand",
    context: "intent=true table=true rspace=none",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "binary-operand",
    context: "intent=true table=true rspace=thickmathspace",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "table-cell",
    context: "intent=true table=false rspace=none",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "table-cell",
    context: "intent=true table=false rspace=thickmathspace",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "table-cell",
    context: "intent=true table=true rspace=none",
    error: "Plurimath::Math::ParseError",
  },
  {
    id: "UpcaseDd",
    format: "mathml",
    template: "table-cell",
    context: "intent=true table=true rspace=thickmathspace",
    error: "Plurimath::Math::ParseError",
  },
];

export interface ProbeSummary {
  readonly symbols: number;
  readonly formats: readonly string[];
  readonly directRenders: number;
  readonly hostedRenders: number;
}

export const PROBE_SUMMARY: ProbeSummary = {
  symbols: 1459,
  formats: ["asciimath", "latex", "mathml", "unicodemath"],
  directRenders: 29180,
  hostedRenders: 116720,
};
