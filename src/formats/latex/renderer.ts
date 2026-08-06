/**
 * The LaTeX renderer (ARCHITECTURE.md §4-5): a `MathNode` tree to LaTeX text,
 * byte-identical to the gem's `to_latex`.
 *
 * Structurally this mirrors `../asciimath/renderer.ts`: one recursive
 * dispatcher (`renderNode`) switching on `kind`, with the alias carriers
 * (`unaryFunction`, `binaryFunction`, `ternaryFunction`, `table`, `fontStyle`)
 * switching again on the carried class name. Every branch is measured off
 * live gem instances on the pinned oracle (plurimath 0.11.6, 00c52783,
 * 2026-08-06 — `probe_census.rb`/`probe_edges.rb`/`probe_tables.rb`), never
 * transliterated. The measured pins worth naming, because source-reading gets
 * each one wrong:
 *
 *   - `BinaryFunction#latex_wrapped` wraps a field in `{ \left ( … \right ) }`
 *     exactly when the field's `validate_function_formula` is true — which is
 *     the `Core` default. The classes answering false are a measured set
 *     (`PLAIN_WRAPPED_UNARY_NAMES` below): `\sin` stays plain but `\cancel`,
 *     `\ker`, `\liminf`, `\limsup` and `\sup` get the `\left (` wrap, and a
 *     formula answers false ONLY when it holds both a `Left` and a `Right`.
 *   - `Glb` and `Lcm` render with no backslash (`glb{x}`, `lcm{x}`); every
 *     other unary name gets `\\#{class_name}{…}` with arrays joined by " ".
 *   - `Bar`/`Hat`/`Obrace`/`Ubrace`/`Ul` guard their brace (`\overline` bare
 *     on nil) but CRASH on an array parameter; `Ceil` and the latex-value
 *     shapes accept arrays; `Floor` crashes on nil (`parameter_one.to_latex`
 *     is unguarded); `Norm` emits `\lVert` on BOTH sides (`norm.rb:14`).
 *   - `Int`/`Sum`/`Prod` interpolate `_{…}` plainly where `Oint` and `Log`
 *     go through `latex_wrapped` — measured, not guessed.
 *   - `Left`/`Right` map their stored paren through
 *     `Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert` with `.` on a miss —
 *     a node in the slot is a hash-lookup miss (`.`), never an inspect leak.
 *   - `Fenced` renders a `Paren`-classed slot via `to_latex` but any OTHER
 *     node contributes its raw `value` ivar — so a base `Symbol` slot skips
 *     `specific_values` while a base `Paren` slot applies it. A slot whose
 *     `value` is an array (formula, table) would interpolate Ruby's default
 *     `#inspect` (an object address); this port refuses those (RenderError).
 *   - A bare `Table` with a NIL open paren takes the gem's `environment ==
 *     "array"` path (`MATRICES.invert[nil]` is `:array`) and inserts a
 *     `{aa…|…}` column descriptor; with any open paren present it does not.
 *     `Paren::Norm` as open paren short-circuits to `\begin{Vmatrix}`.
 *   - Named tables: `Matrix`/`Align`/`Bmatrix`/`Multline`/`Pmatrix`/`Split`/
 *     `Vmatrix` render `\begin{env}` with env from the open paren's
 *     `to_matrices` (a five-row measured map; any other paren raises
 *     NoMethodError in the gem → RenderError here), falling back to the
 *     lowercased class name when the paren is nil. `Array` renders
 *     `\begin{array}{…}`; `Cases` and `Eqarray` have no override and take the
 *     generic path.
 *   - `Color#to_latex` renders its FIRST slot through `to_asciimath` (then
 *     strips `/\s/` — ASCII whitespace, the no-break space stays). This
 *     renderer duplicates the minimal asciimath fragment that path needs
 *     (base symbols, numbers, quoted text, formula joins, plus the two symbol
 *     ids the corpus+sweep exercise) rather than importing the asciimath
 *     format (§3); an unmeasured operand raises rather than diverging.
 *   - Where the gem CRASHES — a bare string in a formula's value, `Power`
 *     with no first parameter, `Text` holding a node, `Td`/`Tr` with a nil
 *     cell list, a table under the column-descriptor path with no first row —
 *     this port raises `RenderError`, the §5 runtime-boundary contract.
 *
 * LaTeX rendering has NO context axis: the generated exception matrix
 * (`src/generated/latex/exceptions.ts`) is empty — no symbol varies on any
 * manifested axis — so unlike the asciimath renderer there is no
 * `RenderContext` threading here. `test/formats/latex/renderer.spec.ts` pins
 * that emptiness so a regeneration that introduces variants fails loudly.
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
import { ASCIIMATH_TRANSFORM_GET_CLASS } from "../../generated/asciimath/transform-registry";
import {
  LATEX_ALIGNMENT_LETTERS,
  LATEX_COLOR_ASCIIMATH_SYMBOLS,
  LATEX_FONT_STYLE_COMMANDS,
  LATEX_LEFT_RIGHT_PARENS,
  LATEX_MATRIX_ENVIRONMENTS,
  LATEX_PLAIN_WRAPPED_UNARY_NAMES,
} from "../../generated/latex/render-tables";
import { LATEX_SYMBOLS } from "../../generated/latex/symbols";

const FORMAT = "latex";

/**
 * Renderer options. Empty today and typed exactly (§5): the gem's only
 * observable option on this path is a configured number formatter, which is
 * P4 scope — with none configured a number renders its raw value, and the
 * whole pinned corpus was generated that way.
 */
export type LatexOptions = Record<string, never>;

/**
 * `Formula#to_latex` / any node's `to_latex`, as a module function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 */
