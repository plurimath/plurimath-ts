/**
 * The `plurimath-js` compat class.
 *
 * Two things are pinned here and they are different: that the SURFACE matches
 * the wrapper's declaration exactly, and that each method's BYTES match the
 * gem. A class with the right method names and wrong output would satisfy only
 * the first, which is why the expectations below are measured oracle bytes
 * rather than whatever the port happens to emit.
 *
 * Oracle: /home/apple/ruby_gems/plurimath-oracle at 00c52783, gem 0.11.6,
 * `Plurimath::Math.parse("frac(1)(2)", :asciimath)`.
 */

import { describe, expect, it } from "vitest";
import Plurimath, { FORMATS, type Format } from "../../src/compat/index";
import { equals, UnsupportedFeatureError, UnsupportedFormatError } from "../../src/core/index";
import { parseHtml } from "../../src/formats/html/index";
import { parseUnicodemath } from "../../src/formats/unicodemath/index";
import RootDefault, { Plurimath as RootNamed } from "../../src/index";

const INPUT = "frac(1)(2)";
const build = () => new Plurimath(INPUT, "asciimath");

/** Measured: `Plurimath::Math.parse("frac(1)(2)", :asciimath).to_<format>`. */
const GEM_OUTPUT = {
  toAsciimath: "frac(1)(2)",
  toLatex: "\\frac{1}{2}",
  toUnicodemath: "(1)/(2)",
  toHtml: "<i>1</i><i>2</i>",
} as const;

describe("the compat class matches the plurimath-js surface", () => {
  /**
   * Source head `ce297e2` `src/index.ts` declares exactly these seven, in this
   * order. The published `0.2.2` artifact has six — no `toUnicodemath` — and
   * this port deliberately targets source head (see the class's own header).
   */
  const DeclaredMethods = [
    "toAsciimath",
    "toLatex",
    "toMathml",
    "toHtml",
    "toOmml",
    "toDisplay",
    "toUnicodemath",
  ] as const;

  it("declares every wrapper method and no others", () => {
    const own = Object.getOwnPropertyNames(Plurimath.prototype)
      .filter((name) => name !== "constructor")
      .sort();
    expect(own).toEqual([...DeclaredMethods].sort());
  });

  /**
   * The wrapper is a DEFAULT export — consumers write
   * `import Plurimath from "@plurimath/plurimath"`. The package-isolation gate
   * enumerates named exports only, so nothing there can see this; it is
   * asserted here instead.
   */
  it("is the package root's default export, and its named one", () => {
    expect(RootDefault).toBe(Plurimath);
    expect(RootNamed).toBe(Plurimath);
  });

  it("exposes `data` as a readable formula, not an Opal parser result", () => {
    const formula = build();
    expect(formula.data).toBeDefined();
    expect(formula.data.kind).toBe("formula");
  });

  it("names the six constructor formats the wrapper names", () => {
    expect(FORMATS).toEqual(["asciimath", "latex", "mathml", "html", "unicode", "omml"]);
  });

  it("uses `unicode`, the gem's spelling, not the published `mahtml` typo", () => {
    expect(FORMATS).toContain("unicode");
    expect(FORMATS as readonly string[]).not.toContain("mahtml");
    expect(FORMATS as readonly string[]).not.toContain("unicodemath");
  });
});

const PARSEABLE: readonly Format[] = ["asciimath", "latex", "html", "unicode"];

/**
 * The same formula written in each door's own notation.
 *
 * Measured on the clean oracle at 00c52783:
 * `Plurimath::Math.parse("\\frac{1}{2}", :latex)` renders to exactly the
 * bytes in `GEM_OUTPUT` above — the ones AsciiMath's `frac(1)(2)` produces.
 * Both doors reach one model, which is the compat class's whole premise.
 */
const LATEX_INPUT = "\\frac{1}{2}";

