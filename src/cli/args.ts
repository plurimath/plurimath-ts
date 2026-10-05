/**
 * Argument parsing for the `plurimath` CLI's one command, `convert`.
 *
 * Hand-rolled rather than a dependency: the surface is two required flags
 * (`--from`, `--to`), one optional positional (an input file path; stdin
 * otherwise) and `--help`. `package.json` has no argument-parsing
 * devDependency today, and ARCHITECTURE.md §10's restraint themes weigh
 * against adding one for a surface this small — a dependency earns its
 * keep once flags, subcommands or `--foo=bar[,baz]`-style values multiply
 * past what a ~40-line switch can read at a glance.
 */

import {
  INPUT_FORMATS,
  type InputFormat,
  isInputFormat,
  isOutputFormat,
  OUTPUT_FORMATS,
  type OutputFormat,
} from "./convert";

export interface ConvertArgs {
  readonly from: InputFormat;
  readonly to: OutputFormat;
  /** `undefined` means "read stdin". */
  readonly file: string | undefined;
}

export type ParsedArgs =
  | { readonly kind: "convert"; readonly args: ConvertArgs }
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string };

export const USAGE = `Usage: plurimath convert --from <format> --to <format> [file]

Convert math notation between formats. Reads from the given file, or from
stdin when no file is given. Writes the result to stdout.

Input formats:  ${INPUT_FORMATS.join(", ")}
Output formats: ${OUTPUT_FORMATS.join(", ")}

Options:
  --from <format>  Input format (required)
  --to <format>    Output format (required)
  -h, --help       Show this help

A "--" argument ends option parsing; anything after it is taken as the file,
even if it starts with "-". A bare "-" is accepted as a literal filename.

Examples:
  plurimath convert --from asciimath --to latex formula.txt
  echo "frac(1)(2)" | plurimath convert --from asciimath --to mathml
`;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0) return { kind: "help" };

  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h") return { kind: "help" };
  if (command !== "convert") {
    return { kind: "error", message: `Unknown command "${command}". Only "convert" is supported.` };
  }

  let from: string | undefined;
  let to: string | undefined;
  let file: string | undefined;
  /**
   * Once `--` is seen, every remaining token is positional (standard Unix
   * convention: `--` ends option parsing), so a file argument that happens
   * to start with `-` can still be passed unambiguously.
   */
  let positionalOnly = false;

  const addPositional = (arg: string): ParsedArgs | undefined => {
    if (file !== undefined) {
      return {
        kind: "error",
        message: `Unexpected extra argument "${arg}"; only one input file is accepted.`,
      };
    }
    file = arg;
    return undefined;
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;

    if (positionalOnly) {
      const error = addPositional(arg);
      if (error !== undefined) return error;
      continue;
    }

    if (arg === "--help" || arg === "-h") return { kind: "help" };

    if (arg === "--") {
      positionalOnly = true;
      continue;
    }

    if (arg === "--from" || arg === "--to") {
      const value = rest[i + 1];
      // A missing value, or one that looks like another flag, is rejected
      // here rather than silently consumed as `--from`'s/`--to`'s value —
      // otherwise `--from --to latex` would read as "missing --to" instead
      // of the more useful "--from requires a value".
      if (value === undefined || (value.startsWith("-") && value !== "-")) {
        return { kind: "error", message: `${arg} requires a value.` };
      }
      i++;
      if (arg === "--from") from = value;
      else to = value;
      continue;
    }

    if (arg.startsWith("--from=")) {
      from = arg.slice("--from=".length);
      continue;
    }
    if (arg.startsWith("--to=")) {
      to = arg.slice("--to=".length);
      continue;
    }

    // `-` alone is treated as a literal file argument named "-", per one of
    // two reasonable Unix conventions (the other reads it as an explicit
    // "use stdin" alias); this CLI already reads stdin by default when no
    // file is given, so `-` gains nothing as a stdin alias and is more
    // useful left available as an ordinary (if unusual) filename.
    if (arg.startsWith("-") && arg !== "-") {
      return { kind: "error", message: `Unknown option "${arg}".` };
    }

    const error = addPositional(arg);
    if (error !== undefined) return error;
  }

  if (from === undefined) return { kind: "error", message: "Missing required option --from." };
  if (to === undefined) return { kind: "error", message: "Missing required option --to." };
  if (!isInputFormat(from)) {
    return {
      kind: "error",
      message: `Unknown input format "${from}". Supported: ${INPUT_FORMATS.join(", ")}.`,
    };
  }
  if (!isOutputFormat(to)) {
    return {
      kind: "error",
      message: `Unknown output format "${to}". Supported: ${OUTPUT_FORMATS.join(", ")}.`,
    };
  }

  return { kind: "convert", args: { from, to, file } };
}
