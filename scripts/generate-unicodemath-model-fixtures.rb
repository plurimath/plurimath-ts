#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's UnicodeMath PARSE results — preprocessed text plus
# serialized model — for every input the port's transform is measured against.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-unicodemath-model-fixtures.rb --oracle /path/to/plurimath
#
# The shared corpus is AsciiMath-in / many-formats-out: every case's `input` is
# AsciiMath, so nothing in it exercises a UnicodeMath PARSER. What it does carry
# is `expected.unicodemath` — the gem's own UnicodeMath rendering of each case —
# and those are by construction strings the gem can produce. Feeding each back
# through `Plurimath::Math.parse(text, :unicode)` gives a round trip the port
# must match, over inputs nobody wrote by hand.
#
# Unlike the LaTeX fixtures there was no hand-picked COVERAGE list, for as long
# as the corpus alone could define the slice: the rules its
# `expected.unicodemath` strings fire, measured on the oracle, were the rules
# the port carried. That method was EXHAUSTED against the corpus as it stood
# at the time (103 distinct strings) outside the deferred table/matrix family
# — no other unported rule fired on it then — so RULE_COVERAGE below drives
# rule families chosen by what they BUILD instead, same shape as the LaTeX
# generator's own list: grouped by family, each input
# checked against the oracle before being written down. The corpus has since
# grown (see `corpusUnicodemathCount` in the generated fixtures for its
# current size) and continues to be exhausted for corpus-reachable rules
# independently of RULE_COVERAGE.
#
# There is a third, small BOUNDARY list, which is the opposite thing again.
# Each of its inputs fires a rule the slice does NOT carry, so the port must
# refuse it; the row records what the gem answered instead, which is what
# makes "the port refuses" a measured claim rather than a restatement of the
# port's own code. When a rule family lands, its rows move from refusal to
# parity.
#
# Rows record what the gem did, including refusing:
#   - `preprocessed`: `UnicodeMath::Parser.new(input).text`, the string Parslet
#     sees. The port implements that pass now (`formats/unicodemath/preprocess.ts`),
#     so the parity suite no longer feeds this field to the grammar: it drives
#     every row from the raw `input` and asserts the port re-derives this value.
#     The field stays because that assertion needs the oracle's own answer to
#     compare against.
#   - `model`: the serialized `Plurimath::Math.parse(input, :unicode)` result,
#     through `CorpusGenerator.serialize_node` — the same serializer that wrote
#     the pinned corpus's `model:` blocks.
#   - `raises`: the error class, when the gem refuses. `Plurimath::Math.parse`
#     funnels every StandardError into `ParseError`, so anything else escaping
#     here is a defect in this generator rather than a documented refusal.
#
# The oracle path MUST be a clean checkout of the pinned plurimath commit. This
# script loads it through $LOAD_PATH and refuses to run against an installed
# gem, which would silently answer from a different version.

require "digest"
require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-unicodemath-model-fixtures.rb"