export function toLatex(node: MathNode, _options?: LatexOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  // `?? ""`: the renders that return nil in Ruby (a bare `FontStyle` or
  // `Mpadded` with a nil value, a base symbol with no value) map to "" at the
  // public string boundary, exactly as the asciimath entry does.
  return renderNode(node) ?? "";
}

/* -------------------------------------------------------------------------
 * Derived tables (from generated data — same derivations as the sibling).
 * ---------------------------------------------------------------------- */

function classBasename(rubyClass: string): string {
  return rubyClass.slice(rubyClass.lastIndexOf(":") + 1);
}

/**
 * The class names this renderer has measured behaviour for, per carrier —
 * exactly the AsciiMath-reachable set: every `get_class` name from the
 * generated reachability census, plus the classes the transform constructs
 * directly without `get_class` (`newPower`, `newMod`, `newPowerBase`,
 * `newTd`, `newTr` in `../asciimath/transform.ts`). A name outside its
 * carrier's set raises rather than rendering the carrier default, because the
 * gem class it denotes may override `to_latex` (see module docs).
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
 * Symbol ids rendered from their stored `value` rather than a class literal:
 * the `Symbol` base class itself, and the abstract `Paren` root — the two
 * ids the generated table deliberately omits. Both apply `specific_values`
 * (`symbols/symbol.rb:246`): `{:`/`:}` vanish, `{`/`}`/`_` get a backslash,
 * `if` becomes `\operatorname{if}`, and a nil value renders Ruby-nil.
 */
const VALUE_RENDERED_SYMBOL_IDS: ReadonlySet<string> = new Set(
  [NODE_SPECS.symbol.rubyClass, ...RUBY_ABSTRACT_CLASSES]
    .filter((rubyClass) => rubyClass.startsWith("Math::Symbols::"))
    .map(classBasename),
);

/* -------------------------------------------------------------------------
 * Measured module-level tables (generated: `src/generated/latex/
 * render-tables.ts`, emitted by scripts/generate-corpus.rb from live oracle
 * renders — each row independently pinned by renderer.spec.ts probes and by
 * the literal pins in test/generated/latex-render-tables.spec.ts).
 * ---------------------------------------------------------------------- */

/**
 * `Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert`, generated row by row
 * through `Left`/`Right` renders on the oracle. This is the complete
 * inverted constant — `&#x2016;` maps to `\|` because Ruby's `Hash#invert`
 * keeps the LAST key for a duplicated value — so any string missing here is
 * a genuine gem-side miss, which renders `.`.
 */
const LEFT_RIGHT_PARENS: ReadonlyMap<string, string> = LATEX_LEFT_RIGHT_PARENS;

/**
 * The unary names whose gem class answers `validate_function_formula` with
 * false, so `latex_wrapped` gives them plain braces. Generated per class
 * through `Overset.new(instance, …).to_latex` renders: 27 of the 34
 * reachable unary classes — NOT `Cancel`, `Ker`, `Liminf`, `Limsup` or
 * `Sup`, which take the `{ \left ( … \right ) }` wrap. `Left` and `Right`
 * also answer false (asserted at generation) and are listed with their own
 * dispatch. This is not `Utility::UNARY_CLASSES` (that set contains ker/
 * liminf/limsup/sup), so it cannot be derived from the generated registry.
 */
const PLAIN_WRAPPED_UNARY_NAMES: ReadonlySet<string> = new Set(LATEX_PLAIN_WRAPPED_UNARY_NAMES);

/**
 * The `FontStyle` subclasses that override `to_latex` with a `\math..`
 * wrapper, and the command each emits — generated from live renders of
 * every subclass; the other six subclasses and the bare carrier render
 * their value with no wrapper at all (nil in, Ruby-nil out).
 */
const FONT_STYLE_COMMANDS: ReadonlyMap<string, string> = LATEX_FONT_STYLE_COMMANDS;

/**
 * `Latex::Constants::MATRICES.invert[open_paren.to_matrices]` — which
 * environment a named table's open paren selects, generated through a
 * `Table::Matrix` render per paren. Only these five parens define
 * `to_matrices`; any other open paren raises NoMethodError in the gem
 * (verified at generation), RenderError here.
 */
const MATRIX_ENVIRONMENTS: ReadonlyMap<string, string> = LATEX_MATRIX_ENVIRONMENTS;

/** The table names rendering `\begin{env}…\end{env}` through that map. */
const MATRIX_STYLE_TABLE_NAMES: ReadonlySet<string> = new Set([
  "Matrix",
  "Align",
  "Bmatrix",
  "Multline",
  "Pmatrix",
  "Split",
  "Vmatrix",
]);

/**
 * `Utility::ALIGNMENT_LETTERS.invert`, generated through `Table::Array`
 * columnalign renders: left→l, right→r, center→c, anything else nil
 * (skipped in `array_args`, `[]` in `latex_columnalign`).
 */
const ALIGNMENT_LETTERS: ReadonlyMap<string, string> = LATEX_ALIGNMENT_LETTERS;

/**
 * The asciimath renders `Color#to_latex` needs for its first slot, for the
 * symbol ids the corpus+sweep actually put there — generated per id and
 * verified through a full Color render. Kept deliberately minimal — an id
 * outside this table raises a parity-gap RenderError rather than guessing —
 * because the full asciimath symbol table belongs to the asciimath format
 * (§3, no cross-format tables).
 */
const COLOR_ASCIIMATH_SYMBOLS: ReadonlyMap<string, string> = LATEX_COLOR_ASCIIMATH_SYMBOLS;

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

function isNode(value: unknown): value is MathNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const kind = (value as { readonly kind?: unknown }).kind;
  return typeof kind === "string" && Object.hasOwn(NODE_SPECS, kind);
}

