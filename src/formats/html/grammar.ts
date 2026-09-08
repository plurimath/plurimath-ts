/**
 * The HTML grammar, ported rule for rule from the gem's Parslet parser
 * (`lib/plurimath/html/parse.rb`, plurimath 0.11.6 at `00c52783`).
 *
 * The port is structural, exactly as `latex/grammar.ts` and
 * `unicodemath/grammar.ts` are: every `rule(:name)` in `html/parse.rb` is one
 * `rule(() => ...)` here, in the same source order, with the same alternatives
 * in the same order, and each carries the Ruby line it came from. Parslet's `|`
 * is an ordered choice, so alternative order is behaviour, not style. Of the
 * fourteen helper *methods* below the rules, twelve are ported as functions
 * rather than constants, because each Ruby call site builds a fresh atom and
 * the packrat cache is keyed by atom identity; `decimal_marker` is
 * `decimalMarkerAtom` for the same reason, and `str_to_expression` is inlined
 * into `arrayToExpression`, its only caller.
 *
 * Rule names are Ruby's, transliterated to camelCase (`symbol_text_or_tag` →
 * `symbolTextOrTag`). Tree *keys* stay Ruby's exactly — they are data, not
 * identifiers — including the `_value` suffixes `parse_sub_sup_tags`
 * (`html/parse.rb:171`) builds by interpolation.
 *
 * **This is the input side of `src/formats/html/`, beside the renderer, not
 * instead of it.** It is deliberately not re-exported from `index.ts`: the HTML
 * subpath stays output-only until the transform lands, so nothing here ships.
 *
 * This module takes **already-normalised** text. `Html::Parser#normalized_text`
 * (`html/parser.rb:27`) rewrites every substring matching `HTML_ENTITY` through
 * `string_to_html_entity(html_entity_to_unicode(...))` before Parslet runs, so
 * `&prod;` reaches the grammar as `&#x220f;`. That pass is a separate slice,
 * and until it lands a caller supplies the normalised string itself.
 *
 * Two facts about that pass that a reader coming from `latex/grammar.ts` will
 * otherwise get wrong, both measured on the oracle rather than read off the
 * source:
 *
 * 1. It is **scoped by a regexp**, where LaTeX's (`latex/parser.rb:27`) encodes
 *    the whole input. It has to be: encoding everything would turn `<` into
 *    `&#x3c;` and leave no tag to parse. Measured, `Html::Parser` leaves
 *    `"<td>x</td>"` alone where `Latex::Parser` gives `"&#x3c;td&#x3e;..."`.
 * 2. Because of (1) a lone code point survives it, so `decimal_marker`
 *    (`html/parse.rb:147`) matches the **raw** marker — `str(configuration
 *    .decimal)` — where LaTeX's and UnicodeMath's match an entity-encoded one.
 *    See `decimalMarkerAtom` below.
 *
 * There is no transform yet: this produces the Parslet-shaped tree and stops.
 *
 * Three deliberate departures from a literal transcription, each argued where
 * it sits and each covered by the oracle fixtures in
 * `test/formats/html/grammar.spec.ts`: `RUBY_SPACE` and `RUBY_STRING_SPACE`
 * standing in for Ruby's two different spellings of "space", and the explicit
 * throw in `caseInsensitiveString` for an input Ruby crashes on too.
 */

import {
  DEFAULT_DECIMAL_MARKER,
  type LocaleOptions,
  resolveDecimalMarker,
} from "../../formatting/index";
import { type Atom, alt, captured, dynamic, match, rule, scope, seq, str } from "../../pegkit";
import {
  HTML_LPAREN,
  HTML_RPAREN,
  HTML_SUB_SUP_CLASSES,
  HTML_UNARY_CLASSES,
} from "./generated/parser-tables";

/**
 * What Ruby's `\s` means inside a regexp, spelled out — the same substitution
 * `latex/grammar.ts` and `asciimath/grammar.ts` make, for the same measured
 * reason. Ruby's `\s` is six code points; JavaScript's under the `u` flag is
 * twenty-five, adding U+00A0 and eighteen others.
 *
 * One call site: `tag_name_boundary` (`html/parse.rb:200`) writes
 * `match["\\s/>"]`, where the doubled backslash makes `\s` reach the regexp
 * engine as the whitespace class.
 */
