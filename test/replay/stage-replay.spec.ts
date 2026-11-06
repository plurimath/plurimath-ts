/**
 * Replays the pinned plurimath-testsuite stage generation of every language
 * this port reads or writes, as each Ruby stage gem replays its own pin in CI
 * (amath: asciimath 3, latexmath: latex 3, umath: unicode 4, mml: mathml 2,
 * omml: omml 2). The pins are `test/fixtures/testsuite-pins/<language>.yml`;
 * `stage-pin.ts` checks them the way the testsuite's `validate-stages.rb
 * --pin` does, and `stage-replay.ts` says what each row is compared against.
 *
 * Every row is accounted for in `stage-replay.record.json`: the counts, every
 * row the port cannot compare (`unsupportedRows`, grouped by reason, with
 * the count), and every row whose comparison fails (`differingRows`, with
 * what differed). A row that changes state in either direction fails here, so
 * a fix or a regression is a visible edit to that file. After a deliberate
 * change, rewrite it with
 *
 *   STAGE_REPLAY_WRITE=1 pnpm exec vitest run test/replay
 *
 * and review the diff. `STAGE_REPLAY_REPORT=<path>` also writes every row's
 * result there (CI uploads it).
 */

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PINNED_CORPUS_ROOT, REPO_ROOT } from "../core/corpus-pin";
import {
  loadStageGeneration,
  pinPath,
  readLedger,
  readPinFile,
  STAGE_LANGUAGES,
  type StageLanguage,
  submoduleHead,
} from "./stage-pin";
import { type LanguageRecord, type RowResult, replayGeneration, summarize } from "./stage-replay";

const RECORD_PATH = join(REPO_ROOT, "test", "replay", "stage-replay.record.json");
const WRITE = process.env.STAGE_REPLAY_WRITE === "1";
const REPORT = process.env.STAGE_REPLAY_REPORT;

const committed: Partial<Record<StageLanguage, LanguageRecord>> = existsSync(RECORD_PATH)
  ? JSON.parse(readFileSync(RECORD_PATH, "utf8"))
  : {};
const written: Partial<Record<StageLanguage, LanguageRecord>> = {};
const rows: Partial<Record<StageLanguage, readonly RowResult[]>> = {};

afterAll(() => {
  if (WRITE) writeFileSync(RECORD_PATH, `${JSON.stringify(written, null, 2)}\n`);
  if (REPORT !== undefined) {
    writeFileSync(REPORT, `${JSON.stringify({ records: written, rows }, null, 2)}\n`);
  }
});

describe("the stage pins", () => {
  it("pin one file per language, every one at the submodule's commit", () => {
    const head = submoduleHead();
    for (const language of STAGE_LANGUAGES) {
      const pin = readPinFile(pinPath(language));
      expect(pin.language, language).toBe(language);
      expect(pin.commit, language).toBe(head);
    }
  });

  it("cover every language the testsuite keeps a ledger for", () => {
    const ledgers = readdirSync(join(PINNED_CORPUS_ROOT, "generations"))
      .filter((name) => name.endsWith(".yaml"))
      .map((name) => name.replace(/\.yaml$/, ""))
      .sort();
    expect(ledgers).toStrictEqual([...STAGE_LANGUAGES].sort());
    for (const language of STAGE_LANGUAGES) {
      expect(readLedger(language).length, language).toBeGreaterThan(0);
    }
  });

  it("records every language and nothing else", () => {
    if (WRITE) return;
    expect(Object.keys(committed).sort()).toStrictEqual([...STAGE_LANGUAGES].sort());
  });
});

describe.each(STAGE_LANGUAGES.map((language) => [language] as const))(
  "the %s stage generation",
  (language) => {
    const generation = loadStageGeneration(pinPath(language));

    it(`pins the newest ${language} generation (${generation.pin.generation})`, () => {
      expect(generation.latest).toBe(true);
    });

    it(`replays all ${generation.rows} rows as stage-replay.record.json records`, () => {
      const results = replayGeneration(generation);
      expect(results).toHaveLength(generation.rows);
      expect(new Set(results.map((row) => row.id)).size).toBe(generation.rows);
      const record = summarize(generation, results);
      written[language] = record;
      rows[language] = results;
      expect(record.equal + record.differing + record.unsupported).toBe(record.rows);
      if (WRITE) return;
      expect(record).toStrictEqual(committed[language]);
    });
  },
);

/**
 * The checks the gems' CI makes with a tampered pin (`corpus.yml`, "A wrong
 * commit, digest or generation fails the validator"), made against this
 * port's reader; CI makes them against `validate-stages.rb` too.
 */
describe("a pin that does not match the checkout is refused", () => {
  const scratch = mkdtempSync(join(tmpdir(), "stage-pin-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const tampered = (key: string, value: string): string => {
    const source = readFileSync(pinPath("latex"), "utf8");
    const path = join(scratch, `${key}-${value.length}-${value.slice(-2)}.yml`);
    const pattern = new RegExp(`^${key}: .*$`, "m");
    expect(pattern.test(source)).toBe(true);
    writeFileSync(path, source.replace(pattern, `${key}: ${value}`));
    return path;
  };

  it("refuses a wrong commit", () => {
    const path = tampered("commit", `'${"0".repeat(40)}'`);
    expect(() => loadStageGeneration(path)).toThrow(/\/commit: pins 0{40}, but the checkout is at/);
  });

  it("refuses a wrong digest", () => {
    const path = tampered("snapshot_digest", `sha256:${"0".repeat(64)}`);
    expect(() => loadStageGeneration(path)).toThrow(/\/snapshot_digest: pins sha256:0{64}/);
  });

  it("refuses an older generation with the newest digest", () => {
    const path = tampered("generation", "2");
    expect(() => loadStageGeneration(path)).toThrow(/\/snapshot_digest: pins .* ledger records/);
  });

  it("refuses a generation the ledger does not have", () => {
    const path = tampered("generation", "99");
    expect(() => loadStageGeneration(path)).toThrow(/\/generation: latex has no generation 99/);
  });

  it("refuses a generation whose files no longer hash to the pinned digest", () => {
    const root = join(scratch, "testsuite");
    cpSync(join(PINNED_CORPUS_ROOT, "generations"), join(root, "generations"), { recursive: true });
    const generation = join("stages", "html", "generations", "000001");
    cpSync(join(PINNED_CORPUS_ROOT, generation), join(root, generation), { recursive: true });
    const payload = join(root, generation, "payloads", "rejections.yaml");
    writeFileSync(payload, `${readFileSync(payload, "utf8")}\n`);
    const head = readPinFile(pinPath("html")).commit;
    expect(() => loadStageGeneration(pinPath("html"), { root, head })).toThrow(
      /the generation's files hash to sha256:[0-9a-f]{64}, not the pinned/,
    );
  });
});
