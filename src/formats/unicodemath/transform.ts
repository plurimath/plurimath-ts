/** biome-ignore-all lint/style/useNamingConvention: pattern keys are Parslet
 * tree keys — Ruby's snake_case is the schema, exactly as in the generated
 * tables, and renaming one would stop its rule from ever matching. */
/**
 * The UnicodeMath transform, FIRST SLICE — ported rule for rule from the gem
 * (`lib/plurimath/unicode_math/transform.rb`, plurimath 0.11.6 at `00c52783`).
 *
 * `latex/transform.ts` is the template in every respect: one `t.rule(...)` per
 * Ruby `rule(...)`, in the same source order, each carrying the Ruby line it
 * came from; drafts stand in for Ruby nodes until `finalize`; the memoised
 * `unicodemathTransform()` accessor sits beside an unmemoised
 * `buildUnicodemathTransform()` that hands the coverage suite a zeroed set of
 * firing counters.
 *
 * ## Where the slice boundary is, and why
 *
 * `unicode_math/transform.rb` registers 516 rules — 519 counting the three the
 * `BaseNumberPrefix::Transform` mixin adds — and porting them in one unit is
 * not reviewable. The boundary is drawn by what the repository can *check*
 * today: the pinned corpus carries no UnicodeMath INPUT cases, but it carries
 * 103 distinct `expected.unicodemath` strings — UnicodeMath the gem itself
 * emitted — and feeding those back through `Plurimath::Math.parse(text,
 * :unicode)` is a round trip whose every answer is the oracle's.
 *
 * Measured on the oracle, with every registered block wrapped in a counter:
 * the gem parses 97 of those 103 and refuses 6, and the 97 fire **86** distinct
 * rules. This slice ports **78** of them: the 86 minus the eight-rule
 * table/matrix family (`transform.rb:8`, `:9`, `:14`, `:32`, `:1569`, `:1574`,
 * `:1584`, `:1649`), which serves exactly two of the 103 inputs and needs
 * `get_table_class`, `Td`/`Tr` construction and per-subclass table paren
 * defaults that no other rule here touches.
 *
 * ## A second increment: MULTISCRIPT, reached by hand-picked inputs
 *
 * Outside the eight-rule table family, no other unported rule fired on the
 * 103-string corpus at the time — that method was exhausted against it — so
 * a second family was chosen by what it BUILDS rather than what the corpus
 * reaches, and given
 * inputs of its own in `scripts/generate-unicodemath-model-fixtures.rb`,
 * each checked against the oracle before being written down.
 *
 * MULTISCRIPT is every rule building `Math::Function::Multiscript`, measured
 * (not the eight a prior pass estimated) at **thirteen**: twelve constructors
 * spanning `transform.rb:1992` to `:3978`, plus the `:57` unwrap
 * (`{pre_script: simple(:script)} -> script`, the same shape as `:55`/`:56`)
 * every one of them routes through — the grammar wraps every prescript
 * expression in a `pre_script` key that only `:57` removes, confirmed by the
 * oracle firing it once per Multiscript input. All twelve reuse the existing
 * `PowerBase`/ternary-alias machinery, and four of them (`:2958`, `:3662`,
 * `:3853`, `:3978`) additionally call `unfenced_value`; the
 * one addition is `:2971`'s reverse lookup into `Constants::SUB_DIGITS`,
 * built from the generated `UNICODEMATH_SUB_DIGITS` array this file already
 * had no reason to import.
 *
 * A DECORATION family (`transform.rb:1286`-`:1491`, building `Obrace`/
 * `Ubrace`, `Overset`, `Menclose`, `Underset`) was measured alongside it and
 * set aside, unstarted, in an earlier pass: all eight of its rules read one
 * of `Constants::UNDER_HORIZONTAL_BRACKETS` (four of them),
 * `OVERLAYS_NOTATIONS` (three) or `BELOWS_NOTATIONS` (one), and at the time
 * none of the three was in any generated table this repository carried.
 *
 * A later increment ported it. `scripts/generate-unicodemath-parser-data.rb`
 * now emits all three as `UNICODEMATH_UNDER_HORIZONTAL_BRACKETS`,
 * `UNICODEMATH_OVERLAYS_NOTATIONS` and `UNICODEMATH_BELOWS_NOTATIONS`
 * (`generated/transform-tables.ts`), the same `TRANSFORM_CONSTANT_SOURCES`
 * path `NARY_CLASSES` and `PREFIXED_PRIMES` already used, so the family no
 * longer needs hand-transcribed data.
 *
 * Seven of the eight rules are registered: `:1286`/`:1315`/`:1344`
 * (`hbracket_class`, one body across `simple`/`sequence` ×
 * `first_value`/`scripted_first_value`, differing only in whether the
 * `Ubrace`-on-`Base` branch re-applies `unfenced_value` to `parameter_one`),
 * `:1420`/`:1447` (`overlay_after`, `sequence`/`simple`), `:1473`
 * (`overlay_before`) and `:1491` (`below_after`). Four more rules feed them
 * the plain text `hbracket_class`/`overlay_after`/`overlay_before`/
 * `below_after` need: `:40` unwraps the `hbrack` envelope the grammar's
 * third `hbrack` alternative adds, and `:81`/`:88`/`:94` unwrap
 * `diacritic_belows`/`diacritics_accents`/`diacritic_overlays` the same way
 * `:55`/`:56`/`:57` already unwrap `sub_script`/`sup_script`/`pre_script`.
 *
 * The eighth, `:1375` (`hbracket_class` simple / `scripted_first_value`
 * SEQUENCE), is transcribed in a comment at its position below but NOT
 * registered: every `scripted_first_value` shape that would reach it needs a
 * `{base:, sub:, sup:}` three-key hash or a `{base:, sub: sequence}`
 * two-key one, and `:1019`/`:1116` here are `simple`/`simple` only, so
 * nothing this slice carries can ever bind it — measured by testing several
 * `subsup_exp`, `mini_sub_sup` and `pre_script` inputs, every one of which
 * hit that gap before `hbracket_class` did. `transform-coverage.spec.ts`
 * refuses an unfired rule on principle, the same call FRACTION's own header
 * below makes for its ten `atoms`-blocked call sites. See
 * `scripts/generate-unicodemath-model-fixtures.rb`'s own `"decoration"`
 * group for the fixtures that exercise the other seven.
 *
 * ## A third increment: FRACTION, cut to the shape `:1609` already carries
 *
 * FRACTION is every `rule(` block that calls `Utility.fractions`
 * (`unicode_math/utility.rb:86-104`) — measured on the oracle by wrapping every
 * registered block, not read off a line-range survey, which had put this
 * family at 44 rules across `transform.rb:284`-`:3074`. That range mostly
 * covers `atom`/`atoms` (`:486` and some nineteen more sites through the whole
 * file, e.g. `:658`-`:697`) and `recursive_numerator`/`recursive_denominator`,
 * the generic multi-character-run combinator every bare symbol sequence in the
 * grammar goes through (`entity = atoms | number`, `common_rules.rb:11`) —
 * real, but neither specific to fractions nor called through
 * `Utility.fractions`. The measured count is **seventeen**: sixteen build
 * `Math::Function::Frac` and one (`:2209`, `\choose`) wraps that `Frac` in a
 * `Fenced`.
 *
 * One of the seventeen, `:1609` — `numerator: simple, denominator: simple`, no
 * options — was already in the 78 corpus-derived rules: it is what the
 * corpus's own fraction-shaped `expected.unicodemath` strings reach, complete
 * with `Utility.fractions`'s mutating `recursion_fraction` branch for
 * continued fractions like `(a)/(b)/(c)`. This increment ports its six
 * OPTION-carrying siblings, every one still a `simple`/`simple` shape (`mini_
 * numerator`/`mini_denominator` for `:1614`, `numerator`/`denominator` plus
 * one more key for the rest) — `:1614` (mini, `{displaystyle: false}`),
 * `:2197` (`\atop`,
 * `{linethickness: "0"}`), `:2209` (`\choose`, the `Fenced` wrap),
 * `:2347` (`\sdiv`/bevelled), `:2353` (`\ldiv`), and `:2377` (`\ndiv`,
 * `{displaystyle: false}` — its SEQUENCE-denominator twin `:2371`, deferred,
 * passes `{no_display_style: false}` instead for the same input shape; the gem
 * is inconsistent between the two and both are transcribed as measured, not
 * reconciled) — plus two small prerequisites `:1614`'s mini shape needs:
 * `:165`/`:170`, the standalone `{sup_digits:}`/`{sub_digits:}` unwraps to
 * `Math::Number`, reusing the `SUB_DIGITS` reverse lookup `:2971` already
 * built and adding its `SUP_DIGITS` twin from a generated array this file
 * already imports the sibling of.
 *
 * The other ten call sites — `:1619`, `:1624`, `:1629`, `:1634`, `:1639`,
 * `:1644` (the `numerator`/`mini_numerator` × `denominator`/`mini_denominator`
 * shapes where at least one side is a SEQUENCE), `:2203` (`\atop` with a
 * sequence numerator), and `:2359`/`:2365`/`:2371` (bevelled/ldiv/
 * no_display_style with a sequence denominator) — all need the `atoms`
 * combinator above, which is cross-cutting rather than fraction-specific and
 * is deferred whole, same reasoning as DECORATION: porting a slice of it here
 * would mean starting a second large family rather than finishing this one.
 *
 * ## A fourth increment: TABLE, the family the first slice deferred whole
 *
 * TABLE builds `Td`, `Tr`, `Table` (or one of its ten subclasses) and
 * `Mlabeledtr` — the eight-rule family the first slice's boundary section
 * above named and deferred (`:8`, `:9`, `:14`, `:32`, `:1569`, `:1574`,
 * `:1584`, `:1649`) plus nine more that same family needed but the corpus
 * never reached (`:15`, `:598`, `:606`, `:1579`, `:1589`, `:1594`, `:1599`,
 * `:1604`, `:1691`).
 *
 * That survey's "eight plus nine" is **eighteen**, not seventeen: it missed
 * `:1670`, the `matrixs`/`array: simple` sibling of `:1649` (`array:
 * sequence`) and `:1691` (`identity_matrix_number`) — measured by wrapping
 * every `unicode_math/transform.rb` rule in a firing counter (the same
 * technique MULTISCRIPT and FRACTION above were measured with) and tracing
 * `■(a)` (one cell, no row separator) on the oracle: it fires `:1670` and
 * nothing else this slice does not already carry, and parses. `grep -n
 * get_table_class unicode_math/transform.rb unicode_math/utility.rb` finds
 * it called from nowhere but these three `matrixs` rules, so porting
 * `:1649`/`:1691` without `:1670` would leave a THIRD of that trio missing
 * for no reason the source gives. Eighteen is what this increment ports.
 *
 * Two helpers this family alone needs, both new: `getTableClass` (`Utility.
 * get_table_class`, `utility.rb:135-137`) and `identityMatrix` (`Utility.
 * identity_matrix`, `unicode_math/utility.rb:202-211`). The first is where a
 * trap lives — `Utility.capitalize` (`utility.rb:143-145`) is
 * `split("_").map(&:capitalize).join`, and Ruby's `String#capitalize`
 * DOWNCASES the tail, so `get_table_class` returns the SAME class,
 * `Table::Vmatrix`, for both the `vmatrix` and `Vmatrix` `Constants::MATRIXS`
 * keys (and `Table::Bmatrix` for `bmatrix`/`Bmatrix`). Measured on the
 * oracle: the two differ only in whether `:1649`/`:1670`/`:1691`'s
 * `if :Vmatrix == matrix`/`elsif :Bmatrix == matrix` branch passes an
 * explicit `Paren::Norm`/`Paren::Lcurly`+`Paren::Rcurly` that the plain
 * `vmatrix`/`bmatrix` branch never does. The collapse is reproduced here, not
 * "fixed", by `buildMatrixTable`'s three-way branch and the alias defaults
 * `core/nodes.ts` already carries for the ten `table::*` names.
 *
 * `Mlabeledtr`'s pair (`:598`, `:606`) needs no new parsing machinery:
 * `parser.ts`'s `postProcessing` already builds the `{labeled_tr_value:,
 * labeled_tr_id:}` wrapper these two rules match, ahead of this slice — it is
 * named there as the reason a labelled input was refused, and this increment
 * is that reason resolved.
 *
 * The family serves exactly two of the 103 corpus strings — `"⒨(a@b)"` and
 * `"ⓢ(a&b@c&d)"`, `model-parity.spec.ts` compares both for real now — so the
 * rest of its eighteen rules' coverage comes from hand-picked witnesses in
 * `generate-unicodemath-model-fixtures.rb`'s own `"table"` group — the same
 * pattern MULTISCRIPT and FRACTION used above, including the trap their own
 * witnesses avoid: firing coverage is not branch coverage, so the group
 * carries one input per `MATRIXS` character (eight), not one for the family.
 * One further small prerequisite, `:17` (`:13`'s SEQUENCE twin), came from
 * building those witnesses — see it at its own position below — bringing the
 * total this increment adds to nineteen and the file's running count to 118.
 *
 * ## A fifth increment: RELATION/OPERATOR, the ten rules the compat gate named
 *
 * `src/compat/index.ts` withholds `"unicode"` behind a measured gate: a
 * 50-input hand-written battery, 38 of which passed before this increment,
 * naming "the relation and operator families (`=`, `≤`, `≥`, `→`, `∈`, `≈`,
 * `≡`, binary `±`) and the prime" as what was missing. Traced on the oracle
 * (every registered block wrapped in a counter, the same method every prior
 * increment used), the twelve refused inputs plus `"±"` — already a
 * `SLICE_BOUNDARY` witness below, proving `:99` absent — fire exactly TEN
 * unported rules between them: `:30` (`atom: sequence`), `:49` (`factor:
 * sequence`), `:99` (`combined_symbols`, `Constants::COMBINING_SYMBOLS`),
 * `:184` (`ordinary_negated_operator`, a resolved symbol plus a literal
 * `&#x338;` strike), `:401` (`char`+`number`), `:745` (`factor`'s
 * SEQUENCE-`operand` twin of the already-ported `:735`), `:1412`
 * (`first_value`+`prime_accent_symbols`, `x'`'s bare prime — `Power` built
 * from `unfencedValue`/`updatedPrimes`, both already here), `:2269`/`:2317`
 * (`factor`+`operand`+`expr`, the SEQUENCE and simple three-key twins), and
 * `:2447` (`opener`+SEQUENCE-`operand`+`closer`, `:2436`'s sequence twin).
 * None needed new parsing machinery or a new draft helper: every grammar key
 * these bind on `grammar.ts` already produces, and every constructor they
 * call (`newFormula`, `newPower`, `newFenced`, `newNumber`) this file already
 * had. The two generated constants they needed, `UNICODEMATH_COMBINING_
 * SYMBOLS`/`_KEYS`, were already in `generated/parser-tables.ts`, zipped the
 * same way `BINARY_SYMBOLS`/`NARY_SYMBOLS` are above.
 *
 * `"±"` and `"a≤b"` — the `SLICE_BOUNDARY` witnesses for `:99` and `:745` —
 * moved up into `generate-unicodemath-model-fixtures.rb`'s new `"relation"`
 * coverage group now that both rules are ported; the rest of the twelve join
 * them there, so this increment closes the gap the compat comment named
 * rather than opening a new, unmeasured one.
 *
 * ## A sixth increment: NARY, minus the half still behind ATOMS
 *
 * Every remaining `nary_class`/`nary`/`nary_sub_sup` call site was measured
 * the same way as every increment above — `unicode_math/transform.rb`, every
 * registered block wrapped in a firing counter, traced on real inputs built
 * from `Constants::NARY_SYMBOLS`/`NARY_CLASSES` keys (`∫`, `\amalg`) rather
 * than read off a line-range survey. Nineteen such rules exist
 * (`:84`-`:3588`); this increment ports ELEVEN of them plus one small
 * prerequisite, `:255`.
 *
 * `:84` (`nary_sub_sup` pass-through), `:175` (a bare `nary_class`, no
 * sub/sup/naryand), `:1831`/`:1953` (two more `nary`/`nary_class` shapes with
 * no branch), `:1931` (`nary_class`+simple `sub`, the one with a
 * `NARY_CLASSES` branch), `:2856`/`:2911`/`:3588` (the three MASK-carrying
 * shapes whose `sub`/`sup` both stay `simple`) all bind keys `grammar.ts`
 * already produces and call nothing new. `:725`/`:730` (`nary`+
 * `naryand_recursion`, simple and SEQUENCE) and `:1874` (`nary_sub_sup`+
 * SEQUENCE `naryand`, `:1861`'s sequence twin) reach a SEQUENCE only through
 * `:255` — a new prerequisite, `{symbol:, expr:}` -> a two-element array,
 * the same "adjacent atom" shape `:401` already covers for `char`+`number` —
 * and ONLY when nested under a `sub`/`sup` (`"∫_a∫f g"`), never bare
 * (`"∫∫f g"`): traced on the oracle, a bare double-nary's own
 * `{nary_class:, naryand:}` wrapper has no SEQUENCE-`naryand` rule anywhere
 * in the 519, so `Kernel#Array`'s pair-fold — `assertGemLeavesUnmatched`'s
 * own doc comment names this exact failure mode — silently turns it into
 * `Formula([[:nary, {...}]])` rather than a real parse; measured by
 * comparing `Math.parse(...).to_unicodemath` against the input's own shape,
 * not by the rule firing alone. Six corpus rows — `"∏_(k)▒〖k〗"` and five
 * siblings — reach `:1931`/`:1968` this way and moved out of
 * `model-parity.spec.ts`'s `DEFERRED_INPUTS`.
 *
 * The other EIGHT — `:1919`, `:2183`, `:2827`, `:2841`, `:2884`, `:2993`,
 * `:3020`, `:3047`, every one binding a SEQUENCE `sub` or `sup` directly
 * (not through `:255`'s `naryand` route) — stay unported. Traced on the
 * oracle, the only way a bare `sub`/`sup` position becomes a genuine
 * SEQUENCE is the `{atom:, atoms:}` multi-character-run combinator
 * (`"∫_(ab)f"`'s `sub` resolves through exactly that shape) — the same
 * `atoms`/`recursive_numerator`/`recursive_denominator` family the FIRST
 * FRACTION increment's own boundary section named and deferred whole. Eight
 * rules that read `grammar.ts` cleanly are gated on a ninth family this
 * slice does not carry, the same shape as DECORATION's own deferral below,
 * so they are named here rather than forced through with an untested input.
 *
 * Twelve increments the running count from 139 to 151 (after DECORATION and
 * RELATION/OPERATOR landed as their own increments in between; see git
 * history for their own module-header sections, since each merged with the
 * running count current as of its own landing).
 *
 * ## A seventh increment: ATOMS, cut to what a passing witness can prove
 *
 * The FRACTION section above named the `atom`/`atoms` combinator
 * (`grammar.ts:668`-`:670`, `common_rules.rb:9-11`: `atom.as("atom") >>
 * atoms.as("atoms").maybe()`) as deferred whole. Its own grammar production
 * was already ported — it needed no new grammar work, only transform-side
 * consumption — and a firing-counter probe on the oracle (the same
 * methodology every increment above used) finds SEVENTEEN `transform.rb`
 * sites keyed on `atom:`: two base unwraps (`:18`, `:30`), three that fold
 * the recursion into a plain array (`:486`, `:491`, `:496`), and twelve more
 * where an `atom` binds alongside `recursive_numerator`/`recursive_denominator`
 * (five sites), `exclamation_symbol` (`:1851`), `binary_symbols` (`:2041`,
 * `:2048`), `operator`+`frac` (`:2787`, `:3074`), or a compound of `atoms`
 * SEQUENCE plus `recursive_denominator` (`:2035`).
 *
 * This increment ports **three**: `:486`/`:496` (the two-atom and
 * three-or-more-atom fold `"abc"` measurably fires) and `:1851` (`"a!"`).
 * `:49` — `{factor: sequence(:factor)} -> factor`, `:39`'s SEQUENCE twin and
 * no `atom:` site itself, the prerequisite that unwraps the array `:486`/
 * `:496` leave under `factor` — turned out to already be ported: RELATION/
 * OPERATOR above needed it first, for `"2·3"`'s own SEQUENCE `factor`. Found
 * while probing this increment, the same way `:165`/`:170` and `:17` were
 * found while building earlier increments' witnesses — but landed under a
 * different increment's name.
 *
 * The other TWELVE are deferred, not because their code would be hard —
 * every one is the same array-fold shape already established above — but
 * because none of them can reach a PASSING witness without also porting
 * work outside this slice's boundary. `:30` (`{atom: sequence(:atom)} ->
 * atom`) turned out to be reachable after all — the RELATION/OPERATOR
 * increment above measured and ported it directly, correcting this
 * increment's own original "dead by construction" finding, so it is not
 * counted among the twelve here. `:491` remains dead by construction: this
 * grammar's right recursion always captures `atom` one leaf at a time for
 * the shape `:491` binds, so nothing ever leaves it a SEQUENCE at that
 * position (the same kind of measured absence as `:845`'s deadness above).
 * The remaining eleven — `:675`, `:680`, `:685`, `:690`, `:695`, `:1756`,
 * `:2035`, `:2041`,
 * `:2048`, `:2787`, `:3074` — only ever appear inside FRACTION's own
 * `numerator`/`denominator` grammar productions, so their output always
 * lands on the TOP `{numerator:, denominator:}` rule, and that rule is one
 * of the ten SEQUENCE-numerator/denominator sites (`:1619`-`:2371`) the
 * FRACTION section above already deferred. Measured directly: `"1/a(b)"`
 * fires `:675` on the oracle exactly as this file would code it, but the
 * `[atom, Fenced]` result is a SEQUENCE denominator, and feeding the same
 * input through this port lands on `transform.rb:1619`
 * (`numerator: simple, denominator: sequence`) — unported — so the port
 * refuses the one input that would prove `:675` correct. Porting any of the
 * eleven without also porting at least the matching half of those ten would
 * add code with no reachable, passing witness; wiring that family is the
 * explicit follow-up this increment unblocks, not part of it.
 *
 * This increment ports `:486`/`:496`/`:1851` — three new rules, since `:30`
 * and `:49`, the family's own two base unwraps, were already ported above by
 * RELATION/OPERATOR (`:49` for `"2·3"`, `:30` from its own probing).
 * Running count: 151 + 3 = **154**.
 *
 * ## An eighth increment: ROOT / OVER-UNDER / ACCENT leftovers
 *
 * Eight rules that build a node: `:341` (`accents` + SEQUENCE `expr`), `:969`/
 * `:977` (a bare `over`/`under` script, `Overset`/`Underset` with no second
 * parameter), `:1404`/`:1506` (`:1412`'s SEQUENCE-prime and SEQUENCE-base
 * twins), `:1530`/`:1538` (`Root` from two simple / two sequence operands) and
 * `:2221` (`Arg`). Two unwraps owned by the pure-rule slice, `:31` and `:118`,
 * ride along because `:1538` and `:1404` cannot be reached without them.
 * Running count: 154 + 10 = **164**.
 *
 * Two siblings are NOT registered because no input tried reached them, traced
 * on the oracle: `:1514` (`root_first_value`, the `binary_root` grammar rule —
 * `\root`/`⒭` inputs were either parse refusals or parsed without firing it,
 * and `√`/`\surd` are caught by `sqrt` first) and `:346` (`accents` + SEQUENCE
 * `exp`). Neither is proven unreachable, only unreached. `:1375` stays
 * unregistered for the reason given at its position.
 *
 * Everything outside those 164 is genuinely ABSENT rather than stubbed. A
 * ## An eighth increment: SYMBOL/OPERATOR/NUMBER leaves
 *
 * Twenty-three rules whose bodies build a symbol, operator or number: the three
 * `BaseNumberPrefix::Transform` rules (`base_number_prefix.rb:36`-`:38`,
 * registered as `bnp:36`-`bnp:38` like `latex/transform.ts`'s) and `:109`,
 * `:134`, `:191`, `:243`, `:250`, `:266`, `:272`, `:278`, `:302`, `:309`,
 * `:320`, `:396`, `:451`, `:456`, `:466`, `:476`, `:481`, `:527`, `:2085`,
 * `:2091`. Each is reached by an input of the "symbol" coverage group, traced
 * on the oracle to fire it and compared with the oracle's model.
 *
 * Eight rules of the same family are NOT registered, because each one's result
 * lands on a rule this slice does not carry, so no input yet reaches them and
 * parses (measured: the oracle fires the rule, the port stops at the named
 * hash): `:196`/`:204` (`[+∞,1]`; the enclosing `left_value` sequence needs the
 * interval `Fenced` rules), `:284`/`:290`/`:296`/`:666` (`1/2\not∘b`,
 * `1/2\not∘⊆⊈`, `⊕b/c`, `a\not∈b`; the array they return is a SEQUENCE
 * numerator/denominator, the `:1619`-family, port stops at `{frac=other}`),
 * `:521` (`a^!!b`; the array is a SEQUENCE `sup`, `:1148`, port stops at
 * `{sup_exp=other}`) and `:2079` (`a···2`; the nested `diacritics` it needs
 * folds through `:406`/`:411`, port stops at `{atom=other}`).
 *
 * `f'(x)` and `a·b·c` are not rule gaps. The gem's own tree for each holds a
 * hash no rule matches, so `Kernel#Array` folds it and the gem returns pairs;
 * the port refused them for want of an entry in `GEM_UNMATCHED_SIGNATURES`
 * below, which now names both shapes (each measured, see the entries).
 *
 * Everything outside those 154 is genuinely ABSENT rather than stubbed. A
 * ## An eighth increment: COMBINATORS, the rules whose body builds nothing
 *
 * A rule builds nothing when its block holds no `Math::` and no `Utility.`:
 * single-key unwraps (`{sub_exp: simple} -> exp`) and list-join combinators
 * over the values the grammar tags `factor`/`operand`/`expr`/`exp`/
 * `sub_exp`/`sup_exp`/`mini_sub`/`mini_sup`/`atom`, which glue two or three
 * of them into the one array a later rule consumes (`[a, b]`, `[a] + b`,
 * `a + b`). The gem has 139 of them still unported at this point (`:845`,
 * the dead twin of `:870`, among them); this increment registers **56**,
 * `:104` (the `spaces` leaf, which builds a `Symbol` but no other rule
 * could reach an input containing a space run without) included: exactly
 * those for which a fixture input exists that the port now parses to the
 * oracle's serialized model (`RULE_COVERAGE["combinators"]` in the fixture
 * generator names the input for each). Running count: 154 + 56 = **210**.
 *
 * The other 83 are NOT registered, each for one of three measured reasons.
 * Candidate inputs came from the gem's own UnicodeMath specs plus about
 * 30,000 generated ones, every one traced on the oracle:
 *
 *  - 55 fire on the oracle, but the same input reaches an unported BUILDING
 *    rule first, so the port refuses it and there is no parse to compare.
 *    The blockers seen (a selection, not the full list): `:1148` (`{base: simple, sup: sequence}`) and `:1078`
 *    (`{base: simple, sub: sequence}`), which every SEQUENCE script
 *    (`a^b1`, `a_b1`, `x^(1)1`) needs; `:1054`; `:1139`; the SEQUENCE
 *    numerator/denominator `Frac` family (`:1619`, `:1629`); `:227` (fonts),
 *    `:1404` (prime + first value), `:2132`, `:2142`, `:2457`, `:2650`,
 *    `:2685`, `:3085`, `:3178`, `:3345`, `:3510`. Six more (`:1751`-`:1776`)
 *    need no such builder: their inputs are ones where the gem itself leaves
 *    a hash unmatched and folds it, and the port refuses that shape. The port's guard
 *    (`GEM_UNMATCHED_SIGNATURES`) is deliberately not widened to let these
 *    through: `sup_exp=other` is what the gem leaves unmatched for `x^(1)a÷b`
 *    and also what the PORT leaves for `a^b1`, where the gem builds a
 *    `Power`, so a signature cannot tell the two apart.
 *  - 28 fired on no probed input at all. `:41`, `:42` and `:51` are dead in the
 *    gem itself: `custom_fonts` (`common_rules.rb:23`) is
 *    `str("double") | str("fraktur") | str("script")` and is never tagged
 *    `.as(:script)`/`.as(:double)`/`.as(:fraktur)`.
 *
 * Five `SLICE_BOUNDARY` rows in the fixture generator record an input for the
 * blocking builders `:1148`, `:1078`, `:1054`, `:1619` and `:227`: the port
 * must refuse each, and the refusal becomes a failing ratchet the moment that
 * builder lands, which is when the pure rules it blocks can be checked.
 *
 * Everything outside those 210 is genuinely ABSENT rather than stubbed. A
 * node whose key set no ported rule matches survives the transform as a
 * plain hash and `finalize` throws on it, naming the keys — the loud failure
 * the deferred families are supposed to produce.
 *
 * ## Order is behaviour, and one rule is dead because of it
 *
 * `Parslet::Transform.rule` **unshifts** (`parslet-2.0.0/lib/parslet/transform.rb:128`
 * and `:160`), so a later definition wins a tie. Measured over all 519
 * registered patterns, exactly ONE signature appears twice —
 * `{exp: sequence, factor: simple}` at `transform.rb:845` and `:870` — and the
 * later `:870` wins, which the coverage probe confirms (`:870` fires, `:845`
 * never). `:870` is ported; `:845` is dead and is not. (846 and 871 are those
 * headers' CONTINUATION lines; every id here is a `rule(` opening line.)
 *
 * ## Mutation is behaviour, so nodes are drafts until the entry point returns
 *
 * Four ported rules assign into a node the transform already built, between
 * them seven writes: `:1019` and `:1116` each set `parameter_one` or
 * `parameter_two` on one of two branches, `:1173` sets
 * `sub_sup.parameter_one.parameter_one`, and `:1861` sets
 * `parameter_three` or `parameter_four`. `Utility.fractions` adds a fifth
 * mutation site outside the rules, rewriting a `Frac`'s `parameter_one` in
 * place (`unicode_math/utility.rb:92`).
 * Core nodes are publicly immutable (ARCHITECTURE.md §5), so the transform
 * works on `UnicodemathDraft` objects and `finalize` converts the finished tree
 * into real `core` nodes in one pass at the end.
 *
 * ## Two model behaviours that are provably absent here
 *
 * - **`ModelHelper.validate_left_right`** (`model_helper.rb:17-23`) forces
 *   `left_right_wrapper` back to true on a formula field whose first value is a
 *   `Math::Function::Left`. No `Left` can enter a UnicodeMath tree:
 *   `grep -c "Function::Left" unicode_math/transform.rb unicode_math/utility.rb`
 *   is 0 in both, and `left` is not among the names `get_class` can receive
 *   (`UNICODEMATH_TRANSFORM_GET_CLASS`). The same fact is why `newFormula`
 *   below has no `Left` branch where `latex/transform.ts` has one.
 * - **`Core#class_name`** (`core.rb:28`) is the class basename downcased. Only
 *   one class in the gem overrides it — `Ul` returns `"underline"`
 *   (`function/ul.rb:56`), the sole extra hit of
 *   `grep -rn "def class_name" lib/plurimath/math/` — and no rule here can
 *   build a `Ul`, so `className` below implements the base rule and refuses the
 *   `ul` kind rather than guessing.
 */

