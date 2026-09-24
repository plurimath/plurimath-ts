/**
 * The compat class's declaration surface, read from `.d.ts` text with the
 * installed TypeScript compiler (TODO.plan/p2-output-formats/03-compat-class.md,
 * "Declaration fixture strategy").
 *
 * The package gate (`scripts/gate-package.mjs`) feeds it the BUILT
 * `dist/index.d.ts` and `dist/index.d.cts` and compares the result with the
 * checked-in fixture `test/fixtures/compat/plurimath-declaration.json`.
 * `test/gates/compat-declaration.spec.ts` proves the comparison fails for each
 * drift class it claims to catch.
 *
 * Parsing rather than text-matching the files avoids false failures from
 * tsdown's surrounding layout (the import list, the chunk hash, the `export {
 * ... }` block), and every class member is extracted, so an added member fails
 * as surely as a removed one. An assignability check would not do: structural
 * typing accepts extra members, and parameter names take no part in it.
 *
 * What is compared is the TYPE surface, and only that: the class's name, its
 * own modifiers (other than the `export`/`default`/`declare` of how it is
 * exported), its type parameters and heritage clauses, and every member's
 * kind, name, modifiers, optional marker, type parameters, parameters (name,
 * optional, rest, type) and return or property type, with each overload
 * signature recorded separately and in order. JSDoc and other comments are
 * ignored by design, so the fixture pins no documentation; a type written
 * differently but meaning the same (`Array<string>` for `string[]`) is a
 * difference, because types are compared as their source text.
 *
 * TypeScript 7 has no in-process parser; `typescript/unstable/sync` drives the
 * bundled native compiler over a pipe. The texts are served to it from a
 * virtual filesystem, so nothing is written to disk and nothing is resolved:
 * `noResolve` keeps the parse to the files handed in.
 */

import { createRequire } from "node:module";
import { SyntaxKind } from "typescript/unstable/ast";
import { skipTrivia } from "typescript/unstable/ast/scanner";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API } from "typescript/unstable/sync";

/**
 * The only TypeScript this extractor has been validated against. The
 * `unstable/*` API it drives carries no compatibility promise, and
 * package.json allows `^7.0.0`, so a bump must fail here loudly and force a
 * re-check (re-run test/gates/compat-declaration.spec.ts and confirm every
 * negative proof still fails for the reason it names) rather than let a
 * changed AST shape quietly weaken the gate.
 */
export const VALIDATED_TYPESCRIPT_VERSION = "7.0.2";

/** Throws unless `version` is the validated TypeScript version. */
export function assertValidatedTypescript(version) {
  if (version !== VALIDATED_TYPESCRIPT_VERSION) {
    throw new Error(
      `compat-declaration: installed typescript is ${version}, but this extractor was validated ` +
        `on ${VALIDATED_TYPESCRIPT_VERSION} only (its typescript/unstable/* API has no stability ` +
        `promise). Re-validate scripts/lib/compat-declaration.mjs against ${version}, then update ` +
        "VALIDATED_TYPESCRIPT_VERSION.",
    );
  }
}

const INSTALLED_TYPESCRIPT_VERSION = createRequire(import.meta.url)(
  "typescript/package.json",
).version;

const VIRTUAL_ROOT = "/compat-declaration";

/**
 * Parses each text in `files` (name -> declaration text) and hands every
 * resulting source file to `visit`, inside one compiler session.
 *
 * The whole set is one program, so `visit` can resolve a type alias declared
 * in a sibling file (the source-head `Format` lives in `plurimath-opal.d.ts`,
 * the class that uses it in `index.d.ts`). The AST is read before the session
 * closes; `visit` must return plain data, not nodes.
 */
export function withParsedDeclarations(files, visit) {
  assertValidatedTypescript(INSTALLED_TYPESCRIPT_VERSION);
  const names = Object.keys(files);
  if (names.length === 0) throw new Error("withParsedDeclarations: no files given");
  const virtual = { [`${VIRTUAL_ROOT}/tsconfig.json`]: "" };
  for (const name of names) {
    if (name.includes("/")) throw new Error(`withParsedDeclarations: ${name} must be a bare name`);
    virtual[`${VIRTUAL_ROOT}/${name}`] = files[name];
  }
  virtual[`${VIRTUAL_ROOT}/tsconfig.json`] = JSON.stringify({
    compilerOptions: { noLib: true, noResolve: true, types: [] },
    files: names,
  });

  const api = new API({ cwd: VIRTUAL_ROOT, fs: createVirtualFileSystem(virtual) });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [`${VIRTUAL_ROOT}/tsconfig.json`] });
    const project = snapshot.getProjects()[0];
    if (project === undefined) throw new Error("withParsedDeclarations: no project was loaded");
    const sourceFiles = {};
    for (const name of names) {
      const sourceFile = project.program.getSourceFile(`${VIRTUAL_ROOT}/${name}`);
      if (sourceFile === undefined)
        throw new Error(`withParsedDeclarations: ${name} did not parse`);
      sourceFiles[name] = sourceFile;
    }
    return visit(sourceFiles);
  } finally {
    api.close();
  }
}

