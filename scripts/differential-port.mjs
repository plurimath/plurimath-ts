#!/usr/bin/env node
/**
 * The port half of `scripts/gate-oracle.rb differential`.
 *
 * Reads a JSON array of AsciiMath inputs on stdin, renders each through this
 * package exactly as a consumer would, and writes a JSON array of results.
 * One object per input, in order:
 *
 *   { "ok": true,  "asciimath": "...", "latex": "...", "mathml": "...",
 *     "unicodemath": "..." }
 *   { "ok": false, "code": "PARSE_ERROR" }
 *
 * Errors are reported by `code`, not by message: the gem's message text and
 * this port's are different by design (ARCHITECTURE.md §5 makes `code` the
 * contract and messages explicitly not), so the comparison is on whether both
 * sides refused, never on how they said so.
 *
 * Reads the BUILT artifact rather than `src/`, so a divergence found here is a
 * divergence a consumer would actually hit.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = (name) => join(ROOT, "dist", `${name}.js`);

if (!existsSync(entry("asciimath"))) {
  process.stderr.write(`dist/ is missing; run \`pnpm build\` before the differential gate\n`);
  process.exit(2);
}

const { parseAsciimath, toAsciimath } = await import(entry("asciimath"));
const { toLatex } = await import(entry("latex"));
const { toMathml } = await import(entry("mathml"));
const { toUnicodemath } = await import(entry("unicodemath"));

/** The port's typed failures. Anything else is a crash and must not be caught. */
const TYPED_CODES = new Set(["PARSE_ERROR", "RENDER_ERROR", "MISSING_SYMBOL_DATA"]);

function typedCode(error) {
  if (!(error instanceof Error)) return null;
  const code = error.code;
  return typeof code === "string" && TYPED_CODES.has(code) ? code : null;
}

function render(input) {
  let node;
  try {
    node = parseAsciimath(input);
  } catch (error) {
    const code = typedCode(error);
    // An untyped throw is a defect in its own right, and louder than any
    // divergence: it propagates and fails the run rather than being reported
    // as "the port refused this one".
    if (code === null) throw error;
    return { ok: false, code };
  }

  try {
    return {
      ok: true,
      asciimath: toAsciimath(node),
      latex: toLatex(node),
      mathml: toMathml(node),
      unicodemath: toUnicodemath(node),
    };
  } catch (error) {
    const code = typedCode(error);
    if (code === null) throw error;
    return { ok: false, code };
  }
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

const inputs = JSON.parse(raw);
if (!Array.isArray(inputs)) {
  process.stderr.write("expected a JSON array of inputs on stdin\n");
  process.exit(2);
}

process.stdout.write(JSON.stringify(inputs.map(render)));
