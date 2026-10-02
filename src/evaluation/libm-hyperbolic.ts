/* @(#)e_sinh.c 1.3 95/01/18, @(#)e_cosh.c 1.3 95/01/18, @(#)s_tanh.c 1.3 95/01/18 */
/*
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */

/* __ieee754_sinh(x)
 * Method :
 * mathematically sinh(x) if defined to be (exp(x)-exp(-x))/2
 *	1. Replace x by |x| (sinh(-x) = -sinh(x)).
 *	2.
 *		                                    E + E/(E+1)
 *	    0        <= x <= 22     :  sinh(x) := --------------, E=expm1(x)
 *			       			        2
 *
 *	    22       <= x <= lnovft :  sinh(x) := exp(x)/2
 *	    lnovft   <= x <= ln2ovft:  sinh(x) := exp(x/2)/2 * exp(x/2)
 *	    ln2ovft  <  x	    :  sinh(x) := x*shuge (overflow)
 *
 * Special cases:
 *	sinh(x) is |x| if x is +INF, -INF, or NaN.
 *	only sinh(0)=0 is exact for finite x.
 */

/* __ieee754_cosh(x)
 * Method :
 * mathematically cosh(x) if defined to be (exp(x)+exp(-x))/2
 *	1. Replace x by |x| (cosh(x) = cosh(-x)).
 *	2.
 *		                                        [ exp(x) - 1 ]^2
 *	    0        <= x <= ln2/2  :  cosh(x) := 1 + -------------------
 *			       			           2*exp(x)
 *
 *		                                  exp(x) +  1/exp(x)
 *	    ln2/2    <= x <= 22     :  cosh(x) := -------------------
 *			       			          2
 *	    22       <= x <= lnovft :  cosh(x) := exp(x)/2
 *	    lnovft   <= x <= ln2ovft:  cosh(x) := exp(x/2)/2 * exp(x/2)
 *	    ln2ovft  <  x	    :  cosh(x) := huge*huge (overflow)
 *
 * Special cases:
 *	cosh(x) is |x| if x is +INF, -INF, or NaN.
 *	only cosh(0)=1 is exact for finite x.
 */

/* Tanh(x)
 * Return the Hyperbolic Tangent of x
 *
 * Method :
 *				       x    -x
 *				      e  - e
 *	0. tanh(x) is defined to be -----------
 *				       x    -x
 *				      e  + e
 *	1. reduce x to non-negative by tanh(-x) = -tanh(x).
 *	2.  0      <= x <= 2**-55 : tanh(x) := x*(one+x)
 *					        -t
 *	    2**-55 <  x <=  1     : tanh(x) := -----; t = expm1(-2x)
 *					       t + 2
 *						     2
 *	    1      <= x <=  22.0  : tanh(x) := 1-  ----- ; t=expm1(2x)
 *						   t + 2
 *	    22.0   <  x <= INF    : tanh(x) := 1.
 *
 * Special cases:
 *	tanh(NaN) is NaN;
 *	only tanh(0)=0 is exact for finite argument.
 */

/**
 * Ruby's `Math.sinh`, `Math.cosh` and `Math.tanh` (`math.c`), which call the
 * C library's: glibc 2.35 on the oracle's host. glibc's `sinh`, `cosh` and
 * `tanh` are Sun's fdlibm 5.3 routines (`e_sinh.c`, `e_cosh.c`, `s_tanh.c`,
 * notice and methods above), transcribed here with the same branch points,
 * constants and operations, each a plain IEEE double operation, as it is in
 * JavaScript. Their two calls out:
 *
 * - `expm1`: `libm-expm1.ts`, fdlibm's with the polynomial order that gives
 *   glibc's digits. Every region that goes only through it (`REGIONS`, path
 *   `expm1`) answers glibc's double, bit for bit, and never refuses.
 * - `__ieee754_exp`: glibc's `exp`, which this port stands in for with the
 *   correctly rounded `exp` of `libm.ts`, refused inside `exp`'s band
 *   (`BANDS.exp`, sized by `scripts/measure-libm-glibc-accuracy.mjs`). Outside
 *   the band that double is glibc's, and the rest of the formula is again
 *   plain double arithmetic, so a region through `exp` (paths `exp` and
 *   `exp-half`) answers glibc's double wherever its `exp` call is answered.
 *
 * `scripts/measure-libm-hyperbolic-glibc.mjs` is the differential against
 * Ruby's `Math` (`test/evaluation/libm-hyperbolic-corpus.json`;
 * `TODO.plan/deferred.md`, "Evaluation: the hyperbolic functions").
 */

import { UnsupportedFeatureError } from "../core/errors";
import { bandFor, CORRECTLY_ROUNDED } from "./libm";
import { expm1 } from "./libm-expm1";
import { mathArgument, type RubyNumeric } from "./numeric";
import type { RoundingBand } from "./pow";

/** The C library functions this module stands in for. */
export type HyperbolicFunction = "sinh" | "cosh" | "tanh";

