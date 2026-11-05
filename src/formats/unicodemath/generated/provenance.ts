/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-unicodemath-parser-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 *
 * What every file under `src/formats/unicodemath/generated/` was generated from.
 *
 * Separate from the core, formatting, corpus and LaTeX provenance files
 * because a separate generator wrote it: the UnicodeMath format module owns
 * its own parser tables (§3 rules 1 and 3), and each generator records its
 * own inputs (§7).
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

export interface UnicodemathParserGeneratedProvenance {
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
export const UNICODEMATH_PARSER_GENERATED_PROVENANCE: UnicodemathParserGeneratedProvenance = {
  generator: "scripts/generate-unicodemath-parser-data.rb",
  generatorInputs: new Map([
    [
      "scripts/generate-core-data.rb",
      "6c3cdec230b1a640e14e2fb8ce212d992914e5c1d502f963a2fcdbad2467de71",
    ],
    [
      "scripts/generate-corpus.rb",
      "7a75f45b8ba8c774cc990cf2d68d9f2a5c328c66d570df1e177b5a7a3d86554e",
    ],
    [
      "scripts/generate-unicodemath-parser-data.rb",
      "c007522529b320d29240f4b32cd8903cd8cd2da13059178d7ad2806d1ffc8ca3",
    ],
  ]),
  oracle: "plurimath",
  oracleVersion: "0.11.12",
  oracleCommit: "ae20be111a26fdd988c58be0bfb2b7f6fe6e352f",
  oracleClean: true,
  generatorClean: true,
  rubyEngine: "ruby",
  rubyVersion: "4.0.1",
  committable: true,
};
