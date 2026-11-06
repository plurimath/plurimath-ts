/**
 * Parity for `src/xml`'s reader against the gem's own XML read.
 *
 * Every row of `./reader-fixtures.json` is one input and what the pinned
 * oracle's stack (Ox under Moxml under Lutaml, the `OxAdapter` that
 * `Mml.parse` and `Omml.parse` use) did with it: the tree its models receive,
 * or a refusal. `scripts/generate-xml-reader-fixtures.rb` measured them; the
 * sidecar manifest pins how. Every row must match.
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

type FixtureString =
  | string
  | { readonly invalidUtf8: string }
  | { readonly bytes: string; readonly encoding: string };

interface FixtureElement {
  readonly element: FixtureString | null;
  readonly prefix?: FixtureString;
  readonly namespace?: FixtureString;
  readonly attributes: readonly (readonly [FixtureString, FixtureString])[];
  readonly xmlns: readonly (readonly [FixtureString, FixtureString])[];
  readonly children: readonly FixtureNode[];
}

type FixtureNode =
  | FixtureElement
  | { readonly text: FixtureString }
  | { readonly cdata: FixtureString }
  | { readonly comment: FixtureString }
  | { readonly pi: FixtureString; readonly text: FixtureString };

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
  if ("invalidUtf8" in value) {
    // biome-ignore lint/style/useNamingConvention: the DOM option is spelled `ignoreBOM`.
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      Buffer.from(value.invalidUtf8, "hex"),
    );
  }
  // A string in an encoding Ruby cannot transcode to UTF-8: only ever in the
  // encoding divergence, and never equal to anything the reader returns.
  return `\u0000${value.encoding}:${value.bytes}`;
}

function expectedNode(node: FixtureNode): XmlReadNode {
  if ("element" in node) return expectedElement(node);
  if ("pi" in node)
    return { kind: "pi", target: fixtureString(node.pi), text: fixtureString(node.text) };
  if ("cdata" in node) return { kind: "cdata", text: fixtureString(node.cdata) };
  if ("comment" in node) return { kind: "comment", text: fixtureString(node.comment) };
  return { kind: "text", text: fixtureString(node.text) };
}

function expectedElement(node: FixtureElement): XmlReadElement {
  return {
    kind: "element",
    name: node.element === null ? null : fixtureString(node.element),
    prefix: node.prefix === undefined ? null : fixtureString(node.prefix),
    namespace: node.namespace === undefined ? null : fixtureString(node.namespace),
    attributes: node.attributes.map(
      ([name, value]) => [fixtureString(name), fixtureString(value)] as const,
    ),
    xmlns: node.xmlns.map(([name, value]) => [fixtureString(name), fixtureString(value)] as const),
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

const ROWS_BY_INPUT = new Map(FIXTURE.cases.map((row) => [row.input, row] as const));

/** For a row that declares an encoding, the gem's row for the same body under `encoding="UTF-8"`. */
function utf8Baseline(row: FixtureRow): FixtureRow | undefined {
  const match = DECLARATION.exec(row.input);
  if (match === null) return undefined;
  return ROWS_BY_INPUT.get(`<?xml version="1.0" encoding="UTF-8"?>${match[2] ?? ""}`);
}

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
      "corpus-mathml",
      "corpus-omml",
    ]) {
      expect(groups.has(group), group).toBe(true);
    }
  });
});

describe("readXml reproduces the gem's read", () => {
  // Moxml::Adapter::Ox#inner_text joins direct String children before
  // Entity.restore_entities runs; Lutaml reads it while wrapping each element.
  it("restores joined direct text without joining descendants", () => {
    expect(() => readXml("<a>&alpha;<b/>&#xD800;</a>")).toThrow(XmlReadError);
    expect(() => readXml("<a>&#xD800;<b/>&alpha;</a>")).toThrow(XmlReadError);
    const nested = readXml("<a>&alpha;<b>&#xD800;</b></a>");
    expect(nested.children).toStrictEqual([
      { kind: "text", text: "&alpha;" },
      {
        kind: "element",
        name: "b",
        prefix: null,
        namespace: null,
        attributes: [],
        xmlns: [],
        children: [{ kind: "text", text: "?" }],
      },
    ]);
  });
  const groups = [...new Set(FIXTURE.cases.map((row) => row.group))];
  it.each(groups)("%s", (group) => {
    const mismatches: string[] = [];
    for (const row of FIXTURE.cases) {
      if (row.group !== group) continue;
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

describe("a declared encoding", () => {
  it("never changes the gem's read: every such row matches its UTF-8 row", () => {
    // Measured by the fixtures, not asserted by hand: Moxml rewrites a
    // declaration's (first) encoding to UTF-8 before Ox reads it, so the
    // declared name, known to Ruby or not, has no effect on the result.
    const declared = FIXTURE.cases.filter((row) => utf8Baseline(row) !== undefined);
    expect(declared.length).toBeGreaterThan(1000);
    const differing = declared.filter((row) => {
      const baseline = utf8Baseline(row) as FixtureRow;
      return JSON.stringify(expectedOutcome(row)) !== JSON.stringify(expectedOutcome(baseline));
    });
    expect(differing.map((row) => row.id)).toStrictEqual([]);
  });

  it("lists exactly Ruby's ASCII-incompatible encoding names", () => {
    // Still consulted for a second `encoding` attribute, which Moxml leaves.
    expect([...ASCII_INCOMPATIBLE_ENCODING_NAMES].sort()).toStrictEqual(
      FIXTURE.encodingTable.asciiIncompatible.map((name) => name.toLowerCase()).sort(),
    );
  });

  it("reads every encoding name Ruby knows as UTF-8", () => {
    const names = [...FIXTURE.encodingTable.utf8, ...FIXTURE.encodingTable.asciiIncompatible];
    expect(FIXTURE.encodingTable.utf8.length).toBeGreaterThan(0);
    expect(FIXTURE.encodingTable.asciiIncompatible.length).toBeGreaterThan(0);
    for (const name of names) {
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
