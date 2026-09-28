/**
 * Parity for `src/xml`'s reader against the gem's own XML read.
 *
 * Every row of `./reader-fixtures.json` is one input and what the pinned
 * oracle's stack (Ox under Moxml under Lutaml, the `OxAdapter` that
 * `Mml.parse` and `Omml.parse` use) did with it: the tree its models receive,
 * or a refusal. `scripts/generate-xml-reader-fixtures.rb` measured them; the
 * sidecar manifest pins how. Every row must match, except the one documented
 * divergence (`divergenceBaseline`), whose rows must instead match the gem's
 * own UTF-8 answer for the same body.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ASCII_INCOMPATIBLE_ENCODING_NAMES,
  readXml,
  type XmlReadElement,
  XmlReadError,
  type XmlReadNode,
} from "../../src/xml/index";

type FixtureString = string | { readonly invalidUtf8: string };

interface FixtureElement {
  readonly element: string | null;
  readonly prefix?: string;
  readonly namespace?: FixtureString;
  readonly attributes: readonly (readonly [string, string])[];
  readonly xmlns: readonly (readonly [string, FixtureString])[];
  readonly children: readonly FixtureNode[];
}

type FixtureNode =
  | FixtureElement
  | { readonly text: string }
  | { readonly cdata: string }
  | { readonly comment: string }
  | { readonly pi: string; readonly text: string };

interface FixtureRow {
  readonly id: string;
  readonly group: string;
  readonly input: string;
  readonly root?: FixtureElement;
  readonly raises?: string;
}

interface Fixture {
  readonly caseCount: number;
  readonly readCount: number;
  readonly raisedCount: number;
  readonly encodingTable: {
    readonly utf8: readonly string[];
    readonly asciiIncompatible: readonly string[];
  };
  readonly cases: readonly FixtureRow[];
}

const FIXTURE = JSON.parse(
  readFileSync(new URL("./reader-fixtures.json", import.meta.url), "utf8"),
) as Fixture;

/**
 * A namespace URI the gem holds as invalid UTF-8 is recorded as its bytes; a
 * JavaScript string cannot hold them, and the reader decodes them with
 * replacement characters (a documented divergence of representation only).
 */
function fixtureString(value: FixtureString): string {
  if (typeof value === "string") return value;
  // biome-ignore lint/style/useNamingConvention: the DOM option is spelled `ignoreBOM`.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(
    Buffer.from(value.invalidUtf8, "hex"),
  );
}

function expectedNode(node: FixtureNode): XmlReadNode {
  if ("element" in node) return expectedElement(node);
  if ("pi" in node) return { kind: "pi", target: node.pi, text: node.text };
  if ("cdata" in node) return { kind: "cdata", text: node.cdata };
  if ("comment" in node) return { kind: "comment", text: node.comment };
  return { kind: "text", text: node.text };
}

function expectedElement(node: FixtureElement): XmlReadElement {
  return {
    kind: "element",
    name: node.element,
    prefix: node.prefix ?? null,
    namespace: node.namespace === undefined ? null : fixtureString(node.namespace),
    attributes: node.attributes,
    xmlns: node.xmlns.map(([name, value]) => [name, fixtureString(value)] as const),
    children: node.children.map(expectedNode),
  };
}

type Outcome = { readonly root: XmlReadElement } | { readonly refused: true };

function expectedOutcome(row: FixtureRow): Outcome {
  if (row.root !== undefined) return { root: expectedElement(row.root) };
  return { refused: true };
}

function actualOutcome(input: string): Outcome {
  try {
    return { root: readXml(input) };
  } catch (error) {
    if (error instanceof XmlReadError) return { refused: true };
    throw error;
  }
}

const DECLARATION = /^<\?xml version="1\.0" encoding="([^"]*)"\?>(.*)$/s;

/** The bodies that put non-ASCII where the gem re-reads through the declared encoding. */
const REENCODED_BODIES = new Set(["<\u00e9/>", "<a><!--\u00e9--></a>", "<a><?p \u00e9?></a>"]);

const UTF8_NAMES = new Set(FIXTURE.encodingTable.utf8.map((name) => name.toLowerCase()));
const INCOMPATIBLE_NAMES = new Set(
  FIXTURE.encodingTable.asciiIncompatible.map((name) => name.toLowerCase()),
);
const ROWS_BY_INPUT = new Map(FIXTURE.cases.map((row) => [row.input, row] as const));

/**
 * The one documented divergence (see `src/xml/reader.ts`): a declaration
 * naming an ASCII-compatible, non-UTF-8 encoding makes the gem re-read element
 * names, comments and PIs through it; the reader keeps UTF-8. For such a row,
 * returns the gem's row for the same body under `encoding="UTF-8"` — what the
 * reader must produce instead — or `undefined` when the row is not one.
 */
