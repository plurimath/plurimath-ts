#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's answers for `Formula#evaluate(bindings)` calls — B6's
# first slice (Number/Symbol/binary-arithmetic evaluation only,
# `TODO.plan/feature-roadmap.md`). Port-local, like the render-options
# fixtures: the shared corpus has no `evaluate` call kind, so this generator,
# not `generate-corpus.rb`, owns them.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-evaluation-fixtures.rb --oracle /path/to/plurimath
#
# Every row is hand-built AsciiMath — one input format keeps the surface
# small, matching the slice's own scope — with bindings, covering every
# in-scope operator, implicit multiplication, nesting, each reachable error
# class, the non-real `^` case, overflow, an unbound variable and a bad
# binding value. `expected` is recorded as a STRING, never a JSON number:
# Ruby's `Integer`/`Float` distinction (`2+3` => `5`, `6/3` => `2.0`) would be
# lost the instant a JSON number round-tripped through a JS parser, and
# `evaluate.spec.ts` compares against `Number(expected)` deliberately, not
# against the string itself, once it has recorded what shape the value was.
#
# `InvalidBindingKeyError` has no row here: this port's public bindings type
# is a plain JS object (`src/evaluation/bindings.ts`), and every JS object key
# is already a string, so the gem's Symbol-or-String key duality has no
# invalid case left to reach through it — recorded there, not manufactured
# here as a fixture that would need an untyped call to produce.

require "json"
require "optparse"

GENERATOR_RELATIVE_PATH = "scripts/generate-evaluation-fixtures.rb"
SCHEMA = "plurimath-corpus/evaluation/1"
PAYLOAD_BASENAME = "evaluation-fixtures.json"

options = { oracle: nil, out: "test/formats/evaluation", allow_dirty: false }
OptionParser.new do |o|
  o.on("--oracle PATH", "clean pinned plurimath checkout") { |v| options[:oracle] = v }
  o.on("--out PATH", "output directory (default test/formats/evaluation)") { |v| options[:out] = v }
  o.on("--allow-dirty", "emit non-committable output from dirty checkouts") do
    options[:allow_dirty] = true
  end
end.parse!

abort "--oracle is required" unless options[:oracle]

oracle = File.expand_path(options[:oracle])
lib = File.join(oracle, "lib")
abort "not a plurimath checkout: #{lib}" unless File.directory?(lib) && File.exist?(File.join(lib, "plurimath.rb"))

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

# Every reachable failure `Formula#evaluate` raises: the eight
# `Errors::Evaluation::*` classes, plus the `ArgumentError` its own bindings
# check raises before `Evaluator` even runs (`formula.rb:58-60`) — not
# exercised here because every row below hands a Hash, which always responds
# to `#to_hash` as itself.
EVALUATION_ERROR = Plurimath::Errors::Evaluation::Error

# `bindings` keys arrive as Ruby Symbols, matching this port's typed
# `Readonly<Record<string, number>>` (`src/evaluation/bindings.ts`), which
# normalizes through the same `key.to_s` the gem does.
def symbolize(bindings)
  bindings.to_h { |k, v| [k.to_sym, v] }
end

# `JSON.generate` refuses a bare `Float::NAN`/`Float::INFINITY` (raises
# "NaN not allowed in JSON" without `allow_nan: true`); a binding row that
# deliberately passes one (`overflow-nan-binding`) records it as the literal
# string Ruby's own `Float#to_s` would print, and `evaluate.spec.ts` maps
# that string back to `NaN`/`Infinity`/`-Infinity` at the one place it reads
# a row's `bindings`.
def json_safe(value)
  return value.to_s if value.is_a?(Float) && !value.finite?

  value
end

def evaluate_row(id, group, source, text, bindings)
  formula = Plurimath::Asciimath::Parser.new(text).parse
  row = {
    "id" => id,
    "group" => group,
    "source" => source,
    "input" => { "format" => "asciimath", "text" => text },
    "bindings" => bindings.transform_values { |v| json_safe(v) },
  }
  begin
    result = formula.evaluate(symbolize(bindings))
    row["expected"] = result.inspect
  rescue EVALUATION_ERROR => e
    row["raises"] = e.class.name
  end
  row
