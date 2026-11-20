/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-omml-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 *
 * What every file under `src/formats/omml/generated/` was generated from. `generatorInputs`
 * hashes every Ruby file whose bytes can change the output.
 */

export interface OmmlDataGeneratedProvenance {
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
export const OMML_DATA_GENERATED_PROVENANCE: OmmlDataGeneratedProvenance = {
  generator: "scripts/generate-omml-data.rb",
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
      "scripts/generate-mathml-data.rb",
      "e93da2d571ac2c21413f1bf9d14e53d1354b6d49ceba1057bcb03cdd2422b901",
    ],
    [
      "scripts/generate-omml-data.rb",
      "a4d7dcbca70bfe06d05d6fd90c68559ed40fc379dbc9c4261d498d60450b76a0",
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
