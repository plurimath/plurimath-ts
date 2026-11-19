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
      "f0ff2e2218d2ba7a54fd73fcfbcaeaddecdbe05220d0480f3294929cd0568a14",
    ],
    [
      "scripts/generate-corpus.rb",
      "38f4873f087ac47bee7ac59772a4e30f22590a2bed26bd3ded0149510c5b398b",
    ],
    [
      "scripts/generate-latex-parser-data.rb",
      "9623b1db429e8dbfc33451138d8eaa1773667e7704f159836d2363b8e39e443a",
    ],
    [
      "scripts/latex-artifact-probe.rb",
      "e52c8d1610b1fdef86fc561215511ea75b711b7b938c2e8beab113d2b4dbe676",
    ],
    [
      "scripts/oracle-model-fields.rb",
      "e1fc7d625191302cf1adc176de1a853a91461e5a73b3e4674af91879fce8089a",
    ],
  ]),
  oracle: "plurimath",
  oracleVersion: "0.11.20",
  oracleCommit: "1a3033d0881d6c6ba655ab3ce00e0dc3cccfe5b4",
  oracleClean: true,
  generatorClean: true,
  rubyEngine: "ruby",
  rubyVersion: "4.0.1",
  committable: true,
};
