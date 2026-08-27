# TODO 4 — Port the AsciiMath grammar to pegkit

## Why
`lib/plurimath/asciimath/parse.rb` is 219 lines of Parslet combinators, and the
port keeps a 1:1 structural map to it: one Ruby rule, one pegkit expression, in
the same order. That correspondence is what makes tree parity provable and
future upstream changes easy to mirror (ARCHITECTURE.md D4).

Rule order matters as much as rule content — Parslet's ordered choice means
moving an alternative changes what parses.

## Scope
- `src/formats/asciimath/preprocess.ts` — the gsub chain from `parser.rb`
  (`{:` → `ℒ`, `:}` → `ℛ`, `(:` → `ᑕ`, `:)` → `ᑐ`, `|:`/`:|` → `|`).
  - Emit a `SourceMap` alongside the rewritten text: these rewrites change
    lengths, so raw parser offsets do not index the caller's input. Every
    reported position goes through the map (§5).
- `src/formats/asciimath/grammar.ts` — every rule from `parse.rb`, same names,
  same order: `expression`, `iteration`, `sequence`, `frac`, `power_base`,
  `power_base_rules`, `table`, `tr`, `td`, `ternary_classes_rules`,
  `left_right`, `quoted_text`, `symbol_text_or_integer`, `number`,
  `color_value`, `mod`, and the base-prefix number rules.
- Dispatch the generated literal list (TODO 2) through `tokenChoice`, keeping
  longest-first order.
- The `number` rule takes its **decimal marker from `formatting`**, never a
  hardcoded `"."`. In the gem the rule is built from
  `Plurimath.configuration.decimal` (`asciimath/parse.rb:205`), which
  `Configuration#decimal` derives from the locale — so locale reaches the
  grammar, not only the renderers. It is used twice there, by the decimal
  number rule and by the comma-separated rule, so a comma-decimal locale
  changes how commas parse too. AsciiMath is one of the four formats whose
  parser accepts `locale` (`Math::LOCALIZED_PARSE_TYPES` — asciimath, html,
  latex, unicode), so that behaviour belongs to this item rather than to P4.
  Deferring it instead is a divergence from the gem and needs recording as one.
- The `unitsml(...)` alternative in `quoted_text` stays **commented out** with
  a pointer to §5: such input falls through to plain quoted text.

## Done when

- [ ] For every **reachable** pinned corpus case, the parse tree is deep-equal to
  the tree recorded from Parslet.
- [ ] Offsets in a `ParseError` index the original input, including after a
  length-changing preprocessing token.
- [ ] Each rule that can fail has a failure-position test, not only a
  success-tree test. Two pegkit failure-position bugs survived a conformance
  suite that only tested what parses; `ParseError.index` is public contract.
- [ ] A comma-decimal locale parses to the same model as the gem for the same
  input and locale, and the default still parses `1.5`. The shared case schema
  has no locale axis today, so this is a local fixture until one is agreed.
