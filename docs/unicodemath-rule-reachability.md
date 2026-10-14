# Nine UnicodeMath transform rules: reachability analysis

This analysis concerns the public parser at Ruby reference commit
`00c52783877b38f6b8e6e109f1803f96bb34fc62` and Parslet 2.0.0.
It examines rules 760, 925, 930, 1841, 2041, 2341, 2777, 2787 and 3074.
Source line numbers below refer to that reference commit.

The proposed contradictions depend on exact grammar topology, named-tree
boundaries and transform value types. A finite probe with zero firings cannot
prove unreachability. `scripts/ci/unicode-unreached-probe.rb` searches public
inputs independently, records positive controls and preserves the source and
engine hashes needed to check these premises.

This analysis is not a claim of full UnicodeMath language or rendering parity.
A changed reference grammar, engine or counterexample invalidates the relevant
classification and requires another investigation.

## Shared semantic premises, checked first-hand

Reference filenames in this note resolve under `lib/plurimath/unicode_math/` at the pinned commit unless stated otherwise.

1. Public preprocessing is `parser.rb:10-21,43-52`: labeling may split the input; HTMLEntities hexadecimal encoding happens before parsing; ampersand and quote encodings are restored; selected annotation text is stripped; doubled slashes are normalized; `\u` spelling becomes an entity; the final string is stripped. This can change the input language but cannot add arbitrary tree keys. `parser.rb:25-30` parses that text, optionally encloses the root in `{labeled_tr_value, labeled_tr_id}`, then transforms. The label enclosure does not merge root keys.
2. Actual engine material inspected: `parslet-2.0.0/lib/parslet/`. The reference dependency bundle uses Parslet 2.0.0. The reference commit has no tracked Gemfile.lock; the engine premise is the exact installed version, recorded with source hashes by the diagnostic report.
3. `atoms/named.rb:16-30`: `.as(:k)` produces `{k => flatten(value,true)}`. It encloses child keys; it does not spread them.
4. `atoms/can_flatten.rb:23-41,58-94`: unnamed sequence folding merges Hash keys; raw strings/slices are dropped next to Hashes; Hash plus Array produces array membership rather than spreading nested member keys. Duplicate Hash keys replace a value, not another key. The route proofs below enumerate the unnamed sequence edges that can actually merge keys before the next Named boundary.
5. `pattern.rb:97-108`: transform Hash patterns require exactly equal key counts and every expected key. An extra key prevents a match.
6. `transform.rb` in Parslet, `:184-195,231-247,252-261`: children are transformed first, `recurse_hash` preserves each parent key, and a matched action is returned without a second recursive apply of that returned result. Thus a sibling-key proof is about the raw Hash being visited: transforming its values cannot remove its extra keys or hoist a nested child's keys into it. A parent enclosure keeps its name even if its value changes type.
7. `pattern/binding.rb:36-47`: simple rejects Hash/Array; sequence requires an Array all of whose immediate members are non-Hash and non-Array.
8. `atoms/alternative.rb:36-40`, `atoms/base.rb:83-115`, `atoms/sequence.rb:25-39`: choices try in order and accept the first success for the given consume_all flag; a true consume_all rejects leftover input and may expose a later alternative; only the final sequence child receives true. A downstream sibling failure does not revisit an earlier successful nested choice. **No proof below assumes a successful prefix always shadows a later alternative when consume_all=true.**
9. `atoms/context.rb:26-47,96-100` caches by position and atom identity, without `consume_all`. For these proofs, the decisive calls first run with `consume_all=false`: `expression` first tries its nonfinal `element` (`parse.rb:279`) before its bare-element alternative (`:281`); every script-base `sub_sup_operand` is nonfinal; `naryand_values` is nonfinal in `naryand_recursion` (`sub_sup.rb:84`), and its optional consumers use repetition, which passes false (`atoms/repetition.rb:39`). These routes cannot first cache a true-only choice that later bypasses the unary-prefix or element invariants.

