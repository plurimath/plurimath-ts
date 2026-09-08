/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-latex-parser-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 *
 * What every file under `src/formats/latex/generated/` was generated from.
 *
 * Separate from the core, formatting and corpus provenance files because a
 * separate generator wrote it: the LaTeX format module owns its own parser
 * tables (§3 rules 1 and 3), and each generator records its own inputs (§7).
 *
 * `generator` names the script that was run; `generatorInputs` hashes every
 * Ruby file whose bytes can change the tables, keyed by its
 * repository-relative path — that script, plus the two generators it
 * borrows emission, git and hashing helpers from. Hashing only the entry
 * point would let a change to a shared file move a table while the
 * recorded hash stayed identical.
 *
 * Otherwise deliberately path-free: dirty file lists would churn on every
 * unrelated edit.
 */

export interface LatexParserGeneratedProvenance {
  readonly generator: string;
  readonly generatorInputs: ReadonlyMap<string, string>;
  readonly oracle: string;
  readonly oracleVersion: string;
  readonly oracleCommit: string;
  readonly oracleClean: boolean;
  readonly generatorClean: boolean;
  readonly rubyEngine: string;
  readonly rubyVersion: string;
  readonly committable: boolean;
}

/**
 * `committable: false` marks output generated from a dirty checkout —
 * useful while iterating, never to be committed (§7).
 */
export const LATEX_PARSER_GENERATED_PROVENANCE: LatexParserGeneratedProvenance = {
  generator: "scripts/generate-latex-parser-data.rb",
  generatorInputs: new Map([
    [
      "scripts/generate-core-data.rb",
      "92dcbb1ea954c83f0e9899bc7c6417fc1cae32105a185fb5b0b3caad00b714a0",
    ],
    [
      "scripts/generate-corpus.rb",
      "a7ed6927c0f3a0821627de2bd6c2dc13e15dff889650419f588546b7ab8a1525",
    ],
    [
      "scripts/generate-latex-parser-data.rb",
      "422e4f81109e02774f1ed4a5be9baa5bde578e680f7dd011dd43978c12f246fc",
    ],
  ]),
  oracle: "plurimath",
  oracleVersion: "0.11.6",
  oracleCommit: "00c52783877b38f6b8e6e109f1803f96bb34fc62",
  oracleClean: true,
  generatorClean: true,
  rubyEngine: "ruby",
  rubyVersion: "4.0.1",
  committable: true,
};
