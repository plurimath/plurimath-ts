/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-formatting-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 *
 * What every file under `src/formatting/generated/` was generated from.
 *
 * Separate from the core and format provenance files because a separate
 * generator wrote it: the formatting leaf service owns its own data (§3
 * rules 1-2), and each generator records its own inputs (§7).
 *
 * `generator` names the script that was run; `generatorInputs` hashes every
 * Ruby file whose bytes can change the table, keyed by its
 * repository-relative path — that script, plus the two generators it
 * borrows emission, git and hashing helpers from. Hashing only the entry
 * point would let a change to a shared file move the table while the
 * recorded hash stayed identical.
 *
 * Otherwise deliberately path-free: dirty file lists would churn on every
 * unrelated edit.
 */

export interface FormattingGeneratedProvenance {
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
export const FORMATTING_GENERATED_PROVENANCE: FormattingGeneratedProvenance = {
  generator: "scripts/generate-formatting-data.rb",
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
      "scripts/generate-formatting-data.rb",
      "283f54f96b58f4f1c6cef564a8771d51b8df75d06d6a2c26c372d25c3c7e5b0b",
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
