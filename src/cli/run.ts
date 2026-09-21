/**
 * The CLI's testable core: parses argv, reads input, converts, writes output.
 *
 * All I/O is injected (`CliIo`) rather than reaching for `process`/`fs`
 * directly, so `test/cli/run.spec.ts` can exercise real argument parsing and
 * real conversion (through the compat `Plurimath` class) without touching a
 * real stdin, filesystem or process exit code.
 */

import { PlurimathError } from "../core/index";
import { parseArgs, USAGE } from "./args";
import { convert } from "./convert";

export interface CliIo {
  readonly readStdin: () => Promise<string>;
  readonly readFile: (path: string) => string;
  readonly writeOut: (text: string) => void;
  readonly writeErr: (text: string) => void;
}

export const EXIT_OK = 0;
export const EXIT_USAGE_ERROR = 2;
export const EXIT_RUNTIME_ERROR = 1;

export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.kind === "help") {
    io.writeOut(USAGE);
    return EXIT_OK;
  }

  if (parsed.kind === "error") {
    io.writeErr(`plurimath: ${parsed.message}\n\n${USAGE}`);
    return EXIT_USAGE_ERROR;
  }

  const { from, to, file } = parsed.args;

  let input: string;
  try {
    input = file === undefined ? await io.readStdin() : io.readFile(file);
  } catch (error) {
    io.writeErr(`plurimath: could not read input: ${(error as Error).message}\n`);
    return EXIT_RUNTIME_ERROR;
  }

  try {
    const output = convert(input, from, to);
    io.writeOut(output.endsWith("\n") ? output : `${output}\n`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof PlurimathError) {
      io.writeErr(`plurimath: [${error.code}] ${error.message}\n`);
    } else {
      io.writeErr(`plurimath: ${(error as Error).message}\n`);
    }
    return EXIT_RUNTIME_ERROR;
  }
}