/**
 * A strict `field.to_latex(options:)` call: only a node answers it.
 * Everything else — a bare string (which the gem's own parse of `""` or
 * `left(right)` puts into a formula's value), a list, a number, `null` where
 * Ruby wrote no `&.` — raises `NoMethodError` in the gem and `RenderError`
 * here. Returns `null` exactly where Ruby's `to_latex` returns nil (a bare
 * `FontStyle`/`Mpadded`, a base symbol with no value).
 */
function renderChild(value: unknown, at: string): string | null {
  if (isNode(value)) return renderNode(value);
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
 * `UnaryFunction#latex_value` (`unary_function.rb:221`): nil stays nil, a
 * list compacts and joins with " " (asciimath joins with "" — measured
 * difference), anything else renders directly.
 */
function latexValue(value: NodeParameter | undefined, at: string): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => s(renderChild(item, at)))
      .join(" ");
  }
  return renderChild(value, at);
}

/**
 * `Core#validate_function_formula`, per measured class (probe_census.rb
 * `wrapped/*`): true by default; false for symbols, numbers, text, the
 * brace/accent shapes (`Obrace`, `Ubrace`, `Hat`, `Tilde`), `Left`/`Right`,
 * the 27 plain unary names — and a formula holding BOTH a `Left` and a
 * `Right` (`formula.rb:298`: `value.none?(Left) || value.none?(Right)`).
 */
function validateFunctionFormula(field: MathNode): boolean {
  switch (field.kind) {
    case "symbol":
    case "number":
    case "text":
    case "obrace":
    case "ubrace":
    case "hat":
    case "tilde":
      return false;
    case "unaryFunction":
      if (field.name === "Left" || field.name === "Right") return false;
      return !PLAIN_WRAPPED_UNARY_NAMES.has(field.name);
    case "formula":
    case "mrow": {
      const value = field.value;
      if (!Array.isArray(value)) return true;
      const hasLeft = value.some(
        (item) =>
          slotKind(item) === "unaryFunction" && (item as { name?: unknown }).name === "Left",
      );
      const hasRight = value.some(
        (item) =>
          slotKind(item) === "unaryFunction" && (item as { name?: unknown }).name === "Right",
      );
      return !(hasLeft && hasRight);
    }
    default:
      return true;
  }
}

/**
 * `BinaryFunction#latex_wrapped` (`binary_function.rb:159`; the ternary and
 * `Oint`/`Log` copies are identical): render the field, then brace it —
 * with `\left ( … \right )` inside when the field validates as a
 * function-formula.
 */
function latexWrapped(field: NodeParameter | undefined, at: string): string {
  const rendered = s(renderChild(field, at));
  if (isNode(field) && validateFunctionFormula(field)) {
    return `{ \\left ( ${rendered} \\right ) }`;
  }
  return `{${rendered}}`;
}

/** `field&.to_latex` where the gem interpolates the nil away. */
function nilSafe(value: NodeParameter | undefined, at: string): string {
  if (value === null || value === undefined) return "";
  return s(renderChild(value, at));
}

/**
 * A formula's `value` list, joined: `value.map { to_latex }.join(" ")` —
 * strict per element, which is where the gem's own `left(right)` parse fails
 * to render (its value holds a bare `""`).
 */
function renderFormulaValue(value: unknown, at: string): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      at,
    );
  }
  return value.map((item) => s(renderChild(item, at))).join(" ");
}

/* -------------------------------------------------------------------------
 * The dispatcher.
 * ---------------------------------------------------------------------- */

/**
 * The sole recursive dispatcher (§5). Returns `null` exactly where the gem
 * returns nil from `to_latex` — a bare `FontStyle`/`Mpadded` with nothing in
 * it, a base symbol with no value — because callers observe that nil
 * (`Nary` falls back to `"\int"`, a table's open paren falls back to `.`).
 */
