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
 *      `Format` literal, a class-level type parameter, `abstract`, `extends`
 *      or `implements`, an added, removed or reordered overload, a missing
 *      CJS declaration, a missing default export, and an unvalidated
 *      TypeScript version. Each mutation is applied to a declaration text
 *      that first passes as the control; one set of them starts from the
 *      committed source-head file rather than from the fixture.
 *
 * JSDoc is not compared (see the extractor's header): these proofs cover the
 * type surface only.
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
  assertValidatedTypescript,
  type ClassSurface,
  checkDeclarationFiles,
  type DeclaredMember,
  diffSurfaces,
  readDefaultClassSurface,
  VALIDATED_TYPESCRIPT_VERSION,
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
      "an added member modifier",
      mutate("toLatex(): string;", "static toLatex(): string;"),
      'method toLatex.modifiers: expected [], got ["static"]',
    ],
    [
      "an added class type parameter",
      mutate("declare class Plurimath {", "declare class Plurimath<T = unknown> {"),
      'typeParameters: expected [], got ["T = unknown"]',
    ],
    [
      "an added abstract modifier",
      mutate("declare class Plurimath {", "declare abstract class Plurimath {"),
      'modifiers: expected [], got ["abstract"]',
    ],
    [
      "an added extends clause",
      mutate("declare class Plurimath {", "declare class Plurimath extends Error {"),
      'heritage: expected [], got [{"token":"extends","types":["Error"]}]',
    ],
    [
      "an added implements clause",
      mutate("declare class Plurimath {", "declare class Plurimath implements Iterable<string> {"),
      'heritage: expected [], got [{"token":"implements","types":["Iterable<string>"]}]',
    ],
    [
      "an added overload of a single-signature method",
      mutate(
        "  toDisplay(lang: string): string;\n",
        "  toDisplay(lang: string): string;\n  toDisplay(lang: string, strict: boolean): string;\n",
      ),
      "method toDisplay#2: expected null",
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

  it("reports a second overload of a single-signature method as one addition, not a removal", () => {
    const mutated = mutate(
      "  toDisplay(lang: string): string;\n",
      "  toDisplay(lang: string): string;\n  toDisplay(lang: string, strict: boolean): string;\n",
    );
    const surface = readDefaultClassSurface({ "entry.d.ts": mutated }, "entry.d.ts");
    const differences = diffSurfaces(fixture.surface, surface);
    // The unchanged signature keys as `toDisplay#1` on BOTH sides, so it
    // matches; the only member difference is the added `#2`. `memberOrder`
    // follows from the longer key list and names no removal.
    expect(differences.map((d) => d.path)).toEqual(["method toDisplay#2", "memberOrder"]);
    expect(differences[0]?.expected).toBeNull();
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

  it("refuses any TypeScript other than the validated version, naming both", () => {
    expect(() => assertValidatedTypescript(VALIDATED_TYPESCRIPT_VERSION)).not.toThrow();
    expect(VALIDATED_TYPESCRIPT_VERSION).toBe("7.0.2");
    for (const bumped of ["7.0.3", "7.1.0", "8.0.0"]) {
      expect(() => assertValidatedTypescript(bumped)).toThrow(
        `installed typescript is ${bumped}, but this extractor was validated on 7.0.2 only`,
      );
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

/**
 * Overloads are not in the compat surface, but a surface with them must still
 * pass its own comparison, and adding, removing or reordering a signature must
 * be a failure that names it. The expected surface here is extracted from
 * OVERLOADED itself.
 */
describe("compat declaration check: overloads", () => {
  const Overloaded = `declare class P {
  f(a: string): string;
  f(a: number): string;
  g(): void;
}
export { P as default };
`;
  const expected = readDefaultClassSurface({ "entry.d.ts": Overloaded }, "entry.d.ts");
  const checkOverloads = (text: string) =>
    checkDeclarationFiles({ "overloaded.d.ts": text }, expected);

  it("records each signature separately and passes against itself", () => {
    expect(expected.members.map((m) => m.name)).toEqual(["f", "f", "g"]);
    expect(checkOverloads(Overloaded)).toEqual([]);
  });

  it.each([
    [
      "an added overload",
      Overloaded.replace("  g(): void;", "  f(a: boolean): string;\n  g(): void;"),
      "method f#3: expected null",
    ],
    [
      "a removed overload",
      Overloaded.replace("  f(a: number): string;\n", ""),
      'method f#2: expected {"kind":"method","name":"f","modifiers":[],"optional":false,"parameters":[{"name":"a","optional":false,"rest":false,"type":"number"}]',
    ],
    [
      "reordered overloads",
      Overloaded.replace(
        "  f(a: string): string;\n  f(a: number): string;",
        "  f(a: number): string;\n  f(a: string): string;",
      ),
      'method f#1.parameters[0].type: expected "string", got "number"',
    ],
  ])("fails on %s", (_label, mutated, fragment) => {
    expect(mutated).not.toBe(Overloaded);
    expect(checkOverloads(mutated).join("\n")).toContain(fragment);
  });
});

/**
 * Proofs that do not start from the fixture: the control is the committed
 * source-head declaration itself (`index.d.ts.txt`, sha256-pinned above), and
 * the expected surface is read from that same file. Each mutation of the real
 * tsc output must fail naming what it changed.
 */
describe("compat declaration check: source-head control", () => {
  const SourceHead = readTarget("source-head-ce297e2/index.d.ts.txt");
  const expected = readDefaultClassSurface({ "entry.d.ts": SourceHead }, "entry.d.ts");
  const checkSourceHead = (text: string) =>
    checkDeclarationFiles({ "source-head index.d.ts": text }, expected);
  const edit = (from: string, to: string) => {
    const at = SourceHead.indexOf(from);
    if (at === -1 || SourceHead.indexOf(from, at + 1) !== -1) {
      throw new Error(`mutation target must occur exactly once in source head: ${from}`);
    }
    return SourceHead.replace(from, to);
  };

  it("passes unmutated, with the seven source-head methods", () => {
    expect(checkSourceHead(SourceHead)).toEqual([]);
    expect(expected.members.filter((m) => m.kind === "method")).toHaveLength(7);
  });

  it.each([
    [
      "a dropped member",
      edit("    toUnicodemath(): string;\n", ""),
      "method toUnicodemath: expected",
    ],
    [
      "a renamed parameter",
      edit("toDisplay(lang: string)", "toDisplay(language: string)"),
      'method toDisplay.parameters[0].name: expected "lang", got "language"',
    ],
    [
      "a flipped optional marker",
      edit("toMathml(intent?: boolean)", "toMathml(intent: boolean)"),
      "method toMathml.parameters[0].optional: expected true, got false",
    ],
    [
      "a changed return type",
      edit("toOmml(): string;", "toOmml(): unknown;"),
      'method toOmml.returnType: expected "string", got "unknown"',
    ],
    [
      "an added extends clause",
      edit("export default class Plurimath {", "export default class Plurimath extends Object {"),
      'heritage: expected [], got [{"token":"extends","types":["Object"]}]',
    ],
  ])("fails on %s", (_label, mutated, fragment) => {
    expect(checkSourceHead(mutated).join("\n")).toContain(fragment);
  });
});
