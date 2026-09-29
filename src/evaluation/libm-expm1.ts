/* @(#)s_expm1.c 1.5 04/04/22 */
/*
 * ====================================================
 * Copyright (C) 2004 by Sun Microsystems, Inc. All rights reserved.
 *
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */

/* expm1(x)
 * Returns exp(x)-1, the exponential of x minus 1.
 *
 * Method
 *   1. Argument reduction:
 *	Given x, find r and integer k such that
 *
 *               x = k*ln2 + r,  |r| <= 0.5*ln2 ~ 0.34658
 *
 *      Here a correction term c will be computed to compensate
 *	the error in r when rounded to a floating-point number.
 *
 *   2. Approximating expm1(r) by a special rational function on
 *	the interval [0,0.34658]:
 *	Since
 *	    r*(exp(r)+1)/(exp(r)-1) = 2+ r^2/6 - r^4/360 + ...
 *	we define R1(r*r) by
 *	    r*(exp(r)+1)/(exp(r)-1) = 2+ r^2/6 * R1(r*r)
 *	That is,
 *	    R1(r**2) = 6/r *((exp(r)+1)/(exp(r)-1) - 2/r)
 *		     = 6/r * ( 1 + 2.0*(1/(exp(r)-1) - 1/r))
 *		     = 1 - r^2/60 + r^4/2520 - r^6/100800 + ...
 *      We use a special Remes algorithm on [0,0.347] to generate
 * 	a polynomial of degree 5 in r*r to approximate R1. The
 *	maximum error of this polynomial approximation is bounded
 *	by 2**-61. In other words,
 *	    R1(z) ~ 1.0 + Q1*z + Q2*z**2 + Q3*z**3 + Q4*z**4 + Q5*z**5
 *	where 	Q1  =  -1.6666666666666567384E-2,
 * 		Q2  =   3.9682539681370365873E-4,
 * 		Q3  =  -9.9206344733435987357E-6,
 * 		Q4  =   2.5051361420808517002E-7,
 * 		Q5  =  -6.2843505682382617102E-9;
 *  	(where z=r*r, and the values of Q1 to Q5 are listed below)
 *	with error bounded by
 *	    |                  5           |     -61
 *	    | 1.0+Q1*z+...+Q5*z   -  R1(z) | <= 2
 *	    |                              |
 *
 *	expm1(r) = exp(r)-1 is then computed by the following
 * 	specific way which minimize the accumulation rounding error:
 *			       2     3
 *			      r     r    [ 3 - (R1 + R1*r/2)  ]
 *	      expm1(r) = r + --- + --- * [--------------------]
 *		              2     2    [ 6 - r*(3 - R1*r/2) ]
 *
 *	To compensate the error in the argument reduction, we use
 *		expm1(r+c) = expm1(r) + c + expm1(r)*c
 *			   ~ expm1(r) + c + r*c
 *	Thus c+r*c will be added in as the correction terms for
 *	expm1(r+c). Now rearrange the term to avoid optimization
 * 	screw up:
 *		        (      2                                    2 )
 *		        ({  ( r    [ R1 -  (3 - R1*r/2) ]  )  }    r  )
 *	 expm1(r+c)~r - ({r*(--- * [--------------------]-c)-c} - --- )
 *	                ({  ( 2    [ 6 - r*(3 - R1*r/2) ]  )  }    2  )
 *                      (                                             )
 *
 *		   = r - E
 *   3. Scale back to obtain expm1(x):
 *	From step 1, we have
 *	   expm1(x) = either 2^k*[expm1(r)+1] - 1
 *		    = or     2^k*[expm1(r) + (1-2^-k)]
 *   4. Implementation notes:
 *	(A). To save one multiplication, we scale the coefficient Qi
 *	     to Qi*2^i, and replace z by (x^2)/2.
 *	(B). To achieve maximum accuracy, we compute expm1(x) by
 *	  (i)   if x < -56*ln2, return -1.0, (raise inexact if x!=inf)
 *	  (ii)  if k=0, return r-E
 *	  (iii) if k=-1, return 0.5*(r-E)-0.5
 *        (iv)	if k=1 if r < -0.25, return 2*((r+0.5)- E)
 *	       	       else	     return  1.0+2.0*(r-E);
 *	  (v)   if (k<-2||k>56) return 2^k(1-(E-r)) - 1 (or exp(x)-1)
 *	  (vi)  if k <= 20, return 2^k((1-2^-k)-(E-r)), else
 *	  (vii) return 2^k(1-((E+2^-k)-r))
 *
 * Special cases:
 *	expm1(INF) is INF, expm1(NaN) is NaN;
 *	expm1(-INF) is -1, and
 *	for finite argument, only expm1(0)=0 is exact.
 *
 * Accuracy:
 *	according to an error analysis, the error is always less than
 *	1 ulp (unit in the last place).
 *
 * Misc. info.
 *	For IEEE double
 *	    if x >  7.09782712893383973096e+02 then expm1(x) overflow
 *
 * Constants:
 * The hexadecimal values are the intended ones for the following
 * constants. The decimal values may be used, provided that the
 * compiler will convert from decimal to binary accurately enough
 * to produce the hexadecimal values shown.
 */

