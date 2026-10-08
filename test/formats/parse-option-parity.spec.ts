/**
 * Oracle-backed parity for `Plurimath::Math.parse`'s option checks, in every
 * format the port parses.
 *
 * The rows are the `parse-options` group of
 * `test/formats/<format>/render-options-fixtures.json`, generated, never typed:
 *   ruby scripts/generate-render-options-fixtures.rb --oracle <clean pinned checkout>
 * Each row is one parse call with options the gem refuses, and the class the
 * gem raised. `Math.parse` checks unknown keys, then the `locale` value, and
 * only then parses (`math.rb:34-41`), so a row with `raisedIn: "options"`
 * must fail with the matching port error even where the input alone fails to
 * parse; the input's own `raisedIn: "parse"` row shows that it does.
 *
 * Classes are compared, not messages: `ParseOptionError` names the port's own
 * option list, not the gem's (see its doc in `src/core/errors.ts`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ParseError, ParseOptionError } from "../../src/core/errors";
import { parseAsciimath, parseAsciimathTree } from "../../src/formats/asciimath/parser";
import { parseHtml } from "../../src/formats/html/parser";
import { parseLatex, parseLatexTree } from "../../src/formats/latex/parser";
import { parseUnicodemath, parseUnicodemathTree } from "../../src/formats/unicodemath/parser";
import { UnsupportedLocaleError } from "../../src/formatting/index";

const HERE = dirname(fileURLToPath(import.meta.url));

interface Row {
  readonly id: string;
  readonly group: string;
  readonly input: { readonly format: string; readonly text: string };
  readonly parseOptions: Record<string, unknown>;
  readonly raises: string;
  readonly raisedIn: string;
}

type Parse = (input: string, options?: never) => unknown;

/** Every public entry point that takes parse options, per input format. */
const ENTRY_POINTS: Record<string, Record<string, Parse>> = {
  asciimath: { parseAsciimath, parseAsciimathTree } as Record<string, Parse>,
  html: { parseHtml } as Record<string, Parse>,
  latex: { parseLatex, parseLatexTree } as Record<string, Parse>,
  unicodemath: { parseUnicodemath, parseUnicodemathTree } as Record<string, Parse>,
};

/** The port's class for each class the gem raised. */
const PORT_CLASS: Record<string, new (...args: never[]) => Error> = {
  "Plurimath::Math::ParseOptionError": ParseOptionError,
  "Plurimath::Errors::UnsupportedLocale": UnsupportedLocaleError,
  "Plurimath::Math::ParseError": ParseError,
};

function load(format: string): readonly Row[] {
  const fixture = JSON.parse(
    readFileSync(join(HERE, format, "render-options-fixtures.json"), "utf8"),
  ) as { cases: readonly Row[] };
  return fixture.cases.filter((row) => row.group === "parse-options");
}

for (const [format, entries] of Object.entries(ENTRY_POINTS)) {
  const rows = load(format);

  describe(`${format} parse-option refusals`, () => {
    it("carries the generated rows, asserted as a count", () => {
      expect(rows).toHaveLength(7);
      expect(rows.filter((row) => row.raisedIn === "options")).toHaveLength(6);
    });

    for (const [name, parse] of Object.entries(entries)) {
      it.each(rows.map((row) => [row.id, row] as const))(
        `${name} %s: raises what the gem raises`,
        (_id, row) => {
          const expected = PORT_CLASS[row.raises];
          if (expected === undefined) throw new Error(`${row.id}: unmapped class ${row.raises}`);
          let caught: unknown;
          try {
            parse(row.input.text, row.parseOptions as never);
          } catch (error) {
            caught = error;
          }
          expect(caught).toBeInstanceOf(expected);
          // An option refusal is never also a ParseError, as in the gem.
          if (row.raisedIn === "options") expect(caught).not.toBeInstanceOf(ParseError);
        },
      );
    }
  });
}
