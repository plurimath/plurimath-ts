/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-html-parser-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 *
 * What every file under `src/formats/html/generated/` was generated from.
 *
 * Separate from the core, formatting, corpus, LaTeX and UnicodeMath
 * provenance files because a separate generator wrote it: the HTML format
 * module owns its own parser tables (§3 rules 1 and 3), and each generator
 * records its own inputs (§7).
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

export interface HtmlParserGeneratedProvenance {
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
export const HTML_PARSER_GENERATED_PROVENANCE: HtmlParserGeneratedProvenance = {
  generator: "scripts/generate-html-parser-data.rb",
  generatorInputs: new Map([
    [
      "scripts/generate-core-data.rb",
      "92dcbb1ea954c83f0e9899bc7c6417fc1cae32105a185fb5b0b3caad00b714a0",
    ],
    [
      "scripts/generate-corpus.rb",
      "a7ed6927c0f3a0821627de2bd6c2dc13e15dff889650419f588546b7ab8a1525",
    ],
    [
      "scripts/generate-html-parser-data.rb",
      "717774a9f19ac142b3601969b1325ba58319577c7b1af660e170269075877749",
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
