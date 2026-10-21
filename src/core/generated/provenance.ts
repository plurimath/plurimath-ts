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
      "6c3cdec230b1a640e14e2fb8ce212d992914e5c1d502f963a2fcdbad2467de71",
    ],
    [
      "scripts/generate-corpus.rb",
      "d22603531c0f5205c4d6a29fa002963317acf1a7d42bc8b8f6a01827e86d3a5c",
    ],
  ]),
  oracle: "plurimath",
  oracleVersion: "0.11.12",
  oracleCommit: "ae20be111a26fdd988c58be0bfb2b7f6fe6e352f",
  oracleClean: true,
  generatorClean: true,
  entityLibrary: "htmlentities",
  entityLibraryVersion: "4.4.2",
  entityFlavour: "xhtml1",
  rubyEngine: "ruby",
  rubyVersion: "4.0.1",
  committable: true,
};