function renderNode(node: MathNode): string | null {
  switch (node.kind) {
    /* ---- structure ---- */
    case "formula":
    case "mrow":
      return renderFormulaValue(node.value, node.kind);
    case "fenced":
      return renderFenced(node);
    case "table":
      return renderTable(node);

    /* ---- leaves ---- */
    case "number":
      // `Formatter::Numbers::TextRenderer` with no formatter configured:
      // the raw value; nil renders "" (measured, number/nil).
      return node.value === null || node.value === undefined ? "" : String(node.value);
    case "symbol":
      return renderSymbol(node);
    case "text":
      return renderText(node.parameterOne);

    /* ---- carriers dispatching on the Ruby class they stand in for ---- */
    case "unaryFunction":
      return renderUnaryName(node);
    case "binaryFunction":
      return renderBinaryName(node);
    case "ternaryFunction": {
      if (!REACHABLE_TERNARY_NAMES.has(node.name)) throw unreachableName(node.kind, node.name);
      // `PowerBase#to_latex` (`power_base.rb:25`): `_{…}^{…}` are BOTH always
      // present, whatever is nil; the first slot is never braced.
      const one = present(node.parameterOne)
        ? renderChild(node.parameterOne, "ternaryFunction.parameterOne")
        : null;
      const two = present(node.parameterTwo)
        ? renderChild(node.parameterTwo, "ternaryFunction.parameterTwo")
        : null;
      const three = present(node.parameterThree)
        ? renderChild(node.parameterThree, "ternaryFunction.parameterThree")
        : null;
      return `${s(one)}_{${s(two)}}^{${s(three)}}`;
    }
    case "fontStyle":
      return renderFontStyle(node);

    /* ---- named binary shapes with their own to_latex ---- */
    case "base": {
      // `Base#to_latex` (`base.rb:55`): `_{…}` always; a Formula first slot
      // (Mrow and Mstyle included) gets braced.
      let one = present(node.parameterOne)
        ? renderChild(node.parameterOne, "base.parameterOne")
        : null;
      const oneKind = slotKind(node.parameterOne);
      if (oneKind === "formula" || oneKind === "mrow") one = `{${s(one)}}`;
      const two = present(node.parameterTwo)
        ? renderChild(node.parameterTwo, "base.parameterTwo")
        : null;
      return `${s(one)}_{${s(two)}}`;
    }
    case "frac":
      // `"\\frac{#{one}}{#{two}}"`, nil-safe on both (`frac.rb:53`).
      return `\\frac{${nilSafe(node.parameterOne, "frac.parameterOne")}}{${nilSafe(node.parameterTwo, "frac.parameterTwo")}}`;
    case "overset":
    case "underset":
      // No override of their own: `BinaryFunction#to_latex` with the class
      // name — `latex_wrapped` per present field.
      return `\\${kindClassName(node.kind)}${
        present(node.parameterOne)
          ? latexWrapped(node.parameterOne, `${node.kind}.parameterOne`)
          : ""
      }${present(node.parameterTwo) ? latexWrapped(node.parameterTwo, `${node.kind}.parameterTwo`) : ""}`;
    case "color":
      return renderColor(node);

    /* ---- the big operators: subsup prefix, ` third`, Ruby strip ---- */
    case "int":
    case "sum":
    case "prod":
    case "oint": {
      const name = kindClassName(node.kind);
      // Int/Sum/Prod interpolate `_{…}` plainly; Oint alone goes through
      // latex_wrapped (measured: nary-op/Oint/formula-sub).
      const wrap = (slot: NodeParameter | undefined, mark: string, at: string): string => {
        if (!present(slot)) return "";
        if (node.kind === "oint") return `${mark}${latexWrapped(slot, at)}`;
        return `${mark}{${s(renderChild(slot, at))}}`;
      };
      const one = wrap(node.parameterOne, "_", `${name}.parameterOne`);
      const two = wrap(node.parameterTwo, "^", `${name}.parameterTwo`);
      const three = nilSafe(node.parameterThree, `${name}.parameterThree`);
      return rubyStrip(`\\${name}${one}${two} ${three}`);
    }
    case "nary": {
      // `Nary#to_latex` (`nary.rb:41`): nil first value falls back to
      // "\int" — including a first value whose own render is Ruby-nil.
      const first =
        node.parameterOne === null || node.parameterOne === undefined
          ? "\\int"
          : (renderChild(node.parameterOne, "nary.parameterOne") ?? "\\int");
      const second = present(node.parameterTwo)
        ? `_{${s(renderChild(node.parameterTwo, "nary.parameterTwo"))}}`
        : "";
      const third = present(node.parameterThree)
        ? `^{${s(renderChild(node.parameterThree, "nary.parameterThree"))}}`
        : "";
      const fourth = present(node.parameterFour)
        ? ` ${s(renderChild(node.parameterFour, "nary.parameterFour"))}`
        : "";
      return `${first}${second}${third}${fourth}`;
    }

    /* ---- unary shapes with their own to_latex ---- */
    case "obrace":
    case "ubrace":
    case "bar":
    case "hat":
    case "ul": {
      // `"\\overbrace#{"{…}" if parameter_one}"` — a strict single render, so
      // an array parameter crashes here (measured) where latex_value shapes
      // would have joined it.
      const commands: Record<typeof node.kind, string> = {
        obrace: "\\overbrace",
        ubrace: "\\underbrace",
        bar: "\\overline",
        hat: "\\hat",
        ul: "\\underline",
      };
      const command = commands[node.kind];
      return present(node.parameterOne)
        ? `${command}{${s(renderChild(node.parameterOne, `${node.kind}.parameterOne`))}}`
        : command;
    }
    case "norm":
      // `\lVert` on BOTH sides (`norm.rb:14`), nil-safe single render.
      return `{\\lVert ${nilSafe(node.parameterOne, "norm.parameterOne")} \\lVert}`;
    case "ceil":
      // `latex_value` — nil interpolates to "", arrays join (`ceil.rb:9`).
      return `{\\lceil ${s(latexValue(node.parameterOne, "ceil.parameterOne"))} \\rceil}`;
    case "floor":
      // `parameter_one.to_latex` is unguarded (`floor.rb:10`) — nil crashes.
      return `{\\lfloor ${s(renderChild(node.parameterOne ?? null, "floor.parameterOne"))} \\rfloor}`;
    case "mpadded":
      // `Mpadded#to_latex` is `latex_value` alone — Ruby-nil out on nil in.
      return latexValue(node.parameterOne, "mpadded.parameterOne");
    case "linebreak":
      return renderLinebreak(node);

    /* ---- plain latex_value unary defaults ---- */
    case "abs":
    case "sqrt":
    case "dot":
    case "ddot":
    case "tilde":
    case "vec":
    case "overleftrightarrow":
      return `\\${kindClassName(node.kind)}{${s(latexValue(node.parameterOne, `${node.kind}.parameterOne`))}}`;

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
    `No measured latex rendering for ${kind} name "${name}" — it is not ` +
      "reachable from the AsciiMath transform, and the gem class may override " +
      "to_latex. Rendering a carrier default instead would diverge silently.",
    FORMAT,
    kind,
  );
}

