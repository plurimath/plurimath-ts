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
      "f0ff2e2218d2ba7a54fd73fcfbcaeaddecdbe05220d0480f3294929cd0568a14",
    ],
    [
      "scripts/generate-corpus.rb",
      "38f4873f087ac47bee7ac59772a4e30f22590a2bed26bd3ded0149510c5b398b",
    ],
    [
      "scripts/generate-unicodemath-parser-data.rb",
      "d4d3cfc1979716bc32aae63121ef83ddeea7ca466d1650db4069e0d26fc6ee4e",
    ],
    [
      "scripts/unicodemath-artifact-probe.rb",
      "5f627463abc823a97813282217c5dc988f790bd5346636371a0ee9bce0666ac8",
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
