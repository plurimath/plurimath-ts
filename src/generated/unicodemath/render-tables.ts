/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * UnicodeMath render tables: the constant tables `to_unicodemath` reads
 * that no other generated slice supplies, consumed by
 * `src/formats/unicodemath/renderer.ts`.
 *
 * Read from `Plurimath::UnicodeMath::Constants` rather than measured
 * through a render, unlike the latex and mathml slices. That is a
 * deliberate difference: each is a plain lookup the gem performs
 * verbatim, with no per-class override to make a source read lie. What a
 * source read could still miss is a shape change, so the generator
 * shape-checks every table and fails rather than emitting something
 * malformed.
 *
 * Three call sites reverse-look-up these tables (`base.rb:128`,
 * `frac.rb:159`, `table.rb:422`), and Ruby's `Hash#invert` keeps the LAST
 * key for a duplicated value. The generator therefore refuses any table
 * that maps two keys to one value: a reverse lookup would silently pick
 * one, and the port would have no way to know which.
 */

export const UNICODEMATH_UNARY_SYMBOLS: ReadonlyMap<string, string> = new Map([
  ["underline", "&#x2581;"],
  ["hphantom", "&#x2b04;"],
  ["vphantom", "&#x21f3;"],
  ["underbar", "&#x2581;"],
  ["overline", "&#xaf;"],
  ["phantom", "&#x27e1;"],
  ["longdiv", "&#x27cc;"],
  ["circle", "&#x25cb;"],
  ["asmash", "&#x2b06;"],
  ["dsmash", "&#x2b07;"],
  ["hsmash", "&#x2b0c;"],
  ["smash", "&#x2b0d;"],
  ["overbar", "&#xaf;"],
]);

export const UNICODEMATH_HORIZONTAL_BRACKETS: ReadonlyMap<string, string> = new Map([
  ["underbracket", "&#x23b5;"],
  ["overbracket", "&#x23b4;"],
  ["undershell", "&#x23e1;"],
  ["underparen", "&#x23dd;"],
  ["underbrace", "&#x23df;"],
  ["overshell", "&#x23e0;"],
  ["overparen", "&#x23dc;"],
  ["overbrace", "&#x23de;"],
]);

export const UNICODEMATH_ACCENT_SYMBOLS: ReadonlyMap<string, string> = new Map([
  ["widetilde", "&#x303;"],
  ["widehat", "&#x302;"],
  ["ddddot", "&#x20dc;"],
  ["breve", "&#x306;"],
  ["check", "&#x30c;"],
  ["tilde", "&#x303;"],
  ["lhvec", "&#x20d0;"],
  ["rhvec", "&#x20d1;"],
  ["grave", "&#x300;"],
  ["dddot", "&#x20db;"],
  ["acute", "&#x301;"],
  ["ddot", "&#x308;"],
  ["lvec", "&#x20d6;"],
  ["hvec", "&#x20d1;"],
  ["ubar", "&#x332;"],
  ["tvec", "&#x20e1;"],
  ["dot", "&#x307;"],
  ["Bar", "&#x33f;"],
  ["bar", "&#x305;"],
  ["hat", "&#x302;"],
  ["vec", "&#x20d7;"],
]);

export const UNICODEMATH_UNARY_ARG_FUNCTIONS: ReadonlyMap<string, string> = new Map([
  ["bcancel", "&#x2572;"],
  ["xcancel", "&#x2573;"],
  ["ellipse", "&#x2b2d;"],
  ["cancel", "&#x2571;"],
  ["rrect", "&#x25a2;"],
  ["rect", "&#x25ad;"],
  ["abs", "&#x249c;"],
]);

export const UNICODEMATH_SIZE_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["A", "1.25em"],
  ["B", "1.5625em"],
  ["C", "0.8em"],
  ["D", "0.64em"],
]);

export const UNICODEMATH_MATRIXS: ReadonlyMap<string, string> = new Map([
  ["pmatrix", "&#x24a8;"],
  ["vmatrix", "&#x24b1;"],
  ["Vmatrix", "&#x24a9;"],
  ["bmatrix", "&#x24e2;"],
  ["Bmatrix", "&#x24c8;"],
  ["eqarray", "&#x2588;"],
  ["matrix", "&#x25a0;"],
  ["cases", "&#x24b8;"],
]);

export const UNICODEMATH_SUB_ALPHABETS: ReadonlyMap<string, string> = new Map([
  ["a", "&#x2090;"],
  ["e", "&#x2091;"],
  ["h", "&#x2095;"],
  ["i", "&#x1d62;"],
  ["j", "&#x2c7c;"],
  ["k", "&#x2096;"],
  ["l", "&#x2097;"],
  ["m", "&#x2098;"],
  ["n", "&#x2099;"],
  ["o", "&#x2092;"],
  ["p", "&#x209a;"],
  ["r", "&#x1d63;"],
  ["s", "&#x209b;"],
  ["t", "&#x209c;"],
  ["u", "&#x1d64;"],
  ["v", "&#x1d65;"],
  ["x", "&#x2093;"],
]);

