import { describe, expect, it } from "vitest";
import { loadPinnedCorpus } from "../core/corpus-pin";
import { compareCurrentFacade } from "./stage-replay";

const corpus = loadPinnedCorpus();
const entry = corpus.cases.find((row) => row.id === "frac-simple");
if (entry === undefined) throw new Error("missing pinned frac-simple source row");
const fraction = entry;

describe("the current facade writer profile", () => {
  it("uses current pinned writer observations while retaining historical source models", () => {
    const historical = { ...fraction, expected: new Map([["mathml", "historical writer bytes"]]) };
    expect(compareCurrentFacade(historical)).toEqual({ status: "equal" });
  });

  it("refuses missing profiles and changes to the historical input or model", () => {
    for (const changed of [
      { ...fraction, id: "missing-source-row" },
      { ...fraction, input: "different source" },
      { ...fraction, model: null },
    ])
      expect(compareCurrentFacade(changed).status).toBe("differing");
  });

  it("refuses a changed formatter call instead of accepting current output", () => {
    const call = corpus.calls[0];
    if (call === undefined) throw new Error("missing pinned formatter source row");
    expect(compareCurrentFacade({ ...call, call: { ...call.call, args: {} } })).toEqual({
      status: "differing",
      note: "current facade profile changes the historical call",
    });
  });
});