const view = new DataView(new ArrayBuffer(8));

/** `__HI(x)`, as fdlibm's signed `int`. */
function highWord(x: number): number {
  view.setFloat64(0, x);
  return view.getInt32(0);
}

/** `__LO(x)`, as fdlibm's `unsigned`. */
function lowWord(x: number): number {
  view.setFloat64(0, x);
  return view.getUint32(4);
}

const one = 1.0;
const half = 0.5;
const two = 2.0;
const shuge = 1.0e307;
const huge = 1.0e300;
const tiny = 1.0e-300;

/**
 * `__ieee754_exp(a)` for the `fn` of `x`: the correctly rounded `exp(a)`,
 * refused inside `exp`'s band, where glibc's `exp` may return either
 * neighbour.
 */
function glibcExp(fn: HyperbolicFunction, a: number): number {
  const expBand = bandFor("exp", a);
  const band: RoundingBand = {
    inverse: expBand.inverse,
    refuse: () => {
      throw new UnsupportedFeatureError(
        "evaluate",
        `the exact exp(${a}) that ${fn} calls lies within 1/${expBand.inverse} ULP of halfway ` +
          "between two doubles, where Ruby's answer depends on the rounding of the platform C library's exp",
      );
    },
  };
  return CORRECTLY_ROUNDED.exp(a, band);
}

/** `__ieee754_sinh(x)`. */
function sinh(x: number): number {
  /* High word of |x|. */
  const jx = highWord(x);
  const ix = jx & 0x7fffffff;

  /* x is INF or NaN */
  if (ix >= 0x7ff00000) return x + x;

  let h = 0.5;
  if (jx < 0) h = -h;
  /* |x| in [0,22], return sign(x)*0.5*(E+E/(E+1)) */
  if (ix < 0x40360000) {
    /* |x|<22 */
    if (ix < 0x3e300000) {
      /* |x|<2**-28 */
      if (shuge + x > one) return x; /* sinh(tiny) = tiny with inexact */
    }
    const t = expm1(Math.abs(x));
    if (ix < 0x3ff00000) return h * (2.0 * t - (t * t) / (t + one));
    return h * (t + t / (t + one));
  }

  /* |x| in [22, log(maxdouble)] return 0.5*exp(|x|) */
  if (ix < 0x40862e42) return h * glibcExp("sinh", Math.abs(x));

  /* |x| in [log(maxdouble), overflow threshold] */
  const lx = lowWord(x);
  if (ix < 0x408633ce || (ix === 0x408633ce && lx <= 0x8fb9f87d)) {
    const w = glibcExp("sinh", 0.5 * Math.abs(x));
    const t = h * w;
    return t * w;
  }

  /* |x| > overflow threshold, sinh(x) overflow */
  return x * shuge;
}

/** `__ieee754_cosh(x)`. */
function cosh(x: number): number {
  /* High word of |x|. */
  const ix = highWord(x) & 0x7fffffff;

  /* x is INF or NaN */
  if (ix >= 0x7ff00000) return x * x;

  /* |x| in [0,0.5*ln2], return 1+expm1(|x|)^2/(2*exp(|x|)) */
  if (ix < 0x3fd62e43) {
    const t = expm1(Math.abs(x));
    const w = one + t;
    if (ix < 0x3c800000) return w; /* cosh(tiny) = 1 */
    return one + (t * t) / (w + w);
  }

  /* |x| in [0.5*ln2,22], return (exp(|x|)+1/exp(|x|))/2 */
  if (ix < 0x40360000) {
    const t = glibcExp("cosh", Math.abs(x));
    return half * t + half / t;
  }

  /* |x| in [22, log(maxdouble)] return half*exp(|x|) */
  if (ix < 0x40862e42) return half * glibcExp("cosh", Math.abs(x));

  /* |x| in [log(maxdouble), overflow threshold] */
  const lx = lowWord(x);
  if (ix < 0x408633ce || (ix === 0x408633ce && lx <= 0x8fb9f87d)) {
    const w = glibcExp("cosh", half * Math.abs(x));
    const t = half * w;
    return t * w;
  }

  /* |x| > overflow threshold, cosh(x) overflow */
  return huge * huge;
}

/** `tanh(x)`. */
function tanh(x: number): number {
  /* High word of |x|. */
  const jx = highWord(x);
  const ix = jx & 0x7fffffff;

  /* x is INF or NaN */
  if (ix >= 0x7ff00000) {
    if (jx >= 0) return one / x + one; /* tanh(+-inf)=+-1 */
    return one / x - one; /* tanh(NaN) = NaN */
  }

  let z: number;
  /* |x| < 22 */
  if (ix < 0x40360000) {
    /* |x|<22 */
    if (ix < 0x3c800000) {
      /* |x|<2**-55 */
      return x * (one + x); /* tanh(small) = small */
    }
    if (ix >= 0x3ff00000) {
      /* |x|>=1  */
      const t = expm1(two * Math.abs(x));
      z = one - two / (t + two);
    } else {
      const t = expm1(-two * Math.abs(x));
      z = -t / (t + two);
    }
    /* |x| > 22, return +-1 */
  } else {
    z = one - tiny; /* raised inexact flag */
  }
  return jx >= 0 ? z : -z;
}