import type { FormulaNode, MathNode, NodeKind, NodeOptions } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import { rubyToI } from "../../core/ruby-semantics";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_HEXCODE_IN_INPUT,
  UNICODEMATH_HORIZONTAL_BRACKETS,
  UNICODEMATH_SIZE_OVERRIDES,
  UNICODEMATH_UNARY_ARG_FUNCTIONS,
  UNICODEMATH_UNARY_SYMBOLS,
  UNICODEMATH_UNDEF_UNARY_FUNCTIONS,
} from "../../generated/unicodemath/render-tables";
import { Slice, sequence, simple, subtree, Transform, type TransformValue } from "../../pegkit";
import {
  UNICODEMATH_BINARY_SYMBOLS,
  UNICODEMATH_BINARY_SYMBOLS_KEYS,
  UNICODEMATH_COMBINING_SYMBOLS,
  UNICODEMATH_COMBINING_SYMBOLS_KEYS,
  UNICODEMATH_MATRIXS,
  UNICODEMATH_MATRIXS_KEYS,
  UNICODEMATH_NARY_SYMBOLS,
  UNICODEMATH_NARY_SYMBOLS_KEYS,
  UNICODEMATH_SKIP_SYMBOLS,
  UNICODEMATH_SKIP_SYMBOLS_KEYS,
  UNICODEMATH_SUB_DIGITS,
  UNICODEMATH_SUP_DIGITS,
  UNICODEMATH_UNICODED_FONTS,
} from "./generated/parser-tables";
import {
  UNICODEMATH_BELOWS_NOTATIONS,
  UNICODEMATH_BINARY_FUNCTIONS,
  UNICODEMATH_IS_A_CLASSES,
  UNICODEMATH_MASK_CLASSES,
  UNICODEMATH_MENCLOSE_FUNCTIONS,
  UNICODEMATH_NARY_CLASSES,
  UNICODEMATH_OVERLAYS_NOTATIONS,
  UNICODEMATH_PHANTOM_FUNCTIONS,
  UNICODEMATH_PRIMES_CONSTANTS,
  UNICODEMATH_SYMBOL_CLASS_INPUT,
  UNICODEMATH_UNDER_HORIZONTAL_BRACKETS,
  type UnicodemathPhantomAttribute,
} from "./generated/transform-tables";
import {
  namedSymbolId,
  UNICODEMATH_CLASS_REGISTRY,
  UNICODEMATH_FONT_STYLES,
  UNICODEMATH_NODE_CONSTRUCTORS,
  type UnicodemathClassEntry,
} from "./registry";

/* =========================================================================
 * 1. Ruby-semantics helpers
 * ---------------------------------------------------------------------- */

/** Ruby `Array#compact`: a NEW array without nils. */
function compact(values: readonly unknown[]): unknown[] {
  return values.filter((value) => value !== null && value !== undefined);
}

/** Ruby `Array#flatten`: RECURSIVE, unlike JavaScript's one-level `flat()`. */
function flattenDeep(values: readonly unknown[]): unknown[] {
  return values.flatMap((value) => (Array.isArray(value) ? flattenDeep(value) : [value]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as object).constructor === Object
  );
}

/** The code units Ruby's `String#strip` removes: NUL plus ASCII whitespace. */
function rubyStrip(text: string): string {
  let start = 0;
  let end = text.length;
  const strippable = (code: number): boolean =>
    code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0;
  while (start < end && strippable(text.charCodeAt(start))) start += 1;
  while (end > start && strippable(text.charCodeAt(end - 1))) end -= 1;
  return start === 0 && end === text.length ? text : text.slice(start, end);
}

/** Ruby `nil.to_s` / `Slice#to_s` / `String#to_s`. */
function rubyToS(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Slice) return value.text;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new TypeError(`unicodemath transform: no deterministic to_s for ${typeof value}`);
}

/**
 * `Slice#== other` is `str == other` (`parslet-2.0.0/lib/parslet/slice.rb:45-46`),
 * and Ruby's `String#==` delegates to the other side when it responds to
 * `to_str` — so a slice and a string with the same text compare equal in BOTH
 * directions. Three ported rules depend on it: `[opener, closer].include?("|")`
 * (`:2436`, `:2619`), `["abs", "&#x249c;"].any?(function)` (`:1209`, whose
 * `any?(pattern)` runs `function === "abs"`), and `unary == "mod"` (`:1547`).
 */
function textEquals(value: unknown, text: string): boolean {
  return (typeof value === "string" || value instanceof Slice) && rubyToS(value) === text;
}

/** Ruby truthiness: only nil and false are falsy. */
function rubyTruthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** `Hash#key(value)`: the FIRST key mapping to `value`, or nil. */
function invertFirstWins(map: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const inverted = new Map<string, string>();
  for (const [key, value] of map) if (!inverted.has(value)) inverted.set(value, key);
  return inverted;
}

/**
 * A `Constants` hash reassembled from the two arrays the parser tables carry
 * for it. `.keys` and `.values` are emitted from the SAME Ruby hash in one
 * pass, so index `i` pairs them; the lengths are asserted here rather than
 * assumed, because a regeneration that changed only one of the two would
 * otherwise silently shift every pair.
 */
function zipConstants(
  keys: readonly string[],
  values: readonly string[],
  label: string,
): ReadonlyMap<string, string> {
  if (keys.length !== values.length) {
    throw new Error(
      `unicodemath transform: ${label} has ${keys.length} keys and ${values.length} values`,
    );
  }
  const map = new Map<string, string>();
  for (let index = 0; index < keys.length; index++) {
    map.set(keys[index] as string, values[index] as string);
  }
  return map;
}

const BINARY_SYMBOLS = zipConstants(
  UNICODEMATH_BINARY_SYMBOLS_KEYS,
  UNICODEMATH_BINARY_SYMBOLS,
  "BINARY_SYMBOLS",
);
const NARY_SYMBOLS = zipConstants(
  UNICODEMATH_NARY_SYMBOLS_KEYS,
  UNICODEMATH_NARY_SYMBOLS,
  "NARY_SYMBOLS",
);
/** `Constants::COMBINING_SYMBOLS[key]`, read by `:99`. */
const COMBINING_SYMBOLS = zipConstants(
  UNICODEMATH_COMBINING_SYMBOLS_KEYS,
  UNICODEMATH_COMBINING_SYMBOLS,
  "COMBINING_SYMBOLS",
);
const NARY_CLASSES_INVERTED = invertFirstWins(UNICODEMATH_NARY_CLASSES);
const UNARY_ARG_FUNCTIONS_INVERTED = invertFirstWins(UNICODEMATH_UNARY_ARG_FUNCTIONS);
const HORIZONTAL_BRACKETS_INVERTED = invertFirstWins(UNICODEMATH_HORIZONTAL_BRACKETS);

/**
 * `Constants::UNDER_HORIZONTAL_BRACKETS[hbrack.to_sym] || .key(hbrack)`
 * (`transform.rb:1300`-`:1303`): `hbrack` is EITHER the bracket NAME
 * `opHbracketPrefixed` captures behind a `\` prefix, or the ENTITY text
 * `opHbracket` captures directly (`grammar.ts:530`, `:630`-`:631`), both
 * funnelled through the same `hbracket_class` key. The first disjunct
 * (`[hbrack.to_sym]`) is the name-form membership check — whether `hbrack`
 * is one of this table's four NAME keys; the second (`.key(hbrack)`) is the
 * entity-form check against its four VALUES, used when `hbrack` already
 * arrived as an entity. `hbracketDecoration` below runs both.
 */
const UNDER_HORIZONTAL_BRACKETS_VALUES: ReadonlySet<string> = new Set(
  UNICODEMATH_UNDER_HORIZONTAL_BRACKETS.values(),
);
const PRIMES_INVERTED = invertFirstWins(UNICODEMATH_PRIMES_CONSTANTS);
/** `Constants::UNARY_SYMBOLS.key(value)` — `Hash#key` is FIRST match, so `&#x2581;` is `underline`. */
const UNARY_SYMBOLS_INVERTED = invertFirstWins(UNICODEMATH_UNARY_SYMBOLS);
const BINARY_FUNCTION_NAMES: ReadonlySet<string> = new Set(UNICODEMATH_BINARY_FUNCTIONS);
const UNDEF_UNARY_FUNCTIONS: ReadonlySet<string> = new Set(UNICODEMATH_UNDEF_UNARY_FUNCTIONS);
const LROUND_ID = namedSymbolId("lround");
const RROUND_ID = namedSymbolId("rround");
// The three parens the TABLE family's `:Vmatrix`/`:Bmatrix` branches
// (`:1649`, `:1670`, `:1691`) construct directly, the same pattern as
// `LROUND_ID`/`RROUND_ID` above.
const NORM_ID = namedSymbolId("norm");
const LCURLY_ID = namedSymbolId("lcurly");
const RCURLY_ID = namedSymbolId("rcurly");

/**
 * `Constants::MATRIXS.key(entity)`: `zipConstants` pairs the keys/values
 * arrays exactly as `BINARY_SYMBOLS`/`NARY_SYMBOLS` above do, and
 * `invertFirstWins` turns that key->entity map into the entity->key one
 * `Hash#key` performs. A miss is nil there, so `matrixSymbol` below needs a
 * not-found case too.
 */
/**
 * `Constants::SKIP_SYMBOLS` (`constants.rb:519`) as name -> entity, for `:104`:
 * `\thinsp` reaches the transform as the name, the entity form as the entity.
 */
const SKIP_SYMBOLS = zipConstants(
  UNICODEMATH_SKIP_SYMBOLS_KEYS,
  UNICODEMATH_SKIP_SYMBOLS,
  "SKIP_SYMBOLS",
);

const MATRIXS_INVERTED = invertFirstWins(
  zipConstants(UNICODEMATH_MATRIXS_KEYS, UNICODEMATH_MATRIXS, "MATRIXS"),
);

/**
 * `Constants::SUB_DIGITS.key(entity)`, inverted from the ONE generated array:
 * `Constants::SUB_DIGITS` has no separate keys table because its keys are
 * `"0".."9"` in order, and `UNICODEMATH_SUB_DIGITS[i]` is measured to be the
 * entity for digit `i` (`generated/parser-tables.ts`'s own comment: emitted
 * from `Constants::SUB_DIGITS.values`, and Ruby hashes preserve insertion
 * order). `Hash#key` on a miss is nil, so `:2971` needs a not-found case too.
 */