function renderUnaryName(node: MathNode & { readonly kind: "unaryFunction" }): string {
  const name = node.name;
  switch (name) {
    case "Left":
    case "Right": {
      // `"\\left #{latex_paren}"` (`left.rb:30`): the stored paren through
      // the inverted constant, `.` on any miss — including a NODE in the
      // slot, which is a hash-lookup miss in Ruby (measured), so unlike the
      // asciimath side there is no inspect leak to refuse.
      const keyword = name === "Left" ? "\\left" : "\\right";
      const paren = node.parameterOne;
      const mapped = typeof paren === "string" ? (LEFT_RIGHT_PARENS.get(paren) ?? ".") : ".";
      return `${keyword} ${mapped}`;
    }
    case "Glb":
    case "Lcm":
      // `"glb{…}"`, `"lcm{…}"` — no backslash (`glb.rb:11`, `lcm.rb:25`).
      return `${name.toLowerCase()}{${s(latexValue(node.parameterOne, `${name.toLowerCase()}.parameterOne`))}}`;
    case "Tr":
      return renderTr(node);
    default:
      if (!REACHABLE_UNARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      // `UnaryFunction#to_latex` (`unary_function.rb:61`).
      return `\\${name.toLowerCase()}{${s(latexValue(node.parameterOne, `${name.toLowerCase()}.parameterOne`))}}`;
  }
}

function renderBinaryName(node: MathNode & { readonly kind: "binaryFunction" }): string {
  const name = node.name;
  switch (name) {
    case "Power": {
      // `parameter_one.to_latex` is unguarded (`power.rb:36`); `^{…}` is
      // always appended, a nil exponent leaving `^{}` (measured).
      const base = renderChild(node.parameterOne ?? null, "power.parameterOne");
      const exponent = present(node.parameterTwo)
        ? renderChild(node.parameterTwo, "power.parameterTwo")
        : null;
      return `${s(base)}^{${s(exponent)}}`;
    }
    case "Mod": {
      // `"#{first} \\mod #{second}"` where each side is `{…}` only when
      // present (`mod.rb:50`).
      const one = present(node.parameterOne)
        ? `{${s(renderChild(node.parameterOne, "mod.parameterOne"))}}`
        : "";
      const two = present(node.parameterTwo)
        ? `{${s(renderChild(node.parameterTwo, "mod.parameterTwo"))}}`
        : "";
      return `${one} \\mod ${two}`;
    }
    case "Td":
      return renderTd(node);
    case "Lim": {
      // Plain `_{…}`/`^{…}` (`lim.rb:25`) — no latex_wrapped.
      const one = present(node.parameterOne)
        ? `_{${s(renderChild(node.parameterOne, "lim.parameterOne"))}}`
        : "";
      const two = present(node.parameterTwo)
        ? `^{${s(renderChild(node.parameterTwo, "lim.parameterTwo"))}}`
        : "";
      return `\\lim${one}${two}`;
    }
    case "Log": {
      // `_#{latex_wrapped(…)}` (`log.rb:44`) — measured against Lim's plain
      // braces.
      const one = present(node.parameterOne)
        ? `_${latexWrapped(node.parameterOne, "log.parameterOne")}`
        : "";
      const two = present(node.parameterTwo)
        ? `^${latexWrapped(node.parameterTwo, "log.parameterTwo")}`
        : "";
      return `\\log${one}${two}`;
    }
    case "Root":
      // `"\\sqrt[#{one}]{#{two}}"`, nil-safe (`root.rb:24`).
      return `\\sqrt[${nilSafe(node.parameterOne, "root.parameterOne")}]{${nilSafe(node.parameterTwo, "root.parameterTwo")}}`;
    default:
      if (!REACHABLE_BINARY_NAMES.has(name)) throw unreachableName(node.kind, name);
      // `BinaryFunction#to_latex` (`binary_function.rb:48`) — of the
      // reachable names only `Stackrel` lands here, and it has no override.
      return `\\${name.toLowerCase()}${
        present(node.parameterOne) ? latexWrapped(node.parameterOne, `${name}.parameterOne`) : ""
      }${present(node.parameterTwo) ? latexWrapped(node.parameterTwo, `${name}.parameterTwo`) : ""}`;
  }
}

function renderFontStyle(node: MathNode & { readonly kind: "fontStyle" }): string | null {
  const command = node.name === undefined ? undefined : FONT_STYLE_COMMANDS.get(node.name);
  if (command !== undefined) {
    // `"\\mathbf{#{parameter_one&.to_latex}}"` — nil-safe (`bold.rb:17`).
    return `${command}{${nilSafe(node.parameterOne, "fontStyle.parameterOne")}}`;
  }
  // `FontStyle#to_latex` is `parameter_one&.to_latex` (`font_style.rb:53`) —
  // including the six subclasses without an override. Nil in, Ruby-nil out.
  if (node.parameterOne === null || node.parameterOne === undefined) return null;
  return renderChild(node.parameterOne, "fontStyle.parameterOne");
}

function renderSymbol(node: MathNode & { readonly kind: "symbol" }): string | null {
  // A plain object without an id is the base class, exactly as the
  // constructor's default makes it.
  const id = node.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
  if (VALUE_RENDERED_SYMBOL_IDS.has(id)) {
    // `Symbols::Symbol#to_latex` (`symbols/symbol.rb:56`): `specific_values`
    // first, then the raw value — nil stays Ruby-nil. `Paren` inherits it
    // unchanged (measured).
    const value = node.value;
    if (value === null || value === undefined) return null;
    const text = String(value);
    if (text === "{:" || text === ":}") return "";
    if (text === "{" || text === "}" || text === "_") return `\\${text}`;
    if (text === "if") return "\\operatorname{if}";
    return text;
  }
  const literal = LATEX_SYMBOLS.get(id);
  if (literal === undefined) throw new MissingSymbolDataError(id, FORMAT);
  return literal;
}

function renderText(parameterOne: NodeParameter | undefined): string {
  // `"\\text{#{parse_text('latex') || parameter_one}}"` — for latex,
  // parse_text only unwraps `unicode[:name]` tokens to their names. nil
  // interpolates to nothing; anything but a string dies in `gsub`.
  if (parameterOne === null || parameterOne === undefined) return "\\text{}";
  if (typeof parameterOne !== "string") {
    throw new RenderError(
      `text.parameterOne: holds ${describeSlot(parameterOne)} — the gem raises NoMethodError here`,
      FORMAT,
      "text",
    );
  }
  return `\\text{${parameterOne.replace(/unicode\[:(\w+)\]/g, "$1")}}`;
}

function renderLinebreak(node: MathNode & { readonly kind: "linebreak" }): string {
  const lineBreak = "\\\\ ";
  if (!present(node.parameterOne)) return lineBreak;
  const attributes = node.attributes;
  if (attributes === null || attributes === undefined) {
    throw new RenderError(
      "linebreak.attributes: missing — the gem reads attributes[:linebreakstyle] and raises NoMethodError on nil",
      FORMAT,
      node.kind,
    );
  }
  const value = s(latexValue(node.parameterOne, "linebreak.parameterOne"));
  if (attributes.linebreakstyle === "after") return `${value}${lineBreak}`;
  return `${lineBreak}${value}`;
}

/* ---- color: the one render that crosses into asciimath ------------------ */

function renderColor(node: MathNode & { readonly kind: "color" }): string {
  // `Color#to_latex` (`color.rb:41`): the first slot through to_asciimath
  // with `/\s/` stripped; the second through to_latex; both nil-safe.
  const one =
    node.parameterOne === null || node.parameterOne === undefined
      ? ""
      : stripRubyWhitespace(s(colorAsciimathValue(node.parameterOne, "color.parameterOne")));
  const two = nilSafe(node.parameterTwo, "color.parameterTwo");
  return `{\\color{${one}} ${two}}`;
}

/**
 * The minimal `to_asciimath` fragment `Color`'s first slot needs, duplicated
 * from the asciimath renderer rather than imported (§3; see module docs).
 * Every branch is oracle-measured (probe_tables.rb `color/*`); an operand
 * outside them is a parity gap and raises.
 */
function colorAsciimathValue(value: unknown, at: string): string | null {
  if (!isNode(value)) {
    throw new RenderError(
      `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
      FORMAT,
      "color",
    );
  }
  switch (value.kind) {
    case "symbol": {
      const id = value.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
      if (VALUE_RENDERED_SYMBOL_IDS.has(id)) {
        // `Symbols::Symbol#to_asciimath`: `value.nil? ? "" : value`.
        return value.value === null || value.value === undefined ? "" : String(value.value);
      }
      const literal = COLOR_ASCIIMATH_SYMBOLS.get(id);
      if (literal !== undefined) return literal;
      throw new RenderError(
        `color.parameterOne: no measured asciimath value for symbol id "${id}" — ` +
          "the gem renders this slot through to_asciimath, and this renderer " +
          "carries only the measured slice (see COLOR_ASCIIMATH_SYMBOLS).",
        FORMAT,
        "color",
      );
    }
    case "number":
      return value.value === null || value.value === undefined ? "" : String(value.value);
    case "text": {
      // `Text#to_asciimath`: quoted, `unicode[:name]` unwrapped.
      const text = value.parameterOne;
      if (text === null || text === undefined) return '""';
      if (typeof text !== "string") {
        throw new RenderError(
          `${at}: text holds ${describeSlot(text)} — the gem raises NoMethodError here`,
          FORMAT,
          "color",
        );
      }
      return `"${text.replace(/unicode\[:(\w+)\]/g, "$1")}"`;
    }
    case "formula":
    case "mrow": {
      const list = value.value;
      if (!Array.isArray(list)) {
        throw new RenderError(
          `${at}.value: is ${describeSlot(list)}, not a list — the gem raises NoMethodError here`,
          FORMAT,
          "color",
        );
      }
      return list.map((item) => s(colorAsciimathValue(item, `${at}.value`))).join(" ");
    }
    default:
      throw new RenderError(
        `color.parameterOne: no measured asciimath rendering for a "${value.kind}" node — ` +
          "the gem renders this slot through to_asciimath, and this renderer " +
          "carries only the measured fragment (see colorAsciimathValue).",
        FORMAT,
        "color",
      );
  }
}