/** A node's own source text, leading trivia skipped and whitespace collapsed. */
const nodeText = (node, sourceFile) =>
  sourceFile.text
    .slice(skipTrivia(sourceFile.text, node.pos), node.end)
    .replace(/\s+/g, " ")
    .trim();

const hasModifier = (node, kind) => (node.modifiers ?? []).some((m) => m.kind === kind);

/**
 * A modifier as written (`readonly`, `abstract`). Read from the source text,
 * not from `SyntaxKind[kind]`: that reverse lookup is ambiguous where the enum
 * aliases a value, and `abstract` came back as `FirstContextualKeyword`.
 */
const modifierName = (modifier, sourceFile) => nodeText(modifier, sourceFile);

/**
 * Every type alias in the file set, by the dotted name a reference would use:
 * `Format` at top level, `Opal.Plurimath.Math.Format` inside nested
 * namespaces.
 */
function collectAliases(sourceFiles) {
  const aliases = new Map();
  const walk = (statements, prefix, sourceFile) => {
    for (const statement of statements) {
      if (statement.kind === SyntaxKind.TypeAliasDeclaration) {
        aliases.set(`${prefix}${statement.name.text}`, { node: statement, sourceFile });
      } else if (statement.kind === SyntaxKind.ModuleDeclaration) {
        // `namespace A.B {}` nests ModuleDeclarations as bodies; a block body
        // holds statements.
        let module = statement;
        let path = `${prefix}${module.name.text}.`;
        while (module.body?.kind === SyntaxKind.ModuleDeclaration) {
          module = module.body;
          path = `${path}${module.name.text}.`;
        }
        if (module.body?.kind === SyntaxKind.ModuleBlock) {
          walk(module.body.statements, path, sourceFile);
        }
      }
    }
  };
  for (const sourceFile of Object.values(sourceFiles)) walk(sourceFile.statements, "", sourceFile);
  return aliases;
}

/**
 * A type as the fixture records it: its text, or, when it names an alias of
 * the file set that is a union of string literals, the alias name and the
 * literals in declaration order. Resolving the alias is what lets the fixture
 * pin the constructor's `Format` spelling (`unicode`, not `mahtml`) rather
 * than only the word `Format`.
 */
function describeType(typeNode, sourceFile, aliases) {
  if (typeNode === undefined) return null;
  const text = nodeText(typeNode, sourceFile);
  if (typeNode.kind !== SyntaxKind.TypeReference || typeNode.typeArguments !== undefined) {
    return text;
  }
  const alias = aliases.get(text);
  if (alias === undefined) return text;
  const aliased = alias.node.type;
  const parts = aliased.kind === SyntaxKind.UnionType ? aliased.types : [aliased];
  const literals = [];
  for (const part of parts) {
    if (part.kind !== SyntaxKind.LiteralType || part.literal.kind !== SyntaxKind.StringLiteral) {
      return text;
    }
    literals.push(part.literal.text);
  }
  return { alias: text, literals };
}

function describeParameters(member, sourceFile, aliases) {
  return member.parameters.map((parameter) => ({
    name:
      parameter.name.kind === SyntaxKind.Identifier
        ? parameter.name.text
        : nodeText(parameter.name, sourceFile),
    optional: parameter.questionToken !== undefined,
    rest: parameter.dotDotDotToken !== undefined,
    type: describeType(parameter.type, sourceFile, aliases),
  }));
}

const MEMBER_KINDS = new Map([
  [SyntaxKind.PropertyDeclaration, "property"],
  [SyntaxKind.Constructor, "constructor"],
  [SyntaxKind.MethodDeclaration, "method"],
  [SyntaxKind.GetAccessor, "getter"],
  [SyntaxKind.SetAccessor, "setter"],
  [SyntaxKind.IndexSignature, "index"],
]);