# Inputs chosen to drive transform rules the corpus's `expected.unicodemath`
# strings do not reach, grouped by the family they cover. Each one is here
# because a rule needs it, not to be a second corpus — same intent as the
# LaTeX generator's `RULE_COVERAGE`.
#
# "multiscript": every rule building `Math::Function::Multiscript`
# (`transform.rb:1992`-`:3978`), one input per rule, each traced on the oracle
# with every registered block wrapped in a counter (rule numbers are the
# lines `rule(` calls OPEN on, not the block's `source_location`, which Ruby
# reports at the line carrying the block opener -- measured offsets on the
# pinned gem run to six, so there is no fixed distance to subtract):
#
#   "^3 X"          rule 1992 {pre_supscript, base}
#   "_2 X"          rule 2001 {pre_subscript, base}
#   "^3 X_5"        rule 2938 {pre_supscript, base, sub}
#   "_2^3 X"        rule 2948 {pre_supscript, pre_subscript, base}
#   "_2 X_5"        rule 2958 {pre_subscript, base, sub}
#   "_2 X₅"         rule 2971 {pre_subscript, base, sub_digits} — the trailing
#                   digit is U+2085 (SUBSCRIPT FIVE), not "_5"
#   "_2^3 X_5"      rule 3662 {pre_subscript, pre_supscript, base, sub}
#   "(_2)X"         rule 3687 {open_paren, pre_subscript, close_paren, base}
#   "(_2)X_5"       rule 3768 {open_paren, pre_subscript, close_paren, base,
#                   sub}
#   "_2^3 X_5^6"    rule 3853 {pre_subscript, pre_supscript, base, sub, sup}
#   "(_2^3)X"       rule 3952 {open_paren, pre_subscript, pre_supscript,
#                   close_paren, base}
#   "(_2^3)X_5^6"   rule 3978 {open_paren, pre_subscript, pre_supscript,
#                   close_paren, base, sub, sup}
#
# Then the same four rules that call `Utility.unfenced_value` -- `:2958`,
# `:3662`, `:3853`, `:3978` -- once more with the trailing script FENCED, since
# a bare script never reaches the unwrapping branch:
#
#   "_2 X_(5)"          rule 2958, fenced sub
#   "_2^3 X_(5)"        rule 3662, fenced sub
#   "_2^3 X_(5)^(6)"    rule 3853, fenced sub and sup
#   "(_2^3)X_(5)^(6)"   rule 3978, fenced sub and sup
#
# and twice more with the PRESCRIPTS fenced rather than the trailing script,
# which is a different pair of call sites in the same two rules:
#
#   "_(2)^(3) X_5"      rule 3662, fenced pre_sub and pre_sup
#   "_(2)^(3) X_5^6"    rule 3853, fenced pre_sub and pre_sup
#
# Every one of the twelve also fires `:57`, the `pre_script` unwrap every
# Multiscript construction routes through, so it needs no input of its own.
# "fraction": every rule the port carries that calls `Utility.fractions`
# (`unicode_math/utility.rb:86-104`) — the FRACTION family's real membership,
# measured the same way as MULTISCRIPT above: every registered block wrapped
# in a counter, one input per rule, traced on the oracle. The call sites
# number SEVENTEEN, not the 44 a prior line-range survey estimated — that
# count conflated this family with the `atom`/`atoms` and
# `recursive_numerator`/`recursive_denominator` combinators (`transform.rb:486`
# and some twenty siblings spanning the whole file, e.g. `:658`-`:697`), which
# build the multi-character ARRAY a `numerator: sequence(...)` or
# `denominator: sequence(...)` binding needs but do not themselves call
# `Utility.fractions` and are not specific to fractions at all — `entity =
# atoms | number` (`common_rules.rb:11`) is the generic multi-character-run
# production every bare symbol sequence in the grammar goes through.
#
# Of the seventeen, `transform.rb:1609` — plain `numerator: simple, denominator:
# simple`, no options — was already ported in the first slice: it is exactly
# what the corpus's own fraction-shaped `expected.unicodemath` strings reach,
# with `Utility.fractions`'s mutating `recursion_fraction` branch (continued
# fractions, `(a)/(b)/(c)`) already wired to it. The six below are its
# OPTION-carrying siblings — mini, `atop`, `choose`, `bevelled`, `ldiv`,
# `no_display_style` — every one restricted to the same `simple`/`simple` shape
# `:1609` already carries, so none of them needs the `atoms` combinator either:
#
#   "³/₂"          rule 1614 {mini_numerator, mini_denominator} -> Frac with
#                  {displaystyle: false}; sup/sub-sized `Number`s, not `Symbol`s
#   "x \atop y"    rule 2197 {numerator, atop, denominator} -> Frac with
#                  {linethickness: "0"}
#   "x \choose y"  rule 2209 {numerator, choose, denominator} -> Fenced(Lround,
#                  [Frac with {linethickness: "0", choose: true}], Rround)
#   "x\sdiv y"     rule 2347 {numerator, bevelled, denominator} -> Frac with
#                  {bevelled: true}
#   "x\ldiv y"     rule 2353 {numerator, ldiv, denominator} -> Frac with
#                  {ldiv: true}
#   "x\ndiv y"     rule 2377 {numerator, no_display_style, denominator} -> Frac
#                  with {displaystyle: false} — NOT {no_display_style: false},
#                  which is what `transform.rb:2371`'s SEQUENCE-denominator twin
#                  passes instead; the gem is inconsistent between the two and
#                  both are transcribed as measured.
#
# The other ten call sites — `:1619`, `:1624`, `:1629`, `:1634`, `:1639`,
# `:1644`, `:2203`, `:2359`, `:2365`, `:2371` — all need a `sequence` numerator
# or denominator; they turned out not to need the `atoms` combinator this
# comment once expected, and are ported and covered by the "fractions_seq"
# group below, not carried by any input here.
#
# "table": the `Td`/`Tr`/`Table`/`Mlabeledtr` family, measured at EIGHTEEN
# rules, not the seventeen a prior survey counted (`transform.ts`'s module
# header has the correction). Eight of them are corpus-covered already —
# `"⒨(a@b)"` and `"ⓢ(a&b@c&d)"` (both `corpus-unicodemath` rows) between them
# fire `:8`, `:9`, `:14`, `:32`, `:1569`, `:1574`, `:1584` and `:1649` — so
# this group carries witnesses for the other ten, one input per rule traced on
# the oracle the same way as the two groups above, plus six more `:1649`
# witnesses for BRANCH coverage a firing count cannot prove:
#
#   "■(a)"          rule 1670 {matrixs, array: simple} — one cell, no row
#                   separator, the `array: sequence` sibling above needs no
#                   input of its own.
#   "■3"            rule 1691 {matrixs, identity_matrix_number} — a MATRIXS
#                   character directly followed by one ASCII digit, no parens.
#   "■(3x)"         rule 15 {td: sequence} — a cell whose OWN content is two
#                   adjacent factors (`:735`'s `{factor:, operand:}`, already
#                   ported), which is what makes a single, tds-less cell a
#                   SEQUENCE rather than the `:8` `simple` case. `:17`
#                   (`{exp: sequence(:exp)} -> exp`, `:13`'s sequence twin) is
#                   the one small prerequisite this needs, unported until now
#                   for the same reason `:165`/`:170` were: nothing before this
#                   slice ever left `exp` a sequence.
#   "■(a&b&c)"      rule 1594 {td: simple, tds: sequence} — three single-token
#                   cells; the first cell stays SIMPLE, the fold of the other
#                   two is what is SEQUENCE.
#   "■((x)y&c)"     rule 1604 {td: sequence, tds: simple} — first cell's
#                   content is `:735`'s two-factor shape again (SEQUENCE), the
#                   second cell is a bare token (SIMPLE).
#   "■((x)y&c&d)"   rule 1599 {td: sequence, tds: sequence} — same first cell,
#                   folded against two more.
#   "■(a@b@c)"      rule 1579 {tr: simple, trs: sequence} — three single-cell
#                   rows; same SIMPLE/SEQUENCE split as `:1594`, one level up.
#   "■(a&b@c&d@e&f)" rule 1589 {tr: sequence, trs: sequence} — three two-cell
#                   rows: each row is already a SEQUENCE via `:1574`, and so is
#                   the fold of the last two rows.
#   "a#b"           rule 606 {labeled_tr_value: simple, labeled_tr_id: simple}
#                   — `Parser#post_processing`'s `#`-split wrapper
#                   (`parser.ts`'s `postProcessing`), with a single-token value.
#   "a b#c"         rule 598 {labeled_tr_value: sequence, labeled_tr_id: simple}
#                   — same wrapper, with `:835`'s `{factor:, expr:}` (already
#                   ported) giving the value a SEQUENCE instead.
#
# The six `:1649` branch witnesses, all `"X(a@b)"` — the same `array: sequence`
# shape `"⒨(a@b)"` above already reaches, one per `Constants::MATRIXS`
# character the two corpus rows do not cover:
#
#   "⒱(a@b)"  vmatrix, lowercase — the `else`/`get_table_class` branch, no
#             explicit parens.
#   "⒩(a@b)"  Vmatrix, capital — the `if :Vmatrix == matrix` branch, an
#             explicit `Paren::Norm`. `get_table_class` returns the SAME class
#             name, `"Vmatrix"`, for this and `⒱` above (`Utility.capitalize`
#             downcases the tail) — the pair is the collapse the module header
#             documents, reproduced rather than "fixed", and only comparable
#             with both rows in the set.
#   "Ⓢ(a@b)"  Bmatrix, capital — `elsif :Bmatrix == matrix`, explicit
#             `Paren::Lcurly`/`Paren::Rcurly`; `"ⓢ(a&b@c&d)"` above is its
#             collapsed lowercase pair, the `Bmatrix`/`bmatrix` twin of `⒩`/`⒱`.
#   "█(a@b)"  eqarray — `else`/`get_table_class`, a name with no `MATRIXS`
#             case-collision.
#   "■(a@b)"  matrix — `elsif :matrix == matrix`, the BARE `Table` carrier,
#             not `Table::Matrix`: "`Matrix` is not special"
#             (`table-behaviour.spec.ts`).
#   "Ⓒ(a@b)"  cases — `else`/`get_table_class`, no case collision.
#
# "relation": ten rules measured the same way, chosen by what UNBLOCKS
# `src/compat/index.ts`'s 50-input battery rather than by a Ruby class family
# — the battery's comment names twelve refused inputs plus the `"±"`
# `SLICE_BOUNDARY` row below, and every one of those thirteen is covered here,
# moved out of (or never entering) `SLICE_BOUNDARY` now that its rule is
# ported. Traced with every registered block wrapped in a counter, same
# method as MULTISCRIPT/FRACTION/TABLE above:
#
#   "±"       rule 99 {combined_symbols: simple} alone, at the tree ROOT
#                  — the input `SLICE_BOUNDARY` used to carry to prove this
#                  exact absence; ported now, so it moves here.
#   "a≤b"     rule 745 {factor: simple, operand: SEQUENCE} — `:735`'s
#                  sequence-operand twin; the input `SLICE_BOUNDARY` used for
#                  the same reason as `"±"` above.
#   "a≥b"     rule 745 again, a different relation glyph reaching the
#                  identical shape — kept for the battery's own sake, not for
#                  firing coverage `"a≤b"` already gives it.
#   "a±b"     rules 99 AND 745 together — the combined-symbol resolved
#                  first, then folded via the same sequence-operand rule.
#   "a→b"     rule 745, `→`, same shape.
#   "x∈A"     rule 745, `∈`, same shape.
#   "a≈b"     rule 745, `≈`, same shape.
#   "a≡b"     rule 745, `≡`, same shape.
#   "2·3"     rules 30 {atom: sequence}, 49 {factor: sequence} and 401
#                  {char: simple, number: simple} together — the interpunct
#                  resolves to a `char`, `3` a trailing `number`, and the pair
#                  folds up through the two bare SEQUENCE unwraps neither of
#                  which any prior slice needed.
#   "∂/∂x" rules 184 {ordinary_negated_operator: simple} and 2317
#                  {factor: simple, operand: simple, expr: simple} — a
#                  negated ordinary symbol immediately followed by a fraction.
#   "f(x)=y"       rule 2269 {factor: simple, operand: simple, expr:
#                  SEQUENCE} — `:2317`'s sequence-`expr` sibling.
#   "e^(iπ)"  rule 2447 {opener: simple, operand: SEQUENCE, closer:
#                  simple} — `:2436`'s sequence-operand twin, a parenthesised
#                  multi-token exponent.
#   "x'"           rule 1412 {first_value: simple, prime_accent_symbols:
#                  simple} — a bare prime.
#
# "nary": every `nary_class`/`nary`/`nary_sub_sup` call site the ported slice
# carries (`transform.rb:84`-`:3588`, eleven rules, plus the one small
# prerequisite `:255` needed to reach two of them), traced the same way —
# every registered block wrapped in a counter, one input per rule, checked
# against the oracle before being written down. `\amalg` (the gem's own
# `Constants::NARY_SYMBOLS` control word for `∐`) is the one NARY symbol
# whose UnicodeMath spelling also takes an inline MASK digit run (`13`,
# immediately after the symbol, no space) — `parser_spec.rb`'s own
# `#EXAMPLE_676`-`:678` use exactly this shape.
#
# A doubled nary directly under a bare `nary_class` (no sub/sup ahead of it,
# e.g. `"∫∫f g"`) measures as a GEM refusal in disguise: the oracle fires
# `:725` on it, but the surrounding `{nary_class:, naryand:}` node it leaves
# behind has no SEQUENCE-`naryand` rule to match it, and the gem's own
# `Kernel#Array` fallback silently turns the unmatched hash into pairs
# rather than raising — the exact failure mode `assertGemLeavesUnmatched`'s
# own doc comment already names. Nesting the double nary under a `sub`
# instead (`"∫_a∫f g"`) reaches `:725` (and `:730`, `:1874`, `:1931`) through
# `:1874`'s SEQUENCE-`naryand` rule, which DOES exist, and the oracle's own
# rendered output confirms a real parse rather than pair-flattened garbage.
RULE_COVERAGE_NARY_INPUTS = [
  "∫",                       # 175: bare nary_class, no sub/sup/naryand
  "∫_a",                     # 84 (nary_sub_sup pass-through) and 1931
  "∫^a",                     # 1953
  "∫f g",                    # 1831
  "∫_a∫f g",                 # 725 (nary + naryand_recursion, simple) via 1874/1931
  "∫_a∫f gh",                # 730 (nary + naryand_recursion, SEQUENCE) and 255, via 1874/1931
  "∫_a fg",                  # 1874 (nary_sub_sup + SEQUENCE naryand) and 255, via 1931
  "\\amalg13_d\\of d",       # 2856: mask + simple sub (#EXAMPLE_676)
  "\\amalg13^d\\of d",       # 2911: mask + simple sup, no sub
  "\\amalg13_d^d\\of d",     # 3588: mask + simple sub + simple sup
].freeze

