/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-core-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 *
 * What every file under `src/core/generated/` was generated from.
 *
 * Separate from `src/generated/provenance.ts` because a separate generator
 * wrote it: layer 1 may not import format-owned data, and each generator
 * records its own inputs (§7).
 *
 * `generator` names the script that was run; `generatorInputs` hashes every
 * Ruby file whose bytes can change these tables, keyed by its
 * repository-relative path — that script, plus the corpus generator it
 * borrows class discovery, symbol ids and hashing from. Hashing only the
 * entry point would let a change to the shared file move the tables while
 * the recorded hash stayed identical.
 *
 * Otherwise deliberately path-free: dirty file lists would churn on every
 * unrelated edit.
 */

export interface CoreGeneratedProvenance {
  readonly generator: string;
  readonly generatorInputs: ReadonlyMap<string, string>;
  readonly oracle: string;
  readonly oracleVersion: string;
  readonly oracleCommit: string;
  readonly oracleClean: boolean;
  readonly generatorClean: boolean;
  readonly entityLibrary: string;
  readonly entityLibraryVersion: string;
  readonly entityFlavour: string;
  readonly rubyEngine: string;
  readonly rubyVersion: string;
  readonly committable: boolean;
}

/**
 * `committable: false` marks output generated from a dirty checkout —
 * useful while iterating, never to be committed (§7).
 */
export const CORE_GENERATED_PROVENANCE: CoreGeneratedProvenance = {
  generator: "scripts/generate-core-data.rb",
  generatorInputs: new Map([
    [
      "scripts/generate-core-data.rb",
      "92dcbb1ea954c83f0e9899bc7c6417fc1cae32105a185fb5b0b3caad00b714a0",
    ],
    [
      "scripts/generate-corpus.rb",
      "b51470a4023cebd17a2428fd40c826f883cc0762bc5b25ec06575f4bc11b35bc",
    ],
  ]),
  oracle: "plurimath",
  oracleVersion: "0.11.6",
  oracleCommit: "00c52783877b38f6b8e6e109f1803f96bb34fc62",
  oracleClean: true,
  generatorClean: true,
  entityLibrary: "htmlentities",
  entityLibraryVersion: "4.4.2",
  entityFlavour: "xhtml1",
  rubyEngine: "ruby",
  rubyVersion: "4.0.1",
  committable: true,
};
