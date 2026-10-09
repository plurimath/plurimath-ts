/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-mathml-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 *
 * What every file under `src/formats/mathml/generated/` was generated from. `generatorInputs`
 * hashes every Ruby file whose bytes can change the output.
 */

export interface MathmlDataGeneratedProvenance {
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
export const MATHML_DATA_GENERATED_PROVENANCE: MathmlDataGeneratedProvenance = {
  generator: "scripts/generate-mathml-data.rb",
  generatorInputs: new Map([
    [
      "scripts/generate-core-data.rb",
      "6c3cdec230b1a640e14e2fb8ce212d992914e5c1d502f963a2fcdbad2467de71",
    ],
    [
      "scripts/generate-corpus.rb",
      "0ed08c3c87a374b726fa3ddef272d420bfd476e54d270773a50f9046490cf0ef",
    ],
    [
      "scripts/generate-mathml-data.rb",
      "0b0c0e45845578f1f6e8da204ded48dfb515a27ec1bfc0ad59f025fa2e48ae8a",
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
