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
      "bb9e2b17058c562941eb6749664abb053f2250e3641580a81837225546997254",
    ],
    [
      "scripts/generate-latex-parser-data.rb",
      "237c0d23d7b2be05ae7654adc80d86888d464619e395468efb33052c36257ec2",
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