/* ---- fenced ------------------------------------------------------------- */

function renderFenced(node: MathNode & { readonly kind: "fenced" }): string {
  const open = latexParen(fencedSlotValue(node.parameterOne, "fenced.parameterOne"));
  const close = latexParen(fencedSlotValue(node.parameterThree, "fenced.parameterThree"));
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
    body = two.map((item) => s(renderChild(item, "fenced.parameterTwo"))).join(" ");
  }
  return `${open} ${body} ${close}`;
}

/**
 * `Fenced#symbol_or_paren(field, lang: :latex)` (`fenced.rb:324`): a
 * `Paren`-classed field renders via `to_latex` (specific_values included for
 * the abstract base); any OTHER field contributes its raw `value` ivar — a
 * base `Symbol`'s stored string, a number's digits, a text's string. Fields
 * whose `value` is a node list (formula, mrow, table) would interpolate
 * Ruby's default `#inspect` — an object address no byte-level port can
 * reproduce — so those raise instead (recorded in TODO.plan/deferred.md);
 * fields with no `value` method raise NoMethodError in the gem.
 */
function fencedSlotValue(field: NodeParameter | undefined, at: string): string | null {
  if (field === null || field === undefined) return null;
  if (!isNode(field)) {
    throw new RenderError(
      `${at}: cannot read a paren from ${describeSlot(field)} — the gem raises NoMethodError here`,
      FORMAT,
      "fenced",
    );
  }
  switch (field.kind) {
    case "symbol": {
      const id = field.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
      if (id === "Paren" || id.startsWith("Paren::")) return renderSymbol(field);
      return field.value === null || field.value === undefined ? null : String(field.value);
    }
    case "number":
      return field.value === null || field.value === undefined ? null : String(field.value);
    case "text": {
      const text = field.parameterOne;
      if (text === null || text === undefined) return null;
      if (typeof text === "string") return text;
      throw new RenderError(
        `${at}: text holds ${describeSlot(text)}; the gem interpolates a ` +
          "nondeterministic #inspect here, which cannot be reproduced",
        FORMAT,
        "fenced",
      );
    }
    case "formula":
    case "mrow":
    case "table":
      throw new RenderError(
        `${at}: holds a "${field.kind}" node, whose value is a list; the gem ` +
          "interpolates a nondeterministic #inspect address here, which cannot be reproduced",
        FORMAT,
        "fenced",
      );
    default:
      throw new RenderError(
        `${at}: a "${field.kind}" node has no value ivar — the gem raises NoMethodError here`,
        FORMAT,
        "fenced",
      );
  }
}

