import { describe, expect, it } from "vitest";
import { classifySupersessions, type RowResult, SUPERSEDED } from "./stage-replay";

function row(id: string): RowResult {
  return {
    id,
    payload: "historical.yaml",
    kind: "roundtrip",
    status: "differing",
    note: "bytes differ",
  };
}

describe("append-only stage revisions", () => {
  it("compares only the highest numeric revision even when revisions are unordered", () => {
    const results = classifySupersessions([
      row("case-r3"),
      row("case"),
      row("case-r2"),
      row("case-r10"),
    ]);
    expect(results.slice(0, 3).map(({ status, note }) => [status, note])).toStrictEqual([
      ["unsupported", SUPERSEDED],
      ["unsupported", SUPERSEDED],
      ["unsupported", SUPERSEDED],
    ]);
    expect(results[3]).toStrictEqual(row("case-r10"));
  });

  it("preserves model boundary suffixes when grouping stage revisions", () => {
    const results = classifySupersessions([
      row("case.model"),
      row("case-r2.model"),
      row("case-r3.model"),
      row("xml.model-roundtrip"),
      row("xml-r2.model-roundtrip"),
    ]);
    expect(results.map(({ status }) => status)).toStrictEqual([
      "unsupported",
      "unsupported",
      "differing",
      "unsupported",
      "differing",
    ]);
  });

  it("keeps unrelated rows and the latest row's failure visible", () => {
    const rows = [row("case-r2-text"), row("case-r2-text-r3"), row("other-r3"), row("other.model")];
    const results = classifySupersessions(rows);
    expect(results[0]?.status).toBe("unsupported");
    expect(results.slice(1)).toStrictEqual(rows.slice(1));
  });
});