const SUB_DIGITS_INVERTED = new Map<string, string>(
  UNICODEMATH_SUB_DIGITS.map((entity, index) => [entity, String(index)]),
);

/** `Constants::SUP_DIGITS.key(entity)`, inverted the same way, for `:165`. */
const SUP_DIGITS_INVERTED = new Map<string, string>(
  UNICODEMATH_SUP_DIGITS.map((entity, index) => [entity, String(index)]),
);

function isAFamily(rubyClass: string): ReadonlySet<string> {
  const family = UNICODEMATH_IS_A_CLASSES.get(rubyClass);
  if (family === undefined) {
    throw new Error(`unicodemath transform: no measured is_a? family for "${rubyClass}"`);
  }
  return new Set(family);
}

const IS_FORMULA = isAFamily("Math::Formula");
const IS_BINARY_FUNCTION = isAFamily("Math::Function::BinaryFunction");
const IS_NARY = isAFamily("Math::Function::Nary");
const IS_OVERSET = isAFamily("Math::Function::Overset");
const IS_POWER = isAFamily("Math::Function::Power");
const IS_TERNARY_FUNCTION = isAFamily("Math::Function::TernaryFunction");
const IS_UNARY_FUNCTION = isAFamily("Math::Function::UnaryFunction");
const IS_UNDERSET = isAFamily("Math::Function::Underset");

/* =========================================================================
 * 2. The draft model
 * ---------------------------------------------------------------------- */

/**
 * One mutable stand-in for a Ruby node under construction. `fields` holds the
 * ivars the class's `initialize` actually assigned — measured per class, never
 * read off the source — under their TypeScript names, and stays mutable until
 * `finalize`. `identity` is the Ruby basename an alias carrier rides under
 * (`Power`, `Paren::Lround`), matching the core carriers' `name`/`id`.
 */
class UnicodemathDraft {
  constructor(
    readonly kind: NodeKind,
    readonly identity: string | undefined,
    readonly fields: Record<string, unknown>,
  ) {}
}

function isDraft(value: unknown): value is UnicodemathDraft {
  return value instanceof UnicodemathDraft;
}

/**
 * The Ruby class a draft stands for: the carrier's own class, or the alias
 * basename hung under the carrier's identity prefix. This is what the `is_a?`
 * families are keyed by.
 */
function draftRubyClass(draft: UnicodemathDraft): string {
  const spec = NODE_SPECS[draft.kind];
  if (draft.identity === undefined) return spec.rubyClass;
  const identity = spec.identity;
  if (identity === undefined) {
    throw new Error(`unicodemath transform: kind "${draft.kind}" has no identity slot`);
  }
  return `${identity.prefix}::${draft.identity}`;
}

/** Ruby `value.is_a?(Klass)` over one of the measured descendant families. */
function isA(value: unknown, family: ReadonlySet<string>): value is UnicodemathDraft {
  return isDraft(value) && family.has(draftRubyClass(value));
}

/**
 * `Core#class_name` (`core.rb:28`): `self.class.name.split("::").last.downcase`.
 *
 * Refuses anything that is not a draft, where Ruby raises `NoMethodError` —
 * `transform.rb:1019` and `:1116` call it on a binding that could still be a
 * slice — and refuses the `ul` kind, the one class in the gem that overrides
 * the method (`function/ul.rb:56`, returning `"underline"`) and one this slice
 * can never build.
 */
function className(value: unknown): string {
  if (!isDraft(value)) {
    throw new TypeError(
      `unicodemath transform: class_name on a ${typeof value} (Ruby raises NoMethodError)`,
    );
  }
  if (value.kind === "ul") {
    throw new Error('unicodemath transform: Ul overrides class_name to "underline"');
  }
  const parts = draftRubyClass(value).split("::");
  return (parts[parts.length - 1] as string).toLowerCase();
}

/** `Core#value` — only `Formula`, `Number` and `Symbol` answer it. */
function draftValue(value: unknown): unknown {
  if (isDraft(value) && (value.kind === "formula" || value.kind === "number" || isSymbol(value))) {
    return value.fields.value ?? null;
  }
  throw new TypeError("unicodemath transform: #value on a node that has none (NoMethodError)");
}

function isSymbol(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && value.kind === "symbol";
}

function isFenced(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && value.kind === "fenced";
}

function isFormulaDraft(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && value.kind === "formula";
}

/** A formula draft's live `value` array. */
function formulaValue(draft: UnicodemathDraft): unknown[] {
  return draft.fields.value as unknown[];
}

/** Ruby's "argument omitted": `undefined` takes the default, `null` is nil. */
function orNil(value: unknown): unknown {
  return value === undefined ? null : value;
}

/** A `UnaryFunction` constructor converts a Slice argument to its text. */
function sliceToText(value: unknown): unknown {
  return value instanceof Slice ? value.text : value;
}

/**
 * `Math::Formula.new(value = [], left_right_wrapper = true)`
 * (`formula.rb:38-48`): a non-array is wrapped, the array itself is stored by
 * reference, and `displaystyle` is assigned true. `input_string` stays
 * unassigned — `Plurimath::Math.parse_formula` adds it at the very end.
 *
 * The `left_right_wrapper = false if @value.first.is_a?(Function::Left)` line
 * is unreachable from UnicodeMath (see the header), so `leftRightWrapper` is
 * stored as given.
 */
function newFormula(value: unknown = [], leftRightWrapper: unknown = true): UnicodemathDraft {
  const list = Array.isArray(value) ? value : [value];
  return new UnicodemathDraft("formula", undefined, {
    value: list,
    leftRightWrapper,
    displaystyle: true,
  });
}

/** `Math::Number.new(value, base:)` — Slice value to text, mini flags false. */
function newNumber(value: unknown, base: number | null = null): UnicodemathDraft {
  return new UnicodemathDraft("number", undefined, {
    value: sliceToText(orNil(value)),
    miniSubSized: false,
    miniSupSized: false,
    base,
  });
}

/** A symbol class resolved from a table: `klass.new` — `@value` assigned nil. */
function newSymbolOfClass(id: string): UnicodemathDraft {
  return new UnicodemathDraft("symbol", id, { value: null });
}

/**
 * `Math::Symbols::Symbol.new(sym)` (`symbols/symbol.rb:12-17`): `@value =
 * sym.is_a?(Array) ? sym.join : sym&.to_s`. Only `@value` is assigned — the
 * other four ivars are guarded and stay unassigned.
 */
function newBareSymbol(value: unknown): UnicodemathDraft {
  const text = Array.isArray(value) ? value.map(rubyToS).join("") : rubyToS(value);
  return new UnicodemathDraft("symbol", "Symbol", { value: text });
}

/** `Math::Symbols::Symbol.new(space, options: { space: true })` (`transform.rb:104`). */
function newSpace(value: unknown): UnicodemathDraft {
  return new UnicodemathDraft("symbol", "Symbol", {
    value: rubyToS(value),
    options: { space: true },
  });
}

function unaryDraft(kind: NodeKind, identity: string | undefined, one: unknown): UnicodemathDraft {
  return new UnicodemathDraft(kind, identity, { parameterOne: sliceToText(orNil(one)) });
}

function binaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  one: unknown,
  two: unknown,
  options?: NodeOptions,
): UnicodemathDraft {
  const fields: Record<string, unknown> = { parameterOne: orNil(one), parameterTwo: orNil(two) };
  if (options !== undefined) fields.options = options;
  return new UnicodemathDraft(kind, identity, fields);
}

function ternaryDraft(
  kind: NodeKind,
  identity: string | undefined,
  one: unknown,
  two: unknown,
  three: unknown,
): UnicodemathDraft {
  return new UnicodemathDraft(kind, identity, {
    parameterOne: orNil(one),
    parameterTwo: orNil(two),
    parameterThree: orNil(three),
  });
}

/** `Text.new(parameter_one = "")` — `@lang` is always assigned, always nil here. */
function newText(one: unknown): UnicodemathDraft {
  return new UnicodemathDraft("text", undefined, {
    parameterOne: one === undefined ? "" : sliceToText(one),
    lang: null,
  });
}

/**
 * `Underset.new(p1, p2, options = {})` — the ONE option-carrying constructor
 * that assigns `@options` even when the caller passes nothing (measured: a
 * zero-argument `Underset` has `@options == {}`, while `Overset`, `Frac`,
 * `Base` and `Color` leave theirs unassigned).
 */
function newUnderset(one: unknown, two: unknown, options: NodeOptions = {}): UnicodemathDraft {
  return binaryDraft("underset", undefined, one, two, options);
}

/** `Fenced.new(p1, p2, p3, options = {})` — `@options` always assigned. */
function newFenced(one: unknown, two: unknown, three: unknown): UnicodemathDraft {
  const draft = ternaryDraft("fenced", undefined, one, two, three);
  draft.fields.options = {};
  return draft;
}

/**
 * `Nary.new(p1, p2, p3, p4, options = {})` — `@options` always assigned, the
 * mask-carrying NARY rules (`:2856`-`:3588`) being the only callers that
 * pass a non-default `options`.
 *
 * `options ?? {}` would default an explicit `null` to `{}` as well as an
 * omitted argument, but `Nary.new(..., nil)` — measured on the oracle —
 * stores `@options = nil`, distinct from both an omitted argument (`{}`) and
 * an explicit `{}` (`{}`). Only `undefined` (truly omitted) defaults here;
 * an explicit `null` passes through unchanged.
 *
 * Exported for `test/core/nodes.spec.ts`'s options-distinction coverage:
 * every rule that calls this always either omits `options` or builds one
 * from a bound `mask`, so no grammar input reaches an explicit `null` here —
 * the export exists to exercise that latent path directly, the same
 * rationale `matrix-transform.spec.ts` gives for driving unreachable
 * transform code by hand rather than through a full parse.
 */
export function newNary(
  one: unknown,
  two: unknown,
  three: unknown,
  four: unknown,
  options?: NodeOptions | null,
): UnicodemathDraft {
  return new UnicodemathDraft("nary", undefined, {
    parameterOne: orNil(one),
    parameterTwo: orNil(two),
    parameterThree: orNil(three),
    parameterFour: orNil(four),
    options: options === undefined ? {} : options,
  });
}

/* =========================================================================
 * 3. The Utility helpers the rules call
 * ---------------------------------------------------------------------- */

/**
 * `Utility.symbols_class(string, lang: :unicodemath)` (`utility.rb:212-218`):
 * a non-string argument comes back unchanged; otherwise the STRIPPED text is
 * looked up and the class instantiated with no arguments, and a miss falls back
 * to a bare `Symbol` carrying the original text.
 */
function symbolsClass(value: unknown): unknown {
  if (!(typeof value === "string" || value instanceof Slice)) return value;
  const id = UNICODEMATH_SYMBOL_CLASS_INPUT.get(rubyStrip(rubyToS(value)));
  return id === undefined ? newBareSymbol(value) : newSymbolOfClass(id);
}

/**
 * `Utility.filter_values(array, new_formula: true)` (`utility.rb:192-200`),
 * whose return SHAPE — formula, lone element, nil — decides what the caller
 * builds. A `Formula` input contributes its LIVE value array.
 */
function filterValues(value: unknown, newFormula = true): unknown {
  if (!Array.isArray(value) && !isFormulaDraft(value)) return value;
  const array = isFormulaDraft(value) ? formulaValue(value) : compact(flattenDeep(value));
  if (array.length > 1) return newFormula ? newFormulaOf(array) : array;
  return array.length === 0 ? null : array[0];
}

function newFormulaOf(value: unknown[]): UnicodemathDraft {
  return newFormula(value);
}

/**
 * `Utility.valid_paren?(object)` (`utility.rb:270-279`): round parens, neither
 * of them mini-sized, and an EMPTY options hash. The `options.keys.none?` test
 * for `open_paren`/`close_paren` is subsumed by the `options.empty?` test that
 * follows it in the same expression; both are transcribed because both are
 * there.
 */
function validParen(fenced: UnicodemathDraft): boolean {
  const one = fenced.fields.parameterOne;
  const three = fenced.fields.parameterThree;
  const options = fenced.fields.options;
  if (!(isSymbol(one) && one.identity === LROUND_ID)) return false;
  if (!(isSymbol(three) && three.identity === RROUND_ID)) return false;
  const keys = isPlainObject(options) ? Object.keys(options) : [];
  if (keys.some((key) => key === "open_paren" || key === "close_paren")) return false;
  if (rubyTruthy(one.fields.miniSupSized)) return false;
  if (rubyTruthy(three.fields.miniSubSized)) return false;
  return keys.length === 0;
}

/** `Utility.unfenced_value(object, paren_specific:)` (`utility.rb:255-268`). */
function unfencedValue(object: unknown, parenSpecific: boolean): unknown {
  if (isFenced(object)) {
    if (!parenSpecific || validParen(object)) return filterValues(object.fields.parameterTwo);
    return object;
  }
  if (Array.isArray(object)) return filterValues(object);
  return object;
}

/**
 * `Utility.get_class(text)` through the explicit registry (`./registry`).
 * A miss throws, which is where the gem raises `NameError`.
 */
function getClass(name: unknown): UnicodemathClassEntry {
  const key = rubyToS(name);
  const entry = UNICODEMATH_CLASS_REGISTRY.get(key);
  if (entry === undefined) {
    throw new Error(`unicodemath transform: no class registered for "${key}"`);
  }
  return entry;
}

/**
 * `.new` on what `get_class` resolved, honouring that class's initialize. A
 * fourth ternary argument is the mask-carrying NARY rules' `options` — every
 * `TernaryFunction` subclass `get_class` can resolve for a NARY name takes it
 * as `initialize`'s own trailing `options = {}`, assigned only when passed
 * (`int.rb:16-21`'s `@options = options unless options&.empty?`, transcribed
 * as "only set the field when the caller passed one").
 */
function buildClass(name: unknown, ...args: unknown[]): UnicodemathDraft {
  const entry = getClass(name);
  switch (entry.family) {
    case "unary":
      return unaryDraft(entry.kind, entry.name, args[0]);
    case "binary":
      return binaryDraft(entry.kind, entry.name, args[0], args[1]);
    case "ternary": {
      const draft = ternaryDraft(entry.kind, entry.name, args[0], args[1], args[2]);
      // `!== undefined`, not `??`: an explicit `null` here must reach the
      // built node's `options` field unchanged (an omitted 4th argument must
      // not), for `assignedOptions`/`copyOptions` downstream to make the same
      // omitted-vs-null-vs-`{}` distinction the constructor being built —
      // `Nary`/`Fenced` (`assignedOptions`) or `Int`/`Oint`/`Prod`/`Sum`
      // (`copyOptions`) — makes on it. Both now treat an explicit `null` the
      // same as `nil` reaching the oracle's own `options` ivar rather than
      // crashing on it (`copyOptions` used to hit `Object.keys(null)`).
      if (args[3] !== undefined) draft.fields.options = args[3];
      return draft;
    }
    default:
      throw new Error(`unicodemath transform: "${rubyToS(name)}" has no constructible family`);
  }
}

/**
 * `Utility::FONT_STYLES[fonts.to_sym].new(value)` (`transform.rb:236`), with
 * the subclass's own default `parameter_two`. The gem has no nil guard here, so
 * a text with no entry raises `NoMethodError`; generation proves there is none,
 * and this throws where that would land.
 */
function newFontStyle(fonts: unknown, one: unknown): UnicodemathDraft {
  const keyword = rubyToS(fonts);
  const style = UNICODEMATH_FONT_STYLES.get(keyword);
  if (style === undefined) {
    throw new Error(`unicodemath transform: no FONT_STYLES entry for "${keyword}"`);
  }
  return binaryDraft("fontStyle", style.name, one, style.keyword);
}

/**
 * `Utility.symbol_prime?(obj)` (`unicode_math/utility.rb:186-189`):
 * `obj&.class&.const_defined?(:INPUT)` is true for exactly the symbol classes
 * (measured: `Math::Symbols::Symbol` defines `INPUT` and every subclass
 * inherits it; `Math::Number` and the function classes do not), and
 * `hexcode_in_input` is the generated per-class entity.
 */
function symbolPrime(value: unknown): boolean {
  if (!isSymbol(value) || value.identity === undefined) return false;
  const hexcode = UNICODEMATH_HEXCODE_IN_INPUT.get(value.identity);
  return hexcode !== undefined && PRIMES_INVERTED.has(hexcode);
}

/**
 * `Utility.base_is_prime?(base)` (`unicode_math/utility.rb:181-184`). The
 * second arm reads `.value` unguarded, so a `Power` whose exponent is a
 * function node raises `NoMethodError` in the gem; `draftValue` throws there.
 */
function baseIsPrime(base: UnicodemathDraft): boolean {
  const two = base.fields.parameterTwo;
  if (symbolPrime(two)) return true;
  return PRIMES_INVERTED.has(rubyToS(draftValue(two)));
}

/**
 * `UnicodeMath::Utility.fractions(numerator, denominator, options = nil)`
 * (`unicode_math/utility.rb:86-104`) and its `recursion_fraction` helper.
 *
 * The denominator is MUTATED when it is already a `Frac`: its `parameter_one`
 * is replaced by a new `Frac` built from the numerator, and the same (mutated)
 * denominator is returned. That is what makes `(a)/(b)/(c)` left-nest.
 */
function fractions(numerator: unknown, denominator: unknown, options?: NodeOptions): unknown {
  if (isFrac(denominator)) {
    if (isFrac(denominator.fields.parameterOne)) {
      recursionFraction(denominator, numerator, options);
    } else {
      denominator.fields.parameterOne = newFrac(
        unfencedValue(numerator, true),
        unfencedValue(denominator.fields.parameterOne, true),
        options,
      );
    }
    return denominator;
  }
  return newFrac(unfencedValue(numerator, true), unfencedValue(denominator, true), options);
}

function recursionFraction(
  frac: UnicodemathDraft,
  numerator: unknown,
  options: NodeOptions | undefined,
): unknown {
  const newNumerator = frac.fields.parameterOne;
  if (isFrac(newNumerator)) return recursionFraction(newNumerator, numerator, options);
  frac.fields.parameterOne = newFrac(
    unfencedValue(numerator, true),
    unfencedValue(frac.fields.parameterOne, true),
    options,
  );
  return frac;
}

function isFrac(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && value.kind === "frac";
}

/** `Frac.new(p1, p2, options = nil)` — `@options` assigned only when passed. */
function newFrac(one: unknown, two: unknown, options?: NodeOptions): UnicodemathDraft {
  return binaryDraft("frac", undefined, one, two, options);
}

/**
 * `UnicodeMath::Utility.updated_primes(prime)` (`unicode_math/utility.rb:78-84`)
 * — every `&#x...;` entity in the text, each through `symbols_class`, folded by
 * `filter_values`. `UNICODE_REGEX` is `%r{&#x[a-zA-Z0-9]+;}` (`utility.rb:6`).
 */
const UNICODE_REGEX = /&#x[a-zA-Z0-9]+;/g;

function updatedPrimes(prime: unknown): unknown {
  // `:1404` hands over a SEQUENCE (`x\prime\prime`): Ruby's `Array#to_s` is
  // `inspect`, which prints each element's text between quotes and commas —
  // never a new `&#x...;` entity — so scanning the joined element texts finds
  // exactly the entities the inspected string would.
  const text = Array.isArray(prime) ? prime.map((item) => rubyToS(item)).join(" ") : rubyToS(prime);
  const matches = text.match(UNICODE_REGEX) ?? [];
  return filterValues(matches.map((text) => symbolsClass(text)));
}

/**
 * `UnicodeMath::Utility.accent_value(accent, lang:)`
 * (`unicode_math/utility.rb:59-66`).
 */
function accentValue(accent: Record<string, unknown>): unknown {
  if (rubyTruthy(accent.accent_symbols)) {
    const text = rubyToS(accent.accent_symbols);
    return symbolsClass(UNICODEMATH_ACCENT_SYMBOLS.get(text) ?? accent.accent_symbols);
  }
  return rubyTruthy(accent.first_value)
    ? accent.first_value
    : updatedPrimes(accent.prime_accent_symbols);
}

/**
 * `UnicodeMath::Utility.transform_accents(accents, lang:)`
 * (`unicode_math/utility.rb:25-56`).
 *
 * `reduce` with no initial value: a one-element array returns that element
 * WITHOUT running the block, which is why a single accent hash can reach a
 * caller unchanged. The block's two arms differ only in whether the
 * accumulator is still a raw hash (the first fold) or an already-built node.
 */