# "atoms": the `{atom:, atoms:}` combinator (`grammar.ts:668`-`:670`,
# `common_rules.rb:9-11`, `transform.rb:486`/`:496`) and `:1851`, the one
# further `atom:`-keyed site (`atom`, `exclamation_symbol`) reachable WITHOUT
# also wiring FRACTION's SEQUENCE-numerator/denominator family
# (`transform.rb:1619`-`:2371`, ported and covered by the "fractions_seq" group
# above) — every OTHER `atom:` site with a third key
# (`recursive_numerator`/`recursive_denominator`/`binary_symbols`/`operator`)
# only ever appears inside a fraction's `numerator`/`denominator`, and most of
# those still land on a rule this slice does not carry for reasons outside
# the fraction family itself (see `transform.ts`'s own accounting beside
# `:675`); `transform.ts`'s own comment at `:735` records the measured input
# (`"1/a(b)"`, firing `:675` exactly as coded there) that proves the point
# rather than asserting it. Measured on the oracle, one input per rule:
#
#   "abc"  rule 486 (2-atom fold) + 496 (3rd atom onto the fold) + 49 (`:39`'s
#          SEQUENCE twin, unwrapping the folded array off `factor`)
#   "a!"   rule 1851 {atom, exclamation_symbol}, then `:49` again
#
# "combinators": the transform rules whose body BUILDS nothing (no `Math::` and
# no `Utility.` in the block): single-key unwraps and the list-join
# combinators (`[a, b]`, `[a] + b`, `a + b`) that fold adjacent `factor`/
# `operand`/`expr`/`exp`/script/`atom` values into one sequence. Each input
# below is the shortest oracle-parsed one, traced with every registered block
# wrapped in a counter (rule numbers are the lines `rule(` opens on) and then
# compared against the port, so an input here is one the port parses to the
# gem's own model, not merely one that reaches the rule. Rules fired also by
# a pre-existing row (`:104`, `:2233`) are listed with the input this group
# adds for them. `:765` and `:1791` used to be the only two `SLICE_BOUNDARY` rows.
#
#   :36    "..."
#   :59    "a²"
#   :60    "x₂"
#   :64    "lim_(n → b)"
#   :73    "a'^(c)"
#   :104   "a \u2002 b"
#   :222   "x̄2x"
#   :371   "a^2_b 2x"
#   :386   "sin a 2x"
#   :406   "ȧȧ"
#   :411   "🐟🐠🐡"
#   :431   "a^2_b+"
#   :436   "a^b c d/(a b/c (a)_b^c d)"
#   :491   "ȧ2x"
#   :543   "^a b 2x"
#   :548   "^a b+"
#   :700   "a'^a b"
#   :705   "x'_a a! a!"
#   :765   "a^b c"
#   :770   "(a b/c x^(a b) c) a!"
#   :775   "a_b++"
#   :785   "(2 x_a y a/b^c) ^a_b c"
#   :790   "a_b+"
#   :805   "∑_a^b c^a b"
#   :810   "■(a b&c d) x"
#   :815   "■(a b c&d)a x"
#   :855   "ab++"
#   :885   "\uffd7(a)a'"
#   :895   "\uffd7(a)a!"
#   :900   "a!+"
#   :905   "a!1"
#   :910   "x₂+"
#   :915   "x₂++"
#   :935   "▢(a + b) ."
#   :940   "▭a b a_b"
#   :950   "■(a&b@c&d)2x"
#   :955   "■(a&) a"
#   :1716  "a a^b"
#   :1721  "a a_b"
#   :1726  "a ^a b"
#   :1731  "a a²"
#   :1736  "a²+"
#   :1741  "a²2x"
#   :1791  "x a/b c"
#   :1796  "(a b)^c/(a b/c x₁)"
#   :1821  "(a b/c x^(a b) c) a!"
#   :2029  "a x² ab"
#   :2233  "1ab+"
#   :2239  "2xa÷b"
#   :2257  "n!a - b"
#   :2263  "ab1a b"
#   :2293  "a c^2+"
#   :2299  "a a_b +"
#   :2305  "a a^b ab"
#   :2311  "a a_b ab"
#   :2329  "|a| a b"
RULE_COVERAGE = {
  "atoms" => [
    "abc",
    "a!",
  ],
  # "script-subsup-nary": the SCRIPT/SUBSUP/BASE builders and the NARY
  # remainder (`transform.rb:53`-`:3047`). One input per rule, each traced on
  # the oracle with every registered block mapped to the `rule(` line it sits
  # under (a `TracePoint :b_call` over `transform.rb`), and kept only where the
  # port carries every OTHER rule the input fires. `x^y^(z)` (`:985`), the one
  # corpus input this family reaches, is already a corpus row.
  #
  #   "aᵃ"            53   {sup_alpha}, a mini-sup symbol
  #   "a1^1_1"        86   {subsup_exp: sequence} — the array `:2142` returns
  #                        when the base is a sequence, and `:2142` itself
  #   "a⁺"            113  {sup_operators}, bare
  #   "a^+n"          511  {operator, sup_script simple}, with `:1148`
  #   "a^+ab"         516  {operator, sup_script sequence}, with `:1148`
  #   "a^!!b"         521  {combined_symbols, sup_script}, with `:1148` — the
  #                        input slice B recorded as waiting on `:1148`
  #   "a_+1"          533  {operator, sub_script}, with `:1078`
  #   "a₁₁₁"          553  {sub_digits, sub_recursion_expr sequence}
  #   "a₁₂"           561  {sub_digits, sub_recursion_expr simple}
  #   "aⁿ⁺¹"          567  {sup_alpha, sup_recursion_expr sequence}, `:652`
  #   "a₁ⁿⁿ"          575  {sup_alpha, sup_recursion_expr simple}
  #   "a²³⁴"          584  {sup_digits, sup_recursion_expr sequence}
  #   "a²³"           592  {sup_digits, sup_recursion_expr simple}
  #   "a^+^b"         614  {operator, sup_recursion} -> `recursive_sup`
  #   "a_+_b"         622  {operator, sub_recursion simple} -> `recursive_sub`
  #   "a_+_ab"        630  {operator, sub_recursion sequence}
  #   "a_b_c"         635  {sub_script, sub_recursion} -> `recursive_sub`
  #   "a₁₊₁"          640  {sub_operators, sub_recursions simple}
  #   "a₁₊₁₂"         646  {sub_operators, sub_recursions sequence}
  #   "aⁿ⁺¹"          652  {sup_operators, sup_recursions simple}, with `:567`
  #   "a^b^c"         985  {sup_script, sup_recursion} -> `recursive_sup`
  #   "a^cd^e"        1011 {sup_script sequence, sup_recursion}
  #   "a1_1"          1054 {base sequence, sub simple}
  #   "a1_cd"         1069 {base sequence, sub sequence}
  #   "+_c1"          1078 {base simple, sub sequence}
  #   "a1^1"          1139 {base sequence, sup simple}
  #   "a^!!b"         1148 {base simple, sup sequence}
  #   "a1^cd xy"      1164 {base sequence, sup sequence}
  #   "lim^n ab"      1183 {unary_sub_sup, first_value sequence}
  #   "∑_c1"          1919 {nary_class, sub sequence}
  #   "a1^1_1"        2142 {base sequence, sup simple, sub simple}
  #   "2₁₂ⁿ"          2153 {base simple, sup simple, sub sequence}
  #   "+^c1_c1"       2163 {base simple, sup sequence, sub sequence}
  #   "+^c1_1"        2173 {base simple, sup sequence, sub simple}
  #   "∑₁₂²"          2183 {nary_class, sub sequence, sup simple}
  #   "∑^c1_c1"       2827 {nary_class, sub sequence, sup sequence}
  #   "∑^c1_1"        2841 {nary_class, sub simple, sup sequence}
  #   "\\amalg13_cd"   2884 {nary_class, mask, sub sequence}
  #   "\\amalg13^c1_c1" 2993 {nary_class, mask, sub sequence, sup sequence}
  #   "\\amalg13^c1_1"  3020 {nary_class, mask, sub simple, sup sequence}
  #   "\\amalg13^1_c1"  3047 {nary_class, mask, sub sequence, sup simple}
  #
  #   "⏟ab_1"         1375 {hbracket_class, scripted_first_value sequence} —
  #                        the `:1054` array the `decoration` group could not
  #                        build (fires `:1054`, `:38`)
  "script-subsup-nary" => [
    "a^b1",
    "a_b1",
    "aᵃ",
    "a1^1_1",
    "a⁺",
    "a^+n",
    "a^+ab",
    "a^!!b",
    "a_+1",
    "a₁₁₁",
    "a₁₂",
    "aⁿ⁺¹",
    "a₁ⁿⁿ",
    "a²³⁴",
    "a²³",
    "a^+^b",
    "a_+_b",
    "a_+_ab",
    "a_b_c",
    "a₁₊₁",
    "a₁₊₁₂",
    "a^b^c",
    "a^cd^e",
    "a1_1",
    "a1_cd",
    "+_c1",
    "a1^1",
    "a1^cd xy",
    "lim^n ab",
    "∑_c1",
    "2₁₂ⁿ",
    "+^c1_c1",
    "+^c1_1",
    "∑₁₂²",
    "∑^c1_c1",
    "∑^c1_1",
    "\\amalg13_cd",
    "\\amalg13^c1_c1",
    "\\amalg13^c1_1",
    "\\amalg13^1_c1",
    "⏟ab_1",
  ],
  "multiscript" => [
    "^3 X",
    "_2 X",
    "^3 X_5",
    "_2^3 X",
    "_2 X_5",
    "_2 X₅",
    "_2^3 X_5",
    "(_2)X",
    "(_2)X_5",
    "_2^3 X_5^6",
    "(_2^3)X",
    "(_2^3)X_5^6",
    # The four fenced-script witnesses. Without them, bypassing every one of
    # the ten `unfenced_value` calls in `:2958`, `:3662`, `:3853` and `:3978`
    # left the whole UnicodeMath suite green -- the twelve inputs above all
    # carry BARE scripts, which that helper passes through untouched. These
    # parenthesize the trailing script, which is the case it exists for.
    "_2 X_(5)",
    "_2^3 X_(5)",
    "_2^3 X_(5)^(6)",
    "(_2^3)X_(5)^(6)",
    # Those four fence the TRAILING script. `:3662` and `:3853` unwrap their
    # PRESCRIPTS through the same helper, and no input above reaches those four
    # call sites -- bypassing them alone stayed green over all 129 rows. These
    # two fence the prescripts instead.
    "_(2)^(3) X_5",
    "_(2)^(3) X_5^6",
  ],
  "fraction" => [
    "³/₂",
    "x \\atop y",
    "x \\choose y",
    "x\\sdiv y",
    "x\\ldiv y",
    "x\\ndiv y",
  ],
  # "fractions_seq": slice E — the `Utility.fractions`/`Utility.unicode_fractions`
  # call sites the "fraction" group above could not reach (a SEQUENCE side, a
  # vulgar-fraction entity), plus the slice B rules a fraction's
  # `recursive_numerator`/`recursive_denominator` finally gives a reaching
  # input. Each traced on the oracle (rule numbers are the lines `rule(` opens
  # on); rules named in a comment are the ones the row was chosen for, the
  # others fire as prerequisites.
  #
  #   "½"                    96    {unicode_fractions}
  #   "½ a"                  217   {unicode_fractions, expr: simple}
  #   "½ a b"                212   {unicode_fractions, expr: sequence}
  #   "(½ a b)"              3277  bracketed run led by a vulgar fraction
  #   "1/a(b)"               1619  numerator simple, denominator sequence
  #   "²/₃₄"                 1624  mini_numerator simple, mini_denominator sequence
  #   "a(b)/c"               1629  numerator sequence, denominator simple
  #   "²³/₃"                 1634  mini, sequence numerator
  #   "a(b)/c(d)"            1639  both sequences
  #   "²³/₃₄"                1644  mini, both sequences
  #   "a(b)\atop c"          2203  atop, sequence numerator
  #   "1\sdiv a(b)"          2359  bevelled, sequence denominator
  #   "1\ldiv a(b)"          2365  ldiv, sequence denominator
  #   "1\ndiv a(b)"          2371  no_display_style, sequence denominator
  #   "a∘b/c"                2048  {atom, binary_symbols, recursive_numerator}
  #   "1/2\not∘b"           284   {binary_symbols, recursive_denominator: simple}
  #   "1/2\not∘⊆⊈"          290   same, recursive_denominator sequence
  #   "⊕b/c"                 296   {binary_symbols, recursive_numerator}
  #   "a\not∈b"             666   {relational_symbols, recursive_denominator}
  #   "(1/2 a)"              3411  bracketed frac + simple exp
  #   "(1/2 a b)"            3422  bracketed frac + sequence exp
  #   "¹/₂≤₃/b"              2393  {frac, relational_symbols, expr}
  #   "++¹/₂ḟa"              2797  {operator, frac, expr: sequence}
  #   "├1(1/2┤2)"            2685  masked open + masked close around a `frac`
  #   "├0(1/2┤10)"           2685  the `1.25**0` -> "1.0em" and two-digit branch
  #   "(1/2┤3)"              2707  plain open, masked close
  #
  # Prerequisites the rows above need, registered by the port under the
  # owning slice's id: 396, 561, 592, 675, 1756.
  "fractions_seq" => [
    "½",
    "½ a",
    "½ a b",
    "(½ a b)",
    "1/a(b)",
    "²/₃₄",
    "a(b)/c",
    "²³/₃",
    "a(b)/c(d)",
    "²³/₃₄",
    "a(b)\\atop c",
    "1\\sdiv a(b)",
    "1\\ldiv a(b)",
    "1\\ndiv a(b)",
    "a∘b/c",
    "1/2\\not∘b",
    "1/2\\not∘⊆⊈",
    "⊕b/c",
    "a\\not∈b",
    "(1/2 a)",
    "(1/2 a b)",
    "¹/₂≤₃/b",
    "++¹/₂ḟa",
    "├1(1/2┤2)",
    "├0(1/2┤10)",
    "(1/2┤3)",
  ],
  "table" => [
    "■(a)",
    "■3",
    "■(3x)",
    "■(a&b&c)",
    "■((x)y&c)",
    "■((x)y&c&d)",
    "■(a@b@c)",
    "■(a&b@c&d@e&f)",
    "a#b",
    "a b#c",
    "⒱(a@b)",
    "⒩(a@b)",
    "Ⓢ(a@b)",
    "█(a@b)",
    "■(a@b)",
    "Ⓒ(a@b)",
  ],
  # "decoration": `hbracket_class` (`transform.rb:1286`-`:1391`, building
  # `Obrace`/`Ubrace`/`Overset`/`Underset` from the eight `HORIZONTAL_BRACKETS`
  # characters) and `overlay_after`/`overlay_before`/`below_after`
  # (`:1420`-`:1491`, building `Overset`/`Underset`/`Menclose` from a
  # combining diacritic), plus the four unwraps every one of them routes
  # through (`:40`'s `hbrack`, `:81`'s `diacritic_belows`, `:88`'s
  # `diacritics_accents`, `:94`'s `diacritic_overlays`), which needed no
  # input of their own.
  #
  #   "⏞a"    rule 1286, hbracket_class simple/first_value simple, the
  #           `hbrack == overbrace` branch -> bare `Obrace`.
  #   "⏟a"    rule 1286, same shape, the `hbrack == underbrace` branch on a
  #           value that is NOT a `Base` -> bare `Ubrace`.
  #   "⏟x_2"  rule 1286, same shape, the `underbrace` branch on a value that
  #           IS a `Base` (`:1019` fires first) -> `Underset(2, Ubrace(x))`,
  #           not a bare `Ubrace`.
  #   "⎴a"    rule 1286, `hbrack` neither over- nor under-brace and NOT in
  #           `UNDER_HORIZONTAL_BRACKETS` (overbracket) -> `Overset`.
  #   "⎵a"    rule 1286, same else branch, `hbrack` IS in
  #           `UNDER_HORIZONTAL_BRACKETS` (underbracket) -> `Underset`.
  #   "\overbracket(a)"
  #           rule 1286, same else branch, but reached through
  #           `op_h_bracket_prefixed` (`constants_rules.rb:81`) rather than
  #           `op_h_bracket`: `hbracket_class` captures the bracket NAME
  #           "overbracket", not the entity, so `HORIZONTAL_BRACKETS[hbrack.
  #           to_sym]` resolves it to `&#x23b4;` before `Overset` is built.
  #           Exercises the name-form lookup `"⎴a"` above cannot, since that
  #           input already carries the entity and never needs the table.
  #   "⎵3x"   rule 1315, `hbracket_class` simple/`first_value` SEQUENCE
  #           (`:735`'s `{factor:, operand:}` gives "3x" a sequence, the same
  #           shape `"■(3x)"` above reaches for `td`) -> `Underset` wrapping
  #           a `Formula`.
  #   "⏟a^2"  rule 1344, `hbracket_class` simple/`scripted_first_value`
  #           simple — a scripted base resolves through `:1116` before
  #           `hbracket_class` sees it, so this is the SIMPLE
  #           `scripted_first_value` shape, not the SEQUENCE one. `:1375`,
  #           the SEQUENCE twin, needs a sequence-shaped scripted base and is
  #           witnessed by `"⏟ab_1"` in the "script-subsup-nary" group.
  #   "3x⃝"   rule 1420, `first_value` SEQUENCE/`overlay_after` simple — the
  #           same `{factor:, operand:}` sequence as `"⎵3x"` above, with
  #           `Array#pop` peeling the diacritic onto only the LAST factor.
  #   "a⃝"    rule 1447, `first_value` simple/`overlay_after` simple, the
  #           `notation == "mover"` branch (U+20DD is `"mover"` in
  #           `OVERLAYS_NOTATIONS`) -> `Overset` with `accent: true`.
  #   "a⃞" rule 1447, same shape, a notation OTHER than `"mover"`
  #           (U+20DE is `"box"`) -> `Menclose`.
  #   "⃝b"    rule 1473, `overlay_before` simple/`first_value` simple, the
  #           `"mover"` branch again, from the LEADING position this time.
  #   "a̖" rule 1491, `below_after` simple/`first_value` simple, the
  #           `notation == "munder"` branch (U+0316 is `"munder"` in
  #           `BELOWS_NOTATIONS`) -> `Underset` with `accent: true`.
  "decoration" => [
    "⏞a",
    "⏟a",
    "⏟x_2",
    "⎴a",
    "⎵a",
    "\\overbracket(a)",
    "⎵3x",
    "⏟a^2",
    "3x⃝",
    "a⃝",
    "a⃞",
    "⃝b",
    "a̖",
  ],
  "relation" => [
    "±",
    "a≤b",
    "a≥b",
    "a±b",
    "a→b",
    "x∈A",
    "a≈b",
    "a≡b",
    "2·3",
    "∂/∂x",
    "f(x)=y",
    "e^(iπ)",
    "x'",
  ],
  "nary" => RULE_COVERAGE_NARY_INPUTS,
  # "root_overunder": the root / unary-function / over-under / accent leftovers,
  # one input per rule, each traced on the oracle (rule numbers are the lines
  # `rule(` opens on):
  #
  #   rules 1530, 969 and 977 are reached by corpus cases already ("√(3&8)",
  #   "√(n&x)", "(y)┴(x)", "(y)┬x": the generator refuses an input that is both a
  #   corpus and a coverage case), so they need no row of their own here.
  #
  #   "√(ab&cd)"       rule 1538 {first_value: sequence, second_value: sequence}
  #   "ab''"           rule 1506 {first_value: sequence, prime_accent_symbols}
  #   "x\prime\prime"  rule 1404 {first_value, prime_accent_symbols: sequence}
  #   "x\\prime\\prime"  rule 1404 {first_value, prime_accent_symbols: sequence}
  #   "a⃗+b"           rule 341  {accents, expr: sequence}
  #   "ⓐa x"           rule 2221 {arg, arg_arguments, first_value}
  "root_overunder" => [
    "√(ab&cd)",
    "ab''",
    "x\\prime\\prime",
    "a⃗+b",
    "ⓐa x",
  ],
  # TEXT / FONT / COLOR / PHANTOM / ENCLOSE / INTENT. Every input fires the
  # rule named beside it on the oracle (measured with a `TracePoint :b_call`
  # mapped to each `rule(` opening line). Inputs sharing a rule differ in the
  # BRANCH they take, which a fired-once count cannot show:
  #
  #   :159   U+FFD7 `(ab)`                 monospace_value, SEQUENCE
  #   :227   `\mitBbb`/`\script`/`\fraktur`/`\double` + a letter
  #   :351/:356/:361/:366   quoted text followed by an expression or an operand
  #   :960   `ⓘ(x+y)`                      intent_expr (mutating `shift`)
  #   :3869/:3877   `ⓘ("foo" ...)`         intent with a simple / SEQUENCE body
  #   :1201  `✎(blue&y + z)` is a CORPUS case (the group refuses an input that
  #          is also one), so it is reached there; :1252/:1261 `☁`; :1270/:1278 `▭` (masks 0, 1, 5,
  #          15, 255 — `enclosure_attrs` flips the low four bits — and a
  #          non-numeric one)
  #   :1224  every `Constants::UNARY_SYMBOLS` name, spelled `\name(y)`: the
  #          seven `PHANTOM_SYMBOLS` names build `Phantom`/`Mpadded`, the rest
  #          a `Menclose` whose notation may be nil (`overline`); three more
  #          use the glyph form, where `UNARY_SYMBOLS.key` does the lookup
  #   :1561  `⟡(1&y)+a`                    phantom_value (an `Mpadded` mask); alone,
  #          `⟡(1&y)` is a gem-unmatched `{phantom: ...}` hash, so it is followed
  #          by `+a` to land on `:426` instead
  #   :2122/:2132   U+2132 + each of A-D on a sequence / simple subscript
  #   :2383  `\mbfsansA∈x`, `\BbbA≤x`      font + relation + expression
  #
  # `▭(256&y)` and `▭(-1&y)` are REFUSALS: `enclosure_attrs` raises outside 0..255.
  "text_font_color" => [
    "ￗ(ab)",
    "\\mitBbbD",
    "\\mitBbbd",
    "\\mitBbbe",
    "\\mitBbbi",
    "\\mitBbbj",
    "\\scriptH",
    "\\frakturH",
    "\\doubleH",
    "\"abc\"x",
    "\"a\"x!",
    "\"abc\" x",
    "\"abc\" x y",
    "ⓘ(x+y)",
    "ⓘ(\"foo\" x_1)",
    "ⓘ(\"foo\" x!)",
    "☁(red&y)",
    "☁(red&y + z)",
    "▭(5&y)",
    "▭(5&y + z)",
    "▭(0&y)",
    "▭(1&y)",
    "▭(15&y)",
    "▭(255&y)",
    "▭(x&y)",
    "▭(256&y)",
    "▭(-1&y)",
    "\\underline(y)",
    "\\hphantom(y)",
    "\\vphantom(y)",
    "\\underbar(y)",
    "\\overline(y)",
    "\\phantom(y)",
    "\\longdiv(y)",
    "\\circle(y)",
    "\\asmash(y)",
    "\\dsmash(y)",
    "\\hsmash(y)",
    "\\smash(y)",
    "\\overbar(y)",
    "⟡(y)",
    "▁(y)",
    "¯(y)",
    "⟡(1&y)+a",
    "x_ℲA(y)",
    "x_ℲB(y)",
    "x_ℲC(y)",
    "x_ℲD(y)",
    "x_ℲAab",
    "x_ℲBab",
    "x_ℲCab",
    "x_ℲDab",
    "\\mbfsansA∈x",
    "\\BbbA≤x",
  ],
  # Symbol, operator and number leaves. Each input was traced on the oracle
  # (a `TracePoint :b_call` over every `rule(` block of `unicode_math/
  # transform.rb` and of `base_number_prefix.rb`) to fire the rule named beside
  # it. Every input's port parse deep-equals the oracle's model.
  "symbol" => [
    "0x1F",           # base_number_prefix.rb:36 hex_number
    "0b101",          # base_number_prefix.rb:37 binary_number
    "0o17",           # base_number_prefix.rb:38 octal_number
    "×",              # :109
    "/+",             # :134
    ",5",             # :191
    "∫_a^b −a",       # :250
    "∫_a^b a·b",      # :243, :396
    "(a×b c)",        # :266
    "×b c",           # :272
    "∫_a^b ×b",       # :278
    "∫_a^b abc",      # :302
    "/+ b",           # :309
    "/+ b c",         # :320
    "(a∣b)",          # :451
    "(a∣b c)",        # :456
    "(a −b)",         # :466
    "(a −b c)",       # :476
    "−a b",           # :481
    "(a -+b)",        # :527
    "··2",            # :2085
    "a··b",           # :2091
  ],
  "combinators" => [
    "...",
    "a²",
    "x₂",
    "lim_(n → b)",
    "a'^(c)",
    "a \u2002 b",
    "x̄2x",
    "a^2_b 2x",
    "sin a 2x",
    "ȧȧ",
    "🐟🐠🐡",
    "a^2_b+",
    "a^b c d/(a b/c (a)_b^c d)",
    "ȧ2x",
    "^a b 2x",
    "^a b+",
    "a'^a b",
    "x'_a a! a!",
    "a^b c",
    "(a b/c x^(a b) c) a!",
    "a_b++",
    "(2 x_a y a/b^c) ^a_b c",
    "a_b+",
    "∑_a^b c^a b",
    "■(a b&c d) x",
    "■(a b c&d)a x",
    "ab++",
    "\uffd7(a)a'",
    "\uffd7(a)a!",
    "a!+",
    "a!1",
    "x₂+",
    "x₂++",
    "▢(a + b) .",
    "▭a b a_b",
    "■(a&b@c&d)2x",
    "■(a&) a",
    "a a^b",
    "a a_b",
    "a ^a b",
    "a a²",
    "a²+",
    "a²2x",
    "x a/b c",
    "(a b)^c/(a b/c x₁)",
    "a x² ab",
    "1ab+",
    "2xa÷b",
    "n!a - b",
    "ab1a b",
    "a c^2+",
    "a a_b +",
    "a a^b ab",
    "a a_b ab",
    "|a| a b",
  ],
  # FENCED (slice G1): the `Fenced`-building rules of `transform.rb:2020`-`:2983`
  # (rule numbers are the lines `rule(` opens on). Each input was traced on the
  # oracle with a `TracePoint :b_call` mapped to those lines and fires the rule
  # beside it; the SEQUENCE-paren rules carry a size prefix, which only the
  # unicode glyphs `├`/`┤` produce -- the spelled `\left1(`/`\right)` forms
  # leave an unmatched hash in the gem:
  #
  #   :2020  `()`, `[]`                      open_paren + close_paren, no content
  #   :2457  `x_├1(a)`, `a_├2[a]`            opener SEQUENCE (size prefix) in a script
  #   :2485  `(\a)`, `(\a2)`, `(\a2b)`      slashed_value SEQUENCE: text, number, symbol arms
  #   :2495  `(⟡(1&a))`                      phantom
  #   :2505  `(▭(a))`, `(⟡(a))`              unary_function
  #   :2515  `(▭(5&a))`                      rect
  #   :2525  `(a┤`                           factor + paren_close_prefix
  #   :2536  `├a)`                           paren_open_prefix + factor
  #   :2547  `(∫a)`                          nary
  #   :2557  `(a_b)`                         sub_exp
  #   :2567  `(a_b^c)`                       subsup_exp
  #   :2577  `(sin a)`                       unary_subsup
  #   :2587  `(a²)`                          mini_sup
  #   :2597  `x₍₁₂₎`                        sub_open_paren + mini_expr SEQUENCE
  #   :2609  `("t")`                         text
  #   :2640  `(a̅)`, `((a)̅)`, `[a̅]`          accents
  #   :2650  `├1(a)`, `├0(a]`, `├12(a)`       open_paren SEQUENCE + factor (`├12(` is a
  #                                          two-digit prefix: `1.25**12`)
  #   :2668  `├1(a┤`                         open SEQUENCE + paren_close_prefix
  #   :2724  `├1(a┤1)`, `├2[a┤0)`            both parens SEQUENCE
  #   :2746  `(/=)`                          negated_operator
  #   :2761  `(■(a&b)┤`                      table + paren_close_prefix
  #   :2769  `(■(a&b))`, `[■(a&b)]`          table + close_paren
  #   :2983  `(_a^b c)`                      pre_script
  #
  # `:2685`/`:2707` (SEQUENCE parens around a fraction) are slice E's.
  #
  # Six rules other slices own also fire on these inputs and are registered
  # under their own ids so the witnesses compare: `:85`, `:2055`/`:2067` (the
  # size-prefix arms), `:60` and `:97` (slice A), `:561` (slice F). `x₍₁₂₎` is
  # spelled bare on purpose: `(x₍₁₂₎)` parses on the oracle to an unmatched
  # `{open_paren:, mini_sub:, close_paren:}` hash, not a model.
  #
  # `x_├1(2┤1)` is the other kind of witness this group carries: not a rule
  # firing, but a GEM BUG the same shape as `"±"` in `relation` above. Traced
  # with every `unicode_math/transform.rb` block wrapped in a counter, NONE of
  # the gem's 516 rules ever fires on a `sub_exp` key for this input (every
  # `x_├N(M┤K)` size-prefix-plus-sub variant checked behaves the same way), so
  # the root `{sub_exp: {base:, sub:}}` hash — nested four deep, unlike `"±"`'s
  # single level — survives untouched and `Kernel#Array` folds only the
  # OUTERMOST layer. `GEM_UNMATCHED_SIGNATURES` in `transform.ts` carries the
  # nested hashes' own shapes (`sub_exp=other` down to `close_paren=sequence`)
  # so this row compares for real rather than being refused.
  "fenced_g1" => [
    "()",
    "[]",
    "x_├1(a)",
    "a_├2[a]",
    "(\\a)",
    "(\\a2)",
    "(\\a2b)",
    "(⟡(1&a))",
    "(▭(a))",
    "(⟡(a))",
    "(▭(5&a))",
    "(a┤",
    "├a)",
    "(∫a)",
    "(a_b)",
    "(a_b^c)",
    "(sin a)",
    "(a²)",
    "x₍₁₂₎",
    "(\"t\")",
    "(a̅)",
    "((a)̅)",
    "[a̅]",
    "├1(a)",
    "├0(a]",
    "├12(a)",
    "├1(a┤",
    "├1(a┤1)",
    "├2[a┤0)",
    "(/=)",
    "(■(a&b)┤",
    "(■(a&b))",
    "[■(a&b)]",
    "(_a^b c)",
    "x_├1(2┤1)",
  # "fenced_g2": the bracket-pair family, `transform.rb:3000` to the end of the
  ],
  # file -- every `Fenced.new(open_paren, ..., close_paren)` rule (a few wrap the
  # Fenced in a `Power`) that binds `open_paren`/`close_paren` -- plus B's two
  # interval-infinity rules. One input per rule, each traced on the oracle with
  # every registered block wrapped in a counter (rule numbers are the lines
  # `rule(` calls OPEN on):
  #
  #   :3085 `├1(a b c┤1)`     prefixed pair: open/close arrive as SEQUENCES;
  #         `├0(a b c┤3)` takes the `1.0em` (a whole float) and `1.953125em` sizes
  #   :3108 `(⒜x - ⒜y)`       unary_function + exp SEQUENCE
  #   :3119 `∫_a▒(x)ab`       factor + naryand_recursion SEQUENCE
  #   :3143 `∫_a▒(x)y`        factor + naryand_recursion simple; `|(x)|` in
  #         place of `(x)` on both takes the `unfenced_value` branch
  #   :3132 `(lim_x+a)`       unary_subsup + exp
  #   :3167 `(x₁+a)`          mini_sub + exp SEQUENCE
  #   :3178 `(x₂³+a)`         mini_sub_sup + exp SEQUENCE
  #   :3200 `(x⁵+a)`          mini_sup + exp SEQUENCE
  #   :3255 `(a′+a)`          accents + exp SEQUENCE
  #   :3277 `(½+a)`           unicode_fractions + exp SEQUENCE
  #   :3288 `(−=a)`           unicode_symbols + exp SEQUENCE
  #   :3299 `(−1)^n`          unicode_symbols + exp
  #   :3310 `∑ (−1)^n`        unicode_symbols + exp + sup (a Power around the Fenced)
  #   :3345 `(x_1+a)`         sub_exp + exp SEQUENCE
  #   :3367 `(x_2 a)`         sub_exp + exp
  #   :3389 `(x^2 =)`         sup_exp + exp
  #   :3400 `(ￗ(a) b c)`     monospace + exp SEQUENCE
  #   :3411 `(a/b a)`         frac + exp
  #   :3422 `(a/b+a)`         frac + exp SEQUENCE
  #   :3455 `(x_1^2+a)`       subsup_exp + exp SEQUENCE
  #   :3499 `(−≤a)`           symbol + expr SEQUENCE
  #   :3510 `(ab +a)`         factor SEQUENCE + exp SEQUENCE
  #   :3521 `(n!)`            factor SEQUENCE alone
  #   :3531 `(a,1)`           factor + operand (the `,1` is `:191`'s decimal number)
  #   :3542 `(a≤a)`           factor + operand SEQUENCE
  #   :3553 `(ab≤a)`          factor SEQUENCE + operand SEQUENCE
  #   :3564 `("t"a b)`        text + operand + exp
  #   :3576 `("t"x=a)`        text + operand + exp SEQUENCE
  #   :3640 `(\mbfA a)`       fonts + exp
  #   :3651 `(= ab)`          operator + exp SEQUENCE
  #   :3676 `(+a)`            operator + exp
  #   :3711 `(a x^2 b c)`     factor + sup_exp + exp SEQUENCE
  #   :3723 `∑▒(a_t b)^2`     sub_exp + exp + sup; `^(n+1)` takes the
  #         `unfenced_value` branch on a parenthesised sup
  #   :3739 `∑▒(a_t-b_t)^2`   sub_exp + exp SEQUENCE + sup; likewise `^(n+1)`
  #   :3755 `∑▒(-1)^k`        operator + exp + sup
  #   :3792 `(2x+3y)`         factor + operand + exp SEQUENCE
  #   :3804 `(a≤a b c)`       factor + operand SEQUENCE + exp SEQUENCE
  #   :3840 `(ￗ(a)←ￗ(b) c d)` monospace + relational_symbols + expr + exp SEQUENCE
  #   :3897 `(1,2]`           interval, left and right both simple
  #   :3909 `(1,ab]`          interval, right SEQUENCE
  #   :3922 `(ab,1]`          interval, left SEQUENCE
  #   :3935 `(a,b]`           interval, both SEQUENCE
  #   :196  `[+∞,1]`          B: `{positive, infty}` -> [sign, infinity]
  #   :204  `[−∞,1]`          B: `{negative, infty}`
  "fenced_g2" => [
    "├1(a b c┤1)",
    "├0(a b c┤3)",
    "(⒜x - ⒜y)",
    "∫_a▒(x)ab",
    "∫_a▒(x)y",
    "∫_a▒|(x)|ab",
    "∫_a▒|(x)|y",
    "(lim_x+a)",
    "(x₁+a)",
    "(x₂³+a)",
    "(x⁵+a)",
    "(a′+a)",
    "(½+a)",
    "(−=a)",
    "(−1)^n",
    "∑ (−1)^n",
    "(x_1+a)",
    "(x_2 a)",
    "(x^2 =)",
    "(ￗ(a) b c)",
    "(a/b a)",
    "(a/b+a)",
    "(x_1^2+a)",
    "(−≤a)",
    "(ab +a)",
    "(n!)",
    "(a,1)",
    "(a≤a)",
    "(ab≤a)",
    "(\"t\"a b)",
    "(\"t\"x=a)",
    "(\\mbfA a)",
    "(= ab)",
    "(+a)",
    "(a x^2 b c)",
    "∑▒(a_t b)^2",
    "∑▒(a_t b)^(n+1)",
    "∑▒(a_t-b_t)^2",
    "∑▒(a_t-b_t)^(n+1)",
    "∑▒(-1)^k",
    "(2x+3y)",
    "(a≤a b c)",
    "(ￗ(a)←ￗ(b) c d)",
    "(1,2]",
    "(1,ab]",
    "(ab,1]",
    "(a,b]",
    "[+∞,1]",
    "[−∞,1]",
  ],
}.freeze

