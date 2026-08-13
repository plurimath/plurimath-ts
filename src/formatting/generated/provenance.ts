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
      "57ee0e78e0a1abbc0fff594d01cbb06d26fb5355f666b729ac08001409c8e701",
    ],
    [
      "scripts/generate-corpus.rb",
      "c159af608353b9ecb6cc3123554228be68a0140b255f6217480ecff9a2ffc3ad",
    ],
    [
      "scripts/generate-formatting-data.rb",
      "97bc72537d3045e19bb0e60143b33c7b977061cfd6a89b8abb7a1b6a1e4f4ee6",
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
