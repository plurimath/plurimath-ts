# Porting standards

Every trap in this file was paid for once. An implementer walks the checklist
before reporting done; a reviewer checks against it. A new trap earns a line
here in the same PR that hits it — knowledge that stays in a chat log is
knowledge the next agent starts without.

## The one rule over all others

**The gem is the oracle.** Being more correct, more standard, or more sensible
than it is a defect. When its behaviour looks wrong, pin it and record it;
divergence is a maintainer decision, named in `TODO.plan/deferred.md`, never a
silent improvement. (The one standing exception: constructors shallow-copy,
ARCHITECTURE.md §5 — decided, documented, invisible to output.)

## Measure, never read

Ruby source lies to a reader in ways it cannot lie to a probe:

- Constructors guard assignments (`@x = x if x`), coerce through helpers
  (`Table::Bmatrix` passes the *string* `"["` through `symbols_class` to
  become `Paren::Lsquare`), and differ between siblings (`Underset` stores
  `{}` where `Overset` stores nothing).
- Parslet's `(?<!…)` lookbehind is dead code — `StringScanner` cannot see
  behind the scan pointer. A verbatim port turns a no-op into a live rule.
- `consume_all` retries alternatives that succeed short of the end; its
  packrat cache deliberately excludes the flag; an all-vanished sequence
  folds to `""`, not nil.

So: instantiate, parse, render — and read the answer off the runtime. Write
Ruby probes to files (`/tmp/probe.rb`), never inline `-e` with nested quotes.
Use ONLY the pinned oracle checkout; the sibling working clone is on another
branch and dirty, and probing it silently changes answers.

## Ruby ↔ JavaScript semantic traps (each one bit us)

| Ruby | JavaScript | The trap |
|---|---|---|
| `String#strip` | `trim()` | `trim()` eats U+00A0; Ruby keeps it. Strip exactly `[\0\t\n\v\f\r ]`. |
| `==` on floats | `Object.is` | Ruby: `NaN == NaN` false, `-0.0 == 0.0` true. Use `===` for numbers. |
| one character | one UTF-16 unit | consume code points; keep offsets UTF-16. `fromCodePoint(0xD800)` does NOT throw. |
| `Array#flatten` | `flat()` | Ruby's is recursive; `flat()` is one level. |
| truthiness | truthiness | only `nil`/`false` are falsy; `0` and `""` are truthy. |
| `Integer` | `number` | arbitrary precision; long binary/octal need `BigInt`. Hex literals keep their spelling verbatim. |
| aliased arrays | copies | rules mutate shared arrays (`value.shift`); a defensive copy changes later reads in the same action. |
| `/\-/` | `u`-flag regex | the `u` flag rejects identity escapes Ruby allows — throws at construction, not at parse. |
| `x.is_a?(Array) ? x : [x]` | `[...x]` | a string, Set or Map is iterable in JS and is not an Array in Ruby, so the spread splits what Ruby wraps whole. `Formula.new("")` is `[""]` and raises; `[...""]` is `[]`, and the port rendered `""` and `"<table></table>"` for trees the gem refuses — invented output, the one direction that is silent. Guard with `Array.isArray`, wrap the rest, and never spread a slot value. |

## Tests must be able to fail

- Every new test is **seen failing first** — perturb, watch it fail, restore,
  prove byte-identical. A test never seen red proves nothing.
- A gate or suite must fail on emptiness: zero files scanned, zero cases
  loaded, an empty rejection set — each is a FAILURE, not a quiet pass. This
  repo shipped a gate that cruised zero modules and reported success.
- Where a suite guards a guard (specs on a validator), mutation-test it: gut
  the guarded check, require the suite to notice. A reviewer will run
  mutations you did not think of.
- Ordered lists whose order is behaviour (transform rules, literal tables,
  grammar alternatives) get an order-sensitive assertion, not a set compare.

## Verification hygiene

- **Pipes swallow exit codes.** `cmd | tail -1; echo $?` reports tail's
  status. Use `set -o pipefail` or capture to a file and test `$?` directly.
  This slipped a red push through once and nearly twice more.
- **Verification scripts guess wrong** — four logged instances, all mine or
  agents'. Read emitted files back before asserting about them; a gem-side
  serializer needs `Hash`/`Symbol` branches; when a probe disagrees with a
  tested artifact, suspect the probe first.
- **No shell heredocs carrying escape sequences into source files** — six
  incidents of literal `\u` text or raw NUL bytes. Use the Edit/Write tools,
  then scan every touched file: control bytes, `file(1)` says text.
- State facts with their evidence attached. "Matches Ruby" without the
  command beside it will be challenged and will not survive review.

## Documents state only what is true of the code

The project's single most recurring defect: prose asserting what nothing
enforces — "pinned by tests" before the tests existed, "sorted keys" over an
unsorted emitter, cache docs naming atoms that do not exist. Before done:
diff every claim you wrote against the code that supposedly backs it. A
description of an invariant either has an enforcement or says it is aspiration.

## Generated data discipline

- Data derived from the gem is generated, never hand-typed — 20 entries drift
  as surely as 3,000. Anything hand-maintained is a recorded exception with a
  trigger (`deferred.md`).
- Provenance tells the truth: `committable: true` only from clean checkouts;
  the two-step (commit sources → regenerate clean → amend) is the established
  pattern; a provenance `repository.commit` must be an ancestor of the branch
  tip, not an orphaned pre-amend hash.
- Generators are deterministic: two runs into fresh directories,
  byte-identical, proven not assumed.

## Working in parallel

- Concurrent agents get **worktree isolation** or strictly disjoint file
  lanes with **no git state commands** — a shared tree with two branch
  switchers interleaves commits onto whatever is checked out. Lived through.
- The orchestrator commits; implementers report files.
- A finished worktree is removed only after `origin/<branch>` contains every
  commit it holds.

## The review cycle (adopted 2026-08-06)

1. Plan → Codex review of the plan → maintainer approval → implementation.
2. One consolidated adversarial round per PR: Codex whole-PR and Copilot in
   parallel; fix everything; one combined narrow re-verify.
3. The maintainer hears about a PR twice: opened, and ready-or-merged — with
   a changelog of what the rounds caught.
4. **Round cap:** a third finding in the same code region stops the patching
   and goes to the maintainer as a design question.
5. Merges are per-word: on the word, request Ronald's review, then merge.
   Work never waits on a pending merge.
6. Copilot comments: valid → fix, 👍, resolve, no reply. False positive →
   reply, in the maintainer's plain voice. Suppressed → implement if valid,
   never respond. A pending review request is a gate: nothing merges ahead
   of it.
