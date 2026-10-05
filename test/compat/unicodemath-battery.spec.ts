/**
 * The UnicodeMath registration battery for `src/compat/index.ts`'s `PARSERS`
 * map.
 *
 * `unicode` is withheld from the compat constructor's `PARSERS` map: a format
 * listed there should answer what the gem answers, or say up front that it
 * cannot, and that has to be MEASURED against input nobody generated — fifty
 * ordinary UnicodeMath snippets, hand-typed here, none of them corpus output
 * and none of them drawn from `test/formats/unicodemath/model-fixtures.json`'s
 * round-trip, rule-coverage or slice-boundary lists. This file is that
 * measurement, not a decision: registering `unicode` is a judgement for
 * whoever reads its result, not something this spec does on its own.
 *
 * `index.ts`'s own comment cites a "50-input battery" as the registration
 * gate, but that battery was only ever prose — measured once, in an earlier
 * session, and never checked in as a test. This file's shape follows
 * `test/compat/html-battery.spec.ts`, the repository's real fixture-plus-spec
 * convention for exactly this situation: a generator
 * (`scripts/battery-unicodemath-fixtures.rb`) queries the oracle for every
 * input and records what it did, and this spec reads that recorded JSON and
 * compares it against `parseUnicodemath`.
 *
 * Oracle: /home/apple/ruby_gems/plurimath-oracle at the commit
 * `unicodemath-battery-fixtures.json`'s own `oracleCommit` field records —
 * read here rather than repeated, so this comment cannot go stale the way a
 * hand-copied commit hash would.
 *
 * Every row's outcome is measured, not assumed passing: running this file
 * against the current port is what step 5 of the task that produced it calls
 * for, and the counts below come from that run rather than from what a
 * "complete" UnicodeMath port would be expected to do.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../src/core/index";
import { parseUnicodemath } from "../../src/formats/unicodemath/index";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

function sha256OfFile(relativeToRoot: string): string {
  return createHash("sha256")
    .update(readFileSync(join(REPO_ROOT, relativeToRoot)))
    .digest("hex");
}

/**
 * The oracle commit this repository is actually pinned to, read from the
 * census manifest's `oracle.commit` rather than duplicated as a literal —
 * so this file can't go stale the way a hand-copied hash would. A plain
 * targeted regex, not a YAML parser: this repo has no `yaml` dependency,
 * and the manifest's `oracle:` block has a fixed, generator-written shape.
 */
function pinnedOracleCommit(): string {
  const manifest = readFileSync(join(REPO_ROOT, "corpus/census.manifest.yaml"), "utf8");
  const oracleBlock = manifest.slice(manifest.indexOf("\noracle:\n"));
  const match = oracleBlock.match(/\n {2}commit: ([0-9a-f]{40})\n/);
  if (!match) throw new Error("corpus/census.manifest.yaml: could not find oracle.commit");
  return match[1] as string;
}

interface FixtureCase {
  readonly id: string;
  readonly group: string;
  readonly input: string;
  readonly model?: unknown;
  readonly raises?: string;
}

interface Fixtures {
  readonly schema: string;
  readonly oracleCommit: string;
  readonly oracleClean: boolean;
  readonly generatorSha256: string;
  readonly caseCount: number;
  readonly parsedCount: number;
  readonly raisedCount: number;
  readonly casesSha256: string;
  readonly cases: readonly FixtureCase[];
}

const fixtures = JSON.parse(
  readFileSync(join(HERE, "unicodemath-battery-fixtures.json"), "utf8"),
) as Fixtures;

const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const raised = fixtures.cases.filter((entry) => entry.raises !== undefined);

