/**
 * pegkit — a typed re-implementation of the Parslet 2.0.0 semantics that
 * plurimath's grammars rely on (ARCHITECTURE.md §6).
 *
 * The point is a 1:1 structural port: each Ruby grammar rule maps to one
 * expression here, and the resulting trees match Parslet's shapes, which is
 * what makes byte-for-byte parity with the gem provable rather than hoped for.
 *
 * Scope promise: the subset plurimath uses, not all of Parslet. Behaviour
 * outside that subset is documented in the conformance suite, not implemented.
 */

import { Slice } from "./slice";

/** A parse result value, mirroring Parslet's flattened trees. */
export type ParseValue = Slice | ParseHash | ParseValue[] | null;
export interface ParseHash {
  [key: string]: ParseValue;
}

export function isHash(value: ParseValue): value is ParseHash {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Slice)
  );
}

export class ParseFailed extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(message);
    this.name = "ParseFailed";
  }
}

interface CacheEntry {
  readonly ok: boolean;
  readonly advance: number;
  readonly value: ParseValue;
}

export interface ParseContext {
  readonly input: string;
  /** Parslet's capture scope stack: `capture` writes here, `dynamic` reads it. */
  captures: Map<string, string>[];
  /** Deepest position reached, for error reporting. */
  maxPos: number;
  /** Packrat cache, keyed by (atom, position) as in Parslet's Atoms::Context. */
  cache: Map<Atom, Map<number, CacheEntry>>;
  depth: number;
}

/**
 * Deep grammar recursion on adversarial input can exhaust the JS stack; this
 * bound turns that into a clean ParseFailed well before it happens.
 */
const MAX_DEPTH = 20_000;

type ParseResult = { ok: true; pos: number; value: ParseValue } | { ok: false };
const FAIL: ParseResult = { ok: false };

/**
 * Parslet's sequence flattening: named results (hashes) survive and merge,
 * unnamed slices merge with each other but vanish beside named results, and
 * nil disappears.
 */
function combineSeq(left: ParseValue, right: ParseValue): ParseValue {
  if (left === null) return right;
  if (right === null) return left;
  const leftIsHash = isHash(left);
  const rightIsHash = isHash(right);
  if (leftIsHash && rightIsHash) {
    const merged: ParseHash = { ...left };
    for (const [key, value] of Object.entries(right)) {
      // Parslet warns and keeps the later value rather than raising.
      if (key in merged) console.warn(`pegkit: duplicate subtrees while merging key "${key}"`);
      merged[key] = value;
    }
    return merged;
  }
  // Parslet hoists a named result into an adjacent repetition rather than
  // merging or discarding it, verified against parslet 2.0.0:
  //   str("a").as(:item).repeat(1) >> str("b").as(:tail)
  //     => [{item: "a"}, {item: "a"}, {tail: "b"}]
  if (leftIsHash) {
    if (Array.isArray(right)) return [left, ...right];
    return left; // a slice beside named content is dropped
  }
  if (rightIsHash) {
    if (Array.isArray(left)) return [...left, right];
    return right;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
    return Array.isArray(left) ? left : right;
  }
  return new Slice(left.text + right.text, left.offset);
}

export abstract class Atom {
  abstract tryParse(pos: number, ctx: ParseContext): ParseResult;

  /** Parslet's `cached?`: Dynamic and Scope opt out, everything else caches. */
  protected cacheable(): boolean {
    return true;
  }

  /**
   * Parslet's `Context#try_with_cache`. Cached values are shared by reference
   * exactly as in Parslet: at most one occurrence survives into the final
   * tree, so sharing is safe.
   */
  apply(pos: number, ctx: ParseContext): ParseResult {
    let byPosition = ctx.cache.get(this);
    const hit = byPosition?.get(pos);
    if (hit !== undefined) {
      return hit.ok ? { ok: true, pos: pos + hit.advance, value: hit.value } : FAIL;
    }
    if (++ctx.depth > MAX_DEPTH) {
      throw new ParseFailed("Input is nested too deeply to parse", pos);
    }
    try {
      const result = this.tryParse(pos, ctx);
      if (this.cacheable()) {
        if (!byPosition) {
          byPosition = new Map();
          ctx.cache.set(this, byPosition);
        }
        byPosition.set(
          pos,
          result.ok
            ? { ok: true, advance: result.pos - pos, value: result.value }
            : { ok: false, advance: 0, value: null },
        );
      }
      return result;
    } finally {
      ctx.depth--;
    }
  }

