/**
 * The AsciiMath renderer (ARCHITECTURE.md §4-5): a `MathNode` tree back to
 * AsciiMath text, byte-identical to the gem's `to_asciimath`.
 *
 * In Ruby, rendering is a method per node class. This module is the same
 * dispatch as one function: `renderNode` switches on `kind`, and the alias
 * carriers (`unaryFunction`, `binaryFunction`, `ternaryFunction`, `table`,
 * `fontStyle`) switch again on the carried class name, because the census
 * folds gem classes with their *own* `to_asciimath` overrides into one kind —
 * `Lcm` renders `lcm x` where its carrier default would render `lcmx`.
 *
 * Every branch is measured, never transliterated (PORTING-STANDARDS.md): the
 * behaviour was read off live gem instances — one probe per shape, nil
 * combinations included — against the pinned oracle checkout (plurimath
 * 0.11.6, 00c52783). The measured pins worth naming, because source-reading
 * gets each one wrong:
 *
 *   - `UnaryFunction#to_asciimath` drops the parentheses exactly when the
 *     class name is in `Utility::UNARY_CLASSES` (`sin x` → `sinx`, but
 *     `cancel(x)` keeps them — `cancel` is not in the table).
 *   - `TernaryFunction`'s first slot is parenthesized ONLY for a formula:
 *     `when Formula || field.class.name.include?("Function")` evaluates its
 *     `||` at *class* level, so the `include?` arm is dead code and
 *     `sinx_(2)^(3)` has no parens where `(x)_(2)^(3)` does.
 *   - `Int`/`Oint`/`Sum`/`Prod` append ` #{third}` and then `String#strip`,
 *     whose whitespace set is `[\0\t\n\v\f\r ]` — the no-break space stays.
 *   - `Color` strips `/\s/` from its first value — `[ \t\r\n\f\v]`, again
 *     not the no-break space (measured: `color("a\u{A0}b")(x)`).
 *   - A `Table` with a nil close paren falls back through
 *     `Asciimath::Constants::TABLE_PARENTHESIS` and an unlisted open paren
 *     yields the empty string: `{:[x]` for an `{:` open. `Matrix` maps its
 *     rows strictly while `parentheless_table` is nil-safe.
 *   - Where the gem CRASHES — a bare string in a formula's value (which its
 *     own parse of `left(right)` or even `""` produces), `Power` with no
 *     first parameter, `Text` holding a node, `Fenced`'s second slot not a
 *     list — this port raises `RenderError`. The gem wraps the same crash
 *     into `Math::ParseError` at its formula boundary; the mapping
 *     crash → `RenderError` is the §5 runtime-boundary contract.
 *
 * Context: the one axis AsciiMath rendering has is `table` — `Td` merges
 * `table: true` into the options when rendering a *formula* child, and
 * `Symbols::Comma` alone reads it (`","` instead of `,`). That axis and its
 * variants come from the generated exception matrix, not from code here.
 *
 * Class names outside the AsciiMath-reachable set (the transform's
 * constructors, `src/generated/asciimath/transform-registry.ts`) raise
 * `RenderError`: gem classes such as `Mbox` or `Menclose` carry their own
 * overrides this port has not measured, and a silent carrier-default render
 * would be a quiet divergence. Parity gaps fail loudly (§5).
 */

import {
  assertMathNodeShape,
  type MathNode,
  MissingSymbolDataError,
  type NodeParameter,
  RenderError,
} from "../../core/index";
import { RUBY_ABSTRACT_CLASSES } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import { ASCIIMATH_SYMBOL_EXCEPTIONS } from "../../generated/asciimath/exceptions";
import {
  ASCIIMATH_FONT_STYLE_KEYWORDS,
  ASCIIMATH_SIMPLE_TABLE_NAMES,
  ASCIIMATH_TABLE_CLOSE_FALLBACK,
} from "../../generated/asciimath/render-tables";
import { ASCIIMATH_SYMBOLS } from "../../generated/asciimath/symbols";
import {
  ASCIIMATH_TRANSFORM_GET_CLASS,
  ASCIIMATH_TRANSFORM_UNARY_CLASSES,
} from "../../generated/asciimath/transform-registry";