# Inputs whose rules sit OUTSIDE the ported slice, each with the `transform.rb`
# rule the oracle fires for it and the shape that rule leaves behind. Measured
# with every registered block wrapped in a counter, not read off the source.
#
# Rule numbers are the lines the `rule(` calls OPEN on, recovered from the
# block's `source_location` — Ruby reports the line carrying `do`, which for a
# multi-line header is one line later. Two of these were first written as the
# block line; both are corrected here against a fresh trace.
#
# "±" and "a≤b" USED to be here, each proving the absence of a specific rule
# (`:99`, `:745`) the RELATION increment now carries; both moved up into
# `RULE_COVERAGE["relation"]` once their rule landed, the same ratchet
# `DEFERRED_INPUTS` in `model-parity.spec.ts` documents for the corpus side.
#
# ("a^b1" and "a_b1" moved to `RULE_COVERAGE["script-subsup-nary"]` when
# slice F ported rules 1148 and 1078.) `:1054`, `:1619` and `:227` — the
# rules originally cited beside these three rows — are ALL ported now too,
# and each row was re-traced against the current port rather than trusted to
# still be blocked by the same rule:
#
#   "1x₂"    still refused, but by TWO different rules, neither of them
#            `:1054`: `:1776` `{digit: simple, expr: simple}` never fires, so
#            `base` inside the `mini_sub` hash stays a raw hash rather than
#            the SEQUENCE `:1054` needs (`:1054` itself fires fine once it
#            is), and `:67` `{mini_sub: sequence}` still has to land after it
#            to unwrap the outer key. The port's own message names the
#            outermost casualty: `no rule matched {mini_sub=other}`.
#   "1/2a"   still refused by `:658` `{digit: simple,
#            recursive_denominator: simple}` exactly as before — `:1619` was
#            never the blocker here, only the rule one level up that `:658`
#            feeds. Port message: `no rule matched {frac=other}`.
#   "ⅇ"      still refused, now by `:43` `{mitBbb: simple}` alone — `:227`
#            fires fine once `:43` does. Port message:
#            `no rule matched {fonts=other}`.
#
# Every row records a rule the port lacks, not one it has: each is a witness
# a pure combinator (`RULE_COVERAGE["combinators"]`) needs and cannot have
# until the builder beside it lands. When that builder does, the row's refusal
# stops and `model-parity.spec.ts` fails until it moves into a coverage group.
SLICE_BOUNDARY = [
  "1x₂",
  "1/2a",
  "ⅇ",
].freeze