describe("the UnicodeMath battery fixture set", () => {
  it("is the schema this suite reads", () => {
    expect(fixtures.schema).toBe("plurimath-compat/unicodemath-battery/1");
  });

  it("was generated against the oracle commit this repo is actually pinned to", () => {
    // Without this, a hand-edited fixture JSON (or one generated against a
    // stale oracle checkout) would still pass every other assertion below —
    // the measurement is only as trustworthy as this provenance check.
    expect(fixtures.oracleCommit).toBe(pinnedOracleCommit());
  });

  it("was produced by the generator script currently committed here", () => {
    expect(fixtures.generatorSha256).toBe(sha256OfFile("scripts/battery-unicodemath-fixtures.rb"));
  });

  it("was generated from a clean oracle checkout", () => {
    // `oracleCommit` alone binds the HEAD a run claims, not the tree it
    // actually read — an uncommitted edit in the oracle checkout leaves HEAD
    // untouched, so a dirty checkout at the pinned commit would otherwise be
    // indistinguishable from a clean one.
    expect(fixtures.oracleClean).toBe(true);
  });

  it("has cases matching the payload hash recorded at generation time", () => {
    // Binds the recorded ROWS themselves, not just their count and the
    // commit/generator that produced them — a hand-edited case (same id,
    // group and input, a tampered `model` or `raises`) would otherwise pass
    // every other provenance check here.
    expect(createHash("sha256").update(JSON.stringify(fixtures.cases)).digest("hex")).toBe(
      fixtures.casesSha256,
    );
  });

  it("has fifty hand-typed cases", () => {
    expect(fixtures.caseCount).toBe(50);
    expect(fixtures.cases.length).toBe(50);
  });

  it("has the counts its header records", () => {
    expect(fixtures.cases.length).toBe(fixtures.caseCount);
    expect(parsed.length).toBe(fixtures.parsedCount);
    expect(raised.length).toBe(fixtures.raisedCount);
    expect(parsed.length + raised.length).toBe(fixtures.caseCount);
  });

  it("draws every input from none of the managed corpus/rule-coverage/boundary fixture files", () => {
    // Distinct from `test/formats/unicodemath/model-fixtures.json`'s own id
    // prefix ("unicodemath-<hash>"), so a row accidentally reused from there
    // is caught here.
    for (const entry of fixtures.cases) {
      expect(entry.id.startsWith("unicodemath-battery-")).toBe(true);
    }
  });
});

/**
 * A case here is either an oracle PASS (the port's
 * `normalize(parseUnicodemath(...))` deep-equals the model the gem built) or
 * a documented GAP (measured here to currently diverge, and asserted to
 * diverge — so a fix that closes it makes THIS assertion fail, which is the
 * signal to move the id out of the list rather than the list silently going
 * stale).
 *
 * Measured now: the port matches all 49 inputs the oracle parses and refuses
 * the 1 the oracle refuses, so the set is empty. Two inputs used to be gaps,
 * and neither was a missing rule:
 *
 *   - `"a·b·c"` (`unicodemath-battery-6d2c0882dcdd`) and `"f'(x)"`
 *     (`unicodemath-battery-f88c04694b60`): the gem's own transform leaves a
 *     hash no rule matches (`{atom:, atoms: {...}}` and `{accents:, expr:}`),
 *     and `Kernel#Array` folds it into `[key, value]` pairs, so the gem's
 *     model for each is a formula holding pairs — see the recorded fixtures.
 *     The port refused them only because `GEM_UNMATCHED_SIGNATURES` did not
 *     yet list those shapes; it reproduces the gem's pairs now.
 *
 * The mechanism stays so that a future battery input the port cannot yet parse
 * is recorded rather than deleted.
 */
const KNOWN_PORT_GAPS: ReadonlySet<string> = new Set<string>();

describe("the parsed model", () => {
  it("finds a port-side gap on exactly the documented ids, no more and no fewer", () => {
    // Without this, a stray or missing id in `KNOWN_PORT_GAPS` — one for a
    // case that doesn't exist, or one that omits an actual divergence —
    // would pass every `it.each` row below unnoticed: the affected row would
    // just take whichever branch the (wrong) set membership sends it to.
    const actualGaps = parsed
      .filter((entry) => {
        try {
          parseUnicodemath(entry.input);
          return false;
        } catch {
          return true;
        }
      })
      .map((entry) => entry.id)
      .sort();
    expect(actualGaps).toStrictEqual([...KNOWN_PORT_GAPS].sort());
  });

  it.each(parsed.map((entry) => [entry.group, entry.input, entry] as const))(
    "%s %j: deep-equals the gem's",
    (_group, _input, entry) => {
      if (KNOWN_PORT_GAPS.has(entry.id)) {
        // Measured as a divergent REFUSAL, not a divergent model: the port
        // throws here where the oracle returned a model. The message itself
        // is asserted to keep citing the missing rule family — not a bare
        // parse failure — so the up-front "this is a known port gap, not a
        // malformed input" signal registering `unicode` would otherwise cost
        // stays covered. Compare `src/formats/unicodemath/parser.ts`'s
        // transform-miss message, which names `{...}` fields, against the
        // fixed prefix asserted here.
        expect(() => parseUnicodemath(entry.input)).toThrow(
          /unicodemath transform: no rule matched .*not in this slice/,
        );
        return;
      }
      expect(normalize(parseUnicodemath(entry.input))).toStrictEqual(entry.model);
    },
  );
});

describe("the inputs the gem refuses", () => {
  it.each(raised.map((entry) => [entry.group, entry.input, entry] as const))(
    "%s %j: is refused here too",
    (_group, _input, entry) => {
      expect(entry.raises).toBe("Plurimath::Math::ParseError");
      if (KNOWN_PORT_GAPS.has(entry.id)) {
        expect(() => parseUnicodemath(entry.input)).not.toThrow();
        return;
      }
      expect(() => parseUnicodemath(entry.input)).toThrow(ParseError);
    },
  );
});
