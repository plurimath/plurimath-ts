/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 *
 * What every file under `src/generated/` was generated from.
 *
 * Deliberately path-free: dirty file lists would churn on every unrelated
 * edit. The full provenance, including those lists, is in the corpus
 * sidecar manifests (§7).
 */

export interface GeneratedProvenance {
  readonly generator: string;
  readonly generatorSha256: string;
  readonly oracle: string;
  readonly oracleVersion: string;
  readonly oracleCommit: string;
  readonly oracleClean: boolean;
  readonly generatorClean: boolean;
  readonly rubyEngine: string;
  readonly rubyVersion: string;
  readonly xmlEngine: string;
  readonly committable: boolean;
}

/**
 * `committable: false` marks output generated from a dirty checkout —
 * useful while iterating, never to be committed (§7).
 */
export const GENERATED_PROVENANCE: GeneratedProvenance = {
  generator: "scripts/generate-corpus.rb",
  generatorSha256: "0e3c855bc77c0e8658990f4e4bd1e9704c9a76a7d3dd08d0f44b1577d59d1545",
  oracle: "plurimath",
  oracleVersion: "0.11.6",
  oracleCommit: "00c52783877b38f6b8e6e109f1803f96bb34fc62",
  oracleClean: true,
  generatorClean: true,
  rubyEngine: "ruby",
  rubyVersion: "4.0.1",
  xmlEngine: "Plurimath::XmlEngine::OxEngine",
  committable: true,
};