const FORMAT = "asciimath";

/**
 * Renderer options. Empty today and typed exactly (§5): the gem's only
 * observable option on this path is a configured number formatter, which is
 * P4 scope — with none configured a number renders its raw value, and the
 * whole pinned corpus was generated that way.
 */
export type AsciimathOptions = Record<string, never>;

/**
 * `Formula#to_asciimath` / any node's `to_asciimath`, as a module function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 */
export function toAsciimath(node: MathNode, _options?: AsciimathOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  // `?? ""`: the one Ruby render that returns nil rather than a string is a
  // bare `FontStyle` with a nil value; a public string signature maps that to
  // "" (recorded in TODO.plan/deferred.md).
  return renderNode(node, ROOT_CONTEXT) ?? "";
}

/* -------------------------------------------------------------------------
 * Context and derived tables.
 * ---------------------------------------------------------------------- */

/** The one context axis the gem's asciimath path reads (see module docs). */
interface RenderContext {
  readonly table: boolean;
}

const ROOT_CONTEXT: RenderContext = { table: false };
const TABLE_CONTEXT: RenderContext = { table: true };

/** `Utility::UNARY_CLASSES` — the names rendered without parentheses. */
const UNARY_KEYWORDS: ReadonlySet<string> = new Set(ASCIIMATH_TRANSFORM_UNARY_CLASSES);

function classBasename(rubyClass: string): string {
  return rubyClass.slice(rubyClass.lastIndexOf(":") + 1);
}

/**
 * The class names this renderer has measured behaviour for, per carrier —
 * exactly the AsciiMath-reachable set: every `get_class` name from the
 * generated reachability census, plus the classes the transform constructs
 * directly without `get_class` (`newPower`, `newMod`, `newPowerBase`,
 * `newTd`, `newTr` in `./transform.ts`). A name outside its carrier's set
 * raises rather than rendering the carrier default, because the gem class it
 * denotes may override `to_asciimath` (see module docs).
 */
const REACHABLE_UNARY_NAMES: ReadonlySet<string> = new Set([
  ...ASCIIMATH_TRANSFORM_GET_CLASS.filter(
    (entry) => entry.carrier === "Math::Function::UnaryFunction",
  ).map((entry) => classBasename(entry.rubyClass)),
  "Tr",
]);

const REACHABLE_BINARY_NAMES: ReadonlySet<string> = new Set([
  ...ASCIIMATH_TRANSFORM_GET_CLASS.filter(
    (entry) => entry.carrier === "Math::Function::BinaryFunction",
  ).map((entry) => classBasename(entry.rubyClass)),
  "Power",
  "Mod",
  "Td",
]);

const REACHABLE_TERNARY_NAMES: ReadonlySet<string> = new Set(["PowerBase"]);

/**
 * The `FontStyle` subclasses that override `to_asciimath` with a keyword
 * wrapper, and the keyword each emits — generated from live renders on the
 * oracle (`Bold.new(x)` → `mathbf(x)`, `./render-tables.ts` in
 * `src/generated/asciimath`); the other six subclasses and the bare carrier
 * render their value with no wrapper at all. The emitted keyword is not
 * derivable from the parse table (`bb`, `mathbf` and `textbf` all *parse* to
 * `Bold`; only `mathbf` comes back out), which is why it is measured on the
 * render side.
 */
const FONT_STYLE_KEYWORDS: ReadonlyMap<string, string> = ASCIIMATH_FONT_STYLE_KEYWORDS;

/**
 * `Asciimath::Constants::TABLE_PARENTHESIS` — the close paren a table falls
 * back to when it has none, keyed by the rendered open paren; a miss is the
 * empty string (measured: open `{` renders `{[x]`). Generated from the
 * constant the render path reads, each mapping verified by a render.
 */
const TABLE_CLOSE_FALLBACK: ReadonlyMap<string, string> = ASCIIMATH_TABLE_CLOSE_FALLBACK;

