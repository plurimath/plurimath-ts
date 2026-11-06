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
  generatorSha256: "82630cc145295b12b23443c853b5d2841cd7e293c607092409a050e67fc27868",
  oracle: "plurimath",
  oracleVersion: "0.11.17",
  oracleCommit: "2967dcc47a9f37d5b9a2dd13d94a2ad35d4cc256",
  oracleClean: true,
  generatorClean: true,
  rubyEngine: "ruby",
  rubyVersion: "4.0.1",
  xmlEngine: "Plurimath::XmlEngine::OxEngine",
  committable: true,
};
