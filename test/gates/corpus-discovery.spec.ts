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
 * - every case carrying `asciimath`, `latex` and `mathml` — each format's own
 *   `render-parity.spec.ts` asserts its target is present on every case, so a
 *   payload that stopped declaring one is caught by the renderer that needs
 *   it;
 * - a stray `corpus/asciimath/` copy returning to this repository —
 *   `test/core/corpus-yaml.spec.ts`, "keeps exactly the two payloads this
 *   repository still owns", which names the files rather than counting them.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  declaredSubmodulePaths,
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
 * Pulls a Ruby string constant out of a script. The match is asserted rather
 * than defaulted: a renamed constant must fail loudly here, not silently stop
 * being compared.
 */
function rubyConstant(script: string, name: string): string {
  const source = readFileSync(join(REPO_ROOT, "scripts", script), "utf8");
  const match = new RegExp(String.raw`^\s*${name}\s*=\s*"([^"]+)"`, "m").exec(source);
  expect(match, `${script} no longer defines ${name}`).not.toBeNull();
  return match?.[1] ?? "";
}

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
});