options = { oracle: nil, out: "test/formats/unicodemath", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/unicodemath)") { |v| options[:out] = v }
  o.on("--allow-dirty", "emit non-committable output from dirty checkouts") do
    options[:allow_dirty] = true
  end
end.parse!

abort "--oracle is required" unless options[:oracle]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))
  abort "not a plurimath checkout: #{lib}"
end

$LOAD_PATH.unshift(lib)
require "plurimath"
require "plurimath/version"
require_relative "render-fixture-provenance"

unless Gem.loaded_specs.key?("plurimath")
  abort "REFUSING: the plurimath gem is not activated. Set BUNDLE_GEMFILE=" \
        "#{oracle}/Gemfile and run #{__FILE__} with `bundle exec ruby`, under " \
        "any Ruby that has it bundled (mise, rbenv, asdf, rvm, or the system " \
        "Ruby all work)."
end

loaded = $LOADED_FEATURES.grep(%r{/plurimath\.rb\z}).first
unless loaded&.start_with?(lib)
  abort "REFUSING: loaded #{loaded.inspect}, not the pinned checkout at #{lib}. " \
        "An installed gem answers from a different version."
end

# The ONE exception the oracle is documented to raise across this surface:
# `Plurimath::Math.parse` funnels every StandardError into ParseError
# (`math.rb:45-49`). Anything else is a defect here or in the oracle, and a
# blanket rescue would launder it into an ordinary "raises" row.
ORACLE_REFUSAL = Plurimath::Math::ParseError