const RUBY_SPACE = "\\t\\n\\v\\f\\r ";

/**
 * Ruby's `"\s"` — a double-quoted **String**, not a regexp class, so it is the
 * single character U+0020. `html/parse.rb:8` writes `match["\s"]` and `:86`
 * ends its negated class with the same escape, and neither is the whitespace
 * class: measured on the oracle, `Html::Parse#space` refuses `"\t"` and `"\n"`,
 * and `"\t"` instead falls through to `:symbol`.
 *
 * The distinction is the whole difference between "the parser skips
 * whitespace" and "the parser skips spaces and treats a tab as a symbol", and
 * the gem does the second.
 */
const RUBY_STRING_SPACE = " ";

/**
 * `array_to_expression` (`html/parse.rb:133`): an ordered choice of literals,
 * each one named.
 *
 * Ruby's `reduce` converts only the first element, because after one iteration
 * the accumulator is an atom rather than a String or Symbol; the effect is that
 * every alternative is `str(x).as(name)`. A single-element array would return
 * the bare element instead of an atom — that is Ruby's behaviour and no call
 * site reaches it (the smallest table here has three entries), and it is not
 * reproduced.
 *
 * The tables are Symbols in Ruby and Strings here; the generator proves the
 * projection is faithful by parsing every entry back through the gem's own rule
 * (`scripts/generate-html-parser-data.rb`).
 */
function arrayToExpression(values: readonly string[], name: string): Atom {
  return alt(...values.map((value) => str(value).as(name)));
}

/** Every rule in `html/parse.rb`, plus the three the `BaseNumberPrefix` mixin adds. */
export interface HtmlRules {
  /** `html/parse.rb:8` */ readonly space: Atom;
  /** `html/parse.rb:9` */ readonly unary: Atom;
  /** `html/parse.rb:10` */ readonly binary: Atom;
  /** `html/parse.rb:11` */ readonly linebreak: Atom;
  /** `html/parse.rb:12` */ readonly subTag: Atom;
  /** `html/parse.rb:13` */ readonly supTag: Atom;
  /** `html/parse.rb:15` */ readonly mod: Atom;
  /** `html/parse.rb:20` */ readonly lparen: Atom;
  /** `html/parse.rb:24` */ readonly rparen: Atom;
  /** `html/parse.rb:28` */ readonly subSup: Atom;
  /** `html/parse.rb:32` */ readonly openParen: Atom;
  /** `html/parse.rb:37` */ readonly closeParen: Atom;
  /** `html/parse.rb:42` */ readonly subSupTags: Atom;
  /** `html/parse.rb:49` */ readonly unaryArgs: Atom;
  /** `html/parse.rb:55` */ readonly binaryArgs: Atom;
  /** `html/parse.rb:62` */ readonly unaryFunctions: Atom;
  /** `html/parse.rb:67` */ readonly binaryFunctions: Atom;
  /** `html/parse.rb:72` */ readonly parseClasses: Atom;
  /** `html/parse.rb:77` */ readonly symbolTextOrTag: Atom;
  /** `html/parse.rb:89` */ readonly intermediateExp: Atom;
  /** `html/parse.rb:99` */ readonly parseParenthesis: Atom;
  /** `html/parse.rb:105` */ readonly sequence: Atom;
  /** `html/parse.rb:116` */ readonly tagParse: Atom;
  /** `html/parse.rb:124` */ readonly expression: Atom;
  /** `base_number_prefix.rb:15` */ readonly hexNumber: Atom;
  /** `base_number_prefix.rb:19` */ readonly binaryNumber: Atom;
  /** `base_number_prefix.rb:23` */ readonly octalNumber: Atom;
}

export interface HtmlGrammar {
  /** What `decimal_marker` (`html/parse.rb:147`) matches, which is the marker itself. */
  readonly decimalMarker: string;
  /** `root :expression` (`html/parse.rb:131`). */
  readonly root: Atom;
  readonly rules: HtmlRules;
}