describe("the constructor's staged contract", () => {
  it("parses asciimath", () => {
    expect(() => build()).not.toThrow();
  });

  it("parses latex", () => {
    expect(() => new Plurimath(LATEX_INPUT, "latex")).not.toThrow();
  });

  it("parses html", () => {
    expect(() => new Plurimath(GEM_OUTPUT.toHtml, "html")).not.toThrow();
  });

  it("parses unicode", () => {
    expect(() => new Plurimath(GEM_OUTPUT.toUnicodemath, "unicode")).not.toThrow();
  });

  /**
   * "does not throw" alone cannot tell `PARSERS.html` routing to `parseHtml`
   * apart from routing to some other format's parser that also happens not
   * to throw on this input — measured, that gap is exactly how `latex`
   * silently AsciiMath-parsed before the MAP-not-set guard below existed.
   * Comparing the model, not just bytes, ties the constructor's `data`
   * directly to the same function `../../src/formats/html/index` exports.
   */
  it("routes html construction to parseHtml, not some other parser", () => {
    const formula = new Plurimath(GEM_OUTPUT.toHtml, "html");
    expect(equals(formula.data, parseHtml(GEM_OUTPUT.toHtml))).toBe(true);
  });

  it("routes unicode construction to parseUnicodemath, not some other parser", () => {
    const formula = new Plurimath(GEM_OUTPUT.toUnicodemath, "unicode");
    expect(equals(formula.data, parseUnicodemath(GEM_OUTPUT.toUnicodemath))).toBe(true);
  });

  /** Two of six raise today. Asserted per format so it cannot drift quietly. */
  it.each(FORMATS.filter((f) => !PARSEABLE.includes(f)))(
    "raises UnsupportedFormatError for %s, which has no parser yet",
    (format: Format) => {
      expect(() => new Plurimath(INPUT, format)).toThrow(UnsupportedFormatError);
    },
  );

  it("names the format it refused", () => {
    expect(() => new Plurimath(INPUT, "mathml")).toThrow(/mathml/);
  });

  /**
   * The guard the MAP was chosen for. A set of parseable names would let
   * `latex` construct and then AsciiMath-parse its input; that produced
   * `"\\backslash \\frac{1}{2}"` when it was measured. Now that latex has a
   * parser of its own, assert it is the LATEX one that runs.
   */
  it("parses latex input with the latex parser, not the asciimath one", () => {
    const formula = new Plurimath(LATEX_INPUT, "latex");
    expect(formula.toAsciimath()).toBe(GEM_OUTPUT.toAsciimath);
    expect(formula.toAsciimath()).not.toContain("backslash");
  });
});

describe("latex input reaches the same model asciimath does", () => {
  it.each(Object.keys(GEM_OUTPUT) as (keyof typeof GEM_OUTPUT)[])(
    "%s matches the gem's bytes for latex input",
    (method) => {
      const fromLatex = new Plurimath(LATEX_INPUT, "latex");
      expect(fromLatex[method]()).toBe(GEM_OUTPUT[method]);
    },
  );

  /**
   * The four assertions above compare RENDERED BYTES, and a review showed
   * that is weaker than this block's name: replacing the LaTeX model's
   * `inputString` with `"WRONG"` left all of them green. Compare the models.
   */
  it("builds a model equal to the one asciimath builds", () => {
    const fromLatex = new Plurimath(LATEX_INPUT, "latex").data;
    const fromAsciimath = build().data;
    expect(equals(fromLatex, fromAsciimath)).toBe(true);
  });

  /**
   * `equals` is structural and does not compare `inputString`, which each door
   * keeps as its own source text. Assert that separately, so "equal models"
   * cannot quietly come to mean "identical objects".
   */
  it("keeps each door's own input string on the model", () => {
    expect(new Plurimath(LATEX_INPUT, "latex").data.inputString).toBe(LATEX_INPUT);
    expect(build().data.inputString).toBe(INPUT);
  });
});

