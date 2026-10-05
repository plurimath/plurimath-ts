/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * OMML render tables: the one lookup `Text#to_omml_without_math_tag`
 * reads that `../symbols.ts`'s per-class literals do not supply,
 * consumed by `src/render/text/omml.ts`.
 *
 * `Text#symbol_value` (text.rb:126-129) inverts
 * `Mathml::Constants::UNICODE_SYMBOLS` and `SYMBOLS` — the SAME Ruby
 * constant the mathml render-tables slice inverts for its own
 * `MATHML_UNICODE_INVERT`/`MATHML_SYMBOLS_INVERT`. The two exports below
 * are byte-identical to those, but generated and verified as this
 * format's own copy: ARCHITECTURE.md §3 rule 4 forbids an omml kind file
 * importing another format's `generated/` slice, so the omml renderer
 * needs its own. Every entry whose key is reachable through the
 * grammar's `unicode[:w+]` name syntax is re-verified through a live
 * `to_omml` render (`<m:t>…</m:t>`) rather than assumed from the mathml
 * measurement; a non-word key can't be spelled through that syntax, so
 * it is carried over unverified (measured: 95 of 144 UNICODE entries
 * and 1 of 17 SYMBOLS entries are word-shaped and live-probed).
 *
 * A name absent from both tables is not a parity gap: `Text#symbol_value`
 * returns `nil` there, and the `gsub` block around it substitutes the
 * empty string (Ruby's block-return-nil rule) rather than raising —
 * measured directly, `Text.new("unicode[:nosuchname]")` on the pinned
 * oracle renders `<m:t></m:t>`.
 */

/**
 * `Mathml::Constants::UNICODE_SYMBOLS.invert`, name -> entity,
 * Ruby's invert semantics kept: a name mapped from several
 * entities keeps the LAST one. Read once on the OMML render path:
 * the `unicode[:name]` lookup `Text#parse_text` reaches via
 * `Text#symbol_value` (`text.rb:126-128`).
 */
export const OMML_UNICODE_INVERT: ReadonlyMap<string, string> = new Map([
  ["alpha", "&#x3b1;"],
  ["beta", "&#x3b2;"],
  ["gamma", "&#x3b3;"],
  ["Gamma", "&#x393;"],
  ["delta", "&#x3b4;"],
  ["Delta", "&#x394;"],
  ["increment", "&#x2206;"],
  ["epsilon", "&#x3b5;"],
  ["varepsilon", "&#x25b;"],
  ["zeta", "&#x3b6;"],
  ["eta", "&#x3b7;"],
  ["theta", "&#x3b8;"],
  ["Theta", "&#x398;"],
  ["vartheta", "&#x3d1;"],
  ["iota", "&#x3b9;"],
  ["kappa", "&#x3ba;"],
  ["lambda", "&#x3bb;"],
  ["Lambda", "&#x39b;"],
  ["mu", "&#x3bc;"],
  ["nu", "&#x3bd;"],
  ["xi", "&#x3be;"],
  ["Xi", "&#x39e;"],
  ["pi", "&#x3C0;"],
  ["Pi", "&#x3a0;"],
  ["rho", "&#x3c1;"],
  ["varsigma", "&#x3c2;"],
  ["sigma", "&#x3c3;"],
  ["Sigma", "&#x3a3;"],
  ["tau", "&#x3c4;"],
  ["upsilon", "&#x3c5;"],
  ["phi", "&#x3c6;"],
  ["Phi", "&#x3a6;"],
  ["varphi", "&#x3d5;"],
  ["chi", "&#x3c7;"],
  ["psi", "&#x3c8;"],
  ["Psi", "&#x3a8;"],
  ["omega", "&#x3c9;"],
  ["Omega", "&#x3a9;"],
  ["cdot", "&#x22c5;"],
  ["*", "&#x2219;"],
  [".", "&#x2e;"],
  ["**", "&#x2217;"],
  ["***", "&#x22c6;"],
  ["xx", "&#xd7;"],
  ["|><", "&#x22c9;"],
  ["><|", "&#x22ca;"],
  ["|><|", "&#x22c8;"],
  ["-:", "&#xf7;"],
  ["@", "&#x2218;"],
  ["o+", "&#x2a01;"],
  ["ox", "&#x2297;"],
  [" ", "&#x2299;"],
  ["sum", "&#x2211;"],
  ["prod", "&#x220f;"],
  ["^^", "&#x2227;"],
  ["^^^", "&#x22c0;"],
  ["vv", "&#x2228;"],
  ["vvv", "&#x22c1;"],
  ["nn", "&#x2229;"],
  ["nnn", "&#x22c2;"],
  ["cup", "&#x222a;"],
  ["uuu", "&#x22c3;"],
  ["!=", "&#x2260;"],
  ["<=", "&#x2264;"],
  [">=", "&#x2265;"],
  ["-<", "&#x227a;"],
  [">-", "&#x227b;"],
  ["-<=", "&#x2aaf;"],
  [" >-=", "&#x2ab0;"],
  ["in", "&#x2208;"],
  ["!in", "&#x2209;"],
  ["sub", "&#x2282;"],
  ["sup", "&#x2283;"],
  ["sube", "&#x2286;"],
  ["supe", "&#x2287;"],
  ["-=", "&#x2261;"],
  ["~=", "&#x2245;"],
  ["~~", "&#x2248;"],
  ["prop", "&#x221d;"],
  ["not", "&#xac;"],
  ["AA", "&#x2200;"],
  ["EE", "&#x2203;"],
  ["_|_", "&#x22a5;"],
  ["TT", "&#x22a4;"],
  ["|--", "&#x22a2;"],
  ["|==", "&#x22a8;"],
  ["<<", "&#x2329;"],
  [">>", "&#x232a;"],
  ["int", "&#x222b;"],
  ["oint", "&#x222e;"],
  ["del", "&#x2202;"],
  ["grad", "&#x2207;"],
  ["+-", "&#xb1;"],
  ["O/", "&#x2205;"],
  ["oo", "&#x221e;"],
  ["aleph", "&#x2135;"],
  [":.", "&#x2234;"],
  [":'", "&#x2235;"],
  ["/_", "&#x2220;"],
  ["/_\\", "&#x25b3;"],
  ["'", "&#x2032;"],
  ["quad", "&#xa0;&#xa0;"],
  ["qquad", "&#xa0;&#xa0;&#xa0;&#xa0;"],
  ["overline", "&#x203e;"],
  ["frown", "&#x2322;"],
  ["cdots", "&#x22ef;"],
  ["vdots", "&#x22ee;"],
  ["ddots", "&#x22f1;"],
  ["diamond", "&#x22c4;"],
  ["square", "&#x25a1;"],
  ["|__", "&#x230a;"],
  ["__|", "&#x230b;"],
  ["|~", "&#x2308;"],
  ["~|", "&#x2309;"],
  ["CC", "&#x2102;"],
  ["NN", "&#x2115;"],
  ["QQ", "&#x211a;"],
  ["RR", "&#x211d;"],
  ["ZZ", "&#x2124;"],
  ["uarr", "&#x2191;"],
  ["darr", "&#x2193;"],
  ["larr", "&#x2190;"],
  ["harr", "&#x2194;"],
  ["rArr", "&#x21d2;"],
  ["lArr", "&#x21d0;"],
  ["hArr", "&#x21d4;"],
  [">->", "&#x21a3;"],
  ["->>", "&#x21a0;"],
  [">->>", "&#x2916;"],
  ["|->", "&#x21a6;"],
  ["...", "&#x2026;"],
  ["-", "&#x2212;"],
  ["obrace", "&#x23de;"],
  ["ubrace", "&#x23df;"],
  ["vec", "&#x2192;"],
  ["hat", "^"],
  ["bar", "¯"],
  ["overleftrightarrow", "&#x20e1;"],
  ["ul", "_"],
  ["&", "&amp;"],
  [">", "&#x3e;"],
  ["<", "&#x3c;"],
  ["tilde", "~"],
  ["ddot", ".."],
]);

/**
 * `Mathml::Constants::SYMBOLS.invert`, `Text#symbol_value`'s
 * fallback lookup (`text.rb:128`). Only word-shaped names can
 * reach it through the `unicode[:\w+]` token regex.
 */
export const OMML_SYMBOLS_INVERT: ReadonlyMap<string, string> = new Map([
  ["|", "|"],
  ["//", "/"],
  ["\\\\", "\\"],
  ["tilde", "~"],
  ["(", "("],
  [")", ")"],
  ["(:", "(:"],
  [":)", ":)"],
  ["{", "{"],
  ["}", "}"],
  ["{:", "{:"],
  [":}", ":}"],
  ["]", "]"],
  ["[", "["],
  ["=", "="],
  ["+", "+"],
  ["-", "-"],
]);