function transformAccents(accents: readonly unknown[]): unknown {
  if (accents.length === 0) return null;
  let fn = accents[0];
  for (let index = 1; index < accents.length; index++) {
    const accent = accents[index];
    if (isPlainObject(fn)) {
      const carrier = fn;
      fn = rubyTruthy(carrier.prime_accent_symbols)
        ? newPower(
            unfencedValue(accentValue(carrier), true),
            accentValue(asAccentHash(accent, "accent")),
          )
        : newOverset(
            accentValue(asAccentHash(accent, "accent")),
            unfencedValue(accentValue(carrier), true),
            { accent: true },
          );
      continue;
    }
    const hash = asAccentHash(accent, "accent");
    fn = rubyTruthy(hash.prime_accent_symbols)
      ? newPower(unfencedValue(fn, true), accentValue(hash))
      : newOverset(accentValue(hash), unfencedValue(fn, true), { accent: true });
  }
  return fn;
}

function asAccentHash(value: unknown, where: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(
      `unicodemath transform: ${where} is not a hash (Ruby raises NoMethodError)`,
    );
  }
  return value;
}

/**
 * `UnicodeMath::Utility.unicode_accents(accents, lang:)`
 * (`unicode_math/utility.rb:9-22`).
 *
 * The middle branch MUTATES the caller's tree: it `pop`s the last element off
 * the first accent's `first_value` array, writes the popped element back as
 * that key's value, and prepends the rest of the array to the folded result.
 * Transcribed rather than tidied.
 */
function unicodeAccents(accents: unknown): unknown {
  if (isA(accents, IS_BINARY_FUNCTION)) return accents;
  if (!Array.isArray(accents)) {
    throw new TypeError(
      "unicodemath transform: accents is not an Array (Ruby raises NoMethodError)",
    );
  }
  const carriesArray = accents.some((accent) => {
    if (accent === null || accent === undefined) return false;
    return Array.isArray(asAccentHash(accent, "accents entry").first_value);
  });
  if (carriesArray) {
    const first = asAccentHash(accents[0], "accents[0]");
    const values = first.first_value as unknown[];
    const accentValueOf = values.pop();
    first.first_value = accentValueOf;
    return newFormula([...values, transformAccents(accents)]);
  }
  return transformAccents(accents);
}

/* --- the node builders the rules name directly ------------------------- */

/** `Math::Function::Power.new(p1, p2)` — an alias on `BinaryFunction`. */
function newPower(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Power", one, two);
}

/** `Math::Function::Base.new(p1, p2, options = {})` — `@options` unassigned unless non-empty. */
function newBase(one: unknown, two: unknown, options?: NodeOptions): UnicodemathDraft {
  return binaryDraft("base", undefined, one, two, options);
}

/**
 * `Math::Function::PowerBase.new(p1, p2 = nil, p3 = nil)` — an alias on
 * `TernaryFunction`. The MULTISCRIPT rules are the first callers to omit `p2`
 * and/or `p3`; `orNil` inside `ternaryDraft` already turns the resulting
 * `undefined` into the same nil Ruby's default would leave.
 */
function newPowerBase(one: unknown, two?: unknown, three?: unknown): UnicodemathDraft {
  return ternaryDraft("ternaryFunction", "PowerBase", one, two, three);
}

/**
 * `Math::Function::Multiscript.new(p1, p2, p3)` — an alias on `TernaryFunction`.
 * `p2`/`p3` are the prescript sub/superscript ARRAYS (`[]` when absent, never
 * nil — every ported rule passes one), `p1` the `PowerBase` the real base and
 * any trailing (non-prescript) sub/sup build.
 */
function newMultiscript(one: unknown, two: unknown, three: unknown): UnicodemathDraft {
  return ternaryDraft("ternaryFunction", "Multiscript", one, two, three);
}

/** `Math::Function::Underover.new(p1, p2, p3)` — an alias on `TernaryFunction`. */
function newUnderover(one: unknown, two: unknown, three: unknown): UnicodemathDraft {
  return ternaryDraft("ternaryFunction", "Underover", one, two, three);
}

/** `Math::Function::Overset.new(p1, p2, options = nil)`. */
function newOverset(one: unknown, two: unknown, options?: NodeOptions): UnicodemathDraft {
  return binaryDraft("overset", undefined, one, two, options);
}

/** `Math::Function::Root.new(p1, p2)` — an alias on `BinaryFunction`. */
function newRoot(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Root", one, two);
}

/** `Math::Function::Sqrt.new(p1)` — a `UnaryFunction`, so a Slice becomes text. */
function newSqrt(one: unknown): UnicodemathDraft {
  return unaryDraft("sqrt", undefined, one);
}

/** `Math::Function::Abs.new(p1)` — a `UnaryFunction`, so a Slice becomes text. */
function newAbs(one: unknown): UnicodemathDraft {
  return unaryDraft("abs", undefined, one);
}

/**
 * `Math::Function::Color.new(p1, p2, options = {})` — `@options` is assigned
 * only when the hash is non-empty, and the one caller that passes one
 * (`:1252`/`:1261`, `{backgroundcolor: true}`) never passes an empty hash.
 */
function newColor(one: unknown, two: unknown, options?: NodeOptions): UnicodemathDraft {
  return binaryDraft("color", undefined, one, two, options);
}

/** `Math::Function::Phantom.new(p1)` — a `UnaryFunction` subclass, so an alias on it. */
function newPhantom(one: unknown): UnicodemathDraft {
  return unaryDraft("unaryFunction", "Phantom", one);
}

/**
 * `Math::Function::Mpadded.new(p1, options)` — a `UnaryFunction` whose
 * `@options` is assigned only when non-empty. Both callers (`:1224`, `:1561`)
 * pass a non-empty hash.
 */
function newMpadded(one: unknown, options: NodeOptions): UnicodemathDraft {
  const draft = unaryDraft("mpadded", undefined, one);
  draft.fields.options = options;
  return draft;
}

/** `Math::Function::Intent.new(p1, p2)` — a `BinaryFunction` subclass, so an alias on it. */
function newIntent(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Intent", one, two);
}

/**
 * `Utility.enclosure_attrs(mask)` (`unicode_math/utility.rb:213-226`): the
 * `Menclose` notation words for the sides a `rect_value` mask does NOT set —
 * the low four bits are flipped (`mask ^= 15`), the result read bit by bit
 * from the least significant end, and each set bit looked up in
 * `MASK_CLASSES`. A mask outside 0..255 raises, which the parse reports as a
 * refusal.
 */
function enclosureAttrs(mask: number): string {
  if (mask < 0 || mask > 255) throw new RangeError("enclosure mask is not between 0 and 255");
  const flipped = mask ^ 15;
  const classes: string[] = [];
  for (let bit = 0; bit < 8; bit++) {
    const name = UNICODEMATH_MASK_CLASSES.get(String(2 ** bit));
    if ((flipped & (2 ** bit)) !== 0 && name !== undefined) classes.push(name);
  }
  return classes.join(" ");
}

/**
 * `Constants::UNICODED_FONTS.dig(font.to_sym, key.to_sym)` (`transform.rb:227`):
 * a miss at either level is nil.
 */
function unicodedFont(font: unknown, key: unknown): string | null {
  const row = UNICODEMATH_UNICODED_FONTS.find(([fontClass]) => fontClass === rubyToS(font));
  const entry = row?.[1].find(([name]) => name === rubyToS(key));
  return entry === undefined ? null : entry[1];
}

/** One `PHANTOM_SYMBOLS` attribute value back into the hash Ruby held. */
function attributeValue(value: UnicodemathPhantomAttribute): unknown {
  if (typeof value === "boolean" || typeof value === "string") return value;
  return Object.fromEntries(value.map(([key, inner]) => [key, attributeValue(inner)]));
}

/** `Math::Function::Menclose.new(p1, p2)` — an alias on `BinaryFunction`. */
function newMenclose(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Menclose", one, two);
}

/**
 * `Math::Function::Obrace.new(p1, attributes = {})` — a `UnaryFunction`.
 * Every DECORATION construction site calls it with one argument, so
 * `attributes` is left unset and `finalize` defaults it the same way
 * `assignedOptions(undefined)` does in `core/nodes.ts`.
 */
function newObrace(one: unknown): UnicodemathDraft {
  return unaryDraft("obrace", undefined, one);
}

/** `Math::Function::Ubrace.new(p1, attributes = {})` — a `UnaryFunction`. */
function newUbrace(one: unknown): UnicodemathDraft {
  return unaryDraft("ubrace", undefined, one);
}

/** `Math::Function::Mod.new(p1, p2)` — an alias on `BinaryFunction`. */
function newMod(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Mod", one, two);
}

/**
 * `Math::Function::Td.new(parameter_one)` — a `BinaryFunction`, so
 * `parameter_two` stays Ruby's own `nil` default. Every TABLE-family call
 * site already shapes `one` the way `Td#initialize` wants it — `[td]` for a
 * single cell, an already-sequence `td` for several — so this is the plain
 * wrap, not a second `Array()`.
 */
function newTd(one: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Td", one, undefined);
}

/** `Math::Function::Tr.new(parameter_one)` — a `UnaryFunction`, same shape as `newTd`. */
function newTr(one: unknown): UnicodemathDraft {
  return unaryDraft("unaryFunction", "Tr", one);
}

/**
 * `Math::Function::Table.new(value, open_paren = nil, close_paren = nil,
 * options = {})` (`function/table.rb:20-29`): `name` undefined builds the
 * BARE carrier (`buildMatrixTable`'s `:matrix` branch below), and a paren
 * argument left OMITTED here — not passed as `null` — stays out of the
 * draft's fields entirely, so `finalizeDraft` never sets it on `init` and the
 * node constructor's own `aliasDefaults` (`core/nodes.ts`) supplies the
 * subclass's default, exactly what omitting the Ruby argument does.
 */
function newTable(
  name: string | undefined,
  value: unknown,
  openParen?: unknown,
  closeParen?: unknown,
): UnicodemathDraft {
  const fields: Record<string, unknown> = { value };
  if (openParen !== undefined) fields.openParen = openParen;
  if (closeParen !== undefined) fields.closeParen = closeParen;
  return new UnicodemathDraft("table", name, fields);
}

/** `Math::Function::Mlabeledtr.new(p1, p2)` — an alias on `BinaryFunction`. */
function newMlabeledtr(one: unknown, two: unknown): UnicodemathDraft {
  return binaryDraft("binaryFunction", "Mlabeledtr", one, two);
}

/**
 * The n-ary name `transform.rb:1968` and `:2806` both compute before deciding
 * which constructor to use: the captured text when it is already a
 * `NARY_CLASSES` key, else the key its entity inverts to, else the
 * `NARY_SYMBOLS` entity for it, else the text itself.
 */
function naryFunctionName(naryClass: unknown): unknown {
  const text = rubyToS(naryClass);
  if (UNICODEMATH_NARY_CLASSES.has(text)) return naryClass;
  return NARY_CLASSES_INVERTED.get(text) ?? NARY_SYMBOLS.get(text) ?? naryClass;
}

/**
 * `digit = Constants::SUB_DIGITS.key(digits).to_s; Math::Number.new(digit,
 * mini_sub_sized: true)` — shared by `:170`'s standalone unwrap and `:2971`'s
 * compound `{pre_subscript:, base:, sub_digits:}` shape, both resolving a
 * trailing SUB_DIGITS unicode digit back to its plain-text key, mini-sized.
 */
function subDigitNumber(digits: unknown): UnicodemathDraft {
  const digit = SUB_DIGITS_INVERTED.get(rubyToS(digits)) ?? "";
  return new UnicodemathDraft("number", undefined, {
    value: digit,
    miniSubSized: true,
    miniSupSized: false,
    base: null,
  });
}

/** `:165`'s SUP_DIGITS twin of `subDigitNumber`, mini-sup-sized instead. */
function supDigitNumber(digits: unknown): UnicodemathDraft {
  const digit = SUP_DIGITS_INVERTED.get(rubyToS(digits)) ?? "";
  return new UnicodemathDraft("number", undefined, {
    value: digit,
    miniSubSized: false,
    miniSupSized: true,
    base: null,
  });
}

/**
 * `Utility.capitalize(text)` (`utility.rb:143-145`):
 * `text.to_s.split("_").map(&:capitalize).join`. None of the eight `MATRIXS`
 * keys carries an underscore, so the split is a no-op here, but Ruby's
 * `String#capitalize` DOWNCASES every character after the first — so
 * `"vmatrix"` and `"Vmatrix"` both become `"Vmatrix"`. That collapse is
 * measured on the oracle (module header) and reproduced here, not "fixed":
 * `getTableClass` returns the same name for both, and only the extra paren
 * argument `buildMatrixTable` passes for the capital symbol tells the two
 * apart.
 */