  /** Parslet `>>` */
  andThen(other: Atom): Atom {
    return new SeqAtom(this, other);
  }

  /** Parslet `|` — ordered choice */
  or(other: Atom): Atom {
    return new AltAtom(this, other);
  }

  /** Parslet `.maybe` */
  maybe(): Atom {
    return new MaybeAtom(this);
  }

  /** Parslet `.repeat(min)` */
  repeat(min = 0): Atom {
    return new RepeatAtom(this, min);
  }

  /** Parslet `.absent?` — negative lookahead */
  absent(): Atom {
    return new AbsentAtom(this);
  }

  /** Parslet `.present?` — positive lookahead */
  present(): Atom {
    return new PresentAtom(this);
  }

  /** Parslet `.as(:name)` */
  as(name: string): Atom {
    return new AsAtom(this, name);
  }

  /** Parslet `.capture(:name)` */
  capture(name: string): Atom {
    return new CaptureAtom(this, name);
  }

  parse(input: string): ParseValue {
    const ctx: ParseContext = {
      input,
      captures: [new Map()],
      maxPos: 0,
      cache: new Map(),
      depth: 0,
    };
    let result: ParseResult;
    try {
      result = this.apply(0, ctx);
    } catch (error) {
      // Grammar recursion can still outrun the JS stack before MAX_DEPTH on
      // some engines; the per-parse context is discarded, so unwinding is safe.
      if (error instanceof RangeError) {
        throw new ParseFailed("Input is nested too deeply to parse", ctx.maxPos);
      }
      throw error;
    }
    if (result.ok && result.pos === input.length) return result.value;

    const at = result.ok ? result.pos : ctx.maxPos;
    throw new ParseFailed(
      `Failed to match at index ${at}: ${JSON.stringify(input.slice(at, at + 12))}...`,
      at,
    );
  }
}

class StrAtom extends Atom {
  constructor(private readonly literal: string) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    if (ctx.input.startsWith(this.literal, pos)) {
      return { ok: true, pos: pos + this.literal.length, value: new Slice(this.literal, pos) };
    }
    if (pos > ctx.maxPos) ctx.maxPos = pos;
    return FAIL;
  }
}

/**
 * How many UTF-16 code units the character at `pos` occupies: 2 for a surrogate
 * pair, 1 otherwise.
 *
 * Ruby strings are sequences of code points, so Parslet's `source.consume(1)`
 * (`/(.|$){1}/m`) takes a whole character however many bytes it needs — verified
 * against parslet 2.0.0, where `Parslet.any.parse("𝑥")` succeeds and
 * `(Parslet.any >> Parslet.any).parse("𝑥")` fails. JavaScript strings are
 * sequences of UTF-16 units, so "one character" has to be computed.
 *
 * Offsets stay UTF-16 throughout (`Slice.offset`, `ParseFailed.index`,
 * `SourceMap`) because callers index JavaScript strings with them; only the
 * consumption step is code-point aware.
 *
 * An unpaired surrogate is one unit. Ruby cannot represent one, so there is no
 * gem behaviour to match; consuming it alone keeps the parser total.
 */
