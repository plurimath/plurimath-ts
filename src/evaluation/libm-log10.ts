/* @(#)e_log10.c 1.3 95/01/18 */
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

/* __ieee754_log10(x)
 * Return the base 10 logarithm of x
 *
 * Method :
 *	Let log10_2hi = leading 40 bits of log10(2) and
 *	    log10_2lo = log10(2) - log10_2hi,
 *	    ivln10   = 1/log(10) rounded.
 *	Then
 *		n = ilogb(x),
 *		if(n<0)  n = n+1;
 *		x = scalbn(x,-n);
 *		log10(x) := n*log10_2hi + (n*log10_2lo + ivln10*log(x))
 *
 * Note 1:
 *	To guarantee log10(10**n)=n, where 10**n is normal, the rounding
 *	mode must set to Round-to-Nearest.
 * Note 2:
 *	[1/log(10)] rounded to 53 bits has error  .198   ulps;
 *	log10 is monotonic at all binary break points.
 *
 * Special cases:
 *	log10(x) is NaN with signal if x < 0;
 *	log10(+INF) is +INF with no signal; log10(0) is -INF with signal;
 *	log10(NaN) is that NaN with no signal;
 *	log10(10**N) = N  for N=0,1,...,22.
 *
 * Constants:
 * The hexadecimal values are the intended ones for the following constants.
 * The decimal values may be used, provided that the compiler will convert
 * from decimal to binary accurately enough to produce the hexadecimal values
 * shown.
 */

/**
 * The C library's `log10`, which Ruby's `Math.log10` calls, transcribed from
 * Sun's fdlibm 5.3 (`e_log10.c`, notice above) — the upstream of glibc 2.35's
 * `sysdeps/ieee754/dbl-64/e_log10.c`, which the oracle runs: glibc reads the
 * words 64 bits at a time where fdlibm reads two 32-bit halves, and computes
 * the same values in the same order. glibc's x86-64 `log10` has no FMA
 * variant, so each step below is a plain IEEE double operation, as it is in
 * JavaScript.
 *
 * The one call out, `__ieee754_log`, is glibc's `log`, which the caller
 * supplies (`libm.ts`).
 */

const view = new DataView(new ArrayBuffer(8));

/**
 * The double with high word `hi` and low word `lo` — the hexadecimal values
 * fdlibm gives as "the intended ones" for its constants, each of whose
 * decimal spelling is kept alongside.
 */
function fromWords(hi: number, lo: number): number {
  view.setUint32(0, hi);
  view.setUint32(4, lo);
  return view.getFloat64(0);
}

const TWO54 = fromWords(0x43500000, 0x00000000); /* 1.80143985094819840000e+16 */
const IVLN10 = fromWords(0x3fdbcb7b, 0x1526e50e); /* 4.34294481903251816668e-01 */
const LOG10_2HI = fromWords(0x3fd34413, 0x509f6000); /* 3.01029995663611771306e-01 */
const LOG10_2LO = fromWords(0x3d59fef3, 0x11f12b36); /* 3.69423907715893078616e-13 */

const ZERO = 0.0;

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

/** `__HI(x) = hx`, returning the new `x`. */
function withHighWord(x: number, hx: number): number {
  view.setFloat64(0, x);
  view.setInt32(0, hx);
  return view.getFloat64(0);
}

/** `__ieee754_log10(x)`, calling `log` for `__ieee754_log` on the reduced argument. */
export function log10(x: number, log: (x: number) => number): number {
  let hx = highWord(x); /* high word of x */
  const lx = lowWord(x); /* low word of x */

  let k = 0;
  if (hx < 0x00100000) {
    /* x < 2**-1022  */
    if (((hx & 0x7fffffff) | lx) === 0) return -TWO54 / ZERO; /* log(+-0)=-inf */
    if (hx < 0) return (x - x) / ZERO; /* log(-#) = NaN */
    k -= 54;
    x *= TWO54; /* subnormal number, scale up x */
    hx = highWord(x); /* high word of x */
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  const i = (k & 0x80000000) >>> 31;
  hx = (hx & 0x000fffff) | ((0x3ff - i) << 20);
  const y = k + i;
  x = withHighWord(x, hx);
  const z = y * LOG10_2LO + IVLN10 * log(x);
  return z + y * LOG10_2HI;
}