/** `Fenced#latex_paren` (`fenced.rb:246`): nil → "", `{:`/`:}` lose the colon. */
function latexParen(paren: string | null): string {
  if (paren === null) return "";
  if (paren === "{:" || paren === ":}") return paren.replace(/:/g, "");
  return paren;
}

/* ---- tables ------------------------------------------------------------- */

/**
 * `Utility.symbol_value(obj, "|")` (`utility.rb:202`): a `Paren::Vert`
 * instance, or any symbol whose stored value is `"|"`.
 */
function isPipeSymbol(value: unknown): boolean {
  if (!isNode(value) || value.kind !== "symbol") return false;
  return value.id === "Paren::Vert" || value.value === "|";
}

function renderTd(node: MathNode & { readonly kind: "binaryFunction" }): string {
  // `Td#to_latex` (`td.rb:30`): "" when the first cell is a `|`; otherwise
  // nil-safe cells joined with " ". No table-context flip on the latex path
  // (unlike to_asciimath) — the generated latex exception matrix is empty.
  const cells = node.parameterOne;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      `td.parameterOne: is ${describeSlot(cells)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  if (cells.length > 0 && isPipeSymbol(cells[0])) return "";
  return cells
    .map((cell) =>
      cell === null || cell === undefined ? "" : s(renderChild(cell, "td.parameterOne")),
    )
    .join(" ");
}

function renderTr(node: MathNode & { readonly kind: "unaryFunction" }): string {
  // `Tr#to_latex` (`tr.rb:33`): drop the `|` tds (either the td itself, or
  // its first cell), then join with " & ". The second reject check reads
  // `td.parameter_one.first`, so a td without a cell LIST crashes in the gem.
  const tds = node.parameterOne;
  if (!Array.isArray(tds)) {
    throw new RenderError(
      `tr.parameterOne: is ${describeSlot(tds)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  const kept: MathNode[] = [];
  for (const td of tds) {
    if (isPipeSymbol(td)) continue;
    const cells = isNode(td) ? (td as { readonly parameterOne?: unknown }).parameterOne : undefined;
    if (!Array.isArray(cells)) {
      throw new RenderError(
        `tr.parameterOne: a td holds ${describeSlot(cells)} instead of a cell list — ` +
          "the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    if (cells.length > 0 && isPipeSymbol(cells[0])) continue;
    kept.push(td as MathNode);
  }
  return kept.map((td) => s(renderChild(td, "tr.parameterOne"))).join(" & ");
}

/** `Table#latex_content`: nil-safe rows joined with ` \\ ` (`table.rb:253`). */
function latexContent(node: MathNode & { readonly kind: "table" }): string {
  const value = node.value;
  if (value === null || value === undefined) return "";
  if (!Array.isArray(value)) {
    throw new RenderError(
      `table.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  return value
    .map((row) => (row === null || row === undefined ? "" : s(renderChild(row, "table.value"))))
    .join(" \\\\ ");
}

/** Ruby's `String#delete_prefix`, for the `\left`/`\right` paren splices. */
function deletePrefix(text: string, prefix: string): string {
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

function renderTable(node: MathNode & { readonly kind: "table" }): string {
  const name = node.name;
  if (name !== undefined && MATRIX_STYLE_TABLE_NAMES.has(name))
    return renderMatrixTable(node, name);
  if (name === "Array") return renderArrayTable(node);
  // The bare carrier, `Cases`, `Eqarray` — and any other name, which has no
  // override in the gem — take `Table#to_latex` (`table.rb:79`).
  return renderGenericTable(node);
}

/**
 * `Matrix#to_latex` and its six siblings: `\begin{env}…\end{env}`, env from
 * the open paren (`matrix_class`, `table.rb:257`) or the lowercased class
 * name when the paren is nil. `options.key?(:asterisk)` stars the env;
 * a TRUTHY asterisk also emits `[alignment]` from the first td's
 * columnalign (`latex_columnalign`, `table.rb:270`).
 */
function renderMatrixTable(node: MathNode & { readonly kind: "table" }, name: string): string {
  let env: string;
  if (node.openParen === null || node.openParen === undefined) {
    env = name.toLowerCase();
  } else {
    const id =
      isNode(node.openParen) && node.openParen.kind === "symbol" ? node.openParen.id : undefined;
    const mapped = id === undefined ? undefined : MATRIX_ENVIRONMENTS.get(id);
    if (mapped === undefined) {
      throw new RenderError(
        `table.openParen: ${describeSlot(node.openParen)}${id === undefined ? "" : ` (id "${id}")`} ` +
          "defines no to_matrices — the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    env = mapped;
  }
  const options = node.options;
  const starred = options !== null && options !== undefined && Object.hasOwn(options, "asterisk");
  const matrixClass = starred ? `{${env}*}` : `{${env}}`;
  let columnalign = "";
  if (starred && present(options.asterisk)) {
    columnalign = `[${s(firstTdColumnAlignment(node))}]`;
  }
  return `\\begin${matrixClass}${columnalign}${latexContent(node)}\\end${matrixClass}`;
}

/** `td_hash` (`table.rb:276`): `value&.first&.parameter_one&.first&.parameter_two`. */
function firstTdColumnAlignment(node: MathNode & { readonly kind: "table" }): string | null {
  const firstRow = Array.isArray(node.value) ? node.value[0] : undefined;
  const cells = isNode(firstRow)
    ? (firstRow as { readonly parameterOne?: unknown }).parameterOne
    : undefined;
  const firstTd = Array.isArray(cells) ? cells[0] : undefined;
  const hash = isNode(firstTd)
    ? (firstTd as { readonly parameterTwo?: unknown }).parameterTwo
    : undefined;
  if (typeof hash !== "object" || hash === null || Array.isArray(hash) || isNode(hash)) return null;
  const align = (hash as { readonly columnalign?: unknown }).columnalign;
  return typeof align === "string" ? (ALIGNMENT_LETTERS.get(align) ?? null) : null;
}

/**
 * `Table::Array#to_latex` (`array.rb:15`): `\begin{array}` plus the column
 * descriptor from the first row (`array_args` — `|` for a pipe-leading td,
 * an alignment letter for a columnalign td, nothing otherwise; `.` when the
 * whole row yields nothing).
 */
function renderArrayTable(node: MathNode & { readonly kind: "table" }): string {
  const firstRow = Array.isArray(node.value) ? node.value[0] : undefined;
  const cells = isNode(firstRow)
    ? (firstRow as { readonly parameterOne?: unknown }).parameterOne
    : undefined;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      "table.value: array_args reads value.first.parameter_one — the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  const args = cells.map((td) => {
    const tdCells = isNode(td)
      ? (td as { readonly parameterOne?: unknown }).parameterOne
      : undefined;
    if (!Array.isArray(tdCells)) {
      throw new RenderError(
        "table.value: array_args reads each td's parameter_one.first — the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    if (tdCells.length > 0 && isPipeSymbol(tdCells[0])) return "|";
    const hash = (td as { readonly parameterTwo?: unknown }).parameterTwo;
    if (hash === null || hash === undefined) return null;
    if (typeof hash !== "object" || Array.isArray(hash) || isNode(hash)) {
      throw new RenderError(
        "table.value: a td's parameter_two is not a hash — the gem's Hash() raises TypeError here",
        FORMAT,
        node.kind,
      );
    }
    const align = (hash as { readonly columnalign?: unknown }).columnalign;
    return typeof align === "string" ? (ALIGNMENT_LETTERS.get(align) ?? null) : null;
  });
  const descriptor = args.every((entry) => entry === null)
    ? "."
    : `{${args.map((entry) => entry ?? "").join("")}}`;
  return `\\begin{array}${descriptor}${latexContent(node)}\\end{array}`;
}

/**
 * `Table#to_latex` (`table.rb:79`): `Paren::Norm` as open paren
 * short-circuits to `Vmatrix`; a NIL open paren takes the
 * `environment == "array"` branch (`MATRICES.invert[nil]` is `:array`) and
 * inserts the measured `{a…|…}` column descriptor; parens render through
 * `to_latex` with `\left`/`\right` prefixes spliced off and `.` standing in
 * for nil (or a nil RENDER — Ruby's `|| "."`).
 */
function renderGenericTable(node: MathNode & { readonly kind: "table" }): string {
  const open = node.openParen;
  if (isNode(open) && open.kind === "symbol" && open.id === "Paren::Norm") {
    return `\\begin{Vmatrix}${latexContent(node)}\\end{Vmatrix}`;
  }
  let separator = "";
  if (open === null || open === undefined) {
    separator = `{${latexColumnDescriptor(node)}}`;
  }
  const openRender =
    open === null || open === undefined ? "." : (renderChild(open, "table.openParen") ?? ".");
  const closeRender =
    node.closeParen === null || node.closeParen === undefined
      ? "."
      : (renderChild(node.closeParen, "table.closeParen") ?? ".");
  const left = `\\left ${deletePrefix(openRender, "\\left")}\\begin{matrix}`;
  const right = `\\end{matrix}\\right ${deletePrefix(closeRender, "\\right")}`;
  return `${left}${separator}${latexContent(node)}${right}`;
}

/**
 * `table_attribute(:latex)` over `column_lines` (`table.rb:215-240`),
 * measured: one flag per pipe-free td of the FIRST row (`"a"`), a pipe td
 * marking the previous column solid (`"|"`), and a leading `"a"` inserted
 * whenever any solid exists. A table with no first row, or a first row
 * without a cell list, crashes in the gem — RenderError here.
 */
function latexColumnDescriptor(node: MathNode & { readonly kind: "table" }): string {
  const firstRow = Array.isArray(node.value) ? node.value[0] : undefined;
  const cells = isNode(firstRow)
    ? (firstRow as { readonly parameterOne?: unknown }).parameterOne
    : undefined;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      "table.value: the column descriptor reads value.first.parameter_one — " +
        "the gem raises NoMethodError here (a paren-less table needs a first row)",
      FORMAT,
      node.kind,
    );
  }
  const columns: (string | null)[] = [];
  cells.forEach((td, index) => {
    const tdCells = isNode(td)
      ? (td as { readonly parameterOne?: unknown }).parameterOne
      : undefined;
    if (!Array.isArray(tdCells)) {
      throw new RenderError(
        "table.value: the column descriptor reads each td's parameter_one — " +
          "the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    if (tdCells.some((cell) => isPipeSymbol(cell))) {
      if (columns.length === 0) {
        columns.push("solid");
      } else {
        // Ruby's `columns_array[i - 1] = "solid"` pads with nil when the
        // index runs past the end; keep the padding explicit so no JS array
        // hole changes the join.
        while (columns.length < index - 1) columns.push(null);
        columns[index - 1] = "solid";
      }
    } else {
      columns.push("none");
    }
  });
  if (columns.includes("solid")) columns.unshift("none");
  return columns.map((flag) => (flag === "solid" ? "|" : "a")).join("");
}
