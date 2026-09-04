/**
 * The pinned-corpus reader, proven against scratch copies rather than argued
 * from the code.
 *
 * Two fixtures are used. The **real** pin is copied to a temporary directory and
 * damaged there, so byte checks are exercised against the bytes actually
 * shipped. A **synthetic** pin is written from scratch — with its hashes
 * computed, so it is a valid pin — for the structural gaps the real one cannot
 * have. The synthetic pin is loaded intact first: a negative test whose fixture
 * was broken for some other reason proves nothing.
 */

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  loadPinnedCorpus,
  PINNED_CORPUS_ROOT,
  type PinnedCorpus,
  readExclusions,
  SUBMODULE_FIX,
} from "./corpus-pin";
import { readCorpusCases } from "./model-builder";

const scratches: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "plurimath-pin-"));
  scratches.push(root);
  return root;
}

afterAll(() => {
  for (const root of scratches) rmSync(root, { recursive: true, force: true });
});

/** A copy of the real pin, damaged by `mutate`. */
function damagedCopy(mutate: (root: string) => void): string {
  const root = scratch();
  cpSync(PINNED_CORPUS_ROOT, root, {
    recursive: true,
    filter: (source) => !source.split(sep).includes(".git"),
  });
  mutate(root);
  return root;
}

function editFile(path: string, edit: (text: string) => string): void {
  writeFileSync(path, edit(readFileSync(path, "utf8")));
}

const TINY_PAYLOAD = [
  "# A synthetic group.",
  "---",
  "schema: plurimath-corpus/asciimath/1",
  "group: tiny",
  "description: One case, written by hand",
  "input_format: asciimath",
  "targets:",
  "- asciimath",
  "- latex",
  "cases:",
  "- id: tiny-symbol",
  "  input: x",
  "  input_format: asciimath",
  "  preprocessed: x",
  "  expected:",
  "    asciimath: x",
  "    latex: x",
  "  parse_tree:",
  "    expr:",
  "      sequence:",
  "        symbol: x",
  "  model:",
  "    class: Math::Formula",
  "    fields:",
  "      value:",
  "      - class: Math::Symbols::Symbol",
  "        fields:",
  "          value: x",
  "",
].join("\n");

/**
 * The same group written as `cases/2`: one target renders, the other refuses.
 * `cases/2` is not a replacement for `cases/1` — a payload names its own schema
 * — so both fixtures are loaded intact below before either is damaged.
 */
const TINY_PAYLOAD_2 = [
  "# A synthetic group, with per-target outcomes.",
  "---",
  "schema: plurimath-corpus/asciimath/2",
  "group: tiny",
  "description: One case the gem renders to one target and refuses on the other",
  "input_format: asciimath",
  "targets:",
  "- asciimath",
  "- latex",
  "cases:",
  "- id: tiny-partial",
  "  input: x",
  "  input_format: asciimath",
  "  preprocessed: x",
  "  expected:",
  "    asciimath:",
  "      output: x",
  "    latex:",
  "      error:",
  "        category: parse_error",
  "  parse_tree:",
  "    expr:",
  "      sequence:",
  "        symbol: x",
  "  model:",
  "    class: Math::Formula",
  "    fields:",
  "      value:",
  "      - class: Math::Symbols::Symbol",
  "        fields:",
  "          value: x",
  "",
].join("\n");

interface SyntheticOptions {
  readonly payload?: string;
  readonly group?: string;
  readonly provenance?: (text: string) => string;
  readonly extraFile?: string;
}

/**
 * Writes a complete, self-consistent pin: the provenance records the sha256 and
 * byte count of whatever payload was asked for, so only the requested defect is
 * present.
 */
