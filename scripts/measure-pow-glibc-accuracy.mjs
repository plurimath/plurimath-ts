#!/usr/bin/env node
// Sizes `pow.ts`'s refusal band from where glibc's `pow` actually misses the
// correctly-rounded double, not from the geometric width of a fixed band —
// the method `.codex-context/evidence/2026-09-23-libm/libm/reference.rb`
// used for `sin`/`cos`/`tan`/`asin`/`acos`/etc: an arbitrary-precision
// reference value, the exact bracket between the two doubles either side of
// it, and the sampled value's distance from the midpoint of that bracket, as
// a fraction of one ULP (0 = an exact tie, 0.5 = as far from a tie as
// possible). `measure-pow-rounding-band.mjs` measures how often the CURRENT
// band triggers; this script measures whether that band's WIDTH is the right
// one, by finding the worst actual glibc miss.
//
//   node scripts/measure-pow-glibc-accuracy.mjs [pairCount]
//
// Requires a `ruby` on PATH with `bigdecimal` (stdlib since Ruby 1.9, no gem
// needed) for the arbitrary-precision reference.
//
// Uses the SAME seeded sample as `measure-pow-rounding-band.mjs`
// (`scripts/lib/pow-sample.mjs`), plus a handful of hand-typed cases
// (`2^0.5`, `10^-3`, `1.1^10`, `3^0.2` and similar) a reviewer would actually
// write in a formula, which the wide-domain uniform sample does not
// resemble.

import { execFileSync } from "node:child_process";
import { generatePairs, HUMAN_TYPED_CASES } from "./lib/pow-sample.mjs";

const pairCount = Number(process.argv[2] ?? 100_000);
const pairs = [...generatePairs(pairCount), ...HUMAN_TYPED_CASES.map((p) => ({ ...p, human: true }))];

// One Ruby process for the whole sample. `BigDecimal`/`BigMath` at PREC=70
// (~230 bits, vastly more than the 53 a double needs) is the same precision
// `reference.rb` used. For an integer exponent the reference is instead an
// EXACT `Rational` power (`x.to_r ** y`, exact because `x`'s own `to_r` is
// exact for a double and an integer power of an exact Rational is exact) —
// stronger than BigDecimal's approximation, and available because `pow.ts`
// itself branches the same way (`exactIntegerPower` vs `logExpPower`).
const rubyScript = `
  require "bigdecimal"
  require "bigdecimal/math"
  require "json"

  PREC = 70

  def hex_of(f)
    [f].pack("G").unpack1("H*")
  end

  def bits_of(f)
    hex_of(f).to_i(16)
  end

  def float_of_bits(bits)
    [bits].pack("Q>").unpack1("G")
  end

  def to_ordered(bits)
    (bits >> 63) == 1 ? (~bits) & 0xFFFFFFFFFFFFFFFF : bits | 0x8000000000000000
  end

  def from_ordered(ordered)
    (ordered >> 63) == 1 ? ordered & 0x7FFFFFFFFFFFFFFF : (~ordered) & 0xFFFFFFFFFFFFFFFF
  end

  def next_up(f)
    float_of_bits(from_ordered(to_ordered(bits_of(f)) + 1))
  end

  def next_down(f)
    float_of_bits(from_ordered(to_ordered(bits_of(f)) - 1))
  end

  # [exact_rational, correctly_rounded_float, dist_from_midpoint_ulp], or nil
  # if the reference itself is not finite (overflow, out of double range).
  def reference_for(x, y)
    if y == y.to_i
      er = Rational(x.to_r) ** y.to_i
    else
      log_x = BigMath.log(BigDecimal(x.to_r, PREC), PREC)
      er = BigMath.exp(BigDecimal(y.to_r, PREC) * log_x, PREC).to_r
    end
    g = er.to_f
    return nil unless g.finite?
    if er == g.to_r
      return [er, g, 0.5]
    elsif er > g.to_r
      d0, d1 = g, next_up(g)
    else
      d0, d1 = next_down(g), g
    end
    r0, r1 = d0.to_r, d1.to_r
    return nil if r1 == r0
    frac = (er - r0).to_f / (r1 - r0).to_f
    cr = frac <= 0.5 ? d0 : d1
    [er, cr, (frac - 0.5).abs]
  end

  pairs = JSON.parse(STDIN.read)
  out = pairs.map do |p|
    x, y = p["x"].to_f, p["y"].to_f
    glibc = x ** y
    ref = reference_for(x, y)
    next { "inDomain" => false } if ref.nil?
    _er, cr, dist = ref
    { "inDomain" => true, "dist" => dist, "glibcCorrect" => glibc.eql?(cr) }
  end
  puts JSON.generate(out)
`;

const rubyOut = execFileSync("ruby", ["-e", rubyScript], {
  input: JSON.stringify(pairs.map(({ x, y }) => ({ x, y }))),
  maxBuffer: 1 << 28,
  encoding: "utf8",
});
const results = JSON.parse(rubyOut);

let inDomain = 0;
let glibcCorrect = 0;
const mismatchDists = [];
const mismatchExamples = [];

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (!r.inDomain) continue;
  inDomain++;
  if (r.glibcCorrect) {
    glibcCorrect++;
  } else {
    mismatchDists.push(r.dist);
    if (mismatchExamples.length < 10) {
      mismatchExamples.push({ ...pairs[i], dist: r.dist });
    }
  }
}

mismatchDists.sort((a, b) => a - b);
const maxMismatchDist = mismatchDists.length > 0 ? mismatchDists[mismatchDists.length - 1] : 0;
const MARGIN = 2;
const recommendedBand = maxMismatchDist * MARGIN;

const rubyVersion = execFileSync("ruby", ["-v"], { encoding: "utf8" }).trim();
console.log(`seed present in sample: ${pairCount} generated + ${HUMAN_TYPED_CASES.length} human-typed`);
console.log(`ruby: ${rubyVersion}`);
console.log(`in-domain pairs: ${inDomain}`);
console.log(
  `glibc correctly rounded: ${glibcCorrect} (${((glibcCorrect / inDomain) * 100).toFixed(4)}%)`,
);
console.log(`glibc mismatches: ${mismatchDists.length}`);
console.log(`max dist-from-midpoint over glibc mismatches: ${maxMismatchDist.toFixed(6)} ULP`);
console.log(`recommended band (max mismatch dist x ${MARGIN} margin): ${recommendedBand.toFixed(6)} ULP`);
if (mismatchExamples.length > 0) {
  console.log("mismatch examples (up to 10):");
  for (const example of mismatchExamples) {
    console.log(`  x=${example.x} y=${example.y} dist=${example.dist.toFixed(6)}`);
  }
}
if (maxMismatchDist > 0.1) {
  console.error(
    `REFUSING to recommend a band: a glibc miss at dist=${maxMismatchDist.toFixed(6)} ULP is far ` +
      "from the midpoint (> 0.1 ULP) — this needs a design decision, not a wider band.",
  );
  process.exitCode = 1;
}