/**
 * How a region's result is computed: `direct` (no call out: `x`, `1`, `±1`
 * or overflow), `expm1` (through `expm1` only, never refused), `exp`
 * (through `exp(|x|)`) or `exp-half` (through `exp(|x|/2)`), the last two
 * refused where that `exp` is inside its band.
 */
export type HyperbolicPath = "direct" | "expm1" | "exp" | "exp-half";

/** One region of arguments, `|x| < below` (and at or above the previous region's `below`). */
export interface HyperbolicRegion {
  readonly name: string;
  readonly below: number;
  readonly path: HyperbolicPath;
}

function region(
  _fn: HyperbolicFunction,
  name: string,
  below: number,
  path: HyperbolicPath,
): HyperbolicRegion {
  return { name, below, path };
}

/** fdlibm's branch points, as the doubles its high-word comparisons split at. */
export const BRANCH = {
  /** `2^-55`: `cosh` returns `1`, `tanh` returns `x (1 + x)` below it. */
  tiny: 2 ** -55,
  /** `2^-28`: `sinh` returns `x` below it. */
  sinhTiny: 2 ** -28,
  /** High word `0x3fd62e43`, just above `ln2/2`: `cosh`'s `expm1` branch below it. */
  halfLn2: 0.3465735912322998,
  twentyTwo: 22,
  /** High word `0x40862E42`, just below `ln(DBL_MAX)`: `exp(|x|)` below it. */
  lnMax: 709.7822265625,
  /**
   * The double after `0x408633CE 8fb9f87d` (`710.4758600739439`), from which
   * `sinh` and `cosh` overflow without computing.
   */
  overflow: 710.475860073944,
} as const;

/**
 * Each function's regions, in the order `sinh`, `cosh` and `tanh` above test
 * them, for the measurement script and the fixture generator (which read
 * this table out of the source).
 */
export const REGIONS: Readonly<Record<HyperbolicFunction, readonly HyperbolicRegion[]>> = {
  sinh: [
    region("sinh", "|x| < 2^-28", BRANCH.sinhTiny, "direct"),
    region("sinh", "2^-28 <= |x| < 22", BRANCH.twentyTwo, "expm1"),
    region("sinh", "22 <= |x| < ln(DBL_MAX)", BRANCH.lnMax, "exp"),
    region("sinh", "ln(DBL_MAX) <= |x| <= the overflow threshold", BRANCH.overflow, "exp-half"),
    region("sinh", "|x| past the overflow threshold", Infinity, "direct"),
  ],
  cosh: [
    region("cosh", "|x| < 2^-55", BRANCH.tiny, "direct"),
    region("cosh", "2^-55 <= |x| < ln2/2", BRANCH.halfLn2, "expm1"),
    region("cosh", "ln2/2 <= |x| < 22", BRANCH.twentyTwo, "exp"),
    region("cosh", "22 <= |x| < ln(DBL_MAX)", BRANCH.lnMax, "exp"),
    region("cosh", "ln(DBL_MAX) <= |x| <= the overflow threshold", BRANCH.overflow, "exp-half"),
    region("cosh", "|x| past the overflow threshold", Infinity, "direct"),
  ],
  tanh: [
    region("tanh", "|x| < 2^-55", BRANCH.tiny, "direct"),
    region("tanh", "2^-55 <= |x| < 22", BRANCH.twentyTwo, "expm1"),
    region("tanh", "22 <= |x|", Infinity, "direct"),
  ],
};

/** The region `|x|` falls in (a finite `x`). */
export function regionFor(fn: HyperbolicFunction, x: number): HyperbolicRegion {
  const a = Math.abs(x);
  const regions = REGIONS[fn];
  return regions.find((r) => a < r.below) ?? (regions[regions.length - 1] as HyperbolicRegion);
}

const FUNCTIONS: Readonly<Record<HyperbolicFunction, (x: number) => number>> = { sinh, cosh, tanh };

/**
 * The port's answer for the C library's `fn(x)`: glibc's double, or
 * `UnsupportedFeatureError` where the `exp` it calls is inside its band.
 */
export function hyperbolic(fn: HyperbolicFunction, x: number): number {
  return FUNCTIONS[fn](x);
}

/** Ruby: `Math.sinh` — `sinh(Get_Double(x))`. */
export function mathSinh(x: RubyNumeric): number {
  return sinh(mathArgument(x));
}

/** Ruby: `Math.cosh`. */
export function mathCosh(x: RubyNumeric): number {
  return cosh(mathArgument(x));
}

/** Ruby: `Math.tanh`. */
export function mathTanh(x: RubyNumeric): number {
  return tanh(mathArgument(x));
}