/**
 * Builds one parser for one decimal marker.
 *
 * The marker is a constructor parameter rather than a global because
 * `decimal_marker` (`html/parse.rb:147`) reads `Plurimath.configuration
 * .decimal`, and the gem builds a fresh `Parse` for every call
 * (`html/parser.rb:17`), so the marker is effectively a per-parse input.
 */
export function createHtmlGrammar(decimalMarker: string = DEFAULT_DECIMAL_MARKER): HtmlGrammar {
  /**
   * `decimal_marker` (`html/parse.rb:147`), which — unlike LaTeX's and
   * UnicodeMath's — matches the marker **as typed**.
   *
   * There is no lookup here and no throw for an unknown marker, and that
   * absence is the ported behaviour rather than a shortcut. The other two
   * formats need a table because their parsers entity-encode the whole input,
   * so a grammar matching the raw code point would never fire; `Html::Parser`
   * rewrites only substrings that already look like entities, so a bare U+066B
   * reaches Parslet unchanged. `scripts/generate-html-parser-data.rb` proves
   * that for every marker the gem's locale table yields — that it survives
   * normalisation, that `1<marker>5` is one number under its own locale, and
   * that it is not one under the others.
   *
   * A fresh atom per call, as in Ruby. There is one call site (`:83`), so this
   * is shape rather than consequence.
   */
  const decimalMarkerAtom = (): Atom => str(decimalMarker);

  // --- html/parse.rb:8-13 --------------------------------------------------

  const space = rule(() => match(`[${RUBY_STRING_SPACE}]`).repeat(1));
  const unary = rule(() => arrayToExpression(HTML_UNARY_CLASSES, "unary"));
  const binary = rule(() => str("lim").as("binary"));
  const linebreak = rule(() => parseVoidTag("br").as("linebreak"));
  const subTag = rule(() => parseSubSupTags(["sub"], "sub"));
  const supTag = rule(() => parseSubSupTags(["sup"], "sup"));

  // --- html/parse.rb:15-30 -------------------------------------------------

  /**
   * `mod`. The only rule whose two alternatives differ solely by a wrapper:
   * `<i>mod</i>` and a bare `mod` both tag `:binary`, so the tree does not
   * record which spelling the input used.
   */
  const mod = rule(() => alt(wrappedTag(str("mod").as("binary")), str("mod").as("binary")));

  const lparen = rule(() => arrayToExpression(HTML_LPAREN, "lparen"));

  /**
   * `html/parse.rb:24` builds this from `PARENTHESIS.values`, where `lparen`
   * uses `.keys` — the two projections of one hash that pairs each opening
   * delimiter with its closing one. The generator parses every entry of both
   * through the gem's own rule, so the pairing is measured rather than read.
   */
  const rparen = rule(() => arrayToExpression(HTML_RPAREN, "rparen"));

  /**
   * `sub_sup`, tagged `:sum_prod` rather than `:sub_sup` — the tag names the
   * two functions the table's values are (`:prod` and `:sum`), not the rule.
   *
   * Six of its eight alternatives reach Parslet exactly as the user typed
   * them. Only `&prod;` and `&sum;` are rewritten — to `&#x220f;` and
   * `&#x2211;`, which are two of the other six — because `normalized_text`
   * touches only substrings matching `HTML_ENTITY`: the bare `∏` and `∑` do
   * not match it, and neither do `log` and `lim`. Measured per key on the
   * oracle. All eight are carried either way, because the array is the gem's
   * array and this module's input is the normalised text, not a user's.
   */
  const subSup = rule(() => arrayToExpression(HTML_SUB_SUP_CLASSES, "sum_prod"));

  // --- html/parse.rb:32-47 -------------------------------------------------

  const openParen = rule(() => alt(wrappedTag(lparen), lparen));
  const closeParen = rule(() => alt(wrappedTag(rparen), rparen));

  const subSupTags = rule(() => alt(seq(subTag, supTag), seq(supTag, subTag), supTag, subTag));

  // --- html/parse.rb:49-60 -------------------------------------------------

  /**
   * `unary_args`. All three alternatives carry the same `:unary_function` tag
   * and differ only in what the argument may be, narrowest first.
   */
  const unaryArgs = rule(() =>
    alt(
      seq(unaryFunctions, parseParenthesis.as("first_value")).as("unary_function"),
      seq(unaryFunctions, intermediateExp.as("first_value")).as("unary_function"),
      seq(unaryFunctions, sequence.as("first_value")).as("unary_function"),
    ),
  );

  /**
   * `binary_args`. Unlike `unary_args` these carry no wrapping tag at all, so a
   * `lim` and its arguments arrive as sibling keys of whatever contains them.
   */
  const binaryArgs = rule(() =>
    alt(
      seq(binaryFunctions, parseParenthesis.as("first_value"), parseParenthesis.as("second_value")),
      seq(binaryFunctions, parseParenthesis.as("first_value")),
      seq(binaryFunctions, intermediateExp.as("first_value"), intermediateExp.as("second_value")),
      seq(binaryFunctions, intermediateExp.as("first_value")),
    ),
  );

  // --- html/parse.rb:62-75 -------------------------------------------------

  const unaryFunctions = rule(() => alt(wrappedTag(unary), unary));
  const binaryFunctions = rule(() => alt(wrappedTag(binary), binary));
  const parseClasses = rule(() => alt(unaryFunctions, binaryFunctions));

  // --- html/parse.rb:77-87 -------------------------------------------------

  /**
   * `symbol_text_or_tag`, the leaf alternation.
   *
   * `html_entity` is the one place HTML is **stricter** than the gem's other
   * two formats, and it is stricter by one character: `html/parse.rb:166-167`
   * spells its digit runs `repeat(1)`, where `latex/parse.rb:93` and
   * `unicode_math/parse.rb:30` spell theirs `repeat`. So `&#x;` is a legal
   * unicode symbol under LaTeX and under UnicodeMath and is **not** one here —
   * measured on the oracle, where HTML falls through and reads it as the four
   * separate leaves `&`, `#`, `x`, `;`. The generator asserts all three
   * behaviours on every run, so the inconsistency cannot be quietly normalised
   * away in either direction.
   *
   * The last alternative's class excludes only U+0020, not whitespace
   * generally — see `RUBY_STRING_SPACE`. A tab is a `:symbol` here.
   */
  const symbolTextOrTag = rule(() =>
    alt(
      tagParse,
      htmlEntity().as("symbol"),
      hexNumber,
      binaryNumber,
      octalNumber,
      seq(match("[0-9]").repeat(1), decimalMarkerAtom(), match("[0-9]").repeat(1)).as("number"),
      match("[0-9]").repeat(1).as("number"),
      match("[a-zA-Z]").as("text"),
      match(`[^0-9a-zA-Z<>(){}\\[\\]${RUBY_STRING_SPACE}]`).as("symbol"),
    ),
  );

  // --- html/parse.rb:89-97 -------------------------------------------------

  /**
   * `intermediate_exp`. The first two alternatives re-tag their head as
   * `:sub_sup` so a following `<sub>`/`<sup>` pair attaches to it; the third
   * and sixth are the same rules again, untagged, for the case where no script
   * follows.
   */
  const intermediateExp = rule(() =>
    alt(
      seq(subSup.as("sub_sup"), subSupTags),
      seq(symbolTextOrTag.as("sub_sup"), subSupTags),
      subSup,
      parseClasses,
      linebreak,
      symbolTextOrTag,
      space,
    ),
  );

  // --- html/parse.rb:99-114 ------------------------------------------------

  const parseParenthesis = rule(() =>
    alt(
      seq(openParen, symbolTextOrTag, closeParen),
      seq(openParen, intermediateExp, closeParen),
      seq(openParen, expression, closeParen),
    ),
  );

  /**
   * `sequence`, the eight-branch middle of the grammar. Branch order is
   * semantics; this is the rule to read against the oracle first.
   */
  const sequence = rule(() =>
    alt(
      parseParenthesis.as("parse_parenthesis"),
      seq(unaryArgs, sequence.as("sequence")),
      seq(binaryArgs, sequence.as("sequence")),
      unaryArgs,
      binaryArgs,
      seq(symbolTextOrTag, parseParenthesis.as("parse_parenthesis")),
      seq(intermediateExp, expression.as("expression")),
      intermediateExp,
    ),
  );

  // --- html/parse.rb:116-122 -----------------------------------------------

  /**
   * `tag_parse`. The three named forms first, then the catch-all wrapper.
   *
   * `<th>` is parsed as `td` on purpose — the comment at `html/parse.rb:119`
   * says why: the shared model has no header-cell node, so both spellings
   * produce a `:td_value`. That is the gem's decision, carried here rather than
   * corrected.
   */
  const tagParse = rule(() =>
    alt(
      parseSubSupTags(["table"], "table"),
      parseSubSupTags(["tr"], "tr"),
      parseSubSupTags(["td", "th"], "td"),
      wrappedTag(sequence.as("sequence")),
    ),
  );

  // --- html/parse.rb:124-131 -----------------------------------------------

  const expression = rule(() =>
    alt(
      seq(intermediateExp.as("first_value"), mod, intermediateExp.as("second_value")),
      seq(parseClasses.as("sub_sup"), subSupTags),
      seq(sequence.as("sequence"), sequence.as("expression")),
      sequence,
    ),
  );

  // --- base_number_prefix.rb:15-25 (included at html/parse.rb:6) -----------

  const hexNumber = rule(() =>
    seq(alt(str("0x"), str("0X")), match("[0-9a-fA-F]").repeat(1).as("hex_number")),
  );
  const binaryNumber = rule(() =>
    seq(alt(str("0b"), str("0B")), match("[01]").repeat(1).as("binary_number")),
  );
  const octalNumber = rule(() =>
    seq(alt(str("0o"), str("0O")), match("[0-7]").repeat(1).as("octal_number")),
  );

  // --- helpers (html/parse.rb:133-216) -------------------------------------

  /**
   * `parse_tag` (`html/parse.rb:151`). `<name attrs>` or `</name>`.
   *
   * Only the open form takes attributes; `parse_tag(:close, ...)` goes straight
   * from the name to `>`, so `</i class="x">` is not a closing tag.
   *
   * Functions, not constants, throughout this block: each Ruby call builds a
   * fresh atom, and pegkit's packrat cache is keyed by atom identity, so
   * hoisting one would give two call sites a shared cache the gem does not
   * give them.
   */
  function parseTag(opts: "open" | "close", tagName: string | null, captureName?: string): Atom {
    let tag = opts === "close" ? seq(str("<"), str("/")) : str("<");
    let nameExpression = htmlTagName(tagName);
    if (captureName !== undefined) nameExpression = nameExpression.capture(captureName);
    tag = seq(tag, nameExpression);
    if (opts === "open") tag = seq(tag, tagAttributes());
    return seq(tag, str(">"));
  }

  /**
   * `parse_void_tag` (`html/parse.rb:161`). An open tag with no close, which
   * `<br>` is the only user of. Note it takes attributes, so `<br/>` and
   * `<br />` are the same node as `<br>`: the `/` is consumed by
   * `tagAttributes`, not by a self-closing branch, because there is no such
   * branch anywhere in this grammar.
   */
  function parseVoidTag(tagName: string): Atom {
    return seq(str("<"), htmlTagName(tagName), tagAttributes(), str(">"));
  }

  /**
   * `html_entity` (`html/parse.rb:165`). Hex, decimal, or named.
   *
   * `repeat(1)` on the first two, and a mandatory leading letter on the third —
   * see the note on `symbolTextOrTag` for why that one character matters. The
   * named form accepts any letter-led name at all: nothing here or downstream
   * checks it against an entity table, so `&nosuchthing;` is a `:symbol`.
   */
  function htmlEntity(): Atom {
    return alt(
      seq(str("&#x"), match("[0-9a-fA-F]").repeat(1), str(";")),
      seq(str("&#"), match("[0-9]").repeat(1), str(";")),
      seq(str("&"), match("[a-zA-Z]"), match("[a-zA-Z0-9]").repeat(), str(";")),
    );
  }

  /**
   * `parse_sub_sup_tags` (`html/parse.rb:171`): `<name>sequence</name>`, tagged
   * `<transformName>_value`.
   *
   * The `tagNames` list is the `%w[td th]` case: two alternatives sharing one
   * tag, which is how `<th>` becomes a `:td_value`.
   */
  function parseSubSupTags(tagNames: readonly string[], transformName: string): Atom {
    return alt(
      ...tagNames.map((tagName) =>
        seq(
          parseTag("open", tagName),
          sequence.as(`${transformName}_value`),
          parseTag("close", tagName),
        ),
      ),
    );
  }

  /**
   * `wrapped_tag` (`html/parse.rb:179`): any element at all, whose closing tag
   * must name the same element its opening tag did.
   *
   * This is the only `scope` in the whole gem — `html/parse.rb:180` is the sole
   * Parslet `scope` under `lib/plurimath/`, so this rule is the first thing to
   * exercise pegkit's. The scope matters because `wrapped_tag` nests: parsing
   * `<i><b>x</b></i>` reaches the inner `wrapped_tag` while `html_tag_name` is
   * bound to `i`, and without the scope the inner element's capture would
   * overwrite it and the outer `</i>` would be looked for as `</b>`.
   *
   * The wrapper contributes nothing to the tree: neither tag is `.as`-named, so
   * only `inner`'s nodes survive.
   *
   * **The body is built per entry, and that is load-bearing rather than
   * stylistic.** Parslet's `Scope#apply` (`parslet-2.0.0/lib/parslet/atoms/
   * scope.rb:16-21`) reads
   *
   *     context.scope do
   *       parslet = block.call
   *       return parslet.apply(source, context, consume_all)
   *     end
   *
   * — `block.call` sits *inside* `context.scope`, so every entry constructs a
   * fresh `parse_tag(:open, ...)` and a fresh `matching_close_tag`. pegkit's
   * `scope` takes an already-built `Atom` instead, and building this body once
   * broke on backtracking: the `CaptureAtom` is uncacheable but the `seq`
   * around it is not, so a second entry at a position the sequence had already
   * matched replayed the cached success and skipped the capture write. The
   * close tag was then built from an absent capture. `<br><i>x</i>` is the
   * shortest input that does it — measured, not deduced — and it threw out of
   * `caseInsensitiveString` instead of returning the gem's tree.
   *
   * `dynamic` restores Parslet's timing exactly: it is uncacheable and its
   * builder runs after `ScopeAtom` has pushed the frame, so `parseTag` and
   * `matchingCloseTag` are new objects with empty caches on every entry, while
   * `inner` stays the shared atom the caller passed — which is also what Ruby
   * does, since `expression` is a memoized `rule` entity there.
   *
   * This is deliberately fixed here rather than in pegkit. `ScopeAtom` itself
   * is faithful — push a frame, run, pop — and it is `scope`'s *signature*
   * that is narrower than Parslet's: `Scope.new` takes a block, `scope()` takes
   * an atom. Composing it with `dynamic` recovers the missing half at the one
   * call site that needs it, without changing a primitive three other grammars
   * already depend on.
   */
  function wrappedTag(inner: Atom): Atom {
    return scope(
      dynamic(() => seq(parseTag("open", null, "html_tag_name"), inner, matchingCloseTag())),
    );
  }

  /**
   * `matching_close_tag` (`html/parse.rb:187`): the closing tag for whichever
   * element the enclosing `wrappedTag` captured.
   *
   * Built at parse time from the capture, which is why it is `dynamic`. The
   * captured text is the open tag's name as it was written, and
   * `caseInsensitiveString` makes the close match it regardless of case —
   * measured on the oracle, `<i>a</I>` parses and `<i>a</j>` does not.
   */
  function matchingCloseTag(): Atom {
    return dynamic((context) => parseTag("close", captured(context, "html_tag_name") ?? ""));
  }

  /**
   * `html_tag_name` (`html/parse.rb:193`). With no name, any element name at
   * all; with one, that name case-insensitively, followed by a boundary.
   */
  function htmlTagName(tagName: string | null): Atom {
    if (tagName === null) return seq(match("[a-zA-Z]"), match("[a-zA-Z0-9:._-]").repeat());

    return seq(caseInsensitiveString(tagName), tagNameBoundary());
  }

  /**
   * `tag_name_boundary` (`html/parse.rb:199`). A lookahead, consuming nothing,
   * so `<subx>` is not a `<sub>`: the name must end at whitespace, `/` or `>`.
   *
   * Ruby's `match["\\s/>"]` is the whitespace class plus two characters — a
   * genuine `\s`, unlike the two String spellings elsewhere in this file.
   */
  function tagNameBoundary(): Atom {
    return match(`[${RUBY_SPACE}/>]`).present();
  }

  /**
   * `tag_attributes` (`html/parse.rb:203`). Everything between the name and the
   * `>`, with quoted values taken whole so a `>` inside one does not end the
   * tag — measured, `<div id='a>b'>x</div>` parses.
   */
  function tagAttributes(): Atom {
    return alt(quotedAttributeValue(), match("[^<>]")).repeat();
  }

  /** `quoted_attribute_value` (`html/parse.rb:207`). Double or single quoted. */
  function quotedAttributeValue(): Atom {
    return alt(
      seq(str('"'), match('[^"]').repeat(), str('"')),
      seq(str("'"), match("[^']").repeat(), str("'")),
    );
  }

  /**
   * `case_insensitive_string` (`html/parse.rb:212`): one atom per character,
   * letters as a two-element class and everything else literal.
   */
  function caseInsensitiveString(value: string): Atom {
    if (value.length === 0) {
      // A live guard, not decoration — an earlier revision of `wrappedTag`
      // reached it on `<br><i>x</i>`, because a cached sequence skipped the
      // capture write and `matchingCloseTag` was handed an absent name. It
      // caught that defect, which is the argument for keeping it. Ruby reaches
      // the same dead end differently: `[].reduce(:>>)` answers nil and
      // `nil >> tag_name_boundary` raises NoMethodError.
      //
      // With the capture written on every entry it is unreachable again: the
      // only caller that can pass a computed name is `matchingCloseTag`, and
      // `html_tag_name(nil)` cannot capture fewer than one character.
      throw new Error("createHtmlGrammar: case-insensitive match on an empty tag name");
    }
    return seq(
      ...[...value].map((char) =>
        /[A-Za-z]/.test(char) ? match(`[${char.toLowerCase()}${char.toUpperCase()}]`) : str(char),
      ),
    );
  }

  const rules: HtmlRules = {
    space,
    unary,
    binary,
    linebreak,
    subTag,
    supTag,
    mod,
    lparen,
    rparen,
    subSup,
    openParen,
    closeParen,
    subSupTags,
    unaryArgs,
    binaryArgs,
    unaryFunctions,
    binaryFunctions,
    parseClasses,
    symbolTextOrTag,
    intermediateExp,
    parseParenthesis,
    sequence,
    tagParse,
    expression,
    hexNumber,
    binaryNumber,
    octalNumber,
  };

  return { decimalMarker, root: expression, rules };
}

