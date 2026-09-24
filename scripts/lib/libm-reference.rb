# frozen_string_literal: true

# The Ruby half of `scripts/measure-libm-glibc-accuracy.mjs`. Reads a JSON
# array of doubles (as 16-digit big-endian hex, so no decimal round trip can
# change them) from standard input, and for each one prints what the platform
# C library returns for `Math.<fn>(x)` — glibc on the oracle's Linux host —
# alongside an arbitrary-precision reference: the correctly rounded double,
# and the exact result's distance from the midpoint between the two doubles
# either side of it, as a fraction of one ULP (0 = an exact tie, 0.5 = as far
# from a tie as possible). The method is
# `.codex-context/evidence/2026-09-23-libm/libm/reference.rb`'s, with two
# corrections that matter for this measurement:
#
# - the argument is converted to BigDecimal EXACTLY (a double's decimal
#   expansion has at most 767 significant digits), not rounded to 60 digits,
#   which moves `sin(x)` for any `x` above about `1e45`;
# - `sin`/`cos`/`tan` are reduced modulo `pi/2` by hand with a 520-digit `pi`,
#   enough for the largest double, before `BigMath` sees the argument.
#
# The bracket around the reference is found by stepping from `to_f`, rather
# than trusting `Rational#to_f` to be correctly rounded (`numeric.ts`'s
# `rationalToDouble` notes it is not guaranteed to be).
#
#   ruby scripts/lib/libm-reference.rb <sin|cos|tan|asin|acos|atan|exp|log|sqrt>
#
# Prints a JSON array of `[glibc_hex, correctly_rounded_hex, distance]`, with
# `nil` for the last two where the reference is outside the double range.
# `scripts/generate-evaluation-fixtures.rb` requires this file for
# `LibmReference.rounded` and `LibmReference.half_pi_distance`, which validate
# its `libm-rounding-band` and `libm-reduction` rows.

require "bigdecimal"
require "bigdecimal/math"
require "json"

module LibmReference
  DIGITS = 110
  PI = BigMath.PI(520)
  HALF_PI = PI / 2
  DOUBLE_MAX = Float::MAX.to_r

  module_function

  def from_hex(hex) = [hex].pack("H*").unpack1("G")
  def hex_of(float) = [float].pack("G").unpack1("H*")

  def to_ordered(bits)
    (bits >> 63) == 1 ? (~bits) & 0xFFFF_FFFF_FFFF_FFFF : bits | 0x8000_0000_0000_0000
  end

  def from_ordered(ordered)
    (ordered >> 63) == 1 ? ordered & 0x7FFF_FFFF_FFFF_FFFF : (~ordered) & 0xFFFF_FFFF_FFFF_FFFF
  end

  def step(float, delta)
    [from_ordered(to_ordered(hex_of(float).to_i(16)) + delta)].pack("Q>").unpack1("G")
  end

  def exact(x)
    r = x.to_r
    value = BigDecimal(r.numerator).div(BigDecimal(r.denominator), 800)
    raise "inexact conversion of #{x}" unless value.to_r == r

    value
  end

  # `[k, r]` with `x = k * pi/2 + r`, `k` the nearest integer.
  def reduce(x)
    k = x.div(HALF_PI, 600).round
    [k, x - (HALF_PI * k)]
  end

  # `|x - k pi/2|` for the nearest multiple, as a Rational.
  def half_pi_distance(x)
    _k, r = reduce(exact(x.abs))
    r.abs.to_r
  end

  # `[sin, cos]` of `x`, reduced by hand first.
  def sin_cos(x)
    k, r = reduce(x)
    r = r.round(170)
    s = BigMath.sin(r, DIGITS)
    c = BigMath.cos(r, DIGITS)
    case k % 4
    when 0 then [s, c]
    when 1 then [c, -s]
    when 2 then [-s, -c]
    else [-c, s]
    end
  end

  def reference(fn, x)
    return nil unless x.finite?

    b = exact(x)
    case fn
    when "sin" then sin_cos(b)[0]
    when "cos" then sin_cos(b)[1]
    when "tan"
      s, c = sin_cos(b)
      s.div(c, DIGITS)
    when "asin" then x.abs <= 1 ? BigMath.asin(b, DIGITS) : nil
    when "acos" then x.abs <= 1 ? BigMath.acos(b, DIGITS) : nil
    when "atan" then BigMath.atan(b, DIGITS)
    when "exp" then BigMath.exp(b, DIGITS)
    when "log" then x.positive? ? BigMath.log(b, DIGITS) : nil
    when "sqrt" then x.positive? ? BigMath.sqrt(b, DIGITS) : nil
    else raise "unknown function #{fn}"
    end
  end

  # `[correctly_rounded, distance]` for `fn(x)`, or nil outside the double range.
  def rounded(fn, x)
    value = reference(fn, x)
    return nil if value.nil?

    exact_value = value.to_r
    return nil if exact_value.abs > DOUBLE_MAX
    return [0.0, 0.5] if exact_value.zero?

    low = exact_value.to_f
    low = step(low, -1) while low.to_r > exact_value
    low = step(low, 1) while step(low, 1).to_r <= exact_value
    return [low, 0.5] if low.to_r == exact_value

    high = step(low, 1)
    fraction = (exact_value - low.to_r) / (high.to_r - low.to_r)
    [fraction <= Rational(1, 2) ? low : high, (fraction - Rational(1, 2)).abs.to_f]
  end
end

if $PROGRAM_NAME == __FILE__
  fn = ARGV.fetch(0)
  out = JSON.parse($stdin.read).map do |hex|
    x = LibmReference.from_hex(hex)
    glibc = begin
      Math.public_send(fn, x)
    rescue Math::DomainError
      nil
    end
    cr, distance = LibmReference.rounded(fn, x)
    [glibc && LibmReference.hex_of(glibc), cr && LibmReference.hex_of(cr), distance]
  end
  puts JSON.generate(out)
end
