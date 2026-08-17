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

/**
 * A parse result value, mirroring Parslet's flattened trees.
 *
 * The `string` member is Parslet's plain Ruby String, DISTINCT from a slice:
 * `flatten_sequence` folds a sequence whose parts all vanished to `''` (its
 * `foldl` starts there), and transforms can tell the two apart —
 * `text.is_a?(Slice)` is false for it. The engine produces only that empty
 * string; every real match is a `Slice` carrying its offset.
 */
export type ParseValue = Slice | ParseHash | ParseValue[] | string | null;
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
  readonly emptyRepetition: boolean;
}

export interface ParseContext {
  readonly input: string;
  /** Parslet's capture scope stack: `capture` writes here, `dynamic` reads it. */
  captures: Map<string, string>[];
  /** Deepest position reached, for error reporting. */
  maxPos: number;
  /**
   * The furthest position at which an atom succeeded but left input behind
   * under `consumeAll` — Parslet's `offending_pos` in `Atoms::Base#apply`.
   * `-1` when no such check ever failed. See `Atom#parse` for why this, and
   * not `maxPos`, is the index a caller wants.
   */
  unconsumed: number;
  /**
   * Packrat cache, keyed by (atom, position) as in Parslet's Atoms::Context —
   * with `consume_all` deliberately EXCLUDED from the key, see `Atom#apply`.
   */
  cache: Map<Atom, Map<number, CacheEntry>>;
  depth: number;
}

/**
 * Deep grammar recursion on adversarial input can exhaust the JS stack. This
 * bound turns that into a clean ParseFailed — but it is not the only guard, and
 * for several real shapes it is *not* the one that fires: a grammar costing
 * many frames per input token reaches the engine's stack limit first, which the
 * `RangeError` fallback in `parse` catches. Both paths end in a typed failure;
 * they carry different messages so a test can tell which guard did the work.
 */
const MAX_DEPTH = 20_000;

/** Thrown when `MAX_DEPTH` is reached before the engine stack runs out. */
export const DEPTH_LIMIT_MESSAGE = "Input is nested too deeply to parse";

/** Thrown when the engine stack runs out first, which `MAX_DEPTH` cannot preempt. */
export const STACK_EXHAUSTED_MESSAGE = "Input exhausted the parser stack";

/**
 * How each engine words a blown stack: V8 and JavaScriptCore say "Maximum call
 * stack size exceeded", SpiderMonkey "too much recursion". Matching the text is
 * unlovely, but the alternative is worse — `RangeError` is a general-purpose
 * error, and relabelling *every* one as stack exhaustion would hide an
 * unrelated bug behind a message asserting a cause nothing established.
 */
const STACK_OVERFLOW_TEXT = /maximum call stack|stack size exceeded|too much recursion/i;

type ParseResult =
  | {
      ok: true;
      pos: number;
      value: ParseValue;
      /**
       * Set by a repetition that matched nothing, so that `.as(...)` can yield
       * `[]` where an ordinary empty match yields `""` — Parslet's
       * `flatten_repetition`'s `return [] if named && list.empty?`. Measured:
       *   str('a').repeat.as(:t).parse('')  => {t: []}
       *   str('a').repeat.parse('')         => ""
       * It rides on the *result*, not the value, because it must survive the
       * wrappers that pass a child result through untouched (alternative,
       * dynamic) and vanish through the ones that rebuild it (sequence,
       * maybe) — exactly the shape Parslet's deferred `flatten` gives it.
       * (Parslet's `entity` wrapper behaves like the pass-through group;
       * pegkit has no such atom, its `rule()` closures fill that role.)
       */
      emptyRepetition?: true;
    }
  | { ok: false };
const FAIL: ParseResult = { ok: false };

/**
 * Parslet's sequence flattening: named results (hashes) survive and merge,
 * unnamed slices merge with each other but vanish beside named results, and
 * nil disappears.
 */
