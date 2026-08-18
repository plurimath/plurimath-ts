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

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  declaredSubmodulePaths,
  loadPinnedCorpus,
  PIN_RELATIVE_PATH,
  PINNED_CORPUS_ROOT,
  pinnedSubmoduleCommit,
  REPO_ROOT,
  SUBMODULE_FIX,
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
 * A real superproject whose submodule checkout has been rewound one commit,
 * so the index pins one commit and the working tree is on another.
 */
function driftedSuperproject(at = "sub"): {
  root: string;
  origin: string;
  pinned: string;
  rewound: string;
} {
  const base = mkdtempSync(join(tmpdir(), "plurimath-drift-"));
  scratches.push(base);
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  // A contributor with mandatory commit signing or a global `core.hooksPath`
  // would otherwise get a red suite for a reason that has nothing to do with
  // the product: `commit.gpgSign=true` makes these commits exit 128.
  const commit = (cwd: string, message: string): string =>
    git(cwd, "commit", "--quiet", "--no-gpg-sign", "--no-verify", "-m", message);

  const sub = join(base, "sub-origin");
  execFileSync("git", ["init", "--quiet", sub]);
  git(sub, "config", "user.email", "gate@example.invalid");
  git(sub, "config", "user.name", "gate");
  writeFileSync(join(sub, "f"), "one\n");
  git(sub, "add", "f");
  commit(sub, "one");
  const rewound = git(sub, "rev-parse", "HEAD");
  writeFileSync(join(sub, "f"), "two\n");
  git(sub, "add", "f");
  commit(sub, "two");
  const pinned = git(sub, "rev-parse", "HEAD");

  const root = join(base, "super");
  execFileSync("git", ["init", "--quiet", root]);
  git(root, "config", "user.email", "gate@example.invalid");
  git(root, "config", "user.name", "gate");
  // Local-path submodules need this since git 2.38's CVE-2022-39253 fix.
  git(root, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", sub, at);
  commit(root, "add");
  git(join(root, at), "checkout", "--quiet", rewound);

  return { root, origin: sub, pinned, rewound };
}

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

/**
 * `.gitmodules` maps a name to a path and stops there. Everything above would
 * be satisfied by an ordinary directory holding a copied corpus, with git
 * considering the submodule uninitialised — and by a checkout sitting on the
 * wrong commit, whenever the payload bytes happen to match (a submodule commit
 * that touched only its README would do it).
 *
 * The corpus is reproducible only because it comes from a known commit, so
 * that commit is what gets asserted.
 */
describe("git's own record of the pin", () => {
  const pin = pinnedSubmoduleCommit();

  it("is a gitlink in the superproject index, not a directory of files", () => {
    expect(pin.mode).toBe("160000");
  });

  it("has the checkout on the commit the index pins", () => {
    expect(pin.headCommit).toBe(pin.indexCommit);
  });

  it("names a commit, not an empty string that would compare equal to itself", () => {
    expect(pin.indexCommit).toMatch(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/);
  });

  it("fails when the path is not in the index at all", () => {
    const root = mkdtempSync(join(tmpdir(), "plurimath-discovery-"));
    scratches.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    expect(() => pinnedSubmoduleCommit(root)).toThrow(SUBMODULE_FIX);
  });

  it("refuses a directory of tracked files standing in for a gitlink", () => {
    // `ls-files` is recursive, so asking about a directory reports what is
    // under it. Taking the first record would accept a descendant.
    const { root } = driftedSuperproject();
    expect(() => pinnedSubmoduleCommit(root, ".")).toThrow("index entries");
  });

  it("refuses a descendant gitlink answering for the path that was asked about", () => {
    // The case the count guard alone cannot catch: `outer` holds exactly one
    // index entry, `outer/inner`, so there is a single record and it parses
    // cleanly as a gitlink. Only comparing the pathname rejects it.
    const { root } = driftedSuperproject("outer/inner");
    expect(() => pinnedSubmoduleCommit(root, "outer")).toThrow("answered about");
    // …and the same fixture is accepted when asked about the real path, so the
    // rejection above is about the pathname and not about the fixture.
    expect(pinnedSubmoduleCommit(root, "outer/inner").mode).toBe("160000");
  });

  it("refuses a bare repository, which answers rev-parse HEAD perfectly well", () => {
    // The bare repo has to sit at the gitlink path, or this passes on the
    // index check and proves nothing about the work-tree check.
    const { root, origin } = driftedSuperproject();
    const nested = join(root, "sub");
    rmSync(nested, { recursive: true, force: true });
    execFileSync("git", ["clone", "--quiet", "--bare", origin, nested]);

    // Still a gitlink in the index, and HEAD still resolves — the two things
    // the earlier version of this check was satisfied by.
    expect(
      execFileSync("git", ["-C", root, "ls-files", "--stage", "--", "sub"], { encoding: "utf8" }),
    ).toContain("160000");
    expect(
      execFileSync("git", ["-C", nested, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    ).toMatch(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/);

    expect(() => pinnedSubmoduleCommit(root, "sub")).toThrow("not a git working tree");
  });

  it("says git is missing rather than blaming the repository", () => {
    // `spawnSync` reports an unrunnable binary through `error` and leaves
    // `status` as null. A plain `status !== 0` check therefore announces "it is
    // not a git working tree" when git simply is not installed — sending the
    // reader to fix a repository that is fine. `declaredSubmodulePaths` already
    // handled this; `pinnedSubmoduleCommit` did not.
    const { root } = driftedSuperproject();
    const emptyPath = mkdtempSync(join(tmpdir(), "plurimath-nogit-"));
    scratches.push(emptyPath);
    const previous = process.env.PATH;
    try {
      process.env.PATH = emptyPath;
      expect(() => pinnedSubmoduleCommit(root, "sub")).toThrow("could not run git");
    } finally {
      // `process.env.X = undefined` stores the literal string "undefined" in
      // Node, not an absent variable — verified. Restoring that way when PATH
      // started unset would leave every later test resolving subprocesses
      // against a nonexistent directory.
      if (previous === undefined) delete process.env.PATH;
      else process.env.PATH = previous;
    }
    // …and with git back, the same call succeeds, so the failure above was the
    // missing binary and not the fixture.
    expect(pinnedSubmoduleCommit(root, "sub").mode).toBe("160000");
  });

  it("reports a checkout left on the wrong commit as the drift it is", () => {
    // The assertion above is only worth what it catches, and a corpus whose
    // bytes still match its provenance is exactly the case that hides drift.
    // So: a real superproject, its submodule rewound one commit.
    const { root, pinned, rewound } = driftedSuperproject();
    const pin = pinnedSubmoduleCommit(root, "sub");
    expect(pin.mode).toBe("160000");
    expect(pin.indexCommit).toBe(pinned);
    expect(pin.headCommit).toBe(rewound);
    expect(pin.headCommit).not.toBe(pin.indexCommit);
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
});

/**
 * Now that `declaredSubmodulePaths` asks git instead of parsing, most syntax
 * questions are git's behaviour, not this repository's — and a test that pins
 * someone else's behaviour costs maintenance forever while catching nothing
 * here. An earlier draft of this file pinned fifteen forms; comment handling,
 * CRLF, BOM, quoted whitespace, escape decoding, inline keys and line
 * continuations were all deleted for that reason. Two of them had been real
 * bugs in the hand-written parser, and deleting them is safe precisely because
 * the parser they broke no longer exists.
 *
 * What remains is what this repository actually owns: the `--get-regexp`
 * pattern, the `--null` framing, and the decision to read git's exit 1 as "no
 * matches" while any other status is a refusal.
 */
describe("what this repository owns in the git query", () => {
  it("keeps a newline inside a path as one path, not two", () => {
    // The framing choice. git prints the value with a literal newline, so
    // splitting output on newlines yields ["…testsuite", "EVIL"] — and the
    // first element is exactly the path the gate looks for, so the gate would
    // confirm a submodule git puts somewhere else. `--null` is what prevents it.
    const root = gitmodulesRoot(`[submodule "x"]\n\tpath = "${PIN_RELATIVE_PATH}\\nEVIL"\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([`${PIN_RELATIVE_PATH}\nEVIL`]);
    expect(declaredSubmodulePaths(root)).not.toContain(PIN_RELATIVE_PATH);
  });

  it("refuses a file git itself refuses", () => {
    // The exit-code decision: an unknown escape and an unterminated quote each
    // make git exit 128, and a `.gitmodules` git will not read is a broken
    // submodule whatever this gate thinks of it.
    for (const value of [String.raw`a\qb`, `"${PIN_RELATIVE_PATH}`]) {
      const root = gitmodulesRoot(`[submodule "x"]\n\tpath = ${value}\n`);
      expect(() => declaredSubmodulePaths(root)).toThrow("git could not read it");
    }
  });

  it("matches the key git reports, whatever case the file used", () => {
    // git normalises the key to `submodule.<name>.path`; the pattern has to
    // match what git prints, not what the file spelled.
    const root = gitmodulesRoot(`[SUBMODULE "pin"]\n\tPATH = ${PIN_RELATIVE_PATH}\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("matches a subsection containing a dot or a slash", () => {
    // `^submodule\..+\.path$` has to survive a subsection with its own dots,
    // which is the pattern's least obvious failure mode.
    for (const name of ["a/b", "a.b"]) {
      const root = gitmodulesRoot(`[submodule "${name}"]\n\tpath = ${PIN_RELATIVE_PATH}\n`);
      expect(declaredSubmodulePaths(root), name).toStrictEqual([PIN_RELATIVE_PATH]);
    }
  });

  it("matches the legacy [submodule.x] spelling, which git also reports", () => {
    const root = gitmodulesRoot(`[submodule.pin]\n\tpath = ${PIN_RELATIVE_PATH}\n`);
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("does not match include.path, which is not a submodule", () => {
    const root = gitmodulesRoot(
      `[include]\n\tpath = /etc/x\n[submodule "pin"]\n\tpath = ${PIN_RELATIVE_PATH}\n`,
    );
    expect(declaredSubmodulePaths(root)).toStrictEqual([PIN_RELATIVE_PATH]);
  });

  it("does not match [submodule] with no subsection, which declares no submodule", () => {
    // git reads this as `submodule.path`, so `^submodule\..+\.path$` must miss
    // it. Otherwise the gate passes against a file naming no submodule at all.
    const root = gitmodulesRoot(`[submodule]\n\tpath = ${PIN_RELATIVE_PATH}\n`);
    expect(() => declaredSubmodulePaths(root)).toThrow("declares no submodule paths");
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
