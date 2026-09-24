/**
 * Proof for the compat-class declaration check that `scripts/gate-package.mjs`
 * runs against the built `dist/index.d.ts` and `dist/index.d.cts`
 * (TODO.plan/p2-output-formats/03-compat-class.md, "Declaration fixture
 * strategy").
 *
 * Three things are shown here, none of which needs a build:
 *
 *   1. The fixture is anchored to the declaration target, not to whatever the
 *      port happens to emit. Its surface is re-derived from the verbatim
 *      plurimath-js source-head declaration checked in beside it, and the
 *      only differences are the ones `sourceHeadDifferences` lists, each with
 *      a reason. An unlisted difference, or a listed one that no longer
 *      exists, fails.
 *   2. The fixture records both settled decisions exactly.
 *   3. The comparison is not vacuous and fails for each drift class it
 *      claims: a missing, added or renamed member, a renamed parameter, a
 *      flipped optional marker, a changed return or property type, a changed
 *      `Format` literal, a missing CJS declaration, and a missing default
 *      export. Each mutation is applied to a declaration text that first
 *      passes as the control.
 *
 * The same `checkDeclarationFiles` the gate calls is exercised, so what is
 * proven is the shipped check, not a restatement of it.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type ClassSurface,
  checkDeclarationFiles,
  type DeclaredMember,
  diffSurfaces,
  readDefaultClassSurface,
} from "../../scripts/lib/compat-declaration.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(REPO_ROOT, "test", "fixtures", "compat");

interface Fixture {
  target: { files: Record<string, { sha256: string }> };
  surface: ClassSurface;
  sourceHeadDifferences: { path: string; sourceHead: unknown; port: unknown; reason: string }[];
}

const fixture = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "plurimath-declaration.json"), "utf8"),
) as Fixture;

const readTarget = (name: string) => readFileSync(join(FIXTURE_DIR, name), "utf8");

const byName = (name: string): DeclaredMember => {
  const member = fixture.surface.members.find((m) => m.name === name);
  if (member === undefined) throw new Error(`fixture has no member ${name}`);
  return member;
};

/**
 * A declaration text shaped like tsdown's root output — an import list, the
 * alias, the class, and a named export block carrying `as default` — that
 * declares exactly the fixture's surface. It is the control every mutation
 * below starts from; `renders the control` proves it matches before any
 * mutation is trusted to have caused a failure.
 */
const CONTROL = `import { L as FormulaNode } from "./index-HASH.js";
//#region src/compat/index.d.ts
/** The input formats the published constructor accepts. */
type Format = "asciimath" | "latex" | "mathml" | "html" | "unicode" | "omml";
declare const FORMATS: readonly Format[];
declare class Plurimath {
  /** The parsed formula. */
  readonly data: FormulaNode;
  constructor(data: string, format: Format);
  toAsciimath(): string;
  toLatex(): string;
  /** \`intent\` defaults to false. */
  toMathml(intent?: boolean): string;
  toHtml(): string;
  toOmml(): string;
  toDisplay(lang: string): string;
  toUnicodemath(): string;
}
//#endregion
export { FORMATS, type Format, FormulaNode, Plurimath, Plurimath as default };
`;

const check = (esm: string | undefined, cjs: string | undefined = CONTROL) =>
  checkDeclarationFiles({ "dist/index.d.ts": esm, "dist/index.d.cts": cjs }, fixture.surface);

/** Replaces exactly one occurrence, so a mutation cannot silently miss. */
const mutate = (from: string, to: string) => {
  const at = CONTROL.indexOf(from);
  if (at === -1 || CONTROL.indexOf(from, at + 1) !== -1) {
    throw new Error(`mutation target must occur exactly once in the control: ${from}`);
  }
  return CONTROL.replace(from, to);
};

describe("compat declaration fixture", () => {
  it("carries the source-head declaration byte-for-byte as recorded", () => {
    for (const [name, { sha256 }] of Object.entries(fixture.target.files)) {
      const digest = createHash("sha256")
        .update(readFileSync(join(FIXTURE_DIR, name)))
        .digest();
      expect(digest.toString("hex"), name).toBe(sha256);
    }
    expect(Object.keys(fixture.target.files).length).toBe(2);
  });

  it("departs from source head exactly where sourceHeadDifferences says, and nowhere else", () => {
    const sourceHead = readDefaultClassSurface(
      {
        "index.d.ts": readTarget("source-head-ce297e2/index.d.ts.txt"),
        "plurimath-opal.d.ts": readTarget("source-head-ce297e2/plurimath-opal.d.ts.txt"),
      },
      "index.d.ts",
    );
    expect(sourceHead.members.length).toBeGreaterThan(0);
    const differences = diffSurfaces(fixture.surface, sourceHead);
    expect(differences).toEqual(
      fixture.sourceHeadDifferences.map(({ path, sourceHead, port }) => ({
        path,
        expected: port,
        actual: sourceHead,
      })),
    );
    for (const difference of fixture.sourceHeadDifferences) {
      expect(difference.reason.length, difference.path).toBeGreaterThan(0);
    }
  });

  it("records both settled decisions exactly", () => {
    const { members } = fixture.surface;
    expect(fixture.surface.className).toBe("Plurimath");

    const methods = members.filter((m) => m.kind === "method");
    expect(methods.map((m) => m.name)).toEqual([
      "toAsciimath",
      "toLatex",
      "toMathml",
      "toHtml",
      "toOmml",
      "toDisplay",
      "toUnicodemath",
    ]);
    for (const method of methods) expect(method.returnType, method.name ?? "").toBe("string");

    expect(byName("toMathml").parameters).toEqual([
      { name: "intent", optional: true, rest: false, type: "boolean" },
    ]);

    const constructors = members.filter((m) => m.kind === "constructor");
    expect(constructors).toHaveLength(1);
    expect(constructors[0]?.parameters?.[1]).toEqual({
      name: "format",
      optional: false,
      rest: false,
      type: {
        alias: "Format",
        literals: ["asciimath", "latex", "mathml", "html", "unicode", "omml"],
      },
    });

    expect(byName("data")).toEqual({
      kind: "property",
      name: "data",
      modifiers: ["readonly"],
      optional: false,
      type: "FormulaNode",
    });
    expect(members).toHaveLength(9);
  });
});