function combineSeq(left: ParseValue, right: ParseValue): ParseValue {
  if (left === null) return right;
  if (right === null) return left;
  // `merge_fold`'s string arms. The only plain string this engine produces is
  // the `''` of an all-vanished nested sequence: two of them concatenate
  // (still `''`), and anything else beside one wins — a slice because "if
  // we're merging a String with a Slice, the slice wins", a hash or an array
  // because "if one of them is a string/slice, the other is more important".
  if (typeof left === "string" || typeof right === "string") {
    if (typeof left === "string" && typeof right === "string") return left + right;
    return typeof left === "string" ? right : left;
  }
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
  /**
   * `consumeAll` is Parslet's `consume_all` (`Atoms::Base#try`): true when this
   * atom is required to swallow the rest of the input by itself. Leaf atoms
   * ignore it and may omit the parameter.
   */
  abstract tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult;

  /**
   * Parslet's `cached?` plus the wrappers that never consult the cache because
   * they override `#apply` outright. Measured on parslet 2.0.0 with an
   * uncacheable inner atom, so only the wrapper itself could hold an entry
   * (`(w >> str('q')) | w` on `"a"`, where alternative 1 applies `w` without
   * `consume_all` and alternative 2 applies the same object with it):
   *
   * In Parslet's taxonomy (measured there; pegkit implements the subset it
   * needs — there is no `Ignored` or `Entity` atom here):
   *
   *   Named, Capture, Ignored, Scope, Dynamic  -> parse succeeds  (not cached)
   *   Entity, Alternative                      -> parse fails     (cached)
   *
   * pegkit's equivalents: `AsAtom` (Named), `CaptureAtom`, `ScopeAtom` and
   * `dynamic` are uncacheable; everything else caches.
   */
  protected cacheable(): boolean {
    return true;
  }

  /**
   * Parslet's `Atoms::Base#apply`, which is two steps, in this order:
   *
   * 1. `Context#try_with_cache` — memoised on **(atom, position) only**. The
   *    `consume_all` flag is deliberately not part of the key, so whichever
   *    mode reaches a position first decides it for the other. Parslet really
   *    does this, and it really is observable there: three grammars that share
   *    ONE atom object between two branches parse differently from the same
   *    grammars written out twice, and `test/pegkit/conformance.spec.ts` pins
   *    all three with the parslet expression each was measured with. Keying on
   *    the flag as well was tried here and changed no verdict and no tree over
   *    5,868 swept AsciiMath inputs — it is not reachable through *that*
   *    grammar — but "unobservable so far" is not a reason to diverge from the
   *    oracle on purpose, and the next grammar is where it would surface.
   * 2. The leftover check — a success that does not reach the end of the input
   *    is turned into a *failure*, which is what makes an alternative that
   *    matched too little fall through to the next one. This runs on the
   *    **cached** value too, and the cache stores the raw step-1 answer rather
   *    than this verdict (measured: `s | (s >> str('b'))` parses `"ab"`, so
   *    alternative 2 sees the success alternative 1 turned into a failure).
   *
   * Cached values are shared by reference exactly as in Parslet: at most one
   * occurrence survives into the final tree, so sharing is safe.
   */
  apply(pos: number, ctx: ParseContext, consumeAll = false): ParseResult {
    let byPosition = ctx.cache.get(this);
    const hit = byPosition?.get(pos);
    let result: ParseResult;
    if (hit !== undefined) {
      result = hit.ok
        ? hit.emptyRepetition
          ? { ok: true, pos: pos + hit.advance, value: hit.value, emptyRepetition: true }
          : { ok: true, pos: pos + hit.advance, value: hit.value }
        : FAIL;
    } else {
      if (++ctx.depth > MAX_DEPTH) {
        throw new ParseFailed(DEPTH_LIMIT_MESSAGE, pos);
      }
      try {
        result = this.tryParse(pos, ctx, consumeAll);
      } finally {
        ctx.depth--;
      }
      if (this.cacheable()) {
        if (!byPosition) {
          byPosition = new Map();
          ctx.cache.set(this, byPosition);
        }
        byPosition.set(
          pos,
          result.ok
            ? {
                ok: true,
                advance: result.pos - pos,
                value: result.value,
                emptyRepetition: result.emptyRepetition === true,
              }
            : { ok: false, advance: 0, value: null, emptyRepetition: false },
        );
      }
    }
    if (result.ok && consumeAll && result.pos < ctx.input.length) {
      if (result.pos > ctx.unconsumed) ctx.unconsumed = result.pos;
      return FAIL;
    }
    return result;
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

  /**
   * Parslet's `Atoms::Base#parse` without the `prefix:` option: the root is
   * applied with `consume_all` true, so a partial match is a failure rather
   * than something to detect afterwards.
   *
   * The reported index keeps its contract — *the first code unit the parser
   * could not consume*. Under `consume_all` that is `ctx.unconsumed`, the
   * furthest point some atom reached before the leftover check rejected it,
   * not `ctx.maxPos`, which is the deepest position a leaf was *tried* at and
   * is usually end-of-input. `maxPos` remains the answer when nothing ever
   * matched a prefix (`str("a").parse("b")` still reports 0).
   */
  parse(input: string): ParseValue {
    const ctx: ParseContext = {
      input,
      captures: [new Map()],
      maxPos: 0,
      unconsumed: -1,
      cache: new Map(),
      depth: 0,
    };
    let result: ParseResult;
    try {
      result = this.apply(0, ctx, true);
    } catch (error) {
      // Grammar recursion routinely outruns the JS stack before MAX_DEPTH:
      // this grammar costs many frames per input token, so a few hundred
      // complete `frac` levels exhaust the stack while `ctx.depth` is still far
      // below the bound. The per-parse context is discarded, so unwinding is
      // safe. A distinct message keeps the two guards distinguishable — message
      // text is not API (ARCHITECTURE.md §5), so this is a test affordance, not
      // a contract change.
      if (error instanceof RangeError && STACK_OVERFLOW_TEXT.test(error.message)) {
        throw new ParseFailed(STACK_EXHAUSTED_MESSAGE, ctx.maxPos);
      }
      // Any other RangeError is somebody else's bug and travels unchanged.
      throw error;
    }
    // `consume_all` guarantees a successful root reached the end of the input.
    if (result.ok) return result.value;

    const at = ctx.unconsumed >= 0 ? ctx.unconsumed : ctx.maxPos;
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

  /**
   * `Sequence#try` hands `consume_all` to its LAST element only
   * (`consume_all && idx == parslets.size-1`). Parslet flattens `a >> b >> c`
   * into one three-element Sequence while `seq(...)` here nests to the left,
   * but both put exactly one atom — the rightmost leaf — in charge of reaching
   * the end of the input, so the two agree.
   */
  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    const left = this.left.apply(pos, ctx, false);
    if (!left.ok) return FAIL;
    const right = this.right.apply(left.pos, ctx, consumeAll);
    if (!right.ok) return FAIL;
    const value = combineSeq(left.value, right.value);
    // `flatten_sequence` never yields nil: `foldl` of an all-vanished list
    // starts (and ends) at `''`, a plain string — see `ParseValue`. Measured:
    // `(str('a').maybe >> str('b').maybe).as(:t).parse('')` is `{t: ""}`,
    // where a directly named absent maybe stays `{t: nil}`.
    return { ok: true, pos: right.pos, value: value === null ? "" : value };
  }
}

class AltAtom extends Atom {
  constructor(
    private readonly left: Atom,
    private readonly right: Atom,
  ) {
    super();
  }

  /**
   * `Alternative#try` passes `consume_all` to every branch unchanged. That is
   * the retry this whole flag exists for: a branch that matches but strands
   * input fails in `Atom#apply`, and the next branch gets its turn. Measured:
   * `(str("") | str("a")).parse("a")` succeeds through the second branch.
   */
  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    const left = this.left.apply(pos, ctx, consumeAll);
    if (left.ok) return left;
    return this.right.apply(pos, ctx, consumeAll);
  }
}