/**
 * `Table::SIMPLE_TABLES` (`table.rb:20`), generated, as a set for membership
 * tests; `Matrix`'s identical override is its own branch in `renderTable`.
 */
const PARENTHELESS_TABLE_NAMES: ReadonlySet<string> = new Set(ASCIIMATH_SIMPLE_TABLE_NAMES);

/**
 * Symbol ids rendered from their stored `value` rather than a class literal:
 * the `Symbol` base class itself, and the abstract `Paren` root — the two
 * ids the generated table deliberately omits. Both are derived from core's
 * own data (the symbol spec's carrier class and the abstract-class census),
 * not restated.
 */
const VALUE_RENDERED_SYMBOL_IDS: ReadonlySet<string> = new Set(
  [NODE_SPECS.symbol.rubyClass, ...RUBY_ABSTRACT_CLASSES]
    .filter((rubyClass) => rubyClass.startsWith("Math::Symbols::"))
    .map(classBasename),
);

const SYMBOL_EXCEPTIONS = new Map(
  ASCIIMATH_SYMBOL_EXCEPTIONS.map((exception) => [exception.id, exception]),
);

/** `class_name` (`core.rb:28`): the class basename, lowercased. */
function kindClassName(kind: MathNode["kind"]): string {
  return classBasename(NODE_SPECS[kind].rubyClass).toLowerCase();
}

/* -------------------------------------------------------------------------
 * Small semantics helpers, each mirroring one Ruby idiom.
 * ---------------------------------------------------------------------- */

/** Ruby truthiness for `if parameter_x` guards: only nil and false are falsy. */
function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** Ruby `String#strip`: exactly `[\0\t\n\v\f\r ]`, never the no-break space. */
function rubyStrip(text: string): string {
  return text.replace(/^[\0\t\n\v\f\r ]+/, "").replace(/[\0\t\n\v\f\r ]+$/, "");
}

/** Ruby `/\s/`: ASCII whitespace only — `Color` strips it from its first value. */
function stripRubyWhitespace(text: string): string {
  return text.replace(/[ \t\r\n\f\v]/g, "");
}

/** Interpolation: Ruby `"#{nil}"` is the empty string. */
function s(value: string | null): string {
  return value ?? "";
}

function slotKind(value: NodeParameter | undefined): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const kind = (value as { readonly kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}

/**
 * A strict `field.to_asciimath(options:)` call: only a node answers it.
 * Everything else — a bare string (which the gem's own parse of `""` or
 * `left(right)` puts into a formula's value), a list, a number, `null` where
 * Ruby wrote no `&.` — raises `NoMethodError` in the gem and `RenderError`
 * here. Returns `null` only where Ruby returns nil (see `renderFontStyle`).
 */
function renderChild(value: unknown, context: RenderContext, at: string): string | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const kind = (value as { readonly kind?: unknown }).kind;
    if (typeof kind === "string" && Object.hasOwn(NODE_SPECS, kind)) {
      return renderNode(value as MathNode, context);
    }
  }
  throw new RenderError(
    `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
    FORMAT,
    "unknown",
  );
}

function describeSlot(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return `the bare string ${JSON.stringify(value)}`;
  if (Array.isArray(value)) return "a bare list";
  return `a ${typeof value}`;
}

/**
 * `UnaryFunction#asciimath_value` (`unary_function.rb:196`): nil → `""`, a
 * list compacts and joins with no separator, anything else renders directly.
 */
function asciimathValue(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => s(renderChild(item, context, at)))
      .join("");
  }
  return s(renderChild(value, context, at));
}

/** `BinaryFunction#wrapped`: `""` for a missing field, `(…)` otherwise. */
function wrapped(value: NodeParameter | undefined, context: RenderContext, at: string): string {
  if (!present(value)) return "";
  return `(${s(renderChild(value, context, at))})`;
}

/**
 * `TernaryFunction#ascii_wrap`: parenthesizes ONLY a formula (`Mrow` and
 * `Mstyle` included — they are `Formula` subclasses). The
 * `field.class.name.include?("Function")` arm is dead code in the gem (it
 * sits after `||` on the class itself), so `sin x` in a first slot stays
 * bare. The obrace/ubrace early return is equally inert — neither is a
 * `Formula` — but it is the gem's code path, so the answer is the same.
 */