describe("each method renders the gem's bytes", () => {
  const Renderers: Readonly<Record<keyof typeof GEM_OUTPUT, (f: Plurimath) => string>> = {
    toAsciimath: (f) => f.toAsciimath(),
    toLatex: (f) => f.toLatex(),
    toUnicodemath: (f) => f.toUnicodemath(),
    toHtml: (f) => f.toHtml(),
  };

  it.each(Object.keys(GEM_OUTPUT) as (keyof typeof GEM_OUTPUT)[])("%s", (method) => {
    expect(Renderers[method](build())).toBe(GEM_OUTPUT[method]);
  });

  it("toMathml renders the gem's tree", () => {
    const out = build().toMathml();
    expect(out).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(out).toContain("<mfrac>");
    expect(out).toContain("<mn>1</mn>");
  });

  it("toOmml renders an OMML document", () => {
    expect(build().toOmml()).toContain("m:oMathPara");
  });
});

/**
 * `toDisplay`, reached the way `plurimath-js` reaches it: a JS string
 * compiled and RUN through Opal, not native Ruby. Opal compiles the gem's
 * `case type; when :asciimath ...` to a JS `$eqeqeq` helper that, for a
 * `Symbol === String` comparison, takes a fast path of plain JS `===`
 * (Opal's `Symbol` literals ARE JS strings at runtime) — measured by
 * compiling the exact `case`/`when` shape from `formula.rb:203-215` with
 * Opal 1.8.3 (the version `plurimath-js` pins) and running the compiled JS
 * with Node (`scripts/probe-opal-to-display.{rb,mjs}`; the full account,
 * including why a standalone extraction rather than the full gem, is
 * `src/compat/to-display.ts`'s module doc). So:
 *
 *   - a LOWERCASE valid name ("asciimath", "latex", "mathml", "omml",
 *     "unicodemath") reaches the real per-node `to_<format>_math_zone` tree
 *     dump, and its bytes DEPEND on the formula's content;
 *   - an UPPERCASE or MIXED-CASE valid name ("LATEX", "Asciimath", …) is
 *     still accepted by the type-validity check (which downcases before
 *     checking membership) but matches no `case` arm, so it falls through
 *     to the bare `"|_ Math zone\n"` placeholder — and THAT is content
 *     independent, because no renderer ever runs on that path.
 *
 * Measured on the pinned oracle (`00c52783`), calling `to_display` with a
 * real Symbol (proven equivalent to Opal's lowercase-string path by the
 * measurement above):
 *
 *   bundle exec ruby -e 'require "plurimath";
 *     f = Plurimath::Asciimath.new("frac(1)(2)").to_formula;
 *     puts f.to_display(:asciimath).inspect'
 *   # => "|_ Math zone\n  |_ \"frac(1)(2)\"\n     |_ \"frac(1)(2)\" fraction\n        |_ \"1\" numerator\n        |_ \"2\" denominator\n"
 *
 * (repeated with `:latex`/`:mathml`/`:omml`/`:unicodemath` for the other
 * formats below, and with `:latex` on `Asciimath.new("alpha")`,
 * `Asciimath.new("x^2")`, `Asciimath.new("sqrt(2)")` for the other node
 * kinds this suite pins).
 */