function syntheticPin(options: SyntheticOptions = {}): string {
  const root = scratch();
  const group = options.group ?? "tiny";
  const body = options.payload ?? TINY_PAYLOAD;
  mkdirSync(join(root, "corpus", "asciimath"), { recursive: true });
  const payloadPath = join(root, "corpus", "asciimath", `${group}.yaml`);
  writeFileSync(payloadPath, body);
  if (options.extraFile !== undefined) {
    writeFileSync(join(root, "corpus", "asciimath", options.extraFile), TINY_PAYLOAD);
  }

  const bytes = Buffer.from(body, "utf8");
  const provenance = [
    "# Synthetic provenance.",
    "---",
    "schema: plurimath-corpus/provenance/2",
    "committable: true",
    "warnings: []",
    "generator:",
    "  path: scripts/generate-corpus.rb",
    "oracle:",
    "  gem: plurimath",
    "  version: 0.11.6",
    "  commit: '0000000000000000000000000000000000000000'",
    "xml_engine: Plurimath::XmlEngine::OxEngine",
    "payloads:",
    `- path: asciimath/${group}.yaml`,
    `  sha256: ${createHash("sha256").update(bytes).digest("hex")}`,
    `  bytes: ${bytes.length}`,
    "",
  ].join("\n");
  const edit = options.provenance ?? ((text: string) => text);
  writeFileSync(join(root, "corpus", "provenance.yaml"), edit(provenance));
  return root;
}

/**
 * Committed by name, not counted. A pin that loses a group is still a valid,
 * self-consistent pin — the reader has nothing to object to and every parity
 * suite happily runs the smaller set. This list is the only thing standing
 * between "the corpus shrank" and "the corpus shrank and the suite was still
 * green"; the proof that it is load-bearing is at the end of this file.
 */
const EXPECTED_GROUPS = [
  "colour",
  "fences",
  "fonts",
  "frac",
  "left-right",
  "matrices",
  "mixed",
  "mod",
  "nary",
  "numbers",
  "operators",
  "partial-render",
  "permissive",
  "powers",
  "quoted-text",
  "roots",
  "symbols",
  "unary-functions",
  "whitespace",
];

/**
 * The assertion itself, so it can be applied to a damaged pin as well as to the
 * shipped one. Comparing a damaged pin's groups to `EXPECTED_GROUPS` with
 * `not.toStrictEqual` would only show the arrays differ — it would pass whether
 * or not anything rejects the damaged pin, which is the difference between a
 * red-green proof and a restatement.
 */
function assertExpectedGroups(corpus: PinnedCorpus): void {
  expect(corpus.payloads.map((payload) => payload.group)).toStrictEqual(EXPECTED_GROUPS);
}

describe("the pin as shipped", () => {
  const corpus = loadPinnedCorpus();

  it("loads every group the provenance records", () => {
    // 19 case payloads and 1 rejection payload. Counted apart on purpose: the
    // rejection payload carries no rendering, so folding it into the case
    // count would inflate what "the corpus covers" claims.
    expect(corpus.payloads.length).toBe(19);
    expect(corpus.rejectionPayloads.length).toBe(1);
    expect(corpus.provenance.payloads.length).toBe(20);
    assertExpectedGroups(corpus);
  });

  it("carries 92 cases with distinct ids", () => {
    expect(corpus.cases.length).toBe(92);
    expect(new Set(corpus.cases.map((entry) => entry.id)).size).toBe(92);
  });

  it("was generated the canonical way", () => {
    expect(corpus.provenance.committable).toBe(true);
    expect(corpus.provenance.xmlEngine).toBe("Plurimath::XmlEngine::OxEngine");
    expect(corpus.provenance.oracleVersion).toBe("0.11.6");
    expect(corpus.provenance.oracleCommit).toBe("00c52783877b38f6b8e6e109f1803f96bb34fc62");
  });

  it("accounts for every declared target on every case", () => {
    for (const payload of corpus.payloads) {
      for (const entry of payload.cases) {
        const accounted = [...entry.expected.keys(), ...entry.refusals.keys()].sort();
        expect(accounted, entry.id).toStrictEqual([...payload.targets].sort());
        // A target cannot both render and refuse: the two maps are disjoint.
        for (const target of entry.refusals.keys()) {
          expect(entry.expected.has(target), `${entry.id} ${target}`).toBe(false);
        }
      }
    }
  });

  it("records the one input the gem renders to only some targets", () => {
    // The single `cases/2` group in the pin. Every other case renders to all
    // four targets, so its `refusals` map is empty and every consumer written
    // against `cases/1` reads it unchanged.
    const partial = corpus.cases.filter((entry) => entry.refusals.size > 0);
    expect(partial.map((entry) => entry.id)).toStrictEqual(["partial-sqrt-unclosed"]);
    const entry = partial[0];
    expect(entry?.input).toBe("sqrt(");
    expect([...(entry?.expected.keys() ?? [])]).toStrictEqual(["asciimath", "latex", "mathml"]);
    expect([...(entry?.refusals.entries() ?? [])]).toStrictEqual([["unicodemath", "parse_error"]]);
    // The input parsed, so the tree and the model are still there; only the
    // rendering of that model failed.
    expect(entry?.parseTree).not.toBe(null);
    expect(entry?.model).not.toBe(null);
  });
});