/**
 * One grammar per decimal marker, built on first use.
 *
 * Immutable once built, so the parse-time state that would make sharing unsafe
 * (the packrat cache) lives in the per-parse context rather than on the atoms.
 * Keyed by marker, never by locale: two locales that share a marker share a
 * grammar.
 */
const grammarCache = new Map<string, HtmlGrammar>();

/** The grammar for a caller's locale, resolved through `formatting`. */
export function htmlGrammar(options?: LocaleOptions | null): HtmlGrammar {
  const marker = resolveDecimalMarker(options);
  let grammar = grammarCache.get(marker);
  if (grammar === undefined) {
    grammar = createHtmlGrammar(marker);
    grammarCache.set(marker, grammar);
  }
  return grammar;
}

/**
 * Parses **normalised** HTML into a Parslet-shaped tree.
 *
 * Throws `ParseFailed`, whose `index` is a UTF-16 offset into the supplied
 * string — which is the *normalised* text, not a caller's input, until the
 * normalisation slice lands to map it back (ARCHITECTURE.md §5).
 *
 * The gem lets `Parslet::ParseFailed` escape `Html::Parser#parse` uncaught —
 * there is no `rescue` anywhere under `lib/plurimath/html/` — so a refusal here
 * is a throw, not a null.
 */
export function parseHtmlNormalized(normalized: string, options?: LocaleOptions | null) {
  return htmlGrammar(options).root.parse(normalized);
}