describe("toDisplay", () => {
  const ValidLangs = ["asciimath", "latex", "mathml", "omml", "unicodemath"] as const;

  describe("a lowercase valid name reaches the real tree dump", () => {
    it("asciimath", () => {
      expect(build().toDisplay("asciimath")).toBe(
        '|_ Math zone\n  |_ "frac(1)(2)"\n     |_ "frac(1)(2)" fraction\n' +
          '        |_ "1" numerator\n        |_ "2" denominator\n',
      );
    });

    it("latex", () => {
      expect(build().toDisplay("latex")).toBe(
        '|_ Math zone\n  |_ "\\frac{1}{2}"\n     |_ "\\frac{1}{2}" fraction\n' +
          '        |_ "1" numerator\n        |_ "2" denominator\n',
      );
    });

    it("unicodemath", () => {
      expect(build().toDisplay("unicodemath")).toBe(
        '|_ Math zone\n  |_ "(1)/(2)"\n     |_ "(1)/(2)" fraction\n' +
          '        |_ "1" numerator\n        |_ "2" denominator\n',
      );
    });

    /**
     * mathml/omml assert against the CONSTRUCT's own `toMathml`/`toOmml` for
     * the root line (collapsed to one line, exactly as the gem's own
     * newline-collapsing gsub does), rather than a giant literal, to keep this
     * spec from being a second, harder-to-audit copy of the xmlns block
     * `toMathml`/`toOmml` are already pinned against elsewhere in this file.
     * The tree body's labeled lines ARE literal, oracle-measured strings.
     */
    it("mathml", () => {
      const dump = build().toDisplay("mathml");
      const collapsedRoot = build().toMathml().replace(/\n\s*/g, "");
      expect(dump).toBe(
        `|_ Math zone\n  |_ "${collapsedRoot}"\n` +
          '     |_ "<mfrac><mn>1</mn><mn>2</mn></mfrac>" fraction\n' +
          '        |_ "<mn>1</mn>" numerator\n        |_ "<mn>2</mn>" denominator\n',
      );
    });

    it("omml", () => {
      const dump = build().toDisplay("omml");
      const collapsedRoot = build().toOmml().replace(/\n\s*/g, "");
      const fragment =
        '<m:f><m:fPr><m:ctrlPr><w:rPr><w:rFonts w:ascii="Cambria Math" ' +
        'w:hAnsi="Cambria Math"/><w:i/></w:rPr></m:ctrlPr></m:fPr>' +
        "<m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f>";
      expect(dump).toBe(
        `|_ Math zone\n  |_ "${collapsedRoot}"\n` +
          `     |_ "${fragment}" fraction\n` +
          '        |_ "<m:t>1</m:t>" numerator\n        |_ "<m:t>2</m:t>" denominator\n',
      );
    });

    it("a Symbol leaf (unmerged: not one of plus/minus/circ/equal) prints as a quoted text line", () => {
      expect(new Plurimath("alpha", "asciimath").toDisplay("latex")).toBe(
        '|_ Math zone\n  |_ "\\alpha"\n     |_ "\\alpha" text\n',
      );
    });

    /**
     * `Text#to_<format>_math_zone` (`function/text.rb:86-105`): a bare
     * `Number` merges to a synthetic `Text` (`ModelHelper#filter_math_zone_values`)
     * whose math-zone tail line depends on the FORMAT, not on a shared
     * shortcut. Measured on the oracle,
     * `Plurimath::Asciimath.new("2").to_formula.to_display(<format>)`:
     *
     *   - LATEX IS THE ODD FORMAT OUT: `to_latex_math_zone` calls
     *     `to_asciimath`, not `to_latex` — the tail line is `"2" text`,
     *     never `\text{2} text`.
     *   - asciimath/unicodemath call their OWN normal renderer (unaffected —
     *     same value either way here).
     *   - mathml/omml use the FRAGMENT dump (`<mtext>2</mtext>` /
     *     `<m:t>2</m:t>`), not the full-document renderer, which requires a
     *     `Formula`-shaped root and cannot run on a bare leaf.
     */
    it("a bare Number leaf's math-zone tail line depends on the format, not a shared shortcut", () => {
      const two = () => new Plurimath("2", "asciimath");
      expect(two().toDisplay("asciimath")).toBe('|_ Math zone\n  |_ "2"\n     |_ "2" text\n');
      expect(two().toDisplay("latex")).toBe('|_ Math zone\n  |_ "2"\n     |_ "2" text\n');
      expect(two().toDisplay("unicodemath")).toBe('|_ Math zone\n  |_ "2"\n     |_ "2" text\n');

      const mathmlRoot = two().toMathml().replace(/\n\s*/g, "");
      expect(two().toDisplay("mathml")).toBe(
        `|_ Math zone\n  |_ "${mathmlRoot}"\n     |_ "<mtext>2</mtext>" text\n`,
      );

      const ommlRoot = two().toOmml().replace(/\n\s*/g, "");
      expect(two().toDisplay("omml")).toBe(
        `|_ Math zone\n  |_ "${ommlRoot}"\n     |_ "<m:t>2</m:t>" text\n`,
      );
    });

    /**
     * `Symbol#to_omml_math_zone` (`symbols/symbol.rb:190-193`) goes through
     * `Symbol#omml_nodes`/`#t_tag` (`:156-163`), which always wraps the bare
     * per-symbol value in ONE `<m:t>...</m:t>` -- a DIFFERENT path from
     * `to_omml_without_math_tag` (the bare value alone) and from
     * `insert_t_tag` (`<m:r><m:t>...</m:t></m:r>`, one level MORE wrapping).
     * Measured: `Plurimath::Asciimath.new("alpha").to_formula.to_display(:omml)`
     * tail line is `"<m:t>&#x3b1;</m:t>" text`.
     */
    it("a bare Symbol leaf's OMML math-zone line wraps the value in one <m:t>, no more and no less", () => {
      const alpha = () => new Plurimath("alpha", "asciimath");
      const ommlRoot = alpha().toOmml().replace(/\n\s*/g, "");
      expect(alpha().toDisplay("omml")).toBe(
        `|_ Math zone\n  |_ "${ommlRoot}"\n     |_ "<m:t>&#x3b1;</m:t>" text\n`,
      );

      const mathmlRoot = alpha().toMathml().replace(/\n\s*/g, "");
      expect(alpha().toDisplay("mathml")).toBe(
        `|_ Math zone\n  |_ "${mathmlRoot}"\n     |_ "<mi>&#x3b1;</mi>" text\n`,
      );
    });

    /**
     * A Table cell's Text content goes through the SAME `Text#to_latex_math_zone`
     * split as a bare leaf (above) -- measured:
     * `Plurimath::Asciimath.new("[[a,b],[c,d]]").to_formula.to_display(:latex)`.
     */
    it("a Table cell's text content under the LaTeX zone uses asciimath's renderer too", () => {
      expect(new Plurimath("[[a,b],[c,d]]", "asciimath").toDisplay("latex")).toBe(
        '|_ Math zone\n  |_ "\\left [\\begin{matrix}a & b \\\\ c & d\\end{matrix}\\right ]"\n' +
          '     |_ "table" function apply\n        |_ "tr" function apply\n' +
          '        |  |_ "td" function apply\n        |  |  |_ "a" text\n' +
          '        |  |_ "td" function apply\n        |     |_ "b" text\n' +
          '        |_ "tr" function apply\n           |_ "td" function apply\n' +
          '           |  |_ "c" text\n           |_ "td" function apply\n' +
          '              |_ "d" text\n',
      );
    });

    /**
     * `Substack < UnaryFunction` (`substack.rb:6-40`) has NO `to_*_math_zone`
     * overrides at all -- it inherits `UnaryFunction`'s (`unary_function.rb:94-155`)
     * unchanged. The refusal below is still correct, but for a DIFFERENT
     * reason than "Substack has bespoke math-zone methods": `parameter_one`
     * is an ARRAY of rows, and `UnaryFunction`'s inherited math-zone methods
     * call `parameter_one.to_latex(...)` directly, which is `NoMethodError`
     * on an `Array` in the gem itself. Measured:
     * `Plurimath::Latex.new('\substack{a \\\\ b}').to_formula.to_display(:latex)`
     * raises `NoMethodError: undefined method 'to_latex' for an instance of
     * Array` in the oracle, at the very header line (before `UnaryFunction`'s
     * own math-zone body is ever reached) -- this port raises `RenderError`
     * at the same point, for the same reason.
     */
    it("Substack still refuses every format, now for the measured reason (inherited UnaryFunction, Array field)", () => {
      const substack = new Plurimath(String.raw`\substack{a \\ b}`, "latex");
      for (const lang of ValidLangs) {
        expect(() => substack.toDisplay(lang)).toThrow();
      }
    });

    it("a BinaryFunction alias (Power, via the generic FUNCTION table) prints base/script", () => {
      expect(new Plurimath("x^2", "asciimath").toDisplay("asciimath")).toBe(
        '|_ Math zone\n  |_ "x^(2)"\n     |_ "x^(2)" superscript\n' +
          '        |_ "x" base\n        |_ "2" script\n',
      );
    });

    it("a UnaryFunction (Sqrt) prints the function-apply/function-name/argument shape", () => {
      expect(new Plurimath("sqrt(2)", "asciimath").toDisplay("latex")).toBe(
        '|_ Math zone\n  |_ "\\sqrt{2}"\n     |_ "\\sqrt{2}" function apply\n' +
          '        |_ "sqrt" function name\n        |_ "2" argument\n',
      );
    });

    it("Fenced is a transparent pass-through whose merge-eligible children fold into one text run", () => {
      expect(new Plurimath("(x+1)", "asciimath").toDisplay("asciimath")).toBe(
        '|_ Math zone\n  |_ "(x + 1)"\n     |_ "x + 1" text\n',
      );
    });
  });

  describe("an uppercase or mixed-case valid name is the content-independent placeholder", () => {
    it.each(["LATEX", "ASCIIMATH", "MATHML", "OMML", "UNICODEMATH", "Asciimath", "AsciiMath"])(
      "%s",
      (lang) => {
        expect(build().toDisplay(lang)).toBe("|_ Math zone\n");
      },
    );

    it("does not depend on the formula's content, unlike the lowercase path", () => {
      const simple = new Plurimath("2", "asciimath").toDisplay("LATEX");
      const frac = build().toDisplay("LATEX");
      expect(simple).toBe("|_ Math zone\n");
      expect(frac).toBe("|_ Math zone\n");
      expect(simple).toBe(frac);
      // The lowercase path, by contrast, DOES depend on content — this is
      // the split the placeholder case-insensitivity previously erased.
      expect(new Plurimath("2", "asciimath").toDisplay("latex")).not.toBe(
        build().toDisplay("latex"),
      );
    });
  });

  it.each(ValidLangs)(
    "a lowercase name's validity is unaffected by case-insensitivity (%s stays valid)",
    (lang) => {
      expect(() => build().toDisplay(lang)).not.toThrow();
    },
  );

  it("rejects `html`, which is not one of the gem's MATH_ZONE_TYPES", () => {
    expect(() => build().toDisplay("html")).toThrow(UnsupportedFormatError);
  });

  /**
   * The constructor's `Format` union spells this input door `unicode`
   * (`FORMATS` above); `to_display`'s type token is the gem's own spelling,
   * `unicodemath`, and does not accept the constructor's name.
   */
  it("rejects `unicode`, distinct from the constructor's own format name", () => {
    expect(() => build().toDisplay("unicode")).toThrow(UnsupportedFormatError);
  });

  it("names the rejected lang in the thrown error", () => {
    expect(() => build().toDisplay("html")).toThrow(/html/);
  });

  /**
   * Scoped out, not guessed: the gem's own `Nary` class defines no
   * `to_*_math_zone` at all (`Math::Function::Nary < Core`), so this port
   * refuses rather than fabricate one. `FontStyle`/`Vec`/`Substack`/
   * `Msgroup`/`Unitsml` and OMML's own `Color` are refused the same way —
   * see `src/compat/to-display.ts`'s module doc for the full, named list.
   */
  it("names the class and format when a scoped-out node kind is reached", () => {
    // `bb x` (bold `x`) parses to a `FontStyle` node (measured:
    // `Plurimath::Asciimath.new("bb x").to_formula` is one `FontStyle::Bold`
    // wrapping a `Symbol`) -- FontStyle overrides the generic UnaryFunction
    // shape with a bespoke "font family" header this slice does not carry
    // (see `src/compat/to-display.ts`'s module doc), so every lowercase
    // format refuses it rather than guess the wrong header shape.
    expect(() => new Plurimath("bb x", "asciimath").toDisplay("asciimath")).toThrow(
      UnsupportedFeatureError,
    );
    expect(() => new Plurimath("bb x", "asciimath").toDisplay("asciimath")).toThrow(/fontStyle/);
  });
});