describe("what this port checks against", () => {
  it("is the pin minus the deferred-construct cases", () => {
    const corpus = loadPinnedCorpus();
    const withheld = new Set(readExclusions().map((entry) => entry.id));
    const inPin = corpus.cases.filter((entry) => withheld.has(entry.id)).map((entry) => entry.id);
    // `text-unitsml-invalid` is withheld too, but the gem raises on it, so the
    // shared corpus has no case to withhold — only the valid one is in the pin.
    expect(inPin).toStrictEqual(["text-unitsml-valid"]);
    expect(readCorpusCases().length).toBe(corpus.cases.length - inPin.length);
    expect(readCorpusCases().length).toBe(91);
  });

  it("names the deferred feature and cites the architecture note", () => {
    const withheld = readExclusions();
    expect(withheld.map((entry) => entry.id).sort()).toStrictEqual([
      "text-unitsml-invalid",
      "text-unitsml-valid",
    ]);
    for (const entry of withheld) {
      expect(entry.feature).toBe("unitsml");
      expect(entry.reason).toContain("ARCHITECTURE.md");
    }
  });
});

describe("an uninitialised submodule fails loudly", () => {
  it("names the fix when the directory is empty", () => {
    const root = scratch();
    expect(() => loadPinnedCorpus(root)).toThrow(SUBMODULE_FIX);
    expect(() => loadPinnedCorpus(root)).toThrow("the directory is present but empty");
  });

  it("names the fix when the directory is not there at all", () => {
    const root = join(scratch(), "never-cloned");
    expect(() => loadPinnedCorpus(root)).toThrow(SUBMODULE_FIX);
    expect(() => loadPinnedCorpus(root)).toThrow("the directory does not exist");
  });

  it("reaches the same failure through the case reader", () => {
    expect(() => readCorpusCases(scratch())).toThrow(SUBMODULE_FIX);
  });

  it("names the fix when a listed payload is missing", () => {
    const root = damagedCopy((where) => {
      rmSync(join(where, "corpus", "asciimath", "frac.yaml"));
    });
    expect(() => loadPinnedCorpus(root)).toThrow(SUBMODULE_FIX);
    expect(() => loadPinnedCorpus(root)).toThrow("is not on disk");
  });
});

describe("a payload that does not match its provenance fails", () => {
  it("catches a changed byte that keeps the length", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "corpus", "asciimath", "frac.yaml"), (text) =>
        text.replace("id: frac-simple", "id: frac-simpl3"),
      );
    });
    expect(() => loadPinnedCorpus(root)).toThrow("sha256");
  });

  it("catches a changed length before it hashes anything", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "corpus", "asciimath", "roots.yaml"), (text) => `${text}\n`);
    });
    expect(() => loadPinnedCorpus(root)).toThrow("bytes on disk, provenance records");
  });

  it("catches a payload nothing vouches for", () => {
    const root = syntheticPin({ extraFile: "smuggled.yaml" });
    expect(() => loadPinnedCorpus(root)).toThrow("not listed in corpus/provenance.yaml");
  });
});

describe("a pin that was not generated the canonical way is refused", () => {
  it("refuses committable: false", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "corpus", "provenance.yaml"), (text) =>
        text
          .replace("committable: true", "committable: false")
          .replace("warnings: []", "warnings:\n- generated with --allow-dirty"),
      );
    });
    expect(() => loadPinnedCorpus(root)).toThrow("committable: false");
    expect(() => loadPinnedCorpus(root)).toThrow("generated with --allow-dirty");
  });

  it("refuses an engine other than Ox", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "corpus", "provenance.yaml"), (text) =>
        text.replace("XmlEngine::OxEngine", "XmlEngine::OgaEngine"),
      );
    });
    expect(() => loadPinnedCorpus(root)).toThrow("Plurimath::XmlEngine::OgaEngine");
  });

  it("refuses a provenance schema it does not know", () => {
    const root = damagedCopy((where) => {
      editFile(join(where, "corpus", "provenance.yaml"), (text) =>
        text.replace("plurimath-corpus/provenance/2", "plurimath-corpus/provenance/3"),
      );
    });
    expect(() => loadPinnedCorpus(root)).toThrow("this reader knows");
  });
});