function asciiWrap(value: NodeParameter | undefined, context: RenderContext, at: string): string {
  const rendered = s(renderChild(value, context, at));
  const kind = slotKind(value);
  return kind === "formula" || kind === "mrow" ? `(${rendered})` : rendered;
}

/** `Stackrel#wrapped`: always parens, unless the value already starts with one. */
function stackrelWrapped(
  value: NodeParameter | undefined,
  context: RenderContext,
  at: string,
): string {
  const rendered = value === null || value === undefined ? "" : s(renderChild(value, context, at));
  return rendered.startsWith("(") ? rendered : `(${rendered})`;
}

/**
 * A formula's `value` list, joined: `value.map { to_asciimath }.join(" ")` —
 * strict per element, which is where the gem's own `left(right)` parse fails
 * to render (its value holds a bare `""`).
 */
function renderFormulaValue(value: unknown, context: RenderContext, at: string): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      at,
    );
  }
  return value.map((item) => s(renderChild(item, context, `${at}.value`))).join(" ");
}

/* -------------------------------------------------------------------------
 * The dispatcher.
 * ---------------------------------------------------------------------- */

/**
 * The sole recursive dispatcher (§5). Returns `null` exactly where the gem
 * returns nil from `to_asciimath` — a bare `FontStyle` with nothing in it —
 * because callers observe that nil (`Nary` falls back to `"int"` on it).
 */