function divergenceBaseline(row: FixtureRow): FixtureRow | undefined {
  const match = DECLARATION.exec(row.input);
  if (match === null) return undefined;
  const [, name = "", body = ""] = match;
  const key = name.toLowerCase();
  if (UTF8_NAMES.has(key) || INCOMPATIBLE_NAMES.has(key) || !REENCODED_BODIES.has(body)) {
    return undefined;
  }
  const baseline = ROWS_BY_INPUT.get(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
  if (baseline === undefined) throw new Error(`no UTF-8 baseline row for ${row.id}`);
  const same = JSON.stringify(expectedOutcome(baseline)) === JSON.stringify(expectedOutcome(row));
  return same ? undefined : baseline;
}

const DIVERGENT = FIXTURE.cases.filter((row) => divergenceBaseline(row) !== undefined);

describe("the fixture set itself", () => {
  it("loads every row the payload declares, and a real mix of outcomes", () => {
    expect(FIXTURE.cases).toHaveLength(FIXTURE.caseCount);
    expect(FIXTURE.caseCount).toBeGreaterThan(1000);
    expect(FIXTURE.readCount).toBeGreaterThan(300);
    expect(FIXTURE.raisedCount).toBeGreaterThan(300);
    expect(FIXTURE.readCount + FIXTURE.raisedCount).toBe(FIXTURE.caseCount);
  });

  it("covers every probe group the generator defines", () => {
    const groups = new Set(FIXTURE.cases.map((row) => row.group));
    for (const group of [
      "basic",
      "mixed-content",
      "whitespace",
      "attributes",
      "entities",
      "cdata",
      "comments",
      "processing-instructions",
      "declaration",
      "doctype",
      "roots",
      "malformed",
      "characters",
      "bom",
      "newlines",
      "namespaces",
      "depth",
      "long-text",
      "encoding-names",
      "fuzz",
    ]) {
      expect(groups.has(group), group).toBe(true);
    }
  });
});

describe("readXml reproduces the gem's read", () => {
  const groups = [...new Set(FIXTURE.cases.map((row) => row.group))];
  it.each(groups)("%s", (group) => {
    const mismatches: string[] = [];
    for (const row of FIXTURE.cases) {
      if (row.group !== group || divergenceBaseline(row) !== undefined) continue;
      const expected = expectedOutcome(row);
      const actual = actualOutcome(row.input);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(
          `${row.id} ${JSON.stringify(row.input).slice(0, 80)}\n  expected ${JSON.stringify(expected).slice(0, 240)}\n  actual   ${JSON.stringify(actual).slice(0, 240)}`,
        );
      }
    }
    expect(mismatches, mismatches.join("\n")).toStrictEqual([]);
  });
});

describe("the documented encoding divergence", () => {
  it("exists in the fixtures, so its handling is exercised", () => {
    // Measured: 3 bodies x the non-UTF-8 ASCII-compatible names, minus the rows
    // where the gem happens to agree with UTF-8.
    expect(DIVERGENT.length).toBeGreaterThan(100);
  });

  it("reads every such row exactly as the gem reads the body under UTF-8", () => {
    const mismatches: string[] = [];
    for (const row of DIVERGENT) {
      const baseline = divergenceBaseline(row);
      if (baseline === undefined) continue;
      const actual = JSON.stringify(actualOutcome(row.input));
      if (actual !== JSON.stringify(expectedOutcome(baseline))) mismatches.push(row.id);
    }
    expect(mismatches).toStrictEqual([]);
  });
});

describe("the encoding tables match the oracle's Ruby", () => {
  it("lists exactly Ruby's ASCII-incompatible encoding names", () => {
    expect([...ASCII_INCOMPATIBLE_ENCODING_NAMES].sort()).toStrictEqual(
      FIXTURE.encodingTable.asciiIncompatible.map((name) => name.toLowerCase()).sort(),
    );
  });

  it("reads a declared UTF-8 alias as UTF-8", () => {
    expect(FIXTURE.encodingTable.utf8.length).toBeGreaterThan(0);
    for (const name of FIXTURE.encodingTable.utf8) {
      const root = readXml(`<?xml version="1.0" encoding="${name}"?><a>&#233;</a>`);
      expect(root.children, name).toStrictEqual([{ kind: "text", text: "é" }]);
    }
  });
});

describe("inputs with no Ruby counterpart", () => {
  it("refuses a lone surrogate, which has no UTF-8 form", () => {
    expect(() => readXml("<a>\ud800</a>")).toThrow(XmlReadError);
    expect(() => readXml("<a>\udc00</a>")).toThrow(XmlReadError);
  });

  it("accepts a well-formed surrogate pair", () => {
    expect(readXml("<a>\u{1f600}</a>").children).toStrictEqual([
      { kind: "text", text: "\u{1f600}" },
    ]);
  });
});