dir = File.expand_path(options[:out])
out = File.join(dir, "model-fixtures.json")
sidecar, provenance = RenderFixtureProvenance.prepare(
  oracle: oracle,
  payload_path: out,
  generator_path: GENERATOR_RELATIVE_PATH,
  allow_dirty: options[:allow_dirty],
  corpus: true,
)

# Every distinct `expected.unicodemath` in the pinned corpus, in first-seen
# order so the emitted file is stable and a new corpus case appends rather than
# reorders.
#
# A `cases/2` expectation is either a plain string or a mapping carrying exactly
# one of `output` (what the gem rendered) or `error` (why it refused). Only the
# rendered text is a UnicodeMath string; a refusal has none.
corpus_unicodemath = []
CorpusGenerator.read_pin_cases.each do |kase|
  raw = kase.dig("expected", "unicodemath")
  text = case raw
         when ::String then raw
         when ::Hash then raw["output"]
         end
  next if text.nil? || text.empty?

  corpus_unicodemath << text unless corpus_unicodemath.include?(text)
end
if corpus_unicodemath.empty?
  abort "REFUSING: no pinned corpus case carries expected.unicodemath"
end

sources = corpus_unicodemath.map { |text| ["corpus-unicodemath", text] }
rule_coverage_texts = RULE_COVERAGE.values.flatten
RULE_COVERAGE.each do |group, texts|
  texts.each { |text| sources << [group, text] }