function renderNode(node: MathNode, context: RenderContext): string | null {
  switch (node.kind) {
    /* ---- structure ---- */
    case "formula":
    case "mrow":
      return renderFormulaValue(node.value, context, node.kind);
    case "fenced": {
      const open = present(node.parameterOne)
        ? s(renderChild(node.parameterOne, context, "fenced.parameterOne"))
        : "(";
      const close = present(node.parameterThree)
        ? s(renderChild(node.parameterThree, context, "fenced.parameterThree"))
        : ")";
      const two = node.parameterTwo;
      let body = "";
      if (two !== null && two !== undefined) {
        if (!Array.isArray(two)) {
          throw new RenderError(
            `fenced.parameterTwo: is ${describeSlot(two)}, not a list — the gem raises NoMethodError here`,
            FORMAT,
            node.kind,
          );
        }
        body = two.map((item) => s(renderChild(item, context, "fenced.parameterTwo"))).join(" ");
      }
      return `${open}${body}${close}`;
    }
    case "table":
      return renderTable(node, context);

    /* ---- leaves ---- */
    case "number":
      return node.value === null || node.value === undefined ? "" : String(node.value);
    case "symbol":
      return renderSymbol(node, context);
    case "text":
      return renderText(node.parameterOne);

    /* ---- carriers dispatching on the Ruby class they stand in for ---- */
    case "unaryFunction":
      return renderUnaryName(node, context);
    case "binaryFunction":
      return renderBinaryName(node, context);
    case "ternaryFunction": {
      if (!REACHABLE_TERNARY_NAMES.has(node.name)) throw unreachableName(node.kind, node.name);
      // `TernaryFunction#to_asciimath` — `PowerBase` adds nothing to it.
      const one = present(node.parameterOne)
        ? asciiWrap(node.parameterOne, context, "ternaryFunction.parameterOne")
        : "";
      const two = present(node.parameterTwo)
        ? `_${wrapped(node.parameterTwo, context, "ternaryFunction.parameterTwo")}`
        : "";
      const three = present(node.parameterThree)
        ? `^${wrapped(node.parameterThree, context, "ternaryFunction.parameterThree")}`
        : "";
      return `${one}${two}${three}`;
    }
    case "fontStyle":
      return renderFontStyle(node, context);

    /* ---- named binary shapes with their own to_asciimath ---- */
    case "base": {
      const one = present(node.parameterOne)
        ? s(renderChild(node.parameterOne, context, "base.parameterOne"))
        : "";
      const two = present(node.parameterTwo)
        ? `_${wrapped(node.parameterTwo, context, "base.parameterTwo")}`
        : "";
      return `${one}${two}`;
    }
    case "frac": {
      const one = present(node.parameterOne)
        ? `(${s(renderChild(node.parameterOne, context, "frac.parameterOne"))})`
        : "";
      const two = present(node.parameterTwo)
        ? `(${s(renderChild(node.parameterTwo, context, "frac.parameterTwo"))})`
        : "";
      return `frac${one}${two}`;
    }
    case "overset":
    case "underset":
      // No override of their own: `BinaryFunction#to_asciimath` with the class name.
      return `${kindClassName(node.kind)}${wrapped(node.parameterOne, context, `${node.kind}.parameterOne`)}${wrapped(node.parameterTwo, context, `${node.kind}.parameterTwo`)}`;
    case "color": {
      // `"color(#{one&.gsub(/\s/, '')})(#{two})"` — both slots always wrapped.
      const one =
        node.parameterOne === null || node.parameterOne === undefined
          ? ""
          : stripRubyWhitespace(s(renderChild(node.parameterOne, context, "color.parameterOne")));
      const two =
        node.parameterTwo === null || node.parameterTwo === undefined
          ? ""
          : s(renderChild(node.parameterTwo, context, "color.parameterTwo"));
      return `color(${one})(${two})`;
    }

    /* ---- the big operators: subsup prefix, ` third`, Ruby strip ---- */
    case "int":
    case "oint":
    case "sum":
    case "prod": {
      const name = kindClassName(node.kind);
      const one = present(node.parameterOne)
        ? `_${wrapped(node.parameterOne, context, `${name}.parameterOne`)}`
        : "";
      const two = present(node.parameterTwo)
        ? `^${wrapped(node.parameterTwo, context, `${name}.parameterTwo`)}`
        : "";
      const three =
        node.parameterThree === null || node.parameterThree === undefined
          ? ""
          : s(renderChild(node.parameterThree, context, `${name}.parameterThree`));
      return rubyStrip(`${name}${one}${two} ${three}`);
    }
    case "nary": {
      // `Nary#to_asciimath`: nil first value falls back to "int" — including
      // a first value whose own render is Ruby-nil (`|| "int"`).
      const first =
        node.parameterOne === null || node.parameterOne === undefined
          ? "int"
          : (renderChild(node.parameterOne, context, "nary.parameterOne") ?? "int");
      const second = present(node.parameterTwo)
        ? `_(${s(renderChild(node.parameterTwo, context, "nary.parameterTwo"))})`
        : "";
      const third = present(node.parameterThree)
        ? `^(${s(renderChild(node.parameterThree, context, "nary.parameterThree"))})`
        : "";
      const fourth = present(node.parameterFour)
        ? ` ${s(renderChild(node.parameterFour, context, "nary.parameterFour"))}`
        : "";
      return `${first}${second}${third}${fourth}`;
    }

    /* ---- unary shapes with their own to_asciimath ---- */
    case "obrace":
    case "ubrace":
    case "bar":
    case "hat":
      // `"#{name}(#{parameter_one.to_asciimath})"` — strict, so a list crashes
      // here where the default unary path would have joined it.
      return present(node.parameterOne)
        ? `${kindClassName(node.kind)}(${s(renderChild(node.parameterOne, context, `${node.kind}.parameterOne`))})`
        : kindClassName(node.kind);
    case "ul":
      // `Ul#to_asciimath` spells its class name "underline" (`ul.rb:56`).
      return present(node.parameterOne)
        ? `underline(${s(renderChild(node.parameterOne, context, "ul.parameterOne"))})`
        : "underline";
    case "norm":
      // `Norm#to_asciimath`: a Table keeps its own brackets, no parens added.
      if (slotKind(node.parameterOne) === "table") {
        return `norm${s(renderChild(node.parameterOne, context, "norm.parameterOne"))}`;
      }
      return renderUnaryDefault("norm", node.parameterOne, context);
    case "mpadded":
      // `Mpadded#to_asciimath` is `asciimath_value` alone — no name, no parens.
      return asciimathValue(node.parameterOne, context, "mpadded.parameterOne");
    case "linebreak":
      return renderLinebreak(node, context);

    /* ---- plain unary defaults ---- */
    case "abs":
    case "ceil":
    case "floor":
    case "sqrt":
    case "dot":
    case "ddot":
    case "tilde":
    case "vec":
    case "overleftrightarrow":
      return renderUnaryDefault(kindClassName(node.kind), node.parameterOne, context);

    default: {
      // Compile-time exhaustiveness; at runtime the entry validator has
      // already rejected unknown kinds, but the guard stays (§5).
      const unreachable: never = node;
      throw new RenderError(
        `Unknown node kind "${(unreachable as { kind: string }).kind}"`,
        FORMAT,
        (unreachable as { kind: string }).kind,
      );
    }
  }
}