/**
 * Parslet's `.maybe` is `Repetition(atom, 0, 1, :maybe)`, and the difference
 * from a plain repetition is observable: reaching `max` returns success
 * *immediately*, skipping the "extra input after last repetition" check, while
 * matching nothing falls through to it. Measured, with one shared atom:
 *
 *   m  = str('a').maybe ;  m  | (m  >> str('b'))  parses "ab"  (cached success)
 *   m2 = str('z').maybe ;  m2 | (m2 >> str('b'))  FAILS on "b" (cached failure)
 */
class MaybeAtom extends Atom {
  constructor(private readonly inner: Atom) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    const result = this.inner.apply(pos, ctx, false);
    // Rebuilt rather than returned: `flatten` re-folds a `:maybe` around its
    // child, so an empty repetition inside one is no longer a bare `[]`.
    if (result.ok) return { ok: true, pos: result.pos, value: result.value };
    if (consumeAll && pos < ctx.input.length) {
      // The same leftover conversion `Atom#apply` performs, with the same
      // bookkeeping: this success-consuming-nothing becomes a failure, and
      // `pos` is the first unit the parse could not consume. Without the
      // recording, `parse` falls back to `maxPos`, which the failed inner
      // attempt pushed deeper — reporting an index past the truth.
      if (pos > ctx.unconsumed) ctx.unconsumed = pos;
      return FAIL;
    }
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