describe("compat declaration check", () => {
  it("renders the control: both files pass, with a nonzero member count equal to the fixture's", () => {
    expect(check(CONTROL)).toEqual([]);
    const surface = readDefaultClassSurface({ "entry.d.ts": CONTROL }, "entry.d.ts");
    expect(surface.members.length).toBeGreaterThan(0);
    expect(surface.members.length).toBe(fixture.surface.members.length);
  });

  it("refuses a fixture with no members instead of passing vacuously", () => {
    expect(
      checkDeclarationFiles(
        { "dist/index.d.ts": CONTROL },
        { className: "Plurimath", members: [] },
      ),
    ).toEqual(["the fixture declares no members; the comparison would be vacuous"]);
    expect(checkDeclarationFiles({}, fixture.surface)).toEqual(["no declaration files were given"]);
  });

  // Each row: the drift class, the mutation, and a fragment every resulting
  // failure list must contain. The fragment names the member and field, so a
  // row cannot pass on an unrelated failure.
  const drifts: [string, string, string][] = [
    [
      "a dropped member",
      mutate("  toUnicodemath(): string;\n", ""),
      'method toUnicodemath: expected {"kind":"method","name":"toUnicodemath"',
    ],
    [
      "an added member",
      mutate("  toUnicodemath(): string;\n", "  toUnicodemath(): string;\n  toSvg(): string;\n"),
      'method toSvg: expected null, got {"kind":"method","name":"toSvg"',
    ],
    [
      "a renamed member",
      mutate("toHtml(): string;", "toHTML(): string;"),
      "method toHTML: expected null",
    ],
    [
      "a renamed parameter",
      mutate("toDisplay(lang: string)", "toDisplay(language: string)"),
      'method toDisplay.parameters[0].name: expected "lang", got "language"',
    ],
    [
      "a flipped optional marker (optional made required)",
      mutate("toMathml(intent?: boolean)", "toMathml(intent: boolean)"),
      "method toMathml.parameters[0].optional: expected true, got false",
    ],
    [
      "a flipped optional marker (required made optional)",
      mutate("toDisplay(lang: string)", "toDisplay(lang?: string)"),
      "method toDisplay.parameters[0].optional: expected false, got true",
    ],
    [
      "a changed return type",
      mutate("toLatex(): string;", "toLatex(): string | undefined;"),
      'method toLatex.returnType: expected "string", got "string | undefined"',
    ],
    [
      "a changed property type",
      mutate("readonly data: FormulaNode;", "readonly data: unknown;"),
      'property data.type: expected "FormulaNode", got "unknown"',
    ],
    [
      "a dropped readonly modifier",
      mutate("readonly data: FormulaNode;", "data: FormulaNode;"),
      'property data.modifiers: expected ["readonly"], got []',
    ],
    [
      "the published mahtml spelling",
      mutate('"unicode"', '"mahtml"'),
      'constructor.parameters[1].type.literals: expected ["asciimath","latex","mathml","html","unicode","omml"], got ["asciimath","latex","mathml","html","mahtml","omml"]',
    ],
    [
      "a reordered member",
      mutate(
        "  toHtml(): string;\n  toOmml(): string;\n",
        "  toOmml(): string;\n  toHtml(): string;\n",
      ),
      "memberOrder:",
    ],
    [
      "no default export",
      mutate(", Plurimath as default", ""),
      "dist/index.d.ts: no value export named default",
    ],
    [
      "a type-only default export",
      mutate("Plurimath as default", "type Plurimath as default"),
      "dist/index.d.ts: no value export named default",
    ],
  ];

  it.each(drifts)("fails on %s", (_label, mutated, fragment) => {
    const failures = check(mutated);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join("\n")).toContain(fragment);
    // Only the damaged ESM file is blamed; the CJS control still passes.
    for (const failure of failures) expect(failure.startsWith("dist/index.d.ts")).toBe(true);
  });

  it("fails on a member-count change even where the names alone would hide it", () => {
    const failures = check(mutate("  toUnicodemath(): string;\n", ""));
    expect(failures).toContain("dist/index.d.ts: 8 class members, fixture has 9");
  });

  it("fails on a missing or empty CJS declaration", () => {
    // Called directly: `check`'s default parameter would replace `undefined`.
    for (const cjs of [undefined, ""]) {
      expect(
        checkDeclarationFiles(
          { "dist/index.d.ts": CONTROL, "dist/index.d.cts": cjs },
          fixture.surface,
        ),
      ).toEqual(["dist/index.d.cts: missing or empty"]);
    }
  });

  it("fails on CJS drift independently of ESM", () => {
    const failures = check(CONTROL, mutate("toMathml(intent?: boolean)", "toMathml()"));
    expect(failures).toContain(
      "dist/index.d.cts: method toMathml.parameters.length: expected 1, got 0",
    );
    for (const failure of failures) expect(failure.startsWith("dist/index.d.cts")).toBe(true);
  });
});