/**
 * The C library's `expm1`, which glibc 2.35's `sinh`, `cosh` and `tanh` call
 * (`libm-hyperbolic.ts`), transcribed from Sun's fdlibm 5.3 (`s_expm1.c`,
 * notice and method above): the same constants, thresholds, branches and
 * operations, each a plain IEEE double operation, as it is in JavaScript.
 *
 * One change from fdlibm: the polynomial `r1` in `z = hxs` is not evaluated
 * by Horner's rule, `1 + z(Q1 + z(Q2 + z(Q3 + z(Q4 + z Q5))))`. It is split
 * into three short pieces, `P1 = 1 + z Q1`, `P2 = Q2 + z Q3` and
 * `P3 = Q4 + z Q5`, combined with the even powers `z^2` and `z^4` as
 * `(P1 + z^2 P2) + z^4 P3`. The two orders can round differently in the last
 * bit, and it is this one that gives glibc 2.35's digits. The idea came from
 * comparing results against glibc 2.35 (through Ruby's `Math.expm1`);
 * `scripts/measure-libm-hyperbolic-glibc.mjs --expm1-order` repeats that
 * comparison for both orders (figures in `TODO.plan/deferred.md`,
 * "Evaluation: the hyperbolic functions").
 *
 * Callers pass `|x| < 44` (`tanh`'s `2|x|` below 22), so `k <= 64` and
 * fdlibm's exponent adjustment never meets `k = 1024`.
 */

const view = new DataView(new ArrayBuffer(8));

/** The double with high word `hi` and low word `lo` (fdlibm's hexadecimal constants). */
function fromWords(hi: number, lo: number): number {
  view.setUint32(0, hi);
  view.setUint32(4, lo);
  return view.getFloat64(0);
}

/** `__HI(x)`, as an unsigned 32-bit value. */
function highWord(x: number): number {
  view.setFloat64(0, x);
  return view.getUint32(0);
}

/** `__HI(x) = hx`, returning the new `x`. */
function withHighWord(x: number, hx: number): number {
  view.setFloat64(0, x);
  view.setUint32(0, hx >>> 0);
  return view.getFloat64(0);
}

const one = 1.0;
const tiny = 1.0e-300;
const O_THRESHOLD = fromWords(0x40862e42, 0xfefa39ef); /* 7.09782712893383973096e+02 */
const LN2_HI = fromWords(0x3fe62e42, 0xfee00000); /* 6.93147180369123816490e-01 */
const LN2_LO = fromWords(0x3dea39ef, 0x35793c76); /* 1.90821492927058770002e-10 */
const invln2 = fromWords(0x3ff71547, 0x652b82fe); /* 1.44269504088896338700e+00 */
/* scaled coefficients related to expm1 */
const Q1 = fromWords(0xbfa11111, 0x111110f4); /* -3.33333333333331316428e-02 */
const Q2 = fromWords(0x3f5a01a0, 0x19fe5585); /* 1.58730158725481460165e-03 */
const Q3 = fromWords(0xbf14ce19, 0x9eaadbb7); /* -7.93650757867487942473e-05 */
const Q4 = fromWords(0x3ed0cfca, 0x86e65239); /* 4.00821782732936239552e-06 */
const Q5 = fromWords(0xbe8afdb7, 0x6e09c32d); /* -2.01099218183624371326e-07 */