export const UNICODEMATH_SUP_ALPHABETS: ReadonlyMap<string, string> = new Map([
  ["a", "&#x1d43;"],
  ["b", "&#x1d47;"],
  ["c", "&#x1d9c;"],
  ["d", "&#x1d48;"],
  ["e", "&#x1d49;"],
  ["f", "&#x1da0;"],
  ["g", "&#x1d4d;"],
  ["h", "&#x2b0;"],
  ["i", "&#x2071;"],
  ["j", "&#x2b2;"],
  ["k", "&#x1d4f;"],
  ["l", "&#x2e1;"],
  ["m", "&#x1d50;"],
  ["n", "&#x207f;"],
  ["o", "&#x1d52;"],
  ["p", "&#x1d56;"],
  ["r", "&#x2b3;"],
  ["s", "&#x2e2;"],
  ["t", "&#x1d57;"],
  ["u", "&#x1d58;"],
  ["v", "&#x1d5b;"],
  ["w", "&#x2b7;"],
  ["x", "&#x2e3;"],
  ["y", "&#x2b8;"],
  ["z", "&#x1dbb;"],
]);

export const UNICODEMATH_SUB_DIGITS: ReadonlyMap<string, string> = new Map([
  ["0", "&#x2080;"],
  ["1", "&#x2081;"],
  ["2", "&#x2082;"],
  ["3", "&#x2083;"],
  ["4", "&#x2084;"],
  ["5", "&#x2085;"],
  ["6", "&#x2086;"],
  ["7", "&#x2087;"],
  ["8", "&#x2088;"],
  ["9", "&#x2089;"],
]);

export const UNICODEMATH_SUP_DIGITS: ReadonlyMap<string, string> = new Map([
  ["0", "&#x2070;"],
  ["1", "&#xb9;"],
  ["2", "&#xb2;"],
  ["3", "&#xb3;"],
  ["4", "&#x2074;"],
  ["5", "&#x2075;"],
  ["6", "&#x2076;"],
  ["7", "&#x2077;"],
  ["8", "&#x2078;"],
  ["9", "&#x2079;"],
]);

export const UNICODEMATH_SUB_OPERATORS: ReadonlyMap<string, string> = new Map([
  ["+", "&#x208a;"],
  ["-", "&#x208b;"],
  ["=", "&#x208c;"],
  ["ₔ", "&#x2094;"],
]);

export const UNICODEMATH_SUP_OPERATORS: ReadonlyMap<string, string> = new Map([
  ["+", "&#x207a;"],
  ["-", "&#x207b;"],
  ["=", "&#x207c;"],
]);

export const UNICODEMATH_UNDEF_UNARY_FUNCTIONS: readonly string[] = [
  "arg",
  "def",
  "erf",
  "Im",
  "Pr",
  "Re",
  "tg",
];

export const UNICODEMATH_FONTS_CLASSES: readonly string[] = [
  "mbfitsans",
  "mbffrak",
  "mitsans",
  "mbfsans",
  "mbfscr",
  "mfrak",
  "msans",
  "mbfit",
  "mscr",
  "Bbb",
  "mup",
  "mbf",
  "mit",
  "mtt",
];

export const UNICODEMATH_DIACRITIC_OVERLAYS: readonly string[] = [
  "&#x20eb;",
  "&#x20ea;",
  "&#x20e6;",
  "&#x20e5;",
  "&#x20e4;",
  "&#x20e3;",
  "&#x20e2;",
  "&#x20e0;",
  "&#x20df;",
  "&#x20de;",
  "&#x20dd;",
  "&#x20da;",
  "&#x20d9;",
  "&#x20d8;",
  "&#x20d3;",
  "&#x20d2;",
  "&#x309;",
  "&#x304;",
  "&#x338;",
  "&#x337;",
  "&#x336;",
  "&#x335;",
  "&#x334;",
];

export const UNICODEMATH_DIACRITIC_BELOWS: readonly string[] = [
  "&#x316;",
  "&#x317;",
  "&#x318;",
  "&#x319;",
  "&#x31c;",
  "&#x31d;",
  "&#x31e;",
  "&#x31f;",
  "&#x320;",
  "&#x321;",
  "&#x322;",
  "&#x323;",
  "&#x324;",
  "&#x325;",
  "&#x326;",
  "&#x327;",
  "&#x328;",
  "&#x329;",
  "&#x32a;",
  "&#x32b;",
  "&#x32c;",
  "&#x32d;",
  "&#x32e;",
  "&#x32f;",
  "&#x330;",
  "&#x331;",
  "&#x332;",
  "&#x333;",
  "&#x339;",
  "&#x33a;",
  "&#x33b;",
  "&#x33c;",
  "&#x345;",
  "&#x347;",
  "&#x348;",
  "&#x349;",
  "&#x34d;",
  "&#x34e;",
  "&#x353;",
  "&#x354;",
  "&#x355;",
  "&#x356;",
  "&#x359;",
  "&#x35a;",
  "&#x35c;",
  "&#x35f;",
  "&#x362;",
  "&#x20e8;",
  "&#x20ec;",
  "&#x20ed;",
  "&#x20ee;",
  "&#x20ef;",
];
