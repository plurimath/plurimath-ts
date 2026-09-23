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
# binding value. `expected` is recorded as a STRING (`Integer#inspect` /
# `Float#inspect`), never a JSON number: Ruby's `Integer`/`Float` distinction
# (`2+3` => `5`, `6/3` => `2.0`) would be lost the instant a JSON number
# round-tripped through a JS parser. `evaluate.spec.ts` checks both the value
# and the Ruby kind the string records against the port's internal kind.
#
# `portRefusal` marks a row the port refuses with `UnsupportedFeatureError`
# although the oracle answers or raises something else: a construct the gem
# evaluates that this slice has not ported (`mod`, `sin`, `sum`, ...), or a
# result a JS number cannot hold exactly (a Rational, an Integer beyond
# `Number.MAX_SAFE_INTEGER`, a Float power within glibc's rounding band —
# `src/evaluation/numeric.ts` and `pow.ts`). The oracle's own answer is still
# recorded, so the refusal is visibly a refusal of THAT answer. A Rational or
# out-of-range Integer answer without a `portRefusal` aborts generation.
#
# A binding value is either an Integer or a non-integral Float (or a
# non-finite Float): JavaScript cannot express `2.0` apart from `2`, and the
# port reads a safe-integer binding as a Ruby Integer (`numeric.ts`'s
# `fromBinding`), so an integral Float binding would test nothing real.
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

def evaluate_row(id, group, source, text, bindings, port_refusal)
  bindings.each do |name, value|
    next unless value.is_a?(Float) && value.finite? && value == value.round

    abort "REFUSING: #{id}: binding #{name} is the integral Float #{value.inspect}, " \
          "which a JS number cannot tell apart from the Integer #{value.to_i}"
  end
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
    unless result.is_a?(Integer) || result.is_a?(Float)
      abort "REFUSING: #{id}: #{result.inspect} is a #{result.class}" unless port_refusal
    end
    if result.is_a?(Integer) && result.abs > MAX_SAFE_INTEGER && !port_refusal
      abort "REFUSING: #{id}: #{result} is beyond Number.MAX_SAFE_INTEGER"
    end
    row["expected"] = result.inspect
  rescue EVALUATION_ERROR => e
    row["raises"] = e.class.name
  end
  row["portRefusal"] = port_refusal if port_refusal
  row
end