## Complete relevant tag topology

The extra included mixin was checked independently at `lib/plurimath/base_number_prefix.rb` in the pinned commit: Parser adds only hex_number/binary_number/octal_number tags, and Transform constructs Math::Number nodes. It adds none of the target keys and no Array return route. This mixin is referenced by parse.rb:6 and transform.rb:6.


### `atom` and `factor`

The only producer of the **key** `atom` is `common_rules.rb:10`: `atom.as(:atom) >> atoms.as(:atoms).maybe`. `atom` itself (`:9`) has no `atom` key. The recursive sibling is Named `atoms`, so later atom keys remain nested.

`atoms` is used only by `entity` (`common_rules.rb:11`) and its self-recursion. `entity` is used only by `factor` (`:100`), which may add `exclamation_symbol`. The only unwrapped consumers of factor are `parse.rb:185` (numerator) and `:243` (denominator). Numerator adds optional `binary_symbols` and Named `recursive_numerator`; denominator adds Named `recursive_denominator`. Neither adds `factor`, `operator` or `frac`. Recursive continuations stay inside their names.

All other consuming factor edges are enclosures: `common_rules.rb:69` (`first_value`, then `accents`) and `:95` (`factor`, then optional Named `operand`). Root/function/argument/script callers of operand retain those enclosures or introduce another name. `parse.rb:139` independently names the untagged `atom` rule as `factor`; it therefore produces a factor key, not an atom key.

### `intermediate_exp`

Exactly four `.as(:intermediate_exp)` source occurrences were found:

- `common_rules.rb:68`: `exp_bracket.as(:intermediate_exp).as(:first_value)`, then enclosing `accents`. The intermediate key is nested and cannot acquire an outer operator key.
- `common_rules.rb:102`: bracket-as-intermediate followed only by optional `exclamation_symbol`, then propagation as factor. Unwrapped factor consumers are exactly the numerator/denominator edges above; they add binary/recursive tags, never operator.
- `parse.rb:214`: `mix_bracketed.as(:intermediate_exp)` plus **Named** `expression.as(:expr)`.
- `parse.rb:215`: mixed bracket plus raw space only.

For the last two producers, every exp_bracket consumer was checked, including the often omitted unwrapped nary route:

- `parse.rb:108` adds Named `first_value`.
- `common_rules.rb:63-64` adds Named `first_value` (and possibly `unary_function`).
- `common_rules.rb:68` double-encloses; `:102` encloses as a new intermediate; `:109` is a negative lookahead and emits no child keys.
- `masked.rb:51` adds Named `expr`.
- `sub_sup.rb:211` passes through `sub_sup_operand`, whose actual consuming sites `:41,44,122,138-140` name it `base` inside a script; `:101` in parse is only a lookahead.
- The alternative `sub_sup.rb:114` passes through exp_bracket with optional subsup/subscript/supscript keys. Those are `sub`, `sup`, `sub_script`, `sup_script`, their recursion/mini tags, not an unwrapped `operator`; actual operator_symbols branches name operators `expr` (`:245-254`). `naryand_values` is consumed only by `naryand_recursion:84`, which adds Named `naryand_recursion` while requiring `operator.absent?`, then `:129-130` encloses it as `naryand`. The alternate `sub_sup_operand` use at `:117` takes this same naryand enclosure route.

Therefore an exposed intermediate can gain expr/exclamation/recursive/binary/script keys before enclosing, but never a same-level operator. No route into `element` exposes that key directly: bracket-as-factor is Named `factor` in operand; bracket/script bases are Named `base`; nary bodies are Named `nary`; accents/root/argument/masked forms are named.

### `expression`

The only producer of the **key** `expression` is `parse.rb:284`:

`element >> space? >> expression.as(:expr) >> space? >> expression.as(:expression).maybe`.