describe("the one method that cannot be honest yet", () => {
  /**
   * Measured on the oracle: `to_mathml(intent: false)` is byte-identical to
   * `to_mathml` with no keyword, so delegating the default path loses nothing.
   */
  it("toMathml() and toMathml(false) agree, as they do in the gem", () => {
    expect(build().toMathml(false)).toBe(build().toMathml());
  });

  it("toMathml(true) is the gem's to_mathml(intent: true), not a refusal", () => {
    const out = build().toMathml(true);
    // The fixture is a fraction of two numbers: `frac_intent` reads it and
    // tags nothing, so the bytes match the default render (measured with
    // `intent: true` on the oracle's `frac(1)(2)`), while a tree that
    // does carry an intent gets one.
    expect(out).toBe(build().toMathml());
    expect(new Plurimath("sum_(i=1)^n i", "asciimath").toMathml(true)).toContain(
      'intent=":sum($l,n,$naryand)"',
    );
    expect(new Plurimath("sum_(i=1)^n i", "asciimath").toMathml(false)).not.toContain("intent");
  });

  /**
   * `code` is the discriminator and `format`/`feature` are API
   * (`src/core/errors.ts:1-8`), so neither may carry prose. An unported
   * FEATURE is not an unsupported FORMAT: collapsing them would leave a
   * consumer unable to tell "not a format" from "this port cannot do that
   * yet", and would put a sentence in a field typed as a format token.
   */
  it("discriminates an unported feature from an unsupported format", () => {
    const codes: Record<string, string> = {};
    const fields: Record<string, string> = {};
    for (const [label, run] of [
      ["ctor", () => new Plurimath(INPUT, "mathml")],
      ["toMathml", () => build().toMathml(true)],
    ] as const) {
      try {
        run();
        throw new Error(`${label} did not throw`);
      } catch (error) {
        const e = error as UnsupportedFormatError | UnsupportedFeatureError;
        codes[label] = e.code;
        fields[label] = "format" in e ? e.format : e.feature;
      }
    }
    expect(codes).toEqual({
      ctor: "UNSUPPORTED_FORMAT",
      toMathml: "UNSUPPORTED_FEATURE",
    });
    // stable identifiers, not sentences
    expect(fields).toEqual({
      ctor: "mathml",
      toMathml: "toMathml(intent: true)",
    });
    for (const value of Object.values(fields)) expect(value).not.toMatch(/\s\w+\s\w+\s\w+\s/);
  });

  /**
   * `readonly` on a class field is erased at compile time. A JavaScript
   * consumer -- the majority here -- would still be able to reassign `data`
   * and change what every later method renders, which is the exact defect the
   * published class has. Installed with `writable: false` instead.
   */
  it("makes `data` readonly at runtime, not only to TypeScript", () => {
    const formula = build();
    expect(Object.getOwnPropertyDescriptor(formula, "data")?.writable).toBe(false);

    // The guarantee is that the value does not change, NOT that assigning
    // throws. Assigning to a non-writable property throws only in strict mode;
    // this package also ships CJS, and a `require()` consumer in sloppy mode
    // gets a silent no-op instead. Measured both ways: sloppy `threw=false`,
    // strict `threw=true`, and the value held in both. So the assertion is on
    // the value, and the throw is tolerated rather than required.
    const before = formula.data;
    try {
      (formula as unknown as { data: unknown }).data = new Plurimath("x+y", "asciimath").data;
    } catch {
      // strict mode: TypeError, which is the stricter of the two behaviours
    }
    expect(formula.data).toBe(before);
    expect(formula.toLatex()).toBe(GEM_OUTPUT.toLatex);
  });
});