function rubyCapitalizeWord(word: string): string {
  if (word.length === 0) return word;
  return (word[0] as string).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * `Utility.get_table_class(text)` (`utility.rb:135-137`):
 * `Object.const_get("...Table::#{capitalize(text)}")`. The port has no
 * `const_get`, so this returns the alias identity `newTable`'s `name`
 * argument wants — the same string the class's basename would be.
 */
function getTableClass(name: string): string {
  return name.split("_").map(rubyCapitalizeWord).join("");
}

/**
 * `Utility.identity_matrix(size)` (`unicode_math/utility.rb:202-211`): a
 * `size`x`size` grid with `1` on the diagonal and `0` elsewhere, each cell a
 * `Td` wrapping a `Number`, each row a `Tr` — returned as the array of `Tr`s
 * directly, the same shape `array: sequence(:array)` rules pass to
 * `newTable`.
 */
function identityMatrix(size: number): UnicodemathDraft[] {
  const rows: UnicodemathDraft[] = [];
  for (let row = 0; row < size; row += 1) {
    const cells: UnicodemathDraft[] = [];
    for (let column = 0; column < size; column += 1) {
      cells.push(newTd([newNumber(row === column ? "1" : "0")]));
    }
    rows.push(newTr(cells));
  }
  return rows;
}

/**
 * `Constants::MATRIXS.key(matrixs) || matrixs.to_sym` (`:1649`, `:1670`,
 * `:1691`'s shared preamble): the entity `opMatrixs` captures resolves
 * through the inverted table; `opPrefixedMatrixs`'s `\pmatrix`-style
 * alternative captures the KEY text itself, which the inverted lookup
 * misses, so the raw text stands in for the symbol Ruby's `.to_sym` would
 * produce.
 */
function matrixSymbol(value: unknown): string {
  const text = rubyToS(value);
  const inverted = MATRIXS_INVERTED.get(text);
  if (inverted !== undefined) return inverted;
  if (UNICODEMATH_MATRIXS_KEYS.includes(text)) return text;
  // `Constants::MATRIXS.key(matrixs) || matrixs.to_sym` never lands here in
  // Ruby: `getTableClass` below feeds this symbol straight into
  // `Object.const_get`, which raises `NameError` for anything that is not one
  // of the eight `MATRIXS` keys. The port has no `const_get` to raise for it,
  // so the refusal moves here instead of being silently accepted.
  throw new Error(`unicodemath transform: "${text}" is not a known matrix symbol`);
}

/**
 * The three-way branch every `matrixs` rule shares (`:1649`, `:1670`,
 * `:1691`): `:Vmatrix` and `:Bmatrix` — the CAPITAL symbols — pass explicit
 * parens the lowercase names never do, `:matrix` builds the BARE carrier
 * (`table-behaviour.spec.ts`'s "`Matrix` is not special"), and everything
 * else asks `getTableClass`, which collapses `vmatrix`/`Vmatrix` and
 * `bmatrix`/`Bmatrix` onto the same subclass name — see the module header and
 * `getTableClass` above.
 */
function buildMatrixTable(matrixs: unknown, array: unknown): UnicodemathDraft {
  const matrix = matrixSymbol(matrixs);
  if (matrix === "Vmatrix") {
    return newTable(getTableClass(matrix), array, newSymbolOfClass(NORM_ID));
  }
  if (matrix === "Bmatrix") {
    return newTable(
      getTableClass(matrix),
      array,
      newSymbolOfClass(LCURLY_ID),
      newSymbolOfClass(RCURLY_ID),
    );
  }
  if (matrix === "matrix") return newTable(undefined, array);
  return newTable(getTableClass(matrix), array);
}

function asArray(value: TransformValue): unknown[] {
  return value as unknown[];
}

/* =========================================================================
 * 4. The rules, in unicode_math/transform.rb order — ONE Transform instance
 * ---------------------------------------------------------------------- */

/** How many rules this module registers, so a coverage spec can pin it. */
export interface UnicodemathTransformBuild {
  readonly transform: Transform;
  /** Rule id -> how many times its action has run, for the coverage spec. */
  readonly fired: Map<string, number>;
  readonly ruleIds: readonly string[];
}

/**
 * Builds the transform.
 *
 * Every rule is registered through a local `rule` wrapper that tags it with the
 * `transform.rb` line its `rule(` opens on and counts its firings. The counter
 * is what `test/formats/unicodemath/transform-coverage.spec.ts` uses to prove
 * the fixture set actually exercises each ported rule.
 *
 * The ids are the `rule(` lines, not the block's `source_location` — Ruby
 * reports the line carrying the block opener, which for a multi-line header is
 * some way further down: measured offsets on the pinned gem run to six, with
 * `:3978`'s block reporting 3984.
 */
export function buildUnicodemathTransform(): UnicodemathTransformBuild {
  const t = new Transform();
  const fired = new Map<string, number>();
  const ruleIds: string[] = [];

  const rule = (
    id: string,
    pattern: Parameters<Transform["rule"]>[0],
    action: Parameters<Transform["rule"]>[1],
  ): void => {
    if (fired.has(id)) throw new Error(`unicodemath transform: duplicate rule id ${id}`);
    fired.set(id, 0);
    ruleIds.push(id);
    t.rule(pattern, (bindings) => {
      fired.set(id, (fired.get(id) as number) + 1);
      return action(bindings);
    });
  };

  // --- BaseNumberPrefix::Transform (base_number_prefix.rb:36-38) ----------
  // `include` runs first (`unicode_math/transform.rb:6`), so these three are
  // DEFINED first and, matching in reverse definition order, tried LAST. The
  // ids follow `latex/transform.ts`'s `bnp:<line>` for the same mixin.
  //
  // BigInt, not parseInt: Ruby's `to_i(2)` is exact at any length.
  rule("bnp:36", { hex_number: simple("hex") }, (b) => newNumber(rubyToS(b.hex), 16));
  rule("bnp:37", { binary_number: simple("bin") }, (b) =>
    newNumber(BigInt(`0b${rubyToS(b.bin)}`).toString(), 2),
  );
  rule("bnp:38", { octal_number: simple("oct") }, (b) =>
    newNumber(BigInt(`0o${rubyToS(b.oct)}`).toString(), 8),
  );

  // --- pass-through and leaf rules (transform.rb:8-170) -------------------

  // TABLE (eighteen rules total, not the seventeen a prior survey counted —
  // see the module header): `:8`/`:9` are the base cases `:14`/`:15` below
  // extend to a sequence of cells.
  rule("8", { td: simple("td") }, (b) => newTd([b.td]));
  rule("9", { tr: simple("tr") }, (b) => newTr([b.tr]));
  rule("13", { exp: simple("exp") }, (b) => b.exp);
  rule("14", { tr: sequence("tr") }, (b) => newTr(b.tr));
  rule("15", { td: sequence("td") }, (b) => newTd(b.td));
  // `:13`'s SEQUENCE twin — unneeded until a TABLE coverage witness needed a
  // cell whose own content resolves to an array (`generate-unicodemath-model-
  // fixtures.rb`'s "table" group), the one case that leaves `exp` a sequence.
  rule("17", { exp: sequence("exp") }, (b) => b.exp);
  rule("18", { atom: simple("atom") }, (b) => b.atom);
  // Unwraps slice C's fixtures need to reach its own rules through (`:19`,
  // `:47`, `:58`, `:77`, `:426`): the same one-line shapes as their neighbours
  // here, claimed by the pure-rule slice as well — identical registrations,
  // which the merge has to keep exactly once (a second `rule("19", ...)` throws).
  rule("19", { rect: simple("rect") }, (b) => b.rect);
  rule("20", { nary: simple("nary") }, (b) => b.nary);
  rule("21", { char: simple("char") }, (b) => b.char);
  rule("22", { expr: simple("expr") }, (b) => b.expr);
  rule("23", { frac: simple("frac") }, (b) => b.frac);
  rule("24", { root: simple("root") }, (b) => b.root);
  rule("25", { text: simple("text") }, (b) => newText(b.text));
  rule("27", { sub_exp: simple("exp") }, (b) => b.exp);
  rule("28", { sup_exp: simple("exp") }, (b) => b.exp);
  rule("29", { int_exp: simple("exp") }, (b) => b.exp);
  rule("30", { atom: sequence("atom") }, (b) => b.atom);
  // `:31` — PREREQUISITE owned by the pure-unwrap slice (claims file A.txt), carried
  // here because `:1538`'s `ab` operands only reach it through this unwrap.
  rule("31", { expr: sequence("expr") }, (b) => b.expr);
  // TABLE's fifth single-key member: the `{table: ...}` wrapper every
  // `array` alternative (`grammar.ts`'s `array` rule) puts around its match,
  // unwrapped once and for all here rather than by each of the other
  // seventeen.
  rule("32", { table: simple("table") }, (b) => b.table);
  rule("33", { fonts: simple("fonts") }, (b) => b.fonts);
  rule("34", { digit: simple("digit") }, (b) => b.digit);
  rule("35", { color: simple("color") }, (b) => b.color);
  rule("36", { ldots: simple("ldots") }, (b) => b.ldots);
  rule("39", { factor: simple("factor") }, (b) => b.factor);
  // DECORATION's fourth unwrap: `hbrack` (`grammar.ts`'s `hbrack` rule, third
  // alternative) wraps the whole `{hbracket_class:, first_value:}` /
  // `{hbracket_class:, scripted_first_value:}` hash under its own tag; the
  // first alternative (a `(`-bracketed value) does not, so `:1286`/`:1315`
  // below see both shapes and this unwrap only fires on the second.
  rule("40", { hbrack: simple("hbrack") }, (b) => b.hbrack);
  rule("44", { symbol: simple("symbol") }, (b) => symbolsClass(b.symbol));
  rule("45", { number: simple("number") }, (b) => newNumber(b.number));
  // `:39`'s SEQUENCE twin — already needed by RELATION/OPERATOR's `"2·3"`
  // above, and also needed the moment `:486`/`:491`/`:496` below fold more
  // than one atom onto a `factor`: without it the resulting array is a hash
  // the gem always resolves, refused here as if it were the "factor=other"
  // bug case `GEM_UNMATCHED_SIGNATURES` names.
  rule("47", { backcolor: simple("color") }, (b) => b.color);
  rule("49", { factor: sequence("factor") }, (b) => b.factor);
  rule("50", { operand: simple("operand") }, (b) => b.operand);
  rule("52", { accents: subtree("accent") }, (b) => unicodeAccents(b.accent));
  rule("55", { sub_script: simple("script") }, (b) => b.script);
  rule("56", { sup_script: simple("script") }, (b) => b.script);
  // Every MULTISCRIPT rule below (`:1992` on) is reached through the grammar's
  // `pre_script` wrapper, so this unwrap fires once per one of them, exactly
  // like `:55`/`:56` do for `sub_exp`/`sup_exp`.
  rule("57", { pre_script: simple("script") }, (b) => b.script);
  rule("58", { operand: sequence("operand") }, (b) => b.operand);

  rule("59", { mini_sup: simple("mini_sup") }, (b) => b.mini_sup);
  rule("60", { mini_sub: simple("mini_sub") }, (b) => b.mini_sub);
  rule("61", { close_paren: simple("paren") }, (b) => symbolsClass(b.paren));
  rule("62", { operator: simple("operator") }, (b) => symbolsClass(b.operator));
  rule("64", { unary_sub_sup: simple("unary") }, (b) => b.unary);
  rule("68", { monospace: simple("monospace") }, (b) => b.monospace);
  rule("71", { intermediate_exp: simple("expr") }, (b) => b.expr);
  rule("72", { decimal_number: simple("number") }, (b) => b.number);
  rule("73", { accents_subsup: simple("subsup") }, (b) => b.subsup);
  rule("74", { subsup_exp: simple("subsup_exp") }, (b) => b.subsup_exp);
  rule("76", { open_paren: simple("open_paren") }, (b) => symbolsClass(b.open_paren));
  // DECORATION's three unwraps: `op_diacritic_belows`/`op_diacritic_overlays`
  // (`grammar.ts`'s `opDiacriticBelows`/`opDiacriticOverlays`) each wrap the
  // matched entity under its own tag before `diacriticsAccents` wraps THAT
  // under `below_after`/`overlay_after`/`overlay_before`, so these strip the
  // inner tag back to plain text first — exactly what `:81`/`:94` do in the
  // gem. `:88` strips `diacriticsAccents`'s own outer `diacritics_accents`
  // wrapper once the rules below have built a node from its contents.
  rule("77", { override_subsup: simple("subsup") }, (b) => b.subsup);
  rule("81", { diacritic_belows: simple("belows") }, (b) => b.belows);
  rule("82", { unary_function: simple("function") }, (b) => b.function);
  rule("88", { diacritics_accents: simple("accent") }, (b) => b.accent);
  // NARY (`transform.rb:84`-`:3588`, nineteen rules): every remaining
  // `nary_class`/`nary`/`nary_sub_sup` call site, all reusing `:1968`'s and
  // `:2806`'s own `naryFunctionName`/`UNICODEMATH_NARY_CLASSES`/`buildClass`/
  // `newNary` machinery — no new grammar key, no new helper. `:84` is the
  // `nary_sub_sup` pass-through `:74`'s sibling already carries for
  // `subsup_exp`.
  rule("84", { nary_sub_sup: simple("subsup_exp") }, (b) => b.subsup_exp);
  rule("90", { unary_subsup: simple("unary_subsup") }, (b) => b.unary_subsup);
  rule("92", { alphanumeric: simple("alphanumeric") }, (b) => symbolsClass(b.alphanumeric));
  rule("94", { diacritic_overlays: simple("overlays") }, (b) => b.overlays);

  // RELATION/OPERATOR: `combined_symbols` (`±`/`∓`/`‼`, `Constants::
  // COMBINING_SYMBOLS`) resolved the same way `:99`'s siblings resolve every
  // other named-symbol table — a keyed lookup falling back to the matched
  // text itself, then through `symbolsClass` like every other resolved
  // symbol here.
  //
  // Ruby's `combined_symbols.to_sym` raises `NoMethodError` on anything that
  // is not a String — `nil`, `false`, an Integer all raise. `rubyToS` is a
  // general coercion helper that would instead answer something for those,
  // silently admitting a malformed transform node this rule cannot actually
  // reach from real grammar output but should still refuse the way Ruby
  // does, so the boundary is checked explicitly here (a matched grammar
  // token arrives as `string | Slice`, same as every other `simple()`
  // binding in this file) rather than delegated to `rubyToS`.
  rule("99", { combined_symbols: simple("combined_symbols") }, (b) => {
    if (!(typeof b.combined_symbols === "string" || b.combined_symbols instanceof Slice)) {
      throw new TypeError(
        `unicodemath transform: combined_symbols.to_sym on a ${typeof b.combined_symbols} (Ruby raises NoMethodError)`,
      );
    }
    const key = rubyToS(b.combined_symbols);
    return symbolsClass(COMBINING_SYMBOLS.get(key) ?? b.combined_symbols);
  });

  rule("104", { spaces: simple("spaces") }, (b) =>
    newSpace(SKIP_SYMBOLS.get(rubyToS(b.spaces)) ?? b.spaces),
  );

  rule("109", { binary_symbols: simple("symbols") }, (b) => symbolsClass(b.symbols));


  // `:118` — PREREQUISITE owned by the pure-unwrap slice (claims file A.txt), carried
  // here because `:1404`'s SEQUENCE `prime_accent_symbols` only exists once
  // `\prime` names are normalised to their entity. The gem reads
  // `Constants::PREFIXED_PRIMES` (four keys); the generated table is that hash
  // plus `sprime` (`Utility.primes_constants`), so `sprime` is excluded here to
  // keep this rule's lookup exactly the gem's.
  rule("118", { prefixed_prime: simple("prime") }, (b) => {
    const key = rubyToS(b.prime);
    const entity = key === "sprime" ? undefined : UNICODEMATH_PRIMES_CONSTANTS.get(key);
    return entity ?? b.prime;
  });
  rule("126", { unary_functions: simple("unary") }, (b) =>
    UNDEF_UNARY_FUNCTIONS.has(rubyToS(b.unary)) ? symbolsClass(b.unary) : buildClass(b.unary),
  );

  rule("134", { negated_operator: simple("operator") }, (b) =>
    newFormula([symbolsClass(b.operator), newBareSymbol("&#x338;")]),
  );

  rule("141", { ordinary_symbols: simple("ordinary") }, (b) => symbolsClass(b.ordinary));
  rule("145", { relational_symbols: simple("symbol") }, (b) => symbolsClass(b.symbol));
  rule("149", { unicode_symbols: simple("unicode_symbols") }, (b) =>
    symbolsClass(b.unicode_symbols),
  );

  // `FontStyle::Monospace.new(value)` names the class directly, so it takes
  // that subclass's own default `parameter_two` ("monospace", measured).
  rule("153", { monospace_value: simple("monospace_value") }, (b) =>
    newFontStyle("mtt", b.monospace_value),
  );

  // TEXT/FONT/COLOR/PHANTOM/ENCLOSE/INTENT (slice C). `:159` is `:153`'s
  // SEQUENCE twin: the run is folded through `filter_values` first.
  rule("159", { monospace_value: sequence("monospace_value") }, (b) =>
    newFontStyle("mtt", filterValues(b.monospace_value)),
  );

  // FRACTION's mini variant (`:1614`) needs its numerator and denominator
  // pre-resolved to a `simple` value, and the grammar leaves a single sup/sub
  // digit as `{sup_digits: Slice}`/`{sub_digits: Slice}` until one of these
  // fires. `subDigitNumber` arrives earlier in this same branch, with the
  // MULTISCRIPT family, where `:2971`'s compound shape needs it; nothing on
  // `main` has either helper. `supDigitNumber` is its sup-side twin, added
  // here. Both are a `Constants::SUP_DIGITS`/`SUB_DIGITS` reverse lookup over
  // tables the generated data already carries.
  rule("165", { sup_digits: simple("digits") }, (b) => supDigitNumber(b.digits));
  rule("170", { sub_digits: simple("digits") }, (b) => subDigitNumber(b.digits));

  // NARY continued — the bare `nary_class` base case, no sub/sup/naryand at
  // all (a lone `∫`): the resolved name's own zero-arg constructor.
  rule("175", { nary_class: simple("nary_class") }, (b) =>
    buildClass(naryFunctionName(b.nary_class)),
  );

  // RELATION/OPERATOR: `\not=`-style negated ordinary symbols — the matched
  // operator, already resolved by an earlier rule, followed by a literal
  // combining-overlay-strike mark (`&#x338;`) as a second `Formula` element,
  // exactly as the gem builds it rather than as one negated glyph.
  rule("184", { ordinary_negated_operator: simple("operator") }, (b) =>
    newFormula([symbolsClass(b.operator), newBareSymbol("&#x338;")]),
  );

  // `Number.new("#{decimal}#{whole.value}")`: a leading decimal marker with no
  // integer part (`,1`); `:2227` above is the `whole`+`decimal`+`fractional` twin.
  rule("191", { decimal: simple("decimal"), whole: simple("whole") }, (b) =>
    newNumber(htmlEntityToUnicode(`${rubyToS(b.decimal)}${rubyToS(draftValue(b.whole))}`)),
  );

  // --- two-key rules (transform.rb:236-2001) -----------------------------

  rule("222", { diacritics_accents: simple("accents"), expr: sequence("expr") }, (b) => [
    b.accents,
    ...asArray(b.expr),
  ]);

  // `:227`: a `\script`/`\double`/`\fraktur`/`\mitBbb` prefix plus one letter
  // — the `UNICODED_FONTS` code point when the pair has one, else the letter.
  rule("227", { unicoded_font_class: simple("unicoded"), symbol: simple("symbol") }, (b) =>
    symbolsClass(unicodedFont(b.unicoded, b.symbol) ?? b.symbol),
  );

  rule("236", { font_class: simple("fonts"), symbol: simple("symbol") }, (b) =>
    newFontStyle(b.fonts, symbolsClass(b.symbol)),
  );

  // NARY prerequisite — a resolved `symbol` immediately followed by an
  // `expr` continuation, the two-element array shape `:730`'s
  // `naryand_recursion` (and `:1874`'s SEQUENCE `naryand`) is built from:
  // implicit multiplication between two bare symbols with no relation
  // between them (`x y`, inside a NARY integrand), the same "adjacent atom"
  // shape `:401` already covers for `char`+`number`.
  rule(
    "243",
    { symbol: simple("symbol"), naryand_recursion: sequence("naryand_recursion") },
    (b) => [symbolsClass(b.symbol), ...asArray(b.naryand_recursion)],
  );
  rule("250", { symbol: simple("symbol"), naryand_recursion: simple("naryand_recursion") }, (b) => [
    symbolsClass(b.symbol),
    b.naryand_recursion,
  ]);
  rule("255", { symbol: simple("symbol"), expr: simple("expr") }, (b) => [
    symbolsClass(b.symbol),
    b.expr,
  ]);

  rule("260", { binary_symbols: simple("symbols"), expr: simple("expr") }, (b) => {
    const symbol = BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols;
    return [symbolsClass(symbol), b.expr];
  });

  rule("266", { binary_symbols: simple("symbols"), exp: sequence("exp") }, (b) => {
    const symbol = BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols;
    return [symbolsClass(symbol), ...asArray(b.exp)];
  });
  rule("272", { binary_symbols: simple("symbols"), expr: sequence("expr") }, (b) => {
    const symbol = BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols;
    return [symbolsClass(symbol), ...asArray(b.expr)];
  });
  rule(
    "278",
    { binary_symbols: simple("symbols"), naryand_recursion: simple("naryand_recursion") },
    (b) => {
      const symbol = BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols;
      return [symbolsClass(symbol), b.naryand_recursion];
    },
  );
  rule("302", { symbol: simple("symbol"), expr: sequence("expr") }, (b) => [
    symbolsClass(b.symbol),
    ...asArray(b.expr),
  ]);
  rule("309", { negated_operator: simple("operator"), expr: simple("expr") }, (b) => [
    newFormula([symbolsClass(b.operator), newBareSymbol("&#x338;")]),
    b.expr,
  ]);
  rule("320", { negated_operator: simple("operator"), expr: sequence("expr") }, (b) => [
    newFormula([symbolsClass(b.operator), newBareSymbol("&#x338;")]),
    ...asArray(b.expr),
  ]);

  // `:341`: an accented run followed by a SEQUENCE `expr` — the accent node is
  // built by `unicodeAccents` and prepended, the same `[x] + xs` concatenation
  // `:501`/`:825` use.
  rule("341", { accents: subtree("accent"), expr: sequence("expr") }, (b) => [
    unicodeAccents(b.accent),
    ...asArray(b.expr),
  ]);

  // TEXT followed by more: a quoted run, then the rest of the expression as a
  // list (`:351`, `:361`) or a single item (`:366`, `:356`).
  rule("351", { text: simple("text"), expr: sequence("expr") }, (b) => [
    newText(b.text),
    ...asArray(b.expr),
  ]);
  rule("356", { text: simple("text"), operand: simple("operand") }, (b) => [
    newText(b.text),
    b.operand,
  ]);
  rule("361", { text: simple("text"), operand: sequence("operand") }, (b) => [
    newText(b.text),
    ...asArray(b.operand),
  ]);
  rule("366", { text: simple("text"), expr: simple("expr") }, (b) => [newText(b.text), b.expr]);


  rule("371", { subsup_exp: simple("subsup"), expr: sequence("expr") }, (b) => [
    b.subsup,
    ...asArray(b.expr),
  ]);
  rule("386", { unary_subsup: simple("subsup"), expr: sequence("expr") }, (b) => [
    b.subsup,
    ...asArray(b.expr),
  ]);
  rule("391", { unary_subsup: simple("subsup"), expr: simple("expr") }, (b) => [b.subsup, b.expr]);
  // RELATION/OPERATOR: a resolved `char` (e.g. the `·` `unicode_symbols`
  // already turned into a symbol by `:149`) directly followed by a digit
  // run — `2·3`'s `char`/`number` pair, folded into a two-element list the
  // way every other `char: simple` sibling here is.
  rule("396", { char: simple("char"), alphanumeric: simple("alphanumeric") }, (b) => [
    b.char,
    symbolsClass(b.alphanumeric),
  ]);
  rule("401", { char: simple("char"), number: simple("number") }, (b) => [
    b.char,
    newNumber(b.number),
  ]);
  rule("406", { char: simple("char"), diacritics: simple("diacritics") }, (b) => [
    b.char,
    b.diacritics,
  ]);
  rule("411", { char: simple("char"), diacritics: sequence("diacritics") }, (b) => [
    b.char,
    ...asArray(b.diacritics),
  ]);
  rule("416", { fonts: simple("fonts"), expr: sequence("expr") }, (b) => [
    b.fonts,
    ...asArray(b.expr),
  ]);
  rule("421", { fonts: simple("fonts"), expr: simple("expr") }, (b) => [b.fonts, b.expr]);
  rule("426", { phantom: simple("phantom"), expr: sequence("expr") }, (b) => [
    b.phantom,
    ...asArray(b.expr),
  ]);

  rule("431", { subsup_exp: simple("subsup"), expr: simple("expr") }, (b) => [b.subsup, b.expr]);
  rule("436", { subsup_exp: simple("subsup"), exp: simple("exp") }, (b) => [b.subsup, b.exp]);
  rule("446", { operator: simple("operator"), expr: simple("expr") }, (b) => [
    symbolsClass(b.operator),
    b.expr,
  ]);
  rule("451", { mid_symbol: simple("mid_symbol"), expr: simple("expr") }, (b) => [
    symbolsClass(b.mid_symbol),
    b.expr,
  ]);
  rule("456", { mid_symbol: simple("mid_symbol"), expr: sequence("expr") }, (b) => [
    symbolsClass(b.mid_symbol),
    ...asArray(b.expr),
  ]);
  rule("461", { operator: simple("operator"), exp: simple("exp") }, (b) => [
    symbolsClass(b.operator),
    b.exp,
  ]);
  rule("466", { unicode_symbols: simple("unicode_symbols"), exp: simple("exp") }, (b) => [
    symbolsClass(b.unicode_symbols),
    b.exp,
  ]);
  rule("471", { unicode_symbols: simple("unicode_symbols"), expr: simple("expr") }, (b) => [
    symbolsClass(b.unicode_symbols),
    b.expr,
  ]);
  rule("476", { unicode_symbols: simple("unicode_symbols"), exp: sequence("exp") }, (b) => [
    symbolsClass(b.unicode_symbols),
    ...asArray(b.exp),
  ]);
  rule("481", { unicode_symbols: simple("unicode_symbols"), expr: sequence("expr") }, (b) => [
    symbolsClass(b.unicode_symbols),
    ...asArray(b.expr),
  ]);
  // ATOMS proper: the recursive `atom.as("atom") >> atoms.as("atoms").maybe()`
  // combinator (`grammar.ts:668`-`:670`, `common_rules.rb:9-11`) folded into a
  // plain array, one atom at a time. Measured on the oracle: "abc" folds
  // `atoms` -> `atom` -> `atom` via `:496` then `:18`/`:18`, landing
  // `factor: [Symbol(a), Symbol(b), Symbol(c)]`, which `:49` above then
  // unwraps. `:491` (`atom: sequence, atoms: simple`) is its sibling for an
  // atom side that already folded to an array — deferred with `:30` above:
  // this grammar's own right recursion (`atom.as("atom") >> atoms.as("atoms")
  // .maybe()`) always captures `atom` one leaf at a time, so no probed input
  // leaves it anything but `simple` at this position.
  rule("486", { atom: simple("atom"), atoms: simple("atoms") }, (b) => [b.atom, b.atoms]);
  rule("491", { atom: sequence("atom"), atoms: simple("atoms") }, (b) => [
    ...asArray(b.atom),
    b.atoms,
  ]);
  rule("496", { atom: simple("atom"), atoms: sequence("atoms") }, (b) => [
    b.atom,
    ...asArray(b.atoms),
  ]);

  rule("501", { operator: simple("operator"), expr: sequence("expr") }, (b) => [
    symbolsClass(b.operator),
    ...asArray(b.expr),
  ]);
  rule("506", { operator: simple("operator"), exp: sequence("exp") }, (b) => [
    symbolsClass(b.operator),
    ...asArray(b.exp),
  ]);

  // `Constants::COMBINING_SYMBOLS[key]` with NO fallback, unlike `:99`.
  rule("527", { combined_symbols: simple("combined_symbols"), exp: simple("exp") }, (b) => [
    symbolsClass(COMBINING_SYMBOLS.get(rubyToS(b.combined_symbols)) ?? null),
    b.exp,
  ]);


  rule("543", { pre_script: simple("pre_script"), expr: sequence("expr") }, (b) => [
    b.pre_script,
    ...asArray(b.expr),
  ]);
  rule("548", { pre_script: simple("pre_script"), expr: simple("expr") }, (b) => [
    b.pre_script,
    b.expr,
  ]);
  // TABLE continued (`transform.rb:598`-`:1691`, eighteen rules total; see
  // the module header): `Mlabeledtr`'s pair, built from `UnicodeMath::
  // Parser#post_processing`'s `{labeled_tr_value:, labeled_tr_id:}` wrap
  // (`parser.ts`'s own `postProcessing`, ported ahead of this slice) rather
  // than from the grammar directly. `:598`'s `value` is a SEQUENCE of rows —
  // `Utility.filter_values` folds it the way every multi-row formula field
  // does elsewhere in this file; `:606`'s is already the single row.
  rule("598", { labeled_tr_value: sequence("value"), labeled_tr_id: simple("id") }, (b) =>
    newMlabeledtr(filterValues(b.value), newText(b.id)),
  );
  rule("606", { labeled_tr_value: simple("value"), labeled_tr_id: simple("id") }, (b) =>
    newMlabeledtr(b.value, newText(b.id)),
  );

  rule("700", { accents_subsup: simple("accents_subsup"), expr: simple("expr") }, (b) => [
    b.accents_subsup,
    b.expr,
  ]);
  rule("705", { accents_subsup: simple("accents_subsup"), expr: sequence("expr") }, (b) => [
    b.accents_subsup,
    ...asArray(b.expr),
  ]);
  // NARY continued — a bare `nary` (already resolved by `:20`/`:175` above)
  // followed by its `naryand_recursion` continuation, the two-element array
  // every such pairing here folds into.
  rule("725", { nary: simple("nary"), naryand_recursion: simple("naryand_recursion") }, (b) => [
    b.nary,
    b.naryand_recursion,
  ]);
  rule("730", { nary: simple("nary"), naryand_recursion: sequence("naryand_recursion") }, (b) => [
    b.nary,
    ...asArray(b.naryand_recursion),
  ]);

  // ATOMS meeting FRACTION's `recursive_denominator`/`recursive_numerator`
  // (`:675`, `:680`, `:685`, `:690`, `:695`, `:1756`, `:2035`, `:2041`,
  // `:2048`, `:2787`, `:3074`) is deferred whole, not rule by rule: every one
  // of those eleven keys only ever appears inside FRACTION's `numerator`/
  // `denominator` grammar productions, and the TOP `{numerator:, denominator:}`
  // rule that would receive their output is itself one of the ten still-
  // deferred SEQUENCE-numerator/denominator sites (`transform.rb:1619`-
  // `:2371`, the module header's own "other ten call sites"). Measured by
  // probing each on the oracle and then driving the same input through this
  // port: `"1/a(b)"` fires `:675` on the oracle exactly as coded here, but the
  // resulting `[atom, Fenced]` is a SEQUENCE denominator, which lands on
  // `transform.rb:1619` (`numerator: simple, denominator: sequence`) —
  // unported — so the port refuses the very input that proves `:675` correct.
  // Porting any of these eleven without also porting at least the matching
  // half of the ten deferred FRACTION sites would add code with no reachable,
  // passing witness, which the repo's evidence rules do not allow; wiring
  // that family is the explicit follow-up this slice unblocks, not part of it.

  rule("735", { factor: simple("factor"), operand: simple("operand") }, (b) => [
    b.factor,
    b.operand,
  ]);
  rule("740", { factor: simple("factor"), unary_subsup: simple("subsup") }, (b) => [
    b.factor,
    b.subsup,
  ]);
  // RELATION/OPERATOR: `factor`'s SEQUENCE-`operand` twin of `:735` — reached
  // once a resolved relation symbol (e.g. `≤`) is itself an `operand` that
  // already flattened into a multi-element run, the same `[x, ...xs]` shape
  // `:825`/`:865`/`:870` below use for their own sequence-typed siblings.
  rule("745", { factor: simple("factor"), operand: sequence("operand") }, (b) => [
    b.factor,
    ...asArray(b.operand),
  ]);
  rule("765", { sup_exp: simple("sup_exp"), expr: simple("expr") }, (b) => [b.sup_exp, b.expr]);
  rule("770", { sup_exp: simple("sup_exp"), exp: simple("exp") }, (b) => [b.sup_exp, b.exp]);
  rule("775", { sub_exp: simple("sub_exp"), expr: sequence("expr") }, (b) => [
    b.sub_exp,
    ...asArray(b.expr),
  ]);
  rule("785", { sub_exp: simple("sub_exp"), exp: sequence("exp") }, (b) => [
    b.sub_exp,
    ...asArray(b.exp),
  ]);
  rule("790", { sub_exp: simple("sub_exp"), expr: simple("expr") }, (b) => [b.sub_exp, b.expr]);
  rule("805", { sup_exp: simple("sup_exp"), naryand_recursion: simple("naryand") }, (b) => [
    b.sup_exp,
    b.naryand,
  ]);
  rule("810", { exp: simple("exp"), expr: simple("expr") }, (b) => [b.exp, b.expr]);
  rule("815", { exp: simple("exp"), expr: sequence("expr") }, (b) => [b.exp, ...asArray(b.expr)]);
  rule("825", { sup_exp: simple("sup_exp"), expr: sequence("expr") }, (b) => [
    b.sup_exp,
    ...asArray(b.expr),
  ]);
  rule("835", { factor: simple("factor"), expr: simple("expr") }, (b) => [b.factor, b.expr]);
  rule("855", { factor: sequence("factor"), expr: sequence("expr") }, (b) => [
    ...asArray(b.factor),
    ...asArray(b.expr),
  ]);
  rule("865", { factor: simple("factor"), expr: sequence("expr") }, (b) => [
    b.factor,
    ...asArray(b.expr),
  ]);
  // `:845` has this exact signature and is DEAD: `rule` unshifts, so this
  // later definition wins every tie. See the header.
  rule("870", { factor: simple("factor"), exp: sequence("exp") }, (b) => [
    b.factor,
    ...asArray(b.exp),
  ]);
  rule("875", { factor: simple("factor"), exp: simple("exp") }, (b) => [b.factor, b.exp]);

  rule("885", { monospace: simple("monospace"), expr: simple("expr") }, (b) => [
    b.monospace,
    b.expr,
  ]);
  rule("895", { monospace: simple("monospace"), expr: sequence("expr") }, (b) => [
    b.monospace,
    ...asArray(b.expr),
  ]);
  rule("900", { factor: sequence("factor"), expr: simple("expr") }, (b) => [
    ...asArray(b.factor),
    b.expr,
  ]);
  rule("905", { factor: sequence("factor"), operand: simple("operand") }, (b) => [
    ...asArray(b.factor),
    b.operand,
  ]);
  rule("910", { mini_sub: simple("mini_sub"), expr: simple("expr") }, (b) => [b.mini_sub, b.expr]);
  rule("915", { mini_sub: simple("mini_sub"), expr: sequence("expr") }, (b) => [
    b.mini_sub,
    ...asArray(b.expr),
  ]);
  rule("935", { unary_function: simple("unary_function"), expr: simple("expr") }, (b) => [
    b.unary_function,
    b.expr,
  ]);
  rule("940", { unary_function: simple("unary_function"), expr: sequence("expr") }, (b) => [
    b.unary_function,
    ...asArray(b.expr),
  ]);
  rule("950", { table: simple("table"), expr: sequence("expr") }, (b) => [
    b.table,
    ...asArray(b.expr),
  ]);
  rule("955", { table: simple("table"), expr: simple("expr") }, (b) => [b.table, b.expr]);

  // INTENT (`:960`): the body after `ⓘ` arrives as one parsed expression whose
  // `parameter_two` list is MUTATED — its first element is shifted off to
  // become the intent's name, the rest is what the intent wraps. Ruby's
  // `Array#shift` on a non-array raises `NoMethodError`.
  rule("960", { intent: simple("intent"), intent_expr: simple("expr") }, (b) => {
    const list = fieldOf(b.expr, "parameterTwo");
    if (!Array.isArray(list)) {
      throw new TypeError(
        "unicodemath transform: shift on a non-array (Ruby raises NoMethodError)",
      );
    }
    const intentString = list.shift();
    return newIntent(filterValues(list), intentString);
  });

  // `:969`/`:977`: a bare `over`/`under` operator carrying only a script — the
  // `Overset`/`Underset` is built with the script as `parameter_one` and NO
  // `parameter_two`, which `:1019`/`:1116` later fill in from the base.
  rule("969", { over: simple("over"), sup_script: simple("sup_script") }, (b) =>
    newOverset(unfencedValue(b.sup_script, true), null),
  );
  rule("977", { under: simple("under"), sub_script: simple("sub_script") }, (b) =>
    newUnderset(unfencedValue(b.sub_script, true), null),
  );

  rule("1019", { base: simple("base"), sub: simple("sub") }, (b) => {
    const base = b.base;
    const sub = b.sub;
    if (BINARY_FUNCTION_NAMES.has(className(base)) && !rubyTruthy(fieldOf(base, "parameterOne"))) {
      setField(
        base,
        "parameterOne",
        className(sub) === "underset" ? fieldOf(sub, "parameterOne") : unfencedValue(sub, true),
      );
      return base;
    }
    if (className(sub) === "underset") {
      setField(sub, "parameterTwo", base);
      return sub;
    }
    if (isA(base, IS_POWER) && baseIsPrime(base)) {
      return newPowerBase(fieldOf(base, "parameterOne"), sub, fieldOf(base, "parameterTwo"));
    }
    const undersetBracket =
      isA(base, IS_UNDERSET) &&
      HORIZONTAL_BRACKETS_INVERTED.has(rubyToS(draftValue(fieldOf(base, "parameterOne"))));
    const ubraceLiteral =
      className(base) === "ubrace" && !isA(fieldOf(base, "parameterOne"), IS_FORMULA);
    if (undersetBracket || ubraceLiteral) {
      return newUnderset(unfencedValue(sub, true), base);
    }
    return newBase(base, unfencedValue(sub, true));
  });

  rule("1097", { root_symbol: simple("root_symbol"), first_value: simple("first_value") }, (b) => {
    const value = unfencedValue(b.first_value, true);
    if (textEquals(b.root_symbol, "&#x221b;") || textEquals(b.root_symbol, "\\cbrt")) {
      return newRoot(newNumber("3"), value);
    }
    if (textEquals(b.root_symbol, "&#x221c;") || textEquals(b.root_symbol, "\\qdrt")) {
      return newRoot(newNumber("4"), value);
    }
    return newSqrt(value);
  });

  rule("1116", { base: simple("base"), sup: simple("sup") }, (b) => {
    const base = b.base;
    const sup = b.sup;
    if (className(sup) === "overset" && !rubyTruthy(fieldOf(sup, "parameterTwo"))) {
      setField(sup, "parameterTwo", unfencedValue(base, true));
      return sup;
    }
    if (BINARY_FUNCTION_NAMES.has(className(base)) && !rubyTruthy(fieldOf(base, "parameterOne"))) {
      setField(base, "parameterTwo", unfencedValue(sup, true));
      return base;
    }
    const oversetBracket =
      isA(base, IS_OVERSET) &&
      HORIZONTAL_BRACKETS_INVERTED.has(rubyToS(draftValue(fieldOf(base, "parameterOne"))));
    if (oversetBracket || className(base) === "obrace") {
      return newOverset(unfencedValue(sup, true), base);
    }
    return newPower(base, unfencedValue(sup, true));
  });

  rule("1173", { unary_sub_sup: simple("sub_sup"), first_value: simple("first_value") }, (b) => {
    const subSup = b.sub_sup;
    if (isA(subSup, IS_UNARY_FUNCTION)) {
      const inner = fieldOf(subSup, "parameterOne");
      setField(inner, "parameterOne", b.first_value);
      return subSup;
    }
    return newFormula([subSup, b.first_value]);
  });

  rule("1193", { color_value: simple("color"), first_value: simple("first_value") }, (b) =>
    newColor(newBareSymbol(b.color), b.first_value),
  );

  rule(
    "1209",
    { unary_arg_functions: simple("function"), first_value: simple("first_value") },
    (b) => {
      const value = unfencedValue(b.first_value, true);
      if (textEquals(b.function, "abs") || textEquals(b.function, "&#x249c;")) return newAbs(value);
      const text = rubyToS(b.function);
      const unary = UNARY_ARG_FUNCTIONS_INVERTED.get(text) ?? text;
      return newMenclose(UNICODEMATH_MENCLOSE_FUNCTIONS.get(unary) ?? null, value);
    },
  );

  // COLOR/ENCLOSE/PHANTOM (slice C). `:1201` is `:1193`'s SEQUENCE twin.
  rule("1201", { color_value: simple("color"), first_value: sequence("first_value") }, (b) =>
    newColor(newBareSymbol(b.color), filterValues(b.first_value)),
  );

  // `unary_symbols` is one of `PHANTOM_SYMBOLS`' seven names (a `Phantom`
  // and/or an `Mpadded`, built in the hash's own order, the `Phantom` wrapping
  // whatever the loop built before it) or else an `Menclose` notation.
  rule("1224", { unary_symbols: simple("unary"), first_value: simple("first_value") }, (b) => {
    const text = rubyToS(b.unary);
    const unarySymbol = UNARY_SYMBOLS_INVERTED.get(text) ?? text;
    const steps = UNICODEMATH_PHANTOM_FUNCTIONS.get(unarySymbol);
    if (steps !== undefined) {
      let newValue: unknown = null;
      for (const [functionName, attributes] of steps) {
        if (functionName === "phantom" && attributes !== false) {
          newValue = newPhantom(unfencedValue(newValue === null ? b.first_value : newValue, true));
        } else if (functionName === "mpadded") {
          newValue = newMpadded(
            unfencedValue(b.first_value, true),
            attributeValue(steps) as NodeOptions,
          );
        }
      }
      return newValue;
    }
    const notation =
      UNICODEMATH_MENCLOSE_FUNCTIONS.get(text) ?? UNICODEMATH_MENCLOSE_FUNCTIONS.get(unarySymbol);
    return newMenclose(notation ?? null, unfencedValue(b.first_value, true));
  });

  rule("1252", { backcolor_value: simple("color"), first_value: simple("first_value") }, (b) =>
    newColor(newBareSymbol(b.color), b.first_value, { backgroundcolor: true }),
  );
  rule("1261", { backcolor_value: simple("color"), first_value: sequence("first_value") }, (b) =>
    newColor(newBareSymbol(b.color), filterValues(b.first_value), { backgroundcolor: true }),
  );
  rule("1270", { rect_value: simple("mask"), first_value: sequence("first_value") }, (b) =>
    newMenclose(enclosureAttrs(rubyToI(rubyToS(b.mask))), unfencedValue(b.first_value, true)),
  );
  rule("1278", { rect_value: simple("mask"), first_value: simple("first_value") }, (b) =>
    newMenclose(enclosureAttrs(rubyToI(rubyToS(b.mask))), unfencedValue(b.first_value, true)),
  );

  // DECORATION (`transform.rb:1286`-`:1491`): `hbracket_class` builds
  // `Obrace`/`Ubrace`/`Overset`/`Underset` from the eight `HORIZONTAL_
  // BRACKETS` characters, and `overlay_after`/`overlay_before`/`below_after`
  // build `Overset`/`Underset`/`Menclose` from a following or leading
  // combining diacritic. See the module header for why this family was
  // deferred through the first three increments, and `:81`/`:88`/`:94`
  // above for the wrapper unwraps every one of these five needs to fire.
  //
  // `:1286`/`:1315`/`:1344`/`:1375` share one body up to a single
  // difference: `:1344`'s `Ubrace` branch re-applies `unfenced_value` to
  // the `Base`'s `parameter_one` before wrapping it, the other three pass it
  // through as-is. Transcribed as measured, not reconciled.
  const hbracketDecoration = (hbrack: unknown, rawValue: unknown, unfenceUbraceInner: boolean) => {
    const value = unfencedValue(rawValue, true);
    if (textEquals(hbrack, "&#x23de;")) return newObrace(value);
    if (textEquals(hbrack, "&#x23df;")) {
      if (
        isDraft(value) &&
        value.kind === "base" &&
        !isA(fieldOf(value, "parameterOne"), IS_FORMULA)
      ) {
        const inner = fieldOf(value, "parameterOne");
        return newUnderset(
          fieldOf(value, "parameterTwo"),
          newUbrace(unfenceUbraceInner ? unfencedValue(inner, true) : inner),
        );
      }
      return newUbrace(value);
    }
    // `Constants::HORIZONTAL_BRACKETS[hbrack.to_sym] || hbrack` and
    // `Constants::UNDER_HORIZONTAL_BRACKETS[hbrack.to_sym] || .key(hbrack)`:
    // `hbrack` can be EITHER shape here — the entity `opHbracket` captures
    // directly, or the bracket NAME `opHbracketPrefixed` captures behind a
    // `\` prefix (`grammar.ts:630`-`:631`), both funnelled through the same
    // `hbracket_class` key. `hbrack.to_sym` only resolves when `hbrack` is a
    // NAME, so the first disjunct of each Ruby expression is the name-form
    // lookup and the second is the pass-through for an already-ENTITY
    // `hbrack`.
    const hbrackText = rubyToS(hbrack);
    const bracketEntity = UNICODEMATH_HORIZONTAL_BRACKETS.get(hbrackText) ?? hbrack;
    const bracketSymbol = newBareSymbol(bracketEntity);
    return UNICODEMATH_UNDER_HORIZONTAL_BRACKETS.has(hbrackText) ||
      UNDER_HORIZONTAL_BRACKETS_VALUES.has(hbrackText)
      ? newUnderset(bracketSymbol, value)
      : newOverset(bracketSymbol, value);
  };

  rule("1286", { hbracket_class: simple("hbrack"), first_value: simple("first_value") }, (b) =>
    hbracketDecoration(b.hbrack, b.first_value, false),
  );
  rule("1315", { hbracket_class: simple("hbrack"), first_value: sequence("first_value") }, (b) =>
    hbracketDecoration(b.hbrack, b.first_value, false),
  );
  rule(
    "1344",
    { hbracket_class: simple("hbrack"), scripted_first_value: simple("scripted_first_value") },
    (b) => hbracketDecoration(b.hbrack, b.scripted_first_value, true),
  );
  // `:1375` (`hbracket_class` simple / `scripted_first_value` SEQUENCE) is
  // NOT registered: every `scripted_first_value` shape that would reach it
  // needs a `{base:, sub:, sup:}` three-key hash or a `{base:, sub:
  // sequence}` two-key one, and this slice's `:1019`/`:1116` are `simple`/
  // `simple` only, so nothing this port carries can ever bind it — measured
  // by testing several `subsup_exp`, `mini_sub_sup` and `pre_script` inputs,
  // every one of which hit that gap before `hbracket_class` did.
  // `transform-coverage.spec.ts` refuses an unfired rule on principle (the
  // slice is defined by what fires, not by what looks portable), so the
  // choice here is the same one FRACTION's own header makes for its ten
  // `atoms`-blocked call sites: transcribe the fact in prose, register
  // nothing.

  // `:1420`: the only DECORATION rule whose `first_value` is a SEQUENCE —
  // `Array#pop` MUTATES that sequence, taking its last element as the
  // overlaid value and leaving the rest as the prefix `Formula.new` folds
  // the built overlay node onto.
  rule("1420", { first_value: sequence("first_value"), overlay_after: simple("overlay") }, (b) => {
    const notation = UNICODEMATH_OVERLAYS_NOTATIONS.get(rubyToS(b.overlay));
    const first = asArray(b.first_value);
    const overlayValue = unfencedValue(first.pop(), true);
    const overlayObject =
      notation === "mover" || textEquals(b.overlay, "&#x304;")
        ? newOverset(symbolsClass(b.overlay), overlayValue, { accent: true })
        : newMenclose(notation ?? null, overlayValue);
    first.push(overlayObject);
    return newFormula(first);
  });

  rule("1447", { first_value: simple("first_value"), overlay_after: simple("overlay") }, (b) => {
    const notation = UNICODEMATH_OVERLAYS_NOTATIONS.get(rubyToS(b.overlay));
    const overlayValue = unfencedValue(b.first_value, true);
    return notation === "mover" || textEquals(b.overlay, "&#x304;")
      ? newOverset(symbolsClass(b.overlay), overlayValue, { accent: true })
      : newMenclose(notation ?? null, overlayValue);
  });

  rule("1473", { overlay_before: simple("overlay"), first_value: simple("first_value") }, (b) => {
    const notation = UNICODEMATH_OVERLAYS_NOTATIONS.get(rubyToS(b.overlay));
    const overlayValue = unfencedValue(b.first_value, true);
    return notation === "mover"
      ? newOverset(symbolsClass(b.overlay), overlayValue, { accent: true })
      : newMenclose(notation ?? null, overlayValue);
  });

  rule("1491", { below_after: simple("overlay"), first_value: simple("first_value") }, (b) => {
    const notation = UNICODEMATH_BELOWS_NOTATIONS.get(rubyToS(b.overlay));
    const overlayValue = unfencedValue(b.first_value, true);
    return notation === "munder"
      ? newUnderset(symbolsClass(b.overlay), overlayValue, { accent: true })
      : newMenclose(notation ?? null, overlayValue);
  });

  // RELATION/OPERATOR: `x'`'s prime — `first_value` carrying a trailing
  // `prime_accent_symbols`, wrapped in `Power` the same way `updatedPrimes`
  // already builds every OTHER prime this file carries (`accentValue`
  // above).
  rule("1412", { first_value: simple("first_value"), prime_accent_symbols: simple("prime") }, (b) =>
    newPower(unfencedValue(b.first_value, true), updatedPrimes(b.prime)),
  );

  // ROOT/PRIME leftovers: `:1404`/`:1506` are `:1412`'s twins for a SEQUENCE
  // `prime_accent_symbols` and a SEQUENCE `first_value` (`x\prime\prime`,
  // `ab''`); `:1530`/`:1538` are `:1522`'s siblings for the other
  // `first_value`/`second_value` shape pairs.
  rule(
    "1404",
    { first_value: simple("first_value"), prime_accent_symbols: sequence("prime") },
    (b) => newPower(unfencedValue(b.first_value, true), updatedPrimes(b.prime)),
  );
  rule(
    "1506",
    { first_value: sequence("first_value"), prime_accent_symbols: simple("prime") },
    (b) => newPower(unfencedValue(b.first_value, true), updatedPrimes(b.prime)),
  );

  rule(
    "1522",
    { first_value: simple("first_value"), second_value: sequence("second_value") },
    (b) => newRoot(b.first_value, unfencedValue(b.second_value, true)),
  );

  rule("1530", { first_value: simple("first_value"), second_value: simple("second_value") }, (b) =>
    newRoot(b.first_value, unfencedValue(b.second_value, true)),
  );

  rule(
    "1538",
    { first_value: sequence("first_value"), second_value: sequence("second_value") },
    (b) => newRoot(filterValues(b.first_value), unfencedValue(b.second_value, true)),
  );

  rule("1547", { unary_functions: simple("unary"), first_value: simple("first_value") }, (b) => {
    if (UNDEF_UNARY_FUNCTIONS.has(rubyToS(b.unary))) {
      return newFormula([symbolsClass(b.unary), b.first_value]);
    }
    if (textEquals(b.unary, "mod")) return newMod(null, b.first_value);
    return buildClass(b.unary, b.first_value);
  });

  // `phantom_value` (a mask before `&`) builds an `Mpadded` whose option is the
  // mask text.
  rule("1561", { phantom_value: simple("value"), first_value: simple("first_value") }, (b) =>
    newMpadded(b.first_value, { mask: rubyToS(b.value) }),
  );

  // TABLE continued: the eight `tr`/`trs` and `td`/`tds` combinators
  // (`:1569`-`:1604`) that fold a row (or cell) onto a growing sequence of
  // them — the SIMPLE/SIMPLE pair prepends a single item, SIMPLE/SEQUENCE and
  // SEQUENCE/SIMPLE concatenate onto the front or wrap the first onto an
  // already-built rest, and SEQUENCE/SEQUENCE concatenates both. Ruby's
  // `[x] + xs` is a plain array concatenation, spelled `[x, ...asArray(xs)]`
  // here the same way `:501`/`:506`/`:825`/`:865`/`:870` above already do.
  rule("1569", { tr: simple("tr"), trs: simple("trs") }, (b) => [newTr([b.tr]), b.trs]);
  rule("1574", { td: simple("td"), tds: simple("tds") }, (b) => [newTd([b.td]), b.tds]);
  rule("1579", { tr: simple("tr"), trs: sequence("trs") }, (b) => [
    newTr([b.tr]),
    ...asArray(b.trs),
  ]);
  rule("1584", { tr: sequence("tr"), trs: simple("trs") }, (b) => [newTr(b.tr), b.trs]);
  rule("1589", { tr: sequence("tr"), trs: sequence("trs") }, (b) => [
    newTr(b.tr),
    ...asArray(b.trs),
  ]);
  rule("1594", { td: simple("td"), tds: sequence("tds") }, (b) => [
    newTd([b.td]),
    ...asArray(b.tds),
  ]);
  rule("1599", { td: sequence("td"), tds: sequence("tds") }, (b) => [
    newTd(b.td),
    ...asArray(b.tds),
  ]);
  rule("1604", { td: sequence("td"), tds: simple("tds") }, (b) => [newTd(b.td), b.tds]);

  rule("1609", { numerator: simple("numerator"), denominator: simple("denominator") }, (b) =>
    fractions(b.numerator, b.denominator),
  );

  // FRACTION, second increment (`transform.rb:1614`-`:2377`): `:1609` above is
  // the plain, option-free shape the corpus already reaches; these six are its
  // option-carrying siblings, each still `numerator: simple, denominator:
  // simple` so none needs the `atoms`/`recursive_numerator` combinator the
  // other ten `Utility.fractions` call sites depend on (deferred; see the
  // header).
  rule(
    "1614",
    { mini_numerator: simple("numerator"), mini_denominator: simple("denominator") },
    (b) => fractions(b.numerator, b.denominator, { displaystyle: false }),
  );

  // TABLE concluded — the three `matrixs` rules (`:1649`, `:1670`, `:1691`),
  // one per shape `array`/`identity_matrix_number` can take once `:1569`-
  // `:1604` above have folded a row sequence, a bare row, or neither. All
  // three share `buildMatrixTable`'s branch; `:1670`'s own body wraps its
  // SIMPLE `array` in a one-element array before that branch runs, exactly as
  // `transform.rb:1671`-`:1710` does at each of its three call sites.
  rule("1649", { matrixs: simple("matrixs"), array: sequence("array") }, (b) =>
    buildMatrixTable(b.matrixs, b.array),
  );
  rule("1670", { matrixs: simple("matrixs"), array: simple("array") }, (b) =>
    buildMatrixTable(b.matrixs, [b.array]),
  );
  rule("1691", { matrixs: simple("matrixs"), identity_matrix_number: simple("number") }, (b) =>
    buildMatrixTable(b.matrixs, identityMatrix(rubyToI(rubyToS(b.number)))),
  );

  rule("1716", { factor: simple("factor"), sup_exp: simple("sup_exp") }, (b) => [
    b.factor,
    b.sup_exp,
  ]);
  rule("1721", { factor: simple("factor"), sub_exp: simple("sub_exp") }, (b) => [
    b.factor,
    b.sub_exp,
  ]);
  rule("1726", { factor: simple("factor"), pre_script: simple("pre_script") }, (b) => [
    b.factor,
    b.pre_script,
  ]);
  rule("1731", { factor: simple("factor"), mini_sup: simple("mini_sup") }, (b) => [
    b.factor,
    b.mini_sup,
  ]);
  rule("1736", { mini_sup: simple("mini_sup"), expr: simple("expr") }, (b) => [b.mini_sup, b.expr]);
  rule("1741", { mini_sup: simple("mini_sup"), expr: sequence("expr") }, (b) => [
    b.mini_sup,
    ...asArray(b.expr),
  ]);
  rule("1791", { frac: simple("frac"), expr: simple("expr") }, (b) => [b.frac, b.expr]);
  rule("1796", { frac: simple("frac"), exp: simple("exp") }, (b) => [b.frac, b.exp]);
  rule("1806", { expr: simple("expr"), func_expr: simple("func_expr") }, (b) => [
    b.expr,
    b.func_expr,
  ]);
  rule("1811", { expr: simple("expr"), func_expr: sequence("func_expr") }, (b) => [
    b.expr,
    ...asArray(b.func_expr),
  ]);
  rule("1816", { frac: simple("frac"), expr: sequence("expr") }, (b) => [
    b.frac,
    ...asArray(b.expr),
  ]);
  rule("1821", { frac: simple("frac"), exp: sequence("exp") }, (b) => [b.frac, ...asArray(b.exp)]);
  rule("1826", { nary: simple("nary"), expr: sequence("expr") }, (b) => [
    b.nary,
    ...asArray(b.expr),
  ]);
  rule("1831", { nary: simple("nary"), expr: simple("expr") }, (b) => [b.nary, b.expr]);

  // ATOMS meeting `exclamation_symbols` (`!`/`!!`, `grammar.ts:705`) directly
  // rather than through `atoms`.
  rule("1851", { atom: simple("atom"), exclamation_symbol: simple("exclamation_symbol") }, (b) => [
    b.atom,
    symbolsClass(b.exclamation_symbol),
  ]);

  rule("1861", { nary_sub_sup: simple("subsup_exp"), naryand: simple("naryand") }, (b) => {
    const subsup = b.subsup_exp;
    if (isA(subsup, IS_TERNARY_FUNCTION)) {
      setField(subsup, "parameterThree", b.naryand);
      return subsup;
    }
    if (isA(subsup, IS_NARY)) {
      setField(subsup, "parameterFour", b.naryand);
      return subsup;
    }
    return newFormula([subsup, b.naryand]);
  });
  // NARY continued — `:1861`'s SEQUENCE-`naryand` twin: the ternary branch
  // is identical, the NARY branch only fills `parameterFour` when it is
  // still empty (the gem's own asymmetry with `:1861`, transcribed as
  // measured, not reconciled), and the fallback builds a fresh `Nary` from
  // the un-mutated `subsup_exp`'s own three parameters rather than wrapping
  // it in a `Formula` the way `:1861`'s fallback does.
  rule("1874", { nary_sub_sup: simple("subsup_exp"), naryand: sequence("naryand") }, (b) => {
    const subsup = b.subsup_exp;
    if (isA(subsup, IS_TERNARY_FUNCTION)) {
      setField(subsup, "parameterThree", filterValues(b.naryand));
      return subsup;
    }
    if (isA(subsup, IS_NARY)) {
      if (fieldOf(subsup, "parameterFour") === null) {
        setField(subsup, "parameterFour", filterValues(b.naryand));
      }
      return subsup;
    }
    return newNary(
      fieldOf(subsup, "parameterOne"),
      fieldOf(subsup, "parameterTwo"),
      fieldOf(subsup, "parameterThree"),
      filterValues(b.naryand),
    );
  });

  rule("1968", { nary_class: simple("nary_class"), naryand: simple("naryand") }, (b) => {
    const name = naryFunctionName(b.nary_class);
    if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
      const naryValue =
        className(b.naryand) === "underset"
          ? fieldOf(b.naryand, "parameterTwo")
          : unfencedValue(b.naryand, true);
      return buildClass(name, null, null, naryValue);
    }
    return newNary(symbolsClass(name), null, null, b.naryand);
  });

  // NARY continued — `sub`/`sup` alone (no `naryand`), the shape a bare
  // limit like `∑_(i=1)` reaches. `:1953`'s `sup` calls `get_class` with no
  // `NARY_CLASSES` branch at all — every name it sees there is measured to
  // already be a registered class, same as `:175` above; `:1931`'s simple
  // `sub` is the one with the branch, `:2806`'s own shape one key short.
  // `:1919`, the SEQUENCE-`sub` twin, is deferred with the rest of the
  // SEQUENCE-taking NARY rules below.
  rule("1931", { nary_class: simple("nary_class"), sub: simple("sub") }, (b) => {
    const name = naryFunctionName(b.nary_class);
    if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
      const naryValue =
        className(b.sub) === "underset"
          ? fieldOf(b.sub, "parameterOne")
          : unfencedValue(b.sub, true);
      return buildClass(name, naryValue);
    }
    return newNary(symbolsClass(name), unfencedValue(b.sub, true), undefined, undefined);
  });
  rule("1953", { nary_class: simple("nary_class"), sup: simple("sup") }, (b) => {
    const name = naryFunctionName(b.nary_class);
    const naryValue =
      className(b.sup) === "overset" ? fieldOf(b.sup, "parameterOne") : unfencedValue(b.sup, true);
    return buildClass(name, null, naryValue);
  });

  // MULTISCRIPT (`transform.rb:1992`-`:3978`, thirteen rules counting `:57`
  // above): every prescript expression `Math::Function::Multiscript` — base
  // plus prescript sub/superscript arrays, and optionally a real trailing
  // sub/sup the grammar folds into the `PowerBase` `p1` carries. All twelve
  // constructors below share that shape; only `unfenced_value` and the
  // SUB_DIGITS table (`:2971`) are new, both already established.
  rule("1992", { pre_supscript: simple("pre_sup"), base: simple("base") }, (b) =>
    newMultiscript(newPowerBase(b.base), [], [b.pre_sup]),
  );
  rule("2001", { pre_subscript: simple("pre_sub"), base: simple("base") }, (b) =>
    newMultiscript(newPowerBase(b.base), [b.pre_sub], []),
  );

  rule(
    "2085",
    { char: simple("char"), diacritics: simple("diacritics"), number: simple("number") },
    (b) => [b.char, b.diacritics, newNumber(b.number)],
  );
  rule(
    "2091",
    { char: simple("char"), diacritics: simple("diacritics"), alphanumeric: simple("alpha") },
    (b) => [b.char, b.diacritics, symbolsClass(b.alpha)],
  );

  // --- three- and four-key rules (transform.rb:2103-3477) ----------------

  rule(
    "2029",
    { factor: simple("factor"), mini_sup: simple("mini_sup"), expr: sequence("expr") },
    (b) => [b.factor, b.mini_sup, ...asArray(b.expr)],
  );
  rule("2103", { base: simple("base"), sup: simple("sup"), sub: simple("sub") }, (b) => {
    const underover = ["underset", "overset"];
    if (underover.includes(className(b.sub)) && underover.includes(className(b.sup))) {
      return newUnderover(b.base, fieldOf(b.sub, "parameterOne"), fieldOf(b.sup, "parameterOne"));
    }
    return newPowerBase(b.base, unfencedValue(b.sub, true), unfencedValue(b.sup, true));
  });

  // SIZE OVERRIDE: `Ⅎ` plus a size letter on a base's subscript; the size is
  // `SIZE_OVERRIDES_SYMBOLS[letter]`, nil when the letter is not a key.
  rule(
    "2122",
    { base: simple("base"), size_overrides: simple("size_overrides"), sub_script: sequence("sub") },
    (b) =>
      newBase(b.base, filterValues(b.sub), {
        size: UNICODEMATH_SIZE_OVERRIDES.get(rubyToS(b.size_overrides)) ?? null,
      }),
  );
  rule(
    "2132",
    { base: simple("base"), size_overrides: simple("size_overrides"), sub_script: simple("sub") },
    (b) =>
      newBase(b.base, unfencedValue(b.sub, true), {
        size: UNICODEMATH_SIZE_OVERRIDES.get(rubyToS(b.size_overrides)) ?? null,
      }),
  );

  // FRACTION continued — `atop` (`\atop`/`&#xa6;`) and `choose` (`\choose`/
  // `&#x249e;`) each add one key to the same `numerator: simple, denominator:
  // simple` shape; `:2203`, `atop`'s SEQUENCE-numerator twin, is deferred with
  // the rest. `choose` alone builds `Fenced`, not `Frac` directly: the gem
  // wraps the Frac in round parens it constructs with no lookup
  // (`Math::Symbols::Paren::Lround.new`/`Rround.new`), which `LROUND_ID`/
  // `RROUND_ID` (declared with the other named-symbol ids above) name here.
  rule(
    "2197",
    {
      numerator: simple("numerator"),
      atop: simple("atop"),
      denominator: simple("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { linethickness: "0" }),
  );

  rule(
    "2209",
    {
      numerator: simple("numerator"),
      choose: simple("choose"),
      denominator: simple("denominator"),
    },
    (b) =>
      newFenced(
        newSymbolOfClass(LROUND_ID),
        [fractions(b.numerator, b.denominator, { linethickness: "0", choose: true })],
        newSymbolOfClass(RROUND_ID),
      ),
  );

  rule(
    "2221",
    {
      arg: simple("arg"),
      arg_arguments: simple("args"),
      first_value: simple("first_value"),
    },
    (b) => binaryDraft("binaryFunction", "Arg", b.first_value, b.args),
  );

  rule(
    "2227",
    { whole: simple("whole"), decimal: simple("decimal"), fractional: simple("fractional") },
    (b) =>
      newNumber(
        htmlEntityToUnicode(
          `${rubyToS(draftValue(b.whole))}${rubyToS(b.decimal)}${rubyToS(draftValue(b.fractional))}`,
        ),
      ),
  );

  rule(
    "2233",
    { factor: simple("factor"), operand: sequence("operand"), expr: simple("expr") },
    (b) => [b.factor, ...asArray(b.operand), b.expr],
  );
  rule(
    "2239",
    { factor: simple("factor"), operand: sequence("operand"), expr: sequence("expr") },
    (b) => [b.factor, ...asArray(b.operand), ...asArray(b.expr)],
  );
  rule(
    "2257",
    { factor: sequence("factor"), operand: simple("operand"), expr: sequence("expr") },
    (b) => [...asArray(b.factor), b.operand, ...asArray(b.expr)],
  );
  rule(
    "2263",
    { factor: sequence("factor"), operand: sequence("operand"), expr: simple("expr") },
    (b) => [...asArray(b.factor), ...asArray(b.operand), b.expr],
  );
  // RELATION/OPERATOR: `factor`+`operand`(both simple)+`expr`, the
  // three-key sibling of `:735`/`:745` above, reached once a relation chain
  // grows a third element — `a≤b`'s `expr` sequence twin (`SEQUENCE`) and
  // its simple twin, folded the same `[x, y, ...zs]` / `[x, y, z]` way.
  rule(
    "2269",
    { factor: simple("factor"), operand: simple("operand"), expr: sequence("expr") },
    (b) => [b.factor, b.operand, ...asArray(b.expr)],
  );
  rule(
    "2293",
    { factor: simple("factor"), sup_exp: simple("sup_exp"), expr: simple("expr") },
    (b) => [b.factor, b.sup_exp, b.expr],
  );
  rule(
    "2299",
    { factor: simple("factor"), sub_exp: simple("sub_exp"), expr: simple("expr") },
    (b) => [b.factor, b.sub_exp, b.expr],
  );
  rule(
    "2305",
    { factor: simple("factor"), sup_exp: simple("sup_exp"), expr: sequence("expr") },
    (b) => [b.factor, b.sup_exp, ...asArray(b.expr)],
  );
  rule(
    "2311",
    { factor: simple("factor"), sub_exp: simple("sub_exp"), expr: sequence("expr") },
    (b) => [b.factor, b.sub_exp, ...asArray(b.expr)],
  );
  rule(
    "2317",
    { factor: simple("factor"), operand: simple("operand"), expr: simple("expr") },
    (b) => [b.factor, b.operand, b.expr],
  );

  rule(
    "2329",
    { factor: simple("factor"), expr: simple("expr"), expression: simple("expression") },
    (b) => [b.factor, b.expr, b.expression],
  );
  // FRACTION concluded — `bevelled` (`\sdiv`/`\sdivide`/`\sfrac`/`&#x2044;`),
  // `ldiv` (`\ldiv`/`&#x2215;`) and `no_display_style` (`\ndiv`/`\oslash`/
  // `&#x2298;`), each still `numerator: simple, denominator: simple`. The last
  // one's options are NOT `{no_display_style: false}` despite the key name:
  // `transform.rb:2377` passes `{displaystyle: false}`, and only its
  // SEQUENCE-denominator twin `:2371` (deferred) passes the differently-named
  // option — measured, not reconciled, because the gem itself is inconsistent
  // between the two.
  rule(
    "2347",
    {
      numerator: simple("numerator"),
      bevelled: simple("bevelled"),
      denominator: simple("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { bevelled: true }),
  );

  rule(
    "2353",
    { numerator: simple("numerator"), ldiv: simple("ldiv"), denominator: simple("denominator") },
    (b) => fractions(b.numerator, b.denominator, { ldiv: true }),
  );

  rule(
    "2377",
    {
      numerator: simple("numerator"),
      no_display_style: simple("no_display_style"),
      denominator: simple("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { displaystyle: false }),
  );

  rule(
    "2383",
    { fonts: simple("fonts"), relational_symbols: simple("symbols"), expr: simple("expr") },
    (b) => [b.fonts, symbolsClass(b.symbols), b.expr],
  );

  // `Utility.unfenced_value(operand, ...)` on the first line is computed and
  // DISCARDED — a statement whose value nothing reads (`transform.rb:2439`;
  // 2436-2438 are the rule's three-line header).
  // It is transcribed because it can still raise; the `Fenced` below is built
  // from the untouched `operand` either way.
  rule(
    "2436",
    { opener: simple("opener"), operand: simple("operand"), closer: simple("closer") },
    (b) => {
      if (textEquals(b.opener, "|") || textEquals(b.closer, "|")) {
        unfencedValue(b.operand, true);
      }
      return newFenced(parenClass(b.opener), [b.operand], parenClass(b.closer));
    },
  );

  // RELATION/OPERATOR: `:2436`'s SEQUENCE-`operand` twin — `e^(iπ)`'s
  // parenthesised exponent, which already flattened to a multi-element run
  // before reaching the fence, so `operand` is passed through as-is rather
  // than wrapped in a fresh one-element array. No `"|"` special case: the
  // gem's own `:2447` does not carry one either.
  rule(
    "2447",
    { opener: simple("opener"), operand: sequence("operand"), closer: simple("closer") },
    (b) => newFenced(parenClass(b.opener), b.operand, parenClass(b.closer)),
  );

  rule(
    "2475",
    { open_paren: simple("open_paren"), frac: simple("frac"), close_paren: simple("close_paren") },
    (b) => newFenced(parenClass(b.open_paren), [b.frac], parenClass(b.close_paren)),
  );

  rule(
    "2619",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      close_paren: simple("close_paren"),
    },
    (b) => {
      const bar = textEquals(b.open_paren, "|") || textEquals(b.close_paren, "|");
      const newFactor = bar ? unfencedValue(b.factor, true) : b.factor;
      return newFenced(parenClass(b.open_paren), [newFactor], parenClass(b.close_paren));
    },
  );

  rule(
    "2630",
    {
      open_paren: simple("open_paren"),
      sup_exp: simple("sup_exp"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.sup_exp], parenClass(b.close_paren)),
  );

  // ATOMS meeting a bare `operator` and a `frac` directly (`:2787`) and that
  // shape's SEQUENCE-`expr` extension (`:3074`) are deferred with `:30`
  // above: no probed input reached either.

  rule(
    "2806",
    { nary_class: simple("nary_class"), sub: simple("sub"), sup: simple("sup") },
    (b) => {
      const name = naryFunctionName(b.nary_class);
      if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
        const newSub =
          className(b.sub) === "underset"
            ? fieldOf(b.sub, "parameterOne")
            : unfencedValue(b.sub, true);
        const newSup =
          className(b.sup) === "overset"
            ? fieldOf(b.sup, "parameterOne")
            : unfencedValue(b.sup, true);
        return buildClass(name, newSub, newSup);
      }
      return newNary(
        symbolsClass(name),
        unfencedValue(b.sub, true),
        unfencedValue(b.sup, true),
        undefined,
      );
    },
  );

  // NARY continued — `:2806`'s mask-carrying siblings, each adding a `mask`
  // key ahead of `sub`/`sup` and branching on `NARY_CLASSES` membership,
  // building `options` from the bound `Number`'s own `value` field either
  // way. `:2827`/`:2841`/`:2884` and every other SEQUENCE-`sub`-or-`sup`
  // NARY rule are deferred together below, past `:3477`.
  rule(
    "2856",
    { nary_class: simple("nary_class"), mask: simple("mask"), sub: simple("sub") },
    (b) => {
      const name = naryFunctionName(b.nary_class);
      const subValue = isA(b.sub, IS_UNDERSET)
        ? fieldOf(b.sub, "parameterOne")
        : unfencedValue(b.sub, true);
      const options: NodeOptions = { mask: fieldOf(b.mask, "value") };
      if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
        return buildClass(name, subValue, null, null, options);
      }
      return newNary(symbolsClass(name), subValue, null, null, options);
    },
  );
  rule(
    "2911",
    { nary_class: simple("nary_class"), mask: simple("mask"), sup: simple("sup") },
    (b) => {
      const name = naryFunctionName(b.nary_class);
      const supValue = unfencedValue(b.sup, true);
      const options: NodeOptions = { mask: fieldOf(b.mask, "value") };
      if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
        return buildClass(name, null, supValue, null, options);
      }
      return newNary(symbolsClass(name), null, supValue, null, options);
    },
  );

  // MULTISCRIPT continued — a real trailing sub or sup joins the prescript.
  rule(
    "2938",
    { pre_supscript: simple("pre_sup"), base: simple("base"), sub: simple("sub") },
    (b) => newMultiscript(newPowerBase(b.base, b.sub), [], [b.pre_sup]),
  );
  rule(
    "2948",
    { pre_supscript: simple("pre_sup"), pre_subscript: simple("pre_sub"), base: simple("base") },
    (b) => newMultiscript(newPowerBase(b.base), [b.pre_sub], [b.pre_sup]),
  );
  rule(
    "2958",
    { pre_subscript: simple("pre_sub"), base: simple("base"), sub: simple("sub") },
    (b) => newMultiscript(newPowerBase(b.base, unfencedValue(b.sub, true)), [b.pre_sub], []),
  );
  rule(
    "2971",
    { pre_subscript: simple("pre_sub"), base: simple("base"), sub_digits: simple("digits") },
    (b) => newMultiscript(newPowerBase(b.base, subDigitNumber(b.digits)), [b.pre_sub], []),
  );

  rule(
    "3233",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      exp: simple("exp"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.factor, b.exp], parenClass(b.close_paren)),
  );

  rule(
    "3433",
    {
      open_paren: simple("open_paren"),
      sup_exp: simple("sup_exp"),
      exp: sequence("exp"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        parenClass(b.open_paren),
        [b.sup_exp, ...asArray(b.exp)],
        parenClass(b.close_paren),
      ),
  );

  rule(
    "3477",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      exp: sequence("exp"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(parenClass(b.open_paren), [b.factor, ...asArray(b.exp)], parenClass(b.close_paren)),
  );

  // NARY concluded (for this slice; see the module header for the SEQUENCE
  // rules deferred past it) — `mask` plus BOTH a simple `sub` and a simple
  // `sup`, `:2806`'s own shape with a mask added; `Underset`/`Overset`
  // unwrap the same way `:2103`'s underover guard and `:2806` above already
  // do.
  rule(
    "3588",
    {
      nary_class: simple("nary_class"),
      mask: simple("mask"),
      sub: simple("sub"),
      sup: simple("sup"),
    },
    (b) => {
      const name = naryFunctionName(b.nary_class);
      const subValue = isA(b.sub, IS_UNDERSET)
        ? fieldOf(b.sub, "parameterOne")
        : unfencedValue(b.sub, true);
      const supValue = isA(b.sup, IS_OVERSET)
        ? fieldOf(b.sup, "parameterOne")
        : unfencedValue(b.sup, true);
      const options: NodeOptions = { mask: fieldOf(b.mask, "value") };
      if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
        return buildClass(name, subValue, supValue, null, options);
      }
      return newNary(symbolsClass(name), subValue, supValue, null, options);
    },
  );

  // MULTISCRIPT concluded — both a prescript pair and a paren wrap it, in
  // every combination the grammar builds. `unfenced_value` reaches the
  // prescripts themselves only at `:3662`/`:3853`; `:3687`, `:3768`, `:3952`
  // and `:3978` bind `open_paren`/`close_paren` but never read them, exactly
  // as `:2436` reads `operand` past what its own guard already discarded —
  // transcribed rather than tidied.
  rule(
    "3662",
    {
      pre_subscript: simple("pre_sub"),
      pre_supscript: simple("pre_sup"),
      base: simple("base"),
      sub: simple("sub"),
    },
    (b) =>
      newMultiscript(
        newPowerBase(b.base, unfencedValue(b.sub, true)),
        [unfencedValue(b.pre_sub, true)],
        [unfencedValue(b.pre_sup, true)],
      ),
  );
  rule(
    "3687",
    {
      open_paren: simple("open_paren"),
      pre_subscript: simple("pre_sub"),
      close_paren: simple("close_paren"),
      base: simple("base"),
    },
    (b) => newMultiscript(newPowerBase(b.base), [b.pre_sub], []),
  );
  rule(
    "3768",
    {
      open_paren: simple("open_paren"),
      pre_subscript: simple("pre_sub"),
      close_paren: simple("close_paren"),
      base: simple("base"),
      sub: simple("sub"),
    },
    (b) => newMultiscript(newPowerBase(b.base, b.sub), [b.pre_sub], []),
  );
  rule(
    "3853",
    {
      pre_subscript: simple("pre_sub"),
      pre_supscript: simple("pre_sup"),
      base: simple("base"),
      sub: simple("sub"),
      sup: simple("sup"),
    },
    (b) =>
      newMultiscript(
        newPowerBase(b.base, unfencedValue(b.sub, true), unfencedValue(b.sup, true)),
        [unfencedValue(b.pre_sub, true)],
        [unfencedValue(b.pre_sup, true)],
      ),
  );
  // INTENT with parentheses: the quoted argument text (already a `Text`) is the
  // intent's name, the parenthesised expression what it wraps.
  rule(
    "3869",
    {
      intent: simple("intent"),
      open_paren: simple("open_paren"),
      intent_arguments: simple("args"),
      first_value: simple("value"),
      close_paren: simple("close_paren"),
    },
    (b) => newIntent(b.value, b.args),
  );
  rule(
    "3877",
    {
      intent: simple("intent"),
      open_paren: simple("open_paren"),
      intent_arguments: simple("args"),
      first_value: sequence("value"),
      close_paren: simple("close_paren"),
    },
    (b) => newIntent(filterValues(b.value), b.args),
  );

  rule(
    "3952",
    {
      open_paren: simple("open_paren"),
      pre_subscript: simple("pre_sub"),
      pre_supscript: simple("pre_sup"),
      close_paren: simple("close_paren"),
      base: simple("base"),
    },
    (b) => newMultiscript(newPowerBase(b.base), [b.pre_sub], [b.pre_sup]),
  );
  rule(
    "3978",
    {
      open_paren: simple("open_paren"),
      pre_subscript: simple("pre_sub"),
      pre_supscript: simple("pre_sup"),
      close_paren: simple("close_paren"),
      base: simple("base"),
      sub: simple("sub"),
      sup: simple("sup"),
    },
    (b) =>
      newMultiscript(
        newPowerBase(b.base, unfencedValue(b.sub, true), unfencedValue(b.sup, true)),
        [b.pre_sub],
        [b.pre_sup],
      ),
  );

  return { transform: t, fired, ruleIds };
}

/**
 * `paren.is_a?(Slice) ? Utility.symbols_class(paren, ...) : paren` — the guard
 * the seven `Fenced` rules each spell out. It tests `Slice` specifically, not
 * "string-like", so a plain String would pass through unconverted.
 */
function parenClass(paren: unknown): unknown {
  return paren instanceof Slice ? symbolsClass(paren) : paren;
}

/** `node.parameter_x` on a draft; Ruby raises `NoMethodError` on anything else. */
function fieldOf(node: unknown, field: string): unknown {
  if (!isDraft(node)) {
    throw new TypeError(
      `unicodemath transform: ${field} on a ${typeof node} (Ruby raises NoMethodError)`,
    );
  }
  return node.fields[field] ?? null;
}

/**
 * `node.parameter_x = value` — an attribute writer, which exists only where the
 * class declares one. A draft whose measured `initialize` never assigned the
 * ivar still accepts the write, exactly as Ruby's `attr_accessor` does.
 */
function setField(node: unknown, field: string, value: unknown): void {
  if (!isDraft(node)) {
    throw new TypeError(
      `unicodemath transform: ${field}= on a ${typeof node} (Ruby raises NoMethodError)`,
    );
  }
  node.fields[field] = value;
}

/**
 * The one transform the parity suite uses, built once.
 *
 * `buildUnicodemathTransform` stays exported and stays UNmemoized: it returns
 * the firing counters, and `transform-coverage.spec.ts` needs a fresh, zeroed
 * set. Sharing this instance with that suite would let one test's firings
 * satisfy another test's coverage assertion.
 */
let unicodemathTransformInstance: Transform | undefined;

export function unicodemathTransform(): Transform {
  if (unicodemathTransformInstance === undefined) {
    unicodemathTransformInstance = buildUnicodemathTransform().transform;
  }
  return unicodemathTransformInstance;
}

/* =========================================================================
 * 5. Finalization, and the Parser#parse wrapping
 * ---------------------------------------------------------------------- */

/**
 * The node SIGNATURES the GEM's own transform leaves unmatched, so a hash that
 * survives to the model is the gem's behaviour rather than this slice's gap.
 *
 * **A key set is not a signature.** Parslet binds on the matcher kind as well
 * as the key, so whether a rule matches depends on the SHAPE of each value:
 * `{frac:, expr:}` with both values resolved is matched by `transform.rb:1791`,
 * while the same key set with an unresolved hash under `frac` is matched by
 * nothing. An allowlist keyed only by `expr,frac` admitted both, and `x a/b c`
 * — which the gem answers `Formula([Symbol("x"), Frac(a, b), Symbol("c")])` —
 * came back from this port as folded pairs. Each entry below therefore records
 * `key=shape` per key, with `shape` computed exactly as pegkit's `simple` and
 * `sequence` matchers decide.
 *
 * Measured, not reasoned about: every registered block was wrapped on the
 * oracle and every hash that reached `transform_elt` without matching a rule
 * was recorded with its value shapes, over the same 103 corpus strings the
 * fixtures carry. Nine signatures came back, across FIVE inputs:
 *
 *   - `(a)/(+) b` — `close_paren=simple,open_paren=simple,operator=simple`,
 *     `intermediate_exp=other`, `factor=other`,
 *     `denominator=other,numerator=simple`, `expr=simple,frac=other`;
 *   - `a ± b` — `combined_symbols=simple,expr=simple`, `expr=other,factor=simple`;
 *   - the three accent inputs — `accent_symbols=simple`, `first_value=simple`,
 *     which `transform.rb:52` consumes as a `subtree` and never leaves behind.
 *
 * The first two inputs are a GEM BUG, reproduced here rather than fixed: no
 * rule in the 519 has the signature `{combined_symbols: simple, expr: simple}`
 * or `{close_paren:, open_paren:, operator:}`, so the hash survives the
 * transform, `Kernel#Array` in `UnicodeMath::Parser#parse` folds the OUTERMOST
 * one into its `[key, value]` pairs, and
 * `Plurimath::Math.parse("a ± b", :unicode)` returns a `Formula` whose value is
 * `[["factor", Symbol("a")], ["expr", {combined_symbols: "&#xb1;", expr:
 * Symbol("b")}]]` — a tree no renderer can read, returned without raising.
 *
 * **This list is the measured corpus exceptions, not a decision procedure.** A
 * signature's absence does NOT mean the gem matches it: it means no pinned
 * corpus input produced it, so nothing here knows. Anything absent is REFUSED,
 * which is conservative in both directions — it catches a node whose rule this
 * slice has not reached, and it also refuses a handful the gem itself leaves
 * unmatched. Measured example: `±+a` leaves
 * `{combined_symbols=simple, expr=sequence}` unmatched in the gem too, which
 * answers it with folded pairs; this port refuses it. Widening the list is a
 * measurement, never a guess — every entry below came from an oracle trace.
 */
const GEM_UNMATCHED_SIGNATURES: ReadonlySet<string> = new Set([
  "accent_symbols=simple",
  // `f'(x)`: `{accents: {first_value:, prime_accent_symbols:}, expr:}`. `:1412`
  // resolves the accents half to a `Power`; no rule of the 519 has the
  // `accents` + `expr: simple` signature (`transform.rb:341`/`:346` need a
  // SEQUENCE), so the gem returns the folded pairs. Oracle trace fires only
  // `:18 :39 :71 :92 :1412 :2619`.
  "accents=simple,expr=simple",
  // `a·b·c`: the ATOMS combinator's `{atom:, atoms: {atom:, atoms:}}` chain.
  // `:486`/`:496` need `atoms` simple or a sequence, so a nested hash in
  // `atoms` binds neither; the inner `{atom: sequence, atoms: sequence}` pair
  // matches none of `:486`/`:491`/`:496` either.
  "atom=sequence,atoms=sequence",
  "atom=simple,atoms=other",
  "close_paren=simple,open_paren=simple,operator=simple",
  "combined_symbols=simple,expr=simple",
  "denominator=other,numerator=simple",
  "expr=other,factor=simple",
  "expr=simple,frac=other",
  "factor=other",
  "first_value=simple",
  "intermediate_exp=other",
]);

/**
 * What a value would bind as, in pegkit's own terms: `simple` binds anything
 * that is not an array and not a plain hash, `sequence` an array whose every
 * element is such a leaf, and `other` is what neither matcher accepts. Kept in
 * step with `pegkit/transform.ts`'s `isLeaf`/`matches` by mirroring them, and
 * exported so `transform-coverage.spec.ts` can check the mirror against the
 * engine itself rather than against a second copy of this reasoning.
 */
export function shapeOf(value: unknown): "simple" | "sequence" | "other" {
  if (Array.isArray(value)) {
    return value.every((item) => !Array.isArray(item) && !isPlainObject(item))
      ? "sequence"
      : "other";
  }
  return isPlainObject(value) ? "other" : "simple";
}

function signatureOf(hash: Record<string, unknown>): string {
  return Object.entries(hash)
    .map(([key, value]) => `${key}=${shapeOf(value)}`)
    .sort()
    .join(",");
}

/**
 * Refuses a hash the gem would have matched. Both the value walk below and the
 * ROOT wrap in `finalizeUnicodemathParse` go through here — the root used to
 * skip it, because `Kernel#Array` folded the hash into pairs before anything
 * looked at it, so `±` came back as `Formula([["combined_symbols", "&#xb1;"]])`
 * where the gem answers `Formula([Pm])`.
 */
function assertGemLeavesUnmatched(hash: Record<string, unknown>): void {
  const signature = signatureOf(hash);
  if (!GEM_UNMATCHED_SIGNATURES.has(signature)) {
    throw new Error(
      `unicodemath transform: no rule matched {${signature}}; ` +
        "that rule family is not in this slice",
    );
  }
}

/**
 * Finalizes one transformed value into what the immutable model can hold:
 * drafts become `core` nodes, slices become their text (the gem's serializer
 * does the same), arrays are rebuilt around their finalized contents, and a
 * hash the gem also leaves unmatched is kept as a hash — which is what
 * `normalize` does with it too.
 */
function finalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return value.map(finalizeValue);
  if (isDraft(value)) return finalizeDraft(value);
  if (isPlainObject(value)) {
    assertGemLeavesUnmatched(value);
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = finalizeValue(entry);
    return result;
  }
  return value;
}