MAX_SAFE_INTEGER = (2**53) - 1

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
  # `-1.0` keeps the exponent a Float, which `**` always answers as a Float;
  # the Integer `-1` gives a Rational — see the "representability" group.
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
  ["equation-unsupported", "error-unsupported", "1=1"],
  ["core-default-int", "error-unsupported", "int x"],
  ["core-default-base", "error-unsupported", "a_1"],
  ["core-default-lim", "error-unsupported", "lim_(x->0) x"],
  ["comma-in-group", "error-unsupported", "(2,3)"],

  # Loose parens: a paren the grammar does not pair into `Fenced` reaches the
  # evaluator as a bare `Symbols::Paren::*` token (`ExpressionParser#parse_group`).
  ["loose-vert-group", "loose-paren", "|2|"],
  ["loose-vert-implicit-mul", "loose-paren", "3|2|"],
  ["unclosed-round-fenced", "loose-paren", "(2+3"],
  ["stray-close-paren", "loose-paren", "2+3)"],
  ["unmatched-vert", "loose-paren", "|2"],

  # Ruby's Integer-vs-Float kinds, including `-0` (an Integer `0`) versus `-0.0`.
  ["integer-negative-zero", "kind", "-0"],
  ["integer-zero-times-negative", "kind", "0*(-3)"],
  ["float-negative-zero", "kind", "-0.0"],
  ["integer-times-float", "kind", "a b"],
  ["float-binding-squared", "kind", "a^2"],
  ["integer-base-float-exponent", "kind", "(-2)^2.0"],
  ["integer-one-to-negative", "kind", "1^(-1)"],
  ["integer-minus-one-to-negative-odd", "kind", "(-1)^(-3)"],
  ["integer-zero-to-zero", "kind", "0^0"],
  ["integer-largest-safe-power", "kind", "3^33"],
  ["integer-largest-safe-literal", "kind", "9007199254740991"],

  # Infinities and zero bases in power position (`Integer#**`/`Float#**`).
  ["power-minus-one-to-infinity", "power-special", "(-1)^a"],
  ["power-minus-two-to-minus-infinity", "power-special", "(-2)^a"],
  ["power-zero-to-negative-float", "power-special", "0^(-1.0)"],
  ["power-zero-to-negative-integer-binding", "power-special", "0^a"],
  ["power-float-zero-to-negative-integer", "power-special", "0.0^(-1)"],
  ["power-zero-to-nan", "power-special", "0^a"],
  ["power-zero-to-minus-infinity", "power-special", "0^a"],
  ["power-negative-to-nan", "power-special", "(-2)^a"],
  ["power-minus-infinity-to-half", "power-special", "a^b"],
  ["power-minus-infinity-to-three", "power-special", "a^b"],
  ["power-infinity-to-minus-one", "power-special", "a^b"],
  ["power-one-to-nan", "power-special", "1^a"],
  ["power-one-to-infinity", "power-special", "1^a"],
  ["power-nan-to-zero", "power-special", "a^0"],
  ["infinity-plus-one", "infinity", "a+1"],
  ["infinity-minus-infinity", "infinity", "a-a"],
  ["one-over-infinity", "infinity", "1/a"],
  ["infinity-times-zero", "infinity", "a*0"],
  ["infinite-intermediate-divided-away", "infinity", "2^(1/0.0^(-0.1))"],

  # Float powers go through C's `pow`, which JavaScript's `**` does not match.
  ["pow-rounding-chained", "pow-rounding", "a^b^c"],
  ["pow-rounding-inverse-sqrt", "pow-rounding", "a^b^c"],
  ["pow-rounding-in-sum", "pow-rounding", "0.1/(-1)2.0^c+9/4"],
  ["pow-float-literal", "pow-rounding", "2^1.5"],

  # Results a JS number cannot hold exactly: refused by the port.
  ["rational-integer-negative-power", "representability", "2^(-1)"],
  ["rational-intermediate-to-float", "representability", "2^(-1)*2.0"],
  ["rational-zero-numerator", "representability", "a 3^(-1)"],
  ["rational-in-sum", "representability", "5+7^(-9)"],
  ["big-integer-power", "representability", "2^100"],
  ["big-integer-cancels", "representability", "3^35+1-3^35"],
  ["big-integer-literal", "representability", "99999999999999999999"],
  ["big-integer-just-past-safe", "representability", "9007199254740991+1"],
  ["big-integer-intermediate-to-float", "representability", "100^100-10.0"],
  ["pow-exact-halfway", "representability", "123456789^2.0"],

  # Gem-evaluated nodes this slice has not ported.
  ["unported-mod", "unported", "7 mod 3"],
  ["unported-sin-missing-variable", "unported", "sin(x)"],
  ["unported-sum", "unported", "sum_(i=1)^3 i"],
  ["unported-sqrt", "unported", "sqrt(4)"],
  ["unported-abs", "unported", "abs(-2)"],
  ["unported-floor", "unported", "floor(2.5)"],
  ["unported-max-argument-list", "unported", "max(2,3)"],
  ["unported-log", "unported", "log(100)"],
  ["unported-text", "unported", "text(ab)"],

  # A sample of scripts/-generated random expressions, re-checked here.
  ["random-float-product", "random", "+12*3.14"],
  ["random-implicit-negative-group", "random", "10.0-(-5)0.2"],
  ["random-integer-power-sum", "random", "-b^10+4"],
  ["random-integer-large-power", "random", "9^10"],
  ["random-nan-power", "random", "a^c-a"],
  ["random-negative-infinity-power", "random", "c^(-(+2.0-100*3))"],
  ["random-zero-division-in-power", "random", "b^2 2.0^(3)+10.0/(0^(-9)+c^0(-2.0))"],
  ["random-negative-zero-divisor", "random", "2.25/(-0.0)*3^2"],
  ["random-split-literal", "random", "1 1000000+1"],
  ["random-complex-power", "random", "(1 b^1.5-7)+((-0)*0.2+b*0)"],
  ["random-minus-one-to-float", "random", "-c^pi (-(-(-(-1))))"],
  ["random-float-zero-to-negative", "random", "0.0^(-5)+(-2)"],
  ["random-mixed-kinds", "random", "-a b/c+a^2"],
  ["random-nested-groups", "random", "((2+a)(b-1))^2/(-(c))"],
].freeze

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
  "integer-times-float" => { "a" => 2, "b" => 3.5 },
  "float-binding-squared" => { "a" => 1.5 },
  "power-minus-one-to-infinity" => { "a" => Float::INFINITY },
  "power-minus-two-to-minus-infinity" => { "a" => -Float::INFINITY },
  "power-zero-to-negative-integer-binding" => { "a" => -1 },
  "power-zero-to-nan" => { "a" => Float::NAN },
  "power-zero-to-minus-infinity" => { "a" => -Float::INFINITY },
  "power-negative-to-nan" => { "a" => Float::NAN },
  "power-minus-infinity-to-half" => { "a" => -Float::INFINITY, "b" => 0.5 },
  "power-minus-infinity-to-three" => { "a" => -Float::INFINITY, "b" => 3 },
  "power-infinity-to-minus-one" => { "a" => Float::INFINITY, "b" => -1 },
  "power-one-to-nan" => { "a" => Float::NAN },
  "power-one-to-infinity" => { "a" => Float::INFINITY },
  "power-nan-to-zero" => { "a" => Float::NAN },
  "infinity-plus-one" => { "a" => Float::INFINITY },
  "infinity-minus-infinity" => { "a" => Float::INFINITY },
  "one-over-infinity" => { "a" => Float::INFINITY },
  "infinity-times-zero" => { "a" => Float::INFINITY },
  "pow-rounding-chained" => { "a" => -0.1, "b" => -5, "c" => 6 },
  "pow-rounding-inverse-sqrt" => { "a" => 4, "b" => 0.5, "c" => -2.5 },
  "pow-rounding-in-sum" => { "c" => 1.5 },
  "rational-zero-numerator" => { "a" => 0 },
  "random-integer-power-sum" => { "b" => 2 },
  "random-nan-power" => { "a" => Float::NAN, "c" => -5 },
  "random-negative-infinity-power" => { "c" => -Float::INFINITY },
  "random-zero-division-in-power" => { "b" => 0.25, "c" => -0.1 },
  "random-complex-power" => { "b" => -0.1 },
  "random-minus-one-to-float" => { "c" => -1 },
  "random-mixed-kinds" => { "a" => 3, "b" => -2.5, "c" => 4 },
  "random-nested-groups" => { "a" => 1, "b" => 0.5, "c" => -3 },
}.freeze