end

ROWS = [
  # Additive / multiplicative / unary, `Number#evaluate`'s Integer-vs-Float split.
  ["add-integers", "arithmetic", "2+3"],
  ["subtract-integers", "arithmetic", "5-2"],
  ["unary-minus", "arithmetic", "-3"],
  ["unary-plus", "arithmetic", "+3"],
  ["double-unary-minus", "arithmetic", "--3"],
  ["binary-and-unary-minus", "arithmetic", "5-(-2)"],
  ["multiply", "arithmetic", "2*3"],
  ["divide-exact", "arithmetic", "6/3"],
  ["divide-inexact", "arithmetic", "1/2"],
  ["float-literal", "arithmetic", "3.14"],
  ["float-sum", "arithmetic", "0.1+0.2"],
  ["mixed-int-float", "arithmetic", "2+0.5"],
  ["chained-additive", "arithmetic", "1+2-3+4"],
  ["precedence-mul-over-add", "arithmetic", "2+3*4"],
  ["precedence-parens", "arithmetic", "(2+3)*4"],
  ["nested-parens", "arithmetic", "((2+3)*4)"],

  # Power, structural (`Function::Power#evaluate`).
  ["power-integer", "power", "2^3"],
  ["power-zero-exponent", "power", "2^0"],
  ["power-zero-base-zero-exponent", "power", "0^0"],
  ["power-fraction-exponent", "power", "4^0.5"],
  ["power-negative-base-integer-exponent", "power", "(-2)^3"],
  ["power-chained", "power", "2^3^2"],
  # `2^(-1)` (an Integer exponent) would evaluate to Ruby's Rational `(1/2)`,
  # a THIRD return-type surface this slice does not cover (`evaluate.spec.ts`'s
  # module header and `open-decisions.md` cover only Integer/Float); `-1.0`
  # keeps the exponent a Float, which `**` always answers as a Float.
  ["power-parenthesized-negative-exponent", "power", "2^(-1.0)"],
  ["power-non-real", "power", "(-1)^0.5"],
  ["power-non-real-root", "power", "(-8)^(1/3)"],
  ["power-zero-base-negative-exponent", "power", "0^(-1)"],
  ["power-bare-negative-exponent-unsupported", "power", "2^-1"],

  # Implicit multiplication.
  ["implicit-mul-number-symbol", "implicit-multiplication", "2a"],
  ["implicit-mul-number-paren", "implicit-multiplication", "2(3+4)"],
  ["implicit-mul-paren-paren", "implicit-multiplication", "(1+1)(2+2)"],
  ["implicit-mul-two-numbers-unsupported", "implicit-multiplication", "2 3"],

  # Reserved constants and variable lookup (`Symbols::Symbol#evaluate`).
  ["pi-constant", "symbol", "pi"],
  ["pi-arithmetic", "symbol", "2*pi"],
  ["variable-lookup", "symbol", "a+1"],
  ["variable-lookup-multiple", "symbol", "a+b*c"],
  ["variable-shadowing-not-applicable-pi", "symbol", "pi+a"],

  # Errors reachable in this slice.
  ["missing-variable", "error-missing-variable", "a+1"],
  ["division-by-zero", "error-division-by-zero", "1/0"],
  ["division-by-zero-float", "error-division-by-zero", "1/0.0"],
  ["overflow-huge-float-power", "error-non-finite", "10.0^1000"],
  ["overflow-nan-binding", "error-non-finite", "a+1"],
  ["invalid-binding-string", "error-invalid-binding", "a+1"],
  ["invalid-binding-boolean", "error-invalid-binding", "a+1"],
  ["invalid-binding-nil", "error-invalid-binding", "a+1"],
  ["malformed-two-numbers", "error-unsupported", "2 3"],
].freeze