end
SLICE_BOUNDARY.each { |text| sources << ["slice-boundary", text] }

coverage_corpus_overlap = rule_coverage_texts & corpus_unicodemath
unless coverage_corpus_overlap.empty?
  abort "REFUSING: #{coverage_corpus_overlap.inspect} is both a corpus case and a coverage case"
end
coverage_boundary_overlap = rule_coverage_texts & SLICE_BOUNDARY
unless coverage_boundary_overlap.empty?
  abort "REFUSING: #{coverage_boundary_overlap.inspect} is both a coverage case and a boundary case"
end
overlap = SLICE_BOUNDARY & corpus_unicodemath
unless overlap.empty?
  abort "REFUSING: #{overlap.inspect} is both a corpus case and a boundary case"
end

seen = {}
rows = sources.filter_map do |(group, input)|
  next if seen.key?(input)

  seen[input] = true
  # A stable row id the payload gate can key on. Derived from the input rather
  # than from its position, so a new corpus case appends a row instead of
  # renumbering every row after it; unique because `seen` deduplicates inputs.
  row = {
    "id" => "unicodemath-#{Digest::SHA256.hexdigest(input)[0, 12]}",
    "group" => group,
    "input" => input,
  }

  begin
    row["preprocessed"] = Plurimath::UnicodeMath::Parser.new(input).text
  rescue StandardError => e
    row["raises"] = e.class.name
    row["raisedIn"] = "preprocess"
    next row
  end

  begin
    row["model"] = CorpusGenerator.serialize_node(
      Plurimath::Math.parse(input, :unicode),
      "model",
    )
  rescue ORACLE_REFUSAL => e
    row["raises"] = e.class.name
    row["raisedIn"] = "parse"
  end
  row