function charWidth(input: string, pos: number): number {
  const unit = input.charCodeAt(pos);
  if (unit >= 0xd800 && unit <= 0xdbff && pos + 1 < input.length) {
    const next = input.charCodeAt(pos + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return 2;
  }
  return 1;
}

/**
 * Parslet's `match`: the pattern is a predicate on the current position, and
 * exactly ONE character is consumed on success — even for a pattern like
 * `/\s+/`. Verified against parslet 2.0.0.
 */
class ReAtom extends Atom {
  private readonly regex: RegExp;

  constructor(source: string) {
    super();
    this.regex = new RegExp(source, "yu");
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    if (pos < ctx.input.length) {
      this.regex.lastIndex = pos;
      const match = this.regex.exec(ctx.input);
      // A `u` regex snaps lastIndex back to a code-point boundary, so a start
      // inside a surrogate pair reports `index < pos`; that is not a match here.
      if (match && match.index === pos) {
        const width = charWidth(ctx.input, pos);
        return {
          ok: true,
          pos: pos + width,
          value: new Slice(ctx.input.slice(pos, pos + width), pos),
        };
      }
    }
    if (pos > ctx.maxPos) ctx.maxPos = pos;
    return FAIL;
  }
}

/** Parslet's `any` — one character, whatever it is. */
class AnyAtom extends Atom {
  tryParse(pos: number, ctx: ParseContext): ParseResult {
    if (pos < ctx.input.length) {
      const width = charWidth(ctx.input, pos);
      return {
        ok: true,
        pos: pos + width,
        value: new Slice(ctx.input.slice(pos, pos + width), pos),
      };
    }
    if (pos > ctx.maxPos) ctx.maxPos = pos;
    return FAIL;
  }
}

class SeqAtom extends Atom {
  constructor(
    private readonly left: Atom,
    private readonly right: Atom,
  ) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    const left = this.left.apply(pos, ctx);
    if (!left.ok) return FAIL;
    const right = this.right.apply(left.pos, ctx);
    if (!right.ok) return FAIL;
    return { ok: true, pos: right.pos, value: combineSeq(left.value, right.value) };
  }
}

class AltAtom extends Atom {
  constructor(
    private readonly left: Atom,
    private readonly right: Atom,
  ) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    const left = this.left.apply(pos, ctx);
    if (left.ok) return left;
    return this.right.apply(pos, ctx);
  }
}

class MaybeAtom extends Atom {
  constructor(private readonly inner: Atom) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    const result = this.inner.apply(pos, ctx);
    if (result.ok) return result;
    return { ok: true, pos, value: null };
  }
}

class RepeatAtom extends Atom {
  constructor(
    private readonly inner: Atom,
    private readonly min: number,
  ) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    const values: ParseValue[] = [];
    let cursor = pos;
    for (;;) {
      const result = this.inner.apply(cursor, ctx);
      if (!result.ok) break;
      if (result.pos === cursor) break; // zero-width match: stop, do not livelock
      values.push(result.value);
      cursor = result.pos;
    }
    if (values.length < this.min) return FAIL;
    if (values.every((value) => value instanceof Slice || value === null)) {
      const text = values.map((value) => (value === null ? "" : (value as Slice).text)).join("");
      return { ok: true, pos: cursor, value: new Slice(text, pos) };
    }
    return { ok: true, pos: cursor, value: values };
  }
}

class AbsentAtom extends Atom {
  constructor(private readonly inner: Atom) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    const result = this.inner.apply(pos, ctx);
    if (result.ok) {
      if (pos > ctx.maxPos) ctx.maxPos = pos;
      return FAIL;
    }
    return { ok: true, pos, value: null };
  }
}

class PresentAtom extends Atom {
  constructor(private readonly inner: Atom) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    const result = this.inner.apply(pos, ctx);
    if (!result.ok) return FAIL;
    return { ok: true, pos, value: null };
  }
}

class AsAtom extends Atom {
  constructor(
    private readonly inner: Atom,
    private readonly name: string,
  ) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    const result = this.inner.apply(pos, ctx);
    if (!result.ok) return FAIL;
    return { ok: true, pos: result.pos, value: { [this.name]: result.value } };
  }
}

class CaptureAtom extends Atom {
  constructor(
    private readonly inner: Atom,
    private readonly name: string,
  ) {
    super();
  }

  protected override cacheable(): boolean {
    return false; // writes context state; caching would hide the write
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    const result = this.inner.apply(pos, ctx);
    if (!result.ok) return FAIL;
    const scope = ctx.captures[ctx.captures.length - 1] as Map<string, string>;
    scope.set(this.name, ctx.input.slice(pos, result.pos));
    return result;
  }
}

