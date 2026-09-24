#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the oracle's answers for `Formula#evaluate(bindings)` calls — B6
# (`TODO.plan/feature-roadmap.md`): Number/Symbol/binary arithmetic, the exact
# functions and iterations, and the `Math` module functions. Port-local, like the render-options
# fixtures: the shared corpus has no `evaluate` call kind, so this generator,
# not `generate-corpus.rb`, owns them.
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-evaluation-fixtures.rb --oracle /path/to/plurimath
#
# Every row is hand-built — mostly AsciiMath, with a smaller `LATEX_ROWS` set
# covering the same operator and error surface through the OTHER input format
# `evaluate()` accepts (`bindings.ts`'s header: a `FormulaNode` from any
# parsed format, not only AsciiMath) — with bindings, covering every in-scope
# operator and function, implicit multiplication, nesting, each reachable
# error class, the non-real `^` case, overflow, an unbound variable and a bad
# binding value.
# A row that raises records `message` (`Exception#message`) alongside
# `raises` (the class name): `evaluate.spec.ts` checks both, byte-exact, not
# only the class and its `code` — a wrong phrase with the right class would
# otherwise pass silently. `expected` is recorded as a STRING (`Integer#inspect` /
# `Float#inspect`), never a JSON number: Ruby's `Integer`/`Float` distinction
# (`2+3` => `5`, `6/3` => `2.0`) would be lost the instant a JSON number
# round-tripped through a JS parser. `evaluate.spec.ts` checks both the value
# and the Ruby kind the string records against the port's internal kind.
#
# `portRefusal` marks a row the port refuses with `UnsupportedFeatureError`
# although the oracle answers or raises something else, and says why:
# `unported` (a construct the gem evaluates that this port has not ported:
# `sinh`, `log`, ...), `rational` / `big-integer` (a FINAL result a JS
# number cannot hold exactly — intermediate ones are computed exactly, as
# Ruby does), `pow-rounding-band` (a Float power within glibc's rounding
# band), `libm-rounding-band` (a `Math` function result within glibc's
# rounding band), `libm-reduction` (a sin/cos/tan argument so close to a
# multiple of pi/2 that glibc's range reduction is not accurate enough to
# trust), `argument-error` (Ruby raises `ArgumentError`, not an evaluation
# error; recorded as `raises: "ArgumentError"`), or `size-limit` (an exact
# intermediate beyond the port's resource limit) — `src/evaluation/numeric.ts`,
# `pow.ts` and `libm.ts`. The oracle's own answer is still recorded, so the refusal is
# visibly a refusal of THAT answer. A Rational or out-of-range Integer answer
# without a `portRefusal` aborts generation, and so does a `rational`,
# `big-integer` or `argument-error` marker the oracle's answer does not bear
# out.
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

FORMAT_PARSERS = {
  "asciimath" => Plurimath::Asciimath::Parser,
  "latex" => Plurimath::Latex::Parser,
}.freeze

# Per-row gem configuration, standing in for the port's per-call
# `EvaluationOptions` (`src/evaluation/index.ts`): `evaluationMaxIterations`
# is `Plurimath.configuration.evaluation_max_iterations`, set for the one
# `evaluate` call and restored after it, `nil` recorded as JSON `null`.
def with_options(options)
  return yield unless options.key?("evaluationMaxIterations")

  configuration = Plurimath.configuration
  previous = configuration.evaluation_max_iterations
  configuration.evaluation_max_iterations = options["evaluationMaxIterations"]
  begin
    yield
  ensure
    configuration.evaluation_max_iterations = previous
  end
end

def evaluate_row(id, group, source, format, text, bindings, port_refusal, options = {})
  bindings.each do |name, value|
    next unless value.is_a?(Float) && value.finite? && value == value.round

    abort "REFUSING: #{id}: binding #{name} is the integral Float #{value.inspect}, " \
          "which a JS number cannot tell apart from the Integer #{value.to_i}"
  end
  parser_class = FORMAT_PARSERS.fetch(format) { abort "REFUSING: #{id}: unknown format #{format}" }
  formula = parser_class.new(text).parse
  row = {
    "id" => id,
    "group" => group,
    "source" => source,
    "input" => { "format" => format, "text" => text },
    "bindings" => bindings.transform_values { |v| json_safe(v) },
  }
  row["options"] = options unless options.empty?
  begin
    result = with_options(options) { formula.evaluate(symbolize(bindings)) }
    unless result.is_a?(Integer) || result.is_a?(Float)
      abort "REFUSING: #{id}: #{result.inspect} is a #{result.class}" unless port_refusal
    end
    if result.is_a?(Integer) && result.abs > MAX_SAFE_INTEGER && !port_refusal
      abort "REFUSING: #{id}: #{result} is beyond Number.MAX_SAFE_INTEGER"
    end
    if port_refusal == "rational" && !result.is_a?(Rational)
      abort "REFUSING: #{id}: marked rational, but the oracle answered #{result.inspect}"
    end
    if port_refusal == "big-integer" && !(result.is_a?(Integer) && result.abs > MAX_SAFE_INTEGER)
      abort "REFUSING: #{id}: marked big-integer, but the oracle answered #{result.inspect}"
    end
    row["expected"] = result.inspect
  rescue EVALUATION_ERROR => e
    row["raises"] = e.class.name
    row["message"] = e.message
  rescue ArgumentError => e
    abort "REFUSING: #{id}: ArgumentError #{e.message} without an argument-error marker" unless port_refusal == "argument-error"
    row["raises"] = "ArgumentError"
  end
  if %w[rational big-integer].include?(port_refusal) && row.key?("raises")
    abort "REFUSING: #{id}: marked #{port_refusal}, but the oracle raised #{row['raises']}"
  end
  if port_refusal == "argument-error" && row["raises"] != "ArgumentError"
    abort "REFUSING: #{id}: marked argument-error, but the oracle did not raise ArgumentError"
  end
  row["portRefusal"] = port_refusal if port_refusal
  row
end

MAX_SAFE_INTEGER = (2**53) - 1

# `numeric.ts`'s own `INTEGER_BIT_LIMIT` (`1 << 22`), read from its source
# rather than restated as a literal, so a `size-limit` row is validated
# against the port's ACTUAL limit and a future change to it cannot silently
# make this validation check the wrong number.
NUMERIC_TS_SOURCE = File.read(File.join(__dir__, "..", "src", "evaluation", "numeric.ts"))
INTEGER_BIT_LIMIT_MATCH = NUMERIC_TS_SOURCE.match(/INTEGER_BIT_LIMIT = 1 << (\d+)/)
abort "REFUSING: could not read INTEGER_BIT_LIMIT out of numeric.ts" unless INTEGER_BIT_LIMIT_MATCH
INTEGER_BIT_LIMIT = 1 << INTEGER_BIT_LIMIT_MATCH[1].to_i

# The gem classes the port refuses as `unported`, read from
# `evaluator.ts`'s own source the way `INTEGER_BIT_LIMIT` is read above, so an
# `unported` row is validated against the port's ACTUAL dispatch: every name in
# `GEM_EVALUATED_FUNCTIONS` (the gem-evaluated classes the port knows of),
# minus any that `dispatch` handles itself — by `node.name === "..."` on a
# function carrier, or by a `case "<kind>":` whose kind `GEM_EVALUATED_KINDS`
# maps to that class. Each remaining name must also be, on the loaded gem, a
# `Function` class whose `#evaluate` is its own rather than `Core`'s refusing
# default, or the port's list has drifted from the oracle.
EVALUATOR_TS_SOURCE = File.read(File.join(__dir__, "..", "src", "evaluation", "evaluator.ts"))

