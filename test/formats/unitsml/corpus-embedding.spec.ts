import { describe, expect, it } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toMathml } from "../../../src/formats/mathml/renderer";
import { loadPinnedCorpus } from "../../core/corpus-pin";

const corpus = loadPinnedCorpus();
const calls = corpus.calls.filter((entry) => entry.call.method === "unitsml");
describe("shared UnitsML XML regressions", () => {
  it("pins both micro-unit cases", () => {
    expect(calls).toHaveLength(2);
  });

  it.each(calls)("embeds UnitsML with the Ruby bytes: $id", (entry) => {
    expect(entry.inputFormat).toBe("asciimath");
    expect(entry.call.args).toEqual({ xml: true });
    expect([...entry.expected.keys()]).toEqual(["mathml"]);
    const output = toMathml(parseAsciimath(entry.input), { unitsml: { xml: true } });
    expect(output).toBe(entry.expected.get("mathml"));
    expect(output).not.toContain("&micro;");
  });
});