describe("the synthetic fixture, and the gaps only it can have", () => {
  it("loads intact, so the failures below are the defect under test", () => {
    const corpus = loadPinnedCorpus(syntheticPin());
    expect(corpus.cases.map((entry) => entry.id)).toStrictEqual(["tiny-symbol"]);
    expect(corpus.cases[0]?.expected.get("latex")).toBe("x");
    // A `cases/1` case cannot express a refusal, so its map is empty rather
    // than absent — which is what lets every consumer written against
    // `cases/1` read a `cases/2` corpus without changing.
    expect(corpus.cases[0]?.refusals.size).toBe(0);
  });

  it("fails on a pin that records no payloads", () => {
    const root = syntheticPin({
      provenance: (text) => `${text.slice(0, text.indexOf("payloads:"))}payloads: []\n`,
    });
    expect(() => loadPinnedCorpus(root)).toThrow('"payloads" is empty');
  });

  it("fails on a payload with no cases", () => {
    const payload = `${TINY_PAYLOAD.slice(0, TINY_PAYLOAD.indexOf("cases:"))}cases: []\n`;
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow('"cases" is empty');
  });

  it("fails on a payload with no group", () => {
    const payload = TINY_PAYLOAD.replace("group: tiny\n", "");
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow('"group" must be');
  });

  it("fails on a group that does not match its file name", () => {
    const payload = TINY_PAYLOAD.replace("group: tiny", "group: enormous");
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow(
      'group is "enormous" but the file is named "tiny.yaml"',
    );
  });

  it("fails on a case missing one of the declared targets", () => {
    const payload = TINY_PAYLOAD.replace("    latex: x\n", "");
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow("expected.latex is missing");
  });

  it("fails on a case missing its model", () => {
    const payload = TINY_PAYLOAD.slice(0, TINY_PAYLOAD.indexOf("  model:"));
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow('"model" is missing');
  });
});

describe("cases/2, and the outcomes only it can carry", () => {
  it("loads intact, so the failures below are the defect under test", () => {
    const corpus = loadPinnedCorpus(syntheticPin({ payload: TINY_PAYLOAD_2 }));
    expect(corpus.cases.map((entry) => entry.id)).toStrictEqual(["tiny-partial"]);
    const entry = corpus.cases[0];
    // The rendered target lands in `expected`, the refusing one in `refusals`,
    // and neither map mentions the other's target.
    expect([...(entry?.expected.entries() ?? [])]).toStrictEqual([["asciimath", "x"]]);
    expect([...(entry?.refusals.entries() ?? [])]).toStrictEqual([["latex", "parse_error"]]);
  });

  it("refuses a bare string where an outcome belongs", () => {
    // What `cases/1` writes at this position. A payload declaring `2` and
    // writing `1`'s shape is a payload nothing generated.
    const payload = TINY_PAYLOAD_2.replace(
      "    asciimath:\n      output: x\n",
      "    asciimath: x\n",
    );
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow(
      "expected a mapping, found string",
    );
  });

  it("refuses an outcome that both renders and refuses", () => {
    const payload = TINY_PAYLOAD_2.replace(
      "    asciimath:\n      output: x\n",
      "    asciimath:\n      output: x\n      error:\n        category: parse_error\n",
    );
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow(
      "an outcome is exactly one of",
    );
  });

  it("refuses an outcome that is neither", () => {
    const payload = TINY_PAYLOAD_2.replace(
      "    asciimath:\n      output: x\n",
      "    asciimath: {}\n",
    );
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow(
      "an outcome is exactly one of",
    );
  });

  it("refuses an error category it does not know", () => {
    const payload = TINY_PAYLOAD_2.replace("category: parse_error", "category: render_error");
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow(
      'error.category is "render_error"',
    );
  });

  it("refuses an error carrying an offset", () => {
    // `rejections/1` records one; a render refusal cannot, because the input
    // already parsed and no position in it describes what failed afterwards.
    const payload = TINY_PAYLOAD_2.replace(
      "        category: parse_error\n",
      "        category: parse_error\n        index: 3\n",
    );
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow(
      '"error" carries "category" and nothing else',
    );
  });

  it("refuses an output that is not a string", () => {
    const payload = TINY_PAYLOAD_2.replace("      output: x\n", "      output: {}\n");
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow('"output" must be a string');
  });
});

