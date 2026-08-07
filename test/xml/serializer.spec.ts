/**
 * Byte parity for `src/xml`'s serializer against the measured Ox contract.
 *
 * Every expectation is an oracle-printed byte string from
 * `./ox-contract.expected.json` (plurimath 0.11.6 at `00c52783…`, Ox
 * 2.14.28); `./ox-contract.ts` holds the builders and the probe each entry
 * came from. The first describe block is the emptiness guard: a fixture list
 * or JSON group that loads short — or empty — fails before any byte is
 * compared, because `it.each([])` would otherwise report a wall of green
 * while checking nothing.
 */

import { describe, expect, it } from "vitest";
import { dump, dumpNodes, type XmlElement } from "../../src/xml/index";
import {
  DUMP_FIXTURE_COUNT,
  DUMP_FIXTURES,
  DUMP_NODES_FIXTURE_COUNT,
  DUMP_NODES_FIXTURES,
  EXPECTED_PROVENANCE,
  expectedBytes,
  expectedNames,
  type OxContractFixture,
} from "./ox-contract";

type Serializer = (root: XmlElement, options?: Parameters<typeof dump>[1]) => string;

/** `options` absent means the fixture pins the no-arguments call itself. */
function serialize(fixture: OxContractFixture, serializer: Serializer): string {
  const root = fixture.build();
  return fixture.options === undefined ? serializer(root) : serializer(root, fixture.options);
}

describe("the fixture set itself", () => {
  it("loads the pinned number of fixtures — zero or fewer is a failure", () => {
    expect(DUMP_FIXTURES.length).toBeGreaterThan(0);
    expect(DUMP_NODES_FIXTURES.length).toBeGreaterThan(0);
    expect(DUMP_FIXTURES).toHaveLength(DUMP_FIXTURE_COUNT);
    expect(DUMP_NODES_FIXTURES).toHaveLength(DUMP_NODES_FIXTURE_COUNT);
  });

  it("was generated from the pinned oracle, not some other checkout", () => {
    expect(EXPECTED_PROVENANCE.oracleCommit).toBe("00c52783877b38f6b8e6e109f1803f96bb34fc62");
    expect(EXPECTED_PROVENANCE.oracleVersion).toBe("0.11.6");
    expect(EXPECTED_PROVENANCE.oxVersion).toBe("2.14.28");
    expect(EXPECTED_PROVENANCE.xmlEngine).toBe("Plurimath::XmlEngine::OxEngine");
  });

  it("matches the JSON name-for-name in both directions", () => {
    const dumpNames = DUMP_FIXTURES.map((fixture) => fixture.name);
    const dumpNodesNames = DUMP_NODES_FIXTURES.map((fixture) => fixture.name);
    // No duplicate builders hiding a missing one behind the same name.
    expect(new Set(dumpNames).size).toBe(dumpNames.length);
    expect(new Set(dumpNodesNames).size).toBe(dumpNodesNames.length);
    // Every JSON entry has a builder, every builder a JSON entry.
    expect([...dumpNames].sort()).toEqual([...expectedNames("dump")].sort());
    expect([...dumpNodesNames].sort()).toEqual([...expectedNames("dumpNodes")].sort());
  });

  it("carries a probe and expected bytes for every fixture", () => {
    for (const fixture of DUMP_FIXTURES) {
      expect(fixture.probe).not.toBe("");
      expect(expectedBytes("dump", fixture.name)).not.toBe("");
    }
    for (const fixture of DUMP_NODES_FIXTURES) {
      expect(fixture.probe).not.toBe("");
      expect(expectedBytes("dumpNodes", fixture.name)).not.toBe("");
    }
  });
});

describe("dump — the raw Ox.dump contract", () => {
  it.each(DUMP_FIXTURES)("reproduces $name byte for byte", (fixture) => {
    expect(serialize(fixture, dump)).toBe(expectedBytes("dump", fixture.name));
  });

  it("is deterministic — a rebuilt tree dumps the same bytes", () => {
    for (const fixture of DUMP_FIXTURES) {
      expect(serialize(fixture, dump)).toBe(serialize(fixture, dump));
    }
  });
});

describe("dumpNodes — the gem's dump_nodes pipeline (Ox.dump + REPLACABLES)", () => {
  it.each(DUMP_NODES_FIXTURES)("reproduces $name byte for byte", (fixture) => {
    expect(serialize(fixture, dumpNodes)).toBe(expectedBytes("dumpNodes", fixture.name));
  });

  it("differs from dump exactly by the two rewrites on a shared tree", () => {
    // Same tree, both entry points: `dumpNodes` = `dump` minus the leading
    // newline, with Ox's `&amp;` escapes rewritten to `&` (core.rb:6-9).
    // Measured pair: raw `"\n<mtext>a&amp;b&lt;c&gt;d\"e'f</mtext>\n"` vs
    // pipeline `"<mtext>a&b&lt;c&gt;d\"e'f</mtext>\n"` (oracle 00c52783).
    const fixture = DUMP_NODES_FIXTURES.find((candidate) => candidate.name === "specials-text");
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    const raw = serialize(fixture, dump);
    const piped = serialize(fixture, dumpNodes);
    expect(raw).toBe("\n<mtext>a&amp;b&lt;c&gt;d\"e'f</mtext>\n");
    expect(piped).toBe(expectedBytes("dumpNodes", "specials-text"));
    expect(piped).toBe(raw.replace(/&amp;/g, "&").replace(/^\n/, ""));
  });
});