/**
 * One draft into one immutable node, through the registry's constructor map.
 *
 * Fields are passed by the carrier's shape, so an unassigned ivar stays
 * `undefined` and is omitted by `normalize` — which is where model parity is
 * decided.
 */
function finalizeDraft(draft: UnicodemathDraft, inputString?: string): MathNode {
  const init: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft.fields)) {
    // `options` is a Ruby OPTION hash, not a tree value: every one this slice
    // builds is `{}` (Fenced, Nary, Underset's default) or a flat hash of
    // already-finalized primitives — `{accent: true}` (`unicode_math/
    // utility.rb:51`), and FRACTION's `displaystyle`/`linethickness`/
    // `bevelled`/`ldiv`/`choose`, singly or paired (`:1614`-`:2377`). Routing
    // it through `finalizeValue` would put it in the unmatched-node branch,
    // where none of these key sets is one the gem leaves behind, and it would
    // be refused.
    init[key] = key === "options" ? value : finalizeValue(value);
  }
  if (draft.identity !== undefined) init[draft.kind === "symbol" ? "id" : "name"] = draft.identity;
  if (inputString !== undefined) init.inputString = inputString;
  const ctor = UNICODEMATH_NODE_CONSTRUCTORS[draft.kind];
  return new ctor(init);
}