/* -------------------------------------------------------------------------
 * Renderer-private helpers (§5: deep-structure behaviour lives here).
 * ---------------------------------------------------------------------- */

function unreachableName(kind: string, name: string): RenderError {
  return new RenderError(
    `No measured asciimath rendering for ${kind} name "${name}" — it is not ` +
      "reachable from the AsciiMath transform, and the gem class may override " +
      "to_asciimath. Rendering a carrier default instead would diverge silently.",
    FORMAT,
    kind,
  );
}

/**
 * `UnaryFunction#to_asciimath`: `#{class_name}#{value}`, where the value
 * keeps its parens unless the name is in `UNARY_CLASSES`, and a nil
 * parameter contributes nothing at all.
 */
function renderUnaryDefault(
  className: string,
  parameterOne: NodeParameter | undefined,
  context: RenderContext,
): string {
  const at = `${className}.parameterOne`;
  if (UNARY_KEYWORDS.has(className))
    return `${className}${asciimathValue(parameterOne, context, at)}`;
  if (present(parameterOne)) return `${className}(${asciimathValue(parameterOne, context, at)})`;
  return className;
}

function renderUnaryName(
  node: MathNode & { readonly kind: "unaryFunction" },
  context: RenderContext,
): string {
  const name = node.name;
  switch (name) {
    case "Left":
    case "Right": {
      // `"left#{parameter_one}"` — plain interpolation, no recursion. A node
      // here would interpolate Ruby's default inspect (an object address),
      // which no byte-level port can reproduce; it raises instead (recorded
      // in TODO.plan/deferred.md).
      const keyword = name.toLowerCase();
      const paren = node.parameterOne;
      if (paren === null || paren === undefined) return keyword;
      if (typeof paren === "string") return `${keyword}${paren}`;
      throw new RenderError(
        `${keyword}.parameterOne: holds ${describeSlot(paren)}; the gem interpolates ` +
          "a nondeterministic #inspect address here, which cannot be reproduced",
        FORMAT,
        node.kind,
      );
    }
    case "Lcm":
      // `"lcm #{asciimath_value}"` — a space, not parentheses (`lcm.rb`).
      return present(node.parameterOne)
        ? `lcm ${asciimathValue(node.parameterOne, context, "lcm.parameterOne")}`
        : "lcm";
    case "Tr": {
      // `"[#{tds.join(', ')}]"` — strict elements (`tr.rb:16-21`).
      const cells = node.parameterOne;
      if (!Array.isArray(cells)) {
        throw new RenderError(
          `tr.parameterOne: is ${describeSlot(cells)}, not a list — the gem raises NoMethodError here`,
          FORMAT,
          node.kind,
        );
      }
      return `[${cells.map((cell) => s(renderChild(cell, context, "tr.parameterOne"))).join(", ")}]`;
    }
    default:
      if (!REACHABLE_UNARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      return renderUnaryDefault(name.toLowerCase(), node.parameterOne, context);
  }
}

function renderBinaryName(
  node: MathNode & { readonly kind: "binaryFunction" },
  context: RenderContext,
): string {
  const name = node.name;
  switch (name) {
    case "Power": {
      // `parameter_one.to_asciimath` is unguarded in the gem (`power.rb:13`).
      const base = renderChild(node.parameterOne ?? null, context, "power.parameterOne");
      const exponent = present(node.parameterTwo)
        ? `^${wrapped(node.parameterTwo, context, "power.parameterTwo")}`
        : "";
      return `${s(base)}${exponent}`;
    }
    case "Mod": {
      // `"#{one} mod #{two}"` — nil-safe on both sides, never stripped.
      const one =
        node.parameterOne === null || node.parameterOne === undefined
          ? ""
          : s(renderChild(node.parameterOne, context, "mod.parameterOne"));
      const two =
        node.parameterTwo === null || node.parameterTwo === undefined
          ? ""
          : s(renderChild(node.parameterTwo, context, "mod.parameterTwo"));
      return `${one} mod ${two}`;
    }
    case "Td": {
      // `Td#to_asciimath`: nil-safe cells joined with " "; a formula cell
      // gets `table: true` merged into the options (`td.rb:133-141`) — the
      // one place the context axis flips.
      const cells = node.parameterOne;
      if (!Array.isArray(cells)) {
        throw new RenderError(
          `td.parameterOne: is ${describeSlot(cells)}, not a list — the gem raises NoMethodError here`,
          FORMAT,
          node.kind,
        );
      }
      return cells
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          const kind = slotKind(cell as NodeParameter);
          const cellContext = kind === "formula" || kind === "mrow" ? TABLE_CONTEXT : context;
          return s(renderChild(cell, cellContext, "td.parameterOne"));
        })
        .join(" ");
    }
    case "Lim":
    case "Log": {
      const keyword = name.toLowerCase();
      const one = present(node.parameterOne)
        ? `_${wrapped(node.parameterOne, context, `${keyword}.parameterOne`)}`
        : "";
      const two = present(node.parameterTwo)
        ? `^${wrapped(node.parameterTwo, context, `${keyword}.parameterTwo`)}`
        : "";
      return `${keyword}${one}${two}`;
    }
    case "Stackrel":
      return `stackrel${stackrelWrapped(node.parameterOne, context, "stackrel.parameterOne")}${stackrelWrapped(node.parameterTwo, context, "stackrel.parameterTwo")}`;
    default:
      if (!REACHABLE_BINARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      // `BinaryFunction#to_asciimath` — of the reachable names only `Root`
      // lands here, and it has no override.
      return `${name.toLowerCase()}${wrapped(node.parameterOne, context, `${name}.parameterOne`)}${wrapped(node.parameterTwo, context, `${name}.parameterTwo`)}`;
  }
}