function describeMember(member, sourceFile, aliases) {
  const kind = MEMBER_KINDS.get(member.kind) ?? SyntaxKind[member.kind];
  const described = { kind };
  if (kind !== "constructor" && kind !== "index") {
    described.name = member.name === undefined ? null : nodeText(member.name, sourceFile);
  }
  described.modifiers = (member.modifiers ?? []).map((modifier) =>
    modifierName(modifier, sourceFile),
  );
  if (kind === "property") {
    described.optional = member.questionToken !== undefined;
    described.type = describeType(member.type, sourceFile, aliases);
  } else if (member.parameters !== undefined) {
    if (kind === "method") described.optional = member.questionToken !== undefined;
    if (member.typeParameters !== undefined) {
      described.typeParameters = member.typeParameters.map((p) => nodeText(p, sourceFile));
    }
    described.parameters = describeParameters(member, sourceFile, aliases);
    if (kind !== "constructor") {
      described.returnType = describeType(member.type, sourceFile, aliases);
    }
  }
  return described;
}

/**
 * How the class is exported (`export default class`, or tsdown's `declare
 * class` plus an `export { ... as default }` block) is not part of its
 * surface; the default export itself is checked by `defaultExportName`.
 */
const EXPORT_FORM_MODIFIERS = new Set([
  SyntaxKind.ExportKeyword,
  SyntaxKind.DefaultKeyword,
  SyntaxKind.DeclareKeyword,
]);

/** The local name the file exports as `default`, or undefined. */
function defaultExportName(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (
      statement.kind === SyntaxKind.ClassDeclaration &&
      hasModifier(statement, SyntaxKind.ExportKeyword) &&
      hasModifier(statement, SyntaxKind.DefaultKeyword)
    ) {
      return statement.name?.text;
    }
    if (
      statement.kind === SyntaxKind.ExportDeclaration &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause?.kind === SyntaxKind.NamedExports
    ) {
      for (const element of statement.exportClause.elements) {
        if (element.name.text === "default" && !element.isTypeOnly) {
          return element.propertyName?.text;
        }
      }
    }
  }
  return undefined;
}

/**
 * The public surface of the class `entry` exports as `default`:
 * `{ className, modifiers, typeParameters, heritage, members }`, members in
 * declaration order, one entry per overload signature.
 *
 * Throws when there is no default export, when it names no class declared in
 * that file, or when the class has no members — each would otherwise make the
 * comparison vacuous.
 */
export function extractDefaultClassSurface(sourceFiles, entry) {
  const sourceFile = sourceFiles[entry];
  if (sourceFile === undefined) throw new Error(`${entry}: not among the parsed files`);
  const className = defaultExportName(sourceFile);
  if (className === undefined) throw new Error(`${entry}: no value export named default`);
  const declaration = sourceFile.statements.find(
    (statement) =>
      statement.kind === SyntaxKind.ClassDeclaration && statement.name?.text === className,
  );
  if (declaration === undefined) {
    throw new Error(`${entry}: default export ${className} is not a class declared in this file`);
  }
  const aliases = collectAliases(sourceFiles);
  const members = declaration.members.map((member) => describeMember(member, sourceFile, aliases));
  if (members.length === 0) throw new Error(`${entry}: class ${className} has no members`);
  return {
    className,
    modifiers: (declaration.modifiers ?? [])
      .filter((modifier) => !EXPORT_FORM_MODIFIERS.has(modifier.kind))
      .map((modifier) => modifierName(modifier, sourceFile)),
    typeParameters: (declaration.typeParameters ?? []).map((p) => nodeText(p, sourceFile)),
    heritage: (declaration.heritageClauses ?? []).map((clause) => ({
      token: clause.token === SyntaxKind.ExtendsKeyword ? "extends" : "implements",
      types: clause.types.map((type) => nodeText(type, sourceFile)),
    })),
    members,
  };
}

/** Parses `files` and extracts `entry`'s default-exported class surface. */
export function readDefaultClassSurface(files, entry) {
  return withParsedDeclarations(files, (sourceFiles) =>
    extractDefaultClassSurface(sourceFiles, entry),
  );
}

const baseKey = (member) =>
  member.kind === "constructor" || member.kind === "index"
    ? member.kind
    : `${member.kind} ${member.name}`;

/**
 * One key per member, in order. A name declared once keys as itself
 * (`method toMathml`); an overloaded one keys each signature by its position,
 * `method f#1`, `method f#2`, ..., so adding, removing or reordering an
 * overload is a named difference rather than two signatures collapsing into
 * one map entry.
 */
