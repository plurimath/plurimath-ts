/**
 * Corpus discovery — that everything which names the pin names the same pin.
 *
 * The corpus lives in a git submodule, and four separate places hardcode where
 * it is: `.gitmodules` (which git obeys), `PIN_RELATIVE_PATH` in
 * `test/core/corpus-pin.ts`, `SUBMODULE_RELATIVE_PATH` in
 * `scripts/gate-oracle.rb`, and `PIN_RELATIVE_PATH` in
 * `scripts/generate-corpus.rb`. Until this spec, nothing compared them —
 * `corpus-pin.ts` carried a comment claiming its constant came from
 * `.gitmodules` and that claim was never checked.
 *
 * The failure it guards is quiet and self-inflicted. Move the submodule in
 * `.gitmodules` and git puts the checkout at the new path, while three
 * constants still point at the old one. The reader then reports the pin as
 * uninitialised and advises `git submodule update --init --recursive` — which
 * dutifully populates the *new* path and leaves the reported error unchanged.
 * The advice is wrong, and it is wrong in a way that reads like a broken
 * checkout rather than a broken constant.
 *
 * **Deliberately narrow.** The rest of TODO 7's discovery list is already
 * enforced, and duplicating it here would add tests without adding coverage:
 *
 * - an uninitialised or absent submodule, and a payload the provenance lists
 *   but disk lacks — `test/core/corpus-pin.spec.ts`, "an uninitialised
 *   submodule fails loudly";
 * - nonzero payloads and cases, asserted as counts, and the 13 group names
 *   pinned by name — same file, "the pin as shipped";
 * - every payload's bytes and sha256 against the provenance, plus a payload
 *   nothing vouches for — same file, "a payload that does not match its
 *   provenance fails";
 * - a case missing a target its own payload declares — `corpus-pin.spec.ts`,
 *   "fails on a case missing one of the declared targets";
 * - a stray `corpus/asciimath/` copy returning to this repository —
 *   `test/core/corpus-yaml.spec.ts`, "keeps exactly the two payloads this
 *   repository still owns", which names the files rather than counting them.
 *
 * What is **not** covered elsewhere, and so is covered below: that a payload
 * declares the three target formats at all. The reader only enforces that each
 * case carries whatever its payload declared, which is self-consistency, not a
 * requirement — `TINY_PAYLOAD` in `corpus-pin.spec.ts` declares two targets and
 * loads happily. The three `render-parity.spec.ts` suites look like they close
 * this, but each iterates `readCorpusCases()`, which drops the excluded cases,
 * so a group whose cases were all withheld could stop declaring `mathml` and
 * every suite would stay green while the corpus quietly stopped covering a
 * renderer.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  declaredSubmodulePaths,
  loadPinnedCorpus,
  PIN_RELATIVE_PATH,
  PINNED_CORPUS_ROOT,
  REPO_ROOT,
} from "../core/corpus-pin";

const scratches: string[] = [];

/** A directory holding nothing but the `.gitmodules` under test. */
function gitmodulesRoot(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "plurimath-discovery-"));
  scratches.push(root);
  writeFileSync(join(root, ".gitmodules"), contents);
  return root;
}

afterAll(() => {
  for (const root of scratches) rmSync(root, { recursive: true, force: true });
});

/**
 * Pulls a Ruby string constant out of a script. Two things are asserted rather
 * than defaulted, because both would otherwise turn this into a check that
 * passes while comparing nothing: that the constant is still defined at all
 * (a rename must fail loudly, not stop being compared), and that it is
 * assigned exactly once — Ruby permits reassignment with only a warning, so
 * reading the first match would report agreement with a value the script no
 * longer uses.
 */
function rubyConstant(script: string, name: string): string {
  const source = readFileSync(join(REPO_ROOT, "scripts", script), "utf8");
  // Every assignment, whatever the right-hand side. Counting only quoted
  // literals would miss `NAME = ENV.fetch("…")` on a later line and happily
  // report agreement with a value the script has since overwritten.
  const assignments = [...source.matchAll(new RegExp(String.raw`^\s*${name}\s*=\s*(.+)$`, "gm"))];
  expect(assignments.length, `${script} should assign ${name} exactly once`).toBe(1);
  const literal = /^"([^"]*)"(?:\.freeze)?\s*$/.exec(assignments[0]?.[1] ?? "");
  expect(literal, `${script}: ${name} is not a plain double-quoted literal`).not.toBeNull();
  return literal?.[1] ?? "";
}

/** The formats P1 renders, and so the targets every group must declare. */
const REQUIRED_TARGETS = ["asciimath", "latex", "mathml"];

