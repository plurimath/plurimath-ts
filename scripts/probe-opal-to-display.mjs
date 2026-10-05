// Measures how Opal actually compiles and runs `Formula#to_display`'s
// `case type; when :asciimath ... end` dispatch (formula.rb:203-215) when
// called with a JS string, the way plurimath-js's `toDisplay(lang: string)`
// calls it (`this.data.$to_display(lang)`).
//
// Compile with the SAME Opal version plurimath-js pins
// (plurimath-js/Gemfile -> `gem "opal", path: "vendor/opal"`, submodule
// pinned at 6b4253a, which is Opal 1.8.3):
//
//   gem install opal -v 1.8.3   # or: cd plurimath-js && bundle exec opal ...
//   opal --esm -c scripts/probe-opal-to-display.rb > /tmp/probe-compiled.mjs
//   node scripts/probe-opal-to-display.mjs /tmp/probe-compiled.mjs
//
// Measured output (Opal 1.8.3, Node 20.20.2, 2026-09-22):
//
//   "asciimath"   => "|_ Math zone\nASCII-MATCHED"        (real dispatch)
//   "latex"       => "|_ Math zone\nLATEX-MATCHED"
//   "mathml"      => "|_ Math zone\nMATHML-MATCHED"
//   "omml"        => "|_ Math zone\nOMML-MATCHED"
//   "unicodemath" => "|_ Math zone\nUNICODEMATH-MATCHED"
//   "ASCIIMATH"   => "|_ Math zone\n"                     (no arm matches)
//   "LATEX"       => "|_ Math zone\n"
//   "Asciimath"   => "|_ Math zone\n"
//   "AsciiMath"   => "|_ Math zone\n"
//   "UNICODEMATH" => "|_ Math zone\n"
//
// The compiled JS (grep `$eqeqeq` in the output) shows why:
//
//   Opal.eqeqeq = function(lhs, rhs) {
//     return are_both_numbers_or_strings(lhs, rhs)
//       ? lhs === rhs
//       : $truthy((lhs)['$==='](rhs));
//   };
//
// A `case/when` arm compiles to `$eqeqeq(SYMBOL_LITERAL, comparand)`, where
// an Opal Symbol literal IS a plain JS string at runtime. When the argument
// crossing from JS is ALSO a plain JS string (exactly what happens when a
// TypeScript/JS caller passes a string across the Opal boundary — Opal does
// not box a JS string into a Ruby String wrapper for this), both sides are
// JS strings, so `are_both_numbers_or_strings` is true and `$eqeqeq` takes
// the FAST PATH: plain JS `===`. `"asciimath" === "asciimath"` is true;
// `"asciimath" === "ASCIIMATH"` is false. That is the whole mechanism — no
// Ruby `Symbol#===` semantics ever run.
const compiledPath = process.argv[2];
if (!compiledPath) {
  console.error("usage: node probe-opal-to-display.mjs <path-to-opal-compiled.mjs>");
  process.exit(1);
}
await import(compiledPath);
const Opal = globalThis.Opal;
const Probe = Opal.Probe;
const probe = Probe.$new();
const inputs = [
  "asciimath",
  "latex",
  "mathml",
  "omml",
  "unicodemath",
  "ASCIIMATH",
  "LATEX",
  "Asciimath",
  "AsciiMath",
  "UNICODEMATH",
];
for (const input of inputs) {
  try {
    console.log(JSON.stringify(input), "=>", JSON.stringify(probe.$to_display(input)));
  } catch (error) {
    console.log(JSON.stringify(input), "=> RAISED", error.message);
  }
}