function renderFontStyle(
  node: MathNode & { readonly kind: "fontStyle" },
  context: RenderContext,
): string | null {
  const keyword = node.name === undefined ? undefined : FONT_STYLE_KEYWORDS.get(node.name);
  if (keyword !== undefined) {
    const body =
      node.parameterOne === null || node.parameterOne === undefined
        ? ""
        : s(renderChild(node.parameterOne, context, "fontStyle.parameterOne"));
    return `${keyword}(${body})`;
  }
  // `FontStyle#to_asciimath` is `parameter_one&.to_asciimath` — including the
  // six subclasses without an override. Nil in, Ruby-nil out: the caller
  // decides what nil means (`Nary` → "int", interpolation → "").
  if (node.parameterOne === null || node.parameterOne === undefined) return null;
  return renderChild(node.parameterOne, context, "fontStyle.parameterOne");
}

function renderSymbol(
  node: MathNode & { readonly kind: "symbol" },
  context: RenderContext,
): string {
  // A plain object without an id is the base class, exactly as the
  // constructor's default makes it.
  const id = node.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
  if (VALUE_RENDERED_SYMBOL_IDS.has(id)) {
    // `Symbols::Symbol#to_asciimath`: `value.nil? ? "" : value`. `Paren`
    // inherits it unchanged (measured).
    return node.value === null || node.value === undefined ? "" : String(node.value);
  }
  const exception = SYMBOL_EXCEPTIONS.get(id);
  if (exception !== undefined) {
    const axes: Record<string, boolean> = { table: context.table };
    for (const variant of exception.variants) {
      if (
        Object.entries(variant.when).every(([axis, expected]) => {
          const actual = axes[axis];
          if (actual === undefined) {
            throw new RenderError(
              `symbol "${id}": exception matrix names axis "${axis}", which this renderer does not model`,
              FORMAT,
              node.kind,
            );
          }
          return actual === expected;
        })
      ) {
        return variant.value;
      }
    }
    // No variant claimed this context; fall through to the static value.
  }
  const literal = ASCIIMATH_SYMBOLS.get(id);
  if (literal === undefined) throw new MissingSymbolDataError(id, FORMAT);
  return literal;
}

