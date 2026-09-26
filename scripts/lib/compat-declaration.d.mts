/** Types for `./compat-declaration.mjs`, which the gate spec imports. */

/** A type as the fixture records it: its text, or a resolved string-literal alias. */
export type DeclaredType = string | { alias: string; literals: string[] } | null;

export interface DeclaredParameter {
  name: string;
  optional: boolean;
  rest: boolean;
  type: DeclaredType;
}

export interface DeclaredMember {
  kind: string;
  name?: string | null;
  modifiers: string[];
  optional?: boolean;
  type?: DeclaredType;
  typeParameters?: string[];
  parameters?: DeclaredParameter[];
  returnType?: DeclaredType;
}

export interface ClassSurface {
  className: string;
  modifiers?: string[];
  typeParameters?: string[];
  heritage?: { token: "extends" | "implements"; types: string[] }[];
  members: DeclaredMember[];
}

export interface SurfaceDifference {
  path: string;
  expected: unknown;
  actual: unknown;
}

export const VALIDATED_TYPESCRIPT_VERSION: string;

export function assertValidatedTypescript(version: string): void;

export function withParsedDeclarations<T>(
  files: Record<string, string>,
  visit: (sourceFiles: Record<string, unknown>) => T,
): T;

export function extractDefaultClassSurface(
  sourceFiles: Record<string, unknown>,
  entry: string,
): ClassSurface;

export function readDefaultClassSurface(files: Record<string, string>, entry: string): ClassSurface;

export function diffSurfaces(expected: ClassSurface, actual: ClassSurface): SurfaceDifference[];

export function checkDeclarationFiles(
  declarations: Record<string, string | undefined>,
  expected: ClassSurface,
): string[];
