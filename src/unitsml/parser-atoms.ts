/**
 * Private UnitsML parser machinery. This is deliberately the small vocabulary
 * its pinned grammar uses, with ordered backtracking and Parslet's named-tree
 * merging. No general parser dependency enters the conversion service.
 */
export type Tree = string | null | { [key: string]: Tree } | Tree[];
interface Success {
  readonly pos: number;
  readonly value: Tree;
}
type Result = Success | null;
interface Context {
  readonly input: string;
  readonly cache: Map<Atom, Map<number, Result>>;
  depth: number;
}

function hash(value: Tree): value is { [key: string]: Tree } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function merge(left: Tree, right: Tree): Tree {
  if (left === null) return right;
  if (right === null) return left;
  if (typeof left === "string" && typeof right === "string") return left + right;
  if (typeof left === "string") return right;
  if (typeof right === "string") return left;
  if (hash(left) && hash(right)) return { ...left, ...right };
  if (hash(left)) return Array.isArray(right) ? [left, ...right] : left;
  if (hash(right)) return Array.isArray(left) ? [...left, right] : right;
  return [...left, ...right];
}

export class Atom {
  constructor(
    private readonly read: (pos: number, context: Context, all: boolean) => Result,
    private readonly cached = true,
  ) {}
  apply(pos: number, context: Context, all = false): Result {
    const entries = context.cache.get(this);
    let result: Result;
    if (entries?.has(pos)) result = entries.get(pos) ?? null;
    else {
      if (++context.depth > 20_000) throw new Error("UnitsML nesting exhausted the parser");
      try {
        result = this.read(pos, context, all);
      } finally {
        context.depth--;
      }
      if (this.cached) {
        const current = context.cache.get(this) ?? new Map<number, Result>();
        current.set(pos, result);
        context.cache.set(this, current);
      }
    }
    return result !== null && all && result.pos < context.input.length ? null : result;
  }
  parse(input: string): Tree {
    const result = this.apply(0, { input, cache: new Map(), depth: 0 }, true);
    if (result === null) throw new Error("UnitsML expression did not match the unit grammar");
    return result.value;
  }
  as(name: string): Atom {
    return new Atom((pos, context, all) => {
      const result = this.apply(pos, context, all);
      return result === null ? null : { pos: result.pos, value: { [name]: result.value } };
    }, false);
  }
  maybe(): Atom {
    return new Atom((pos, context, all) => {
      const result = this.apply(pos, context);
      if (result !== null) return result;
      return all && pos < context.input.length ? null : { pos, value: null };
    });
  }
  repeat(min: number): Atom {
    return new Atom((pos, context, all) => {
      const values: Tree[] = [];
      let cursor = pos;
      for (;;) {
        const result = this.apply(cursor, context);
        if (result === null || result.pos === cursor) break;
        values.push(result.value);
        cursor = result.pos;
      }
      if (values.length < min || (all && cursor < context.input.length)) return null;
      return {
        pos: cursor,
        value: values.every((value) => typeof value === "string" || value === null)
          ? values.join("")
          : values,
      };
    });
  }
  private look(positive: boolean): Atom {
    return new Atom((pos, context, all) =>
      (this.apply(pos, context, all) !== null) === positive ? { pos, value: null } : null,
    );
  }
  present(): Atom {
    return this.look(true);
  }
  absent(): Atom {
    return this.look(false);
  }
}

export function str(text: string): Atom {
  return new Atom((pos, context) =>
    context.input.startsWith(text, pos) ? { pos: pos + text.length, value: text } : null,
  );
}
export function match(source: string): Atom {
  const regex = new RegExp(`^(?:${source})`, "u");
  return new Atom((pos, context) => {
    const character = String.fromCodePoint(context.input.codePointAt(pos) ?? 0);
    return pos < context.input.length && regex.test(character)
      ? { pos: pos + character.length, value: character }
      : null;
  });
}
export function any(): Atom {
  return match("[\\s\\S]");
}
export function alt(...atoms: readonly Atom[]): Atom {
  if (atoms.length === 0) throw new Error("UnitsML ordered choice cannot be empty");
  return atoms
    .slice(1)
    .reduce(
      (left, right) =>
        new Atom(
          (pos, context, all) => left.apply(pos, context, all) ?? right.apply(pos, context, all),
        ),
      atoms[0] as Atom,
    );
}
export function seq(...atoms: readonly Atom[]): Atom {
  if (atoms.length === 0) throw new Error("UnitsML sequence cannot be empty");
  return atoms.slice(1).reduce(
    (left, right) =>
      new Atom((pos, context, all) => {
        const first = left.apply(pos, context);
        if (first === null) return null;
        const second = right.apply(first.pos, context, all);
        return second === null
          ? null
          : { pos: second.pos, value: merge(first.value, second.value) ?? "" };
      }),
    atoms[0] as Atom,
  );
}
export function rule(build: () => Atom): Atom {
  let resolved: Atom | undefined;
  return new Atom((pos, context, all) => {
    if (resolved === undefined) resolved = build();
    return resolved.apply(pos, context, all);
  });
}