The first element is nonoptional and is not Named away at this production. Every reachable element choice yields a key other than `expr`/`expression`. The route inventory of `parse.rb:254-275` is: accents_subsup/base; frac (accent/unary/fraction); operator+frac mini fraction; accents; diacritics_accents; unicode_fractions; monospace; table; exp_script (nary/unary_subsup/subsup_exp/sub_exp/sup_exp/override/pre/mini or base+script tags); unary function tags; combined_symbols; symbol; operand (normally factor/operand); char/unicode_symbols; negated; operator; binary_symbols; slashed_value.

The only superficially unkeyed choice is bare `alphanumeric` at `:271`. In the public preprocessed input its possible bare characters are ASCII letters/digits; every other character is entity-encoded. When a bare letter/digit reaches that choice, the earlier operand alternative (`:269`, common_rules `:88-115`) already succeeds with a keyed factor: entity/atoms handles ordinary letters, number handles digits, and unary_arg_functions handles an initial UNARY_FUNCTIONS word even with absent first_value (`:63`). This element is a **nonfinal child** of branch284 and receives consume_all=false, so a later trailing input cannot force the bare fallback here. (Raw Parse alphanumerics outside public preprocessing are also covered by `an_math|an_other`, but the proof's advertised contract is the public pipeline.)

This proves branch284 retains at least one additional element key. Child transformation cannot remove it. Nested expression references elsewhere name `expr`, `first_value`, `exp`, etc.; they do not expose the expression key outside this local Hash.

## Rule-by-rule proof and independent probe design

| Ruby transform rule | Exact required shape | Source contradiction | Candidate stress inputs (not expected outputs) |
| --- | --- | --- | --- |
| 760 | `{factor: simple, unary_subsup: sequence}` | Sole unary_subsup producer is sub_sup:186 under op_unary_functions.present?. Its value is never an Array of leaves. Detailed type proof below. | `a sin_1`, `a sin²`, `a sin₁`, `a sin_1^2 b`, `a sin′²`, `a sinx_1`, `a arg_1`, `a Im²`, `a sin_ℲAa` |
| 925 | `{expression: simple, expr: sequence}` | The sole expression-key producer at parse:284 retains its nonoptional element key; exact two-key match is impossible. | `a b c`, `a + b c`, `(a| b c d`, `|a) b c d` |
| 930 | `{expression: simple, expr: simple}` | Same extra-key contradiction, independent of expr's resulting value type. | Same as 925; bracket/operator variants distinguish simple vs list values. |
| 1841 | `{intermediate_exp: simple, operator: simple}` | Every intermediate producer/unnamed propagation edge above excludes a same-level operator; expr resolving to an operator still retains key expr. | `(a|+b`, `(a| +b`, `|a)+b`, `|a) +b`, `(a| !+b` |
| 2041 | `{atom: simple, binary_symbols: simple, factor: simple}` | Atom-level numerator route adds recursive_numerator, not factor; operand's factor name encloses the atom key. No other unwrapped atom/factor consumer exists. | `a±b/c`, `α±b/c`, `a×b/c`, `a±(b)/c`, `a!±b/c`; prefixed binary equivalents |
| 2341 | `{intermediate_exp: simple, expr: simple, expression: simple}` | An expression key only comes from parse:284. Its first element cannot expose intermediate_exp at that same level: all bracket-bearing element paths name factor/base/accents/nary/root/etc. The intermediate producers with expr are inside exp_bracket, whose outer consumers enclose before element. | `(a| b c d`, `|a) b c d`, `(a| +b c`, `|a) +b c` |
| 2777 | `{intermediate_exp: simple, operator: simple, expr: simple}` | Same no-operator sibling invariant as1841; later expression recursion adds Named expr, never hoists its operator key. | `(a| b+c`, `(a| b c+d`, `|a) b+c`, `(a| +b c` |
| 2787 | `{atom: simple, operator: simple, frac: simple}` | Atom-bearing paths cannot gain operator/frac siblings. The only element operator+mini_fraction production parse:257 has no atom; its mini_sub_sup_present? lookahead does not emit a base. | `a+³/₄`, `α+³/₄`, `a²+³/₄`, `+³/₄` control |
| 3074 | `{atom: simple, operator: simple, frac: simple, expr: sequence}` | Same atom/operator/frac incompatibility; expression recursion can add expr only after the incompatible combination has already been required. | `a+³/₄ b`, `α+³/₄ b`, `a²+³/₄ b`, `+³/₄ b` control |

### 760 type proof, including all initial-unary alternatives

`unary_subsup` is produced only at `sub_sup.rb:186`, guarded by `op_unary_functions.present?`. The constants producer is `constants_rules.rb:63`, whose constants `constants.rb:6-43` are unprefixed ASCII words. These do not overlap binary-symbol literal entities or slash-prefixed binary names (`constants.rb:92-140`, constants_rules `:36,58,92`), nor op_nary's entity/slash spellings.

`unary_sub_sup` has exactly two branches (`sub_sup.rb:133-136`):

1. `(power_base_script|mini_sub_sup).as(:unary_sub_sup)` plus optional Named first_value.
2. Direct op_unary_functions plus optional Named first_value.

For branch1, base_value's nary alternative is impossible at the initial unary word; its script_base branch names its value base (`:138-140`). script_base tries mini_sub_sup then sub_sup_operand (`:19`). Every sub_sup_operand use inside these script parsers is a nonfinal sequence child: base is followed by mini/sub/sup syntax. From Sequence:31, it receives consume_all=false. Consequently sub_sup_operand's ordered alternatives (`:203-216`) at that unary word are:

- binary_symbols: does not match an ASCII unary word;
- accents: may match; its action-return audit below never supplies an Array;
- `op_unary_functions >> invisible_unicode?`: succeeds with a unary_functions key before alpha_numeric_values; no consume_all leftover rejection is possible at this position;
- all later alpha_numeric_values/number/an_math/other/exp_bracket/wrapper/text/negated/soperand alternatives are inaccessible once that unary branch succeeds. A later script failure does not retry this earlier nested choice. This is why inputs such as sinx_1 are useful stress cases but not a route to an Array base.

The op_unary_functions leaf transforms at transform:126-132 into a function/symbol node. For the earlier accents route, transform:52 invokes utility.rb:10-56: successful returns are BinaryFunction/Formula/Overset/Power nodes, or a preserved singleton Hash; incompatible states can raise. A parsed accent subtree is built from first_value/accent/primes Hash members, not an Array-of-leaves singleton that this reducer could return. No successful Array return is present. Prime specializations at transform:1404-1418,1506-1512 also return Power nodes.

Thus the script base is simple or an unresolved Hash, never sequence. All matching simple-base script actions were audited: transform:1019-1052,1078-1095,1116-1137,1148-1162,2103-2120,2153-2181,2403-2424 return nodes/a simple bound value or raise; the Array-producing cases1054/1069/1164/2142 require sequence base and cannot match. Mini-script wrappers:59-60,67,89,95 only return their child's type. power_base_script wrappers:27-28,38,74,86 similarly preserve it or filter an already-required sequence; no sequence child has a producer for this initial unary path. Unmatched script Hashes stay Hashes.

With optional first_value, transform:1173-1191 produces either the original simple sub_sup or a Formula node. If its required simple/sequence patterns do not match, the `{unary_sub_sup,first_value}` Hash remains Hash; it does not become sequence. Without first_value, the singleton unwrap at64 preserves the simple/Hash type. The branch2 unary_functions singleton126 returns a node; its first_value action1547-1559 returns a node/Formula; unsupported first_value shapes stay Hashes. The outer unary_subsup singleton90 unwraps only a simple value, not Hash/Array. Therefore the value named unary_subsup is never sequence, contradicting760 regardless of factor or outer keys.

A source search also checked that the pinned math/function directory exists and contains the referenced classes; `git grep` found no `def self.new`/custom `new` override there. The type audit concerns ordinary class construction, not assumed array-returning factory methods.