/**
 * `UnicodeMath::Parser#parse` (`unicode_math/parser.rb:24-32`) after the
 * transform, plus the `formula.input_string = text` that
 * `Plurimath::Math.parse_formula` adds (`math.rb:62-66`).
 *
 * The wrap is `Math::Formula.new(Array(transformed))`, and `Kernel#Array` is
 * NOT `[x] unless Array`: nil folds to `[]`, and a Hash folds to its
 * `[key, value]` pairs (`Hash#to_a`) rather than being wrapped whole. That arm
 * is live — two corpus inputs reach it (see `GEM_UNMATCHED_SIGNATURES`) — so it
 * is transcribed, symbol keys becoming the strings the gem's serializer emits
 * for them.
 *
 * The root hash is CHECKED before it is folded. Folding first would put the
 * pairs beyond `finalizeValue`'s reach, and the refusal this port owes for a
 * node whose rule it does not carry would never fire: `±` transforms to the
 * root `{combined_symbols: Slice}`, which `transform.rb:99` matches and this
 * slice does not.
 */
export function finalizeUnicodemathParse(transformed: unknown, inputString: string): FormulaNode {
  let value: unknown[];
  if (transformed === null || transformed === undefined) value = [];
  else if (Array.isArray(transformed)) value = transformed;
  else if (isPlainObject(transformed) && !isDraft(transformed)) {
    assertGemLeavesUnmatched(transformed);
    value = Object.entries(transformed).map(([key, entry]) => [key, entry]);
  } else value = [transformed];
  return finalizeDraft(newFormula(value), inputString) as FormulaNode;
}