  /**
   * `Repetition#try` applies its inner atom with `consume_all` **false** every
   * round — measured: `(str('a')|str('aa')).as(:c).repeat(1)` on `"aa"` yields
   * two one-character matches, not one two-character match — and then fails
   * itself if it stopped short of the end while `consume_all` is set.
   */
  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    const values: ParseValue[] = [];
    let cursor = pos;
    for (;;) {
      const result = this.inner.apply(cursor, ctx, false);
      if (!result.ok) break;
      if (result.pos === cursor) break; // zero-width match: stop, do not livelock
      values.push(result.value);
      cursor = result.pos;
    }
    if (values.length < this.min) return FAIL;
    if (consumeAll && cursor < ctx.input.length) return FAIL;
    if (values.length === 0) {
      return { ok: true, pos: cursor, value: new Slice("", pos), emptyRepetition: true };
    }
    if (values.every((value) => value instanceof Slice || value === null)) {
      const text = values.map((value) => (value === null ? "" : (value as Slice).text)).join("");
      return { ok: true, pos: cursor, value: new Slice(text, pos) };
    }
    return { ok: true, pos: cursor, value: values };
  }
}

/**
 * `Lookahead#try` passes `consume_all` straight to the atom it looks at, so a
 * lookahead in tail position demands that its target could finish the input.
 * Measured, with one shared `str('b').present?`:
 *
 *   (str('a') >> look)                    -- fails on "abc": `look` must reach
 *                                            the end and only reaches "b"
 *   (str('a') >> look >> str('bc'))       -- succeeds on "abc" on its own
 *   their alternation                     -- FAILS, because the first branch
 *                                            cached the failure at that position
 */
class AbsentAtom extends Atom {
  constructor(private readonly inner: Atom) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    // The inner parse is speculation: whatever it does, this atom consumes
    // nothing. `consumeAll` still reaches it (Parslet propagates the flag to
    // the looked-at atom, and cache parity depends on that), but the
    // `unconsumed` watermark — "the first code unit the parser could not
    // consume" — must not move for input only a lookahead touched. Restoring
    // it makes the speculation traceless without hiding recordings made
    // outside this window.
    const unconsumedBefore = ctx.unconsumed;
    const result = this.inner.apply(pos, ctx, consumeAll);
    ctx.unconsumed = unconsumedBefore;
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

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    // Same traceless-speculation rule as `AbsentAtom`, and for the same
    // reason: a positive lookahead consumes nothing either.
    const unconsumedBefore = ctx.unconsumed;
    const result = this.inner.apply(pos, ctx, consumeAll);
    ctx.unconsumed = unconsumedBefore;
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

  protected override cacheable(): boolean {
    return false; // Parslet's Named overrides #apply and never sees the cache
  }

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    const result = this.inner.apply(pos, ctx, consumeAll);
    if (!result.ok) return FAIL;
    // `flatten(value, named: true)`: a repetition that matched nothing keeps an
    // empty list under a name instead of collapsing to an empty string.
    const value = result.emptyRepetition ? [] : result.value;
    return { ok: true, pos: result.pos, value: { [this.name]: value } };
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

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    const result = this.inner.apply(pos, ctx, consumeAll);
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

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    ctx.captures.push(new Map(ctx.captures[ctx.captures.length - 1]));
    try {
      return this.inner.apply(pos, ctx, consumeAll);
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

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    return this.build(ctx).apply(pos, ctx, consumeAll);
  }
}

class LazyAtom extends Atom {
  private resolved: Atom | null = null;

  constructor(private readonly thunk: () => Atom) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    if (!this.resolved) this.resolved = this.thunk();
    return this.resolved.apply(pos, ctx, consumeAll);
  }
}

class ChoiceAtom extends Atom {
  constructor(private readonly atoms: readonly Atom[]) {
    super();
  }

  tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
    for (const atom of this.atoms) {
      const result = atom.apply(pos, ctx, consumeAll);
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
    tryParse(pos: number, ctx: ParseContext, consumeAll: boolean): ParseResult {
      const bucket = buckets.get(ctx.input[pos] ?? "");
      if (bucket) {
        for (const atom of bucket) {
          const result = atom.apply(pos, ctx, consumeAll);
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