# `mod`, `sin`, `sum`/`Prod` and friends are OUT of scope for this slice
# (`TODO.plan/feature-roadmap.md`'s evaluation entry) — deliberately refused
# with `UnsupportedExpressionError` rather than fully implemented. The oracle
# itself does NOT refuse all of them the same way: `7 mod 3` fully evaluates
# to `1` (`Function::Mod#evaluate` exists), and `sin(x)`/`sum_(i=1)^n i`
# reach `MissingVariableError` first (their argument is evaluated eagerly,
# before the gem's own unary/n-ary trig or sum logic runs) — neither is the
# port's chosen `UnsupportedExpressionError`. Recording the ORACLE's answer
# for these as a parity fixture would assert the wrong thing about the port,
# so they are not here; `evaluate.spec.ts`'s own "not covered by the oracle
# fixtures" section documents the chosen divergence directly instead.

# Bindings, keyed by the row id above where non-empty; every other row
# evaluates against `{}`.
BINDINGS = {
  "implicit-mul-number-symbol" => { "a" => 5 },
  "variable-lookup" => { "a" => 2 },
  "variable-lookup-multiple" => { "a" => 1, "b" => 2, "c" => 3 },
  "variable-shadowing-not-applicable-pi" => { "a" => 1 },
  "overflow-nan-binding" => { "a" => Float::NAN },
  "invalid-binding-string" => { "a" => "x" },
  "invalid-binding-boolean" => { "a" => true },
  "invalid-binding-nil" => { "a" => nil },
}.freeze

rows = ROWS.map do |id, group, text|
  bindings = BINDINGS.fetch(id, {})
  evaluate_row(id, group, "hand-built for scripts/generate-evaluation-fixtures.rb", text, bindings)
end

ids = rows.map { |r| r["id"] }
duplicates = ids.tally.select { |_, n| n > 1 }.keys
abort "REFUSING: duplicate ids: #{duplicates.join(', ')}" unless duplicates.empty?

evaluated = rows.count { |r| r.key?("expected") }
raised = rows.count { |r| r.key?("raises") }
abort "REFUSING: produced zero evaluated rows" if evaluated.zero?
abort "REFUSING: produced zero raised rows" if raised.zero?
unless evaluated + raised == rows.length
  abort "REFUSING: #{rows.length} rows but #{evaluated} evaluated + #{raised} raised; a row is both or neither"
end

# Every reachable error class this slice claims to cover must show up at
# least once, or the fixture set is not the coverage the header promises.
expected_error_classes = %w[
  Plurimath::Errors::Evaluation::MissingVariableError
  Plurimath::Errors::Evaluation::DivisionByZeroError
  Plurimath::Errors::Evaluation::NonFiniteResultError
  Plurimath::Errors::Evaluation::InvalidBindingError
  Plurimath::Errors::Evaluation::UnsupportedExpressionError
  Plurimath::Errors::Evaluation::MathDomainError
].sort
seen_error_classes = rows.filter_map { |r| r["raises"] }.uniq.sort
missing = expected_error_classes - seen_error_classes
abort "REFUSING: fixtures never reached #{missing.join(', ')}" unless missing.empty?

dir = File.expand_path(options[:out])
payload_path = File.join(dir, PAYLOAD_BASENAME)
sidecar, provenance = RenderFixtureProvenance.prepare(
  oracle: oracle,
  payload_path: payload_path,
  generator_path: GENERATOR_RELATIVE_PATH,
  allow_dirty: options[:allow_dirty],
  corpus: false,
)

payload = {
  "$comment" => "GENERATED by #{GENERATOR_RELATIVE_PATH}. Do not edit.",
  "schema" => SCHEMA,
  "format" => "evaluation",
  "caseCount" => rows.length,
  "evaluatedCount" => evaluated,
  "raisedCount" => raised,
  "cases" => rows,
}
FileUtils.mkdir_p(dir)
payload_bytes = "#{JSON.pretty_generate(payload)}\n"
File.binwrite(payload_path, payload_bytes)
RenderFixtureProvenance.write_manifest(
  sidecar_path: sidecar,
  payload_path: payload_path,
  payload_schema: SCHEMA,
  payload_bytes: payload_bytes,
  provenance: provenance,
)
puts "evaluation: #{rows.length} rows, #{evaluated} evaluated, #{raised} raised -> #{payload_path}, #{sidecar}"