end

parsed = rows.count { |row| row.key?("model") }
raised = rows.count { |row| row.key?("raises") }
abort "REFUSING: zero rows parsed" if parsed.zero?
unless parsed + raised == rows.length
  abort "REFUSING: #{rows.length} rows but #{parsed} parsed + #{raised} raised"
end

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => "plurimath-corpus/unicodemath-model/1",
  # The gate keys a fixture to the directory it sits in; this one is UnicodeMath's.
  "format" => "unicodemath",
  "caseCount" => rows.length,
  "parsedCount" => parsed,
  "raisedCount" => raised,
  "corpusUnicodemathCount" => corpus_unicodemath.length,
  "cases" => rows,
}
FileUtils.mkdir_p(dir)
payload_bytes = "#{JSON.pretty_generate(payload)}\n"
File.binwrite(out, payload_bytes)
RenderFixtureProvenance.write_manifest(
  sidecar_path: sidecar,
  payload_path: out,
  payload_schema: payload.fetch("schema"),
  payload_bytes: payload_bytes,
  provenance: provenance,
)
puts "unicodemath model fixtures: #{rows.length} cases " \
     "(#{corpus_unicodemath.length} from the corpus, #{rule_coverage_texts.length} coverage, " \
     "#{SLICE_BOUNDARY.length} boundary), #{parsed} parsed, #{raised} raised"
puts "  -> #{out}"
puts "  -> #{sidecar}"