/**
 * Parslet's `scope { }`: captures made inside are discarded on exit, so a
 * nested construct cannot clobber an enclosing capture of the same name.
 */
class ScopeAtom extends Atom {
  constructor(private readonly inner: Atom) {
    super();
  }

  protected override cacheable(): boolean {
    return false; // result depends on surrounding capture state
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    ctx.captures.push(new Map(ctx.captures[ctx.captures.length - 1]));
    try {
      return this.inner.apply(pos, ctx);
    } finally {
      ctx.captures.pop();
    }
  }
}

class DynamicAtom extends Atom {
  constructor(private readonly build: (ctx: ParseContext) => Atom) {
    super();
  }

  protected override cacheable(): boolean {
    return false; // the atom itself varies with captured state
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    return this.build(ctx).apply(pos, ctx);
  }
}

class LazyAtom extends Atom {
  private resolved: Atom | null = null;

  constructor(private readonly thunk: () => Atom) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    if (!this.resolved) this.resolved = this.thunk();
    return this.resolved.apply(pos, ctx);
  }
}

class ChoiceAtom extends Atom {
  constructor(private readonly atoms: readonly Atom[]) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext): ParseResult {
    for (const atom of this.atoms) {
      const result = atom.apply(pos, ctx);
      if (result.ok) return result;
    }
    return FAIL;
  }
}

/** Read the current capture scope (Parslet's `context.captures`). */
export function captured(ctx: ParseContext, name: string): string | undefined {
  return ctx.captures[ctx.captures.length - 1]?.get(name);
}

export function str(literal: string): Atom {
  return new StrAtom(literal);
}

/** Parslet `match(...)` — predicate at the current position, consumes one char. */
export function match(source: string): Atom {
  return new ReAtom(source);
}

/** Parslet `any` */
export function any(): Atom {
  return new AnyAtom();
}

export function dynamic(build: (ctx: ParseContext) => Atom): Atom {
  return new DynamicAtom(build);
}

export function scope(inner: Atom): Atom {
  return new ScopeAtom(inner);
}

/** Lazily-resolved rule reference, standing in for Parslet's `rule`. */
export function rule(thunk: () => Atom): Atom {
  return new LazyAtom(thunk);
}

/** Ordered choice over many atoms, iterative so long lists cannot blow the stack. */
export function choice(atoms: readonly Atom[]): Atom {
  return new ChoiceAtom(atoms);
}

export function seq(...atoms: readonly Atom[]): Atom {
  return atoms.reduce((accumulator, atom) => accumulator.andThen(atom));
}

export function alt(...atoms: readonly Atom[]): Atom {
  return atoms.reduce((accumulator, atom) => accumulator.or(atom));
}

/**
 * Ordered choice over literal-prefixed alternatives, bucketed by first
 * character. Two entries in different buckets can never both match at one
 * position, so dispatching on the current character preserves ordered-choice
 * semantics while skipping thousands of impossible candidates — the AsciiMath
 * grammar has 3,330 of them.
 */
export function tokenChoice(entries: ReadonlyArray<readonly [key: string, atom: Atom]>): Atom {
  const buckets = new Map<string, Atom[]>();
  for (const [key, atom] of entries) {
    const first = key[0] as string;
    let bucket = buckets.get(first);
    if (!bucket) {
      bucket = [];
      buckets.set(first, bucket);
    }
    bucket.push(atom);
  }

  class TokenChoiceAtom extends Atom {
    tryParse(pos: number, ctx: ParseContext): ParseResult {
      const bucket = buckets.get(ctx.input[pos] ?? "");
      if (bucket) {
        for (const atom of bucket) {
          const result = atom.apply(pos, ctx);
          if (result.ok) return result;
        }
      }
      // Record the position like every other leaf atom: with no bucket, no
      // inner atom runs, so nothing else would advance maxPos and the reported
      // failure index could point earlier than the real one.
      if (pos > ctx.maxPos) ctx.maxPos = pos;
      return FAIL;
    }
  }
  return new TokenChoiceAtom();
}

export { Slice };