def evaluator_ts_block(pattern, what)
  match = EVALUATOR_TS_SOURCE.match(pattern)
  abort "REFUSING: could not read #{what} out of evaluator.ts" unless match

  match[1]
end

GEM_EVALUATED_FUNCTION_NAMES = evaluator_ts_block(
  /const GEM_EVALUATED_FUNCTIONS: ReadonlySet<string> = new Set\(\[(.*?)\]\);/m,
  "GEM_EVALUATED_FUNCTIONS",
).scan(/"(\w+)"/).flatten
GEM_EVALUATED_KIND_CLASSES = evaluator_ts_block(
  /const GEM_EVALUATED_KINDS: ReadonlyMap<string, string> = new Map\(\[(.*?)\]\);/m,
  "GEM_EVALUATED_KINDS",
).scan(/\["(\w+)", "(\w+)"\]/).to_h
DISPATCH_SOURCE = evaluator_ts_block(
  /private dispatch\(node: MathNode\): RubyNumeric \{\n(.*?)\n  \}\n/m,
  "Evaluator#dispatch",
)
abort "REFUSING: GEM_EVALUATED_FUNCTIONS read as empty" if GEM_EVALUATED_FUNCTION_NAMES.empty?
abort "REFUSING: GEM_EVALUATED_KINDS read as empty" if GEM_EVALUATED_KIND_CLASSES.empty?
# `FUNCTION_EVALUATORS` is the table `dispatch` looks a `binaryFunction`/
# `unaryFunction` carrier's `name` up in; its keys are the carrier classes the
# port evaluates.
FUNCTION_EVALUATOR_NAMES = evaluator_ts_block(
  /const FUNCTION_EVALUATORS: ReadonlyMap<string, FunctionEvaluator> = new Map<\s*string,\s*FunctionEvaluator\s*>\(\[\n(.*?)\n\]\);/m,
  "FUNCTION_EVALUATORS",
).scan(/^\s*\[\s*"(\w+)",/).flatten
abort "REFUSING: FUNCTION_EVALUATORS read as empty" if FUNCTION_EVALUATOR_NAMES.empty?
unless DISPATCH_SOURCE.include?("FUNCTION_EVALUATORS.get(node.name)")
  abort "REFUSING: Evaluator#dispatch no longer looks carriers up in FUNCTION_EVALUATORS"
end
DISPATCHED_CLASSES = DISPATCH_SOURCE.scan(/node\.name === "(\w+)"/).flatten +
                     FUNCTION_EVALUATOR_NAMES +
                     DISPATCH_SOURCE.scan(/case "(\w+)":/).flatten.filter_map { |kind| GEM_EVALUATED_KIND_CLASSES[kind] }
UNPORTED_GEM_CLASSES = (GEM_EVALUATED_FUNCTION_NAMES - DISPATCHED_CLASSES).to_h do |name|
  klass = Plurimath::Math::Function.const_get(name, false) if Plurimath::Math::Function.const_defined?(name, false)
  unless klass.is_a?(Class) && klass.instance_method(:evaluate).owner != Plurimath::Math::Core
    abort "REFUSING: evaluator.ts's GEM_EVALUATED_FUNCTIONS names #{name}, which the oracle does not " \
          "evaluate with its own Function::#{name}#evaluate"
  end
  [klass.name, name]
end.freeze
abort "REFUSING: evaluator.ts leaves no gem-evaluated class unported" if UNPORTED_GEM_CLASSES.empty?

# Every node of a parsed gem formula, depth first: the `Plurimath::Math::Core`
# values reachable through its instance variables, arrays and hashes.
def gem_nodes(value, seen = {}.compare_by_identity, out = [])
  case value
  when Array then value.each { |v| gem_nodes(v, seen, out) }
  when Hash then value.each_value { |v| gem_nodes(v, seen, out) }
  when Plurimath::Math::Core
    return out if seen[value]

    seen[value] = true
    out << value
    value.instance_variables.each { |iv| gem_nodes(value.instance_variable_get(iv), seen, out) }
  end
  out
end

# `size-limit` rows: the exact intermediate value the port refuses, computed
# independently in plain Ruby (arbitrary-precision `Integer`), keyed by row
# id. Validated bit length must exceed `INTEGER_BIT_LIMIT` (item 6: "size-limit
# means the operand really exceeds the limit").
SIZE_LIMIT_INTERMEDIATES = {
  "size-limit-huge-power-times-zero" => -> { 2**5_000_000 },
}.freeze

# `pow-rounding-band` rows: the exact integer base and non-negative integer
# exponent of the `Float**Float` call at issue, keyed by row id. Validated by
# reproducing `pow.ts`'s own halfway test exactly, in `Integer`/`Rational`
# arithmetic (item 6: "pow-rounding-band means the exact result lies within
# the band, computed exactly").
POW_ROUNDING_BAND_OPERANDS = {
  "pow-exact-halfway" => [123_456_789, 2],
}.freeze

# `pow.ts`'s `roundDyadic` halfway test, ported to exact `Integer` arithmetic:
# `exact` an exact positive `Integer`, `mantissa_bits` the double significand
# width (53, sign bit included as the implicit leading one). Returns whether
# the correctly-rounded double for `exact` sits within 1/80 (0.0125) ULP of a
# midpoint between two doubles — the same `|2*remainder - full| * 80 < 2*full`
# test `pow.ts`'s `roundDyadic` applies to its own fixed-point mantissa
# (`NEAR_HALFWAY_BAND_INVERSE`, sized from `scripts/measure-pow-glibc-accuracy.mjs`'s
# measurement of where glibc actually misses, not a fixed geometric width).
NEAR_HALFWAY_BAND_INVERSE = 80

def exact_value_in_pow_rounding_band?(exact)
  bit_length = exact.bit_length
  shift = bit_length - 53
  return false if shift <= 0 # exactly representable: no rounding at all, let alone a band case.

  quotient = exact >> shift
  remainder = exact - (quotient << shift)
  full = 1 << shift
  offset = 2 * remainder - full
  offset.abs * NEAR_HALFWAY_BAND_INVERSE < 2 * full
end

# `libm.ts`'s refusal bands and reduction guard, read from its source the
# way `INTEGER_BIT_LIMIT` is read above, so a `libm-rounding-band` or
# `libm-reduction` row is validated against the port's ACTUAL figures.
LIBM_TS_SOURCE = File.read(File.join(__dir__, "..", "src", "evaluation", "libm.ts"))
LIBM_BAND_INVERSES = LIBM_TS_SOURCE.scan(/^  (\w+): band\("\1", (\d+)n,/).to_h { |fn, inverse| [fn, inverse.to_i] }
abort "REFUSING: could not read BANDS out of libm.ts" unless LIBM_BAND_INVERSES.size == 8

def libm_constant(pattern, what)
  match = LIBM_TS_SOURCE.match(pattern)
  abort "REFUSING: could not read #{what} out of libm.ts" unless match

  match[1].to_i
end

LIBM_LARGE_ARGUMENT = 2**libm_constant(/export const LARGE_ARGUMENT = 2 \*\* (\d+);/, "LARGE_ARGUMENT")
LIBM_SMALL_GUARD_BITS = libm_constant(/export const SMALL_ARGUMENT_GUARD_BITS = (\d+)n;/, "SMALL_ARGUMENT_GUARD_BITS")
LIBM_LARGE_GUARD_BITS = libm_constant(/export const LARGE_ARGUMENT_GUARD_BITS = (\d+)n;/, "LARGE_ARGUMENT_GUARD_BITS")

require_relative "lib/libm-reference"

# `libm-rounding-band` and `libm-reduction` rows: the C function and the
# double argument it is called with, keyed by row id. A `libm-rounding-band`
# row's exact result must lie within that function's band of a double
# midpoint (`LibmReference.rounded`, BigDecimal at 110 digits); a
# `libm-reduction` row's argument must be a reduced one (beyond pi/4) within
# the reduction guard of a multiple of pi/2 (`LibmReference.half_pi_distance`).
LIBM_REFUSAL_OPERANDS = {
  "libm-band-sin-glibc-miss" => ["sin", -6.428541877306998],
  "libm-band-cos-glibc-miss" => ["cos", -317.75792610645294],
  "libm-band-tan-glibc-miss" => ["tan", -3.203488953411579],
  "libm-band-arcsin-glibc-miss" => ["asin", -0.6042156000621617],
  "libm-band-arccos-glibc-miss" => ["acos", 0.5979652847163379],
  "libm-band-arctan-glibc-miss" => ["atan", 0.1211596090142848],
  "libm-band-exp-glibc-miss" => ["exp", -222.24369076996572],
  "libm-band-ln-glibc-miss" => ["log", 0.566132013569586],
  "libm-band-cot-glibc-miss" => ["tan", -3.203488953411579],
  "libm-band-sec-glibc-miss" => ["cos", -317.75792610645294],
  "libm-band-csc-glibc-miss" => ["sin", -6.428541877306998],
  "latex-libm-band-sin-glibc-miss" => ["sin", -6.428541877306998],
  "tan-pi-over-four" => ["tan", Math::PI / 4],
  "arccos-half" => ["acos", 0.5],
  "sin-pi" => ["sin", Math::PI],
  "latex-sin-pi" => ["sin", Math::PI],
  "cos-pi-over-two" => ["cos", Math::PI / 2],
  "tan-pi-over-two" => ["tan", Math::PI / 2],
  "cot-pi-over-two" => ["tan", Math::PI / 2],
  "sec-pi-over-two" => ["cos", Math::PI / 2],
  "csc-pi" => ["sin", Math::PI],
  "libm-reduction-cos-hardest-argument" => ["cos", 6_381_956_970_095_103 * 2.0**797],
  "libm-reduction-tan-six-pi" => ["tan", 6 * Math::PI],
}.freeze

def validate_libm_refusal!(id, port_refusal)
  fn, x = LIBM_REFUSAL_OPERANDS[id]
  abort "REFUSING: #{id}: marked #{port_refusal}, but no LIBM_REFUSAL_OPERANDS entry" unless fn

  if port_refusal == "libm-rounding-band"
    inverse = LIBM_BAND_INVERSES.fetch(fn) { abort "REFUSING: #{id}: libm.ts has no band for #{fn}" }
    _rounded, distance = LibmReference.rounded(fn, x)
    unless distance && distance < Rational(1, inverse)
      abort "REFUSING: #{id}: marked libm-rounding-band, but #{fn}(#{x}) lies #{distance.inspect} ULP " \
            "from a midpoint, outside libm.ts's 1/#{inverse} band"
    end
  else
    unless %w[sin cos tan].include?(fn) && x.abs > Math::PI / 4
      abort "REFUSING: #{id}: marked libm-reduction, but #{fn}(#{x}) is not a reduced sin/cos/tan argument"
    end
    bits = x.abs < LIBM_LARGE_ARGUMENT ? LIBM_SMALL_GUARD_BITS : LIBM_LARGE_GUARD_BITS
    distance = LibmReference.half_pi_distance(x)
    unless distance < Rational(1, 2**bits)
      abort "REFUSING: #{id}: marked libm-reduction, but #{x} lies #{distance.to_f} from a multiple " \
            "of pi/2, outside libm.ts's 2^-#{bits} guard"
    end
  end
end

def validate_port_refusal!(id, port_refusal, row)
  case port_refusal
  when "unported"
    # "the oracle succeeds" (item 6) means "the gem genuinely evaluates this
    # class" — the class's own `#evaluate` ran, whether it returned a value
    # or raised some OTHER evaluation error along the way (measured:
    # `unported-sin-missing-variable`'s `sin(x)` raises `MissingVariableError`
    # from evaluating its argument, never reaching `Sin`'s own trig step; the
    # port refuses before evaluating that argument at all, since it has not
    # ported `Sin#evaluate` to run it). What would falsify "unported" is the
    # GEM refusing the same construct itself, i.e. its own
    # `UnsupportedExpressionError` — that would mean the port and the gem
    # agree the construct is unsupported, which is the plain
    # `error-unsupported` case, not this one.
    if row["raises"] == "Plurimath::Errors::Evaluation::UnsupportedExpressionError"
      abort "REFUSING: #{id}: marked unported, but the oracle itself refuses this construct"
    end
    # And the label's positive claim: the formula really contains a class the
    # gem evaluates and the port has not ported (`UNPORTED_GEM_CLASSES`). A
    # row without one would be refused by the port for some other reason, or
    # not at all — `x+1` raising `MissingVariableError` is not `unported`.
    input = row["input"]
    formula = FORMAT_PARSERS.fetch(input["format"]).new(input["text"]).parse
    unported = gem_nodes(formula).filter_map { |node| UNPORTED_GEM_CLASSES[node.class.name] }.uniq
    if unported.empty?
      abort "REFUSING: #{id}: marked unported, but its formula contains no gem-evaluated class " \
            "evaluator.ts leaves unported (#{UNPORTED_GEM_CLASSES.values.sort.join(', ')})"
    end
  when "size-limit"
    intermediate = SIZE_LIMIT_INTERMEDIATES[id]
    abort "REFUSING: #{id}: marked size-limit, but no SIZE_LIMIT_INTERMEDIATES entry" unless intermediate
    bits = intermediate.call.bit_length
    unless bits > INTEGER_BIT_LIMIT
      abort "REFUSING: #{id}: marked size-limit, but the operand is #{bits} bits, " \
            "not beyond the port's #{INTEGER_BIT_LIMIT}-bit limit"
    end
  when "libm-rounding-band", "libm-reduction"
    validate_libm_refusal!(id, port_refusal)
  when "pow-rounding-band"
    operands = POW_ROUNDING_BAND_OPERANDS[id]
    abort "REFUSING: #{id}: marked pow-rounding-band, but no POW_ROUNDING_BAND_OPERANDS entry" unless operands
    base, exponent = operands
    exact = base.to_i.abs**exponent.to_i
    unless exact_value_in_pow_rounding_band?(exact)
      abort "REFUSING: #{id}: marked pow-rounding-band, but #{base}^#{exponent} is not within " \
            "0.04 ULP of a double midpoint"
    end
  end
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
  ["invalid-binding-false", "error-invalid-binding", "a+1"],
  ["invalid-binding-nil", "error-invalid-binding", "a+1"],
  ["invalid-binding-array", "error-invalid-binding", "a+1"],
  ["invalid-binding-hash", "error-invalid-binding", "a+1"],
  ["malformed-two-numbers", "error-unsupported", "2 3"],
  ["equation-unsupported", "error-unsupported", "1=1"],
  ["core-default-int", "error-unsupported", "int x"],
  ["core-default-base", "error-unsupported", "a_1"],
  ["core-default-lim", "error-unsupported", "lim_(x->0) x"],
  ["comma-in-group", "error-unsupported", "(2,3)"],
  # `Core#evaluate`'s class-based fallback, one row per node kind this port
  # models as its own `kind` (`evaluator.ts`'s `DEFAULT_UNSUPPORTED_CLASS`) —
  # each checks the exact "Function::<Basename>" (or "Formula::<Basename>")
  # phrase, not merely the error class, matching the class-based fallback's
  # own text (`evaluator.rb`'s `unsupported_message`).
  ["core-default-bar", "error-unsupported", "bar(x)"],
  ["core-default-ddot", "error-unsupported", "ddot(x)"],
  ["core-default-dot", "error-unsupported", "dot(x)"],
  ["core-default-hat", "error-unsupported", "hat(x)"],
  ["core-default-obrace", "error-unsupported", "obrace(x)"],
  ["core-default-ubrace", "error-unsupported", "ubrace(x)"],
  ["core-default-overset", "error-unsupported", "overset(x)(y)"],
  ["core-default-underset", "error-unsupported", "underset(x)(y)"],
  ["core-default-vec", "error-unsupported", "vec(x)"],
  ["core-default-tilde", "error-unsupported", "tilde(x)"],
  ["core-default-color", "error-unsupported", "color(red)(x)"],
  ["core-default-norm", "error-unsupported", "norm(x)"],
  ["core-default-table", "error-unsupported", "((1,2),(3,4))"],
  # `bb(x)` parses to the ALIASED `Function::FontStyle::Bold`, not the bare
  # `Function::FontStyle` — measured: no AsciiMath spelling this port's
  # grammar accepts reaches the bare carrier, so only the aliased phrase has
  # a row (`evaluator.ts`'s `describeUnsupportedNode` covers both).
  ["core-default-fontstyle-bold", "error-unsupported", "bb(x)"],
  # `\` then a newline then a space is AsciiMath's own linebreak spelling
  # (`Function::Linebreak#to_asciimath`); a literal one is unrepresentable in
  # this array literal's other single-line strings, so this row alone uses a
  # heredoc-free escape.
  ["core-default-linebreak", "error-unsupported", "\\\n x"],

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
  ["rational-intermediate-to-float", "exact-intermediate", "2^(-1)*2.0"],
  ["rational-zero-numerator", "representability", "a 3^(-1)"],
  ["rational-in-sum", "representability", "5+7^(-9)"],
  ["big-integer-power", "representability", "2^100"],
  ["big-integer-cancels", "exact-intermediate", "3^35+1-3^35"],
  ["big-integer-literal", "representability", "99999999999999999999"],
  ["big-integer-just-past-safe", "representability", "9007199254740991+1"],
  ["big-integer-intermediate-to-float", "exact-intermediate", "100^100-10.0"],
  ["pow-exact-halfway", "representability", "123456789^2.0"],
  ["rational-den-one-final", "representability", "2^(-1)+2^(-1)"],
  ["rational-power-den-one-exponent", "representability", "4^(2^(-1)*2)"],
  ["rational-one-to-rational", "representability", "1^(2^(-1))"],
  ["argument-error-bignum-exponent", "representability", "2^(2^62)"],
  ["argument-error-negative-fixnum-min", "representability", "3^(-2^62)"],
  ["size-limit-huge-power-times-zero", "representability", "2^5000000*0"],

  # Exact intermediates Ruby carries on with (`numeric.ts`): big Integers and
  # Rationals whose final value is a representable Integer or Float.
  ["big-integers-divided", "exact-intermediate", "2^100/2^99"],
  ["big-integer-difference", "exact-intermediate", "2^60-2^60+7"],
  ["big-integer-product-quotient", "exact-intermediate", "(3^40*3^40)/3^79"],
  ["rational-sum-to-float", "exact-intermediate", "(2^(-1)+2^(-1))*1.0"],
  ["rational-den-one-exponent-to-float", "exact-intermediate", "4^(2^(-1)*2)*1.0"],
  ["integer-to-rational-power", "exact-intermediate", "2^(2^(-1))"],
  ["rational-cubed-to-float", "exact-intermediate", "(2^(-1))^3*8.0"],
  ["rational-negative-power", "exact-intermediate", "(2^(-1))^(-2)+0.0"],
  ["rational-to-float-power", "exact-intermediate", "(2^(-1))^0.5"],
  ["rational-one-plus-float", "exact-intermediate", "1^(2^(-1))+0.0"],
  ["rational-zero-plus-float", "exact-intermediate", "0^(2^(-1))+0.0"],
  ["rational-reciprocal-divisor", "exact-intermediate", "1/2^(-1)"],
  ["rational-to-float-big-denominator", "exact-intermediate", "3*2^(-60)*1.0"],
  ["big-integer-to-float-rounding", "exact-intermediate", "(2^70+2^17+1)*1.0"],
  ["rational-minus-float", "exact-intermediate", "7^(-2)-0.5"],

  # A gem error raised later in evaluation order wins over an intermediate
  # value a JS number could not hold.
  ["later-missing-variable-after-big-integer", "exact-intermediate", "2^100+x"],
  ["later-missing-variable-after-rational", "exact-intermediate", "2^(-1)*y"],
  ["later-division-by-zero-after-big-integer", "exact-intermediate", "3^40*(1/0)"],
  ["later-zero-to-negative-rational", "exact-intermediate", "0^(-2^(-1))"],
  ["later-stray-token-after-big-integer", "exact-intermediate", "10 99999999^10+-2"],
  ["later-complex-after-rational", "exact-intermediate", "(-2)^(2^(-1))"],

  # `Abs`/`Ceil`/`Floor#evaluate` — the operand's own `abs`/`ceil`/`floor`;
  # `ceil`/`floor` always answer an Integer, and raise `FloatDomainError`
  # (`NonFiniteResultError`) for a non-finite Float.
  ["abs-integer", "abs", "abs(-2)"],
  ["abs-float", "abs", "abs(-2.5)"],
  ["abs-negative-zero", "abs", "abs(-0.0)"],
  ["abs-rational", "abs", "abs(-2^(-1))"],
  ["abs-rational-to-float", "abs", "abs(-2^(-1))*1.0"],
  ["abs-nan", "abs", "abs(a)"],
  ["abs-missing-variable", "abs", "abs(x)"],
  ["abs-nested", "abs", "abs(abs(-3)-5)"],
  ["ceil-float", "ceil-floor", "ceil(2.5)"],
  ["ceil-negative-to-zero", "ceil-floor", "ceil(-0.5)"],
  ["ceil-integer", "ceil-floor", "ceil(7)"],
  ["ceil-rational", "ceil-floor", "ceil(3*2^(-1))"],
  ["ceil-negative-rational", "ceil-floor", "ceil(-3*2^(-1))"],
  ["floor-negative-float", "ceil-floor", "floor(-2.5)"],
  ["floor-rational", "ceil-floor", "floor(3*2^(-1))"],
  ["floor-negative-rational", "ceil-floor", "floor(-3*2^(-1))"],
  ["floor-infinity", "ceil-floor", "floor(a)"],
  ["floor-nan", "ceil-floor", "floor(a)"],
  ["ceil-minus-infinity", "ceil-floor", "ceil(a)"],
  ["floor-huge-float", "ceil-floor", "floor(10.0^300)"],
  ["floor-huge-float-cancels", "ceil-floor", "floor(10.0^300)-floor(10.0^300)+1"],
  ["floor-float-binding", "ceil-floor", "floor(a)"],

  # `Gcd`/`Lcm#evaluate` — comma argument lists (`function_arguments`), every
  # argument evaluated before the Integer check.
  ["gcd-two", "gcd-lcm", "gcd(4,6)"],
  ["gcd-three", "gcd-lcm", "gcd(12,18,8)"],
  ["gcd-single-negative", "gcd-lcm", "gcd(-4)"],
  ["gcd-negative-pair", "gcd-lcm", "gcd(-4,6)"],
  ["gcd-zeros", "gcd-lcm", "gcd(0,0)"],
  ["gcd-big-operands", "gcd-lcm", "gcd(2^70,3*2^40)"],
  ["gcd-float-argument", "gcd-lcm", "gcd(4.0,6)"],
  ["gcd-rational-argument", "gcd-lcm", "gcd(2^(-1),2)"],
  ["gcd-missing-variable-before-domain", "gcd-lcm", "gcd(4.0,x)"],
  ["gcd-empty-argument", "gcd-lcm", "gcd(4,)"],
  ["gcd-bare-operand", "gcd-lcm", "gcd 12"],
  ["lcm-two", "gcd-lcm", "lcm(4,6)"],
  ["lcm-negative", "gcd-lcm", "lcm(-4,6)"],
  ["lcm-zero", "gcd-lcm", "lcm(0,6)"],
  ["lcm-three", "gcd-lcm", "lcm(2,3,4)"],
  ["lcm-float-argument", "gcd-lcm", "lcm(2.5,2)"],
  ["lcm-big-result", "gcd-lcm", "lcm(2^40,3^20)"],

  # `Min`/`Max#evaluate` — `Array#min`/`#max`: the first of equal values wins,
  # kind included; Integer/Float comparisons are exact; `NaN` against
  # anything raises Ruby's `ArgumentError`.
  ["max-two", "min-max", "max(2,3)"],
  ["min-two", "min-max", "min(2,3)"],
  ["max-list", "min-max", "max(1,5,3,5)"],
  ["min-list", "min-max", "min(4,-1.5,2)"],
  ["max-tie-integer-first", "min-max", "max(2,2.0)"],
  ["max-tie-float-first", "min-max", "max(2.0,2)"],
  ["min-tie-zero-first", "min-max", "min(0,-0.0)"],
  ["min-tie-negative-zero-first", "min-max", "min(-0.0,0)"],
  ["max-exact-integer-float-compare", "min-max", "max(2.0^53,2^53+1)-2^53"],
  ["max-rational-result", "min-max", "max(2^(-1),0.1)"],
  ["max-rational-loses", "min-max", "max(2^(-1),0.6)"],
  ["max-bare-operand", "min-max", "max 2"],
  ["max-empty", "min-max", "max()"],
  ["max-empty-first-argument", "min-max", "max(,2)"],
  ["max-single-nan", "min-max", "max(a)"],
  ["max-nan-first", "min-max", "max(a,1)"],
  ["min-nan-last", "min-max", "min(1,a)"],
  ["max-infinity", "min-max", "max(a,1)"],
  ["max-expression-arguments", "min-max", "max(1+2,2*2)"],

  # `Mod#evaluate` — `evaluator.modulo`: Ruby's `%` for each pair of kinds,
  # `DivisionByZeroError` on a zero divisor, and `evaluate_negated` for a
  # leading minus (`-7 mod 3` is `(-7) mod 3`).
  ["mod-integers", "mod", "7 mod 3"],
  ["mod-negated-dividend", "mod", "-7 mod 3"],
  ["mod-negative-divisor-token", "mod", "7 mod -3"],
  ["mod-float-dividend", "mod", "7.5 mod 2"],
  ["mod-negative-float-dividend", "mod", "-7.5 mod 2"],
  ["mod-integer-by-float", "mod", "7 mod 2.5"],
  ["mod-negative-zero", "mod", "-0.0 mod 3"],
  ["mod-zero-divisor", "mod", "7 mod 0"],
  ["mod-zero-float-divisor", "mod", "7 mod 0.0"],
  ["mod-by-infinity", "mod", "5 mod a"],
  ["mod-negative-by-infinity", "mod", "-5 mod a"],
  ["mod-by-minus-infinity", "mod", "5 mod a"],
  ["mod-infinity-dividend", "mod", "a mod 3"],
  ["mod-by-nan", "mod", "7 mod a"],
  ["mod-rational-dividend", "mod", "2^(-1) mod 3"],
  ["mod-rational-dividend-to-float", "mod", "(2^(-1) mod 3)*1.0"],
  ["mod-integer-by-rational", "mod", "(7 mod 3^(-1))*1.0"],
  ["mod-rational-by-float", "mod", "2^(-1) mod 0.3"],
  ["mod-rational-by-infinity", "mod", "2^(-1) mod a"],
  ["mod-rational-by-nan", "mod", "2^(-1) mod a"],
  ["mod-big-integer", "mod", "2^100 mod 7"],
  ["mod-big-integer-by-float", "mod", "2^100 mod 7.0"],
  ["mod-float-by-big-integer", "mod", "10.0 mod 2^100"],
  ["mod-missing-variable", "mod", "x mod 3"],
  ["mod-in-sum", "mod", "1+7 mod 3"],

  # `Sum`/`Prod#evaluate` — `Iteration#accumulate`: an `i=<start>` lower
  # bound, Integer bounds, a step count within the cap
  # (`Plurimath.configuration.evaluation_max_iterations`, default 100,000),
  # and the index bound over the body, shadowing and then restoring any
  # outer binding of the same name.
  ["sum-basic", "iteration", "sum_(i=1)^3 i"],
  ["prod-basic", "iteration", "prod_(i=1)^4 i"],
  ["sum-empty-range", "iteration", "sum_(i=3)^1 i"],
  ["prod-empty-range", "iteration", "prod_(i=5)^1 i"],
  ["sum-negative-range", "iteration", "sum_(i=-2)^2 i"],
  ["sum-float-body", "iteration", "sum_(i=1)^3 0.1"],
  ["sum-rational-body", "iteration", "sum_(i=1)^3 2^(-i)"],
  ["sum-rational-body-to-float", "iteration", "(sum_(i=1)^3 2^(-i))*1.0"],
  ["sum-nested", "iteration", "sum_(i=1)^3 sum_(j=1)^i j"],
  ["sum-text-body", "iteration", "sum_(i=1)^3 text(i)"],
  ["sum-shadows-binding", "iteration", "sum_(i=1)^3 i+i"],
  ["sum-upper-bound-variable", "iteration", "sum_(i=1)^n i"],
  ["prod-largest-safe", "iteration", "prod_(i=1)^18 i"],
  ["prod-big-integer", "iteration", "prod_(i=1)^25 i"],
  ["sum-at-cap", "iteration", "sum_(i=1)^100000 1"],
  ["sum-over-cap", "iteration", "sum_(i=1)^100001 i"],
  ["sum-over-cap-huge", "iteration", "sum_(i=1)^(2^100) i"],
  ["sum-custom-cap-within", "iteration", "sum_(i=1)^5 i"],
  ["sum-custom-cap-over", "iteration", "sum_(i=1)^6 i"],
  ["sum-no-cap", "iteration", "sum_(i=1)^100001 1"],
  ["sum-float-lower-bound", "iteration", "sum_(i=1.0)^3 i"],
  ["sum-float-upper-bound", "iteration", "sum_(i=1)^3.0 i"],
  ["sum-float-binding-bound", "iteration", "sum_(i=a)^3 i"],
  ["sum-rational-bound", "iteration", "sum_(i=2^(-1)*2)^3 i"],
  ["sum-reserved-index", "iteration", "sum_(pi=1)^3 i"],
  ["sum-malformed-bounds", "iteration", "sum_(i)^3 i"],
  ["sum-empty-start", "iteration", "sum_(i=)^3 i"],
  ["sum-missing-upper", "iteration", "sum_(i=1) i"],
  ["sum-bare", "iteration", "sum i"],
  ["sum-missing-variable-body", "iteration", "sum_(i=1)^3 x"],
  ["sum-division-by-zero-body", "iteration", "sum_(i=0)^2 1/i"],

  # `Root#evaluate` — `power(radicand, divide(1.0, index))`, radicand first.
  ["root-cube", "root", "root(3)(8)"],
  ["root-square", "root", "root(2)(9)"],
  ["root-irrational", "root", "root(2)(2)"],
  ["root-zero-index", "root", "root(0)(8)"],
  ["root-negative-radicand", "root", "root(3)(-8)"],
  ["root-missing-index-after-radicand", "root", "root(x)(y)"],

  # `Text#evaluate` — a plain, non-blank text names a variable.
  ["text-variable", "text", "text(ab)"],
  ["text-missing-variable", "text", "text(ab)"],
  ["text-stripped", "text", "text( ab )"],
  ["text-empty", "text", "text()"],
  ["text-in-arithmetic", "text", "2 text(ab)+1"],

  # The `Math` module functions (`libm.ts`): correctly rounded, refused
  # inside each function's measured band (the `libm-rounding-band` rows
  # below), with `math.c`'s argument conversion, domain errors and special
  # cases.
  ["sin-zero", "math-trig", "sin(0)"],
  ["sin-negative-zero", "math-trig", "sin(-0.0)"],
  ["sin-one", "math-trig", "sin(1)"],
  ["sin-pi", "math-reduction", "sin(pi)"],
  ["sin-pi-over-six", "math-trig", "sin(pi/6)"],
  ["sin-bare-operand", "math-trig", "sin 2"],
  ["sin-rational-argument", "math-trig", "sin(2^(-1))"],
  ["sin-large-argument", "math-trig", "sin(10.0^300)"],
  ["sin-huge-integer-argument", "math-trig", "sin(2^1100)"],
  ["sin-infinity", "math-trig", "sin(a)"],
  ["sin-nan", "math-trig", "sin(a)"],
  ["sin-missing-variable", "math-trig", "sin(x)"],
  ["sin-squared-missing-operand", "math-trig", "sin^2(a)"],
  ["sin-in-arithmetic", "math-trig", "2 sin(a)+1"],
  ["cos-zero", "math-trig", "cos(0)"],
  ["cos-one", "math-trig", "cos(1)"],
  ["cos-pi", "math-trig", "cos(pi)"],
  ["cos-pi-over-two", "math-reduction", "cos(pi/2)"],
  ["cos-degrees-typed", "math-trig", "cos(90)"],
  ["tan-zero", "math-trig", "tan(0)"],
  ["tan-one", "math-trig", "tan(1)"],
  ["tan-pi-over-four", "math-trig", "tan(pi/4)"],
  ["tan-pi-over-two", "math-reduction", "tan(pi/2)"],
  ["tan-negative", "math-trig", "tan(-2.5)"],
  ["cot-one", "math-reciprocal", "cot(1)"],
  ["cot-zero", "math-reciprocal", "cot(0)"],
  ["cot-negative-zero", "math-reciprocal", "cot(-0.0)"],
  ["cot-pi-over-two", "math-reduction", "cot(pi/2)"],
  ["sec-zero", "math-reciprocal", "sec(0)"],
  ["sec-one", "math-reciprocal", "sec(1)"],
  ["sec-pi-over-two", "math-reduction", "sec(pi/2)"],
  ["csc-one", "math-reciprocal", "csc(1)"],
  ["csc-zero", "math-reciprocal", "csc(0)"],
  ["csc-pi", "math-reduction", "csc(pi)"],
  ["csc-nan", "math-reciprocal", "csc(a)"],
  ["arcsin-half", "math-inverse-trig", "arcsin(0.5)"],
  ["arcsin-one", "math-inverse-trig", "arcsin(1)"],
  ["arcsin-negative-zero", "math-inverse-trig", "arcsin(-0.0)"],
  ["arcsin-out-of-domain", "math-inverse-trig", "arcsin(2)"],
  ["arcsin-below-domain", "math-inverse-trig", "arcsin(-1.5)"],
  ["arcsin-nan", "math-inverse-trig", "arcsin(a)"],
  ["arccos-half", "math-inverse-trig", "arccos(0.5)"],
  ["arccos-one", "math-inverse-trig", "arccos(1)"],
  ["arccos-minus-one", "math-inverse-trig", "arccos(-1)"],
  ["arccos-zero", "math-inverse-trig", "arccos(0)"],
  ["arccos-out-of-domain", "math-inverse-trig", "arccos(2)"],
  ["arctan-one", "math-inverse-trig", "arctan(1)"],
  ["arctan-infinity", "math-inverse-trig", "arctan(a)"],
  ["arctan-big-integer", "math-inverse-trig", "arctan(10^300)"],
  ["arctan-negative", "math-inverse-trig", "arctan(-3)"],
  ["exp-zero", "math-exp-log", "exp(0)"],
  ["exp-one", "math-exp-log", "exp(1)"],
  ["exp-negative", "math-exp-log", "exp(-2.5)"],
  ["exp-overflow", "math-exp-log", "exp(1000)"],
  ["exp-underflow", "math-exp-log", "exp(-1000)"],
  ["exp-subnormal", "math-exp-log", "exp(-745)"],
  ["exp-overflow-divided-away", "math-exp-log", "1/exp(1000)"],
  ["exp-rational-argument", "math-exp-log", "exp(2^(-1))"],
  ["ln-one", "math-exp-log", "ln(1)"],
  ["ln-two", "math-exp-log", "ln(2)"],
  ["ln-ten", "math-exp-log", "ln(10)"],
  ["ln-small", "math-exp-log", "ln(0.001)"],
  ["ln-zero", "math-exp-log", "ln(0)"],
  ["ln-negative-zero", "math-exp-log", "ln(-0.0)"],
  ["ln-negative", "math-exp-log", "ln(-1)"],
  ["ln-infinity", "math-exp-log", "ln(a)"],
  ["ln-big-integer", "math-exp-log", "ln(2^2000)"],
  ["ln-big-integer-1024-bits", "math-exp-log", "ln(2^1023)"],
  ["ln-big-integer-odd", "math-exp-log", "ln(3*2^1023+1)"],
  ["ln-big-integer-negative", "math-exp-log", "ln(-(2^2000))"],
  ["ln-rational-argument", "math-exp-log", "ln(2^(-1))"],
  ["ln-rational-underflows", "math-exp-log", "ln(2^(-2000))"],
  ["ln-rational-parts-overflow", "math-exp-log", "ln(2^1100*3^(-700))"],
  ["exp-of-ln", "math-exp-log", "exp(ln(2))"],
  ["sqrt-four", "math-sqrt", "sqrt(4)"],
  ["sqrt-two", "math-sqrt", "sqrt(2)"],
  ["sqrt-bare-operand", "math-sqrt", "sqrt 2"],
  ["sqrt-zero", "math-sqrt", "sqrt(0)"],
  ["sqrt-negative-zero", "math-sqrt", "sqrt(-0.0)"],
  ["sqrt-negative", "math-sqrt", "sqrt(-1)"],
  ["sqrt-infinity", "math-sqrt", "sqrt(a)"],
  ["sqrt-nan", "math-sqrt", "sqrt(a)"],
  ["sqrt-rational", "math-sqrt", "sqrt(2^(-1))"],
  ["sqrt-big-integer", "math-sqrt", "sqrt(2^2000)"],
  ["sqrt-in-sum", "math-sqrt", "sqrt(9)+sqrt(16)"],
  ["sin-pi-over-two", "math-trig", "sin(pi/2)"],

  # `libm-rounding-band`: an argument from `scripts/measure-libm-glibc-accuracy.mjs`'s
  # seeded sample where glibc itself missed the correctly rounded double, so
  # the gem's answer is one this port could not reproduce by correct rounding;
  # the port refuses it as inside the band. `cot`/`sec`/`csc` refuse through
  # the `tan`/`cos`/`sin` they are the reciprocal of.
  ["libm-band-sin-glibc-miss", "math-band", "sin(a)"],
  ["libm-band-cos-glibc-miss", "math-band", "cos(a)"],
  ["libm-band-tan-glibc-miss", "math-band", "tan(a)"],
  ["libm-band-arcsin-glibc-miss", "math-band", "arcsin(a)"],
  ["libm-band-arccos-glibc-miss", "math-band", "arccos(a)"],
  ["libm-band-arctan-glibc-miss", "math-band", "arctan(a)"],
  ["libm-band-exp-glibc-miss", "math-band", "exp(a)"],
  ["libm-band-ln-glibc-miss", "math-band", "ln(a)"],
  ["libm-band-cot-glibc-miss", "math-band", "cot(a)"],
  ["libm-band-sec-glibc-miss", "math-band", "sec(a)"],
  ["libm-band-csc-glibc-miss", "math-band", "csc(a)"],

  # `libm-reduction`: sin/cos/tan arguments so close to a multiple of pi/2
  # that glibc's range reduction decides the last bits — including the double
  # closest to a multiple of pi/2 of all (glibc's `cos` is 8 ULP out there)
  # and `6pi`, where glibc's `tan` misses at 0.18 ULP from the midpoint.
  ["libm-reduction-cos-hardest-argument", "math-reduction", "cos(6381956970095103*2.0^797)"],
  ["libm-reduction-tan-six-pi", "math-reduction", "tan(6pi)"],

  # Gem-evaluated nodes this port has not ported: the hyperbolic functions
  # and `Log`/`Lg`, pending a licensing decision about copying C-library
  # code. (`lg` is AsciiMath for the variables `l` and `g`; `\lg` is LaTeX's
  # `Lg`, in `LATEX_ROWS`.)
  ["unported-sinh", "unported", "sinh(1)"],
  ["unported-cosh", "unported", "cosh(1)"],
  ["unported-tanh", "unported", "tanh(1)"],
  ["unported-sech", "unported", "sech(1)"],
  ["unported-csch", "unported", "csch(1)"],
  ["unported-coth", "unported", "coth(1)"],
  ["unported-log", "unported", "log(100)"],
  ["unported-log-base", "unported", "log_2(8)"],
  ["unported-sinh-missing-variable", "unported", "sinh(x)"],

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

# LaTeX-input rows: the same operator and error surface as `ROWS` above, in a
# second input format — `evaluate()` accepts a `FormulaNode` from ANY parsed
# format, not only AsciiMath (`bindings.ts`'s header), and every row above
# until this point was AsciiMath, which checked nothing about how a LaTeX
# parse feeds the same evaluator.
LATEX_ROWS = [
  ["latex-add-integers", "arithmetic", "2+3"],
  ["latex-divide-inexact", "arithmetic", "1/2"],
  ["latex-power-braced", "power", "2^{3}"],
  ["latex-frac", "arithmetic", "\\frac{1}{2}"],
  ["latex-sqrt", "math-sqrt", "\\sqrt{4}"],
  ["latex-variable-lookup", "symbol", "a+1"],
  ["latex-missing-variable", "error-missing-variable", "b+1"],
  ["latex-division-by-zero", "error-division-by-zero", "1/0"],
  ["latex-invalid-binding-string", "error-invalid-binding", "a+1"],
  ["latex-core-default-bar", "error-unsupported", "\\bar{x}"],
  ["latex-core-default-hat", "error-unsupported", "\\hat{x}"],
  ["latex-core-default-vec", "error-unsupported", "\\vec{x}"],
  ["latex-big-integer-power", "representability", "2^{100}"],
  ["latex-rational-integer-negative-power", "representability", "2^{-1}"],
  ["latex-gcd", "gcd-lcm", "\\gcd(4,6)"],
  ["latex-max", "min-max", "\\max(2,3.5)"],
  ["latex-min", "min-max", "\\min(1,2)"],
  ["latex-mod", "mod", "7 \\mod 3"],
  ["latex-bmod-negated", "mod", "-7 \\bmod 3"],
  ["latex-sum", "iteration", "\\sum_{i=1}^{3} i"],
  ["latex-prod", "iteration", "\\prod_{i=1}^{4} i"],
  ["latex-sum-over-cap", "iteration", "\\sum_{i=1}^{100001} i"],
  ["latex-sum-float-bound", "iteration", "\\sum_{i=1}^{3.5} i"],
  ["latex-root", "root", "\\sqrt[3]{8}"],
  ["latex-text-variable", "text", "\\text{ab}"],
  ["latex-lfloor-is-a-group", "ceil-floor", "\\lfloor 2.5 \\rfloor"],
  ["latex-lceil-is-a-group", "ceil-floor", "\\lceil 2.5 \\rceil"],
  ["latex-abs-vert", "abs", "\\left|x\\right|"],
  ["latex-mod-zero", "mod", "7 \\bmod 0"],
  ["latex-sin", "math-trig", "\\sin(1)"],
  ["latex-sin-bare", "math-trig", "\\sin x"],
  ["latex-sin-pi", "math-reduction", "\\sin(\\pi)"],
  ["latex-libm-band-sin-glibc-miss", "math-band", "\\sin(a)"],
  ["latex-cos-braced", "math-trig", "\\cos{0}"],
  ["latex-tan", "math-trig", "\\tan(2)"],
  ["latex-cot-zero", "math-reciprocal", "\\cot(0)"],
  ["latex-sec", "math-reciprocal", "\\sec(1)"],
  ["latex-csc", "math-reciprocal", "\\csc(1)"],
  ["latex-arcsin", "math-inverse-trig", "\\arcsin(0.5)"],
  ["latex-arccos-out-of-domain", "math-inverse-trig", "\\arccos(2)"],
  ["latex-arctan", "math-inverse-trig", "\\arctan 1"],
  ["latex-exp", "math-exp-log", "\\exp(1)"],
  ["latex-ln", "math-exp-log", "\\ln 2"],
  ["latex-ln-negative", "math-exp-log", "\\ln(-1)"],
  ["latex-sqrt-two", "math-sqrt", "\\sqrt{2}"],
  ["latex-sqrt-negative", "math-sqrt", "\\sqrt{-1}"],
  ["latex-unported-sinh", "unported", "\\sinh(1)"],
  ["latex-unported-lg", "unported", "\\lg(100)"],
  ["latex-unported-log", "unported", "\\log(100)"],
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
  "invalid-binding-false" => { "a" => false },
  "invalid-binding-nil" => { "a" => nil },
  "invalid-binding-array" => { "a" => [1, 2] },
  "invalid-binding-hash" => { "a" => { "b" => 1 } },
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
  "latex-variable-lookup" => { "a" => 2 },
  "latex-invalid-binding-string" => { "a" => "x" },
  "abs-nan" => { "a" => Float::NAN },
  "floor-infinity" => { "a" => Float::INFINITY },
  "floor-nan" => { "a" => Float::NAN },
  "ceil-minus-infinity" => { "a" => -Float::INFINITY },
  "floor-float-binding" => { "a" => -3.75 },
  "max-single-nan" => { "a" => Float::NAN },
  "max-nan-first" => { "a" => Float::NAN },
  "min-nan-last" => { "a" => Float::NAN },
  "max-infinity" => { "a" => Float::INFINITY },
  "mod-by-infinity" => { "a" => Float::INFINITY },
  "mod-negative-by-infinity" => { "a" => Float::INFINITY },
  "mod-by-minus-infinity" => { "a" => -Float::INFINITY },
  "mod-infinity-dividend" => { "a" => Float::INFINITY },
  "mod-by-nan" => { "a" => Float::NAN },
  "mod-rational-by-infinity" => { "a" => Float::INFINITY },
  "mod-rational-by-nan" => { "a" => Float::NAN },
  "sum-shadows-binding" => { "i" => 7 },
  "sum-upper-bound-variable" => { "n" => 4 },
  "sum-float-binding-bound" => { "a" => 1.5 },
  "text-variable" => { "ab" => 3 },
  "text-stripped" => { "ab" => 3 },
  "text-in-arithmetic" => { "ab" => 4 },
  "latex-text-variable" => { "ab" => 5 },
  "latex-abs-vert" => { "x" => -2 },
  "sin-infinity" => { "a" => Float::INFINITY },
  "sin-nan" => { "a" => Float::NAN },
  "sin-squared-missing-operand" => { "a" => 0.5 },
  "sin-in-arithmetic" => { "a" => 0.75 },
  "csc-nan" => { "a" => Float::NAN },
  "arcsin-nan" => { "a" => Float::NAN },
  "arctan-infinity" => { "a" => Float::INFINITY },
  "ln-infinity" => { "a" => Float::INFINITY },
  "sqrt-infinity" => { "a" => Float::INFINITY },
  "sqrt-nan" => { "a" => Float::NAN },
  "latex-sin-bare" => { "x" => 0.5 },
  "libm-band-sin-glibc-miss" => { "a" => -6.428541877306998 },
  "libm-band-cos-glibc-miss" => { "a" => -317.75792610645294 },
  "libm-band-tan-glibc-miss" => { "a" => -3.203488953411579 },
  "libm-band-arcsin-glibc-miss" => { "a" => -0.6042156000621617 },
  "libm-band-arccos-glibc-miss" => { "a" => 0.5979652847163379 },
  "libm-band-arctan-glibc-miss" => { "a" => 0.1211596090142848 },
  "libm-band-exp-glibc-miss" => { "a" => -222.24369076996572 },
  "libm-band-ln-glibc-miss" => { "a" => 0.566132013569586 },
  "libm-band-cot-glibc-miss" => { "a" => -3.203488953411579 },
  "libm-band-sec-glibc-miss" => { "a" => -317.75792610645294 },
  "libm-band-csc-glibc-miss" => { "a" => -6.428541877306998 },
  "latex-libm-band-sin-glibc-miss" => { "a" => -6.428541877306998 },
}.freeze

# Per-row gem configuration (`with_options`), keyed by row id; every other row
# runs with the gem's defaults.
OPTIONS = {
  "sum-custom-cap-within" => { "evaluationMaxIterations" => 5 },
  "sum-custom-cap-over" => { "evaluationMaxIterations" => 5 },
  "sum-no-cap" => { "evaluationMaxIterations" => nil },
}.freeze

# Rows the port refuses with `UnsupportedFeatureError`, each with its reason
# (see the header).
PORT_REFUSALS = {
  "rational-integer-negative-power" => "rational",
  "rational-zero-numerator" => "rational",
  "rational-in-sum" => "rational",
  "rational-den-one-final" => "rational",
  "rational-power-den-one-exponent" => "rational",
  "rational-one-to-rational" => "rational",
  "big-integer-power" => "big-integer",
  "big-integer-literal" => "big-integer",
  "big-integer-just-past-safe" => "big-integer",
  "argument-error-bignum-exponent" => "argument-error",
  "argument-error-negative-fixnum-min" => "argument-error",
  "size-limit-huge-power-times-zero" => "size-limit",
  "pow-exact-halfway" => "pow-rounding-band",
  "unported-sinh" => "unported",
  "unported-cosh" => "unported",
  "unported-tanh" => "unported",
  "unported-sech" => "unported",
  "unported-csch" => "unported",
  "unported-coth" => "unported",
  "unported-log" => "unported",
  "unported-log-base" => "unported",
  "unported-sinh-missing-variable" => "unported",
  "latex-unported-sinh" => "unported",
  "latex-unported-lg" => "unported",
  "latex-unported-log" => "unported",
  "libm-band-sin-glibc-miss" => "libm-rounding-band",
  "libm-band-cos-glibc-miss" => "libm-rounding-band",
  "libm-band-tan-glibc-miss" => "libm-rounding-band",
  "libm-band-arcsin-glibc-miss" => "libm-rounding-band",
  "libm-band-arccos-glibc-miss" => "libm-rounding-band",
  "libm-band-arctan-glibc-miss" => "libm-rounding-band",
  "libm-band-exp-glibc-miss" => "libm-rounding-band",
  "libm-band-ln-glibc-miss" => "libm-rounding-band",
  "libm-band-cot-glibc-miss" => "libm-rounding-band",
  "libm-band-sec-glibc-miss" => "libm-rounding-band",
  "libm-band-csc-glibc-miss" => "libm-rounding-band",
  "latex-libm-band-sin-glibc-miss" => "libm-rounding-band",
  "tan-pi-over-four" => "libm-rounding-band",
  "arccos-half" => "libm-rounding-band",
  "sin-pi" => "libm-reduction",
  "latex-sin-pi" => "libm-reduction",
  "cos-pi-over-two" => "libm-reduction",
  "tan-pi-over-two" => "libm-reduction",
  "cot-pi-over-two" => "libm-reduction",
  "sec-pi-over-two" => "libm-reduction",
  "csc-pi" => "libm-reduction",
  "libm-reduction-cos-hardest-argument" => "libm-reduction",
  "libm-reduction-tan-six-pi" => "libm-reduction",
  "abs-rational" => "rational",
  "floor-huge-float" => "big-integer",
  "lcm-big-result" => "big-integer",
  "max-rational-result" => "rational",
  "max-nan-first" => "argument-error",
  "min-nan-last" => "argument-error",
  "mod-rational-dividend" => "rational",
  "sum-rational-body" => "rational",
  "prod-big-integer" => "big-integer",
  "latex-big-integer-power" => "big-integer",
  "latex-rational-integer-negative-power" => "rational",
}.freeze

ALL_ROW_IDS = (ROWS + LATEX_ROWS).map(&:first)
unknown = (BINDINGS.keys + PORT_REFUSALS.keys + OPTIONS.keys) - ALL_ROW_IDS
abort "REFUSING: BINDINGS/PORT_REFUSALS/OPTIONS name unknown rows: #{unknown.join(', ')}" unless unknown.empty?

SOURCE = "hand-built for scripts/generate-evaluation-fixtures.rb"

rows = ROWS.map { |id, group, text| [id, group, text, "asciimath"] }
  .concat(LATEX_ROWS.map { |id, group, text| [id, group, text, "latex"] })
  .map do |id, group, text, format|
    bindings = BINDINGS.fetch(id, {})
    row = evaluate_row(id, group, SOURCE, format, text, bindings, PORT_REFUSALS[id], OPTIONS.fetch(id, {}))
    validate_port_refusal!(id, PORT_REFUSALS[id], row)
    row
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