/**
 * The gate that makes a rendered-only `expected` safe to iterate.
 *
 * Splitting one payload field across two maps buys every existing consumer an
 * untouched `expected` — and buys with it the failure that a consumer looping
 * over `expected` skips a refusing target and reports parity it never checked.
 * The union of the two maps is therefore checked against the group's `targets`
 * on every case, in both directions.
 *
 * Proven on synthetic pins rather than on damaged copies of the real one: a
 * copy edited in place fails the provenance sha256 first, so the gate under
 * test would never be reached.
 */
describe("the target-coverage gate", () => {
  it("passes on both fixtures and on the pin as shipped", () => {
    expect(() => loadPinnedCorpus(syntheticPin())).not.toThrow();
    expect(() => loadPinnedCorpus(syntheticPin({ payload: TINY_PAYLOAD_2 }))).not.toThrow();
    expect(() => loadPinnedCorpus()).not.toThrow();
  });

  it("fires when a cases/2 case leaves a declared target unaccounted for", () => {
    const payload = TINY_PAYLOAD_2.replace(
      "    latex:\n      error:\n        category: parse_error\n",
      "",
    );
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow("expected.latex is missing");
  });

  it("fires when a cases/2 case names a target the group never declared", () => {
    const payload = TINY_PAYLOAD_2.replace(
      "    asciimath:\n      output: x\n",
      "    asciimath:\n      output: x\n    mathml:\n      output: y\n",
    );
    expect(() => loadPinnedCorpus(syntheticPin({ payload }))).toThrow(
      "expected.mathml is not a declared target",
    );
  });

  it("fires on a cases/1 payload too, in both directions", () => {
    // The gate is about the group's `targets`, not about which schema wrote
    // the outcomes, so a `cases/1` payload is held to the same rule. The
    // undeclared-target half is new: the previous reader looped over `targets`
    // and never saw a key outside them.
    const short = TINY_PAYLOAD.replace("    latex: x\n", "");
    expect(() => loadPinnedCorpus(syntheticPin({ payload: short }))).toThrow(
      "expected.latex is missing",
    );
    const long = TINY_PAYLOAD.replace("    latex: x\n", "    latex: x\n    mathml: y\n");
    expect(() => loadPinnedCorpus(syntheticPin({ payload: long }))).toThrow(
      "expected.mathml is not a declared target",
    );
  });
});

/**
 * The one discovery failure that is *not* an error: a group that disappears
 * from the payload directory and from the provenance together leaves a pin
 * with nothing wrong with it. Every other rule in this file throws; this one
 * can only be caught by an expectation committed in advance, so that
 * expectation is proven to be load-bearing rather than decorative.
 */
describe("a pin that quietly loses a group", () => {
  const shrunk = loadPinnedCorpus(
    damagedCopy((where) => {
      rmSync(join(where, "corpus", "asciimath", "frac.yaml"));
      editFile(join(where, "corpus", "provenance.yaml"), (text) =>
        text.replace(/- path: asciimath\/frac\.yaml\n(?: {2}\S.*\n)*/, ""),
      );
    }),
  );

  it("loads without complaint, which is the whole problem", () => {
    expect(shrunk.payloads.length).toBe(18);
    expect(shrunk.cases.length).toBe(86);
    expect(shrunk.payloads.map((payload) => payload.group)).not.toContain("frac");
  });

  it("is rejected by the assertion the shipped pin passes", () => {
    // The same function, applied to both pins: it accepts the real one and
    // throws on this one. Without running it against damaged input, nothing
    // would show the expectation rejects anything.
    expect(() => assertExpectedGroups(loadPinnedCorpus())).not.toThrow();
    expect(() => assertExpectedGroups(shrunk)).toThrow();
  });
});