const memberKeys = (members) => {
  const counts = new Map();
  for (const member of members) counts.set(baseKey(member), (counts.get(baseKey(member)) ?? 0) + 1);
  const seen = new Map();
  return members.map((member) => {
    const key = baseKey(member);
    if (counts.get(key) === 1) return key;
    const index = (seen.get(key) ?? 0) + 1;
    seen.set(key, index);
    return `${key}#${index}`;
  });
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Every difference between two surfaces, as `{ path, expected, actual }`,
 * where `expected` is the fixture's value and `actual` the declaration's. An
 * empty array means the surfaces match exactly, member order included.
 *
 * Paths name the member and field (`method toMathml.parameters[0].optional`),
 * so each drift class — a missing, added or renamed member, a renamed
 * parameter, a flipped optional marker, a changed type — reports as itself.
 */
export function diffSurfaces(expected, actual) {
  const differences = [];
  const note = (path, want, got) => {
    if (!same(want, got)) differences.push({ path, expected: want, actual: got });
  };
  note("className", expected.className, actual.className);
  note("modifiers", expected.modifiers, actual.modifiers);
  note("typeParameters", expected.typeParameters, actual.typeParameters);
  note("heritage", expected.heritage, actual.heritage);

  const wantKeys = memberKeys(expected.members);
  const gotKeys = memberKeys(actual.members);
  const actualByKey = new Map(actual.members.map((member, i) => [gotKeys[i], member]));
  const expectedKeys = new Set(wantKeys);
  for (const [index, want] of expected.members.entries()) {
    const key = wantKeys[index];
    const got = actualByKey.get(key);
    if (got === undefined) {
      differences.push({ path: key, expected: want, actual: null });
      continue;
    }
    for (const field of new Set([...Object.keys(want), ...Object.keys(got)])) {
      if (field === "parameters") continue;
      if (field === "type" || field === "returnType") {
        diffType(`${key}.${field}`, want[field], got[field], note);
      } else {
        note(`${key}.${field}`, want[field], got[field]);
      }
    }
    const wantParameters = want.parameters ?? [];
    const gotParameters = got.parameters ?? [];
    note(`${key}.parameters.length`, wantParameters.length, gotParameters.length);
    for (let i = 0; i < Math.min(wantParameters.length, gotParameters.length); i++) {
      const path = `${key}.parameters[${i}]`;
      note(`${path}.name`, wantParameters[i].name, gotParameters[i].name);
      note(`${path}.optional`, wantParameters[i].optional, gotParameters[i].optional);
      note(`${path}.rest`, wantParameters[i].rest, gotParameters[i].rest);
      diffType(`${path}.type`, wantParameters[i].type, gotParameters[i].type, note);
    }
  }
  for (const [index, got] of actual.members.entries()) {
    if (!expectedKeys.has(gotKeys[index])) {
      differences.push({ path: gotKeys[index], expected: null, actual: got });
    }
  }
  note("memberOrder", wantKeys, gotKeys);
  return differences;
}

function diffType(path, want, got, note) {
  const isAlias = (type) => typeof type === "object" && type !== null;
  if (isAlias(want) && isAlias(got)) {
    note(`${path}.alias`, want.alias, got.alias);
    note(`${path}.literals`, want.literals, got.literals);
  } else {
    note(path, want, got);
  }
}

/**
 * The gate's check: each built declaration file must carry a default-exported
 * class whose surface is exactly `expected`. `declarations` maps a label
 * (`dist/index.d.ts`) to that file's text, or to `undefined` when the file is
 * missing. Returns failure messages; an empty array is a pass.
 */
export function checkDeclarationFiles(declarations, expected) {
  const failures = [];
  const entries = Object.entries(declarations);
  if (entries.length === 0) return ["no declaration files were given"];
  if (!Array.isArray(expected?.members) || expected.members.length === 0) {
    return ["the fixture declares no members; the comparison would be vacuous"];
  }
  for (const [label, text] of entries) {
    if (typeof text !== "string" || text.length === 0) {
      failures.push(`${label}: missing or empty`);
      continue;
    }
    let surface;
    try {
      surface = readDefaultClassSurface({ "entry.d.ts": text }, "entry.d.ts");
    } catch (error) {
      failures.push(`${label}: ${error.message.replace(/^entry\.d\.ts: /, "")}`);
      continue;
    }
    if (surface.members.length !== expected.members.length) {
      failures.push(
        `${label}: ${surface.members.length} class members, fixture has ${expected.members.length}`,
      );
    }
    for (const difference of diffSurfaces(expected, surface)) {
      failures.push(
        `${label}: ${difference.path}: expected ${JSON.stringify(difference.expected)}, got ${JSON.stringify(difference.actual)}`,
      );
    }
  }
  return failures;
}