# Rows the port refuses with `UnsupportedFeatureError` (see the header), each
# with the reason: `unported` (a gem-evaluated node this slice lacks),
# `rational`, `big-integer`, or `pow-rounding-band`.
PORT_REFUSALS = {
  "rational-integer-negative-power" => "rational",
  "rational-intermediate-to-float" => "rational",
  "rational-zero-numerator" => "rational",
  "rational-in-sum" => "rational",
  "big-integer-power" => "big-integer",
  "big-integer-cancels" => "big-integer",
  "big-integer-literal" => "big-integer",
  "big-integer-just-past-safe" => "big-integer",
  "big-integer-intermediate-to-float" => "big-integer",
  "pow-exact-halfway" => "pow-rounding-band",
  "unported-mod" => "unported",
  "unported-sin-missing-variable" => "unported",
  "unported-sum" => "unported",
  "unported-sqrt" => "unported",
  "unported-abs" => "unported",
  "unported-floor" => "unported",
  "unported-max-argument-list" => "unported",
  "unported-log" => "unported",
  "unported-text" => "unported",
}.freeze

unknown = (BINDINGS.keys + PORT_REFUSALS.keys) - ROWS.map(&:first)
abort "REFUSING: BINDINGS/PORT_REFUSALS name unknown rows: #{unknown.join(', ')}" unless unknown.empty?

rows = ROWS.map do |id, group, text|
  bindings = BINDINGS.fetch(id, {})
  evaluate_row(id, group, "hand-built for scripts/generate-evaluation-fixtures.rb", text, bindings,
               PORT_REFUSALS[id])
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