describe("the submodule path every reader hardcodes", () => {
  it("is the one .gitmodules declares", () => {
    const declared = declaredSubmodulePaths();
    expect(declared).toContain(PIN_RELATIVE_PATH);
  });

  it("is the only submodule this repository has", () => {
    // If a second submodule ever lands, the assertions above stop being a
    // statement about *the* pin, and this is where that gets noticed.
    expect(declaredSubmodulePaths()).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("is what the Ruby entry points hardcode too", () => {
    expect(rubyConstant("gate-oracle.rb", "SUBMODULE_RELATIVE_PATH")).toBe(PIN_RELATIVE_PATH);
    expect(rubyConstant("generate-corpus.rb", "PIN_RELATIVE_PATH")).toBe(PIN_RELATIVE_PATH);
  });

  it("points at an initialised checkout, not an empty directory", () => {
    expect(existsSync(join(PINNED_CORPUS_ROOT, "corpus", "provenance.yaml"))).toBe(true);
  });
});

describe("the check reads .gitmodules rather than echoing the constant", () => {
  it("reports a moved submodule as moved", () => {
    const root = gitmodulesRoot(
      '[submodule "submodules/plurimath-testsuite"]\n\tpath = vendor/testsuite\n\turl = https://example.invalid/x.git\n',
    );
    expect(declaredSubmodulePaths(root)).toStrictEqual(["vendor/testsuite"]);
    expect(declaredSubmodulePaths(root)).not.toContain(PIN_RELATIVE_PATH);
  });

  it("finds every path when there is more than one", () => {
    const root = gitmodulesRoot(
      '[submodule "a"]\n\tpath = one\n\turl = u\n[submodule "b"]\n\tpath = two\n\turl = u\n',
    );
    expect(declaredSubmodulePaths(root)).toStrictEqual(["one", "two"]);
  });

  it("refuses a .gitmodules that declares no paths", () => {
    const root = gitmodulesRoot('[submodule "a"]\n\turl = https://example.invalid/x.git\n');
    expect(() => declaredSubmodulePaths(root)).toThrow("declares no submodule paths");
  });

  it("refuses a missing .gitmodules instead of reporting none", () => {
    const root = mkdtempSync(join(tmpdir(), "plurimath-discovery-"));
    scratches.push(root);
    expect(() => declaredSubmodulePaths(root)).toThrow("does not exist");
  });

  it("ignores a path outside a submodule section", () => {
    // Without section tracking this file passes every assertion above while no
    // submodule declares the pin at all — the check would be checking nothing.
    const root = gitmodulesRoot(
      `[other]\n\tpath = ${PIN_RELATIVE_PATH}\n[submodule "pin"]\n\turl = https://example.invalid/x.git\n`,
    );
    expect(() => declaredSubmodulePaths(root)).toThrow("declares no submodule paths");
  });

  it("reads a quoted path as the path, not as the quotes", () => {
    const root = gitmodulesRoot(`[submodule "pin"]\n\tpath = "${PIN_RELATIVE_PATH}"\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });
});

/**
 * `declaredSubmodulePaths` asks git rather than parsing, so these no longer
 * test a parser. What can still be wrong is the *query* — the `--get-regexp`
 * pattern, and the decision to treat git's exit 1 as "no matches" while any
 * other status is a refusal. These fixtures pin that.
 *
 * The three marked below are the forms that broke the hand-written parser this
 * function replaced. They are kept because they are the reason it was replaced:
 * each one made git and the parser disagree about where the submodule is.
 */
describe("git-config forms the check must read as git does", () => {
  it("follows a line continuation, which git joins and a parser missed", () => {
    // git reads `…testsuiteEVIL`; the old parser read `…testsuite` and passed.
    const root = gitmodulesRoot(`[submodule "x"]\n\tpath = ${PIN_RELATIVE_PATH}\\\nEVIL\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([`${PIN_RELATIVE_PATH}EVIL`]);
  });

  it("keeps whitespace inside quotes", () => {
    const root = gitmodulesRoot(`[submodule "x"]\n\tpath = "${PIN_RELATIVE_PATH} "   \n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([`${PIN_RELATIVE_PATH} `]);
  });

  it("refuses a file git itself refuses", () => {
    // An unknown escape and an unterminated quote each make git exit 128. The
    // old parser normalised both into the expected path.
    for (const value of [String.raw`a\qb`, `"${PIN_RELATIVE_PATH}`]) {
      const root = gitmodulesRoot(`[submodule "x"]\n\tpath = ${value}\n`);
      expect(() => declaredSubmodulePaths(root)).toThrow("git could not read it");
    }
  });
});

describe("git-config forms that must not break the check", () => {
  it("ignores a trailing comment rather than reading it as part of the path", () => {
    const root = gitmodulesRoot(`[submodule "pin"]\n\tpath = ${PIN_RELATIVE_PATH} # the corpus\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("ignores a semicolon comment too", () => {
    const root = gitmodulesRoot(`[submodule "pin"]\n\tpath = ${PIN_RELATIVE_PATH} ; note\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("matches the section and key case-insensitively, as git does", () => {
    const root = gitmodulesRoot(`[SUBMODULE "pin"]\n\tPATH = ${PIN_RELATIVE_PATH}\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("reads a key sharing the section header's line", () => {
    const root = gitmodulesRoot(`[submodule "pin"] path = ${PIN_RELATIVE_PATH}\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("reads a subsection name containing a slash", () => {
    const root = gitmodulesRoot(`[submodule "a/b"]\n\tpath = ${PIN_RELATIVE_PATH}\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("still ignores a commented-out path", () => {
    const root = gitmodulesRoot(
      `[submodule "pin"]\n\t# path = ${PIN_RELATIVE_PATH}\n\turl = https://example.invalid/x.git\n`,
    );
    expect(() => declaredSubmodulePaths(root)).toThrow("declares no submodule paths");
  });

  it("reads CRLF line endings", () => {
    const root = gitmodulesRoot(`[submodule "pin"]\r\n\tpath = ${PIN_RELATIVE_PATH}\r\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("keeps a # or ; that is inside quotes", () => {
    // Stripping comments with a plain regex truncates these, and the value git
    // resolves is not the value the gate would compare.
    expect(declaredSubmodulePaths(gitmodulesRoot('[submodule "x"]\n\tpath = "foo#bar"\n'))) //
      .toStrictEqual(["foo#bar"]);
    expect(declaredSubmodulePaths(gitmodulesRoot('[submodule "x"]\n\tpath = "foo;bar"\n'))) //
      .toStrictEqual(["foo;bar"]);
  });

  it("decodes quoted whitespace and escapes the way git does", () => {
    expect(declaredSubmodulePaths(gitmodulesRoot('[submodule "x"]\n\tpath = "a b"\n'))) //
      .toStrictEqual(["a b"]);
    expect(declaredSubmodulePaths(gitmodulesRoot('[submodule "x"]\n\tpath = a\\tb\n'))) //
      .toStrictEqual(["a\tb"]);
    expect(declaredSubmodulePaths(gitmodulesRoot('[submodule "x"]\n\tpath = foo" "bar\n'))) //
      .toStrictEqual(["foo bar"]);
    expect(declaredSubmodulePaths(gitmodulesRoot('[submodule "x"]\n\tpath = "tail"   \n'))) //
      .toStrictEqual(["tail"]);
  });

  it("refuses [submodule] with no subsection, because git declares no submodule there", () => {
    // git reads this as `submodule.path`, not `submodule.<name>.path`. Treating
    // it as a declaration would let the gate pass against a file that names no
    // submodule at all.
    const root = gitmodulesRoot(`[submodule]\n\tpath = ${PIN_RELATIVE_PATH}\n`);
    expect(() => declaredSubmodulePaths(root)).toThrow("declares no submodule paths");
  });

  it("reads a file that starts with a UTF-8 BOM", () => {
    const root = gitmodulesRoot(`﻿[submodule "pin"]\n\tpath = ${PIN_RELATIVE_PATH}\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("reads the legacy [submodule.x] section syntax", () => {
    const root = gitmodulesRoot(`[submodule.pin]\n\tpath = ${PIN_RELATIVE_PATH}\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("ignores an include.path directive", () => {
    const root = gitmodulesRoot(
      `[include]\n\tpath = /etc/x\n[submodule "pin"]\n\tpath = ${PIN_RELATIVE_PATH}\n`,
    );
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });
});

/** Just enough of a payload to state the rule against. */
type Declaring = { readonly path: string; readonly targets: readonly string[] };

function assertRequiredTargets(payloads: readonly Declaring[]): void {
  expect(payloads.length, "no payloads to check, so this proves nothing").toBeGreaterThan(0);
  for (const payload of payloads) {
    expect([...payload.targets].sort(), payload.path).toStrictEqual([...REQUIRED_TARGETS].sort());
  }
}

describe("every pinned group declares the formats P1 renders", () => {
  it("holds for the pin as shipped", () => {
    assertRequiredTargets(loadPinnedCorpus().payloads);
  });

  it("rejects a group that stopped declaring one", () => {
    // Self-consistent and therefore invisible to the reader: drop `mathml`
    // from a payload and from its cases, and `loadPinnedCorpus` has no
    // objection. This is the assertion that does object.
    expect(() =>
      assertRequiredTargets([{ path: "asciimath/frac.yaml", targets: ["asciimath", "latex"] }]),
    ).toThrow();
  });

  it("rejects an empty payload list rather than passing vacuously", () => {
    expect(() => assertRequiredTargets([])).toThrow();
  });
});