/**
 * fdlibm's `R1` polynomial in `z = hxs`, in the split order the module header
 * describes: the order `expm1` uses.
 */
export function splitOrder(z: number): number {
  const p1 = one + z * Q1;
  const z2 = z * z;
  const p2 = Q2 + z * Q3;
  const z4 = z2 * z2;
  const p3 = Q4 + z * Q5;
  return p1 + z2 * p2 + z4 * p3;
}

/**
 * The same polynomial by Horner's rule, as fdlibm writes it:
 * `one+hxs*(Q1+hxs*(Q2+hxs*(Q3+hxs*(Q4+hxs*Q5))))`. Not used to answer; the
 * measurement script's `--expm1-order` mode compares both orders with Ruby.
 */
export function hornerOrder(z: number): number {
  return one + z * (Q1 + z * (Q2 + z * (Q3 + z * (Q4 + z * Q5))));
}

/** `expm1(x)`, with the polynomial order `r1Of` (the split order unless measuring). */
export function expm1(x: number, r1Of: (z: number) => number = splitOrder): number {
  let hx = highWord(x); /* high word of x */
  const xsb = hx & 0x80000000; /* sign bit of x */
  hx &= 0x7fffffff; /* high word of |x| */

  /* filter out huge and non-finite argument */
  if (hx >= 0x4043687a) {
    /* if |x|>=56*ln2 */
    if (hx >= 0x40862e42) {
      /* if |x|>=709.78... */
      if (hx >= 0x7ff00000) {
        if (Number.isNaN(x)) return x + x; /* NaN */
        return xsb === 0 ? x : -1.0; /* exp(+-inf)={inf,-1} */
      }
      if (x > O_THRESHOLD) return Infinity; /* overflow */
    }
    if (xsb !== 0) return tiny - one; /* x < -56*ln2, return -1.0 */
  }

  /* argument reduction */
  let hi: number;
  let lo: number;
  let k: number;
  let c = 0;
  if (hx > 0x3fd62e42) {
    /* if  |x| > 0.5 ln2 */
    if (hx < 0x3ff0a2b2) {
      /* and |x| < 1.5 ln2 */
      if (xsb === 0) {
        hi = x - LN2_HI;
        lo = LN2_LO;
        k = 1;
      } else {
        hi = x + LN2_HI;
        lo = -LN2_LO;
        k = -1;
      }
    } else {
      // C's conversion to `int` truncates toward zero.
      k = Math.trunc(invln2 * x + (xsb === 0 ? 0.5 : -0.5));
      const t = k;
      hi = x - t * LN2_HI; /* t*LN2_HI is exact here */
      lo = t * LN2_LO;
    }
    x = hi - lo;
    c = hi - x - lo;
  } else if (hx < 0x3c900000) {
    /* when |x|<2**-54, return x */
    return x;
  } else k = 0;

  /* x is now in primary range */
  const hfx = 0.5 * x;
  const hxs = x * hfx;
  const r1 = r1Of(hxs);
  let t = 3.0 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6.0 - x * t));
  if (k === 0) return x - (x * e - hxs); /* c is 0 */
  e = x * (e - c) - c;
  e -= hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2.0 * (e - (x + 0.5));
    return one + 2.0 * (x - e);
  }
  let y: number;
  if (k <= -2 || k > 56) {
    /* suffice to return exp(x)-1 */
    y = one - (e - x);
    y = withHighWord(y, highWord(y) + (k << 20)); /* add k to y's exponent */
    return y - one;
  }
  t = one;
  if (k < 20) {
    t = withHighWord(t, 0x3ff00000 - (0x200000 >> k)); /* t=1-2^-k */
    y = t - (e - x);
    y = withHighWord(y, highWord(y) + (k << 20)); /* add k to y's exponent */
  } else {
    t = withHighWord(t, (0x3ff - k) << 20); /* 2^-k */
    y = x - (e + t);
    y += one;
    y = withHighWord(y, highWord(y) + (k << 20)); /* add k to y's exponent */
  }
  return y;
}