function renderText(parameterOne: NodeParameter | undefined): string {
  // `"\"#{parse_text('asciimath') || parameter_one}\""` — for asciimath,
  // parse_text only unwraps `unicode[:name]` tokens to their names. nil
  // interpolates to nothing; anything but a string dies in `gsub`.
  if (parameterOne === null || parameterOne === undefined) return '""';
  if (typeof parameterOne !== "string") {
    throw new RenderError(
      `text.parameterOne: holds ${describeSlot(parameterOne)} — the gem raises NoMethodError here`,
      FORMAT,
      "text",
    );
  }
  return `"${parameterOne.replace(/unicode\[:(\w+)\]/g, "$1")}"`;
}

function renderLinebreak(
  node: MathNode & { readonly kind: "linebreak" },
  context: RenderContext,
): string {
  const lineBreak = "\\\n ";
  if (!present(node.parameterOne)) return lineBreak;
  const attributes = node.attributes;
  if (attributes === null || attributes === undefined) {
    throw new RenderError(
      "linebreak.attributes: missing — the gem reads attributes[:linebreakstyle] and raises NoMethodError on nil",
      FORMAT,
      node.kind,
    );
  }
  const value = asciimathValue(node.parameterOne, context, "linebreak.parameterOne");
  if (attributes.linebreakstyle === "after") return `${value}${lineBreak}`;
  return `${lineBreak}${value}`;
}

function renderTable(node: MathNode & { readonly kind: "table" }, context: RenderContext): string {
  const className = node.name === undefined ? "table" : node.name.toLowerCase();

  if (className === "matrix") {
    // `Matrix#to_asciimath` — strict rows, unlike `parentheless_table`.
    if (!Array.isArray(node.value)) {
      throw new RenderError(
        `table.value: is ${describeSlot(node.value)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    const rows = node.value.map((row) => s(renderChild(row, context, "table.value"))).join(", ");
    return `{:${rows}:}`;
  }

  if (PARENTHELESS_TABLE_NAMES.has(className)) {
    // `parentheless_table` — nil-safe rows (`table.rb:379-383`).
    if (!Array.isArray(node.value)) {
      throw new RenderError(
        `table.value: is ${describeSlot(node.value)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    const rows = node.value
      .map((row) =>
        row === null || row === undefined ? "" : s(renderChild(row, context, "table.value")),
      )
      .join(", ");
    return `{:${rows}:}`;
  }

  // `Table#to_asciimath` — `value&.map { |val| val&.to_asciimath }&.join(", ")`.
  let rows = "";
  if (node.value !== null && node.value !== undefined) {
    if (!Array.isArray(node.value)) {
      throw new RenderError(
        `table.value: is ${describeSlot(node.value)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    rows = node.value
      .map((row) =>
        row === null || row === undefined ? "" : s(renderChild(row, context, "table.value")),
      )
      .join(", ");
  }
  const open =
    node.openParen === null || node.openParen === undefined
      ? "["
      : s(renderChild(node.openParen, context, "table.openParen"));
  const close =
    node.closeParen === null || node.closeParen === undefined
      ? (TABLE_CLOSE_FALLBACK.get(open) ?? "")
      : s(renderChild(node.closeParen, context, "table.closeParen"));
  return `${open}${rows}${close}`;
}
