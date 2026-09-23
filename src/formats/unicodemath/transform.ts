/** biome-ignore-all lint/style/useNamingConvention: pattern keys are Parslet
 * tree keys — Ruby's snake_case is the schema, exactly as in the generated
 * tables, and renaming one would stop its rule from ever matching. */
/**
 * The UnicodeMath transform — ported rule for rule from the gem
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
 * Current state: `unicodemathTransform()` registers as many rules as
 * `transform-coverage.spec.ts`'s `FINAL_COUNT` asserts — read that constant
 * rather than a number here, which would go stale the moment the next slice
 * lands (measured 422 at the time slice H closed). The rest of this header is
 * the increment-by-increment history of how that set grew; its "this slice"
 * counts describe the first slice, not the present set.
 *
 * `unicode_math/transform.rb` registers 516 rules — 519 counting the three the
 * `BaseNumberPrefix::Transform` mixin adds — and porting them in one unit is
 * not reviewable. The boundary is drawn by what the repository can *check*
 * today: at the time this slice was cut, the pinned corpus carried no
 * UnicodeMath INPUT cases, but it carried 103 distinct `expected.unicodemath` strings — UnicodeMath the gem itself
 * emitted — and feeding those back through `Plurimath::Math.parse(text,
 * :unicode)` is a round trip whose every answer is the oracle's.
 *
 * Measured on the oracle, with every registered block wrapped in a counter:
 * the gem parsed 97 of those 103 (the corpus size at the time) and refused 6, and the 97 fired **86** distinct
 * rules. This slice ports **78** of them: the 86 minus the eight-rule
 * table/matrix family (`transform.rb:8`, `:9`, `:14`, `:32`, `:1569`, `:1574`,
 * `:1584`, `:1649`), which served exactly two of those 103 inputs (at the time) and needs
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
 * SEQUENCE), was left unregistered by this increment: nothing it carried could
 * build the sequence-shaped scripted base that reaches it. Slice F's
 * `:1054`/`:1069` do, and `:1375` is registered beside `:1344` below. See
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
 * `{displaystyle: false}` — its SEQUENCE-denominator twin `:2371` passes
 * `{no_display_style: false}` instead for the same input shape; the gem
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
 * no_display_style with a sequence denominator) — are ALL ported too, each a
 * plain sequence-spread of the same `Utility.fractions` shape as `:1609`'s
 * siblings above; none needed the cross-cutting `atoms` combinator this
 * comment originally expected them to.
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
 * The family served exactly two of the 103 corpus strings (at the time this slice was cut) — `"⒨(a@b)"` and
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
 * (not through `:255`'s `naryand` route) — were left unported by this
 * increment; slice F registers all eight (the "script-subsup-nary" fixture
 * group), reached by multi-character `sub`/`sup` runs such as `"∑_c1"`.
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
 * Of the eleven that only ever appear inside FRACTION's own
 * `numerator`/`denominator` grammar productions — `:675`, `:680`, `:685`,
 * `:690`, `:695`, `:1756`, `:2035`, `:2041`, `:2048`, `:2787`, `:3074` —
 * three (`:675`, `:1756`, `:2048`) are ported now, alongside the ten
 * SEQUENCE-numerator/denominator sites (`:1619`-`:2371`) the FRACTION
 * section above once deferred and now also carries in full: those ten no
 * longer block anything downstream of them. The remaining eight — `:680`,
 * `:685`, `:690`, `:695`, `:2035`, `:2041`, `:2787`, `:3074` — are simply
 * outside this slice's boundary; see the ATOMS-meeting-FRACTION comment
 * beside `:675` below for the up-to-date accounting.
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
 * Three `SLICE_BOUNDARY` rows (`1x₂`, `1/2a`, `ⅇ`) in the fixture generator
 * record an input for a rule the port lacks: the port must refuse each, and
 * the refusal becomes a failing ratchet the moment that rule lands, which is
 * when the pure rules it blocks can be checked.
 *
 * Everything outside those 210 is genuinely ABSENT rather than stubbed. A
 * ## A ninth increment: FENCED, the `open_paren`/`opener` rules of `:2020`-`:2983`
 *
 * Twenty-three rules building `Fenced` (or, for `:2761`/`:2769`, replacing a
 * `Table`'s two parens), from the range's `open_paren`/`opener`/
 * `paren_open_prefix`/`sub_open_paren` keys: `:2020` (no content), `:2457`
 * (SEQUENCE `opener`), `:2485` (`slashed_value` SEQUENCE), `:2495`-`:2609`
 * (one content key each, `:2525`/`:2536` carrying `close_prefixed`/
 * `open_prefixed`, `:2597` the mini-sized `sub_open_paren` fence), `:2640`
 * (`accents`), `:2650`/`:2668`/`:2724` (SEQUENCE parens, whose first element is
 * a size-prefix `Number`), `:2746` (`negated_operator`), `:2761`/`:2769`
 * (table) and `:2983` (`pre_script`). Four helpers are new: `applyParenMask`
 * (the `1.25**n` size block four rules repeat, refusing an exponent past 22
 * where JavaScript's and Ruby's `1.25**n` stop agreeing — measured, `1.25**23`
 * differs in the last digit), `subParenKey` (over two generated tables,
 * `UNICODEMATH_SUB_PARENTHESIS_OPEN`/`_CLOSE`), and
 * `slashedValues`/`sequenceSlashedValues` (`Utility.slashed_values` and its
 * sequence form). `:2685`/`:2707` (SEQUENCE parens around a `frac`) belong to
 * the fractions slice and are not registered here. The SEQUENCE-paren rules
 * are reached by the unicode `├`/`┤` prefix glyphs; the spelled forms probed
 * (`\left1(a\right1)`, `\open2[a\close]`) leave an unmatched hash in the gem. Running
 * count: 188 + 23 + 6 prerequisites (`:60`, `:85`, `:97`, `:561`, `:2055`, `:2067`, owned by
 * slices A and F and registered under their ids) = **217**.
 *
 * Everything outside the registered rules is genuinely ABSENT rather than stubbed. A
 * ## A ninth increment (slice G2): the bracket-pair family, `:3000` to the end
 *
 * Every rule from `transform.rb:3085` on that binds `open_paren`/`close_paren`
 * and builds a `Fenced` (a few wrap it in a `Power`). Sixty-three were left
 * once the multiscript, nary and intent rules in that range were subtracted.
 * An input for each was searched for on the oracle — the gem's own
 * `unicodemath-tests` examples plus generated bracket inputs, 5,172 traces of
 * 5,155 distinct inputs (4,493 of which parsed) with every registered block
 * wrapped in a counter — and **forty-two** were reached and are registered.
 * The twenty-one no trace reached are not: `:3156`, `:3189`, `:3211`, `:3222`,
 * `:3244`, `:3266`, `:3323`, `:3334`, `:3356`, `:3378`, `:3444`, `:3466`,
 * `:3488`, `:3618`, `:3629`, `:3698`, `:3780`, `:3816`, `:3828`, `:3885`,
 * `:3966`. Eighteen of them bind `expr` (not `exp`) next to the fence's other
 * keys, and the two reached rules that bind `expr` (`:3499`, `:3840`) each also
 * carry a `symbol` or `relational_symbols` key. None of the twenty-one is shown
 * unreachable, only unreached.
 *
 * `fenced` below is the one helper: the thirty-one rules that differ only in
 * the keys they bind and the list they build share its `parenClass` guard
 * (`Slice` -> `symbols_class`), as the seven earlier `Fenced` rules do. The
 * other eleven — `:3085`, `:3119`, `:3143`, `:3310`, `:3723`, `:3739`, `:3755`
 * and the four interval rules `:3897`-`:3935` — build their `Fenced` (or
 * `Power`) directly. `:3085` and the four interval rules apply `symbols_class`
 * to the parens with no `Slice` guard. `:3085` also builds
 * `1.25**digits` em sizes: Ruby prints `1.25**0` as `1.0`, so `rubyFloatToS`
 * keeps the `.0` JavaScript drops.
 *
 * Five prerequisites are registered under the ids of the slices that own them
 * (`:191`, `:196`, `:204` for slice B; `:2055`, `:2067` for slice A) because no
 * input reaches `:3531`, `:3922`/`:3935` or `:3085` without them; the
 * orchestrator dedupes. `:3119`/`:3143` are reached only under an nary that has
 * a `sub` (`"∫_a▒(x)ab"`): the bare `"∫▒(x)y"` reaches them too on the oracle
 * but leaves an unmatched `{nary_class:, naryand:}` wrapper, the
 * failure mode the NARY section above records.
 * Running count: 188 + 47 = **235**.
 *
 * Everything outside the rules registered here is genuinely ABSENT rather than stubbed. A
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
 * ## Slice E: FRACTIONS, the ten sequence-shaped sites and their neighbours
 *
 * The ten `Utility.fractions` call sites the FRACTION and TABLE increments
 * above deferred whole (`:1619`-`:1644`, `:2203`, `:2359`, `:2365`, `:2371`)
 * are registered, and each has a fixture input that reaches it on the oracle
 * AND through this port (the "fractions_seq" group in
 * `scripts/generate-unicodemath-model-fixtures.rb`, which carries the trace of
 * every input). They were deferred behind a combinator that turned out to be
 * four pure folds the gem's fraction grammar leaves beside a sequence side:
 * `:675`/`:1756` (an atom onto `recursive_denominator`/`recursive_numerator`)
 * and `:561`/`:592` (a mini digit onto its `*_recursion_expr`). Those, and
 * `:396` (`char` + alphanumeric, `++¹/₂ḟa`), belong to slices A, F and B; they
 * are registered here under their own ids because the fractions cannot parse
 * without them.
 *
 * Also here: `Utility.unicode_fractions` (`unicode_math/utility.rb:69-76`) with
 * the `:96`/`:212`/`:217`/`:3277` rules that call it, the fraction-led rules
 * `:2393`, `:2797`, `:3411`, `:3422`, the masked-fence pair `:2685`/`:2707`
 * (the size-prefix option block, `applyParenMask`), `:2048`, and slice B's four
 * deferred witnesses `:284`, `:290`, `:296`, `:666`, which a fraction's
 * `recursive_*` run finally reaches. Not registered, because no input
 * reached them on the oracle: `:2787`, `:3074`, `:3266`.
 *
 * ## An eleventh increment: COMBINATORS-EARLY (slice H), the same
 * `transform.rb:8`-`:538` region the pure-rule slice (A) already mined
 *
 * Thirteen more single/two-key unwraps and one-symbol-lookup leaves from the
 * exact source region slice A drew its 56 from, each traced on the oracle
 * with a `TracePoint :b_call` the same way as every earlier increment:
 * `:43`, `:48`, `:67`, `:69`, `:78`, `:91`, `:95`, `:330`, `:346`, `:376`,
 * `:381`, `:441`, `:538`. Nine carry a fixture in
 * `RULE_COVERAGE["combinators"]` and compare for real: `:43` (`ⅇ`, moved out
 * of `SLICE_BOUNDARY` now that it lands), `:48`, `:67`, `:69`, `:78`, `:91`,
 * `:330`, `:376`, `:538`. See `FINAL_COUNT` for the running total this
 * increment brings it to.
 *
 * Four more are registered but have no coverage fixture yet: `:95`, `:346`,
 * `:381` and `:441` each fire on an oracle input, but every one found also
 * fires a sibling pure combinator that no slice has claimed — `:95` needs
 * `:945`, `:346` needs `:2251`, and `:381` and `:441` both need `:1776`
 * (`{digit: simple, expr: simple}`), which alone blocks three of the four.
 * Each witness sits in `SLICE_BOUNDARY` instead
 * (the generator's own comment above it names the exact blocker per row), so
 * the port still refuses those inputs and `model-parity.spec.ts` proves that
 * refusal rather than a parse.
 *
 * Three are dead in the gem, confirmed two ways: `:41`/`:42`/`:51`
 * (`script`/`double`/`fraktur`) read `Constants::UNICODED_FONTS`, whose
 * `script`/`fraktur`/`double` entries each carry exactly one key —
 * `constants_rules.rb`'s `hash_values` takes the single-key branch for those
 * three, which returns a bare untagged `str(hex_code)` with no `{script:
 * ...}`/`{double: ...}`/`{fraktur: ...}` hash ever built — and separately,
 * `common_rules.rb`'s `custom_fonts.as(:unicoded_font_class)` never tags
 * `.as(:script)`/`.as(:double)`/`.as(:fraktur)` either. `:43`'s (`mitBbb`)
 * sibling entry has five keys, so it takes `hash_values`'s OTHER branch,
 * which does tag `.as(:mitBbb)` — the one measured difference between a dead
 * id in this family and a reachable one.
 *
 * Three more are unreached rather than dead, the same distinction the ROOT /
 * OVER-UNDER section above draws for `:1514`/`:346`(its own, pre-slice-H,
 * unrelated to this increment's `:346`): `:75` (`expression: simple`, the
 * `expression` grammar rule's own `alt6`), `:80` (`intermediate_exp:
 * sequence`, next to already-ported `:78`'s SIMPLE twin, with no known
 * firing shape at the time), and `:83` (`sup_recursion: simple`, reached
 * only when `recursive_baseless_sup_exp`'s `mini_sub_sup`-led alternative
 * nests a terminal `baseless_sup` under `exp_iteration` — traced as
 * plausible but not fired). Roughly 3,000 candidate inputs were traced on
 * the oracle for these three (hand-built combinations plus every
 * `unicodemath-tests` and pinned-corpus string already in scope), none of
 * which fired any of the three at the time; none was registered by this
 * increment. `:80` was ported later, by slice J below, once that slice's
 * own `:1836`/`:1856` witnesses turned out to need it to finish a real
 * parse — `:75` and `:83` remain unreached.
 *
 * ## A thirteenth increment: INTERMEDIATE/SLASHED/PAREN-TAIL (slice J)
 *
 * Forty candidate rules from `transform.rb:1514`-`:2426`, plus `:2777`,
 * `:2787` and `:3074`: the `ROOT`/`OVER-UNDER`/`ACCENT` increment's own
 * `:1514` leftover, the `mini_sup`/`digit`/`sup_exp` combos onto a
 * fraction's `recursive_numerator`, the `intermediate_exp` family
 * `expBracket`'s mismatched-bracket alternative builds, the five
 * `slashed_value`x`expr` combos, the unmasked paren-prefix pair, the last two
 * masked-paren-mask rules, `:2079`, the `factor`/`operand`(+third key)
 * list-joins from `:2245` to `:2341`, `:2403`, `:2426`, and the ATOMS-tail
 * pair the FRACTION section above deferred. Traced the same way every prior
 * increment was: `unicode_math/transform.rb`, every registered block wrapped
 * in a firing counter, against the 675 `unicodemath-tests` strings, the
 * pinned corpus, and hand-built candidates.
 *
 * **Thirty** are registered. `:1514` (`root_first_value`/`root_second_value`,
 * a multi-character root radix — `"⒭ab▒c"`, `▒` being
 * `root_invisible_character`'s own separator since `binary_root` carries no
 * literal one) finally resolves the ROOT increment's own open question.
 * `:1746`/`:1751`/`:1761`/`:1766`/`:1771`/`:1776`/`:1781`/`:1786` are the
 * `mini_sup`/`digit`/`sup_exp` heads a fraction's `recursive_numerator` (or,
 * for `:1771`/`:1776`, `alpha_numeric_values`'s own `expr` continuation)
 * chains onto; `:1776` is one of the two blockers `SLICE_BOUNDARY`'s `"1x₂"`
 * row named (`:67`, the other, was already ported by slice H) and one of the
 * two `:381`/`:441` need. `:1801` is a fraction leading two-plus more
 * `naryand_recursion` items under a nary (`"∑_(k=0)^n n⒞k a^k b"`, `n⒞k` a
 * `\choose` `Frac`); the gem carries no SIMPLE sibling for this shape.
 * `:1836`/`:1846`/`:1856` are `expBracket`'s own MISMATCHED-bracket
 * alternative (`mixBracketed`, `"(a|"`/`"|a)"`) and `factor`'s plain-paren
 * arm, each paired with `expr`/`exclamation_symbol`. The five
 * `slashed_value`x`expr`/`exp` combos (`:1894`/`:1899`/`:1904`/`:1909`/
 * `:1914`) reuse `slashedValues`/`sequenceSlashedValues` unchanged.
 * `:2010`/`:2015` are the UNMASKED paren-prefix pair — `[Number(""), paren]`,
 * the same shape the masked triple already carried, with an empty size —
 * reached when the prefix's own inner bracket mismatch never finds a partner
 * until the outer `expBracket` closes (`"├]a┤["` fires both at once, distinct
 * from the ported masked triple's `\left`/`\right` spelling, which resolves
 * through `:2536`/`:2527` instead whenever real content sits between the
 * prefix and its own match). `:2061`/`:2073` are that pair's MASKED
 * siblings (`"├1]a┤4["`). `:2079` is `:2085`'s SEQUENCE-`diacritics` twin
 * (`"(𝑘−𝑧−1)⒞𝑘"`). `:2251` reuses `SLICE_BOUNDARY`'s own `"1I(x,x') = …
 * ∫_S▒ρ(x,x',x'')I(x',x'')ⅆx'']"` witness, the input that row already named
 * as firing `:2251` — one of `:346`'s two blockers, the other (`:1776`)
 * landing in the same slice. `:2275`/`:2281`/`:2287` are `:2269`/`:2317`'s
 * `exp`-keyed siblings (`spacedExpBracket`'s own tag, not `expression`'s
 * `expr`), reached inside a mismatched-bracket or table-cell run.
 * `:2335` is `:2103`'s multi-symbol subscript-run sibling
 * (`"a_δ₁ρ₁σ₂^3β"`). `:2426` is `:640`/`:646`'s `sub_operators`/
 * `sub_recursions` pair with a `mini_intermediate_exp` riding ahead of it,
 * building a mini-sub-sized `Math::Number` rather than `:640`'s `Symbol`
 * (`"N₀₊₍₂₋₅₎₌₋₃"`).
 *
 * Once `:1776` and `:2251` landed, three `SLICE_BOUNDARY` rows from slice H
 * were re-traced against the CURRENT port rather than trusted to still be
 * blocked: `"1x₂"` (`:67`+`:1776`), `"1a_ℲDa + …"` (`:381`+`:1776`) and
 * `"1A^* = …"` (`:441`+`:1776`) all now parse and moved into
 * `RULE_COVERAGE["intermediate_paren_tail"]` below, alongside the new group's
 * own witnesses. The long `"1I(x,x') = …"` row moves too, now that its own
 * two blockers (`:346`, ported by slice H, and `:2251`, ported here) are both
 * present. `:95` needs `:945` besides `:1776`, `:945` is slice I's own claim,
 * and that row is left in `SLICE_BOUNDARY` for integration to resolve.
 *
 * TEN are not registered, five for a shared structural reason and five for
 * want of a reaching input: `:1841` (`intermediate_exp`+`operator`), `:2341`
 * (`intermediate_exp`+`expr`+`expression`) and `:2777`
 * (`intermediate_exp`+`operator`+`expr`) are UNREACHED for the same reason —
 * every grammar path that pairs `intermediate_exp` with a further tag either
 * resolves that tag to `expr` (through `expBracket`'s own `mixBracketed`
 * alternative, consumed by `:1836`/`:1856`) or to `exclamation_symbol`
 * (through `factor`'s own seq, consumed by `:1846`); a bare `{operator:}`
 * hash unwraps via `:62` before any parent hash could ever see `operator`
 * survive as a sibling key, and no grammar production tags `intermediate_exp`
 * and `operator` from the same `seq`. `:2035` (`atom`+SEQUENCE
 * `atoms`+`recursive_denominator`), `:2041` (`atom`+`binary_symbols`+
 * `factor`), `:2097` (`sub_script`+`mini_sup`+`operand`), `:2245`
 * (`:2251`'s own SEQUENCE-`naryand_recursion` twin) and `:2323`
 * (`factor`+`operand`+`recursive_denominator`) found no reaching input
 * across the 675 `unicodemath-tests` strings, the pinned corpus, or this
 * slice's own hand-built candidates. `:2787`/`:3074` (`atom`+`operator`+
 * `frac`[+SEQUENCE `expr`]) were deferred whole by the FRACTION section
 * above; this slice re-tried deliberately with the same method and reached
 * neither. `:2403` (`base`+SEQUENCE `sub`+`sub_recursion`) carries a proven
 * DEFECT rather than an ordinary gap: its `Constants::BINARY_FUNCTIONS`
 * branch reads a bare local `sub_value` the block never assigns
 * (`transform.rb:2407`) — the same typo `:1078`'s own twin branch carries
 * (`transform.rb:1081`, also unregistered) — so taking that branch on the
 * oracle raises rather than returns; slice F tried this id and found no
 * reaching input, and this slice's own search (every `BINARY_FUNCTIONS` name
 * paired with a multi-character subscript, plus the 675 `unicodemath-tests`
 * strings) found none either. None of these ten counts toward `FINAL_COUNT`.
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
import {
  type Bindings,
  type Matcher,
  Slice,
  sequence,
  simple,
  subtree,
  Transform,
  type TransformValue,
} from "../../pegkit";
import {
  UNICODEMATH_BINARY_SYMBOLS,
  UNICODEMATH_BINARY_SYMBOLS_KEYS,
  UNICODEMATH_COMBINING_SYMBOLS,
  UNICODEMATH_COMBINING_SYMBOLS_KEYS,
  UNICODEMATH_MATRIXS,
  UNICODEMATH_MATRIXS_KEYS,
  UNICODEMATH_NARY_SYMBOLS,
  UNICODEMATH_NARY_SYMBOLS_KEYS,
  UNICODEMATH_RELATIONAL_SYMBOLS,
  UNICODEMATH_RELATIONAL_SYMBOLS_KEYS,
  UNICODEMATH_SKIP_SYMBOLS,
  UNICODEMATH_SKIP_SYMBOLS_KEYS,
  UNICODEMATH_SUB_DIGITS,
  UNICODEMATH_SUP_DIGITS,
  UNICODEMATH_UNICODED_FONTS,
} from "./generated/parser-tables";
import {
  UNICODEMATH_BELOWS_NOTATIONS,
  UNICODEMATH_BINARY_FUNCTIONS,
  UNICODEMATH_FRACTION_PARTS,
  UNICODEMATH_IS_A_CLASSES,
  UNICODEMATH_MASK_CLASSES,
  UNICODEMATH_MENCLOSE_FUNCTIONS,
  UNICODEMATH_NARY_CLASSES,
  UNICODEMATH_OVERLAYS_NOTATIONS,
  UNICODEMATH_PHANTOM_FUNCTIONS,
  UNICODEMATH_PRIMES_CONSTANTS,
  UNICODEMATH_SUB_OPERATORS_BY_KEY,
  UNICODEMATH_SUB_PARENTHESIS_CLOSE,
  UNICODEMATH_SUB_PARENTHESIS_OPEN,
  UNICODEMATH_SUP_ALPHABETS_BY_KEY,
  UNICODEMATH_SUP_OPERATORS_BY_KEY,
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
/** `Constants::RELATIONAL_SYMBOLS[key]`, read by `:666`. */
const RELATIONAL_SYMBOLS = zipConstants(
  UNICODEMATH_RELATIONAL_SYMBOLS_KEYS,
  UNICODEMATH_RELATIONAL_SYMBOLS,
  "RELATIONAL_SYMBOLS",
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
/** `Constants::SUP_ALPHABETS.key(entity)`, `SUB_OPERATORS.key(entity)`, `SUP_OPERATORS.key(entity)`. */
const SUP_ALPHABETS_INVERTED = invertFirstWins(UNICODEMATH_SUP_ALPHABETS_BY_KEY);
const SUB_OPERATORS_INVERTED = invertFirstWins(UNICODEMATH_SUB_OPERATORS_BY_KEY);
const SUP_OPERATORS_INVERTED = invertFirstWins(UNICODEMATH_SUP_OPERATORS_BY_KEY);

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
function newFenced(
  one: unknown,
  two: unknown,
  three: unknown,
  options: NodeOptions = {},
): UnicodemathDraft {
  const draft = ternaryDraft("fenced", undefined, one, two, three);
  draft.fields.options = options;
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

/** `Math::Function::Base`'s own class, not a `BinaryFunction` alias or a descendant. */
function isBaseNode(value: unknown): value is UnicodemathDraft {
  return isDraft(value) && draftRubyClass(value) === "Math::Function::Base";
}

/**
 * `Utility.recursive_sub(sub_script, sub_recursion)`
 * (`unicode_math/utility.rb:123-139`, with `base_recursion`): a `Base`
 * recursion has `sub_script` folded into the innermost `parameter_one` of its
 * leftmost `Base` chain, and comes back itself; anything else is wrapped.
 */
function recursiveSub(subScript: unknown, subRecursion: unknown): unknown {
  if (!isBaseNode(subRecursion)) return newBase(subScript, subRecursion);
  let node: UnicodemathDraft = subRecursion;
  while (isBaseNode(fieldOf(node, "parameterOne"))) {
    node = fieldOf(node, "parameterOne") as UnicodemathDraft;
  }
  setField(node, "parameterOne", newBase(subScript, fieldOf(node, "parameterOne")));
  return subRecursion;
}

/**
 * `Utility.recursive_sup(sup_script, sup_recursion)`
 * (`unicode_math/utility.rb:152-179`, with the module-level `sup_recursion`
 * helper): `recursiveSub`'s twin over `Power`.
 */
function recursiveSup(supScript: unknown, supRecursion: unknown): unknown {
  if (!isA(supRecursion, IS_POWER)) return newPower(supScript, supRecursion);
  let node: UnicodemathDraft = supRecursion;
  while (isA(fieldOf(node, "parameterOne"), IS_POWER)) {
    node = fieldOf(node, "parameterOne") as UnicodemathDraft;
  }
  setField(node, "parameterOne", newPower(supScript, fieldOf(node, "parameterOne")));
  return supRecursion;
}

/**
 * `Utility.base_is_sub_or_sup?(base)` (`unicode_math/utility.rb:191-200`): a
 * `case` with no `else`, so every node kind it does not name answers nil. A
 * `Fenced`'s `parameter_two.first` raises `NoMethodError` when the parameter
 * is not an array.
 */
function baseIsSubOrSup(base: unknown): boolean {
  if (isFormulaDraft(base)) return baseIsSubOrSup(formulaValue(base)[0]);
  if (isFenced(base)) {
    const inner = fieldOf(base, "parameterTwo");
    if (!Array.isArray(inner)) {
      throw new TypeError("unicodemath transform: Fenced#parameter_two.first on a non-array");
    }
    return baseIsSubOrSup(inner[0]);
  }
  if (isSymbol(base) || (isDraft(base) && base.kind === "number")) {
    return rubyTruthy(base.fields.miniSubSized) || rubyTruthy(base.fields.miniSupSized);
  }
  return false;
}

/** `Math::Symbols::Symbol.new(text, mini_sup_sized: true)` / `mini_sub_sized: true`. */
function newMiniSymbol(text: string, size: "sub" | "sup"): UnicodemathDraft {
  return new UnicodemathDraft("symbol", "Symbol", {
    value: text,
    ...(size === "sub" ? { miniSubSized: true } : { miniSupSized: true }),
  });
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
 * `UnicodeMath::Utility.unicode_fractions(fractions)` (`unicode_math/utility.rb:69-76`):
 * a vulgar-fraction entity becomes a `Frac` of two `Number`s. An entity the
 * table lacks is `nil.first` in Ruby, a `NoMethodError`.
 */
function unicodeFractions(fractions: unknown): UnicodemathDraft {
  const parts = UNICODEMATH_FRACTION_PARTS.get(rubyToS(fractions));
  if (parts === undefined) {
    throw new TypeError(
      `unicodemath transform: UNICODE_FRACTIONS has no ${rubyToS(fractions)} (Ruby raises NoMethodError)`,
    );
  }
  return newFrac(newNumber(parts[0]), newNumber(parts[1]), {
    displaystyle: false,
    unicodemath_fraction: true,
  });
}

/**
 * `"#{1.25**n}em"`, the size a paren prefix (`├1(`) names. Ruby's `Float#to_s`
 * prints `1.0` where JavaScript prints `1`; for `n` in 0..22 every other value
 * is non-integral and both print the shortest round-trip digits. Outside that
 * range `1.25**n` and its printed form are not known to agree between the two
 * runtimes, so this refuses rather than guess.
 */
function parenMask(prefix: string): string {
  const exponent = rubyToI(prefix);
  if (exponent < 0 || exponent > 22) {
    throw new Error(
      `unicodemath transform: paren size prefix ${exponent} is outside 0..22, where 1.25**n is ` +
        "exact and Ruby's Float#to_s and JavaScript's String() are known to agree",
    );
  }
  const size = 1.25 ** exponent;
  return `${Number.isInteger(size) ? `${size}.0` : String(size)}em`;
}

/**
 * The block the masked-`Fenced` rules (`transform.rb:2685`, `:2707`) spell out
 * once per side — a SEQUENCE paren whose first element is a `Number` carries a
 * size prefix:
 *
 *   options[:open_prefixed] = true
 *   options[:open_paren] = { minsize: mask, maxsize: mask } unless value == ""
 *
 * `paren` is the bound array, `side` picks the option keys, and keys land in
 * assignment order as the Ruby hash does.
 */
function applyParenMask(
  options: Record<string, unknown>,
  paren: readonly unknown[],
  side: "open" | "close",
): void {
  const first = paren[0];
  if (!(isDraft(first) && first.kind === "number")) return;
  const value = rubyToS(first.fields.value);
  options[`${side}_prefixed`] = true;
  if (value !== "") {
    const mask = parenMask(value);
    options[`${side}_paren`] = { minsize: mask, maxsize: mask };
  }
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
  /**
   * The `Fenced.new(paren, contents, paren)` rules of `transform.rb:3085`-`:3966`
   * all spell out the same guarded pair (`parenClass`); only the keys they bind
   * and the contents they build differ. One `rule` call per Ruby rule, its id
   * the Ruby line, exactly as everywhere else in this file.
   */
  const fenced = (
    id: string,
    keys: Record<string, Matcher>,
    contents: (bindings: Bindings) => unknown,
  ): void =>
    rule(
      id,
      { open_paren: simple("open_paren"), ...keys, close_paren: simple("close_paren") },
      (b) => newFenced(parenClass(b.open_paren), contents(b), parenClass(b.close_paren)),
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
  // Slice H: `:41`/`:42`/`:51` (`script`/`double`/`fraktur`) are NOT
  // registered — see the module header, "COMBINATORS-EARLY". `:43`
  // (`mitBbb`) is their reachable sibling: `Constants::UNICODED_FONTS`'s
  // `mitBbb` entry has five keys, so `hash_values` (`constants_rules.rb`)
  // takes its multi-key branch and tags `.as(:mitBbb).as(:unicoded_font_class)`
  // before `:227` (already registered) consumes the result; `script`/
  // `double`/`fraktur` each have exactly one key and take the single-key
  // branch instead, which returns a bare untagged `str(hex_code)` — no
  // `{script: ...}`/`{double: ...}`/`{fraktur: ...}` hash is ever built.
  rule("43", { mitBbb: simple("mitBbb") }, () => "mitBbb");
  rule("44", { symbol: simple("symbol") }, (b) => symbolsClass(b.symbol));
  rule("45", { number: simple("number") }, (b) => newNumber(b.number));
  // `:39`'s SEQUENCE twin — already needed by RELATION/OPERATOR's `"2·3"`
  // above, and also needed the moment `:486`/`:491`/`:496` below fold more
  // than one atom onto a `factor`: without it the resulting array is a hash
  // the gem always resolves, refused here as if it were the "factor=other"
  // bug case `GEM_UNMATCHED_SIGNATURES` names.
  rule("47", { backcolor: simple("color") }, (b) => b.color);
  // Slice H: `baseless_sub`'s first alternative, when no operator follows
  // the underscore, calls `baseless_sub_values(:sub_script)`
  // (`sub_sup.rb`), whose `(mini_sub_sup | sub_sup_paren).as(:sub_script)`
  // arm nests `sub_sup_paren`'s own `sub_paren.as(:sub_paren)` tag one level
  // deeper: `{sub_script: {sub_paren: X}}`. Witness: `"a_₁"` (a bare
  // underscore subscript of one subscript-styled digit) — `{sub_exp: {base:,
  // sub: {sub_script: {sub_paren: {sub_digits: "&#x2081;"}}}}}` on the
  // oracle.
  rule("48", { sub_paren: simple("paren") }, (b) => b.paren);
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
  // Slice H: `mini_sub_value`'s `.as(:mini_sub)` result, folded into a
  // SEQUENCE the way `atoms` folds `:atom` — reached whenever more than one
  // `mini_sub_value` chains. Two chained letters ahead of the digit
  // subscript (`"ab₁^c"`) let `:255` resolve `base` as an array without
  // needing the unported `:1776`, so this rule reaches full
  // `RULE_COVERAGE["combinators"]` parity.
  rule("67", { mini_sub: sequence("mini_sub") }, (b) => b.mini_sub);
  rule("68", { monospace: simple("monospace") }, (b) => b.monospace);
  // Slice H: `Utility.slashed_values` on a single SIMPLE `slashed_value` —
  // `:78` below is its SEQUENCE twin. Witness: `"1a\'"` (a backslash-prime
  // slashed value).
  rule("69", { slashed_value: simple("value") }, (b) => slashedValues(b.value));
  rule("71", { intermediate_exp: simple("expr") }, (b) => b.expr);
  rule("72", { decimal_number: simple("number") }, (b) => b.number);
  rule("73", { accents_subsup: simple("subsup") }, (b) => b.subsup);
  rule("74", { subsup_exp: simple("subsup_exp") }, (b) => b.subsup_exp);
  // `:75` (`expression: simple`) is NOT registered — see the module header,
  // "COMBINATORS-EARLY".
  rule("76", { open_paren: simple("open_paren") }, (b) => symbolsClass(b.open_paren));
  // DECORATION's three unwraps: `op_diacritic_belows`/`op_diacritic_overlays`
  // (`grammar.ts`'s `opDiacriticBelows`/`opDiacriticOverlays`) each wrap the
  // matched entity under its own tag before `diacriticsAccents` wraps THAT
  // under `below_after`/`overlay_after`/`overlay_before`, so these strip the
  // inner tag back to plain text first — exactly what `:81`/`:94` do in the
  // gem. `:88` strips `diacriticsAccents`'s own outer `diacritics_accents`
  // wrapper once the rules below have built a node from its contents.
  rule("77", { override_subsup: simple("subsup") }, (b) => b.subsup);
  // Slice H: `:69`'s SEQUENCE twin — `Utility.sequence_slashed_values`
  // directly, the same helper `:2485` (FENCED) already calls.
  rule("78", { slashed_value: sequence("values") }, (b) =>
    sequenceSlashedValues(asArray(b.values)),
  );
  // Slice J: `:80` — `:31`'s own `intermediate_exp` twin, the SAME single-key
  // unwrap shape. `factor`'s `expBracket.as("intermediate_exp")` wraps the
  // mismatched-bracket alternative's OWN `{intermediate_exp:, expr:}` pair a
  // second time, so once that inner pair resolves through `:1836`/`:1856`
  // below to an array, the OUTER hash is left holding `intermediate_exp` as
  // its only key with that array as its value — exactly `:80`'s shape.
  // Registered now because `:1836`/`:1856`'s own witnesses need it to finish
  // a real parse; every earlier survey missed it for want of a reaching
  // input, not for any difficulty in the rule itself.
  rule("80", { intermediate_exp: sequence("expr") }, (b) => b.expr);
  rule("81", { diacritic_belows: simple("belows") }, (b) => b.belows);
  rule("82", { unary_function: simple("function") }, (b) => b.function);
  // `:83` (`sup_recursion: simple`) is NOT registered — see the module
  // header, "COMBINATORS-EARLY".
  rule("88", { diacritics_accents: simple("accent") }, (b) => b.accent);
  // NARY (`transform.rb:84`-`:3588`, nineteen rules): every remaining
  // `nary_class`/`nary`/`nary_sub_sup` call site, all reusing `:1968`'s and
  // `:2806`'s own `naryFunctionName`/`UNICODEMATH_NARY_CLASSES`/`buildClass`/
  // `newNary` machinery — no new grammar key, no new helper. `:84` is the
  // `nary_sub_sup` pass-through `:74`'s sibling already carries for
  // `subsup_exp`.
  rule("84", { nary_sub_sup: simple("subsup_exp") }, (b) => b.subsup_exp);
  // PREREQUISITE of slice G1's SEQUENCE-paren witnesses (`:2457`, `:2650`): the
  // size-prefix arms (`:2055`, `:2067`) leave `open_paren` a list, and this
  // unwrap is what hands it on. Registered under the pure-rule slice's own
  // claim (`:85`, slice A) so the integration dedupes by id.
  rule("85", { open_paren: sequence("open_paren") }, (b) => b.open_paren);
  rule("90", { unary_subsup: simple("unary_subsup") }, (b) => b.unary_subsup);
  rule("91", { exclamation_symbol: simple("symbol") }, (b) => symbolsClass(b.symbol));
  rule("92", { alphanumeric: simple("alphanumeric") }, (b) => symbolsClass(b.alphanumeric));
  rule("94", { diacritic_overlays: simple("overlays") }, (b) => b.overlays);
  // Slice H: `mini_sub_sup`'s own `.as(...)` result (`mini_sub`/`mini_sup`/
  // `mini_subsup`), folded into a SEQUENCE by adjacency the way every other
  // `<key>: sequence` combinator here folds its key. Reached only inside a
  // long enough run of mixed atoms/scripts, which also fires `:945`
  // (`{rect: simple, expr: sequence}`, unported), so no fixture here reaches
  // full parity yet; the witness sits in `SLICE_BOUNDARY` instead, still
  // refused for that reason.
  rule("95", { mini_sub_sup: sequence("mini_sub_sup") }, (b) => b.mini_sub_sup);
  // PREREQUISITE of `:2597`'s witness (slice A's claim, registered here under
  // the same id): `sub_paren`'s `mini_intermediate_exp` wrapper, unwrapped.
  rule("97", { mini_intermediate_exp: simple("mini_expr") }, (b) => b.mini_expr);

  rule("96", { unicode_fractions: simple("fractions") }, (b) => unicodeFractions(b.fractions));

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

  // PREREQUISITES of the fenced family below, registered under the ids slice B
  // claims (`:191`, `:196`, `:204`; the orchestrator dedupes): `(a,1)` reaches
  // `:3531` only once its `,1` has become a `Number` (`:191`), and the interval
  // rules `:3922`/`:3935` receive `[+∞,1]`'s and `[−∞,1]`'s signed infinity as a
  // two-element run (`:196`, `:204`).
  rule("196", { positive: simple("positive"), infty: simple("infty") }, (b) => [
    symbolsClass(b.positive),
    symbolsClass(b.infty),
  ]);
  rule("204", { negative: simple("negative"), infty: simple("infty") }, (b) => [
    symbolsClass(b.negative),
    symbolsClass(b.infty),
  ]);

  rule("222", { diacritics_accents: simple("accents"), expr: sequence("expr") }, (b) => [
    b.accents,
    ...asArray(b.expr),
  ]);

  // `:227`: a `\script`/`\double`/`\fraktur`/`\mitBbb` prefix plus one letter
  // — the `UNICODED_FONTS` code point when the pair has one, else the letter.
  // FRACTION (slice E): a vulgar-fraction entity (`½`) followed by more of the
  // run, through `Utility.unicode_fractions`.
  rule("212", { unicode_fractions: simple("fractions"), expr: sequence("expr") }, (b) => [
    unicodeFractions(b.fractions),
    ...asArray(b.expr),
  ]);
  rule("217", { unicode_fractions: simple("fractions"), expr: simple("expr") }, (b) => [
    unicodeFractions(b.fractions),
    b.expr,
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

  // Slice H: `:184`'s SEQUENCE twin — an `ordinary_negated_operator` (`\not`
  // over a plain symbol, not a relational/binary one) followed by more of the
  // expression as a single item. Witness: `"1a /¬ b"`.
  rule("330", { ordinary_negated_operator: simple("operator"), expr: simple("expr") }, (b) => [
    newFormula([symbolsClass(b.operator), newBareSymbol("&#x338;")]),
    b.expr,
  ]);

  // A binary symbol leading a fraction's `recursive_denominator`/
  // `recursive_numerator` run (`1/2\not∘b`, `⊕b/c`). Slice B's rules, deferred
  // there until a fraction gave them a reaching input; ported with the
  // fractions that carry them.
  rule(
    "284",
    { binary_symbols: simple("symbols"), recursive_denominator: simple("recursive_denominator") },
    (b) => [
      symbolsClass(BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols),
      b.recursive_denominator,
    ],
  );
  rule(
    "290",
    { binary_symbols: simple("symbols"), recursive_denominator: sequence("recursive_denominator") },
    (b) => [
      symbolsClass(BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols),
      ...asArray(b.recursive_denominator),
    ],
  );
  rule(
    "296",
    { binary_symbols: simple("symbols"), recursive_numerator: simple("recursive_numerator") },
    (b) => [
      symbolsClass(BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols),
      b.recursive_numerator,
    ],
  );

  // `:341`: an accented run followed by a SEQUENCE `expr` — the accent node is
  // built by `unicodeAccents` and prepended, the same `[x] + xs` concatenation
  // `:501`/`:825` use.
  rule("341", { accents: subtree("accent"), expr: sequence("expr") }, (b) => [
    unicodeAccents(b.accent),
    ...asArray(b.expr),
  ]);
  // Slice H: `:341`'s `exp` (not `expr`) twin — reached only through
  // `spaced_exp_bracket`/`td_value`'s `.as(:exp)` tag (inside a FENCED or
  // table-cell run), which also fires `:2251` (`{factor: simple, operand:
  // sequence, naryand_recursion: simple}`, unported), so no fixture here
  // reaches full parity yet; the witness (a corpus-style differential
  // expression ending `ⅆx''`) sits in `SLICE_BOUNDARY` instead, still
  // refused for that reason.
  rule("346", { accents: subtree("accent"), exp: sequence("exp") }, (b) => [
    unicodeAccents(b.accent),
    ...asArray(b.exp),
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
  // Slice H: `:371`'s `exp` (not `expr`) twin — like `:346` above, reached
  // only through `spaced_exp_bracket`'s `.as(:exp)` recursion (a FENCED run
  // with more than one trailing atom after the `subsup_exp`). Witness:
  // `"a^b c d/(a b/c (a)_b^c d e)"`.
  rule("376", { subsup_exp: simple("subsup"), exp: sequence("exp") }, (b) => [
    b.subsup,
    ...asArray(b.exp),
  ]);
  // Slice H: `:77`'s SEQUENCE-extended twin — `override_subsup` (a `Ⅎ`-sized
  // override script, its own `{base:, size_overrides:, sub_script:}` already
  // resolved by `:2132`) followed by more of the expression. Fires alongside
  // `:1776` (unported, see `:67` above), so no fixture here reaches full
  // parity yet; the witness (`"1a_ℲDa + a_ℲCa + a_a + a_ℲAa + a_ℲBa"`) sits in
  // `SLICE_BOUNDARY` instead, still refused for that reason.
  rule("381", { override_subsup: simple("subsup"), expr: sequence("expr") }, (b) => [
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
  // PREREQUISITE (slice B's `:396`, registered here under the same id): a
  // `char` followed by an alphanumeric, the shape `++¹/₂ḟa` (`:2797`'s
  // witness) leaves beside its `frac`.
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
  // Slice H: an nary integral's `int_exp` (`:29`'s own SIMPLE unwrap target)
  // directly followed by one more `expr` item — the two-element list shape
  // every neighbour here uses. Fires alongside `:1776` (unported, see `:67`
  // above), so no fixture here reaches full parity yet; the witness
  // (`"1A^* = \\sum_{r}{ (-1)^r ⟨ A ⟩_r } = ⟨ A ⟩_+ - ⟨ A ⟩_-"`) sits in
  // `SLICE_BOUNDARY` instead, still refused for that reason.
  rule("441", { int_exp: simple("int"), expr: simple("expr") }, (b) => [b.int, b.expr]);
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

  // PREREQUISITE of `:2597`'s witness (`x₍₁₂₎`): a sub digit followed by a
  // simple recursion. Slice F's claim (`:561`), registered here under the same
  // id. `Constants::SUB_DIGITS.key(...).to_s` mini-sized, as `:170` does.
  rule(
    "561",
    { sub_digits: simple("sub_digits"), sub_recursion_expr: simple("recursion") },
    (b) => [subDigitNumber(b.sub_digits), b.recursion],
  );

  // TABLE continued (`transform.rb:598`-`:1691`, eighteen rules total; see
  // the module header): `Mlabeledtr`'s pair, built from `UnicodeMath::
  // Parser#post_processing`'s `{labeled_tr_value:, labeled_tr_id:}` wrap
  // (`parser.ts`'s own `postProcessing`, ported ahead of this slice) rather
  // than from the grammar directly. `:598`'s `value` is a SEQUENCE of rows —
  // `Utility.filter_values` folds it the way every multi-row formula field
  // does elsewhere in this file; `:606`'s is already the single row.
  // PREREQUISITES (slice F's `:561`/`:592`, registered here under the same ids):
  // a mini digit run folding onto its `*_recursion_expr` — the numerator or
  // denominator of `²/₃₄` and `²³/₃`. Ported to the same digit lookups
  // `:165`/`:170` use.
  rule("592", { sup_digits: simple("digits"), sup_recursion_expr: simple("sup") }, (b) => [
    supDigitNumber(b.digits),
    b.sup,
  ]);
  rule("598", { labeled_tr_value: sequence("value"), labeled_tr_id: simple("id") }, (b) =>
    newMlabeledtr(filterValues(b.value), newText(b.id)),
  );
  rule("606", { labeled_tr_value: simple("value"), labeled_tr_id: simple("id") }, (b) =>
    newMlabeledtr(b.value, newText(b.id)),
  );

  // FRACTION (slice E): a relational symbol leading a fraction's
  // `recursive_denominator` (`a\not∈b`). Slice B's rule, deferred there until a
  // fraction reached it.
  rule(
    "666",
    {
      relational_symbols: simple("symbols"),
      recursive_denominator: simple("recursive_denominator"),
    },
    (b) => [
      symbolsClass(rubyToS(RELATIONAL_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols)),
      b.recursive_denominator,
    ],
  );

  // PREREQUISITE (slice A's `:675`, registered here under the same id): an
  // atom folded onto a fraction's `recursive_denominator` (`1/a(b)`).
  rule(
    "675",
    { atom: simple("atom"), recursive_denominator: simple("recursive_denominator") },
    (b) => [b.atom, b.recursive_denominator],
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
  // `:2048`, `:2787`, `:3074`) was deferred whole when this comment was first
  // written, on the reasoning that every one of those eleven keys only ever
  // appears inside FRACTION's `numerator`/`denominator` grammar productions,
  // and the TOP `{numerator:, denominator:}` rule that would receive their
  // output was itself one of the ten SEQUENCE-numerator/denominator sites
  // (`transform.rb:1619`-`:2371`, the module header's own "other ten call
  // sites"). That top-side blocker is gone now: all ten of those sites are
  // ported (`:1619`, `:1624`, `:1629`, `:1634`, `:1639`, `:1644`, `:2203`,
  // `:2359`, `:2365`, `:2371`), and three of the eleven ATOMS-meeting-
  // FRACTION keys were ported alongside prerequisites that needed them
  // (`:675` above, `:1756`, `:2048`). The remaining eight — `:680`, `:685`,
  // `:690`, `:695`, `:2035`, `:2041`, `:2787`, `:3074` — are still unported,
  // but no longer for the reason this comment originally gave: nothing left
  // blocks a passing witness for them, porting them is simply outside this
  // slice's boundary and is the next slice's work, not a dependency gap.

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
  // `:1375`, the SEQUENCE twin of `:1344`, is registered now: slice F's
  // `:1054`/`:1069` build the sequence-shaped scripted base it needs
  // (witness `"⏟ab_1"`, in the "script-subsup-nary" fixture group).
  rule(
    "1375",
    { hbracket_class: simple("hbrack"), scripted_first_value: sequence("scripted_first_value") },
    (b) => hbracketDecoration(b.hbrack, b.scripted_first_value, false),
  );

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

  // Slice J: `:1514` — `binary_root`'s own `root_first_value`/`root_second_value`
  // pair (`grammar.ts`'s `binaryRoot`, `\root`/`⒭`/`&#x24ad;`), distinct from
  // `:1530`'s plain `first_value`/`second_value` shape below. Reached only
  // when the radix is MULTI-character: `"⒭ab▒c"` (root of `a b`, over `c`) —
  // `▒` is `root_invisible_character`'s own separator, since `binary_root`
  // carries no literal delimiter between the two operands. A single-character
  // radix leaves `root_first_value` `simple`, which the module header records
  // as unreached before this slice; that sibling is still not registered.
  rule(
    "1514",
    { root_first_value: sequence("first_value"), root_second_value: simple("second_value") },
    (b) => newRoot(filterValues(b.first_value), unfencedValue(b.second_value, true)),
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
  // other ten `Utility.fractions` call sites once depended on — those ten are
  // ported too, registered just below (see the header).
  rule(
    "1614",
    { mini_numerator: simple("numerator"), mini_denominator: simple("denominator") },
    (b) => fractions(b.numerator, b.denominator, { displaystyle: false }),
  );

  // FRACTION, the six sites where a side is a SEQUENCE (`transform.rb:1619`-
  // `:1644`): the `numerator`/`denominator` pair and its `mini_` twin, one
  // rule per simple/sequence combination, all the same `Utility.fractions`
  // call as `:1609`/`:1614`.
  rule("1619", { numerator: simple("numerator"), denominator: sequence("denominator") }, (b) =>
    fractions(b.numerator, b.denominator),
  );
  rule(
    "1624",
    { mini_numerator: simple("numerator"), mini_denominator: sequence("denominator") },
    (b) => fractions(b.numerator, b.denominator, { displaystyle: false }),
  );
  rule("1629", { numerator: sequence("numerator"), denominator: simple("denominator") }, (b) =>
    fractions(b.numerator, b.denominator),
  );
  rule(
    "1634",
    { mini_numerator: sequence("numerator"), mini_denominator: simple("denominator") },
    (b) => fractions(b.numerator, b.denominator, { displaystyle: false }),
  );
  rule("1639", { numerator: sequence("numerator"), denominator: sequence("denominator") }, (b) =>
    fractions(b.numerator, b.denominator),
  );
  rule(
    "1644",
    { mini_numerator: sequence("numerator"), mini_denominator: sequence("denominator") },
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
  // Slice J: `mini_sup`/`digit`/`sup_exp` folded onto a fraction's
  // `recursive_numerator` — the five siblings `:1756`'s own `atom` version
  // above left unregistered, each reached the same way: a mini-sized
  // superscript, a digit run, or a built superscript `Power` immediately
  // ahead of more numerator content, over a denominator (`a¹²bc/d`,
  // `"1a/b"`, `"a^2 bc/c"`). `:1781`/`:1786` need a SPACE before the
  // continuation — `grammar.ts`'s `numerator` production requires one at
  // that alternative, unlike the bare-adjacent `mini_sup`/`digit` forms.
  rule(
    "1746",
    { mini_sup: simple("mini_sup"), recursive_numerator: sequence("recursive_numerator") },
    (b) => [b.mini_sup, ...asArray(b.recursive_numerator)],
  );
  rule(
    "1751",
    { mini_sup: simple("mini_sup"), recursive_numerator: simple("recursive_numerator") },
    (b) => [b.mini_sup, b.recursive_numerator],
  );
  rule("1761", { digit: simple("digit"), recursive_numerator: simple("numerator") }, (b) => [
    b.digit,
    b.numerator,
  ]);
  rule("1766", { digit: simple("digit"), recursive_numerator: sequence("numerator") }, (b) => [
    b.digit,
    ...asArray(b.numerator),
  ]);
  // `:1771`/`:1776`: `digit`+`expr` — `alpha_numeric_values`'s own
  // `(number|n_ascii) >> alpha_numeric_values.as(:expr)` recursion
  // (`sub_sup.rb:259`), reached wherever a digit leads a mixed run feeding a
  // multi-character `base` (`"1a_x"` for the SIMPLE `expr`, `"1ab_x"`/
  // `"1a2_x"` for the SEQUENCE one — `:1054` then folds the base into an
  // array). `:1776` is one of the two blockers `SLICE_BOUNDARY`'s `"1x₂"`
  // row names (`:67` is the other, already ported by slice H) and one of the
  // two `:381`/`:441` need alongside `:1776` itself.
  rule("1771", { digit: simple("digit"), expr: sequence("expr") }, (b) => [
    b.digit,
    ...asArray(b.expr),
  ]);
  rule("1776", { digit: simple("digit"), expr: simple("expr") }, (b) => [b.digit, b.expr]);
  rule(
    "1781",
    { sup_exp: simple("sup"), recursive_numerator: simple("recursive_numerator") },
    (b) => [b.sup, b.recursive_numerator],
  );
  rule(
    "1786",
    { sup_exp: simple("sup"), recursive_numerator: sequence("recursive_numerator") },
    (b) => [b.sup, ...asArray(b.recursive_numerator)],
  );
  rule("1791", { frac: simple("frac"), expr: simple("expr") }, (b) => [b.frac, b.expr]);
  rule("1796", { frac: simple("frac"), exp: simple("exp") }, (b) => [b.frac, b.exp]);
  // A fraction followed by TWO OR MORE more `naryand_recursion` items under a
  // nary (no SIMPLE sibling exists in the gem for this shape — measured, see
  // the module header). Witness: `"∑_(k=0)^n n⒞k a^k b"`, `n⒞k` a `\choose`
  // `Frac` immediately followed by two bare naryand items `a^k` and `b`.
  rule("1801", { frac: simple("frac"), naryand_recursion: sequence("naryand") }, (b) => [
    b.frac,
    ...asArray(b.naryand),
  ]);

  // PREREQUISITE (slice A's `:1756`, registered here under the same id): an
  // atom folded onto a fraction's `recursive_numerator` (`a(b)/c`).
  rule("1756", { atom: simple("atom"), recursive_numerator: simple("numerator") }, (b) => [
    b.atom,
    b.numerator,
  ]);
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

  // `:1836`/`:1846`/`:1856`: `expBracket`'s own MISMATCHED-bracket
  // alternative (`grammar.ts`'s `mixBracketed`, e.g. `(a|`/`|a)`) resolves to
  // `{intermediate_exp:, expr:}` internally, and `factor`'s plain-paren arm
  // resolves to a bare `intermediate_exp` beside `exclamationSymbolsMaybe`'s
  // `!` — the three shapes `:71`/`:80` (single-key `intermediate_exp`) do NOT
  // catch, since those only match when NOTHING else rides along. Witnesses:
  // `"(a|b"` (SIMPLE `expr`), `"(a)!"` (`exclamation_symbol`), `"(a|bc"`
  // (SEQUENCE `expr`).
  rule("1836", { intermediate_exp: simple("exp"), expr: simple("expr") }, (b) => [b.exp, b.expr]);
  // `:1841` (`intermediate_exp`+`operator`) is NOT registered: every
  // `expBracket` path that pairs `intermediate_exp` with a further tag
  // either resolves that tag to `expr` (`:1836`/`:1856`, since a bare
  // `{operator:}` unwraps via `:62` before the parent ever sees it) or to
  // `exclamation_symbol` (`:1846`, `factor`'s own seq). No candidate input —
  // the 675 `unicodemath-tests` strings, the pinned corpus, and roughly a
  // hundred hand-built paren/operator combinations — fired it; the module
  // header's own "unreached, not proven unreachable" status applies. `:2777`,
  // its three-key `+expr` sibling below, is unreached for the same reason.
  rule(
    "1846",
    { intermediate_exp: simple("exp"), exclamation_symbol: simple("exclamation_symbol") },
    (b) => [b.exp, symbolsClass(b.exclamation_symbol)],
  );

  // ATOMS meeting `exclamation_symbols` (`!`/`!!`, `grammar.ts:705`) directly
  // rather than through `atoms`.
  rule("1851", { atom: simple("atom"), exclamation_symbol: simple("exclamation_symbol") }, (b) => [
    b.atom,
    symbolsClass(b.exclamation_symbol),
  ]);
  rule("1856", { intermediate_exp: simple("exp"), expr: sequence("expr") }, (b) => [
    b.exp,
    ...asArray(b.expr),
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

  // The five `slashed_value`x`expr`/`exp` combos `:69`/`:78` (both already
  // ported, `slashedValues`/`sequenceSlashedValues`) leave paired with more
  // content: SIMPLE `slashed_value`+SIMPLE `expr` (`"a\'b"`), the same pair
  // through the `exp` key `masked_recursive_value`'s own recursion opens up
  // (`"1(a\'b)"`), SEQUENCE `slashed_value` (two-plus adjacent backslash
  // escapes, `"\a2b c"`/`"\a2b cd"`) against SIMPLE/SEQUENCE `expr`, and
  // SIMPLE `slashed_value` against SEQUENCE `expr` (`"a\'bc"`).
  rule("1894", { slashed_value: simple("value"), expr: simple("expr") }, (b) => [
    slashedValues(b.value),
    b.expr,
  ]);
  rule("1899", { slashed_value: simple("value"), exp: simple("expr") }, (b) => [
    slashedValues(b.value),
    b.expr,
  ]);
  rule("1904", { slashed_value: sequence("values"), expr: simple("expr") }, (b) => [
    ...sequenceSlashedValues(asArray(b.values)),
    b.expr,
  ]);
  rule("1909", { slashed_value: sequence("values"), expr: sequence("expr") }, (b) => [
    ...sequenceSlashedValues(asArray(b.values)),
    ...asArray(b.expr),
  ]);
  rule("1914", { slashed_value: simple("value"), expr: sequence("expr") }, (b) => [
    slashedValues(b.value),
    ...asArray(b.expr),
  ]);

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
  // `:1919`, the SEQUENCE-`sub` twin, is slice F's (below).
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

  // Slice J: the UNMASKED paren-prefix pair — `paren_close_prefix`+`open_paren`
  // and `paren_open_prefix`+`close_paren`, each built as `[Number(""), paren]`
  // so the size-prefix SEQUENCE-paren rules downstream (`:2650` et al.) can
  // consume it uniformly, with an EMPTY size where the masked triple below
  // carries a real digit run. Reached when the prefix's own inner mismatch
  // (`grammar.ts`'s `openParen`/`closeParen`, each trying the OTHER bracket
  // kind first) consumes a bracket that never gets a matching partner until
  // the outer `expBracket` closes: `"├]a┤["` fires both at once (`├`/`┤` are
  // `paren_open_prefix`/`paren_close_prefix`'s own glyphs, distinct from the
  // MASKED triple's `\left`/`\right`, which resolve through `:2536`/`:2527`
  // instead whenever real content sits between the prefix and its own
  // matching bracket).
  rule("2010", { paren_close_prefix: simple("prefix"), open_paren: simple("paren") }, (b) => [
    newNumber(""),
    b.paren,
  ]);
  rule("2015", { paren_open_prefix: simple("prefix"), close_paren: simple("paren") }, (b) => [
    newNumber(""),
    b.paren,
  ]);

  // FENCED: a fence with nothing inside — `()` — is the one shape whose value
  // is the EMPTY array, not a one-element list around a binding.
  rule("2020", { open_paren: simple("open_paren"), close_paren: simple("close_paren") }, (b) =>
    newFenced(parenClass(b.open_paren), [], parenClass(b.close_paren)),
  );

  // PREREQUISITES of slice G1's SEQUENCE-paren witnesses, slice A's claims
  // (`:2055`, `:2067`) registered here under the same ids: a size-prefix digit
  // string and the paren it prefixes, as `[mask, paren]`. `:2055` is the open
  // side (`├1(`), `:2067` the close side (`┤1)`).
  // PREREQUISITES of `:3085`, registered under the ids slice A claims (`:2055`,
  // `:2067`; the orchestrator dedupes): a `\left`/`\right` mask digit and its
  // paren arrive as one three-key hash, and this pair is what turns it into the
  // `[mask, paren]` run `:3085` reads `first`/`last` of.
  rule(
    "2055",
    {
      paren_open_prefix: simple("paren_open_prefix"),
      open_paren_mask: simple("open_paren_mask"),
      open_paren: simple("open_paren"),
    },
    (b) => [b.open_paren_mask, b.open_paren],
  );
  // Slice J: `:2061`/`:2073`, `:2055`/`:2067`'s own mismatched-bracket
  // twins — a `close_paren_mask` (or `open_paren_mask`) prefixed by the
  // OTHER prefix keyword, the masked sibling of the unmasked `:2010`/`:2015`
  // pair above. Witness: `"├1]a┤4["` fires both `:2061` and `:2073` at once.
  rule(
    "2061",
    {
      paren_close_prefix: simple("paren_close_prefix"),
      close_paren_mask: simple("close_paren_mask"),
      open_paren: simple("open_paren"),
    },
    (b) => [b.close_paren_mask, b.open_paren],
  );
  rule(
    "2067",
    {
      paren_close_prefix: simple("paren_close_prefix"),
      close_paren_mask: simple("close_paren_mask"),
      close_paren: simple("close_paren"),
    },
    (b) => [b.close_paren_mask, b.close_paren],
  );
  rule(
    "2073",
    {
      paren_open_prefix: simple("paren_open_prefix"),
      open_paren_mask: simple("open_paren_mask"),
      close_paren: simple("close_paren"),
    },
    (b) => [b.open_paren_mask, b.close_paren],
  );

  // `:2079`: `:2085`'s SEQUENCE-`diacritics` twin (`char`+`diacritics`+
  // `number`), reached by a run of two-plus diacritics ahead of a trailing
  // number: `"(𝑘−𝑧−1)⒞𝑘"`'s own `⒞` (`\choose`) leads with a `char`+
  // `diacritics` pair here on the oracle.
  rule(
    "2079",
    { char: simple("char"), diacritics: sequence("diacritics"), number: simple("number") },
    (b) => [b.char, ...asArray(b.diacritics), newNumber(b.number)],
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

  // An atom, a binary symbol and a fraction's `recursive_numerator` (`a∘b/c`).
  rule(
    "2048",
    {
      atom: simple("atom"),
      binary_symbols: simple("symbols"),
      recursive_numerator: simple("numerator"),
    },
    (b) => [b.atom, symbolsClass(BINARY_SYMBOLS.get(rubyToS(b.symbols)) ?? b.symbols), b.numerator],
  );

  // `:2035` (`atom`+SEQUENCE `atoms`+`recursive_denominator`) and `:2041`
  // (`atom`+`binary_symbols`+`factor`, `:2048`'s own `factor` twin above) are
  // NOT registered: the ATOMS-meeting-FRACTION section of the module header
  // already named both as outside a prior slice's boundary without claiming
  // unreachability, and this slice's own search — the 675 `unicodemath-tests`
  // strings plus roughly two dozen hand-built atom-run/binary-symbol inputs —
  // found no input firing either. Unreached, not proven unreachable.

  // PREREQUISITES (slice A's `:2055`/`:2067`, registered here under the same
  // ids): a size-prefixed paren (`├1(`, `┤2)`) folds its mask and its paren
  // into the two-element run `:2685`/`:2707` read.

  // `:2097` (`sub_script`+`mini_sup`+`operand`) is NOT registered: no input
  // among the 675 `unicodemath-tests` strings or this slice's own hand-built
  // sub-script/mini-sup/operand combinations fired it. Unreached, not proven
  // unreachable.

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
  // simple` shape; `:2203`, `atop`'s SEQUENCE-numerator twin, is registered
  // just below, with the other nine SEQUENCE-shaped sites (Slice E's own
  // header comment above this rule family). `choose` alone builds `Fenced`,
  // not `Frac` directly: the gem
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

  // `\atop` with a SEQUENCE numerator (`a(b)\atop c`).
  rule(
    "2203",
    {
      numerator: sequence("numerator"),
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
  // `:2245`/`:2251`: `factor`+SEQUENCE `operand`+`naryand_recursion`
  // (SEQUENCE/SIMPLE). `:2251` is one of the two blockers Slice H's own
  // `SLICE_BOUNDARY` names for its `:346` row (`:2251` itself) and reuses the
  // SAME witness that row already carries — the long `"1I(x,x') = g(x,x')
  // […] ∫_S▒ρ(x,x',x'')I(x',x'')ⅆx'']"` input, traced on the oracle to fire
  // both `:346` and `:2251` together. `:2245`, its SEQUENCE-`naryand_recursion`
  // twin, is NOT registered: no input tried (including every 675
  // `unicodemath-tests` string) fires it. Unreached, not proven unreachable.
  rule(
    "2251",
    {
      factor: simple("factor"),
      operand: sequence("operand"),
      naryand_recursion: simple("naryand_recursion"),
    },
    (b) => [b.factor, ...asArray(b.operand), b.naryand_recursion],
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
  // `:2275`/`:2281`/`:2287`: `factor`+`operand`+`exp` (`:2269`/`:2317`'s own
  // `exp`-keyed siblings — `exp` is `spacedExpBracket`'s tag, reached inside a
  // mismatched-bracket or table-cell run rather than `expression`'s `expr`).
  // Witnesses: a long real `unicodemath-tests` relation chain for the
  // SEQUENCE-`exp` pair, `"∑_1\of (\forall y\exists 1) …"` for the SIMPLE
  // triple, and `"f̂(ξ)=∫_-∞^∞▒f(x)ⅇ^(-2πⅈxξ)ⅆx"` (`unicodemath-tests`'
  // Fourier-transform example) for the SEQUENCE-`operand` form.
  rule(
    "2275",
    { factor: simple("factor"), operand: simple("operand"), exp: sequence("exp") },
    (b) => [b.factor, b.operand, ...asArray(b.exp)],
  );
  rule(
    "2281",
    { factor: simple("factor"), operand: simple("operand"), exp: simple("exp") },
    (b) => [b.factor, b.operand, b.exp],
  );
  rule(
    "2287",
    { factor: simple("factor"), operand: sequence("operand"), exp: sequence("exp") },
    (b) => [b.factor, ...asArray(b.operand), ...asArray(b.exp)],
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

  // `:2323` (`factor`+`operand`+`recursive_denominator`) is NOT registered:
  // no input among the 675 `unicodemath-tests` strings or this slice's own
  // candidates fires it. Unreached, not proven unreachable.

  rule(
    "2329",
    { factor: simple("factor"), expr: simple("expr"), expression: simple("expression") },
    (b) => [b.factor, b.expr, b.expression],
  );
  // `:2335`: `sub_script`+`mini_sub`+`exp_iteration`, `:2103`'s own
  // multi-key subscript-run sibling. Witness: `"a_δ₁ρ₁σ₂^3β"` (a three-symbol
  // subscript run under a superscript).
  rule(
    "2335",
    {
      sub_script: simple("sub_script"),
      mini_sub: simple("mini_sub"),
      exp_iteration: simple("exp"),
    },
    (b) => [b.sub_script, b.mini_sub, b.exp],
  );
  // `:2341` (`intermediate_exp`+`expr`+`expression`, `:2329`'s own
  // `intermediate_exp` twin) is NOT registered for the same structural
  // reason as `:1841`/`:2777` above: no grammar path pairs a bare
  // `intermediate_exp` with a second `expr`/`expression` tier without first
  // resolving through `:1836`/`:1856`. Unreached, not proven unreachable.
  // FRACTION concluded — `bevelled` (`\sdiv`/`\sdivide`/`\sfrac`/`&#x2044;`),
  // `ldiv` (`\ldiv`/`&#x2215;`) and `no_display_style` (`\ndiv`/`\oslash`/
  // `&#x2298;`), each still `numerator: simple, denominator: simple`. The last
  // one's options are NOT `{no_display_style: false}` despite the key name:
  // `transform.rb:2377` passes `{displaystyle: false}`, and only its
  // SEQUENCE-denominator twin `:2371` (registered below, with the other Slice
  // E sites) passes the differently-named option — measured, not reconciled,
  // because the gem itself is inconsistent between the two.
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

  // The SEQUENCE-denominator twins of `:2347`/`:2353`/`:2377`. `:2371` passes
  // `{no_display_style: false}` where `:2377` passes `{displaystyle: false}`,
  // exactly as the gem writes them.
  rule(
    "2359",
    {
      numerator: simple("numerator"),
      bevelled: simple("bevelled"),
      denominator: sequence("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { bevelled: true }),
  );
  rule(
    "2365",
    {
      numerator: simple("numerator"),
      ldiv: simple("ldiv"),
      denominator: sequence("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { ldiv: true }),
  );
  rule(
    "2371",
    {
      numerator: simple("numerator"),
      no_display_style: simple("no_display_style"),
      denominator: sequence("denominator"),
    },
    (b) => fractions(b.numerator, b.denominator, { no_display_style: false }),
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

  // FRACTION (slice E): a `frac` leading a relation (`¹/₂≤₃/b`). The symbol
  // goes straight to `symbols_class`, with no `RELATIONAL_SYMBOLS` lookup.
  rule(
    "2393",
    { frac: simple("frac"), relational_symbols: simple("symbols"), expr: simple("expr") },
    (b) => [b.frac, symbolsClass(b.symbols), b.expr],
  );

  // `:2403` (`base`+SEQUENCE `sub`+`sub_recursion`) is NOT registered: its
  // `Constants::BINARY_FUNCTIONS` branch reads a bare local `sub_value` the
  // block never assigns (`transform.rb:2407`) — the SAME typo `:1078`'s
  // twin branch carries (`transform.rb:1081`, also unregistered) — so taking
  // that branch on the oracle would raise `NameError`/`NoMethodError` rather
  // than return a value, a defect proven by reading the source (`grep -n
  // sub_value unicode_math/transform.rb` finds no assignment in either
  // block). Reaching it needs a `base` whose `class_name` is one of
  // `Constants::BINARY_FUNCTIONS` with no `parameter_one` yet, immediately
  // followed by a SEQUENCE `sub`; slice F tried this shape and found no
  // reaching input, and this slice's own search — the 675 `unicodemath-tests`
  // strings plus every `BINARY_FUNCTIONS` name paired with a multi-character
  // subscript — found none either, buggy branch or not. Unreached, not
  // proven unreachable.

  // `:2426`: `mini_intermediate_exp`+`sub_operators`+SEQUENCE `sub_recursions`
  // — `:640`/`:646`'s own `sub_operators`+`sub_recursions` pair (registered
  // above), here with a `mini_intermediate_exp` (a subscript-sized
  // parenthesised run, `subParen`'s own `mini_intermediate_exp` alt) riding
  // ahead of it. The `Math::Number` it builds is mini-sub-sized, unlike
  // `:640`'s `Math::Symbols::Symbol` — transcribed as measured, the gem's own
  // choice for this one call site. Witness: `"N₀₊₍₂₋₅₎₌₋₃"`.
  rule(
    "2426",
    {
      mini_intermediate_exp: simple("mini_exp"),
      sub_operators: simple("sub_operators"),
      sub_recursions: sequence("sub_recursions"),
    },
    (b) => [
      b.mini_exp,
      miniSubNumber(SUB_OPERATORS_INVERTED.get(rubyToS(b.sub_operators)) ?? ""),
      ...asArray(b.sub_recursions),
    ],
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

  // FENCED: `:2436`'s SEQUENCE-`opener` twin. The opener is a run whose FIRST
  // element may be a `Number` (a size prefix, `\left1(`) and whose LAST is the
  // paren itself. `[opener, closer].include?("|")` compares the ARRAY to "|",
  // which is never equal, so only `closer` can trigger the discarded
  // `unfenced_value` call (kept, since it can raise).
  rule(
    "2457",
    { opener: sequence("opener"), operand: simple("operand"), closer: simple("closer") },
    (b) => {
      const opener = asArray(b.opener);
      const options: Record<string, unknown> = {};
      applyParenMask(options, opener, "open");
      if (textEquals(b.closer, "|")) unfencedValue(b.operand, true);
      return newFenced(
        symbolsClass(opener[opener.length - 1]),
        [b.operand],
        parenClass(b.closer),
        options,
      );
    },
  );

  rule(
    "2475",
    { open_paren: simple("open_paren"), frac: simple("frac"), close_paren: simple("close_paren") },
    (b) => newFenced(parenClass(b.open_paren), [b.frac], parenClass(b.close_paren)),
  );

  // FENCED: every `open_paren` + one content key + `close_paren` shape below
  // wraps its content in a one-element list between the two parens, and
  // differs only in the key it binds. The paren guard is `parenClass`
  // (`paren.is_a?(Slice) ? Utility.symbols_class(paren) : paren`) in each.
  // Every slashed run — `(\a2)` — already came through the grammar as a list of
  // `Symbol`/`Number` nodes; `sequence_slashed_values` rewrites each in place.
  rule(
    "2485",
    {
      open_paren: simple("open_paren"),
      slashed_value: sequence("values"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        parenClass(b.open_paren),
        sequenceSlashedValues(asArray(b.values)),
        parenClass(b.close_paren),
      ),
  );

  rule(
    "2495",
    {
      open_paren: simple("open_paren"),
      phantom: simple("phantom"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.phantom], parenClass(b.close_paren)),
  );
  rule(
    "2505",
    {
      open_paren: simple("open_paren"),
      unary_function: simple("unary_function"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.unary_function], parenClass(b.close_paren)),
  );
  rule(
    "2515",
    { open_paren: simple("open_paren"), rect: simple("rect"), close_paren: simple("close_paren") },
    (b) => newFenced(parenClass(b.open_paren), [b.rect], parenClass(b.close_paren)),
  );

  rule(
    "2525",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      paren_close_prefix: simple("close_prefix"),
    },
    (b) =>
      newFenced(parenClass(b.open_paren), [b.factor], symbolsClass(b.close_prefix), {
        close_prefixed: true,
      }),
  );

  // The paren is looked up unconditionally here — `paren_open_prefix` only
  // ever binds a Slice — where every other rule guards it with `parenClass`.
  rule(
    "2536",
    {
      paren_open_prefix: simple("open_paren"),
      factor: simple("factor"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(symbolsClass(b.open_paren), [b.factor], parenClass(b.close_paren), {
        open_prefixed: true,
      }),
  );

  rule(
    "2547",
    { open_paren: simple("open_paren"), nary: simple("nary"), close_paren: simple("close_paren") },
    (b) => newFenced(parenClass(b.open_paren), [b.nary], parenClass(b.close_paren)),
  );
  rule(
    "2557",
    {
      open_paren: simple("open_paren"),
      sub_exp: simple("sub_exp"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.sub_exp], parenClass(b.close_paren)),
  );
  rule(
    "2567",
    {
      open_paren: simple("open_paren"),
      subsup_exp: simple("subsup_exp"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.subsup_exp], parenClass(b.close_paren)),
  );
  rule(
    "2577",
    {
      open_paren: simple("open_paren"),
      unary_subsup: simple("subsup"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.subsup], parenClass(b.close_paren)),
  );
  rule(
    "2587",
    {
      open_paren: simple("open_paren"),
      mini_sup: simple("mini_sup"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.mini_sup], parenClass(b.close_paren)),
  );

  // A mini-sized fence: both parens are the plain-text paren the entity stands
  // for (`Hash#key`, `nil.to_s` on a miss), rebuilt as mini-sub-sized symbols
  // around the bound SEQUENCE.
  rule(
    "2597",
    {
      sub_open_paren: simple("open_paren"),
      mini_expr: sequence("mini_expr"),
      sub_close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        miniSubSymbol(subParenKey(UNICODEMATH_SUB_PARENTHESIS_OPEN, b.open_paren)),
        asArray(b.mini_expr),
        miniSubSymbol(subParenKey(UNICODEMATH_SUB_PARENTHESIS_CLOSE, b.close_paren)),
      ),
  );

  rule(
    "2609",
    { open_paren: simple("open_paren"), text: simple("text"), close_paren: simple("close_paren") },
    (b) => newFenced(parenClass(b.open_paren), [newText(b.text)], parenClass(b.close_paren)),
  );

  // A masked (`├1(`) fence around a `frac`: the size-prefixed side(s) arrive as
  // `[Number, paren]` sequences, and the fence's own paren is the LAST element.
  rule(
    "2685",
    {
      open_paren: sequence("open_paren"),
      frac: simple("frac"),
      close_paren: sequence("close_paren"),
    },
    (b) => {
      const options: Record<string, unknown> = {};
      applyParenMask(options, asArray(b.open_paren), "open");
      applyParenMask(options, asArray(b.close_paren), "close");
      const fenced = newFenced(
        symbolsClass(asArray(b.open_paren).at(-1)),
        [b.frac],
        symbolsClass(asArray(b.close_paren).at(-1)),
      );
      fenced.fields.options = options;
      return fenced;
    },
  );
  rule(
    "2707",
    {
      open_paren: simple("open_paren"),
      frac: simple("frac"),
      close_paren: sequence("close_paren"),
    },
    (b) => {
      const options: Record<string, unknown> = {};
      applyParenMask(options, asArray(b.close_paren), "close");
      const fenced = newFenced(
        parenClass(b.open_paren),
        [b.frac],
        symbolsClass(asArray(b.close_paren).at(-1)),
      );
      fenced.fields.options = options;
      return fenced;
    },
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

  rule(
    "2640",
    {
      open_paren: simple("open_paren"),
      accents: subtree("accents"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(parenClass(b.open_paren), [unicodeAccents(b.accents)], parenClass(b.close_paren)),
  );

  // FENCED with a SEQUENCE paren: the run's first element may be a size-prefix
  // `Number` (see `applyParenMask`) and its last is the paren. Only `:2650`
  // tests for `"|"`, and only on the simple side, because an Array never
  // equals a String.
  rule(
    "2650",
    {
      open_paren: sequence("open_paren"),
      factor: simple("factor"),
      close_paren: simple("close_paren"),
    },
    (b) => {
      const open = asArray(b.open_paren);
      const options: Record<string, unknown> = {};
      applyParenMask(options, open, "open");
      const newFactor = textEquals(b.close_paren, "|") ? unfencedValue(b.factor, true) : b.factor;
      return newFenced(
        symbolsClass(open[open.length - 1]),
        [newFactor],
        parenClass(b.close_paren),
        options,
      );
    },
  );

  // `:2650` with a `paren_close_prefix` close instead. Only the OPEN side's
  // mask is applied; the close side sets no `close_prefixed`, unlike `:2525`.
  rule(
    "2668",
    {
      open_paren: sequence("open_paren"),
      factor: simple("factor"),
      paren_close_prefix: simple("close_prefix"),
    },
    (b) => {
      const open = asArray(b.open_paren);
      const options: Record<string, unknown> = {};
      applyParenMask(options, open, "open");
      return newFenced(
        symbolsClass(open[open.length - 1]),
        [b.factor],
        symbolsClass(b.close_prefix),
        options,
      );
    },
  );

  // `:2685` and `:2707` (SEQUENCE parens around a `frac`) are slice E's.

  // Both parens SEQUENCEs: each side's mask, open first.
  rule(
    "2724",
    {
      open_paren: sequence("open_paren"),
      factor: simple("factor"),
      close_paren: sequence("close_paren"),
    },
    (b) => {
      const open = asArray(b.open_paren);
      const close = asArray(b.close_paren);
      const options: Record<string, unknown> = {};
      applyParenMask(options, open, "open");
      applyParenMask(options, close, "close");
      return newFenced(
        symbolsClass(open[open.length - 1]),
        [b.factor],
        symbolsClass(close[close.length - 1]),
        options,
      );
    },
  );

  // `¬` after an opener: the negated operator plus a literal `&#x338;` strike,
  // wrapped in a `Formula`.
  rule(
    "2746",
    {
      open_paren: simple("open_paren"),
      negated_operator: simple("operator"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        parenClass(b.open_paren),
        [newFormula([symbolsClass(b.operator), newBareSymbol("&#x338;")])],
        parenClass(b.close_paren),
      ),
  );

  // A parenthesised TABLE is the table itself with its two parens REPLACED:
  // the fence is never built. Both writes look the paren up unconditionally.
  rule(
    "2761",
    {
      open_paren: simple("open_paren"),
      table: simple("table"),
      paren_close_prefix: simple("close_paren"),
    },
    (b) => parenthesisedTable(b.table, b.open_paren, b.close_paren),
  );
  rule(
    "2769",
    {
      open_paren: simple("open_paren"),
      table: simple("table"),
      close_paren: simple("close_paren"),
    },
    (b) => parenthesisedTable(b.table, b.open_paren, b.close_paren),
  );

  // `:2777` (`intermediate_exp`+`operator`+`expr`) is NOT registered — see
  // `:1841`/`:2341` above for why: `intermediate_exp` never survives as a
  // sibling of a bare `operator` tag, only of `expr`/`exclamation_symbol`
  // through `expBracket`'s and `factor`'s own productions.

  // ATOMS meeting a bare `operator` and a `frac` directly (`:2787`) and that
  // shape's SEQUENCE-`expr` extension (`:3074`) are deferred with `:30`
  // above: no probed input reached either. Slice J re-tried deliberately —
  // every `BINARY_FUNCTIONS`/atom pairing this file's `element`/`atom`
  // productions can build, ahead of a `frac`, plus the 675
  // `unicodemath-tests` strings — and found no reaching input either;
  // unreached, not proven unreachable.

  // An operator, a `frac` and a SEQUENCE `expr` (`++¹/₂ḟa`). The ATOMS-led
  // `:2787` and its `expr` extension `:3074` are not registered: no probed
  // input reached either (see the E claim file).
  rule(
    "2797",
    { operator: simple("operator"), frac: simple("frac"), expr: sequence("expr") },
    (b) => [symbolsClass(b.operator), b.frac, ...asArray(b.expr)],
  );

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
  // NARY rule are slice F's, registered in its block at the end.
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

  // A `\left`/`\right` pair whose opener or closer arrived as a SEQUENCE — the
  // mask digits (a `Number`) followed by the paren itself — so the size and the
  // `prefixed` flag ride in the Fenced's options: `1.25**digits` em, both
  // `minsize` and `maxsize`, left off when the digits are the empty string.
  rule(
    "3085",
    {
      open_paren: sequence("open_paren"),
      factor: simple("factor"),
      exp: sequence("exp"),
      close_paren: sequence("close_paren"),
    },
    (b) => {
      const options: Record<string, unknown> = {};
      const opener = asArray(b.open_paren);
      const closer = asArray(b.close_paren);
      const openFirst = opener[0];
      if (isDraft(openFirst) && openFirst.kind === "number") {
        const mask = `${rubyFloatToS(1.25 ** rubyToI(rubyToS(draftValue(openFirst))))}em`;
        options.open_prefixed = true;
        if (draftValue(openFirst) !== "") options.open_paren = { minsize: mask, maxsize: mask };
      }
      const closeFirst = closer[0];
      if (isDraft(closeFirst) && closeFirst.kind === "number") {
        const mask = `${rubyFloatToS(1.25 ** rubyToI(rubyToS(draftValue(closeFirst))))}em`;
        options.close_prefixed = true;
        if (draftValue(closeFirst) !== "") options.close_paren = { minsize: mask, maxsize: mask };
      }
      const fenced = newFenced(
        symbolsClass(opener[opener.length - 1]),
        [b.factor, ...asArray(b.exp)],
        symbolsClass(closer[closer.length - 1]),
      );
      fenced.fields.options = options;
      return fenced;
    },
  );

  fenced(
    "3108",
    {
      unary_function: simple("unary"),
      exp: sequence("exp"),
    },
    (b) => [b.unary, ...asArray(b.exp)],
  );

  // `:3119` and `:3143`: a `|` on either side unwraps the factor's own fence
  // first (`paren_specific`), then the Fenced leads a naryand-recursion run.
  rule(
    "3119",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      close_paren: simple("close_paren"),
      naryand_recursion: sequence("naryand_recursion"),
    },
    (b) => {
      const bar = textEquals(b.open_paren, "|") || textEquals(b.close_paren, "|");
      const newFactor = bar ? unfencedValue(b.factor, true) : b.factor;
      const fenced = newFenced(parenClass(b.open_paren), [newFactor], parenClass(b.close_paren));
      return [fenced, ...asArray(b.naryand_recursion)];
    },
  );

  fenced(
    "3132",
    {
      unary_subsup: simple("unary_subsup"),
      exp: simple("exp"),
    },
    (b) => [b.unary_subsup, b.exp],
  );

  rule(
    "3143",
    {
      open_paren: simple("open_paren"),
      factor: simple("factor"),
      close_paren: simple("close_paren"),
      naryand_recursion: simple("naryand_recursion"),
    },
    (b) => {
      const bar = textEquals(b.open_paren, "|") || textEquals(b.close_paren, "|");
      const newFactor = bar ? unfencedValue(b.factor, true) : b.factor;
      const fenced = newFenced(parenClass(b.open_paren), [newFactor], parenClass(b.close_paren));
      return [fenced, b.naryand_recursion];
    },
  );

  fenced(
    "3167",
    {
      mini_sub: simple("mini_sub"),
      exp: sequence("exp"),
    },
    (b) => [b.mini_sub, ...asArray(b.exp)],
  );

  fenced(
    "3178",
    {
      mini_sub_sup: simple("mini_sub_sup"),
      exp: sequence("exp"),
    },
    (b) => [b.mini_sub_sup, ...asArray(b.exp)],
  );

  fenced(
    "3200",
    {
      mini_sup: simple("mini_sup"),
      exp: sequence("exp"),
    },
    (b) => [b.mini_sup, ...asArray(b.exp)],
  );

  rule(
    "2983",
    {
      open_paren: simple("open_paren"),
      pre_script: simple("pre_script"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.pre_script], parenClass(b.close_paren)),
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

  // FRACTION (slice E): a bracketed run led by a vulgar-fraction entity
  // (`:3277`, SEQUENCE `exp`; its `expr`-keyed sibling `:3266` is not
  // registered — no probed input reached it) or by a `frac` (`:3411`/`:3422`,
  // simple/SEQUENCE `exp`).
  rule(
    "3277",
    {
      open_paren: simple("open_paren"),
      unicode_fractions: simple("fraction"),
      exp: sequence("exp"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        parenClass(b.open_paren),
        [unicodeFractions(b.fraction), ...asArray(b.exp)],
        parenClass(b.close_paren),
      ),
  );
  rule(
    "3411",
    {
      open_paren: simple("open_paren"),
      frac: simple("frac"),
      exp: simple("exp"),
      close_paren: simple("close_paren"),
    },
    (b) => newFenced(parenClass(b.open_paren), [b.frac, b.exp], parenClass(b.close_paren)),
  );
  rule(
    "3422",
    {
      open_paren: simple("open_paren"),
      frac: simple("frac"),
      exp: sequence("exp"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(parenClass(b.open_paren), [b.frac, ...asArray(b.exp)], parenClass(b.close_paren)),
  );

  fenced(
    "3255",
    {
      accents: subtree("accent"),
      exp: sequence("exp"),
    },
    (b) => [unicodeAccents(b.accent), ...asArray(b.exp)],
  );

  fenced(
    "3288",
    {
      unicode_symbols: simple("symbol"),
      exp: sequence("exp"),
    },
    (b) => [symbolsClass(b.symbol), ...asArray(b.exp)],
  );

  fenced(
    "3299",
    {
      unicode_symbols: simple("symbol"),
      exp: simple("exp"),
    },
    (b) => [symbolsClass(b.symbol), b.exp],
  );

  rule(
    "3310",
    {
      open_paren: simple("open_paren"),
      unicode_symbols: simple("symbol"),
      exp: simple("exp"),
      close_paren: simple("close_paren"),
      sup: simple("sup"),
    },
    (b) =>
      newPower(
        newFenced(
          parenClass(b.open_paren),
          [symbolsClass(b.symbol), b.exp],
          parenClass(b.close_paren),
        ),
        b.sup,
      ),
  );

  fenced(
    "3345",
    {
      sub_exp: simple("sub_exp"),
      exp: sequence("exp"),
    },
    (b) => [b.sub_exp, ...asArray(b.exp)],
  );

  fenced(
    "3367",
    {
      sub_exp: simple("sub_exp"),
      exp: simple("exp"),
    },
    (b) => [b.sub_exp, b.exp],
  );

  fenced(
    "3389",
    {
      sup_exp: simple("sup_exp"),
      exp: simple("exp"),
    },
    (b) => [b.sup_exp, b.exp],
  );

  fenced(
    "3400",
    {
      monospace: simple("monospace"),
      exp: sequence("exp"),
    },
    (b) => [b.monospace, ...asArray(b.exp)],
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

  fenced(
    "3455",
    {
      subsup_exp: simple("subsup_exp"),
      exp: sequence("exp"),
    },
    (b) => [b.subsup_exp, ...asArray(b.exp)],
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

  fenced(
    "3499",
    {
      symbol: simple("symbol"),
      expr: sequence("expr"),
    },
    (b) => [symbolsClass(b.symbol), ...asArray(b.expr)],
  );

  fenced(
    "3510",
    {
      factor: sequence("factor"),
      exp: sequence("exp"),
    },
    (b) => [...asArray(b.factor), ...asArray(b.exp)],
  );

  fenced(
    "3521",
    {
      factor: sequence("factor"),
    },
    (b) => b.factor,
  );

  fenced(
    "3531",
    {
      factor: simple("factor"),
      operand: simple("operand"),
    },
    (b) => [b.factor, b.operand],
  );

  fenced(
    "3542",
    {
      factor: simple("factor"),
      operand: sequence("operand"),
    },
    (b) => [b.factor, ...asArray(b.operand)],
  );

  fenced(
    "3553",
    {
      factor: sequence("factor"),
      operand: sequence("operand"),
    },
    (b) => [...asArray(b.factor), ...asArray(b.operand)],
  );

  fenced(
    "3564",
    {
      text: simple("text"),
      operand: simple("operand"),
      exp: simple("exp"),
    },
    (b) => [newText(b.text), b.operand, b.exp],
  );

  fenced(
    "3576",
    {
      text: simple("text"),
      operand: simple("operand"),
      exp: sequence("exp"),
    },
    (b) => [newText(b.text), b.operand, ...asArray(b.exp)],
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

  fenced(
    "3640",
    {
      fonts: simple("fonts"),
      exp: simple("exp"),
    },
    (b) => [b.fonts, b.exp],
  );

  fenced(
    "3651",
    {
      operator: simple("operator"),
      exp: sequence("exp"),
    },
    (b) => [symbolsClass(b.operator), ...asArray(b.exp)],
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

  fenced(
    "3676",
    {
      operator: simple("operator"),
      exp: simple("exp"),
    },
    (b) => [symbolsClass(b.operator), b.exp],
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

  fenced(
    "3711",
    {
      factor: simple("factor"),
      sup_exp: simple("sup_exp"),
      exp: sequence("exp"),
    },
    (b) => [b.factor, b.sup_exp, ...asArray(b.exp)],
  );

  rule(
    "3723",
    {
      open_paren: simple("open_paren"),
      sub_exp: simple("sub_exp"),
      exp: simple("exp"),
      close_paren: simple("close_paren"),
      sup: simple("sup"),
    },
    (b) =>
      newPower(
        newFenced(parenClass(b.open_paren), [b.sub_exp, b.exp], parenClass(b.close_paren)),
        unfencedValue(b.sup, true),
      ),
  );

  rule(
    "3739",
    {
      open_paren: simple("open_paren"),
      sub_exp: simple("sub_exp"),
      exp: sequence("exp"),
      close_paren: simple("close_paren"),
      sup: simple("sup"),
    },
    (b) =>
      newPower(
        newFenced(
          parenClass(b.open_paren),
          [b.sub_exp, ...asArray(b.exp)],
          parenClass(b.close_paren),
        ),
        unfencedValue(b.sup, true),
      ),
  );

  rule(
    "3755",
    {
      open_paren: simple("open_paren"),
      operator: simple("operator"),
      exp: simple("exp"),
      close_paren: simple("close_paren"),
      sup: simple("sup"),
    },
    (b) =>
      newPower(
        newFenced(
          parenClass(b.open_paren),
          [symbolsClass(b.operator), b.exp],
          parenClass(b.close_paren),
        ),
        b.sup,
      ),
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

  fenced(
    "3792",
    {
      factor: simple("factor"),
      operand: simple("operand"),
      exp: sequence("exp"),
    },
    (b) => [b.factor, b.operand, ...asArray(b.exp)],
  );

  fenced(
    "3804",
    {
      factor: simple("factor"),
      operand: sequence("operand"),
      exp: sequence("exp"),
    },
    (b) => [b.factor, ...asArray(b.operand), ...asArray(b.exp)],
  );

  fenced(
    "3840",
    {
      monospace: simple("monospace"),
      relational_symbols: simple("symbol"),
      expr: simple("expr"),
      exp: sequence("exp"),
    },
    (b) => [b.monospace, symbolsClass(b.symbol), b.expr, ...asArray(b.exp)],
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

  // INTERVAL: `(1,2]`, `[1,2)`, `]1,2[` — a left value, the comma as a symbol,
  // a right value; `symbols_class` again unguarded on both parens.
  rule(
    "3897",
    {
      open_paren: simple("open_paren"),
      left_value: simple("left_value"),
      comma: simple("comma"),
      right_value: simple("right_value"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        symbolsClass(b.open_paren),
        [b.left_value, symbolsClass(b.comma), b.right_value],
        symbolsClass(b.close_paren),
      ),
  );

  rule(
    "3909",
    {
      open_paren: simple("open_paren"),
      left_value: simple("left_value"),
      comma: simple("comma"),
      right_value: sequence("right_value"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        symbolsClass(b.open_paren),
        [b.left_value, symbolsClass(b.comma), filterValues(b.right_value)],
        symbolsClass(b.close_paren),
      ),
  );

  rule(
    "3922",
    {
      open_paren: simple("open_paren"),
      left_value: sequence("left_value"),
      comma: simple("comma"),
      right_value: simple("right_value"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        symbolsClass(b.open_paren),
        [filterValues(b.left_value), symbolsClass(b.comma), b.right_value],
        symbolsClass(b.close_paren),
      ),
  );

  rule(
    "3935",
    {
      open_paren: simple("open_paren"),
      left_value: sequence("left_value"),
      comma: simple("comma"),
      right_value: sequence("right_value"),
      close_paren: simple("close_paren"),
    },
    (b) =>
      newFenced(
        symbolsClass(b.open_paren),
        [filterValues(b.left_value), symbolsClass(b.comma), filterValues(b.right_value)],
        symbolsClass(b.close_paren),
      ),
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

  // --- SCRIPT / SUBSUP / BASE builders and the NARY remainder (slice F) ----
  //
  // Every rule below BUILDS a node (`Math::`/`Utility.`); the pure
  // unwrap/list-join rules of the same families belong to slice A. Registered
  // in ascending gem-line order except the slice-A prerequisites, which sit
  // beside their first user; none of them shares a signature with another rule
  // here, so order decides no tie. Ids are `rule(` lines.
  //
  // MINI-SIZED leaves: `Constants::X.key(entity)` recovers the plain
  // character (`Hash#key` on a miss is nil, `nil.to_s` is `""`), and the
  // built `Symbol`/`Number` carries `mini_sup_sized`/`mini_sub_sized`.
  rule("53", { sup_alpha: simple("alpha") }, (b) =>
    newMiniSymbol(SUP_ALPHABETS_INVERTED.get(rubyToS(b.alpha)) ?? "", "sup"),
  );
  // PREREQUISITES owned by slice A (pure unwraps and a list-join, ids `:38`/
  // `:59`/`:60`/`:65`/`:66`/`:89`/`:830`), registered here under the same ids
  // because the script witnesses below cannot parse without them and A has
  // not landed on this branch; the integration keeps each id exactly once.
  rule("38", { sub_exp: sequence("exp") }, (b) => b.exp);
  rule("65", { sub_script: sequence("script") }, (b) => b.script);
  rule("66", { sup_script: sequence("script") }, (b) => b.script);
  rule("86", { subsup_exp: sequence("subsup_exp") }, (b) => filterValues(b.subsup_exp));
  rule("89", { mini_sub_sup: simple("mini_sub_sup") }, (b) => b.mini_sub_sup);
  rule("113", { sup_operators: simple("operator") }, (b) =>
    newMiniSymbol(SUP_OPERATORS_INVERTED.get(rubyToS(b.operator)) ?? "", "sup"),
  );

  // OPERATOR + a script: the symbol, then the script expression(s).
  rule("511", { operator: simple("operator"), sup_script: simple("sup_script") }, (b) => [
    symbolsClass(b.operator),
    b.sup_script,
  ]);
  rule("516", { operator: simple("operator"), sup_script: sequence("sup_script") }, (b) => [
    symbolsClass(b.operator),
    ...asArray(b.sup_script),
  ]);
  // `:521` was slice B's, blocked on `:1148` (`a^!!b`), which lives below.
  rule(
    "521",
    { combined_symbols: simple("combined_symbols"), sup_script: simple("sup_script") },
    (b) => [symbolsClass(COMBINING_SYMBOLS.get(rubyToS(b.combined_symbols))), b.sup_script],
  );
  rule("533", { operator: simple("operator"), sub_script: simple("sub_script") }, (b) => [
    symbolsClass(b.operator),
    b.sub_script,
  ]);
  // Slice H: `sub_override`'s own `{size_overrides:, sub_script:}` pair,
  // reached nested (not merged with `base`) through `subsup`'s
  // no-`.absent?`-guarded `(sub_override | baseless_sub).as(:sub) >>
  // baseless_sup.as(:sup)` alternative — a `Ⅎ`-sized subscript override
  // alongside a plain superscript. Witness: `"a_ℲDb^c"`.
  rule(
    "538",
    { size_overrides: simple("size_overrides"), sub_script: simple("sub_script") },
    (b) => [b.size_overrides, b.sub_script],
  );
  rule(
    "553",
    { sub_digits: simple("sub_digits"), sub_recursion_expr: sequence("sub_recursion_expr") },
    (b) => [subDigitNumber(b.sub_digits), ...asArray(b.sub_recursion_expr)],
  );
  rule(
    "567",
    { sup_alpha: simple("sup_alpha"), sup_recursion_expr: sequence("sup_recursion_expr") },
    (b) => [
      newMiniSymbol(SUP_ALPHABETS_INVERTED.get(rubyToS(b.sup_alpha)) ?? "", "sup"),
      ...asArray(b.sup_recursion_expr),
    ],
  );
  rule(
    "575",
    { sup_alpha: simple("sup_alpha"), sup_recursion_expr: simple("sup_recursion_expr") },
    (b) => [
      newMiniSymbol(SUP_ALPHABETS_INVERTED.get(rubyToS(b.sup_alpha)) ?? "", "sup"),
      b.sup_recursion_expr,
    ],
  );
  rule(
    "584",
    { sup_digits: simple("digits"), sup_recursion_expr: sequence("sup_recursion_expr") },
    (b) => [supDigitNumber(b.digits), ...asArray(b.sup_recursion_expr)],
  );

  // OPERATOR/SCRIPT + a recursion: `Utility.recursive_sub`/`recursive_sup`.
  rule("614", { operator: simple("operator"), sup_recursion: simple("sup_recursion") }, (b) =>
    recursiveSup(symbolsClass(b.operator), unfencedValue(b.sup_recursion, true)),
  );
  rule("622", { operator: simple("operator"), sub_recursion: simple("sub_recursion") }, (b) =>
    recursiveSub(symbolsClass(b.operator), b.sub_recursion),
  );
  rule("630", { operator: simple("operator"), sub_recursion: sequence("sub_recursion") }, (b) => [
    symbolsClass(b.operator),
    ...asArray(b.sub_recursion),
  ]);
  rule("635", { sub_script: simple("sub_script"), sub_recursion: simple("sub_recursion") }, (b) =>
    recursiveSub(b.sub_script, b.sub_recursion),
  );
  rule("640", { sub_operators: simple("operator"), sub_recursions: simple("recursions") }, (b) => [
    newMiniSymbol(SUB_OPERATORS_INVERTED.get(rubyToS(b.operator)) ?? "", "sub"),
    b.recursions,
  ]);
  rule(
    "646",
    { sub_operators: simple("operator"), sub_recursions: sequence("recursions") },
    (b) => [
      newMiniSymbol(SUB_OPERATORS_INVERTED.get(rubyToS(b.operator)) ?? "", "sub"),
      ...asArray(b.recursions),
    ],
  );
  rule("652", { sup_operators: simple("operator"), sup_recursions: simple("recursions") }, (b) => [
    newMiniSymbol(SUP_OPERATORS_INVERTED.get(rubyToS(b.operator)) ?? "", "sup"),
    b.recursions,
  ]);
  // `:830` (slice A's `{sup_exp: sequence, expr: sequence}` list-join): the
  // only way `:1164`'s array result, wrapped in `sup_exp`, reaches a parent.
  rule("830", { sup_exp: sequence("sup_exp"), expr: sequence("expr") }, (b) => [
    ...asArray(b.sup_exp),
    ...asArray(b.expr),
  ]);
  rule("985", { sup_script: simple("sup_script"), sup_recursion: simple("sup_recursion") }, (b) =>
    recursiveSup(b.sup_script, unfencedValue(b.sup_recursion, true)),
  );
  rule(
    "1011",
    { sup_script: sequence("sup_script"), sup_recursion: simple("sup_recursion") },
    (b) => recursiveSup(newFormula(b.sup_script), unfencedValue(b.sup_recursion, true)),
  );

  // BASE: a base plus a sub and/or sup whose shape is a SEQUENCE. `:1019`/
  // `:1116` above are the simple/simple twins.
  rule("1054", { base: sequence("base"), sub: simple("sub") }, (b) => {
    const base = asArray(b.base);
    const newBaseValue = base.pop();
    let object: unknown;
    if (className(b.sub) === "underset") {
      setField(b.sub, "parameterTwo", newBaseValue);
      object = b.sub;
    } else {
      object = newBase(newBaseValue, unfencedValue(b.sub, true));
    }
    base.push(object);
    return base;
  });
  rule("1069", { base: sequence("base"), sub: sequence("sub") }, (b) => {
    const base = asArray(b.base);
    const popped = base.pop();
    base.push(newBase(popped, unfencedValue(b.sub, true)));
    return base;
  });
  // `:1078`'s and `:2403`'s first arm assigns an UNDEFINED local
  // (`base.parameter_one = sub_value`): Ruby raises `NameError` there, so the
  // arm is a refusal, not a build.
  rule("1078", { base: simple("base"), sub: sequence("sub") }, (b) => {
    if (
      BINARY_FUNCTION_NAMES.has(className(b.base)) &&
      !rubyTruthy(fieldOf(b.base, "parameterOne"))
    ) {
      throw new ReferenceError("undefined local variable or method 'sub_value' (Ruby NameError)");
    }
    if (isA(b.base, IS_POWER) && baseIsPrime(b.base)) {
      return newPowerBase(fieldOf(b.base, "parameterOne"), b.sub, fieldOf(b.base, "parameterTwo"));
    }
    return newBase(b.base, unfencedValue(b.sub, true));
  });
  rule("1139", { base: sequence("base"), sup: simple("sup") }, (b) => {
    const base = asArray(b.base);
    const power = newPower(base.pop(), unfencedValue(b.sup, true));
    base.push(power);
    return newFormula(base);
  });
  rule("1148", { base: simple("base"), sup: sequence("sup") }, (b) => {
    if (className(b.base) === "base" && baseIsSubOrSup(fieldOf(b.base, "parameterTwo"))) {
      return newPowerBase(
        fieldOf(b.base, "parameterOne"),
        fieldOf(b.base, "parameterTwo"),
        unfencedValue(b.sup, true),
      );
    }
    return newPower(b.base, unfencedValue(b.sup, true));
  });
  rule("1164", { base: sequence("base"), sup: sequence("sup") }, (b) => {
    const base = asArray(b.base);
    const power = newPower(base.pop(), unfencedValue(b.sup, true));
    base.push(power);
    return base;
  });
  rule("1183", { unary_sub_sup: simple("sub_sup"), first_value: sequence("first_value") }, (b) => {
    const subSup = b.sub_sup;
    if (isA(subSup, IS_UNARY_FUNCTION)) {
      setField(fieldOf(subSup, "parameterOne"), "parameterOne", filterValues(b.first_value));
      return subSup;
    }
    return newFormula([subSup, ...asArray(b.first_value)]);
  });

  // NARY with a SEQUENCE `sub`/`sup` and no mask. Every arm below resolves
  // the name with `naryFunctionName`, exactly as `:1931`/`:2806` do.
  rule("1919", { nary_class: simple("nary_class"), sub: sequence("sub") }, (b) =>
    buildClass(naryFunctionName(b.nary_class), filterValues(b.sub)),
  );

  // BASE with a `sub` AND a `sup`, one or both a sequence.
  rule("2142", { base: sequence("base"), sup: simple("sup"), sub: simple("sub") }, (b) => {
    const base = asArray(b.base);
    const powerBase = newPowerBase(
      base.pop(),
      unfencedValue(b.sub, true),
      unfencedValue(b.sup, true),
    );
    return [...base, powerBase];
  });
  rule("2153", { base: simple("base"), sup: simple("sup"), sub: sequence("sub") }, (b) =>
    newPowerBase(b.base, unfencedValue(b.sub, true), unfencedValue(b.sup, true)),
  );
  rule("2163", { base: simple("base"), sup: sequence("sup"), sub: sequence("sub") }, (b) =>
    newPowerBase(b.base, filterValues(b.sub), filterValues(b.sup)),
  );
  rule("2173", { base: simple("base"), sup: sequence("sup"), sub: simple("sub") }, (b) =>
    newPowerBase(b.base, filterValues(b.sub), filterValues(b.sup)),
  );
  rule(
    "2183",
    { nary_class: simple("nary_class"), sub: sequence("sub"), sup: simple("sup") },
    (b) => buildClass(naryFunctionName(b.nary_class), filterValues(b.sub), filterValues(b.sup)),
  );

  // NARY, SEQUENCE `sub`/`sup` with one or both keys, and the mask-carrying
  // ones. `:2856`/`:2911` above are the simple `sub`/`sup` mask siblings.
  rule(
    "2827",
    { nary_class: simple("nary_class"), sub: sequence("sub"), sup: sequence("sup") },
    (b) =>
      buildClass(
        naryFunctionName(b.nary_class),
        unfencedValue(b.sub, true),
        unfencedValue(b.sup, true),
      ),
  );
  rule(
    "2841",
    { nary_class: simple("nary_class"), sub: simple("sub"), sup: sequence("sup") },
    (b) => {
      const subValue = isA(b.sub, IS_UNDERSET)
        ? fieldOf(b.sub, "parameterOne")
        : unfencedValue(b.sub, true);
      return buildClass(naryFunctionName(b.nary_class), subValue, unfencedValue(b.sup, true));
    },
  );
  rule(
    "2884",
    { nary_class: simple("nary_class"), mask: simple("mask"), sub: sequence("sub") },
    (b) => {
      const name = naryFunctionName(b.nary_class);
      const options: NodeOptions = { mask: fieldOf(b.mask, "value") };
      const subValue = unfencedValue(b.sub, true);
      if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
        return buildClass(name, subValue, null, null, options);
      }
      return newNary(symbolsClass(name), subValue, null, null, options);
    },
  );
  // The three mask rules with both `sub` and `sup` share one shape: only the
  // per-key value builder differs.
  const maskedNary = (
    b: Record<string, TransformValue>,
    subValue: unknown,
    supValue: unknown,
  ): UnicodemathDraft => {
    const name = naryFunctionName(b.nary_class);
    const options: NodeOptions = { mask: fieldOf(b.mask, "value") };
    if (UNICODEMATH_NARY_CLASSES.has(rubyToS(name))) {
      return buildClass(name, subValue, supValue, options);
    }
    return newNary(symbolsClass(name), subValue, supValue, null, options);
  };
  rule(
    "2993",
    {
      nary_class: simple("nary_class"),
      mask: simple("mask"),
      sub: sequence("sub"),
      sup: sequence("sup"),
    },
    (b) => maskedNary(b, filterValues(b.sub), filterValues(b.sup)),
  );
  rule(
    "3020",
    {
      nary_class: simple("nary_class"),
      mask: simple("mask"),
      sub: simple("sub"),
      sup: sequence("sup"),
    },
    (b) => maskedNary(b, unfencedValue(b.sub, true), filterValues(b.sup)),
  );
  rule(
    "3047",
    {
      nary_class: simple("nary_class"),
      mask: simple("mask"),
      sub: sequence("sub"),
      sup: simple("sup"),
    },
    (b) => maskedNary(b, filterValues(b.sub), unfencedValue(b.sup, true)),
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

/**
 * `Utility.slashed_values(value)` (`unicode_math/utility.rb:228-235`): the
 * entity-decoded text becomes a `Text` carrying a leading backslash when it
 * begins with a Ruby `\w` character, and a slashed `Symbol` otherwise. Ruby's
 * `\w` is ASCII-only (`"é".match?(/^\w+/)` and `"α".match?(/^\w+/)` are both
 * false, measured), and its `^` also matches after a newline.
 */
function slashedValues(value: unknown): UnicodemathDraft {
  const decoded = htmlEntityToUnicode(rubyToS(value));
  if (/(?:^|\n)[A-Za-z0-9_]/.test(decoded)) return newText(`\\${decoded}`);
  const symbol = newBareSymbol(decoded);
  symbol.fields.slashed = true;
  return symbol;
}

/**
 * `Utility.sequence_slashed_values(values, lang: :unicodemath)`
 * (`unicode_math/utility.rb:237-252`): the first element goes through
 * `slashed_values`, every later one becomes a `Number` when its decoded text
 * holds an ASCII digit and a looked-up symbol otherwise. `.value` is read off
 * each element, so one without it raises, as in Ruby.
 */
function sequenceSlashedValues(values: readonly unknown[]): unknown[] {
  return values.map((element, index) => {
    const raw = draftValue(element);
    if (index === 0) return slashedValues(raw);
    const decoded = htmlEntityToUnicode(rubyToS(raw));
    return /[0-9]/.test(decoded) ? newNumber(decoded) : symbolsClass(decoded);
  });
}

/** `Math::Symbols::Symbol.new(text, mini_sub_sized: true)`. */
function miniSubSymbol(text: string): UnicodemathDraft {
  const draft = newBareSymbol(text);
  draft.fields.miniSubSized = true;
  return draft;
}

/** `Math::Number.new(text, mini_sub_sized: true)` — `:2426`'s own `Number`. */
function miniSubNumber(text: string): UnicodemathDraft {
  const draft = newNumber(text);
  draft.fields.miniSubSized = true;
  return draft;
}

/**
 * `table.open_paren = symbols_class(open); table.close_paren =
 * symbols_class(close); table` (`:2761`, `:2769`): the two `attr_accessor`
 * writes replace whatever paren the table's own subclass defaulted to.
 */
function parenthesisedTable(table: unknown, open: unknown, close: unknown): unknown {
  setField(table, "openParen", symbolsClass(open));
  setField(table, "closeParen", symbolsClass(close));
  return table;
}

/**
 * `Constants::SUB_PARENTHESIS[side].key(entity).to_s` — the plain-text paren a
 * mini-sized entity stands for, `""` on a miss (`Hash#key` answers nil there,
 * and `nil.to_s` is empty). `Hash#key` returns the FIRST key mapping to the
 * value, so the inversion keeps the first.
 */
function subParenKey(table: ReadonlyMap<string, string>, entity: unknown): string {
  const text = rubyToS(entity);
  for (const [key, value] of table) if (value === text) return key;
  return "";
}

/**
 * Ruby `Float#to_s` for the positive powers of 1.25 the paren-size mask
 * builds: a whole value keeps its `.0` (`1.25**0` is `"1.0"`), and the
 * exponent form starts at 1e16 (`"1.0e+16"`), where JavaScript's starts at 1e21.
 */
function rubyFloatToS(value: number): string {
  if (!Number.isFinite(value)) return "Infinity";
  if (value >= 1e16) {
    const [mantissa, exponent] = value.toExponential().split("e");
    const digits = (mantissa as string).includes(".") ? (mantissa as string) : `${mantissa}.0`;
    return `${digits}e+${(exponent as string).replace("+", "").padStart(2, "0")}`;
  }
  const text = String(value);
  return text.includes(".") ? text : `${text}.0`;
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
 * was recorded with its value shapes, over the 103 corpus strings the
 * fixtures carried at the time (the pinned corpus is 182 strings now; this
 * table was not re-swept against the larger set). Nine signatures came back,
 * across FIVE inputs:
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
 *
 * A second, later measurement (round-2 review, not the original 103-string
 * corpus scan) added the six `sub_exp`/`base`/`sub_script`/`int_exp`/
 * `close_paren` signatures below, from `x_├1(2┤1)` and its `x_├N(M┤K)`
 * size-prefix-plus-sub siblings: another GEM BUG of the same shape as `±`,
 * except the unmatched hash nests four levels deep rather than sitting at
 * the root alone, so `finalizeValue`'s recursion needs every level's own
 * signature admitted, not just the outermost.
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
  // `x_├1(2┤1)` (and every `x_├N(M┤K)` size-prefix-plus-sub variant traced:
  // `x_├0(2┤1)`, `x_├2(2┤1)`, `x_├1(2┤0)`): the gem's own `mini_sub`/`base`/
  // `sub` chain never reduces `sub`'s `sub_script: {int_exp: {opener:,
  // operand:, closer:}}` shape to a leaf value the port's ported rules
  // reach — traced on the oracle (`TracePoint :b_call` over
  // `unicode_math/transform.rb`), NONE of its 516 rules ever fires a key
  // named `sub_exp` for this input, so the ROOT hash `{sub_exp: {base:,
  // sub:}}` survives the whole transform exactly as `combined_symbols` does
  // for `±` above, and `Kernel#Array` folds it into
  // `Formula([["sub_exp", {base: Symbol("x"), sub: {...}}]])` — a gem bug,
  // reproduced here rather than fixed, not a slice gap. The unmatched hash
  // nests four deep — `sub_exp`'s value is itself unmatched, and so is
  // every hash inside it, down to the innermost `close_paren` wrap — because
  // `finalizeValue` recurses into every hash entry once the outer one is
  // accepted, checking each nested hash's OWN signature the same way. Every
  // signature below is that recursion's floor, not a separate gap:
  "sub_exp=other",
  "base=simple,sub=other",
  "sub_script=other",
  "int_exp=other",
  "closer=other,opener=sequence,operand=simple",
  "close_paren=sequence",
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
